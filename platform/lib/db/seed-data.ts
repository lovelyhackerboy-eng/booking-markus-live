// Seed: the prototype's FAKE creators, campaigns and bookings → MariaDB. Local/test databases only.
import type { MySql2Database } from "drizzle-orm/mysql2";
import { BOOKINGS, COMPANIES, CREATORS, LISTS, SHORTLIST_SEED } from "../../seed/prototype-data.mjs";
import * as s from "./schema";

type Db = MySql2Database<typeof s>;
type Sow = (typeof s.SOW_VALUES)[number];
type Platform = (typeof s.PLATFORM_VALUES)[number];
type Stage = (typeof s.STAGE_VALUES)[number];
type Status = (typeof s.BOOKING_STATUS_VALUES)[number];

// Staff accounts for local login/tests. `.test` domain so they never look like creator contact data.
export const SEED_USERS = [
  { email: "admin@markus.test", name: "Admin Demo", role: "admin" },
  { email: "haiyen@markus.test", name: "Hải Yến", role: "manager" },
  { email: "ngocanh@markus.test", name: "Ngọc Anh", role: "planner" },
  { email: "khanhvy@markus.test", name: "Khánh Vy", role: "planner" },
  { email: "minhduc@markus.test", name: "Minh Đức", role: "planner" },
  { email: "thutrang@markus.test", name: "Thu Trang", role: "planner" },
  { email: "khach@markus.test", name: "Khách xem", role: "viewer" },
] as const;

const emailOf = (name: string | undefined | null): string | null => {
  const base = String(name ?? "").replace(/\s*\(.*\)$/, "").trim();
  return SEED_USERS.find((u) => u.name === base)?.email ?? null;
};

// Prototype SOW labels → the 5 Sheet price columns.
const SOW_OF: Record<string, Sow> = {
  "Bài đăng ảnh": "photo",
  "Video ngắn": "video",
  Reel: "video",
  "Video dài": "brandvideo",
  Livestream: "live",
  "Sự kiện": "event",
};
const sowOf = (label: string): Sow => SOW_OF[label] ?? "video";
const FOLLOWER_SOURCE = new Set(["sheet", "manual", "crawler", "api"]);

const ageBand = (yob: number) => {
  const age = 2026 - yob;
  return age < 18 ? "<18" : age < 25 ? "18-24" : age < 35 ? "25-34" : age < 45 ? "35-44" : "45+";
};

