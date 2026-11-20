// Bản sao dữ liệu GIẢ của prototype (ux-redesign/prototype/data/mock-creators.js) — chỉ dùng để seed CSDL ở máy dev/test.
// data/mock-creators.js — dữ liệu giả cho prototype (30 creator, booking, hàng chờ duyệt, xung đột).
// Tất cả tên / email / SĐT đều là giả (example.com, số dạng 09xx 555 1xx).
//
// PORT SANG APP THẬT — hình dạng record so với mapCreatorRow() trong app.js:
//   name, handle, region, tier, yob, gender        ← giữ nguyên
//   type            ← creatorType          categories[0..1] ← niche, niche2
//   hero            ← platform             channels[p].followers.value ← platStats[p].followers
//   rates[]         ← priceByFormat (photo/video/event/brandvideo/live) — thêm platform + updatedAt + source
//   rel.via/manager ← representation, contactPerson          rel.contact ← contact/email/phone
//   rel.status      ← (MỚI) Preferred / Watchlist / DNR — hiện app chỉ có relationship text
//   MỚI HOÀN TOÀN: mỗi chỉ số là { value, source, updatedAt, verify }, growth[], audience, brands[], notes[], bookings.
// Seed được viết gọn (mảng ngắn) rồi build() nở ra record đầy đủ — sửa seed là đủ.

const NOW = new Date("2026-11-19T09:00:00+07:00");
const ago = (days) => new Date(NOW.getTime() - days * 864e5).toISOString();

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

export const TEAM = ["Ngọc Anh", "Khánh Vy", "Minh Đức", "Thu Trang"];

/* ---------- Công ty quản lý (MCN / Talent Agency / Manager) — mỗi công ty là MỘT bản ghi có ID riêng ----------
   Creator "Cá nhân" = tự quản lý (Representation = Self-managed trên Sheet thật).
   Creator "Có công ty quản lý" trỏ tới companyId → tìm theo tên công ty sẽ ra toàn bộ KOL của công ty đó. */
export const COMPANIES = {
  "CO-001": { id: "CO-001", name: "Lumi MCN", kind: "MCN", person: "Anh Quốc Huy", phone: "0901 555 801", email: "booking@lumi-mcn.example.com" },
  "CO-002": { id: "CO-002", name: "Starlight Entertainment", kind: "Talent Agency", person: "Chị Hoài Thương", phone: "0902 555 802", email: "talent@starlight.example.com" },
  "CO-003": { id: "CO-003", name: "Lộc Media", kind: "Manager", person: "Anh Tấn Lộc", phone: "0903 555 803", email: "hello@locmedia.example.com" },
};
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

/* ---------- Seed creator. ch = { nền tảng: [follower, ER %, view TB] } · rates = [nền tảng, SOW, giá, số ngày trước] ---------- */
const T30 = { usage: "Brand được đăng lại 30 ngày trên kênh chính chủ", excl: "Không nhận đối thủ trực tiếp trong 30 ngày", cond: "Cọc 50% khi xác nhận" };
const T60 = { usage: "Usage 60 ngày, chạy ads tính thêm 30%", excl: "Exclusivity 60 ngày theo ngành hàng (có phí)", cond: "Thanh toán 100% trong 15 ngày sau khi đăng" };
const T0 = { usage: "Chưa thoả thuận", excl: "Không có", cond: "Thanh toán sau khi đăng" };

