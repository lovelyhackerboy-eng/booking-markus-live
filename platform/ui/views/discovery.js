// views/discovery.js — MÀN 1: Khám phá / Creator Directory.
// Brief IV.2 (Discovery & Smart Filtering) + IV.1 (Creator Directory: Overall Tier, Hero Platform, follower,
// benchmark rate, brand từng hợp tác, relationship status).
// Thay cho renderBookingPage() + drawBookingTable() + filteredBookingRows() trong app.js (bảng 15+ cột, 16 dropdown).
//
// Bố cục: HERO AI Search ở đầu trang ("Hôm nay bạn cần creator nào?") — khi đã có điều kiện lọc thì thu gọn thành thanh dính dưới topbar
//         · cột trái = bộ lọc 4 lớp luôn hiện (màn hẹp: vào drawer) · cột phải = kết quả.
// Tìm kiếm có link chia sẻ được: #/kham-pha?q=<câu mô tả>.
// Luồng: câu tự nhiên → parseQuery() → state.filters → chip sửa được → recommend() → kết quả.
//        Form bộ lọc sửa CÙNG state.filters nên AI và thao tác tay luôn tương đương.
// Kết quả có 2 kiểu xem: "Thẻ" (có dải nội dung gần đây + avatar brand) và "Bảng gọn" (quét nhanh nhiều dòng).

import { redacted } from "../core/parts.js";
import { api } from "../data/live.js";
import { $, $$, esc, icon, delegate, openOverlay, toast, fmtNum, fmtPct, relTime } from "../core/ui.js";
import { state, can, filterCtx, setFilters, setPref, getCreator, inShortlist, toggleShortlist, pendingOf, activeList, campaignHash, FEATURES } from "../core/store.js";
import { LAYERS, FILTER_DEFS, emptyFilters, chipsOf, removeChip, activeCount, rateFor, SOW_KINDS, metricCh, metricPlatform, focusPlatform, totalFollowers, platRange } from "../core/filters.js";
import { competitorsOf, PLATFORMS, COMPANIES, tierRank } from "../data/catalog.js";
import { parseQuery, recommend } from "../ai/mock-ai.js";
import { post, briefToFilters } from "../ai/copilot.js";
import { note, avatar, creatorCell, tierBadge, relBadge, repBadge, channelRow, channelCells, benchRate, brandChips, brandStack, thumbs, plat, money, stars, trend, ring, emptyState } from "../core/parts.js";
import { platformIcon } from "../core/platform-icons.js";
import { setQuery } from "../core/router.js";
import { openLookalike } from "./lookalike.js";
import { openSaveMenu, saveLabel } from "./lists.js";

const EXAMPLES = [
  "Mẹ & bé ở Hà Nội, tier Micro hoặc Mid-tier",
  "Beauty TP.HCM trên 100K follower",
  "Review đồ ăn Sài Gòn mạnh TikTok, dưới 15 triệu",
  "Ca sĩ, nghệ sĩ mạnh TikTok trên 100K follower",
  "Lifestyle vlog có YouTube",
];
// Nhãn chip câu mẫu: viết gọn nhưng đủ nghĩa (không cắt bằng "…"); câu đầy đủ nằm trong title và được điền vào ô tìm kiếm.
const EXAMPLE_LABELS = ["Mẹ & bé Hà Nội · Micro/Mid-tier", "Beauty TP.HCM · trên 100K follower", "Review đồ ăn Sài Gòn · TikTok", "Ca sĩ, nghệ sĩ · TikTok 100K+", "Lifestyle vlog · YouTube"];
/* Sắp xếp = TIÊU CHÍ (ô chọn) + CHIỀU (nút bên cạnh, state.sortDir "desc" | "asc").
   key(c) trả về số để so; null = không có dữ liệu → luôn xếp cuối, dù chiều nào.
   dir = chiều mặc định khi vừa chọn tiêu chí; then = tiêu chí phụ khi bằng nhau (cùng chiều).
   Follower / Engagement: tính trên nền tảng đang lọc; không lọc nền tảng thì tính trên kênh chính (metricCh). */
const fol = (c) => metricCh(c, state.filters).followers.value;
const SORTS = [
  { id: "match", label: "Phù hợp nhất" }, // thứ tự của bộ gợi ý, không có chiều
  { id: "tier", label: "Tier", dir: "desc", key: (c) => tierRank(c.tier), then: fol },
  { id: "followers", label: "Follower", dir: "desc", key: fol },
  { id: "total", label: "Tổng follower đa kênh", dir: "desc", key: (c) => totalFollowers(c) },
  { id: "er", label: "Engagement", dir: "desc", key: (c) => metricCh(c, state.filters).er.value },
  { id: "views", label: "View trung bình", dir: "desc", key: (c) => metricCh(c, state.filters).avgViews.value },
  { id: "rate", label: "Giá tham chiếu", perm: "price", dir: "asc", key: (c) => rateFor(c)?.amount ?? null },
  { id: "score", label: "Working score", dir: "desc", key: (c) => c.rel.score || null },
  { id: "fresh", label: "Ngày cập nhật", dir: "desc", key: (c) => new Date(c.lastSynced).getTime(), words: ["Mới → cũ", "Cũ → mới"] },
];
const LIVE_SORTS = SORTS.filter((x) => FEATURES.metricsExtra || !["score"].includes(x.id)).filter((x) => FEATURES.metrics || x.id !== "er");
const sortDef = () => LIVE_SORTS.find((s) => s.id === state.sort) || SORTS[0];
function sorterOf(s, dir) {
  if (!s.key) return null;
  const m = dir === "asc" ? 1 : -1;
  const cmp = (x, y) => (x == null ? (y == null ? 0 : 1) : y == null ? -1 : (x - y) * m);
  return (a, b) => cmp(s.key(a.c), s.key(b.c)) || (s.then ? cmp(s.then(a.c), s.then(b.c)) : 0);
}
/** Nút đổi chiều: nhãn nói rõ thứ tự ĐANG áp dụng; bấm để đảo. */
function sortDirBtn() {
  const s = sortDef(), dir = state.sortDir, [dWord, aWord] = s.words || ["Cao → thấp", "Thấp → cao"];
  if (!s.key) return `<button class="btn btn-sm sort-dir" id="sort-dir" type="button" disabled title="“Phù hợp nhất” xếp theo mức khớp với bộ lọc, không đổi chiều được">${icon("sortDesc", 16)}<span class="sort-dir-txt">Theo mức khớp</span></button>`;
  const now = dir === "asc" ? aWord : dWord, next = dir === "asc" ? dWord : aWord;
  return `<button class="btn btn-sm sort-dir" id="sort-dir" type="button" aria-label="${esc(s.label)}: ${now}. Bấm để đổi sang ${next}" title="Bấm để đổi sang ${next}">${icon(dir === "asc" ? "sortAsc" : "sortDesc", 16)}<span class="sort-dir-txt">${now}</span></button>`;
}

