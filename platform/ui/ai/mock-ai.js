// ai/mock-ai.js — "AI" GIẢ LẬP, thuần hàm, KHÔNG đụng DOM, KHÔNG gọi mạng (test được bằng node).
// Mỗi hàm ở đây tương ứng 1 tool / endpoint cần có khi nối AI thật (DeepSeek qua ai-chat.php):
//   parseQuery       → tool mới "parse_brief": câu tự nhiên → patch bộ lọc (thay cho search_kol 5 tham số)
//   recommend        → xếp hạng + lý do (chạy phía client trên dữ liệu đã lọc; LLM chỉ viết câu giải thích)
//   lookalike        → tool "find_similar"
//   summarize        → tool "summarize_creator"
//   draftOutreach    → tool "draft_message" (chỉ soạn, KHÔNG gửi)
//   extractCreator   → ai-parse.php / ai-fetch.php hiện có (đọc link / văn bản → trường form)
//   findDuplicates   → kiểm tra trùng trước khi lưu (nên chạy cả ở server)
// Nguyên tắc: AI chỉ ĐỀ XUẤT. Mọi kết quả đều đi qua bước người dùng xem lại ở UI.

import { PLATFORMS, BRANDS, COMPANIES, industryOf, competitorsOf, tierOf } from "../data/catalog.js";
import { norm, evaluate, rateFor, heroCh, metricCh, metricPlatform, focusPlatform, sowKind, FAMILY, REL_STATUS, VIA, emptyFilters, FILTER_DEFS, CATEGORIES } from "../core/filters.js";

const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const dec = (n) => String(n).replace(".", ",");
const fmtN = (n) => (n >= 1e6 ? dec((n / 1e6).toFixed(1).replace(/\.0$/, "")) + "M" : n >= 1e3 ? Math.round(n / 1e3) + "K" : String(n));
const fmtM = (n) => (n >= 1e6 ? dec((n / 1e6).toFixed(1).replace(/\.0$/, "")) + "tr" : Math.round(n / 1e3) + "k");
const NOW = new Date("2026-11-19T09:00:00+07:00"); // trùng với core/ui.js
const push = (arr, v) => { if (!arr.includes(v)) arr.push(v); };

/* =====================================================================
   1. parseQuery — câu tiếng Việt → patch bộ lọc (luật từ khoá, tất định)
   ===================================================================== */
const BRAND_BY_NORM = Object.fromEntries(Object.keys(BRANDS).map((b) => [norm(b), b]));
const BRAND_RE = "(?<![a-z0-9])(?:" + Object.keys(BRAND_BY_NORM).sort((a, b) => b.length - a.length).map(escRe).join("|") + ")(?![a-z0-9])";
const NUM = "(\\d+(?:[.,]\\d+)?)";
const toNum = (s) => parseFloat(String(s).replace(",", "."));
const money = (n, unit) => toNum(n) * (/^ty/.test(unit) ? 1e9 : /^k/.test(unit) ? 1e3 : 1e6);
const people = (n, unit) => toNum(n) * (/^(m|tr)/.test(unit || "") ? 1e6 : /^(k|ng)/.test(unit || "") ? 1e3 : 1);
const sowOf = (w) => (!w ? "" : /^live/.test(w) ? "live" : /^(bai|post|anh)/.test(w) ? "photo" : "video");
const LESS = "duoi|toi da|khong qua|<=|<|max|it hon";
const MORE = "tren|tu|hon|>=|>|toi thieu|it nhat";

// Nền tảng: "mạnh / hero / kênh chính X" → bộ lọc Kênh chính; "có / làm / trên X", "X trên 100K" hoặc chỉ nhắc tên → bộ lọc Có kênh.
const PLAT_RE = "(tik ?tok|facebook|\\bfb\\b|instagram|insta|\\big\\b|youtube|\\byt\\b|threads)";
const HERO_WORDS = "manh(?: ve| tren)?|hero|kenh chinh(?: la)?|chu yeu(?: tren)?";
const platKey = (s) => (/tik/.test(s) ? "tiktok" : /facebook|fb/.test(s) ? "facebook" : /insta|ig/.test(s) ? "instagram" : /youtube|yt/.test(s) ? "youtube" : "threads");
const hasPlat = (p, key) => { push(p.platforms, key); };

const map = (key, table) => (m, p, say) => { const hit = table.find(([re]) => re.test(m[0])); if (hit) { push(p[key], hit[1]); say(hit[2] || hit[1]); } };

/* Ngành nội dung THẬT trên Sheet (Primary/Secondary_Category). Từ khoá tiếng Việt / tiếng Anh → tên ngành đúng như trên Sheet.
   Đặt cụ thể trước chung chung. Ngành không có trong dữ liệu hiện tại → báo "chưa lọc được" thay vì lọc ra 0 kết quả. */
const TOPICS = [
  [/review (?:do an|an uong|quan an|mon an)|food ?review|foodie|food blogger|am thuc|an uong|do an|mon an|quan an|f&b|\bfnb\b|an vat|cafe|ca phe/, "F&B Review"],
  [/me (?:&|va) be|me be|me bim(?: sua)?|bim sua|mommy|hot mom|lam me|nuoi con|parenting|daddy|ong bo|bo bim|tre em|em be/, "Mom & Baby / Parenting"],
  [/beauty(?: blogger)?|lam dep|skincare|skin care|cham soc da|my pham|makeup|trang diem/, "Beauty"],
  [/lifestyle(?: vlog)?|\bvlog\w*|doi song/, "Lifestyle Vlog"],
  [/ca si|nghe si|am nhac|music|\bhat\b|nhac si|rapper|\bdj\b|bieu dien|performance|dancer|nhay|vu cong/, "Music & Performance"],
  [/fitness|\bgym\b|the hinh|the thao|suc khoe|health|yoga|chay bo|dinh duong|giam can|bac si|duoc si/, "Health & Fitness"],
  [/\boto\b|o to|xe hoi|\bauto\b|xe may|moto|motor/, "Auto & Moto"],
  [/nha cua|gia dung|noi that|home|living|decor|dien may/, "Home & Living"],
  [/tai chinh|finance|dau tu|chung khoan|crypto|kinh doanh|business|ngan hang/, "Finance & Business"],
  [/cong nghe|\btech\b|gadget|dien thoai|laptop|unbox\w*/, "Tech & Gadget"],
  [/du lich|travel(?: blogger)?|phuot|khach san|resort/, "Travel"],
  [/thoi trang|fashion|outfit|phoi do/, "Fashion & Style"],
  [/hai huoc|comedy|giai tri|entertainment|dien vien/, "Comedy & Entertainment"],
  [/giao duc|education|hoc tap|tieng anh|day hoc|giao vien/, "Education & Learning"],
];
const TOPIC_RE = new RegExp(TOPICS.map(([re]) => re.source).join("|"), "g");
const topicRule = (m, p, say) => { const hit = TOPICS.find(([re]) => re.test(m[0])); if (!hit) return; push(p.categories, hit[1]); say(`Ngành ${hit[1]}`); };

