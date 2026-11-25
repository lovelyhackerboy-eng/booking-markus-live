// core/store.js — state dùng chung + phân quyền + thao tác ghi. BẢN THẬT: dữ liệu nạp từ /v2/api/snapshot,
// mỗi thao tác ghi gọi API (server kiểm quyền lại); giao diện cập nhật ngay, lỗi thì báo và nạp lại từ server.
// Giữ nguyên tên hàm của prototype để các màn không phải đổi.

import { TEAM } from "../data/catalog.js";
import { api, toCreator, toList, toBooking, FEATURES, stepLabel, setDemoHandler, inDemo } from "../data/live.js";
import { emptyFilters, setOptionsFromData } from "./filters.js";
import { ageDays, toast } from "./ui.js";

const LS = "markus_v2_";
const load = (k, fallback) => { try { const v = localStorage.getItem(LS + k); return v == null ? fallback : JSON.parse(v); } catch (e) { return fallback; } };
const save = (k, v) => { if (inDemo()) return; try { localStorage.setItem(LS + k, JSON.stringify(v)); } catch (e) {} }; // dữ liệu mẫu của hướng dẫn không ghi đè lựa chọn thật

/* ---------- Phân quyền: lấy từ phiên đăng nhập (server quyết định). Viewer KHÔNG có "price"/"contact" ---------- */
export const ROLES = {
  admin: { label: "Admin", perms: ["price", "contact", "edit", "verify", "admin", "allCampaigns"] },
  manager: { label: "Quản lý", perms: ["price", "contact", "edit", "verify", "allCampaigns"] },
  planner: { label: "Planner", perms: ["price", "contact", "edit", "verify"] },
  viewer: { label: "Viewer", perms: [] },
};

export const state = {
  user: null, // { email, name, role, perms }
  role: "viewer",
  team: [], // [{ name, email?, role? }]
  navOpen: load("navOpen", false),
  creators: [],
  bookings: [],
  reviewQueue: [],
  conflicts: [],
  shortlists: {}, // { [campaignId]: [{ id, rateIdx }] } — ứng viên, lưu ở server
  activeListId: load("activeListId", null),
  filters: emptyFilters(),
  ai: null,
  sort: "match",
  sortDir: "desc",
  savedViews: [
    { id: "all", name: "Tất cả", patch: {} },
    { id: "worked", name: "Đã hợp tác", patch: { relStatus: ["active"] } },
    { id: "tiktok", name: "Kênh chính TikTok", patch: { heroes: ["tiktok"] } },
    { id: "hcm", name: "TP.HCM", patch: { regions: ["TP.HCM"] } },
  ],
  lists: [],
  viewMode: load("viewMode", "cards"),
  listCols: load("listCols", ["stage", "rel", "contact", "rate", "owner"]),
  contactView: load("contactView", "board"), // tab Liên hệ: "board" (kanban kéo thả) | "table"
  lastGlobalSync: null,
  autoSync: "Đồng bộ từ Google Sheet",
};

export const can = (perm) => (state.user ? state.user.perms : ROLES.viewer.perms).includes(perm);
export const me = () => (state.user ? state.user.name : "");

/* ---------- pub/sub tối giản: role · shortlist · filters · data · lists ---------- */
const subs = {};
export const on = (evt, fn) => { (subs[evt] = subs[evt] || []).push(fn); };
export const emit = (evt, payload) => (subs[evt] || []).forEach((fn) => fn(payload));

