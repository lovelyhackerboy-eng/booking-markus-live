// core/parts.js — mảnh HTML dùng lại giữa các màn (trả về chuỗi). CSS tương ứng nằm ở components.css.
// QUAN TRỌNG: money(), contact(), note() là NƠI DUY NHẤT quyết định hiện hay ẩn giá / liên hệ theo vai trò.
// Viewer → giá trị KHÔNG được đưa vào DOM (không phải làm mờ bằng CSS).

import { PLATFORMS, COMPANIES } from "../data/catalog.js";
import { REL_STATUS, rateFor, channelOrder, totalFollowers } from "./filters.js";
import { can, pendingOf } from "./store.js";
import { esc, icon, fmtNum, fmtVnd, fmtPct, relTime, ageDays } from "./ui.js";
import { platformIcon } from "./platform-icons.js";
import { avatarArt, thumbArt, emptyArt } from "./art.js";

export { ring, gauge, emptyArt, coverArt } from "./art.js";
export const STALE_DAYS = 14; // quá số ngày này coi là "cũ"
let uid = 0;

/* ---------- Phân quyền hiển thị ---------- */
export const redacted = (what = "Ẩn theo quyền") => `<span class="redacted" title="Vai trò hiện tại không được xem thông tin này">${icon("lock", 12)} ${esc(what)}</span>`;
/** Tiền: Viewer nhận nhãn "Ẩn theo quyền" thay cho con số. */
export const money = (amount, full = false) => (can("price") ? `<span class="num">${esc(fmtVnd(amount, full))}</span>` : redacted());
/** Liên hệ (SĐT, email, Zalo, tên manager). */
export const contact = (text) => (can("contact") ? esc(text) : redacted());
/**
 * Văn bản tự do (ghi chú CRM, nhận xét booking, cảnh báo AI) có thể chứa giá hoặc liên hệ do người dùng gõ vào.
 * note() che số tiền khi không có quyền "price", che SĐT / email khi không có quyền "contact", rồi escape.
 * PORT: phía server cũng phải lọc tương tự trước khi trả ghi chú cho Viewer.
 */
const MONEY_RE = /\d+(?:[.,]\d+)*\s?(?:tr(?:iệu)?|tỷ|₫|vnđ|vnd|đồng)(?![\p{L}\d])/giu;
const PHONE_RE = /(?:\+84|0)\d{2,3}[ .]?\d{3}[ .]?\d{3,4}/g;
const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.]+/g;
export function note(text) {
  let s = String(text ?? "");
  if (!can("price")) s = s.replace(MONEY_RE, "[giá đã ẩn]");
  if (!can("contact")) s = s.replace(PHONE_RE, "[liên hệ đã ẩn]").replace(EMAIL_RE, "[liên hệ đã ẩn]");
  return esc(s);
}

/* ---------- Avatar ----------
   Có photoUrl → <img> (ảnh thật) đặt trên minh hoạ SVG; ảnh lỗi / mất mạng → onerror gỡ <img>, lộ ra SVG bên dưới.
   Vòng ngoài là gradient theo tier (.t-<tier> đặt --ring-a / --ring-b).
   Ảnh mock là ảnh người thật gắn với dữ liệu GIẢ → creator đang có tín hiệu tiêu cực (Watchlist, DNR, điểm thấp,
   ghi chú rủi ro) KHÔNG hiện ảnh, chỉ dùng minh hoạ. Tính lại mỗi lần vẽ nên đổi trạng thái là ảnh ẩn ngay.
   PORT: app thật dùng ảnh đại diện lấy từ kênh của creator lúc đồng bộ, đã tải về và cache ở server (bỏ điều kiện này). */
export const hasNegativeSignal = (c) => c.rel.status === "watchlist" || c.rel.status === "dnr" || (c.rel.score != null && c.rel.score < 3.5) || c.notes.some((n) => n.kind === "risk");
export function avatar(c, size = "") {
  const photo = c.photoUrl && !hasNegativeSignal(c)
    ? `<img class="avatar-photo" src="${esc(c.photoUrl)}" alt="${esc(c.name)}" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.remove()" />` : "";
  return `<span class="avatar ${size ? "avatar-" + size : ""} t-${c.tier.toLowerCase()}">${avatarArt(c)}${photo}</span>`;
}

/* ---------- Nền tảng ---------- */
/** Icon nền tảng bản màu chính thức. */
export const plat = (p, size = 22) => platformIcon(p, { size, variant: "color" });
/** Bản một màu trong ô tròn tối — dùng trên nền gradient (thumbnail, cover). */
export const platChip = (p) => `<span class="pi-chip">${platformIcon(p, { size: 14, variant: "mono" })}</span>`;
/** Kênh liên hệ ưu tiên: Zalo / Email / Điện thoại. */
export const channelIcon = (channel) => (/zalo/i.test(channel) ? platformIcon("zalo", { size: 18 }) : icon(/mail/i.test(channel) ? "mail" : "phone", 16));

