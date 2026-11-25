// views/admin.js — QUẢN TRỊ (chỉ Admin), 5 tab:
//   He-thong   : phiên bản, bộ nhớ, ổ đĩa, database, lần chạy gần nhất của các job (tự làm mới 30 giây khi đang mở)
//   Dong-bo    : lịch đồng bộ Sheet, lịch đọc chỉ số YouTube / theo dõi bài đăng, chu kỳ làm mới trình duyệt; Chạy ngay
//   Gop-y      : hộp góp ý của mọi người — đổi trạng thái, ghi chú phản hồi, xoá
//   Da-xoa     : campaign đã xoá (xoá mềm) — khôi phục
//   Chi-so     : công thức view trung bình / ER (mở hộp cài đặt chỉ số)

import { $, esc, icon, delegate, toast, fmtNum, fmtDate, relTime } from "../core/ui.js";
import { can, reload } from "../core/store.js";
import { api } from "../data/live.js";
import { pageHead, emptyState } from "../core/parts.js";
import { refresh, setQuery } from "../core/router.js";
import { openMetricsSettings, formulaText } from "./clips.js";

const TABS = [["he-thong", "Hệ thống", "data"], ["dong-bo", "Đồng bộ tự động", "sync"], ["gop-y", "Góp ý", "message"], ["da-xoa", "Campaign đã xoá", "trash"], ["chi-so", "Công thức chỉ số", "chart"]];
const cache = {};
let fbFilter = "new", timer = null;
const bytes = (n) => (n == null ? "—" : n >= 1 << 30 ? (n / (1 << 30)).toFixed(2) + " GB" : n >= 1 << 20 ? (n / (1 << 20)).toFixed(1) + " MB" : Math.round(n / 1024) + " KB");
const dur = (s) => (s >= 86400 ? `${Math.floor(s / 86400)} ngày ${Math.floor((s % 86400) / 3600)} giờ` : s >= 3600 ? `${Math.floor(s / 3600)} giờ ${Math.floor((s % 3600) / 60)} phút` : `${Math.floor(s / 60)} phút`);
const meter = (used, total, warnAt = 0.8) => { const p = total ? Math.min(100, Math.round((used / total) * 100)) : 0; return `<span class="bar ${p >= warnAt * 100 ? "bar-warning" : ""}"><i style="width:${p}%"></i></span><span class="dt-sub">${p}%</span>`; };
const JOB = { sheet_import: "Nhập Google Sheet (tự động)", sheet_import_api: "Nhập Google Sheet (từ app)", metrics: "Chỉ số YouTube & theo dõi bài" };
const FB_STATUS = { new: ["Mới", "badge-primary"], doing: ["Đang xử lý", "badge-warning"], done: ["Đã xong", "badge-success"], wontfix: ["Không làm", ""] };
const FB_KIND = { bug: "Lỗi / sai dữ liệu", ux: "Khó dùng", feature: "Đề xuất tính năng", data: "Thiếu dữ liệu" };
const FB_PRIO = { must: "Phải có", should: "Nên có", nice: "Có thì tốt" };

async function load(key, path, el) {
  if (cache[key]) return cache[key];
  el.innerHTML = `<div class="card empty"><strong>Đang tải…</strong></div>`;
  try { cache[key] = await api(path); refresh(); } catch (e) { el.innerHTML = emptyState("lock", "Chưa tải được", "Lỗi " + esc(e.message)); }
  return null;
}
const invalidate = (k) => { delete cache[k]; refresh(); };

export function render(el, p) {
  clearInterval(timer);
  if (!can("admin")) { el.innerHTML = `<div class="page">${emptyState("lock", "Chỉ Admin mở được Quản trị", "Cần quyền khác? Gửi góp ý cho Admin.")}</div>`; return; }
  const tab = TABS.some(([k]) => k === p.tab) ? p.tab : "he-thong";
  el.innerHTML = `<div class="page admin">
    ${pageHead("Quản trị", "Tình trạng hệ thống, đồng bộ tự động, góp ý của người dùng và dữ liệu đã xoá.")}
    <div class="segmented admin-tabs" role="tablist" aria-label="Mục quản trị">${TABS.map(([k, l, ic]) => `<button type="button" role="tab" data-tab="${k}" aria-selected="${tab === k}" aria-pressed="${tab === k}">${icon(ic, 16)} ${l}${k === "gop-y" && cache.sys?.database?.feedbackNew ? ` <span class="badge badge-primary">${cache.sys.database.feedbackNew}</span>` : ""}</button>`).join("")}</div>
    <div id="admin-body"></div>
  </div>`;
  delegate(el, "click", "[data-tab]", (e, b) => { setQuery("quan-tri", { tab: b.dataset.tab }); refresh(); });
  const body = $("#admin-body", el);
  ({ "he-thong": system, "dong-bo": sync, "gop-y": feedbackTab, "da-xoa": deleted, "chi-so": metrics })[tab](body);
}