const SEED = [
  { id: "CR-0001", name: "Nguyễn Thu Hà", alias: "Mẹ Sóc", handle: "mesoc.daily", yob: 1992, gender: "Nữ", family: "has_kids", familyNote: "1 bé gái 3 tuổi", job: "Nhân viên văn phòng", region: "Hà Nội",
    type: "Mommy", cats: ["Mẹ & Bé", "Gia đình"], formats: ["Video ngắn", "Review"], hero: "tiktok",
    ch: { tiktok: [86000, 6.8, 42000], facebook: [42000, 2.1, 5200], instagram: [12000, 3.4, 1800] },
    aud: { female: 84, age: "25-34", cities: ["Hà Nội", "Hải Phòng"], tags: ["Mẹ bỉm", "Nữ 25-34"] },
    rates: [["tiktok", "Video ngắn", 12e6, 48], ["facebook", "Bài đăng ảnh", 6e6, 48]], terms: T30,
    rel: { status: "preferred", owner: "Ngọc Anh", via: "direct", score: 4.7, resp: "Thường phản hồi trong 2 giờ", nego: "Linh hoạt, hay tặng thêm 1 story", channel: "Zalo" },
    brands: ["Vinamilk", "Huggies", "Comfort"], sync: 3,
    notes: [[22, "Ngọc Anh", "Giao bài sớm 2 ngày, nội dung tự nhiên, brand khen.", "good"], [120, "Khánh Vy", "Không nhận quay ngoài giờ hành chính các ngày trong tuần.", ""]] },
  { id: "CR-0002", name: "Trần Minh Anh", alias: "Mẹ Bắp Review", handle: "mebap.review", yob: 1990, gender: "Nữ", family: "has_kids", familyNote: "2 bé (5 tuổi, 1 tuổi)", job: "Kinh doanh online", region: "Hà Nội",
    type: "Mommy", cats: ["Mẹ & Bé", "Gia dụng"], formats: ["Video ngắn", "Review", "Livestream"], hero: "tiktok",
    ch: { tiktok: [320000, 5.2, 180000], facebook: [150000, 1.8, 21000], youtube: [28000, 2.9, 9000] },
    aud: { female: 79, age: "25-34", cities: ["Hà Nội", "TP.HCM"], tags: ["Mẹ bỉm", "Nữ 25-34", "Người nội trợ"] },
    rates: [["tiktok", "Video ngắn", 25e6, 20], ["tiktok", "Livestream", 35e6, 20], ["facebook", "Bài đăng ảnh", 10e6, 90]], terms: T60,
    rel: { status: "active", owner: "Ngọc Anh", via: "manager", manager: "Chị Lan Phương", score: 4.4, resp: "Qua manager, phản hồi trong ngày", nego: "Giảm 5–8% nếu book từ 2 video", channel: "Zalo" },
    brands: ["Bobby", "Nutifood", "Sunhouse", "Shopee"], sync: 2,
    notes: [[5, "Ngọc Anh", "Đã chốt video GrowPLUS+, chờ brand gửi sản phẩm.", ""], [160, "Minh Đức", "Video Sunhouse phải chỉnh sửa 2 vòng do sai key message.", "risk"]] },
  { id: "CR-0003", name: "Lê Phương Thảo", alias: "", handle: "thaole.mom", yob: 1994, gender: "Nữ", family: "has_kids", familyNote: "1 bé trai 2 tuổi", job: "Giáo viên mầm non", region: "Hà Nội",
    type: "Mommy", cats: ["Mẹ & Bé", "Giáo dục"], formats: ["Video ngắn"], hero: "tiktok",
    ch: { tiktok: [54000, 6.2, 26000], facebook: [9000, 2.6, 900] },
    aud: { female: 88, age: "25-34", cities: ["Hà Nội", "Bắc Ninh"], tags: ["Mẹ bỉm", "Nữ 25-34"] },
    rates: [["tiktok", "Video ngắn", 8e6, 64]], terms: T0,
    rel: { status: "network", owner: "Khánh Vy", via: "direct", score: null, resp: "Chưa có dữ liệu", nego: "Chưa có dữ liệu", channel: "Zalo" },
    brands: ["Dutch Lady", "Omo"], sync: 6,
    notes: [[64, "Khánh Vy", "Đã hỏi giá lần đầu qua Zalo, gửi rate card PDF.", ""]] },
  { id: "CR-0004", name: "Phạm Ngọc Diệp", alias: "Nhà Có Ba Bé", handle: "nhacobabe", yob: 1989, gender: "Nữ", family: "has_kids", familyNote: "3 bé (8, 5, 2 tuổi)", job: "Creator toàn thời gian", region: "Hà Nội",
    type: "Mommy", cats: ["Mẹ & Bé", "F&B"], formats: ["Video ngắn", "Vlog"], hero: "tiktok",
    ch: { tiktok: [410000, 6.1, 290000], facebook: [220000, 2.4, 38000], youtube: [95000, 3.3, 41000], instagram: [31000, 2.2, 3900] },
    aud: { female: 76, age: "25-34", cities: ["Hà Nội", "TP.HCM", "Đà Nẵng"], tags: ["Mẹ bỉm", "Nữ 25-34", "Người nội trợ"] },
    rates: [["tiktok", "Video ngắn", 28e6, 30], ["youtube", "Video dài", 40e6, 30], ["facebook", "Bài đăng ảnh", 12e6, 30]], terms: T60,
    rel: { status: "preferred", owner: "Ngọc Anh", via: "direct", score: 4.8, resp: "Phản hồi trong 1 giờ", nego: "Giá ổn định, ưu tiên Markus khi trùng lịch", channel: "Zalo" },
    brands: ["Milo", "Knorr", "Pampers", "Vinamilk"], sync: 1,
    notes: [[14, "Ngọc Anh", "Video Vinamilk đã đăng, 24h đầu 180K view.", "good"], [58, "Ngọc Anh", "Đồng ý giữ giá 28tr đến hết Q1/2027.", "good"]] },
  { id: "CR-0005", name: "Hoàng Bảo Trâm", alias: "", handle: "tramhoang.mom", yob: 1993, gender: "Nữ", family: "has_kids", familyNote: "1 bé gái 4 tuổi", job: "Dược sĩ", region: "TP.HCM",
    type: "Mommy", cats: ["Mẹ & Bé", "Sức khoẻ"], formats: ["Video ngắn", "Review"], hero: "tiktok",
    ch: { tiktok: [78000, 7.4, 39000], instagram: [22000, 3.1, 2600] },
    aud: { female: 86, age: "25-34", cities: ["TP.HCM", "Bình Dương"], tags: ["Mẹ bỉm", "Nữ 25-34"] },
    rates: [["tiktok", "Video ngắn", 15e6, 25]], terms: T30,
    rel: { status: "network", owner: "Thu Trang", via: "direct", score: null, resp: "Chưa có dữ liệu", nego: "Chưa có dữ liệu", channel: "Email" },
    brands: ["Nutifood", "Pampers"], sync: 4, notes: [] },
  { id: "CR-0006", name: "Vũ Khánh Linh", alias: "Mẹ Mít", handle: "memit.family", yob: 1991, gender: "Nữ", family: "has_kids", familyNote: "2 bé (6 tuổi, 3 tuổi)", job: "Creator toàn thời gian", region: "Hà Nội",
    type: "Mommy", cats: ["Mẹ & Bé", "Lifestyle"], formats: ["Video ngắn", "Vlog"], hero: "tiktok",
    ch: { tiktok: [480000, 4.6, 260000], facebook: [310000, 1.5, 30000], instagram: [64000, 2.0, 6100] },
    aud: { female: 74, age: "25-34", cities: ["Hà Nội", "TP.HCM"], tags: ["Mẹ bỉm", "Nữ 25-34"] },
    rates: [["tiktok", "Video ngắn", 38e6, 12], ["facebook", "Bài đăng ảnh", 15e6, 12]], terms: T60,
    rel: { status: "network", owner: "Khánh Vy", via: "mcn", mcn: "Lumi MCN", manager: "Anh Quốc Huy", score: null, resp: "Qua MCN, 1–2 ngày", nego: "MCN ít giảm giá", channel: "Email" },
    brands: ["TH True Milk", "Huggies", "Ariel"], sync: 2, notes: [[12, "Khánh Vy", "MCN gửi rate card mới, tăng 3tr so với tháng 8.", ""]] },
  { id: "CR-0007", name: "Đặng Thu Trang", alias: "Trang Bỉm Sữa", handle: "trangbimsua", yob: 1990, gender: "Nữ", family: "has_kids", familyNote: "2 bé", job: "Nội trợ", region: "Hà Nội",
    type: "Mommy", cats: ["Mẹ & Bé", "Gia đình"], formats: ["Bài đăng ảnh", "Livestream"], hero: "facebook",
    ch: { facebook: [61000, 1.8, 4800], tiktok: [18000, 3.9, 6000] },
    aud: { female: 90, age: "25-34", cities: ["Hà Nội", "Nam Định"], tags: ["Mẹ bỉm", "Người nội trợ"] },
    rates: [["facebook", "Bài đăng ảnh", 10e6, 140], ["tiktok", "Video ngắn", 7e6, 140]], terms: T30,
    rel: { status: "watchlist", owner: "Minh Đức", via: "direct", score: 2.9, resp: "Hay trả lời chậm, cần nhắc", nego: "Dễ thương lượng giá", channel: "Zalo" },
    brands: ["Omo", "Dutch Lady"], sync: 12,
    notes: [[140, "Minh Đức", "Trễ deadline 2 booking liên tiếp (Omo, Dutch Lady). Chỉ book khi timeline thoải mái.", "risk"]] },
  { id: "CR-0008", name: "Bùi Quỳnh Chi", alias: "", handle: "chiquynh.skin", yob: 1998, gender: "Nữ", family: "single", familyNote: "", job: "Creator toàn thời gian", region: "TP.HCM",
    type: "Beauty Blogger", cats: ["Beauty", "Lifestyle"], formats: ["Video ngắn", "Review"], hero: "tiktok",
    ch: { tiktok: [380000, 6.9, 240000], instagram: [140000, 3.8, 22000], youtube: [42000, 3.0, 15000] },
    aud: { female: 82, age: "18-24", cities: ["TP.HCM", "Hà Nội"], tags: ["Gen Z", "Nữ 18-24"] },
    rates: [["tiktok", "Video ngắn", 30e6, 15], ["instagram", "Reel", 22e6, 15]], terms: T60,
    rel: { status: "preferred", owner: "Thu Trang", via: "direct", score: 4.6, resp: "Phản hồi trong 3 giờ", nego: "Tặng kèm 2 story khi book video", channel: "Zalo" },
    brands: ["Innisfree", "Hada Labo", "Shopee"], sync: 2, notes: [[7, "Thu Trang", "Đang chờ brand duyệt kịch bản Retinol Cica.", ""]] },
  { id: "CR-0009", name: "Ngô Hải Yến", alias: "", handle: "yenngo.makeup", yob: 1996, gender: "Nữ", family: "single", familyNote: "", job: "Makeup artist", region: "Hà Nội",
    type: "Beauty Blogger", cats: ["Beauty", "Fashion"], formats: ["Video ngắn", "Reel", "Sự kiện"], hero: "tiktok",
    ch: { tiktok: [800000, 4.1, 350000], instagram: [620000, 3.2, 88000], facebook: [240000, 1.1, 14000] },
    aud: { female: 85, age: "18-24", cities: ["Hà Nội", "TP.HCM"], tags: ["Gen Z", "Nữ 18-24"] },
    rates: [["tiktok", "Video ngắn", 70e6, 40], ["instagram", "Reel", 70e6, 40], ["instagram", "Sự kiện", 45e6, 40]], terms: T60,
    rel: { status: "active", owner: "Thu Trang", via: "mcn", mcn: "Lumi MCN", manager: "Chị Bảo Ngân", score: 4.0, resp: "Qua MCN, phản hồi chậm (1–2 ngày)", nego: "Khó giảm giá, có gói combo 2 nền tảng", channel: "Email" },
    brands: ["Maybelline", "3CE", "Laneige"], sync: 5, notes: [[230, "Thu Trang", "Từng làm cả Maybelline và 3CE — kiểm tra exclusivity trước khi đề xuất.", "risk"]] },
  { id: "CR-0010", name: "Đỗ Mai Phương", alias: "Dược sĩ Phương", handle: "maiphuong.derm", yob: 1991, gender: "Nữ", family: "married", familyNote: "", job: "Dược sĩ da liễu", region: "Hà Nội",
    type: "Chuyên gia", cats: ["Beauty", "Sức khoẻ"], formats: ["Video ngắn", "Review"], hero: "tiktok",
    ch: { tiktok: [72000, 9.0, 61000], facebook: [35000, 2.8, 3900] },
    aud: { female: 77, age: "25-34", cities: ["Hà Nội", "TP.HCM"], tags: ["Nữ 25-34", "Dân văn phòng"] },
    rates: [["tiktok", "Video ngắn", 14e6, 33]], terms: T30,
    rel: { status: "preferred", owner: "Thu Trang", via: "direct", score: 4.9, resp: "Phản hồi trong 2 giờ", nego: "Giá cố định, từ chối sản phẩm chưa có công bố", channel: "Zalo" },
    brands: ["CeraVe", "Cetaphil"], sync: 3, notes: [[93, "Thu Trang", "Chỉ nhận sản phẩm có giấy công bố. ER rất cao so với tier.", "good"]] },
  { id: "CR-0011", name: "Lý Gia Hân", alias: "", handle: "giahan.glow", yob: 2003, gender: "Nữ", family: "single", familyNote: "", job: "Sinh viên", region: "Đà Nẵng",
    type: "KOC", cats: ["Beauty"], formats: ["Video ngắn", "Review"], hero: "tiktok",
    ch: { tiktok: [8000, 11.2, 9500], instagram: [3200, 4.0, 400] },
    aud: { female: 80, age: "18-24", cities: ["Đà Nẵng", "Huế"], tags: ["Gen Z", "Học sinh – sinh viên"] },
    rates: [["tiktok", "Video ngắn", 1.5e6, 70]], terms: T0,
    rel: { status: "network", owner: "Khánh Vy", via: "direct", score: null, resp: "Chưa có dữ liệu", nego: "Nhận sản phẩm đổi bài", channel: "Zalo" },
    brands: ["Cocoon"], sync: 9, notes: [] },
  { id: "CR-0012", name: "Trương Quốc Bảo", alias: "Bảo Ăn Gì", handle: "baoangi", yob: 1995, gender: "Nam", family: "single", familyNote: "", job: "Creator toàn thời gian", region: "TP.HCM",
    type: "Food Blogger", cats: ["F&B", "Du lịch"], formats: ["Video ngắn", "Vlog"], hero: "tiktok",
    ch: { tiktok: [950000, 5.0, 720000], youtube: [210000, 3.6, 130000], facebook: [330000, 1.4, 26000] },
    aud: { female: 55, age: "18-24", cities: ["TP.HCM", "Hà Nội", "Cần Thơ"], tags: ["Gen Z", "Dân văn phòng"] },
    rates: [["tiktok", "Video ngắn", 55e6, 10], ["youtube", "Video dài", 80e6, 10]], terms: T60,
    rel: { status: "active", owner: "Minh Đức", via: "manager", manager: "Anh Tấn Lộc", score: 4.2, resp: "Qua manager, trong ngày", nego: "Giảm 5–10% khi book combo", channel: "Zalo" },
    brands: ["KFC", "Highlands Coffee", "Pepsi", "Oishi"], sync: 1, notes: [[10, "Minh Đức", "Video Highlands đã đăng, đang chờ số 7 ngày.", ""]] },
  { id: "CR-0013", name: "Phan Thị Mỹ Duyên", alias: "", handle: "duyen.foodie", yob: 1997, gender: "Nữ", family: "single", familyNote: "", job: "Nhân viên marketing", region: "Hà Nội",
    type: "Food Blogger", cats: ["F&B"], formats: ["Bài đăng ảnh", "Video ngắn"], hero: "facebook",
    ch: { facebook: [48000, 3.1, 6400], tiktok: [30000, 5.5, 14000], instagram: [15000, 3.3, 1700] },
    aud: { female: 68, age: "18-24", cities: ["Hà Nội"], tags: ["Dân văn phòng", "Gen Z"] },
    rates: [["facebook", "Bài đăng ảnh", 6e6, 55], ["tiktok", "Video ngắn", 7e6, 55]], terms: T30,
    rel: { status: "network", owner: "Minh Đức", via: "direct", score: null, resp: "Chưa có dữ liệu", nego: "Chưa có dữ liệu", channel: "Zalo" },
    brands: ["Phúc Long", "Pizza 4P's"], sync: 8, notes: [] },
  { id: "CR-0014", name: "Huỳnh Tấn Phát", alias: "Phát Miền Tây", handle: "phat.streetfood", yob: 1994, gender: "Nam", family: "married", familyNote: "", job: "Creator toàn thời gian", region: "Cần Thơ",
    type: "Food Blogger", cats: ["F&B", "Du lịch"], formats: ["Video ngắn", "Vlog"], hero: "tiktok",
    ch: { tiktok: [150000, 5.8, 98000], youtube: [36000, 3.1, 12000] },
    aud: { female: 48, age: "25-34", cities: ["Cần Thơ", "TP.HCM", "An Giang"], tags: ["Nam 18-34", "Người nội trợ"] },
    rates: [["tiktok", "Video ngắn", 18e6, 36]], terms: T30,
    rel: { status: "active", owner: "Minh Đức", via: "direct", score: 4.2, resp: "Phản hồi trong ngày", nego: "Linh hoạt", channel: "Zalo" },
    brands: ["Oishi", "Coca-Cola"], sync: 5, notes: [] },
  { id: "CR-0015", name: "Đinh Công Minh", alias: "Minh Tech", handle: "minhtech.review", yob: 1993, gender: "Nam", family: "married", familyNote: "1 bé trai", job: "Kỹ sư phần mềm", region: "Hà Nội",
    type: "Reviewer", cats: ["Công nghệ"], formats: ["Video dài", "Review", "Video ngắn"], hero: "youtube",
    ch: { youtube: [340000, 4.4, 160000], tiktok: [190000, 4.9, 85000], facebook: [80000, 1.2, 5000] },
    aud: { female: 18, age: "25-34", cities: ["Hà Nội", "TP.HCM"], tags: ["Nam 18-34", "Dân văn phòng"] },
    rates: [["youtube", "Video dài", 45e6, 18], ["tiktok", "Video ngắn", 20e6, 18]], terms: T60,
    rel: { status: "preferred", owner: "Minh Đức", via: "direct", score: 4.5, resp: "Phản hồi trong 4 giờ", nego: "Giảm 5% cho khách cũ", channel: "Email" },
    brands: ["Samsung", "Logitech"], sync: 2, notes: [[4, "Minh Đức", "Chốt unbox Galaxy S27, chờ máy demo về ngày 24/11.", ""]] },
  { id: "CR-0016", name: "Tạ Hoàng Long", alias: "Long Gadget", handle: "longgadget", yob: 1999, gender: "Nam", family: "single", familyNote: "", job: "Sinh viên mới ra trường", region: "TP.HCM",
    type: "Reviewer", cats: ["Công nghệ"], formats: ["Video ngắn", "Review"], hero: "tiktok",
    ch: { tiktok: [95000, 6.0, 52000], youtube: [14000, 3.4, 4100] },
    aud: { female: 22, age: "18-24", cities: ["TP.HCM", "Đồng Nai"], tags: ["Nam 18-34", "Gen Z", "Học sinh – sinh viên"] },
    rates: [["tiktok", "Video ngắn", 12e6, 28]], terms: T30,
    rel: { status: "network", owner: "Minh Đức", via: "direct", score: null, resp: "Chưa có dữ liệu", nego: "Chưa có dữ liệu", channel: "Zalo" },
    brands: ["OPPO", "Xiaomi"], sync: 2, notes: [] },
  { id: "CR-0017", name: "Cao Nhật Nam", alias: "Nam Gaming", handle: "namgaming.tv", yob: 1997, gender: "Nam", family: "single", familyNote: "", job: "Streamer", region: "Đà Nẵng",
    type: "Streamer", cats: ["Game", "Công nghệ"], formats: ["Livestream", "Video dài"], hero: "youtube",
    ch: { youtube: [720000, 3.9, 210000], facebook: [400000, 2.2, 60000], tiktok: [260000, 4.0, 90000] },
    aud: { female: 12, age: "18-24", cities: ["Đà Nẵng", "Hà Nội", "TP.HCM"], tags: ["Nam 18-34", "Gen Z", "Học sinh – sinh viên"] },
    rates: [["youtube", "Livestream", 50e6, 80], ["youtube", "Video dài", 60e6, 80]], terms: T60,
    rel: { status: "network", owner: "Minh Đức", via: "mcn", mcn: "Lumi MCN", manager: "Anh Quốc Huy", score: null, resp: "Qua MCN, 1–2 ngày", nego: "Chưa có dữ liệu", channel: "Email" },
    brands: ["Logitech", "MoMo", "Pepsi"], sync: 14, notes: [] },
  { id: "CR-0018", name: "Lâm Tường Vy", alias: "", handle: "vylam.daily", yob: 1997, gender: "Nữ", family: "single", familyNote: "", job: "Stylist tự do", region: "TP.HCM",
    type: "Lifestyle", cats: ["Lifestyle", "Fashion"], formats: ["Reel", "Bài đăng ảnh"], hero: "instagram",
    ch: { instagram: [230000, 4.6, 72000], tiktok: [120000, 5.1, 54000], threads: [18000, 3.0, 2500] },
    aud: { female: 81, age: "18-24", cities: ["TP.HCM", "Hà Nội"], tags: ["Gen Z", "Nữ 18-24", "Dân văn phòng"] },
    rates: [["instagram", "Reel", 22e6, 44], ["instagram", "Bài đăng ảnh", 12e6, 44]], terms: T30,
    rel: { status: "active", owner: "Thu Trang", via: "direct", score: 4.3, resp: "Phản hồi trong ngày", nego: "Linh hoạt", channel: "Zalo" },
    brands: ["Juno", "Shopee", "Laneige"], sync: 4, notes: [] },
  { id: "CR-0019", name: "Kiều Anh Thư", alias: "", handle: "thukieu.official", yob: 1994, gender: "Nữ", family: "married", familyNote: "", job: "Diễn viên", region: "TP.HCM",
    type: "Celebrity", cats: ["Lifestyle", "Fashion"], formats: ["Reel", "Video ngắn", "Sự kiện"], hero: "facebook",
    ch: { facebook: [2400000, 1.9, 420000], tiktok: [1800000, 3.0, 900000], instagram: [1100000, 2.6, 190000] },
    aud: { female: 66, age: "25-34", cities: ["TP.HCM", "Hà Nội", "Đà Nẵng"], tags: ["Nữ 25-34", "Dân văn phòng"] },
    rates: [["facebook", "Video ngắn", 250e6, 60], ["instagram", "Reel", 250e6, 60], ["facebook", "Sự kiện", 180e6, 60]], terms: T60,
    rel: { status: "active", owner: "Ngọc Anh", via: "manager", manager: "Chị Hoài Thương", score: 4.0, resp: "Qua manager, 1–2 ngày", nego: "Giảm tối đa 8%, bắt buộc duyệt hình ảnh", channel: "Email" },
    brands: ["Vinamilk", "Samsung", "Techcombank"], sync: 3, notes: [[8, "Ngọc Anh", "Manager yêu cầu duyệt kịch bản trước 10 ngày.", ""]] },
  { id: "CR-0020", name: "Mạc Đức Huy", alias: "Huy Fit", handle: "huy.fit", yob: 1991, gender: "Nam", family: "married", familyNote: "", job: "Huấn luyện viên cá nhân", region: "Hà Nội",
    type: "Chuyên gia", cats: ["Fitness", "Sức khoẻ"], formats: ["Reel", "Video ngắn"], hero: "instagram",
    ch: { instagram: [64000, 5.2, 21000], tiktok: [40000, 6.3, 19000] },
    aud: { female: 41, age: "25-34", cities: ["Hà Nội"], tags: ["Nam 18-34", "Dân văn phòng"] },
    rates: [["instagram", "Reel", 9e6, 75]], terms: T30,
    rel: { status: "network", owner: "Khánh Vy", via: "direct", score: null, resp: "Chưa có dữ liệu", nego: "Chưa có dữ liệu", channel: "Zalo" },
    brands: ["Coolmate", "Biti's", "Nutifood"], sync: 11, notes: [] },
  { id: "CR-0021", name: "Tô Yến Nhi", alias: "Nhi Đi Đâu", handle: "nhididau", yob: 1996, gender: "Nữ", family: "single", familyNote: "", job: "Creator toàn thời gian", region: "Đà Nẵng",
    type: "Travel", cats: ["Du lịch", "Lifestyle"], formats: ["Video ngắn", "Vlog"], hero: "tiktok",
    ch: { tiktok: [270000, 6.5, 120000], youtube: [60000, 3.7, 23000], instagram: [58000, 3.9, 7000] },
    aud: { female: 63, age: "18-24", cities: ["Đà Nẵng", "TP.HCM", "Hà Nội"], tags: ["Gen Z", "Dân văn phòng"] },
    rates: [["tiktok", "Video ngắn", 24e6, 22]], terms: T30,
    rel: { status: "active", owner: "Khánh Vy", via: "direct", score: 4.6, resp: "Phản hồi trong 3 giờ", nego: "Tặng thêm ảnh hậu trường", channel: "Zalo" },
    brands: ["Vietjet", "Traveloka", "Vinpearl"], sync: 2, notes: [] },
  { id: "CR-0022", name: "Châu Bội Ngọc", alias: "", handle: "ngocchau.style", yob: 2000, gender: "Nữ", family: "single", familyNote: "", job: "Người mẫu ảnh", region: "TP.HCM",
    type: "Lifestyle", cats: ["Fashion"], formats: ["Reel", "Bài đăng ảnh"], hero: "instagram",
    ch: { instagram: [88000, 5.4, 26000], tiktok: [51000, 5.0, 20000] },
    aud: { female: 78, age: "18-24", cities: ["TP.HCM"], tags: ["Gen Z", "Nữ 18-24"] },
    rates: [["instagram", "Reel", 10e6, 50]], terms: T30,
    rel: { status: "network", owner: "Thu Trang", via: "direct", score: null, resp: "Chưa có dữ liệu", nego: "Chưa có dữ liệu", channel: "Zalo" },
    brands: ["Yody", "Juno"], sync: 6, notes: [] },
  { id: "CR-0023", name: "Quách Thành Đạt", alias: "Đạt Vlog", handle: "datquach.vlog", yob: 1995, gender: "Nam", family: "single", familyNote: "", job: "Creator toàn thời gian", region: "Hải Phòng",
    type: "Lifestyle", cats: ["Giải trí", "Lifestyle"], formats: ["Video ngắn", "Vlog"], hero: "tiktok",
    ch: { tiktok: [880000, 3.2, 410000], facebook: [260000, 1.0, 12000] },
    aud: { female: 44, age: "18-24", cities: ["Hải Phòng", "Hà Nội"], tags: ["Gen Z", "Nam 18-34"] },
    rates: [["tiktok", "Video ngắn", 48e6, 300]], terms: T60,
    rel: { status: "dnr", owner: "Minh Đức", via: "direct", score: 2.0, resp: "Phản hồi nhanh", nego: "Dễ giảm giá", channel: "Zalo" },
    brands: ["Shopee", "Lazada", "Oishi"], sync: 20,
    notes: [[340, "Minh Đức", "Đăng bài cho Lazada trong thời gian exclusivity của Shopee (12.12). Brand khiếu nại. KHÔNG đề xuất cho đến khi có quyết định mới của Booking Lead.", "risk"]] },
  { id: "CR-0024", name: "La Thị Hồng Nhung", alias: "Cô Nhung English", handle: "conhung.english", yob: 1990, gender: "Nữ", family: "has_kids", familyNote: "1 bé trai 5 tuổi", job: "Giáo viên tiếng Anh", region: "Hà Nội",
    type: "Chuyên gia", cats: ["Giáo dục", "Mẹ & Bé"], formats: ["Video ngắn", "Livestream"], hero: "tiktok",
    ch: { tiktok: [210000, 5.3, 110000], facebook: [70000, 1.7, 6000], youtube: [45000, 3.2, 14000] },
    aud: { female: 71, age: "25-34", cities: ["Hà Nội", "TP.HCM"], tags: ["Mẹ bỉm", "Học sinh – sinh viên"] },
    rates: [["tiktok", "Video ngắn", 20e6, 42]], terms: T30,
    rel: { status: "active", owner: "Khánh Vy", via: "direct", score: 4.5, resp: "Phản hồi buổi tối", nego: "Giá cố định", channel: "Zalo" },
    brands: ["ELSA Speak", "Monkey Junior"], sync: 3, notes: [] },
  { id: "CR-0025", name: "Nghiêm Xuân Tùng", alias: "Tùng Tài Chính", handle: "tung.taichinh", yob: 1988, gender: "Nam", family: "married", familyNote: "2 bé", job: "Chuyên viên tài chính", region: "Hà Nội",
    type: "Chuyên gia", cats: ["Tài chính"], formats: ["Video dài", "Video ngắn"], hero: "youtube",
    ch: { youtube: [58000, 4.8, 24000], tiktok: [46000, 5.0, 21000] },
    aud: { female: 35, age: "25-34", cities: ["Hà Nội", "TP.HCM"], tags: ["Dân văn phòng", "Nam 18-34"] },
    rates: [["youtube", "Video dài", 16e6, 65]], terms: T30,
    rel: { status: "network", owner: "Thu Trang", via: "direct", score: null, resp: "Chưa có dữ liệu", nego: "Chưa có dữ liệu", channel: "Email" },
    brands: ["Techcombank", "MoMo"], sync: 1, notes: [] },
  { id: "CR-0026", name: "Ông Bảo Hân", alias: "Bếp Nhà Hân", handle: "bepnhahan", yob: 1988, gender: "Nữ", family: "has_kids", familyNote: "2 bé (9 tuổi, 6 tuổi)", job: "Nội trợ", region: "TP.HCM",
    type: "Mommy", cats: ["F&B", "Gia dụng"], formats: ["Video ngắn", "Bài đăng ảnh"], hero: "facebook",
    ch: { facebook: [360000, 2.9, 88000], tiktok: [140000, 4.4, 60000], youtube: [52000, 3.0, 17000] },
    aud: { female: 83, age: "35-44", cities: ["TP.HCM", "Đồng Nai", "Bình Dương"], tags: ["Người nội trợ", "Mẹ bỉm"] },
    rates: [["facebook", "Video ngắn", 20e6, 38], ["tiktok", "Video ngắn", 16e6, 38]], terms: T30,
    rel: { status: "active", owner: "Ngọc Anh", via: "direct", score: 4.4, resp: "Phản hồi trong ngày", nego: "Linh hoạt", channel: "Zalo" },
    brands: ["Knorr", "Maggi", "Lock&Lock", "Sunhouse"], sync: 4, notes: [[190, "Ngọc Anh", "Từng làm cả Knorr và Maggi (cách nhau 8 tháng).", "risk"]] },
  { id: "CR-0027", name: "Thái Minh Khôi", alias: "Bố Khôi", handle: "bokhoi.dad", yob: 1990, gender: "Nam", family: "has_kids", familyNote: "1 bé gái 2 tuổi", job: "Thiết kế đồ hoạ", region: "Hà Nội",
    type: "Daddy", cats: ["Mẹ & Bé", "Gia đình"], formats: ["Video ngắn"], hero: "tiktok",
    ch: { tiktok: [67000, 7.1, 35000], facebook: [12000, 2.0, 1100] },
    aud: { female: 72, age: "25-34", cities: ["Hà Nội"], tags: ["Mẹ bỉm", "Nữ 25-34"] },
    rates: [["tiktok", "Video ngắn", 9e6, 150]], terms: T30,
    rel: { status: "active", owner: "Ngọc Anh", via: "direct", score: 4.5, resp: "Phản hồi trong 3 giờ", nego: "Linh hoạt", channel: "Zalo" },
    brands: ["Huggies", "Vinamilk"], sync: 5, notes: [] },
  { id: "CR-0028", name: "Giang Hoài An", alias: "", handle: "an.vietgi", yob: 1998, gender: "Nữ", family: "single", familyNote: "", job: "Copywriter", region: "Hà Nội",
    type: "Lifestyle", cats: ["Lifestyle", "F&B"], formats: ["Bài viết", "Bài đăng ảnh"], hero: "threads",
    ch: { threads: [9000, 7.8, 5200], instagram: [6000, 4.1, 700] },
    aud: { female: 70, age: "18-24", cities: ["Hà Nội"], tags: ["Gen Z", "Dân văn phòng"] },
    rates: [["threads", "Bài viết", 2e6, 85]], terms: T0,
    rel: { status: "network", owner: "Khánh Vy", via: "direct", score: null, resp: "Chưa có dữ liệu", nego: "Chưa có dữ liệu", channel: "Email" },
    brands: ["Highlands Coffee"], sync: 45, notes: [] },
  { id: "CR-0029", name: "Viên Ngọc Hà", alias: "Hà Home", handle: "hahome.decor", yob: 1992, gender: "Nữ", family: "married", familyNote: "", job: "Kiến trúc sư nội thất", region: "Hà Nội",
    type: "Lifestyle", cats: ["Gia dụng", "Lifestyle"], formats: ["Video ngắn", "Review"], hero: "tiktok",
    ch: { tiktok: [90000, 5.9, 47000], instagram: [33000, 3.6, 4200] },
    aud: { female: 75, age: "25-34", cities: ["Hà Nội", "TP.HCM"], tags: ["Nữ 25-34", "Người nội trợ", "Dân văn phòng"] },
    rates: [["tiktok", "Video ngắn", 13e6, 26]], terms: T30,
    rel: { status: "active", owner: "Khánh Vy", via: "direct", score: 4.4, resp: "Phản hồi trong ngày", nego: "Linh hoạt", channel: "Zalo" },
    brands: ["Panasonic", "Sunhouse", "Lock&Lock"], sync: 2, notes: [] },
  { id: "CR-0030", name: "Sầm Khánh Vân", alias: "Vân Chốt Đơn", handle: "vansam.koc", yob: 2001, gender: "Nữ", family: "single", familyNote: "", job: "Bán hàng livestream", region: "TP.HCM",
    type: "KOC", cats: ["Beauty", "Gia dụng"], formats: ["Livestream", "Video ngắn"], hero: "tiktok",
    ch: { tiktok: [45000, 8.5, 31000] },
    aud: { female: 87, age: "18-24", cities: ["TP.HCM", "Long An"], tags: ["Gen Z", "Nữ 18-24"] },
    rates: [["tiktok", "Livestream", 7e6, 16], ["tiktok", "Video ngắn", 4e6, 16]], terms: T30,
    rel: { status: "active", owner: "Thu Trang", via: "direct", score: 4.6, resp: "Phản hồi trong 1 giờ", nego: "Nhận thêm hoa hồng theo đơn", channel: "Zalo" },
    brands: ["Shopee", "Cocoon", "Omo"], sync: 1, notes: [] },
];