// Mỗi luật: [regex trên chuỗi đã bỏ dấu, hàm áp vào patch]. Thứ tự quan trọng: cụ thể trước, chung chung sau.
const RULES = [
  // --- Brand & đối thủ ---
  [new RegExp(`(?:khong|chua|tranh|ngoai tru|loai)\\s+(?:tung\\s+)?(?:lam\\s+)?(?:voi\\s+|cho\\s+)?(?:brand\\s+)?doi thu\\s+(?:cua\\s+)?(${BRAND_RE})`, "g"),
    (m, p, say) => { p.competitorOf = BRAND_BY_NORM[m[1]]; p.competitorMode = "exclude"; say(`Tránh đối thủ của ${p.competitorOf}`); }],
  [new RegExp(`(?:tung lam|da lam|lam)?\\s*(?:voi\\s+|cho\\s+)?doi thu\\s+(?:cua\\s+)?(${BRAND_RE})`, "g"),
    (m, p, say) => { p.competitorOf = BRAND_BY_NORM[m[1]]; p.competitorMode = "only"; say(`Từng làm đối thủ của ${p.competitorOf}`); }],
  [new RegExp(`(?:cho|campaign|chien dich|brief)\\s+(?:cua\\s+)?(?:brand\\s+|nhan hang\\s+)?(${BRAND_RE})`, "g"),
    (m, p, say) => { p.competitorOf = BRAND_BY_NORM[m[1]]; p.competitorMode = "exclude"; say(`Campaign ${p.competitorOf} → tránh đối thủ`); }],
  [new RegExp(`(?:(?:tung|da)\\s+(?:lam|hop tac)\\s+(?:voi\\s+|cho\\s+)?)?(${BRAND_RE})`, "g"),
    (m, p, say) => { push(p.brands, BRAND_BY_NORM[m[1]]); say(`Từng làm ${BRAND_BY_NORM[m[1]]}`); }],
  // --- Ngành hàng từng làm ---
  [/(?:(?:tung|da)\s+lam\s+)?(?:nganh\s+)?(?:hang\s+)?(fmcg|tieu dung nhanh|hang tieu dung|tieu dung)/g, (m, p, say) => { push(p.industries, "FMCG"); say("Từng làm ngành FMCG"); }],
  [/(?:tung|da)\s+lam\s+(?:nganh\s+)?(?:hang\s+)?(my pham|beauty|cong nghe|tech|f&b|do an|thoi trang|tmdt|thuong mai dien tu|tai chinh|ngan hang|gia dung|du lich|giao duc)/g,
    (m, p, say) => { const ind = [[/my pham|beauty/, "Beauty"], [/cong nghe|tech/, "Công nghệ"], [/f&b|do an/, "F&B"], [/thoi trang/, "Thời trang"], [/tmdt|thuong mai/, "TMĐT"], [/tai chinh|ngan hang/, "Tài chính"], [/gia dung/, "Gia dụng"], [/du lich/, "Du lịch"], [/giao duc/, "Giáo dục"]].find(([re]) => re.test(m[1]))[1]; push(p.industries, ind); say(`Từng làm ngành ${ind}`); }],
  // --- Nền tảng kèm ngưỡng follower: "TikTok trên 100K" → Có TikTok ≥100K · "mạnh TikTok trên 100K" → Kênh chính TikTok + Follower ≥100K ---
  [new RegExp(`(?:\\b(${HERO_WORDS})\\s+|\\b(?:co(?: kenh)?|lam|dang lam|tren)\\s+)?${PLAT_RE}\\s*(?:co\\s+)?(${LESS}|${MORE})\\s*${NUM}\\s*(k|m|nghin|ngan)(?![a-z0-9/])(?:\\s*(?:follower\\w*|fl|folo|sub\\w*|nguoi theo doi))?`, "g"),
    (m, p, say) => {
      const key = platKey(m[2]), v = people(m[4], m[5]), less = new RegExp(`^(${LESS})$`).test(m[3]), L = PLATFORMS[key].label;
      if (m[1]) { push(p.heroes, key); p[less ? "followersMax" : "followersMin"] = v; say(`Kênh chính: ${L}`); say(`Follower ${less ? "≤" : "≥"} ${fmtN(v)}`); return; }
      hasPlat(p, key); p.platFollowers[key] = { min: "", max: "", ...(p.platFollowers[key] || {}), [less ? "max" : "min"]: v }; say(`Có ${L} ${less ? "≤" : "≥"}${fmtN(v)}`);
    }],
  // --- Follower ---
  [new RegExp(`${NUM}\\s*(k|m)?\\s*(?:-|den|toi)\\s*${NUM}\\s*(k|m|nghin|ngan|trieu)\\s*(?:follower\\w*|fl|folo|sub\\w*|nguoi theo doi)`, "g"),
    (m, p, say) => { p.followersMin = people(m[1], m[2] || m[4]); p.followersMax = people(m[3], m[4]); say(`Follower ${fmtN(p.followersMin)}–${fmtN(p.followersMax)}`); }],
  [new RegExp(`(${LESS}|${MORE})\\s*${NUM}\\s*(k|m|nghin|ngan|trieu)?\\s*(?:follower\\w*|fl|folo|sub\\w*|nguoi theo doi)`, "g"),
    (m, p, say) => { const v = people(m[2], m[3]); const less = new RegExp(`^(${LESS})$`).test(m[1]); p[less ? "followersMax" : "followersMin"] = v; say(`Follower ${less ? "≤" : "≥"} ${fmtN(v)}`); }],
  // --- Ngân sách (đơn vị tr / triệu / tỷ, hoặc "k/video") ---
  [new RegExp(`${NUM}\\s*(?:-|den|toi)\\s*${NUM}\\s*(tr|trieu|ty)\\w*(?:\\s*(?:\\/|moi|1|mot)?\\s*(video|clip|bai|post|anh|live)\\w*)?`, "g"),
    (m, p, say) => { p.rateMin = money(m[1], m[3]); p.rateMax = money(m[2], m[3]); p.rateSow = sowOf(m[4]); say(`Giá ${fmtM(p.rateMin)}–${fmtM(p.rateMax)}`); }, "price"],
  [new RegExp(`(?:ngan sach|budget|gia|chi phi)?\\s*(${LESS}|${MORE})?\\s*${NUM}\\s*(tr|trieu|ty)\\w*(?:\\s*(?:\\/|moi|1|mot)?\\s*(video|clip|bai|post|anh|live)\\w*)?`, "g"),
    (m, p, say) => { const v = money(m[2], m[3]); const more = m[1] && new RegExp(`^(${MORE})$`).test(m[1]); p[more ? "rateMin" : "rateMax"] = v; p.rateSow = sowOf(m[4]) || p.rateSow; say(`Giá ${more ? "≥" : "≤"} ${fmtM(v)}${p.rateSow ? " / " + p.rateSow : ""}`); }, "price"],
  // --- Engagement ---
  [new RegExp(`(?:er|engagement|tuong tac)\\s*(?:${MORE})?\\s*${NUM}\\s*%`, "g"), (m, p, say) => { p.erMin = toNum(m[1]); say(`ER ≥ ${dec(p.erMin)}%`); }],
  [/(?:er|engagement|tuong tac)\s+(?:cao|tot)/g, (m, p, say) => { p.erMin = 5; say("ER ≥ 5% (tương tác cao)"); }],
  // --- Tuổi ---
  [/(\d{2})\s*(?:-|den)\s*(\d{2})\s*tuoi/g, (m, p, say) => { p.ageMin = +m[1]; p.ageMax = +m[2]; say(`Tuổi ${m[1]}–${m[2]}`); }],
  [/(duoi|tren)\s*(\d{2})\s*tuoi/g, (m, p, say) => { p[m[1] === "duoi" ? "ageMax" : "ageMin"] = +m[2]; say(`Tuổi ${m[1] === "duoi" ? "≤" : "≥"} ${m[2]}`); }],
  // --- Audience (đặt trước giới tính / type để "audience mẹ bỉm" không bị hiểu là creator type) ---
  [/(?:audience|khan gia|nguoi xem|tep)\s+(?:la\s+)?(me bim|gen z|van phong|noi tro|sinh vien)/g,
    map("audience", [[/me bim/, "Mẹ bỉm"], [/gen z/, "Gen Z"], [/van phong/, "Dân văn phòng"], [/noi tro/, "Người nội trợ"], [/sinh vien/, "Học sinh – sinh viên"]])],
  // --- Quan hệ ---
  [/working score\s*(?:tren|tu|>=|>)?\s*(\d(?:[.,]\d)?)/g, (m, p, say) => { const v = toNum(m[1]); p.scoreMin = v >= 4.5 ? "4.5" : v >= 4 ? "4" : "3.5"; say(`Working score ≥ ${dec(p.scoreMin)}`); }],
  [/(?:lam viec|hop tac)\s+(?:tot|de|on)|de lam viec|uy tin/g, (m, p, say) => { p.scoreMin = "4"; say("Working score ≥ 4"); }],
  // Sheet chưa có nhãn Preferred: đặt vào khoá không lọc được (_noData) để parseQuery báo "chưa lọc được".
  [/preferred|doi tac uu tien|uu tien|than thiet/g, (m, p, say) => { p._noData = true; say("Preferred partner"); }],
  // Relationship_Status trên Sheet: Đã hợp tác / Đã báo giá / Chưa liên hệ.
  [/da bao gia/g, (m, p, say) => { push(p.relStatus, "quoted"); say("Quan hệ: Đã báo giá"); }],
  [/chua (?:lien he|lam viec|hop tac)/g, (m, p, say) => { push(p.relStatus, "network"); say("Quan hệ: Chưa liên hệ"); }],
  [/(?:da|tung)\s+(?:lam|hop tac|book\w*)\s+(?:viec\s+)?(?:voi\s+|qua\s+)?(?:markus|agency|ben minh|team)|da hop tac/g, (m, p, say) => { push(p.relStatus, "active"); say("Quan hệ: Đã hợp tác"); }],
  [/truc tiep|khong qua (?:manager|mcn|quan ly)/g, (m, p, say) => { p.via = "direct"; say("Liên hệ trực tiếp"); }],
  [/(?:qua|thuoc)\s+mcn/g, (m, p, say) => { p.via = "mcn"; say("Qua MCN"); }],
  [/qua\s+(?:manager|quan ly)/g, (m, p, say) => { p.via = "manager"; say("Qua manager"); }],
  // --- Ngành nội dung thật (trước Creator type: "mommy", "ca sĩ", "food blogger" là ngành trên Sheet) ---
  [TOPIC_RE, topicRule],
  // --- Creator type ---
  [/mommy|hot mom|me bim(?: sua)?|bim sua|daddy|ong bo|bo bim|beauty blogger|food blogger|foodie|food reviewer|travel blogger|reviewer|streamer|gamer|celebrity|celeb|dien vien|ca si|nghe si|\bkoc\b|chuyen gia|bac si|duoc si|expert/g,
    map("types", [[/mommy|hot mom|me bim|bim sua/, "Mommy"], [/daddy|ong bo|bo bim/, "Daddy"], [/beauty blogger/, "Beauty Blogger"], [/food|foodie/, "Food Blogger"], [/travel/, "Travel"], [/reviewer/, "Reviewer"], [/streamer|gamer/, "Streamer"], [/celeb|dien vien|ca si|nghe si/, "Celebrity"], [/koc/, "KOC"], [/chuyen gia|bac si|duoc si|expert/, "Chuyên gia"]])],
  // --- Tier ---
  [/\b(nano|micro|mid(?:[- ]?tier)?|macro|mega|celeb tier)\b/g, map("tiers", [[/nano/, "Nano"], [/micro/, "Micro"], [/mid/, "Mid-Tier"], [/macro/, "Macro"], [/mega|celeb/, "Celeb"]])],
  // --- Đại diện: Cá nhân / Có công ty quản lý / tên công ty cụ thể ---
  [/\b(?:ca nhan|tu quan ly|self[- ]managed)\b/g, (m, p, say) => { p.rep = "self"; say("Cá nhân (tự quản lý)"); }],
  [/co cong ty quan ly|thuoc cong ty|qua agency|co agency/g, (m, p, say) => { p.rep = "company"; say("Có công ty quản lý"); }],
  ...(Object.keys(COMPANIES).length ? [[new RegExp(Object.values(COMPANIES).map((co) => norm(co.name)).join("|"), "g"), (m, p, say) => { const co = Object.values(COMPANIES).find((x) => norm(x.name) === m[0]); p.company = co.id; say(`Công ty: ${co.name}`); }]] : []),
  // --- Khu vực ---
  [/ha noi|\bhn\b|tp\.?\s?hcm|\bhcm\b|sai gon|ho chi minh|\bsg\b|da nang|can tho|hai phong/g,
    map("regions", [[/ha noi|hn/, "Hà Nội"], [/hcm|sai gon|ho chi minh|sg/, "TP.HCM"], [/da nang/, "Đà Nẵng"], [/can tho/, "Cần Thơ"], [/hai phong/, "Hải Phòng"]])],
  // --- Gia đình ---
  [/co con(?: nho)?|co em be|dang nuoi con|doc than|da ket hon|co gia dinh/g, map("family", [[/con|em be/, "has_kids", "Có con nhỏ"], [/doc than/, "single", "Độc thân"], [/ket hon|gia dinh/, "married", "Đã kết hôn"]])],
  [/gen z/g, (m, p, say) => { p.ageMax = 29; say("Gen Z (≤ 29 tuổi)"); }],
  // --- Kênh chính (Hero): "mạnh TikTok", "hero TikTok", "kênh chính là YouTube" ---
  [new RegExp(`\\b(?:${HERO_WORDS})\\s+${PLAT_RE}`, "g"), (m, p, say) => { const key = platKey(m[1]); push(p.heroes, key); say(`Kênh chính: ${PLATFORMS[key].label}`); }],
  // --- Có kênh (mặc định khi chỉ nhắc tên nền tảng): "có TikTok", "làm Facebook", "Instagram" ---
  [new RegExp(`(?:\\b(?:co(?: kenh)?|lam|dang lam|tren)\\s+)?${PLAT_RE}`, "g"), (m, p, say) => { const key = platKey(m[1]); hasPlat(p, key); say(`Có ${PLATFORMS[key].label}`); }],
  // --- Giới tính (chỉ nhận khi có từ đi kèm, tránh nhầm "năm", "Việt Nam") ---
  [/(?<=(?:creator|kol|koc|gioi tinh|ban)\s)(nu|nam)\b|\b(nu|nam) gioi\b/g, (m, p, say) => { p.gender = (m[1] || m[2]) === "nu" ? "Nữ" : "Nam"; say(`Giới tính ${p.gender}`); }],
  // --- Format ---
  [/livestream|\blive\b|review|vlog|video ngan|video dai/g, map("formats", [[/live/, "Livestream"], [/review/, "Review"], [/vlog/, "Vlog"], [/video ngan/, "Video ngắn"], [/video dai/, "Video dài"]])],
];

