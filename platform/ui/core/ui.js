// core/ui.js — tiện ích DOM dùng chung: escape, định dạng số/tiền/thời gian, icon, toast, drawer/modal.
// Tương đương các helper esc/toast/openModal/compactNumber trong app.js hiện tại. Icon: core/icons.js.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// "Hôm nay" của prototype được cố định để mock data luôn hiển thị giống nhau.
export const NOW = new Date(); // bản thật: thời điểm mở trang
export const daysAgo = (n) => new Date(NOW.getTime() - n * 864e5).toISOString();
export const ageDays = (iso) => Math.max(0, Math.floor((NOW - new Date(iso)) / 864e5));

export function relTime(iso) {
  if (!iso) return "chưa có";
  const mins = Math.max(0, Math.floor((NOW - new Date(iso)) / 6e4));
  if (mins < 2) return "vừa xong";
  if (mins < 60) return `${mins} phút trước`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h} giờ trước`;
  const d = Math.floor(h / 24);
  if (d < 14) return `${d} ngày trước`;
  if (d < 60) return `${Math.floor(d / 7)} tuần trước`;
  if (d < 365) return `${Math.floor(d / 30)} tháng trước`;
  return `${Math.floor(d / 365)} năm trước`;
}
export const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—");

const trim1 = (x) => x.toFixed(1).replace(/\.0$/, "").replace(".", ",");
export function fmtNum(n) {
  if (n == null || n === "") return "—";
  if (n >= 1e6) return trim1(n / 1e6) + "M";
  if (n >= 1e3) return trim1(n / 1e3) + "K";
  return String(Math.round(n));
}
export function fmtVnd(n, full) {
  if (n == null || n === "") return "—";
  if (full) return Math.round(n).toLocaleString("vi-VN") + " ₫";
  if (n >= 1e9) return trim1(n / 1e9) + " tỷ";
  if (n >= 1e6) return trim1(n / 1e6) + "tr";
  if (n >= 1e3) return trim1(n / 1e3) + "k";
  return String(n);
}
export const fmtPct = (n) => (n == null ? "—" : trim1(n) + "%");
export const initials = (name) => String(name || "?").trim().split(/\s+/).slice(-2).map((w) => w[0]).join("").toUpperCase();

/* ---------- icon: toàn bộ icon giao diện nằm ở core/icons.js (phong cách Apple, outline / fill) ---------- */
import { icon } from "./icons.js";
export { icon };

/* ---------- delegate: gắn 1 listener cho nhiều phần tử con (root bị thay mỗi lần đổi màn nên không rò listener) ---------- */
export function delegate(root, type, selector, handler) {
  root.addEventListener(type, (e) => {
    const el = e.target.closest(selector);
    if (el && root.contains(el)) handler(e, el);
  });
}

/* ---------- toast ---------- */
export function toast(title, msg = "", tone = "") {
  const el = document.createElement("div");
  el.className = "toast" + (tone ? " toast-" + tone : "");
  const ico = { warning: "alert", danger: "alert", ai: "sparkles" }[tone] || "check";
  el.innerHTML = `<span class="toast-ico">${icon(ico, 16)}</span><div><strong>${esc(title)}</strong>${msg ? `<span class="muted">${esc(msg)}</span>` : ""}</div>`;
  $("#toasts").appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

/* ---------- overlay: drawer & modal dùng chung 1 hàm (Esc để đóng, giữ focus bên trong, trả focus khi đóng) ---------- */
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
export function trapFocus(panel, onEsc) {
  const handler = (e) => {
    if (e.key === "Escape") { e.stopPropagation(); onEsc(); return; }
    if (e.key !== "Tab") return;
    const items = $$(FOCUSABLE, panel).filter((x) => x.offsetParent !== null);
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  panel.addEventListener("keydown", handler);
  return () => panel.removeEventListener("keydown", handler);
}

/**
 * openOverlay({ kind: "drawer" | "modal", title, body, footer, wide, onClose })
 * body/footer là chuỗi HTML. Trả về { el, body, close } để view tự gắn sự kiện.
 */
export function openOverlay({ kind = "drawer", title, body = "", footer = "", wide = false, onClose } = {}) {
  const opener = document.activeElement;
  const wrap = document.createElement("div");
  wrap.className = `overlay overlay-${kind}`;
  wrap.innerHTML = `
    <div class="panel${wide ? " is-wide" : ""}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="panel-head"><h2>${esc(title)}</h2><button class="btn btn-ghost btn-icon" data-close type="button" aria-label="Đóng">${icon("xmark")}</button></div>
      <div class="panel-body">${body}</div>
      ${footer ? `<div class="panel-foot">${footer}</div>` : ""}
    </div>`;
  const panel = $(".panel", wrap);
  const close = () => {
    wrap.remove();
    if (onClose) onClose();
    if (opener && document.contains(opener)) opener.focus();
  };
  wrap.addEventListener("mousedown", (e) => { if (e.target === wrap) close(); });
  delegate(wrap, "click", "[data-close]", close);
  trapFocus(panel, close);
  $("#overlay-root").appendChild(wrap);
  const first = $("[autofocus]", panel) || $$(FOCUSABLE, $(".panel-body", panel))[0] || $("[data-close]", panel);
  if (first) first.focus();
  return { el: wrap, body: $(".panel-body", panel), foot: $(".panel-foot", panel), close };
}

/* ---------- menu: popover nhỏ neo vào 1 nút (Lưu vào danh sách, Sửa cột…) ----------
   build() trả về mảng mục: { label, checked?, run, keepOpen? } | { title } | { sep: true }.
   keepOpen = bấm xong vẽ lại menu thay vì đóng (dùng cho mục dạng tick). Esc / bấm ra ngoài để đóng, ↑ ↓ để di chuyển. */
let closeOpenMenu = null;
export function openMenu(anchor, build) {
  if (closeOpenMenu) closeOpenMenu();
  const el = document.createElement("div");
  el.className = "menu";
  el.setAttribute("role", "menu");
  let items = [];
  const draw = () => {
    items = build();
    el.innerHTML = items.map((it, i) => (it.sep ? `<div class="menu-sep"></div>` : it.title ? `<div class="menu-title">${esc(it.title)}</div>`
      : `<button class="menu-item" type="button" role="${it.checked != null ? "menuitemcheckbox" : "menuitem"}" ${it.checked != null ? `aria-checked="${!!it.checked}"` : ""} data-i="${i}"><span class="menu-check" aria-hidden="true">${it.checked ? "✓" : ""}</span>${esc(it.label)}</button>`)).join("");
  };
  draw();
  document.body.appendChild(el);
  const r = anchor.getBoundingClientRect();
  el.style.left = Math.max(8, Math.min(r.left, window.innerWidth - el.offsetWidth - 8)) + "px";
  el.style.top = (r.bottom + 6 + el.offsetHeight > window.innerHeight - 8 ? Math.max(8, r.top - el.offsetHeight - 6) : r.bottom + 6) + "px";
  anchor.setAttribute("aria-expanded", "true");
  const onDoc = (e) => { if (!el.contains(e.target) && !anchor.contains(e.target)) close(false); };
  function close(refocus = true) {
    el.remove();
    document.removeEventListener("mousedown", onDoc, true);
    window.removeEventListener("hashchange", onHash);
    closeOpenMenu = null;
    if (document.contains(anchor)) { anchor.setAttribute("aria-expanded", "false"); if (refocus) anchor.focus(); }
  }
  const onHash = () => close(false);
  document.addEventListener("mousedown", onDoc, true);
  window.addEventListener("hashchange", onHash);
  closeOpenMenu = close;
  el.addEventListener("click", (e) => {
    const b = e.target.closest("[data-i]");
    if (!b) return;
    const it = items[+b.dataset.i];
    it.run();
    if (it.keepOpen) { draw(); (el.querySelector(`[data-i="${b.dataset.i}"]`) || el.querySelector(".menu-item"))?.focus(); } else close();
  });
  el.addEventListener("keydown", (e) => {
    const list = $$(".menu-item", el), i = list.indexOf(document.activeElement);
    if (e.key === "Escape" || e.key === "Tab") { e.preventDefault(); close(); }
    if (e.key === "ArrowDown") { e.preventDefault(); list[(i + 1) % list.length]?.focus(); }
    if (e.key === "ArrowUp") { e.preventDefault(); list[(i - 1 + list.length) % list.length]?.focus(); }
  });
  el.querySelector(".menu-item")?.focus();
}

/* ---------- số đếm chạy (count-up) cho KPI: count(1234, "num") → <span data-count>, router gọi animateCounts() sau khi vẽ ---------- */
const COUNT_FMT = { num: fmtNum, vnd: fmtVnd, pct: fmtPct, int: (n) => String(Math.round(n)) };
export const count = (value, fmt = "int") => `<span class="num" data-count="${value}" data-fmt="${fmt}">${esc(COUNT_FMT[fmt](value))}</span>`;
export function animateCounts(root) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.classList.contains("no-motion")) return;
  $$("[data-count]", root).forEach((el) => {
    const to = +el.dataset.count, fmt = COUNT_FMT[el.dataset.fmt] || String, t0 = performance.now();
    const tick = (t) => {
      const k = Math.min(1, (t - t0) / 650), eased = 1 - Math.pow(1 - k, 3);
      el.textContent = fmt(k < 1 ? to * eased : to);
      if (k < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

export function downloadFile(filename, text, mime = "text/csv;charset=utf-8") {
  const blob = new Blob(["﻿" + text], { type: mime });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 500);
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast("Đã sao chép", "Dán vào Zalo / email để gửi."); }
  catch (e) { toast("Không sao chép được", "Hãy bôi đen và sao chép thủ công.", "warning"); }
}