/* ---------- Seed booking: [id, creator, brand, chiến dịch, nền tảng, SOW, giá báo, giá chốt, ngày, trạng thái, view, ER, điểm làm việc, nhận xét] ----------
   trạng thái: confirmed → content (duyệt nội dung) → posted → paid. "paid" = đã xong, nằm trong Lịch sử hợp tác. */
const BOOKING_SEED = [
  ["BK-2503", "CR-0019", "Techcombank", "Inspire – thẻ mới", "facebook", "Video ngắn", 260e6, 240e6, "2025-11-28", "paid", 2600000, 2.2, 4.0, "Kết quả tốt nhưng duyệt hình ảnh mất 3 vòng."],
  ["BK-2507", "CR-0004", "Milo", "Năng lượng bền bỉ", "tiktok", "Video ngắn", 30e6, 28e6, "2025-12-03", "paid", 420000, 6.3, 4.9, "Kịch bản tự đề xuất, brand duyệt ngay vòng 1."],
  ["BK-2509", "CR-0012", "KFC", "Gà giòn cay", "tiktok", "Video ngắn", 60e6, 55e6, "2025-12-20", "paid", 1100000, 5.2, 4.3, "Video viral, giao trễ 1 ngày."],
  ["BK-2512", "CR-0023", "Shopee", "Sale 12.12", "tiktok", "Video ngắn", 50e6, 48e6, "2025-12-08", "paid", 610000, 3.1, 2.0, "Vi phạm exclusivity: đăng bài cho Lazada trong cùng tuần."],
  ["BK-2511", "CR-0001", "Vinamilk", "Sữa chua Probi – Tết 2026", "tiktok", "Video ngắn", 13e6, 12e6, "2026-01-12", "paid", 128000, 7.2, 4.8, "Giao bài sớm 2 ngày, nội dung tự nhiên."],
  ["BK-2544", "CR-0012", "Pepsi", "Tết kết nối", "youtube", "Video dài", 80e6, 72e6, "2026-01-25", "paid", 480000, 3.8, 4.1, "Đạt KPI view, comment tích cực."],
  ["BK-2515", "CR-0008", "Innisfree", "Green Tea Seed", "tiktok", "Video ngắn", 32e6, 30e6, "2026-02-02", "paid", 260000, 7.9, 4.7, "ER cao, tặng thêm 2 story."],
  ["BK-2519", "CR-0002", "Bobby", "Bobby siêu mỏng", "tiktok", "Video ngắn", 26e6, 24e6, "2026-02-18", "paid", 310000, 5.4, 4.5, "Đúng brief, giao đúng hạn."],
  ["BK-2522", "CR-0010", "CeraVe", "Skin barrier", "tiktok", "Video ngắn", 15e6, 14e6, "2026-03-01", "paid", 88000, 9.1, 5.0, "Nội dung chuyên môn, tỉ lệ lưu video rất cao."],
  ["BK-2525", "CR-0007", "Omo", "Giặt sạch mùa nồm", "facebook", "Bài đăng ảnh", 10e6, 10e6, "2026-03-08", "paid", 22000, 1.9, 2.8, "Trễ deadline 4 ngày, phải nhắc nhiều lần."],
  ["BK-2528", "CR-0015", "Samsung", "Galaxy A-series", "youtube", "Video dài", 48e6, 45e6, "2026-03-20", "paid", 210000, 4.9, 4.6, "Review sâu, đúng thông điệp."],
  ["BK-2530", "CR-0009", "Maybelline", "Superstay", "instagram", "Reel", 75e6, 70e6, "2026-04-02", "paid", 540000, 4.3, 4.0, "Qua MCN nên phản hồi chậm, chất lượng tốt."],
  ["BK-2534", "CR-0001", "Huggies", "Tã quần mới", "tiktok", "Video ngắn", 12e6, 11e6, "2026-04-20", "paid", 96000, 6.1, 4.6, "Đúng brief; cần nhắc gắn link giỏ hàng."],
  ["BK-2536", "CR-0018", "Juno", "BST Thu 2026", "instagram", "Reel", 24e6, 22e6, "2026-05-02", "paid", 142000, 5.5, 4.3, "Hình ảnh đẹp, giao đúng hạn."],
  ["BK-2540", "CR-0004", "Knorr", "Bữa cơm nhà", "tiktok", "Video ngắn", 28e6, 27e6, "2026-05-09", "paid", 365000, 5.8, 4.8, "Ổn định, không cần chỉnh sửa."],
  ["BK-2542", "CR-0026", "Knorr", "Bữa cơm nhà", "facebook", "Video ngắn", 22e6, 20e6, "2026-05-12", "paid", 240000, 3.3, 4.4, "Tệp người xem đúng mục tiêu."],
  ["BK-2548", "CR-0002", "Sunhouse", "Nồi chiên 6L", "tiktok", "Video ngắn", 25e6, 25e6, "2026-06-11", "paid", 185000, 4.1, 4.2, "Phải chỉnh sửa 2 vòng do sai key message."],
  ["BK-2574", "CR-0027", "Huggies", "Ngày của bố", "tiktok", "Video ngắn", 9e6, 9e6, "2026-06-15", "paid", 71000, 6.0, 4.5, "Góc nhìn của bố tạo khác biệt."],
  ["BK-2549", "CR-0014", "Oishi", "Snack mùa hè", "tiktok", "Video ngắn", 18e6, 17e6, "2026-06-20", "paid", 132000, 5.6, 4.2, "Giao đúng hạn."],
  ["BK-2555", "CR-0021", "Vietjet", "Hè rực rỡ", "tiktok", "Video ngắn", 25e6, 24e6, "2026-06-28", "paid", 320000, 6.9, 4.6, "Hình ảnh đẹp, tặng thêm ảnh hậu trường."],
  ["BK-2552", "CR-0007", "Dutch Lady", "Sữa tươi mới", "facebook", "Bài đăng ảnh", 10e6, 9e6, "2026-07-01", "paid", 18000, 1.6, 3.0, "Trễ 2 ngày."],
  ["BK-2558", "CR-0008", "Hada Labo", "Dưỡng ẩm mùa mưa", "tiktok", "Video ngắn", 30e6, 30e6, "2026-07-25", "paid", 231000, 6.6, 4.5, "Tốt, đúng hạn."],
  ["BK-2561", "CR-0001", "Comfort", "Hương ban mai", "facebook", "Bài đăng ảnh", 6e6, 6e6, "2026-08-05", "paid", 14000, 2.4, 4.7, "Ảnh đẹp, caption tự nhiên."],
  ["BK-2563", "CR-0024", "ELSA Speak", "Back to school", "tiktok", "Video ngắn", 20e6, 20e6, "2026-08-10", "paid", 175000, 5.0, 4.5, "Tỉ lệ cài app tốt."],
  ["BK-2566", "CR-0010", "Cetaphil", "Dịu nhẹ mỗi ngày", "tiktok", "Video ngắn", 14e6, 14e6, "2026-08-18", "paid", 73000, 8.4, 4.9, "Chuyên nghiệp."],
  ["BK-2570", "CR-0015", "Logitech", "MX series", "youtube", "Video dài", 45e6, 42e6, "2026-09-01", "paid", 156000, 4.2, 4.4, "Đúng hạn, cần nhắc chèn link."],
  ["BK-2577", "CR-0004", "Pampers", "Ngủ ngon cả đêm", "tiktok", "Video ngắn", 28e6, 28e6, "2026-09-22", "paid", 298000, 5.1, 4.7, "Ổn định."],
  ["BK-2580", "CR-0030", "Cocoon", "Live 10.10", "tiktok", "Livestream", 7e6, 7e6, "2026-10-10", "paid", 38000, 8.8, 4.6, "Chốt 412 đơn trong phiên live."],
  // Đang chạy — hiển thị ở Booking tracker
  ["BK-2609", "CR-0029", "Panasonic", "Máy lọc không khí mùa đông", "tiktok", "Video ngắn", 13e6, 13e6, "2026-11-02", "posted", null, null, null, ""],
  ["BK-2601", "CR-0004", "Vinamilk", "Sữa hạt mùa Tết 2027", "tiktok", "Video ngắn", 28e6, 27e6, "2026-11-05", "posted", null, null, null, ""],
  ["BK-2602", "CR-0012", "Highlands Coffee", "Trà sen vàng mới", "tiktok", "Video ngắn", 55e6, 52e6, "2026-11-08", "posted", null, null, null, ""],
  ["BK-2603", "CR-0001", "Vinamilk", "Sữa hạt mùa Tết 2027", "tiktok", "Video ngắn", 12e6, 12e6, "2026-11-10", "content", null, null, null, ""],
  ["BK-2604", "CR-0019", "Samsung", "Galaxy S27", "instagram", "Reel", 250e6, 235e6, "2026-11-11", "confirmed", null, null, null, ""],
  ["BK-2606", "CR-0008", "Innisfree", "Retinol Cica", "tiktok", "Video ngắn", 32e6, 30e6, "2026-11-12", "content", null, null, null, ""],
  ["BK-2605", "CR-0002", "Nutifood", "GrowPLUS+", "tiktok", "Video ngắn", 25e6, 24e6, "2026-11-14", "confirmed", null, null, null, ""],
  ["BK-2607", "CR-0015", "Samsung", "Galaxy S27 unbox", "youtube", "Video dài", 48e6, 46e6, "2026-11-15", "confirmed", null, null, null, ""],
  ["BK-2608", "CR-0030", "Shopee", "Live 12.12", "tiktok", "Livestream", 8e6, 7.5e6, "2026-11-16", "confirmed", null, null, null, ""],
];

