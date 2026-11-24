// views/profile.js — MÀN 2: Creator 360° Profile (trang đầy đủ, 5 tab).
// Brief IV.1 (6 nhóm dữ liệu), IV.3 (CRM), IV.4 (Booking History), IV.5 (nguồn + thời điểm + xác minh của chỉ số).
// Thay cho viewBookingDetail() trong app.js (modal liệt kê ~20 trường theo chiều dọc).
// Mỗi tab là 1 hàm tab*() trả về HTML → thêm/bớt tab chỉ cần sửa mảng TABS.

import { $, esc, icon, delegate, openOverlay, toast, fmtNum, fmtPct, fmtDate, relTime, count } from "../core/ui.js";
import { state, can, me, getCreator, bookingsOf, toggleShortlist, addNote, setRelStatus, addRate, verifyMetric, editMetric, BOOKING_STAGES, campaignHash, FEATURES } from "../core/store.js";
import { setQuery } from "../core/router.js";
import { PLATFORMS, industryOf, competitorsOf } from "../data/catalog.js";
import { FAMILY, REL_STATUS, VIA, FORMATS, heroCh, rateFor } from "../core/filters.js";
import { summarize, lookalike } from "../ai/mock-ai.js";
import { post, postZaloDraft } from "../ai/copilot.js";
import { openLookalike } from "./lookalike.js";
import { openEditCreator } from "./creator-form.js";
import { openSaveMenu, saveLabel } from "./lists.js";
import { note, redacted, avatar, plat, platChip, channelIcon, tierBadge, relBadge, repBadge, perfOf, stars, money, contact, metric, sparkline, trend, freshness, creatorCell, lockedCard, thumbs, brandStack, gauge, coverArt, emptyState, METRIC_FMT, METRIC_LABEL } from "../core/parts.js";
import { companyOf } from "../core/filters.js";

const TABS = [
  { id: "tong-quan", label: "Tổng quan", draw: tabOverview },
  { id: "kenh", label: "Kênh & Chỉ số", draw: tabChannels },
  { id: "thuong-mai", label: "Thương mại", draw: tabCommercial },
  { id: "quan-he", label: "Quan hệ (CRM)", draw: tabCrm },
  { id: "lich-su", label: "Lịch sử hợp tác", draw: tabHistory },
];
const dec = (n) => String(n).replace(".", ",");
const channelOrder = (c) => [c.hero, ...Object.keys(c.channels).filter((p) => p !== c.hero)];