export const tierBadge = (tier) => `<span class="badge tier tier-${tier.toLowerCase()}">${esc(tier)}</span>`;
export const relBadge = (status) => `<span class="badge badge-${REL_STATUS[status].tone || "outline"}" title="${esc(REL_STATUS[status].desc)}">${esc(REL_STATUS[status].label)}</span>`;
export const stars = (score) => (score ? `<span class="stars" role="img" aria-label="Working score ${String(score).replace(".", ",")} trên 5">${icon("star", { size: 14, variant: "fill" })}<span class="num">${String(score).replace(".", ",")}</span></span>` : `<span class="faint">Chưa có</span>`);

export function creatorCell(c, sub) {
  return `<div class="dt-main">${avatar(c)}<div>
    <a href="#/creator/${c.id}">${esc(c.name)}</a>${c.alias ? ` <span class="faint">· ${esc(c.alias)}</span>` : ""}
    <span class="dt-sub">${esc(sub ?? `${c.handle} · ${c.type} · ${c.region}`)}</span>
  </div></div>`;
}

export function brandChips(c, max = 3, flagBrands = []) {
  const shown = c.brands.slice(0, max);
  const more = c.brands.length - shown.length;
  return `<span class="row-wrap" style="gap:4px">${shown.map((b) => `<span class="badge ${flagBrands.includes(b) ? "badge-danger" : ""}">${esc(b)}</span>`).join("")}${more > 0 ? `<span class="faint" title="${esc(c.brands.slice(max).join(", "))}">+${more}</span>` : ""}</span>`;
}

/* ---------- Avatar brand chồng nhau ("Brand đã hợp tác") ---------- */
const hashOf = (s) => [...s].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
const brandInitials = (b) => { const w = b.replace(/[^\p{L}\d ]/gu, " ").trim().split(/\s+/); return (w.length > 1 ? w[0][0] + w[1][0] : b.slice(0, 2)).toUpperCase(); };
export function brandStack(c, max = 4, flagBrands = []) {
  if (!c.brands.length) return `<span class="faint">Chưa ghi nhận</span>`;
  const shown = c.brands.slice(0, max), more = c.brands.length - shown.length;
  return `<span class="brand-stack" role="img" aria-label="Brand đã hợp tác: ${esc(c.brands.join(", "))}">${shown.map((b) => `<span class="brand-av brand-c${(hashOf(b) % 6) + 1} ${flagBrands.includes(b) ? "is-flag" : ""}" title="${esc(b)}${flagBrands.includes(b) ? " — đối thủ của brand đang xét" : ""}">${esc(brandInitials(b))}</span>`).join("")}${more > 0 ? `<span class="brand-more" title="${esc(c.brands.slice(max).join(", "))}">+${more}</span>` : ""}</span>`;
}

/* ---------- Dải thumbnail nội dung gần đây ----------
   Prototype vẽ bằng SVG sinh theo seed (core/art.js). App thật: <img loading="lazy"> từ thumbnail crawler lấy về, SVG làm dự phòng. */
export function thumbs(c) {
  if (!c.content || !c.content.length) return "";
  return `<div class="thumbs" aria-label="Nội dung gần đây của ${esc(c.name)}">${c.content.map((x) => `
    <a class="thumb" href="#/creator/${c.id}?tab=kenh" title="${esc(x.title)}${x.brand ? " · Branded: " + esc(x.brand) : ""} · ${fmtNum(x.views)} view · ${x.days} ngày trước">
      ${thumbArt(x, c)}
      ${x.brand ? `<span class="thumb-tag">Branded · ${esc(x.brand)}</span>` : ""}${platChip(x.platform)}
      <span class="thumb-meta"><strong class="num">${fmtNum(x.views)} view</strong><span>${esc(x.title)} · ${x.days} ngày trước</span></span>
    </a>`).join("")}</div>`;
}

/* ---------- Nguồn dữ liệu & trạng thái xác minh ---------- */
export const SOURCES = { api: "API nền tảng", crawler: "Crawler", ai: "AI đọc", manual: "Nhập tay", creator: "Creator gửi" };
export const VERIFY = { verified: "Đã xác minh", pending: "Chờ duyệt", unverified: "Chưa xác minh", conflict: "Xung đột" };
const VERIFY_ICON = { verified: "check", pending: "clock", unverified: "clock", conflict: "alert" };
export const srcBadge = (source) => `<span class="src src-${source}" title="Nguồn dữ liệu">${SOURCES[source] || source}</span>`;
export const verifyBadge = (v) => `<span class="verify verify-${v}">${icon(VERIFY_ICON[v], 12)} ${VERIFY[v]}</span>`;
export const METRIC_FMT = { followers: fmtNum, avgViews: fmtNum, er: fmtPct };
export const METRIC_LABEL = { followers: "Follower", er: "Engagement rate", avgViews: "View trung bình" };