const STOP = new Set("de xuat goi y tim kiem cac nhung cho toi minh creator creators kol tai o nhom nganh hang va hoac co la voi theo khoang can giup mot vai danh sach phu hop tu den thuoc nen tang kenh tier video clip moi nhe a ah nhe giup em anh chi ban loc ra xem hien thi ngan sach budget gia tung da lam viec".split(" "));

/**
 * @returns {{ patch: object, understood: string[], leftover: string[], priceSkipped: boolean }}
 *  patch     — bộ lọc đầy đủ (bắt đầu từ emptyFilters) để UI hiển thị thành chip sửa được
 *  understood — danh sách điều AI đã hiểu (đúng thứ tự xuất hiện trong luật)
 *  leftover  — những từ AI KHÔNG hiểu, UI phải hiện ra để người dùng biết
 */
// Khoá bộ lọc đang dùng được (bản thật đã bỏ bộ lọc chưa có dữ liệu — NO_DATA_YET trong core/filters.js).
// Tính lại mỗi lần đọc câu: danh sách bộ lọc có thể đổi theo dữ liệu (setOptionsFromData).
const liveKeys = () => new Set(FILTER_DEFS.flatMap((def) => [def.key, def.min, def.max, def.sowKey, def.key === "platforms" ? "platFollowers" : null].filter(Boolean)));
export function parseQuery(text, { allowPrice = true } = {}) {
  const LIVE_KEYS = liveKeys();
  const src = String(text || "").normalize("NFC");
  const n = norm(src);
  const mask = new Array(n.length).fill(false);
  const patch = emptyFilters();
  const understood = [];
  let priceSkipped = false;

  const unsupported = [];
  RULES.forEach(([re, apply, kind]) => {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(n))) {
      if (!m[0].trim()) { re.lastIndex++; continue; }
      const start = m.index, end = start + m[0].length;
      if (mask.slice(start, end).some(Boolean)) continue; // đã có luật khác nhận đoạn này
      mask.fill(true, start, end);
      if (kind === "price" && !allowPrice) { priceSkipped = true; continue; }
      // Tiêu chí rơi vào bộ lọc chưa có dữ liệu (ẩn ở bản thật) hoặc ngành không có trong dữ liệu → không lọc, báo riêng.
      const before = structuredClone(patch);
      const labels = [];
      apply(m, patch, (label) => labels.push(label));
      const changed = Object.keys(patch).filter((k) => JSON.stringify(patch[k]) !== JSON.stringify(before[k]));
      const dead = changed.filter((k) => !LIVE_KEYS.has(k) || (k === "categories" && CATEGORIES.length > 0 && patch.categories.some((c) => !CATEGORIES.includes(c))));
      if (dead.length && dead.length === changed.length) { dead.forEach((k) => { patch[k] = before[k]; }); unsupported.push(...labels); }
      else understood.push(...labels);
    }
  });

  // Phần còn lại: lấy từ gốc (có dấu) của những đoạn không luật nào nhận.
  const leftover = [];
  let buf = "";
  for (let i = 0; i <= n.length; i++) {
    if (i < n.length && !mask[i] && /[a-z0-9&]/.test(n[i])) { buf += src[i]; continue; }
    if (buf && !STOP.has(norm(buf)) && buf.length > 1) leftover.push(buf);
    buf = "";
  }
  // Không hiểu gì → coi cả câu là tìm theo tên.
  if (!understood.length && !unsupported.length && src.trim()) { patch.q = src.trim(); return { patch, understood: [`Tìm theo tên “${src.trim()}”`], leftover: [], unsupported, priceSkipped }; }
  return { patch, understood: [...new Set(understood)], leftover, unsupported: [...new Set(unsupported)], priceSkipped };
}

