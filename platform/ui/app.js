// app.js — khởi động: khai báo route, vẽ nav (sidebar + bottom nav từ CÙNG một mảng NAV), nối vai trò / phong cách / theme / copilot.
// Muốn thêm màn: (1) tạo views/ten-man.js export render(), (2) thêm 1 dòng route(), (3) thêm 1 mục vào NAV.
// Muốn thêm hướng visual: (1) tạo styles/ten.css với [data-style="ten"], (2) thêm <link> trong index.html,
//                         (3) thêm 1 mục vào STYLES dưới đây và vào NATIVE trong script đầu index.html.

import { $, $$, esc, icon, openMenu } from "./core/ui.js";
import { state, can, on, setNavOpen, ROLES, activeList, campaignHash, canSeeBooking, applySnapshot, FEATURES } from "./core/store.js";
import { loadSession, loadSnapshot, logout } from "./data/live.js";
import { renderLogin } from "./views/login.js";
import { route, start, refresh, current } from "./core/router.js";
import { initCopilot, openCopilot, refreshContext, resetCopilot } from "./ai/copilot.js";
import * as discovery from "./views/discovery.js";
import * as profile from "./views/profile.js";
import * as addCreator from "./views/add-creator.js";
import * as lists from "./views/lists.js";
import * as shortlist from "./views/shortlist.js";
import * as campaigns from "./views/campaigns.js";
import * as bookings from "./views/bookings.js";
import * as freshness from "./views/freshness.js";
import { initFeedback } from "./core/feedback.js";

/* ---------- Route: user journey Discover → Evaluate → Book → Learn ---------- */
route("kham-pha", discovery, "kham-pha");
route("creator/:id", profile, "kham-pha");
// Màn chưa bật ở bản thật (FEATURES) → trang báo "chưa có", kể cả khi gõ thẳng URL.
const notYet = (what) => ({ render: (el) => { el.innerHTML = `<div class="card empty"><strong>${what} chưa có ở bản này</strong><p class="muted">Sẽ bật ở đợt tiếp theo. Hiện làm việc này trên Google Sheet hoặc app cũ.</p><a class="btn" href="#/kham-pha">Về Khám phá</a></div>`; } });
route("them-creator", FEATURES.addCreator ? addCreator : notYet("Thêm creator"), "them-creator");
route("campaign", campaigns, "campaign");
route("campaign/:id", campaigns, "campaign");
// Link cũ (#/shortlist, #/danh-sach) vẫn chạy: chuyển sang bước tương ứng của campaign đang làm.
const alias = (tab) => ({ render: (el, p) => { location.replace(campaignHash(tab, (p.tab === "compare" ? "&view=compare" : "") + (p.export ? "&export=1" : ""))); } });
route("shortlist", alias("ung-vien"), "campaign");
route("danh-sach", alias("lien-he"), "campaign");
route("booking", bookings, "booking");
route("du-lieu", FEATURES.dataSync ? freshness : notYet("Dữ liệu & đồng bộ"), "du-lieu");

/* ---------- Nav: step = nhãn nhóm (chỉ hiện khi sidebar mở rộng) ---------- */
const NAV = [
  { id: "them-creator", label: "Thêm creator", short: "Thêm", icon: "plus", cta: true, perm: "edit", feature: "addCreator" },
  { step: "1 · Khám phá" },
  { id: "kham-pha", label: "Khám phá creator", short: "Khám phá", icon: "compass" },
  { step: "2 · Campaign" },
  { id: "campaign", label: "Campaign", short: "Campaign", icon: "users" },
  { step: "3 · Booking" },
  { id: "booking", label: "Booking tracker", short: "Booking", icon: "calendar", badge: () => state.bookings.filter((b) => b.status !== "paid" && canSeeBooking(b)).length },
  { step: "4 · Học từ dữ liệu", feature: "dataSync" },
  { id: "du-lieu", label: "Dữ liệu & đồng bộ", short: "Dữ liệu", icon: "data", feature: "dataSync", badge: () => state.reviewQueue.length + state.conflicts.length },
];
// Mobile: 4 mục + nút "Thêm" nổi ở giữa thanh dưới. "Dữ liệu & đồng bộ" là icon trên topbar (#btn-data-m).
const MOBILE_ORDER = ["kham-pha", "campaign", "them-creator", "booking"];