export function render(root, params) {
  const c = getCreator(params.id);
  if (!c) { root.innerHTML = `<div class="page">${emptyState("search", "Không tìm thấy creator", "Hồ sơ có thể đã bị gộp hoặc đường dẫn không đúng.", `<a class="btn btn-primary" href="#/kham-pha">Về Khám phá</a>`)}</div>`; return; }
  let tab = TABS.some((t) => t.id === params.tab) ? params.tab : "tong-quan";
  const h = heroCh(c);
  const bks = bookingsOf(c.id);
  const r = rateFor(c);
  const pf = perfOf(c, bks);

  root.innerHTML = `
  <div class="page profile">
    <a class="back" href="#/kham-pha">${icon("chevL", 16)} Khám phá</a>
    <header class="card profile-head t-${c.tier.toLowerCase()}">
      <div class="cover">
        ${coverArt(c)}
        <div class="cover-chips">${channelOrder(c).map((p) => `<a class="cover-chip" href="${esc(c.channels[p].url)}" target="_blank" rel="noopener" title="${PLATFORMS[p].label}: ${fmtNum(c.channels[p].followers.value)} follower">${plat(p, 18)}<span class="num">${fmtNum(c.channels[p].followers.value)}</span></a>`).join("")}</div>
      </div>
      <div class="profile-bar">
        ${avatar(c, "xl")}
        <div class="profile-id">
          <h1>${esc(c.name)}${c.alias ? ` <span class="profile-alias">· ${esc(c.alias)}</span>` : ""}</h1>
          <p class="muted">${esc(c.handle)} · ${esc(c.job)} · ${esc(c.region)} · <span class="faint">${esc(c.id)}</span></p>
          <div class="row-wrap profile-badges">${tierBadge(c.tier)}<span class="badge">${esc(c.type)}</span>${relBadge(c.rel.status)}${repBadge(c)}${freshness(c)}</div>
        </div>
        <div class="profile-actions">
          <button class="btn btn-primary" type="button" data-save="${c.id}" aria-haspopup="menu">${saveLabel(c.id)}</button>
          ${FEATURES.sheetWrite && can("edit") ? `<button class="btn" type="button" data-act="edit-sheet">${icon("edit", 18)} Sửa thông tin</button>` : ""}
          <button class="btn btn-ai" type="button" data-act="lookalike">${icon("similar", 18)} Tìm creator tương tự</button>
          <button class="btn btn-ai" type="button" data-act="zalo">${icon("message", 16)} Soạn tin Zalo</button>
        </div>
      </div>
      <div class="kpi-row profile-kpis">
        <div class="kpi"><div class="kpi-label">Follower · ${PLATFORMS[c.hero].label}</div><div class="kpi-value">${plat(c.hero, 26)} ${count(h.followers.value, "num")}</div><div class="kpi-sub">${trend(h.growthPct)} trong 3 tháng</div><div class="kpi-spark">${sparkline(h.growth, 120, 34)}</div></div>
        <div class="kpi kpi-perf"><div class="kpi-label">Performance trung bình · ${PLATFORMS[c.hero].label}</div><div class="kpi-value">${count(pf.avgViews, "num")} <span class="kpi-unit">view</span></div>
          <div class="kpi-sub">ER ${fmtPct(h.er.value)}${pf.n ? ` · Branded qua Markus: <strong class="num">${fmtNum(pf.brandedViews)}</strong> view TB (${pf.n} bài)${can("price") ? ` · CPV ~${pf.cpv} ₫` : ""}` : " · chưa có bài branded qua Markus"}</div></div>
        <div class="kpi"><div class="kpi-label">Giá tham chiếu</div><div class="kpi-value">${r ? money(r.amount) : "—"}</div><div class="kpi-sub">${r ? esc(r.sow) + " · " + relTime(r.updatedAt) : "Chưa có giá"}</div></div>
        <div class="kpi kpi-gauge"><div><div class="kpi-label">Working score</div><div class="kpi-sub">${bks.filter((b) => b.evaluation).length} booking đã đánh giá</div><div class="kpi-sub">Phụ trách: <strong>${esc(c.rel.owner)}</strong> · ${esc(VIA[c.rel.via])}</div></div>${gauge(c.rel.score)}</div>
      </div>
    </header>
    ${c.rel.status === "dnr" || c.rel.status === "watchlist" ? `<div class="banner banner-${c.rel.status === "dnr" ? "danger" : "warning"}" role="alert">${icon("alert")}<div><strong>${REL_STATUS[c.rel.status].label} — ${REL_STATUS[c.rel.status].desc}</strong>${note(c.notes.find((n) => n.kind === "risk")?.text || "")}</div></div>` : ""}
    <div class="tabs" role="tablist" aria-label="Các phần của hồ sơ">
      ${TABS.map((t) => `<button class="tab" role="tab" type="button" id="tab-${t.id}" data-tab="${t.id}" aria-selected="${t.id === tab}" aria-controls="tabpanel" tabindex="${t.id === tab ? 0 : -1}">${t.label}${t.id === "lich-su" && bks.length ? ` <span class="badge">${bks.length}</span>` : ""}</button>`).join("")}
    </div>
    <div id="tabpanel" role="tabpanel" tabindex="0"></div>
  </div>`;

  const drawTab = () => {
    const t = TABS.find((x) => x.id === tab);
    $("#tabpanel", root).setAttribute("aria-labelledby", "tab-" + tab);
    $("#tabpanel", root).innerHTML = t.draw(c, bks);
    root.querySelectorAll("[data-tab]").forEach((b) => { b.setAttribute("aria-selected", String(b.dataset.tab === tab)); b.tabIndex = b.dataset.tab === tab ? 0 : -1; });
  };
  const selectTab = (id, focus) => { tab = id; setQuery("creator/" + c.id, { tab }); drawTab(); if (focus) $("#tab-" + id, root).focus(); };
  drawTab();

  delegate(root, "click", "[data-tab]", (e, b) => selectTab(b.dataset.tab));
  delegate(root, "click", "[data-goto-tab]", (e, b) => { selectTab(b.dataset.gotoTab); $(".tabs", root).scrollIntoView({ block: "start" }); });
  // Bàn phím cho tablist: ← → Home End
  $(".tabs", root).addEventListener("keydown", (e) => {
    const i = TABS.findIndex((t) => t.id === tab);
    const next = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? TABS.length - 1 : null;
    if (next == null) return;
    e.preventDefault();
    selectTab(TABS[(next + TABS.length) % TABS.length].id, true);
  });

  delegate(root, "click", "[data-act]", (e, b) => {
    const act = b.dataset.act;
    if (act === "lookalike") openLookalike(c);
    if (act === "edit-sheet") openEditCreator(c);
    if (act === "zalo") postZaloDraft(c);
    if (act === "summary") aiSummary(c);
    if (act === "compare") aiCompare(c);
    if (act === "verify") { verifyMetric(c.id, b.dataset.p, b.dataset.m); toast("Đã xác minh", `${METRIC_LABEL[b.dataset.m]} ${PLATFORMS[b.dataset.p].label} — bởi ${me()}`); }
    if (act === "edit-metrics") openEditMetrics(c, b.dataset.p);
    if (act === "add-rate") openAddRate(c);
    if (act === "status") openStatus(c);
  });
  delegate(root, "click", "[data-save]", (e, b) => openSaveMenu(b, b.dataset.save));
  delegate(root, "submit", "#note-form", (e, form) => {
    e.preventDefault();
    const text = form.elements.text.value.trim();
    if (!text) return;
    addNote(c.id, text, form.elements.kind.value);
    toast("Đã lưu ghi chú", "Ghi chú hiển thị cho cả team.");
  });
}

/* =============== Liên hệ (đặt ngay đầu cột phải của Tổng quan) ===============
   Cá nhân: liên hệ trực tiếp creator (hoặc manager riêng). Có công ty quản lý: thêm khối công ty có ID riêng.
   Mọi SĐT / email / tên người liên hệ đi qua contact() → Viewer không thấy. */
