// What the AI features may see of creators: the caller's own role-shaped view (lib/creators/serialize.ts), reduced to
// a compact record. Contact details and internal notes are NEVER included, whatever the role — they don't help the
// model and must not leave our server. Prices only for roles with `price`.
import { can, type Role } from "../auth/roles";
import { loadCreators } from "../creators/repo";

export const TIERS = ["Nano", "Micro", "Mid-Tier", "Macro", "Celeb"];
export const PLATFORMS = ["tiktok", "facebook", "instagram", "youtube", "threads"];
// Relationship_Status on the Sheet → filter keys used by the UI (ui/core/filters.js REL_STATUS).
export const REL = { active: "Đã hợp tác", quoted: "Đã báo giá", network: "Chưa liên hệ" } as const;
export const SOW_KINDS = ["video", "photo", "live", "event"];

export const regionShort = (s: string | null | undefined) => {
  const t = String(s || "").replace(/^(Thành phố|TP\.?|Tỉnh)\s*/i, "").trim();
  return /hồ chí minh|hcm/i.test(t) ? "TP.HCM" : t;
};

type Ser = Record<string, unknown> & {
  id: string;
  name: string;
  alias?: string | null;
  tier?: string | null;
  primaryCategory?: string | null;
  secondaryCategory?: string | null;
  baseLocation?: string | null;
  heroPlatform?: string | null;
  relationshipStatus?: string | null;
  channels: Record<string, { followers?: number | null }>;
  rates?: { sow: string; amount: number | null }[];
};

export type Compact = {
  id: string;
  name: string;
  tier: string | null;
  categories: string[];
  region: string;
  hero: string | null;
  heroFollowers: number | null;
  followers: Record<string, number>;
  rateFrom?: number | null;
  rateBySow?: Record<string, number>;
  relationship?: string | null;
};

export function compact(c: Ser, role: Role): Compact {
  const followers: Record<string, number> = {};
  for (const [p, ch] of Object.entries(c.channels || {})) if (ch.followers) followers[p] = ch.followers;
  const hero = c.heroPlatform && followers[c.heroPlatform] != null ? c.heroPlatform : Object.entries(followers).sort((a, b) => b[1] - a[1])[0]?.[0] ?? c.heroPlatform ?? null;
  const out: Compact = {
    id: c.id,
    name: c.name,
    tier: c.tier ?? null,
    categories: [c.primaryCategory, c.secondaryCategory].filter((x): x is string => !!x),
    region: regionShort(c.baseLocation),
    hero,
    heroFollowers: hero ? (followers[hero] ?? null) : null,
    followers,
  };
  if (can(role, "price")) {
    const priced = (c.rates || []).filter((r) => r.amount != null);
    out.rateFrom = priced.length ? Math.min(...priced.map((r) => r.amount as number)) : null;
    out.rateBySow = Object.fromEntries(priced.map((r) => [r.sow, r.amount as number]));
  }
  if (can(role, "contact")) out.relationship = c.relationshipStatus ?? null;
  return out;
}

export async function compactCreators(role: Role): Promise<Compact[]> {
  return ((await loadCreators(role)) as Ser[]).map((c) => compact(c, role));
}

export type Criteria = {
  categories?: string[];
  regions?: string[];
  tiers?: string[];
  heroes?: string[];
  platforms?: string[];
  followersMin?: number;
  followersMax?: number;
  rateMin?: number;
  rateMax?: number;
  rateSow?: string;
  relStatus?: string[];
  text?: string;
};

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase();
const sowKind = (sow: string) => (sow === "live" ? "live" : sow === "event" ? "event" : sow === "photo" ? "photo" : "video");

export function matches(c: Compact, k: Criteria): boolean {
  if (k.categories?.length && !c.categories.some((x) => k.categories!.includes(x))) return false;
  if (k.regions?.length && !k.regions.includes(c.region)) return false;
  if (k.tiers?.length && !(c.tier && k.tiers.includes(c.tier))) return false;
  if (k.heroes?.length && !(c.hero && k.heroes.includes(c.hero))) return false;
  if (k.platforms?.length && !k.platforms.every((p) => c.followers[p] != null)) return false;
  const f = c.heroFollowers ?? 0;
  if (k.followersMin && f < k.followersMin) return false;
  if (k.followersMax && f > k.followersMax) return false;
  if ((k.rateMin || k.rateMax) && c.rateBySow) {
    const prices = Object.entries(c.rateBySow).filter(([s]) => !k.rateSow || sowKind(s) === k.rateSow).map(([, v]) => v);
    if (!prices.length) return false;
    const p = Math.min(...prices);
    if (k.rateMin && p < k.rateMin) return false;
    if (k.rateMax && p > k.rateMax) return false;
  }
  if (k.relStatus?.length) {
    const want = k.relStatus.map((x) => REL[x as keyof typeof REL]).filter(Boolean);
    if (!c.relationship || !want.includes(c.relationship as (typeof REL)[keyof typeof REL])) return false;
  }
  if (k.text && !fold(c.name).includes(fold(k.text))) return false;
  return true;
}

/** Values the model may use, taken from the live data (so it never invents a category or region). */
export function catalogOf(list: Compact[]) {
  const count = (vals: string[]) => [...vals.reduce((m, v) => m.set(v, (m.get(v) ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1]).map((x) => x[0]);
  return {
    categories: count(list.flatMap((c) => c.categories)),
    regions: count(list.map((c) => c.region).filter(Boolean)).slice(0, 25),
    tiers: TIERS,
    platforms: PLATFORMS,
    relStatus: Object.keys(REL),
    sowKinds: SOW_KINDS,
  };
}
