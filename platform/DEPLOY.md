# Nền tảng mới — deploy lên hosting AZDIGI

Kế hoạch đầy đủ: `ux-redesign/PLAN-MVP-VA-LO-TRINH.md` mục 13.

## Bố cục trên hosting (theo cách 2 app Node đang chạy trên tài khoản)

```
~/markus-v2-app/                  ← app root (NGOÀI docroot), CloudLinux "Setup Node.js App", Node 22
    server.js, .next/, public/    ← nội dung .next/standalone (build ở máy) + .next/static + public
    node_modules -> ~/nodevenv/markus-v2-app/22/lib/node_modules   (symlink do CloudLinux tạo)
~/booking.markus.agency/v2/.htaccess   ← Passenger do CloudLinux sinh (PassengerAppRoot, PassengerBaseURI /v2)
~/markus-v2-state/                 ← file môi trường, log nhập Sheet (không nằm trong docroot)
MariaDB: thestvco_markus_v2 / user thestvco_mkv2
```

CloudLinux đặt `node_modules` của app là symlink sang môi trường ảo, nên **không** chép thư mục `node_modules` của bản standalone vào app root. Bản standalone cần chạy được qua một trong hai cách (chạy thử để chọn):

1. Chép `node_modules` của standalone vào `~/nodevenv/markus-v2-app/22/lib/node_modules/` (đích của symlink).
2. Đổi tên thành `deps/` trong app root và đặt `NODE_PATH=<app root>/deps` trong biến môi trường của app.

## Build (ở máy, container Linux giống hosting)

```
docker run --rm -v <thư mục platform>:/app -w /app node:22-bookworm sh -c "npm ci && npm run build"
```

Gói upload = `.next/standalone/` + `.next/static/` (vào `.next/static`) + `public/` (nếu có).

## Chạy thử hạ tầng — đã làm 20/11/2026

- [x] Node selector nhận domain `booking.markus.agency` với URI `v2`: tạo `~/booking.markus.agency/v2/.htaccess` (Passenger), không sửa `.htaccess` gốc
- [x] `node_modules` theo **cách 1** chạy được (giống app `markus-sourcing-os`): `~/markus-v2-app/node_modules` là symlink sang `~/nodevenv/markus-v2-app/22/lib/node_modules`
- [x] `.htaccess` gốc không chặn `/v2`: `/v2/x.json`, `/v2/x.txt` do Next trả 404 (không phải 403); chunk `/v2/_next/static/...` trả 200
- [x] App PHP ở `/` và `api.php?r=/session` vẫn 200
- [x] `/v2/api/health`: Node v22.23.4, RSS khoảng 111 MB, MariaDB 10.6.28 OK; lần gọi đầu khoảng 2 giây (khởi động), sau đó khoảng 0,35 giây

Ghi chú:
- Server là **LiteSpeed**, file khởi động là `start.cjs` (thư mục `deploy/`): đọc `~/markus-v2-state/runtime.env` (chmod 600, có `DATABASE_URL`) rồi chạy `server.js`. Không đặt biến môi trường bí mật trong Node selector, vì `cloudlinux-selector get` in chúng ra.
- Build phải làm trong container Linux (`node:22-bookworm`); bản build trên Windows có `sharp-win32` sẽ không chạy trên hosting.
- Từ bản 0.2.0, `/v2/api/health` chỉ trả `{ok, db.ok}` cho người ngoài; phiên bản Node/MariaDB chỉ trả cho admin.
- **Không dùng vitest ≥ 4.1**: npm 10 (đi kèm Node 22, cũng là bản trên hosting) lỗi `Cannot read properties of null (reading 'edgesOut')`. Đang ghim 4.0.18.
- `package-lock.json` phải tạo trong container Linux (`npm install --package-lock-only`); lock tạo trên Windows thiếu gói tuỳ chọn của Linux và `npm ci` trên Linux sẽ từ chối.

## Deploy một bản mới