function contactCard(c) {
  const co = companyOf(c), k = c.rel.contact;
  const line = (ico, label, value) => `<dt>${ico} ${esc(label)}</dt><dd>${value ? contact(value) : `<span class="faint">Chưa có</span>`}</dd>`;
  return `<section data-tile="contact" class="card">
    <div class="card-head"><h2>${icon("phone", 16)} Liên hệ</h2>${repBadge(c)}</div>
    <dl class="dl card-pad">
      <dt>Kênh ưu tiên</dt><dd><span class="row" style="gap:6px">${channelIcon(c.rel.channel)} ${esc(c.rel.channel)} · ${esc(VIA[c.rel.via])}</span></dd>
      ${line(icon("person", 14), "Người liên hệ", k.person || c.name)}
      ${line(icon("phone", 14), "SĐT / Zalo", k.phone)}
      ${line(icon("mail", 14), "Email", k.email)}
      ${k.zalo && k.zalo !== k.phone ? line(icon("phone", 14), "Chi tiết liên hệ", k.zalo) : ""}
      ${k.website ? line(icon("external", 14), "Website", k.website) : ""}
      ${co ? `<dt>${icon("users", 14)} Công ty quản lý</dt><dd><a href="#/kham-pha?company=${esc(co.id)}">${esc(co.name)}</a> <span class="faint">· ${esc(co.kind)} · ${esc(co.id)}</span></dd>
        ${line(icon("person", 14), "Đầu mối công ty", co.person)}${line(icon("phone", 14), "SĐT công ty", co.phone)}${line(icon("mail", 14), "Email công ty", co.email)}` : ""}
      <dt>Phụ trách nội bộ</dt><dd>${c.rel.owner ? esc(c.rel.owner) : `<span class="faint">Chưa gán</span>`}</dd>
    </dl>
  </section>`;
}

/* =============== TAB: Tổng quan =============== */
function tabOverview(c, bks) {
  const s = summarize(c, bks, state.creators, { allowPrice: can("price") });
  const sims = lookalike(c, state.creators, 3);
  const clash = c.brands.filter((b) => competitorsOf(b).some((x) => c.brands.includes(x)));
  const byInd = {};
  c.brands.forEach((b) => (byInd[industryOf(b)] = byInd[industryOf(b)] || []).push(b));
  const viaMarkus = new Set(bks.map((b) => b.brand));
  return `<div class="profile-grid">
    <div class="stack">
      <section data-tile="summary" class="card card-ai card-pad">
        <div class="row" style="margin-bottom:8px"><h2 style="flex:1">${icon("sparkles", 16)} AI tóm tắt</h2><span class="badge badge-${s.verdict.tone}">${esc(s.verdict.text.split(" — ")[0])}</span></div>
        <ul class="bullets">${s.bullets.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>
        ${s.risks.length ? `<div class="banner banner-warning" style="margin-top:12px">${icon("alert", 16)}<div><strong>Cần lưu ý</strong><ul class="bullets">${s.risks.map((b) => `<li>${note(b)}</li>`).join("")}</ul></div></div>` : ""}
        <p style="margin-top:12px"><strong>Nhận định:</strong> ${esc(s.verdict.text)}</p>
        <p class="faint" style="margin-top:8px">AI tổng hợp từ dữ liệu trong hồ sơ này. Quyết định booking thuộc về Planner / Booking Lead.</p>
        <div class="row-wrap" style="margin-top:12px">
          <button class="btn btn-sm btn-ai" type="button" data-act="compare">So sánh với creator tương tự</button>
          <button class="btn btn-sm btn-ai" type="button" data-act="zalo">Soạn tin Zalo</button>
        </div>
      </section>
      <section data-tile="content" class="card">
        <div class="card-head"><h2>Nội dung gần đây</h2><span class="src src-crawler">Crawler thu thập</span></div>
        <div class="card-pad">${thumbs(c)}<p class="faint" style="margin-top:8px">Thẻ “Branded” = bài có gắn brand, tự nhận diện từ caption / hashtag (cần người xác nhận trước khi ghi vào Lịch sử hợp tác).</p></div>
      </section>
      <section data-tile="channels" class="card">
        <div class="card-head"><h2>Kênh mạng xã hội</h2><button class="btn btn-ghost btn-sm" type="button" data-goto-tab="kenh">Chi tiết ${icon("chevR", 14)}</button></div>
        <div class="card-pad ch-mini">${channelOrder(c).map((p) => { const ch = c.channels[p]; return `
          <div class="ch-mini-row">${plat(p)}<div><strong>${PLATFORMS[p].label}</strong>${p === c.hero ? ` <span class="badge badge-primary">Hero</span>` : ""}<span class="dt-sub">${esc(ch.handle)} · ${esc(ch.tier)}</span></div>
            <div class="num"><strong>${fmtNum(ch.followers.value)}</strong><span class="dt-sub" data-f="metricsExtra">ER ${fmtPct(ch.er.value)}</span></div>
            <div class="ch-mini-spark">${sparkline(ch.growth, 80, 26)}${trend(ch.growthPct)}</div></div>`; }).join("")}</div>
      </section>
      <section data-tile="brands" class="card">
        <div class="card-head"><h2>Brand đã hợp tác</h2>${brandStack(c, 6, clash)}<span class="faint">${c.brands.length} brand · ${viaMarkus.size} qua Markus</span></div>
        <div class="card-pad stack">
          ${Object.entries(byInd).map(([ind, list]) => `<div class="row-wrap"><span class="section-title" style="min-width:84px">${esc(ind)}</span>${list.map((b) => `<span class="badge ${clash.includes(b) ? "badge-warning" : viaMarkus.has(b) ? "badge-primary" : ""}" title="${viaMarkus.has(b) ? "Booking qua Markus" : "Ghi nhận từ nguồn ngoài"}">${esc(b)}${viaMarkus.has(b) ? " ✓" : ""}</span>`).join("")}</div>`).join("")}
          ${clash.length ? `<p class="faint">${icon("alert", 12)} Màu vàng: các brand là đối thủ trực tiếp của nhau — kiểm tra exclusivity.</p>` : ""}
          <p class="faint">✓ = có booking qua Markus (xem tab Lịch sử hợp tác).</p>
        </div>
      </section>
    </div>
    <div class="stack">
      ${contactCard(c)}
      <section data-tile="persona" class="card">
        <div class="card-head"><h2>Chân dung</h2></div>
        <dl class="dl card-pad">
          <dt>Creator type</dt><dd>${esc(c.type)}</dd>
          <dt>Ngành nội dung</dt><dd>${esc(c.categories.join(", "))}</dd>
          <dt>Nghề nghiệp</dt><dd>${esc(c.job)}</dd>
          <dt>Tuổi · giới tính</dt><dd>${c.age ? `${c.age} tuổi (${c.yob})` : "Chưa rõ tuổi"} · ${esc(c.gender)}</dd>
          <dt>Gia đình</dt><dd>${esc(FAMILY[c.family] || "Chưa rõ")}${c.familyNote ? ` — ${esc(c.familyNote)}` : ""}</dd>
          <dt>Khu vực</dt><dd>${esc(c.region)}</dd>
          <dt>Format mạnh</dt><dd>${esc(c.formats.join(", ") || "Chưa rõ")}</dd>
        </dl>
      </section>
      <section data-tile="audience" class="card">
        <div class="card-head"><h2>Audience</h2><span class="src src-crawler">Ước tính từ crawler</span></div>
        <div class="card-pad stack">
          <div><div class="row"><span class="muted" style="flex:1">Nữ ${c.audience.female}%</span><span class="muted">Nam ${100 - c.audience.female}%</span></div><div class="bar"><i style="width:${c.audience.female}%"></i></div></div>
          <dl class="dl"><dt>Nhóm tuổi chính</dt><dd>${esc(c.audience.age)}</dd><dt>Thành phố</dt><dd>${esc(c.audience.cities.join(", "))}</dd></dl>
          <div class="chip-set">${c.audience.tags.map((t) => `<span class="badge badge-info">${esc(t)}</span>`).join("")}</div>
        </div>
      </section>
      <section data-tile="similar" class="card">
        <div class="card-head"><h2>${icon("sparkles", 16)} Creator tương tự</h2><button class="btn btn-ghost btn-sm" type="button" data-act="lookalike">Xem tất cả</button></div>
        <div class="card-pad stack">${sims.map((x) => `<div class="sim-row">${creatorCell(x.c, x.why.slice(0, 2).join(" · "))}<span class="score">${x.similarity}%</span></div>`).join("") || `<p class="faint">Chưa tìm thấy creator đủ giống.</p>`}</div>
      </section>
    </div>
  </div>`;
}

