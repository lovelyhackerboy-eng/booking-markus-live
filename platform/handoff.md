# Bàn giao — Markus Creator OS v2

> Viết ngày 25/11/2026, lúc bản **v1.3.0** (commit `56a18f9`, build `-xOEU3X26tXHL_-QLxnYS`) đang chạy production.
> Người đọc: dev tiếp quản **và AI agent của họ**. Mỗi mục đều có đường dẫn file, lệnh chạy được và lý do.
> Kèm theo đây là 3 tài liệu **bắt buộc đọc**:
> - [CLAUDE.md](CLAUDE.md): luật làm việc. Claude Code tự nạp file này.
> - [DEPLOY.md](DEPLOY.md): hạ tầng và deploy.
> - [README.md](README.md): chạy ở máy, bố cục code.

---

## 0. Đọc trong 2 phút

| Câu hỏi | Trả lời |
|---|---|
| **Nền tảng đã đổi?** | **Có.** Từ 25/11/2026, v1 (PHP, thư mục `public/` ở gốc repo) đã ngừng; v2 (`platform/`, Next.js + MariaDB) là bản chính thức. v2 vẫn dùng một số file của v1 trên host. Xem **mục 0b** trước khi làm gì. |
| App là gì? | Công cụ nội bộ của Markus (agency KOL/KOC). Gồm tìm creator, chạy campaign (Nháp → Đang chạy → Hoàn thành), kéo thả tiến độ liên hệ, theo dõi bài đăng, báo cáo, quản trị. |
| Chạy ở đâu? | https://booking.markus.agency/v2. Trang gốc `/` chuyển 302 sang `/v2/`; app PHP cũ (v1) đã ngừng phục vụ web từ 25/11/2026. |
| Stack | Next.js 15 (chỉ làm API và phục vụ file) + **UI bằng JS thuần** trong `ui/` (không dùng React cho giao diện) + Drizzle + MariaDB 10.6 + zod 4. Node 22. |
| Hosting | AZDIGI shared hosting (cPanel, CloudLinux, Passenger trên LiteSpeed). **Gói yếu: 1,5 nhân CPU, 1,5 GB RAM, 120 tiến trình, 12 GB ổ đĩa** cho cả tài khoản (khoảng 20 website). |
| Code | Repo `booking-markus-live`, thư mục `platform/`, nhánh **`v2`**. |
| Dữ liệu creator | Google Sheet `CREATOR_DB` là nguồn chính, nhập vào MariaDB mỗi 15 phút. Sửa creator trên app thì ghi ngược lại Sheet. |
| Đăng nhập | Google Sign-In. Người có trong tab Employees vào ngay (quyền Viewer). Người lạ vào hàng đợi chờ Admin duyệt. Vai trò nằm trong DB, không lấy từ Sheet. |
| Kiểm tra | `tsc` + 131 test vitest (unit + API trên MariaDB thật). Không có CI. |
| Deploy | **Làm tay** từ máy dev qua SSH (mục 4). Không có auto build hay auto deploy. |

---

## 0b. ĐÃ ĐỔI NỀN TẢNG: v1 (PHP) → v2 (Next.js + MariaDB)

> Người tiếp quản cần nắm phần này trước tiên. Repo vẫn chứa cả hai bản. Thư mục `public/` ở gốc repo là **v1 đã ngừng**; chỉ `platform/` là bản đang chạy.

### Mốc thời gian
| Ngày (2026) | Sự kiện |
|---|---|
| 17/11 | Chụp mã nguồn v1 đang chạy vào repo (`public/`, README, SETUP ở gốc) để bàn giao |
| 19–20/11 | Quyết định **không** sửa tiếp v1, chuyển thẳng sang nền tảng mới. v2 0.2.0 chạy song song ở `/v2` |
| 21/11 | Nhập Sheet tự động mỗi 15 phút; AI tìm creator |
| 25/11 | **v2 thành bản chính thức**: `/` và mọi đường dẫn v1 chuyển 302 sang `/v2/`. v1 ngừng phục vụ web (file vẫn giữ). Cùng ngày lên v1.0.0 → v1.3.0 |

### So sánh
| | v1 (đã ngừng) | v2 (đang chạy) |
|---|---|---|
| Mã nguồn | `public/` ở gốc repo (PHP 7.4, JS thuần) | `platform/` (Next.js 15 + TypeScript cho API, UI JS thuần trong `ui/`) |
| Địa chỉ | `booking.markus.agency/` (nay chuyển 302 sang `/v2/`) | `booking.markus.agency/v2` |
| Trên host | Thư mục web `~/booking.markus.agency/` | App Node (Passenger) `~/markus-v2-app/`, gắn vào `/v2` qua `~/booking.markus.agency/v2/.htaccess` |
| Lưu dữ liệu | Google Sheet (đọc thẳng) + file JSON `~/booking-markus-state/db.json` | **MariaDB** `thestvco_markus_v2` (24 bảng). Sheet vẫn là nguồn creator, nhập vào DB mỗi 15 phút |
| Vai trò | Lấy từ cột Role tab Employees (admin / planner / viewer) | Bảng `users` do Admin quản lý (admin / manager / planner / viewer). Sheet chỉ quyết định ai được vào; người lạ vào hàng đợi duyệt |
| Danh sách / Shortlist | Hai màn "Danh sách dự án" và "Shortlist" | Gộp thành **Campaign** (Ứng viên → Liên hệ → Theo dõi → Báo cáo), có vòng đời Nháp / Đang chạy / Hoàn thành |
| Mới chỉ có ở v2 | | Chỉ số view TB / ER, theo dõi bài đăng, báo cáo, Quản trị, hướng dẫn trong app, release note |
| Deploy | Chép file lên thư mục web | Build ở máy dev (`deploy/package.sh`) → `deploy/host-deploy.sh` qua SSH ([DEPLOY.md](DEPLOY.md)) |
| Kiểm tra | Không có test tự động | `tsc` + 131 test vitest |