```
# ở máy: build Linux, đóng 2 gói (app không có node_modules + deps riêng)
docker run --rm -v <platform>:/src:ro -v <out>:/dst node:22-bookworm sh -c "npm ci && npm run build && <đóng gói>"
#   v2-app.tar.gz  = .next/standalone (bỏ node_modules) + .next/static + start.cjs + drizzle/ + dist/migrate.cjs
#   v2-deps.tar.gz = node_modules của standalone
# trên hosting
tar -C ~/markus-v2-app -xzf v2-app.tar.gz
tar -C ~/nodevenv/markus-v2-app/22/lib/node_modules -xzf v2-deps.tar.gz   # khi đổi thư viện
~/nodevenv/markus-v2-app/22/bin/node ~/markus-v2-app/dist/migrate.cjs    # đọc DATABASE_URL từ runtime.env
cloudlinux-selector restart --json --interpreter nodejs --app-root markus-v2-app
```

**Quyền file:** app root, `.next` và thư viện phải là 755 (thư mục) / 644 (file), giống 2 app Node khác. Đừng giải nén dưới `umask 077`: ngày 20/11 làm vậy khiến LiteSpeed tiếp tục chạy bản build cũ (kể cả sau `stop`/`start`) cho tới khi trả quyền 755/644. Chỉ `runtime.env` để 600. Sau khi deploy, kiểm tra `GET /v2/api/auth/session` trả 401 (bản mới) chứ không phải 404.

Đã deploy 0.2.0 ngày 20/11/2026: migrate 16 bảng lên `thestvco_markus_v2` (chưa có dữ liệu creator; script nhập Sheet chưa làm). Bản sao lưu trước deploy: `~/markus-v2-state/app-backup-20261120-220728.tgz`, `deps-backup-…`, `runtime.env.bak-…`.

`runtime.env` cần thêm trước khi bật đăng nhập: `APP_ORIGIN=https://booking.markus.agency`, `GOOGLE_CLIENT_ID` (cùng Client ID app PHP đang dùng), `SHEET_ID`, `GOOGLE_SA_PATH` (đường dẫn file khoá tài khoản dịch vụ trên server). Không chép các giá trị này ra máy dev.

Thử bản đóng gói ở máy giống hosting: thư mục thư viện phải tên đúng là `node_modules` (vd. `/venv/lib/node_modules`) rồi symlink vào app root. Nếu giải nén vào thư mục tên khác thì Next báo thiếu `styled-jsx`.

## Quay lại

Xoá app trong Node selector + thư mục `~/booking.markus.agency/v2` + DB `thestvco_markus_v2`. App PHP không bị đụng tới.

## Nhập Sheet định kỳ (cron, bật 21/11/2026)

- Script: `deploy/import-cron.sh`, bản đang chạy ở `~/markus-v2-state/import-cron.sh` (ngoài thư mục app, deploy không ghi đè). Sửa script thì chép lại bằng `scp`.
- Lịch: `*/15 * * * * /bin/bash /home/thestvco/markus-v2-state/import-cron.sh`. Mỗi lần khoảng 3 giây; `flock` chặn hai lần chạy chồng nhau.
- Log: `~/markus-v2-state/import.log` (chỉ số đếm, giữ 2.000 dòng cuối). Mỗi lần chạy cũng ghi 1 dòng vào bảng `sync_runs`.
- Tắt: xoá dòng đó khỏi crontab. **Sửa crontab luôn bằng file** (`crontab -l > file`, sửa, `crontab file`); dạng `… | crontab -` từng làm mất các dòng khác trên hosting này.
- Bộ nhập tự dừng nếu số creator giảm quá 20% so với lần trước (Sheet đọc thiếu), để không xoá nhầm dữ liệu.

## AI (DeepSeek) — bật 21/11/2026

