// Metrics: recent clips (auto from YouTube, or typed in) → creator_metrics per creator + platform.
// Auto-refreshed values never touch the Google Sheet; the Sheet stays the source for followers and prices.
import { and, asc, desc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import { auditLog, channels, creatorClips, creatorMetrics, creators, PLATFORM_VALUES } from "../db/schema";
import { fail } from "../http";
import { computeMetrics } from "./compute";
import { getMetricsSettings, type MetricsSettings } from "./settings";
import { fetchYoutubeChannel, FetchError } from "./youtube";

type Platform = (typeof PLATFORM_VALUES)[number];

export async function recompute(creatorId: string, platform: Platform, s?: MetricsSettings, extra: Partial<typeof creatorMetrics.$inferInsert> = {}) {
  const set = s ?? (await getMetricsSettings());
  const clips = await db().select().from(creatorClips).where(and(eq(creatorClips.creatorId, creatorId), eq(creatorClips.platform, platform)));
  const [ch] = await db().select({ followers: channels.followers }).from(channels).where(and(eq(channels.creatorId, creatorId), eq(channels.platform, platform))).limit(1);
  const [cur] = await db().select().from(creatorMetrics).where(and(eq(creatorMetrics.creatorId, creatorId), eq(creatorMetrics.platform, platform))).limit(1);
  if (!clips.length && !cur && !extra.avatarUrl) return null;
  const m = computeMetrics(clips, ch?.followers ?? null, set);
  const auto = clips.some((c) => c.source === "auto");
  const row = {
    creatorId,
    platform,
    avgViews: m.avgViews,
    er: m.er,
    sampleSize: m.sampleSize,
    source: auto ? ("auto" as const) : ("manual" as const),
    computedAt: new Date(),
    followersSeen: cur?.followersSeen ?? null,
    avatarUrl: cur?.avatarUrl ?? null,
    lastError: cur?.lastError ?? null,
    ...extra,
  };
  await db().insert(creatorMetrics).values(row).onDuplicateKeyUpdate({ set: { ...row } });
  return row;
}

/** Recompute everyone from stored clips (after the admin changes the formula). */
export async function recomputeAll() {
  const s = await getMetricsSettings();
  const keys = await db().selectDistinct({ creatorId: creatorClips.creatorId, platform: creatorClips.platform }).from(creatorClips);
  for (const k of keys) await recompute(k.creatorId, k.platform, s);
  return keys.length;
}

/** Fetch a creator's YouTube channel, store its recent videos, update avatar + metrics. Returns a short status. */
export async function refreshYoutube(creatorId: string, s?: MetricsSettings): Promise<{ ok: boolean; clips?: number; error?: string }> {
  const [ch] = await db().select().from(channels).where(and(eq(channels.creatorId, creatorId), eq(channels.platform, "youtube"))).limit(1);
  if (!ch?.url) return { ok: false, error: "no_youtube_url" };
  const now = new Date();
  try {
    const yt = await fetchYoutubeChannel(ch.url);
    for (const c of yt.clips) {
      const row = { creatorId, platform: "youtube" as const, externalId: c.externalId, url: c.url, title: c.title, publishedAt: c.publishedAt, views: c.views, likes: c.likes, comments: null, shares: null, source: "auto" as const, enteredBy: null, fetchedAt: now };
      await db().insert(creatorClips).values(row).onDuplicateKeyUpdate({ set: { title: row.title, views: row.views, likes: row.likes, publishedAt: row.publishedAt, fetchedAt: now, source: "auto" } });
    }
    await recompute(creatorId, "youtube", s, { avatarUrl: yt.avatarUrl, followersSeen: yt.subscribers, lastError: null });
    return { ok: true, clips: yt.clips.length };
  } catch (e) {
    const error = e instanceof FetchError ? e.message : "fetch_failed";
    const kept = await recompute(creatorId, "youtube", s, { lastError: error.slice(0, 120) }).catch(() => null);
    // no row yet: write one anyway so the scheduler moves on to other creators
    if (!kept) await db().insert(creatorMetrics).values({ creatorId, platform: "youtube", sampleSize: 0, source: "auto", lastError: error.slice(0, 120), computedAt: now }).onDuplicateKeyUpdate({ set: { lastError: error.slice(0, 120), computedAt: now } });
    return { ok: false, error };
  }
}

/** Creators whose YouTube data is the oldest (never fetched first). */
export async function youtubeDue(limit: number, olderThanHours = 20): Promise<string[]> {
  const cutoff = new Date(Date.now() - olderThanHours * 3600e3);
  const rows = await db()
    .select({ id: channels.creatorId, at: creatorMetrics.computedAt })
    .from(channels)
    .innerJoin(creators, and(eq(creators.id, channels.creatorId), isNull(creators.deletedAt)))
    .leftJoin(creatorMetrics, and(eq(creatorMetrics.creatorId, channels.creatorId), eq(creatorMetrics.platform, "youtube")))
    .where(and(eq(channels.platform, "youtube"), sql`${channels.url} LIKE 'https://%youtube.com/%'`, or(isNull(creatorMetrics.computedAt), lt(creatorMetrics.computedAt, cutoff))))
    .orderBy(sql`${creatorMetrics.computedAt} IS NOT NULL`, asc(creatorMetrics.computedAt))
    .limit(limit);
  return rows.map((r) => r.id);
}

/* ---------- Manual clips (TikTok / Facebook / Instagram, or any platform) ---------- */
const count = z.number().int().min(0).max(1e13).nullable().optional();
export const clipOpSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("add"),
    platform: z.enum(PLATFORM_VALUES),
    url: z.string().trim().url().max(1024).refine((u) => /^https:\/\//.test(u), "https only"),
    publishedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    views: z.number().int().min(0).max(1e13),
    likes: count,
    comments: count,
    shares: count,
  }),
  z.object({ op: z.literal("remove"), id: z.number().int().positive() }),
  z.object({ op: z.literal("refresh") }),
]);
export type ClipOp = z.infer<typeof clipOpSchema>;