export function assertLocalDatabase(url: string | undefined, nodeEnv: string | undefined): void {
  if (nodeEnv === "production") throw new Error("refusing to seed with NODE_ENV=production");
  if (!url) throw new Error("DATABASE_URL is not set");
  const u = new URL(url);
  const dbName = decodeURIComponent(u.pathname.replace(/^\//, ""));
  const host = u.hostname.toLowerCase();
  const local = host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]" || /^[a-z0-9_-]+$/.test(host);
  if (!local) throw new Error(`refusing to seed a non-local host (${host})`);
  if (dbName.startsWith("thestvco_")) throw new Error("refusing to seed a hosting database");
}

const TABLES_IN_ORDER = [
  s.sessions,
  s.postSnapshots,
  s.posts,
  s.creatorClips,
  s.creatorMetrics,
  s.settings,
  s.campaignSteps,
  s.notes,
  s.contacts,
  s.rates,
  s.channels,
  s.campaignCandidates,
  s.campaignEntries,
  s.campaignMembers,
  s.campaigns,
  s.bookings,
  s.reviewQueue,
  s.auditLog,
  s.syncRuns,
  s.creators,
  s.users,
];

export async function seedAll(d: Db) {
  const now = new Date();
  for (const t of TABLES_IN_ORDER) await d.delete(t);

  await d.insert(s.users).values(SEED_USERS.map((u) => ({ ...u, createdAt: now })));

  for (const c of CREATORS) {
    const company = c.companyId ? COMPANIES[c.companyId] : null;
    await d.insert(s.creators).values({
      id: c.id,
      name: c.name,
      alias: c.alias || null,
      tier: c.tier,
      primaryCategory: c.categories[0] ?? null,
      secondaryCategory: c.categories[1] ?? null,
      creatorType: c.type,
      castingProfile: c.job,
      gender: c.gender,
      yearOfBirth: c.yob,
      ageBand: ageBand(c.yob),
      baseLocation: c.region,
      representation: company ? `${company.kind}: ${company.name}` : c.rel.via === "direct" ? "Self-managed" : "Manager riêng",
      heroPlatform: c.hero,
      relationshipStatus: c.rel.status,
      ownerEmail: emailOf(c.rel.owner),
      note: `Phản hồi: ${c.rel.resp}. Thương lượng: ${c.rel.nego}.`,
      source: "seed",
      syncedAt: new Date(c.lastSynced),
      createdAt: new Date(c.createdAt),
      updatedAt: new Date(c.lastSynced),
    });
    const chans = Object.entries(c.channels).map(([p, ch]) => ({
      creatorId: c.id,
      platform: p as Platform,
      url: ch.url,
      label: ch.handle,
      followers: ch.followers.value,
      followersSource: (FOLLOWER_SOURCE.has(ch.followers.source) ? ch.followers.source : "manual") as "sheet" | "manual" | "crawler" | "api",
      followersUpdatedAt: new Date(ch.followers.updatedAt),
    }));
    if (chans.length) await d.insert(s.channels).values(chans);
    const terms = `${c.terms.usage}. ${c.terms.excl}. ${c.terms.cond}.`;
    const seen = new Set<Sow>();
    for (const r of c.rates) {
      const sow = sowOf(r.sow);
      if (seen.has(sow)) continue;
      seen.add(sow);
      await d.insert(s.rates).values({
        creatorId: c.id,
        sow,
        platform: r.platform as Platform,
        amount: r.amount,
        amountText: String(r.amount),
        terms,
        source: r.source,
        updatedAt: new Date(r.updatedAt),
      });
    }
    const viaCompany = !!company || c.rel.via !== "direct";
    await d.insert(s.contacts).values({
      creatorId: c.id,
      contactPerson: c.rel.contact.person ?? null,
      contactChannel: c.rel.channel,
      contactDetail: c.rel.contact.zalo,
      companyEmail: viaCompany ? c.rel.contact.email : null,
      companyPhone: viaCompany ? c.rel.contact.phone : null,
      personalEmail: viaCompany ? null : c.rel.contact.email,
      personalPhone: viaCompany ? null : c.rel.contact.phone,
      updatedAt: now,
    });
    if (c.notes.length)
      await d.insert(s.notes).values(
        c.notes.map((n) => ({
          creatorId: c.id,
          authorEmail: emailOf(n.by),
          authorName: n.by,
          body: n.text,
          kind: (n.kind === "good" || n.kind === "risk" ? n.kind : "") as "" | "good" | "risk",
          createdAt: new Date(n.at),
        })),
      );
  }

  const ownerFallback = SEED_USERS[0].email;
  for (const l of LISTS) {
    const created = new Date(l.entries[0]?.addedAt ?? now);
    await d.insert(s.campaigns).values({
      id: l.id,
      name: l.name,
      brand: l.brand,
      ownerEmail: emailOf(l.owner) ?? ownerFallback,
      kpiViews: l.kpiViews,
      createdAt: created,
      updatedAt: now,
    });
    const members = l.members.map(emailOf).filter((e): e is string => !!e);
    if (members.length) await d.insert(s.campaignMembers).values(members.map((email) => ({ campaignId: l.id, email, addedAt: now })));
    if (l.entries.length)
      await d.insert(s.campaignEntries).values(
        l.entries.map((e) => ({ campaignId: l.id, creatorId: e.id, stage: e.stage as Stage, addedAt: new Date(e.addedAt), updatedAt: now })),
      );
    const cand = SHORTLIST_SEED[l.id] ?? [];
    if (cand.length)
      await d.insert(s.campaignCandidates).values(
        cand.map((x) => {
          const cr = CREATORS.find((c) => c.id === x.id);
          const r = cr?.rates[x.rateIdx];
          return { campaignId: l.id, creatorId: x.id, sow: r ? sowOf(r.sow) : null, addedBy: emailOf(l.owner), addedAt: now };
        }),
      );
  }

  for (const b of BOOKINGS) {
    await d.insert(s.bookings).values({
      id: b.id,
      creatorId: b.creatorId,
      campaignId: b.listId,
      brand: b.brand,
      campaignName: b.campaign,
      platform: b.platform as Platform,
      sow: b.sow,
      quotedAmount: b.quoted,
      closedAmount: b.closed,
      bookedOn: new Date(b.date),
      deadline: new Date(b.deadline),
      status: b.status as Status,
      contract: b.contract === "pending" ? "pending" : "signed",
      ownerEmail: emailOf(b.owner),
      contentUrl: b.contentUrl || null,
      views: b.perf?.views ?? null,
      er: b.perf?.er ?? null,
      score: b.evaluation?.score ?? null,
      evaluationNote: b.evaluation?.note ?? null,
      createdAt: new Date(b.date),
      updatedAt: now,
    });
  }

  return { users: SEED_USERS.length, creators: CREATORS.length, campaigns: LISTS.length, bookings: BOOKINGS.length };
}