### Dữ liệu đã chuyển hay chưa (đếm trên production 25/11/2026)
- **Creator:** 587 creator nhập từ Sheet, **giữ đúng mã uid như v1** (v2 đọc qua chính code v1). Sửa hoặc thêm creator trên v2 thì ghi ngược Sheet.
- **Workflow v1** (deal, campaign, nội dung, thanh toán trong `db.json`): **0 bản ghi**, nên không có gì phải chuyển. Campaign và booking hiện có (3 campaign, 0 booking) đều tạo trên v2, chỉ nằm trong MariaDB.
- **Không chuyển (không cần):** phiên đăng nhập, lịch sử AI, activity của v1.

### v2 VẪN DÙNG những phần sau của v1: không được xoá
| Thứ | Ở đâu trên host | v2 dùng để làm gì |
|---|---|---|
| Code PHP `_mk/*.php` | `~/booking.markus.agency/_mk/` | `platform/bridge/*.php` `require` để đọc / ghi Google Sheet (cùng gateway, cùng khoá ghi `sheet-write.lock`) |
| File khoá | `~/booking.markus.agency/hosting/` | Khoá service account Google (`GOOGLE_SA_PATH`) và khoá DeepSeek (`DEEPSEEK_KEY_PATH`) |
| Bảng nhận diện creator | `~/booking-markus-state/db.json` (mục `identity`: 614 mục, `quarantine`: 54) | Job nhập Sheet ghép mỗi dòng Sheet với đúng uid creator. Mất file này thì mã creator có thể bị đổi |
| Google Sign-In | Cùng Client ID với v1 | Cùng origin `booking.markus.agency`, nên dùng chung được. OAuth đang ở chế độ External / Testing (mục 5.2) |
| Google Sheet | `CREATOR_DB` + tab `Employees` | Nguồn creator; danh sách nhân sự được vào thẳng |

**Muốn bỏ hẳn v1** (đề xuất ở mục 8, "Bớt phụ thuộc v1"):
1. Viết lại phần đọc / ghi Sheet bằng Node (service account trực tiếp).
2. Chuyển bảng nhận diện uid vào MariaDB.
3. Chuyển file khoá sang `~/markus-v2-state/`.
4. Chỉ khi cả ba xong mới được xoá `~/booking.markus.agency/` và `~/booking-markus-state/`.

### Quay lại v1 (chỉ khi khẩn cấp)
- Xoá khối `MARKUS V2 IS PRODUCTION` cuối `~/booking.markus.agency/.htaccess`. Bản `.htaccess` trước khi chuyển: `~/markus-v2-state/v1-htaccess-backup-20261125-085812`.
- Campaign, booking, người dùng và vai trò tạo trên v2 **không** có trong v1.
- **Không** deploy lại `public/` từ repo: bản trong repo có placeholder thay cho cấu hình thật (xem cảnh báo mục 4.4).

---

## 1. Chọn model AI khi làm tiếp

- **Thiết kế UI/UX, màn mới, đổi luồng người dùng, sửa responsive:** dùng **Claude Opus bản mới nhất, mức effort `high` trở lên** (`xhigh` hoặc `max` cho màn lớn hoặc khi cần đề xuất nhiều phương án). Phần này cần:
  - nhìn ảnh chụp màn hình,
  - giữ đúng hệ token thiết kế,
  - viết tiếng Việt tự nhiên,
  - nghĩ trước trạng thái rỗng / đang tải / lỗi.

  Model nhỏ hoặc effort thấp thường làm vỡ bố cục hoặc phá hệ token.
- **Logic server, migration, bảo mật, phân quyền:** cũng nên dùng Opus effort `high`. Code đụng tới dữ liệu thật và quyền xem giá / liên hệ.
- **Việc nhỏ, cơ học** (sửa chữ, đổi một nhãn, thêm một test): Sonnet là đủ.
- Sau khi agent sửa giao diện, luôn bắt nó **chụp màn hình ở 1366px, 900px và 375px** và tự soi. Test xanh chưa chứng minh giao diện đúng.

---

## 2. Phong cách thiết kế (đọc trước khi vẽ bất cứ thứ gì)

