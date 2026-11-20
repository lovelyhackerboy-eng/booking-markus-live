// views/shortlist.js — Campaign, bước 1 "Ứng viên": ước tính KPI → so sánh cạnh nhau → xuất báo giá → duyệt sang bước Liên hệ (→ tạo booking).
// Là PANEL vẽ bên trong màn Campaign (views/campaigns.js), không còn là màn riêng.
// Giữ luồng lõi của app hiện tại: giỏ hàng (cart) → "Xuất báo giá" (thay renderCartFab() / drawCartDrawer() / exportShortlist()).
// Khác biệt: ứng viên gắn với 1 campaign; nút "Ứng viên" cố định trên topbar; thêm bước So sánh có nhận định AI.

import { $, esc, icon, delegate, openOverlay, toast, fmtNum, fmtPct, fmtVnd, fmtDate, downloadFile, copyText, NOW } from "../core/ui.js";
import { state, can, getCreator, bookingCount, bookingsOf, toggleShortlist, setShortlistRate, clearShortlist, createBookings, activeList, campaignHash, commitShortlist, FEATURES } from "../core/store.js";
import { PLATFORMS, competitorsOf } from "../data/catalog.js";
import { heroCh, BRAND_NAMES } from "../core/filters.js";
import { compareVerdict } from "../ai/mock-ai.js";
import { post } from "../ai/copilot.js";
import { refresh } from "../core/router.js";
import { avatar, plat, tierBadge, relBadge, repBadge, stars, money, trend, creatorCell, brandChips, pageHead, emptyState, emptyArt, perfOf } from "../core/parts.js";

let root = null, clientBrand = "";

/* Performance để ước tính KPI: view TB của kênh ứng với SOW đang chọn (không có kênh đó thì dùng kênh chính).
   Đã từng book qua Markus → hiện thêm view TB thực tế của bài branded (thường sát KPI hơn view organic). */
const chOf = (x) => (x.rate && x.c.channels[x.rate.platform]) || heroCh(x.c);
const items = () => state.shortlist.map((it) => ({ ...it, c: getCreator(it.id) })).filter((x) => x.c).map((x) => ({ ...x, rate: x.c.rates[x.rateIdx] || x.c.rates[0] || null }))
  .map((x) => ({ ...x, views: chOf(x).avgViews.value, perf: perfOf(x.c, bookingsOf(x.c.id)) }));
const totals = (list) => ({ n: list.length, reach: list.reduce((s, x) => s + heroCh(x.c).followers.value, 0), cost: list.reduce((s, x) => s + (x.rate ? x.rate.amount : 0), 0), views: list.reduce((s, x) => s + x.views, 0) });
const conflicts = (c) => (clientBrand ? c.brands.filter((b) => competitorsOf(clientBrand).includes(b)) : []);

