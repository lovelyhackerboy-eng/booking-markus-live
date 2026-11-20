// Campaign writes. Every operation re-checks, on the server: `edit` permission, that the caller can SEE the campaign
// (404 otherwise — a hidden campaign is indistinguishable from a missing one), and manage rights where needed.
// Each change is written to audit_log; stage changes and approvals also add a note to the creator's timeline.
import { randomBytes } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import { auditLog, campaignCandidates, campaignEntries, campaignMembers, campaigns, creators, notes, SOW_VALUES, STAGE_VALUES, users } from "../db/schema";
import { can } from "../auth/roles";
import type { CurrentUser } from "../auth/session";
import { fail } from "../http";
import { visibleWhere } from "./repo";

const STAGE_LABEL: Record<(typeof STAGE_VALUES)[number], string> = {
  none: "Chưa liên hệ",
  zalo: "Đã liên hệ qua Zalo",
  manager: "Qua Manager / MCN",
  quoted: "Đã báo giá",
  closed: "Đã chốt",
};

const id40 = z.string().regex(/^[A-Za-z0-9_-]{1,40}$/);
export const createSchema = z.object({
  name: z.string().trim().min(1).max(190),
  brand: z.string().trim().max(120).optional().default(""),
  kpiViews: z.number().int().min(0).max(1e12).optional().default(0),
});
export const opSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("update"), name: z.string().trim().min(1).max(190).optional(), brand: z.string().trim().max(120).optional(), kpiViews: z.number().int().min(0).max(1e12).optional() }),
  z.object({ op: z.literal("archive") }),
  z.object({ op: z.literal("members"), emails: z.array(z.string().email().max(190)).max(50) }),
  z.object({ op: z.literal("addCandidate"), creatorId: id40, sow: z.enum(SOW_VALUES).nullable().optional() }),
  z.object({ op: z.literal("removeCandidate"), creatorId: id40 }),
  z.object({ op: z.literal("setCandidateSow"), creatorId: id40, sow: z.enum(SOW_VALUES).nullable() }),
  z.object({ op: z.literal("clearCandidates") }),
  z.object({ op: z.literal("approve"), creatorIds: z.array(id40).min(1).max(200) }),
  z.object({ op: z.literal("addEntry"), creatorId: id40 }),
  z.object({ op: z.literal("removeEntry"), creatorId: id40 }),
  z.object({ op: z.literal("setStage"), creatorId: id40, stage: z.enum(STAGE_VALUES) }),
]);
export type CampaignOp = z.infer<typeof opSchema>;

type Actor = Pick<CurrentUser, "email" | "name" | "role">;

const audit = (actor: Actor, action: string, target: string, after: unknown) =>
  db().insert(auditLog).values({ at: new Date(), actorEmail: actor.email, action, target, after: JSON.stringify(after).slice(0, 60000) });

async function visibleCampaign(actor: Actor, id: string) {
  const [c] = await db().select().from(campaigns).where(and(eq(campaigns.id, id), visibleWhere(actor))).limit(1);
  if (!c) fail(404, "not_found");
  return c!;
}

async function assertCreators(ids: string[]) {
  const rows = await db().select({ id: creators.id }).from(creators).where(inArray(creators.id, ids));
  if (rows.length !== new Set(ids).size) fail(422, "unknown_creator");
}

export async function createCampaign(actor: Actor, input: z.infer<typeof createSchema>) {
  if (!can(actor.role, "edit")) fail(403, "forbidden");
  const id = "cp_" + randomBytes(6).toString("hex");
  const now = new Date();
  await db().insert(campaigns).values({ id, name: input.name, brand: input.brand || null, ownerEmail: actor.email, kpiViews: input.kpiViews || null, createdAt: now, updatedAt: now });
  await audit(actor, "campaign.create", "campaign:" + id, input);
  return id;
}

