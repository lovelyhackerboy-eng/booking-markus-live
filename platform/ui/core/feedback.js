// core/feedback.js — nút "Góp ý" trên topbar: gom phản hồi thử demo theo một mẫu cố định để góp ý gọn và đúng trọng tâm.
// Mỗi góp ý tự gắn ngữ cảnh (màn hình, vai trò, phong cách, thời điểm) → người nhận không phải hỏi lại "đang ở màn nào".
// Prototype chưa có backend: góp ý được lưu tạm trên trình duyệt và sao chép thành văn bản để dán vào nhóm Zalo / Google Sheet góp ý.

import { $, esc, icon, delegate, openOverlay, toast, copyText } from "./ui.js";
import { state, ROLES } from "./store.js";

const KEY = "markus_proto_feedback";
const KINDS = { bug: "Lỗi / sai dữ liệu", ux: "Khó dùng / thiếu thao tác", feature: "Đề xuất tính năng", data: "Thiếu trường dữ liệu" };
const PRIO = { must: "Phải có để dùng được", should: "Nên có", nice: "Có thì tốt" };
const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch (e) { return []; } };
const saveAll = (list) => { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) {} };

const screenName = () => {
  const h = location.hash.replace(/^#\/?/, "").split("?")[0] || "kham-pha";
  const names = { "kham-pha": "Khám phá", campaign: "Campaign", "danh-sach": "Campaign", shortlist: "Campaign", booking: "Booking", "du-lieu": "Dữ liệu", "them-creator": "Thêm creator" };
  return h.startsWith("creator/") ? `Hồ sơ ${h.slice(8)}` : names[h] || h;
};
const asText = (f) => `[${KINDS[f.kind]} · ${PRIO[f.prio]}] ${f.screen}\n- Đang làm: ${f.doing}\n- Mong muốn: ${f.want}\n- Thực tế: ${f.actual || "—"}\n(${f.role} · ${new Date(f.at).toLocaleString("vi-VN")}${f.by ? " · " + f.by : ""})`;

export function initFeedback(btn) {
  btn.innerHTML = `${icon("message", 18)}<span class="hide-m">Góp ý</span>`;
  btn.addEventListener("click", openFeedback);
}

function openFeedback() {
  const list = load();
  const o = openOverlay({
    kind: "drawer", title: "Góp ý cho prototype",
    body: `<div class="stack">
      <div class="banner">${icon("sparkles", 16)}<div><strong>Một góp ý = một vấn đề.</strong>Ghi việc bạn đang cố làm, điều bạn mong muốn và điều đang xảy ra. Màn hình và vai trò được tự ghi kèm.</div></div>
      <div class="field"><span class="field-label">Màn hình</span><span class="badge badge-outline">${esc(screenName())} · vai trò ${esc(ROLES[state.role].label)}</span></div>
      <div class="field-row">
        <div class="field"><label for="fb-kind">Loại</label><select class="select" id="fb-kind">${Object.entries(KINDS).map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join("")}</select></div>
        <div class="field"><label for="fb-prio">Mức ưu tiên</label><select class="select" id="fb-prio">${Object.entries(PRIO).map(([k, l]) => `<option value="${k}" ${k === "should" ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></div>
      </div>
      <div class="field"><label for="fb-doing">Bạn đang cố làm việc gì?</label><input class="input" id="fb-doing" placeholder="VD: Lọc creator Mid-tier để đưa vào campaign Huggies" /></div>
      <div class="field"><label for="fb-want">Bạn mong muốn điều gì?</label><textarea class="input" id="fb-want" rows="2" placeholder="VD: Sắp xếp được theo tier từ cao xuống thấp"></textarea></div>
      <div class="field"><label for="fb-actual">Hiện tại đang thế nào? (không bắt buộc)</label><textarea class="input" id="fb-actual" rows="2" placeholder="VD: Chỉ sắp theo follower, phải tự dò"></textarea></div>
      <div class="field"><label for="fb-by">Tên bạn (không bắt buộc)</label><input class="input" id="fb-by" /></div>
      ${list.length ? `<hr class="divider" /><div class="row"><strong>Đã ghi ${list.length} góp ý trên máy này</strong><span class="spacer"></span><button class="btn btn-sm" type="button" id="fb-copy-all">${icon("copy", 14)} Sao chép tất cả</button><button class="btn btn-sm btn-ghost" type="button" id="fb-clear">Xoá</button></div>
        <ul class="bullets">${list.slice(-5).reverse().map((f) => `<li><strong>${esc(f.screen)}</strong> · ${esc(KINDS[f.kind])}: ${esc(f.want)}</li>`).join("")}</ul>` : ""}
    </div>`,
    footer: `<span class="spacer"></span><button class="btn" data-close type="button">Đóng</button><button class="btn btn-primary" type="button" id="fb-save">${icon("copy", 16)} Lưu & sao chép</button>`,
  });
  $("#fb-save", o.el).addEventListener("click", () => {
    const want = $("#fb-want", o.el).value.trim(), doing = $("#fb-doing", o.el).value.trim();
    if (!doing) return $("#fb-doing", o.el).focus();
    if (!want) return $("#fb-want", o.el).focus();
    const f = { at: new Date().toISOString(), screen: screenName(), role: ROLES[state.role].label, kind: $("#fb-kind", o.el).value, prio: $("#fb-prio", o.el).value,
      doing, want, actual: $("#fb-actual", o.el).value.trim(), by: $("#fb-by", o.el).value.trim() };
    saveAll([...load(), f]);
    copyText(asText(f));
    o.close();
    toast("Đã lưu góp ý", "Nội dung đã được sao chép, dán vào nhóm góp ý của dự án.");
  });
  delegate(o.el, "click", "#fb-copy-all", () => copyText(load().map(asText).join("\n\n")));
  delegate(o.el, "click", "#fb-clear", () => { saveAll([]); o.close(); toast("Đã xoá góp ý trên máy này"); });
}