/** Vẽ panel "Ứng viên" của campaign đang làm vào el. p.view = "compare" | (mặc định) danh sách; p.export = mở hộp thoại xuất. */
export function render(el, p) {
  root = el;
  const list = items();
  const t = totals(list);
  const tab = p.view === "compare" ? "compare" : "list";
  const proj = activeList();
  if (!list.length) {
    root.innerHTML = emptyState("list", "Campaign này chưa có ứng viên", can("edit") ? "Ở Khám phá, bấm “Lưu vào campaign” trên thẻ hoặc tick ô ở kiểu xem Bảng, rồi quay lại đây để ước tính KPI, so sánh và duyệt." : "Người phụ trách campaign sẽ thêm ứng viên từ Khám phá.", `<a class="btn btn-primary" href="#/kham-pha">${icon("compass", 16)} Tới Khám phá</a>`);
    return;
  }
  root.innerHTML = `
    <div class="row-wrap">
      <div class="segmented" role="group" aria-label="Chế độ xem">
        <button type="button" data-tab="list" aria-pressed="${tab === "list"}">${icon("listBullet", 14)} Danh sách</button>
        <button type="button" data-tab="compare" aria-pressed="${tab === "compare"}">${icon("columns", 14)} So sánh cạnh nhau</button>
      </div>
      <label class="faint" for="client-brand">Kiểm tra đối thủ của</label>
      <select class="select" id="client-brand" style="width:auto"><option value="">Chưa chọn</option>${BRAND_NAMES.map((b) => `<option ${b === clientBrand ? "selected" : ""}>${esc(b)}</option>`).join("")}</select>
      <span class="spacer"></span>
      ${can("edit") ? `<button class="btn btn-ghost" type="button" data-act="clear">${icon("trash", 16)} Xoá hết</button>` : ""}
      <button class="btn" type="button" data-act="export">${icon("export", 16)} Xuất báo giá</button>
      ${can("edit") ? `<button class="btn btn-primary" type="button" data-act="commit-all">${icon("checkCircle", 16)} Duyệt cả ${t.n}</button>` : ""}
    </div>
    ${clientBrand && list.some((x) => conflicts(x.c).length) ? `<div class="banner banner-warning" role="alert">${icon("alert")}<div><strong>Có creator từng làm cho đối thủ của ${esc(clientBrand)}</strong>${list.filter((x) => conflicts(x.c).length).map((x) => `${esc(x.c.name)} (${esc(conflicts(x.c).join(", "))})`).join(" · ")}</div></div>` : ""}
    ${tab === "list" ? listHtml(list) : compareHtml(list)}`;

  delegate(root, "click", "[data-tab]", (e, b) => { location.hash = campaignHash("ung-vien", b.dataset.tab === "compare" ? "&view=compare" : ""); });
  delegate(root, "click", "[data-rm]", (e, b) => toggleShortlist(b.dataset.rm, false));
  delegate(root, "change", "[data-rate]", (e, s) => setShortlistRate(s.dataset.rate, +s.value));
  $("#client-brand", root).addEventListener("change", (e) => { clientBrand = e.target.value; refresh(); });
  delegate(root, "click", "[data-commit]", (e, b) => commit([b.dataset.commit]));
  delegate(root, "click", "[data-act]", (e, b) => {
    if (b.dataset.act === "clear") { clearShortlist(); toast("Đã xoá ứng viên", `Campaign ${proj.name}`); }
    if (b.dataset.act === "export") openExport();
    if (b.dataset.act === "book") openBook();
    if (b.dataset.act === "commit-all") commit(list.map((x) => x.c.id));
  });
  if (p.export) { history.replaceState(null, "", campaignHash("ung-vien")); openExport(); }
}
export function onShortlist() { if (root && document.contains(root)) refresh(); } // root mới mỗi lần → không cộng dồn listener

/** Duyệt ứng viên: chuyển sang bước "Liên hệ" của chính campaign đang làm. */
function commit(ids) {
  const proj = activeList();
  const names = ids.map((id) => getCreator(id).name);
  commitShortlist(ids);
  toast("Đã duyệt", `${names.join(", ")} → ${proj.name} · theo dõi ở tab Liên hệ`);
}

const rateSelect = (x) => (!x.c.rates.length ? `<span class="faint">Chưa có giá</span>`
  : `<select class="select" data-rate="${x.c.id}" aria-label="SOW cho ${esc(x.c.name)}" ${can("edit") ? "" : "disabled"}>${x.c.rates.map((r, i) => `<option value="${i}" ${i === x.rateIdx ? "selected" : ""}>${PLATFORMS[r.platform].label} · ${esc(r.sow)}</option>`).join("")}</select>`);

