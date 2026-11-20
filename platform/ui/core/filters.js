// core/filters.js — MỘT nguồn sự thật cho bộ lọc Discovery (không đụng DOM, chạy được bằng node).
// AI search (ai/mock-ai.js → parseQuery) trả về một "patch" lên object filters này;
// drawer bộ lọc sửa chính object này; chip hiển thị từ nó; saved view lưu nó.
// → đường AI và đường thủ công luôn cho cùng một kết quả.
//
// Thêm 1 bộ lọc mới = thêm 1 phần tử vào FILTER_DEFS (và 1 key vào emptyFilters).
// Tương đương filteredBookingRows() + bkFilterFieldsExtra() của app.js hiện tại.

import { PLATFORMS, TIERS, TEAM, BRANDS, COMPANIES, REP_KIND, industryOf, competitorsOf } from "../data/catalog.js";

/** Công ty quản lý của creator (null nếu là Cá nhân). */
export const companyOf = (c) => (c.companyId ? COMPANIES[c.companyId] : null);

/** Bỏ dấu tiếng Việt + viết thường, giữ nguyên độ dài chuỗi (để map ngược về câu gốc). */
export function norm(s) {
  return [...String(s ?? "").normalize("NFC")].map((ch) => {
    const b = ch.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d");
    return b.length === 1 ? b : b[0] || " ";
  }).join("");
}

export const LAYERS = [
  { id: "persona", label: "Ngành hàng & Chân dung", hint: "Category & Persona Fit" },
  { id: "scale", label: "Quy mô & Nền tảng", hint: "Scale & Platform Fit" },
  { id: "commercial", label: "Thương mại", hint: "Commercial Fit", perm: "price" },
  { id: "relation", label: "Quan hệ & Brand", hint: "Relationship & Brand Fit" },
];

export const FAMILY = { has_kids: "Có con nhỏ", married: "Đã kết hôn", single: "Độc thân" };
export const REL_STATUS = {
  preferred: { label: "Preferred", tone: "success", desc: "Đối tác ưu tiên" },
  active: { label: "Đã hợp tác", tone: "primary", desc: "Relationship_Status trên Sheet: Đã hợp tác" },
  quoted: { label: "Đã báo giá", tone: "", desc: "Relationship_Status trên Sheet: Đã báo giá" },
  network: { label: "Chưa liên hệ", tone: "", desc: "Trong CSDL, chưa liên hệ" },
  watchlist: { label: "Watchlist", tone: "warning", desc: "Cần thận trọng khi booking" },
  dnr: { label: "Do-Not-Recommend", tone: "danger", desc: "Không đề xuất" },
};
export const VIA = { direct: "Trực tiếp", manager: "Qua manager", mcn: "Qua MCN" };
export const SOW_KINDS = { video: "video", photo: "bài đăng", live: "livestream", event: "sự kiện" };
export const CREATOR_TYPES = []; // bản thật: điền từ dữ liệu (setOptionsFromData)
export const CATEGORIES = [];
export const REGIONS = [];
/** Bản thật: danh sách lựa chọn của bộ lọc lấy từ chính dữ liệu (theo số creator, nhiều trước). */
export function setOptionsFromData(creators) {
  const top = (vals) => { const m = new Map(); vals.filter(Boolean).forEach((v) => m.set(v, (m.get(v) || 0) + 1)); return [...m.entries()].sort((a, b) => b[1] - a[1]).map((x) => x[0]); };
  CREATOR_TYPES.splice(0, CREATOR_TYPES.length, ...top(creators.map((c) => c.type)));
  CATEGORIES.splice(0, CATEGORIES.length, ...top(creators.flatMap((c) => c.categories)));
  REGIONS.splice(0, REGIONS.length, ...top(creators.map((c) => c.region)).slice(0, 30));
  // Bộ lọc chỉ hiện khi dữ liệu thật có thông tin đó (vd. cột Age / Year_Of_Birth trên Sheet đang trống → ẩn bộ lọc Tuổi).
  const needs = { age: (c) => c.age != null };
  Object.entries(needs).forEach(([key, has]) => {
    const i = FILTER_DEFS.findIndex((def) => def.key === key);
    const want = creators.some(has);
    if (i >= 0 && !want) FILTER_DEFS.splice(i, 1);
    if (i < 0 && want) { const def = ALL_FILTER_DEFS.find((x) => x.key === key); if (def) FILTER_DEFS.splice(ALL_FILTER_DEFS.indexOf(def), 0, def); }
  });
}
export const FORMATS = ["Video ngắn", "Video dài", "Reel", "Bài đăng ảnh", "Bài viết", "Livestream", "Review", "Vlog", "Sự kiện"];
export const AUDIENCE_TAGS = ["Mẹ bỉm", "Người nội trợ", "Gen Z", "Nữ 18-24", "Nữ 25-34", "Nam 18-34", "Dân văn phòng", "Học sinh – sinh viên"];
export const INDUSTRIES = [...new Set(Object.values(BRANDS).map((b) => b[0]))];
export const BRAND_NAMES = Object.keys(BRANDS);

