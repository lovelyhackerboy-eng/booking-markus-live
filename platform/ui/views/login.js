// views/login.js — màn đăng nhập (chưa có phiên). Nút Google Identity Services → POST /api/auth/google.
// Server tra email trong tab Employees; email không có trong danh sách thì báo rõ, không tạo phiên.
import { $, esc } from "../core/ui.js";
import { api } from "../data/live.js";

const MSG = {
  not_authorized: "Email này chưa có trong danh sách nhân sự (tab Employees). Nhờ quản lý thêm vào rồi thử lại.",
  bad_token: "Google không xác nhận được phiên đăng nhập. Thử lại.",
  email_unverified: "Email Google chưa được xác minh.",
  directory_unavailable: "Chưa đọc được danh sách nhân sự từ Google Sheet. Thử lại sau ít phút.",
};

export function renderLogin() {
  document.getElementById("app").classList.add("logged-out");
  const clientId = (window.MK_CONFIG && window.MK_CONFIG.clientId) || "";
  $("#main").innerHTML = `
    <section class="login card">
      <img src="assets/markus-logo.png" alt="" class="login-logo" />
      <h1>Markus Creator OS</h1>
      <p class="muted">Đăng nhập bằng tài khoản Google có trong danh sách nhân sự. Quyền xem giá và liên hệ theo vai trò trong tab Employees.</p>
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
          await api("/auth/google", { method: "POST", body: { idToken: credential } });
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
