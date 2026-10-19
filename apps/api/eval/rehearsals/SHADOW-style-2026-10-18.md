# Chế độ bóng — hai luật phong cách (thieu_chu_thich, ten_bien_vo_nghia)

Ngày: 2026-10-18. Nhánh `feat/multi-problem-p1b`.

Bộ kiểm tra tất định (`src/grading/style-checks/`) chạy trên năm bài diễn tập `ngan-xep-v1`, không ảnh hưởng điểm hay
quyết định. So với kết quả LLM của bảy lượt hợp lệ (`103458Z`, `164037Z`, `074017Z`, `074354Z`, `084025Z`, `084359Z`,
`084653Z`). Lượt `074017Z` có HS2410020 bị audit che nên lần đó không đo được (ký hiệu `·`).

Ký hiệu: `C` = bị gắn luật, `-` = không, `·` = không đo được.

| Bài | Bóng: thiếu chú thích | Bóng: tên ngắn | Kỳ vọng kịch bản | LLM thiếu chú thích (7 lượt) | LLM tên ngắn (7 lượt) |
|---|---|---|---|---|---|
| HS2410018 | C | C `[a,f,p,t,v,x]` | thiếu=C, tên=C | C C C C C C C | C C - C C - - |
| HS2410019 | - | - | thiếu=-, tên=- | - - - - - - - | - - - - - - - |
| HS2410020 | - | - | thiếu=-, tên=- | - - · - - - - | - - · - - - - |
| HS2410021 | C | C `[a,x]` | thiếu=C, tên=C (bắt buộc theo luật, 2026-10-19) | C C - C C - - | - - - - - - - |
| HS2410022 | - | - | thiếu=-, tên=- | - - - - - - - | - - - - - - - |

Đồng thuận bóng–LLM trên các lần LLM đo được:

- `thieu_chu_thich`: 31/34 (91%). Lệch ở HS2410021 (3 lượt LLM không gắn).
- `ten_bien_vo_nghia`: 24/34 (71%). Lệch ở HS2410018 (3 lượt LLM không gắn) và HS2410021 (cả 7 lượt LLM không gắn, bóng gắn `a`, `x`).

Ghi chú:

- Bộ bóng khớp kỳ vọng của kịch bản ở cả năm bài. Đây là kiểm tra phạm vi, không phải bằng chứng độ chính xác trên bài thật.
- HS2410021 là chỗ bất đồng về chính sách, không chỉ là lỗi: `a` và `x` là tên một chữ, nên theo định nghĩa luật thì bị gắn.
  Ngày 2026-10-19 kịch bản đã chuyển sang đúng luật: `a` và `x` bị trừ, chỉ `n` là ngoại lệ. Đề nêu dãy là `a_i`,
  nên giảng viên có thể thêm `a` vào ngoại lệ của câu; hiện chưa cấu hình.
- Ngoại lệ `n` áp cho cả bài vì `n` là chữ của đề câu 1 (`ngan-xep-v1`). Với đề khác, ngoại lệ phải theo từng câu.
- Chưa đo độ chính xác trên bài có điểm giảng viên xác nhận. Nguồn đó chưa có (xem bản duyệt có sửa ở các phiên thật, chưa kiểm chứng).

Script đo: `C:\tmp\p1b-backup\shadow-compare.cjs` (ngoài repo).