/* ---------- nạp dữ liệu ---------- */
export function applySnapshot(s) {
  state.user = s.user;
  state.role = s.user.role;
  state.team = s.team || [];
  state.config = s.config || state.config || {};
  FEATURES.sheetWrite = !!(s.features && s.features.sheetWrite);
  FEATURES.addCreator = FEATURES.sheetWrite;
  TEAM.length = 0;
  TEAM.push(...state.team.map((p) => p.name).filter(Boolean).sort((a, b) => a.localeCompare(b, "vi")));
  state.creators = (s.creators || []).map(toCreator);
  state.bookings = (s.bookings || []).map(toBooking);
  state.lists = (s.campaigns || []).map(toList);
  state.shortlists = {};
  state.lists.forEach(setCandidatesFrom);
  state.lastGlobalSync = state.creators.reduce((m, c) => (c.lastSynced && (!m || c.lastSynced > m) ? c.lastSynced : m), null);
  setOptionsFromData(state.creators);
  ensureActiveList();
}
function setCandidatesFrom(l) {
  state.shortlists[l.id] = (l.candidates || [])
    .filter((x) => getCreator(x.creatorId))
    .map((x) => { const c = getCreator(x.creatorId); const i = c.rates.findIndex((r) => r.sowKey === x.sow); return { id: x.creatorId, rateIdx: i < 0 ? 0 : i }; });
}
export async function reload() {
  if (inDemo()) return; // trong hướng dẫn: không nạp dữ liệu thật đè lên dữ liệu mẫu
  const s = await api("/snapshot");
  applySnapshot(s);
  emit("data"); emit("lists"); emit("shortlist");
}
/** Hướng dẫn: thay dữ liệu bằng bộ mẫu; handler trả lời mọi lời gọi API (không request nào ra máy chủ). */
export function enterDemo(snapshot, handler) {
  setDemoHandler(handler);
  applySnapshot({ ...snapshot, user: state.user, team: state.team, features: { sheetWrite: false } });
  state.activeListId = snapshot.activeListId || state.lists[0]?.id || null;
  emit("data"); emit("lists"); emit("shortlist");
}
export async function exitDemo() {
  setDemoHandler(null);
  state.activeListId = load("activeListId", null);
  await reload();
}
// Ghi lên server; lỗi → báo và nạp lại để giao diện khớp với server.
const ERR = {
  forbidden: "Vai trò của bạn không làm được thao tác này.", not_found: "Không tìm thấy (có thể bạn không còn theo dõi campaign này).", unauthenticated: "Phiên đăng nhập đã hết, hãy tải lại trang.",
  not_draft: "Chỉ xoá được campaign ở trạng thái Nháp.", has_bookings: "Campaign đã có booking nên không xoá được.", step_has_entries: "Bước bị xoá vẫn còn creator — chọn bước để chuyển họ sang.",
  bad_dates: "Ngày bắt đầu theo dõi phải trước ngày kết thúc.", one_final_step: "Chỉ một bước được đánh dấu là “chốt booking”.", unknown_step: "Bước này không còn trong campaign (đã có người sửa). Đã tải lại.",
};
function send(path, body, after) {
  return api(path, { method: "POST", body })
    .then((r) => { if (after) after(r); return r; })
    .catch((e) => { toast("Chưa lưu được", ERR[e.message] || "Lỗi " + e.message + ". Đã tải lại dữ liệu.", "danger"); reload().catch(() => {}); return null; });
}
const notSupported = () => { toast("Chưa có ở bản này", "Thao tác này sẽ được bật ở đợt sau. Hiện sửa trực tiếp trên Google Sheet.", ""); };

/* ---------- đọc ---------- */
export const getCreator = (id) => state.creators.find((c) => c.id === id);
export const bookingsOf = (id) => state.bookings.filter((b) => b.creatorId === id).sort((a, b) => new Date(b.date) - new Date(a.date));
export const bookingCount = (id) => state.bookings.filter((b) => b.creatorId === id).length;
export const filterCtx = { can, bookingCount };
export const pendingOf = () => 0;

/* ---------- vai trò: chỉ đổi khi đăng nhập lại (không còn ô chọn vai trò demo) ---------- */
export function setRole() {}
export function setNavOpen(v) { state.navOpen = v; save("navOpen", v); }

/* ---------- bộ lọc ---------- */
export function setFilters(filters, ai) {
  state.filters = filters;
  if (ai !== undefined) state.ai = ai;
  emit("filters");
}

