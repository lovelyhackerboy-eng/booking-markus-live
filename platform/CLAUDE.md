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
- **Deploy = mọi người về chế độ hướng dẫn**: build mới đổi `tutorialEpoch` (snapshot `config`), mỗi trình duyệt thấy epoch mới thì xoá tiến độ hướng dẫn và mở hộp chào (`welcome()` trong `ui/core/tour.js`). Mặc định bật; Admin tắt hoặc đặt lại ngay ở Quản trị → Đồng bộ tự động. Không tắt cơ chế này trong code khi deploy.
- Không deploy nếu hai việc trên chưa có trong cùng commit.

## 3. Tính năng mới hoặc thay đổi giao diện → sinh / sửa hướng dẫn
- Thêm hoặc sửa checkpoint trong `ui/core/tour.js` (`CHECKPOINTS`) trong **cùng** lần release; ghi `since` = phiên bản đưa vào; `perm` nếu chỉ một vai trò dùng được.
- Gắn `data-tour="…"` cho phần tử được chỉ tới thay vì dựa vào class giao diện.
- Nếu màn mới gọi API mới: thêm câu trả lời mẫu trong `ui/core/demo.js` để hướng dẫn chạy được trên dữ liệu mẫu.
- Chạy thử toàn bộ hướng dẫn và xác nhận **không có request ghi nào** lên server trong lúc chạy (bẫy `fetch`).

## 4. Deploy và dữ liệu thật
- Chỉ deploy lên `/v2`. Đổi `/` sang v2 cần người dùng đồng ý riêng.
- Trước khi deploy: `tsc`, toàn bộ `vitest` (với `TEST_DATABASE_URL`) phải xanh; sao lưu DB trên host trước khi chạy migration mới.
- Quy trình: `MSYS_NO_PATHCONV=1 bash deploy/package.sh` → `scp` gói + `BUILD_ID` → `ssh … 'DEPS=0 bash -s' < deploy/host-deploy.sh` (xem `DEPLOY.md`). Đổi script cron (`deploy/*-cron.sh`) thì chép lại bản ở `~/markus-v2-state/`.
- Đổi crontab: sao lưu trước, cài từ file (`crontab file`), không dùng `(crontab -l; …) | crontab -`.
- Không bao giờ in dữ liệu cá nhân (điện thoại, email, ghi chú) từ server; chỉ số đếm.
- Xoá campaign là xoá mềm (`status = deleted`), không xoá dữ liệu.
