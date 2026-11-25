// data/releases.js — RELEASE NOTE theo phiên bản (mới nhất ở đầu). Hiện ở màn Giới thiệu (#/gioi-thieu) và thông báo
// "Có gì mới" sau khi lên bản mới. QUY TẮC DỰ ÁN (CLAUDE.md): mỗi lần deploy bản mới lên server phải thêm 1 mục ở đây
// và tăng "version" trong package.json cho khớp; tính năng mới / thay đổi phải kèm cập nhật hướng dẫn (core/tour.js).
// Mỗi mục: { version, date (YYYY-MM-DD), title, new[], improved[], fixed[], limits[] } — viết cho người dùng, không kỹ thuật.

export const RELEASES = [
  {
    version: "1.1.1", date: "2026-11-25", title: "Markus Creator OS v2 là bản chính thức",
    new: [
      "Từ hôm nay v2 là bản chính thức: mở booking.markus.agency (hay bất kỳ đường dẫn cũ nào) đều tự chuyển sang app này. Bản cũ không còn dùng nữa.",
    ],
    improved: [
      "Dữ liệu creator vẫn lấy từ Google Sheet CREATOR_DB như trước; campaign, booking và góp ý giữ nguyên.",
    ],
  },
  {
    version: "1.1.0", date: "2026-11-26", title: "Hộp chào & chế độ hướng dẫn rõ ràng hơn",
    new: [
      "Hộp chào khi mở app lần đầu và sau mỗi lần cập nhật: giải thích hướng dẫn hoạt động thế nào, bấm gì để đi tiếp, thoát ra sao.",
      "Sau mỗi lần cập nhật app, mọi người được mời xem lại hướng dẫn từ đầu để không bỏ lỡ thay đổi.",
      "Hộp kết thúc hướng dẫn: báo rõ đã quay về dữ liệu thật và gợi ý việc nên làm tiếp (tìm creator, tạo campaign, gửi góp ý).",
      "Quản trị → Đồng bộ tự động: bật / tắt việc đặt lại hướng dẫn sau mỗi lần cập nhật, hoặc đưa mọi người về hướng dẫn ngay.",
    ],
    improved: [
      "Trong lúc hướng dẫn: thanh tím “Chế độ hướng dẫn” luôn hiện kèm số bước, viền màn hình đổi màu, mỗi bước có dòng “Việc của bạn”.",
      "Thoát hướng dẫn giữa chừng sẽ báo rõ bạn đã về dữ liệu thật và cách mở lại.",
    ],
  },
  {
    version: "1.0.0", date: "2026-11-26", title: "Bản MVP chính thức",
    new: [
      "Vòng đời campaign: Nháp → Đang chạy → Hoàn thành; đặt ngày chạy, ngân sách, mô tả / brief.",
      "Các bước liên hệ tuỳ chỉnh theo từng campaign (đổi tên, thêm, xoá, sắp xếp) và kanban kéo thả creator qua các bước.",
      "Chỉ số tự cập nhật: view trung bình, ER và ảnh đại diện. YouTube đọc tự động; TikTok, Facebook, Instagram nhập vài clip gần nhất. Admin chỉnh được công thức.",
      "Tab Theo dõi: bài đăng của creator đã chốt; YouTube tự tìm video trong khoảng ngày theo dõi, nền tảng khác dán link và nhập số liệu.",
      "Báo cáo campaign (KPI so với view đã giao, phễu liên hệ, từng creator, chi phí / CPV) và màn Báo cáo tổng quan; xuất CSV, in PDF.",
      "Hướng dẫn cho người mới: danh sách checkpoint và tour chỉ từng bước ngay trên màn hình, chạy trên dữ liệu mẫu.",
      "Màn Giới thiệu với release note theo phiên bản.",
      "Quản trị (Admin): tình trạng máy chủ và bộ nhớ, lịch đồng bộ tự động, chạy đồng bộ ngay, hộp góp ý, campaign đã xoá.",
      "Góp ý được lưu trên hệ thống: bạn xem lại được góp ý của mình và trạng thái xử lý.",
    ],
    improved: [
      "Xoá campaign không còn xoá dữ liệu: campaign chuyển sang “Đã xoá”, ẩn khỏi danh sách và báo cáo; Admin khôi phục được. Campaign đã chạy chỉ Admin xoá.",
      "Dữ liệu trên trang tự làm mới theo chu kỳ Admin đặt (mặc định 15 phút).",
      "Tạo “Campaign mới” mở đúng campaign vừa tạo.",
    ],
    limits: [
      "TikTok, Facebook, Instagram chưa đọc tự động được (nền tảng chặn) — nhập tay số liệu clip / bài đăng.",
      "YouTube chỉ trả 15 video mới nhất của mỗi kênh; lượt đầu cần khoảng 8 giờ để đọc hết các kênh.",
    ],
  },
  {
    version: "0.4.0", date: "2026-11-25", title: "Sửa creator ghi ngược Google Sheet",
    new: ["Sửa thông tin và thêm creator ngay trên app, ghi thẳng vào Google Sheet (Sheet vẫn là nguồn chính)."],
    improved: ["Mỗi bản deploy có đường dẫn riêng nên trình duyệt không còn giữ giao diện cũ."],
    fixed: ["Tiêu đề Trợ lý AI hiện mã lạ."],
  },
  {
    version: "0.3.0", date: "2026-11-21", title: "Tìm bằng AI và Trợ lý campaign",
    new: [
      "Tìm creator bằng câu tự nhiên (AI đọc câu và đặt bộ lọc).",
      "Trợ lý AI lên campaign: xếp hạng creator theo brief, đề xuất ứng viên.",
      "Tự nhập dữ liệu từ Google Sheet mỗi 15 phút.",
    ],
    improved: ["Giao diện mặc định Creator Pop; planner xem được thông tin liên hệ trong hồ sơ creator."],
  },
  {
    version: "0.2.0", date: "2026-11-20", title: "Nền tảng mới tại /v2",
    new: ["Ứng dụng mới (thay bản PHP cũ) với đăng nhập Google, dữ liệu creator thật từ Google Sheet, campaign và booking theo phân quyền."],
  },
];
export const CURRENT = RELEASES[0];