/* ---------- Hệ thống ---------- */
async function system(el) {
  const s = await load("sys", "/admin/system", el);
  if (!s) return;
  const mem = s.memory, rssMb = mem.rss / 1048576;
  const runs = s.runs || [];
  el.innerHTML = `
    <div class="row-wrap"><span class="faint">Cập nhật ${relTime(s.checkedAt)} · tự làm mới mỗi 30 giây khi đang mở</span><span class="spacer"></span><button class="btn btn-ghost" type="button" data-act="sys-refresh">${icon("sync", 16)} Làm mới</button></div>
    <div class="report-kpis">
      <div class="card card-pad report-kpi"><span class="faint">Phiên bản</span><strong>v${esc(s.app.version)}</strong><span class="dt-sub">build ${esc(s.app.build)} · Node ${esc(s.app.node)}</span><span class="dt-sub">Chạy liên tục ${dur(s.app.uptimeSec)}</span></div>
      <div class="card card-pad report-kpi"><span class="faint">Bộ nhớ app</span><strong class="num">${Math.round(rssMb)} MB</strong>${meter(rssMb, mem.limitMb)}<span class="dt-sub">trên giới hạn gói hosting ${mem.limitMb.toLocaleString("vi-VN")} MB · heap ${bytes(mem.heapUsed)}</span></div>
      <div class="card card-pad report-kpi"><span class="faint">Bộ nhớ máy chủ</span><strong class="num">${bytes(mem.hostTotal - mem.hostFree)}</strong>${meter(mem.hostTotal - mem.hostFree, mem.hostTotal, 0.9)}<span class="dt-sub">trên ${bytes(mem.hostTotal)} · CPU load ${s.cpu.load.join(" / ")} (${s.cpu.cores} nhân)</span></div>
      <div class="card card-pad report-kpi"><span class="faint">Ổ đĩa</span><strong class="num">${s.disk ? bytes(s.disk.total - s.disk.free) : "—"}</strong>${s.disk ? meter(s.disk.total - s.disk.free, s.disk.total, 0.85) : ""}<span class="dt-sub">${s.folders.app == null && s.folders.state == null ? "Đang tính dung lượng thư mục…" : `App ${bytes(s.folders.app)} · dữ liệu & sao lưu ${bytes(s.folders.state)}`}</span></div>
      <div class="card card-pad report-kpi"><span class="faint">Cơ sở dữ liệu</span><strong class="num">${bytes(s.database.bytes)}</strong><span class="dt-sub">${fmtNum(s.database.creators)} creator · ${fmtNum(s.database.creatorsWithMetrics)} kênh có chỉ số · ${fmtNum(s.database.clips)} clip</span><span class="dt-sub">${fmtNum(s.database.campaigns)} campaign (+${fmtNum(s.database.campaignsDeleted)} đã xoá) · ${fmtNum(s.database.posts)} bài đăng · ${fmtNum(s.database.sessions)} phiên</span></div>
    </div>
    <div class="report-grid">
      ${jobCard("Nhập Google Sheet", s.jobs.import, s.sync.importMinutes ? `mỗi ${s.sync.importMinutes >= 60 ? s.sync.importMinutes / 60 + " giờ" : s.sync.importMinutes + " phút"}` : "đang tắt")}
      ${jobCard("Chỉ số YouTube & theo dõi bài", s.jobs.metrics, s.sync.metricsHours ? `mỗi ${s.sync.metricsHours} giờ · ${s.sync.metricsBatch} kênh/lượt` : "đang tắt")}
    </div>
    <section class="card"><div class="card-head"><h3>Các lần chạy gần nhất</h3></div>
      ${runs.length ? `<div class="dt-wrap"><table class="dt"><thead><tr><th>Việc</th><th>Bắt đầu</th><th>Thời gian</th><th>Kết quả</th><th class="t-right">Số liệu</th></tr></thead><tbody>
        ${runs.map((r) => `<tr><td>${esc(JOB[r.kind] || r.kind)}</td><td>${fmtDate(r.startedAt)} ${new Date(r.startedAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}</td><td>${r.finishedAt ? Math.max(1, Math.round((new Date(r.finishedAt) - new Date(r.startedAt)) / 1000)) + " giây" : "đang chạy"}</td>
          <td>${r.status === "ok" ? `<span class="badge badge-success">OK</span>` : r.status === "failed" ? `<span class="badge badge-danger" title="${esc(r.error || "")}">Lỗi</span>` : `<span class="badge">Đang chạy</span>`}</td>
          <td class="t-right num">${r.kind === "metrics" ? `${r.rowsRead ?? 0} kênh · ${r.rowsSkipped ?? 0} lỗi · +${r.rowsImported ?? 0} bài` : `${fmtNum(r.rowsImported)} dòng`}</td></tr>`).join("")}
      </tbody></table></div>` : `<p class="card-pad faint">Chưa có lần chạy nào.</p>`}</section>`;
  delegate(el, "click", "[data-act=sys-refresh]", () => invalidate("sys"));
  timer = setInterval(() => { if (document.contains(el) && !document.hidden) { delete cache.sys; load("sys", "/admin/system", document.createElement("div")); } else clearInterval(timer); }, 30_000);
}
function jobCard(title, j, every) {
  const ok = j?.status === "ok";
  const age = j ? (Date.now() - new Date(j.startedAt)) / 60000 : null;
  return `<section class="card card-pad stack"><div class="row-wrap"><h3 style="margin:0">${title}</h3><span class="spacer"></span>${!j ? `<span class="badge">Chưa chạy</span>` : ok ? `<span class="badge badge-success">${icon("check", 12)} Bình thường</span>` : `<span class="badge badge-danger">Lần gần nhất lỗi</span>`}</div>
    <span class="faint">Lịch: ${every}${j ? ` · lần gần nhất ${relTime(j.startedAt)}${age > 24 * 60 ? " — quá 1 ngày, kiểm tra cron" : ""}` : ""}</span>
    ${j?.error ? `<span class="dt-sub">${esc(j.error)}</span>` : ""}
    <a class="link-btn" href="#/quan-tri?tab=dong-bo">Đổi lịch hoặc chạy ngay</a></section>`;
}

