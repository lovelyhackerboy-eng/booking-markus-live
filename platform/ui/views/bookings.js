// views/bookings.js — MÀN 5: Booking tracker (Đã xác nhận → Duyệt nội dung → Đã đăng → Đã thanh toán).
// Brief IV.6 (Booking Operations) + IV.4 (đánh giá sau booking tự chảy về Creator Profile = "Learn").
// Gộp 3 mục menu hiện tại — Hợp đồng (renderPipeline/drawKanban), Nội dung (renderContents), Thanh toán (renderPayments) —
// thành 1 bảng theo trạng thái của TỪNG booking. Phạm vi: theo dõi, không phải hệ thống thanh toán.

import { $, esc, icon, delegate, openOverlay, toast, fmtDate, fmtNum, fmtPct, relTime, ageDays, NOW } from "../core/ui.js";
import { state, can, getCreator, advanceBooking, evaluateBooking, BOOKING_STAGES, campaignHash, canSeeBooking } from "../core/store.js";
import { TEAM } from "../data/catalog.js";
import { post } from "../ai/copilot.js";
import { refresh } from "../core/router.js";
import { plat, money, stars, pageHead, avatar, srcBadge } from "../core/parts.js";

let mode = "board", owner = "";
const daysLeft = (b) => Math.ceil((new Date(b.deadline) - NOW) / 864e5);
// Cùng quy tắc với Campaign: Quản lý / Admin thấy tất cả (lọc được theo người); người khác chỉ thấy booking của mình / campaign mình theo dõi.
const visible = () => state.bookings.filter((b) => canSeeBooking(b) && (!can("allCampaigns") || !owner || b.owner === owner));
const stageOf = (id) => BOOKING_STAGES.find((s) => s.id === id);
// Cột "Đã thanh toán" chỉ giữ booking mới xong (60 ngày) hoặc còn thiếu đánh giá; phần cũ nằm trong Lịch sử hợp tác của creator.
const inColumn = (b, stage) => b.status === stage && (stage !== "paid" || !b.evaluation || ageDays(b.date) <= 60);

function dueBadge(b) {
  if (b.status === "posted" || b.status === "paid") return "";
  const d = daysLeft(b);
  return `<span class="badge ${d < 0 ? "badge-danger" : d <= 5 ? "badge-warning" : ""}">${icon("clock", 12)} ${d < 0 ? `Trễ ${-d} ngày` : `Còn ${d} ngày`}</span>`;
}
function actionBtn(b) {
  if (!can("edit")) return "";
  if (b.status === "paid") return b.evaluation ? "" : `<button class="btn btn-sm btn-primary" type="button" data-eval="${b.id}">${icon("star", { size: 14, variant: "fill" })} Đánh giá</button>`;
  return `<button class="btn btn-sm" type="button" data-next="${b.id}">${esc(stageOf(b.status).next)} ${icon("chevR", 14)}</button>`;
}
function card(b) {
  const c = getCreator(b.creatorId);
  return `<article class="bk-card lift">
    <div class="row">${avatar(c, "sm")}<div style="min-width:0;flex:1"><a href="#/creator/${c.id}?tab=lich-su"><strong>${esc(c.name)}</strong></a><span class="dt-sub">${esc(b.brand)} · ${esc(b.campaign)}</span></div></div>
    <div class="row-wrap">${plat(b.platform)}<span>${esc(b.sow)}</span><span class="spacer"></span><strong>${money(b.closed)}</strong></div>
    <div class="row-wrap">
      ${dueBadge(b)}
      <span class="badge ${b.contract === "signed" ? "badge-success" : "badge-warning"}">HĐ ${b.contract === "signed" ? "đã ký" : "chờ ký"}</span>
      ${b.contentUrl ? `<a class="badge badge-info" href="${esc(b.contentUrl)}" target="_blank" rel="noopener">Link bài ${icon("external", 10)}</a>` : ""}
      ${b.evaluation ? `<span class="badge">${stars(b.evaluation.score)}</span>` : ""}
    </div>
    ${b.tracking ? `<div class="bk-track" title="Số do crawler tự thu từ bài đăng — xác nhận lại khi đánh giá">${icon("sync", 12)} Đang theo dõi: <strong class="num">${fmtNum(b.tracking.views)} view</strong> · ER ${fmtPct(b.tracking.er)} ${srcBadge(b.tracking.source)} <span class="faint">${relTime(b.tracking.at)}</span></div>` : ""}
    <div class="row"><span class="faint">${esc(b.id)} · ${esc(b.owner)} · hạn ${fmtDate(b.deadline)}</span><span class="spacer"></span>${actionBtn(b)}</div>
  </article>`;
}

