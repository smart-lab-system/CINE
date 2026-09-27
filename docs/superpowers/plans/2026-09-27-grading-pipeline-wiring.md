# Bước 3d — Đường chấm điều tra chạy thật Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Một job chấm của bài đường `investigator` chạy thật: dựng ngữ cảnh từ DB và kho lưu trữ, gọi `investigate()`, ghi một lượt chấm bất biến mang `StoredInvestigation` v1, rồi ra điểm (lượt tính đầu của 3c) hoặc ra *không chấm được* đúng lớp lý do — và luật còn thiếu agent báo thành dòng `proposed` trên trang kiến thức. Kèm T-ESSAY-1: bài `one_shot` không bao giờ tự quyết.

**Architecture:** Một service `InvestigatorRunService` là điểm vào của nhánh `investigator` trong `gradeOneById`. Nó (1) mở hoặc nối lại một dòng `grading_attempt` đang chạy, (2) nhờ `InvestigationContextService` dựng `InvestigationContext` — hỏng ở bước này là *không chấm được* có lớp, không tốn lượt model, (3) gọi `investigate()` với các bậc model và cổng sandbox lấy từ provider `INVESTIGATOR_DEPS`, (4) giao hồ sơ cho `ScoreService.finishAttempt`, nơi MỘT transaction quyết kết cục bằng đúng lõi `computeScore()` của 3c, ghi kết cục lượt chấm, ghi lượt tính đầu hoặc đánh dấu không chấm được, và ghi luật còn thiếu. Kết cục lượt chấm được quyết TRƯỚC khi ghi — lượt chấm bất biến từ lúc có kết cục (§14.4).

**Tech Stack:** NestJS 10 · TypeORM 0.3.31 · PostgreSQL 16 · BullMQ · yauzl (đã có) · Jest; e2e dùng model giả kịch bản và sandbox giả, không tiền thật, không mạng.

**Spec:** `docs/superpowers/specs/2026-09-20-grading-agent-investigator-design.md` (bản lần 10, trong worktree, chưa commit) — §0.3, §2.1 (*Bảng lỗi ghi thành FILE*, *luật còn thiếu*), §2.3, §4.1, §4.4 (bảng lớp lý do), §5, §7, §14.1–§14.4. Nền: PR #49 (3c) — `computeScore`, `ScoreService`, hợp đồng `StoredInvestigation` v1.

## Global Constraints