/** Normalised identity of a clip URL, so the same clip typed twice updates one row. */
export function clipKey(url: string): string {
  const u = new URL(url);
  const yt = u.hostname.includes("youtu") ? u.searchParams.get("v") || u.pathname.match(/\/(?:shorts|embed)\/([\w-]+)/)?.[1] || (u.hostname === "youtu.be" ? u.pathname.slice(1) : "") : "";
  if (yt) return yt;
  const tt = u.pathname.match(/\/video\/(\d+)/)?.[1];
  if (tt) return tt;
  return (u.hostname.replace(/^www\.|^m\./, "") + u.pathname.replace(/\/+$/, "")).toLowerCase().slice(0, 120);
}

export async function applyClipOp(actor: { email: string }, creatorId: string, op: ClipOp) {
  if (op.op === "refresh") {
    const r = await refreshYoutube(creatorId);
    if (!r.ok) fail(422, r.error ?? "fetch_failed");
    return;
  }
  if (op.op === "remove") {
    const [c] = await db().select().from(creatorClips).where(and(eq(creatorClips.id, op.id), eq(creatorClips.creatorId, creatorId))).limit(1);
    if (!c) fail(404, "not_found");
    await db().delete(creatorClips).where(eq(creatorClips.id, op.id));
    await recompute(creatorId, c!.platform);
    await db().insert(auditLog).values({ at: new Date(), actorEmail: actor.email, action: "clip.remove", target: "creator:" + creatorId, before: c!.url });
    return;
  }
  const now = new Date();
  const row = {
    creatorId,
    platform: op.platform,
    externalId: clipKey(op.url),
    url: op.url,
    title: null,
    publishedAt: op.publishedAt ? new Date(op.publishedAt + "T05:00:00Z") : now, // noon in Vietnam
    views: op.views,
    likes: op.likes ?? null,
    comments: op.comments ?? null,
    shares: op.shares ?? null,
    source: "manual" as const,
    enteredBy: actor.email,
    fetchedAt: now,
  };
  await db().insert(creatorClips).values(row).onDuplicateKeyUpdate({ set: { views: row.views, likes: row.likes, comments: row.comments, shares: row.shares, publishedAt: row.publishedAt, enteredBy: actor.email, fetchedAt: now, url: row.url } });
  await recompute(creatorId, op.platform);
  await db().insert(auditLog).values({ at: now, actorEmail: actor.email, action: "clip.add", target: "creator:" + creatorId, after: JSON.stringify({ platform: op.platform, views: op.views }) });
}

export async function clipsOf(creatorId: string) {
  return db().select({ id: creatorClips.id, platform: creatorClips.platform, url: creatorClips.url, title: creatorClips.title, publishedAt: creatorClips.publishedAt, views: creatorClips.views, likes: creatorClips.likes, comments: creatorClips.comments, shares: creatorClips.shares, source: creatorClips.source, fetchedAt: creatorClips.fetchedAt })
    .from(creatorClips).where(eq(creatorClips.creatorId, creatorId)).orderBy(desc(creatorClips.publishedAt)).limit(60);
}

export async function metricsOf(creatorIds: string[]) {
  if (!creatorIds.length) return [];
  return db().select().from(creatorMetrics).where(inArray(creatorMetrics.creatorId, creatorIds));
}
