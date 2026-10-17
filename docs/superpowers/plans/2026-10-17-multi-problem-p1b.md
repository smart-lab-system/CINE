# P1b — Phiên nhiều câu: tạo câu, điểm tổng, xuất tổng, cờ thước chưa kiểm chứng Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cho phép một phiên có nhiều câu (1..N) được tạo, chấm từng câu, cộng điểm tổng của từng sinh viên và xuất tổng ra sổ điểm; bật cờ `ruler_unverified` theo §6.3b. Phiên một câu cũ phải cho kết quả như trước P1b.

**Architecture:** P1b là phần **đổi hành vi** nằm trên nền P1a (đã merge `4301be1`): bảng `exam_problem`, `problem_id`, resolver `resolveProblemConfig()`, ghi kép cột bí danh. P1b thêm (1) đường tạo câu từ Soạn đề và đường thủ công tối thiểu, (2) hàm đọc điểm tổng dùng chung cho danh sách, hồ sơ, xuất sổ và CSV, (3) chặn route cấp phiên khi phiên đã nhiều câu, (4) cờ `ruler_unverified` trong `decide()`, (5) rút mẫu kiểm mù theo sinh viên. Mọi thay đổi chỉ-thêm ở DB; một migration bổ sung (M3) cho cột xác nhận đề cương.

**Tech Stack:** NestJS 11 + TypeORM 0.3.31 (`migrationsTransactionMode: 'none'`, áp bằng `-t all`), PostgreSQL 16 (`examcollect`), Jest (unit: `npx jest -c ../../.superpowers/jest.unit.config.js src`; e2e: `npx jest --config ./test/jest-e2e.json <file>`), Next.js 15 + vitest (web), pnpm 9.12.0, Node 22.

**Spec:** `docs/superpowers/specs/2026-10-12-multi-problem-grading-design.md` — §3.1–3.5, §6.3b, §8, §10.2 (dòng P1b), §10.3 mục 4, §11. Kế hoạch P1a đã thực thi: `docs/superpowers/plans/2026-10-14-multi-problem-p1a-expand.md`.

## Điều kiện đầu vào (bắt buộc)

- **Nghiệm thu "1 câu chạy như cũ" (§11) của P1a CHƯA đạt.** Lượt `ngan-xep-v1` ngày 2026-10-17 (Railway và cục bộ) cho `run_tests = unavailable`: worker sandbox (EC2) không xử lý job từ khoảng 2026-10-14 05:45Z (`cine-sbx:sandbox-exec:completed` trống việc, `wait = 0`). Task 0 không được bắt đầu cho tới khi lượt nghiệm thu đạt và có bản ghi trong `apps/api/eval/rehearsals/`. Lý do: P1b đổi hành vi trên đúng các đường mà lượt này đo.
- Phiên AWS SSO cần đăng nhập lại để kiểm và khởi động worker (việc của chủ đồ án).
- Migration M3 (Task 1) cần chủ đồ án duyệt trước khi áp lên Supabase, như M1/M2.

## Global Constraints

- Điểm tổng **không lưu thành ô**: không ghi "tổng" vào `score_computation` (chỉ-thêm, khoá theo `grading_result_id`). Tổng là hàm đọc (§3.4).
- Điểm tính bằng **số nguyên phần trăm điểm** (`hundredths`). Làm tròn đúng một lần, theo bước làm tròn giảng viên chọn (§8).
- Mọi đường **ghi mới** (tạo câu, đổi rubric của câu, ghim gói) xin `lockTeacherScoring` **trước** `SELECT … FOR UPDATE` (§3.5). Thứ tự khoá: giảng viên → hàng phiên.
- Trigger bất biến hiện có không đổi: 8 cột AI, 15 cặp chuyển trạng thái, các bảng chỉ-thêm.
- Sàn kiểm mẫu: mặc định 20%, sàn 5%, **không bao giờ 0** (§8). Khối lượng kiểm không nhân theo số câu.
- Đáp án mẫu không bao giờ nằm ở `exam_material` (§3.1).
- Cờ `ruler_unverified` không tự duyệt bài nào dựa trên thước `unverified` (§6.3b). Cờ không tự gỡ trừ khi thước lên `verified`.

## Review Focus