/* ---------- Đồng bộ tự động ---------- */
async function sync(el) {
  const r = await load("sync", "/admin/sync", el);
  if (!r) return;
  const tu = await load("tut", "/admin/tutorial", el);
  if (!tu) return;
  const s = r.settings, o = r.options;
  const sel = (id, list, v, fmt) => `<select class="select" id="${id}">${list.map((x) => `<option value="${x}" ${x === v ? "selected" : ""}>${fmt(x)}</option>`).join("")}</select>`;
  const mins = (x) => (x === 0 ? "Tắt" : x >= 60 ? `Mỗi ${x / 60} giờ` : `Mỗi ${x} phút`);
  el.innerHTML = `
    <div class="report-grid">
      <section class="card card-pad stack"><h3>${icon("import", 16)} Nhập dữ liệu từ Google Sheet</h3>
        <p class="faint">Creator, follower, giá được nhập lại từ Sheet CREATOR_DB. Sửa trên app thì ghi Sheet và nhập lại ngay, không cần chờ lịch.</p>
        <div class="field"><label for="sy-import">Tần suất</label>${sel("sy-import", o.importMinutes, s.importMinutes, mins)}</div>
        <div class="row-wrap"><button class="btn" type="button" data-run="import">${icon("sync", 16)} Nhập ngay</button><span class="faint" id="run-import"></span></div></section>
      <section class="card card-pad stack"><h3>${icon("chart", 16)} Chỉ số YouTube & theo dõi bài đăng</h3>
        <p class="faint">Đọc video gần đây của kênh YouTube (view, like, avatar) và tự tìm bài đăng của campaign đang chạy trong khoảng ngày theo dõi.</p>
        <div class="field-row"><div class="field"><label for="sy-metrics">Tần suất</label>${sel("sy-metrics", o.metricsHours, s.metricsHours, (x) => (x === 0 ? "Tắt" : `Mỗi ${x} giờ`))}</div>
          <div class="field"><label for="sy-batch">Số kênh mỗi lượt</label><input class="input" id="sy-batch" type="number" min="5" max="60" value="${s.metricsBatch}" /></div></div>
        <div class="field"><label for="sy-yt">Đọc lại một kênh sau ít nhất (giờ)</label><input class="input" id="sy-yt" type="number" min="6" max="168" value="${s.youtubeRefreshHours}" /><span class="field-hint">Mỗi lượt nghỉ 1,5 giây giữa các kênh để không bị YouTube chặn. 25 kênh/giờ ≈ đọc hết 186 kênh trong 8 giờ.</span></div>
        <div class="row-wrap"><button class="btn" type="button" data-run="metrics">${icon("sync", 16)} Chạy 10 kênh ngay</button><span class="faint" id="run-metrics"></span></div></section>
      <section class="card card-pad stack"><h3>${icon("eye", 16)} Làm mới trên trình duyệt</h3>
        <p class="faint">Trang đang mở tự tải lại dữ liệu mới theo chu kỳ (bỏ qua khi người dùng đang gõ hoặc mở hộp thoại).</p>
        <div class="field"><label for="sy-client">Chu kỳ</label>${sel("sy-client", o.clientRefreshMinutes, s.clientRefreshMinutes, (x) => (x === 0 ? "Chỉ khi mở trang" : `Mỗi ${x} phút`))}</div></section>
      <section class="card card-pad stack" data-tour="tutorial-reset"><h3>${icon("help", 16)} Hướng dẫn cho người dùng</h3>
        <p class="faint">Khi hướng dẫn được đặt lại, lần mở app kế tiếp mỗi người thấy hộp chào và xem lại hướng dẫn từ đầu (trên dữ liệu mẫu).</p>
        <label class="check"><input type="checkbox" id="tu-deploy" ${tu.settings.resetOnDeploy ? "checked" : ""} /> <span>Sau mỗi lần cập nhật app (deploy), đưa mọi người về hướng dẫn</span></label>
        <div class="row-wrap"><button class="btn" type="button" data-act="tu-now">${icon("sync", 16)} Đưa mọi người về hướng dẫn ngay</button>
          <span class="faint">${tu.settings.resetAt ? `Lần đặt lại gần nhất: ${relTime(tu.settings.resetAt)}` : ""}</span></div></section>
    </div>
    <div class="row-wrap"><span class="faint">Máy chủ đánh thức việc nhập Sheet mỗi 15 phút và việc chỉ số mỗi giờ; lịch ở đây quyết định lần nào thật sự chạy.</span><span class="spacer"></span>
      <button class="btn btn-ghost" type="button" data-act="sy-default">Về mặc định</button><button class="btn btn-primary" type="button" data-act="sy-save">Lưu lịch đồng bộ</button></div>`;
  const read = () => ({ importMinutes: +$("#sy-import", el).value, metricsHours: +$("#sy-metrics", el).value, metricsBatch: Math.round(+$("#sy-batch", el).value), youtubeRefreshHours: Math.round(+$("#sy-yt", el).value), clientRefreshMinutes: +$("#sy-client", el).value });
  delegate(el, "click", "[data-act=sy-default]", () => { cache.sync = { ...r, settings: r.defaults }; refresh(); });
  delegate(el, "click", "[data-act=sy-save]", async (e, b) => {
    const next = read();
    if (next.metricsBatch < 5 || next.metricsBatch > 60) return toast("Kiểm tra lại", "Số kênh mỗi lượt từ 5 đến 60.", "danger");
    if (next.youtubeRefreshHours < 6 || next.youtubeRefreshHours > 168) return toast("Kiểm tra lại", "Đọc lại kênh sau 6 đến 168 giờ.", "danger");
    b.disabled = true;
    try { const res = await api("/admin/sync", { method: "POST", body: { settings: next } }); cache.sync = { ...r, settings: res.settings }; delete cache.sys; toast("Đã lưu lịch đồng bộ", "Áp dụng từ lần đánh thức tiếp theo."); }
    catch (err) { toast("Chưa lưu được", "Lỗi " + err.message, "danger"); }
    b.disabled = false;
  });
  delegate(el, "change", "#tu-deploy", async (e, b) => {
    b.disabled = true;
    try { const res = await api("/admin/tutorial", { method: "POST", body: { resetOnDeploy: b.checked } }); cache.tut = res; toast(b.checked ? "Đã bật" : "Đã tắt", b.checked ? "Mỗi lần cập nhật app, mọi người sẽ xem lại hướng dẫn." : "Cập nhật app sẽ không đặt lại hướng dẫn nữa."); }
    catch (err) { b.checked = !b.checked; toast("Chưa lưu được", "Lỗi " + err.message, "danger"); }
    b.disabled = false;
  });
  delegate(el, "click", "[data-act=tu-now]", async (e, b) => {
    if (!confirm("Đưa mọi người về hướng dẫn?\n\nLần mở app kế tiếp, mỗi người (cả bạn) sẽ thấy hộp chào và tiến độ hướng dẫn bắt đầu lại từ đầu. Dữ liệu thật không bị ảnh hưởng.")) return;
    b.disabled = true;
    try { cache.tut = await api("/admin/tutorial", { method: "POST", body: { resetNow: true } }); toast("Đã đặt lại hướng dẫn", "Mọi người sẽ thấy hộp chào ở lần mở app kế tiếp."); refresh(); }
    catch (err) { toast("Chưa đặt lại được", "Lỗi " + err.message, "danger"); }
    b.disabled = false;
  });
  delegate(el, "click", "[data-run]", async (e, b) => {
    const job = b.dataset.run, out = $("#run-" + job, el);
    b.disabled = true; out.textContent = job === "import" ? "Đang nhập từ Google Sheet…" : "Đang chạy nền…";
    try {
      const res = await api("/admin/jobs", { method: "POST", body: { job } });
      if (job === "import") { out.textContent = `Xong: ${fmtNum(res.result?.creators ?? res.result?.rowsImported ?? 0)} creator.`; await reload(); }
      else out.textContent = res.running ? "Một lượt khác đang chạy — xem tab Hệ thống." : "Đã bắt đầu. Kết quả hiện ở tab Hệ thống sau khoảng 30 giây.";
      delete cache.sys;
    } catch (err) { out.textContent = "Lỗi: " + (err.body?.detail || err.message); }
    b.disabled = false;
  });
}

