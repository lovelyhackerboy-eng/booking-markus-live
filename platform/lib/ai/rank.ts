// Deterministic ranking for a campaign brief. The model only states the brief; scoring happens here, so the same brief
// always gives the same order and every score has plain reasons. Score 0–100:
//   reach (log of hero followers) ≤ 40 · cost efficiency (followers per VND, price roles with a budget) ≤ 25
//   relationship (Đã hợp tác 20 / Đã báo giá 12 / other 5; ×1.5 when preferWorked) · category fit (primary 10 / secondary 5)
import type { Compact } from "./creators";
import { REL } from "./creators";

export type Brief = {
  categories?: string[];
  regions?: string[];
  heroes?: string[];
  platforms?: string[];
  followersMin?: number;
  followersMax?: number;
  budgetPerCreator?: number;
  count?: number;
  preferWorked?: boolean;
  excludeIds?: string[];
};

export type Ranked = {
  id: string;
  name: string;
  score: number;
  why: string[];
  tier: string | null;
  region: string;
  hero: string | null;
  followers: number | null;
  price?: number | null;
  rel?: string | null;
};

const PLAT: Record<string, string> = { tiktok: "TikTok", facebook: "Facebook", instagram: "Instagram", youtube: "YouTube", threads: "Threads" };
const short = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1).replace(/\.0$/, "")}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(n));
const vnd = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1).replace(/\.0$/, "")}tr` : `${Math.round(n / 1e3)}k`);

export function rankForBrief(list: Compact[], b: Brief, allowPrice: boolean): { total: number; items: Ranked[] } {
  const exclude = new Set(b.excludeIds ?? []);
  const budget = allowPrice && b.budgetPerCreator ? b.budgetPerCreator : 0;
  const pool = list.filter((c) => {
    if (exclude.has(c.id)) return false;
    if (b.categories?.length && !c.categories.some((x) => b.categories!.includes(x))) return false;
    if (b.regions?.length && !b.regions.includes(c.region)) return false;
    if (b.heroes?.length && !(c.hero && b.heroes.includes(c.hero))) return false;
    if (b.platforms?.length && !b.platforms.every((p) => c.followers[p] != null)) return false;
    const f = c.heroFollowers ?? 0;
    if (b.followersMin && f < b.followersMin) return false;
    if (b.followersMax && f > b.followersMax) return false;
    if (budget && c.rateFrom != null && c.rateFrom > budget) return false;
    return true;
  });
  const effs = pool.filter((c) => c.rateFrom && c.heroFollowers).map((c) => (c.heroFollowers as number) / (c.rateFrom as number));
  const bestEff = effs.length ? Math.max(...effs) : 0;
  const items = pool.map((c) => {
    const why: string[] = [];
    const f = c.heroFollowers ?? 0;
    let score = f > 0 ? Math.min(40, (Math.log10(f) / Math.log10(5e6)) * 40) : 0;
    if (c.hero && f) why.push(`Kênh chính ${PLAT[c.hero] ?? c.hero} ${short(f)}`);
    if (allowPrice) {
      if (c.rateFrom && f && bestEff) {
        score += ((f / c.rateFrom) / bestEff) * 25;
        why.push(budget ? `Giá từ ${vnd(c.rateFrom)} ≤ ngân sách` : `Giá từ ${vnd(c.rateFrom)}`);
      } else if (budget) {
        score += 5;
        why.push("Chưa có giá số — cần hỏi giá");
      }
    }
    const rel = c.relationship ?? null;
    const relPts = rel === REL.active ? 20 : rel === REL.quoted ? 12 : 5;
    score += b.preferWorked ? relPts * 1.5 : relPts;
    if (rel === REL.active) why.push("Đã hợp tác");
    else if (rel === REL.quoted) why.push("Đã báo giá trước đây");
    if (b.categories?.length) {
      if (c.categories[0] && b.categories.includes(c.categories[0])) score += 10;
      else score += 5;
    }
    const out: Ranked = { id: c.id, name: c.name, score: Math.round(score), why, tier: c.tier, region: c.region, hero: c.hero, followers: c.heroFollowers };
    if (allowPrice) out.price = c.rateFrom ?? null;
    if (c.relationship !== undefined) out.rel = c.relationship;
    return out;
  });
  items.sort((x, y) => y.score - x.score || (y.followers ?? 0) - (x.followers ?? 0));
  const want = Math.min(20, Math.max(1, Math.round((b.count ?? 6) * 2)));
  return { total: pool.length, items: items.slice(0, want) };
}
