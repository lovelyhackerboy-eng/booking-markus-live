// core/tour.js — HƯỚNG DẪN cho người mới: danh sách checkpoint (mỗi checkpoint = 1 chức năng) + tour spotlight
// khoanh vùng và chỉ từng bước ngay trên màn hình thật, chạy trên DỮ LIỆU MẪU NGẪU NHIÊN (core/demo.js).
// - Lần đầu đăng nhập: tự mở bảng "Bắt đầu nhanh". Sau đó mở lại bằng nút "Hướng dẫn" trên topbar.
// - Bỏ qua bất cứ lúc nào (nút, phím Esc). Xem lại checkpoint đã xong. Tiến độ lưu ở trình duyệt (localStorage).
// - Trong hướng dẫn mọi lời gọi API đi qua demoApi: KHÔNG có request nào ghi lên máy chủ; thoát là nạp lại dữ liệu thật.

import { $, esc, icon, toast, openOverlay, delegate } from "./ui.js";
import { state, can, enterDemo, exitDemo, moveEntry, getList, emit } from "./store.js";
import { CURRENT } from "../data/releases.js";
import { makeDemo, demoApi } from "./demo.js";
import { inDemo } from "../data/live.js";
import { invalidate as invalidateReports } from "../views/reports.js";
import { invalidateAll as invalidateAdmin } from "../views/admin.js";
import { seenVersion } from "../views/about.js";

const KEY = "markus_v2_tour";
const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } };
const write = (v) => { try { localStorage.setItem(KEY, JSON.stringify({ ...read(), ...v })); } catch (e) {} };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- Kịch bản: mỗi checkpoint là một chuỗi bước { hash?, sel, title, body, place?, run? } ----------
   QUY TẮC DỰ ÁN (CLAUDE.md): tính năng mới / đổi giao diện → thêm hoặc sửa checkpoint ở đây trong CÙNG lần release,
   ghi `since` = phiên bản (data/releases.js). Checkpoint mới hơn bản người dùng đã xem hiện nhãn "Mới".
   `perm` = chỉ hiện với vai trò có quyền đó. Selector ưu tiên [data-tour=…] để đổi giao diện không làm gãy hướng dẫn. */