function listHtml(list) {
  const t = totals(list), proj = activeList();
  const cpv = t.views ? t.cost / t.views : 0;
  // So với KPI: view của creator ĐÃ DUYỆT + view của ứng viên đang xem = "nếu duyệt hết" (khớp số ở đầu trang Campaign).
  const approved = proj.entries.map((e) => getCreator(e.id)).filter(Boolean).reduce((s, c) => s + heroCh(c).avgViews.value, 0);
  const pct = proj.kpiViews ? Math.round(((approved + t.views) / proj.kpiViews) * 100) : null;
  return `<div class="kpi-row">
    <div class="kpi"><div class="kpi-label">View dự kiến của ứng viên</div><div class="kpi-value num">${fmtNum(t.views)}</div><div class="kpi-sub">${pct != null ? `Nếu duyệt hết: ${pct}% KPI ${fmtNum(proj.kpiViews)}${pct < 100 ? ` · còn thiếu ${fmtNum(proj.kpiViews - approved - t.views)}` : " · đạt KPI"}` : "Campaign chưa đặt KPI view"}</div></div>
    <div class="kpi"><div class="kpi-label">Tổng chi phí dự kiến</div><div class="kpi-value">${money(t.cost)}</div><div class="kpi-sub">${money(t.cost, true)} · theo Current Rate, chưa thương lượng</div></div>
    <div class="kpi"><div class="kpi-label">CPV dự kiến</div><div class="kpi-value">${can("price") ? (cpv ? `~${Math.round(cpv)} ₫` : "—") : money(0)}</div><div class="kpi-sub">chi phí ÷ view dự kiến</div></div>
    <div class="kpi"><div class="kpi-label">Tổng reach (hero platform)</div><div class="kpi-value">${fmtNum(t.reach)}</div><div class="kpi-sub">${t.n} creator</div></div>
  </div>
  <div class="dt-wrap"><table class="dt">
    <thead><tr><th>Creator</th><th>Tier</th><th>Hero platform</th><th>SOW đề xuất</th><th class="t-right">Performance (view TB)</th><th class="t-right">Đơn giá</th><th>Quan hệ</th><th><span class="sr-only">Chốt · Bỏ</span></th></tr></thead>
    ${list.map((x) => `<tbody class="${x.c.rel.status === "dnr" ? "is-flagged" : ""}"><tr>
      <td class="t-main">${creatorCell(x.c)}<span class="dt-sub">${repBadge(x.c)}</span></td>
      <td data-label="Tier">${tierBadge(x.c.tier)}</td>
      <td data-label="Hero platform"><span class="row" style="gap:6px">${plat(x.c.hero)} <strong class="num">${fmtNum(heroCh(x.c).followers.value)}</strong></span><span class="dt-sub">ER ${fmtPct(heroCh(x.c).er.value)}</span></td>
      <td data-label="SOW đề xuất" class="t-full">${rateSelect(x)}</td>
      <td data-label="Performance (view TB)" class="t-right"><strong class="num">${fmtNum(x.views)}</strong><span class="dt-sub">${x.perf.n ? `Branded qua Markus: ${fmtNum(x.perf.brandedViews)} · ${x.perf.n} bài` : `${PLATFORMS[chOf(x) === heroCh(x.c) ? x.c.hero : x.rate.platform].label} · chưa book qua Markus`}</span></td>
      <td data-label="Đơn giá" class="t-right"><strong>${x.rate ? money(x.rate.amount, true) : "—"}</strong></td>
      <td data-label="Quan hệ">${relBadge(x.c.rel.status)}<span class="dt-sub">${stars(x.c.rel.score)}</span></td>
      <td class="t-full"><span class="row" style="gap:4px;flex-wrap:nowrap">${can("edit") ? `<button class="btn btn-sm" type="button" data-commit="${x.c.id}" title="Duyệt ${esc(x.c.name)}: chuyển sang bước Liên hệ của ${esc(proj.name)}">${icon("check", 14)} Duyệt</button><button class="btn btn-ghost btn-icon btn-sm" type="button" data-rm="${x.c.id}" aria-label="Bỏ ${esc(x.c.name)} khỏi ứng viên">${icon("xmark", 16)}</button>` : ""}</span></td>
    </tr></tbody>`).join("")}
    <tfoot><tr><td colspan="4"><strong>Tổng ${t.n} creator</strong></td><td class="t-right"><strong class="num">${fmtNum(t.views)}</strong></td><td class="t-right"><strong>${money(t.cost, true)}</strong></td><td colspan="2"></td></tr></tfoot>
  </table></div>
  <p class="faint">Performance = view trung bình của kênh ứng với SOW đã chọn. Creator từng book qua Markus có thêm view thực tế của bài branded.${can("edit") ? ` Cần tạo booking ngay? <button class="link" type="button" data-act="book">Tạo booking cho các ứng viên này</button>.` : ""}</p>`;
}

