// Campaign writes. Every operation re-checks, on the server: `edit` permission, that the caller can SEE the campaign
// (404 otherwise — a hidden campaign is indistinguishable from a missing one), and manage rights where needed.
// Each change is written to audit_log; stage changes and approvals also add a note to the creator's timeline.
import { randomBytes } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import { aiThreads, auditLog, bookings, campaignCandidates, campaignEntries, campaignMembers, campaigns, campaignSteps, creators, notes, posts, postSnapshots, SOW_VALUES, users } from "../db/schema";
import { firstStep, replaceSteps, stepsFor, type Step } from "./steps";
import { can } from "../auth/roles";
import type { CurrentUser } from "../auth/session";
import { fail } from "../http";
import { visibleWhere } from "./repo";


const id40 = z.string().regex(/^[A-Za-z0-9_-]{1,40}$/);
export const createSchema = z.object({
  name: z.string().trim().min(1).max(190),
  brand: z.string().trim().max(120).optional().default(""),
  kpiViews: z.number().int().min(0).max(1e12).optional().default(0),
});
const stepKey = z.string().regex(/^[a-z0-9_-]{1,40}$/);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable();
export const opSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("update"),
    name: z.string().trim().min(1).max(190).optional(),
    brand: z.string().trim().max(120).optional(),
    kpiViews: z.number().int().min(0).max(1e12).optional(),
    description: z.string().trim().max(4000).optional(),
    budget: z.number().int().min(0).max(1e13).nullable().optional(),
    startDate: day.optional(),
    endDate: day.optional(),
    autoTrack: z.boolean().optional(),
    trackFrom: day.optional(),
    trackTo: day.optional(),
  }),
  z.object({ op: z.literal("setStatus"), status: z.enum(["draft", "running", "done"]) }),
  z.object({
    op: z.literal("steps"),
    steps: z.array(z.object({ key: stepKey.optional(), label: z.string().trim().min(1).max(80), final: z.boolean().optional() })).min(1).max(15),
    moveTo: stepKey.optional(), // where entries of removed steps go
  }),
  z.object({ op: z.literal("moveEntry"), creatorId: id40, stage: stepKey, position: z.number().int().min(0).max(10000).optional() }),
  z.object({ op: z.literal("delete") }),
  z.object({ op: z.literal("archive") }),
  z.object({ op: z.literal("members"), emails: z.array(z.string().email().max(190)).max(50) }),
  z.object({ op: z.literal("addCandidate"), creatorId: id40, sow: z.enum(SOW_VALUES).nullable().optional() }),
  z.object({ op: z.literal("removeCandidate"), creatorId: id40 }),
  z.object({ op: z.literal("setCandidateSow"), creatorId: id40, sow: z.enum(SOW_VALUES).nullable() }),
  z.object({ op: z.literal("clearCandidates") }),
  z.object({ op: z.literal("approve"), creatorIds: z.array(id40).min(1).max(200) }),
  z.object({ op: z.literal("addEntry"), creatorId: id40 }),
  z.object({ op: z.literal("removeEntry"), creatorId: id40 }),
  z.object({ op: z.literal("setStage"), creatorId: id40, stage: stepKey }),
]);
export type CampaignOp = z.infer<typeof opSchema>;

type Actor = Pick<CurrentUser, "email" | "name" | "role">;

const audit = (actor: Actor, action: string, target: string, after: unknown) =>
  db().insert(auditLog).values({ at: new Date(), actorEmail: actor.email, action, target, after: JSON.stringify(after).slice(0, 60000) });