- §14.4: *"`guard_grading_attempt_immutable` — Mọi UPDATE lên dòng lượt chấm đã có `outcome`"* bị chặn → kết cục lượt chấm phải quyết xong TRƯỚC câu UPDATE ghi `outcome`.
- §4.4: đúng hai lớp lý do. *"Dịch vụ AI lỗi, quá giờ, hết lượt thử · Gói test chưa từng chạy vì sandbox không phản hồi · 0 lời gọi công cụ thành công · Cạn ngân sách với 0 phát hiện"* → `system`; *"Bài không có dòng mã nào; file nén không đọc được"* → `submission`.
- §2.3 luật 2: *"Mỗi lượt là một dòng `grading_attempt` mới … Không là một dòng `grading_result` mới"*.
- §14.2 / §14.3: *"`ai_graded → flagged_for_review` — Không thoả; và **mọi** bài `one_shot` (§0.3)"*; *"Bài tự luận chấm từ nay không bao giờ vào `auto_approved`."*
- §2.1: luật còn thiếu là *"lỗi agent gặp mà không luật nào khớp"*, hiện ở trang kiến thức (`error_rule.state = 'proposed'`, `origin = 'agent_reported'`), và *"đã bị loại khỏi điểm"*.
- 3c: `StoredInvestigation` v1 = `{ version: 1, result, rulesSeen, ruleTable, modelCeiling }`; `ruleTable` = TOÀN BỘ bảng lỗi đang dùng lúc bắt đầu điều tra. Người ghi dòng `grading_result` đường điều tra xin `lockTeacherScoring` TRƯỚC mọi khoá hàng.
- Bảo mật: API chỉ cầm URL hàng đợi sandbox (`SANDBOX_REDIS_URL`), không bao giờ gửi khoá model, khoá kho lưu trữ, DB hay JWT sang sandbox; không rơi về `REDIS_URL` của API.
- Không tiền thật trong test: `buildInvestigatorTiers()` trả `[]` dưới `NODE_ENV=test`; e2e thay provider bằng model kịch bản.
- DB: chỉ DB local qua `db.sh`. Comment tiếng Việt; commit tiếng Việt + `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

## Phạm vi — cái gì KHÔNG ở plan này (sang 3d2)

| Việc | Ở đâu |
|---|---|
| Khai dạng bài + ngôn ngữ lúc tạo phiên (DTO, service; form web ở 3f) | 3d2 |
| API gói test của giảng viên (tạo phiên bản, duyệt), ghim `test_bundle_id` lúc bắt đầu chấm, điều kiện bắt đầu chấm §14.3 và route "chuẩn bị chấm" | 3d2 |
| Chấm lại bài không chấm được lớp `system` (§2.3; kèm M11 của 3b) | 3d2 |
| Đọc đề PDF thành chữ (cần thêm một thư viện — chủ đồ án quyết) | 3d2 |
| Luật mồi đóng gói sẵn (§2.1) — luật không biết `criterion_key` của rubric giảng viên, cần thiết kế ánh xạ | sau 3f, hỏi chủ đồ án |
| Phép truy hồi §2.1 (cắt ~5 luật khi bảng lớn): hôm nay `rulesSeen = ruleTable` | khi bảng lỗi thật lớn |

## Review Focus

1. **Job BullMQ thử lại sau khi model đã trả lời nhưng trước khi ghi xong** → không có hai lượt chấm "đang chạy", không ghi đè lượt đã có kết cục, không tính điểm hai lần. Test: Task 6 (job chạy hai lần; lượt đã xong thì lần hai thoát).
2. **Sandbox hay model chưa cấu hình trên máy chạy API** → bài ra không chấm được lớp `system` với lý do nói đúng điều đó (chấm lại được khi cấu hình xong), không treo tới hết giờ job, không tốn lượt model. Test: Task 6.
3. **Bài nộp là file nén chứa đường dẫn thoát thư mục / quá nhiều file / file khổng lồ** → không chép byte nào ra ngoài giới hạn, không đọc cả file bom vào bộ nhớ, bài ra `submission` với lý do đọc được. Test: Task 2.
4. **Cùng một "luật còn thiếu" do nhiều bài báo** → một dòng `proposed` duy nhất, không lỗi trùng khoá làm hỏng lượt chấm. Test: Task 5.
5. **Lượt chấm hết giờ job giữa chừng** (BullMQ `onFailed` sau lượt thử cuối) → lượt đang chạy được đóng thành `ungradable`/`system`, không sinh thêm lượt thứ hai rỗng. Test: Task 6.

---

## File Structure

| File | Trách nhiệm |
|---|---|
| `apps/api/src/grading/investigator/rule-note.ts` (mới) | Dòng *máy kiểm bằng gì* cho `bang-loi.md` — một chỗ cho eval và đường chấm |
| `apps/api/src/grading/pipeline/rule-entries.ts` (mới) | Đọc bảng lỗi đang dùng thành `RuleEntry[]` + `ruleTable` |
| `apps/api/src/grading/pipeline/archive-rules.ts` (mới, thuần) | Luật giải nén (port từ plan-1, trần chặt hơn) |
| `apps/api/src/grading/pipeline/source-files.ts` (mới) | Byte bài nộp → `{path, content}[]` + entry, hay lý do không chấm được |
| `apps/api/src/grading/pipeline/investigation-context.service.ts` (mới) | Dựng `InvestigationContext` từ DB + kho lưu trữ |
| `apps/api/src/grading/pipeline/investigator-deps.ts` (mới) | Provider `INVESTIGATOR_DEPS`: bậc model, cổng sandbox, trần theo model |
| `apps/api/src/grading/rules/missing-rules.ts` (mới) | Luật còn thiếu → dòng `proposed` |
| `apps/api/src/grading/scoring/score.service.ts` (sửa) | `finishAttempt`, `finishUngradable`; xoá `ungradable_class` khi ra điểm (M10 của 3c) |
| `apps/api/src/grading/scoring/score-inputs.ts` (sửa) | `loadScoreContext` nhận hồ sơ truyền vào; tập luật lời của phiên kèm bảng lỗi của bài đang chấm |
| `apps/api/src/grading/pipeline/investigator-run.service.ts` (mới) | Điểm vào của nhánh `investigator` trong worker |
| `apps/api/src/grading/grading.service.ts`, `grading.queue.ts` (sửa) | Nối nhánh; `markUngradable` đóng lượt đang chạy; trần giờ job có chỗ thở; T-ESSAY-1 |

---

### Task 0: Workspace, DB

- [ ] **Step 1:** Nhánh `feature/grading-pipeline-wiring` tách từ `feature/grading-rules-prices` (PR #49).
- [ ] **Step 2:** `sdd-workspace` cho plan này; chép `db.sh` (scratchpad) vào; mở ledger.
- [ ] **Step 3:** Docker (`cine-postgres-1`, `cine-minio-1`, `cine-redis-1`), dọn jest/nest mồ côi; `bash …/db.sh pnpm --filter api migration:run` → *No migrations are pending*.

---

### Task 1: Bảng lỗi đang dùng → `RuleEntry[]` + `ruleTable`

**Files:** Create `apps/api/src/grading/investigator/rule-note.ts`, `apps/api/src/grading/pipeline/rule-entries.ts`; Modify `apps/api/src/eval/context-from-fixture.ts` (dùng `machineNoteOf`); Test `apps/api/src/grading/investigator/rule-note.spec.ts`, `apps/api/test/rule-entries.e2e-spec.ts`.

**Interfaces — Produces:**
- `machineNoteOf(p: RulePredicate | null): string | null` — `null` → null; `test_group_failed` → `nhóm test <group>`; mẫu khác → `máy chưa đo được — bạn phán đoán` (đúng chữ của eval hôm nay).
- `loadRuleEntries(m: EntityManager, teacherId: string): Promise<{ entries: RuleEntry[]; ruleTable: StoredInvestigation['ruleTable'] }>` — luật `active` của giảng viên, bản sửa hiện hành (`title` = `error_rule_revision.name`), `priced` = có giá khác null ở phiên bản bảng giá hiện hành, `checkedBy` = `isMachineChecked(predicate)`, `machineNote` = `machineNoteOf`. Thứ tự `rule_key`. `ruleTable` = `entries.map(({ruleKey, checkedBy}))`.

- [ ] **Step 1: Test đỏ.** `rule-note.spec.ts`: ba nhánh. `rule-entries.e2e-spec.ts`: giảng viên A có luật máy kiểm có giá, luật lời chưa giá, một luật `proposed`, một luật `retired`; giảng viên B có một luật → `loadRuleEntries(A)` trả đúng hai luật `active` của A, đúng `title`, `priced` (true / false), `checkedBy` (`machine` / `model`), `machineNote`; `ruleTable` khớp.
- [ ] **Step 2:** Viết hai file; `context-from-fixture.ts` bỏ `noteOf` riêng, import `machineNoteOf`.
- [ ] **Step 3:** PASS; `pnpm --filter api test -- eval` vẫn xanh (eval dùng chung dòng note).
- [ ] **Step 4:** Commit `feat(grading): đọc bảng lỗi đang dùng thành RuleEntry cho bang-loi.md, kèm ruleTable của StoredInvestigation`.

---

### Task 2: Byte bài nộp → file mã nguồn

**Files:** Create `apps/api/src/grading/pipeline/archive-rules.ts` (port `feature/code-autograder-plan-1:apps/api/src/grading/archive/archive-rules.ts`), `apps/api/src/grading/pipeline/source-files.ts`; Test `archive-rules.spec.ts`, `source-files.spec.ts`.

**Interfaces — Produces:**
- `archive-rules.ts`: `ArchiveEntry`, `ExtractionLimits`, `SOURCE_EXTRACTION_LIMITS = { maxEntries: 500, maxTotalBytes: 8 MiB, maxFileBytes: 1 MiB }`, `decideEntry`, `planExtraction` — nguyên logic plan-1 (tuyệt đối, `..`, symlink, trần từng file, trần tổng, trần số entry), chỉ đổi trần mặc định.
- `sourceFilesOf(bytes: Buffer, declaredFilename: string, language: SandboxLanguage): Promise<SourceFiles>` với `SourceFiles = { kind: 'ok'; files: { path: string; content: string }[]; entry: string | null; dropped: string[] } | { kind: 'ungradable'; class: 'submission' | 'system'; reason: string }`.
  - Nhận dạng file nén bằng `detectArchiveFormat(bytes)` (`submission/archive-check/archive-reader.ts`), không bằng đuôi tên.
  - `zip`: đọc header bằng `yauzl.fromBuffer(..., { lazyEntries: true })`; quyết từng entry bằng `decideEntry` và trần tổng TRƯỚC khi mở stream; khi đọc stream, đếm byte thật và huỷ nếu vượt `maxFileBytes` (header nói dối được). Bỏ thư mục, `__MACOSX/`, file ẩn, file không phải mã nguồn của ngôn ngữ (`cpp`: `.cpp .cc .cxx .h .hpp`; `python`: `.py`) — ghi tên vào `dropped`. Mở không được / entry thù địch / vượt trần → `submission` với lý do tiếng Việt.
  - `rar` → `submission`, *"bài nộp dạng RAR — đường chấm điều tra chỉ đọc ZIP; chấm tay"*.
  - Không phải file nén: một file, `path` = `main.cpp` / `main.py`.
  - Nội dung: UTF-8, bỏ BOM; file có byte NUL là nhị phân → `dropped`.
  - `path` phải qua đúng khuôn `safePath` của `sandbox/contract.ts`; không qua → `submission` nêu tên file (đã `quoted`).
  - Không còn file nào → `submission` *"bài nộp không có file mã nguồn nào"*.
  - `entry`: `cpp` → null (bài là chương trình có `main`, driver null); `python` → `main.py` nếu có, không thì file `.py` duy nhất, không thì `submission` *"không xác định được file chạy — cần main.py"*.

- [ ] **Step 1: Test đỏ.** `archive-rules.spec.ts`: bốn ca tấn công của plan-1 (`../`, tuyệt đối, symlink, vượt trần từng file / tổng / số entry). `source-files.spec.ts` (zip dựng bằng `yazl`, khuôn `makeZip` của `archive-reader.spec.ts`): file lẻ cpp → `main.cpp`; zip hai file `.cpp` + `README.md` + `__MACOSX/x` → hai file, `dropped` có hai tên; zip có `../evil.cpp` → `submission`; zip có một entry khai 100 byte nhưng thật 2 MiB → `submission` (trần byte thật); zip rỗng → `submission`; zip python không `main.py`, có `bai.py` → `entry = 'bai.py'`; hai `.py` không `main.py` → `submission`; RAR (magic `Rar!\x1a\x07`) → `submission`; tên file có dấu cách → `submission` nêu tên.
- [ ] **Step 2:** Viết hai file.
- [ ] **Step 3:** PASS → commit `feat(grading): đọc bài nộp code thành file mã nguồn — giải nén ZIP theo trần quyết từ header và đếm byte thật (§2.1, §4.4)`.

---

### Task 3: Dựng `InvestigationContext`

**Files:** Create `apps/api/src/grading/pipeline/investigation-context.service.ts`; Modify `grading.module.ts`; Test `apps/api/test/investigation-context.e2e-spec.ts`; Create `apps/api/test/helpers/code-session-seed.ts`.

**Interfaces — Produces:**
- `InvestigationContextService.build(resultId: string): Promise<BuiltContext>`, `BuiltContext = { kind: 'ok'; ctx: InvestigationContext; ruleTable: StoredInvestigation['ruleTable']; teacherId: string } | { kind: 'ungradable'; class: 'system' | 'submission'; reason: string }`:
  - `language` = `required_deliverable.language` của bài (phải là `cpp`/`python` — `pipelineFor` đã bảo đảm; khác thì `system`).
  - `problemStatement` = `extractText(questionBytes, questionFilename)` qua `GradingReferenceService.loadForGrading(sessionId)`; rỗng (không có đề, hay đề PDF) → `system`, *"đề bài chưa đọc được thành chữ (<tên file>) — đường chấm điều tra cần đề dạng DOCX/TXT"*.
  - `requiredComplexity` = null (bước 4); `driver` = null.
  - `submission`, `entry` = `sourceFilesOf(storage.getObject(submission.storage_key), requiredFilename, language)`; không có `storage_key` hay đọc kho lỗi → `system`; `sourceFilesOf` ra `ungradable` → giữ nguyên lớp.
  - `testBundle` = `{ id: exam_session.test_bundle_id, cases }` với ca của gói đó, `auto_dropped_reason IS NULL`, `name = case_key`, `input`, `expected = expected_output`; chưa ghim gói → `system`, *"phiên chưa ghim gói test — không có thước để chạy (§4.4)"*.
  - `modelAnswerAvailable` = `loadForGrading(...).modelAnswer !== undefined`.
  - `rules`, `ruleTable` = `loadRuleEntries(manager, teacherId)`.
  - `budget` = `readInvestigationBudget(process.env)`.
- Helper e2e `seedCodeSession(ds, storage, label, opts)` — phiên `code_project` / `cpp`, rubric hai tiêu chí, gói test hai ca ghim vào phiên, đề `.txt` trong kho, bài nộp `main.cpp` trong kho (upload qua `storage.generateUploadUrl` rồi `fetch PUT`, khuôn `archive-check.e2e-spec.ts`), trả `{ ctx: SeedSession, resultId, submissionId }` với kết quả `pipeline = 'investigator'`, `ai_grading`.

- [ ] **Step 1: Test đỏ** — `investigation-context.e2e-spec.ts`: phiên đủ đồ → `kind: 'ok'`, `language: 'cpp'`, `problemStatement` = chữ của đề, hai ca đúng tên / nhóm, `rules` của giảng viên, `submission.files = [{ path: 'main.cpp', ... }]`; phiên chưa ghim gói → `system` nêu gói test; đề `.pdf` → `system` nêu đề; bài nộp rỗng → `ok` (T-EMPTY-1 để `investigate()` tự bắt — nó đã trả `submission`).
- [ ] **Step 2:** Service; provider trong `grading.module.ts`.
- [ ] **Step 3:** PASS → commit `feat(grading): dựng ngữ cảnh điều tra từ DB và kho lưu trữ; thiếu đề chữ / thiếu gói test là không chấm được lớp system`.

---

### Task 4: Provider `INVESTIGATOR_DEPS`

**Files:** Create `apps/api/src/grading/pipeline/investigator-deps.ts`; Modify `grading.module.ts`; Test `investigator-deps.spec.ts`.

**Interfaces — Produces:**
- `INVESTIGATOR_DEPS` (token) → `InvestigatorDeps = { models: ModelTier[]; sandbox: SandboxPort | null; ceilingOf(model: string): number; close(): Promise<void> }`.
- `buildInvestigatorDeps(env, factories = { tiers: buildInvestigatorTiers, sandbox: createSandboxClient }): InvestigatorDeps` (thuần theo env — test được):
  - `models = factories.tiers()`; `ceilingOf(model)` = `ceiling` của bậc có `model` đó, mặc định 0,5 (khuôn eval).
  - `SANDBOX_REDIS_URL` trống → `sandbox: null` (KHÔNG rơi về `REDIS_URL` của API); có → `createSandboxClient({ redisUrl, prefix: env.SANDBOX_PREFIX || undefined, log })`, `close` đóng nó.
- Provider factory: `useFactory: () => buildInvestigatorDeps(process.env)`; một `@Injectable()` nhỏ `InvestigatorDepsLifecycle implements OnModuleDestroy` gọi `close()`.

- [ ] **Step 1: Test đỏ** (`investigator-deps.spec.ts`): không `SANDBOX_REDIS_URL` → `sandbox === null`, factory sandbox không được gọi dù có `REDIS_URL`; có → factory nhận đúng `redisUrl`, `prefix`; `ceilingOf` trả trần của bậc, 0,5 khi lạ.
- [ ] **Step 2:** Viết; đăng ký provider.
- [ ] **Step 3:** PASS → commit `feat(grading): provider bậc model và cổng sandbox cho đường điều tra — chỉ đọc SANDBOX_REDIS_URL, không rơi về Redis của API`.

---

### Task 5: `ScoreService.finishAttempt` / `finishUngradable` + luật còn thiếu

**Files:** Modify `apps/api/src/grading/scoring/score.service.ts`, `score-inputs.ts`; Create `apps/api/src/grading/rules/missing-rules.ts`; Test `apps/api/test/finish-attempt.e2e-spec.ts`.

**Interfaces — Produces:**
- `recordMissingRules(m, teacherId, missing: { description: string }[]): Promise<number>` — mỗi mô tả: `rule_key = 'de_xuat_' + sha256(chuẩn hoá(mô tả)).hex.slice(0, 16)` (chuẩn hoá: NFC, chữ thường, gộp khoảng trắng); `INSERT … ON CONFLICT (teacher_id, rule_key) DO NOTHING RETURNING id` (`origin = 'agent_reported'`, `state = 'proposed'`); dòng mới thì bản sửa 1 (`name` = mô tả cắt 200, `description` = mô tả, `criterion_key = 'chua_gan'`, `predicate` null, `created_by` = giảng viên) và `current_revision_id`. Trả số dòng mới.
- `loadScoreContext(m, resultId, storedOverride?: StoredInvestigation)` — có `storedOverride` thì dùng nó thay cho lượt chấm trong DB (lượt đang chạy chưa có kết cục).
- `sessionModelRulesWith(m, sessionId, resultId, ruleTable)` (score-inputs): tập của phiên KHÔNG kể bài này, giao với luật `model` trong `ruleTable` của bài này; phiên chưa có lượt `graded` nào khác → chính luật `model` của `ruleTable`.
- `ScoreService.finishAttempt(resultId, attemptId, stored: StoredInvestigation, meta: AttemptMeta): Promise<FinishOutcome>` — `AttemptMeta = { modelUsed: string | null; tokensIn: number; tokensOut: number; sandboxHost: object | null }`, `FinishOutcome = { kind: 'scored'; outcome: 'auto' | 'flagged'; scoreHundredths: number; computationId: string } | { kind: 'ungradable'; class: 'system' | 'submission'; reason: string }`. MỘT transaction:
  1. `lockTeacherScoring`; `SELECT … FOR UPDATE` kết quả; đòi `pipeline = 'investigator'`, `status = 'ai_grading'`, `current_attempt_id = attemptId`, lượt đó `outcome IS NULL` — không thì NÉM (job cũ; người gọi bỏ qua).
  2. `stored.result.kind === 'ungradable'` → nhánh không chấm được với `stored.result.ungradable`.
  3. Không thì `computeScore` với ngữ cảnh `loadScoreContext(m, resultId, stored)` và `sessionModelRulesWith(...)`; ra `ungradable` (dưới sàn) → nhánh không chấm được với `ungradable` của lõi.
  4. Nhánh ra điểm: UPDATE lượt chấm (`outcome = 'graded'`, `investigation = stored`, `model_used`, `tokens_in/out`, `sandbox_host`, `finished_at = clock_timestamp()`); rồi cùng thân với `computeInitial` (dòng `initial`, `ai_graded` kèm `ai_total_score`, `confidence`, `model_used`, **và `ungradable_class = NULL, ungradable_reason = NULL`**, rồi `auto_approved | flagged_for_review`, rồi kiểm tập luật lời thu hẹp → tính lại phiên). Rút phần chung của `computeInitial` thành một hàm riêng để hai đường dùng.
  5. Nhánh không chấm được: UPDATE lượt chấm (`outcome = 'ungradable'`, `ungradable_class`, `ungradable_reason`, `investigation = stored` nếu có, `finished_at`); UPDATE kết quả `ai_grading → flagged_for_review` kèm `flag_for_review`, `confidence = 0`, `ungradable_class`, `ungradable_reason`.
  6. Có `stored.result.verdict?.missingRules` → `recordMissingRules` (cả hai nhánh: luật còn thiếu là quan sát, dưới sàn vẫn đúng).
- `ScoreService.finishUngradable(resultId, attemptId, u: { class; reason }): Promise<void>` — nhánh 5 không có hồ sơ (hỏng trước khi điều tra).

- [ ] **Step 1: Test đỏ** (`finish-attempt.e2e-spec.ts`, helper 3c `seedInvestigatorSession` + `seedResult(…, 'investigator')` + một lượt chấm `outcome` NULL chèn tay và `current_attempt_id`):
  - ra điểm: lượt chấm `graded` mang đủ hồ sơ; `score_computation` `initial`; kết quả `auto_approved`, `ai_total_score` đúng;
  - `stored.result.kind = 'ungradable'` (lớp `submission`) → lượt `ungradable` / `submission`, kết quả `flagged_for_review` / `submission`, không `score_computation`;
  - dưới sàn (gói test rỗng) → `system`;
  - hai bài báo cùng một luật còn thiếu (khác hoa thường / khoảng trắng) → một dòng `proposed`, `ErrorRuleService.missing(t)` thấy nó; bài thứ hai không nổ;
  - lượt không phải lượt hiện hành / đã có kết cục → ném, không ghi gì;
  - kết quả từng có `ungradable_class = 'system'` (lượt chấm lại) → ra điểm được, lớp xoá.
- [ ] **Step 2:** Viết; `computeInitial` dùng hàm chung.
- [ ] **Step 3:** PASS; `score-service`, `rules-prices` e2e vẫn xanh → commit `feat(scoring): kết thúc lượt chấm điều tra trong một transaction — quyết kết cục trước khi ghi, ra điểm hay không chấm được đúng lớp; luật còn thiếu thành dòng proposed (§2.1, §4.4, §14.4)`.

---

### Task 6: Nhánh `investigator` của worker

**Files:** Create `apps/api/src/grading/pipeline/investigator-run.service.ts`; Modify `grading.service.ts` (`gradeOneById`, `markUngradable`), `grading.queue.ts` (`GRADE_JOB_TIMEOUT_MS`), `grading.module.ts`; Test `apps/api/test/investigator-run.e2e-spec.ts`.

**Interfaces — Produces:**
- `InvestigatorRunService.run(resultId: string): Promise<void>`:
  1. `startAttempt(resultId)` — transaction: `lockTeacherScoring`, `SELECT … FOR UPDATE`; kết quả không còn `ai_grading` → trả null (job cũ, thoát); lượt hiện hành `outcome IS NULL` → dùng lại nó (job thử lại); không thì chèn lượt `attempt_no = max + 1`, `triggered_by = grading_triggered_by`, `started_at = clock_timestamp()`, rồi `current_attempt_id`.
  2. `deps.sandbox === null` hay `deps.models.length === 0` → `finishUngradable(system, 'đường chấm điều tra chưa cấu hình <sandbox (SANDBOX_REDIS_URL) | bậc model (GRADING_TIER*)> — chấm lại khi cấu hình xong')`.
  3. `contexts.build(resultId)`; `ungradable` → `finishUngradable`.
  4. `investigate(ctx, { models, sandbox })`.
  5. `stored = { version: 1, result, rulesSeen: ruleTable, ruleTable, modelCeiling: Math.min(1, ...result.investigation.modelsUsed.map(ceilingOf)) }`; `finishAttempt(resultId, attempt.id, stored, { modelUsed: modelsUsed.join('+').slice(0, 200) || null, tokensIn, tokensOut, sandboxHost })` — `sandboxHost` = `host` của kết quả có cấu trúc đầu tiên (khuôn `hostOf` của eval).
- `gradeOneById`: nhánh `investigator` gọi `investigatorRun.run(result.id)` thay cho `markUngradable` chốt chặn của 3b.
- `markUngradable`: xin `lockTeacherScoring` (giảng viên của phiên) trước UPDATE; lượt hiện hành `outcome IS NULL` → ĐÓNG lượt đó (`ungradable` / `system` / lý do / `finished_at`) thay vì chèn lượt mới.
- `GRADE_JOB_TIMEOUT_MS` mặc định = `readInvestigationBudget(process.env).maxWallMs + 60_000` (env `GRADE_JOB_TIMEOUT_MS` vẫn thắng): trần giờ job phải rộng hơn trần giờ điều tra, không thì job bị giết đúng lúc `investigate()` đang tự dừng có trật tự.

- [ ] **Step 1: Test đỏ** (`investigator-run.e2e-spec.ts`; `Test.createTestingModule({ imports: [AppModule] }).overrideProvider(INVESTIGATOR_DEPS).useValue(...)`; model kịch bản khuôn `scripted()` của `investigate.spec.ts` — một lượt gọi `run_tests`, một lượt `final` báo một lỗi luật lời và một `missingRules`; sandbox giả `fakeSandbox` của `investigator/testing` trả nhóm `bien` fail; phiên `seedCodeSession` của Task 3):
  - đường chuẩn: `gradingService.gradeOneById(job)` → một lượt chấm `graded`, `investigation.version = 1`, `ruleTable` có luật của giảng viên; `score_computation` `initial`; trạng thái `auto_approved` hay `flagged_for_review` đúng theo công thức; một dòng `proposed`;
  - chạy lại cùng job sau khi xong → không lượt chấm thứ hai, không lượt tính thứ hai (Review Focus 1);
  - job chết giữa chừng: `startAttempt` rồi NÉM trước `finishAttempt` (sandbox giả ném), chạy lại → dùng lại đúng lượt đang chạy, kết thúc bình thường; chỉ một dòng lượt chấm;
  - `sandbox: null` → `ungradable` / `system` nêu `SANDBOX_REDIS_URL`, model kịch bản không được gọi lần nào (Review Focus 2);
  - `markUngradable` khi đang có lượt chạy → lượt đó đóng thành `ungradable` / `system`, không lượt mới (Review Focus 5).
- [ ] **Step 2:** Viết service, sửa `gradeOneById`, `markUngradable`, `GRADE_JOB_TIMEOUT_MS`.
- [ ] **Step 3:** PASS; `grading-regrade.spec`, `grading.processor.spec` (unit), `grading-lifecycle` e2e vẫn xanh → commit `feat(grading): worker chạy đường điều tra thật — mở / nối lại lượt chấm, điều tra, kết thúc lượt; hết lượt thử thì đóng lượt đang chạy (§2.3, §7, §14.4)`.

---

### Task 7: T-ESSAY-1 — bài `one_shot` không bao giờ tự quyết

**Files:** Modify `apps/api/src/grading/grading.service.ts` (write 2 của `gradeOne`); Test: sửa các test đang mã hoá `one_shot → auto_approved`, thêm ca T-ESSAY-1.

- [ ] **Step 1: Test đỏ:** ca mới (e2e dùng `KeywordGradingProvider` như các e2e chấm hiện có, hay unit `grading-regrade.spec` khuôn `sets[]`): bài tự luận confidence cao → `flagged_for_review`, KHÔNG `auto_approved`. Chạy `pnpm --filter api test` + `test:e2e` để liệt kê MỌI test đang đòi `auto_approved` cho `one_shot` — mỗi test là một chỗ mã hoá luật cũ, sửa kỳ vọng (ghi từng file vào ledger).
- [ ] **Step 2:** Write 2 của `gradeOne`: `status: 'flagged_for_review'` luôn; `flag_for_review` giữ nghĩa cũ (confidence thấp) để màn phân loại hôm nay không đổi.
- [ ] **Step 3:** PASS toàn bộ → commit `feat(grading): bài một-phát không bao giờ tự quyết (§0.3, §14.3, T-ESSAY-1)`.

---

### Task 8: Kiểm cuối

- [ ] `pnpm --filter api test`; `pnpm --filter api test:e2e` (ca đỏ sẵn `exam-authoring-attach` ghi nhận); `pnpm --filter api build`; eslint; `pnpm --filter web build`.
- [ ] DB sạch: tạo DB tạm, schema `examcollect`, chạy cả chuỗi migration (plan này không thêm migration — xác nhận vẫn 48).
