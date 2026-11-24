// views/reports.js — BÁO CÁO.
//   renderCampaign(el, l): tab "4 · Báo cáo" của một campaign — KPI view vs đã giao, phễu các bước, view theo ngày,
//                          bảng từng creator; chi phí / CPV chỉ hiện với vai trò xem được giá (server cũng không gửi).
//   render(el): màn #/bao-cao — mọi campaign người dùng thấy; Quản lý / Admin có thêm bảng theo người phụ trách.
// Xuất CSV (mở được bằng Excel / Google Sheet) và In / lưu PDF bằng trình duyệt.

import { esc, icon, delegate, toast, fmtNum, fmtPct, fmtVnd, fmtDate, downloadFile } from "../core/ui.js";
import { can } from "../core/store.js";
import { api, CAMPAIGN_STATUS } from "../data/live.js";
import { pageHead, emptyState } from "../core/parts.js";
import { refresh } from "../core/router.js";

const cache = new Map();
const money = (v) => (v == null || v === 0 ? "—" : fmtVnd(v, true));
const pctBar = (p) => (p == null ? "" : `<span class="bar ${p >= 100 ? "bar-success" : p >= 60 ? "" : "bar-warning"}"><i style="width:${Math.min(100, p)}%"></i></span>`);
const csvCell = (v) => { const s = v == null ? "" : String(v); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const toCsv = (rows) => "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\n");
const statusBadge = (s) => `<span class="badge badge-${(CAMPAIGN_STATUS[s] || CAMPAIGN_STATUS.draft).tone}">${esc((CAMPAIGN_STATUS[s] || CAMPAIGN_STATUS.draft).label)}</span>`;
const slug = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();

// Mỗi lần vẽ đều chờ CÙNG một request (nếu đang tải) rồi vẽ lại màn hiện tại — không phụ thuộc phần tử cũ còn trên trang.
const pending = new Map();
async function get(key, path, el) {
  if (cache.has(key)) return cache.get(key);
  el.innerHTML = `<div class="card empty"><strong>Đang tổng hợp báo cáo…</strong></div>`;
  if (!pending.has(key)) {
    pending.set(key, api(path).then((r) => {
      cache.set(key, r);
      setTimeout(() => cache.delete(key), 60_000); // số liệu mới sau 1 phút hoặc khi bấm "Làm mới"
      return r;
    }).finally(() => pending.delete(key)));
    try { await pending.get(key); refresh(); }
    catch (e) { el.innerHTML = emptyState("search", "Chưa tải được báo cáo", "Lỗi " + esc(e.message)); }
  }
  return null;
}

function kpis(items) {
  return `<div class="report-kpis">${items.filter(Boolean).map(([label, value, sub = "", bar = ""]) => `<div class="card card-pad report-kpi"><span class="faint">${label}</span><strong class="num">${value}</strong>${bar}<span class="dt-sub">${sub}</span></div>`).join("")}</div>`;
}
function bars(daily) {
  if (!daily.length) return `<p class="faint">Chưa có bài đăng có ngày đăng.</p>`;
  const max = Math.max(...daily.map((d) => d.views), 1);
  return `<div class="report-bars" role="img" aria-label="View theo ngày đăng">${daily.map((d) => `<div class="rb" title="${fmtDate(d.day)}: ${fmtNum(d.views)} view"><i style="height:${Math.max(3, Math.round((d.views / max) * 100))}%"></i><span>${d.day.slice(8, 10)}/${d.day.slice(5, 7)}</span></div>`).join("")}</div>`;
}