/* =============== TAB: Kênh & Chỉ số =============== */
function tabChannels(c) {
  return `<div class="banner">${icon("clock", 16)}<div>Mỗi chỉ số hiển thị <strong style="display:inline">nguồn</strong>, <strong style="display:inline">thời điểm cập nhật</strong> và <strong style="display:inline">trạng thái xác minh</strong>. Dữ liệu từ crawler / AI không tự ghi đè — xem <a href="#/du-lieu">hàng chờ duyệt</a>.</div></div>
  <div class="stack" style="margin-top:16px">${channelOrder(c).map((p) => {
    const ch = c.channels[p];
    const act = (m) => !can("verify") ? ""
      : ch[m].verify === "unverified" ? `<button class="btn btn-sm" type="button" data-act="verify" data-p="${p}" data-m="${m}">Xác minh</button>`
      : ch[m].verify !== "verified" ? `<a class="btn btn-sm" href="#/du-lieu">Xem & duyệt</a>` : "";
    return `<section class="card">
      <div class="card-head">
        ${plat(p)}<h2>${PLATFORMS[p].label} ${p === c.hero ? `<span class="badge badge-primary">Hero platform</span>` : ""} ${tierBadge(ch.tier)}</h2>
        <a class="btn btn-ghost btn-sm" href="${esc(ch.url)}" target="_blank" rel="noopener">${esc(ch.handle)} ${icon("external", 14)}</a>
        ${can("edit") ? `<button class="btn btn-sm" type="button" data-act="edit-metrics" data-p="${p}">${icon("edit", 14)} Sửa tay</button>` : ""}
      </div>
      <div class="card-pad ch-grid">
        ${(FEATURES.metricsExtra ? ["followers", "er", "avgViews"] : ["followers"]).map((m) => metric(METRIC_LABEL[m], ch[m], METRIC_FMT[m], act(m))).join("")}
        <div class="metric" data-f="metricsExtra"><span class="metric-label">Tăng trưởng follower · 8 tháng</span>
          <span class="metric-value">${trend(ch.growthPct)} <span class="faint">/ 3 tháng gần nhất</span></span>
          ${sparkline(ch.growth, 260, 64)}
          <span class="metric-meta">${fmtNum(ch.growth[0])} → ${fmtNum(ch.growth[7])}</span></div>
      </div>
    </section>`; }).join("")}</div>`;
}