// Viewer không lọc được theo giá → bỏ vế ngân sách khỏi câu ví dụ.
const example = (i) => (can("price") ? EXAMPLES[i] : EXAMPLES[i].replace(/,\s*dưới [^,]*$/i, "").replace(/\s*dưới \d+ triệu$/i, ""));

let root = null;
let drawer = null;     // overlay bộ lọc (màn hẹp)
let formSource = null; // form vừa phát sinh thay đổi → không vẽ lại chính nó (giữ focus khi đang gõ)
let aiTimer = null;

const isSearching = () => !!state.ai || chipsOf(state.filters, filterCtx).length > 0;

export function render(el, params = {}) {
  root = el;
  // Deep link: #/kham-pha?q=... → chạy AI search ngay (không qua skeleton) để link chia sẻ ra đúng kết quả.
  if (params.q && state.ai?.query !== params.q) {
    const r = parseQuery(params.q, { allowPrice: can("price") });
    state.filters = r.patch; state.ai = { query: params.q, leftover: r.leftover, unsupported: r.unsupported, priceSkipped: r.priceSkipped }; state.sort = "match";
  }
  // Deep link từ nhãn công ty quản lý: #/kham-pha?company=CO-001 → mọi KOL của công ty đó.
  if (params.company && COMPANIES[params.company] && state.filters.company !== params.company) {
    state.filters = { ...emptyFilters(), company: params.company }; state.ai = null;
  }
  const need = state.reviewQueue.length + state.conflicts.length;
  root.innerHTML = `
  <div class="page disc ${isSearching() ? "is-searching" : ""}">
    <section class="hero" id="hero" aria-label="Tìm creator bằng AI">
      <div class="hero-aurora" aria-hidden="true"><i></i><i></i><i></i></div>
      <div class="hero-top"><div class="hero-top-in">
        <p class="hero-eyebrow">${icon("sparkles", 14)} AI Search · ${state.creators.length} creator<span class="hide-m"> · đồng bộ ${relTime(state.lastGlobalSync)}</span>${need ? `<span class="hide-m"> · <a href="#/du-lieu">${need} chỉ số cần xem lại</a></span>` : ""}</p>
        <h1 class="hero-title">Hôm nay bạn cần <em>creator</em> nào?</h1>
      </div></div>
      <form id="nl-form" class="hero-search">
        <span class="hero-search-ico">${icon("sparkles", { size: 24, variant: "fill" })}</span>
        <label class="sr-only" for="nl-input">Mô tả creator bạn cần tìm</label>
        <textarea id="nl-input" class="hero-input" rows="1" placeholder="VD: ${esc(example(0))}">${esc(state.ai?.query || "")}</textarea>
        <button class="btn btn-primary hero-btn" type="submit"><span class="hero-btn-label">${icon("sparkles", { size: 18, variant: "fill" })} Tìm bằng AI</span><span class="thinking" aria-hidden="true"><i></i><i></i><i></i></span></button>
      </form>
      <div class="hero-chips"><span class="faint">Thử nhanh</span>
        ${EXAMPLES.map((ex, i) => `<button class="hero-chip" type="button" data-example="${i}" title="${esc(example(i))}">${esc(EXAMPLE_LABELS[i])}</button>`).join("")}
        <button class="hero-chip hero-chip-soon" type="button" data-act="explore-out" title="Tìm creator chưa có trong database, nhiều quốc gia — sắp có">${icon("compass", 14)} Ngoài database · VN, IN, ID, PH <span class="badge">Sắp có</span></button>
      </div>
    </section>

    <div class="disc-layout">
      <aside class="disc-side" aria-label="Bộ lọc">
        <section class="card filter-inline" aria-label="Bộ lọc">
          <div class="card-head"><h2>${icon("sliders", 16)} Bộ lọc</h2><button class="btn btn-ghost btn-sm" type="button" data-clear>Xoá hết</button></div>
          <div class="filter-form" id="filter-form"></div>
        </section>
      </aside>

      <div class="disc-main">
        <div id="understood"></div>
        <div class="toolbar">
          <div class="toolbar-views" id="views" role="group" aria-label="View đã lưu"></div>
          <div class="toolbar-right">
            <strong id="count" class="num" aria-live="polite"></strong>
            <span class="sort-group" role="group" aria-label="Sắp xếp kết quả">
              <label class="faint sort-label" for="sort">Sắp theo</label>
              <select id="sort" class="select toolbar-sort" title="Tiêu chí sắp xếp" aria-label="Sắp theo">${LIVE_SORTS.filter((s) => !s.perm || can(s.perm)).map((s) => `<option value="${s.id}" ${state.sort === s.id ? "selected" : ""}>${s.label}</option>`).join("")}</select><span id="sort-dir-wrap">${sortDirBtn()}</span>
            </span>
            <div class="segmented" role="group" aria-label="Kiểu hiển thị kết quả">
              <button type="button" data-mode="cards" aria-pressed="${state.viewMode === "cards"}" title="Thẻ có nội dung gần đây">${icon("grid", 14)} Thẻ</button>
              <button type="button" data-mode="table" aria-pressed="${state.viewMode === "table"}" title="Bảng gọn">${icon("table", 14)} Bảng</button>
            </div>
            <button class="btn btn-filter" type="button" id="btn-filter">${icon("sliders", 16)} Bộ lọc <span class="badge badge-primary" id="filter-n" hidden></span></button>
          </div>
        </div>
        <div id="results"></div>
        <div id="dock"></div>
      </div>
    </div>
  </div>`;

  const input = $("#nl-input", root);
  $("#nl-form", root).addEventListener("submit", (e) => { e.preventDefault(); runQuery(input.value); });
  input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); runQuery(input.value); } });
  delegate(root, "click", "[data-example]", (e, b) => { const q = example(+b.dataset.example); input.value = q; runQuery(q); });
  delegate(root, "click", "[data-rm-chip]", (e, b) => setFilters(removeChip(state.filters, b.dataset.rmChip, b.dataset.value || null)));
  delegate(root, "click", "[data-edit-layer]", (e, b) => focusLayer(b.dataset.editLayer));
  delegate(root, "click", "[data-clear]", () => { input.value = ""; setFilters(emptyFilters(), null); });
  delegate(root, "click", "[data-view]", (e, b) => applyView(b.dataset.view));
  delegate(root, "click", "[data-save-view]", saveView);
  delegate(root, "click", "[data-mode]", (e, b) => { setPref("viewMode", b.dataset.mode); $$("[data-mode]", root).forEach((x) => x.setAttribute("aria-pressed", String(x === b))); drawResults(); });
  delegate(root, "change", "[data-shortlist]", (e, cb) => {
    const c = getCreator(cb.dataset.shortlist);
    if (cb.checked && c.rel.status === "dnr") toast("Lưu ý: Do-Not-Recommend", `${c.name} đang bị đánh dấu không đề xuất.`, "danger");
    toggleShortlist(c.id, cb.checked);
  });
  delegate(root, "click", "[data-save]", (e, b) => openSaveMenu(b, b.dataset.save));
  delegate(root, "click", "[data-act='explore-out']", openExploreOut);
  delegate(root, "click", "[data-lookalike]", (e, b) => openLookalike(getCreator(b.dataset.lookalike)));
  $("#btn-filter", root).addEventListener("click", () => openFilterDrawer());
  // Đổi tiêu chí → về chiều mặc định của tiêu chí đó (giá: thấp → cao; còn lại: cao → thấp).
  const drawSortDir = () => { $("#sort-dir-wrap", root).innerHTML = sortDirBtn(); };
  $("#sort", root).addEventListener("change", (e) => { state.sort = e.target.value; state.sortDir = sortDef().dir || "desc"; drawSortDir(); drawResults(); });
  delegate(root, "click", "#sort-dir", () => { state.sortDir = state.sortDir === "asc" ? "desc" : "asc"; drawSortDir(); drawResults(); $("#sort-dir", root).focus(); });
  bindFilterForm($("#filter-form", root));
  formSource = null;
  onFilters();
}