- Dùng chung tài khoản DeepSeek với app PHP: `runtime.env` có `DEEPSEEK_KEY_PATH=/home/thestvco/booking.markus.agency/hosting/deepseek-key.txt` (chỉ đường dẫn; Node đọc khoá lúc gọi). Khi đổi khoá DeepSeek chỉ cần thay nội dung file đó.
- `POST /v2/api/ai/search`: câu tìm kiếm → bộ lọc. Chỉ gửi câu hỏi + danh mục giá trị cho phép, không gửi dữ liệu creator. Lỗi / quá 12 giây → UI dùng bộ đọc theo luật.
- `POST /v2/api/ai/agent` (vai trò có quyền sửa): trợ lý lên campaign, công cụ chạy ở server theo quyền người dùng. Gửi cho DeepSeek tên, ngành, khu vực, tier, follower, trạng thái quan hệ và (nếu có quyền) giá; **không bao giờ** gửi liên hệ hay ghi chú. AI chỉ đề xuất; người dùng bấm mới thêm vào Ứng viên.
- Giới hạn: 30 lượt tìm / 15 lượt trợ lý mỗi người mỗi phút; mỗi lượt ghi 1 dòng `audit_log` (`ai.search`, `ai.agent`).

## Đường dẫn UI theo mã build (21/11/2026)

- UI được phục vụ ở `/v2/a/<BUILD_ID>/` (file thật nằm ở `public/app`, Next rewrite sang). `/v2` và `/v2/app/` chuyển hướng tới bản hiện tại; mã build cũ cũng chuyển về bản hiện tại; phần `#/...` của link được giữ.
- Lý do: Passenger/LiteSpeed phục vụ thẳng thư mục `public/` và bỏ qua `headers()` của Next lẫn `.htaccess`, nên file JS không có `Cache-Control` và trình duyệt chạy code cũ sau deploy. Đường dẫn đổi theo build thì file được cache 1 năm (`immutable`) mà không bao giờ cũ.
- Code UI không được viết cứng `/v2/app/...`; dùng đường dẫn tương đối (gốc là `<base href>`).
- `deploy/package.sh` xoá gói cũ trước khi build: build lỗi thì không còn gì để đẩy nhầm lên hosting. Chạy deploy bằng `package.sh && … host-deploy.sh` để dừng ngay khi build lỗi.

## Sửa / thêm creator ghi Google Sheet (21–22/11/2026)

- Luồng: v2 gọi PHP CLI `bridge/sheet-write.php` (dùng chính gateway Google, khoá `sheet-write.lock` và mã nhận diện của app cũ) → ghi Sheet → nạp lại Sheet vào MariaDB (`lib/import/run.ts`, cùng logic với cron).
- Bật/tắt: `SHEET_WRITE=on` trong `runtime.env` + restart app. Khi tắt: API trả 503, giao diện ẩn nút "Sửa thông tin" và màn "Thêm creator".
- Không sửa được: tên creator, link kênh (công thức `HYPERLINK`, app cũ nhận diện creator qua đây), `Age`, `Age_Band`, `STT`. Thêm creator ghi link dạng `=HYPERLINK("url","nhãn")` giống các hàng cũ.
- Chống ghi đè: trước khi ghi, kiểm hàng vẫn đúng creator (tên + link); mỗi ô phải còn đúng giá trị lần nhập trước (nếu ai vừa sửa trên Sheet → 409, không ghi, nạp lại giá trị mới); PHP kiểm lại lần nữa dưới khoá.
- Kiểm tra nhanh (admin, chỉ đọc): `GET /v2/api/admin/sheet-check`.
- Sao lưu Sheet: `php bridge/sheet-backup.php` → `~/markus-v2-state/sheet-backup-<thời điểm>.json` (giá trị + công thức + hyperlink). Đã sao lưu 21/11 23:21 trước khi làm tính năng.
- Bản sao thử: Google Sheet "CREATOR_DB – bản thử ghi v2" (id `1vAJPb4a…`), trạng thái nhận diện riêng ở `~/markus-v2-state/php-state-copy/`. Chạy bridge với `MKV2_SHEET_ID=<id bản sao> MKV2_PHP_STATE_DIR=<thư mục đó>`. Bản sao còn 1 hàng thử "ZZ Test v2 …".
