// views/campaigns.js — CAMPAIGN: gộp "Danh sách dự án" + "Shortlist" cũ thành MỘT màn, đi theo 2 bước rõ ràng:
//   1 · Ứng viên  (cân nhắc, ước tính KPI, so sánh, xuất báo giá)  —[Duyệt]→  2 · Liên hệ (Chưa liên hệ → … → Đã chốt booking)
// Ai thấy campaign nào (store.visibleLists): người phụ trách + thành viên được mời; Quản lý và Admin thấy tất cả.
// Thân của từng bước do views/shortlist.js (Ứng viên) và views/lists.js (Liên hệ) vẽ.
// MVP live: 1 campaign = 1 bản ghi workflow "campaigns" của app cũ (xem PLAN mục 11) — app cũ vẫn mở được cùng bản ghi.

import { $, esc, icon, delegate, openOverlay, toast, fmtNum } from "../core/ui.js";
import { state, can, me, getCreator, visibleLists, isMine, getList, setActiveList, shortlistOf, canManageList, setMembers } from "../core/store.js";
import { TEAM } from "../data/catalog.js";
import { pageHead, emptyState } from "../core/parts.js";
import { refresh } from "../core/router.js";
import { post } from "../ai/copilot.js";
import * as shortlist from "./shortlist.js";
import * as lists from "./lists.js";

let root = null, scope = "all", ownerF = ""; // bộ lọc màn tổng (chỉ Quản lý / Admin có)