export const CHECKPOINTS = [
  { id: "discover", since: "1.0.0", title: "Tìm creator phù hợp", goal: "Lọc kho creator, đọc view trung bình / ER, lưu vào campaign.", steps: [
    { hash: "#/kham-pha", sel: "#btn-ask", title: "Hỏi bằng câu tự nhiên", body: "Gõ như nói chuyện: “creator mẹ bỉm TP.HCM dưới 500K follower, view tốt”. AI đọc câu và đặt bộ lọc giúp bạn (Ctrl K)." },
    { sel: ".disc-side", title: "Bộ lọc chi tiết", body: "Lọc theo nền tảng, tier, ngành, khu vực, giá… Mỗi lựa chọn lọc ngay danh sách bên phải.", place: "right" },
    { sel: ".res-stats, .dt.sheet tbody tr", title: "Chỉ số tự cập nhật", body: "View trung bình và ER tính từ các clip gần nhất (YouTube tự đọc mỗi ngày; TikTok, Facebook, Instagram nhập tay). Admin chỉnh công thức được." },
    { sel: "[data-save]", title: "Lưu vào campaign", body: "Bấm để đưa creator vào bước Ứng viên của một campaign (hoặc tạo campaign mới ngay tại đây)." },
  ] },
  { id: "campaign", since: "1.0.0", title: "Tạo & quản lý campaign", goal: "Nháp → Đang chạy → Hoàn thành, cài đặt ngày, ngân sách, các bước.", steps: [
    { hash: "#/campaign", sel: "[data-act=new]", title: "Tạo campaign", body: "Campaign mới luôn bắt đầu ở trạng thái Nháp. Campaign nháp xoá được." },
    { sel: "[data-tour=camp-status-filter]", title: "Lọc theo trạng thái", body: "Xem nhanh campaign Nháp, Đang chạy hay đã Hoàn thành." },
    { sel: "[data-tour=camp-delete]", title: "Xoá campaign", body: "Xoá chỉ ẩn campaign khỏi danh sách và báo cáo — dữ liệu vẫn được giữ, Admin khôi phục được. Campaign đã chạy chỉ Admin xoá." },
    { hash: "#/campaign/demo-run?tab=ung-vien", sel: "[data-tour=camp-lifecycle]", title: "Vòng đời campaign", body: "Từ lên kế hoạch tới đang chạy và hoàn thành. Nút “Hoàn thành campaign” chốt số liệu để báo cáo; mở lại được nếu cần." },
    { sel: "[data-tour=camp-settings]", title: "Cài đặt campaign", body: "Mô tả / brief, KPI view, ngân sách, ngày chạy, khoảng ngày theo dõi bài đăng và thêm / sửa / xoá / sắp xếp các bước liên hệ." },
  ] },
  { id: "candidates", since: "1.0.0", title: "Chọn & duyệt ứng viên", goal: "So sánh, ước tính KPI, duyệt creator sang bước Liên hệ.", steps: [
    { hash: "#/campaign/demo-run?tab=ung-vien", sel: ".project-bar", title: "Ước tính KPI", body: "View dự kiến của creator đã duyệt so với KPI của campaign — biết ngay còn thiếu bao nhiêu." },
    { sel: "[data-commit], [data-act=commit-all]", title: "Duyệt ứng viên", body: "Bấm Duyệt để chuyển creator sang bước Liên hệ. Có thể duyệt từng người hoặc cả danh sách." },
  ] },
  { id: "contact", since: "1.0.0", title: "Kéo thả tiến độ liên hệ", goal: "Đưa creator qua các bước tới “Đã chốt” bằng kanban.", steps: [
    { hash: "#/campaign/demo-run?tab=lien-he", sel: ".kanban", title: "Kanban các bước", body: "Mỗi cột là một bước (đổi được ở Cài đặt). Kéo thẻ creator sang cột khác để cập nhật — tự ghi vào CRM của creator." },
    { sel: ".kb-col:first-child .kb-card", title: "Thử kéo thả", body: "Xem ví dụ: thẻ này sẽ tự chuyển sang bước kế tiếp. Trên điện thoại / bàn phím dùng ô chọn bước trên thẻ hoặc Alt + ← →.", todo: "Nhìn thẻ được nhấc lên và tự sang cột bên cạnh, rồi bấm “Tiếp”.", run: demoMove },
    { sel: "[data-tour=contact-view]", title: "Kanban hoặc Bảng", body: "Chuyển sang dạng bảng để lọc, chọn nhiều dòng và đổi tiến độ hàng loạt." },
  ] },
  { id: "tracking", since: "1.0.0", title: "Theo dõi bài đăng", goal: "Ghi nhận bài đăng và số view của creator đã chốt.", steps: [
    { hash: "#/campaign/demo-run?tab=theo-doi", sel: "[data-tour=track-head]", title: "View đã giao so với KPI", body: "Tổng view, số bài, tương tác của các bài đã đăng. YouTube tự tìm video trong khoảng ngày theo dõi (bật ở Cài đặt)." },
    { sel: "[data-tour=post-add]", title: "Thêm bài đăng", body: "Dán link TikTok / Facebook / Instagram / YouTube và nhập số liệu; sửa số ngay trên bảng mỗi khi cập nhật." },
  ] },
  { id: "report", since: "1.0.0", title: "Xem báo cáo", goal: "Báo cáo campaign cho khách và tổng quan cho team.", steps: [
    { hash: "#/campaign/demo-run?tab=bao-cao", sel: ".report-kpis", title: "Báo cáo campaign", body: "View đã giao, % KPI, ER, chi phí và CPV (chỉ vai trò xem được giá), hiệu quả từng creator." },
    { sel: "[data-tour=report-csv]", title: "Xuất CSV / In PDF", body: "Gửi khách hoặc mở bằng Excel / Google Sheet." },
    { hash: "#/bao-cao", sel: ".report-kpis", title: "Báo cáo tổng quan", body: "Mọi campaign bạn thấy. Quản lý và Admin có thêm bảng theo người phụ trách." },
  ] },
  { id: "metrics", since: "1.0.0", title: "Chỉ số của creator", goal: "Xem / nhập clip gần đây để tính view trung bình và ER.", steps: [
    { hash: "#/creator/DEMO-005?tab=kenh", sel: "[data-tour=profile-clips]", title: "Clip gần đây & chỉ số", body: "Mở để xem các clip dùng để tính, dán thêm clip mới (TikTok / Facebook / Instagram) hoặc đọc lại YouTube ngay." },
  ] },
  { id: "about", since: "1.0.0", title: "Góp ý, giới thiệu & bản mới", goal: "Gửi góp ý, xem release note và mở lại hướng dẫn.", steps: [
    { hash: "#/gioi-thieu", sel: "#release-notes", title: "Release note", body: "Mỗi phiên bản ghi rõ có gì mới, cải tiến và giới hạn hiện tại. Khi lên bản mới, app báo một lần và đánh dấu ở mục Giới thiệu." },
    { sel: "#btn-feedback", title: "Gửi góp ý", body: "Một góp ý = một vấn đề. Màn hình, vai trò, phiên bản tự ghi kèm; bạn xem được trạng thái xử lý và phản hồi của Admin." },
    { sel: "#btn-help", title: "Xem lại hướng dẫn", body: "Mở lại danh sách checkpoint bất cứ lúc nào. Hướng dẫn cho tính năng mới có nhãn “Mới”." },
  ] },
  { id: "admin", since: "1.0.0", perm: "admin", title: "Quản trị hệ thống", goal: "Theo dõi máy chủ, lịch đồng bộ, góp ý và campaign đã xoá.", steps: [
    { hash: "#/quan-tri?tab=he-thong", sel: ".report-kpis", title: "Tình trạng hệ thống", body: "Bộ nhớ app so với giới hạn gói hosting, ổ đĩa, dung lượng database và lần chạy gần nhất của các việc tự động." },
    { hash: "#/quan-tri?tab=dong-bo", sel: "[data-act=sy-save]", title: "Lịch đồng bộ tự động", body: "Đặt tần suất nhập Google Sheet, đọc chỉ số YouTube, số kênh mỗi lượt và chu kỳ làm mới trên trình duyệt. Có nút chạy ngay." },
    { sel: "[data-tour=tutorial-reset]", title: "Đưa mọi người về hướng dẫn", body: "Mặc định, mỗi lần cập nhật app mọi người thấy hộp chào và xem lại hướng dẫn. Tắt được, hoặc bấm đặt lại ngay khi có thay đổi lớn." },
    { hash: "#/quan-tri?tab=gop-y", sel: ".admin-tabs", title: "Hộp góp ý", body: "Đổi trạng thái (Mới → Đang xử lý → Đã xong) và ghi phản hồi — người gửi thấy ngay trong hộp Góp ý của họ." },
    { hash: "#/quan-tri?tab=da-xoa", sel: ".admin-tabs", title: "Campaign đã xoá", body: "Khôi phục campaign bị xoá nhầm, về đúng trạng thái trước khi xoá." },
  ] },
];