### 2.1 Tinh thần
- **UX lên đầu.** Người dùng là nhân viên agency không rành kỹ thuật, nên mọi thứ phải dùng được ngay mà không cần hỏi.
- **Toàn bộ chữ là tiếng Việt, câu ngắn, giọng thân thiện.** Nói "bạn", nói rõ việc cần làm ("Chọn vai trò rồi bấm Duyệt"). Không dùng thuật ngữ kỹ thuật trên giao diện.
- **Hành động chính nổi bật** (nút `btn-primary` gradient). Hành động phụ dùng `btn` hoặc `btn-ghost`. Mỗi vùng chỉ có một nút chính.
- **Thao tác nguy hiểm** (xoá, chặn, hoàn thành campaign, bỏ quyền Admin) luôn có hộp xác nhận nói rõ **hậu quả** và **cách hoàn tác**. Không xoá cứng dữ liệu: dùng xoá mềm hoặc trạng thái.
- **Ưu tiên thao tác trực tiếp** (kéo thả kanban, sửa ngay trên bảng). Luôn có đường thay thế cho bàn phím và điện thoại: ô chọn bước trên thẻ, phím Alt + ← →.
- **Có đủ trạng thái** rỗng (`emptyState(kind, title, body)` trong `ui/core/parts.js`), đang tải, và lỗi kèm cách xử lý.
- **Phản hồi ngay** sau mỗi thao tác bằng `toast(title, msg)` trong `ui/core/ui.js`, nói rõ đã xảy ra gì và ở đâu.

### 2.2 Hệ hiển thị (đổi được bằng nút "Creator Pop" trên thanh trên cùng)
| Mã | Tên | Đặc điểm | Mặc định |
|---|---|---|---|
| `pop` | **Creator Pop** | Gradient tươi tím-hồng, bo góc lớn, kiểu sticker, sáng | ✅ mặc định |
| `luxe` | Midnight Luxe | Navy + vàng, panel kính, tối | |
| `bento` | Editorial Bento | Kiểu tạp chí, chữ số cực lớn, sáng | |

- `<html data-style="pop|luxe|bento" data-theme="light|dark">` do script ở đầu `ui/index.html` đặt.
- **Không hard-code màu** ngoài `ui/styles/<huong>.css`. Mọi file CSS khác chỉ dùng token. Danh sách token bắt buộc nằm ở đầu `ui/tokens.css`.
- Font **Be Vietnam Pro** (đủ dấu tiếng Việt). Khoảng cách theo bội số 4 (`--sp-1..12`). Cỡ chữ `--fs-xs..3xl`, `--fs-display`, `--fs-kpi`. Bo góc `--r-*`.
- Icon: chỉ dùng `icon(name, size)` trong `ui/core/icons.js` (nét kiểu Apple). Không nhúng thư viện icon ngoài.
- Thêm một hướng hiển thị mới: làm đủ 3 bước ghi ở đầu `ui/app.js`, gồm file `styles/<ten>.css`, mục `STYLES` và `NATIVE` trong `index.html`.

### 2.3 Bố cục và responsive
- Desktop: sidebar trái (thu gọn được), thanh trên cùng (`.topbar`), nội dung `#main` với `.page`.
- **Điện thoại (≤ 760px):** sidebar ẩn, thay bằng `bottom-nav`. Lớp `hide-m` / `show-m` ẩn hoặc hiện theo màn.
- Bảng `.dt` trên điện thoại tự thành thẻ. Bảng rộng trên desktop thì cuộn ngang trong `.dt-wrap`.
- Hộp thoại dùng `openOverlay({ kind: "modal" | "drawer", ... })`. Trên điện thoại modal hiện thành bottom-sheet.
- **Trước khi coi là xong:** không tràn ngang ở 375px, vùng bấm ≥ 36px, kiểm tra thêm 900px và 1366px.

### 2.4 Hướng dẫn trong app (bắt buộc giữ khi đổi giao diện)
- `ui/core/tour.js`: danh sách `CHECKPOINTS`, mỗi checkpoint có `since` (phiên bản) và `perm` (nếu chỉ một vai trò dùng). Bước chỉ vào phần tử qua `[data-tour="…"]`, không qua class.
- Hướng dẫn chạy trên **dữ liệu mẫu** (`ui/core/demo.js`). Mọi API mới phải có câu trả lời mẫu ở đây.
- Chạy thử phải chứng minh **0 request ghi** (gắn bẫy `fetch`, xem mục 5.3).
- Hộp chào chỉ hiện cho người chưa xem bao giờ. **Deploy không bắt ai xem lại.**
- Bản mới chỉ được báo (hộp "Có gì mới cho bạn") khi có dòng `new` hoặc `improved` hợp vai trò. Dòng release note dạng `{ t, perm }` chỉ báo cho vai trò đó.

---

## 3. Bản đồ code (để agent tìm nhanh)

