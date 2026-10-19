# G2b PR-A2 — Bỏ tự duyệt khi gắn, `ruler_trust` quyết hậu quả Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gắn đề từ Soạn đề không còn tạo và tự duyệt gói test; mã đáp án được lưu lúc gắn; `decide()` coi thước `unverified` là bài về giảng viên, kể cả với phiên cũ đã ghim gói do LLM viết.

**Architecture:** Thay đổi nằm ở bốn tầng theo thứ tự phụ thuộc: cột và ghi mã nguồn ở `grading_reference`; cờ `ruler_unverified` trong `decide()`; chuyển `ruler_trust` vào `computeScore`; bỏ đường tự duyệt trong `TestBundleService` và `AttachExamService`. FE chỉ đổi điều kiện băng và thông báo sau gắn. Không có hợp đồng sandbox nào đổi.

**Tech Stack:** NestJS 11, TypeORM 0.3.31 (`migrationsTransactionMode: 'none'`), PostgreSQL 16, Jest (unit: `npx jest -c ../../.superpowers/jest.unit.config.js src` từ `apps/api`; e2e: `npx jest --config ./test/jest-e2e.json <file>`, tuần tự), Next.js 15 + vitest, pnpm 9.12.0, Node 22.

**Spec:** `docs/superpowers/specs/2026-10-17-g2b-ruler-generate-design.md` — mục 2 (PR-A2), 5, 6, 7, 9, 10 (Q3=A, Q4 theo khuyến nghị).

## Tách A2 (2026-10-18, theo phản hồi của chủ đồ án)

- **A2a — vá P0, merge trước, KHÔNG có migration:** Task 2 (cờ `ruler_unverified` trong `decide()`), Task 3 (truyền `ruler_trust` vào chấm), Task 4 (bỏ `adoptFromAuthoring`), Task 5 phần bỏ tạo gói (không ghi mã nguồn), Task 6 (bỏ java/node), Task 7 phần băng cảnh báo và `nextStep`, Task 8 kiểm chứng.
- **A2b — đi cùng G2b:** Task 1 (cột `model_answer_source_*` và migration `1789620000000`) và phần ghi mã nguồn lúc gắn của Task 5. Migration phải áp lên Supabase trước khi merge, vì Railway tự deploy `main` và không chạy migration.
- **Ràng buộc chung:** mỗi test mới phải quan sát được ĐỎ trước khi sửa code. Chạy baseline P0 trên `main` trước khi merge A2a (xem báo cáo).
- **Không merge A2a khi G1 chưa đạt** (điều kiện Q1 của chủ đồ án).

## Global Constraints