async function demoMove() {
  await sleep(900);
  const l = getList("demo-run");
  const e = l && l.entries.find((x) => x.stage === l.steps[0].key);
  if (!e) return;
  const card = document.querySelector(`[data-card="${e.id}"]`);
  card?.classList.add("tour-lift");
  await sleep(700);
  moveEntry(l.id, e.id, l.steps[1].key, 0); // chỉ đổi trên máy (dữ liệu mẫu)
  await sleep(400);
  const moved = document.querySelector(`[data-card="${e.id}"]`);
  moved?.classList.add("tour-flash");
  if (moved) place(moved);
}

/* ---------- Spotlight ---------- */
let ui = null, cur = null; // cur = { cp, i, all }
function mount() {
  if (ui) return ui;
  const hole = document.createElement("div");
  hole.className = "tour-hole";
  const tip = document.createElement("div");
  tip.className = "tour-tip card";
  tip.setAttribute("role", "dialog");
  tip.setAttribute("aria-live", "polite");
  const banner = document.createElement("div");
  banner.className = "tour-banner";
  banner.setAttribute("role", "status");
  banner.innerHTML = `<span class="tour-banner-mode">${icon("help", 16)}<strong>Chế độ hướng dẫn</strong></span><span class="tour-banner-txt"><span class="hide-m">Dữ liệu mẫu — bạn bấm gì cũng không lưu · </span><span data-tour-count></span></span><button class="btn btn-sm" type="button" data-tour-exit>Thoát hướng dẫn</button>`;
  document.body.append(hole, tip, banner);
  document.documentElement.classList.add("is-tour");
  banner.querySelector("[data-tour-exit]").addEventListener("click", () => stop());
  window.addEventListener("resize", reposition);
  window.addEventListener("scroll", reposition, true);
  document.addEventListener("keydown", onKey);
  ui = { hole, tip, banner };
  return ui;
}
function unmount() {
  if (!ui) return;
  window.removeEventListener("resize", reposition);
  window.removeEventListener("scroll", reposition, true);
  document.removeEventListener("keydown", onKey);
  ui.hole.remove(); ui.tip.remove(); ui.banner.remove();
  document.documentElement.classList.remove("is-tour");
  ui = null;
}
function onKey(e) {
  if (!cur) return;
  if (e.key === "Escape") { e.preventDefault(); stop(); }
  else if (e.key === "ArrowRight" && !e.altKey && !/input|select|textarea/i.test(e.target.tagName)) go(1);
  else if (e.key === "ArrowLeft" && !e.altKey && !/input|select|textarea/i.test(e.target.tagName)) go(-1);
}
let target = null;
function reposition() { if (target && ui) place(target); }
function place(el) {
  target = el;
  const r = el.getBoundingClientRect(), pad = 8;
  const { hole, tip } = ui;
  Object.assign(hole.style, { top: r.top - pad + "px", left: r.left - pad + "px", width: r.width + pad * 2 + "px", height: Math.min(r.height + pad * 2, innerHeight - 16) + "px" });
  const tw = Math.min(360, innerWidth - 32), th = tip.offsetHeight || 180;
  const step = cur.all[cur.i];
  let top, left;
  if (step.place === "right" && r.right + tw + 24 < innerWidth) { top = Math.max(16, r.top); left = r.right + 16; }
  else if (r.bottom + th + 24 < innerHeight) { top = r.bottom + 14; left = r.left; }
  else if (r.top - th - 24 > 0) { top = r.top - th - 14; left = r.left; }
  else { top = innerHeight - th - 16; left = r.left; }
  left = Math.max(16, Math.min(left, innerWidth - tw - 16));
  Object.assign(tip.style, { top: Math.max(16, top) + "px", left: left + "px", width: tw + "px" });
}
async function waitFor(sel, ms = 3500) {
  const t0 = Date.now();
  for (;;) {
    const el = [...document.querySelectorAll(sel)].find((n) => n.offsetParent !== null || n.getClientRects().length);
    if (el) return el;
    if (Date.now() - t0 > ms) return null;
    await sleep(120);
  }
}
async function show() {
  const step = cur.all[cur.i];
  mount();
  if (step.hash && location.hash !== step.hash) { location.hash = step.hash; await sleep(350); }
  const el = await waitFor(step.sel);
  if (!cur) return;
  if (!el) { if (cur.i < cur.all.length - 1) { cur.i++; return show(); } return finish(); } // bước không có trên màn này → bỏ qua
  el.scrollIntoView({ block: "center", behavior: "smooth" });
  await sleep(300);
  const n = cur.all.length;
  ui.tip.innerHTML = `<div class="tour-tip-top"><span class="badge badge-primary">${esc(step.cpTitle)}</span><span class="faint">${cur.i + 1}/${n}</span></div>
    <strong class="tour-tip-title">${esc(step.title)}</strong><p>${esc(step.body)}</p>
    <p class="tour-do">${icon("chevR", 14)}<span><strong>Việc của bạn:</strong> ${esc(step.todo || (cur.i === n - 1 ? "Bấm “Xong” để hoàn thành." : "Đọc phần được tô sáng, rồi bấm “Tiếp” (hoặc phím →)."))}</span></p>
    <div class="tour-dots" aria-hidden="true">${cur.all.map((_, k) => `<i class="${k === cur.i ? "on" : k < cur.i ? "done" : ""}"></i>`).join("")}</div>
    <div class="row-wrap tour-tip-act"><button class="btn btn-ghost btn-sm" type="button" data-t="skip">Thoát</button><span class="spacer"></span>
      ${cur.i ? `<button class="btn btn-sm" type="button" data-t="back">${icon("chevL", 14)} Trước</button>` : ""}
      <button class="btn btn-primary btn-sm" type="button" data-t="next">${cur.i === n - 1 ? "Xong" : `Tiếp ${icon("chevR", 14)}`}</button></div>`;
  const cnt = ui.banner.querySelector("[data-tour-count]");
  if (cnt) cnt.textContent = `Bước ${cur.i + 1}/${n}`;
  ui.tip.querySelector("[data-t=skip]").onclick = () => stop();
  ui.tip.querySelector("[data-t=back]")?.addEventListener("click", () => go(-1));
  ui.tip.querySelector("[data-t=next]").onclick = () => go(1);
  ui.hole.classList.remove("tour-pulse"); void ui.hole.offsetWidth; ui.hole.classList.add("tour-pulse");
  place(el);
  ui.tip.querySelector("[data-t=next]").focus({ preventScroll: true });
  // checkpoint coi là xong khi đã xem tới bước cuối của nó
  if (step.last) markDone(step.cpId);
  if (step.run) step.run();
}
function go(d) {
  if (!cur) return;
  const n = cur.i + d;
  if (n < 0) return;
  if (n >= cur.all.length) return finish();
  cur.i = n;
  show();
}
function markDone(id) { const done = new Set(read().done || []); done.add(id); write({ done: [...done] }); }

