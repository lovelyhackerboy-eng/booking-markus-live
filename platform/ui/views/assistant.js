// views/assistant.js — Trợ lý AI lên campaign (DeepSeek qua /v2/api/ai/agent).
// AI chỉ ĐỀ XUẤT: danh sách gợi ý có ô chọn, người dùng bấm "Thêm vào Ứng viên" thì mới ghi (qua API campaign thường).
import { $, esc, icon, openOverlay, toast, fmtNum } from "../core/ui.js";
import { can, getCreator, toggleShortlist, inShortlist, getList } from "../core/store.js";
import { api } from "../data/live.js";
import { PLATFORMS } from "../data/catalog.js";

const threads = {}; // chưa mở campaign: hội thoại chỉ giữ trong phiên. Có campaign: lưu ở server, dùng chung cả nhóm.
const briefText = (b) => {
  if (!b) return "";
  const parts = [];
  if (b.categories && b.categories.length) parts.push(b.categories.join(", "));
  if (b.regions && b.regions.length) parts.push(b.regions.join(", "));
  if (b.heroes && b.heroes.length) parts.push("kênh chính " + b.heroes.join("/"));
  if (b.platforms && b.platforms.length) parts.push("có " + b.platforms.join("/"));
  if (b.followersMin) parts.push("≥ " + fmtNum(b.followersMin) + " follower");
  if (b.budgetPerCreator) parts.push("≤ " + fmtNum(b.budgetPerCreator) + " ₫/người");
  if (b.count) parts.push(b.count + " người");
  if (b.notes) parts.push(b.notes);
  return parts.join(" · ");
};

const STARTERS = [
  "Gợi ý 10 creator phù hợp với campaign này",
  "Tìm creator Mẹ & bé ở Hà Nội, kênh chính TikTok",
  "Campaign này đang có những ai, còn thiếu nhóm nào?",
];

// Văn bản AI → HTML an toàn: escape trước, rồi mới thêm xuống dòng / gạch đầu dòng / chữ đậm.
const fmt = (t) => esc(t || "").replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/^\s*[-•]\s+/gm, "• ").replace(/\n/g, "<br>");

function proposalsHtml(m, i, listId) {
  if (!m.proposals || !m.proposals.length) return "";
  return `<div class="ai-props" data-msg="${i}">
    ${m.proposals.map((p) => { const c = getCreator(p.id); const had = listId && inShortlist(p.id, listId); const h = c && c.channels[c.hero];
      return `<label class="ai-prop"><input type="checkbox" value="${esc(p.id)}" ${had ? "disabled" : "checked"} />
        <span><a href="#/creator/${esc(p.id)}">${esc(p.name)}</a>${c ? ` <span class="faint">· ${esc(c.tier)} · ${esc(PLATFORMS[c.hero] ? PLATFORMS[c.hero].label : c.hero)} ${h && h.followers.value ? fmtNum(h.followers.value) : ""}</span>` : ""}${had ? ` <span class="badge">Đã là ứng viên</span>` : ""}
        <span class="dt-sub">${esc(p.reason)}</span></span></label>`; }).join("")}
    ${listId ? `<button class="btn btn-primary btn-sm" type="button" data-add="${i}">${icon("plus", 14)} Thêm mục đã chọn vào Ứng viên</button>` : `<p class="faint">Mở một campaign để thêm các gợi ý này vào Ứng viên.</p>`}
  </div>`;
}