/* =====================================================================
   2. recommend — xếp hạng + lý do + gần khớp
   ===================================================================== */
const median = (arr) => { const s = [...arr].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };
export function tierErBenchmark(creators) {
  const by = {};
  creators.forEach((c) => (by[c.tier] = by[c.tier] || []).push(heroCh(c).er.value));
  return Object.fromEntries(Object.entries(by).map(([t, v]) => [t, median(v)]));
}

/**
 * @returns {{ matches: Rec[], near: Rec[] }}  Rec = { c, score, pass, fail, plus: string[], warn: string[] }
 *  score 0–99: 70% mức khớp tiêu chí + 30% tín hiệu chất lượng (working score, quan hệ, ER so với tier, tăng trưởng).
 *  ctx = { can(perm), bookingCount(id) }
 */
export function recommend(creators, filters, ctx) {
  const bench = tierErBenchmark(creators);
  const recs = creators.map((c) => {
    const { pass, fail } = evaluate(c, filters, ctx);
    const total = pass.length + fail.length;
    const plus = [], warn = [];
    let q = 0;
    if (c.rel.score) { q += Math.max(0, (c.rel.score - 3) / 2) * 12; if (c.rel.score >= 4.5) plus.push(`Working score ${dec(c.rel.score)}/5 qua ${ctx.bookingCount(c.id)} booking`); }
    if (c.rel.status === "preferred") { q += 6; plus.push("Preferred partner"); } else if (c.rel.status === "active") q += 3;
    // Cùng nguồn số với thẻ kết quả: nền tảng đang lọc nếu có, không thì kênh chính (xem core/filters.js → metricCh).
    const m = metricCh(c, filters), src = focusPlatform(filters) ? " " + PLATFORMS[metricPlatform(c, filters)].label : "";
    const er = m.er.value;
    if (er >= bench[c.tier] * 1.1) { q += 6; plus.push(`ER${src} ${dec(er)}% cao hơn trung vị tier ${c.tier} (${dec(bench[c.tier])}%)`); }
    if (m.growthPct >= 5) { q += 3; plus.push(`Follower${src} +${dec(m.growthPct)}% / 3 tháng`); }
    if ((NOW - new Date(c.lastSynced)) / 864e5 <= 7) q += 3; // dữ liệu mới
    if (c.rel.status === "dnr") { q -= 45; warn.push("Do-Not-Recommend: " + (c.notes[0]?.text || "xem ghi chú CRM")); }
    if (c.rel.status === "watchlist") { q -= 15; warn.push("Watchlist: " + (c.notes[0]?.text || "cần thận trọng")); }
    const fit = total ? pass.length / total : 1;
    const score = Math.max(5, Math.min(99, Math.round(fit * 70 + q)));
    return { c, score, pass, fail, plus, warn };
  });
  const byScore = (a, b) => b.score - a.score;
  const activeCriteria = recs[0] ? recs[0].pass.length + recs[0].fail.length : 0;
  return {
    matches: recs.filter((r) => !r.fail.length).sort(byScore),
    near: activeCriteria >= 3 ? recs.filter((r) => r.fail.length === 1).sort(byScore) : [],
  };
}