/* ---------- Hàng chờ duyệt: giá trị mới do crawler / AI đề xuất, CHƯA ghi vào hồ sơ ---------- */
export const REVIEW_QUEUE = [
  { id: "RQ-1", creatorId: "CR-0002", platform: "tiktok", metric: "followers", proposed: 334000, source: "crawler", at: ago(1), confidence: 0.96 },
  { id: "RQ-2", creatorId: "CR-0008", platform: "tiktok", metric: "er", proposed: 7.4, source: "crawler", at: ago(1), confidence: 0.9 },
  { id: "RQ-3", creatorId: "CR-0012", platform: "tiktok", metric: "followers", proposed: 1020000, source: "api", at: ago(0.4), confidence: 0.99 },
  { id: "RQ-4", creatorId: "CR-0011", platform: "tiktok", metric: "followers", proposed: 11200, source: "ai", at: ago(2), confidence: 0.71 },
  { id: "RQ-5", creatorId: "CR-0021", platform: "tiktok", metric: "avgViews", proposed: 98000, source: "crawler", at: ago(1), confidence: 0.88 },
  { id: "RQ-6", creatorId: "CR-0028", platform: "threads", metric: "followers", proposed: 10400, source: "ai", at: ago(3), confidence: 0.64 },
  { id: "RQ-7", creatorId: "CR-0016", platform: "tiktok", metric: "followers", proposed: 96800, source: "crawler", at: ago(1), confidence: 0.97 },
  { id: "RQ-8", creatorId: "CR-0003", platform: "tiktok", metric: "er", proposed: 5.9, source: "crawler", at: ago(2), confidence: 0.86 },
];

