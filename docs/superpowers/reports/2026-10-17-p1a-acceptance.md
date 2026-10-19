# P1a — nghiệm thu "1 câu chạy như cũ" (2026-10-17)

**Kết luận:** đạt tiêu chí "không tụt ở chỉ số nào" so với lượt nền `20261014T034132Z-0199dd3`, trên **một** lượt chạy. Xem phần "Giới hạn" trước khi coi đây là bằng chứng ổn định.

## Lượt chạy

- Mục tiêu: production Railway, deploy `4301be1` (mã P1a đã merge), kịch bản `ngan-xep-v1` (5 bài, phiên loại `teacher`).
- Bản ghi: `apps/api/eval/rehearsals/20261017T103458Z-4301be1/`.
- Cấu hình: `GRADING_TIER1_CEILING` và `GRADING_TIER2_CEILING` đều `0.5` trên Railway (đã đặt tường minh, trùng giá trị mặc định); `SANDBOX_REDIS_URL` đã cập nhật.
- Model dùng: `occ/claude-sonnet-5` (không có bậc dự phòng được kích hoạt).

## So sánh chỉ số

| Chỉ số | Baseline `0199dd3` (2026-10-14) | Lượt này `4301be1` |
|---|---|---|
| Điểm đúng | 5/5 | 5/5 |
| Lỗi bắt được | 8/8 | 8/8 |
| Lỗi thừa | 0 | 0 |
| Quyết định đúng | 4/5 | 4/5 |
| Tự duyệt (thực/kỳ vọng) | 2/3 | 2/3 |
| Tự duyệt sai | 0 | 0 |
| Cờ oan / bỏ lỡ | 0 / 0 | 0 / 0 |
| Lăng kính hỏng | 0 | 0 |
| Bài bị kiểm mẫu che điểm | 0 | 0 |
| Thời gian bài chậm nhất (s) | 94,9 | 114,4 |

Bài HS2410022 không tự duyệt ở cả hai lượt (đúng kỳ vọng "auto" nhưng bị giữ về giảng viên, như lượt nền).

Mốc bổ sung: lượt 2026-09-28 (`f83a05c`) có cờ bỏ lỡ 1; lượt này 0.

## Kiểm `ruler_trust` (Task 11, bước 5)

Phiên của lượt nghiệm thu: `grading_reference.ruler_trust = teacher`, liên kết câu 1. Khớp §6.3b.

## Các bước khác của Task 11

- Tĩnh: tsc 0 lỗi, `check:cycles` 0 vòng, ESLint 0 lỗi (7 cảnh báo có sẵn).
- Đơn vị: 154 suite đạt, 1519 test đạt.
- E2E tuần tự: 95 suite, 762 test đạt (sau merge).

## Giới hạn

- **Một lượt chạy.** Cùng mã P1a, một lượt cục bộ trước đó cho `errorsCaught` 4/8 (lượt `20261017T064515Z-ab62a27` và `…101922Z-4301be1`). Khác biệt chính khi đó là cấu hình model và sandbox trên máy cục bộ. Lượt này khớp Railway nên chấp nhận được, nhưng biến thiên giữa các lượt là có thật.
- Khuyến nghị: chạy lại thêm một lượt để có hai lượt đạt liên tiếp trước khi dựa vào kết quả cho các bước sau.
- Lượt cục bộ thất bại vì worker sandbox không xử lý job được; các bản ghi đó được giữ nguyên để truy vết.
- Các phiên thử của các lượt thất bại vẫn nằm trong DB; đã lưu trữ ba phiên, còn các phiên khác chờ quyết định.