/* ---------- store hooks (app.js gọi) ---------- */
export function onFilters() {
  if (!root || !document.contains(root)) return;
  $(".disc", root).classList.toggle("is-searching", isSearching());
  $("#nl-form", root).classList.remove("is-thinking");
  setQuery("kham-pha", state.ai?.query ? { q: state.ai.query } : null); // link chia sẻ được, không tạo mục lịch sử
  drawUnderstood(); drawViews(); drawResults();
  const inline = $("#filter-form", root);
  if (formSource !== inline) inline.innerHTML = formHtml(openLayers(inline)); else syncCounts(inline);
  if (drawer) { if (formSource !== drawer.body) drawer.body.innerHTML = formHtml(openLayers(drawer.body)); syncCounts(drawer.el); }
  formSource = null;
}
export function onShortlist() {
  if (!root || !document.contains(root)) return;
  $$("[data-shortlist]", root).forEach((cb) => { cb.checked = inShortlist(cb.dataset.shortlist); cb.closest("tbody").classList.toggle("is-selected", cb.checked); });
  $$("[data-card]", root).forEach((el) => el.classList.toggle("is-selected", inShortlist(el.dataset.card)));
  drawDock();
}

/* ---------- AI search ---------- */
function runQuery(text) {
  clearTimeout(aiTimer);
  if (!text.trim()) return setFilters(emptyFilters(), null);
  // Hero thu gọn ngay, viền ô tìm kiếm chạy gradient + skeleton để người dùng thấy AI đang xử lý (app thật: thời gian chờ ai-chat.php).
  $(".disc", root).classList.add("is-searching");
  $("#nl-form", root).classList.add("is-thinking");
  $("#understood", root).innerHTML = `<div class="understood card"><span class="badge badge-ai"><span class="thinking" aria-hidden="true"><i></i><i></i><i></i></span> AI đang đọc brief…</span><span class="skeleton" style="width:120px;height:26px"></span><span class="skeleton" style="width:90px;height:26px"></span><span class="skeleton" style="width:150px;height:26px"></span></div>`;
  $("#results", root).innerHTML = skeletonHtml();
  const seq = (aiTimer = Symbol("ai"));
  const apply = (r, engine) => {
    if (aiTimer !== seq) return; // người dùng đã gõ câu khác
    state.sort = "match";
    if (root && document.contains(root)) { $("#sort", root).value = "match"; $("#sort-dir-wrap", root).innerHTML = sortDirBtn(); }
    setFilters(r.patch, { query: text, leftover: r.leftover || [], unsupported: r.unsupported || [], priceSkipped: r.priceSkipped, engine });
  };
  const rules = () => parseQuery(text, { allowPrice: can("price") });
  if (!FEATURES.aiSearch) return void setTimeout(() => apply(rules(), "rules"), 300);
  // Bộ đọc từ khoá hiểu trọn câu (không sót từ, không có ý "chưa lọc được") → dùng luôn: tức thì, không tốn lượt AI.
  // Chỉ câu khó (từ lạ, ý mơ hồ) mới gọi DeepSeek.
  const quick = rules();
  if (quick.understood.length && !quick.leftover.length && !(quick.unsupported || []).length && !quick.patch.q) return void setTimeout(() => apply(quick, "rules-fast"), 150);
  // DeepSeek đọc câu (server kiểm giá trị); quá 12 giây hoặc lỗi → bộ đọc theo luật, kết quả vẫn ra.
  Promise.race([api("/ai/search", { method: "POST", body: { query: text } }), new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 12000))])
    .then((r) => {
      const patch = emptyFilters();
      for (const k of ["categories", "regions", "tiers", "heroes", "platforms", "relStatus"]) if (Array.isArray(r.patch[k])) patch[k] = r.patch[k];
      for (const k of ["followersMin", "followersMax", "rateMin", "rateMax"]) if (r.patch[k] != null) patch[k] = String(r.patch[k]);
      if (r.patch.rateSow) patch.rateSow = r.patch.rateSow;
      if (r.patch.q) patch.q = r.patch.q;
      apply({ patch, unsupported: r.unsupported, priceSkipped: r.priceSkipped }, "deepseek");
    })
    .catch(() => apply(rules(), "rules"));
}
const skeletonHtml = () => `<div class="stack" aria-busy="true" aria-label="Đang tải kết quả">${[0, 1, 2].map(() => `<div class="card res"><div class="row"><span class="skeleton" style="width:44px;height:44px;border-radius:50%"></span><div style="flex:1"><div class="skeleton" style="width:40%;height:14px;margin-bottom:8px"></div><div class="skeleton" style="width:60%;height:12px"></div></div></div><div class="thumbs">${[0, 1, 2, 3].map(() => `<span class="skeleton" style="height:124px"></span>`).join("")}</div></div>`).join("")}</div>`;