export async function visibleCampaign(actor: Actor, id: string) {
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
      if (op.description !== undefined) set.description = op.description || null;
      if (op.budget !== undefined) {
        if (!can(actor.role, "price")) fail(403, "forbidden");
        set.budget = op.budget;
      }
      const d = (v: string | null) => (v ? new Date(v + "T00:00:00Z") : null);
      if (op.startDate !== undefined) set.startDate = d(op.startDate);
      if (op.endDate !== undefined) set.endDate = d(op.endDate);
      if (op.autoTrack !== undefined) set.autoTrack = op.autoTrack ? 1 : 0;
      if (op.trackFrom !== undefined) set.trackFrom = d(op.trackFrom);
      if (op.trackTo !== undefined) set.trackTo = d(op.trackTo);
      const from = set.trackFrom !== undefined ? set.trackFrom : c.trackFrom;
      const to = set.trackTo !== undefined ? set.trackTo : c.trackTo;
      if (from && to && from > to) fail(422, "bad_dates");
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
      const first = firstStep(await stepsFor(id));
      const ids = [...new Set(op.creatorIds)];
      await assertCreators(ids);
      const existing = new Set(
        (await db().select({ id: campaignEntries.creatorId }).from(campaignEntries).where(and(eq(campaignEntries.campaignId, id), inArray(campaignEntries.creatorId, ids)))).map((r) => r.id),
      );
      const fresh = ids.filter((x) => !existing.has(x));
      await db().transaction(async (tx) => {
        if (fresh.length) await tx.insert(campaignEntries).values(fresh.map((creatorId) => ({ campaignId: id, creatorId, stage: first, addedAt: now, updatedAt: now })));
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
        .values({ campaignId: id, creatorId: op.creatorId, stage: firstStep(await stepsFor(id)), addedAt: now, updatedAt: now })
        .onDuplicateKeyUpdate({ set: { updatedAt: now } });
      break;
    case "removeEntry":
      await db().delete(campaignEntries).where(and(eq(campaignEntries.campaignId, id), eq(campaignEntries.creatorId, op.creatorId)));
      break;
    case "setStage": {
      const [e] = await db().select().from(campaignEntries).where(and(eq(campaignEntries.campaignId, id), eq(campaignEntries.creatorId, op.creatorId))).limit(1);
      if (!e) fail(404, "not_found");
      const steps = await stepsFor(id);
      const step = steps.find((x) => x.key === op.stage);
      if (!step) fail(422, "unknown_step");
      if (e!.stage === op.stage) return;
      await db().update(campaignEntries).set({ stage: op.stage, updatedAt: now }).where(and(eq(campaignEntries.campaignId, id), eq(campaignEntries.creatorId, op.creatorId)));
      await note(op.creatorId, `Tiến độ liên hệ → “${step!.label}” (campaign ${c.name}).`);
      break;
    }
    case "moveEntry": {
      // Drag and drop on the board: new step and/or new position inside the step.
      const [e] = await db().select().from(campaignEntries).where(and(eq(campaignEntries.campaignId, id), eq(campaignEntries.creatorId, op.creatorId))).limit(1);
      if (!e) fail(404, "not_found");
      const steps = await stepsFor(id);
      const step = steps.find((x) => x.key === op.stage);
      if (!step) fail(422, "unknown_step");
      const others = (await db().select().from(campaignEntries).where(and(eq(campaignEntries.campaignId, id), eq(campaignEntries.stage, op.stage))))
        .filter((x) => x.creatorId !== op.creatorId)
        .sort((a, b) => a.position - b.position || +a.addedAt - +b.addedAt);
      const pos = Math.min(op.position ?? others.length, others.length);
      others.splice(pos, 0, { ...e!, stage: op.stage });
      await db().transaction(async (tx) => {
        for (const [i, x] of others.entries())
          await tx.update(campaignEntries).set({ stage: op.stage, position: i, ...(x.creatorId === op.creatorId ? { updatedAt: now } : {}) }).where(and(eq(campaignEntries.campaignId, id), eq(campaignEntries.creatorId, x.creatorId)));
      });
      if (e!.stage !== op.stage) await note(op.creatorId, `Tiến độ liên hệ → “${step!.label}” (campaign ${c.name}).`);
      break;
    }
    case "setStatus": {
      if (!manage) fail(403, "forbidden");
      if (c.status === op.status) return;
      const set: Partial<typeof campaigns.$inferInsert> = { status: op.status, updatedAt: now };
      if (op.status === "running" && !c.startDate) set.startDate = now;
      if (op.status === "done") set.doneAt = now;
      if (op.status !== "done") set.doneAt = null;
      await db().update(campaigns).set(set).where(eq(campaigns.id, id));
      break;
    }
    case "steps": {
      if (!manage) fail(403, "forbidden");
      const current = await stepsFor(id);
      const used = new Set<string>();
      const next: Step[] = op.steps.map((s, i) => {
        let key = s.key && !used.has(s.key) ? s.key : "";
        if (!key) {
          const base = s.label.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "step";
          key = base;
          for (let n = 2; used.has(key) || (current.some((x) => x.key === key) && !op.steps.some((y) => y.key === key)); n++) key = `${base}-${n}`;
        }
        used.add(key);
        return { key, label: s.label, position: i, final: !!s.final };
      });
      const finals = next.filter((x) => x.final).length;
      if (finals === 0) next[next.length - 1].final = true;
      if (finals > 1) fail(422, "one_final_step");
      const removed = current.filter((x) => !used.has(x.key)).map((x) => x.key);
      if (removed.length) {
        const stuck = await db().select({ creatorId: campaignEntries.creatorId }).from(campaignEntries).where(and(eq(campaignEntries.campaignId, id), inArray(campaignEntries.stage, removed)));
        if (stuck.length) {
          if (!op.moveTo || !used.has(op.moveTo)) fail(409, "step_has_entries");
          await db().update(campaignEntries).set({ stage: op.moveTo!, updatedAt: now }).where(and(eq(campaignEntries.campaignId, id), inArray(campaignEntries.stage, removed)));
        }
      }
      await replaceSteps(id, next);
      break;
    }
    case "delete": {
      // Only a draft without bookings can be deleted; everything attached to it goes too.
      if (!manage) fail(403, "forbidden");
      if (c.status !== "draft") fail(409, "not_draft");
      const [b] = await db().select({ id: bookings.id }).from(bookings).where(eq(bookings.campaignId, id)).limit(1);
      if (b) fail(409, "has_bookings");
      const postIds = (await db().select({ id: posts.id }).from(posts).where(eq(posts.campaignId, id))).map((x) => x.id);
      await db().transaction(async (tx) => {
        if (postIds.length) await tx.delete(postSnapshots).where(inArray(postSnapshots.postId, postIds));
        await tx.delete(posts).where(eq(posts.campaignId, id));
        await tx.delete(campaignCandidates).where(eq(campaignCandidates.campaignId, id));
        await tx.delete(campaignEntries).where(eq(campaignEntries.campaignId, id));
        await tx.delete(campaignMembers).where(eq(campaignMembers.campaignId, id));
        await tx.delete(campaignSteps).where(eq(campaignSteps.campaignId, id));
        await tx.delete(aiThreads).where(eq(aiThreads.campaignId, id));
        await tx.delete(notes).where(eq(notes.campaignId, id));
        await tx.delete(campaigns).where(eq(campaigns.id, id));
      });
      await audit(actor, "campaign.delete", "campaign:" + id, { name: c.name });
      return;
    }
  }
  await db().update(campaigns).set({ updatedAt: now }).where(eq(campaigns.id, id));
  await audit(actor, "campaign." + op.op, "campaign:" + id, op);
}
