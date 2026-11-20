// data/catalog.js — hằng số dùng chung (nền tảng, tier, brand → ngành/đối thủ, tiến độ liên hệ). KHÔNG chứa dữ liệu creator.
// Bản thật: TEAM và COMPANIES được điền lúc khởi động từ API (data/live.js); không có dữ liệu mẫu nào được gửi xuống trình duyệt.
// Icon của từng nền tảng: core/platform-icons.js → platformIcon(key)
export const PLATFORMS = {
  tiktok: { label: "TikTok", base: "https://www.tiktok.com/@" },
  facebook: { label: "Facebook", base: "https://facebook.com/" },
  instagram: { label: "Instagram", base: "https://instagram.com/" },
  youtube: { label: "YouTube", base: "https://youtube.com/@" },
  threads: { label: "Threads", base: "https://www.threads.net/@" },
};
// Thang tier lấy đúng theo tab SETTINGS của Google Sheet thật (mục B. TIER LOGIC): Nano < 10K ≤ Micro < 100K ≤ Mid-Tier < 500K ≤ Macro < 1M ≤ Celeb.
export const TIERS = ["Nano", "Micro", "Mid-Tier", "Macro", "Celeb"];
export const tierOf = (n) => (n >= 1e6 ? "Celeb" : n >= 5e5 ? "Macro" : n >= 1e5 ? "Mid-Tier" : n >= 1e4 ? "Micro" : "Nano");
export const tierRank = (t) => TIERS.indexOf(t);

export const TEAM = []; // tên nhân sự — điền từ /api/snapshot

/* ---------- Công ty quản lý (MCN / Talent Agency / Manager) — mỗi công ty là MỘT bản ghi có ID riêng ----------
   Creator "Cá nhân" = tự quản lý (Representation = Self-managed trên Sheet thật).
   Creator "Có công ty quản lý" trỏ tới companyId → tìm theo tên công ty sẽ ra toàn bộ KOL của công ty đó. */
export const COMPANIES = {}; // chưa có bảng công ty quản lý trong dữ liệu thật
export const REP_KIND = { self: "Cá nhân", company: "Có công ty quản lý" };

// Brand → [ngành, đối thủ trực tiếp]. Dùng cho bộ lọc "từng làm brand / đối thủ" và cảnh báo xung đột.
export const BRANDS = {
  "Vinamilk": ["FMCG", ["TH True Milk", "Dutch Lady", "Nutifood"]],
  "TH True Milk": ["FMCG", ["Vinamilk", "Dutch Lady"]],
  "Dutch Lady": ["FMCG", ["Vinamilk", "TH True Milk", "Nutifood"]],
  "Nutifood": ["FMCG", ["Vinamilk", "Dutch Lady"]],
  "Huggies": ["FMCG", ["Bobby", "Pampers"]],
  "Bobby": ["FMCG", ["Huggies", "Pampers"]],
  "Pampers": ["FMCG", ["Huggies", "Bobby"]],
  "Omo": ["FMCG", ["Ariel"]],
  "Ariel": ["FMCG", ["Omo"]],
  "Comfort": ["FMCG", ["Downy"]],
  "Knorr": ["FMCG", ["Maggi"]],
  "Maggi": ["FMCG", ["Knorr"]],
  "Milo": ["FMCG", ["Ovaltine"]],
  "Oishi": ["FMCG", []],
  "Pepsi": ["FMCG", ["Coca-Cola"]],
  "Coca-Cola": ["FMCG", ["Pepsi"]],
  "Innisfree": ["Beauty", ["Laneige"]],
  "Laneige": ["Beauty", ["Innisfree"]],
  "Cocoon": ["Beauty", []],
  "Maybelline": ["Beauty", ["3CE"]],
  "3CE": ["Beauty", ["Maybelline"]],
  "Hada Labo": ["Beauty", ["CeraVe", "Cetaphil"]],
  "CeraVe": ["Beauty", ["Cetaphil", "Hada Labo"]],
  "Cetaphil": ["Beauty", ["CeraVe", "Hada Labo"]],
  "Samsung": ["Công nghệ", ["OPPO", "Xiaomi"]],
  "OPPO": ["Công nghệ", ["Samsung", "Xiaomi"]],
  "Xiaomi": ["Công nghệ", ["Samsung", "OPPO"]],
  "Logitech": ["Công nghệ", []],
  "Highlands Coffee": ["F&B", ["Phúc Long"]],
  "Phúc Long": ["F&B", ["Highlands Coffee"]],
  "KFC": ["F&B", ["Lotteria"]],
  "Pizza 4P's": ["F&B", []],
  "Coolmate": ["Thời trang", ["Yody"]],
  "Yody": ["Thời trang", ["Coolmate"]],
  "Juno": ["Thời trang", []],
  "Biti's": ["Thời trang", []],
  "Shopee": ["TMĐT", ["Lazada"]],
  "Lazada": ["TMĐT", ["Shopee"]],
  "Techcombank": ["Tài chính", ["VPBank"]],
  "MoMo": ["Tài chính", ["ZaloPay"]],
  "Sunhouse": ["Gia dụng", ["Kangaroo"]],
  "Panasonic": ["Gia dụng", []],
  "Lock&Lock": ["Gia dụng", []],
  "Vietjet": ["Du lịch", ["Bamboo Airways"]],
  "Traveloka": ["Du lịch", ["Agoda"]],
  "Vinpearl": ["Du lịch", []],
  "ELSA Speak": ["Giáo dục", []],
  "Monkey Junior": ["Giáo dục", []],
};
export const industryOf = (brand) => (BRANDS[brand] || ["Khác"])[0];
export const competitorsOf = (brand) => (BRANDS[brand] || [0, []])[1];

/* ---------- Danh sách làm việc (Lists/CRM). stage = tiến độ liên hệ theo quy trình VN ---------- */
export const LIST_STAGES = {
  none: "Chưa liên hệ",
  zalo: "Đã liên hệ qua Zalo",
  manager: "Qua Manager / MCN",
  quoted: "Đã báo giá",
  closed: "Đã chốt",
};
// Nhãn ngắn dùng ở nơi hẹp (ô chọn trong bảng) — KHÔNG cắt chữ bằng "…"; nhãn đầy đủ nằm trong title.
export const LIST_STAGE_SHORT = { none: "Chưa liên hệ", zalo: "Liên hệ Zalo", manager: "Manager/MCN", quoted: "Đã báo giá", closed: "Đã chốt" };