```
platform/
  CLAUDE.md            luật dự án (đọc trước)        DEPLOY.md  hạ tầng/deploy        handoff.md  file này
  app/api/**/route.ts  API dưới /v2/api/...  (mỗi route: requireUser / requireWrite + kiểm quyền bằng can())
  app/a/[build]/       phục vụ UI ở /v2/a/<BUILD_ID>/ (đường dẫn theo build để trình duyệt không giữ bản cũ)
  lib/
    auth/              access.ts (ai được vào, hàng đợi) · session.ts (phiên + CSRF) · directory.ts (tab Employees) · google.ts · roles.ts (PERMS)
    admin/             system.ts (uapi gói hosting) · sync-settings.ts (lịch job) · tutorial.ts · users.ts (duyệt/chặn/vai trò)
    campaigns/         repo.ts (ai thấy campaign nào — visibleWhere) · write.ts (mọi thao tác) · steps.ts (bước liên hệ tuỳ chỉnh)
    creators/          serialize.ts = NƠI DUY NHẤT định hình dữ liệu creator gửi client, mỗi cột có lớp public/price/contact/hidden
    metrics/           youtube.ts (đọc trang kênh + RSS) · compute.ts (view TB, ER) · service.ts · job.ts (job theo giờ)
    posts/             service.ts (theo dõi bài đăng, tự tìm video YouTube)
    reports/campaign.ts  campaignReport, overviewReport
    sheet/ import/     nhập Sheet → MariaDB, ghi ngược Sheet (qua bridge PHP)
    ai/                DeepSeek: tìm creator bằng câu tự nhiên, trợ lý campaign (chỉ đề xuất, không tự ghi)
    db/schema.ts       toàn bộ bảng · seed-data.ts (dữ liệu GIẢ cho máy dev/test)
  drizzle/*.sql        migration (npm run db:generate, commit cùng code; host-deploy.sh tự chạy)
  ui/                  giao diện JS thuần — copy sang public/app khi dev/build (scripts/copy-ui.mjs)
    app.js             khung app, NAV, route, đổi phong cách
    core/              store.js (state + API) · router.js · ui.js (toast, overlay, menu) · parts.js · tour.js · demo.js · icons.js · feedback.js
    views/             mỗi màn một file: discovery, campaigns, campaign-settings, tracking, reports, profile, clips, admin, about, login…
    data/              live.js (api(), FEATURES) · releases.js (release note) · catalog.js
    tokens.css layout.css components.css views.css styles/{pop,luxe,bento}.css
  bridge/*.php         chạy trên host bằng PHP CLI, dùng code _mk/ của v1 để đọc/ghi Google Sheet
  deploy/              package.sh · host-deploy.sh · import-cron.sh · metrics-cron.sh · start.cjs
  scripts/             migrate, seed, import-sheet, metrics-cron, sync-gate, dev-session, copy-ui
  tests/               api.test.ts (MariaDB thật, kiểm tra lộ dữ liệu theo vai trò) · unit/*
```