Năm trường hợp mà test thông thường dễ bỏ sót, theo thứ tự dễ cắn nhất:

1. **Phiên một câu cũ** sau P1b vẫn cho đúng điểm và đúng route như trước — tổng của sinh viên bằng điểm câu duy nhất, và `PUT grading-reference`, tạo/duyệt/ghim gói vẫn trả 200 khi phiên chưa có đề cương xác nhận. → Task 2, Task 3.
2. **Đề 3 câu, một bài thiếu mục** (file không có entry của câu 2): câu 2 thành "không có bài", **không** lấy 0 điểm mặc định; tổng hiển thị "tạm", không chốt điểm sai. → Task 5, Task 7.
3. **Hai câu trùng tên ca kiểm** (`case_key` trùng giữa hai câu): khoá `uq_grading_test_case_key (bundle_id, case_key)` không vỡ và mỗi câu chỉ thấy ca của mình. → Task 3.
4. **Một câu đang `audit_pending`** của sinh viên: không đường đọc tổng nào (danh sách, hồ sơ, xuất sổ, CSV) để lộ điểm câu đó; tổng hiện "—". → Task 6.
5. **Gói test của một câu rỗng hoặc chưa duyệt**: câu đó không được tự duyệt bài nào; báo sàn của câu, không lấy điểm của câu khác. → Task 4, Task 8.

## Quyết định đã duyệt (2026-10-17)

Chủ đồ án duyệt toàn bộ D1–D5 theo đề xuất dưới đây, chọn thực thi **Native** (triển khai tuần tự trong một phiên, một reviewer toàn nhánh ở cuối). Plan giữ trên nhánh local `docs/multi-problem-p1b-plan`, chưa push.

## Quyết định (đã duyệt)

- **D1 — Rubric của từng câu.** Đề xuất: mọi câu dùng rubric của phiên; tạo câu bị từ chối `400` nếu tổng tiêu chí của rubric ≠ `points` của câu (đúng bất biến "tổng tiêu chí = `points_hundredths`"). Phương án khác (rubric riêng từng câu trong Soạn đề) làm Task 3 lớn hơn nhiều; để sau.
- **D2 — Ngôn ngữ của câu.** Soạn đề không có trường ngôn ngữ theo câu. Đề xuất: lấy từ yêu cầu nộp mà câu gắn vào (`required_deliverable.language`); nếu một file nén chứa cả C++ lẫn Python, câu phải khai rõ (Task 3 từ chối câu thiếu ngôn ngữ).
- **D3 — FK ghép `(test_bundle_id, problem_id)`** (§3.1, đã hoãn ở P1a theo M7). Đề xuất: đưa vào M3 (Task 1) vì P1b mới có nhiều câu, cùng thời điểm có thêm cột.
- **D4 — Phạm vi web.** Đề xuất tách: **Đợt A** (Task 0–8): backend và màn đề cương tối thiểu; **Đợt B** (Task 9–10): danh sách một dòng mỗi sinh viên và rút mẫu kiểm theo sinh viên. Đợt B đổi giao diện và hành vi kiểm; nên review riêng.
- **D5 — Ngoại lệ có tên (§6.3b).** Sau P1b, phiên một câu có đáp án từ Soạn đề chưa kiểm chứng (`model_answer_unverified = true`) **không còn tự duyệt**. Đây là đổi hành vi đã nêu tên trong spec; chỉ được bật sau khi lượt "1 câu chạy như cũ" đã chạy trên phiên loại `teacher`.

## Ngoài phạm vi P1b

- Bước "giảng viên liếc 2–3 ca" và dựng đề cương tự động (P3). Vì vậy trong P1b không có đường nào đặt thước thành `verified`: mọi đáp án Soạn đề chưa kiểm chứng sẽ được cờ cho tới khi P3.
- Bảng `exam_problem_binding` và chọn mục trong file nén (P2).
- Báo cáo mức đồng thuận tích luỹ của kiểm mẫu (§8, phần "lưu ý thống kê") — đo sau khi có đủ phiên.
- Cận trên Clopper–Pearson cho "tự duyệt sai" (§11) — là đo đạc, không phải code.

---

### Task 0: Kiểm kê test bị ảnh hưởng và cổng đầu vào

**Files:**
- Create: `docs/superpowers/reports/2026-10-17-p1b-test-inventory.md`

