# Ghi chú hiệu chỉnh (2026-10-14)

Bản ghi `run.json` ở thư mục này được tạo bởi harness TRƯỚC khi sửa xử lý `audit_pending`, nên ghi
decisionOk 3/5 và scoreOk 4/5. Số đúng sau khi đối chiếu DB (chỉ đọc):

- HS2410019 rơi vào kiểm mẫu (`audit_pending`) SAU KHI đã tự duyệt; điểm hiện hành 10,00 (đúng).
  API giấu điểm của bài kiểm mẫu, nên harness cũ không đọc được điểm và ghi nhầm là `pending`.
- Đã hiệu chỉnh: scoreOk 5/5 (một bài đọc từ DB), decisionOk 4/5, lỗi 8/8, lỗi thừa 0, cờ oan 0.
- Điểm hiện hành các bài: 6,5 · 10 · 5,5 · 9,5 · 9.

Lượt này chạy trên rubric 13 luật (cũ) — xem lượt có rubric 5 luật ở thư mục khác.

Sau lượt này, 8 luật thừa đã được gỡ khỏi rubric cũ của giảng viên (xem báo cáo P0). Việc gỡ làm 22 bài chưa chốt trên 13 phiên chuyển từ flagged sang auto_approved, điểm không đổi.