/* ---------- Xung đột: người nhập tay một giá trị, lần đồng bộ sau trả về giá trị khác ---------- */
export const CONFLICTS = [
  { id: "CF-1", creatorId: "CR-0007", platform: "facebook", metric: "followers", manual: { value: 61000, by: "Minh Đức", at: ago(12) }, synced: { value: 48200, source: "crawler", at: ago(2) } },
  { id: "CF-2", creatorId: "CR-0019", platform: "tiktok", metric: "avgViews", manual: { value: 900000, by: "Ngọc Anh (manager gửi)", at: ago(20) }, synced: { value: 512000, source: "crawler", at: ago(3) } },
  { id: "CF-3", creatorId: "CR-0025", platform: "youtube", metric: "followers", manual: { value: 58000, by: "Thu Trang", at: ago(40) }, synced: { value: 63400, source: "api", at: ago(1) } },
];

/* ---------- Label tự do (giống cột Labels của bảng CRM) ---------- */
const LABELS = {
  "CR-0001": ["Tết 2027", "ambassador"], "CR-0002": ["Tết 2027"], "CR-0004": ["Tết 2027", "ambassador"], "CR-0006": ["cần thương lượng"],
  "CR-0008": ["ambassador"], "CR-0010": ["chuyên gia"], "CR-0012": ["viral"], "CR-0015": ["review sâu"], "CR-0030": ["KOC live", "affiliate"], "CR-0011": ["affiliate"],
};

