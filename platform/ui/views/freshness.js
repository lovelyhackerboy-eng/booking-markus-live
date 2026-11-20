// views/freshness.js — MÀN 6: Dữ liệu & đồng bộ.
// Brief IV.5: "Các chỉ số cần có nguồn dữ liệu, thời điểm cập nhật và trạng thái xác minh";
//             "Dữ liệu từ AI/crawler cần có khả năng kiểm tra và điều chỉnh thủ công".
// Thay cho banner vàng "Đến hạn refresh chỉ số" + nút "✓ Đã cập nhật xong" (renderRefreshBanner / markRefreshed)
// và tab "Chất lượng dữ liệu" (renderDataQuality / drawDqView) trong app.js.
// 3 tab: Chờ duyệt (đề xuất từ crawler/AI) · Xung đột (nhập tay ≠ đồng bộ) · Theo creator (độ mới từng hồ sơ).

import { $, esc, icon, delegate, openOverlay, toast, relTime, ageDays, count } from "../core/ui.js";
import { state, can, getCreator, approveReview, rejectReview, resolveConflict, syncNow, syncCreator } from "../core/store.js";
import { setQuery } from "../core/router.js";
import { PLATFORMS, tierOf } from "../data/catalog.js";
import { post } from "../ai/copilot.js";
import { plat, srcBadge, creatorCell, pageHead, emptyState, METRIC_FMT, METRIC_LABEL, STALE_DAYS } from "../core/parts.js";

const dec = (n) => String(n).replace(".", ",");
const cur = (q) => getCreator(q.creatorId).channels[q.platform][q.metric];
const delta = (from, to) => (from ? ((to - from) / from) * 100 : 0);
const isSmall = (q) => !q.isNew && Math.abs(delta(cur(q).value, q.proposed)) < 5 && q.confidence >= 0.9 && !tierChange(q);
function tierChange(q) {
  if (q.metric !== "followers" || q.isNew) return "";
  const a = tierOf(cur(q).value), b = tierOf(q.proposed);
  return a === b ? "" : `${a} → ${b}`;
}
const deltaBadge = (pct) => `<span class="badge ${Math.abs(pct) >= 10 ? "badge-warning" : ""} num">${pct >= 0 ? "+" : ""}${dec(pct.toFixed(1))}%</span>`;

function queueHtml() {
  const list = state.reviewQueue;
  if (!list.length) return emptyState("done", "Không còn chỉ số nào chờ duyệt", "Lần đồng bộ tới sẽ đưa các thay đổi mới vào đây.");
  const small = list.filter(isSmall).length;
  return `
    ${can("verify") && small ? `<div class="banner banner-ai">${icon("sparkles")}<div><strong>${small} thay đổi nhỏ có thể duyệt nhanh</strong>Lệch dưới 5%, độ tin cậy ≥ 90%, không đổi tier.</div><button class="btn btn-sm btn-primary" type="button" data-bulk>Duyệt ${small} mục</button></div>` : ""}
    <div class="stack">${list.map((q) => {
      const c = getCreator(q.creatorId), m = cur(q), fmt = METRIC_FMT[q.metric], pct = delta(m.value, q.proposed), tc = tierChange(q);
      return `<article class="card rq">
        <div class="rq-who">${creatorCell(c, `${PLATFORMS[q.platform].label} · ${METRIC_LABEL[q.metric]}`)}</div>
        <div class="rq-change">
          <div><span class="faint">${q.isNew ? "Chưa có giá trị" : "Đang lưu"}</span><strong class="num">${q.isNew ? "—" : esc(fmt(m.value))}</strong>${q.isNew ? "" : `<span class="faint">${srcBadge(m.source)} ${relTime(m.updatedAt)}</span>`}</div>
          <span class="rq-arrow" aria-hidden="true">→</span>
          <div><span class="faint">Đề xuất</span><strong class="num">${esc(fmt(q.proposed))}</strong><span class="faint">${srcBadge(q.source)} ${relTime(q.at)}</span></div>
        </div>
        <div class="rq-meta row-wrap">
          ${q.isNew ? `<span class="badge badge-ai">Hồ sơ mới</span>` : deltaBadge(pct)}
          ${tc ? `<span class="badge badge-danger">Đổi tier: ${esc(tc)}</span>` : ""}
          <span class="badge ${q.confidence < 0.75 ? "badge-warning" : ""}" title="Độ tin cậy của nguồn">Tin cậy ${Math.round(q.confidence * 100)}%</span>
        </div>
        ${can("verify") ? `<div class="rq-actions">
          <button class="btn btn-sm btn-primary" type="button" data-approve="${q.id}">${icon("checkCircle", { size: 16, variant: "fill" })} Duyệt</button>
          <button class="btn btn-sm" type="button" data-edit="${q.id}">${icon("edit", 14)} Sửa</button>
          <button class="btn btn-sm btn-ghost" type="button" data-reject="${q.id}">${icon("xmark", 14)} Bỏ qua</button></div>` : ""}
      </article>`; }).join("")}</div>`;
}

