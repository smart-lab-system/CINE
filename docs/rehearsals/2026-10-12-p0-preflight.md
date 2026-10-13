# Tiền kiểm P0 (2026-10-12)

Đo bằng truy vấn chỉ-đọc ngày 2026-10-12 (lặp lại lúc bắt đầu thực thi plan; kết quả không đổi so với lần đo đầu).

| Điều kiện | Kết quả | Hành động |
|---|---|---|
| Migration chờ trên DB thật (Supabase) | đúng một dòng: `[ ] AddClassNominalClass1789560000000` (56/57 đã áp) | **Chưa áp.** Lệnh áp lên production bị bộ phân loại tự động của Claude Code từ chối, và chủ đồ án chưa tự chạy. Chờ chủ đồ án tự chạy hoặc thêm permission rule cho Bash |
| Cột `class.nominal_class_id` trên DB thật | **false** (không tồn tại) | Production đã deploy `dc2d022` (PR #71) lúc 05:30Z trong khi entity `Class` đã dùng cột này; truy vấn lớp học có thể đang lỗi (suy ra, chưa gọi API thật) |
| GCP billing / VM sandbox | `This API method requires billing to be enabled` (dự án `animated-moon-460103-m3`) | Chủ đồ án bật billing trên console. Không có VM thì Task 8 và 9 chưa chạy được lượt thật |
| Khoá model + `SANDBOX_REDIS_URL` trong `apps/api/.env` | đủ `GRADING_TIER1_*`, `GRADING_TIER2_*` (3 biến mỗi bậc), `ANTHROPIC_API_KEY`, `SANDBOX_REDIS_URL` (chỉ kiểm sự hiện diện) | không |
| Mật khẩu tài khoản diễn tập `teo@gmail.com` | chưa có (không lưu ở đâu) | Hỏi chủ đồ án khi tới Task 8 |

Hệ quả cho điều kiện kết thúc P0 (spec §10.2): môi trường chưa sẵn sàng cho lượt thật, nên Task 2–7 (mã, không cần môi trường) chạy trước; Task 8–9 chờ billing và mật khẩu.