/* =============== TAB: Thương mại =============== */
function tabCommercial(c, bks) {
  if (!can("price")) return lockedCard("Giá và điều kiện thương mại");
  const done = bks.filter((b) => b.closed);
  const lastDeal = (r) => done.find((b) => b.platform === r.platform && b.sow === r.sow);
  const avgDisc = done.length ? done.reduce((s, b) => s + (b.quoted - b.closed) / b.quoted, 0) / done.length * 100 : null;
  const max = Math.max(1, ...done.map((b) => b.quoted));
  return `<div class="kpi-row">
      <div class="kpi"><div class="kpi-label">Giá tham chiếu (benchmark)</div><div class="kpi-value">${c.rates[0] ? money(c.rates[0].amount) : "—"}</div><div class="kpi-sub">${c.rates[0] ? esc(PLATFORMS[c.rates[0].platform].label + " · " + c.rates[0].sow) : ""}</div></div>
      <div class="kpi"><div class="kpi-label">Giá chốt trung bình</div><div class="kpi-value">${done.length ? money(done.reduce((s, b) => s + b.closed, 0) / done.length) : "—"}</div><div class="kpi-sub">${done.length} booking</div></div>
      <div class="kpi"><div class="kpi-label">Chốt so với báo giá</div><div class="kpi-value">${avgDisc == null ? "—" : "−" + dec(avgDisc.toFixed(1)) + "%"}</div><div class="kpi-sub">${avgDisc == null ? "Chưa có dữ liệu" : avgDisc >= 4 ? "Có dư địa thương lượng" : "Giá khá cứng"}</div></div>
      <div class="kpi"><div class="kpi-label">Tổng chi qua Markus</div><div class="kpi-value">${money(done.reduce((s, b) => s + b.closed, 0))}</div><div class="kpi-sub">từ ${done.length ? fmtDate(done[done.length - 1].date) : "—"}</div></div>
    </div>
    <section class="card" style="margin-top:16px">
      <div class="card-head"><h2>Current Rate theo nền tảng / SOW</h2>${can("edit") ? `<button class="btn btn-sm btn-primary" type="button" data-act="add-rate">${icon("plus", 14)} Cập nhật giá</button>` : ""}</div>
      <div class="dt-wrap" style="border:0;border-radius:0"><table class="dt">
        <thead><tr><th>Nền tảng · SOW</th><th class="t-right">Giá hiện tại</th><th>Cập nhật · Nguồn</th><th class="t-right">Giá chốt gần nhất</th><th>Chênh lệch</th></tr></thead>
        ${c.rates.map((r) => { const d = lastDeal(r); const diff = d && r.amount ? Math.round(((d.closed - r.amount) / r.amount) * 100) : null; return `<tbody><tr>
          <td class="t-main"><span class="row">${plat(r.platform)} <strong>${esc(r.sow)}</strong></span></td>
          <td class="t-right" data-label="Giá hiện tại">${r.amount != null ? `<strong>${money(r.amount, true)}</strong>` : `<span class="faint">${esc((r.text || "Chưa có").slice(0, 40))}</span>`}</td>
          <td data-label="Cập nhật · Nguồn">${relTime(r.updatedAt)}<span class="dt-sub">${esc(r.source)}</span></td>
          <td class="t-right" data-label="Giá chốt gần nhất">${d ? `${money(d.closed, true)}<span class="dt-sub">${esc(d.brand)} · ${fmtDate(d.date)}</span>` : `<span class="faint">Chưa có booking</span>`}</td>
          <td data-label="Chênh lệch">${diff == null ? "—" : `<span class="badge ${diff < 0 ? "badge-success" : diff > 0 ? "badge-warning" : ""}">${diff > 0 ? "+" : ""}${diff}%</span>`}</td>
        </tr></tbody>`; }).join("")}
      </table></div>
      <p class="faint card-pad">Current Rate chỉ cập nhật khi có giá mới đáng tin cậy. Giá giao dịch thực tế được giữ nguyên trong lịch sử booking, không bị ghi đè.</p>
    </section>
    <div class="grid-2" style="margin-top:16px">
      <section class="card">
        <div class="card-head"><h2>Giá báo và giá chốt qua các booking</h2></div>
        <div class="card-pad stack">${done.length ? [...done].reverse().map((b) => `
          <div class="deal-row"><div><strong>${esc(b.brand)}</strong><span class="dt-sub">${fmtDate(b.date)} · ${esc(b.sow)}</span></div>
            <div class="deal-bars">
              <div class="row"><div class="bar" style="flex:1"><i style="width:${(b.quoted / max) * 100}%;background:var(--border-strong)"></i></div><span class="num faint">Báo ${money(b.quoted)}</span></div>
              <div class="row"><div class="bar" style="flex:1"><i style="width:${(b.closed / max) * 100}%"></i></div><span class="num"><strong>Chốt ${money(b.closed)}</strong></span></div>
            </div></div>`).join("") : `<p class="faint">Chưa có booking nào để so sánh.</p>`}</div>
      </section>
      <section class="card">
        <div class="card-head"><h2>${c.terms ? "Điều kiện hợp tác" : "Báo giá trên Google Sheet"}</h2></div>
        ${c.terms ? `<dl class="dl card-pad"><dt>Usage rights</dt><dd>${esc(c.terms.usage)}</dd><dt>Exclusivity</dt><dd>${esc(c.terms.excl)}</dd><dt>Điều kiện booking</dt><dd>${esc(c.terms.cond)}</dd><dt>Thương lượng</dt><dd>${esc(c.rel.nego)}</dd></dl>`
          : `<dl class="dl card-pad">${c.rates.map((r) => `<dt>${esc(r.sow)}</dt><dd style="white-space:pre-line">${esc(r.text || "—")}</dd>`).join("") || "<dt>Chưa có</dt><dd>Sheet chưa ghi giá cho creator này.</dd>"}</dl>`}
      </section>
    </div>`;
}