/** Chạy một (hoặc nhiều) checkpoint trên dữ liệu mẫu. */
export async function start(ids) {
  const cps = CHECKPOINTS.filter((c) => ids.includes(c.id));
  if (!cps.length) return;
  closePanel();
  const back = location.hash;
  if (!inDemo()) { invalidateReports(); invalidateAdmin(); enterDemo(makeDemo(), demoApi); }
  cur = { all: cps.flatMap((c) => c.steps.map((s, k) => ({ ...s, cpId: c.id, cpTitle: c.title, last: k === c.steps.length - 1 }))), i: 0, back };
  show();
}
async function finish() {
  await stop(false, true);
  doneDialog();
}
/** Thoát hướng dẫn. Thoát giữa chừng → báo rõ đã về dữ liệu thật và cách mở lại. */
export async function stop(reopen = false, finished = false) {
  const back = cur?.back;
  const midway = !!cur && !finished;
  cur = null; target = null;
  unmount();
  if (inDemo()) {
    invalidateReports(); invalidateAdmin();
    await exitDemo();
    emit("data"); emit("lists"); emit("shortlist");
    location.hash = back && !/demo-|DEMO-/.test(back) ? back : "#/kham-pha";
  }
  if (midway) toast("Đã thoát hướng dẫn", "Bạn đang dùng dữ liệu thật. Mở lại bất cứ lúc nào ở nút “Hướng dẫn” trên cùng.");
  if (reopen) openPanel();
}

