# G2b-R — Chạy thử (1 ca và toàn bộ), tải mã đáp án, sinh gói, gỡ nhãn "cần backend" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Giảng viên chạy đáp án mẫu trên một ca hoặc trên mọi ca của một phiên bản gói, xem khớp/lệch từng ca, tải mã đáp án của mình lên, sinh gói từ đề hoặc từ đáp án, và không còn nhãn "cần backend" nào trên FE.

**Architecture:** Thêm một service chạy thử trong `grading/test-bundle` gọi `SandboxPort` có sẵn (`INVESTIGATOR_DEPS.sandbox`). Mã đáp án đi qua cột `model_answer_source_key` do PR-A2 thêm. Sinh gói là phần G2b trong spec v3, nằm ở `exam-authoring`. FE nối các nút đã khoá sang route thật.

**Tech Stack:** NestJS 11, TypeORM 0.3.31, PostgreSQL 16, BullMQ/sandbox worker, Next.js 15, TanStack Query, vitest, Jest e2e tuần tự (`maxWorkers: 1`).

**Spec:** `docs/superpowers/specs/2026-10-17-g2b-ruler-generate-design.md` (v3) — mục 3, 4.2–4.7, 5, 6. Mock-up đã duyệt về hành vi: `https://claude.ai/artifact/Mt5hUzKtZX93QhT52gsTyr` (v2).

## Global Constraints