/* =============== TAB: Quan hệ (CRM) =============== */
function tabCrm(c, bks) {
  const last = bks[0];
  const year = bks.filter((b) => (new Date("2026-11-19") - new Date(b.date)) / 864e5 <= 365).length;
  const k = c.rel.contact;
  return `<div class="profile-grid">
    <section data-tile="notes" class="card">
      <div class="card-head"><h2>Ghi chú & tương tác</h2><button class="btn btn-sm btn-ai" type="button" data-act="zalo">${icon("sparkles", 14)} Soạn tin Zalo</button></div>
      <div class="card-pad stack">
        ${can("edit") ? `<form id="note-form" class="stack">
          <label class="sr-only" for="note-text">Ghi chú mới</label>
          <textarea class="textarea" id="note-text" name="text" placeholder="Ghi lại điều team cần nhớ: cách làm việc, lưu ý, kết quả thương lượng…" style="min-height:72px"></textarea>
          <div class="row"><label class="sr-only" for="note-kind">Loại ghi chú</label><select class="select" id="note-kind" name="kind" style="width:auto"><option value="">Ghi chú thường</option><option value="good">Điểm tốt</option><option value="risk">Rủi ro / lưu ý</option></select><span class="spacer"></span><button class="btn btn-primary" type="submit">Lưu ghi chú</button></div>
        </form><hr class="divider" />` : ""}
        ${c.notes.length ? `<ul class="timeline">${c.notes.map((n) => `<li class="${n.kind ? "t-" + n.kind : ""}"><div class="row-wrap"><strong>${esc(n.by)}</strong><span class="faint">${relTime(n.at)} · ${fmtDate(n.at)}</span>${n.kind === "risk" ? `<span class="badge badge-danger">Rủi ro</span>` : n.kind === "good" ? `<span class="badge badge-success">Điểm tốt</span>` : ""}</div><p>${note(n.text)}</p></li>`).join("")}</ul>` : `<p class="faint">Chưa có ghi chú. Ghi chú đầu tiên giúp kiến thức không mất khi đổi nhân sự.</p>`}
      </div>
    </section>
    <div class="stack">
      <section data-tile="status" class="card">
        <div class="card-head"><h2>Trạng thái quan hệ</h2>${can("edit") ? `<button class="btn btn-sm" type="button" data-act="status">Đổi trạng thái</button>` : ""}</div>
        <div class="card-pad stack">
          <div class="row-wrap">${relBadge(c.rel.status)}<span class="muted">${esc(REL_STATUS[c.rel.status].desc)}</span></div>
          <dl class="dl">
            <dt>Người phụ trách</dt><dd>${esc(c.rel.owner)}</dd>
            <dt>Working score</dt><dd>${stars(c.rel.score)}</dd>
            <dt>Tần suất hợp tác</dt><dd>${year} booking / 12 tháng${last ? ` · gần nhất ${fmtDate(last.date)}` : ""}</dd>
            <dt>Khả năng phản hồi</dt><dd>${esc(c.rel.resp)}</dd>
            <dt>Thương lượng</dt><dd>${can("price") ? esc(c.rel.nego) : redacted()}</dd>
          </dl>
        </div>
      </section>
      <section data-tile="contact" class="card">
        <div class="card-head"><h2>Liên hệ</h2><span class="badge ${c.rel.via === "direct" ? "badge-success" : "badge-info"}">${esc(VIA[c.rel.via])}</span></div>
        <dl class="dl card-pad">
          ${c.rel.via !== "direct" ? `<dt>${c.rel.via === "mcn" ? "MCN" : "Manager"}</dt><dd>${c.rel.mcn ? esc(c.rel.mcn) + " · " : ""}${contact(c.rel.manager || "")}</dd>` : ""}
          <dt>Người liên hệ</dt><dd>${contact(k.person)}</dd>
          <dt>Kênh ưu tiên</dt><dd><span class="row" style="gap:6px">${channelIcon(c.rel.channel)} ${esc(c.rel.channel)}</span></dd>
          <dt>Zalo / SĐT</dt><dd>${contact(k.phone)}</dd>
          <dt>Email</dt><dd>${contact(k.email)}</dd>
        </dl>
        ${can("contact") ? "" : `<p class="faint card-pad" style="padding-top:0">Vai trò Viewer không xem được thông tin liên hệ.</p>`}
      </section>
    </div>
  </div>`;
}