**Interfaces:**
- Consumes: không.
- Produces: danh sách file test (theo tên) cho từng Task dưới đây; là đầu vào của mọi bước "chạy hồi quy" sau này.

- [ ] **Step 1: Xác minh điều kiện đầu vào** — đọc `apps/api/eval/rehearsals/README.md`; phải có bản ghi lượt "1 câu chạy như cũ" đạt (5/5, 8/8, 0 tự duyệt sai) trên main. Nếu không có, DỪNG và báo chủ đồ án.
- [ ] **Step 2: Kiểm kê** — liệt kê, bằng `grep -l` trên `apps/api/test` và `apps/api/src` và `apps/web/src`, các file chạm `grading_result`, `score_computation`, `exam_session.rubric_id`, `grade-export`, `audit-sampling`, `decide(`, `loadStudents`. Ghi kết quả vào báo cáo theo nhóm Task.
- [ ] **Step 3: Commit** — `docs(p1b): kiểm kê test bị ảnh hưởng`.

---

### Task 1: Migration M3 — xác nhận đề cương và FK ghép gói test

**Files:**
- Create: `apps/api/src/database/migrations/1789620000000-ProblemBlueprint.ts`
- Modify: `apps/api/src/exam-session/entities/exam-session.entity.ts` (thêm `blueprintConfirmedAt`, `blueprintConfirmedBy`)
- Test: `apps/api/test/multi-problem-p1b-schema.e2e-spec.ts`

**Interfaces:**
- Produces: cột `exam_session.blueprint_confirmed_at timestamptz NULL`, `exam_session.blueprint_confirmed_by uuid NULL REFERENCES account(id)`; nếu D3 được chấp nhận: FK `(test_bundle_id, exam_session_id)` trên `exam_problem` tới `grading_test_bundle(id, exam_session_id)` (đã có unique `uq_grading_test_bundle_id_session`), `ON DELETE RESTRICT`, và bỏ FK đơn cột `fk_exam_problem_test_bundle`.

- [ ] **Step 1: Viết test thất bại** — `multi-problem-p1b-schema.e2e-spec.ts`: (a) cột `blueprint_confirmed_at` tồn tại và nullable; (b) chèn `exam_problem` với `test_bundle_id` của phiên khác → lỗi FK (chỉ khi D3); (c) `down()` gỡ đúng các cột/FK đã thêm.
- [ ] **Step 2: Chạy, thấy đỏ** — `npx jest --config ./test/jest-e2e.json test/multi-problem-p1b-schema.e2e-spec.ts`. Expected: FAIL, cột chưa có.
- [ ] **Step 3: Viết migration** — `up()` thêm cột và FK; `down()` đảo lại theo thứ tự ngược. Không đổi dữ liệu.
- [ ] **Step 4: Chạy migration trên e2e và test** — `pnpm migration:run:e2e` rồi chạy lại file test. Expected: PASS.
- [ ] **Step 5: Commit** — `feat(p1b): M3 — xác nhận đề cương và FK ghép gói test`.
- [ ] **Step 6 (gated, chờ duyệt):** áp M3 lên Supabase bằng `migration:run -t all`, kiểm `migration:show` và `grading_result` như P1a.

---

### Task 2: Chặn route cấp phiên khi phiên đã nhiều câu hoặc đã xác nhận đề cương

**Files:**
- Create: `apps/api/src/grading/problem/session-route-guard.ts`
- Modify: `apps/api/src/grading/grading-reference.service.ts` (`upsert`), `apps/api/src/grading/test-bundle/test-bundle.service.ts` (create/approve/pin), `apps/api/src/exam-session/exam-session.service.ts` (`setRubric`)
- Test: `apps/api/test/multi-problem-p1b-guard.e2e-spec.ts`

**Interfaces:**
- Produces: `assertSessionRouteAllowed(m: EntityManager, sessionId: string): Promise<void>` — ném `ConflictException` (409) với thông điệp `phiên này có N câu — sửa tài liệu chấm theo từng câu` khi số câu > 1, hoặc `phiên đã xác nhận đề cương — sửa tài liệu chấm theo từng câu` khi `blueprint_confirmed_at` khác null.

