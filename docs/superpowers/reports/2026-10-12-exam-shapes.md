# Bảng phân loại hình dạng đề thật

**n = 1.** Một đề không phải bảng phân loại: các kết luận dưới đây là *điểm dữ liệu đầu tiên*, không phải tần suất. Cần thêm 2–4 đề thật trước khi dùng bảng này để cắt phạm vi P1b (spec §10.2, điều kiện kết thúc P0).

Nguồn dữ liệu: các đề thật do chủ đồ án cung cấp. Mỗi hàng một đề. Cột "Không hỗ trợ" nêu các hình dạng spec §1.4 chưa hỗ trợ.

| # | Đề | Nguồn | Định dạng | Câu | Ngôn ngữ | Điểm | Tên file nêu trong đề | Ví dụ vào/ra | Rubric nhúng | Hợp đồng I/O | Tiêu chí không đo được bằng test | Câu trùng | Không hỗ trợ |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `de-thi.pdf` (CTDL&GT cuối kỳ, 2 trang) | Rất có thể xuất từ Soạn đề (khung dòng khớp `buildExamPaperDocx`) — *suy luận, chưa xác nhận với chủ đồ án* | PDF có lớp chữ | 3 | Python | 3 + 3,5 + 3,5 = 10 | không | không (chỉ quy tắc bằng lời + ca biên) | Câu 1, Câu 2 (tổng từng câu khớp); Câu 3 không | lai: "viết hàm" nhưng đọc stdin/in ra | O(n) + không dùng thư viện (0,5 đ); O(h) + không chuyển cây thành mảng (0,25 đ); cấm `eval`, `re` | Câu 3 = Câu 1 | chế độ driver hàm (nếu sinh viên chỉ viết hàm) |

## Điều đề #1 cho thấy (chi tiết ở spec, Phụ lục C)

- **Hình dạng khớp mô hình "mỗi câu một chương trình"**; ngôn ngữ và yêu cầu độ phức tạp đọc được từ đề.
- **Rubric nhúng** cho 2/3 câu → chặng 5 dùng thẳng, không cần AI đề xuất rubric.
- **PDF**: hôm nay `extractText` trả rỗng cho PDF, nên đề này nếu tải lên làm đề chấm thì mọi bài code ra `ungradable(system)`. Bộ đọc PDF có lớp chữ nằm trong phạm vi (D25) — **chủ đồ án chưa xác nhận D25**.
- **Câu 3 trùng Câu 1** và không có rubric: chưa biết là cố ý hay lỗi xuất đề — **chưa hỏi chủ đồ án**.
- **Tiêu chí không đo được bằng test** chiếm 0,75/6,5 điểm ở hai câu có rubric (≈ 11,5%): bài O(n²) vẫn có thể qua mọi test và lấy đủ điểm các tiêu chí này.

## Cần chủ đồ án cung cấp để bảng đủ mẫu

Các đề DOCX/PDF thật còn lại, ưu tiên: đề tự soạn (không từ Soạn đề), đề có câu tự chọn, đề có ý a/b/c dùng chung file, đề C++. Mỗi đề thêm một hàng theo cùng cột; không thêm đề thì P1b vẫn giữ phạm vi hiện tại của spec (không có số liệu để thu hẹp).
