# Markus Creator OS v2 — luật làm việc của dự án

Áp dụng cho mọi thay đổi trong `platform/` (người hay agent đều vậy).

## 1. UX lên đầu
- Mỗi tính năng phải dùng được ngay mà không cần hỏi: nhãn tiếng Việt rõ nghĩa, hành động chính nổi bật, có trạng thái rỗng / đang tải / lỗi dễ hiểu.
- Thao tác nguy hiểm (xoá, hoàn thành campaign…) luôn có hộp xác nhận nói rõ **hậu quả** và **cách hoàn tác**.
- Ưu tiên thao tác trực tiếp (kéo thả, sửa ngay trên bảng) nhưng luôn có đường thay thế cho bàn phím / điện thoại.
- Kiểm tra ở cả desktop và độ rộng điện thoại (375px) trước khi coi là xong: không tràn ngang, nút đủ lớn.

## 2. Mỗi lần deploy bản mới lên server → release note
- Tăng `version` trong `package.json` (semver: tính năng mới → minor, chỉ sửa lỗi → patch).
- Thêm một mục ở **đầu** `ui/data/releases.js` với cùng số phiên bản, ngày deploy và các phần `new / improved / fixed / limits`, viết cho người dùng (không thuật ngữ kỹ thuật).
- Màn Giới thiệu (`#/gioi-thieu`) hiện release note; người dùng thấy thông báo "Có bản mới" một lần.
- **Deploy KHÔNG bắt xem lại hướng dẫn** (luật từ 25/11/2026, thay luật cũ "deploy = về chế độ hướng dẫn"): ai đã xem thì thôi; người chưa xem bao giờ luôn thấy hộp chào. Chỉ nút Admin "Đưa mọi người về hướng dẫn ngay" (snapshot `config.tutorialReset`) mới đặt lại cho mọi người.
- **Chỉ báo bản mới khi có tính năng liên quan tới người dùng**: dòng release note là chuỗi (mọi người) hoặc `{ t, perm }` (chỉ vai trò đó). Chỉ dòng `new` / `improved` hợp vai trò được báo (hộp "Có gì mới cho bạn"); bản chỉ sửa lỗi thì ghi vào `fixed` — không báo ai. Tính năng chỉ Admin dùng → `perm: "admin"`.
- Bước hướng dẫn thêm vào checkpoint cũ phải có `since` riêng trên bước đó: người dùng chỉ được mời xem **các bước mới**, không xem lại cả checkpoint.
- Không deploy nếu hai việc trên chưa có trong cùng commit.

## 3. Tính năng mới hoặc thay đổi giao diện → sinh / sửa hướng dẫn
- Thêm hoặc sửa checkpoint trong `ui/core/tour.js` (`CHECKPOINTS`) trong **cùng** lần release; ghi `since` = phiên bản đưa vào; `perm` nếu chỉ một vai trò dùng được.
- Gắn `data-tour="…"` cho phần tử được chỉ tới thay vì dựa vào class giao diện.
- Nếu màn mới gọi API mới: thêm câu trả lời mẫu trong `ui/core/demo.js` để hướng dẫn chạy được trên dữ liệu mẫu.
- Chạy thử toàn bộ hướng dẫn và xác nhận **không có request ghi nào** lên server trong lúc chạy (bẫy `fetch`).

## 4. Deploy và dữ liệu thật
- Từ 25/11/2026 v2 là bản production chính thức: `/` và mọi đường dẫn cũ của app PHP (v1) chuyển 302 sang `/v2/` (khối `MARKUS V2 IS PRODUCTION` trong `~/booking.markus.agency/.htaccess`). Không xoá / di chuyển file v1: import Sheet (`bridge/*.php`) và file khoá (`hosting/`) vẫn dùng chúng. App vẫn chạy ở basePath `/v2`; deploy như cũ.
- Trước khi deploy: `tsc`, toàn bộ `vitest` (với `TEST_DATABASE_URL`) phải xanh; sao lưu DB trên host trước khi chạy migration mới.
- Quy trình: `MSYS_NO_PATHCONV=1 bash deploy/package.sh` → `scp` gói + `BUILD_ID` → `ssh … 'DEPS=0 bash -s' < deploy/host-deploy.sh` (xem `DEPLOY.md`). Đổi script cron (`deploy/*-cron.sh`) thì chép lại bản ở `~/markus-v2-state/`.
- Đổi crontab: sao lưu trước, cài từ file (`crontab file`), không dùng `(crontab -l; …) | crontab -`.
- Không bao giờ in dữ liệu cá nhân (điện thoại, email, ghi chú) từ server; chỉ số đếm.
- Xoá campaign là xoá mềm (`status = deleted`), không xoá dữ liệu.
- Ai được vào (`lib/auth/access.ts`): bị chặn (`users.status = blocked`) → không bao giờ, kể cả có trong Sheet; có trong tab Employees → vào; được Admin duyệt (`approvedAt`) → vào; còn lại (mọi email Google đã xác minh) → hàng đợi `pending`, không tạo phiên. Admin duyệt (chọn vai trò) / chặn / bỏ chặn (về hàng đợi) ở Quản trị → Người dùng; không xoá dòng `users` nào. Hàng đợi có trần `PENDING_CAP`.
- Vai trò nằm ở bảng `users`, Admin đổi ở Quản trị → Người dùng. Đăng nhập lần đầu luôn là `viewer` (trừ khi DB chưa có admin nào). Không đọc lại vai trò từ Sheet. Không tự đổi / chặn chính mình; luôn còn ít nhất một Admin đang dùng.
- Số liệu hệ thống: chỉ dùng giới hạn gói hosting (`uapi ResourceUsage get_usages`), không dùng `os.cpus()` / `os.totalmem()` / `statfs` (đó là máy chủ vật lý dùng chung).