- [ ] **Step 1: Viết test thất bại** — (a) phiên một câu chưa xác nhận: `PUT grading-reference` và tạo gói trả 200 (hồi quy Review Focus 1); (b) phiên hai câu: cùng hai route trả 409 đúng thông điệp; (c) phiên một câu đã xác nhận: 409.
- [ ] **Step 2: Chạy, thấy đỏ.**
- [ ] **Step 3: Cài đặt** — gọi `assertSessionRouteAllowed` trong `lockTeacherScoring` → kiểm → ghi, tại ba điểm trong Interfaces. Không đổi chữ ký public của các service.
- [ ] **Step 4: Chạy test thấy xanh**, cộng `test/grading-reference.e2e-spec.ts`, `test/test-bundle.e2e-spec.ts`, `test/session-rubric.e2e-spec.ts`.
- [ ] **Step 5: Commit** — `feat(p1b): route cấp phiên trả 409 khi phiên đã nhiều câu hoặc đã xác nhận đề cương`.

---

### Task 3: Tạo câu từ Soạn đề (đường tối thiểu, mục (a) của §10.3)

**Files:**
- Create: `apps/api/src/grading/problem/problem.service.ts`
- Modify: `apps/api/src/exam-authoring/attach-exam.service.ts` (nhánh gắn đề), `apps/api/src/grading/test-bundle/test-bundle.service.ts` (`adoptFromAuthoring` nhận `problemId`), `apps/api/src/exam-authoring/authoring-bundle.ts` (tách ca theo câu)
- Test: `apps/api/test/multi-problem-p1b-authoring.e2e-spec.ts`

**Interfaces:**
- Consumes: `ensureDefaultProblem`, `resolveProblemConfig`, `lockTeacherScoring`, `setSessionTestBundleAndProblem` (P1a); `flattenAuthoringCases` (đổi thành nhận `questions` và trả ca gắn `questionIndex`).
- Produces:
  ```ts
  createProblemsFromAuthoring(m: EntityManager, sessionId: string, questions: GeneratedQuestion[], opts: { rubricId: string; languageByDeliverable: string }): Promise<{ problemId: string; ordinal: number }[]>
  adoptFromAuthoring(examSessionId: string, teacherId: string, cases: BundleCaseInput[], sessionAlreadyPinned: boolean, problemId: string): Promise<{ id: string; version: number; approvedAt: string | null; pinned: boolean }>
  ```
- Quy tắc: câu thứ `i` → `ordinal = i`; `points_hundredths = Math.round(points * 100)` (từ chối nếu quá hai chữ số thập phân); `statement`, `statement_quote` từ đề; `title = "Câu i"`; bộ ca mỗi câu là `flattenAuthoringCases([question])` với số câu thật; ghim gói của câu 1 là bí danh (§3.3). Từ chối `400` khi D1 thất bại (tổng tiêu chí ≠ điểm) hoặc thiếu ngôn ngữ (D2).

- [ ] **Step 1: Viết test thất bại** — (a) đề hai câu, điểm 4 và 6, rubric 10 điểm → hai dòng `exam_problem` với `points_hundredths` 400 và 600, mỗi câu một `grading_test_bundle` với đúng ca của câu đó; (b) hai câu có `testBundle` trùng `name` → `case_key` khác nhau trong từng gói, không vỡ khoá; (c) điểm `2.555` → 400; (d) tổng tiêu chí ≠ điểm câu → 400; (e) **hồi quy**: đề một câu tạo đúng một dòng `ordinal = 1`, bộ ca và kết quả như trước (`test/exam-authoring-attach.e2e-spec.ts` vẫn xanh).
- [ ] **Step 2: Chạy, thấy đỏ.**
- [ ] **Step 3: Cài đặt** — trong `attach-exam`, nhánh gắn đề gọi `createProblemsFromAuthoring` trong transaction có `lockTeacherScoring` trước `FOR UPDATE`; với mỗi câu gọi `adoptFromAuthoring(..., problemId)`. Sửa `flattenAuthoringCases` để mỗi ca mang `questionIndex`.
- [ ] **Step 4: Chạy test thấy xanh**; chạy thêm `test/exam-authoring-attach.e2e-spec.ts`, `test/test-bundle.e2e-spec.ts`.
- [ ] **Step 5: Commit** — `feat(p1b): gắn đề nhiều câu từ Soạn đề tạo một câu theo từng mục`.