/* ---------- Tab báo cáo của 1 campaign ---------- */
export async function renderCampaign(el, l) {
  const key = "c:" + l.id;
  const r = cache.get(key) || (await get(key, `/campaigns/${encodeURIComponent(l.id)}/report`, el));
  if (!r) return;
  const c = r.campaign, price = r.price;
  const maxFunnel = Math.max(...r.funnel.map((f) => f.count), 1);
  el.innerHTML = `
    <div class="row-wrap report-actions">
      <span class="faint">Số liệu từ bài đăng ở tab Theo dõi (không tính bài đã loại). ${c.status === "done" ? "Campaign đã hoàn thành." : ""}</span><span class="spacer"></span>
      <button class="btn btn-ghost" type="button" data-act="rp-refresh">${icon("sync", 16)} Làm mới</button>
      <button class="btn" type="button" data-act="rp-csv" data-tour="report-csv">${icon("download", 16)} Xuất CSV</button>
      <button class="btn" type="button" data-act="rp-print">${icon("doc", 16)} In / PDF</button>
    </div>
    ${kpis([
      ["View đã giao", fmtNum(c.views), c.kpiViews ? `${c.kpiPct ?? 0}% KPI ${fmtNum(c.kpiViews)}` : "Chưa đặt KPI", pctBar(c.kpiPct)],
      ["View dự kiến (đã chốt)", fmtNum(c.expectedViews), "Tổng view trung bình của creator đã chốt"],
      ["Creator chốt / đang liên hệ", `${c.booked} / ${c.creators}`, `${c.posts} bài đăng`],
      ["Engagement rate", c.er == null ? "—" : fmtPct(c.er), `${fmtNum(c.interactions)} tương tác`],
      price && ["Chi phí", c.cost ? fmtVnd(c.cost) : "—", c.budget ? `${c.budgetPct ?? 0}% ngân sách ${fmtVnd(c.budget, true)}` : "Chưa đặt ngân sách", pctBar(c.budgetPct)],
      price && ["CPV / CPM", c.cpv == null ? "—" : `${fmtNum(Math.round(c.cpv))} ₫`, c.cpm == null ? "Cần chi phí và view" : `CPM ${fmtVnd(c.cpm, true)}`],
    ])}
    <div class="report-grid">
      <section class="card card-pad"><h3>Phễu liên hệ</h3>
        <div class="report-funnel">${r.funnel.map((f) => `<div class="rf"><span>${esc(f.label)}${f.final ? " ✓" : ""}</span><span class="rf-bar"><i style="width:${Math.round((f.count / maxFunnel) * 100)}%"></i></span><strong class="num">${f.count}</strong></div>`).join("")}</div></section>
      <section class="card card-pad"><h3>View theo ngày đăng</h3>${bars(r.daily)}</section>
    </div>
    <section class="card"><div class="card-head"><h3>Từng creator</h3></div>
      ${r.rows.length ? `<div class="dt-wrap"><table class="dt"><thead><tr><th>Creator</th><th>Bước</th><th class="t-right">View dự kiến</th><th class="t-right">Bài</th><th class="t-right">View đã giao</th><th class="t-right">ER</th>${price ? `<th class="t-right">Chi phí</th><th class="t-right">CPV</th>` : ""}</tr></thead><tbody>
        ${r.rows.map((x) => `<tr><td><a href="#/creator/${x.creatorId}">${esc(x.name)}</a></td><td>${esc(x.stageLabel)}${x.booked ? ` <span class="badge badge-success">Chốt</span>` : ""}</td>
          <td class="t-right num">${fmtNum(x.expectedViews)}</td><td class="t-right num">${x.posts}</td><td class="t-right num"><strong>${fmtNum(x.views)}</strong>${x.expectedViews && x.views ? `<span class="dt-sub">${Math.round((x.views / x.expectedViews) * 100)}% dự kiến</span>` : ""}</td>
          <td class="t-right num">${x.er == null ? "—" : fmtPct(x.er)}</td>${price ? `<td class="t-right num">${money(x.cost)}</td><td class="t-right num">${x.cpv == null ? "—" : fmtNum(Math.round(x.cpv)) + " ₫"}</td>` : ""}</tr>`).join("")}
      </tbody></table></div>` : `<p class="card-pad faint">Chưa có creator ở bước Liên hệ.</p>`}
    </section>`;
  delegate(el, "click", "[data-act=rp-refresh]", () => { cache.delete(key); refresh(); });
  delegate(el, "click", "[data-act=rp-print]", () => window.print());
  delegate(el, "click", "[data-act=rp-csv]", () => {
    const head = ["Creator", "Nền tảng", "Bước", "Đã chốt", "View dự kiến", "Số bài", "View đã giao", "Tương tác", "ER (%)", ...(price ? ["Chi phí (VND)", "CPV (VND)"] : [])];
    const rows = r.rows.map((x) => [x.name, x.platform || "", x.stageLabel, x.booked ? "Có" : "", x.expectedViews ?? "", x.posts, x.views, x.interactions, x.er ?? "", ...(price ? [x.cost ?? "", x.cpv == null ? "" : Math.round(x.cpv)] : [])]);
    const total = ["TỔNG", "", "", c.booked, c.expectedViews, c.posts, c.views, c.interactions, c.er ?? "", ...(price ? [c.cost ?? "", c.cpv == null ? "" : Math.round(c.cpv)] : [])];
    downloadFile(`bao-cao-${slug(c.name)}.csv`, toCsv([head, ...rows, total]));
    toast("Đã xuất CSV", `${rows.length} creator`);
  });
}

