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
