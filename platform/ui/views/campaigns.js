// views/campaigns.js — CAMPAIGN: gộp "Danh sách dự án" + "Shortlist" cũ thành MỘT màn, đi theo 2 bước rõ ràng:
//   1 · Ứng viên  (cân nhắc, ước tính KPI, so sánh, xuất báo giá)  —[Duyệt]→  2 · Liên hệ (Chưa liên hệ → … → Đã chốt booking)
// Ai thấy campaign nào (store.visibleLists): người phụ trách + thành viên được mời; Quản lý và Admin thấy tất cả.
// Thân của từng bước do views/shortlist.js (Ứng viên) và views/lists.js (Liên hệ) vẽ.
// Campaign lưu trong MariaDB (bảng campaigns / campaign_entries / campaign_candidates), không còn dùng workflow của app PHP cũ (v1 đã ngừng 25/11/2026).

import { $, esc, icon, delegate, openOverlay, toast, fmtNum, fmtDate } from "../core/ui.js";
import { state, can, me, getCreator, visibleLists, isMine, getList, setActiveList, shortlistOf, canManageList, setMembers, setCampaignStatus, deleteCampaign, canDeleteList } from "../core/store.js";
import { FEATURES, CAMPAIGN_STATUS, finalStep } from "../data/live.js";
import { openCampaignSettings } from "./campaign-settings.js";
import { TEAM } from "../data/catalog.js";
import { pageHead, emptyState } from "../core/parts.js";
import { openAssistant } from "./assistant.js";
import { refresh } from "../core/router.js";
import { post } from "../ai/copilot.js";
import * as shortlist from "./shortlist.js";
import * as lists from "./lists.js";
import * as tracking from "./tracking.js";
import * as reports from "./reports.js";

let root = null, scope = "all", ownerF = "", statusF = ""; // bộ lọc màn tổng

const viewsOf = (ids) => ids.map(getCreator).filter(Boolean).reduce((s, c) => s + c.channels[c.hero].avgViews.value, 0);
function stats(l) {
  const cand = shortlistOf(l.id).map((x) => x.id), ent = l.entries.map((e) => e.id);
  return { cand: cand.length, candViews: viewsOf(cand), ent: ent.length, views: viewsOf(ent), booked: l.entries.filter((e) => e.stage === finalStep(l)).length };
}
const pct = (v, kpi) => (kpi ? Math.round((v / kpi) * 100) : null);
const barCls = (p) => (p == null ? "" : p >= 100 ? "bar-success" : p >= 60 ? "" : "bar-warning");
const isMember = (l) => (l.members || []).includes(me());
const roleTag = (l) => (isMine(l) ? `<span class="badge badge-primary">Bạn phụ trách</span>` : isMember(l) ? `<span class="badge">Bạn được mời</span>` : "");
const statusBadge = (l) => { const st = CAMPAIGN_STATUS[l.status] || CAMPAIGN_STATUS.draft; return `<span class="badge badge-${st.tone} camp-status camp-status-${l.status}" title="${esc(st.desc)}">${esc(st.label)}</span>`; };
const period = (l) => (l.startDate || l.endDate ? `${l.startDate ? fmtDate(l.startDate) : "?"} → ${l.endDate ? fmtDate(l.endDate) : "?"}` : "");
const people = (l) => `phụ trách <strong>${esc(l.owner)}</strong>${(l.members || []).length ? ` · thành viên ${esc(l.members.join(", "))}` : ""}`;

export function render(el, p) {
  root = el;
  if (p.id) return renderDetail(el, p);
  renderIndex(el);
}

