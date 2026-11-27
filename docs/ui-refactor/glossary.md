# Bảng thuật ngữ giao diện CINE (ExamCollect)

Nguồn duy nhất cho chữ hiển thị trên `apps/web` (Hiến chương V: một khái niệm = một cách gọi). Mỗi dòng có cách gọi dùng trên giao diện, cách gọi bị bỏ, và nơi áp dụng. Khi thêm màn mới, dùng cột "Dùng". Khi cần khái niệm chưa có, thêm dòng ở đây trước rồi mới viết chữ.

Trạng thái: các dòng đánh dấu **(đã áp dụng)** đã nằm trong mã từ Giai đoạn 1 (PR #104, #105 và PR chuyển bảng). Dòng **(đề xuất)** là cách gọi nên dùng cho màn viết mới, chưa quét hết mã cũ.

## Quy tắc chung
- Tiếng Việt đủ dấu. Chữ hoa kiểu câu (chỉ hoa chữ đầu câu và tên riêng).
- Nhãn nút là động từ ("Chấm lại", "Chốt điểm phiên"), không phải danh từ.
- Thông báo lỗi nói chuyện gì xảy ra và làm gì tiếp, không lộ mã nội bộ, tên enum, tên biến hay tên trường.
- Không để tiếng Anh nội bộ trên giao diện (`catalog`, `registry`, `queue`, `exact`, `approved`...). Tên riêng sản phẩm (VS Code, Marketplace, Excel, CSV) giữ nguyên.
- Không viết tắt nội bộ: dùng "SV" chỉ trong tiêu đề cột hẹp và phải có `title` đầy đủ.

## Chấm điểm

| Dùng | Bỏ | Ghi chú | Trạng thái |
|---|---|---|---|
| Rubric chung | Question Agnostic | Mục menu Rubric | đã áp dụng |
| Rubric theo câu hỏi | Question Specific | Tiêu đề trang, menu, nút tạo | đã áp dụng |
| AI tự chốt | Tự quyết | Nhóm bài hệ thống tự chốt vì đủ độ tin cậy | đã áp dụng |
| Cần bạn xem | | Nhóm bài cần giảng viên xem | đã áp dụng |
| Kiểm mẫu | | Nhóm bài giảng viên kiểm ngẫu nhiên | đã áp dụng |
| Không chấm được | Lỗi, thất bại | Nhóm bài hệ thống không chấm được; kèm lý do | đã áp dụng |
| Đã duyệt | | Giảng viên đã xem và duyệt | đã áp dụng |
| Đã chốt | | Điểm đã công bố; chốt là mốc công bố, không ghi file | đã áp dụng |
| Đã chốt theo quy tắc cũ | Tự duyệt theo chính sách cũ | Bài chốt trước khi có quy tắc hiện hành | đã áp dụng |
| Chốt điểm phiên | | Một thao tác riêng, không gộp vào ghi file | đã áp dụng |
| Ghi điểm vào sổ điểm | Xuất điểm (khi nói về điền file sổ điểm) | "Xuất CSV" vẫn dùng cho tải file | đã áp dụng |
| Cập nhật mức trừ | Áp giá mới | Áp bảng mức trừ hiện hành cho phiên đã chốt | đã áp dụng |
| Phản biện AI | lượt phản biện | Ý kiến phản biện của AI cho bài làm | đề xuất |
| Danh sách chờ chấm | hàng đợi, queue | Việc chờ máy chủ xử lý | đã áp dụng |
| Chấm lại | Chấm tiếp, chạy lại | Một nút chấm lại duy nhất cho bài lỗi hệ thống và bài bị kẹt | đã áp dụng (nút bị kẹt: PR gộp nút) |
| bài bị kẹt | bài treo, bài không còn ai chấm | Bài còn "đang chấm" nhưng không tiến trình nào xử lý | đã áp dụng |
| lượt kiểm tra | lời gọi (công cụ) | Một lần máy chấm chạy công cụ kiểm tra | đã áp dụng |
| kiểm tra, so sánh | đối chiếu | "Đã kiểm tra: đoạn này có trong bài"; "chưa chạy lại được để so sánh" | đã áp dụng |
| Mức kiểm tra bài | Độ phủ điều tra | Mức độ bài được kiểm tra | đã áp dụng |
| Có đề bài / Chỉ có thang chấm | Mức 2 / Mức 1 | Hai mức dữ liệu đầu vào của lượt chấm | đã áp dụng |
| chấm bằng cách đọc mã, không chạy thử | chấm bằng đọc mã, không chạy | | đã áp dụng |

## Thu bài và phiên thi

| Dùng | Bỏ | Ghi chú | Trạng thái |
|---|---|---|---|
| phiên thi | kỳ thi (khi nói một buổi thi cụ thể) | "Quản lý kỳ thi" là tên mục menu, giữ nguyên | đề xuất |
| lớp học phần | lớp môn | Lớp gắn với môn và học kỳ | đề xuất |
| lớp danh nghĩa | | Lớp hành chính của sinh viên | đã áp dụng |
| bài nộp | | Số bài đã thu của sinh viên ("32/40 bài nộp") | đã áp dụng |
| danh sách chờ kiểm tra file nén | hàng đợi kiểm file nén | | đã áp dụng |
| quản trị viên | admin | Vai trò | đề xuất |
| giảng viên | teacher, GV (trong câu) | "GV" chỉ ở chỗ hẹp, có `title` | đề xuất |

## Quản trị và hệ thống

| Dùng | Bỏ | Ghi chú | Trạng thái |
|---|---|---|---|
| danh mục | catalog | Danh mục môn, máy tính, sinh viên, tiện ích | đã áp dụng |
| tiện ích | extension | Tiện ích VS Code trong "Tiện ích IDE" | đã áp dụng (PR chuyển bảng) |
| nhà phát hành | Publisher | Của tiện ích | đã áp dụng (PR chuyển bảng) |
| mã định danh | Identifier | Của tiện ích | đã áp dụng (PR chuyển bảng) |
| đúng phiên bản / mọi phiên bản (*) | exact | Cách duyệt phiên bản | đã áp dụng (PR chuyển bảng) |
| đề xuất của giảng viên | Teacher Hub | | đã áp dụng |
| Chưa có điểm | Có khi module chấm điểm hoàn thiện | Không dùng chữ nói về tiến độ phát triển | đã áp dụng |

## Cách thêm hoặc đổi một thuật ngữ
1. Thêm dòng vào bảng đúng nhóm, ghi cách bỏ để dễ grep.
2. Quét mã: `grep -rn "<cách bỏ>" apps/web/src --include=*.tsx --include=*.ts` và sửa chuỗi hiển thị (không sửa tên biến, hook, khoá API).
3. Sửa test chỉ khi chuỗi đổi, liệt kê từng chỗ trong mô tả PR.