function drawUnderstood() {
  const chips = chipsOf(state.filters, filterCtx);
  const ai = state.ai;
  $("#filter-n", root).hidden = !chips.length;
  $("#filter-n", root).textContent = chips.length;
  if (!chips.length && !ai) { $("#understood", root).innerHTML = ""; return; }
  $("#understood", root).innerHTML = `
    <div class="understood card stagger">
      <span class="badge ${ai ? "badge-ai" : "badge-primary"}">${ai ? icon("sparkles", 12) + " AI đã hiểu" : icon("sliders", 12) + " Đang lọc"}</span>
      ${chips.map((ch) => `<span class="chip ${ai ? "chip-ai" : "is-on"}">
          <button type="button" class="chip-label" data-edit-layer="${ch.layer}" title="Bấm để sửa trong bộ lọc">${esc(ch.label)}</button>
          <button type="button" class="chip-x" data-rm-chip="${ch.key}" ${ch.value != null ? `data-value="${esc(ch.value)}"` : ""} aria-label="Bỏ điều kiện ${esc(ch.label)}">${icon("xmark", 12)}</button>
        </span>`).join("") || `<span class="faint">Không nhận ra tiêu chí nào — hãy thử mô tả khác hoặc dùng bộ lọc.</span>`}
      <button class="btn btn-ghost btn-sm" type="button" data-clear>Xoá hết</button>
    </div>
    ${ai?.leftover?.length ? `<p class="understood-note">${icon("alert", 14)} AI chưa hiểu: <strong>“${esc(ai.leftover.join(" "))}”</strong> — phần này chưa được lọc. <button class="link" type="button" data-edit-layer="persona">Thêm bằng bộ lọc</button></p>` : ""}
    ${ai?.engine === "rules" && FEATURES.aiSearch ? `<p class="understood-note faint">${icon("clock", 14)} AI đang bận — đã dùng bộ đọc nhanh theo từ khoá.</p>` : ""}
    ${ai?.unsupported?.length ? `<p class="understood-note">${icon("alert", 14)} Chưa lọc được: <strong>${esc(ai.unsupported.join(", "))}</strong> — dữ liệu hiện có chưa có thông tin này.</p>` : ""}
    ${ai?.priceSkipped ? `<p class="understood-note">${icon("lock", 14)} Đã bỏ qua tiêu chí giá: vai trò Viewer không xem được giá.</p>` : ""}`;
}

/* ---------- saved views ---------- */
const viewFilters = (v) => ({ ...emptyFilters(), ...structuredClone(v.patch) });
function drawViews() {
  const cur = JSON.stringify(state.filters);
  // View có điều kiện giá không hiện cho vai trò không được xem giá.
  $("#views", root).innerHTML = state.savedViews.filter((v) => can("price") || (!v.patch.rateMax && !v.patch.rateMin)).map((v) => `<button class="chip" type="button" data-view="${v.id}" aria-pressed="${JSON.stringify(viewFilters(v)) === cur}">${v.id === "all" ? "" : icon("bookmark", 12)} ${esc(v.name)}</button>`).join("")
    + (chipsOf(state.filters, filterCtx).length ? `<button class="btn btn-ghost btn-sm" type="button" data-save-view>${icon("plus", 14)} Lưu view này</button>` : "");
}
function applyView(id) {
  $("#nl-input", root).value = "";
  setFilters(viewFilters(state.savedViews.find((v) => v.id === id)), null);
}
function saveView() {
  const o = openOverlay({
    kind: "modal", title: "Lưu view",
    body: `<div class="field"><label for="view-name">Tên view</label><input class="input" id="view-name" autofocus value="${esc(chipsOf(state.filters, filterCtx).slice(0, 3).map((c) => c.label).join(" · "))}" /></div>
      <p class="field-hint" style="margin-top:8px">View lưu lại toàn bộ bộ lọc hiện tại để cả team dùng lại.</p>`,
    footer: `<span class="spacer"></span><button class="btn" data-close type="button">Huỷ</button><button class="btn btn-primary" type="button" id="view-save">Lưu view</button>`,
  });
  $("#view-save", o.el).addEventListener("click", () => {
    const name = $("#view-name", o.el).value.trim();
    if (!name) return;
    state.savedViews.push({ id: "v" + Date.now(), name, patch: structuredClone(state.filters) });
    o.close(); drawViews(); toast("Đã lưu view", name);
  });
}

/* ---------- kết quả ---------- */
function compute() {
  const rec = recommend(state.creators, state.filters, filterCtx);
  const active = chipsOf(state.filters, filterCtx).length > 0;
  const sorter = sorterOf(sortDef(), state.sortDir);
  return { matches: sorter ? [...rec.matches].sort(sorter) : rec.matches, near: rec.near, active };
}
const flagged = () => (state.filters.competitorOf ? competitorsOf(state.filters.competitorOf) : []);
const whyHtml = (r, active) => (active || r.warn.length ? `<div class="why">
    ${r.fail.map((x) => `<span class="why-miss">${esc(x.text)}</span>`).join("")}
    ${r.pass.map((x) => `<span class="why-ok">${esc(x.text)}</span>`).join("")}
    ${active ? r.plus.map((x) => `<span class="why-plus">${esc(x)}</span>`).join("") : ""}
    ${r.warn.map((x) => `<span class="why-miss">${note(x)}</span>`).join("")}</div>` : "");