function conflictHtml() {
  const list = state.conflicts;
  if (!list.length) return emptyState("done", "Không có xung đột", "Giá trị nhập tay và giá trị đồng bộ đang khớp nhau.");
  return `<div class="stack">${list.map((cf) => {
    const c = getCreator(cf.creatorId), fmt = METRIC_FMT[cf.metric], pct = delta(cf.manual.value, cf.synced.value);
    return `<article class="card card-pad stack">
      <div class="row-wrap">${creatorCell(c, `${PLATFORMS[cf.platform].label} · ${METRIC_LABEL[cf.metric]}`)}<span class="spacer"></span>${deltaBadge(pct)}</div>
      <div class="cf-options">
        <div class="cf-opt"><span class="src src-manual">Nhập tay</span><strong class="num">${esc(fmt(cf.manual.value))}</strong><span class="faint">${esc(cf.manual.by)} · ${relTime(cf.manual.at)}</span>
          ${can("verify") ? `<button class="btn btn-sm" type="button" data-keep="manual" data-id="${cf.id}">Giữ giá trị nhập tay</button>` : ""}</div>
        <div class="cf-opt"><span>${srcBadge(cf.synced.source)}</span><strong class="num">${esc(fmt(cf.synced.value))}</strong><span class="faint">Đồng bộ ${relTime(cf.synced.at)}</span>
          ${can("verify") ? `<button class="btn btn-sm btn-primary" type="button" data-keep="synced" data-id="${cf.id}">Dùng giá trị đồng bộ</button>` : ""}</div>
      </div>
      <p class="faint">Hệ thống không tự ghi đè giá trị nhập tay. Giá trị được chọn sẽ ghi kèm nguồn và người xác minh.</p>
    </article>`; }).join("")}</div>`;
}

const dot = (iso) => { const d = ageDays(iso); return d > STALE_DAYS ? "danger" : d > 7 ? "warning" : "success"; };
function creatorsHtml() {
  const rows = [...state.creators].sort((a, b) => new Date(a.lastSynced) - new Date(b.lastSynced));
  return `<div class="dt-wrap"><table class="dt">
    <thead><tr><th>Creator</th><th>Đồng bộ lần cuối</th><th>Độ mới từng kênh</th><th>Chưa xác minh</th><th>Trạng thái</th><th></th></tr></thead>
    ${rows.map((c) => {
      const all = Object.values(c.channels).flatMap((ch) => [ch.followers, ch.er, ch.avgViews]);
      const unv = all.filter((m) => m.verify !== "verified").length;
      const stale = ageDays(c.lastSynced) > STALE_DAYS;
      return `<tbody><tr>
        <td class="t-main">${creatorCell(c, `${c.handle} · ${c.tier}`)}</td>
        <td data-label="Đồng bộ lần cuối">${relTime(c.lastSynced)}</td>
        <td data-label="Độ mới từng kênh"><span class="row-wrap" style="gap:6px">${Object.entries(c.channels).map(([p, ch]) => `<span class="fresh-ch" title="${PLATFORMS[p].label}: cập nhật ${relTime(ch.followers.updatedAt)}">${plat(p)}<i class="fresh-dot fresh-${dot(ch.followers.updatedAt)}"></i></span>`).join("")}</span></td>
        <td data-label="Chưa xác minh">${unv ? `<span class="badge badge-warning">${unv} / ${all.length} chỉ số</span>` : `<span class="verify verify-verified">✓ Đủ</span>`}</td>
        <td data-label="Trạng thái">${stale ? `<span class="badge badge-danger">Cũ &gt; ${STALE_DAYS} ngày</span>` : unv ? `<span class="badge badge-warning">Cần xem lại</span>` : `<span class="badge badge-success">Mới</span>`}</td>
        <td class="t-full">${can("verify") ? `<button class="btn btn-sm" type="button" data-sync="${c.id}">${icon("sync", 14)} Đồng bộ</button>` : ""}</td>
      </tr></tbody>`; }).join("")}
  </table></div>
  <p class="faint row-wrap"><span class="row"><i class="fresh-dot fresh-success"></i> ≤ 7 ngày</span><span class="row"><i class="fresh-dot fresh-warning"></i> 8–${STALE_DAYS} ngày</span><span class="row"><i class="fresh-dot fresh-danger"></i> &gt; ${STALE_DAYS} ngày</span></p>`;
}