/* ---------- Hộp chào: lần đầu đăng nhập, sau mỗi lần cập nhật app, hoặc khi Admin đưa mọi người về hướng dẫn ---------- */
const firstName = () => String(state.user?.name || "").trim().split(/\s+/).pop() || "bạn";
export function welcome({ returning = false, news = false } = {}) {
  closePanel();
  const list = visibleCheckpoints();
  let chosen = false;
  const o = openOverlay({
    kind: "modal",
    title: returning ? `Chào ${firstName()}, mừng bạn quay lại!` : `Chào ${firstName()}, rất vui được gặp bạn!`,
    body: `<div class="welcome">
      <p class="welcome-lead">${icon("sparkles", 20)}<span>${returning
        ? "App vừa được làm mới, hướng dẫn cũng vậy. Đi lại một vòng ngắn để không bỏ lỡ thay đổi nhé."
        : "Đây là <strong>Markus Creator OS</strong> — nơi tìm creator, chạy campaign và xem báo cáo ở cùng một chỗ. Mình đi một vòng ngắn nhé?"}</span></p>
      ${news ? `<div class="welcome-news"><span class="badge badge-primary">Mới · v${esc(CURRENT.version)}</span><strong>${esc(CURRENT.title)}</strong><a class="link-btn" href="#/gioi-thieu" data-w="notes">Xem có gì mới</a></div>` : ""}
      <h3 class="welcome-h">Hướng dẫn hoạt động thế nào?</h3>
      <ol class="welcome-steps">
        <li><b>1</b><span><strong>Một vùng trên màn hình được tô sáng</strong>, kèm khung giải thích ngắn bên cạnh.</span></li>
        <li><b>2</b><span><strong>Bấm “Tiếp”</strong> (hoặc phím →) để sang bước sau, “Trước” để quay lại.</span></li>
        <li><b>3</b><span><strong>Muốn dừng?</strong> Bấm “Thoát hướng dẫn” trên thanh tím hoặc phím Esc — lúc nào cũng được.</span></li>
      </ol>
      <p class="welcome-safe">${icon("lock", 16)}<span>Trong lúc hướng dẫn, app dùng <strong>dữ liệu mẫu</strong>: bạn bấm gì cũng không ảnh hưởng dữ liệu thật. Thanh tím <em>“Chế độ hướng dẫn”</em> luôn cho biết bạn đang ở đâu.</span></p>
      <p class="faint">${list.length} chặng ngắn · khoảng ${list.length} phút · bỏ dở thì lần sau xem tiếp được.</p>
    </div>`,
    footer: `<button class="btn btn-ghost" type="button" data-w="later">Để sau</button><span class="spacer"></span>
      <button class="btn" type="button" data-w="pick">Chọn phần muốn xem</button>
      <button class="btn btn-primary" type="button" data-w="start" autofocus>${icon("play", 14)} Bắt đầu hướng dẫn</button>`,
    onClose: () => { if (!chosen) toast("Mở lại bất cứ lúc nào", "Bấm nút “Hướng dẫn” ở thanh trên cùng."); },
  });
  o.el.classList.add("welcome-modal");
  delegate(o.el, "click", "[data-w]", (e, b) => {
    const w = b.dataset.w;
    chosen = w !== "later";
    o.close();
    if (w === "start") start(list.map((c) => c.id));
    else if (w === "pick") openPanel();
  });
}