/* ---------- Màn #/bao-cao ---------- */
let statusF = "";
export async function render(el) {
  const r = cache.get("overview") || (await get("overview", "/reports", el));
  if (!r) return;
  const t = r.totals, price = r.price;
  const rows = r.campaigns.filter((c) => !statusF || c.status === statusF).sort((a, b) => ({ running: 0, done: 1, draft: 2 })[a.status] - ({ running: 0, done: 1, draft: 2 })[b.status] || b.views - a.views);
  el.innerHTML = `<div class="page">
    ${pageHead("Báo cáo", r.scope === "team" ? "Toàn bộ campaign của team. Số view lấy từ bài đăng ở tab Theo dõi của từng campaign." : "Các campaign bạn phụ trách hoặc được mời. Số view lấy từ bài đăng ở tab Theo dõi.",
      `<button class="btn btn-ghost" type="button" data-act="ov-refresh">${icon("sync", 16)} Làm mới</button><button class="btn" type="button" data-act="ov-csv">${icon("download", 16)} Xuất CSV</button><button class="btn" type="button" data-act="rp-print">${icon("doc", 16)} In / PDF</button>`)}
    ${kpis([
      ["Campaign", fmtNum(t.campaigns), `${t.byStatus.running} đang chạy · ${t.byStatus.done} hoàn thành · ${t.byStatus.draft} nháp`],
      ["Creator đã chốt", fmtNum(t.booked), `trên ${fmtNum(t.creators)} creator đang liên hệ`],
      ["View đã giao", fmtNum(t.views), `${fmtNum(t.posts)} bài đăng`],
      price && ["Chi phí", t.cost ? fmtVnd(t.cost) : "—", t.budget ? `Ngân sách ${fmtVnd(t.budget, true)}` : "Chưa đặt ngân sách"],
    ])}
    <div class="segmented" role="group" aria-label="Lọc theo trạng thái">
      <button type="button" data-rs="" aria-pressed="${!statusF}">Tất cả</button>${Object.entries(CAMPAIGN_STATUS).map(([k, s]) => `<button type="button" data-rs="${k}" aria-pressed="${statusF === k}">${esc(s.label)}</button>`).join("")}
    </div>
    <section class="card"><div class="card-head"><h3>Campaign</h3></div>
      ${rows.length ? `<div class="dt-wrap"><table class="dt"><thead><tr><th>Campaign</th><th>Trạng thái</th><th class="t-right">Chốt / liên hệ</th><th class="t-right">Bài</th><th class="t-right">View đã giao</th><th>KPI</th>${price ? `<th class="t-right">Chi phí</th><th class="t-right">CPV</th>` : ""}</tr></thead><tbody>
        ${rows.map((c) => `<tr><td><a href="#/campaign/${c.id}?tab=bao-cao">${esc(c.name)}</a><span class="dt-sub">${c.brand ? esc(c.brand) : ""}</span></td><td>${statusBadge(c.status)}</td>
          <td class="t-right num">${c.booked} / ${c.creators}</td><td class="t-right num">${c.posts}</td><td class="t-right num"><strong>${fmtNum(c.views)}</strong></td>
          <td class="report-kpicell">${c.kpiViews ? `${pctBar(c.kpiPct)}<span class="dt-sub">${c.kpiPct ?? 0}% / ${fmtNum(c.kpiViews)}</span>` : `<span class="faint">—</span>`}</td>
          ${price ? `<td class="t-right num">${money(c.cost)}</td><td class="t-right num">${c.cpv == null ? "—" : fmtNum(Math.round(c.cpv)) + " ₫"}</td>` : ""}</tr>`).join("")}
      </tbody></table></div>` : `<p class="card-pad faint">Không có campaign.</p>`}
    </section>
    <div class="report-grid">
      ${r.team ? `<section class="card"><div class="card-head"><h3>Theo người phụ trách</h3></div><div class="dt-wrap"><table class="dt"><thead><tr><th>Người phụ trách</th><th class="t-right">Campaign</th><th class="t-right">Đang chạy</th><th class="t-right">Hoàn thành</th><th class="t-right">Creator chốt</th><th class="t-right">View đã giao</th>${price ? `<th class="t-right">Chi phí</th>` : ""}</tr></thead><tbody>
        ${r.team.map((x) => `<tr><td>${esc(x.owner)}</td><td class="t-right num">${x.campaigns}</td><td class="t-right num">${x.running}</td><td class="t-right num">${x.done}</td><td class="t-right num">${x.booked}</td><td class="t-right num">${fmtNum(x.views)}</td>${price ? `<td class="t-right num">${money(x.cost)}</td>` : ""}</tr>`).join("")}
      </tbody></table></div></section>` : ""}
      <section class="card"><div class="card-head"><h3>Creator mang nhiều view nhất</h3></div>
        ${r.topCreators.length ? `<ol class="report-top">${r.topCreators.map((x) => `<li><a href="#/creator/${x.creatorId}">${esc(x.name)}</a><span class="num">${fmtNum(x.views)}</span><span class="dt-sub">${x.posts} bài · ${x.campaigns} campaign</span></li>`).join("")}</ol>` : `<p class="card-pad faint">Chưa có bài đăng nào được ghi nhận.</p>`}
      </section>
    </div>
  </div>`;
  delegate(el, "click", "[data-rs]", (e, b) => { statusF = b.dataset.rs; refresh(); });
  delegate(el, "click", "[data-act=ov-refresh]", () => { cache.delete("overview"); refresh(); });
  delegate(el, "click", "[data-act=rp-print]", () => window.print());
  delegate(el, "click", "[data-act=ov-csv]", () => {
    const head = ["Campaign", "Brand", "Trạng thái", "Creator chốt", "Creator liên hệ", "Số bài", "View đã giao", "KPI view", "% KPI", ...(price ? ["Ngân sách (VND)", "Chi phí (VND)", "CPV (VND)"] : [])];
    const body = r.campaigns.map((c) => [c.name, c.brand || "", (CAMPAIGN_STATUS[c.status] || {}).label || c.status, c.booked, c.creators, c.posts, c.views, c.kpiViews ?? "", c.kpiPct ?? "", ...(price ? [c.budget ?? "", c.cost ?? "", c.cpv == null ? "" : Math.round(c.cpv)] : [])]);
    downloadFile(`bao-cao-campaign-${new Date().toISOString().slice(0, 10)}.csv`, toCsv([head, ...body]));
    toast("Đã xuất CSV", `${body.length} campaign`);
  });
}
export const copilot = () => ({ label: "Báo cáo", actions: [] });
export const invalidate = (listId) => { cache.delete("overview"); if (listId) cache.delete("c:" + listId); };