// Icon nav: outline khi thường, bản fill khi là mục đang mở (như SF Symbols). size: 20–22 ở sidebar, 24 ở tab bar mobile.
function navItem(n, activeId, compact, size = 22) {
  const badge = n.badge ? n.badge() : 0;
  return `<a class="nav-item ${n.cta ? "nav-cta" : ""}" href="#/${n.id}" ${n.id === activeId ? 'aria-current="page"' : ""} title="${esc(n.label)}">
    ${icon(n.icon, { size: size, variant: n.id === activeId && !n.cta ? "fill" : "outline" })}<span>${esc(compact ? n.short : n.label)}</span>${badge ? `<span class="nav-badge" aria-label="${badge} mục">${badge}</span>` : ""}</a>`;
}
function drawNav() {
  const activeId = current() ? current().nav : "";
  const items = NAV.filter((n) => (!n.perm || can(n.perm)) && (!n.feature || FEATURES[n.feature]));
  $("#nav").innerHTML = items.map((n) => (n.step ? `<div class="nav-step">${esc(n.step)}</div>` : navItem(n, activeId, !state.navOpen, state.navOpen ? 20 : 22))).join("");
  // Viewer không có "Thêm" → thanh dưới tự co còn 4 cột (grid-auto-flow), không để lỗ trống.
  $("#bottom-nav").innerHTML = MOBILE_ORDER.map((id) => items.find((n) => n.id === id)).filter(Boolean).map((n) => navItem(n, activeId, true, 24)).join("");
  $("#app").classList.toggle("nav-open", state.navOpen);
  const t = $("#btn-nav-toggle");
  t.setAttribute("aria-expanded", String(state.navOpen));
  t.innerHTML = `${icon("sidebar", { size: 20, variant: state.navOpen ? "fill" : "outline" })}<span>${state.navOpen ? "Thu gọn menu" : "Mở rộng"}</span>`;
  $("#shortlist-count").textContent = state.shortlist.length;
  $("#shortlist-count").dataset.zero = String(!state.shortlist.length); // badge đỏ kiểu iOS chỉ khi có mục
  $("#btn-shortlist").title = activeList() ? `Ứng viên của campaign đang làm: ${activeList().name}` : "Bạn chưa theo dõi campaign nào";
  const need = state.reviewQueue.length + state.conflicts.length;
  $("#btn-data-m").hidden = !FEATURES.dataSync;
  $("#btn-data-m").innerHTML = `${icon("data", 20)}${need ? `<span class="dot" aria-label="${need} chỉ số cần xem lại">${need}</span>` : ""}`;
}

/* ---------- Phong cách (hướng visual) + theme sáng/tối ----------
   Chỉ đổi 2 thuộc tính trên <html>; toàn bộ giao diện đổi theo token, KHÔNG vẽ lại DOM. */
const STYLES = [
  { id: "luxe", label: "Midnight Luxe", hint: "Navy + gold, panel kính", theme: "dark" },
  { id: "pop", label: "Creator Pop", hint: "Gradient tươi, bo lớn, sticker", theme: "light" },
  { id: "bento", label: "Editorial Bento", hint: "Tạp chí, chữ số cực lớn", theme: "light" },
];
const html = document.documentElement;
const pref = (k, v) => { try { localStorage.setItem("markus_proto_" + k, v); } catch (e) {} };
function drawStyle() {
  const s = STYLES.find((x) => x.id === html.dataset.style) || STYLES[0];
  const dark = html.dataset.theme === "dark";
  $("#btn-style").innerHTML = `${icon("palette", 18)}<span class="style-name">${esc(s.label)}</span>`;
  $("#btn-style").setAttribute("aria-label", `Phong cách giao diện: ${s.label}`);
  $("#btn-style").setAttribute("aria-label", `Phong cách: ${s.label}. Bấm để đổi`);
  $("#btn-theme").innerHTML = icon(dark ? "sun" : "moon", { size: 20, variant: "fill" });
  $("#btn-theme").title = dark ? "Chuyển giao diện sáng" : "Chuyển giao diện tối";
}
function setStyle(id) {
  const s = STYLES.find((x) => x.id === id);
  html.dataset.style = s.id; pref("style", s.id);
  html.dataset.theme = s.theme; pref("theme", s.theme); // mỗi hướng mở ở theme "gốc" của nó; người dùng vẫn đổi sáng/tối được
  drawStyle();
}
function setTheme(theme) { html.dataset.theme = theme; pref("theme", theme); drawStyle(); }
$("#btn-style").addEventListener("click", (e) => openMenu(e.currentTarget, () => [
  { title: "Phong cách" },
  ...STYLES.map((s) => ({ label: `${s.label} — ${s.hint}`, checked: html.dataset.style === s.id, keepOpen: true, run: () => setStyle(s.id) })),
  { sep: true },
  { title: "Giao diện" },
  { label: "Sáng", checked: html.dataset.theme === "light", keepOpen: true, run: () => setTheme("light") },
  { label: "Tối", checked: html.dataset.theme === "dark", keepOpen: true, run: () => setTheme("dark") },
]));
$("#btn-theme").addEventListener("click", () => setTheme(html.dataset.theme === "dark" ? "light" : "dark"));