const scorePill = (r) => `<span class="score ${r.fail.length ? "score-mid" : ""}" title="Độ phù hợp: 70% khớp tiêu chí + 30% chất lượng hợp tác">${icon("sparkles", 12)} ${r.score}</span>`;

/** Nhãn nhỏ nói rõ hàng Follower / ER / View đang lấy số của kênh nào (chỉ hiện khi đang lọc theo nền tảng). */
function srcNote(c) {
  const fp = focusPlatform(state.filters);
  if (!fp) return "";
  return metricPlatform(c, state.filters) === fp
    ? `<p class="res-src">${plat(fp, 14)} Số liệu theo bộ lọc · ${PLATFORMS[fp].label}</p>`
    : `<p class="res-src is-fallback">Chưa có kênh ${PLATFORMS[fp].label} · đang hiện số kênh chính (${PLATFORMS[c.hero].label})</p>`;
}

/** Kiểu "Thẻ": hàng rộng có hàng Kênh đa nền tảng, chỉ số chính, avatar brand, dải nội dung gần đây và 3 hành động ngay trên từng kết quả. */
function cardHtml(r, active) {
  const c = r.c, mp = metricPlatform(c, state.filters), h = c.channels[mp], rate = rateFor(c), pend = pendingOf(c.id);
  return `<article class="res card lift t-${c.tier.toLowerCase()} ${inShortlist(c.id) ? "is-selected" : ""} ${c.rel.status === "dnr" ? "is-flagged" : ""}" data-card="${c.id}">
    <div class="res-top">
      <div class="res-id">${avatar(c)}<div>
        <div class="res-name"><a href="#/creator/${c.id}">${esc(c.name)}</a>${c.alias ? `<span class="faint">· ${esc(c.alias)}</span>` : ""}${tierBadge(c.tier)}${relBadge(c.rel.status)}${repBadge(c)}</div>
        <span class="dt-sub">${[c.handle, c.type, c.region, c.categories[0], c.rel.owner ? "phụ trách " + c.rel.owner : ""].filter(Boolean).map(esc).join(" · ")}</span></div></div>
      <div class="res-actions">
        ${active ? `<span class="${r.fail.length ? "ring-mid" : ""}">${ring(r.score, { label: "Độ phù hợp (70% khớp tiêu chí + 30% chất lượng hợp tác)" })}</span>` : ""}
        <button class="btn btn-sm btn-ai" type="button" data-lookalike="${c.id}">${icon("similar", 16)} Tìm tương tự</button>
        <a class="btn btn-sm" href="#/creator/${c.id}">${icon("person", 16)} Xem hồ sơ</a>
        <button class="btn btn-sm btn-primary" type="button" data-save="${c.id}" aria-haspopup="menu">${saveLabel(c.id)}</button>
      </div>
    </div>
    ${channelRow(c, focusPlatform(state.filters))}
    <div class="res-stats">${srcNote(c)}
      <div class="stat"><strong>${plat(mp, 20)} <span class="num">${fmtNum(h.followers.value)}</span></strong><span>Follower ${trend(h.growthPct)}</span></div>
      <div class="stat" data-f="metrics"><strong class="num">${fmtPct(h.er.value)}</strong><span>Engagement</span></div>
      <div class="stat" data-f="metrics"><strong class="num">${fmtNum(h.avgViews.value)}</strong><span>View trung bình</span></div>
      <div class="stat"><strong>${rate ? money(rate.amount) : can("price") ? "—" : redacted("Ẩn giá")}</strong><span>Giá${rate ? " từ · " + esc(rate.sow) : can("price") ? " · chưa có" : ""}</span></div>
      <div class="stat" data-f="metricsExtra"><strong>${stars(c.rel.score)}</strong><span>Working score</span></div>
      <div class="stat stat-brands" data-f="brands">${brandStack(c, 4, flagged())}<span>Brand đã hợp tác</span></div>
    </div>
    ${thumbs(c)}
    <div class="res-foot">${whyHtml(r, active)}<span class="faint res-fresh">${icon("clock", 12)} Cập nhật ${relTime(c.lastSynced)}${pend ? ` · <a href="#/du-lieu">${pend} chỉ số chờ duyệt</a>` : ""}</span></div>
  </article>`;
}