/* ---------- Campaign: server chỉ trả campaign người dùng được thấy ---------- */
export const canSeeList = (l) => !!l && state.lists.includes(l);
export const visibleLists = () => state.lists;
export const isMine = (l) => !!l && l.isMine;
function ensureActiveList() {
  if (state.lists.some((l) => l.id === state.activeListId)) return;
  state.activeListId = (state.lists.find(isMine) || state.lists[0] || {}).id || null;
  save("activeListId", state.activeListId);
}
Object.defineProperty(state, "shortlist", {
  get: () => (state.activeListId ? (state.shortlists[state.activeListId] = state.shortlists[state.activeListId] || []) : []),
  set: (v) => { if (state.activeListId) state.shortlists[state.activeListId] = v; },
});
export const activeList = () => state.lists.find((x) => x.id === state.activeListId) || null;
export const getList = (id) => state.lists.find((x) => x.id === id) || null;
export const campaignHash = (tab = "ung-vien", extra = "") => (state.activeListId ? `#/campaign/${state.activeListId}?tab=${tab}${extra}` : "#/campaign");
export const shortlistOf = (listId) => state.shortlists[listId] || [];
export function setActiveList(listId, silent = false) {
  if (state.activeListId === listId || !getList(listId)) return;
  state.activeListId = listId; save("activeListId", listId);
  if (!silent) emit("shortlist");
}
// Sau mỗi thao tác campaign: thay campaign bằng bản server trả về.
const replaceList = (r) => {
  if (!r || !r.campaign) { state.lists = state.lists.filter((l) => l.id !== (r && r.id)); return; }
  const l = toList(r.campaign);
  const i = state.lists.findIndex((x) => x.id === l.id);
  if (i < 0) state.lists.push(l); else state.lists[i] = l;
  setCandidatesFrom(l);
  emit("lists"); emit("shortlist");
};
const campaignOp = (listId, body) => send(`/campaigns/${encodeURIComponent(listId)}`, body, replaceList);

export const inShortlist = (id, listId = state.activeListId) => shortlistOf(listId).some((x) => x.id === id);
export function toggleShortlist(id, force, listId = state.activeListId) {
  if (!can("edit") || !getList(listId)) return false;
  const cur = shortlistOf(listId);
  const has = cur.some((x) => x.id === id);
  const want = force == null ? !has : force;
  if (want && !has) { state.shortlists[listId] = [...cur, { id, rateIdx: 0 }]; campaignOp(listId, { op: "addCandidate", creatorId: id, sow: getCreator(id)?.rates[0]?.sowKey || null }); }
  if (!want && has) { state.shortlists[listId] = cur.filter((x) => x.id !== id); campaignOp(listId, { op: "removeCandidate", creatorId: id }); }
  emit("shortlist");
  return want;
}
export function setShortlistRate(id, rateIdx) {
  const it = state.shortlist.find((x) => x.id === id);
  if (!it || !can("edit")) return;
  it.rateIdx = rateIdx;
  campaignOp(state.activeListId, { op: "setCandidateSow", creatorId: id, sow: getCreator(id)?.rates[rateIdx]?.sowKey || null });
  emit("shortlist");
}
export function clearShortlist() { if (!can("edit") || !state.activeListId) return; state.shortlist = []; campaignOp(state.activeListId, { op: "clearCandidates" }); emit("shortlist"); }
/** "Duyệt": ứng viên → bước Liên hệ (server ghi luôn 1 dòng vào timeline của creator). */
export function commitShortlist(ids, listId = state.activeListId) {
  const l = getList(listId);
  if (!can("edit") || !l || !ids.length) return 0;
  const fresh = ids.filter((id) => !l.entries.some((e) => e.id === id));
  fresh.forEach((id) => l.entries.push({ id, stage: "none", addedAt: new Date().toISOString() }));
  state.shortlists[listId] = shortlistOf(listId).filter((x) => !ids.includes(x.id));
  campaignOp(listId, { op: "approve", creatorIds: ids }).then(() => reloadCreatorNotes(ids));
  emit("shortlist"); emit("lists");
  return fresh.length;
}
// Ghi chú mới do server tạo → nạp lại để timeline đúng (nhẹ: chỉ khi có quyền xem ghi chú).
function reloadCreatorNotes(ids) {
  if (!can("contact")) return;
  ids.forEach((id) => api(`/creators/${encodeURIComponent(id)}`).then((r) => {
    const i = state.creators.findIndex((c) => c.id === id);
    if (i >= 0 && r.creator) { state.creators[i] = toCreator(r.creator); emit("data"); }
  }).catch(() => {}));
}

