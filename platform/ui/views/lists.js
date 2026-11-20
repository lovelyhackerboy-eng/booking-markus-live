// views/lists.js — Campaign, bước 2 "Liên hệ": creator đã duyệt, theo dõi tiến độ liên hệ tới khi chốt booking (CRM dạng bảng tính). Là PANEL vẽ trong views/campaigns.js.
// Cũng chứa menu "Lưu vào campaign" và hộp thoại "Campaign mới" dùng chung cho nhiều màn.
// Brief IV.3 (CRM: ai phụ trách, trực tiếp hay qua Manager/MCN, liên hệ, ghi chú, Preferred/Watchlist/DNR)
// + nguyên tắc 2 "Capture data through real work": đổi tiến độ ở đây tự ghi vào timeline CRM của creator.
// Cảm hứng tương tác: bảng "list" kiểu creator-CRM (status pill, label, tài liệu, sửa cột, thao tác hàng loạt).
// App hiện tại chưa có màn tương đương — gần nhất là cột "Lịch sử làm việc" (relLabel) + kanban Hợp đồng.
//
// Hai loại trạng thái, đều là pill:
//   • Tiến độ liên hệ (theo TỪNG campaign): Chưa liên hệ → Đã liên hệ qua Zalo → Qua Manager/MCN → Đã báo giá → Đã chốt
//   • Quan hệ (thuộc hồ sơ creator, dùng chung): Preferred / Đã hợp tác / Network / Watchlist / Do-Not-Recommend

import { $, esc, icon, delegate, openOverlay, openMenu, toast, relTime, count, fmtNum } from "../core/ui.js";
import { state, can, me, getCreator, inShortlist, toggleShortlist, shortlistOf, toggleInList, createList, setListStage, setLabels, allLabels, docsOf, setPref, activeList, visibleLists, campaignHash } from "../core/store.js";
import { LIST_STAGES, LIST_STAGE_SHORT, competitorsOf } from "../data/catalog.js";
import { rateFor, VIA, BRAND_NAMES } from "../core/filters.js";
import { creatorCell, plat, relBadge, money, contact, redacted, benchRate, emptyState, channelIcon } from "../core/parts.js";
import { post, postZaloDraft } from "../ai/copilot.js";
import { refresh } from "../core/router.js";

let root = null, q = "", stageFilter = "", lastList = "";
const STAGE_ICON = { none: "clock", zalo: "message", manager: "users", quoted: "doc", closed: "checkCircle" }; // icon của từng bước tiến độ
const selected = new Set();