- **Không merge PR này khi G1 chưa đạt.** Probe ngày 2026-10-17 gửi một job `exec` tối thiểu qua `SANDBOX_REDIS_URL`: job không được worker nhận sau 120 000 ms. Trước merge, chạy lại probe và ghi kết quả vào PR.
- **Không áp migration lên Supabase trong plan này.** Railway tự deploy `main` (`cine-railway-auto-deploys-main`). Migration `1789620000000` chỉ chạy trên Postgres cục bộ. Áp lên Supabase là việc của chủ đồ án, phải xong trước khi merge.
- **e2e chỉ chạy trên Postgres cục bộ.** `apps/api/test/setup-env.ts` từ chối `DATABASE_URL` không phải cổng và database local của e2e.
- **e2e tuần tự** (`maxWorkers: 1`, CLAUDE.md). Không tăng.
- **`ruler_trust` là nguồn duy nhất cho hậu quả thước.** Không thêm cờ thứ hai ở bất kỳ đâu.
- **Mã nguồn đáp án không đi qua HTTP DTO.** Không thêm trường vào `UpsertGradingReferenceDto`; tham số đi qua tham số của service.
- **Hành vi cho phiên `teacher` và `verified` không đổi.** Kịch bản `ngan-xep-v1` là `teacher` (`modelAnswerUnverified` không được gửi, nên `ruler_trust = 'teacher'`), và số của nó không được đổi.
- **Commit message kết thúc bằng:** `Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Phiên Soạn đề cũ đã ghim gói LLM viết:** bài không tự duyệt sau khi có cờ (Task 3); gói không bị gỡ ghim âm thầm (Task 7, băng hiện cảnh báo).
2. **Gắn đề nhiều câu:** không tạo gói, không ghi mã nguồn, không lỗi (Task 5).
3. **Gắn lại cùng phiên với đáp án khác:** hai object theo băm cùng tồn tại; cột trỏ bản mới; bản cũ còn trên kho (Task 1, Task 5).
4. **Gắn hỏng sau khi ghi mã nguồn:** cột `model_answer_source_key` không trỏ object không tồn tại (Task 1, Task 5).
5. **Đề cũ có ngôn ngữ ngoài `cpp`/`python`** (ví dụ `java` từ trước khi bỏ): không ghi mã nguồn, không lỗi (Task 5).

---

### Task 1: Cột mã nguồn và ghi nguồn trong `upsert`

**Files:**
- Create: `apps/api/src/database/migrations/1789620000000-GradingReferenceAnswerSource.ts`
- Modify: `apps/api/src/grading/entities/grading-reference.entity.ts`
- Modify: `apps/api/src/grading/grading-reference.service.ts:106-184`
- Test: `apps/api/test/grading-reference.e2e-spec.ts`

**Interfaces:**
- Consumes: không có.
- Produces:
  - `export interface AnswerSource { key: string; sha256: string }` trong `grading-reference.service.ts`.
  - `GradingReferenceService.upsert(session, dto, teacherId, origin: ModelAnswerOrigin = 'teacher', answerSource: AnswerSource | null = null)`.
  - Cột `grading_reference.model_answer_source_key text NULL` và `model_answer_source_sha256 varchar(64) NULL`, ánh xạ thành `modelAnswerSourceKey` và `modelAnswerSourceSha256`.

- [ ] **Step 1: Viết test thất bại**

Trong `grading-reference.e2e-spec.ts`, thêm bốn ca:
- `upsert với answerSource hợp lệ ghi cả hai cột`: khoá đúng khuôn `grading-reference/<sessionId>/source-<64 hex>.cpp`, băm khớp, object đã có trên kho.
- `khoá mã nguồn sai khuôn → BadRequestException`: ví dụ khoá trỏ sang phiên khác.
- `upsert kế tiếp gửi modelAnswerStorageKey mà không kèm answerSource → cột mã nguồn về null`.
- `upsert chỉ ghi ghi chú (không gửi đáp án) → giữ nguyên cột mã nguồn`.

- [ ] **Step 2: Chạy test, thấy đỏ**

Run: `npx jest --config ./test/jest-e2e.json test/grading-reference.e2e-spec.ts`
Expected: bốn ca mới FAIL; các ca cũ PASS.

- [ ] **Step 3: Migration và entity**

Migration có cấu trúc giống `1789600000000-ExamProblemAdditive.ts`. `up` thêm hai cột nullable vào `examcollect.grading_reference`; `down` xoá hai cột. Không thêm constraint vào DB; kiểm khuôn ở service.

Thêm hai cột vào entity với `@Column({ name: 'model_answer_source_key', type: 'text', nullable: true })` và `@Column({ name: 'model_answer_source_sha256', type: 'varchar', length: 64, nullable: true })`.

- [ ] **Step 4: Ghi nguồn trong `upsert`**

Trong `upsert`, sau kiểm khoá đáp án cũ và trước `references.create`:
- nếu `answerSource !== null`: khoá phải khớp `^grading-reference/<session.id>/source-([0-9a-f]{64})\.(cpp|py)$`, phần băm trong khoá phải bằng `answerSource.sha256`, và `storage.objectExists(key)` phải `true`. Sai thì `BadRequestException`.
- rule ghi: `row.modelAnswerSourceKey = answerSource?.key ?? (answerSent ? null : (existing?.modelAnswerSourceKey ?? null))`, cùng cho sha. `answerSent` đã có trong hàm (dòng ~175).

Run: `npx jest --config ./test/jest-e2e.json test/grading-reference.e2e-spec.ts`
Expected: PASS toàn bộ.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/database/migrations/1789620000000-GradingReferenceAnswerSource.ts apps/api/src/grading/entities/grading-reference.entity.ts apps/api/src/grading/grading-reference.service.ts apps/api/test/grading-reference.e2e-spec.ts
git commit -m "feat(g2b-a2): cột mã nguồn đáp án trên grading_reference"
```

---

### Task 2: Cờ `ruler_unverified` trong `decide()`

**Files:**
- Modify: `apps/api/src/grading/decision/types.ts:54-62` (`CaseFlagCode` thêm `'ruler_unverified'`), `:74-93` (`DecisionInput` thêm `rulerTrust?: 'teacher' | 'verified' | 'unverified' | null`)
- Modify: `apps/api/src/grading/decision/decide.ts` — ngay trước `const auto = …`
- Test: `apps/api/src/grading/decision/decide.spec.ts`