export const sowKind = (sow) => (/live/i.test(sow) ? "live" : /sự kiện/i.test(sow) ? "event" : /ảnh|bài viết/i.test(sow) ? "photo" : "video");

/** Giá tham chiếu: kind rỗng = rate đầu tiên (benchmark của hero platform); có kind = rate thấp nhất đúng loại, ưu tiên hero platform. */
export function rateFor(c, kind = "") {
  if (!kind) return c.rates.find((r) => r.amount != null) || null;
  const list = c.rates.filter((r) => sowKind(r.sow) === kind);
  const priced = list.filter((r) => r.amount != null);
  return priced.find((r) => r.platform === c.hero) || priced.sort((a, b) => a.amount - b.amount)[0] || null;
}
export const heroCh = (c) => c.channels[c.hero];

/* ---------- Đa kênh: MỘT quy tắc chọn nguồn số cho thẻ kết quả, bộ lọc, sắp xếp và lý do của AI ----------
   - Đang lọc theo nền tảng → dùng số của nền tảng ĐẦU TIÊN được chọn (ưu tiên bộ lọc "Có kênh", rồi tới "Kênh chính"), nếu creator có kênh đó.
   - Không lọc (hoặc creator không có kênh đó) → dùng kênh chính (hero platform). */
export const focusPlatform = (f) => (f && f.platforms && f.platforms.length ? f.platforms[0] : f && f.heroes && f.heroes.length ? f.heroes[0] : "");
export const metricPlatform = (c, f) => { const p = focusPlatform(f); return p && c.channels[p] ? p : c.hero; };
export const metricCh = (c, f) => c.channels[metricPlatform(c, f)];
export const totalFollowers = (c) => Object.values(c.channels).reduce((s, ch) => s + (ch.followers.value || 0), 0);
/** Các kênh creator có, follower giảm dần. */
export const channelOrder = (c) => Object.keys(c.channels).sort((a, b) => num0(c.channels[b].followers.value) - num0(c.channels[a].followers.value));
/** " TikTok" khi đang lọc theo nền tảng (để câu lý do nói rõ số của kênh nào), rỗng khi dùng kênh chính. */
const srcTag = (c, f) => (focusPlatform(f) ? " " + PLATFORMS[metricPlatform(c, f)].label : "");

const short = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, "").replace(".", ",") + (n >= 1e9 ? " tỷ" : "tr") : Math.round(n / 1e3) + "k");
const shortN = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, "").replace(".", ",") + "M" : n >= 1e3 ? Math.round(n / 1e3) + "K" : String(n));
const dec = (n) => String(n).replace(".", ",");
const rangeLabel = (lo, hi, fmt, unit = "") => (lo && hi ? `${fmt(lo)}–${fmt(hi)}${unit}` : lo ? `≥ ${fmt(lo)}${unit}` : `≤ ${fmt(hi)}${unit}`);
const overlap = (a, b) => a.filter((x) => b.includes(x));
const conflictBrands = (c, brand) => overlap(c.brands, competitorsOf(brand));
const num0 = (v) => v || 0;

/* Bộ lọc "Có kênh": khoảng follower riêng của từng nền tảng */
const bound = (v) => (v === "" || v == null ? 0 : +v);
export const platRange = (f, p) => (f.platFollowers && f.platFollowers[p]) || {};
/** " ≥100K" · " ≤200K" · " 50K–200K" · "" (không đặt khoảng) */
export const platWant = (f, p) => { const r = platRange(f, p), lo = bound(r.min), hi = bound(r.max); return lo || hi ? " " + rangeLabel(lo, hi, shortN).replace(/^([≥≤]) /, "$1") : ""; };
const hasChannel = (c, f, p) => { const ch = c.channels[p]; if (!ch) return false; const r = platRange(f, p), v = ch.followers.value; return (!bound(r.min) || v >= bound(r.min)) && (!bound(r.max) || v <= bound(r.max)); };

