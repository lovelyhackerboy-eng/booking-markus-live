// ai/copilot.js — AI Copilot: panel bên phải có mặt ở MỌI màn hình (Ctrl/⌘+K), thay cho tab "AI Workspace" tách biệt.
// - Ngữ cảnh do view hiện tại cung cấp qua export copilot(params) → { label, actions: [{ label, match?, run }] }.
// - AI chỉ ĐỀ XUẤT: mọi hành động làm thay đổi dữ liệu / bộ lọc đều là 1 nút để người dùng bấm xác nhận.
// PORT: handle() là chỗ thay bằng lời gọi ai-chat.php (DeepSeek + tools); post() giữ nguyên để hiển thị kết quả + nút xác nhận.

import { $, esc, icon, delegate, trapFocus, toast, copyText } from "../core/ui.js";
import { state, can, me, filterCtx, setFilters, toggleShortlist, campaignHash } from "../core/store.js";
import { chipsOf, norm } from "../core/filters.js";
import { parseQuery, recommend, draftOutreach } from "./mock-ai.js";
import { avatar } from "../core/parts.js";

let panel, getContext, untrap = null, opener = null, seq = 0;
const THINK_MS = 520;
let gen = 0;
const log = [];            // [{ who: "ai" | "user", html, actions: [{ id, label, primary, done }], note }]
const handlers = new Map(); // action id → run()

export function initCopilot(opts) {
  panel = $("#copilot");
  getContext = opts.getContext;
  panel.innerHTML = `
    <div class="copilot-head">
      <h2>${icon("sparkles", { size: 20, variant: "fill" })} AI Copilot</h2>
      <span class="badge badge-ai" title="Prototype: AI được giả lập bằng luật, không gọi mạng">Giả lập</span>
      <button class="btn btn-ghost btn-icon" type="button" data-copilot-close aria-label="Đóng AI Copilot">${icon("xmark")}</button>
    </div>
    <div class="copilot-ctx" id="copilot-ctx"></div>
    <div class="copilot-log" id="copilot-log" aria-live="polite"></div>
    <form class="copilot-form" id="copilot-form">
      <label class="sr-only" for="copilot-input">Nhập brief hoặc câu lệnh cho AI</label>
      <input class="input" id="copilot-input" autocomplete="off" placeholder="Nhập brief hoặc câu lệnh…" />
      <button class="btn btn-primary btn-icon" type="submit" aria-label="Gửi">${icon("send", { size: 18, variant: "fill" })}</button>
    </form>`;
  delegate(panel, "click", "[data-copilot-close]", closeCopilot);
  delegate(panel, "click", "[data-ctx-action]", (e, btn) => runContextAction(+btn.dataset.ctxAction));
  delegate(panel, "click", "[data-msg-action]", (e, btn) => {
    const run = handlers.get(btn.dataset.msgAction);
    if (!run) return;
    run();
    log.forEach((m) => m.actions.forEach((a) => { if (a.id === btn.dataset.msgAction && !a.repeat) a.done = true; }));
    drawLog();
  });
  $("#copilot-form", panel).addEventListener("submit", (e) => {
    e.preventDefault();
    const input = $("#copilot-input", panel);
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    postUser(text);
    handle(text);
  });
  panel.addEventListener("keydown", (e) => { if (e.key === "Escape") closeCopilot(); });
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); isOpen() ? closeCopilot() : openCopilot(); }
  });
  drawLog();
}

export const isOpen = () => !panel.hidden;

export function openCopilot() {
  if (!isOpen()) opener = document.activeElement;
  panel.hidden = false;
  $("#app").classList.add("copilot-open");
  $("#btn-ask").setAttribute("aria-expanded", "true");
  refreshContext();
  // Màn hẹp: copilot là lớp phủ → giữ focus bên trong. Màn rộng: là cột cố định, không khoá focus.
  if (untrap) untrap();
  untrap = window.innerWidth < 1280 ? trapFocus(panel, closeCopilot) : null;
  $("#copilot-input", panel).focus();
}
export function closeCopilot() {
  if (!isOpen()) return;
  panel.hidden = true;
  $("#app").classList.remove("copilot-open");
  $("#btn-ask").setAttribute("aria-expanded", "false");
  if (untrap) { untrap(); untrap = null; }
  if (opener && document.contains(opener)) opener.focus();
}
const closeIfOverlay = () => { if (window.innerWidth < 1280) closeCopilot(); };

/** Đổi vai trò → xoá hội thoại: câu trả lời cũ có thể chứa giá / liên hệ mà vai trò mới không được xem. */
export function resetCopilot() { log.length = 0; handlers.clear(); gen++; if (panel) drawLog(); }