/* =============== TAB: Lịch sử hợp tác =============== */
function tabHistory(c, bks) {
  if (!bks.length) return emptyState("list", "Chưa có booking nào qua Markus", `Brand ghi nhận từ nguồn ngoài: ${esc(c.brands.join(", ") || "chưa có")}.<br />Khi booking được xác nhận ở Shortlist, lịch sử sẽ tự xuất hiện ở đây.`);
  const done = bks.filter((b) => b.evaluation);
  const avgViews = done.length ? done.reduce((s, b) => s + b.perf.views, 0) / done.length : null;
  const stage = (id) => BOOKING_STAGES.find((s) => s.id === id);
  return `<div class="kpi-row">
      <div class="kpi"><div class="kpi-label">Booking qua Markus</div><div class="kpi-value">${bks.length}</div><div class="kpi-sub">${new Set(bks.map((b) => b.brand)).size} brand</div></div>
      <div class="kpi"><div class="kpi-label">View trung bình / bài</div><div class="kpi-value">${avgViews ? fmtNum(avgViews) : "—"}</div><div class="kpi-sub">branded content</div></div>
      <div class="kpi"><div class="kpi-label">Working score TB</div><div class="kpi-value">${stars(c.rel.score)}</div><div class="kpi-sub">${done.length} lần đánh giá</div></div>
      <div class="kpi"><div class="kpi-label">Tổng chi phí thực tế</div><div class="kpi-value">${money(bks.reduce((s, b) => s + b.closed, 0))}</div><div class="kpi-sub">giá chốt</div></div>
    </div>
    <div class="dt-wrap" style="margin-top:16px"><table class="dt">
      <thead><tr><th>Brand · Chiến dịch</th><th>Nền tảng · SOW</th><th>Thời điểm</th><th class="t-right">Giá báo → chốt</th><th>Hiệu quả thực tế</th><th>Đánh giá làm việc</th><th>Trạng thái</th></tr></thead>
      ${bks.map((b) => `<tbody><tr>
        <td class="t-main"><strong>${esc(b.brand)}</strong><span class="dt-sub">${esc(b.campaign)} · ${esc(b.id)}</span></td>
        <td data-label="Nền tảng · SOW"><span class="row">${plat(b.platform)} ${esc(b.sow)}</span></td>
        <td data-label="Thời điểm">${fmtDate(b.date)}</td>
        <td class="t-right" data-label="Giá báo → chốt">${can("price") ? `<span class="faint num">${money(b.quoted)}</span> → <strong>${money(b.closed)}</strong>` : money(0)}</td>
        <td data-label="Hiệu quả thực tế">${b.perf ? `<strong class="num">${fmtNum(b.perf.views)}</strong> view<span class="dt-sub">ER ${fmtPct(b.perf.er)}${can("price") ? ` · ~${Math.round(b.closed / b.perf.views)} ₫/view` : ""}</span>` : `<span class="faint">Chưa có số</span>`}</td>
        <td data-label="Đánh giá làm việc" class="t-full">${b.evaluation ? `${stars(b.evaluation.score)}<span class="dt-sub" style="white-space:normal">${note(b.evaluation.note)}</span>` : `<span class="faint">Chờ hoàn tất</span>`}</td>
        <td data-label="Trạng thái"><span class="badge ${b.status === "paid" ? "badge-success" : "badge-info"}">${stage(b.status).label}</span>${b.contentUrl ? `<a class="dt-sub" href="${esc(b.contentUrl)}" target="_blank" rel="noopener">Link bài đăng</a>` : ""}</td>
      </tr></tbody>`).join("")}
    </table></div>`;
}

/* =============== Hộp thoại =============== */
function openEditMetrics(c, p) {
  const ch = c.channels[p];
  const o = openOverlay({
    kind: "modal", title: `Sửa tay chỉ số ${PLATFORMS[p].label}`,
    body: `<div class="banner banner-warning" style="margin-bottom:12px">${icon("alert", 16)}<div>Giá trị sửa tay được ghi nguồn <strong style="display:inline">“Nhập tay”</strong> kèm tên bạn và thời điểm. Lần đồng bộ sau nếu lệch sẽ tạo <strong style="display:inline">xung đột</strong> để bạn chọn, không tự ghi đè.</div></div>
      <div class="stack">${["followers", "er", "avgViews"].map((m) => `<div class="field"><label for="em-${m}">${METRIC_LABEL[m]}${m === "er" ? " (%)" : ""}</label><input class="input" id="em-${m}" type="number" min="0" step="${m === "er" ? 0.1 : 1}" value="${ch[m].value}" data-m="${m}" data-old="${ch[m].value}" /></div>`).join("")}</div>`,
    footer: `<span class="spacer"></span><button class="btn" data-close type="button">Huỷ</button><button class="btn btn-primary" type="button" id="em-save">Lưu thay đổi</button>`,
  });
  $("#em-save", o.el).addEventListener("click", () => {
    const changed = [...o.el.querySelectorAll("[data-m]")].filter((i) => i.value !== "" && +i.value !== +i.dataset.old);
    o.close();
    if (!changed.length) return;
    changed.forEach((i) => editMetric(c.id, p, i.dataset.m, +i.value));
    toast("Đã cập nhật chỉ số", `${changed.length} chỉ số · nguồn: Nhập tay bởi ${me()}`);
  });
}