**Interfaces:**
- Consumes: không có.
- Produces: `DecisionInput.rulerTrust` (tuỳ chọn; vắng = như `null`). Khi `rulerTrust === 'unverified'`, `decide()` thêm `caseFlags` với `code: 'ruler_unverified'`, và `outcome` thành `'flagged'`.

- [ ] **Step 1: Viết test thất bại**

Trong `decide.spec.ts`:
- `thước unverified: bài đủ bằng chứng vẫn về giảng viên với cờ ruler_unverified`: dùng cùng fixture đang cho `outcome: 'auto'`, thêm `rulerTrust: 'unverified'`; kỳ vọng `outcome === 'flagged'` và `caseFlags` chứa `code: 'ruler_unverified'`.
- `teacher, verified, null, undefined cho cùng kết quả như không truyền rulerTrust`: bốn lượt, so với lượt baseline bằng `toEqual`.

- [ ] **Step 2: Chạy test, thấy đỏ**

Run: `npx jest -c ../../.superpowers/jest.unit.config.js src/grading/decision/decide.spec.ts` (từ `apps/api`)
Expected: ca `unverified` FAIL.

- [ ] **Step 3: Cài đặt**

Trong `decide()`, trước `const auto`:

```ts
if (input.rulerTrust === 'unverified') {
  caseFlags.push({ code: 'ruler_unverified', detail: 'thước chưa kiểm chứng — bài về giảng viên' });
}
```

Không đổi các sàn khác.

- [ ] **Step 4: Chạy test, thấy xanh**

Run: cùng lệnh ở Step 2. Expected: PASS toàn bộ `decide.spec.ts`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/grading/decision/types.ts apps/api/src/grading/decision/decide.ts apps/api/src/grading/decision/decide.spec.ts
git commit -m "feat(g2b-a2): decide() đưa bài về giảng viên khi thước unverified"
```

---

### Task 3: Chuyển `ruler_trust` vào `computeScore`

**Files:**
- Modify: `apps/api/src/grading/scoring/score-core.ts:17-28` (`ScoreCoreInput` thêm `rulerTrust`), `:88-99` (truyền vào `decide({...})`)
- Modify: `apps/api/src/grading/scoring/score-inputs.ts:206` (`loadScoreContext` đọc `ruler_trust`; `ScoreContext` có trường `rulerTrust`)
- Modify: `apps/api/src/grading/scoring/score.service.ts:540-549` (truyền `rulerTrust: ctx.rulerTrust` vào `computeScore`)
- Test: `apps/api/src/grading/scoring/score-core.spec.ts`; `apps/api/test/ruler-trust-flag.e2e-spec.ts` (mới)

**Interfaces:**
- Consumes: `DecisionInput.rulerTrust` (Task 2).
- Produces: `ScoreCoreInput.rulerTrust: 'teacher' | 'verified' | 'unverified' | null`; `ScoreContext.rulerTrust` cùng kiểu.

- [ ] **Step 1: Viết test thất bại**

- Unit `score-core.spec.ts`: `computeScore` với `rulerTrust: 'unverified'` → `decision.outcome` không phải `auto`; với `'teacher'` → không đổi so với baseline.
- E2E `ruler-trust-flag.e2e-spec.ts` (mới), dùng `test/helpers/investigator-seed.ts`: hai ca.
  - `phiên có thước unverified: tính lại điểm → bài về giảng viên, không tự duyệt`.
  - `cùng phiên sau khi đổi ruler_trust về teacher → tính lại → như cũ`.

- [ ] **Step 2: Chạy test, thấy đỏ**

Run: unit và `npx jest --config ./test/jest-e2e.json test/ruler-trust-flag.e2e-spec.ts`. Expected: FAIL.

- [ ] **Step 3: Cài đặt**

- `loadScoreContext`: đọc `ruler_trust` của câu theo cùng điều kiện với `loadForGrading` (`problem_id = cfg.problemId OR problem_id IS NULL`, ưu tiên bản có `problem_id`). Không có dòng → `null`.
- Ba chỗ truyền: `score-core.ts` truyền `rulerTrust: input.rulerTrust` vào `decide`; `score.service.ts` truyền `rulerTrust: ctx.rulerTrust` vào `computeScore`.

- [ ] **Step 4: Chạy test, thấy xanh**

Run: cùng lệnh ở Step 2. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/grading/scoring/score-core.ts apps/api/src/grading/scoring/score-inputs.ts apps/api/src/grading/scoring/score.service.ts apps/api/src/grading/scoring/score-core.spec.ts apps/api/test/ruler-trust-flag.e2e-spec.ts
git commit -m "feat(g2b-a2): tính điểm đọc ruler_trust của câu"
```