/* ---------- Góp ý ---------- */
async function feedbackTab(el) {
  const r = await load("fb", "/feedback?all=1", el);
  if (!r) return;
  const all = r.feedback;
  const shown = all.filter((f) => !fbFilter || f.status === fbFilter);
  el.innerHTML = `
    <div class="segmented" role="group" aria-label="Lọc góp ý"><button type="button" data-fb="" aria-pressed="${!fbFilter}">Tất cả (${all.length})</button>${Object.entries(FB_STATUS).map(([k, [l]]) => `<button type="button" data-fb="${k}" aria-pressed="${fbFilter === k}">${l} (${all.filter((f) => f.status === k).length})</button>`).join("")}</div>
    ${shown.length ? `<div class="fb-list">${shown.map((f) => `<article class="card card-pad fb-item" data-id="${f.id}">
        <header class="row-wrap"><span class="badge ${FB_STATUS[f.status][1]}">${FB_STATUS[f.status][0]}</span><strong>${esc(FB_KIND[f.kind] || f.kind)}</strong><span class="badge badge-outline">${esc(FB_PRIO[f.prio] || f.prio)}</span><span class="spacer"></span>
          <span class="faint">${esc(f.name || f.email || "")} · ${esc(f.role || "")} · ${relTime(f.createdAt)}</span></header>
        <dl class="fb-dl"><dt>Màn hình</dt><dd>${f.route ? `<a href="${esc(f.route)}">${esc(f.screen || f.route)}</a>` : esc(f.screen || "—")}${f.appVersion ? ` · v${esc(f.appVersion)}` : ""}</dd>
          <dt>Đang làm</dt><dd>${esc(f.doing)}</dd><dt>Mong muốn</dt><dd>${esc(f.want)}</dd>${f.actual ? `<dt>Hiện tại</dt><dd>${esc(f.actual)}</dd>` : ""}</dl>
        <div class="fb-admin"><label class="sr-only" for="fbs-${f.id}">Trạng thái</label><select class="select" id="fbs-${f.id}" data-fbstatus="${f.id}">${Object.entries(FB_STATUS).map(([k, [l]]) => `<option value="${k}" ${k === f.status ? "selected" : ""}>${l}</option>`).join("")}</select>
          <label class="sr-only" for="fbn-${f.id}">Phản hồi cho người gửi</label><input class="input" id="fbn-${f.id}" data-fbnote="${f.id}" placeholder="Phản hồi cho người gửi (họ thấy ở nút Góp ý)" value="${esc(f.adminNote || "")}" />
          <button class="btn btn-sm" type="button" data-fbsave="${f.id}">Lưu</button><button class="btn btn-ghost btn-icon btn-sm" type="button" data-fbrm="${f.id}" aria-label="Xoá góp ý">${icon("trash", 14)}</button></div>
      </article>`).join("")}</div>` : emptyState("message", fbFilter ? "Không có góp ý ở trạng thái này" : "Chưa có góp ý", "Góp ý gửi từ nút “Góp ý” trên thanh trên cùng sẽ hiện ở đây.")}`;
  const send = async (body, msg) => {
    try { const res = await api("/admin/feedback", { method: "POST", body }); cache.fb = { feedback: res.feedback }; delete cache.sys; toast(msg); refresh(); }
    catch (err) { toast("Chưa lưu được", "Lỗi " + err.message, "danger"); }
  };
  delegate(el, "click", "[data-fb]", (e, b) => { fbFilter = b.dataset.fb; refresh(); });
  delegate(el, "change", "[data-fbstatus]", (e, s) => send({ op: "update", id: +s.dataset.fbstatus, status: s.value }, "Đã đổi trạng thái góp ý"));
  delegate(el, "click", "[data-fbsave]", (e, b) => send({ op: "update", id: +b.dataset.fbsave, adminNote: $(`[data-fbnote="${b.dataset.fbsave}"]`, el).value }, "Đã lưu phản hồi"));
  delegate(el, "click", "[data-fbrm]", (e, b) => { if (confirm("Xoá hẳn góp ý này?")) send({ op: "remove", id: +b.dataset.fbrm }, "Đã xoá góp ý"); });
}