function boardHtml(list) {
  return `<div class="board">${BOOKING_STAGES.map((s) => { const col = list.filter((b) => inColumn(b, s.id)); return `
    <section class="board-col" aria-label="${esc(s.label)}">
      <h2>${esc(s.label)} <span class="badge">${col.length}</span></h2>
      ${col.map(card).join("") || `<p class="faint board-empty">Không có booking.</p>`}
    </section>`; }).join("")}</div>`;
}
function listHtml(list) {
  const rows = [...list].sort((a, b) => new Date(b.date) - new Date(a.date));
  return `<div class="dt-wrap"><table class="dt">
    <thead><tr><th>Creator</th><th>Brand · Chiến dịch</th><th>SOW</th><th class="t-right">Giá chốt</th><th>Hạn</th><th>Tiến độ</th><th></th></tr></thead>
    ${rows.map((b) => { const c = getCreator(b.creatorId); const i = BOOKING_STAGES.findIndex((s) => s.id === b.status); return `<tbody><tr>
      <td class="t-main"><a href="#/creator/${c.id}?tab=lich-su"><strong>${esc(c.name)}</strong></a><span class="dt-sub">${esc(b.id)} · ${esc(b.owner)}</span></td>
      <td data-label="Brand · Chiến dịch">${esc(b.brand)}<span class="dt-sub">${esc(b.campaign)}</span></td>
      <td data-label="SOW"><span class="row">${plat(b.platform)} ${esc(b.sow)}</span></td>
      <td data-label="Giá chốt" class="t-right"><strong>${money(b.closed)}</strong></td>
      <td data-label="Hạn">${fmtDate(b.deadline)} ${dueBadge(b)}</td>
      <td data-label="Tiến độ" class="t-full"><div class="steps" role="img" aria-label="${esc(stageOf(b.status).label)}">${BOOKING_STAGES.map((s, k) => `<i class="${k <= i ? "on" : ""}"></i>`).join("")}</div><span class="dt-sub">${esc(stageOf(b.status).label)}${b.evaluation ? " · đã đánh giá" : ""}</span></td>
      <td class="t-full">${actionBtn(b)}</td>
    </tr></tbody>`; }).join("")}
  </table></div>`;
}

export function render(root) {
  const list = visible();
  const running = list.filter((b) => b.status !== "paid");
  const toEval = list.filter((b) => b.status === "paid" && !b.evaluation).length;
  root.innerHTML = `
  <div class="page">
    ${pageHead("Booking tracker", `${running.length} booking đang chạy · tổng giá trị ${money(running.reduce((s, b) => s + b.closed, 0))}${toEval ? ` · <strong>${toEval} booking chờ đánh giá</strong>` : ""}`,
      can("edit") ? `<a class="btn btn-primary" href="${campaignHash("ung-vien")}">${icon("plus", 16)} Tạo booking từ campaign</a>` : "")}
    <div class="row-wrap">
      <div class="segmented" role="group" aria-label="Chế độ xem">
        <button type="button" data-mode="board" aria-pressed="${mode === "board"}">${icon("columns", 14)} Bảng</button>
        <button type="button" data-mode="list" aria-pressed="${mode === "list"}">${icon("listBullet", 14)} Danh sách</button>
      </div>
      <span class="spacer"></span>
      ${can("allCampaigns") ? `<label class="faint" for="bk-owner">Người phụ trách</label>
      <select class="select" id="bk-owner" style="width:auto"><option value="">Tất cả</option>${TEAM.map((t) => `<option ${t === owner ? "selected" : ""}>${esc(t)}</option>`).join("")}</select>` : `<span class="faint">Booking bạn phụ trách hoặc thuộc campaign bạn theo dõi</span>`}
    </div>
    ${mode === "board" ? boardHtml(list) : listHtml(list.filter((b) => b.status !== "paid" || !b.evaluation || ageDays(b.date) <= 60))}
    <p class="faint">Booking đã hoàn tất và đánh giá xong nằm trong tab “Lịch sử hợp tác” của từng creator.</p>
  </div>`;
  delegate(root, "click", "[data-mode]", (e, b) => { mode = b.dataset.mode; refresh(); });
  $("#bk-owner", root)?.addEventListener("change", (e) => { owner = e.target.value; refresh(); });
  delegate(root, "click", "[data-next]", (e, b) => {
    const bk = advanceBooking(b.dataset.next); // phát "data" → màn tự vẽ lại
    toast("Đã chuyển bước", `${bk.id} → ${stageOf(bk.status).label}`);
    if (bk.status === "paid") openEvaluate(bk.id);
  });
  delegate(root, "click", "[data-eval]", (e, b) => openEvaluate(b.dataset.eval));
}