Tài liệu kế hoạch và lịch sử quyết định nằm ngoài repo, ở `D:\AFETECH\Markus-KOL_manager\ux-redesign\`:
- `PLAN-MVP-VA-LO-TRINH.md`: lộ trình, mục 7, 8, 10.4, 13.
- `prototype/DESIGN-NOTES.md`.
- `BAO-CAO-TONG-HOP.md`.

---

## 4. Quy trình làm việc, nhánh, build và deploy

### 4.1 Nhánh và remote
- Làm trên nhánh **`v2`**. Remote **`fork`** = `lovelyhackerboy-eng/booking-markus-live` (đẩy lên đây).
- Remote `origin` = `datfam121-collab/booking-markus-live`: **không có quyền push**. `origin/main` là bản chụp mã nguồn v1 (PHP).
- **Chưa từng mở PR / merge vào `main`.** Muốn gộp thì hỏi chủ repo trước.
- Commit theo kiểu conventional (`feat(v2): …`, `fix(v2): …`). **Không** thêm dòng `Co-Authored-By` của AI agent.

### 4.2 Tự động build / deploy khi merge
**Chưa có gì.** Repo không có `.github/workflows`, không CI, không auto build, không auto deploy. Merge hay push nhánh nào cũng **không** làm gì trên server.
- Đề xuất cho phase sau, khi có thời gian: GitHub Actions chạy `tsc` + `vitest` (cần service MariaDB) trên mỗi PR vào `v2`.
- Deploy vẫn nên làm tay. Hosting chỉ vào được bằng SSH key, và gói quá yếu để build trên host.

### 4.3 Trước mỗi commit
```
npx tsc --noEmit -p .
TEST_DATABASE_URL=mysql://markus:markus-dev@127.0.0.1:3307/markus_v2_test npx vitest run     # phải xanh 100%
```

### 4.4 Deploy (chạy từ máy dev, Git Bash, trong `platform/`)
> ⚠️ **Chỉ deploy v2.** **Không bao giờ** chép thư mục `public/` ở gốc repo (mã nguồn v1 PHP) lên `~/booking.markus.agency/`. README và SETUP ở gốc repo là tài liệu **lịch sử** của v1, không làm theo. Chép `public/` lên sẽ:
> - ghi đè `.htaccess`, làm mất chuyển hướng: **v1 chạy lại ở `/`**;
> - thay `_mk/*.php` bằng bản placeholder: **hỏng job nhập Sheet và ghi Sheet của v2**.
>
> Gói v2 chỉ giải nén vào `~/markus-v2-app/`.
Luật bắt buộc ([CLAUDE.md](CLAUDE.md) mục 2): **tăng `version` trong `package.json`** và **thêm release note ở đầu `ui/data/releases.js`**, cả hai trong cùng commit. Tính năng mới thì kèm **bước hướng dẫn** trong `tour.js` và **câu trả lời mẫu** trong `demo.js`.
```
# 1. sao lưu DB trên host (bắt buộc nếu có migration mới) — xem DEPLOY.md, đọc DATABASE_URL từ ~/markus-v2-state/runtime.env
# 2. đóng gói trong container Linux (cần Docker Desktop đang chạy)
MSYS_NO_PATHCONV=1 bash deploy/package.sh
# 3. chép gói lên host
scp -P 2210 -i ~/.ssh/id_ed25519 deploy/out/v2-app.tar.gz deploy/out/v2-deps.tar.gz deploy/out/BUILD_ID thestvco@hf41-22013.azdigihost.com:markus-v2-state/
# 4. deploy (DEPS=0 khi không đổi thư viện): tự sao lưu app, chạy migration, khởi động lại, kiểm tra đúng BUILD_ID → in DEPLOY_OK
ssh -p 2210 -i ~/.ssh/id_ed25519 thestvco@hf41-22013.azdigihost.com 'DEPS=0 bash -s' < deploy/host-deploy.sh
# 5. kiểm tra
curl -s https://booking.markus.agency/v2/api/version
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" https://booking.markus.agency/   # phải là 302 …/v2/ (v1 vẫn tắt)
```
- **Người mới cần SSH key của riêng mình:** chủ tài khoản thêm public key ở cPanel → SSH Access. Cổng **2210** (cổng 22 bị chặn).
- Quay lại bản trước: sao lưu app nằm ở `~/markus-v2-state/app-backup-*.tgz` (giữ 3 bản), DB ở `db-backup-*.sql.gz`.
- Bỏ chuyển hướng `/` → `/v2`: xoá khối `MARKUS V2 IS PRODUCTION` cuối `~/booking.markus.agency/.htaccess`. Bản sao lưu: `~/markus-v2-state/v1-htaccess-backup-20261125-085812`.

### 4.5 Job tự động trên host (crontab)
| Lịch cron | Script (bản chạy thật nằm ở `~/markus-v2-state/`) | Việc |
|---|---|---|
| `*/15 * * * *` | `import-cron.sh` | Nhập Sheet → MariaDB (qua `dist/sync-gate.cjs`, theo lịch Admin đặt) |
| `17 * * * *` | `metrics-cron.sh` | Đọc chỉ số YouTube + tự tìm bài đăng campaign. Chạy tay: `node dist/metrics-cron.cjs --force --batch=N` |

Lịch thật do Admin đặt ở **Quản trị → Đồng bộ tự động**; cron chỉ "đánh thức" job. Sửa `deploy/*-cron.sh` thì **phải chép lại** vào `~/markus-v2-state/`. Sửa crontab: sao lưu trước rồi cài từ file (`crontab file`). **Không** dùng `(crontab -l; …) | crontab -`: lệnh này từng xoá sạch crontab trên host.

---

## 5. Điều cần biết trước khi làm (bẫy đã gặp)

### 5.1 Dữ liệu và bảo mật
- **Máy dev không có dữ liệu thật.** Chỉ có seed giả (`npm run db:seed`). Không kéo số điện thoại, email, ghi chú của creator về máy.
- Trên host chỉ in **số đếm**, không bao giờ in dữ liệu cá nhân.
- Secrets chỉ nằm trên server, ở `~/markus-v2-state/runtime.env` (quyền 600).
  - Không chạy `cloudlinux-selector get`: lệnh này in cả biến môi trường bí mật.
  - Không chép PHP hay config của repo lên server: repo dùng placeholder, server có giá trị thật.
- **Không xoá, không di chuyển** thư mục v1 `~/booking.markus.agency/`. Bridge PHP `require` `_mk/*.php` ở đó, và file khoá service account cùng DeepSeek nằm ở `hosting/`.
- Giá (`price`) và liên hệ (`contact`) chỉ gửi cho vai trò có quyền. Thêm cột creator thì phân lớp trong `lib/creators/serialize.ts` (thiếu là typecheck báo lỗi). `tests/api.test.ts` kiểm tra JSON thô gửi cho viewer không lộ gì.
- Không ghi vào cột công thức hay cột nhận diện trên Sheet (tên creator, link kênh `HYPERLINK`, `STT`, `Age*`).

### 5.2 Quyền truy cập (từ v1.3.0)
- Bị chặn thì không vào được, kể cả có trong Sheet.
- Có trong tab Employees, hoặc được Admin duyệt, thì vào được.
- Mọi email Google còn lại (đã xác minh) vào **hàng đợi**, tối đa 300.
- Lần đăng nhập đầu luôn là **Viewer**. Admin đổi vai trò ở Quản trị → Người dùng.
- Không tự đổi hay tự chặn chính mình; app luôn giữ ít nhất một Admin.
- **Cần xử lý để người ngoài vào được hàng đợi:** theo `SETUP.md` của v1, dự án Google OAuth đang ở chế độ **External / Testing**. Ở chế độ Testing chỉ email có trong danh sách **test users** mới đăng nhập được; người khác bị Google chặn ngay ở bước đăng nhập, trước khi tới hàng đợi của app. Muốn mở cho mọi email Google, chủ dự án cần vào Google Cloud Console → OAuth consent screen → **Publish app** (In production). Ứng dụng chỉ xin `openid email profile` nên thường không cần Google xét duyệt. Hoặc thêm từng email vào test users (tối đa 100).

### 5.3 Môi trường dev trên Windows
- Chạy dev: `npm run dev` (cổng 3100). Biến môi trường dùng `DATABASE_URL=mysql://markus:markus-dev@127.0.0.1:3307/markus_v2`, `DIRECTORY=db`, `APP_ORIGIN=http://localhost:3100`. Có sẵn trong `.claude/launch.json` (tên `markus-v2-dev`).
- Đăng nhập ở máy không cần Google: `node scripts/dev-session.mjs admin@markus.test` in ra giá trị cookie. Đặt cookie `mkv2_sid` với `path=/v2`. Phiên hết hạn sau 8 giờ không dùng.
- **Docker Desktop hay treo khi khởi động** ("still starting", hoặc pipe `dockerDesktopLinuxEngine` không tồn tại). Đã xảy ra 4 lần. Cách sửa:
  1. `docker desktop stop`
  2. Tắt các tiến trình Docker
  3. `wsl --shutdown`
  4. **Đổi tên** thư mục `%LOCALAPPDATA%\Docker\run` (socket cũ)
  5. `docker desktop start`
  6. `docker start mkv2-db`
- Git Bash: heredoc chứa dấu `'` bị lỗi "unexpected EOF". Viết script ra file rồi chạy.
- Plugin `osdlc-dev` của Claude Code có hook chặn commit (`block-protected-branch-commit.sh`), từng hỏng (exit 70) và chặn mọi lệnh commit/push. Hiện **đã tắt**. Tắt plugin xong phải **mở session mới** mới có tác dụng.
- Kiểm tra hướng dẫn không ghi dữ liệu: trong console, bọc `window.fetch` để ghi lại method, chạy hết tour, rồi xác nhận không có request nào khác `GET`.

### 5.4 Hosting
- `os.cpus()`, `os.totalmem()`, `df` cho thấy **máy chủ vật lý dùng chung** (48 nhân, 125 GB). Đó **không** phải tài nguyên của gói. Giới hạn thật lấy từ `/usr/bin/uapi --output=json ResourceUsage get_usages` (`lib/admin/system.ts`).
- Không chạy `next build` trên host (RAM không đủ). Luôn build ở máy dev bằng `deploy/package.sh`.
- Giải nén file trên host với quyền 755/644. Quyền 700/600 làm LiteSpeed tiếp tục chạy bản build cũ; `host-deploy.sh` đã xử lý việc này.
- `stderr.log` của app đầy `ERR_SERVER_NOT_RUNNING`: chỉ là thông báo khi Passenger tắt app, vô hại.

---

## 6. Lỗi giao diện đang tồn tại (chưa sửa)

Đo trên bản v1.3.0 ở máy dev, ngày 25/11/2026, bằng cách đổi chiều rộng cửa sổ.

### 6.1 Thanh trên cùng vỡ khi thu hẹp chiều ngang — **ưu tiên 1**
**Tái hiện:** đăng nhập bằng Admin, mở `#/kham-pha`, kéo chiều rộng cửa sổ về khoảng 761–1300px.

| Chiều rộng | Hiện tượng (đo được) |
|---|---|
| 1366px | Ổn |
| 1300px | Nút "Hỏi AI hoặc ra lệnh…" bắt đầu bị ép (cần 216px, chỉ được 190px) |
| 1180px | Nút Hỏi AI chỉ còn 130px, chữ tràn ra ngoài nút |
| 1024px | Nút Hỏi AI còn 53px; chữ "Hỏi AI hoặc ra lệnh…" **đè lên tên người dùng** |
| 900px / 780px | Nút Hỏi AI còn 25px; nút sáng/tối bị ép còn 21px; **nút "Ứng viên" tràn khỏi màn hình (mép phải 917px), trang cuộn ngang** |
| 375px (điện thoại) | Thanh rộng 386px > 375px; nút "Creator Pop" bị ép còn 19px, nút sáng/tối 21px; nút "Góp ý" bị cắt ở mép phải |

**Nguyên nhân** (`ui/layout.css`, khoảng dòng 54–75 và 128–169):
- Ở 761–1300px, thanh phải chứa 8 mục có chiều rộng cố định. Các mục gồm: tên người dùng + "Đăng xuất" (khoảng 206px), "Creator Pop" (124px), "Hướng dẫn" (129px), "Góp ý" (97px), "Ứng viên" (143px).
- Sidebar chiếm thêm `--rail-w` 92px (thu gọn, mặc định) hoặc `--rail-w-open` 240px (mở rộng). Mở sidebar hay mở AI Copilot (thêm cột `--copilot-w`) thì thanh vỡ ở cửa sổ rộng hơn nữa. Các số đo trong bảng trên là với sidebar thu gọn.
- Chỉ nút `.ask` được co. `.ask-text` có `white-space: nowrap` nhưng không có `overflow: hidden` / `text-overflow: ellipsis`, nên chữ tràn ra.
- Bố cục gọn kiểu điện thoại chỉ bật ở `max-width: 760px`. Khoảng giữa 761px và 1300px không có breakpoint nào.
- Ở 375px vẫn còn quá nhiều nút: AI, tên + Đăng xuất, phong cách, sáng/tối, Hướng dẫn, Góp ý.

**Hướng sửa đề xuất** (dùng Opus effort high, chụp màn hình trước và sau ở 1366, 1180, 1024, 900, 780, 375px):
1. Gom các mục phụ (đổi phong cách, sáng/tối, Đăng xuất, Giới thiệu) vào **một menu ở avatar người dùng** (`openMenu` trong `ui/core/ui.js`). Thanh chỉ giữ: Hỏi AI, Hướng dẫn, Góp ý, Ứng viên, avatar.
2. Thêm breakpoint trung gian, ví dụ ≤ 1280px: "Hướng dẫn", "Góp ý", "Ứng viên" chỉ còn icon (+ số đếm), có `title` / `aria-label`.
3. `.ask`: đặt `min-width: 40px; overflow: hidden`, thêm `text-overflow: ellipsis` cho `.ask-text`, và ẩn chữ khi quá hẹp.
4. Mọi nút icon dùng `flex: none` để không bị ép dưới 36px.
5. Kiểm tra `document.documentElement.scrollWidth <= innerWidth` ở mọi breakpoint.

Lưu ý: khi đổi thanh trên cùng, sửa luôn các bước hướng dẫn chỉ vào `#btn-help`, `#btn-feedback`. Có thể cần thêm `data-tour` cho các nút này.

### 6.2 Các chỗ UI bị dính hoặc đè nhau
| # | Ở đâu | Hiện tượng | Gợi ý sửa |
|---|---|---|---|
| 1 | Thanh trên cùng | Xem 6.1: chữ nút AI đè tên người dùng | 6.1 |
| 2 | Khám phá, điện thoại 375px | Thanh dính đáy "N ứng viên · Ước tính KPI" **che mất nút "Đã lưu ở … campaign"** của thẻ creator cuối khi cuộn | Thêm `padding-bottom` cho danh sách bằng chiều cao thanh dính, hoặc dùng `scroll-padding-bottom` |
| 3 | Campaign → Liên hệ (kanban), cột hẹp (cửa sổ khoảng 900px) | Trên thẻ creator, ô chọn bước bị cắt chữ ("Đã liên hệ qu…"), "4 ngày trước" rớt dòng dính sát bên cạnh | Đưa ô chọn bước xuống một dòng riêng, rộng 100%, khi cột hẹp hơn khoảng 260px; hoặc dùng container query |
| 4 | Mẫu `.card-head` có tiêu đề + mô tả dài cùng hàng | Tiêu đề bị ép xuống nhiều dòng và đè lên mô tả. Đã sửa ở Quản trị → Người dùng (tách mô tả thành `<p class="users-hint">`); **các thẻ khác dùng cùng mẫu vẫn có thể bị** | Rà `card-head` trong `ui/views/*.js`; mô tả dài thì để dòng riêng dưới tiêu đề |
| 5 | Sidebar | Số đếm (badge) ở Booking và Quản trị nằm đè lên góc icon | Kiểm tra lại với người dùng: cố ý hay lỗi? Nếu lỗi thì dời badge ra góc phải mục menu |
| 6 | Hero của Khám phá | Hàng ví dụ và lớp trang trí `.hero-aurora` vượt mép phải | Hàng ví dụ là thanh cuộn ngang nên **đúng thiết kế**. `.hero-aurora` cần `overflow: hidden` ở khung cha nếu thấy thanh cuộn ngang |

> Chủ dự án báo "1 số bug UI đang bị dính vào nhau". Các mục trên là những chỗ **đã tái hiện được**. Nên xin thêm ảnh chụp màn hình từ người dùng (nút **Góp ý** trong app tự ghi kèm màn hình, vai trò, phiên bản; Admin xem ở Quản trị → Góp ý) để không sót.

Cách tự rà nhanh: trong console ở từng màn, tìm phần tử có `scrollWidth > clientWidth` mà `overflow: visible`, và các phần tử anh em trong cùng `.row-wrap` / `.card-head` / `.topbar` có hình chữ nhật đè nhau. Lặp ở 1366, 1024, 900 và 375px.

### 6.3 Dữ liệu cần người sửa trên Sheet
3 kênh YouTube có link `@handle` không còn tồn tại (YouTube trả 404): `@ElyItCleanTrenYoutube`, `@maiphamofficcal7136`, `@chaychanhcungshu`. Danh sách cập nhật ở Quản trị → Hệ thống → "kênh YouTube không đọc được chỉ số".

---

## 7. Báo cáo: hiện trạng và cần phát triển thêm

### 7.1 Đang có (`lib/reports/campaign.ts`, `ui/views/reports.js`, tab "Báo cáo" trong campaign)
- **Báo cáo campaign:**
  - View đã giao so với KPI, phễu liên hệ theo bước, bảng từng creator (bài, view, tương tác, ER).
  - Chi phí / CPV / CPM: chỉ vai trò có quyền giá mới thấy.
  - Biểu đồ "View theo ngày đăng".
  - Xuất CSV, in PDF bằng chức năng in của trình duyệt.
- **Báo cáo tổng quan** (`#/bao-cao`): tổng campaign theo trạng thái, top 10 creator nhiều view nhất, bảng theo người phụ trách (Quản lý và Admin).
- Nguồn số liệu:
  - Bài đăng tự tìm (YouTube) hoặc nhập tay (TikTok, Facebook, Instagram).
  - Chỉ số kênh tính từ clip gần nhất.
  - Bảng `post_snapshots` **đã lưu lịch sử số view theo thời gian nhưng chưa dùng** trong báo cáo.

### 7.2 Còn đơn giản: đề xuất phát triển (theo thứ tự giá trị / công sức)
1. **Bộ lọc thời gian và so sánh kỳ:** theo khoảng ngày, theo tháng / quý, so với kỳ trước. Hiện tại báo cáo tổng quan cộng dồn mọi lúc.
2. **Đường tăng trưởng của từng bài** từ `post_snapshots`: view sau 24h / 72h / 7 ngày, phát hiện bài "chững". Hiện chỉ có tổng theo ngày đăng.
3. **Theo nền tảng:** view, ER, CPV tách TikTok / YouTube / Facebook / Instagram; theo tier (nano → mega); theo ngành.
4. **Báo cáo theo brand / khách hàng:** gộp mọi campaign của một brand; xu hướng qua các lần chạy.
5. **Link báo cáo cho khách (brand):** link có token và hạn dùng, chỉ xem, không lộ giá creator hay liên hệ, có watermark. Đã có trong lộ trình (PLAN mục 7, đợt 3.1).
6. **Hiệu quả creator theo thời gian:** lịch sử qua các campaign (view trung bình đã giao so với dự kiến, đúng hạn, CPV), làm cơ sở gắn nhãn Preferred / Watchlist.
7. **Dự báo:** từ view dự kiến của creator đã chốt và tốc độ hiện tại, ước lượng ngày đạt KPI và cảnh báo sớm khi thiếu.
8. **Xuất đẹp:** PDF có bố cục báo cáo (logo khách, biểu đồ), Excel nhiều sheet; gửi email định kỳ hằng tuần.
9. **Biểu đồ:** dùng chung một bộ màu theo token (`--chart-line`, `--g*`), có chú thích. Hiện chỉ có biểu đồ đơn giản.

Khi làm báo cáo mới:
- Giữ nguyên tắc quyền: **mọi trường tiền chỉ gửi khi `can(role, "price")`**, và test API kiểm tra viewer không nhận được.
- Thêm checkpoint hướng dẫn và câu trả lời mẫu trong `demo.js`.

---

## 8. Hướng phát triển nền tảng cho các phase tiếp theo

Lộ trình gốc: `ux-redesign/PLAN-MVP-VA-LO-TRINH.md` mục 8 và 10.4. Đề xuất thứ tự từ hiện trạng:

| Phase | Nội dung | Ghi chú kỹ thuật |
|---|---|---|
| **Ổn định UI (làm ngay)** | Mục 6: thanh trên cùng, chỗ dính nhau, rà responsive toàn bộ màn | Opus high; chụp màn hình 4 chiều rộng |
| **Báo cáo v2** | Mục 7.2, các điểm 1–4 | Dùng `post_snapshots`; thêm index theo `posted_at` nếu chậm |
| **Chỉ số đa nền tảng** | TikTok / Instagram / Facebook hiện nhập tay. Cân nhắc vendor dữ liệu (EchoTik, Modash…) hoặc API chính thức (IG Business Discovery) | Chạy thử vendor với khoảng 100 creator trước khi mua. Job chạy trong `lib/metrics/job.ts`, giới hạn lô và tốc độ vì gói yếu |
| **Hồ sơ cho khách / creator** | Link báo cáo cho brand; cổng creator nộp link bài và insight (vào hàng chờ duyệt) | Tận dụng cơ chế hàng đợi và duyệt vừa làm cho người dùng |
| **Mô hình dữ liệu "người"** | Tách `people`, `organizations`, `affiliations`, `relationships`, `interactions` (PLAN mục 10.4) để mở rộng sang khách hàng, talent, freelancer | Làm **trước** khi dữ liệu phình to; cần migration dữ liệu creator hiện có |
| **Bớt phụ thuộc v1** | Viết lại phần đọc/ghi Google Sheet bằng Node (service account trực tiếp) để bỏ `bridge/*.php` và thư mục v1 | Khi xong mới được xoá `~/booking.markus.agency/` |
| **Hạ tầng** | Khi người dùng hoặc dữ liệu tăng: chuyển sang VPS (Node + MariaDB/PostgreSQL + worker), thêm CI | Gói shared hiện tại chỉ 1,5 nhân / 1,5 GB cho cả tài khoản |

Nguyên tắc khi thêm tính năng (tóm tắt [CLAUDE.md](CLAUDE.md)):
1. Server quyết định quyền. Client chỉ ẩn hoặc hiện.
2. Mọi thay đổi dữ liệu đi qua `requireWrite` (kiểm tra CSRF và origin), có audit log nếu là thao tác quản trị.
3. Xoá là xoá mềm.
4. Có test API cho quyền.
5. Có bước hướng dẫn + câu trả lời mẫu + release note gắn `perm` đúng.
6. Chụp màn hình desktop và điện thoại trước khi coi là xong.

---

## 9. Việc còn treo cần chủ dự án quyết định
- Google OAuth đang ở chế độ **External / Testing**: cần **Publish app** hoặc thêm test users thì người ngoài mới vào được hàng đợi duyệt (mục 5.2).
- Sửa 3 link YouTube hỏng trên Sheet (mục 6.3).
- Sheet `CREATOR_DB` đang chia sẻ "ai có link đều sửa được". Nên thu hẹp lại.
- Từng phát hiện webshell trên một site khác **cùng tài khoản hosting**. Đã khuyến nghị đổi khoá service account Google, mật khẩu cPanel và key DeepSeek; chưa xác nhận đã làm.
- Crontab còn một dòng `wp-cron` chết cho site `91sstore.com` đã xoá.
- Mở PR gộp `v2` vào repo gốc (`origin`) khi chủ repo đồng ý.

---

## 10. Checklist cho agent ở phiên đầu tiên
1. Đọc [CLAUDE.md](CLAUDE.md), file này, [DEPLOY.md](DEPLOY.md), [README.md](README.md).
2. Chạy dev:
   ```
   docker start mkv2-db                 # hoặc docker compose -f docker-compose.dev.yml up -d
   npm ci && npm run db:migrate && npm run db:seed && npm run dev
   ```
3. Chạy `tsc` + `vitest`, xác nhận 131/131 xanh trước khi sửa gì.
4. Đăng nhập bằng `scripts/dev-session.mjs`. Xem các màn: Khám phá, Campaign (4 tab), Báo cáo, Quản trị (6 tab), Giới thiệu.
5. Làm việc theo mục 8. Mỗi lần deploy theo mục 4.4.
