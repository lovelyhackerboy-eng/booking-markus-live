// "Tìm bằng AI": Vietnamese free text → filter patch for the Discovery screen. Only the query and the list of allowed
// values go to DeepSeek — no creator data. The answer is validated: unknown categories/regions are dropped into
// `unsupported`, price criteria are removed for roles without `price`.
import { can, type Role } from "../auth/roles";
import { chat, NO_USAGE, type Usage } from "./deepseek";
import { catalogOf, type Compact, type Criteria } from "./creators";

export type SearchResult = { patch: Criteria & { q?: string }; understood: string[]; unsupported: string[]; priceSkipped: boolean };

// Same question again → same filters: cache 24 h per (normalised query, price permission, allowed values).
const CACHE = new Map<string, { at: number; result: SearchResult }>();
const CACHE_TTL = 24 * 3600_000;
const normQuery = (q: string) => q.normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim();

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v) : undefined);
const pickAll = (vals: unknown, allowed: string[]) => {
  const ok: string[] = [];
  const bad: string[] = [];
  for (const v of Array.isArray(vals) ? vals : []) {
    const s = String(v ?? "").trim();
    if (!s) continue;
    const hit = allowed.find((a) => a.toLowerCase() === s.toLowerCase());
    if (hit) { if (!ok.includes(hit)) ok.push(hit); } else bad.push(s);
  }
  return { ok, bad };
};

export function systemPrompt(cat: ReturnType<typeof catalogOf>, allowPrice: boolean) {
  return `Bạn chuyển câu tìm creator (tiếng Việt, có thể không dấu) thành bộ lọc JSON cho hệ thống quản lý KOL/creator của Markus Agency.
Chỉ dùng đúng các giá trị được liệt kê. Không đoán, không bịa. Ý nào không đổi được thành bộ lọc thì đưa câu ngắn vào "unsupported".

Giá trị cho phép:
- categories (ngành nội dung): ${JSON.stringify(cat.categories)}
- regions (khu vực): ${JSON.stringify(cat.regions)}  ("Sài Gòn", "HCM" = "TP.HCM")
- tiers: ${JSON.stringify(cat.tiers)}  (Nano <10K, Micro 10K–100K, Mid-Tier 100K–500K, Macro 500K–1M, Celeb ≥1M follower)
- heroes (kênh CHÍNH, khi câu nói "mạnh/chủ yếu/kênh chính trên X"): ${JSON.stringify(cat.platforms)}
- platforms (CÓ kênh trên X): ${JSON.stringify(cat.platforms)}
- relStatus: "active" = đã hợp tác, "quoted" = đã báo giá, "network" = chưa liên hệ
${allowPrice ? `- rateMin / rateMax: giá VND cho 1 lần booking (vd "dưới 20 triệu" → rateMax 20000000); rateSow: ${JSON.stringify(cat.sowKinds)} nếu câu nói rõ loại (video/bài ảnh/livestream/sự kiện)` : "- KHÔNG dùng giá: người dùng không có quyền xem giá. Ý về giá đưa vào unsupported."}
- followersMin / followersMax: số follower của kênh chính
- q: CHỈ dùng khi câu là tên riêng một creator

Gợi ý nghĩa: "mẹ bỉm/mommy/mẹ & bé" → ngành có chữ Mom & Baby; "đồ ăn/ẩm thực/food" → F&B; "ca sĩ/nghệ sĩ" → Music & Performance; "gym/thể hình/sức khoẻ" → Health & Fitness; "công nghệ" → Tech; "vlog/đời sống" → Lifestyle Vlog.
Dữ liệu hiện KHÔNG có: tuổi, giới tính, creator type (KOC, reviewer…), format (livestream, review…), audience, ER, brand từng làm → đưa vào unsupported.

Trả về đúng một object JSON:
{"categories":[],"regions":[],"tiers":[],"heroes":[],"platforms":[],"followersMin":null,"followersMax":null,${allowPrice ? '"rateMin":null,"rateMax":null,"rateSow":null,' : ""}"relStatus":[],"q":null,"understood":["mô tả ngắn từng ý đã hiểu"],"unsupported":["ý không lọc được"]}`;
}

export function validate(raw: unknown, cat: ReturnType<typeof catalogOf>, role: Role): SearchResult {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const unsupported = Array.isArray(o.unsupported) ? o.unsupported.map((x) => String(x).slice(0, 80)).filter(Boolean) : [];
  const understood = Array.isArray(o.understood) ? o.understood.map((x) => String(x).slice(0, 80)).filter(Boolean) : [];
  const take = (k: string, allowed: string[]) => {
    const r = pickAll(o[k], allowed);
    unsupported.push(...r.bad);
    return r.ok;
  };
  const patch: SearchResult["patch"] = {
    categories: take("categories", cat.categories),
    regions: take("regions", cat.regions),
    tiers: take("tiers", cat.tiers),
    heroes: take("heroes", cat.platforms),
    platforms: take("platforms", cat.platforms),
    relStatus: take("relStatus", cat.relStatus),
    followersMin: num(o.followersMin),
    followersMax: num(o.followersMax),
  };
  let priceSkipped = false;
  const hasPrice = num(o.rateMin) || num(o.rateMax);
  if (hasPrice && !can(role, "price")) priceSkipped = true;
  if (can(role, "price")) {
    patch.rateMin = num(o.rateMin);
    patch.rateMax = num(o.rateMax);
    const sow = String(o.rateSow ?? "");
    if (cat.sowKinds.includes(sow)) patch.rateSow = sow;
  }
  if (typeof o.q === "string" && o.q.trim()) patch.q = o.q.trim().slice(0, 80);
  return { patch, understood: understood.slice(0, 10), unsupported: [...new Set(unsupported)].slice(0, 10), priceSkipped };
}

export async function aiSearch(query: string, role: Role, creators: Compact[]): Promise<SearchResult & { cached: boolean; usage: Usage }> {
  const cat = catalogOf(creators);
  const key = JSON.stringify([normQuery(query), can(role, "price"), cat.categories, cat.regions]);
  const hit = CACHE.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL) return { ...hit.result, cached: true, usage: NO_USAGE };
  const r = await chat({
    messages: [
      { role: "system", content: systemPrompt(cat, can(role, "price")) },
      { role: "user", content: query },
    ],
    json: true,
    maxTokens: 600,
    temperature: 0,
    timeoutMs: 15_000,
  });
  let parsed: unknown = {};
  try {
    parsed = JSON.parse(r.content || "{}");
  } catch {
    parsed = {};
  }
  const result = validate(parsed, cat, role);
  if (CACHE.size > 500) CACHE.clear();
  CACHE.set(key, { at: Date.now(), result });
  return { ...result, cached: false, usage: r.usage };
}
