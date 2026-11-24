// Campaign posts (bước 3 · Theo dõi): the content creators delivered for a campaign, with views/interactions over time.
// Manual for every platform; for YouTube the hourly job also picks up videos published inside the tracking window by
// creators at the campaign's final ("chốt") step. An auto-found post the team removes is only marked `excluded`, so the
// job does not add it back.
import { randomBytes } from "node:crypto";
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import { auditLog, campaignEntries, campaigns, channels, creatorClips, PLATFORM_VALUES, posts, postSnapshots } from "../db/schema";
import { fail } from "../http";
import { inWindow } from "../metrics/compute";
import { clipKey, refreshYoutube } from "../metrics/service";
import { finalStep, stepsFor } from "../campaigns/steps";

const count = z.number().int().min(0).max(1e13).nullable().optional();
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional();
const id40 = z.string().regex(/^[A-Za-z0-9_-]{1,40}$/);
export const postOpSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("add"),
    creatorId: id40,
    platform: z.enum(PLATFORM_VALUES).optional(),
    url: z.string().trim().url().max(1024).refine((u) => /^https:\/\//.test(u), "https only"),
    title: z.string().trim().max(300).optional(),
    postedAt: day,
    views: count,
    likes: count,
    comments: count,
    shares: count,
  }),
  z.object({ op: z.literal("update"), id: id40, views: count, likes: count, comments: count, shares: count, postedAt: day, title: z.string().trim().max(300).optional() }),
  z.object({ op: z.literal("exclude"), id: id40, excluded: z.boolean() }),
  z.object({ op: z.literal("remove"), id: id40 }),
  z.object({ op: z.literal("refresh") }),
]);
export type PostOp = z.infer<typeof postOpSchema>;

export function platformOf(url: string): (typeof PLATFORM_VALUES)[number] | null {
  const h = new URL(url).hostname.replace(/^www\.|^m\./, "");
  if (/(^|\.)tiktok\.com$/.test(h)) return "tiktok";
  if (/(^|\.)(facebook\.com|fb\.watch|fb\.com)$/.test(h)) return "facebook";
  if (/(^|\.)instagram\.com$/.test(h)) return "instagram";
  if (/(^|\.)(youtube\.com|youtu\.be)$/.test(h)) return "youtube";
  if (/(^|\.)threads\.(net|com)$/.test(h)) return "threads";
  return null;
}

const snap = (postId: string, p: { views: number | null; likes: number | null; comments: number | null; shares: number | null }, at = new Date()) =>
  db().insert(postSnapshots).values({ postId, at, views: p.views, likes: p.likes, comments: p.comments, shares: p.shares });

export async function listPosts(campaignId: string) {
  return db().select().from(posts).where(eq(posts.campaignId, campaignId)).orderBy(asc(posts.postedAt), asc(posts.createdAt));
}

