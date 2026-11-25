# Markus Booking — Live source (v1, đã ngừng)

> ## ⚠️ v1 (PHP) ĐÃ NGỪNG — KHÔNG DEPLOY THƯ MỤC `public/`
> Từ 25/11/2026 bản chính thức là **Markus Creator OS v2** trong [`platform/`](platform/), chạy ở https://booking.markus.agency/v2. Trang gốc `/` chuyển 302 sang `/v2/`.
>
> - **Deploy v2:** làm theo [`platform/DEPLOY.md`](platform/DEPLOY.md). Đóng gói ở máy dev bằng `platform/deploy/package.sh`, rồi chạy `platform/deploy/host-deploy.sh` qua SSH. Đọc [`platform/handoff.md`](platform/handoff.md) trước.
> - **KHÔNG** chép `public/` (hay bất kỳ file nào trong đó) lên `~/booking.markus.agency/`. Làm vậy sẽ:
>   1. ghi đè `.htaccess` → mất khối chuyển hướng `MARKUS V2 IS PRODUCTION` → **v1 sống lại** ở `/`;
>   2. thay `_mk/*.php` bằng bản có placeholder (`YOUR_GOOGLE_CLIENT_ID`…) → **hỏng job nhập Sheet và ghi Sheet của v2** (bridge PHP của v2 `require` các file này);
>   3. người dùng quay về dữ liệu workflow cũ, không thấy campaign / booking tạo trên v2.
> - **KHÔNG** xoá hay di chuyển `~/booking.markus.agency/` trên host: v2 vẫn dùng `_mk/` và `hosting/` (khoá) ở đó.
> - Phần dưới đây là tài liệu lịch sử của v1, chỉ để tra cứu.


Captured from the deployed https://booking.markus.agency/ on 2026-11-17. This is NOT the unreleased Planner candidate or staging.

- public/: deployed frontend, PHP endpoints, _mk modules and legacy hosting PHP dependencies.
- SETUP.md: installation, Google login, roles, Sheets and AI configuration.
- SECURITY.md: exclusions and known limitations.
- LIVE-CAPTURE.json: original capture hashes and public HTTP comparisons.
- SHA256.json: sanitized deliverable checksums.

Credentials, operational data, state, logs, caches and old ZIPs are intentionally excluded. Configuration IDs/private paths are replaced in the delivery copy. This is source for handoff, not a full disaster-recovery backup. No Live files or Sheet data were changed. Keep repository private; no open-source license is granted.