/* ---------- So sánh cạnh nhau: mỗi creator 1 cột, ô tốt nhất được tô ---------- */
function compareHtml(list) {
  const price = can("price");
  const cs = list.map((x) => x.c);
  const best = (vals, dir) => { const nums = vals.filter((v) => v != null); if (nums.length < 2) return null; return dir > 0 ? Math.max(...nums) : Math.min(...nums); };
  const cpv = (x) => (x.rate && heroCh(x.c).avgViews.value ? x.rate.amount / heroCh(x.c).avgViews.value : null);
  // [nhãn, giá trị số để so (hoặc null), HTML hiển thị, hướng tốt: 1 = cao hơn tốt, -1 = thấp hơn tốt, 0 = không so]
  const ROWS = [
    ["Overall tier", () => null, (x) => tierBadge(x.c.tier), 0],
    ["Hero platform", (x) => heroCh(x.c).followers.value, (x) => `${plat(x.c.hero)} <strong class="num">${fmtNum(heroCh(x.c).followers.value)}</strong>`, 1],
    ["Engagement rate", (x) => heroCh(x.c).er.value, (x) => fmtPct(heroCh(x.c).er.value), 1],
    ["View trung bình", (x) => heroCh(x.c).avgViews.value, (x) => fmtNum(heroCh(x.c).avgViews.value), 1],
    ["Tăng trưởng 3 tháng", (x) => heroCh(x.c).growthPct, (x) => trend(heroCh(x.c).growthPct), 1],
    ["SOW · đơn giá", (x) => (price && x.rate ? x.rate.amount : null), (x) => (x.rate ? `${money(x.rate.amount)}<span class="dt-sub">${esc(x.rate.sow)}</span>` : "—"), -1],
    ...(price ? [["Chi phí / view ước tính", cpv, (x) => (cpv(x) ? `~${Math.round(cpv(x))} ₫` : "—"), -1]] : []),
    ["Working score", (x) => x.c.rel.score, (x) => stars(x.c.rel.score), 1],
    ["Booking qua Markus", (x) => bookingCount(x.c.id), (x) => `${bookingCount(x.c.id)} lần`, 1],
    ["Quan hệ", () => null, (x) => `${relBadge(x.c.rel.status)}<span class="dt-sub">${esc(x.c.rel.owner)}</span>`, 0],
    ["Brand đã hợp tác", () => null, (x) => brandChips(x.c, 4, conflicts(x.c)), 0],
    ...(clientBrand ? [[`Đối thủ của ${clientBrand}`, () => null, (x) => (conflicts(x.c).length ? `<span class="badge badge-danger">${icon("alert", 12)} ${esc(conflicts(x.c).join(", "))}</span>` : `<span class="badge badge-success">✓ Không</span>`), 0]] : []),
    ["Audience", () => null, (x) => `${x.c.audience.female}% nữ · ${esc(x.c.audience.age)}<span class="dt-sub">${esc(x.c.audience.tags.join(", "))}</span>`, 0],
  ];
  const LIVE_HIDE = FEATURES.metricsExtra ? [] : ["Engagement rate", "View trung bình", "Tăng trưởng 3 tháng", "Chi phí / view ước tính", "Working score", "Brand đã hợp tác", "Audience"];
  const rowsShown = ROWS.filter((r) => !LIVE_HIDE.includes(r[0]));
  const verdict = compareVerdict(cs, { allowPrice: price });
  return `
    ${verdict.length ? `<section class="card card-ai card-pad"><h2 style="margin-bottom:8px">${icon("sparkles", 16)} Nhận định của AI</h2><ul class="bullets">${verdict.map((v) => `<li>${esc(v)}</li>`).join("")}</ul><p class="faint" style="margin-top:8px">Gợi ý dựa trên dữ liệu hiện có. Lựa chọn cuối cùng thuộc về bạn.</p></section>` : `<div class="banner">${icon("columns")}<div>Thêm ít nhất 2 creator để so sánh.</div></div>`}
    <div class="cmp-wrap card" tabindex="0" role="region" aria-label="Bảng so sánh, cuộn ngang nếu nhiều creator">
      <table class="cmp" style="--cols:${list.length}">
        <thead><tr><th scope="col"><span class="sr-only">Tiêu chí</span></th>${list.map((x) => `<th scope="col"><div class="cmp-head">${avatar(x.c)}<a href="#/creator/${x.c.id}">${esc(x.c.name)}</a><span class="dt-sub">${esc(x.c.type)} · ${esc(x.c.region)}</span>
          ${can("edit") ? `<button class="btn btn-ghost btn-sm" type="button" data-rm="${x.c.id}">Bỏ</button>` : ""}</div></th>`).join("")}</tr></thead>
        <tbody>${rowsShown.map(([label, num, html, dir]) => { const vals = list.map(num); const b = dir ? best(vals, dir) : null; return `<tr><th scope="row">${esc(label)}</th>${list.map((x, i) => `<td class="${b != null && vals[i] === b ? "is-best" : ""}">${html(x)}</td>`).join("")}</tr>`; }).join("")}</tbody>
      </table>
    </div>
    <p class="faint">Ô tô xanh = tốt nhất trong nhóm ở tiêu chí đó.</p>`;
}