---

### Task 4: Bỏ `adoptFromAuthoring`

**Files:**
- Modify: `apps/api/src/grading/test-bundle/test-bundle.service.ts:49-111` (xoá `adoptFromAuthoring`; bỏ import `lockTeacherScoring` và `resolveProblemConfig` nếu không còn dùng; giữ `BundleCaseInput` vì `insertCases` dùng)
- Modify: `apps/api/test/test-bundle.e2e-spec.ts:375-390` (xoá ca race của `adoptFromAuthoring`)
- Modify: `apps/api/test/multi-problem-p1a-writers.e2e-spec.ts:86-100` (đổi thành ca `create` gắn vào câu 1)

**Interfaces:**
- Consumes: không có.
- Produces: `TestBundleService` không còn `adoptFromAuthoring`. Task 5 không được gọi nó.
- Giữ `flattenAuthoringCases` (`authoring-bundle.ts`) và spec của nó; sau A2 không còn đường sản phẩm dùng, sẽ dọn ở G2b nếu vẫn không dùng.

- [ ] **Step 1: Viết lại test**

Trong `multi-problem-p1a-writers.e2e-spec.ts`, ca đổi tên thành `create: gói tạo tay gắn vào câu 1`; gọi `bundles.create` và kiểm `problem_id` của gói bằng id câu 1. Ca race trong `test-bundle.e2e-spec.ts` bị xoá.

- [ ] **Step 2: Chạy test, thấy đỏ**

Run: `npx jest --config ./test/jest-e2e.json test/multi-problem-p1a-writers.e2e-spec.ts`. Expected: FAIL trước khi xoá method (ca mới gọi `create` đã có sẵn, nên có thể PASS; ghi rõ kết quả).

- [ ] **Step 3: Xoá method**

Xoá `adoptFromAuthoring`. Chạy `npx tsc --noEmit -p apps/api/tsconfig.json` để tìm import thừa.

- [ ] **Step 4: Chạy test, thấy xanh**

Run: `npx jest --config ./test/jest-e2e.json test/test-bundle.e2e-spec.ts test/multi-problem-p1a-writers.e2e-spec.ts`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/grading/test-bundle/test-bundle.service.ts apps/api/test/test-bundle.e2e-spec.ts apps/api/test/multi-problem-p1a-writers.e2e-spec.ts
git commit -m "refactor(g2b-a2): bỏ adoptFromAuthoring — gói không còn tự duyệt khi gắn"
```

---

### Task 5: Gắn đề không tạo gói, ghi mã nguồn, `nextStep`

**Files:**
- Modify: `apps/api/src/exam-authoring/attach-exam.service.ts` — `AttachResult` (dòng ~63-75), `attach` (dòng ~116-246)
- Modify: `apps/api/test/exam-authoring-attach.e2e-spec.ts`

**Interfaces:**
- Consumes: `GradingReferenceService.upsert(…, origin, answerSource)` (Task 1). Không dùng `adoptFromAuthoring` (Task 4).
- Produces: `AttachResult = { examMaterialId: string; paperFilename: string; answerKeyFilename: string; nextStep: 'create_bundle' }`. `testBundle` bị bỏ.

- [ ] **Step 1: Viết lại và thêm test**

Trong `exam-authoring-attach.e2e-spec.ts`:
- Dòng ~317 `gắn đề sinh ra gói test đã duyệt và đã ghim…` → `gắn đề không tạo gói test nào; nextStep là create_bundle`: kiểm `grading_test_bundle` của phiên không đổi số dòng.
- Dòng ~346 `gắn lần hai không đè gói đã ghim…` → `gắn lần hai không tạo gói và không đổi gói ghim cũ`.
- Dòng ~386 `đề không sinh ca nào → không tạo gói rỗng` giữ ý nghĩa; đổi kiểm tra sang số dòng không đổi.
- Dòng ~399 (`gói test hỏng sau khi đề và đáp án đã ghi`) xoá: không còn bước gói.
- Dòng ~437 (`bỏ ca khỏi gói generated chưa duyệt`) xoá: không còn gói từ attach.
- Ca mới: `đề một câu cpp → ghi object theo băm, cột mã nguồn trỏ đúng, ruler_trust = unverified`.
- Ca mới: `đề nhiều câu → không ghi mã nguồn`.
- Ca mới: `ngôn ngữ java trong JSON cũ → không ghi mã nguồn, không lỗi`.
- Ca mới: `gắn hai lần với đáp án khác → hai object, cột trỏ bản mới, bản cũ còn trên kho`.

- [ ] **Step 2: Chạy test, thấy đỏ**

Run: `npx jest --config ./test/jest-e2e.json test/exam-authoring-attach.e2e-spec.ts`. Expected: các ca mới FAIL.

- [ ] **Step 3: Cài đặt `attach`**

- Sau `buildExamPaperDocx`, chỉ khi `exam.questions.length === 1`, `question.modelAnswer` không rỗng, và `exam.language ∈ {'cpp','python'}`:
  - `sha = createHash('sha256').update(modelAnswer, 'utf8').digest('hex')`;
  - `ext = language === 'cpp' ? 'cpp' : 'py'`;
  - `key = \`grading-reference/${session.id}/source-${sha}.${ext}\``;
  - `storage.putObject(key, Buffer.from(modelAnswer, 'utf8'), 'text/plain; charset=utf-8')`, trước khi ghi DB.
