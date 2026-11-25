// views/login.js — màn đăng nhập (chưa có phiên). Nút Google Identity Services → POST /api/auth/google.
// Ai có tài khoản Google cũng bấm được: người trong tab Employees hoặc đã được Admin duyệt → vào app;
// người lạ → vào HÀNG ĐỢI (202 pending), thấy màn "Đang chờ duyệt"; bị chặn → báo rõ, không tạo phiên.
import { $, esc, icon } from "../core/ui.js";
import { api } from "../data/live.js";

const MSG = {
  blocked: "Tài khoản này không được phép truy cập. Nếu bạn nghĩ đây là nhầm lẫn, hãy liên hệ Admin của Markus.",
  queue_full: "Hiện có quá nhiều yêu cầu đang chờ duyệt. Vui lòng liên hệ Admin của Markus.",
  bad_token: "Google không xác nhận được phiên đăng nhập. Thử lại.",
  email_unverified: "Email Google chưa được xác minh.",
  directory_unavailable: "Chưa đọc được danh sách nhân sự từ Google Sheet. Thử lại sau ít phút.",
};

export function renderPending(email) {
  $("#main").innerHTML = `
    <section class="login card" data-state="pending">
      <img src="assets/markus-logo.png" alt="" class="login-logo" />
      <h1>Đang chờ duyệt</h1>
      <p class="welcome-lead">${icon("clock", 20)}<span>Đã gửi yêu cầu truy cập cho <strong>${esc(email)}</strong>. Admin của Markus sẽ xem và cấp quyền cho bạn.</span></p>
      <ol class="welcome-steps">
        <li><b>1</b><span>Bạn không cần làm gì thêm — yêu cầu đã nằm trong hàng đợi.</span></li>
        <li><b>2</b><span>Khi được duyệt, quay lại trang này và <strong>đăng nhập lại bằng Google</strong>.</span></li>
        <li><b>3</b><span>Lâu chưa thấy? Nhắn Admin email bạn vừa dùng để đăng nhập.</span></li>
      </ol>
      <div class="row-wrap" style="justify-content:center"><button class="btn btn-primary" type="button" data-again>${icon("sync", 16)} Đăng nhập lại</button></div>
    </section>`;
  $("[data-again]").addEventListener("click", () => location.reload());
}

export function renderLogin() {
  document.getElementById("app").classList.add("logged-out");
  const clientId = (window.MK_CONFIG && window.MK_CONFIG.clientId) || "";
  $("#main").innerHTML = `
    <section class="login card">
      <img src="assets/markus-logo.png" alt="" class="login-logo" />
      <h1>Markus Creator OS</h1>
      <p class="muted">Đăng nhập bằng tài khoản Google. Nhân sự Markus vào được ngay; người mới sẽ chờ Admin duyệt rồi mới dùng được.</p>
      <div id="g-btn" class="login-btn"></div>
      <p class="login-err" id="login-err" role="alert" hidden></p>
      ${clientId ? "" : `<p class="login-err">Máy chủ chưa cấu hình đăng nhập Google.</p>`}
    </section>`;
  if (!clientId) return;
  const render = () => {
    if (!window.google || !window.google.accounts) return false;
    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: async ({ credential }) => {
        const err = $("#login-err");
        err.hidden = true;
        try {
          const r = await api("/auth/google", { method: "POST", body: { idToken: credential } });
          if (r && r.pending) return renderPending(r.email || "");
          location.reload();
        } catch (e) {
          err.textContent = MSG[e.message] || `Đăng nhập lỗi (${esc(e.message)}).`;
          err.hidden = false;
        }
      },
    });
    window.google.accounts.id.renderButton($("#g-btn"), { theme: "outline", size: "large", locale: "vi", width: 280 });
    return true;
  };
  if (render()) return;
  const s = document.createElement("script");
  s.src = "https://accounts.google.com/gsi/client";
  s.async = true;
  s.onload = render;
  document.head.appendChild(s);
}