export async function applyCampaignOp(actor: Actor, id: string, op: CampaignOp): Promise<void> {
  if (!can(actor.role, "edit")) fail(403, "forbidden");
  const c = await visibleCampaign(actor, id);
  const manage = c.ownerEmail === actor.email || can(actor.role, "allCampaigns");
  const now = new Date();
  const note = (creatorId: string, body: string) =>
    db().insert(notes).values({ creatorId, authorEmail: actor.email, authorName: actor.name, body, kind: "", campaignId: id, createdAt: now });

  switch (op.op) {
    case "update": {
      if (!manage) fail(403, "forbidden");
      const set: Partial<typeof campaigns.$inferInsert> = { updatedAt: now };
      if (op.name !== undefined) set.name = op.name;
      if (op.brand !== undefined) set.brand = op.brand || null;
      if (op.kpiViews !== undefined) set.kpiViews = op.kpiViews || null;
      await db().update(campaigns).set(set).where(eq(campaigns.id, id));
      break;
    }
    case "archive":
      if (!manage) fail(403, "forbidden");
      await db().update(campaigns).set({ archivedAt: now, updatedAt: now }).where(eq(campaigns.id, id));
      break;
    case "members": {
      if (!manage) fail(403, "forbidden");
      const emails = [...new Set(op.emails.map((e) => e.toLowerCase()))].filter((e) => e !== c.ownerEmail);
      if (emails.length) {
        const known = await db().select({ email: users.email }).from(users).where(inArray(users.email, emails));
        if (known.length !== emails.length) fail(422, "unknown_member");
      }
      await db().transaction(async (tx) => {
        await tx.delete(campaignMembers).where(eq(campaignMembers.campaignId, id));
        if (emails.length) await tx.insert(campaignMembers).values(emails.map((email) => ({ campaignId: id, email, addedAt: now })));
      });
      break;
    }
    case "addCandidate":
      await assertCreators([op.creatorId]);
      await db()
        .insert(campaignCandidates)
        .values({ campaignId: id, creatorId: op.creatorId, sow: op.sow ?? null, addedBy: actor.email, addedAt: now })
        .onDuplicateKeyUpdate({ set: { sow: op.sow ?? null } });
      break;
    case "removeCandidate":
      await db().delete(campaignCandidates).where(and(eq(campaignCandidates.campaignId, id), eq(campaignCandidates.creatorId, op.creatorId)));
      break;
    case "setCandidateSow":
      await db().update(campaignCandidates).set({ sow: op.sow }).where(and(eq(campaignCandidates.campaignId, id), eq(campaignCandidates.creatorId, op.creatorId)));
      break;
    case "clearCandidates":
      await db().delete(campaignCandidates).where(eq(campaignCandidates.campaignId, id));
      break;
    case "approve": {
      const ids = [...new Set(op.creatorIds)];
      await assertCreators(ids);
      const existing = new Set(
        (await db().select({ id: campaignEntries.creatorId }).from(campaignEntries).where(and(eq(campaignEntries.campaignId, id), inArray(campaignEntries.creatorId, ids)))).map((r) => r.id),
      );
      const fresh = ids.filter((x) => !existing.has(x));
      await db().transaction(async (tx) => {
        if (fresh.length) await tx.insert(campaignEntries).values(fresh.map((creatorId) => ({ campaignId: id, creatorId, stage: "none" as const, addedAt: now, updatedAt: now })));
        await tx.delete(campaignCandidates).where(and(eq(campaignCandidates.campaignId, id), inArray(campaignCandidates.creatorId, ids)));
        for (const creatorId of fresh)
          await tx.insert(notes).values({ creatorId, authorEmail: actor.email, authorName: actor.name, body: `Được duyệt vào campaign “${c.name}”, chờ liên hệ.`, kind: "", campaignId: id, createdAt: now });
      });
      break;
    }
    case "addEntry":
      await assertCreators([op.creatorId]);
      await db()
        .insert(campaignEntries)
        .values({ campaignId: id, creatorId: op.creatorId, stage: "none", addedAt: now, updatedAt: now })
        .onDuplicateKeyUpdate({ set: { updatedAt: now } });
      break;
    case "removeEntry":
      await db().delete(campaignEntries).where(and(eq(campaignEntries.campaignId, id), eq(campaignEntries.creatorId, op.creatorId)));
      break;
    case "setStage": {
      const [e] = await db().select().from(campaignEntries).where(and(eq(campaignEntries.campaignId, id), eq(campaignEntries.creatorId, op.creatorId))).limit(1);
      if (!e) fail(404, "not_found");
      if (e!.stage === op.stage) return;
      await db().update(campaignEntries).set({ stage: op.stage, updatedAt: now }).where(and(eq(campaignEntries.campaignId, id), eq(campaignEntries.creatorId, op.creatorId)));
      await note(op.creatorId, `Tiến độ liên hệ → “${STAGE_LABEL[op.stage]}” (campaign ${c.name}).`);
      break;
    }
  }
  await db().update(campaigns).set({ updatedAt: now }).where(eq(campaigns.id, id));
  await audit(actor, "campaign." + op.op, "campaign:" + id, op);
}
