// Creator reads. Tables a role may not see are NOT queried at all (rates without `price`, contacts/notes without `contact`).
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../db/client";
import { channels, contacts, creators, notes, rates } from "../db/schema";
import { can, type Role } from "../auth/roles";
import { serializeCreator } from "./serialize";

function groupBy<T, K extends string>(rows: T[], key: (r: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>();
  for (const r of rows) {
    const k = key(r);
    const list = m.get(k);
    if (list) list.push(r);
    else m.set(k, [r]);
  }
  return m;
}

// visibleCampaigns: notes written by campaign work are dropped unless the caller can see that campaign.
export async function loadCreators(role: Role, ids?: string[], ownerNames?: Map<string, string>, visibleCampaigns?: Set<string>) {
  const where = ids ? and(isNull(creators.deletedAt), inArray(creators.id, ids)) : isNull(creators.deletedAt);
  const rows = await db().select().from(creators).where(where).orderBy(asc(creators.name));
  if (!rows.length) return [];
  const keys = rows.map((r) => r.id);
  const chs = groupBy(await db().select().from(channels).where(inArray(channels.creatorId, keys)), (r) => r.creatorId);
  const rts = can(role, "price")
    ? groupBy(await db().select().from(rates).where(inArray(rates.creatorId, keys)), (r) => r.creatorId)
    : null;
  const cts = can(role, "contact")
    ? new Map((await db().select().from(contacts).where(inArray(contacts.creatorId, keys))).map((c) => [c.creatorId, c]))
    : null;
  const nts = can(role, "contact")
    ? groupBy(
        await db().select().from(notes).where(inArray(notes.creatorId, keys)).orderBy(desc(notes.createdAt)),
        (r) => r.creatorId,
      )
    : null;
  return rows.map((c) => {
    const out = serializeCreator(
      {
        creator: c,
        channels: chs.get(c.id) ?? [],
        rates: rts?.get(c.id) ?? [],
        contact: cts?.get(c.id) ?? null,
        notes: (nts?.get(c.id) ?? []).filter((n) => !n.campaignId || !!visibleCampaigns?.has(n.campaignId)),
      },
      role,
    );
    if (can(role, "contact") && ownerNames) out.owner = c.ownerEmail ? (ownerNames.get(c.ownerEmail) ?? null) : null;
    return out;
  });
}

export async function loadCreator(role: Role, id: string, visibleCampaigns?: Set<string>) {
  const [one] = await loadCreators(role, [id], undefined, visibleCampaigns);
  return one ?? null;
}

export async function creatorExists(id: string): Promise<boolean> {
  const [r] = await db().select({ id: creators.id }).from(creators).where(eq(creators.id, id)).limit(1);
  return !!r;
}
