# P1b — kiểm kê test và file bị ảnh hưởng (2026-10-17)

Điều kiện đầu vào: nghiệm thu P1a đạt — `eb4abe5`, bản ghi `20261017T103458Z-4301be1` (có trong `apps/api/eval/rehearsals/README.md`).

Số liệu thô (grep trên nhánh `feat/multi-problem-p1b` @ `eb4abe5`):

- File test đụng `grading_result` / `score_computation`: 42.
- File src đọc cột bí danh của phiên (sau khi loại dương tính giả): `resolve-problem-config.ts`, `default-problem-backfill.ts` (theo thiết kế); `anchor.service.ts` là dương tính giả của grep (không phải đọc bí danh).
- File src gọi `decide(`: 13 (gồm `src/eval/*` và `src/sandbox-spike/*`).
- File test grade-export: 9.
- File liên quan kiểm mẫu (`audit-sampling`): 4.

## Theo Task

**Task 1 (M3, cột xác nhận đề cương, FK ghép):**
- `test/multi-problem-p1a-schema.e2e-spec.ts` (mở rộng cho M3 trong file mới `test/multi-problem-p1b-schema.e2e-spec.ts`).

**Task 2 (guard route cấp phiên, 409):**
- `src/grading/grading-reference.service.ts`, `src/grading/test-bundle/test-bundle.service.ts`, `src/exam-session/exam-session.service.ts` (`setRubric`).
- Test hồi quy: `test/grading-reference.e2e-spec.ts`, `test/test-bundle.e2e-spec.ts`, `test/session-rubric.e2e-spec.ts`.

**Task 3 (tạo câu từ Soạn đề):**
- `src/exam-authoring/attach-exam.service.ts`, `src/grading/test-bundle/test-bundle.service.ts` (`adoptFromAuthoring` đổi chữ ký), `src/exam-authoring/authoring-bundle.ts` (`flattenAuthoringCases`).
- Gọi `adoptFromAuthoring` hiện có (phải cập nhật theo chữ ký mới): `test/multi-problem-p1a-writers.e2e-spec.ts`, `test/test-bundle.e2e-spec.ts`.
- Hồi quy một câu: `test/exam-authoring-attach.e2e-spec.ts`.

**Task 4 (thêm/bỏ câu thủ công, xác nhận đề cương):**
- Tôn trọng guard của Task 2; chạy lại: `test/grading-reference.e2e-spec.ts`, `test/test-bundle.e2e-spec.ts`.

**Task 5 (hàm đọc điểm tổng):**
- File mới: `src/grading/problem/student-total.ts`, `student-total.query.ts`, `student-total.spec.ts`. Không đụng file hiện có.

**Task 6 (canary đường đọc tổng):**
- Đường đọc tổng: `src/grading/grading.service.ts` (`listForSession`), `src/grade-export/grade-export.data.ts`.
- Canary mẫu có sẵn: `test/audit-blind.e2e-spec.ts`.

**Task 7 (xuất tổng ra sổ điểm):**
- `src/grade-export/grade-export.data.ts` (`loadStudents`), `src/grade-export/plan.ts`, `src/grade-export/grade-export.messages.ts`.
- Test hồi quy grade-export (9 file): `test/grade-export.e2e-spec.ts`, `test/grade-export-data.e2e-spec.ts`, `test/grade-export-preview.e2e-spec.ts`, `test/grade-export-list.e2e-spec.ts`, `test/grade-export-inspect.e2e-spec.ts`, `test/grade-export-schema.e2e-spec.ts`, `test/audit-blind.e2e-spec.ts`, `test/multi-problem-p1a-traps.e2e-spec.ts`, và helper `test/helpers/grade-export-seed.ts`.

**Task 8 (cờ `ruler_unverified`):**
- `src/grading/decision/decide.ts`, `src/grading/decision/types.ts` (`DecisionInput.rulerTrust?`, trường tuỳ chọn nên không vỡ 13 nơi gọi).
- `src/grading/scoring/score.service.ts`, `src/grading/pipeline/investigation-context.service.ts`.
- Test hồi quy: `test/investigator-end-to-end.e2e-spec.ts`, `test/finalize-investigator.e2e-spec.ts`.

**Task 9 (Đợt B: danh sách một dòng mỗi sinh viên):**
- `src/grading/grading.controller.ts`, `src/grading/grading.service.ts`. Không đổi route cũ `grading-results`.

**Task 10 (Đợt B: rút mẫu kiểm theo sinh viên):**
- `src/grading/audit-sampling.ts` (+ `audit-sampling.spec.ts`), `src/grading/scoring/score.service.ts` (`drawnForAudit`, dòng ~586), `src/grading/lifecycle/advance.ts`.
- Test hồi quy: `test/audit-sampling.e2e-spec.ts`.

## Rủi ro đã thấy

- `test/multi-problem-p1a-writers.e2e-spec.ts` và `test/test-bundle.e2e-spec.ts` gọi `adoptFromAuthoring` theo chữ ký cũ; Task 3 phải cập nhật cả hai.
- Ghi chú: ledger ban đầu ghi `exam-authoring-attach` là nơi gọi — sai; sửa thành hai file trên.