/* ---------- ghi: creator ---------- */
export function addNote(id, text, kind = "") {
  const c = getCreator(id);
  c.notes.unshift({ at: new Date().toISOString(), by: me(), text, kind });
  emit("data");
  send(`/creators/${encodeURIComponent(id)}/notes`, { text, kind });
}
export function setRelStatus() { notSupported(); }
export function addRate() { notSupported(); }
export function approveReview() { notSupported(); }
export function rejectReview() { notSupported(); }
export function resolveConflict() { notSupported(); }
export function verifyMetric() { notSupported(); }
export function syncCreator() { notSupported(); return 0; }
export function syncNow() { notSupported(); return 0; }
export function editMetric() { notSupported(); }
export function addCreators() { notSupported(); }
export function addCreatorWithQueue() { notSupported(); }
export function setLabels() { notSupported(); }

/* ---------- ghi: booking ---------- */
export const BOOKING_STAGES = [
  { id: "confirmed", label: "Đã xác nhận", next: "Gửi duyệt nội dung" },
  { id: "content", label: "Duyệt nội dung", next: "Đánh dấu đã đăng" },
  { id: "posted", label: "Đã đăng", next: "Đã thanh toán" },
  { id: "paid", label: "Đã thanh toán", next: "" },
];
const replaceBooking = (r) => {
  if (!r || !r.booking) return;
  const b = toBooking(r.booking);
  const i = state.bookings.findIndex((x) => x.id === b.id);
  if (i >= 0) state.bookings[i] = b;
  emit("data");
};
export function advanceBooking(id) {
  const b = state.bookings.find((x) => x.id === id);
  const i = BOOKING_STAGES.findIndex((s) => s.id === b.status);
  if (i < BOOKING_STAGES.length - 1) b.status = BOOKING_STAGES[i + 1].id;
  send(`/bookings/${encodeURIComponent(id)}`, { op: "advance" }, replaceBooking);
  emit("data");
  return b;
}
export function evaluateBooking(id, { score, note, views, er }) {
  const b = state.bookings.find((x) => x.id === id);
  b.evaluation = { score, note };
  b.perf = { views, er };
  send(`/bookings/${encodeURIComponent(id)}`, { op: "evaluate", score, note: note || "", views: views ?? null, er: er ?? null }, replaceBooking);
  emit("data");
}
/** Booking tracker: Quản lý / Admin thấy tất cả; người khác thấy booking mình phụ trách hoặc thuộc campaign mình theo dõi. */
export const canSeeBooking = (b) => can("allCampaigns") || b.mine || (!!b.listId && !!getList(b.listId));
export function createBookings(items, brand, campaign, listId = null) {
  const body = {
    campaignId: listId, brand: brand || "", campaignName: campaign || "",
    items: items.map((it) => {
      const c = getCreator(it.id);
      const r = c.rates[it.rateIdx] || c.rates[0];
      return { creatorId: c.id, platform: (r && r.platform) || c.hero, sow: r ? r.sow : "", amount: r && r.amount != null ? r.amount : null };
    }),
  };
  return send("/bookings", body, (r) => { (r.bookings || []).forEach((b) => state.bookings.unshift(toBooking(b))); emit("data"); });
}