export async function applyPostOp(actor: { email: string }, campaignId: string, op: PostOp) {
  const now = new Date();
  const audit = (action: string, detail: unknown) =>
    db().insert(auditLog).values({ at: now, actorEmail: actor.email, action, target: "campaign:" + campaignId, after: JSON.stringify(detail) });
  if (op.op === "refresh") return trackCampaign(campaignId, { force: true });
  if (op.op === "add") {
    const [e] = await db().select().from(campaignEntries).where(and(eq(campaignEntries.campaignId, campaignId), eq(campaignEntries.creatorId, op.creatorId))).limit(1);
    if (!e) fail(422, "creator_not_in_campaign");
    const platform = op.platform ?? platformOf(op.url);
    if (!platform) fail(422, "unknown_platform");
    const id = "po_" + randomBytes(6).toString("hex");
    const row = {
      id, campaignId, creatorId: op.creatorId, platform: platform!, url: op.url, externalId: clipKey(op.url), title: op.title || null,
      postedAt: op.postedAt ? new Date(op.postedAt + "T05:00:00Z") : null, views: op.views ?? null, likes: op.likes ?? null,
      comments: op.comments ?? null, shares: op.shares ?? null, source: "manual" as const, excluded: 0, lastFetchedAt: null,
      createdBy: actor.email, createdAt: now, updatedAt: now,
    };
    const [dup] = await db().select({ id: posts.id }).from(posts).where(and(eq(posts.campaignId, campaignId), eq(posts.url, op.url))).limit(1);
    if (dup) fail(409, "post_exists");
    await db().insert(posts).values(row);
    if (row.views != null) await snap(id, row, now);
    await audit("post.add", { creatorId: op.creatorId, platform });
    return;
  }
  const [p] = await db().select().from(posts).where(and(eq(posts.id, op.id), eq(posts.campaignId, campaignId))).limit(1);
  if (!p) fail(404, "not_found");
  if (op.op === "update") {
    const set: Partial<typeof posts.$inferInsert> = { updatedAt: now };
    for (const k of ["views", "likes", "comments", "shares"] as const) if (op[k] !== undefined) set[k] = op[k];
    if (op.title !== undefined) set.title = op.title || null;
    if (op.postedAt !== undefined) set.postedAt = op.postedAt ? new Date(op.postedAt + "T05:00:00Z") : null;
    await db().update(posts).set(set).where(eq(posts.id, p!.id));
    const after = { ...p!, ...set };
    if (["views", "likes", "comments", "shares"].some((k) => k in set)) await snap(p!.id, after, now);
    await audit("post.update", { id: p!.id });
  } else if (op.op === "exclude") {
    await db().update(posts).set({ excluded: op.excluded ? 1 : 0, updatedAt: now }).where(eq(posts.id, p!.id));
    await audit(op.excluded ? "post.exclude" : "post.include", { id: p!.id });
  } else if (op.op === "remove") {
    if (p!.source === "auto") {
      await db().update(posts).set({ excluded: 1, updatedAt: now }).where(eq(posts.id, p!.id)); // keep: stops re-adding
    } else {
      await db().delete(postSnapshots).where(eq(postSnapshots.postId, p!.id));
      await db().delete(posts).where(eq(posts.id, p!.id));
    }
    await audit("post.remove", { id: p!.id });
  }
}

/**
 * YouTube tracking for one campaign: refresh the channel of each creator at the final step, then add videos published
 * inside [trackFrom, trackTo] (Vietnam days, inclusive) and update numbers of auto posts already found.
 */
export async function trackCampaign(campaignId: string, opts: { force?: boolean } = {}) {
  const [c] = await db().select().from(campaigns).where(eq(campaigns.id, campaignId)).limit(1);
  if (!c || !c.trackFrom) return { added: 0, updated: 0, creators: 0 };
  if (!opts.force && (!c.autoTrack || c.status !== "running")) return { added: 0, updated: 0, creators: 0 };
  const final = finalStep(await stepsFor(campaignId));
  const ids = (await db().select({ id: campaignEntries.creatorId }).from(campaignEntries).where(and(eq(campaignEntries.campaignId, campaignId), eq(campaignEntries.stage, final)))).map((r) => r.id);
  if (!ids.length) return { added: 0, updated: 0, creators: 0 };
  const yt = (await db().select({ id: channels.creatorId }).from(channels).where(and(inArray(channels.creatorId, ids), eq(channels.platform, "youtube")))).map((r) => r.id);
  let added = 0, updated = 0;
  const now = new Date();
  for (const creatorId of yt) {
    await refreshYoutube(creatorId);
    const clips = await db().select().from(creatorClips).where(and(eq(creatorClips.creatorId, creatorId), eq(creatorClips.platform, "youtube"), eq(creatorClips.source, "auto")));
    const mine = await db().select().from(posts).where(and(eq(posts.campaignId, campaignId), eq(posts.creatorId, creatorId)));
    for (const clip of clips.filter((x) => inWindow(x.publishedAt, c.trackFrom, c.trackTo))) {
      const have = mine.find((p) => p.externalId === clip.externalId || p.url === clip.url);
      const nums = { views: clip.views, likes: clip.likes, comments: null, shares: null };
      if (!have) {
        const id = "po_" + randomBytes(6).toString("hex");
        await db().insert(posts).values({ id, campaignId, creatorId, platform: "youtube", url: clip.url!, externalId: clip.externalId, title: clip.title, postedAt: clip.publishedAt, ...nums, source: "auto", excluded: 0, lastFetchedAt: now, createdBy: null, createdAt: now, updatedAt: now });
        await snap(id, nums, now);
        added++;
      } else if (have.source === "auto" && !have.excluded && (have.views !== clip.views || have.likes !== clip.likes)) {
        await db().update(posts).set({ views: clip.views, likes: clip.likes, lastFetchedAt: now, updatedAt: now }).where(eq(posts.id, have.id));
        await snap(have.id, nums, now);
        updated++;
      }
    }
  }
  return { added, updated, creators: yt.length };
}