---

### Task 4: Đường thủ công tối thiểu cho đề cương (mục (b) của §10.3)

**Files:**
- Create: `apps/api/src/grading/problem/problem.controller.ts`, `apps/api/src/grading/problem/problem.dto.ts`
- Modify: `apps/api/src/grading/problem/problem.service.ts` (thêm `appendProblem`, `removeProblem`, `confirmBlueprint`)
- Test: `apps/api/test/multi-problem-p1b-manual.e2e-spec.ts`

**Interfaces:**
- Produces, mọi route chủ phiên (`@Roles('teacher')`):
  - `POST /exam-sessions/:id/problems` body `{ title: string; pointsHundredths: number; requiredDeliverableId: string; rubricId: string; language: 'cpp'|'python' }` → `{ problemId, ordinal }`; `ordinal` = số câu + 1.
  - `DELETE /exam-sessions/:id/problems/:problemId` — chỉ khi câu chưa có kết quả chấm và chưa có gói đã duyệt; ngược lại 409. Câu 1 không xoá được.
  - `POST /exam-sessions/:id/blueprint/confirm` — đặt `blueprint_confirmed_at/by`; idempotent; từ chối `400` nếu phiên có một câu và chưa có đáp án/gói nào (không xác nhận đề cương rỗng).
- Mọi ghi xin `lockTeacherScoring` trước `FOR UPDATE`; route cấp phiên của Task 2 vẫn áp.

- [ ] **Step 1: Viết test thất bại** — (a) thêm câu 2 → 201, `ordinal = 2`, route cũ `PUT grading-reference` trả 409; (b) xoá câu 2 chưa chấm → 200; xoá câu 1 → 409; (c) xác nhận hai lần → 200 cả hai, `blueprint_confirmed_at` không đổi ở lần hai; (d) người không phải chủ phiên → 404.
- [ ] **Step 2: Chạy, thấy đỏ.**
- [ ] **Step 3: Cài đặt** — controller chỉ gọi service; service dùng transaction, không SQL ở controller.
- [ ] **Step 4: Chạy test thấy xanh.**
- [ ] **Step 5: Commit** — `feat(p1b): thêm và bỏ câu thủ công, xác nhận đề cương`.

---

### Task 5: Hàm đọc điểm tổng của sinh viên (§3.4)

**Files:**
- Create: `apps/api/src/grading/problem/student-total.ts` (hàm thuần), `apps/api/src/grading/problem/student-total.spec.ts`
- Create: `apps/api/src/grading/problem/student-total.query.ts` (truy vấn)

**Interfaces:**
- Produces:
  ```ts
  export interface ProblemState { ordinal: number; status: 'finalized'|'exported'|'pending'|'blank'; pointsHundredths: number; scoreHundredths: number | null; auditPending: boolean }
  export type StudentTotal =
    | { kind: 'final'; hundredths: number }      // mọi câu đã chốt
    | { kind: 'tạm'; hundredths: number; missing: number[] } // còn câu chưa chốt hoặc vắng
    | { kind: 'dash' };                           // có câu audit_pending: không lộ
  export function aggregateStudentTotal(problems: ProblemState[], expectedCount: number): StudentTotal
  export function loadStudentTotals(m: EntityManager, sessionId: string): Promise<Map<string, StudentTotal>>  // khoá MSSV chữ thường
  ```
- Quy tắc: thiếu câu (`problems.length < expectedCount`) → `tạm` với `missing` gồm các `ordinal` không có bài; có `auditPending` → `dash` (ưu tiên trên `tạm`); mọi câu `finalized|exported` → `final` với tổng số nguyên; `hundredths` là tổng các `scoreHundredths` (đã làm tròn theo từng câu ở nơi chấm, không làm tròn lần hai ở đây).