/** Gọi khi đổi route / đổi vai trò để cập nhật khối "Ngữ cảnh". */
export function refreshContext() {
  if (!panel || !isOpen()) return;
  const ctx = getContext();
  $("#copilot-ctx", panel).innerHTML = `
    <div class="faint">Đang xem</div><strong>${esc(ctx.label)}</strong>
    <div class="chip-set">${ctx.actions.map((a, i) => `<button class="chip chip-ai" type="button" data-ctx-action="${i}">${esc(a.label)}</button>`).join("")}</div>`;
}
function runContextAction(i) {
  const a = getContext().actions[i];
  if (!a) return;
  postUser(a.label);
  a.run();
}

/* ---------- log ---------- */
export function postUser(text) { log.push({ who: "user", html: esc(text), actions: [] }); drawLog(); }
/**
 * Thêm 1 câu trả lời của AI.
 * actions: [{ label, primary?, repeat?, run }] — mỗi action là 1 nút XÁC NHẬN; không có gì tự chạy.
 */
export function post(html, actions = [], note = "AI tạo từ dữ liệu trong CSDL — hãy kiểm tra trước khi dùng.") {
  const acts = actions.map((a) => { const id = "a" + ++seq; handlers.set(id, a.run); return { id, label: a.label, primary: a.primary, repeat: a.repeat, done: false }; });
  // Hiện "AI đang suy nghĩ…" một nhịp rồi mới trả lời (app thật: thời gian chờ LLM). gen đổi khi đổi vai trò → bỏ câu trả lời đang chờ.
  const entry = { who: "ai", thinking: true, html, actions: acts, note };
  const myGen = gen;
  log.push(entry);
  if (!isOpen()) openCopilot();
  drawLog();
  setTimeout(() => { if (myGen !== gen) return; entry.thinking = false; drawLog(); }, THINK_MS);
}
function drawLog() {
  const box = $("#copilot-log", panel);
  // Giữ nội dung người dùng đang sửa trong các bản nháp (textarea) qua mỗi lần vẽ lại.
  const drafts = Object.fromEntries([...box.querySelectorAll("textarea[id]")].map((t) => [t.id, t.value]));
  box.innerHTML = log.length ? log.map((m, i) => m.who === "user"
    ? `<div class="msg msg-user ${i === log.length - 1 ? "" : "is-old"}">${m.html}</div>`
    : m.thinking ? `<div class="msg msg-ai msg-thinking" role="status"><span class="thinking" aria-hidden="true"><i></i><i></i><i></i></span> AI đang suy nghĩ…</div>`
    : `<div class="msg msg-ai ${i === log.length - 1 ? "" : "is-old"}">${m.html}
        ${m.actions.length ? `<div class="msg-actions">${m.actions.map((a) => `<button class="btn btn-sm ${a.primary ? "btn-primary" : ""}" type="button" data-msg-action="${a.id}" ${a.done ? "disabled" : ""}>${a.done ? "✓ " : ""}${esc(a.label)}</button>`).join("")}</div>` : ""}
        ${m.note ? `<div class="msg-note">${esc(m.note)}</div>` : ""}</div>`).join("")
    : `<div class="msg msg-ai">
        <strong>Xin chào, mình là AI Copilot của Markus.</strong>
        <ul><li>Dán brief → mình chuyển thành bộ lọc để bạn sửa.</li><li>Ở hồ sơ creator: tóm tắt, so sánh, soạn tin Zalo.</li><li>Mình chỉ <strong>đề xuất</strong> — mọi thay đổi đều cần bạn bấm xác nhận.</li></ul>
        <div class="msg-note">Thử: “Beauty blogger TP.HCM trên 100k follower, ER trên 5%”</div></div>`;
  Object.entries(drafts).forEach(([id, v]) => { const t = document.getElementById(id); if (t) t.value = v; });
  box.scrollTop = box.scrollHeight;
}