export function openAssistant(list) {
  if (!can("edit")) return toast("Không dùng được", "Trợ lý AI dành cho vai trò có quyền làm campaign.", "");
  const listId = list ? list.id : null;
  const key = listId || "_";
  const msgs = (threads[key] = threads[key] || []);
  const o = openOverlay({
    kind: "drawer", wide: true,
    title: `${icon("sparkles", 18)} Trợ lý AI${list ? " · " + list.name : ""}`,
    body: `${listId ? `<div class="ai-brief row-wrap" id="ai-brief"></div>` : ""}<div class="ai-chat" id="ai-log"></div>
      <form class="ai-input" id="ai-form"><textarea class="input" id="ai-text" rows="2" placeholder="Mô tả brief: ngành, khu vực, kênh, ngân sách, số lượng…"></textarea>
      <button class="btn btn-primary" type="submit">${icon("sparkles", 16)} Gửi</button></form>
      <p class="faint" style="margin-top:6px">AI chỉ đề xuất. Không gửi thông tin liên hệ hay ghi chú nội bộ cho AI. Dữ liệu chưa có ER, view, audience.</p>`,
  });
  const log = $("#ai-log", o.el);
  let brief = null;
  const drawBrief = () => {
    const el = $("#ai-brief", o.el);
    if (!el) return;
    el.innerHTML = `${brief ? `<span class="badge badge-ai">${icon("sparkles", 12)} Brief đã lưu</span> <span class="faint">${esc(briefText(brief))}</span>` : `<span class="faint">Hội thoại và brief của campaign được lưu, cả nhóm cùng xem.</span>`}
      ${msgs.length ? `<button class="btn btn-ghost btn-sm" type="button" id="ai-clear">Xoá hội thoại</button>` : ""}`;
    $("#ai-clear", o.el)?.addEventListener("click", async () => {
      try { await api(`/ai/agent?campaignId=${encodeURIComponent(listId)}`, { method: "DELETE" }); } catch (e) { return toast("Chưa xoá được", e.message, "danger"); }
      msgs.length = 0; brief = null; drawBrief(); draw();
    });
  };
  const draw = (busy = false) => {
    log.innerHTML = (msgs.length ? msgs : [])
      .map((m, i) => m.role === "user"
        ? `<div class="ai-msg ai-user">${m.by ? `<span class="dt-sub">${esc(m.by)}</span>` : ""}${esc(m.content)}</div>`
        : `<div class="ai-msg ai-bot">${fmt(m.content)}${proposalsHtml(m, i, listId)}</div>`).join("")
      + (msgs.length ? "" : `<div class="ai-starters">${STARTERS.map((s) => `<button class="btn btn-sm btn-ai" type="button" data-starter="${esc(s)}">${esc(s)}</button>`).join("")}</div>`)
      + (busy ? `<div class="ai-msg ai-bot"><span class="thinking" aria-hidden="true"><i></i><i></i><i></i></span> Đang tìm trong CSDL…</div>` : "");
    log.scrollTop = log.scrollHeight;
  };
  const send = async (text) => {
    if (!text.trim()) return;
    msgs.push({ role: "user", content: text.trim() });
    draw(true);
    try {
      // Có campaign: chỉ gửi câu mới — lịch sử + brief nằm ở server. Chưa có campaign: gửi cả hội thoại của phiên.
      const payload = listId ? [{ role: "user", content: text.trim() }] : msgs.map((m) => ({ role: m.role, content: m.content }));
      const r = await api("/ai/agent", { method: "POST", body: { campaignId: listId, messages: payload } });
      msgs.push({ role: "assistant", content: r.reply || "(không có trả lời)", proposals: r.proposals || [] });
      if (r.brief !== undefined) brief = r.brief;
      drawBrief();
    } catch (e) {
      msgs.push({ role: "assistant", content: e.message === "rate_limited" ? "Bạn hỏi hơi nhanh, đợi một phút rồi thử lại nhé." : e.message === "ai_not_configured" ? "Máy chủ chưa cấu hình AI." : "AI đang bận hoặc lỗi kết nối. Thử lại sau ít phút." });
    }
    draw();
  };
  $("#ai-form", o.el).addEventListener("submit", (e) => { e.preventDefault(); const t = $("#ai-text", o.el); const v = t.value; t.value = ""; send(v); });
  $("#ai-text", o.el).addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("#ai-form", o.el).requestSubmit(); } });
  log.addEventListener("click", (e) => {
    const st = e.target.closest("[data-starter]");
    if (st) return send(st.dataset.starter);
    const add = e.target.closest("[data-add]");
    if (!add || !listId || !getList(listId)) return;
    const box = add.closest(".ai-props");
    const ids = [...box.querySelectorAll("input:checked:not(:disabled)")].map((x) => x.value);
    ids.forEach((id) => toggleShortlist(id, true, listId));
    toast("Đã thêm vào Ứng viên", `${ids.length} creator · ${list.name}`);
    draw();
  });
  draw();
  drawBrief();
  if (listId) {
    draw(true);
    api(`/ai/agent?campaignId=${encodeURIComponent(listId)}`)
      .then((r) => { msgs.splice(0, msgs.length, ...(r.messages || [])); brief = r.brief || null; })
      .catch(() => {})
      .finally(() => { draw(); drawBrief(); });
  }
  setTimeout(() => $("#ai-text", o.el)?.focus(), 50);
}