function rowHtml(r, active, cols) {
  const c = r.c, mp = metricPlatform(c, state.filters), h = c.channels[mp], picked = inShortlist(c.id), pend = pendingOf(c.id);
  const why = whyHtml(r, active);
  return `<tbody class="${picked ? "is-selected" : ""} ${c.rel.status === "dnr" ? "is-flagged" : ""}">
    <tr>
      <td class="t-check"><label class="check" title="${activeList() ? `Thêm vào Ứng viên của campaign “${esc(activeList().name)}”` : "Chưa có campaign đang làm"}"><input type="checkbox" data-shortlist="${c.id}" ${picked ? "checked" : ""} ${activeList() && can("edit") ? "" : "disabled"} aria-label="Thêm ${esc(c.name)} vào Ứng viên ${activeList() ? "của campaign " + esc(activeList().name) : ""}" /></label></td>
      <td class="t-main">${creatorCell(c)}<span class="row-acts">${repBadge(c)}<button class="btn btn-sm btn-primary" type="button" data-save="${c.id}" data-compact aria-haspopup="menu" title="Lưu vào campaign">${saveLabel(c.id, true)}</button><button class="btn btn-ghost btn-icon btn-sm" type="button" data-lookalike="${c.id}" aria-label="Tìm creator tương tự ${esc(c.name)}" title="Tìm tương tự">${icon("similar", 16)}</button></span></td>
      <td data-label="Overall tier">${tierBadge(c.tier)}</td>
      <td data-label="Kênh" class="t-ch">${channelCells(c)}<span class="dt-sub"><span data-f="metrics">ER ${PLATFORMS[mp].label} ${fmtPct(h.er.value)} · View TB ${fmtNum(h.avgViews.value)} · </span>tổng ~${fmtNum(totalFollowers(c))} · ${relTime(c.lastSynced)}${pend ? " · chờ duyệt" : ""}</span></td>
      <td data-label="Giá tham chiếu" class="t-right">${benchRate(c)}</td>
      <td data-label="Brand đã hợp tác" class="t-full" data-f="brands">${brandChips(c, 3, flagged())}</td>
      <td data-label="Quan hệ">${relBadge(c.rel.status)}<span class="dt-sub"><span data-f="metricsExtra">${stars(c.rel.score)} · </span>${esc(c.rel.owner)}</span></td>
      ${active ? `<td data-label="Độ phù hợp (AI)">${scorePill(r)}</td>` : ""}
    </tr>${why ? `<tr class="dt-why"><td colspan="${cols}" class="t-full">${why}</td></tr>` : ""}
  </tbody>`;
}
function listHtml(list, active) {
  if (state.viewMode === "cards") return `<div class="stack res-list stagger">${list.map((r) => cardHtml(r, active)).join("")}</div>`;
  const cols = active ? 8 : 7;
  return `<div class="dt-wrap"><table class="dt">
    <thead><tr><th class="t-check"><span class="sr-only">Ứng viên của campaign đang làm</span></th><th>Creator</th><th>Overall tier</th><th title="Bấm vào từng kênh để mở trang của creator">Kênh ${icon("external", 12)}</th><th class="t-right">Giá tham chiếu</th><th data-f="brands">Brand đã hợp tác</th><th>Quan hệ</th>${active ? "<th>Phù hợp</th>" : ""}</tr></thead>
    ${list.map((r) => rowHtml(r, active, cols)).join("")}
  </table></div>`;
}

function drawResults() {
  const { matches, near, active } = compute();
  $("#count", root).textContent = `${matches.length} creator`;
  let html = matches.length ? listHtml(matches, active)
    : emptyState("search", "Không có creator khớp tất cả tiêu chí", near.length ? "Xem các creator gần khớp bên dưới, hoặc nới bớt một điều kiện." : "Hãy bỏ bớt điều kiện.", `<button class="btn" type="button" data-clear>Xoá bộ lọc</button>`);
  if (near.length) {
    html += `<div class="near-head"><h2>Gần khớp — lệch đúng 1 tiêu chí <span class="badge">${near.length}</span></h2>
      <p class="faint">AI gợi ý thêm để bạn cân nhắc nới điều kiện. Tiêu chí lệch được đánh dấu ✕.</p></div>${listHtml(near, true)}`;
  }
  $("#results", root).innerHTML = html;
  drawDock();
}

/** Thanh shortlist dính đáy: luôn thấy đã chọn bao nhiêu và đi tiếp tới So sánh / Báo giá. */
function drawDock() {
  const n = state.shortlist.length;
  $("#dock", root).innerHTML = n ? `<div class="dock" role="region" aria-label="Ứng viên của campaign">
      <span>${icon("list", 16)} <strong>${n}</strong> ứng viên<span class="dock-camp">&nbsp;· campaign <strong>${esc(activeList().name)}</strong></span></span><span class="spacer"></span>
      <a class="btn btn-sm" href="${campaignHash("ung-vien", "&view=compare")}">${icon("columns", 14)} So sánh</a>
      <a class="btn btn-sm btn-primary" href="${campaignHash("ung-vien")}" title="Ước tính KPI và duyệt ứng viên của ${esc(activeList().name)}">Ước tính KPI<span class="dock-more">&nbsp;& duyệt</span> ${icon("chevR", 14)}</a></div>` : "";
}

/** "Ngoài database" — chưa làm ở prototype; giới thiệu hướng Phase 3 (khám phá creator mới, nhiều quốc gia). */
function openExploreOut() {
  openOverlay({
    kind: "modal", title: "Khám phá ngoài database — sắp có",
    body: `<div class="stack">
      <p>Hiện công cụ quản lý creator <strong>đã có trong database của Markus</strong> và nhập thêm thủ công. Bước mở rộng sẽ cho tìm cả creator <strong>chưa có trong danh sách</strong> để làm mới database.</p>
      <ul class="bullets">
        <li>Thị trường: Việt Nam, Ấn Độ, Indonesia, Philippines (theo các campaign đang chạy).</li>
        <li>Nguồn: nhà cung cấp dữ liệu creator (dạng EchoTik, Modash); kết quả hiện kèm nguồn và thời điểm lấy số.</li>
        <li>Một nút “Đưa vào database”: tạo hồ sơ, tự kiểm tra trùng, rồi lưu vào Ứng viên của campaign như creator nội bộ.</li>
      </ul>
      <p class="faint">Chi phí và nguồn dữ liệu sẽ chốt khi bàn phạm vi pipeline sau go-live.</p></div>`,
    footer: `<span class="spacer"></span><button class="btn btn-primary" data-close type="button">Đã hiểu</button>`,
  });
}