/* ---------- Xuất báo giá ---------- */
function openExport() {
  const list = items();
  if (!list.length) return toast("Campaign chưa có ứng viên", "", "warning");
  if (!can("price")) {
    return openOverlay({ kind: "modal", title: "Xuất báo giá", body: `<div class="banner banner-warning">${icon("lock")}<div><strong>Vai trò Viewer không xuất được báo giá</strong>Báo giá chứa đơn giá của creator. Hãy nhờ Planner hoặc Admin xuất file.</div></div>`, footer: `<span class="spacer"></span><button class="btn btn-primary" data-close type="button">Đã hiểu</button>` });
  }
  const t = totals(list);
  const today = fmtDate(NOW.toISOString());
  const o = openOverlay({
    kind: "modal", wide: true, title: "Xuất báo giá",
    body: `<div class="stack">
      <div class="field-row">
        <div class="field"><label for="q-name">Tên báo giá</label><input class="input" id="q-name" value="Báo giá KOL${clientBrand ? " – " + esc(clientBrand) : ""} – ${today}" /></div>
        <div class="field"><label for="q-note">Ghi chú gửi kèm</label><input class="input" id="q-note" placeholder="VD: Giá chưa gồm VAT, hiệu lực 14 ngày" /></div>
      </div>
      <div class="dt-wrap"><table class="dt">
        <thead><tr><th>Creator</th><th>Nền tảng · SOW</th><th class="t-right">Follower</th><th class="t-right">Đơn giá</th></tr></thead>
        ${list.map((x) => `<tbody><tr><td class="t-main"><strong>${esc(x.c.name)}</strong><span class="dt-sub">${esc(x.c.handle)} · ${esc(x.c.tier)}</span></td>
          <td data-label="Nền tảng · SOW">${x.rate ? `<span class="row" style="gap:6px">${plat(x.rate.platform, 18)} ${PLATFORMS[x.rate.platform].label} · ${esc(x.rate.sow)}</span>` : "—"}</td>
          <td class="t-right" data-label="Follower">${fmtNum(heroCh(x.c).followers.value)}</td>
          <td class="t-right" data-label="Đơn giá"><strong>${x.rate ? fmtVnd(x.rate.amount, true) : "Chưa có giá"}</strong></td></tr></tbody>`).join("")}
      </table></div>
      <div class="row"><span class="muted">${t.n} creator · reach ${fmtNum(t.reach)}</span><span class="spacer"></span><strong style="font-size:var(--fs-lg)">Tổng: ${fmtVnd(t.cost, true)}</strong></div>
      ${list.some((x) => !x.rate) ? `<div class="banner banner-warning">${icon("alert", 16)}<div>Có creator chưa có giá — dòng đó sẽ để trống trong file.</div></div>` : ""}
    </div>`,
    footer: `<button class="btn" type="button" id="q-copy">${icon("copy", 16)} Sao chép bảng</button><span class="spacer"></span><button class="btn" data-close type="button">Đóng</button><button class="btn btn-primary" type="button" id="q-csv">${icon("download", 16)} Tải file CSV</button>`,
  });
  const rows = () => [
    ["STT", "Creator", "Handle", "Tier", "Nền tảng", "SOW", "Follower", "ER (%)", "View dự kiến", "Đơn giá (VND)"],
    ...list.map((x, i) => [i + 1, x.c.name, x.c.handle, x.c.tier, x.rate ? PLATFORMS[x.rate.platform].label : "", x.rate ? x.rate.sow : "", heroCh(x.c).followers.value, heroCh(x.c).er.value, x.views, x.rate ? x.rate.amount : ""]),
    ["", "TỔNG", "", "", "", "", t.reach, "", t.views, t.cost],
    ["", $("#q-note", o.el).value],
  ];
  $("#q-csv", o.el).addEventListener("click", () => {
    const csv = rows().map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\r\n");
    downloadFile(($("#q-name", o.el).value.trim() || "bao-gia") + ".csv", csv);
    toast("Đã xuất báo giá", `${t.n} creator · ${fmtVnd(t.cost, true)}`);
  });
  $("#q-copy", o.el).addEventListener("click", () => copyText(rows().map((r) => r.join("\t")).join("\n")));
}