/* =====================================================================
   3. lookalike — creator tương tự
   ===================================================================== */
const TIER_ORDER = ["Nano", "Micro", "Mid-Tier", "Macro", "Celeb"];
export function lookalike(target, creators, limit = 5) {
  return creators.filter((c) => c.id !== target.id && c.rel.status !== "dnr").map((c) => {
    let s = 0; const why = [];
    if (c.type === target.type) { s += 30; why.push(`Cùng type ${c.type}`); }
    const cats = c.categories.filter((x) => target.categories.includes(x));
    if (cats.length) { s += Math.min(30, cats.length * 15); why.push(`Cùng ngành ${cats.join(", ")}`); }
    const dt = Math.abs(TIER_ORDER.indexOf(c.tier) - TIER_ORDER.indexOf(target.tier));
    if (dt === 0) { s += 15; why.push(`Cùng tier ${c.tier}`); } else if (dt === 1) s += 8;
    if (c.hero === target.hero) { s += 10; why.push(`Cùng mạnh ${PLATFORMS[c.hero].label}`); }
    const tags = c.audience.tags.filter((x) => target.audience.tags.includes(x));
    if (tags.length) { s += Math.min(10, tags.length * 5); why.push(`Audience ${tags.join(", ")}`); }
    if (c.region === target.region) s += 3;
    if (c.family === target.family) s += 2;
    return { c, similarity: Math.min(98, s), why };
  }).filter((x) => x.similarity >= 40).sort((a, b) => b.similarity - a.similarity).slice(0, limit);
}

/* =====================================================================
   4. summarize — tóm tắt hồ sơ (bullets + nhận định). allowPrice=false → không nhắc tới giá.
   ===================================================================== */
