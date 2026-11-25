// core/feedback.js — nút "Góp ý" trên topbar. Góp ý theo mẫu cố định (đang làm gì / mong muốn / hiện tại), tự gắn
// màn hình, vai trò và phiên bản. Lưu trên máy chủ: Admin xử lý ở Quản trị → Góp ý; người gửi thấy trạng thái và
// phản hồi của Admin ngay trong hộp này.

import { $, esc, icon, openOverlay, toast, relTime } from "./ui.js";
import { state, ROLES } from "./store.js";
import { api, inDemo } from "../data/live.js";
import { CURRENT } from "../data/releases.js";

const KINDS = { bug: "Lỗi / sai dữ liệu", ux: "Khó dùng / thiếu thao tác", feature: "Đề xuất tính năng", data: "Thiếu trường dữ liệu" };
const PRIO = { must: "Phải có để dùng được", should: "Nên có", nice: "Có thì tốt" };
const STATUS = { new: ["Đã gửi, chờ xem", "badge-primary"], doing: ["Đang xử lý", "badge-warning"], done: ["Đã xong", "badge-success"], wontfix: ["Chưa làm", ""] };

const screenName = () => {
  const h = location.hash.replace(/^#\/?/, "").split("?")[0] || "kham-pha";
  const names = { "kham-pha": "Khám phá", campaign: "Campaign", booking: "Booking", "bao-cao": "Báo cáo", "quan-tri": "Quản trị", "gioi-thieu": "Giới thiệu", "them-creator": "Thêm creator" };
  if (h.startsWith("creator/")) return "Hồ sơ creator";
  if (h.startsWith("campaign/")) return "Chi tiết campaign";
  return names[h] || h;
};

export function initFeedback(btn) {
  btn.innerHTML = `${icon("message", 18)}<span class="hide-m">Góp ý</span>`;
  btn.addEventListener("click", openFeedback);
}

async function openFeedback() {
  let mine = [];
  if (!inDemo()) { try { mine = (await api("/feedback")).feedback || []; } catch (e) { /* vẫn cho gửi */ } }
  const list = () => (mine.length ? `<hr class="divider" /><strong>Góp ý của bạn (${mine.length})</strong>
    <ul class="fb-mine">${mine.slice(0, 8).map((f) => `<li><span class="badge ${STATUS[f.status][1]}">${STATUS[f.status][0]}</span> <strong>${esc(f.screen || "")}</strong> · ${esc(f.want)}<span class="dt-sub">${relTime(f.createdAt)}</span>${f.adminNote ? `<span class="fb-reply">${icon("message", 12)} Admin: ${esc(f.adminNote)}</span>` : ""}</li>`).join("")}</ul>` : "");
  const o = openOverlay({
    kind: "drawer", title: "Góp ý",
    body: `<div class="stack">
      <div class="banner">${icon("sparkles", 16)}<div><strong>Một góp ý = một vấn đề.</strong>Ghi việc bạn đang cố làm, điều bạn mong muốn và điều đang xảy ra. Màn hình, vai trò và phiên bản được tự ghi kèm.</div></div>
      <div class="field"><span class="field-label">Màn hình</span><span class="badge badge-outline">${esc(screenName())} · vai trò ${esc(ROLES[state.role].label)} · v${esc(CURRENT.version)}</span></div>
      <div class="field-row">
        <div class="field"><label for="fb-kind">Loại</label><select class="select" id="fb-kind">${Object.entries(KINDS).map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join("")}</select></div>
        <div class="field"><label for="fb-prio">Mức ưu tiên</label><select class="select" id="fb-prio">${Object.entries(PRIO).map(([k, l]) => `<option value="${k}" ${k === "should" ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></div>
      </div>
      <div class="field"><label for="fb-doing">Bạn đang cố làm việc gì?</label><input class="input" id="fb-doing" maxlength="2000" placeholder="VD: Lọc creator Mid-tier để đưa vào campaign Huggies" /></div>
      <div class="field"><label for="fb-want">Bạn mong muốn điều gì?</label><textarea class="input" id="fb-want" rows="2" maxlength="4000" placeholder="VD: Sắp xếp được theo tier từ cao xuống thấp"></textarea></div>
      <div class="field"><label for="fb-actual">Hiện tại đang thế nào? (không bắt buộc)</label><textarea class="input" id="fb-actual" rows="2" maxlength="4000" placeholder="VD: Chỉ sắp theo follower, phải tự dò"></textarea></div>
      <div id="fb-mine">${list()}</div>
    </div>`,
    footer: `<span class="spacer"></span><button class="btn" data-close type="button">Đóng</button><button class="btn btn-primary" type="button" id="fb-save">${icon("send", 16)} Gửi góp ý</button>`,
  });
  $("#fb-save", o.el).addEventListener("click", async (e) => {
    const want = $("#fb-want", o.el).value.trim(), doing = $("#fb-doing", o.el).value.trim();
    if (!doing) return $("#fb-doing", o.el).focus();
    if (!want) return $("#fb-want", o.el).focus();
    const b = e.currentTarget; b.disabled = true;
    try {
      const r = await api("/feedback", { method: "POST", body: { kind: $("#fb-kind", o.el).value, prio: $("#fb-prio", o.el).value, doing, want, actual: $("#fb-actual", o.el).value.trim() || undefined, screen: screenName(), route: location.hash.slice(0, 300), appVersion: CURRENT.version } });
      o.close();
      toast("Đã gửi góp ý", inDemo() ? "Đang ở hướng dẫn: góp ý mẫu không được lưu." : "Cảm ơn bạn! Theo dõi trạng thái xử lý ngay trong hộp Góp ý.");
      if (r.feedback) mine = r.feedback;
    } catch (err) { b.disabled = false; toast("Chưa gửi được", "Lỗi " + err.message + ". Thử lại sau ít phút.", "danger"); }
  });
}