- [ ] **Step 1: Viết test thất bại** (unit, bảng): (a) hai câu đã chốt → `final` tổng đúng; (b) một câu `pending` → `tạm`, `missing = []`, tổng câu đã có; (c) một câu vắng (thiếu trong mảng) → `tạm`, `missing = [2]`; (d) một câu `auditPending` và các câu khác đã chốt → `dash`, không có số; (e) ưu tiên: `auditPending` + thiếu câu → `dash`; (f) một câu → `final` đúng bằng điểm câu.
- [ ] **Step 2: Chạy, thấy đỏ** — `npx jest -c ../../.superpowers/jest.unit.config.js src/grading/problem/student-total.spec.ts`.
- [ ] **Step 3: Cài đặt** — hàm thuần trước; truy vấn `loadStudentTotals` là một SQL có `JOIN exam_problem` (ordinal) và `LEFT JOIN grading_result` theo `problem_id` (NULL = câu mặc định, như P1a).
- [ ] **Step 4: Chạy test thấy xanh**, thêm một e2e nhỏ cho truy vấn (`test/multi-problem-p1b-total.e2e-spec.ts`).
- [ ] **Step 5: Commit** — `feat(p1b): hàm đọc điểm tổng sinh viên (tạm / — / chốt)`.

---

### Task 6: Canary đường đọc tổng — không lộ câu audit_pending

**Files:**
- Create: `apps/api/test/multi-problem-p1b-canary.e2e-spec.ts`
- Modify (nếu cần): các đường đọc tổng — `apps/api/src/grading/grading.service.ts` (`listForSession`), hồ sơ kết quả, `apps/api/src/grade-export/grade-export.data.ts`, CSV

**Interfaces:**
- Consumes: `loadStudentTotals` (Task 5).

- [ ] **Step 1: Viết test thất bại** — mẫu canary của kiểm mù hiện có (`test/audit-blind.e2e-spec.ts`): sinh viên có hai câu, câu 2 `audit_pending` với điểm 7,00. Gọi lần lượt `GET grading-results` (danh sách), hồ sơ kết quả của câu 2, `POST grade-exports`, và tải CSV. Mỗi lần: chuỗi `700` và `7.00` **không xuất hiện** trong phản hồi của sinh viên đó; tổng là `—`.
- [ ] **Step 2: Chạy, thấy đỏ** (kỳ vọng: danh sách hiện tổng số; đường nào rò thì test chỉ ra).
- [ ] **Step 3: Cài đặt** — mọi đường đọc tổng dùng `loadStudentTotals`; không đường nào tự tính tổng.
- [ ] **Step 4: Chạy test thấy xanh**; chạy lại `test/audit-blind.e2e-spec.ts`.
- [ ] **Step 5: Commit** — `test(p1b): canary đường đọc tổng không lộ câu audit_pending`.

---

### Task 7: Xuất tổng ra sổ điểm (§8)

**Files:**
- Modify: `apps/api/src/grade-export/grade-export.data.ts` (`loadStudents`), `apps/api/src/grade-export/plan.ts` (nhánh outcome), `apps/api/src/grade-export/grade-export.messages.ts`
- Test: `apps/api/test/grade-export-totals.e2e-spec.ts`

**Interfaces:**
- Consumes: `loadStudentTotals` (Task 5); `foldStudentResults` (P1a).
- Produces: `StudentOutcome` nhận `{ kind: 'scored'; hundredths }` khi tổng là `final`; khi `tạm` hoặc `dash` → `{ kind: 'blank'; reason: 'not_finished' }` với ghi chú `chưa đủ câu` (nhãn hiện có, không thêm nhãn mới — §8).

- [ ] **Step 1: Viết test thất bại** — (a) hai câu đều chốt → ô điểm là tổng đã làm tròn một lần; (b) một câu chưa chốt → ô trống, nhãn `not_finished`, không ghi điểm tạm; (c) **hồi quy**: phiên một câu có cùng số liệu xuất như trước P1b.
- [ ] **Step 2: Chạy, thấy đỏ.**
- [ ] **Step 3: Cài đặt** — thay điểm câu bằng tổng từ `loadStudentTotals`; làm tròn đúng một lần bằng `roundHalfUp` đã có.
- [ ] **Step 4: Chạy test thấy xanh**; chạy `test/grade-export.e2e-spec.ts`, `test/grade-export-data.e2e-spec.ts`, `test/grade-export-preview.e2e-spec.ts`.
- [ ] **Step 5: Commit** — `feat(p1b): xuất tổng một cột khi mọi câu đã chốt, còn lại để trống kèm lý do`.

---

### Task 8: Cờ `ruler_unverified` trong `decide()` (§6.3b)