/** Đánh giá sau booking: kết quả thực tế + working evaluation → cập nhật working score của creator. */
function openEvaluate(id) {
  const b = state.bookings.find((x) => x.id === id);
  const c = getCreator(b.creatorId);
  let score = 4.5;
  const o = openOverlay({
    kind: "modal", title: `Đánh giá booking ${b.id}`,
    body: `<div class="stack">
      <p class="muted"><strong>${esc(c.name)}</strong> · ${esc(b.brand)} – ${esc(b.campaign)}. Kết quả sẽ được gộp vào hồ sơ creator để lần chọn sau chính xác hơn.</p>
      <div class="field-row">
        <div class="field ${b.tracking ? "is-ai" : ""}"><label for="ev-views">View thực tế</label><input class="input" id="ev-views" type="number" min="0" placeholder="VD: 120000" value="${b.tracking ? b.tracking.views : ""}" /></div>
        <div class="field ${b.tracking ? "is-ai" : ""}"><label for="ev-er">Engagement rate (%)</label><input class="input" id="ev-er" type="number" min="0" step="0.1" placeholder="VD: 5.4" value="${b.tracking ? b.tracking.er : ""}" /></div>
      </div>
      ${b.tracking ? `<p class="field-hint">${icon("sync", 12)} Số điền sẵn do crawler thu từ bài đăng (${relTime(b.tracking.at)}). Hãy kiểm tra và sửa nếu cần trước khi lưu.</p>` : ""}
      <div class="field"><span class="field-label" id="ev-l">Điểm làm việc (working score)</span>
        <div class="chip-set" role="group" aria-labelledby="ev-l">${[2, 3, 3.5, 4, 4.5, 5].map((s) => `<button type="button" class="chip" data-score="${s}" aria-pressed="${s === score}">${icon("star", { size: 12, variant: "fill" })} ${String(s).replace(".", ",")}</button>`).join("")}</div></div>
      <div class="field"><label for="ev-note">Nhận xét làm việc</label><textarea class="textarea" id="ev-note" placeholder="Đúng hạn? Đúng brief? Cần chỉnh sửa mấy vòng? Có nên hợp tác lại?"></textarea></div>
    </div>`,
    footer: `<button class="btn btn-ghost" data-close type="button">Để sau</button><span class="spacer"></span><button class="btn btn-primary" type="button" id="ev-save">Lưu đánh giá</button>`,
  });
  delegate(o.el, "click", "[data-score]", (e, btn) => { score = +btn.dataset.score; o.el.querySelectorAll("[data-score]").forEach((x) => x.setAttribute("aria-pressed", String(x === btn))); });
  $("#ev-save", o.el).addEventListener("click", () => {
    const views = +$("#ev-views", o.el).value, er = +$("#ev-er", o.el).value, note = $("#ev-note", o.el).value.trim();
    if (!views) return $("#ev-views", o.el).focus();
    o.close();
    evaluateBooking(id, { score, note: note || "Không có nhận xét.", views, er });
    toast("Đã lưu đánh giá", `Working score của ${c.name} đã được cập nhật.`);
  });
}

export function copilot() {
  const run = visible().filter((b) => b.status !== "paid");
  return {
    label: "Booking tracker",
    actions: [
      { label: "Booking nào sắp trễ hạn?", match: /tre|han|deadline/, run: () => {
        const soon = run.filter((b) => (b.status === "confirmed" || b.status === "content") && daysLeft(b) <= 7).sort((a, b) => daysLeft(a) - daysLeft(b));
        post(soon.length ? `<strong>${soon.length} booking cần chú ý trong 7 ngày tới:</strong><ul>${soon.map((b) => `<li>${esc(b.id)} — ${esc(getCreator(b.creatorId).name)} × ${esc(b.brand)}: ${stageOf(b.status).label}, ${daysLeft(b) < 0 ? `trễ ${-daysLeft(b)} ngày` : `còn ${daysLeft(b)} ngày`} (${esc(b.owner)})</li>`).join("")}</ul>` : "Không có booking nào sắp tới hạn trong 7 ngày.");
      } },
      { label: "Tóm tắt tiến độ", match: /tom tat|tien do|tinh hinh/, run: () => post(`<strong>Tiến độ hiện tại</strong><ul>${BOOKING_STAGES.map((s) => `<li>${s.label}: ${visible().filter((b) => inColumn(b, s.id)).length}</li>`).join("")}</ul><p>${visible().filter((b) => b.contract !== "signed").length} booking chưa ký hợp đồng.</p>`) },
    ],
  };
}