/* Cột của bảng. Thêm cột = thêm 1 phần tử (id, nhãn, hàm vẽ ô). "Sửa cột" bật/tắt theo state.listCols. */
const COLS = [
  { id: "handle", label: "Handle", cell: (c) => `<span class="row" style="gap:6px">${plat(c.hero, 18)} ${esc(c.handle)}</span>` },
  { id: "stage", label: "Tiến độ liên hệ", cell: (c, e) => stagePill(c, e) },
  { id: "rel", label: "Quan hệ", cell: (c) => `<a href="#/creator/${c.id}?tab=quan-he" title="Mở CRM để đổi trạng thái (cần ghi lý do)">${relBadge(c.rel.status)}</a>` },
  { id: "labels", label: "Label", cell: (c) => `<span class="row-wrap" style="gap:4px">${(c.labels || []).map((l) => `<span class="badge badge-outline">${esc(l)}</span>`).join("")}${can("edit") ? `<button class="btn btn-ghost btn-icon btn-sm" type="button" data-labels="${c.id}" aria-label="Sửa label của ${esc(c.name)}">${icon("plus", 14)}</button>` : ""}</span>` },
  { id: "contact", label: "Liên hệ", cell: (c) => `<span class="row" style="gap:6px">${channelIcon(c.rel.channel)} <span class="cell-clip">${contact(c.rel.channel === "Email" ? c.rel.contact.email : c.rel.contact.phone)}</span></span><span class="dt-sub">${esc(VIA[c.rel.via])}${c.rel.via !== "direct" && can("contact") ? " · " + esc(c.rel.manager || c.rel.mcn || "") : ""}</span>` },
  { id: "rate", label: "Giá tham chiếu", right: true, cell: (c) => benchRate(c) },
  { id: "docs", label: "Tài liệu", cell: (c) => { const d = docsOf(c); return !d.length ? `<span class="faint">—</span>` : !can("price") ? redacted(`${d.length} tài liệu`) : `<span class="row" style="gap:4px"><button class="badge badge-outline doc" type="button" data-doc="${esc(d[0].name)}" title="${esc(d[0].name)}">${icon("doc", 14)} <span class="doc-name">${esc(d[0].name)}</span></button>${d.length > 1 ? `<span class="faint" title="${esc(d.slice(1).map((x) => x.name).join(", "))}">+${d.length - 1}</span>` : ""}</span>`; } },
  { id: "chat", label: "Trao đổi", cell: (c) => `<button class="btn btn-sm btn-ai" type="button" data-zalo="${c.id}">${icon("message", 14)} Soạn tin Zalo</button>${c.notes[0] ? `<span class="dt-sub">Ghi chú ${relTime(c.notes[0].at)}</span>` : ""}` },
  { id: "owner", label: "Phụ trách", cell: (c) => esc(c.rel.owner) },
  { id: "updated", label: "Thêm vào", cell: (c, e) => relTime(e.addedAt) },
];