export function emptyFilters() {
  return {
    q: "", types: [], categories: [], regions: [], gender: "", family: [], ageMin: "", ageMax: "", formats: [], audience: [],
    tiers: [], platforms: [], platFollowers: {}, heroes: [], followersMin: "", followersMax: "", erMin: "",
    rateSow: "", rateMin: "", rateMax: "",
    relStatus: [], worked: false, brands: [], industries: [], competitorOf: "", competitorMode: "exclude", scoreMin: "", via: "", owner: "",
    rep: "", company: "",
  };
}

/* type: multi (chip bật/tắt) · select · range (2 ô số) · number · bool · text · competitor
   test(c, f, ctx) → true/false · ok/miss(c, f, ctx) → câu giải thích "vì sao khớp / lệch" dùng cho AI recommendation. */
const multi = (key, layer, label, options, get, okText, missText, extra = {}) => ({
  key, layer, label, type: "multi", options,
  active: (f) => f[key].length > 0,
  clear: (f) => { f[key] = []; },
  test: (c, f) => overlap([].concat(get(c)), f[key]).length > 0,
  chips: (f) => f[key].map((v) => ({ value: v, label: (extra.chipLabel || extra.optionLabel || ((x) => x))(v) })),
  ok: (c, f) => okText(c, overlap([].concat(get(c)), f[key])),
  miss: (c, f) => missText(c, f[key]),
  ...extra,
});
const range = (key, layer, label, unit, get, fmt, okText, extra = {}) => ({
  key, layer, label, type: "range", unit, min: key + "Min", max: key + "Max",
  active: (f) => f[key + "Min"] !== "" || f[key + "Max"] !== "",
  clear: (f) => { f[key + "Min"] = ""; f[key + "Max"] = ""; },
  test: (c, f) => { const v = get(c, f); return v != null && (f[key + "Min"] === "" || v >= +f[key + "Min"]) && (f[key + "Max"] === "" || v <= +f[key + "Max"]); },
  chips: (f) => [{ label: `${label} ${rangeLabel(+f[key + "Min"], +f[key + "Max"], fmt)}` }],
  ok: okText, miss: okText, ...extra,
});