/* ---------- form bộ lọc 4 lớp theo brief (dùng chung cho cột trái và drawer) ---------- */
const opt = (def, v) => (def.optionLabel ? def.optionLabel(v) : v);
function fieldHtml(def, f) {
  const id = "f-" + def.key;
  if (def.type === "multi") {
    return `<div class="field"><span class="field-label">${esc(def.label)}</span>
      ${def.searchable ? `<input class="input" type="search" placeholder="Tìm brand…" data-f-search="${def.key}" aria-label="Tìm trong ${esc(def.label)}" />` : ""}
      <div class="chip-set ${def.searchable ? "chip-set-scroll" : ""}" role="group" aria-label="${esc(def.label)}" data-f-group="${def.key}">
        ${def.options.map((v) => `<button type="button" class="chip" data-f-multi="${def.key}" data-v="${esc(v)}" aria-pressed="${f[def.key].includes(v)}">${def.key === "heroes" ? platformIcon(v, { size: 16, label: false }) : ""}${esc(opt(def, v))}</button>`).join("")}
      </div></div>`;
  }
  if (def.type === "platforms") { // "Có kênh": chip chọn nền tảng + khoảng follower RIÊNG cho từng nền tảng đã chọn
    const kv = (p, b) => { const v = platRange(f, p)[b]; return v === "" || v == null ? "" : +v / 1e3; };
    return `<div class="field"><span class="field-label">${esc(def.label)}</span>
      <div class="chip-set" role="group" aria-label="${esc(def.label)}">
        ${def.options.map((p) => `<button type="button" class="chip" data-f-plat="${p}" aria-pressed="${f.platforms.includes(p)}">${platformIcon(p, { size: 16, label: false })}${esc(opt(def, p))}</button>`).join("")}
      </div>
      ${f.platforms.map((p) => `<div class="plat-range">${platformIcon(p, { size: 18, label: false })}<span class="plat-range-name">${esc(opt(def, p))}</span>
        <input class="input" type="number" min="0" inputmode="decimal" placeholder="Từ" aria-label="Follower ${esc(opt(def, p))} từ (nghìn)" data-f-platnum="${p}" data-bound="min" value="${kv(p, "min")}" />
        <span aria-hidden="true">–</span>
        <input class="input" type="number" min="0" inputmode="decimal" placeholder="Đến" aria-label="Follower ${esc(opt(def, p))} đến (nghìn)" data-f-platnum="${p}" data-bound="max" value="${kv(p, "max")}" /></div>`).join("")}
      <span class="field-hint">${f.platforms.length ? "Follower riêng từng kênh, đơn vị nghìn (để trống = không giới hạn). " : ""}Creator phải có đủ các kênh đã chọn; số liệu trên thẻ lấy theo kênh chọn đầu tiên.</span></div>`;
  }
  if (def.type === "select") {
    return `<div class="field"><label>${esc(def.label)}<select class="select" data-f-set="${def.key}">
      <option value="">Tất cả</option>${def.options.map((v) => `<option value="${esc(v)}" ${String(f[def.key]) === String(v) ? "selected" : ""}>${esc(opt(def, v))}</option>`).join("")}</select></label></div>`;
  }
  if (def.type === "range") {
    const scale = def.key === "rate" ? 1e6 : def.key === "followers" ? 1e3 : 1;
    const unit = def.key === "rate" ? "triệu ₫" : def.key === "followers" ? "nghìn" : def.unit;
    const val = (k) => (f[k] === "" ? "" : +f[k] / scale);
    return `<div class="field"><span class="field-label">${esc(def.label.replace(" (₫)", ""))} <span class="faint">(${unit})</span></span>
      <div class="range-row">
        <input class="input" type="number" min="0" inputmode="decimal" placeholder="Từ" aria-label="${esc(def.label)} từ" data-f-num="${def.min}" data-scale="${scale}" value="${val(def.min)}" />
        <span aria-hidden="true">–</span>
        <input class="input" type="number" min="0" inputmode="decimal" placeholder="Đến" aria-label="${esc(def.label)} đến" data-f-num="${def.max}" data-scale="${scale}" value="${val(def.max)}" />
        ${def.sowKey ? `<select class="select" data-f-set="${def.sowKey}" aria-label="Loại SOW"><option value="">Giá benchmark</option>${Object.entries(SOW_KINDS).map(([k, l]) => `<option value="${k}" ${f[def.sowKey] === k ? "selected" : ""}>/ ${l}</option>`).join("")}</select>` : ""}
      </div></div>`;
  }
  if (def.type === "number") return `<div class="field"><label>${esc(def.label)}<input class="input" type="number" min="0" step="0.5" placeholder="${esc(def.placeholder || "")}" data-f-num="${def.key}" data-scale="1" value="${f[def.key]}" /></label></div>`;
  if (def.type === "bool") return `<label class="check"><input type="checkbox" data-f-bool="${def.key}" ${f[def.key] ? "checked" : ""} /> ${esc(def.label)}</label>`;
  if (def.type === "text") return `<div class="field"><label>${esc(def.label)}<input class="input" type="search" placeholder="${esc(def.placeholder || "")}" data-f-text="${def.key}" value="${esc(f[def.key])}" /></label></div>`;
  if (def.type === "competitor") {
    return `<div class="field"><span class="field-label">${esc(def.label)}</span>
      <div class="range-row"><select class="select" data-f-set="${def.key}" aria-label="${esc(def.label)}"><option value="">Không xét</option>${def.options.map((v) => `<option ${f[def.key] === v ? "selected" : ""}>${esc(v)}</option>`).join("")}</select>
      <div class="segmented" role="group" aria-label="Cách xử lý đối thủ">
        <button type="button" data-f-mode="exclude" aria-pressed="${f.competitorMode === "exclude"}">Tránh</button>
        <button type="button" data-f-mode="only" aria-pressed="${f.competitorMode === "only"}">Chỉ lấy</button></div></div>
      <span class="field-hint">“Tránh” = loại creator từng làm cho đối thủ. “Chỉ lấy” = tìm người đối thủ đã dùng.</span></div>`;
  }
  return "";
}

/** open = Set các lớp đang mở (giữ nguyên khi vẽ lại); lớp có bộ lọc đang bật luôn mở. */
function formHtml(open = new Set(["persona"])) {
  const f = state.filters;
  return LAYERS.map((L) => {
    if (L.perm && !can(L.perm)) return `<details class="fold" data-layer="${L.id}"><summary>${esc(L.label)}<span class="spacer"></span>${icon("lock", 14)}</summary><div class="fold-body"><p class="faint">Vai trò Viewer không lọc được theo giá.</p></div></details>`;
    const n = activeCount(f, filterCtx, L.id);
    return `<details class="fold" data-layer="${L.id}" ${open.has(L.id) || n ? "open" : ""}>
      <summary><span>${esc(L.label)}<span class="fold-hint">${esc(L.hint)}</span></span><span class="spacer"></span><span class="badge badge-primary" data-layer-n="${L.id}" ${n ? "" : "hidden"}>${n}</span></summary>
      <div class="fold-body">${FILTER_DEFS.filter((d) => d.layer === L.id && (!d.perm || can(d.perm))).map((d) => fieldHtml(d, f)).join("")}</div></details>`;
  }).join("");
}
const openLayers = (el) => { const cur = $$("details[data-layer]", el); return cur.length ? new Set(cur.filter((d) => d.open).map((d) => d.dataset.layer)) : new Set(["persona"]); };
function syncCounts(el) {
  LAYERS.forEach((L) => { const b = $(`[data-layer-n="${L.id}"]`, el); if (b) { const n = activeCount(state.filters, filterCtx, L.id); b.hidden = !n; b.textContent = n; } });
  const apply = $("#f-apply", el);
  if (apply) apply.textContent = `Xem ${compute().matches.length} creator`;
}