/* ---------- Ảnh đại diện mock ----------
   Ảnh chân dung placeholder nạp LÚC CHẠY từ randomuser.me (không lưu file vào repo, không phải người nổi tiếng / KOL thật).
   Vì là ảnh người thật gắn với dữ liệu GIẢ nên creator mock có tín hiệu tiêu cực (Watchlist, DNR, điểm thấp, ghi chú rủi ro:
   CR-0002, 0007, 0009, 0023, 0026) KHÔNG có ảnh — và core/parts.js → avatar() còn kiểm tra lại lúc vẽ.
   Mất mạng / ảnh lỗi → tự rơi về avatar minh hoạ SVG.
   APP THẬT: photoUrl = ảnh đại diện lấy từ kênh của creator khi đồng bộ (YouTube / IG API trả URL ảnh);
   server phải tải về và cache vì URL ảnh của nền tảng thường hết hạn. */
const PHOTO_BASE = "https://randomuser.me/api/portraits/";
const PHOTO = {
  "CR-0001": "women/44", "CR-0003": "women/65", "CR-0004": "women/68", "CR-0005": "women/17", "CR-0006": "women/79",
  "CR-0008": "women/26", "CR-0010": "women/50", "CR-0011": "women/12", "CR-0013": "women/90", "CR-0018": "women/33",
  "CR-0019": "women/8", "CR-0021": "women/21", "CR-0022": "women/2", "CR-0024": "women/57", "CR-0028": "women/40",
  "CR-0029": "women/72", "CR-0030": "women/85",
  "CR-0012": "men/32", "CR-0014": "men/46", "CR-0015": "men/22", "CR-0016": "men/75", "CR-0017": "men/11",
  "CR-0020": "men/64", "CR-0025": "men/52", "CR-0027": "men/36",
};

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
/* CAMPAIGN (mức gọn, chưa có ngân sách / hợp đồng). Mỗi campaign đi theo 2 bước:
   1. Ứng viên: creator đang cân nhắc, ước tính KPI, so sánh, xuất báo giá — lưu ở store theo id campaign;
   2. Liên hệ (entries): creator đã duyệt, theo dõi tiến độ liên hệ tới khi chốt booking.
   Ai thấy campaign nào: người phụ trách (owner) + thành viên được mời (members). Quản lý và Admin thấy tất cả.
   MVP: lưu là bản ghi workflow "campaigns" của app cũ (cùng name/brand; entries ↔ kols), xem PLAN mục 11. */