- **Thứ tự bắt buộc:** PR-A2 (`2026-10-17-g2b-a2-unverified-ruler.md`) phải xong trước Task 1–3, vì cột `model_answer_source_key` và `ruler_trust` nằm trong A2.
- **Không merge** khi G1 chưa đạt: worker sandbox phải nhận và trả một job thử. Probe 2026-10-17 không đạt (job không được nhận sau 120 000 ms). Mọi lượt chạy thật cần worker sống; test dùng `FakeSandbox`.
- **Chạy thử không đổi trạng thái gói:** không đổi `approved_at`, `approved_by`, ghim, `ruler_trust`, `model_answer_unverified`.
- **Mã nguồn đáp án không đi qua HTTP DTO** và không lọt vào `listForAgent` hay không gian làm việc của agent điều tra (test ở Task 3).
- **Upload mã đáp án không đi qua NestJS** (Security rule 5): dùng presigned URL, server chỉ đọc object để kiểm băm.
- **Không áp migration lên Supabase** trong plan này. Chỉ chạy trên Postgres cục bộ (`setup-env.ts` chặn DB không phải local).
- **Commit message kết thúc bằng:** `Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Gói có ca bị bỏ tự động hoặc bỏ tay:** chạy thử toàn bộ chỉ chạy ca đang dùng, không chạy ca đã bỏ (Task 1).
2. **Đáp án mẫu chưa có mã nguồn** (phiên cũ, chưa tải lên): trả 409 có thông điệp, không 500 (Task 1, Task 2).
3. **Ca cho output lớn hơn 64 KiB:** kết quả ghi "vượt giới hạn", không làm hỏng cả lượt (Task 1).
4. **Bấm chạy hai lần liên tiếp:** lượt thứ hai nhận 409 "đang chạy", không chạy song song (Task 1).
5. **Gói của phiên khác hoặc của giảng viên khác:** 404 qua `findOwnedBundle`, không rò nội dung (Task 1, Task 2).

---

### Task 1: Chạy thử một ca và toàn bộ ca của một gói

**Files:**
- Create: `apps/api/src/grading/test-bundle/test-run.service.ts`
- Create: `apps/api/src/grading/entities/grading-test-run.entity.ts`
- Create: migration `apps/api/src/database/migrations/<timestamp>-GradingTestRun.ts` (bảng theo spec §4.2, có guard chỉ cho phép một lần chuyển `running` sang kết thúc)
- Modify: `apps/api/src/grading/test-bundle/test-bundle.controller.ts` (route mới)
- Modify: `apps/api/src/grading/grading.module.ts` (đăng ký service, export nếu cần)
- Test: `apps/api/test/test-run.e2e-spec.ts` (mới), `apps/api/src/grading/test-bundle/test-run.service.spec.ts` (mới)

**Interfaces:**
- Consumes: `SandboxPort` (`grading/investigator/tools.ts`) từ `INVESTIGATOR_DEPS` (`grading.module.ts`); `GradingReferenceService` (đọc `model_answer_source_key`, `model_answer_source_sha256` do A2); `resolveProblemConfig`; `findOwnedBundle` (`test-bundle.service.ts`); `StorageService.getObject`.
- Produces:
  - `POST /exam-sessions/:id/test-bundles/:bundleId/runs` body `{ caseKey?: string }` → 201 `{ runId: string, status: 'pass'|'fail'|'compile_error'|'unavailable'|'aborted', cases: { name, status, ms, diff: string|null }[] }`.
  - Lỗi: 409 khi không có mã đáp án (`"chưa có mã đáp án để chạy — hãy tải mã lên"`) hoặc đang có lượt `running`; 404 khi gói không thuộc phiên; 503 khi sandbox không trả lời.
  - `TestRunService.run(sessionId, bundleId, caseKey | null): Promise<TestRunResult>`.

- [ ] **Step 1: Viết test thất bại**

`test-run.e2e-spec.ts`, dùng `FakeSandbox`:
- `chạy toàn bộ ca: một dòng grading_test_run, trạng thái theo kết quả sandbox`
- `chạy một ca: chỉ ca đó vào job, dòng ghi caseKey`
- `ca bị bỏ không vào job`
- `không có mã đáp án → 409, không ghi dòng nào`
- `hai lượt chạy liên tiếp khi lượt đầu còn running → 409 "đang chạy"`
- `gói của phiên khác → 404`
- `chạy không đổi approved_at, ghim, ruler_trust`
- `output dài hơn 64 KiB → ca có status output_limit, lượt vẫn hoàn tất`

- [ ] **Step 2: Chạy test, thấy đỏ**

Run: `npx jest --config ./test/jest-e2e.json test/test-run.e2e-spec.ts`. Expected: FAIL.

- [ ] **Step 3: Cài đặt**

- Đọc mã nguồn: `storage.getObject(model_answer_source_key)`; ngôn ngữ lấy từ `problem.language`, chỉ `cpp` hoặc `python`, khác thì 400.
- Ghi dòng `running` (INSERT) trước khi gọi sandbox. Gọi `SandboxPort.exec` với `expected` = `grading_test_case.expected_output` của các ca không bị bỏ (`auto_dropped_reason IS NULL`), hoặc chỉ một ca khi có `caseKey`. Comparator `exact` (hàm của worker, `sandbox-worker/comparators.ts`).
- Ngân sách 60 000 ms. Trần 200 ca một job (`contract.ts:117`).
- Chuyển dòng sang trạng thái kết thúc bằng một UPDATE. `diff` cắt còn 200 ký tự. Không lưu stdout.
- `unavailable` từ sandbox → trạng thái `unavailable`, trả 503. Cổng null → 503 ngay.

- [ ] **Step 4: Chạy test, thấy xanh**

Run: cùng lệnh Step 2. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/grading apps/api/src/database/migrations apps/api/test/test-run.e2e-spec.ts
git commit -m "feat(g2b-r): chạy thử một ca và toàn bộ ca của gói

Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Tải mã đáp án của giảng viên lên

**Files:**
- Modify: `apps/api/src/grading/grading-reference.service.ts` (hai method mới)
- Modify: `apps/api/src/grading/grading.controller.ts` (hai route mới)
- Test: `apps/api/test/grading-reference.e2e-spec.ts` (thêm ca)
- Web: thêm `apps/web/src/lib/api/grading.ts` (hai hàm), hook trong `apps/web/src/hooks/useGrading.ts`

**Interfaces:**
- Produces:
  - `POST /exam-sessions/:id/grading-reference/answer-source/upload-url` body `{ extension: 'cpp'|'py' }` → 201 `{ storageKey: string, uploadUrl: string, expiresIn: number }`. Khoá `grading-reference/<sessionId>/pending-<uuid>.<ext>`.
  - `POST /exam-sessions/:id/grading-reference/answer-source/confirm` body `{ storageKey: string }` → 201 `{ sourceKey: string, sha256: string }`. Server đọc object, băm, đặt khoá theo băm, xoá object tạm, đặt `model_answer_source_key`, `model_answer_source_sha256`, `model_answer_origin='teacher'`, `model_answer_unverified=true`.
  - Lỗi: 400 khi object chưa có hoặc khoá không đúng tiền tố của phiên; 409 khi phiên đã chấm.

- [ ] **Step 1: Viết test thất bại**

- `upload-url trả khoá pending đúng tiền tố phiên`
- `confirm khi chưa upload → 400`
- `confirm khoá của phiên khác → 400`
- `confirm đúng → cột mã nguồn đặt, băm khớp nội dung, origin là teacher`
- `phiên đã chấm → 409`

- [ ] **Step 2: Chạy test, thấy đỏ.**
- [ ] **Step 3: Cài đặt.** Đọc object bằng `StorageService.getObject`, băm SHA-256, ghi lại dưới khoá theo băm bằng `putObject`, xoá object tạm bằng `deleteObject`. Nếu object theo băm đã có thì không ghi lại.
- [ ] **Step 4: Chạy test, thấy xanh.**
- [ ] **Step 5: Commit** — `feat(g2b-r): tải mã đáp án của giảng viên qua presigned URL`

---

### Task 3: Sinh đáp án và gói từ đề, và từ đáp án của giảng viên

**Files:**
- Create: `apps/api/src/exam-authoring/ruler-generate.service.ts`
- Create: `apps/api/src/exam-authoring/ruler-generate.service.spec.ts`
- Modify: `apps/api/src/exam-authoring/ai-provider/exam-authoring-provider.ts` và `claude-authoring.provider.ts` (prompt mode mới)
- Modify: `apps/api/src/exam-authoring/exam-authoring.module.ts` (cổng sandbox qua provider chung)
- Modify: `apps/api/src/grading/grading.controller.ts` hoặc `test-bundle.controller.ts` (hai route `generate-from-statement`, `generate-from-answer`)
- Test: `apps/api/test/ruler-generate.e2e-spec.ts` (mới), `apps/api/test/source-leak.e2e-spec.ts` (mới)

**Interfaces:**
- Consumes: `TestBundleService` (tạo gói chưa duyệt; không `adoptFromAuthoring`), `GradingReferenceService.upsert(…, origin, answerSource)` (A2), `TestRunService` (Task 1) hoặc hàm chạy chung, `GenerateQuotaService.assertWithin`, `extractText`.
- Produces:
  - `POST /exam-sessions/:id/test-bundles/generate-from-statement` → 201 `{ testBundle: {id, version, caseCount, droppedCount}, ruler: {trust: 'verified'|'unverified', examplesChecked: number}, run: {runId, status} }`.
  - `POST /exam-sessions/:id/test-bundles/generate-from-answer` → 201 cùng dạng, không có `ruler`.
  - Đúng các luật mục 3 và 4.4–4.6 của spec v3.

- [ ] **Step 1: Viết test thất bại** — đúng danh sách mục 5 của spec v3 cho PR-G2b, gồm:
  - `expected_output bằng stdout của sandbox, không bằng văn bản LLM` (mock cả hai và so sánh);
  - `ca không trích được đề bị bỏ, có lý do`;
  - `answerIsUnique=false không có comparator phù hợp bị bỏ`;
  - `kết quả khác nhau giữa hai lần chạy → bỏ ca với lý do nondeterministic`;
  - `đáp án không biên dịch → 422, không ghi gì`;
  - `preflight worker không trả lời → 503 và số lần gọi LLM bằng 0`;
  - `đáp án của giảng viên → 409 khi sinh từ đề`;
  - `mã nguồn không lọt vào listForAgent và không gian làm việc của agent điều tra` (`source-leak.e2e-spec.ts`).

- [ ] **Step 2: Chạy test, thấy đỏ.**
- [ ] **Step 3: Cài đặt theo spec v3 §4.4–4.9.** Chi phí ghi `costUsd` theo cách đường chấm (`costOf`, `priceOf`), không để `null`.
- [ ] **Step 4: Chạy test, thấy xanh.**
- [ ] **Step 5: Commit** — `feat(g2b-r): sinh đáp án và gói test từ đề và từ đáp án của giảng viên`

---

### Task 4: Giao diện — nối nút, bảng ca, chạy thử, form từ mock-up

**Files:**
- Modify: `apps/web/src/app/teacher/grading/_components/PreparePanel.tsx:99-108` (bỏ `NeedsBackend`, nối ba nút)
- Modify: `apps/web/src/app/teacher/grading/_components/TestBundleCard.tsx` (form thêm và sửa ca tách riêng, theo mock-up v2)
- Modify: `apps/web/src/app/teacher/grading/_components/TestBundleList.tsx` (bảng ca, nút chạy thử một ca và toàn bộ, cột kết quả, nút duyệt và ghim gộp)
- Modify: `apps/web/src/lib/api/test-bundle.ts`, `apps/web/src/hooks/useTestBundle.ts` (hàm và hook mới)
- Test: `TestBundleCard.test.tsx`, `TestBundleList.test.tsx`, `PreparePanel.test.tsx` (bỏ ca "cần backend" ở dòng 190, thay bằng ca mới)

**Interfaces:**
- Consumes: routes Task 1–3.
- Produces: không có API mới phía backend.

- [ ] **Step 1: Viết test thất bại** — ba nút mở đúng route; "Chạy thử tất cả" gọi một lần và hiện khớp/lệch; "Chạy" một ca gọi với `caseKey`; 409 "chưa có mã đáp án" hiện form tải mã; form thêm ca báo lỗi cạnh ô (theo mock-up).
- [ ] **Step 2: Chạy vitest, thấy đỏ.** Lưu ý: trên máy này `next` trong `apps/web/node_modules` là symlink hỏng; chạy test cần sửa cài đặt trước (xem mục Phụ thuộc).
- [ ] **Step 3: Cài đặt.**
- [ ] **Step 4: Chạy vitest, thấy xanh.**
- [ ] **Step 5: Commit** — `feat(g2b-r): giao diện chạy thử, tải mã đáp án, sinh gói và duyệt gộp`

---

### Task 5: Dòng "Đáp án mẫu" của preflight

**Files:**
- Modify: `apps/web/src/lib/preflight.ts:92-98` (bỏ `needsBackend`; viết lại chữ theo trạng thái thật: có mã nguồn, có thể sinh, hoặc chưa có)
- Test: `apps/web/src/lib/preflight.test.ts`

- [ ] **Step 1: Viết test thất bại** — ba trạng thái của dòng đáp án, không có `needsBackend`.
- [ ] **Step 2: Chạy, thấy đỏ.**
- [ ] **Step 3: Cài đặt** — chữ thay cho "hệ thống tự dựng đáp án từ đề thì chưa làm được".
- [ ] **Step 4: Chạy, thấy xanh.**
- [ ] **Step 5: Commit** — `fix(g2b-r): dòng đáp án mẫu của preflight không còn nhãn cần backend`

---

### Task 6: Gỡ hết "cần backend" trên FE

**Files:**
- Modify: `apps/web/src/app/teacher/grading/_components/RunningPanel.tsx:182` (xem Phụ thuộc — quyết định chờ chủ đồ án)
- Delete khi không còn chỗ dùng: `apps/web/src/components/needs-backend.tsx`, `needs-backend.test.tsx`
- Test: tìm lại toàn bộ `NeedsBackend` và `cần backend` trong `apps/web/src` (không tính test kiểm việc đã gỡ)

- [ ] **Step 1: Kiểm** — `grep -rn "NeedsBackend\|cần backend" apps/web/src` phải trả về rỗng sau Task 4–5 và quyết định ở Phụ thuộc.
- [ ] **Step 2: Xoá component** khi grep rỗng.
- [ ] **Step 3: Commit** — `chore(g2b-r): gỡ NeedsBackend, không còn nhãn cần backend trên FE`

---

## Phụ thuộc và quyết định chờ chủ đồ án

- **Worker sandbox (G1):** Task 1 và 3 chạy thật chỉ khi worker sống. Test dùng `FakeSandbox`. Không merge khi G1 chưa đạt.
- **Môi trường web:** `apps/web/node_modules/next` là symlink hỏng, trỏ vào một đường dẫn pnpm store không còn. Vitest không chạy được, `tsc` báo `Cannot find module 'next/link'`. Sửa cần cài lại `node_modules` trong cây làm việc dùng chung, nên chờ chủ đồ án đồng ý.
- **RunningPanel "Đang chạy ngay lúc này" (Task 6):** cần biết thời điểm bắt đầu của từng bài đang chấm. Chưa kiểm được `grading_attempt` có trường đó. Hai lựa chọn: hiện danh sách bài đang chấm kèm thời điểm bắt đầu, hoặc gỡ khối này.
- **Trang admin "Cấu hình AI", "Chi phí", "Audit log":** hiện là `PlaceholderPage` "sẽ có ở đây", không có nhãn "cần backend". Bảng `audit_log` và `ai_usage` đã có. Cần quyết định: làm trang đọc, hay gỡ khỏi menu.
- **Mô hình phiên bản (câu hỏi của chủ đồ án):** hiện gói thuộc về phiên, đánh số trong phiên, nên không dùng chung được giữa nhiều phiên. Nếu muốn dùng chung, gói phải thuộc về câu gốc. Đây là thay đổi schema và migration, cần duyệt riêng trước khi làm Task 1.