**Files:**
- Modify: `apps/api/src/grading/decision/types.ts` (`DecisionInput` thêm `rulerTrust?: 'teacher' | 'verified' | 'unverified' | null`), `apps/api/src/grading/decision/decide.ts` (`decide`), `apps/api/src/grading/pipeline/investigation-context.service.ts` (đọc `ruler_trust` qua resolver), `apps/api/src/grading/scoring/score.service.ts` (chuyển `rulerTrust` vào `decide`)
- Test: `apps/api/src/grading/decision/decide.spec.ts`, `apps/api/test/multi-problem-p1b-ruler.e2e-spec.ts`

**Interfaces:**
- Produces: khi `rulerTrust === 'unverified'`, `decide()` thêm cờ bài `ruler_unverified` và **không** trả `outcome: 'auto_approved'` (đưa về `flagged`); `rulerTrust` `'teacher'`, `'verified'`, `null` giữ hành vi cũ.

- [ ] **Step 1: Viết test thất bại** — (a) unit: một bài đủ bằng chứng với `rulerTrust: 'unverified'` → `flagged` với cờ `ruler_unverified`; (b) unit: `teacher` và `verified` và `null` → không đổi; (c) e2e: phiên có đáp án `model_answer_unverified = true` → bài không tự duyệt; (d) e2e: phiên `teacher` (kịch bản `ngan-xep-v1`) → vẫn tự duyệt như cũ.
- [ ] **Step 2: Chạy, thấy đỏ.**
- [ ] **Step 3: Cài đặt** — trong `decide()`, sau khi tính quyết định, nếu `unverified` thì hạ `auto_approved` xuống `flagged` và thêm cờ; không đổi các sàn khác.
- [ ] **Step 4: Chạy test thấy xanh**, cộng `test/investigator-end-to-end.e2e-spec.ts`, `test/finalize-investigator.e2e-spec.ts`.
- [ ] **Step 5: Commit** — `feat(p1b): bật cờ ruler_unverified — bài không tự duyệt khi thước chưa kiểm chứng`.

---

### Task 9 (Đợt B): Danh sách một dòng mỗi sinh viên (API)

**Files:**
- Modify: `apps/api/src/grading/grading.controller.ts` (thêm `GET exam-sessions/:id/grading-students`), `apps/api/src/grading/grading.service.ts`
- Test: `apps/api/test/multi-problem-p1b-students.e2e-spec.ts`

**Interfaces:**
- Produces: `GET /exam-sessions/:id/grading-students` → `[{ mssv, name, total: StudentTotal, problems: [{ ordinal, problemId, status, scoreHundredths | null, auditPending }] }]`. Route cũ `grading-results` giữ nguyên.

- [ ] **Step 1: Viết test thất bại** — phiên hai câu: một dòng cho mỗi sinh viên; `problems` có đủ hai chip theo `ordinal`; tổng theo Task 5; sinh viên thiếu câu có `missing`.
- [ ] **Step 2: Chạy, thấy đỏ.**
- [ ] **Step 3: Cài đặt.**
- [ ] **Step 4: Chạy test thấy xanh.**
- [ ] **Step 5: Commit** — `feat(p1b): danh sách kết quả một dòng mỗi sinh viên (API)`.

---

### Task 10 (Đợt B): Rút mẫu kiểm mù theo sinh viên (§8)

**Files:**
- Modify: `apps/api/src/grading/audit-sampling.ts` (thêm `drawnForAudit` theo MSSV), `apps/api/src/grading/scoring/score.service.ts` (`drawnForAudit` riêng tư, dòng ~586–589), `apps/api/src/grading/lifecycle/advance.ts` (nếu có chỗ rút)
- Test: `apps/api/src/grading/audit-sampling.spec.ts`, `apps/api/test/multi-problem-p1b-audit.e2e-spec.ts`

**Interfaces:**
- Produces: `auditBucketByStudent(seed: string, mssv: string): number` (SHA-256 của `seed + ':' + mssv.toLowerCase()`, cùng cách `auditBucket` hiện có); `drawnForAudit` theo MSSV: mọi câu tự duyệt của sinh viên cùng vào kiểm mẫu khi sinh viên được rút.