/* ---------- Bước "Liên hệ" của campaign ---------- */
export const listsOf = (creatorId) => visibleLists().filter((l) => l.entries.some((e) => e.id === creatorId));
export function toggleInList(listId, creatorId, force) {
  const l = getList(listId);
  if (!can("edit") || !l) return false;
  const has = l.entries.some((e) => e.id === creatorId);
  const want = force == null ? !has : force;
  if (want && !has) { l.entries.push({ id: creatorId, stage: l.steps[0]?.key || "none", position: 999, addedAt: new Date().toISOString() }); campaignOp(listId, { op: "addEntry", creatorId }); }
  if (!want && has) { l.entries = l.entries.filter((e) => e.id !== creatorId); campaignOp(listId, { op: "removeEntry", creatorId }); }
  emit("lists");
  return want;
}
/** Tạo campaign (server cấp id) → thành campaign đang làm. Trả về Promise<campaign | null>. */
export async function createList(name, brand = "", kpiViews = 0) {
  if (!can("edit")) return null;
  const r = await send("/campaigns", { name, brand, kpiViews: kpiViews || 0 });
  if (!r || !r.campaign) return null;
  const l = toList(r.campaign);
  state.lists.push(l);
  setCandidatesFrom(l);
  state.activeListId = l.id; save("activeListId", l.id);
  emit("lists"); emit("shortlist");
  return l;
}
export const canManageList = (l) => !!l && can("edit") && (l.canManage || can("allCampaigns"));
/** members = danh sách TÊN (giao diện chọn theo tên) → đổi sang email để gửi server. */
export function setMembers(listId, members) {
  const l = getList(listId);
  if (!canManageList(l)) return;
  const emails = members.map((n) => (state.team.find((p) => p.name === n) || {}).email).filter(Boolean);
  l.members = members.filter((m) => m !== l.owner);
  campaignOp(listId, { op: "members", emails });
  emit("lists");
}
export function setListStage(listId, creatorId, stage) {
  const l = getList(listId);
  const e = l && l.entries.find((x) => x.id === creatorId);
  if (!can("edit") || !e || e.stage === stage) return;
  e.stage = stage;
  const c = getCreator(creatorId);
  if (c && can("contact")) c.notes.unshift({ at: new Date().toISOString(), by: me(), text: `Tiến độ liên hệ → “${stepLabel(l, stage)}” (campaign ${l.name}).`, kind: "" });
  campaignOp(listId, { op: "setStage", creatorId, stage });
  emit("lists");
}
/** Kéo thả trên kanban: đổi bước và/hoặc vị trí trong bước. Cập nhật ngay trên máy rồi ghi server. */
export function moveEntry(listId, creatorId, stage, position) {
  const l = getList(listId);
  const e = l && l.entries.find((x) => x.id === creatorId);
  if (!can("edit") || !e) return null;
  const col = l.entries.filter((x) => x.stage === stage && x.id !== creatorId).sort((a, b) => a.position - b.position);
  const pos = Math.max(0, Math.min(position ?? col.length, col.length));
  col.splice(pos, 0, e);
  const moved = e.stage !== stage;
  e.stage = stage;
  col.forEach((x, i) => { x.position = i; });
  const c = getCreator(creatorId);
  if (moved && c && can("contact")) c.notes.unshift({ at: new Date().toISOString(), by: me(), text: `Tiến độ liên hệ → “${stepLabel(l, stage)}” (campaign ${l.name}).`, kind: "" });
  emit("lists");
  return campaignOp(listId, { op: "moveEntry", creatorId, stage, position: pos });
}
/** Sửa thông tin campaign: { name, brand, kpiViews, description, budget, startDate, endDate, autoTrack, trackFrom, trackTo }. */
export const updateCampaign = (listId, fields) => (can("edit") ? campaignOp(listId, { op: "update", ...fields }) : Promise.resolve(null));
export const setCampaignStatus = (listId, status) => (canManageList(getList(listId)) ? campaignOp(listId, { op: "setStatus", status }) : Promise.resolve(null));
/** steps = [{ key?, label, final? }] theo thứ tự mới; moveTo = bước nhận creator của các bước bị xoá. */
export const saveSteps = (listId, steps, moveTo) => (canManageList(getList(listId)) ? campaignOp(listId, { op: "steps", steps, ...(moveTo ? { moveTo } : {}) }) : Promise.resolve(null));
/** Xoá campaign Nháp (không có booking). Trả về true nếu đã xoá. */
/** Xoá được: người phụ trách / Quản lý khi còn Nháp; campaign đã chạy (Đang chạy, Hoàn thành) chỉ Admin. */
export const canDeleteList = (l) => canManageList(l) && (l.status === "draft" || can("admin"));
/** Xoá mềm: campaign chuyển sang "Đã xoá" — ẩn khỏi danh sách và báo cáo, dữ liệu vẫn giữ, Admin khôi phục được. */
export async function deleteCampaign(listId) {
  const l = getList(listId);
  if (!canDeleteList(l)) return false;
  const r = await send(`/campaigns/${encodeURIComponent(listId)}`, { op: "delete" });
  if (!r) return false;
  state.lists = state.lists.filter((x) => x.id !== listId);
  delete state.shortlists[listId];
  if (state.activeListId === listId) { state.activeListId = state.lists[0]?.id || null; save("activeListId", state.activeListId); }
  emit("lists"); emit("shortlist");
  return true;
}
export const allLabels = () => [];
/** Tài liệu của creator: chưa có kho tài liệu thật. */
export function docsOf() { return []; }
export function setPref(key, value) { state[key] = value; save(key, value); }
export { FEATURES, ageDays };