const ALL_FILTER_DEFS = [
  { key: "q", layer: "persona", label: "Tên / handle / công ty quản lý", type: "text", placeholder: "Tên, alias, @handle hoặc tên công ty",
    active: (f) => f.q.trim() !== "", clear: (f) => { f.q = ""; },
    test: (c, f) => norm(`${c.name} ${c.alias} ${c.handle} ${companyOf(c)?.name || ""} ${c.companyId}`).includes(norm(f.q.trim())),
    chips: (f) => [{ label: `Tên chứa “${f.q.trim()}”` }], ok: (c) => `Tên khớp: ${c.name}`, miss: () => "Tên không khớp" },
  multi("types", "persona", "Creator type", CREATOR_TYPES, (c) => c.type, (c) => c.type, (c) => `Creator type là ${c.type}`),
  multi("categories", "persona", "Ngành nội dung", CATEGORIES, (c) => c.categories, (c, hit) => `Ngành ${hit.join(", ")}`, (c) => `Ngành ${c.categories.join(", ")}`),
  multi("regions", "persona", "Khu vực", REGIONS, (c) => c.region, (c) => c.region, (c) => `Ở ${c.region}`),
  multi("family", "persona", "Gia đình", Object.keys(FAMILY), (c) => c.family,
    (c) => FAMILY[c.family] + (c.familyNote ? ` (${c.familyNote})` : ""), (c) => FAMILY[c.family], { optionLabel: (v) => FAMILY[v] }),
  { key: "gender", layer: "persona", label: "Giới tính", type: "select", options: ["Nữ", "Nam"],
    active: (f) => !!f.gender, clear: (f) => { f.gender = ""; }, test: (c, f) => c.gender === f.gender,
    chips: (f) => [{ label: `Giới tính: ${f.gender}` }], ok: (c) => c.gender, miss: (c) => `Giới tính ${c.gender}` },
  range("age", "persona", "Tuổi", "tuổi", (c) => c.age, (n) => n, (c) => `${c.age} tuổi`),
  multi("formats", "persona", "Format mạnh", FORMATS, (c) => c.formats, (c, hit) => `Format ${hit.join(", ")}`, () => "Không mạnh format yêu cầu"),
  multi("audience", "persona", "Audience", AUDIENCE_TAGS, (c) => c.audience.tags, (c, hit) => `Audience: ${hit.join(", ")}`, () => "Audience khác yêu cầu"),

  multi("tiers", "scale", "Overall tier", TIERS, (c) => c.tier, (c) => `Tier ${c.tier}`, (c) => `Tier ${c.tier}`),
  /* Nền tảng tách 2 bộ lọc:
     - "Có kênh" (platforms): creator CÓ kênh trên nền tảng đó; mỗi nền tảng đã chọn là MỘT tiêu chí riêng (chip riêng, lý do khớp / lệch riêng)
       và có khoảng follower riêng (platFollowers[p] = { min, max }) — đúng với "tier của từng nền tảng" trong brief. Chọn nhiều = phải có đủ.
     - "Kênh chính (Hero)" (heroes): chỉ khớp creator có kênh chính là nền tảng đó. */
  { key: "platforms", layer: "scale", label: "Có kênh trên nền tảng", type: "platforms", options: Object.keys(PLATFORMS), optionLabel: (v) => PLATFORMS[v].label,
    active: (f) => f.platforms.length > 0,
    clear: (f) => { f.platforms = []; f.platFollowers = {}; },
    remove: (f, p) => { f.platforms = f.platforms.filter((x) => x !== p); delete f.platFollowers[p]; },
    each: (f) => f.platforms,
    testOne: (c, f, p) => hasChannel(c, f, p),
    okOne: (c, f, p) => `Có ${PLATFORMS[p].label} ${shortN(c.channels[p].followers.value)}${platWant(f, p) ? ` (cần${platWant(f, p)})` : ""}`,
    missOne: (c, f, p) => (!c.channels[p] ? `Không có kênh ${PLATFORMS[p].label}` : `${PLATFORMS[p].label} ${shortN(c.channels[p].followers.value)}, ngoài khoảng${platWant(f, p)}`),
    test: (c, f) => f.platforms.every((p) => hasChannel(c, f, p)),
    chips: (f) => f.platforms.map((p) => ({ value: p, label: `Có ${PLATFORMS[p].label}${platWant(f, p)}` })),
    ok: (c, f) => f.platforms.map((p) => `Có ${PLATFORMS[p].label}`).join(", "), miss: (c, f) => `Thiếu kênh trong ${f.platforms.map((p) => PLATFORMS[p].label).join(", ")}` },
  multi("heroes", "scale", "Kênh chính (Hero)", Object.keys(PLATFORMS), (c) => c.hero,
    (c) => `Kênh chính là ${PLATFORMS[c.hero].label}`, (c) => `Kênh chính là ${PLATFORMS[c.hero].label}`,
    { optionLabel: (v) => PLATFORMS[v].label, chipLabel: (v) => `Kênh chính: ${PLATFORMS[v].label}` }),
  range("followers", "scale", "Follower", "", (c, f) => metricCh(c, f).followers.value, shortN, (c, f) => `${shortN(metricCh(c, f).followers.value)} follower${srcTag(c, f)}`,
    { hint: "Tính trên nền tảng đang lọc; không lọc nền tảng thì tính trên kênh chính. Ví dụ 50000" }),
  { key: "erMin", layer: "scale", label: "Engagement tối thiểu (%)", type: "number", placeholder: "VD: 5",
    active: (f) => f.erMin !== "", clear: (f) => { f.erMin = ""; }, test: (c, f) => metricCh(c, f).er.value >= +f.erMin,
    chips: (f) => [{ label: `ER ≥ ${dec(f.erMin)}%` }], ok: (c, f) => `ER${srcTag(c, f)} ${dec(metricCh(c, f).er.value)}%`, miss: (c, f) => `ER${srcTag(c, f)} chỉ ${dec(metricCh(c, f).er.value)}%` },

  { key: "rate", layer: "commercial", label: "Giá tham chiếu (₫)", type: "range", perm: "price", min: "rateMin", max: "rateMax", sowKey: "rateSow",
    hint: "Ví dụ 30000000. Chọn loại SOW để so đúng loại giá.",
    active: (f) => f.rateMin !== "" || f.rateMax !== "",
    clear: (f) => { f.rateMin = ""; f.rateMax = ""; f.rateSow = ""; },
    test: (c, f) => { const r = rateFor(c, f.rateSow); return !!r && (f.rateMin === "" || r.amount >= +f.rateMin) && (f.rateMax === "" || r.amount <= +f.rateMax); },
    chips: (f) => [{ label: `Giá ${rangeLabel(+f.rateMin, +f.rateMax, short)}${f.rateSow ? " / " + SOW_KINDS[f.rateSow] : ""}` }],
    ok: (c, f) => { const r = rateFor(c, f.rateSow); return `Giá ${r.sow.toLowerCase()} ${short(r.amount)}${f.rateMax !== "" ? " ≤ " + short(+f.rateMax) : ""}`; },
    miss: (c, f) => { const r = rateFor(c, f.rateSow); if (!r) return "Chưa có giá cho loại SOW này";
      return f.rateMax !== "" && r.amount > +f.rateMax ? `Giá ${short(r.amount)}, vượt ngân sách ${short(r.amount - f.rateMax)}` : `Giá ${short(r.amount)} thấp hơn khoảng yêu cầu`; } },

  multi("relStatus", "relation", "Trạng thái quan hệ", Object.keys(REL_STATUS), (c) => c.rel.status,
    (c) => REL_STATUS[c.rel.status].label, (c) => `Trạng thái: ${REL_STATUS[c.rel.status].label}`, { optionLabel: (v) => REL_STATUS[v].label }),
  { key: "worked", layer: "relation", label: "Đã từng hợp tác qua Markus", type: "bool",
    active: (f) => !!f.worked, clear: (f) => { f.worked = false; }, test: (c, f, ctx) => ctx.bookingCount(c.id) > 0,
    chips: () => [{ label: "Đã hợp tác với Markus" }], ok: (c, f, ctx) => `Đã hợp tác với Markus ${ctx.bookingCount(c.id)} lần`, miss: () => "Chưa hợp tác với Markus" },
  multi("brands", "relation", "Từng làm cho brand", BRAND_NAMES, (c) => c.brands, (c, hit) => `Đã làm với ${hit.join(", ")}`, (c, want) => `Chưa làm với ${want.join(", ")}`, { searchable: true }),
  multi("industries", "relation", "Từng làm ngành hàng", INDUSTRIES, (c) => [...new Set(c.brands.map(industryOf))],
    (c, hit) => hit.map((ind) => `Từng làm ${ind}: ${c.brands.filter((b) => industryOf(b) === ind).join(", ")}`).join(" · "), (c, want) => `Chưa làm ngành ${want.join(", ")}`),
  { key: "competitorOf", layer: "relation", label: "Đối thủ của brand", type: "competitor", options: BRAND_NAMES.filter((b) => competitorsOf(b).length),
    active: (f) => !!f.competitorOf, clear: (f) => { f.competitorOf = ""; f.competitorMode = "exclude"; },
    test: (c, f) => (conflictBrands(c, f.competitorOf).length > 0) === (f.competitorMode === "only"),
    chips: (f) => [{ label: f.competitorMode === "only" ? `Từng làm đối thủ của ${f.competitorOf}` : `Tránh đối thủ của ${f.competitorOf}` }],
    ok: (c, f) => (f.competitorMode === "only" ? `Từng làm đối thủ của ${f.competitorOf}: ${conflictBrands(c, f.competitorOf).join(", ")}` : `Chưa làm đối thủ của ${f.competitorOf}`),
    miss: (c, f) => (f.competitorMode === "only" ? `Chưa làm đối thủ của ${f.competitorOf}` : `Đã làm đối thủ: ${conflictBrands(c, f.competitorOf).join(", ")}`) },
  { key: "scoreMin", layer: "relation", label: "Working score tối thiểu", type: "select", options: ["3.5", "4", "4.5"], optionLabel: (v) => `≥ ${dec(v)} / 5`,
    active: (f) => f.scoreMin !== "", clear: (f) => { f.scoreMin = ""; }, test: (c, f) => (c.rel.score || 0) >= +f.scoreMin,
    chips: (f) => [{ label: `Working score ≥ ${dec(f.scoreMin)}` }], ok: (c) => `Working score ${dec(c.rel.score)}/5`,
    miss: (c) => (c.rel.score ? `Working score ${dec(c.rel.score)}/5` : "Chưa có working score") },
  { key: "rep", layer: "relation", label: "Đại diện", type: "select", options: Object.keys(REP_KIND), optionLabel: (v) => REP_KIND[v],
    active: (f) => !!f.rep, clear: (f) => { f.rep = ""; }, test: (c, f) => c.rep === f.rep,
    chips: (f) => [{ label: REP_KIND[f.rep] }], ok: (c) => (c.rep === "company" ? `Công ty: ${companyOf(c).name}` : "Cá nhân, tự quản lý"), miss: (c) => REP_KIND[c.rep] },
  { key: "company", layer: "relation", label: "Công ty quản lý", type: "select", options: Object.keys(COMPANIES), optionLabel: (v) => `${COMPANIES[v].name} · ${v}`,
    active: (f) => !!f.company, clear: (f) => { f.company = ""; }, test: (c, f) => c.companyId === f.company,
    chips: (f) => [{ label: `Công ty: ${COMPANIES[f.company].name}` }], ok: (c) => `Thuộc ${companyOf(c).name}`, miss: (c) => (companyOf(c) ? `Thuộc ${companyOf(c).name}` : "Cá nhân, không thuộc công ty") },
  { key: "via", layer: "relation", label: "Kênh làm việc", type: "select", options: Object.keys(VIA), optionLabel: (v) => VIA[v],
    active: (f) => !!f.via, clear: (f) => { f.via = ""; }, test: (c, f) => c.rel.via === f.via,
    chips: (f) => [{ label: VIA[f.via] }], ok: (c) => VIA[c.rel.via], miss: (c) => VIA[c.rel.via] },
  { key: "owner", layer: "relation", label: "Người phụ trách", type: "select", options: TEAM,
    active: (f) => !!f.owner, clear: (f) => { f.owner = ""; }, test: (c, f) => c.rel.owner === f.owner,
    chips: (f) => [{ label: `Phụ trách: ${f.owner}` }], ok: (c) => `Phụ trách: ${c.rel.owner}`, miss: (c) => `Phụ trách: ${c.rel.owner}` },
];