/* ---------- Khung ---------- */
$("#ask-ico").innerHTML = icon("sparkles", { size: 18, variant: "fill" });
$("#shortlist-ico").innerHTML = icon("list", 18);
$("#role-ico").innerHTML = icon("person", 20);
$("#btn-ask").addEventListener("click", () => openCopilot());
$("#btn-shortlist").addEventListener("click", () => shortlist.openShortlistDrawer());
initFeedback($("#btn-feedback"));
$("#btn-nav-toggle").addEventListener("click", () => { setNavOpen(!state.navOpen); drawNav(); });
// Người đang đăng nhập (vai trò do server quyết định theo tab Employees) + đăng xuất.
function drawUser() {
  const u = state.user;
  $("#user-name").textContent = u ? u.name : "";
  $("#user-role").textContent = u ? ROLES[u.role].label : "";
  $("#user-chip").title = u ? `${u.email} · vai trò ${ROLES[u.role].label} (theo tab Employees)` : "";
}
$("#btn-logout").addEventListener("click", async () => { await logout(); location.reload(); });
$("#btn-ask").hidden = !FEATURES.copilot;

// Ngữ cảnh copilot = view hiện tại tự khai báo; view không khai báo thì dùng mặc định.
const DEFAULT_CTX = { label: "Markus Creator OS", actions: [] };
initCopilot({
  getContext: () => {
    const hit = current();
    const ctx = hit && hit.view.copilot ? hit.view.copilot(hit.params) : DEFAULT_CTX;
    return { ...ctx, label: `${ctx.label} · vai trò ${ROLES[state.role].label}` };
  },
});

/* ---------- Store → UI ---------- */
on("role", () => { resetCopilot(); refresh(); });  // đổi vai trò = xoá log AI + vẽ lại toàn bộ (ẩn/hiện giá & liên hệ)
on("data", () => { refresh(); });                 // dữ liệu đổi = vẽ lại màn hiện tại
on("filters", () => current()?.view.onFilters?.());
// Nút "Lưu vào danh sách" có thể nằm ở nhiều nơi (thẻ kết quả, hồ sơ, drawer) → cập nhật nhãn tại chỗ.
const syncSaveButtons = () => $$("[data-save]").forEach((b) => { b.innerHTML = lists.saveLabel(b.dataset.save, b.hasAttribute("data-compact")); });
on("shortlist", () => { drawNav(); syncSaveButtons(); current()?.view.onShortlist?.(); });
on("lists", () => { syncSaveButtons(); current()?.view.onLists?.(); });

// Tắt các phần chưa có dữ liệu thật: <html class="f-off-xxx"> + CSS [data-f="xxx"] { display: none }.
Object.entries(FEATURES).forEach(([k, on]) => { if (!on) html.classList.add("f-off-" + k); });
drawStyle();
// Khởi động: chưa đăng nhập → màn đăng nhập Google; đã đăng nhập → nạp dữ liệu theo vai trò rồi mới vẽ.
(async () => {
  let session = null;
  try { session = await loadSession(); } catch (e) { $("#main").innerHTML = `<div class="card empty"><strong>Không kết nối được máy chủ</strong><p class="muted">Thử tải lại trang sau ít phút.</p></div>`; return; }
  if (!session) { renderLogin(); return; }
  $("#main").innerHTML = `<div class="card empty"><strong>Đang tải dữ liệu…</strong></div>`;
  applySnapshot(await loadSnapshot());
  drawUser();
  start($("#main"), () => { drawNav(); refreshContext(); });
})();