/**
 * metric-with-source: giá trị + [nguồn] + "cập nhật 3 ngày trước" + trạng thái xác minh.
 * m = { value, source, updatedAt, verify } · extra = HTML phụ (nút hành động…)
 */
export function metric(label, m, fmt = fmtNum, extra = "") {
  const stale = ageDays(m.updatedAt) > STALE_DAYS;
  return `<div class="metric ${m.verify === "pending" ? "is-pending" : ""} ${m.verify === "conflict" ? "is-conflict" : ""} ${stale ? "is-stale" : ""}">
    <span class="metric-label">${esc(label)}</span>
    <span class="metric-value num">${esc(fmt(m.value))}${extra}</span>
    <span class="metric-meta">${srcBadge(m.source)}<time datetime="${m.updatedAt}" title="${new Date(m.updatedAt).toLocaleString("vi-VN")}">cập nhật ${relTime(m.updatedAt)}</time></span>
    <span class="metric-meta">${verifyBadge(m.verify)}</span>
  </div>`;
}

/** Sparkline dạng vùng có gradient (tăng trưởng follower). */
export function sparkline(values, w = 96, h = 28) {
  if (!values || values.length < 2) return "";
  const min = Math.min(...values), max = Math.max(...values), span = max - min || 1, id = "sp" + ++uid;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, h - 4 - ((v - min) / span) * (h - 8)]);
  // đường cong mượt (Catmull-Rom → Bézier)
  const line = pts.map((p, i) => { if (!i) return `M${p[0].toFixed(1)} ${p[1].toFixed(1)}`; const a = pts[i - 1], mx = ((a[0] + p[0]) / 2).toFixed(1); return `C${mx} ${a[1].toFixed(1)} ${mx} ${p[1].toFixed(1)} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`; }).join(" ");
  const last = pts[pts.length - 1];
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="Xu hướng follower 8 tháng">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--chart-line)" stop-opacity=".42"/><stop offset="1" style="stop-color:var(--chart-line)" stop-opacity="0"/></linearGradient></defs>
    <path d="${line} L${w} ${h} L0 ${h} Z" fill="url(#${id})"/><path class="line" d="${line}"/><circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="3"/></svg>`;
}
export const trend = (pct) => (pct == null ? "" : `<span class="${pct >= 0 ? "trend-up" : "trend-down"} num" style="font-size:var(--fs-xs);font-weight:var(--fw-medium)">${pct >= 0 ? "▲" : "▼"} ${String(Math.abs(pct)).replace(".", ",")}%</span>`);

/** Dòng "độ mới dữ liệu" của 1 creator: dùng ở Directory, Profile header, màn Dữ liệu. */
export function freshness(c) {
  const d = ageDays(c.lastSynced);
  const pend = pendingOf(c.id);
  const tone = d > STALE_DAYS ? "warning" : "success";
  return `<span class="row" style="gap:6px"><span class="badge badge-${tone}">${icon("clock", 12)} ${relTime(c.lastSynced)}</span>${pend ? `<a class="badge badge-warning" href="#/du-lieu">${pend} chờ duyệt</a>` : ""}</span>`;
}

/** Hàng "Kênh" trên thẻ creator: logo màu + follower của MỌI kênh creator có, follower giảm dần; kênh chính có nhãn "Chính".
 *  Rê chuột / focus (Tab, chạm) vào một kênh → tooltip ER · view trung bình · độ mới. focus = nền tảng đang lọc (viền nhấn).
 *  Không chứa giá hay liên hệ → không phụ thuộc vai trò. */
export function channelRow(c, focus = "") {
  const order = channelOrder(c);
  const pills = order.map((p) => {
    const ch = c.channels[p], L = PLATFORMS[p].label, main = p === c.hero, fresh = relTime(ch.followers.updatedAt);
    // Bấm vào kênh → mở thẳng trang của creator trên nền tảng đó (tab mới), không phải vào hồ sơ trước.
    return `<a class="chan-pill ${main ? "is-main" : ""} ${p === focus ? "is-focus" : ""}" role="listitem" href="${esc(ch.url)}" target="_blank" rel="noopener noreferrer"
      aria-label="Mở ${L} của ${esc(c.name)} (tab mới): ${fmtNum(ch.followers.value)} follower${main ? ", kênh chính" : ""}. ER ${fmtPct(ch.er.value)}, view trung bình ${fmtNum(ch.avgViews.value)}, cập nhật ${fresh}">
      ${platformIcon(p, { size: 18, label: false })}<strong class="num">${fmtNum(ch.followers.value)}</strong>${main ? `<em>Chính</em>` : ""}${icon("external", 12)}
      <span class="chan-tip" role="tooltip" aria-hidden="true"><b>${L}${main ? " · kênh chính" : ""}</b><span>ER <b class="num">${fmtPct(ch.er.value)}</b></span><span>View TB <b class="num">${fmtNum(ch.avgViews.value)}</b></span><span>Cập nhật ${fresh}</span><span>Bấm để mở trang ${L}</span></span></a>`;
  }).join("");
  return `<div class="chan-row" role="list" aria-label="Kênh của ${esc(c.name)}">${pills}<span class="chan-total">${order.length > 1 ? `Tổng ~${fmtNum(totalFollowers(c))} follower trên ${order.length} kênh` : "Chỉ có 1 kênh"}</span></div>`;
}
/** Ô "Kênh" ở kiểu xem Bảng: kênh chính đứng đầu và in đậm, các kênh còn lại theo follower giảm dần. */
export function channelCells(c) {
  const order = [c.hero, ...channelOrder(c).filter((p) => p !== c.hero)];
  return `<span class="chan-list">${order.map((p) => { const ch = c.channels[p], main = p === c.hero;
    return `<a class="chan-item ${main ? "is-main" : ""}" href="${esc(ch.url)}" target="_blank" rel="noopener noreferrer" aria-label="Mở ${PLATFORMS[p].label} của ${esc(c.name)} (tab mới)" title="Mở ${PLATFORMS[p].label}${main ? " · kênh chính" : ""} · ER ${fmtPct(ch.er.value)} · view TB ${fmtNum(ch.avgViews.value)} · cập nhật ${relTime(ch.followers.updatedAt)}">${platformIcon(p, { size: main ? 18 : 14 })}<span class="num">${fmtNum(ch.followers.value)}</span></a>`; }).join("")}</span>`;
}
/** Nhãn đại diện: "Cá nhân" hoặc tên công ty quản lý (bấm → lọc Khám phá theo công ty đó). */
export function repBadge(c) {
  if (c.rep !== "company") return `<span class="badge badge-outline" title="Tự quản lý (Self-managed)">${icon("person", 12)} Cá nhân</span>`;
  const co = COMPANIES[c.companyId];
  if (!co) return `<span class="badge badge-outline" title="Representation trên Sheet">${icon("users", 12)} ${esc(c.representation || "Có công ty quản lý")}</span>`;
  return `<a class="badge badge-outline" href="#/kham-pha?company=${esc(co.id)}" title="${esc(co.kind)} · ${esc(co.id)} — bấm để xem mọi KOL của công ty này">${icon("users", 12)} ${esc(co.name)}</a>`;
}
/** Hiệu suất trung bình: view TB kênh chính + (nếu đã book qua Markus) view TB bài branded và CPV TB. */
export function perfOf(c, bookings) {
  const done = bookings.filter((b) => b.perf && b.perf.views);
  const brandedViews = done.length ? Math.round(done.reduce((s, b) => s + b.perf.views, 0) / done.length) : null;
  const cpv = done.length ? Math.round(done.reduce((s, b) => s + b.closed / b.perf.views, 0) / done.length) : null;
  const er = done.length ? +(done.reduce((s, b) => s + b.perf.er, 0) / done.length).toFixed(1) : null;
  return { avgViews: c.channels[c.hero].avgViews.value, brandedViews, cpv, er, n: done.length };
}
export const benchRate = (c) => { const r = rateFor(c); return r ? `${money(r.amount)}<span class="dt-sub">${esc(r.sow)}</span>` : `<span class="faint">Chưa có giá</span>`; };

export function pageHead(title, sub, actions = "") {
  return `<div class="page-head"><div><h1>${esc(title)}</h1><p>${sub}</p></div><div class="page-actions">${actions}</div></div>`;
}
/** Trạng thái rỗng có minh hoạ. kind: search | list | done | lock */
export const emptyState = (kind, title, body = "", actions = "") => `<div class="card empty">${emptyArt(kind)}<strong>${esc(title)}</strong><span>${body}</span>${actions ? `<div class="row-wrap" style="justify-content:center">${actions}</div>` : ""}</div>`;
export const lockedCard = (what) => emptyState("lock", `${what} đã được ẩn`, "Vai trò Viewer không xem được giá và thông tin liên hệ. Đổi vai trò ở góc trên bên phải để xem demo phân quyền.");