// Bản thật: bỏ các bộ lọc chưa có dữ liệu nguồn (Sheet không có các cột này). Bật lại khi có dữ liệu.
const NO_DATA_YET = new Set(["types", "family", "gender", "formats", "audience", "erMin", "brands", "industries", "competitorOf", "scoreMin", "company", "via"]);
export const FILTER_DEFS = ALL_FILTER_DEFS.filter((d) => !NO_DATA_YET.has(d.key));

const usable = (def, f, ctx) => def.active(f) && (!def.perm || ctx.can(def.perm));

/** Chấm 1 creator theo bộ lọc → { pass: [{key, text}], fail: [{key, text}] }. */
export function evaluate(c, f, ctx) {
  const pass = [], fail = [];
  FILTER_DEFS.forEach((def) => {
    if (!usable(def, f, ctx)) return;
    if (def.each) { // một bộ lọc sinh nhiều tiêu chí (mỗi nền tảng "Có kênh" là 1 tiêu chí)
      def.each(f).forEach((v) => { const ok = def.testOne(c, f, v); (ok ? pass : fail).push({ key: def.key, value: v, text: ok ? def.okOne(c, f, v) : def.missOne(c, f, v) }); });
      return;
    }
    if (def.test(c, f, ctx)) pass.push({ key: def.key, text: def.ok(c, f, ctx) });
    else fail.push({ key: def.key, text: def.miss(c, f, ctx) });
  });
  return { pass, fail };
}
export const applyFilters = (list, f, ctx) => list.filter((c) => evaluate(c, f, ctx).fail.length === 0);
export const activeCount = (f, ctx, layer) => FILTER_DEFS.filter((d) => (!layer || d.layer === layer) && usable(d, f, ctx)).reduce((n, d) => n + d.chips(f).length, 0);

/** Chip đang bật: [{ key, value?, label, layer }] */
export function chipsOf(f, ctx) {
  return FILTER_DEFS.filter((d) => usable(d, f, ctx)).flatMap((d) => d.chips(f).map((ch) => ({ key: d.key, layer: d.layer, ...ch })));
}
/** Gỡ 1 chip — trả về bản sao filters mới. */
export function removeChip(f, key, value) {
  const next = structuredClone(f);
  const def = FILTER_DEFS.find((d) => d.key === key);
  if (def.remove && value != null) def.remove(next, value);
  else if (def.type === "multi" && value != null) next[key] = next[key].filter((v) => v !== value);
  else def.clear(next);
  return next;
}
