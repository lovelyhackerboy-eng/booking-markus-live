// Reports. One campaign: KPI vs delivered views, per-creator rows, cost/CPV (price role only).
// Overview: every campaign the caller can see; roles with allCampaigns also get the per-owner team table.
// Money fields are added only when the caller holds `price` — never computed into a field a viewer receives.
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../db/client";
import { bookings, campaignEntries, campaigns, creatorMetrics, creators, posts, users } from "../db/schema";
import { can } from "../auth/roles";
import type { CurrentUser } from "../auth/session";
import { visibleWhere } from "../campaigns/repo";
import { finalStep, stepsOf } from "../campaigns/steps";

type U = Pick<CurrentUser, "email" | "role">;
const sum = (xs: (number | null | undefined)[]) => xs.reduce<number>((s, x) => s + (x ?? 0), 0);
const pct = (a: number, b: number | null | undefined) => (b ? Math.round((a / b) * 1000) / 10 : null);

async function gather(ids: string[]) {
  if (!ids.length) return { ent: [], pst: [], bk: [], mts: [], crs: [] };
  const [ent, pst, bk] = await Promise.all([
    db().select().from(campaignEntries).where(inArray(campaignEntries.campaignId, ids)),
    db().select().from(posts).where(and(inArray(posts.campaignId, ids), eq(posts.excluded, 0))),
    db().select().from(bookings).where(inArray(bookings.campaignId, ids)),
  ]);
  const cids = [...new Set(ent.map((e) => e.creatorId))];
  const [mts, crs] = cids.length
    ? await Promise.all([
        db().select().from(creatorMetrics).where(inArray(creatorMetrics.creatorId, cids)),
        db().select({ id: creators.id, name: creators.name, hero: creators.heroPlatform }).from(creators).where(and(inArray(creators.id, cids), isNull(creators.deletedAt))),
      ])
    : [[], []];
  return { ent, pst, bk, mts, crs };
}

function campaignNumbers(c: typeof campaigns.$inferSelect, final: string, g: Awaited<ReturnType<typeof gather>>, price: boolean) {
  const ent = g.ent.filter((e) => e.campaignId === c.id);
  const pst = g.pst.filter((p) => p.campaignId === c.id);
  const bk = g.bk.filter((b) => b.campaignId === c.id && b.status !== "cancelled");
  const booked = ent.filter((e) => e.stage === final);
  const heroOf = new Map(g.crs.map((x) => [x.id, x.hero]));
  const expected = (id: string) => {
    const ms = g.mts.filter((m) => m.creatorId === id && m.avgViews != null);
    return (ms.find((m) => m.platform === heroOf.get(id)) ?? ms.sort((a, b) => (b.avgViews ?? 0) - (a.avgViews ?? 0))[0])?.avgViews ?? null;
  };
  const views = sum(pst.map((p) => p.views));
  const inter = sum(pst.map((p) => sum([p.likes, p.comments, p.shares])));
  const out: Record<string, unknown> = {
    id: c.id, name: c.name, brand: c.brand, status: c.status, kpiViews: c.kpiViews,
    startDate: c.startDate, endDate: c.endDate, doneAt: c.doneAt,
    creators: ent.length, booked: booked.length, posts: pst.length,
    expectedViews: sum(booked.map((e) => expected(e.creatorId))),
    views, interactions: inter, er: views ? Math.round((inter / views) * 10000) / 100 : null,
    kpiPct: pct(views, c.kpiViews),
  };
  if (price) {
    const cost = sum(bk.map((b) => b.closedAmount ?? b.quotedAmount));
    Object.assign(out, { budget: c.budget, cost, budgetPct: pct(cost, c.budget), cpv: views && cost ? Math.round((cost / views) * 100) / 100 : null, cpm: views && cost ? Math.round((cost / views) * 1000) : null });
  }
  return { out, ent, pst, bk, booked, expected };
}

