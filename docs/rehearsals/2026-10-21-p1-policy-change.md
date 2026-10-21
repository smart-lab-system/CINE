# Thay đổi chính sách P1 (cham-diem-duyet-nhanh): lịch sử kiểm thử

Task 11 của plan `2026-10-21-cham-diem-duyet-nhanh-p1`. Ghi lại lượt chạy lại bộ test sau các task 3–15 và đường cơ sở DB từ Task 1.

- Nhánh: `feat/cham-diem-duyet-nhanh-p1` (commit gốc `bdde467`)
- Thời điểm chạy (phiên làm việc): 2026-10-21, sau commit `781bfa3` (Task 15)
- Đường cơ sở DB trước P1: [`2026-10-21-pre-p1-db-counts.md`](2026-10-21-pre-p1-db-counts.md) (chỉ đọc, Supabase)

## 1. Kết quả chạy lại

| Bộ | Lệnh | Suite | Test | Ghi chú |
|---|---|---|---|---|
| Unit (apps/api) | `npx jest` | 177 pass, 2 skip | 1863 pass, 7 skip | Không có test đỏ |
| E2E cô lập (apps/api) | `npx jest --config …/e2e-p1/jest.config.js` | 119 pass, 1 skip (của 120) | 967 pass, 8 skip (của 975) | Exit 0, không có test đỏ |

E2E chạy trên stack cô lập (Postgres 5463, Redis 6393, MinIO 9013), 75/75 migration đã áp, gồm 5 migration P1. Không dùng DB dùng chung 5442/5443 và không đụng Supabase.

Bộ web (apps/web) không thuộc Task 11, nhưng được chạy để kiểm các file đã đổi: các file của Task 14 pass; còn 3 file ngoài phạm vi (`exam-authoring/page.test.tsx`, `rules/page.test.tsx`) đỏ. Hai file này không import module nào đã đổi, nhưng CHƯA kiểm ở commit gốc, nên chưa khẳng định được chúng đỏ sẵn từ trước.

## 2. Kỳ vọng test đã đổi

Không đổi kỳ vọng nào. Không có test đỏ ở tầng unit lẫn e2e, nên không có test nào phải sửa cho khớp hành vi mới.

Các chỗ đã sửa trong quá trình làm (không phải để cho xanh, mà vì hợp đồng dữ liệu đã đổi có chủ đích):

- `investigate.spec.ts`: lỗi được chấp nhận nay có `evidence: []` (Task 15). Thêm vào kỳ vọng.
- `result-detail.spec.ts`: `challengeVerdicts` nay có `toolCallIds` (Task 13).
- `auto-breaker.service.spec.ts`: mock `latestComputationRow` có thêm `testBundleId` (Task 13).
- `audit-sampling.e2e-spec.ts`: nhóm 5 % đặt `AUDIT_MIN_PER_SESSION=0` (Task 10), vì mỗi kịch bản chỉ có một sinh viên.

## 3. Hành vi đổi so với `bdde467` (đã đo bằng test, không phải suy đoán)

- Sàn số mẫu theo phiên (Task 10): khi bật kiểm mẫu, phiên có ít hơn 2 sinh viên vẫn được bảo đảm tối thiểu `min(2, số sinh viên)` sinh viên trong mẫu. Hệ quả: phiên một sinh viên được kiểm 100 %. Đây là đổi hành vi có hiệu lực NGAY, không cần cầu dao nào mở.
- Tự chốt (Tasks 3–5A): chỉ đổi khi một cầu dao mở. Khi không có cầu dao nào mở và cờ `GRADING_AUTO_NO_ERROR` không đổi, quyết định tự chốt giữ nguyên cách tính cũ. Phần này được các test `decide()` và `score-service` khẳng định, không phải đo trên dữ liệu thật.
- Cờ `injection_suspected` (Tasks 10A, 15): thêm nguồn và đoạn trích đã kiểm chứng để hiển thị. Điều kiện bắn cờ không đổi.

## 4. Chưa đo

- Chưa có số đo đường cơ sở SAU P1 trên DB thật (chưa chạy lại `2026-10-21-pre-p1-db-counts.sql` sau khi merge). Không có số nào để so với Task 1 trong tài liệu này.
- Cổng đo E2 (rehearsal `ngan-xep-v2`, k = 3) CHƯA chạy. Task 15 chưa được coi là đạt cổng và chưa merge.
- Kiểm tay trên trình duyệt (Task 14, bước 5) CHƯA chạy.
- Task 12 (áp migration lên Supabase, cấu hình Railway, merge, deploy) CHƯA chạy, theo quyết định đã ghi trong ledger.
