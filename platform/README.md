# Markus Creator OS — nền tảng mới (`/v2`)

Next.js 15 + TypeScript + Drizzle + MariaDB 10.6. Chạy trên hosting AZDIGI ở `booking.markus.agency/v2` (xem [DEPLOY.md](DEPLOY.md)).
Kế hoạch: `ux-redesign/PLAN-MVP-VA-LO-TRINH.md` mục 13.

## Chạy ở máy

```
docker compose -f docker-compose.dev.yml up -d        # MariaDB 10.6 ở 127.0.0.1:3307 (+ CSDL test)
npm ci
set DATABASE_URL=mysql://markus:markus-dev@127.0.0.1:3307/markus_v2
npm run db:migrate && npm run db:seed                 # seed = dữ liệu GIẢ của prototype
set TEST_DATABASE_URL=mysql://markus:markus-dev@127.0.0.1:3307/markus_v2_test
npm test                                              # unit + API (API bỏ qua nếu thiếu TEST_DATABASE_URL)
node scripts/dev-session.mjs ngocanh@markus.test      # chỉ ở máy: tạo phiên cho 1 user seed, đặt cookie mkv2_sid (path=/v2) để xem UI theo vai trò
npm run typecheck
```

Máy dev **không** chứa dữ liệu thật: seed chỉ chạy khi host là máy local và tên CSDL không bắt đầu bằng `thestvco_`.

## Bố cục

| Đường dẫn | Nội dung |
|---|---|
| `lib/db/schema.ts` | Bảng. Giá (`rates`) và liên hệ (`contacts`, `notes`) nằm ở bảng riêng |
| `drizzle/*.sql` | Migration (sinh bằng `npm run db:generate`, commit cùng code). `0000` đặt collation `utf8mb4_unicode_520_ci` |
| `lib/auth/` | Google ID token (`google.ts`), tab Employees (`directory.ts`), phiên + CSRF (`session.ts`), vai trò (`roles.ts`) |
| `lib/creators/serialize.ts` | **Nơi duy nhất** định hình dữ liệu creator gửi cho client. Mỗi cột có một lớp `public / price / contact / hidden`; thêm cột mà quên phân lớp thì typecheck báo lỗi |
| `lib/campaigns/repo.ts` | Ai thấy campaign nào — lọc bằng SQL theo từng dòng (owner, thành viên, hoặc quyền `allCampaigns`) |
| `app/api/**/route.ts` | API dưới `/v2/api/...` |
| `ui/` | Giao diện (JS thuần, từ prototype). `npm run dev`/`build` chép sang `public/app/`, phục vụ ở `/v2/app/`. Dữ liệu chỉ qua API; `ui/data/live.js` có cờ `FEATURES` để ẩn phần chưa có dữ liệu |
| `bridge/sheet-export.php` + `scripts/import-sheet.ts` | Nhập Sheet → MariaDB trên hosting: `php bridge/sheet-export.php \| node dist/import-sheet.cjs [--dry-run]` (chỉ in số đếm) |
| `deploy/package.sh`, `deploy/host-deploy.sh` | Đóng gói trong container Linux; deploy có sao lưu, quyền 755/644, migrate và kiểm tra đúng mã build đang chạy |
| `scripts/` | `migrate`, `seed` — được esbuild đóng thành `dist/*.cjs` để chạy trên hosting chỉ với `node` |
| `tests/api.test.ts` | Test API trên MariaDB thật, kiểm tra lộ dữ liệu trên **JSON thô** cho viewer, có đối chứng với planner |

## Vai trò

Từ v1.2.0, vai trò nằm ở bảng `users` (Admin đổi ở Quản trị → Người dùng), **không** đọc từ cột Role của tab Employees. Đăng nhập lần đầu luôn là viewer. Từ v1.3.0: tab Employees hoặc Admin duyệt thì được vào; người lạ vào hàng đợi; bị chặn thì không vào được (`lib/auth/access.ts`).

| Vai trò | Quyền |
|---|---|
| admin | giá, liên hệ, sửa, xác minh, quản trị, mọi campaign |
| manager | giá, liên hệ, sửa, xác minh, mọi campaign |
| planner | giá, liên hệ, sửa, xác minh; campaign của mình + được mời |
| viewer | hồ sơ công khai; campaign được mời |

## API hiện có

| Route | Ai gọi | Ghi chú |
|---|---|---|
| `POST /v2/api/auth/google` `{idToken}` | ai cũng gọi được (cùng origin) | Employees / đã duyệt → 200 + phiên; người lạ → 202 `{pending:true}` (hàng đợi); bị chặn → 403 `blocked` |
| `GET /v2/api/auth/session` | đã đăng nhập | user, role, perms, csrf |
| `POST /v2/api/auth/logout` | đã đăng nhập + `X-CSRF-Token` | |
| `GET /v2/api/creators`, `/v2/api/creators/:id` | đã đăng nhập | Cắt cột theo vai trò |
| `GET /v2/api/campaigns` | đã đăng nhập | Chỉ campaign được phép thấy |
| `GET /v2/api/health` | công khai | Chi tiết (Node, RAM, phiên bản DB) chỉ cho admin |

Biến môi trường: `DATABASE_URL`, `APP_ORIGIN` (vd. `https://booking.markus.agency`), `GOOGLE_CLIENT_ID`, `DIRECTORY` (`sheet` mặc định khi production, `db` ở máy), `SHEET_ID`, `GOOGLE_SA_PATH`.