export async function campaignReport(u: U, id: string) {
  const [c] = await db().select().from(campaigns).where(and(eq(campaigns.id, id), visibleWhere(u))).limit(1);
  if (!c) return null;
  const steps = (await stepsOf([id])).get(id)!;
  const final = finalStep(steps);
  const price = can(u.role, "price");
  const g = await gather([id]);
  const { out, ent, pst, bk, expected } = campaignNumbers(c, final, g, price);
  const nameOf = new Map(g.crs.map((x) => [x.id, x]));
  const label = new Map(steps.map((s) => [s.key, s.label]));
  const rows = ent
    .map((e) => {
      const mine = pst.filter((p) => p.creatorId === e.creatorId);
      const v = sum(mine.map((p) => p.views));
      const it = sum(mine.map((p) => sum([p.likes, p.comments, p.shares])));
      const r: Record<string, unknown> = {
        creatorId: e.creatorId, name: nameOf.get(e.creatorId)?.name ?? "?", platform: nameOf.get(e.creatorId)?.hero ?? null,
        stage: e.stage, stageLabel: label.get(e.stage) ?? e.stage, booked: e.stage === final,
        expectedViews: expected(e.creatorId), posts: mine.length, views: v, interactions: it, er: v ? Math.round((it / v) * 10000) / 100 : null,
      };
      if (price) {
        const cost = sum(bk.filter((b) => b.creatorId === e.creatorId).map((b) => b.closedAmount ?? b.quotedAmount));
        Object.assign(r, { cost: cost || null, cpv: v && cost ? Math.round((cost / v) * 100) / 100 : null });
      }
      return r;
    })
    .sort((a, b) => Number(b.booked) - Number(a.booked) || (b.views as number) - (a.views as number));
  // Views delivered per Vietnam day (by post date), for the progress chart.
  const byDay = new Map<string, number>();
  for (const p of pst) if (p.postedAt) { const d = new Date(p.postedAt.getTime() + 7 * 3600e3).toISOString().slice(0, 10); byDay.set(d, (byDay.get(d) ?? 0) + (p.views ?? 0)); }
  const funnel = steps.map((s) => ({ key: s.key, label: s.label, final: s.final, count: ent.filter((e) => e.stage === s.key).length }));
  return { campaign: out, funnel, rows, daily: [...byDay.entries()].sort().map(([day, views]) => ({ day, views })), price };
}

export async function overviewReport(u: U) {
  const list = await db().select().from(campaigns).where(visibleWhere(u));
  const ids = list.map((c) => c.id);
  const steps = await stepsOf(ids);
  const price = can(u.role, "price");
  const g = await gather(ids);
  const rows = list.map((c) => campaignNumbers(c, finalStep(steps.get(c.id)!), g, price).out);
  const byStatus = { draft: 0, running: 0, done: 0 } as Record<string, number>;
  for (const c of list) byStatus[c.status]++;
  const totals: Record<string, unknown> = {
    campaigns: list.length, byStatus,
    creators: new Set(g.ent.map((e) => e.creatorId)).size,
    booked: sum(rows.map((r) => r.booked as number)), posts: sum(rows.map((r) => r.posts as number)), views: sum(rows.map((r) => r.views as number)),
  };
  if (price) Object.assign(totals, { cost: sum(rows.map((r) => r.cost as number)), budget: sum(rows.map((r) => r.budget as number)) });
  // Top creators by delivered views across visible campaigns.
  const per = new Map<string, { views: number; posts: number; campaigns: Set<string> }>();
  for (const p of g.pst) { const x = per.get(p.creatorId) ?? { views: 0, posts: 0, campaigns: new Set() }; x.views += p.views ?? 0; x.posts++; x.campaigns.add(p.campaignId); per.set(p.creatorId, x); }
  const nameOf = new Map(g.crs.map((x) => [x.id, x.name]));
  const topCreators = [...per.entries()].sort((a, b) => b[1].views - a[1].views).slice(0, 10).map(([id, x]) => ({ creatorId: id, name: nameOf.get(id) ?? "?", views: x.views, posts: x.posts, campaigns: x.campaigns.size }));
  let team: unknown[] | undefined;
  if (can(u.role, "allCampaigns")) {
    const people = new Map((await db().select({ email: users.email, name: users.name }).from(users)).map((p) => [p.email, p.name]));
    const own = new Map<string, Record<string, number>>();
    list.forEach((c, i) => {
      const r = rows[i];
      const k = c.ownerEmail;
      const t = own.get(k) ?? { campaigns: 0, running: 0, done: 0, booked: 0, views: 0, cost: 0 };
      t.campaigns++; if (c.status === "running") t.running++; if (c.status === "done") t.done++;
      t.booked += r.booked as number; t.views += r.views as number; if (price) t.cost += (r.cost as number) ?? 0;
      own.set(k, t);
    });
    team = [...own.entries()]
      .sort((a, b) => b[1].views - a[1].views)
      .map(([email, t]) => {
        const { cost, ...rest } = t;
        return { owner: people.get(email) ?? "?", ...rest, ...(price ? { cost } : {}) };
      });
  }
  return { scope: can(u.role, "allCampaigns") ? "team" : "mine", totals, campaigns: rows, topCreators, team, price };
}