/* ---------- Ứng viên → booking record (brand + tên campaign lấy từ chính campaign, không nhập lại) ---------- */
function openBook() {
  const list = items().filter((x) => x.rate);
  const proj = activeList();
  const o = openOverlay({
    kind: "modal", title: "Tạo booking cho ứng viên",
    body: `<div class="stack">
      <p class="muted">Tạo ${list.length} booking ở trạng thái <strong>Đã xác nhận</strong> cho campaign <strong>${esc(proj.name)}</strong>${proj.brand ? ` (brand ${esc(proj.brand)})` : ""}. Giá chốt mặc định bằng Current Rate — sửa lại sau khi thương lượng.</p>
      <label class="check"><input type="checkbox" id="b-clear" checked /> Chuyển các ứng viên này sang bước Liên hệ</label>
    </div>`,
    footer: `<span class="spacer"></span><button class="btn" data-close type="button">Huỷ</button><button class="btn btn-primary" type="button" id="b-save">Tạo ${list.length} booking</button>`,
  });
  $("#b-save", o.el).addEventListener("click", () => {
    const clear = $("#b-clear", o.el).checked;
    o.close();
    createBookings(list, proj.brand || "Chưa gắn brand", proj.name, proj.id);
    if (clear) commitShortlist(list.map((x) => x.c.id));
    toast("Đã tạo booking", `${list.length} booking · ${proj.name}`);
    location.hash = "#/booking";
  });
}