const viewsOf = (ids) => ids.map(getCreator).filter(Boolean).reduce((s, c) => s + c.channels[c.hero].avgViews.value, 0);
function stats(l) {
  const cand = shortlistOf(l.id).map((x) => x.id), ent = l.entries.map((e) => e.id);
  return { cand: cand.length, candViews: viewsOf(cand), ent: ent.length, views: viewsOf(ent), booked: l.entries.filter((e) => e.stage === "closed").length };
}
const pct = (v, kpi) => (kpi ? Math.round((v / kpi) * 100) : null);
const barCls = (p) => (p == null ? "" : p >= 100 ? "bar-success" : p >= 60 ? "" : "bar-warning");
const isMember = (l) => (l.members || []).includes(me());
const roleTag = (l) => (isMine(l) ? `<span class="badge badge-primary">Bạn phụ trách</span>` : isMember(l) ? `<span class="badge">Bạn được mời</span>` : "");
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
  const shown = !all ? vis : scope === "mine" ? vis.filter((l) => isMine(l) || isMember(l)) : vis.filter((l) => !ownerF || l.owner === ownerF);
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
    ${shown.length ? `<div class="camp-grid">${shown.map(card).join("")}</div>`
      : emptyState("list", vis.length ? "Không có campaign khớp bộ lọc" : "Bạn chưa theo dõi campaign nào", vis.length ? "Đổi phạm vi hoặc người phụ trách ở trên." : can("edit") ? "Tạo campaign mới, hoặc nhờ người phụ trách mời bạn làm thành viên." : "Nhờ người phụ trách campaign mời bạn làm thành viên.",
        can("edit") && !vis.length ? `<button class="btn btn-primary" type="button" data-act="new">${icon("plus", 16)} Campaign mới</button>` : "")}
  </div>`;
  delegate(el, "click", "[data-act=new]", () => lists.openNewList());
  delegate(el, "click", "[data-scope]", (e, b) => { scope = b.dataset.scope; refresh(); });
  $("#cp-owner", el)?.addEventListener("change", (e) => { ownerF = e.target.value; refresh(); });
}
function card(l) {
  const s = stats(l), k = pct(s.views, l.kpiViews);
  return `<a class="card card-pad camp-card" href="#/campaign/${l.id}?tab=ung-vien" ${l.id === state.activeListId ? 'aria-current="true"' : ""}>
    <span class="camp-card-top"><strong>${esc(l.name)}</strong>${roleTag(l)}</span>
    <span class="dt-sub">${l.brand ? "Brand " + esc(l.brand) + " · " : ""}${people(l)}</span>
    <span class="camp-steps"><span><strong class="num">${s.cand}</strong> ứng viên</span><span aria-hidden="true">→</span><span><strong class="num">${s.ent}</strong> đang liên hệ</span><span aria-hidden="true">→</span><span><strong class="num">${s.booked}</strong> chốt booking</span></span>
    ${l.kpiViews ? `<span class="bar ${barCls(k)}"><i style="width:${Math.min(100, k)}%"></i></span><span class="dt-sub">View dự kiến (đã duyệt) ${fmtNum(s.views)} / KPI ${fmtNum(l.kpiViews)} · ${k}%</span>` : `<span class="dt-sub">Chưa đặt KPI view</span>`}
  </a>`;
}

/* ---------- Một campaign: đầu trang + 2 bước ---------- */
function renderDetail(el, p) {
  const l = getList(p.id);
  if (!l) {
    el.innerHTML = `<div class="page"><a class="back" href="#/campaign">${icon("chevL", 16)} Campaign</a>${emptyState("lock", "Bạn không theo dõi campaign này", "Campaign chỉ hiện với người phụ trách, thành viên được mời, Quản lý và Admin. Nhờ người phụ trách mời bạn nếu cần.", `<a class="btn btn-primary" href="#/campaign">Về danh sách campaign</a>`)}</div>`;
    return;
  }
  setActiveList(l.id, true); // mở campaign nào thì đó là campaign đang làm (Khám phá lưu vào đây)
  const tab = p.tab === "lien-he" ? "lien-he" : "ung-vien";
  const s = stats(l), k = pct(s.views, l.kpiViews), vis = visibleLists();
  el.innerHTML = `<div class="page">
    <a class="back" href="#/campaign">${icon("chevL", 16)} ${can("allCampaigns") ? "Tất cả campaign" : "Campaign của tôi"}</a>
    ${pageHead(l.name, `${l.brand ? "Brand " + esc(l.brand) + " · " : ""}${people(l)} ${roleTag(l)}`,
      `${vis.length > 1 ? `<label class="sr-only" for="cp-switch">Đổi campaign</label><select class="select" id="cp-switch" style="width:auto">${vis.map((x) => `<option value="${x.id}" ${x.id === l.id ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select>` : ""}
       ${canManageList(l) ? `<button class="btn" type="button" data-act="members">${icon("users", 16)} Thành viên</button>` : ""}`)}
    <div class="card card-pad project-bar">
      <div><span class="faint">KPI view mục tiêu</span><strong class="num">${l.kpiViews ? fmtNum(l.kpiViews) : "Chưa đặt"}</strong>${l.kpiViews ? `<span class="bar ${barCls(k)}"><i style="width:${Math.min(100, k)}%"></i></span><span class="dt-sub">Đã duyệt đạt ${k}% (${fmtNum(s.views)} view dự kiến)</span>` : ""}</div>
      <div><span class="faint">1 · Ứng viên</span><strong class="num">${s.cand} creator</strong><span class="dt-sub">Nếu duyệt hết: +${fmtNum(s.candViews)} view</span></div>
      <div><span class="faint">2 · Liên hệ</span><strong class="num">${s.ent} creator</strong><span class="dt-sub">${s.booked} đã chốt booking</span></div>
    </div>
    <div class="camp-tabs">
      <div class="segmented" role="group" aria-label="Bước của campaign">
        <button type="button" data-step="ung-vien" aria-pressed="${tab === "ung-vien"}">1 · Ứng viên <span class="badge ${s.cand ? "badge-primary" : ""}">${s.cand}</span></button>
        <button type="button" data-step="lien-he" aria-pressed="${tab === "lien-he"}">2 · Liên hệ <span class="badge">${s.ent}</span></button>
      </div>
      <span class="faint">${tab === "ung-vien" ? "Cân nhắc, ước tính KPI, so sánh, xuất báo giá. Bấm <strong>Duyệt</strong> để chuyển creator sang bước Liên hệ." : "Creator đã duyệt. Cập nhật tiến độ từ “Chưa liên hệ” tới “Đã chốt” booking; mỗi lần đổi đều ghi vào CRM của creator."}</span>
    </div>
    <div class="camp-body" id="camp-body"></div>
  </div>`;
  const body = $("#camp-body", el);
  if (tab === "ung-vien") shortlist.render(body, { view: p.view, export: p.export });
  else lists.render(body);

  delegate(el, "click", "[data-step]", (e, b) => { location.hash = `#/campaign/${l.id}?tab=${b.dataset.step}`; });
  $("#cp-switch", el)?.addEventListener("change", (e) => { location.hash = `#/campaign/${e.target.value}?tab=${tab}`; });
  delegate(el, "click", "[data-act=members]", () => openMembers(l));
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
  if (p.id && getList(p.id)) return p.tab === "lien-he" ? lists.copilot() : shortlist.copilot();
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