- `upsert` gọi với `modelAnswerUnverified: true` (kèm comment: Soạn đề chưa bao giờ chạy đáp án, và A2 không tạo gói để nâng) và tham số `answerSource` (`{key, sha256: sha}` hoặc `null`).
- Xoá khối `flattenAuthoringCases` và `adoptFromAuthoring`. Trả `{ examMaterialId, paperFilename, answerKeyFilename, nextStep: 'create_bundle' }`.
- Nhánh `catch` giữ nguyên. Object mã nguồn đã ghi nhưng `upsert` hỏng thì để object mồ côi (băm riêng, không được trỏ); ghi log.

- [ ] **Step 4: Chạy test, thấy xanh**

Run: cùng lệnh Step 2. Expected: PASS toàn bộ file.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/exam-authoring/attach-exam.service.ts apps/api/test/exam-authoring-attach.e2e-spec.ts
git commit -m "feat(g2b-a2): gắn đề không tạo gói, ghi mã nguồn theo băm, trả nextStep"
```

---

### Task 6: Bỏ `java` và `node` khỏi Soạn đề

**Files:**
- Modify: `apps/api/src/exam-authoring/dto/generate-exam.dto.ts:25` — `export const AUTHORING_LANGUAGES = ['python', 'cpp'] as const;`
- Modify: `apps/web/src/lib/api/exam-authoring.ts` (hằng ngôn ngữ có `'java'`; bỏ `java`, `node`)
- Test: `apps/api/src/exam-authoring/dto/generate-exam.dto.spec.ts` (mới)

**Interfaces:**
- Consumes: không có.
- Produces: `AUTHORING_LANGUAGES: readonly ['python', 'cpp']`.

- [ ] **Step 1: Viết test thất bại**

`generate-exam.dto.spec.ts`: `validate(plainToInstance(GenerateExamDto, {…, language: 'java'}))` trả lỗi; `'cpp'` và `'python'` không có lỗi về ngôn ngữ.

- [ ] **Step 2: Chạy, thấy đỏ**

Run: `npx jest -c ../../.superpowers/jest.unit.config.js src/exam-authoring/dto/generate-exam.dto.spec.ts`. Expected: ca `java` FAIL.

- [ ] **Step 3: Cài đặt**

Sửa `AUTHORING_LANGUAGES` và hằng ngôn ngữ phía web. Kiểm `DECLARED_LANGUAGES` (`exam-session/declared-language.ts`) không đổi: java, node vẫn là khai hợp lệ cho bài nộp.

- [ ] **Step 4: Chạy, thấy xanh**; chạy lại `apps/web` vitest cho file chứa hằng đó.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/exam-authoring/dto/generate-exam.dto.ts apps/api/src/exam-authoring/dto/generate-exam.dto.spec.ts apps/web/src/lib/api/exam-authoring.ts
git commit -m "feat(g2b-a2): Soạn đề chỉ sinh cpp và python"
```

---

### Task 7: FE — băng theo `ruler_trust`, thông báo sau gắn, schema