/* ---------- Hộp kết thúc: khen, nói rõ đã về dữ liệu thật, gợi ý việc tiếp theo ---------- */
function doneDialog() {
  const done = new Set(read().done || []);
  const list = visibleCheckpoints();
  const left = list.filter((c) => !done.has(c.id));
  const o = openOverlay({
    kind: "modal",
    title: left.length ? "Xong chặng này rồi!" : `Tuyệt vời, ${firstName()}! Bạn đã xem hết hướng dẫn`,
    body: `<div class="welcome">
      <p class="welcome-lead">${icon("checkCircle", 20)}<span>Bạn đã xong <strong>${list.length - left.length}/${list.length}</strong> chặng. App đã quay về <strong>dữ liệu thật</strong> — từ giờ mọi thay đổi đều được lưu.</span></p>
      ${left.length ? `<p class="welcome-news"><span class="badge">Chặng tiếp theo</span><strong>${esc(left[0].title)}</strong><span class="faint">${esc(left[0].goal)}</span></p>` : ""}
      <h3 class="welcome-h">Bắt đầu từ đâu?</h3>
      <div class="welcome-next">
        <a class="card welcome-go" href="#/kham-pha" data-d="go">${icon("compass", 18)}<span><strong>Tìm creator</strong><span class="dt-sub">Lọc kho creator hoặc hỏi bằng câu tự nhiên.</span></span></a>
        <a class="card welcome-go" href="#/campaign" data-d="go">${icon("users", 18)}<span><strong>Tạo campaign</strong><span class="dt-sub">Bắt đầu ở trạng thái Nháp, sửa thoải mái.</span></span></a>
        <button class="card welcome-go" type="button" data-d="feedback">${icon("message", 18)}<span><strong>Gửi góp ý</strong><span class="dt-sub">Chỗ nào khó dùng, nói với team một câu.</span></span></button>
      </div>
    </div>`,
    footer: `<button class="btn btn-ghost" type="button" data-d="panel">Danh sách hướng dẫn</button><span class="spacer"></span>
      ${left.length ? `<button class="btn" type="button" data-d="close">Để sau</button><button class="btn btn-primary" type="button" data-d="next" autofocus>${icon("play", 14)} Xem chặng tiếp theo</button>`
        : `<button class="btn btn-primary" type="button" data-d="close" autofocus>Bắt đầu làm việc</button>`}`,
  });
  o.el.classList.add("welcome-modal");
  delegate(o.el, "click", "[data-d]", (e, b) => {
    const d = b.dataset.d;
    o.close();
    if (d === "next") start(left.map((c) => c.id));
    else if (d === "panel") openPanel();
    else if (d === "feedback") $("#btn-feedback")?.click();
  });
}