function openAddRate(c) {
  const o = openOverlay({
    kind: "modal", title: "Cập nhật Current Rate",
    body: `<div class="stack">
      <div class="field-row">
        <div class="field"><label for="ar-p">Nền tảng</label><select class="select" id="ar-p">${Object.keys(c.channels).map((p) => `<option value="${p}">${PLATFORMS[p].label}</option>`).join("")}</select></div>
        <div class="field"><label for="ar-s">SOW</label><select class="select" id="ar-s">${FORMATS.filter((f) => !/Review|Vlog/.test(f)).map((f) => `<option>${f}</option>`).join("")}</select></div>
      </div>
      <div class="field"><label for="ar-a">Giá mới (triệu ₫)</label><input class="input" id="ar-a" type="number" min="0" step="0.5" autofocus /></div>
      <p class="field-hint">Chỉ cập nhật khi có giá đáng tin cậy (creator / manager xác nhận). Không cần log mọi lần hỏi giá.</p></div>`,
    footer: `<span class="spacer"></span><button class="btn" data-close type="button">Huỷ</button><button class="btn btn-primary" type="button" id="ar-save">Lưu giá</button>`,
  });
  $("#ar-save", o.el).addEventListener("click", () => {
    const amount = +$("#ar-a", o.el).value * 1e6;
    if (!amount) return $("#ar-a", o.el).focus();
    o.close();
    addRate(c.id, { platform: $("#ar-p", o.el).value, sow: $("#ar-s", o.el).value, amount });
    toast("Đã cập nhật Current Rate", "Giá cũ vẫn nằm trong lịch sử booking.");
  });
}

function openStatus(c) {
  const o = openOverlay({
    kind: "modal", title: "Đổi trạng thái quan hệ",
    body: `<div class="stack">
      <div class="field"><span class="field-label" id="st-l">Trạng thái</span><div class="chip-set" role="group" aria-labelledby="st-l">${Object.entries(REL_STATUS).map(([k, v]) => `<button type="button" class="chip" data-st="${k}" aria-pressed="${k === c.rel.status}" title="${esc(v.desc)}">${esc(v.label)}</button>`).join("")}</div></div>
      <div class="field"><label for="st-r">Lý do (bắt buộc — sẽ lưu vào ghi chú)</label><textarea class="textarea" id="st-r" placeholder="Ví dụ: 3 booking liên tiếp đúng hạn, brand hài lòng"></textarea></div></div>`,
    footer: `<span class="spacer"></span><button class="btn" data-close type="button">Huỷ</button><button class="btn btn-primary" type="button" id="st-save">Lưu</button>`,
  });
  let status = c.rel.status;
  delegate(o.el, "click", "[data-st]", (e, b) => { status = b.dataset.st; o.el.querySelectorAll("[data-st]").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); });
  $("#st-save", o.el).addEventListener("click", () => {
    const reason = $("#st-r", o.el).value.trim();
    if (!reason) return $("#st-r", o.el).focus();
    o.close();
    setRelStatus(c.id, status, reason);
    toast("Đã đổi trạng thái", REL_STATUS[status].label);
  });
}

/* =============== Hành động AI (kết quả hiện trong Copilot để xem lại) =============== */
function aiSummary(c) {
  const s = summarize(c, bookingsOf(c.id), state.creators, { allowPrice: can("price") });
  post(`<strong>Tóm tắt ${esc(c.name)}</strong><ul>${s.bullets.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>${s.risks.length ? `<p><strong>Lưu ý:</strong></p><ul>${s.risks.map((b) => `<li>${note(b)}</li>`).join("")}</ul>` : ""}<p><strong>Nhận định:</strong> ${esc(s.verdict.text)}</p>`);
}
function aiCompare(c) {
  const sims = lookalike(c, state.creators, 3);
  const line = (x, label) => `<li><a href="#/creator/${x.id}">${esc(x.name)}</a>${label ? ` <span class="faint">(${label})</span>` : ""}: ${fmtNum(heroCh(x).followers.value)} · ER ${fmtPct(heroCh(x).er.value)}${can("price") && rateFor(x) ? ` · ${esc(String(Math.round(rateFor(x).amount / 1e6)))}tr` : ""} · score ${x.rel.score ? dec(x.rel.score) : "chưa có"}</li>`;
  post(`<strong>So sánh ${esc(c.name)} với creator tương tự</strong><ul>${line(c, "đang xem")}${sims.map((x) => line(x.c, x.similarity + "% giống")).join("")}</ul>`,
    sims.length ? [{ label: "Đưa tất cả vào shortlist để so sánh", primary: true, run: () => { [c, ...sims.map((x) => x.c)].forEach((x) => toggleShortlist(x.id, true)); location.hash = campaignHash("ung-vien", "&view=compare"); } }] : []);
}
export function copilot(params) {
  const c = getCreator(params.id);
  if (!c) return { label: "Hồ sơ creator", actions: [] };
  return {
    label: `Hồ sơ: ${c.name}`,
    actions: [
      { label: "Tóm tắt creator này", match: /tom tat|danh gia/, run: () => aiSummary(c) },
      { label: "So sánh với creator tương tự", match: /so sanh|tuong tu|giong/, run: () => aiCompare(c) },
      { label: "Soạn tin Zalo", match: /zalo|tin nhan|soan|lien he/, run: () => postZaloDraft(c) },
    ],
  };
}
