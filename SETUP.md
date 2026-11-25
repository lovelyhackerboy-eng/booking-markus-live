# Setup and operations (v1, đã ngừng — chỉ để tra cứu)

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


## Runtime
Apache/LiteSpeed with PHP source compatible with 7.4; use a supported PHP release after compatibility testing. Required: curl, openssl, mbstring, JSON, sessions, flock and writable private storage. Serve public/ as docroot. Frontend files are deployed assets: no Node build step is needed. Never expose legacy hosting PHP directly.

## Configuration
Create /srv/booking-state outside docroot, writable only by PHP. Configure MKP_STATE_DIR, MKP_HOSTING_DIR=/srv/booking-private, or MKP_SA_PATH and MKP_AI_KEY_PATH. Provide your service-account.json and deepseek-key.txt privately, never in Git. Never enable MKP_ENV=test on production.

Replace YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com throughout public/ with your Google web OAuth client ID, and YOUR_GOOGLE_SHEET_ID with your Sheet ID. Enable Sheets API. Register your HTTPS JavaScript origin in Google OAuth. External accounts must also be allowed by Google consent settings; the current operator project is External/Testing, requiring test-user inclusion. Employees alone cannot bypass org_internal.

Share your new Sheet with your service account. Preserve schema: CREATOR_DB header at row 3, records from row 4 with platform hyperlinks; Employees!A2:C200 holds name/email/role. Obtain an empty schema/template from the owner separately; no real rows are shipped. Bootstrap the first admin in the new Sheet. Admin is highest; planner/viewer are restricted, with roles derived server-side from Employees. Review _mk/auth.php and write-back.php for precise rules.

## Deployment and validation
Review .htaccess, php.ini and .user.ini for your host; merge rather than overwrite existing settings. Preserve denial of _mk/, hosting/, *.impl.php, private data and config files. On nginx implement equivalent rules explicitly. Keep keys/state outside docroot and enable HTTPS.

Static preview only: php -S 127.0.0.1:8080 -t public. This development server does NOT enforce .htaccess; never expose it publicly. Real functionality needs your own keys, test Sheet, same-origin backend and private state. Validate login/logout, external account access, all three roles, CSRF rejection, sync, safe write-back, workflow save/reload, activity and AI failure handling. Do not point independent tests at production Sheet.

Back up the Sheet and private workflow/identity state separately using secure approved procedures; source alone cannot restore operations. Retain deployment and data backups before upgrades.