/* ---------- Bảng checkpoint "Bắt đầu nhanh" ---------- */
let panel = null;
function closePanel() { panel?.remove(); panel = null; }
const newer = (a, b) => { const x = a.split(".").map(Number), y = (b || "0").split(".").map(Number); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); return false; };
export const visibleCheckpoints = () => CHECKPOINTS.filter((c) => !c.perm || can(c.perm));
export function openPanel() {
  closePanel();
  const before = read().version; // phiên bản hướng dẫn người dùng đã xem lần trước
  write({ seen: true, version: CURRENT.version });
  const done = new Set(read().done || []);
  const list = visibleCheckpoints();
  const isNew = (c) => before && newer(c.since || "0", before) && !done.has(c.id);
  panel = document.createElement("section");
  panel.className = "tour-panel card";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Bắt đầu nhanh");
  const pct = Math.round((list.filter((c) => done.has(c.id)).length / list.length) * 100);
  panel.innerHTML = `<header class="tour-panel-head"><span class="tour-ring" style="--p:${pct}"><span>${list.filter((c) => done.has(c.id)).length}/${list.length}</span></span>
      <div><strong>Bắt đầu nhanh</strong><span class="dt-sub">${list.length} checkpoint · mỗi cái 1 phút · chạy trên dữ liệu mẫu, không ảnh hưởng dữ liệu thật</span></div>
      <button class="btn btn-ghost btn-icon btn-sm" type="button" data-p="close" aria-label="Đóng">${icon("xmark", 16)}</button></header>
    <ol class="tour-cps">${list.map((c, i) => `<li class="${done.has(c.id) ? "is-done" : ""}"><span class="tour-cp-n">${done.has(c.id) ? icon("check", 14) : i + 1}</span>
      <span class="tour-cp-txt"><strong>${esc(c.title)}${isNew(c) ? ` <span class="badge badge-primary">Mới</span>` : ""}</strong><span class="dt-sub">${esc(c.goal)}</span></span>
      <button class="btn btn-sm ${done.has(c.id) ? "" : "btn-primary"}" type="button" data-cp="${c.id}">${done.has(c.id) ? "Xem lại" : "Bắt đầu"}</button></li>`).join("")}</ol>
    <footer class="row-wrap tour-panel-foot"><button class="btn btn-primary" type="button" data-p="all">${icon("play", 14)} Xem lần lượt tất cả</button><span class="spacer"></span>
      <a class="btn btn-ghost btn-sm" href="#/gioi-thieu" data-p="about">Giới thiệu & release note</a>${can("admin") ? `<a class="btn btn-ghost btn-sm" href="#/quan-tri" data-p="admin-link">Quản trị</a>` : ""}<button class="btn btn-ghost btn-sm" type="button" data-p="later">Để sau</button>${done.size ? `<button class="btn btn-ghost btn-sm" type="button" data-p="reset">Đặt lại tiến độ</button>` : ""}</footer>`;
  document.body.appendChild(panel);
  panel.addEventListener("click", (e) => {
    const b = e.target.closest("button, a");
    if (!b) return;
    if (b.dataset.cp) start([b.dataset.cp]);
    else if (b.dataset.p === "all") { const todo = list.filter((c) => !done.has(c.id)); start((todo.length ? todo : list).map((c) => c.id)); }
    else if (b.dataset.p === "reset") { write({ done: [] }); openPanel(); }
    else closePanel();
  });
  panel.querySelector("[data-cp]")?.focus({ preventScroll: true });
}

/** Gắn nút "Hướng dẫn" vào topbar; lần đầu, sau mỗi lần deploy hoặc khi Admin đặt lại → hộp chào. Trả về true nếu mở hộp chào. */
export function initTour(btn) {
  if (!btn) return false;
  btn.innerHTML = `${icon("help", 18)}<span class="hide-m">Hướng dẫn</span>`;
  btn.addEventListener("click", () => (panel ? closePanel() : openPanel()));
  const t = read();
  // Máy chủ đổi "epoch" mỗi lần deploy (hoặc khi Admin bấm đặt lại) → mọi người về lại hướng dẫn từ đầu.
  const epoch = state.config && state.config.tutorialEpoch;
  if (epoch && t.epoch !== epoch && state.user) {
    const returning = !!(t.seen || t.epoch);
    const news = !!seenVersion() && seenVersion() !== CURRENT.version;
    write({ epoch, done: [], seen: true, version: CURRENT.version });
    setTimeout(() => welcome({ returning, news }), 700);
    return true;
  }
  // Lần đầu: mở "Bắt đầu nhanh". Sau một bản mới có checkpoint mới: mở lại một lần, checkpoint mới có nhãn "Mới".
  const fresh = t.seen && t.version && visibleCheckpoints().some((c) => newer(c.since || "0", t.version));
  if ((!t.seen || fresh) && state.user) setTimeout(openPanel, 900);
  return false;
}