export const LISTS = [
  { id: "L1", name: "Vinamilk – Tết 2027", brand: "Vinamilk", owner: "Ngọc Anh", members: ["Khách xem"], kpiViews: 3000000, entries: [["CR-0001", "closed"], ["CR-0004", "closed"], ["CR-0002", "quoted"], ["CR-0003", "zalo"], ["CR-0006", "manager"], ["CR-0027", "none"]] },
  { id: "L2", name: "Beauty Q1/2027", brand: "Innisfree", owner: "Thu Trang", members: ["Ngọc Anh"], kpiViews: 1500000, entries: [["CR-0008", "quoted"], ["CR-0010", "zalo"], ["CR-0009", "manager"], ["CR-0011", "none"], ["CR-0030", "zalo"]] },
  { id: "L3", name: "Tech reviewers", brand: "Samsung", owner: "Minh Đức", members: [], kpiViews: 800000, entries: [["CR-0015", "closed"], ["CR-0016", "none"], ["CR-0017", "manager"]] },
  { id: "L4", name: "Huggies – Ngày của mẹ 2027", brand: "Huggies", owner: "Ngọc Anh", members: [], kpiViews: 1200000, entries: [["CR-0027", "zalo"], ["CR-0024", "none"]] },
  { id: "L5", name: "Panasonic – Mùa hè 2027", brand: "Panasonic", owner: "Ngọc Anh", members: [], kpiViews: 600000, entries: [["CR-0029", "quoted"]] },
].map((l) => ({ ...l, entries: l.entries.map(([id, stage], i) => ({ id, stage, addedAt: ago(3 + i * 2) })) }));
/* Ứng viên mẫu của từng campaign (chưa chốt). */
export const SHORTLIST_SEED = {
  L1: [{ id: "CR-0026", rateIdx: 0 }, { id: "CR-0005", rateIdx: 0 }],
  L4: [{ id: "CR-0001", rateIdx: 0 }, { id: "CR-0003", rateIdx: 0 }, { id: "CR-0002", rateIdx: 0 }],
};