const TABS = [
  { id: "cho-duyet", label: "Chờ duyệt", n: () => state.reviewQueue.length, draw: queueHtml },
  { id: "xung-dot", label: "Xung đột", n: () => state.conflicts.length, draw: conflictHtml },
  { id: "creator", label: "Theo creator", n: () => 0, draw: creatorsHtml },
];

export function render(root, params) {
  let tab = TABS.some((t) => t.id === params.tab) ? params.tab : "cho-duyet";
  const fresh = state.creators.filter((c) => ageDays(c.lastSynced) <= 7).length;
  const stale = state.creators.filter((c) => ageDays(c.lastSynced) > STALE_DAYS).length;
  const pctFresh = Math.round((fresh / state.creators.length) * 100);
  root.innerHTML = `
  <div class="page">
    ${pageHead("Dữ liệu & đồng bộ", "Mỗi chỉ số đều có nguồn, thời điểm cập nhật và trạng thái xác minh. Dữ liệu từ crawler / AI chỉ được ghi sau khi có người duyệt.",
      can("verify") ? `<button class="btn btn-primary" type="button" id="btn-sync">${icon("sync", 16)} Đồng bộ ngay</button>` : "")}
    <div class="kpi-row">
      <div class="kpi"><div class="kpi-label">Đồng bộ toàn hệ thống</div><div class="kpi-value is-text">${relTime(state.lastGlobalSync)}</div><div class="kpi-sub">${esc(state.autoSync)}</div></div>
      <div class="kpi"><div class="kpi-label">Hồ sơ mới trong 7 ngày</div><div class="kpi-value">${count(pctFresh)}%</div><div class="bar bar-success" style="margin-top:6px"><i style="width:${pctFresh}%"></i></div></div>
      <div class="kpi"><div class="kpi-label">Chờ duyệt</div><div class="kpi-value">${count(state.reviewQueue.length)}</div><div class="kpi-sub">đề xuất từ crawler / AI</div></div>
      <div class="kpi"><div class="kpi-label">Xung đột</div><div class="kpi-value">${count(state.conflicts.length)}</div><div class="kpi-sub">nhập tay ≠ đồng bộ</div></div>
      <div class="kpi"><div class="kpi-label">Hồ sơ dữ liệu cũ</div><div class="kpi-value">${count(stale)}</div><div class="kpi-sub">quá ${STALE_DAYS} ngày chưa đồng bộ</div></div>
    </div>
    ${can("verify") ? "" : `<div class="banner">${icon("lock")}<div>Vai trò Viewer chỉ xem được trạng thái dữ liệu, không duyệt được.</div></div>`}
    <div class="tabs" role="tablist">${TABS.map((t) => `<button class="tab" role="tab" type="button" data-tab="${t.id}" aria-selected="${t.id === tab}">${t.label}${t.n() ? ` <span class="badge badge-warning">${t.n()}</span>` : ""}</button>`).join("")}</div>
    <div id="panel" role="tabpanel"></div>
  </div>`;
  const draw = () => {
    $("#panel", root).innerHTML = TABS.find((t) => t.id === tab).draw();
    root.querySelectorAll("[data-tab]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === tab)));
  };
  draw();
  delegate(root, "click", "[data-tab]", (e, b) => { tab = b.dataset.tab; setQuery("du-lieu", { tab }); draw(); });

  // Mọi thao tác ghi đều gọi store → store phát "data" → router vẽ lại màn (giữ tab qua ?tab=).
  delegate(root, "click", "[data-approve]", (e, b) => { approveReview(b.dataset.approve); toast("Đã duyệt", "Giá trị mới đã ghi vào hồ sơ kèm nguồn và thời điểm."); });
  delegate(root, "click", "[data-reject]", (e, b) => { rejectReview(b.dataset.reject); toast("Đã bỏ qua đề xuất", "Giữ nguyên giá trị đang lưu."); });
  delegate(root, "click", "[data-edit]", (e, b) => openEdit(b.dataset.edit));
  delegate(root, "click", "[data-bulk]", () => bulkApprove());
  delegate(root, "click", "[data-keep]", (e, b) => { resolveConflict(b.dataset.id, b.dataset.keep); toast("Đã xử lý xung đột", b.dataset.keep === "manual" ? "Giữ giá trị nhập tay." : "Dùng giá trị đồng bộ."); });
  delegate(root, "click", "[data-sync]", (e, b) => { const n = syncCreator(b.dataset.sync); toast("Đã đồng bộ", n ? `${n} đề xuất mới đang chờ duyệt.` : "Không có thay đổi so với giá trị đang lưu."); });
  const syncBtn = $("#btn-sync", root);
  if (syncBtn) syncBtn.addEventListener("click", () => {
    syncBtn.disabled = true; syncBtn.innerHTML = `${icon("sync", 16)} Đang đồng bộ…`;
    setTimeout(() => { const n = syncNow(); toast("Đồng bộ xong", `${state.creators.length} hồ sơ · ${n} đề xuất mới chờ duyệt.`); }, 700);
  });
}

function bulkApprove() {
  const ids = state.reviewQueue.filter(isSmall).map((q) => q.id);
  ids.forEach((id) => approveReview(id));
  toast("Đã duyệt nhanh", `${ids.length} thay đổi nhỏ.`);
}

function openEdit(id) {
  const q = state.reviewQueue.find((x) => x.id === id);
  const c = getCreator(q.creatorId);
  const o = openOverlay({
    kind: "modal", title: "Sửa giá trị trước khi duyệt",
    body: `<div class="stack"><p class="muted">${esc(c.name)} · ${PLATFORMS[q.platform].label} · ${METRIC_LABEL[q.metric]}. Nguồn đề xuất: ${srcBadge(q.source)}</p>
      <div class="field"><label for="rq-val">Giá trị đúng${q.metric === "er" ? " (%)" : ""}</label><input class="input" id="rq-val" type="number" min="0" step="${q.metric === "er" ? 0.1 : 1}" value="${q.proposed}" autofocus /></div>
      <p class="field-hint">Giá trị bạn nhập sẽ ghi nguồn “Nhập tay” và được coi là đã xác minh.</p></div>`,
    footer: `<span class="spacer"></span><button class="btn" data-close type="button">Huỷ</button><button class="btn btn-primary" type="button" id="rq-save">Lưu & duyệt</button>`,
  });
  $("#rq-save", o.el).addEventListener("click", () => {
    const v = +$("#rq-val", o.el).value;
    if (!v) return $("#rq-val", o.el).focus();
    o.close();
    approveReview(id, v);
    toast("Đã lưu giá trị sửa tay");
  });
}

export function copilot() {
  return {
    label: "Dữ liệu & đồng bộ",
    actions: [
      { label: "Chỉ số nào bất thường?", match: /bat thuong|nghi ngo|la/, run: () => {
        const odd = state.reviewQueue.filter((q) => !isSmall(q));
        post(odd.length ? `<strong>${odd.length} đề xuất nên xem kỹ:</strong><ul>${odd.map((q) => { const c = getCreator(q.creatorId); const pct = delta(cur(q).value, q.proposed); return `<li><a href="#/creator/${c.id}?tab=kenh">${esc(c.name)}</a> — ${METRIC_LABEL[q.metric]} ${PLATFORMS[q.platform].label}: ${q.isNew ? "hồ sơ mới, số do AI đọc" : `${pct >= 0 ? "+" : ""}${dec(pct.toFixed(1))}%`}${tierChange(q) ? `, đổi tier ${tierChange(q)}` : ""}${q.confidence < 0.75 ? `, tin cậy chỉ ${Math.round(q.confidence * 100)}%` : ""}</li>`; }).join("")}</ul>` : "Không có đề xuất nào bất thường.");
      } },
      { label: "Duyệt nhanh thay đổi nhỏ", match: /duyet nhanh|duyet het/, run: () => {
        const n = state.reviewQueue.filter(isSmall).length;
        if (!can("verify")) return post("Vai trò hiện tại không có quyền duyệt dữ liệu.");
        post(n ? `Có <strong>${n}</strong> thay đổi lệch dưới 5%, tin cậy ≥ 90% và không đổi tier. Bạn xác nhận duyệt cả ${n} mục?` : "Không có thay đổi nhỏ nào để duyệt nhanh.", n ? [{ label: `Xác nhận duyệt ${n} mục`, primary: true, run: bulkApprove }] : []);
      } },
      { label: "Hồ sơ nào dữ liệu cũ nhất?", match: /cu nhat|lau nhat/, run: () => {
        const old = [...state.creators].sort((a, b) => new Date(a.lastSynced) - new Date(b.lastSynced)).slice(0, 5);
        post(`<strong>5 hồ sơ lâu chưa đồng bộ nhất</strong><ul>${old.map((c) => `<li><a href="#/creator/${c.id}?tab=kenh">${esc(c.name)}</a> — ${relTime(c.lastSynced)}</li>`).join("")}</ul>`);
      } },
    ],
  };
}
