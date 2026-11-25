// Campaign visibility is enforced in SQL, per row: owner, invited member, or a role with `allCampaigns`.
import { and, desc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { db } from "../db/client";
import { campaignCandidates, campaignEntries, campaignMembers, campaigns, users } from "../db/schema";
import { can } from "../auth/roles";
import type { CurrentUser } from "../auth/session";
import { stepsOf } from "./steps";

export function visibleWhere(u: Pick<CurrentUser, "email" | "role">) {
  const live = and(isNull(campaigns.archivedAt), ne(campaigns.status, "deleted")); // soft-deleted: hidden everywhere, not counted
  if (can(u.role, "allCampaigns")) return live;
  const memberOf = sql`${campaigns.id} IN (SELECT ${campaignMembers.campaignId} FROM ${campaignMembers} WHERE ${campaignMembers.email} = ${u.email})`;
  return and(live, or(eq(campaigns.ownerEmail, u.email), memberOf));
}

/** Ids of the campaigns the caller can see (for filtering campaign-linked notes and bookings). */
export async function visibleCampaignIds(u: Pick<CurrentUser, "email" | "role">): Promise<Set<string>> {
  const rows = await db().select({ id: campaigns.id }).from(campaigns).where(visibleWhere(u));
  return new Set(rows.map((r) => r.id));
}

export async function listCampaigns(u: Pick<CurrentUser, "email" | "role">) {
  const rows = await db().select().from(campaigns).where(visibleWhere(u)).orderBy(campaigns.createdAt);
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const [mem, ent, cand, people] = await Promise.all([
    db().select().from(campaignMembers).where(inArray(campaignMembers.campaignId, ids)),
    db().select().from(campaignEntries).where(inArray(campaignEntries.campaignId, ids)),
    db().select().from(campaignCandidates).where(inArray(campaignCandidates.campaignId, ids)),
    db().select({ email: users.email, name: users.name }).from(users),
  ]);
  const steps = await stepsOf(ids);
  const price = can(u.role, "price");
  const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
  const nameOf = new Map(people.map((p) => [p.email, p.name]));
  return rows.map((c) => ({
    id: c.id,
    name: c.name,
    brand: c.brand,
    owner: nameOf.get(c.ownerEmail) ?? null,
    isMine: c.ownerEmail === u.email,
    canManage: c.ownerEmail === u.email || can(u.role, "allCampaigns"),
    members: mem.filter((m) => m.campaignId === c.id).map((m) => nameOf.get(m.email) ?? null),
    kpiViews: c.kpiViews,
    status: c.status,
    description: c.description,
    budget: price ? c.budget : undefined,
    startDate: day(c.startDate),
    endDate: day(c.endDate),
    autoTrack: !!c.autoTrack,
    trackFrom: day(c.trackFrom),
    trackTo: day(c.trackTo),
    doneAt: c.doneAt,
    steps: steps.get(c.id) ?? [],
    candidates: cand.filter((x) => x.campaignId === c.id).map((x) => ({ creatorId: x.creatorId, sow: x.sow })),
    entries: ent
      .filter((x) => x.campaignId === c.id)
      .sort((a, b) => a.position - b.position || +a.addedAt - +b.addedAt)
      .map((x) => ({ creatorId: x.creatorId, stage: x.stage, position: x.position, addedAt: x.addedAt })),
    createdAt: c.createdAt,
  }));
}

/** Admin only: soft-deleted campaigns, newest first (the "Đã xoá" list with Restore). */
export async function listDeletedCampaigns() {
  const rows = await db().select().from(campaigns).where(eq(campaigns.status, "deleted")).orderBy(desc(campaigns.deletedAt));
  const people = new Map((await db().select({ email: users.email, name: users.name }).from(users)).map((p) => [p.email, p.name]));
  const ids = rows.map((r) => r.id);
  const ent = ids.length ? await db().select({ campaignId: campaignEntries.campaignId }).from(campaignEntries).where(inArray(campaignEntries.campaignId, ids)) : [];
  return rows.map((c) => ({
    id: c.id, name: c.name, brand: c.brand, owner: people.get(c.ownerEmail) ?? null, statusBefore: c.statusBeforeDelete,
    deletedAt: c.deletedAt, deletedBy: c.deletedBy ? (people.get(c.deletedBy) ?? c.deletedBy) : null, entries: ent.filter((e) => e.campaignId === c.id).length,
  }));
}