export function summarize(c, bookings, creators, { allowPrice = true } = {}) {
  const h = heroCh(c);
  const bench = tierErBenchmark(creators)[c.tier];
  const done = bookings.filter((b) => b.evaluation);
  const bullets = [];
  const who = [c.type || c.categories[0] || "Creator", "tier " + c.tier, c.region ? "tại " + c.region : ""].filter(Boolean).join(" ");
  bullets.push(`${who}, mạnh ${PLATFORMS[c.hero].label}: ${fmtN(h.followers.value)} follower` + (h.er.value != null ? `, ER ${dec(h.er.value)}% (${h.er.value >= bench ? "cao hơn" : "thấp hơn"} trung vị tier ${dec(bench)}%).` : "."));
  if (c.audience.female != null) bullets.push(`Audience ${c.audience.female}% nữ, chủ yếu ${c.audience.age} tuổi tại ${c.audience.cities.join(", ")}.`);
  if (done.length) {
    const avg = done.reduce((s, b) => s + b.evaluation.score, 0) / done.length;
    bullets.push(`${done.length} booking qua Markus (${[...new Set(done.map((b) => b.brand))].join(", ")}), working score trung bình ${dec(avg.toFixed(1))}/5.`);
    if (allowPrice) {
      const disc = done.reduce((s, b) => s + (b.quoted - b.closed) / b.quoted, 0) / done.length * 100;
      bullets.push(`Giá chốt thực tế thấp hơn giá báo trung bình ${dec(disc.toFixed(1))}% — ${disc >= 4 ? "có dư địa thương lượng" : "giá khá cứng"}.`);
    }
  } else bullets.push("Chưa có booking nào qua Markus — chưa có dữ liệu làm việc thực tế.");
  const risks = [];
  const clash = c.brands.filter((b) => competitorsOf(b).some((x) => c.brands.includes(x)));
  if (clash.length) risks.push(`Đã làm cho các brand là đối thủ của nhau: ${clash.join(", ")} — kiểm tra exclusivity.`);
  c.notes.filter((x) => x.kind === "risk").slice(0, 1).forEach((x) => risks.push(x.text));
  const pending = Object.values(c.channels).flatMap((ch) => [ch.followers, ch.er, ch.avgViews]).filter((m) => m.verify !== "verified").length;
  if (pending) risks.push(`${pending} chỉ số chưa được xác minh.`);
  const verdict = c.rel.status === "dnr" ? { tone: "danger", text: "Không đề xuất — đang ở Do-Not-Recommend." }
    : c.rel.status === "watchlist" ? { tone: "warning", text: "Cân nhắc — chỉ booking khi timeline thoải mái và có phương án dự phòng." }
    : (c.rel.score || 0) >= 4.5 ? { tone: "success", text: "Nên ưu tiên — lịch sử làm việc tốt và ổn định." }
    : done.length ? { tone: "info", text: "Phù hợp — đã có lịch sử hợp tác, không có rủi ro lớn." }
    : { tone: "info", text: "Tiềm năng — nên thử 1 booking nhỏ để có dữ liệu thực tế." };
  return { bullets, risks, verdict };
}

/* =====================================================================
   5. draftOutreach — soạn tin nhắn Zalo (chỉ soạn; người dùng tự sửa và tự gửi)
   ===================================================================== */
/** hideContact = true (vai trò không được xem liên hệ) → không nêu tên manager trong lời chào. */
export function draftOutreach(c, { sender = "Ngọc Anh", brand = "", sow = "", hideContact = false } = {}) {
  const viaManager = c.rel.via !== "direct";
  const given = c.name.trim().split(/\s+/).pop();
  const title = c.gender === "Nam" ? (c.age >= 30 ? "anh" : "bạn") : c.age >= 30 ? "chị" : "bạn";
  const hello = viaManager ? `Chào ${(!hideContact && c.rel.manager) || "anh/chị"},` : `Chào ${title} ${given},`;
  const who = viaManager ? `bạn ${c.name} (${c.handle})` : title;
  const worked = c.rel.status === "preferred" || c.rel.status === "active";
  const r = rateFor(c, sow ? sowKind(sow) : "");
  return [
    hello,
    `Em là ${sender} bên Markus Agency.${worked ? " Cảm ơn " + (viaManager ? "team" : title) + " đã đồng hành cùng Markus ở các dự án trước ạ." : ""}`,
    `Bên em đang có chiến dịch${brand ? " của " + brand : " mới"} và thấy nội dung ${c.categories[0]} trên ${PLATFORMS[c.hero].label} của ${who} rất phù hợp.`,
    `Em muốn hỏi lịch và báo giá hiện tại cho 1 ${(sow || (r ? r.sow : "video")).toLowerCase()} trên ${PLATFORMS[r ? r.platform : c.hero].label}, dự kiến đăng trong tháng 12 ạ.`,
    `${viaManager ? "Anh/chị" : title[0].toUpperCase() + title.slice(1)} xem giúp em nhé, em gửi brief chi tiết ngay khi ${viaManager ? "bên mình" : title} phản hồi. Em cảm ơn ạ!`,
  ].join("\n");
}

/* =====================================================================
   6. extractCreator — đọc link / văn bản dán vào → bản nháp hồ sơ. Mỗi trường có độ tin cậy + nguồn.
   ===================================================================== */