/* ---------- xử lý câu tự do ---------- */
function handle(text) {
  const n = norm(text);
  const ctx = getContext();
  const hit = ctx.actions.find((a) => a.match && a.match.test(n));
  if (hit) return hit.run();

  if (/thong ke|tong quan|bao nhieu/.test(n)) {
    const s = state;
    return post(`<strong>Thống kê nhanh</strong><ul>
      <li>${s.creators.length} creator trong CSDL, ${s.creators.filter((c) => c.rel.status === "preferred").length} Preferred partner.</li>
      <li>${s.bookings.filter((b) => b.status !== "paid").length} booking đang chạy, ${s.bookings.filter((b) => b.status === "paid").length} đã hoàn tất.</li>
      <li>${s.shortlist.length} creator trong shortlist.</li>
      <li>${s.reviewQueue.length} chỉ số chờ duyệt, ${s.conflicts.length} xung đột dữ liệu.</li></ul>`,
      [{ label: "Mở Dữ liệu & đồng bộ", run: () => { location.hash = "#/du-lieu"; closeIfOverlay(); } }]);
  }
  if (/bao gia|xuat/.test(n)) {
    return post(state.shortlist.length ? `Shortlist đang có <strong>${state.shortlist.length} creator</strong>. Mình mở màn xuất báo giá để bạn kiểm tra trước khi tải file nhé.` : "Shortlist đang trống. Hãy chọn creator ở màn Khám phá trước.",
      state.shortlist.length ? [{ label: "Mở xuất báo giá", primary: true, run: () => { location.hash = campaignHash("ung-vien", "&export=1"); closeIfOverlay(); } }] : [{ label: "Tới Khám phá", run: () => { location.hash = "#/kham-pha"; closeIfOverlay(); } }]);
  }
  if (/cho duyet|dong bo|du lieu cu|xung dot/.test(n)) {
    return post(`Có <strong>${state.reviewQueue.length}</strong> chỉ số từ crawler/AI đang chờ người duyệt và <strong>${state.conflicts.length}</strong> xung đột giữa giá trị nhập tay và giá trị đồng bộ.`,
      [{ label: "Mở hàng chờ duyệt", primary: true, run: () => { location.hash = "#/du-lieu"; closeIfOverlay(); } }]);
  }
  briefToFilters(text);
}

/** Soạn nháp tin Zalo cho 1 creator (dùng ở hồ sơ, danh sách, khám phá). AI chỉ soạn — người dùng sửa và tự gửi. */
export function postZaloDraft(c) {
  const id = "zalo-" + ++seq;
  post(`<strong>Bản nháp tin nhắn Zalo gửi ${esc(c.rel.via === "direct" ? c.name : (can("contact") && c.rel.manager) || "manager của " + c.name)}</strong>
    <label class="sr-only" for="${id}">Nội dung tin nhắn (sửa được)</label>
    <textarea class="textarea" id="${id}">${esc(draftOutreach(c, { sender: me(), hideContact: !can("contact") }))}</textarea>`,
    [{ label: "Sao chép", primary: true, repeat: true, run: () => copyText(document.getElementById(id).value) }],
    "AI chỉ soạn nháp. Bạn sửa lại rồi tự gửi qua Zalo — hệ thống không tự gửi tin.");
}

/** Brief → bộ lọc: trả lời bằng chip "AI đã hiểu" + top 3, người dùng bấm mới áp dụng. */
export function briefToFilters(text) {
  const r = parseQuery(text, { allowPrice: can("price") });
  const rec = recommend(state.creators, r.patch, filterCtx);
  const chips = chipsOf(r.patch, filterCtx);
  const top = rec.matches.slice(0, 3);
  post(`
    <strong>Mình hiểu brief như sau:</strong>
    <div class="chip-set" style="margin:8px 0">${chips.map((c) => `<span class="chip chip-ai">${esc(c.label)}</span>`).join("") || `<span class="faint">Không nhận ra tiêu chí nào.</span>`}</div>
    ${r.leftover.length ? `<div class="faint">Chưa hiểu: “${esc(r.leftover.join(" "))}”</div>` : ""}
    ${r.priceSkipped ? `<div class="faint">Đã bỏ qua tiêu chí giá (vai trò Viewer không xem giá).</div>` : ""}
    <p style="margin-top:8px"><strong>${rec.matches.length}</strong> creator khớp hoàn toàn${rec.near.length ? `, ${rec.near.length} gần khớp` : ""}.</p>
    ${top.length ? `<div class="msg-people">${top.map((m) => `<a class="msg-person" href="#/creator/${m.c.id}">${avatar(m.c, "sm")}<span><strong>${esc(m.c.name)}</strong><small>Phù hợp ${m.score}/100${m.plus[0] ? ` · ${esc(m.plus[0])}` : ""}</small></span></a>`).join("")}</div>` : ""}`,
    [
      { label: "Áp dụng vào Khám phá", primary: true, repeat: true, run: () => { setFilters(r.patch, { query: text, leftover: r.leftover, priceSkipped: r.priceSkipped }); location.hash = "#/kham-pha"; closeIfOverlay(); } },
      ...(top.length ? [{ label: `Thêm top ${top.length} vào shortlist`, run: () => { top.forEach((m) => toggleShortlist(m.c.id, true)); toast("Đã thêm vào shortlist", top.map((m) => m.c.name).join(", ")); } }] : []),
    ]);
}