- [ ] **Step 1: Viết test thất bại** — (a) unit: với 40 MSSV và tỉ lệ 20%, số được rút nằm trong khoảng tin cậy hợp lý (ghi số đo, không khẳng định cứng); (b) unit: tỉ lệ 1% vẫn trả tối thiểu sàn 5% (không bao giờ 0 trong phiên có ít nhất một sinh viên); (c) e2e: hai câu tự duyệt của cùng một sinh viên được rút cùng nhau; (d) e2e: một câu `audit_pending` không rò điểm (Task 6).
- [ ] **Step 2: Chạy, thấy đỏ.**
- [ ] **Step 3: Cài đặt** — giữ `auditBucket` cũ cho dữ liệu đã có; chỉ đường mới dùng MSSV. Ghi rõ bước chuyển trong bản ghi (§8).
- [ ] **Step 4: Chạy test thấy xanh**, cộng `test/audit-sampling.e2e-spec.ts`.
- [ ] **Step 5: Commit** — `feat(p1b): rút mẫu kiểm mù theo sinh viên, sàn 5%, không bao giờ 0`.

---

### Task 11: Acceptance P1b

**Files:**
- Create: `apps/api/eval/rehearsals/` (bản ghi lượt diễn tập), `docs/superpowers/reports/2026-10-17-p1b-acceptance.md`

- [ ] **Step 1: Bộ hồi quy đầy đủ** — `tsc`, `pnpm check:cycles`, `npx eslint src test --ext .ts`, unit `src` và e2e tuần tự toàn bộ (95+ file cộng file mới). Expected: 0 đỏ không chủ ý.
- [ ] **Step 2: Hồi quy một câu** — chạy lại `ngan-xep-v1` (5 bài, phiên loại `teacher`) khi sandbox sẵn sàng; so với `20260928T094907Z-f83a05c` và `20261014T034132Z-0199dd3`. Không tụt chỉ số nào.
- [ ] **Step 3: Kịch bản ba câu** — thêm `apps/api/src/eval/rehearsal/scenarios/<tên>.ts` (tên chốt khi viết plan thực thi): đề 3 câu, một file riêng và một file nén; ít nhất một bài thiếu mục, một bài đặt tên lệch, một bài có lỗi lạ có bằng chứng. Chạy khi sandbox sẵn sàng.
- [ ] **Step 4: Ghi bản ghi và bảng so sánh** vào `apps/api/eval/rehearsals/` và báo cáo acceptance.
- [ ] **Step 5: Commit báo cáo** — `docs(p1b): kết quả kiểm chứng và nghiệm thu`. KHÔNG merge; chờ chủ đồ án duyệt.

---

## Self-Review

1. **Spec coverage:** §3.3 (guard) → Task 2; §3.4 (tổng) → Task 5; §3.5 (khoá) → Global Constraints, Task 3–4; §6.3b (cờ) → Task 8; §8 (tổng, xuất, kiểm mù theo sinh viên, giao diện) → Task 5, 7, 9, 10; §10.2 P1b (tạo câu, danh sách, tổng, xuất, canary, ruler_unverified) → đủ; §10.3 mục 4 (a, b, c) → Task 3, 4, và (c) kịch bản qua route nội bộ là Task 11 Step 3; §11 (canary, kịch bản ba câu, chứng minh một câu) → Task 6, 11. Chưa có task cho "báo cáo mức đồng thuận tích luỹ" và "cận trên Clopper–Pearson" — đã ghi ở Ngoài phạm vi.
2. **Review Focus:** mỗi dòng có test ở một Task (1 → Task 2–3; 2 → Task 5, 7; 3 → Task 3; 4 → Task 6; 5 → Task 4, 8).
3. **Nhất quán kiểu:** `StudentTotal` và `ProblemState` định nghĩa ở Task 5, dùng lại ở Task 6, 7, 9. `adoptFromAuthoring` có tham số `problemId` từ Task 3 — mọi nơi gọi cũ (`attach-exam`, test) phải cập nhật trong Task 3.
4. **Tỉ lệ:** plan dài bằng khoảng một phần ba spec liên quan, và mỗi Task chỉ nêu chữ ký và tên test, không có thân hàm.

**Mở:** các quyết định D1–D5 cần chủ đồ án trả lời; kịch bản ba câu chưa có tên; Task 11 chạy được khi sandbox sẵn sàng.