function stagePill(c, e) {
  if (!can("edit")) return `<span class="badge">${esc(LIST_STAGES[e.stage])}</span>`;
  return `<span class="pill-wrap"><select class="pill-select pill-${e.stage}" data-stage="${c.id}" title="${esc(LIST_STAGES[e.stage])}" aria-label="Tiến độ liên hệ của ${esc(c.name)}: ${esc(LIST_STAGES[e.stage])}">${Object.entries(LIST_STAGE_SHORT).map(([k, l]) => `<option value="${k}" ${k === e.stage ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></span>`;
}

function rows(list) {
  const nq = q.trim().toLowerCase();
  return list.entries.map((e) => ({ e, c: getCreator(e.id) })).filter((x) => x.c)
    .filter((x) => (!stageFilter || x.e.stage === stageFilter) && (!nq || `${x.c.name} ${x.c.alias} ${x.c.handle} ${(x.c.labels || []).join(" ")}`.toLowerCase().includes(nq)));
}

/** Vẽ panel "Liên hệ" của campaign đang làm vào el. */
export function render(el) {
  root = el;
  const list = activeList();
  const activeId = list.id;
  if (lastList !== activeId) { lastList = activeId; q = ""; stageFilter = ""; selected.clear(); } // đổi campaign = bỏ lọc cũ
  const all = list.entries.map((e) => ({ e, c: getCreator(e.id) })).filter((x) => x.c);
  const shown = rows(list);
  [...selected].forEach((id) => { if (!shown.some((x) => x.c.id === id)) selected.delete(id); });
  const cols = COLS.filter((col) => state.listCols.includes(col.id));
  const total = shown.reduce((s, x) => s + (rateFor(x.c)?.amount || 0), 0);

  root.innerHTML = `
    <div class="funnel" role="group" aria-label="Lọc theo tiến độ liên hệ">
      ${Object.entries(LIST_STAGES).map(([k, l]) => `<button type="button" class="funnel-step pill-${k}" data-stage-filter="${k}" aria-pressed="${stageFilter === k}"><span class="funnel-ico">${icon(STAGE_ICON[k], { size: 20, variant: stageFilter === k ? "fill" : "outline" })}</span><span class="funnel-txt"><strong>${count(all.filter((x) => x.e.stage === k).length)}</strong><span>${esc(l)}</span></span></button>`).join("")}
    </div>

  <div class="row-wrap">
      <label class="sr-only" for="list-q">Tìm creator đã duyệt</label>
      <input class="input" id="list-q" type="search" placeholder="Tìm tên, handle, label…" value="${esc(q)}" style="max-width:280px" />
      <span class="spacer"></span>
      ${can("edit") ? `<a class="btn" href="#/them-creator?mode=import">${icon("import", 16)} Import Google Sheet / Excel</a>` : ""}
      <button class="btn" type="button" data-act="cols" aria-haspopup="menu">${icon("columns", 18)} Sửa cột</button>
    </div>

    ${selected.size ? `<div class="bulk" role="region" aria-label="Thao tác hàng loạt">
      <strong>Đã chọn ${selected.size}</strong>
      ${can("edit") ? `<span class="pill-wrap"><select class="pill-select" id="bulk-stage" aria-label="Đổi tiến độ cho các dòng đã chọn"><option value="">Đổi tiến độ…</option>${Object.entries(LIST_STAGES).map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join("")}</select></span>` : ""}
      ${can("edit") ? `<button class="btn btn-sm btn-ghost" type="button" data-act="bulk-remove">${icon("trash", 14)} Bỏ khỏi campaign</button>` : ""}
    </div>` : ""}

    ${shown.length ? `<div class="dt-wrap"><table class="dt sheet">
      <thead><tr><th class="t-check"><input type="checkbox" id="check-all" aria-label="Chọn tất cả" ${shown.every((x) => selected.has(x.c.id)) ? "checked" : ""} /></th><th>Creator (${shown.length})</th>${cols.map((col) => `<th class="${col.right ? "t-right" : ""}">${col.label}</th>`).join("")}<th><span class="sr-only">Thao tác</span></th></tr></thead>
      ${shown.map(({ c, e }) => `<tbody class="${selected.has(c.id) ? "is-selected" : ""} ${c.rel.status === "dnr" ? "is-flagged" : ""}"><tr>
        <td class="t-check"><label class="check"><input type="checkbox" data-pick="${c.id}" ${selected.has(c.id) ? "checked" : ""} aria-label="Chọn ${esc(c.name)}" /></label></td>
        <td class="t-main">${creatorCell(c, `${c.tier} · ${c.type} · ${c.region}`)}</td>
        ${cols.map((col) => `<td data-label="${col.label}" class="${col.right ? "t-right" : ""}">${col.cell(c, e)}</td>`).join("")}
        <td class="t-full">${can("edit") ? `<button class="btn btn-ghost btn-icon btn-sm" type="button" data-remove="${c.id}" aria-label="Bỏ ${esc(c.name)} khỏi campaign">${icon("xmark", 14)}</button>` : ""}</td>
      </tr></tbody>`).join("")}
      <tfoot><tr><td></td><td><strong>Tổng ${shown.length} creator</strong></td>${cols.map((col) => `<td class="${col.right ? "t-right" : ""}">${col.id === "rate" ? `<strong>${money(total)}</strong>` : ""}</td>`).join("")}<td></td></tr></tfoot>
    </table></div>`
    : emptyState(all.length ? "search" : "list", all.length ? "Không có creator khớp bộ lọc" : "Chưa duyệt creator nào", all.length ? "Bỏ bớt điều kiện lọc ở trên." : "Ở tab Ứng viên, bấm “Duyệt” trên creator; creator đã duyệt hiện ở đây để theo dõi liên hệ tới khi chốt booking.", `<a class="btn btn-primary" href="${campaignHash("ung-vien")}">${icon("list", 16)} Tới tab Ứng viên</a>`)}`;

  delegate(root, "click", "[data-stage-filter]", (e, b) => { stageFilter = stageFilter === b.dataset.stageFilter ? "" : b.dataset.stageFilter; refresh(); });
  $("#list-q", root).addEventListener("input", (e) => { q = e.target.value; refresh(); const i = document.getElementById("list-q"); i.focus(); i.setSelectionRange(q.length, q.length); });
  delegate(root, "change", "[data-stage]", (e, s) => { setListStage(activeId, s.dataset.stage, s.value); toast("Đã cập nhật tiến độ", `${getCreator(s.dataset.stage).name} → ${LIST_STAGES[s.value]} · đã ghi vào CRM`); });
  delegate(root, "change", "[data-pick]", (e, cb) => { cb.checked ? selected.add(cb.dataset.pick) : selected.delete(cb.dataset.pick); refresh(); });
  delegate(root, "change", "#check-all", (e, cb) => { shown.forEach((x) => (cb.checked ? selected.add(x.c.id) : selected.delete(x.c.id))); refresh(); });
  delegate(root, "change", "#bulk-stage", (e, s) => { if (!s.value) return; const n = selected.size; [...selected].forEach((id) => setListStage(activeId, id, s.value)); toast("Đã đổi tiến độ hàng loạt", `${n} creator → ${LIST_STAGES[s.value]}`); });
  delegate(root, "click", "[data-remove]", (e, b) => { selected.delete(b.dataset.remove); toggleInList(activeId, b.dataset.remove, false); });
  delegate(root, "click", "[data-labels]", (e, b) => openLabels(b.dataset.labels));
  delegate(root, "click", "[data-zalo]", (e, b) => postZaloDraft(getCreator(b.dataset.zalo)));
  delegate(root, "click", "[data-doc]", (e, b) => toast("Prototype", `Mở tài liệu ${b.dataset.doc} (chưa nối kho tài liệu).`));
  delegate(root, "click", "[data-act]", (e, b) => {
    const act = b.dataset.act;
    if (act === "cols") openMenu(b, () => [{ title: "Cột hiển thị" }, ...COLS.map((col) => ({ label: col.label, checked: state.listCols.includes(col.id), keepOpen: true, run: () => { setPref("listCols", state.listCols.includes(col.id) ? state.listCols.filter((x) => x !== col.id) : COLS.map((x) => x.id).filter((x) => x === col.id || state.listCols.includes(x))); refresh(); } }))]);
    if (act === "bulk-remove") { [...selected].forEach((id) => toggleInList(activeId, id, false)); selected.clear(); refresh(); }
  });
}
// Vẽ lại luôn qua router.refresh(): mỗi lần là 1 root mới nên listener không bị cộng dồn.

/* ---------- Hộp thoại ---------- */
function openLabels(creatorId) {
  const c = getCreator(creatorId);
  let cur = [...(c.labels || [])];
  const body = () => `<div class="stack">
    <div class="field"><span class="field-label" id="lb-l">Label của ${esc(c.name)}</span>
      <div class="chip-set" role="group" aria-labelledby="lb-l">${[...new Set([...allLabels(), ...cur])].map((l) => `<button type="button" class="chip" data-lb="${esc(l)}" aria-pressed="${cur.includes(l)}">${esc(l)}</button>`).join("") || `<span class="faint">Chưa có label nào.</span>`}</div></div>
    <div class="field"><label for="lb-new">Label mới</label><div class="range-row"><input class="input" id="lb-new" placeholder="VD: Tết 2027, ambassador, KOC live" /><button class="btn" type="button" id="lb-add">Thêm</button></div></div></div>`;
  const o = openOverlay({ kind: "modal", title: "Sửa label", body: body(), footer: `<span class="spacer"></span><button class="btn" data-close type="button">Huỷ</button><button class="btn btn-primary" type="button" id="lb-save">Lưu</button>` });
  delegate(o.el, "click", "[data-lb]", (e, b) => { const l = b.dataset.lb; cur = cur.includes(l) ? cur.filter((x) => x !== l) : [...cur, l]; b.setAttribute("aria-pressed", String(cur.includes(l))); });
  const add = () => { const v = $("#lb-new", o.el).value.trim(); if (!v) return; if (!cur.includes(v)) cur.push(v); o.body.innerHTML = body(); $("#lb-new", o.el).focus(); };
  delegate(o.el, "click", "#lb-add", add);
  delegate(o.el, "keydown", "#lb-new", (e) => { if (e.key === "Enter") { e.preventDefault(); add(); } });
  $("#lb-save", o.el).addEventListener("click", () => { o.close(); setLabels(creatorId, cur); toast("Đã lưu label", cur.join(", ") || "Không có label"); });
}

export function openNewList(thenAddCreatorId = "") {
  const o = openOverlay({
    kind: "modal", title: "Campaign mới",
    body: `<div class="stack"><div class="field"><label for="nl-name">Tên campaign</label><input class="input" id="nl-name" placeholder="VD: Milo – Back to school 2027" autofocus /></div>
      <div class="field-row"><div class="field"><label for="nl-brand">Brand (không bắt buộc)</label><select class="select" id="nl-brand"><option value="">— Không gắn brand —</option>${BRAND_NAMES.map((b) => `<option>${esc(b)}</option>`).join("")}</select></div>
      <div class="field"><label for="nl-kpi">KPI view mục tiêu (không bắt buộc)</label><input class="input" id="nl-kpi" type="number" min="0" placeholder="VD: 2000000" /></div></div>
      <p class="field-hint">Người phụ trách: ${esc(me())}. Campaign mới sẽ thành campaign đang làm; creator bạn lưu tiếp theo sẽ vào Ứng viên của campaign này. Mời thêm người cùng theo dõi ở nút “Thành viên”.</p></div>`,
    footer: `<span class="spacer"></span><button class="btn" data-close type="button">Huỷ</button><button class="btn btn-primary" type="button" id="nl-save">Tạo campaign</button>`,
  });
  $("#nl-save", o.el).addEventListener("click", () => {
    const name = $("#nl-name", o.el).value.trim();
    if (!name) return $("#nl-name", o.el).focus();
    const brand = $("#nl-brand", o.el).value, kpi = +$("#nl-kpi", o.el).value || 0;
    o.close();
    const l = createList(name, brand, kpi);
    if (!l) return;
    if (thenAddCreatorId) toggleShortlist(thenAddCreatorId, true, l.id);
    toast("Đã tạo campaign", thenAddCreatorId ? `${name} · đã thêm ${getCreator(thenAddCreatorId).name} vào Ứng viên` : name);
    if (!thenAddCreatorId) location.hash = campaignHash("ung-vien");
  });
}

/** Menu "Lưu" — dùng chung ở Khám phá (thẻ + bảng), hồ sơ, drawer creator tương tự.
 *  Chỉ liệt kê campaign người dùng được thấy (phụ trách / được mời; Quản lý & Admin: tất cả).
 *  Luồng: lưu vào Ứng viên của một campaign → Duyệt ở tab Ứng viên → Liên hệ → Chốt booking.
 *  Creator quen không cần duyệt thì đưa thẳng vào bước Liên hệ. */
export function openSaveMenu(anchor, creatorId) {
  const c = getCreator(creatorId);
  const warn = (listId) => { if (!inShortlist(creatorId, listId) && c.rel.status === "dnr") toast("Lưu ý: Do-Not-Recommend", `${c.name} đang bị đánh dấu không đề xuất.`, "danger"); };
  const vis = visibleLists();
  const projects = [...vis].sort((a, b) => (a.id === state.activeListId ? -1 : b.id === state.activeListId ? 1 : 0));
  if (!can("edit")) return openMenu(anchor, () => [{ title: "Vai trò Viewer chỉ xem campaign, không thêm creator" }]);
  openMenu(anchor, () => [
    ...(projects.length ? [
      { title: "Thêm vào Ứng viên của campaign" },
      ...projects.map((l) => ({ label: `${l.name}${l.id === state.activeListId ? " · đang làm" : ""} (${shortlistOf(l.id).length})`, checked: inShortlist(creatorId, l.id), keepOpen: true, run: () => { warn(l.id); toggleShortlist(creatorId, null, l.id); } })),
      { title: "Đưa thẳng vào Liên hệ (creator quen, không cần duyệt)" },
      ...projects.map((l) => ({ label: `${l.name} (${l.entries.length})`, checked: l.entries.some((e) => e.id === creatorId), keepOpen: true, run: () => toggleInList(l.id, creatorId) })),
      { sep: true },
    ] : [{ title: "Bạn chưa theo dõi campaign nào" }]),
    { label: "＋ Campaign mới…", run: () => openNewList(creatorId) },
  ]);
}
/** Nhãn nút lưu: creator đang nằm ở bao nhiêu campaign (Ứng viên hoặc Liên hệ) mà người dùng thấy. compact = nhãn ngắn cho bảng. */
export function saveLabel(creatorId, compact = false) {
  const n = visibleLists().filter((l) => l.entries.some((e) => e.id === creatorId) || inShortlist(creatorId, l.id)).length;
  if (compact) return n ? `${icon("bookmark", { size: 14, variant: "fill" })} Đã lưu (${n})` : `${icon("bookmark", 14)} Lưu`;
  return n ? `${icon("bookmark", { size: 16, variant: "fill" })} Đã lưu ở ${n} campaign` : `${icon("bookmark", 16)} Lưu vào campaign`;
}

export function copilot() {
  const list = activeList();
  const all = list.entries.map((e) => ({ e, c: getCreator(e.id) })).filter((x) => x.c);
  return {
    label: `Liên hệ · ${list.name}`,
    actions: [
      { label: "Tóm tắt tiến độ liên hệ", match: /tom tat|tien do/, run: () => post(`<strong>${esc(list.name)}</strong> — ${all.length} creator<ul>${Object.entries(LIST_STAGES).map(([k, l]) => `<li>${esc(l)}: ${all.filter((x) => x.e.stage === k).map((x) => esc(x.c.name)).join(", ") || "—"}</li>`).join("")}</ul>`) },
      { label: "Ai chưa được liên hệ?", match: /chua lien he|con ai/, run: () => {
        const todo = all.filter((x) => x.e.stage === "none");
        post(todo.length ? `<strong>${todo.length} creator chưa liên hệ:</strong><ul>${todo.map((x) => `<li><a href="#/creator/${x.c.id}?tab=quan-he">${esc(x.c.name)}</a> — ${esc(VIA[x.c.rel.via])}, phụ trách ${esc(x.c.rel.owner)}</li>`).join("")}</ul>` : "Tất cả creator đã duyệt đều đã được liên hệ.",
          todo.length ? [{ label: `Soạn tin Zalo cho ${todo[0].c.name}`, primary: true, run: () => postZaloDraft(todo[0].c) }] : []);
      } },
      { label: "Kiểm tra xung đột brand", match: /xung dot|doi thu/, run: () => {
        if (!list.brand) return post("Campaign này chưa gắn brand nên chưa kiểm tra được đối thủ.");
        const comp = competitorsOf(list.brand);
        const hit = all.filter((x) => x.c.brands.some((b) => comp.includes(b)));
        post(hit.length ? `<strong>${hit.length} creator từng làm cho đối thủ của ${esc(list.brand)}:</strong><ul>${hit.map((x) => `<li><a href="#/creator/${x.c.id}">${esc(x.c.name)}</a> — ${esc(x.c.brands.filter((b) => comp.includes(b)).join(", "))}</li>`).join("")}</ul><p class="faint">Kiểm tra thời hạn exclusivity trước khi đề xuất.</p>`
          : `Không creator nào đã duyệt từng làm cho đối thủ của ${esc(list.brand)} (${esc(comp.join(", ") || "chưa khai báo đối thủ")}).`);
      } },
    ],
  };
}
