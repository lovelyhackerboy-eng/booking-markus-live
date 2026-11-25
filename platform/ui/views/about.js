// views/about.js — GIỚI THIỆU: ứng dụng làm gì, đi theo luồng nào, dữ liệu lấy từ đâu, phiên bản đang chạy và
// RELEASE NOTE theo từng phiên bản (data/releases.js). Mở lại hướng dẫn và gửi góp ý ngay tại đây.

import { esc, icon, delegate, fmtDate } from "../core/ui.js";
import { state, ROLES } from "../core/store.js";
import { RELEASES, CURRENT } from "../data/releases.js";
import { pageHead } from "../core/parts.js";
import { openPanel } from "../core/tour.js";

const SEEN = "markus_v2_seen_version";
export const seenVersion = () => { try { return localStorage.getItem(SEEN) || ""; } catch (e) { return ""; } };
export const markSeen = () => { try { localStorage.setItem(SEEN, CURRENT.version); } catch (e) {} };
export const hasNews = () => seenVersion() !== CURRENT.version;

const FLOW = [
  ["compass", "Khám phá", "Lọc kho creator từ Google Sheet, hỏi bằng câu tự nhiên, xem view trung bình / ER tự cập nhật."],
  ["users", "Campaign", "Chọn ứng viên → duyệt → kéo thả qua các bước liên hệ tới khi chốt."],
  ["eye", "Theo dõi", "Ghi nhận bài đăng của creator đã chốt; YouTube tự tìm video trong khoảng ngày theo dõi."],
  ["chart", "Báo cáo", "KPI so với view đã giao, chi phí / CPV, hiệu quả từng creator; xuất CSV, in PDF."],
];
const SECTIONS = [["new", "Mới", "badge-primary"], ["improved", "Cải tiến", "badge-success"], ["fixed", "Sửa lỗi", ""], ["limits", "Giới hạn hiện tại", "badge-warning"]];

function release(r, open) {
  return `<details class="card release" ${open ? "open" : ""}>
    <summary><span class="release-v">v${esc(r.version)}</span><strong>${esc(r.title)}</strong><span class="faint">${fmtDate(r.date)}</span>${r === CURRENT ? `<span class="badge badge-primary">Đang dùng</span>` : ""}</summary>
    <div class="release-body">${SECTIONS.filter(([k]) => (r[k] || []).length).map(([k, label, tone]) => `<div><span class="badge ${tone}">${label}</span><ul class="bullets">${r[k].map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>`).join("")}</div>
  </details>`;
}

export function render(el) {
  const news = hasNews();
  const cfg = state.config || {};
  el.innerHTML = `<div class="page about">
    ${pageHead("Giới thiệu", "Markus Creator OS — nơi team Markus tìm creator, lên campaign, theo dõi bài đăng và báo cáo, trên một nguồn dữ liệu chung.",
      `<button class="btn" type="button" data-act="tour">${icon("help", 16)} Xem hướng dẫn</button>`)}
    <section class="card card-pad about-hero">
      <div class="about-flow">${FLOW.map(([ic, t, d], i) => `<div class="about-step"><span class="about-ico">${icon(ic, 20)}</span><strong>${i + 1} · ${t}</strong><span class="dt-sub">${d}</span></div>`).join("")}</div>
    </section>
    <div class="report-grid">
      <section class="card card-pad stack"><h3>Dữ liệu lấy từ đâu</h3>
        <ul class="bullets">
          <li><strong>Google Sheet CREATOR_DB</strong> là nguồn chính của creator, follower và giá; app tự nhập lại theo lịch (Admin đặt).</li>
          <li><strong>YouTube</strong>: view, like của video gần đây và ảnh đại diện được đọc tự động.</li>
          <li><strong>TikTok, Facebook, Instagram</strong>: team nhập số liệu vài clip gần nhất và bài đăng của campaign.</li>
          <li>Giá và liên hệ chỉ hiện với vai trò được phép; Viewer không thấy.</li>
        </ul></section>
      <section class="card card-pad stack"><h3>Phiên bản</h3>
        <dl class="about-dl"><dt>Phiên bản</dt><dd>v${esc(CURRENT.version)} · ${fmtDate(CURRENT.date)}</dd>
          <dt>Bản build</dt><dd class="num">${esc(cfg.build || "—")}</dd>
          <dt>Bạn đăng nhập là</dt><dd>${esc(state.user?.name || "")} · ${esc(ROLES[state.role]?.label || state.role)}</dd></dl>
        <p class="faint">Thấy lỗi hoặc cần thêm gì? Bấm <strong>Góp ý</strong> trên thanh trên cùng — góp ý được lưu lại và Admin cập nhật trạng thái xử lý.</p></section>
    </div>
    <h2 class="section-title about-rn" id="release-notes">Release note ${news ? `<span class="badge badge-primary">Có bản mới</span>` : ""}</h2>
    <div class="stack">${RELEASES.map((r, i) => release(r, i === 0)).join("")}</div>
  </div>`;
  markSeen();
  delegate(el, "click", "[data-act=tour]", () => openPanel());
}
export const copilot = () => ({ label: "Giới thiệu", actions: [] });