/* ---------- Màn tổng: các campaign người dùng được thấy ---------- */
function renderIndex(el) {
  const all = can("allCampaigns");
  const vis = visibleLists();
  const owners = [...new Set(vis.map((l) => l.owner))].sort();
  const scoped = !all ? vis : scope === "mine" ? vis.filter((l) => isMine(l) || isMember(l)) : vis.filter((l) => !ownerF || l.owner === ownerF);
  const shown = scoped.filter((l) => !statusF || l.status === statusF);
  const order = { running: 0, draft: 1, done: 2 };
  shown.sort((a, b) => order[a.status] - order[b.status] || new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  el.innerHTML = `<div class="page">
    ${pageHead("Campaign", all
      ? "Vai trò của bạn thấy mọi campaign của team. Mỗi campaign đi 2 bước: <strong>Ứng viên</strong> → bấm Duyệt → <strong>Liên hệ</strong> tới khi chốt booking."
      : "Bạn thấy campaign do bạn phụ trách hoặc được mời. Mỗi campaign đi 2 bước: <strong>Ứng viên</strong> → bấm Duyệt → <strong>Liên hệ</strong> tới khi chốt booking.",
      can("edit") ? `<button class="btn btn-primary" type="button" data-act="new">${icon("plus", 16)} Campaign mới</button>` : "")}
    ${all ? `<div class="row-wrap">
      <div class="segmented" role="group" aria-label="Phạm vi">
        <button type="button" data-scope="all" aria-pressed="${scope === "all"}">Tất cả (${vis.length})</button>
        <button type="button" data-scope="mine" aria-pressed="${scope === "mine"}">Của tôi (${vis.filter((l) => isMine(l) || isMember(l)).length})</button>
      </div>
      ${scope === "all" ? `<label class="faint" for="cp-owner">Người phụ trách</label><select class="select" id="cp-owner" style="width:auto"><option value="">Tất cả</option>${owners.map((o) => `<option ${o === ownerF ? "selected" : ""}>${esc(o)}</option>`).join("")}</select>` : ""}
    </div>` : ""}
    <div class="segmented" role="group" aria-label="Lọc theo trạng thái" data-tour="camp-status-filter">
      <button type="button" data-status="" aria-pressed="${!statusF}">Tất cả (${scoped.length})</button>
      ${Object.entries(CAMPAIGN_STATUS).map(([k, st]) => `<button type="button" data-status="${k}" aria-pressed="${statusF === k}">${esc(st.label)} (${scoped.filter((l) => l.status === k).length})</button>`).join("")}
    </div>
    ${shown.length ? `<div class="camp-grid">${shown.map(card).join("")}</div>`
      : emptyState("list", vis.length ? "Không có campaign khớp bộ lọc" : "Bạn chưa theo dõi campaign nào", vis.length ? "Đổi phạm vi hoặc người phụ trách ở trên." : can("edit") ? "Tạo campaign mới, hoặc nhờ người phụ trách mời bạn làm thành viên." : "Nhờ người phụ trách campaign mời bạn làm thành viên.",
        can("edit") && !vis.length ? `<button class="btn btn-primary" type="button" data-act="new">${icon("plus", 16)} Campaign mới</button>` : "")}
  </div>`;
  delegate(el, "click", "[data-act=new]", () => lists.openNewList());
  delegate(el, "click", "[data-scope]", (e, b) => { scope = b.dataset.scope; refresh(); });
  delegate(el, "click", "[data-status]", (e, b) => { statusF = b.dataset.status; refresh(); });
  delegate(el, "click", "[data-del]", (e, b) => { e.preventDefault(); askDelete(getList(b.dataset.del)); });
  $("#cp-owner", el)?.addEventListener("change", (e) => { ownerF = e.target.value; refresh(); });
}
function card(l) {
  const s = stats(l), k = pct(s.views, l.kpiViews);
  return `<div class="camp-card-wrap"><a class="card card-pad camp-card" href="#/campaign/${l.id}?tab=ung-vien" ${l.id === state.activeListId ? 'aria-current="true"' : ""}>
    <span class="camp-card-top"><strong>${esc(l.name)}</strong>${statusBadge(l)}</span>
    <span class="dt-sub">${l.brand ? "Brand " + esc(l.brand) + " · " : ""}${people(l)} ${roleTag(l)}</span>
    ${period(l) ? `<span class="dt-sub">${icon("calendar", 12)} ${period(l)}</span>` : ""}
    <span class="camp-steps"><span><strong class="num">${s.cand}</strong> ứng viên</span><span aria-hidden="true">→</span><span><strong class="num">${s.ent}</strong> đang liên hệ</span><span aria-hidden="true">→</span><span><strong class="num">${s.booked}</strong> chốt booking</span></span>
    ${l.kpiViews ? `<span class="bar ${barCls(k)}"><i style="width:${Math.min(100, k)}%"></i></span><span class="dt-sub">View dự kiến (đã duyệt) ${fmtNum(s.views)} / KPI ${fmtNum(l.kpiViews)} · ${k}%</span>` : `<span class="dt-sub">Chưa đặt KPI view</span>`}
  </a>${canDeleteList(l) ? `<button class="btn btn-ghost btn-icon btn-sm camp-del" type="button" data-del="${l.id}" aria-label="Xoá campaign ${esc(l.name)}" title="Xoá campaign (dữ liệu được giữ lại)" data-tour="camp-delete">${icon("trash", 16)}</button>` : ""}</div>`;
}

/* ---------- Một campaign: đầu trang + 2 bước ---------- */
function renderDetail(el, p) {
  const l = getList(p.id);
  if (!l) {
    el.innerHTML = `<div class="page"><a class="back" href="#/campaign">${icon("chevL", 16)} Campaign</a>${emptyState("lock", "Bạn không theo dõi campaign này", "Campaign chỉ hiện với người phụ trách, thành viên được mời, Quản lý và Admin. Nhờ người phụ trách mời bạn nếu cần.", `<a class="btn btn-primary" href="#/campaign">Về danh sách campaign</a>`)}</div>`;
    return;
  }
  setActiveList(l.id, true); // mở campaign nào thì đó là campaign đang làm (Khám phá lưu vào đây)
  const TABS = ["ung-vien", "lien-he", "theo-doi", "bao-cao"];
  const tab = TABS.includes(p.tab) ? p.tab : "ung-vien";
  const s = stats(l), k = pct(s.views, l.kpiViews), vis = visibleLists();
  el.innerHTML = `<div class="page">
    <a class="back" href="#/campaign">${icon("chevL", 16)} ${can("allCampaigns") ? "Tất cả campaign" : "Campaign của tôi"}</a>
    ${pageHead(l.name, `${statusBadge(l)} ${l.brand ? "Brand " + esc(l.brand) + " · " : ""}${people(l)} ${roleTag(l)}`,
      `${vis.length > 1 ? `<label class="sr-only" for="cp-switch">Đổi campaign</label><select class="select" id="cp-switch" style="width:auto">${vis.map((x) => `<option value="${x.id}" ${x.id === l.id ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select>` : ""}
       ${can("edit") && FEATURES.aiAgent ? `<button class="btn btn-ai" type="button" data-act="assistant">${icon("sparkles", 16)} Trợ lý AI</button>` : ""}
       ${canManageList(l) ? `<button class="btn" type="button" data-act="members">${icon("users", 16)} Thành viên</button>` : ""}
       ${can("edit") ? `<button class="btn" type="button" data-act="settings" data-tour="camp-settings">${icon("sliders", 16)} Cài đặt</button>` : ""}`)}
    ${lifecycle(l, s)}
    <div class="card card-pad project-bar">
      <div><span class="faint">KPI view mục tiêu</span><strong class="num">${l.kpiViews ? fmtNum(l.kpiViews) : "Chưa đặt"}</strong>${l.kpiViews ? `<span class="bar ${barCls(k)}"><i style="width:${Math.min(100, k)}%"></i></span><span class="dt-sub">Đã duyệt đạt ${k}% (${fmtNum(s.views)} view dự kiến)</span>` : ""}</div>
      <div><span class="faint">1 · Ứng viên</span><strong class="num">${s.cand} creator</strong><span class="dt-sub">Nếu duyệt hết: +${fmtNum(s.candViews)} view</span></div>
      <div><span class="faint">2 · Liên hệ</span><strong class="num">${s.ent} creator</strong><span class="dt-sub">${s.booked} đã chốt booking</span></div>
    </div>
    <div class="camp-tabs">
      <div class="segmented" role="group" aria-label="Bước của campaign">
        <button type="button" data-step="ung-vien" aria-pressed="${tab === "ung-vien"}">1 · Ứng viên <span class="badge ${s.cand ? "badge-primary" : ""}">${s.cand}</span></button>
        <button type="button" data-step="lien-he" aria-pressed="${tab === "lien-he"}" data-tour="tab-contact">2 · Liên hệ <span class="badge">${s.ent}</span></button>
        <button type="button" data-step="theo-doi" aria-pressed="${tab === "theo-doi"}" data-tour="tab-track">3 · Theo dõi <span class="badge">${s.booked}</span></button>
        <button type="button" data-step="bao-cao" aria-pressed="${tab === "bao-cao"}" data-tour="tab-report">4 · Báo cáo</button>
      </div>
      <span class="faint">${tab === "ung-vien" ? "Cân nhắc, ước tính KPI, so sánh, xuất báo giá. Bấm <strong>Duyệt</strong> để chuyển creator sang bước Liên hệ."
        : tab === "theo-doi" ? "Bài đăng của creator đã chốt: dán link, nhập số liệu; YouTube tự tìm video trong khoảng ngày theo dõi."
        : tab === "bao-cao" ? "KPI so với view đã giao, phễu liên hệ và hiệu quả từng creator. Xuất CSV hoặc in PDF để gửi khách." : `Kéo thẻ creator qua các bước tới “${esc(l.steps.find((x) => x.final)?.label || "Đã chốt")}”; mỗi lần đổi đều ghi vào CRM của creator.${canManageList(l) ? ` <button class="link-btn" type="button" data-act="settings" data-focus="steps">Sửa các bước</button>` : ""}`}</span>
    </div>
    <div class="camp-body" id="camp-body"></div>
  </div>`;
  const body = $("#camp-body", el);
  if (tab === "ung-vien") shortlist.render(body, { view: p.view, export: p.export });
  else if (tab === "lien-he") lists.render(body);
  else if (tab === "theo-doi") tracking.render(body, l);
  else reports.renderCampaign(body, l);

  delegate(el, "click", "[data-step]", (e, b) => { location.hash = `#/campaign/${l.id}?tab=${b.dataset.step}`; });
  $("#cp-switch", el)?.addEventListener("change", (e) => { location.hash = `#/campaign/${e.target.value}?tab=${tab}`; });
  delegate(el, "click", "[data-act=members]", () => openMembers(l));
  delegate(el, "click", "[data-act=assistant]", () => openAssistant(l));
  delegate(el, "click", "[data-act=settings]", (e, b) => openCampaignSettings(l.id, b.dataset.focus || ""));
  delegate(el, "click", "[data-life]", (e, b) => lifeAction(l, b.dataset.life));
}

/* ---------- Vòng đời: Nháp → Đang chạy → Hoàn thành ---------- */
function lifecycle(l, s) {
  const manage = canManageList(l);
  const steps = [
    { k: "draft", t: "Lên kế hoạch", d: "Brief, chọn ứng viên tiềm năng" },
    { k: "running", t: "Đang chạy", d: "Liên hệ, chốt, theo dõi bài đăng" },
    { k: "done", t: "Hoàn thành", d: "Chốt số liệu, báo cáo" },
  ];
  const at = steps.findIndex((x) => x.k === l.status);
  const act = !manage ? "" : l.status === "draft"
    ? `<button class="btn btn-primary" type="button" data-life="start" data-tour="camp-start">${icon("play", 16)} Bắt đầu campaign</button>${canDeleteList(l) ? `<button class="btn btn-ghost" type="button" data-life="delete">${icon("trash", 16)} Xoá nháp</button>` : ""}`
    : l.status === "running"
      ? `<button class="btn btn-primary" type="button" data-life="done" data-tour="camp-done">${icon("flag", 16)} Hoàn thành campaign</button><button class="btn btn-ghost" type="button" data-life="draft">Về nháp</button>${canDeleteList(l) ? `<button class="btn btn-ghost" type="button" data-life="delete">${icon("trash", 16)} Xoá</button>` : ""}`
      : `<button class="btn" type="button" data-life="reopen">${icon("sync", 16)} Mở lại</button>${canDeleteList(l) ? `<button class="btn btn-ghost" type="button" data-life="delete">${icon("trash", 16)} Xoá</button>` : ""}`;
  const track = l.trackFrom ? `Theo dõi bài đăng ${fmtDate(l.trackFrom)} → ${l.trackTo ? fmtDate(l.trackTo) : "…"}${l.autoTrack ? " · tự động" : ""}` : "Chưa đặt khung theo dõi bài đăng";
  return `<div class="card card-pad lifecycle" data-tour="camp-lifecycle">
    <ol class="life-steps" aria-label="Vòng đời campaign">${steps.map((x, i) => `<li class="${i < at ? "is-past" : i === at ? "is-now" : ""}" ${i === at ? 'aria-current="step"' : ""}><span class="life-dot">${i < at ? icon("check", 14) : i + 1}</span><span><strong>${x.t}</strong><span class="dt-sub">${x.d}</span></span></li>`).join("")}</ol>
    <div class="life-meta">
      ${period(l) ? `<span>${icon("calendar", 14)} ${period(l)}</span>` : ""}
      <span>${icon("eye", 14)} ${esc(track)}${can("edit") ? ` · <button class="link-btn" type="button" data-act="settings" data-focus="track">Đặt</button>` : ""}</span>
      ${can("price") && l.budget ? `<span>Ngân sách <strong class="num">${fmtNum(l.budget)} ₫</strong></span>` : ""}
      ${l.status === "done" && l.doneAt ? `<span>${icon("flag", 14)} Kết thúc ${fmtDate(l.doneAt)}</span>` : ""}
    </div>
    ${l.description ? `<p class="life-desc">${esc(l.description)}</p>` : ""}
    ${act ? `<div class="row-wrap life-act">${act}</div>` : ""}
  </div>`;
}
function confirmBox(title, body, okLabel, tone = "primary") {
  return new Promise((resolve) => {
    let done = false;
    const o = openOverlay({ kind: "modal", title, body: `<div class="stack">${body}</div>`, onClose: () => { if (!done) resolve(false); },
      footer: `<span class="spacer"></span><button class="btn" data-close type="button">Huỷ</button><button class="btn btn-${tone}" type="button" id="cf-ok">${esc(okLabel)}</button>` });
    $("#cf-ok", o.el).addEventListener("click", () => { done = true; o.close(); resolve(true); });
  });
}
async function lifeAction(l, what) {
  const s = stats(l);
  if (what === "start") {
    if (!(await confirmBox("Bắt đầu campaign?", `<p>Campaign chuyển sang <strong>Đang chạy</strong>. Ngày bắt đầu được ghi là hôm nay nếu chưa đặt.</p>${s.cand ? `<p class="faint">Còn ${s.cand} ứng viên chưa duyệt — vẫn duyệt tiếp được sau khi bắt đầu.</p>` : ""}`, "Bắt đầu"))) return;
    if (await setCampaignStatus(l.id, "running")) toast("Campaign đang chạy", l.name);
  } else if (what === "done") {
    const open = l.entries.length - s.booked;
    if (!(await confirmBox("Hoàn thành campaign?", `<p>Campaign chuyển sang <strong>Hoàn thành</strong>: số liệu được chốt cho báo cáo và ngừng theo dõi tự động.</p>${open ? `<p class="faint">${open} creator chưa tới bước chốt.</p>` : ""}`, "Hoàn thành"))) return;
    if (await setCampaignStatus(l.id, "done")) toast("Đã hoàn thành campaign", l.name);
  } else if (what === "reopen") {
    if (await setCampaignStatus(l.id, "running")) toast("Đã mở lại campaign", l.name);
  } else if (what === "draft") {
    if (await setCampaignStatus(l.id, "draft")) toast("Đã chuyển về nháp", l.name);
  } else if (what === "delete") {
    if (await askDelete(l)) location.hash = "#/campaign";
  }
}
/** Xoá mềm có xác nhận. Nói rõ: ẩn khỏi danh sách + báo cáo, dữ liệu giữ lại, ai khôi phục được. */
async function askDelete(l) {
  if (!l || !canDeleteList(l)) return false;
  const s = stats(l);
  const ran = l.status !== "draft";
  const ok = await confirmBox(`Xoá campaign “${l.name}”?`,
    `<p>Campaign sẽ <strong>ẩn khỏi danh sách và không còn được tính trong báo cáo</strong>. Dữ liệu (${s.cand} ứng viên, ${s.ent} creator đang liên hệ, bài đăng, ghi chú) <strong>vẫn được giữ</strong> — Admin khôi phục được ở mục Quản trị → Campaign đã xoá.</p>
     ${ran ? `<p class="faint">Campaign đã chạy nên chỉ Admin xoá được.</p>` : ""}`, "Xoá campaign", "danger");
  if (!ok) return false;
  if (!(await deleteCampaign(l.id))) return false;
  toast("Đã xoá campaign", `${l.name} · Admin khôi phục được nếu cần`);
  return true;
}

function openMembers(l) {
  let cur = [...(l.members || [])];
  const pool = [...new Set([...TEAM, "Khách xem", ...cur])].filter((x) => x !== l.owner);
  const o = openOverlay({
    kind: "modal", title: `Thành viên · ${l.name}`,
    body: `<div class="stack"><p class="muted">Người phụ trách: <strong>${esc(l.owner)}</strong>. Thành viên thấy campaign này trong mục Campaign của họ và làm việc như người phụ trách. Quản lý và Admin luôn thấy mọi campaign.</p>
      <div class="chip-set" role="group" aria-label="Chọn thành viên">${pool.map((x) => `<button type="button" class="chip" data-mem="${esc(x)}" aria-pressed="${cur.includes(x)}">${esc(x)}</button>`).join("")}</div></div>`,
    footer: `<span class="spacer"></span><button class="btn" data-close type="button">Huỷ</button><button class="btn btn-primary" type="button" id="mem-save">Lưu</button>`,
  });
  delegate(o.el, "click", "[data-mem]", (e, b) => { const m = b.dataset.mem; cur = cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m]; b.setAttribute("aria-pressed", String(cur.includes(m))); });
  $("#mem-save", o.el).addEventListener("click", () => { o.close(); setMembers(l.id, cur); toast("Đã lưu thành viên", cur.join(", ") || "Chỉ người phụ trách"); });
}

// Ứng viên / tiến độ / thành viên đổi → vẽ lại (root mới mỗi lần nên listener không cộng dồn).
export function onShortlist() { if (root && document.contains(root)) refresh(); }
export const onLists = onShortlist;

export function copilot(p) {
  if (p.id && getList(p.id)) return p.tab === "lien-he" ? lists.copilot() : p.tab === "theo-doi" || p.tab === "bao-cao" ? { label: getList(p.id).name, actions: [] } : shortlist.copilot();
  return {
    label: "Campaign",
    actions: [
      { label: "Campaign nào đang thiếu KPI?", match: /kpi|thieu|chua dat/, run: () => {
        const rows = visibleLists().filter((l) => l.kpiViews).map((l) => ({ l, k: pct(stats(l).views, l.kpiViews) })).sort((a, b) => a.k - b.k);
        post(rows.length ? `<strong>View dự kiến của creator đã duyệt so với KPI:</strong><ul>${rows.map(({ l, k }) => `<li><a href="#/campaign/${l.id}?tab=ung-vien">${esc(l.name)}</a> — ${k}% (${esc(l.owner)})</li>`).join("")}</ul>` : "Chưa campaign nào đặt KPI view.");
      } },
    ],
  };
}