/** Gắn sự kiện cho 1 form bộ lọc. Mọi thay đổi áp dụng ngay (kết quả cập nhật trực tiếp). */
function bindFilterForm(el) {
  const patch = (fn) => { const next = structuredClone(state.filters); fn(next); formSource = el; setFilters(next); };
  delegate(el, "click", "[data-f-multi]", (e, b) => {
    const on = b.getAttribute("aria-pressed") !== "true";
    b.setAttribute("aria-pressed", String(on));
    patch((f) => { f[b.dataset.fMulti] = on ? [...f[b.dataset.fMulti], b.dataset.v] : f[b.dataset.fMulti].filter((v) => v !== b.dataset.v); });
  });
  // "Có kênh": bật / tắt nền tảng → vẽ lại form để hiện / ẩn dòng follower của kênh đó, rồi trả focus về chip vừa bấm.
  delegate(el, "click", "[data-f-plat]", (e, b) => {
    const p = b.dataset.fPlat, next = structuredClone(state.filters);
    if (next.platforms.includes(p)) { next.platforms = next.platforms.filter((x) => x !== p); delete next.platFollowers[p]; } else next.platforms.push(p);
    formSource = null; setFilters(next);
    el.querySelector(`[data-f-plat="${p}"]`)?.focus();
  });
  delegate(el, "input", "[data-f-platnum]", (e, i) => patch((f) => {
    const p = i.dataset.fPlatnum, r = { min: "", max: "", ...(f.platFollowers[p] || {}) };
    r[i.dataset.bound] = i.value === "" ? "" : +i.value * 1e3;
    if (r.min === "" && r.max === "") delete f.platFollowers[p]; else f.platFollowers[p] = r;
  }));
  delegate(el, "change", "[data-f-set]", (e, s) => patch((f) => { f[s.dataset.fSet] = s.value; }));
  delegate(el, "input", "[data-f-num]", (e, i) => patch((f) => { f[i.dataset.fNum] = i.value === "" ? "" : +i.value * +i.dataset.scale; }));
  delegate(el, "change", "[data-f-bool]", (e, i) => patch((f) => { f[i.dataset.fBool] = i.checked; }));
  delegate(el, "input", "[data-f-text]", (e, i) => patch((f) => { f[i.dataset.fText] = i.value; }));
  delegate(el, "click", "[data-f-mode]", (e, b) => {
    $$("[data-f-mode]", el).forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    patch((f) => { f.competitorMode = b.dataset.fMode; });
  });
  delegate(el, "input", "[data-f-search]", (e, i) => {
    const q = i.value.trim().toLowerCase();
    $$(`[data-f-group="${i.dataset.fSearch}"] .chip`, el).forEach((ch) => { ch.hidden = !!q && !ch.textContent.toLowerCase().includes(q); });
  });
}

/** Bấm vào chip "AI đã hiểu" → mở đúng lớp bộ lọc: cột trái nếu đang hiện, không thì mở drawer. */
function focusLayer(layer) {
  const inline = $(".filter-inline", root);
  if (inline.offsetParent === null) return openFilterDrawer(layer);
  const d = $(`details[data-layer="${layer}"]`, inline);
  if (d) { d.open = true; d.scrollIntoView({ block: "nearest", behavior: "smooth" }); $("summary", d).focus({ preventScroll: true }); }
}

function openFilterDrawer(layer = "") {
  if (drawer) return;
  drawer = openOverlay({
    kind: "drawer", title: "Bộ lọc", body: formHtml(new Set([layer || "persona"])),
    footer: `<button class="btn btn-ghost" type="button" id="f-reset">Xoá hết</button><span class="spacer"></span><button class="btn btn-primary" type="button" id="f-apply" data-close></button>`,
    onClose: () => { drawer = null; },
  });
  bindFilterForm(drawer.body);
  $("#f-reset", drawer.el).addEventListener("click", () => { if (root) $("#nl-input", root).value = ""; setFilters(emptyFilters(), null); });
  syncCounts(drawer.el);
  if (layer) $(`[data-layer="${layer}"]`, drawer.el)?.scrollIntoView({ block: "start" });
}

/* ---------- ngữ cảnh AI Copilot của màn này ---------- */
export function copilot() {
  const top = () => compute().matches.slice(0, 3);
  return {
    label: "Khám phá creator",
    actions: [
      { label: "Gợi ý theo brief mẫu", run: () => briefToFilters(example(0)) },
      { label: "Giải thích top 3 kết quả", match: /giai thich|vi sao|tai sao/, run: () => {
        const list = top();
        post(list.length ? `<strong>Vì sao 3 creator này đứng đầu?</strong><ul>${list.map((r) => `<li><a href="#/creator/${r.c.id}">${esc(r.c.name)}</a> (${r.score}/100): ${esc([...r.pass.map((x) => x.text), ...r.plus].slice(0, 4).join("; ") || "chất lượng hợp tác tốt")}${r.warn.length ? ` — <strong>${note(r.warn[0])}</strong>` : ""}</li>`).join("")}</ul>
          <p class="faint">Điểm = 70% mức khớp tiêu chí + 30% tín hiệu chất lượng (working score, quan hệ, ER so với tier, tăng trưởng).</p>` : "Chưa có kết quả nào để giải thích.");
      } },
      { label: "Thêm top 3 vào shortlist", match: /them top/, run: () => {
        const list = top();
        post(`Mình đề xuất thêm vào shortlist: <strong>${esc(list.map((r) => r.c.name).join(", "))}</strong>. Bạn xác nhận nhé.`,
          [{ label: "Xác nhận thêm", primary: true, run: () => { list.forEach((r) => toggleShortlist(r.c.id, true)); toast("Đã thêm vào shortlist"); } }]);
      } },
    ],
  };
}