/* ---------- Drawer shortlist (mở từ topbar ở mọi màn) ---------- */
export function openShortlistDrawer() {
  const body = () => {
    const list = items();
    const t = totals(list);
    return list.length ? `<div class="stack">${list.map((x) => `<div class="sim-row">${creatorCell(x.c, `${x.c.tier} · ${x.rate ? PLATFORMS[x.rate.platform].label + " " + x.rate.sow : "chưa có giá"}`)}
        <span>${x.rate ? money(x.rate.amount) : ""}</span>${can("edit") ? `<button class="btn btn-ghost btn-icon btn-sm" type="button" data-rm="${x.c.id}" aria-label="Bỏ ${esc(x.c.name)}">${icon("xmark", 16)}</button>` : ""}</div>`).join("")}
      <hr class="divider" /><div class="row"><span class="muted">${t.n} creator · reach ${fmtNum(t.reach)}</span><span class="spacer"></span><strong>${money(t.cost, true)}</strong></div></div>`
      : `<div class="empty">${emptyArt("list")}<strong>${activeList() ? "Campaign này chưa có ứng viên" : "Bạn chưa theo dõi campaign nào"}</strong>${activeList() ? "Ở Khám phá, bấm “Lưu vào campaign” trên creator. Đổi campaign đang làm ở màn Campaign." : "Tạo campaign mới hoặc nhờ người phụ trách mời bạn vào campaign."}</div>`;
  };
  const o = openOverlay({
    kind: "drawer", title: activeList() ? `Ứng viên · ${activeList().name}` : "Ứng viên", body: body(),
    footer: activeList() ? `<a class="btn" href="${campaignHash("ung-vien", "&view=compare")}" data-close>${icon("columns", 16)} So sánh</a><span class="spacer"></span><a class="btn btn-primary" href="${campaignHash("ung-vien")}" data-close>Ước tính KPI & duyệt</a>` : `<span class="spacer"></span><a class="btn btn-primary" href="#/campaign" data-close>Tới Campaign</a>`,
  });
  delegate(o.el, "click", "[data-rm]", (e, b) => { toggleShortlist(b.dataset.rm, false); o.body.innerHTML = body(); });
}

export function copilot() {
  const cs = items().map((x) => x.c);
  return {
    label: `Ứng viên của ${activeList() ? activeList().name : "campaign"} (${cs.length} creator)`,
    actions: [
      { label: "Nhận định shortlist", match: /nhan dinh|so sanh|danh gia/, run: () => {
        const v = compareVerdict(cs, { allowPrice: can("price") });
        post(v.length ? `<strong>Nhận định ứng viên</strong><ul>${v.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : "Cần ít nhất 2 ứng viên để so sánh.", v.length ? [{ label: "Mở bảng so sánh", run: () => { location.hash = campaignHash("ung-vien", "&view=compare"); } }] : []);
      } },
      { label: "Kiểm tra rủi ro", match: /rui ro|canh bao/, run: () => {
        const risky = cs.filter((c) => c.rel.status === "dnr" || c.rel.status === "watchlist" || !c.rel.score);
        post(risky.length ? `<strong>Cần xem lại trước khi gửi khách:</strong><ul>${risky.map((c) => `<li><a href="#/creator/${c.id}?tab=quan-he">${esc(c.name)}</a> — ${c.rel.status === "dnr" ? "Do-Not-Recommend" : c.rel.status === "watchlist" ? "Watchlist" : "chưa có lịch sử làm việc"}</li>`).join("")}</ul>` : "Không thấy rủi ro nổi bật: tất cả creator đều đã có lịch sử làm việc và không nằm trong Watchlist / DNR.");
      } },
      { label: "Xuất báo giá", run: () => post("Mình mở hộp thoại xuất báo giá để bạn kiểm tra trước khi tải file.", [{ label: "Mở xuất báo giá", primary: true, repeat: true, run: openExport }]) },
    ],
  };
}
