// Booking writes: create from a campaign, advance status, evaluate (posted-content numbers + working score).
// Rules: `edit` permission; the booking (or its campaign) must be one the caller can work on — owner, a visible
// campaign, or a role with `allCampaigns`. Amounts can only be set by roles with `price`.
import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import { auditLog, bookings, BOOKING_STATUS_VALUES, campaigns, creators, notes, PLATFORM_VALUES } from "../db/schema";
import { can } from "../auth/roles";
import type { CurrentUser } from "../auth/session";
import { fail } from "../http";
import { visibleWhere } from "../campaigns/repo";

type Actor = Pick<CurrentUser, "email" | "name" | "role">;
const id40 = z.string().regex(/^[A-Za-z0-9_-]{1,40}$/);

export const createSchema = z.object({
  campaignId: id40.nullable().optional(),
  brand: z.string().trim().max(120).optional().default(""),
  campaignName: z.string().trim().max(190).optional().default(""),
  items: z
    .array(z.object({ creatorId: id40, platform: z.enum(PLATFORM_VALUES).nullable().optional(), sow: z.string().trim().max(60).optional().default(""), amount: z.number().int().min(0).max(1e12).nullable().optional() }))
    .min(1)
    .max(100),
});
export const opSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("advance") }),
  z.object({ op: z.literal("cancel") }),
  z.object({ op: z.literal("contentUrl"), url: z.string().trim().url().max(1024) }),
  z.object({
    op: z.literal("evaluate"),
    score: z.number().min(1).max(5),
    note: z.string().trim().max(2000).optional().default(""),
    views: z.number().int().min(0).max(1e12).nullable().optional(),
    er: z.number().min(0).max(100).nullable().optional(),
  }),
]);

const NEXT: Record<string, (typeof BOOKING_STATUS_VALUES)[number]> = { confirmed: "content", content: "posted", posted: "paid" };

async function campaignVisible(actor: Actor, id: string) {
  const [c] = await db().select({ id: campaigns.id, name: campaigns.name, brand: campaigns.brand }).from(campaigns).where(and(eq(campaigns.id, id), visibleWhere(actor))).limit(1);
  return c ?? null;
}

export async function createBookings(actor: Actor, input: z.infer<typeof createSchema>) {
  if (!can(actor.role, "edit")) fail(403, "forbidden");
  let brand = input.brand || null;
  let campaignName = input.campaignName || null;
  if (input.campaignId) {
    const c = await campaignVisible(actor, input.campaignId);
    if (!c) fail(404, "not_found");
    brand = brand ?? c!.brand;
    campaignName = campaignName ?? c!.name;
  }
  const now = new Date();
  const deadline = new Date(now.getTime() + 16 * 864e5);
  const ids: string[] = [];
  await db().transaction(async (tx) => {
    for (const it of input.items) {
      const [cr] = await tx.select({ id: creators.id }).from(creators).where(eq(creators.id, it.creatorId)).limit(1);
      if (!cr) fail(422, "unknown_creator");
      const id = "bk_" + randomBytes(6).toString("hex");
      ids.push(id);
      const amount = can(actor.role, "price") ? (it.amount ?? null) : null;
      await tx.insert(bookings).values({
        id, creatorId: it.creatorId, campaignId: input.campaignId ?? null, brand, campaignName, platform: it.platform ?? null, sow: it.sow || null,
        quotedAmount: amount, closedAmount: amount, bookedOn: now, deadline, status: "confirmed", contract: "pending", ownerEmail: actor.email,
        createdAt: now, updatedAt: now,
      });
      await tx.insert(notes).values({ creatorId: it.creatorId, authorEmail: actor.email, authorName: actor.name, body: `Tạo booking ${brand ?? ""}${campaignName ? " – " + campaignName : ""}.`, kind: "", campaignId: input.campaignId ?? null, createdAt: now });
    }
    await tx.insert(auditLog).values({ at: now, actorEmail: actor.email, action: "booking.create", target: "campaign:" + (input.campaignId ?? "-"), after: JSON.stringify({ ids }) });
  });
  return ids;
}

export async function applyBookingOp(actor: Actor, id: string, op: z.infer<typeof opSchema>) {
  if (!can(actor.role, "edit")) fail(403, "forbidden");
  const [b] = await db().select().from(bookings).where(eq(bookings.id, id)).limit(1);
  if (!b) fail(404, "not_found");
  const mayWork = can(actor.role, "allCampaigns") || b!.ownerEmail === actor.email || (!!b!.campaignId && !!(await campaignVisible(actor, b!.campaignId)));
  if (!mayWork) fail(404, "not_found");
  const now = new Date();
  const set: Partial<typeof bookings.$inferInsert> = { updatedAt: now };
  if (op.op === "advance") {
    const next = NEXT[b!.status];
    if (!next) fail(409, "no_next_status");
    set.status = next;
  } else if (op.op === "cancel") set.status = "cancelled";
  else if (op.op === "contentUrl") set.contentUrl = op.url;
  else {
    set.score = op.score;
    set.evaluationNote = op.note || null;
    set.views = op.views ?? null;
    set.er = op.er ?? null;
    await db().insert(notes).values({ creatorId: b!.creatorId, authorEmail: actor.email, authorName: actor.name, body: `Đánh giá booking ${b!.brand ?? ""}: ${op.score}/5. ${op.note}`.trim(), kind: op.score >= 4 ? "good" : op.score < 3 ? "risk" : "", campaignId: b!.campaignId, createdAt: now });
  }
  await db().update(bookings).set(set).where(eq(bookings.id, id));
  await db().insert(auditLog).values({ at: now, actorEmail: actor.email, action: "booking." + op.op, target: "booking:" + id, after: JSON.stringify(op) });
}
