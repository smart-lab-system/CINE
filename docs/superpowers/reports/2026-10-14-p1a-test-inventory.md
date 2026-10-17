# P1a — danh sách test bị ảnh hưởng (2026-10-14)

Đếm bằng từ khoá (`grading_result`, `GradingResultEntity`, `grading_reference`, `grading_test_bundle`, `rubric_id`, `test_bundle_id`) trên `src` và `test`.

- e2e: **43 / 90** (khớp §11 của spec).
- unit: **6 / 154** theo từ khoá. Spec ghi 12/147. Chênh lệch do bộ từ khoá: ruling trong ledger, bù bằng toàn bộ unit suite ở Task 11.

| File | Task rà soát |
|---|---|
| `src/grading/ai-provider/provider-failure.spec.ts` | 4, 11 |
| `src/grading/anchor.spec.ts` | 4, 11 |
| `src/grading/grading-advocate.spec.ts` | 4, 11 |
| `src/grading/grading-regrade.spec.ts` | 5, 11 |
| `src/grading/pipeline/investigator-run.service.spec.ts` | 4, 11 |
| `src/grading/scoring/result-detail.spec.ts` | 4, 11 |
| `test/advocate-end-to-end.e2e-spec.ts` | 4, 11 |
| `test/anchor-freeze.e2e-spec.ts` | 4, 11 |
| `test/audit-log.e2e-spec.ts` | 4, 11 |
| `test/audit-review.e2e-spec.ts` | 4, 11 |
| `test/audit-sampling.e2e-spec.ts` | 4, 11 |
| `test/bulk-review.e2e-spec.ts` | 4, 11 |
| `test/code-grading-schema.e2e-spec.ts` | 4, 11 |
| `test/criterion-waiver.e2e-spec.ts` | 8, 11 |
| `test/error-exception.e2e-spec.ts` | 4, 11 |
| `test/exam-authoring-attach.e2e-spec.ts` | 4, 11 |
| `test/finalize-investigator.e2e-spec.ts` | 4, 11 |
| `test/finish-attempt.e2e-spec.ts` | 4, 11 |
| `test/grade-export-data.e2e-spec.ts` | 7, 11 |
| `test/grade-export.e2e-spec.ts` | 7, 11 |
| `test/grading-data-model.e2e-spec.ts` | 4, 11 |
| `test/grading-freeze.e2e-spec.ts` | 4, 11 |
| `test/grading-lifecycle-v2.e2e-spec.ts` | 4, 11 |
| `test/grading-lifecycle.e2e-spec.ts` | 4, 11 |
| `test/grading-queue.e2e-spec.ts` | 5, 11 |
| `test/grading-reference.e2e-spec.ts` | 4, 11 |
| `test/grading-results-current-score.e2e-spec.ts` | 4, 11 |
| `test/grading-results-view.e2e-spec.ts` | 4, 11 |
| `test/grading-summary.e2e-spec.ts` | 8, 11 |
| `test/grading.e2e-spec.ts` | 4, 11 |
| `test/investigation-context.e2e-spec.ts` | 4, 11 |
| `test/investigator-end-to-end.e2e-spec.ts` | 4, 11 |
| `test/investigator-run.e2e-spec.ts` | 4, 11 |
| `test/regrade-loop.e2e-spec.ts` | 5, 11 |
| `test/regrade.e2e-spec.ts` | 5, 11 |
| `test/rubric-errors-service.e2e-spec.ts` | 4, 11 |
| `test/rubric-overview.e2e-spec.ts` | 4, 11 |
| `test/rubric-scoped-pricing.e2e-spec.ts` | 4, 11 |
| `test/rubric-waiver-carry.e2e-spec.ts` | 4, 11 |
| `test/rule-split.e2e-spec.ts` | 4, 11 |
| `test/rules-prices.e2e-spec.ts` | 4, 11 |
| `test/rules-routes.e2e-spec.ts` | 4, 11 |
| `test/score-inputs.e2e-spec.ts` | 4, 11 |
| `test/score-service.e2e-spec.ts` | 4, 11 |
| `test/session-rubric.e2e-spec.ts` | 4, 11 |
| `test/start-grading-test-bundle-guard.e2e-spec.ts` | 4, 11 |
| `test/submission-text.e2e-spec.ts` | 4, 11 |
| `test/teacher-review.e2e-spec.ts` | 4, 11 |
| `test/test-bundle.e2e-spec.ts` | 4, 11 |

## Kết quả kiểm chứng (Task 11, 2026-10-14)

Mốc: nhánh `feat/multi-problem-p1a`, sau đợt sửa theo đánh giá cuối (commit `0231138`).

| Kiểm tra | Lệnh | Kết quả |
|---|---|---|
| tsc (api) | `npx tsc --noEmit -p tsconfig.json` | 0 lỗi |
| Vòng lặp import | `pnpm check:cycles` | 0 vòng (605 file api, 14 file agent) |
| ESLint | `npx eslint src test --ext .ts` | 0 lỗi, 7 cảnh báo, đều ở file không đổi trên nhánh |
| Unit | `npx jest -c <cấu hình unit> src` | 154 suite đạt, 2 bỏ qua; 1519 test đạt, 7 bỏ qua, 0 đỏ |
| E2E tuần tự | `npx jest --config ./test/jest-e2e.json --runInBand <56 file>` | 56/56 suite, 498/498 test đạt |
| Web tsc | `npx tsc --noEmit` (apps/web) | 2 lỗi có sẵn trong `src/lib/read-workbook.test.ts`, không do nhánh này |
| Web vitest | `npx vitest run src/lib/grade-export-view.test.ts` | 35/35 |

Ghi chú:
- Cấu hình unit được dựng lại trong worktree (`.superpowers/jest.unit.config.js`, git-ignored) vì bản gốc không có ở đây.
- 56 file e2e gồm 43 file trong bảng ảnh hưởng ở trên và 13 file bổ sung: các `multi-problem-p1a-*` (schema, backfill, resolver, writers, traps), `health`, `submission-overview`, `test-bundle`, `exam-session`, `session-rubric`, `start-grading-test-bundle-guard`, `teacher-review`, `exam-schedule-conflict`, `grade-export-preview`, `grade-export-list`, `audit-blind`, `rubric-errors-routes`, `score-service`.

Chưa chạy (chặn bởi cổng Task 12, bước 1 — cần chủ đồ án duyệt):
- Nghiệm thu "1 câu chạy như cũ" (§11): cần M1 và M2 đã áp lên Supabase. Lượt diễn tập `ngan-xep-v1` 5 bài chưa chạy; chưa so với lượt nền `20261014T034132Z-0199dd3`.
- Kiểm `ruler_trust` của kịch bản `ngan-xep-v1` (§6.3b): phụ thuộc bước trên.