/* ---------- Tiêu đề nội dung gần đây theo ngành (cho dải thumbnail) ---------- */
const CONTENT_TITLES = {
  "Mẹ & Bé": ["Một ngày của mẹ bỉm", "Review tã quần cho bé", "Thực đơn ăn dặm 7 ngày", "Unbox đồ cho bé"],
  "Beauty": ["Skincare routine buổi tối", "Review serum sau 30 ngày", "Makeup đi làm 5 phút", "Haul mỹ phẩm tháng này"],
  "F&B": ["Ăn thử quán mới mở", "Review trà sữa hot trend", "Vào bếp cuối tuần", "Food tour một ngày"],
  "Công nghệ": ["Trên tay điện thoại mới", "So sánh hai flagship", "Setup góc làm việc", "Mẹo dùng máy ít ai biết"],
  "Du lịch": ["3 ngày 2 đêm tự túc", "Homestay view đẹp", "Lịch trình tiết kiệm", "Ăn gì ở phố cổ"],
  "Fashion": ["Phối đồ đi làm cả tuần", "Haul đồ thu đông", "Lookbook cuối tuần", "Mẹo chọn size online"],
  "Game": ["Highlight trận đấu", "Review bàn phím cơ", "Stream giao lưu fan", "Top 5 pha xử lý"],
  "*": ["Vlog một ngày", "Hỏi đáp cùng follower", "Hậu trường quay clip", "Thử thách 24 giờ"],
};

/* ---------- build ---------- */
function rng(seed) { // mulberry32 — ngẫu nhiên có hạt giống để mock ổn định giữa các lần tải
  let a = seed;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const DEFAULT_SOURCE = { tiktok: "crawler", facebook: "crawler", instagram: "api", youtube: "api", threads: "manual" };
const COMPANY_OF = { "CR-0019": "CO-002", "CR-0012": "CO-003" }; // creator qua manager thuộc công ty (MCN thì tự gán CO-001)

function buildCreator(s, idx) {
  const rand = rng(idx * 7919 + 13);
  const stale = s.sync > 30;
  const channels = {};
  Object.entries(s.ch).forEach(([p, [followers, er, avgViews]]) => {
    const source = stale ? "manual" : DEFAULT_SOURCE[p];
    const m = (value, extraDays = 0) => ({ value, source, updatedAt: ago(s.sync + extraDays), verify: source === "manual" ? "unverified" : "verified" });
    // 8 điểm follower theo tháng, kết thúc ở giá trị hiện tại
    const monthly = 0.004 + rand() * 0.04 - (s.rel.status === "dnr" ? 0.03 : 0);
    const growth = [];
    let v = followers;
    for (let i = 0; i < 8; i++) { growth.unshift(Math.round(v)); v = v / (1 + monthly * (0.5 + rand())); }
    channels[p] = {
      url: PLATFORMS[p].base + s.handle, handle: "@" + s.handle, tier: tierOf(followers),
      followers: m(followers), er: m(er), avgViews: m(avgViews, 1),
      growth, growthPct: +(((growth[7] - growth[4]) / growth[4]) * 100).toFixed(1), // tăng trưởng 3 tháng
    };
  });
  const slug = s.handle.replace(/[^a-z0-9]/g, "");
  const n = String(idx + 1).padStart(2, "0");
  const viaMcn = s.rel.via === "mcn";
  const contact = {
    person: s.rel.via === "direct" ? s.name : s.rel.manager,
    phone: `09${10 + (idx % 80)} 555 1${n}`,
    email: viaMcn ? `booking.${slug}@lumi-mcn.example.com` : `${slug}@example.com`,
    zalo: `09${10 + (idx % 80)} 555 1${n}`,
  };
  // 4 nội dung gần đây cho dải thumbnail; bài thứ 2 là branded content (gắn brand đầu tiên) → minh hoạ "brand detection".
  const titles = CONTENT_TITLES[s.cats[0]] || CONTENT_TITLES["*"];
  const content = titles.map((title, i) => ({
    title, platform: i === 3 && Object.keys(s.ch)[1] ? Object.keys(s.ch)[1] : s.hero,
    views: Math.round((s.ch[s.hero][2] * (0.55 + rand() * 1.1)) / 100) * 100,
    days: 2 + i * 4 + Math.floor(rand() * 3), brand: i === 1 ? s.brands[0] : "", tone: ((idx * 2 + i) % 6) + 1,
  }));
  // Đại diện: MCN → Lumi MCN; một số creator qua manager thuộc công ty quản lý; còn lại là Cá nhân (kể cả có manager riêng).
  const companyId = viaMcn ? "CO-001" : COMPANY_OF[s.id] || "";
  return {
    rep: companyId ? "company" : "self", companyId,
    labels: LABELS[s.id] || [], content, photoUrl: PHOTO[s.id] ? PHOTO_BASE + PHOTO[s.id] + ".jpg" : "",
    id: s.id, name: s.name, alias: s.alias, handle: "@" + s.handle, yob: s.yob, age: NOW.getFullYear() - s.yob, gender: s.gender,
    family: s.family, familyNote: s.familyNote, job: s.job, region: s.region,
    type: s.type, categories: s.cats, formats: s.formats, hero: s.hero, tier: tierOf(s.ch[s.hero][0]),
    channels, audience: s.aud,
    rates: s.rates.map(([platform, sow, amount, d]) => ({ platform, sow, amount, updatedAt: ago(d), source: s.rel.via === "direct" ? "Creator báo trực tiếp" : "Rate card từ " + (s.rel.mcn || "manager") })),
    terms: s.terms,
    rel: { ...s.rel, contact },
    brands: s.brands,
    notes: s.notes.map(([d, by, text, kind]) => ({ at: ago(d), by, text, kind })),
    lastSynced: ago(s.sync), createdAt: ago(200 + idx * 9),
  };
}

// Booking đang chạy gắn với campaign nào (Booking tracker dùng để lọc theo campaign người dùng theo dõi).
const BOOKING_LIST = { "BK-2601": "L1", "BK-2603": "L1", "BK-2606": "L2", "BK-2604": "L3", "BK-2607": "L3", "BK-2609": "L5" };
function buildBooking(b) {
  const [id, creatorId, brand, campaign, platform, sow, quoted, closed, date, status, views, er, score, note] = b;
  const deadline = new Date(new Date(date).getTime() + 16 * 864e5).toISOString();
  const creator = SEED.find((c) => c.id === creatorId);
  return {
    id, creatorId, brand, campaign, listId: BOOKING_LIST[id] || null, platform, sow, quoted, closed, date, status, deadline,
    owner: creator.rel.owner,
    contract: status === "confirmed" && closed > 1e8 ? "pending" : "signed",
    contentUrl: status === "posted" || status === "paid" ? PLATFORMS[platform].base + creator.handle + "/post/" + id.toLowerCase() : "",
    perf: views ? { views, er } : null,
    evaluation: score ? { score, note } : null,
    // Bài đã đăng: crawler tự thu số (kiểu "Track content") — hiển thị kèm nguồn + thời điểm, người dùng xác nhận khi đánh giá.
    tracking: status === "posted" ? { views: Math.round(creator.ch[creator.hero][2] * 0.62 / 100) * 100, er: +(creator.ch[creator.hero][1] * 0.9).toFixed(1), source: "crawler", at: ago(0.2) } : null,
  };
}

export const CREATORS = SEED.map(buildCreator);
export const BOOKINGS = BOOKING_SEED.map(buildBooking);

// Đánh dấu trạng thái xác minh cho những chỉ số đang nằm trong hàng chờ / xung đột.
REVIEW_QUEUE.forEach((q) => { CREATORS.find((c) => c.id === q.creatorId).channels[q.platform][q.metric].verify = "pending"; });
CONFLICTS.forEach((cf) => {
  const m = CREATORS.find((c) => c.id === cf.creatorId).channels[cf.platform][cf.metric];
  Object.assign(m, { value: cf.manual.value, source: "manual", updatedAt: cf.manual.at, verify: "conflict" });
});
