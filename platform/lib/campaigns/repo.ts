// Campaign visibility is enforced in SQL, per row: owner, invited member, or a role with `allCampaigns`.
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "../db/client";
import { campaignCandidates, campaignEntries, campaignMembers, campaigns, users } from "../db/schema";
import { can } from "../auth/roles";
import type { CurrentUser } from "../auth/session";

export function visibleWhere(u: Pick<CurrentUser, "email" | "role">) {
  const live = isNull(campaigns.archivedAt);
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
    candidates: cand.filter((x) => x.campaignId === c.id).map((x) => ({ creatorId: x.creatorId, sow: x.sow })),
    entries: ent
      .filter((x) => x.campaignId === c.id)
      .map((x) => ({ creatorId: x.creatorId, stage: x.stage, addedAt: x.addedAt })),
    createdAt: c.createdAt,
  }));
}
