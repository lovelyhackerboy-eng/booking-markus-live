// data/live.js — nối UI với API thật dưới /v2/api. Không có dữ liệu mẫu nào ở trình duyệt.
// 1) api(): gọi API cùng origin, tự gửi X-CSRF-Token cho thao tác ghi.
// 2) toCreator / toList / toBooking: đổi bản ghi API sang đúng hình dạng các màn đang dùng (từ prototype).
//    Trường chưa có nguồn thật (ER, view TB, tăng trưởng, audience, brand, nội dung) nhận giá trị rỗng đúng kiểu;
//    các màn ẩn phần đó theo FEATURES bên dưới.
import { tierOf } from "./catalog.js";

export const API = (window.MK_CONFIG && window.MK_CONFIG.api) || "/v2/api";
// Phần nào của prototype đã có dữ liệu / API thật. false = ẩn khỏi giao diện.
export const FEATURES = {
  metricsExtra: false, // ER, view trung bình, tăng trưởng, biểu đồ
  audience: false,
  brands: false, // brand đã hợp tác, đối thủ
  content: false, // thumbnail bài đăng gần đây
  dataSync: false, // màn "Dữ liệu & đồng bộ", hàng chờ duyệt
  addCreator: false, // thêm / sửa creator (chờ bật ghi Sheet)
  editMetrics: false, // sửa follower, thêm giá, đổi trạng thái quan hệ, label
  copilot: false, // trợ lý AI (bản mẫu trả lời giả)
};

let csrf = "";
export async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: { ...(body ? { "content-type": "application/json" } : {}), ...(method !== "GET" ? { "x-csrf-token": csrf } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    credentials: "same-origin",
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || "http_" + res.status);
    err.status = res.status;
    throw err;
  }
  if (data.csrf) csrf = data.csrf;
  return data;
}

export const SOW_LABEL = { photo: "Bài đăng ảnh", video: "Video", event: "Sự kiện", brandvideo: "Video cho nhãn hàng", live: "Livestream" };
const REL_KEY = { "da hop tac": "active", "da bao gia": "quoted", "chua lien he": "network" };
const fold = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase().trim();
export const regionShort = (s) => {
  const t = String(s || "").replace(/^(Thành phố|TP\.?|Tỉnh)\s*/i, "").trim();
  return /hồ chí minh|hcm/i.test(t) ? "TP.HCM" : t;
};
const metric = (value, source, at) => ({ value: value ?? null, source: source === "sheet" || !source ? "sheet" : source, updatedAt: at || null, verify: "unverified" });
const empty = () => ({ value: null, source: "sheet", updatedAt: null, verify: "unverified" });

export function toCreator(a) {
  const channels = {};
  Object.entries(a.channels || {}).forEach(([p, ch]) => {
    const f = ch.followers ?? null;
    channels[p] = {
      url: ch.url || "", handle: ch.label || "", tier: f ? tierOf(f) : "",
      followers: metric(f, ch.followersSource, ch.followersUpdatedAt), er: empty(), avgViews: empty(), growth: [], growthPct: null,
    };
  });
  const order = Object.keys(channels).sort((x, y) => (channels[y].followers.value || 0) - (channels[x].followers.value || 0));
  const hero = a.heroPlatform && channels[a.heroPlatform] ? a.heroPlatform : order[0] || a.heroPlatform || "tiktok";
  const heroF = channels[hero]?.followers.value || 0;
  const rates = (a.rates || [])
    .map((r) => ({ platform: r.platform || hero, sow: SOW_LABEL[r.sow] || r.sow, sowKey: r.sow, amount: r.amount ?? null, text: r.amountText || "", terms: r.terms || "", updatedAt: r.updatedAt, source: r.source || "Google Sheet" }))
    .sort((x, y) => (x.amount == null) - (y.amount == null) || (x.amount || 0) - (y.amount || 0));
  const ct = a.contact || {};
  const rep = String(a.representation || "");
  const year = new Date().getFullYear();
  return {
    id: a.id, name: a.name, alias: a.alias || "", handle: channels[hero]?.handle || "",
    yob: a.yearOfBirth || null, age: a.yearOfBirth ? year - a.yearOfBirth : null, gender: a.gender || "",
    family: "", familyNote: "", job: a.castingProfile || "", region: regionShort(a.baseLocation),
    type: a.creatorType || "", categories: [a.primaryCategory, a.secondaryCategory].filter(Boolean), formats: [],
    hero, tier: a.tier || (heroF ? tierOf(heroF) : "Nano"),
    channels, audience: { female: null, age: "", cities: [], tags: [] },
    rates, terms: null,
    rel: {
      status: REL_KEY[fold(a.relationshipStatus)] || (a.relationshipStatus ? "network" : "network"), statusText: a.relationshipStatus || "",
      owner: a.owner || "", via: /mcn|agency|công ty|company/i.test(rep) ? "mcn" : /manager/i.test(rep) ? "manager" : "direct", manager: "",
      score: null, resp: "", nego: "", channel: ct.contactChannel || "",
      contact: { person: ct.contactPerson || "", phone: ct.personalPhone || ct.companyPhone || "", email: ct.personalEmail || ct.companyEmail || "", zalo: ct.contactDetail || "", website: ct.companyWebsite || "" },
    },
    representation: rep, rep: /self|cá nhân|tự quản/i.test(rep) || !rep ? "self" : "company", companyId: "",
    note: a.note || "",
    brands: [], labels: [], content: [], photoUrl: "",
    notes: (a.notes || []).map((n) => ({ at: n.createdAt, by: n.authorName || "", text: n.body, kind: n.kind || "" })),
    lastSynced: a.syncedAt || a.updatedAt, createdAt: a.syncedAt || a.updatedAt,
  };
}

export function toList(c) {
  return {
    id: c.id, name: c.name, brand: c.brand || "", owner: c.owner || "", members: (c.members || []).filter(Boolean),
    kpiViews: c.kpiViews || 0, isMine: !!c.isMine, canManage: !!c.canManage,
    entries: (c.entries || []).map((e) => ({ id: e.creatorId, stage: e.stage, addedAt: e.addedAt })),
    candidates: c.candidates || [],
  };
}

export function toBooking(b) {
  return {
    id: b.id, creatorId: b.creatorId, brand: b.brand || "", campaign: b.campaignName || "", listId: b.campaignId || null,
    platform: b.platform || "tiktok", sow: b.sow || "", quoted: b.quotedAmount ?? null, closed: b.closedAmount ?? null,
    date: b.bookedOn, status: b.status, deadline: b.deadline, owner: b.owner || "", mine: !!b.mine, contract: b.contract || "signed",
    contentUrl: b.contentUrl || "", perf: b.views != null ? { views: b.views, er: b.er } : null,
    evaluation: b.score != null ? { score: b.score, note: b.evaluationNote || "" } : null, tracking: null,
  };
}

export async function loadSession() {
  try {
    return await api("/auth/session");
  } catch (e) {
    if (e.status === 401) return null;
    throw e;
  }
}
export const loadSnapshot = () => api("/snapshot");
export async function logout() {
  try { await api("/auth/logout", { method: "POST" }); } catch (e) { /* phiên đã hết */ }
}