**Files:**
- Modify: `apps/web/src/app/teacher/grading/_components/ReferenceForm.tsx` (điều kiện băng bỏ `!hasPinnedBundle`; gói `generated` đang ghim hiện chữ "thước do model viết, chưa kiểm chứng")
- Modify: `apps/web/src/app/teacher/grading/_components/PreparePanel.tsx:90` (bỏ prop `hasPinnedBundle` nếu không còn dùng)
- Modify: `apps/web/src/app/teacher/exam-authoring/page.tsx:179` (sau attach thành công: hiện "Đề đã gắn. Tạo gói test" và liên kết tới `/teacher/grading?sessionId=<id>`)
- Modify: `apps/web/src/lib/api/exam-authoring.ts` (kiểu trả về của `attachExamToSession` theo `nextStep`)
- Regenerate: `packages/shared/src/api/schema.d.ts` — chạy script sinh schema trong `packages/shared/package.json` (đọc `scripts` trước; quy trình ở memory `cine-openapi-client-regeneration`: API phải chạy trước).
- Test: `ReferenceForm.test.tsx`, `teacher/exam-authoring/page.test.tsx` (vitest)

**Interfaces:**
- Consumes: `AttachResult.nextStep` (Task 5); `ReferenceForm` nhận cờ `unverified` từ dữ liệu đã có (xác nhận tên trường trong file trước khi sửa).
- Produces: băng cảnh báo hiện khi `unverified`, bất kể gói có ghim hay không.

- [ ] **Step 1: Viết test thất bại** — ca `băng hiện khi unverified dù đã ghim gói`; ca `sau gắn hiện "Đề đã gắn. Tạo gói test"`.
- [ ] **Step 2: Chạy vitest, thấy đỏ.**
- [ ] **Step 3: Cài đặt** theo phần Files; sinh lại schema.
- [ ] **Step 4: Chạy vitest, thấy xanh**; chạy `pnpm --filter web typecheck` (hoặc `tsc --noEmit` trong `apps/web`).
- [ ] **Step 5: Commit**

```bash
git add apps/web/src packages/shared/src/api/schema.d.ts
git commit -m "feat(g2b-a2): băng thước theo ruler_trust; dẫn sang tạo gói sau gắn"
```

---

### Task 8: Kiểm chứng tổng và PR

**Files:** không sửa code. Chỉ chạy kiểm và ghi kết quả.

- [ ] **Step 1: Unit toàn bộ**

Run (từ `apps/api`): `npx jest -c ../../.superpowers/jest.unit.config.js src`
Expected: PASS. Ghi số suite/test và so với báo cáo nghiệm thu P1a (154 suite, 1519 test). Số thay đổi phải giải thích được bằng ca đã xoá và ca mới.

- [ ] **Step 2: e2e liên quan, tuần tự**

Run: `npx jest --config ./test/jest-e2e.json test/exam-authoring-attach.e2e-spec.ts test/test-bundle.e2e-spec.ts test/multi-problem-p1a-writers.e2e-spec.ts test/start-grading-test-bundle-guard.e2e-spec.ts test/investigator-end-to-end.e2e-spec.ts test/finalize-investigator.e2e-spec.ts test/grading-reference.e2e-spec.ts test/ruler-trust-flag.e2e-spec.ts`
Expected: PASS. Thêm ca cho `start-grading`: phiên Soạn đề không có gói → 400 (trong `start-grading-test-bundle-guard.e2e-spec.ts`, theo fixture có sẵn ở ca dòng 87).

- [ ] **Step 3: Migration trên DB cục bộ**

Chạy `migration:run -t all`, `migration:revert`, `migration:run -t all` với `DATABASE_URL` ghi đè trỏ tới Postgres cục bộ. Không dùng `apps/api/.env` (trỏ Supabase, `cine-migration-hits-supabase`).

- [ ] **Step 4: Ghi bằng chứng và mở PR (không merge)**

- Chạy lại probe G1 và ghi kết quả vào mô tả PR.
- Yêu cầu `code-reviewer` review trước khi báo xong (CLAUDE.md).
- Push nhánh `feat/g2b-a2-unverified-ruler`, mở PR nháp. Mô tả PR kết thúc bằng `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

---

## Phạm vi đã đổi so với spec

Spec mục 5 ghi "duyệt gói sinh ra hiện 2–3 ca vào/ra", "duyệt và ghim gộp" và "duyệt và ghim tất cả". A2 không tạo gói nào, nên các mục này không có đối tượng để kiểm. **Chuyển sang PR-G2b.** Spec sẽ được cập nhật theo việc này khi PR được mở.