/* ---------- Campaign đã xoá ---------- */
async function deleted(el) {
  const r = await load("del", "/admin/campaigns", el);
  if (!r) return;
  const ST = { draft: "Nháp", running: "Đang chạy", done: "Hoàn thành" };
  el.innerHTML = r.campaigns.length ? `<section class="card"><div class="card-head"><h3>Campaign đã xoá</h3><span class="faint">Ẩn khỏi danh sách và báo cáo; dữ liệu vẫn giữ nguyên.</span></div>
    <div class="dt-wrap"><table class="dt"><thead><tr><th>Campaign</th><th>Phụ trách</th><th>Trạng thái trước khi xoá</th><th>Xoá bởi</th><th class="t-right">Creator</th><th></th></tr></thead><tbody>
      ${r.campaigns.map((c) => `<tr><td><strong>${esc(c.name)}</strong><span class="dt-sub">${esc(c.brand || "")}</span></td><td>${esc(c.owner || "—")}</td><td>${esc(ST[c.statusBefore] || "—")}</td><td>${esc(c.deletedBy || "—")}<span class="dt-sub">${relTime(c.deletedAt)}</span></td><td class="t-right num">${c.entries}</td>
        <td><button class="btn btn-sm" type="button" data-restore="${c.id}">${icon("sync", 14)} Khôi phục</button></td></tr>`).join("")}
    </tbody></table></div></section>` : emptyState("trash", "Không có campaign nào bị xoá", "Campaign xoá ở màn Campaign sẽ nằm ở đây để khôi phục khi cần.");
  delegate(el, "click", "[data-restore]", async (e, b) => {
    b.disabled = true;
    try { await api(`/campaigns/${encodeURIComponent(b.dataset.restore)}`, { method: "POST", body: { op: "restore" } }); toast("Đã khôi phục campaign", "Campaign quay lại danh sách với trạng thái cũ."); await reload(); delete cache.del; delete cache.sys; refresh(); }
    catch (err) { toast("Chưa khôi phục được", "Lỗi " + err.message, "danger"); b.disabled = false; }
  });
}

/* ---------- Công thức chỉ số ---------- */
async function metrics(el) {
  const r = await load("met", "/admin/metrics", el);
  if (!r) return;
  el.innerHTML = `<section class="card card-pad stack"><h3>Công thức đang dùng</h3><p>${formulaText(r.settings)}</p>
    <div class="row-wrap"><button class="btn btn-primary" type="button" data-act="met-edit">${icon("sliders", 16)} Sửa công thức</button><span class="faint">Lưu xong hệ thống tính lại ngay cho mọi creator từ các clip đã có.</span></div></section>`;
  delegate(el, "click", "[data-act=met-edit]", async () => { await openMetricsSettings(); delete cache.met; });
}
export const copilot = () => ({ label: "Quản trị", actions: [] });
/** Hướng dẫn chạy trên dữ liệu mẫu: vào / ra phải xoá bộ nhớ tạm để không lẫn số liệu mẫu với số thật. */
export const invalidateAll = () => { for (const k of Object.keys(cache)) delete cache[k]; };
export function onLists() {}