const LINK_RE = {
  tiktok: /tiktok\.com\/@([\w.]+)/i, facebook: /(?:facebook|fb)\.com\/([\w.]+)/i, instagram: /instagram\.com\/([\w.]+)/i,
  youtube: /youtube\.com\/@?([\w.-]+)/i, threads: /threads\.(?:net|com)\/@([\w.]+)/i,
};
const hash = (s) => [...s].reduce((h, ch) => (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0, 7);
const titleCase = (s) => s.split(/[._\-\s]+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");

export function extractCreator(text) {
  const src = String(text || "");
  const fields = {}; // key → { value, conf (0–1), from }
  const set = (key, value, conf, from) => { if (value != null && value !== "" && !fields[key]) fields[key] = { value, conf, from }; };
  const links = {};
  Object.entries(LINK_RE).forEach(([p, re]) => { const m = src.match(re); if (m) links[p] = { url: PLATFORMS[p].base + m[1], handle: m[1] }; });
  const platforms = Object.keys(links);
  const handle = platforms.length ? links[platforms[0]].handle : (src.match(/@([\w.]{3,})/) || [])[1];
  if (handle) set("handle", "@" + handle, 0.98, "Từ link");

  const nameM = src.match(/(?:tên|ten|name)\s*[:\-]\s*([^\n,;|]+?)(?=\s+[-–—]\s|[\n,;|]|$)/i);
  if (nameM) set("name", nameM[1].trim(), 0.9, "Từ văn bản");
  else if (handle) set("name", titleCase(handle), 0.45, "AI đoán từ handle");

  // Follower: có số trong văn bản thì dùng; chỉ có link thì giả lập crawler đọc trang công khai.
  const follM = norm(src).match(new RegExp(`${NUM}\\s*(k|m|tr|trieu|nghin)?\\s*(?:follower\\w*|fl\\b|sub\\w*|nguoi theo doi)`));
  const metrics = {};
  platforms.forEach((p, i) => {
    const h = hash(links[p].handle + p);
    const followers = i === 0 && follM ? people(follM[1], follM[2]) : 5000 + (h % 180) * 1000;
    metrics[p] = { followers, er: +(2.5 + (h % 60) / 10).toFixed(1), avgViews: Math.round(followers * (0.2 + (h % 40) / 100)), source: i === 0 && follM ? "manual" : "ai" };
  });
  if (!platforms.length && follM) metrics.tiktok = { followers: people(follM[1], follM[2]), er: null, avgViews: null, source: "manual" };
  const hero = Object.keys(metrics).sort((a, b) => metrics[b].followers - metrics[a].followers)[0];
  if (hero) { set("hero", hero, platforms.length > 1 ? 0.8 : 0.6, "AI: nền tảng nhiều follower nhất"); set("tier", tierOf(metrics[hero].followers), 0.9, "Tính từ follower"); }

  // Tận dụng luôn parseQuery để đọc type / ngành / khu vực / gia đình từ văn bản mô tả.
  const { patch } = parseQuery(src.replace(/https?:\/\/\S+/g, " "));
  set("type", patch.types[0], 0.8, "Từ văn bản");
  set("category", patch.categories[0], 0.75, "Từ văn bản");
  set("region", patch.regions[0], 0.85, "Từ văn bản");
  set("family", patch.family[0], 0.8, "Từ văn bản");
  if (patch.rateMax || patch.rateMin) set("rate", patch.rateMax || patch.rateMin, 0.7, "Từ văn bản");
  const yob = src.match(/\b(19[6-9]\d|20[01]\d)\b/);
  if (yob) set("yob", +yob[1], 0.7, "Từ văn bản");
  const phone = src.replace(/[.\s]/g, "").match(/0\d{9}\b/);
  if (phone) set("phone", phone[0], 0.9, "Từ văn bản");
  const email = src.match(/[\w.+-]+@[\w-]+\.[\w.]+/);
  if (email) set("email", email[0], 0.95, "Từ văn bản");
  if (/mcn/i.test(src)) set("via", "mcn", 0.7, "Từ văn bản"); else if (/manager|quản lý/i.test(src)) set("via", "manager", 0.7, "Từ văn bản");
  if (/nữ|chị|mẹ|mommy/i.test(src)) set("gender", "Nữ", 0.6, "AI suy luận"); else if (/\bnam\b|anh |bố /i.test(src)) set("gender", "Nam", 0.5, "AI suy luận");

  const REQUIRED = ["name", "type", "category", "region", "hero"];
  return { fields, links, metrics, missing: REQUIRED.filter((k) => !fields[k]), found: Object.keys(fields).length };
}

/* =====================================================================
   7. findDuplicates — "creator có thể đã tồn tại"
   ===================================================================== */
const slug = (s) => norm(s).replace(/[^a-z0-9]/g, "");
export function findDuplicates(draft, creators) {
  const handles = [draft.fields.handle?.value, ...Object.values(draft.links).map((l) => l.handle)].filter(Boolean).map(slug);
  const name = slug(draft.fields.name?.value || "");
  const phone = (draft.fields.phone?.value || "").replace(/\D/g, "");
  return creators.map((c) => {
    const reasons = []; let score = 0;
    const ch = slug(c.handle);
    if (handles.includes(ch)) { score = Math.max(score, 0.97); reasons.push(`Trùng handle ${c.handle}`); }
    else if (handles.some((h) => h.length >= 5 && (ch.includes(h) || h.includes(ch)))) { score = Math.max(score, 0.7); reasons.push(`Handle gần giống ${c.handle}`); }
    if (name && (slug(c.name) === name || (c.alias && slug(c.alias) === name))) { score = Math.max(score, 0.85); reasons.push("Trùng tên / alias"); }
    if (phone && c.rel.contact.phone.replace(/\D/g, "") === phone) { score = Math.max(score, 0.95); reasons.push("Trùng số điện thoại liên hệ"); }
    return { c, score, reasons };
  }).filter((x) => x.score >= 0.6).sort((a, b) => b.score - a.score);
}

/* =====================================================================
   8. compareVerdict — nhận định khi so sánh shortlist
   ===================================================================== */
export function compareVerdict(list, { allowPrice = true } = {}) {
  if (list.length < 2) return [];
  const out = [];
  const by = (fn, dir = 1) => [...list].filter((c) => fn(c) != null).sort((a, b) => (fn(a) - fn(b)) * dir)[0];
  const er = by((c) => heroCh(c).er.value, -1);
  if (er) out.push(`Tương tác tốt nhất: ${er.name} (ER ${dec(heroCh(er).er.value)}%).`);
  const big = by((c) => heroCh(c).followers.value, -1);
  if (big && !er) out.push(`Kênh chính lớn nhất: ${big.name} (${PLATFORMS[big.hero].label} ${fmtN(heroCh(big).followers.value)} follower).`);
  const sc = by((c) => c.rel.score, -1);
  if (sc) out.push(`Làm việc đáng tin nhất: ${sc.name} (working score ${dec(sc.rel.score)}/5).`);
  if (allowPrice) {
    const cpv = (c) => (rateFor(c) && heroCh(c).avgViews.value ? rateFor(c).amount / heroCh(c).avgViews.value : null);
    const best = by(cpv, 1);
    if (best) out.push(`Chi phí / view ước tính thấp nhất: ${best.name} (~${Math.round(cpv(best))} ₫/view).`);
  }
  const risky = list.filter((c) => c.rel.status === "watchlist" || c.rel.status === "dnr");
  if (risky.length) out.push(`Cần thận trọng: ${risky.map((c) => `${c.name} (${REL_STATUS[c.rel.status].label})`).join(", ")}.`);
  const unknown = list.filter((c) => !c.rel.score);
  if (unknown.length) out.push(`Chưa có lịch sử làm việc: ${unknown.map((c) => c.name).join(", ")} — nên hỏi người phụ trách trước khi chốt.`);
  return out;
}

/* =====================================================================
   9. Import bảng tính: đọc CSV → tự khớp cột → chuẩn hoá từng dòng
      (PORT: Google Sheet đọc qua sync-data.php sẵn có; XLSX đọc ở PHP. Phần "khớp cột" là 1 prompt nhỏ cho LLM,
       có thể giữ luôn bảng luật dưới đây làm fallback vì header của CREATOR_DB khá ổn định.)
   ===================================================================== */
export const IMPORT_FIELDS = {
  name: "Tên creator", type: "Creator type", category: "Ngành nội dung", region: "Khu vực", gender: "Giới tính", yob: "Năm sinh",
  hero: "Hero platform", via: "Kênh làm việc", phone: "Zalo / SĐT", email: "Email", rate: "Giá video (₫)", note: "Ghi chú / lịch sử",
  link_tiktok: "Link TikTok", followers_tiktok: "Follower TikTok", link_facebook: "Link Facebook", followers_facebook: "Follower Facebook",
  link_instagram: "Link Instagram", followers_instagram: "Follower Instagram", link_youtube: "Link YouTube", followers_youtube: "Follower YouTube", link_threads: "Link Threads",
};
const COLUMN_RULES = [
  [/creator.?name|^ten|ho ten|^name$/, "name", 0.98], [/creator.?type|loai creator/, "type", 0.95], [/primary.?category|^nganh|^category|linh vuc/, "category", 0.92],
  [/base.?location|khu vuc|location|thanh pho/, "region", 0.95], [/casting|gender|gioi tinh/, "gender", 0.8], [/year.?of.?birth|nam sinh|yob/, "yob", 0.97],
  [/hero/, "hero", 0.97], [/representation|dai dien|quan ly/, "via", 0.85],
  [/sub.?tiktok|follower.*tiktok/, "followers_tiktok", 0.95], [/tik ?tok/, "link_tiktok", 0.9],
  [/sub.?facebook|sub.?fb|follower.*facebook/, "followers_facebook", 0.95], [/facebook|^fb$/, "link_facebook", 0.9],
  [/sub.?ig|sub.?insta|follower.*insta/, "followers_instagram", 0.95], [/instagram|^ig$/, "link_instagram", 0.9],
  [/sub.?youtube|sub.?yt|follower.*youtube/, "followers_youtube", 0.95], [/youtube|^yt$/, "link_youtube", 0.9], [/threads/, "link_threads", 0.9],
  [/email/, "email", 0.96], [/phone|sdt|zalo|contact.?detail/, "phone", 0.8],
  [/^video$|gia video|rate|bao gia/, "rate", 0.75], [/relationship|ghi chu|note|lich su/, "note", 0.7],
];
/** @returns [{ header, target ("" = bỏ qua), conf, reason }] — mỗi trường đích chỉ được gán cho 1 cột (cột khớp trước giữ). */
export function matchColumns(headers) {
  const used = new Set();
  return headers.map((header) => {
    const n = norm(header).replace(/[_-]+/g, " ").trim();
    const hit = COLUMN_RULES.find(([re, target]) => re.test(n) && !used.has(target));
    if (!hit) return { header, target: "", conf: 0, reason: /tier/.test(n) ? "Tier được tính lại từ follower" : "Không có trường tương ứng" };
    used.add(hit[1]);
    return { header, target: hit[1], conf: hit[2], reason: "" };
  });
}
/** CSV / TSV → { headers, rows }. Hỗ trợ ô có dấu ngoặc kép, dấu phẩy và xuống dòng bên trong. */
export function parseCsv(text) {
  const src = String(text || "").replace(/^﻿/, "");
  const first = src.split(/\r?\n/)[0] || "";
  const sep = first.split("\t").length > first.split(",").length ? "\t" : first.split(";").length > first.split(",").length ? ";" : ",";
  const out = []; let row = [], cell = "", q = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (q) { if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === sep) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && src[i + 1] === "\n") i++; row.push(cell); out.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); out.push(row); }
  const rows = out.filter((r) => r.some((c) => c.trim() !== ""));
  return { headers: (rows[0] || []).map((h) => h.trim()), rows: rows.slice(1) };
}
const pickFrom = (list, raw) => list.find((x) => norm(x) === norm(raw).trim()) || "";
const parseCount = (raw) => { const m = norm(raw).replace(/\s/g, "").match(/^([\d.,]+)(k|m|tr|trieu)?$/); if (!m) return 0; return m[2] ? people(m[1], m[2]) : +m[1].replace(/[.,]/g, ""); };
const parseMoney = (raw) => { const n = norm(raw).replace(/\s/g, ""); const m = n.match(/^([\d.,]+)(tr|trieu|k)$/); return m ? money(m[1], m[2]) : +n.replace(/[^\d]/g, "") || 0; };
const handleOf = (raw) => String(raw || "").trim().replace(/[?#].*$/, "").replace(/\/+$/, "").replace(/^.*[@/]/, "");
/**
 * 1 dòng của file + bảng khớp cột → giá trị đã chuẩn hoá.
 * @returns {{ values, draft }} draft có cùng hình dạng với extractCreator() để dùng lại findDuplicates().
 */
export function normalizeImportRow(row, mapping, lists) {
  const raw = {};
  mapping.forEach((m, i) => { if (m.target) raw[m.target] = (row[i] || "").trim(); });
  const guess = parseQuery(`${raw.type || ""}, ${raw.category || ""}, ${raw.region || ""}`).patch;
  const channels = {};
  Object.keys(PLATFORMS).forEach((p) => {
    const handle = handleOf(raw["link_" + p]), followers = parseCount(raw["followers_" + p] || "");
    if (handle || followers) channels[p] = { handle, followers };
  });
  const heroRaw = Object.keys(PLATFORMS).find((p) => norm(raw.hero || "").replace(/\s/g, "").includes(p)) || "";
  const withFollowers = Object.keys(channels).filter((p) => channels[p].followers).sort((a, b) => channels[b].followers - channels[a].followers);
  const values = {
    name: raw.name || "", type: pickFrom(lists.types, raw.type) || guess.types[0] || "", category: pickFrom(lists.categories, raw.category) || guess.categories[0] || "",
    region: pickFrom(lists.regions, raw.region) || guess.regions[0] || "", gender: /^(nu|female|f)$/.test(norm(raw.gender || "").trim()) ? "Nữ" : /^(nam|male|m)$/.test(norm(raw.gender || "").trim()) ? "Nam" : "",
    yob: /^(19|20)\d\d$/.test(raw.yob || "") ? +raw.yob : null, hero: channels[heroRaw]?.followers ? heroRaw : withFollowers[0] || "",
    via: /mcn/.test(norm(raw.via || "")) ? "mcn" : /manager|quan ly/.test(norm(raw.via || "")) ? "manager" : "direct",
    phone: raw.phone || "", email: raw.email || "", rate: parseMoney(raw.rate || ""), note: raw.note || "", channels,
  };
  const problems = [];
  if (!values.name) problems.push("thiếu tên");
  if (!values.hero) problems.push("thiếu follower");
  const draft = { fields: { name: { value: values.name }, phone: { value: values.phone } }, links: Object.fromEntries(Object.entries(channels).filter(([, c]) => c.handle).map(([p, c]) => [p, { handle: c.handle }])) };
  return { values, draft, problems };
}

export { FAMILY, VIA, industryOf };
