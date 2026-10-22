# Tự chốt có cầu dao, duyệt nhanh và hồ sơ lỗi có dẫn chứng — kế hoạch triển khai

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Giữ tự chốt bật như hôm nay, thêm cầu dao tự tắt theo luật và theo lớp bài không lỗi dựa trên nhãn kiểm mẫu; thêm đường xác nhận hàng loạt cho bài điều tra và nhãn đo thời gian; và làm trang chi tiết một bài hiện được vì sao mỗi lỗi bị trừ, kèm dẫn chứng.

**Architecture:** Cờ chặn và cờ lớp không lỗi là tham số thuần của `decide()` (mặc định giữ hành vi hôm nay; nguồn là cầu dao trong DB hợp env, dựng ở `ScoreService.compute`). Nhãn theo luật và theo lớp ghi cùng giao dịch với nhãn kiểm mẫu; cầu dao tắt bằng phép thử nhị thức một phía và hạ bậc bài chưa chốt qua `recomputeForTeacher`. Đường xác nhận là kind `system_confirm` gom theo `ruleId`. Hồ sơ lỗi có dẫn chứng đi hai giai đoạn: E1 (API cộng thêm + giao diện, không đổi agent) rồi E2 (agent trả đoạn trích và lý do, có cổng đo). Mọi thay đổi schema là additive và phải áp lên Supabase trước khi merge.

**Tech Stack:** NestJS + TypeORM + PostgreSQL (apps/api, Jest), Next.js + Vitest (apps/web), OpenAPI client sinh từ API.

**Spec:** `docs/superpowers/specs/2026-10-21-cham-diem-duyet-nhanh-design.md` bản 3 (đọc cùng plan này; mục 10 là các quyết định còn chờ).

## Global Constraints

- `GRADING_AUTO_THRESHOLD`: đọc từ env, chỉ nhận (0, 1], mặc định 0,85 kèm cảnh báo khi giá trị vô nghĩa.
- `GRADING_AUTO_BLOCK_RULE_KEYS`: danh sách khoá, **mặc định rỗng** (không chặn luật nào). Điều kiện tự chốt của bài có lỗi **không đổi** khi tập chặn rỗng.
- `GRADING_AUTO_NO_ERROR`: `true`/`false`, **mặc định `true`** (giữ hành vi hôm nay). `DecisionInput.autoNoErrorEnabled` vắng mặt cũng là `true`.
- Dung sai so sánh θ: `1e-9`. Công thức confidence không đổi.
- Cầu dao: `BREAKER_P0 = 0.05`, `BREAKER_ALPHA = 0.05`; tắt khi `P(X ≥ d | n, p0) < α`; `n` và `d` đếm các nhãn ghi sau lần bật lại gần nhất. Phạm vi `rule` (theo `rule_id`) và `no_error` (lớp bài không lỗi của một giảng viên). Mở = `reset_at IS NULL`, tối đa một dòng mở cho mỗi (giảng viên, phạm vi, luật).
- "Bài không lỗi" = lượt tính mới nhất có `breakdown.errors` rỗng.
- Ngưỡng để tuyên bố (không phải điều kiện bật): precision ≥ 0,95 cần 72 ca tự chốt không sai; mức giám sát ≥ 0,90 cần 36 ca. Chỉ tính trên nhãn giảng viên thật; không tính bài cấy lỗi.
- Kiểm mẫu: tỉ lệ 20%, sàn 5% (`GRADING_AUDIT_SAMPLE_PERCENT`, đã có). Rút theo sinh viên (bất biến P1b). `AUDIT_MIN_PER_SESSION` mặc định 2, chờ chủ đồ án quyết.
- Mù kiểm mẫu: mọi trường mới của `ResultDetail` phải rỗng trong `blindResultDetail` (bài `audit_pending`).
- E2: dẫn chứng và lý do **chỉ hiển thị**, không đổi điểm, cờ hay quyết định; mọi trường mới là tuỳ chọn khi đọc. Cổng đo (đề xuất, chờ duyệt), `ngan-xep-v2`, k = 3: điểm đúng và lỗi bắt được không giảm so với lượt nền; ≥ 80% lỗi `llm_only` và `llm_with_tools` có một đoạn `verified`; token và thời gian mỗi bài không tăng quá 20%.
- Migration mới có timestamp lớn hơn `1789680000000`; dùng các số: `1789700000000`, `1789710000000`, `1789720000000`, `1789730000000`, `1789740000000`.
- Railway tự deploy `main` khi merge và **không** chạy migration. Áp migration lên Supabase trước khi merge.
- Không commit, không push khi chưa được yêu cầu (quy tắc repo). Khi commit, dùng dòng attribution theo nhắc nhở của phiên.

## Review Focus

1. Cầu dao tắt nhưng bài `auto_approved` chưa chốt thuộc phạm vi vẫn được chốt, hoặc bài `finalized` bị đụng tới → test trong Task 5A (hạ bậc trong cùng giao dịch; `finalized` không đổi).
2. Giao dịch ghi nhãn kiểm mẫu lùi mà vẫn còn nhãn hoặc dòng cầu dao ma → test trong Task 5A (lùi thì không còn gì).
3. Bài `audit_pending` rò định nghĩa luật, bằng chứng hay `confidenceTerms` qua trường mới của `ResultDetail` → test trong Task 13 (che mù).
4. Bài `ungradable` hoặc không biên dịch lọt vào nhóm xác nhận hàng loạt → test trong Task 7 (lý do `ungradable`).
5. Phản hồi agent thiếu `evidence` hoặc `reason` bị coi là hỏng (`bad_output`) → test trong Task 15 (trường tuỳ chọn).

---

## File Structure

- Create: `apps/api/src/database/migrations/1789700000000-GradingResultOpenedAt.ts` — cột `opened_at`.
- Create: `apps/api/src/database/migrations/1789710000000-TeacherReviewSystemConfirm.ts` — kind `system_confirm`, cột `confirmed_computation_id`.
- Create: `apps/api/src/database/migrations/1789720000000-AutoBreaker.ts` — bảng `audit_rule_label`, `audit_no_error_label`, `auto_rule_breaker`.
- Create: `apps/api/src/database/migrations/1789730000000-ScoreReasonAutoRuleTripped.ts` — giá trị enum `auto_rule_tripped`.
- Create: `apps/api/src/database/migrations/1789740000000-ReviewLabelView.ts` — view `review_label_v`.
- Modify: `apps/api/src/grading/decision/types.ts` — hai trường mới trong `DecisionInput`, hai mã cờ mới.
- Modify: `apps/api/src/grading/decision/decide.ts` — cổng cờ và so sánh θ có dung sai.
- Modify: `apps/api/src/grading/decision/threshold.ts` — `readAutoBlockedRules`, `readAutoNoError`, `AUTO_THETA_EPSILON`.
- Modify: `apps/api/src/grading/decision/confidence.ts` — thêm `confidenceTerms`.
- Modify: `apps/api/src/grading/scoring/score-core.ts` và `score.service.ts` — truyền cờ, đọc env, hợp với cầu dao DB trong `compute()`, mở rộng `recomputeForTeacher` thêm `noErrors`.
- Create: `apps/api/src/grading/auto-breaker/breaker-verdict.ts`, `breaker-verdict.spec.ts` (hàm thuần), `breaker-queries.ts`, `auto-breaker.service.ts`.
- Modify: `apps/api/src/grading/audit/audit-review.service.ts` — ghi nhãn và gọi cầu dao trong cùng giao dịch.
- Create: `apps/api/src/grading/review-group/review-group.types.ts`, `review-group.ts` (hàm thuần `groupResults`), `review-group.service.ts`, `review-group-confirm.service.ts`, `dto/confirm-review-group.dto.ts`.
- Modify: `apps/api/src/grading/grading.controller.ts`, `grading.module.ts`.
- Modify: `apps/api/src/grading/entities/grading-result.entity.ts` (thêm `openedAt`), `entities/teacher-review.entity.ts` (thêm `confirmedComputationId`, kind mới), `grading-model.types.ts` (thêm `auto_rule_tripped` vào `SCORE_COMPUTATION_REASONS`).
- Modify: `apps/api/src/grading/audit-sampling.ts` và `score.service.ts` — số mẫu tối thiểu theo phiên.
- Modify: `apps/api/src/grading/investigator/investigate.ts`, `types.ts` — nguồn của `injection_suspected`; `VerdictError.evidence` (E2).
- Modify: `apps/api/src/grading/investigator/protocol.ts`, `prompt-version.ts`, `challenge.ts`, `lens-protocol.ts` và các lăng kính trong `investigator/lenses/` — khuôn phản hồi và prompt (E2).
- Modify: `apps/api/src/grading/scoring/result-detail.ts`, `audit-blind.ts` — trường mới của `ResultDetail` (E1).
- Create: `apps/web/src/app/teacher/grading/_components/ReviewGroupsPanel.tsx` và `ReviewGroupsPanel.test.tsx`.
- Create: `apps/web/src/lib/predicate-text.ts` (+ test), `apps/web/src/app/teacher/grading/[resultId]/_components/investigator/ErrorEvidence.tsx` và `ConfidenceBreakdown.tsx` (+ test) (E1).
- Modify: `ErrorList.tsx`, `CaseFlagsBanner.tsx`, `InvestigationTrail.tsx`, `InvestigatorDossier.tsx` trong `[resultId]/_components/investigator/`, `apps/web/src/lib/grading-vocab.ts`, `apps/web/src/lib/api/grading.ts` (kiểu), trang chi tiết bài (gọi `opened`) và trang danh sách phiên (đặt panel).
- Modify: test cũ chỉ khi đỏ (xem Task 11).

---

## Task 1: Kiểm trạng thái DB thật trước khi làm

Không sửa code. Mục đích: biết khối lượng bài đang tự chốt và chưa chốt, đặc biệt nhóm **không lỗi**, làm đường cơ sở.

**Files:** Create: `docs/rehearsals/2026-10-21-pre-p1-db-counts.md`

**Interfaces:**
- Consumes: kết nối DB thật (Supabase) qua biến môi trường đã đặt đúng (xem Task 12, mục kiểm kết nối).
- Produces: bảng số đếm dùng làm đường cơ sở cho Task 11.

- [ ] **Step 1: Viết câu truy vấn đếm**

Đếm theo trạng thái (`auto_approved`, `audit_pending`, `flagged_for_review`) và theo ba nhóm: không lỗi; có lỗi do máy (`source` khác `llm_only`/`llm_with_tools`); có lỗi do LLM. Lấy lỗi từ lượt tính mới nhất trong `score_computation.breakdown`.

- [ ] **Step 2: Chạy truy vấn và ghi kết quả**

Run: `psql "$DATABASE_URL" -f <file-sql>`
Expected: một bảng số đếm không âm, tổng khớp số dòng `grading_result` của phiên đã chọn.

- [ ] **Step 3: Ghi vào file rehearsal**

Ghi kết quả, thời điểm và commit `bdde467` vào `docs/rehearsals/2026-10-21-pre-p1-db-counts.md`.

---

## Task 2: Migration additive (cột, kind, bảng nhãn và cầu dao, enum, view)

**Files:**
- Create: `apps/api/src/database/migrations/1789700000000-GradingResultOpenedAt.ts`
- Create: `apps/api/src/database/migrations/1789710000000-TeacherReviewSystemConfirm.ts`
- Create: `apps/api/src/database/migrations/1789720000000-AutoBreaker.ts`
- Create: `apps/api/src/database/migrations/1789730000000-ScoreReasonAutoRuleTripped.ts`
- Create: `apps/api/src/database/migrations/1789740000000-ReviewLabelView.ts`
- Modify: `apps/api/src/database/verify-schema.ts` (thêm cột, giá trị enum, bảng và view vào danh sách kiểm)

**Interfaces:**
- Produces:
  - `examcollect.grading_result.opened_at timestamptz NULL`;
  - giá trị enum `teacher_review_kind = 'system_confirm'`; cột `examcollect.teacher_review.confirmed_computation_id uuid NULL REFERENCES examcollect.score_computation(id)`;
  - `examcollect.audit_rule_label(grading_result_id uuid, rule_id uuid REFERENCES examcollect.error_rule(id), verdict text CHECK (verdict IN ('both','teacher_only','system_only')), recorded_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (grading_result_id, rule_id))`, chỉ-thêm (gắn `guard_append_only` theo khuôn bảng chỉ-thêm sẵn có);
  - `examcollect.audit_no_error_label(grading_result_id uuid PRIMARY KEY, teacher_id uuid NOT NULL, agree boolean NOT NULL, recorded_at timestamptz NOT NULL DEFAULT now())`, chỉ-thêm;
  - `examcollect.auto_rule_breaker(id uuid PK, teacher_id uuid NOT NULL, scope text NOT NULL CHECK (scope IN ('rule','no_error')), rule_id uuid NULL REFERENCES examcollect.error_rule(id), tripped_at timestamptz NOT NULL DEFAULT now(), evidence jsonb NOT NULL, reset_at timestamptz NULL, reset_by uuid NULL)`, kèm CHECK `(scope = 'rule') = (rule_id IS NOT NULL)` và chỉ mục duy nhất từng phần `uq_auto_rule_breaker_open` trên `(teacher_id, scope, COALESCE(rule_id, '00000000-0000-0000-0000-000000000000'::uuid)) WHERE reset_at IS NULL`;
  - giá trị enum `score_computation_reason = 'auto_rule_tripped'`;
  - view `examcollect.review_label_v(result_id, pipeline, status, system_total, decision_kind, teacher_total, opened_at, reviewed_at, review_seconds)`.

- [ ] **Step 1: Xác định định nghĩa mới nhất của trigger bất biến**

Run: `grep -rln "guard_grading_result_ai_immutable" apps/api/src/database/migrations | sort | tail -1`
Mở migration mới nhất trong kết quả, tìm khối `CREATE OR REPLACE FUNCTION examcollect.guard_grading_result_ai_immutable`. Ghi danh sách cột mà nó so sánh.
Expected: `opened_at` không nằm trong danh sách. Nếu nằm, dừng và báo chủ đồ án trước khi làm tiếp.

- [ ] **Step 2: Viết test schema (thất bại trước)**

Trong `verify-schema.ts`, thêm kiểm tra: cột `opened_at` tồn tại; `system_confirm` và `auto_rule_tripped` có trong enum tương ứng; cột `confirmed_computation_id` có khoá ngoại; ba bảng `audit_rule_label`, `audit_no_error_label`, `auto_rule_breaker` tồn tại, chỉ mục từng phần có mặt; view `review_label_v` tồn tại.

- [ ] **Step 3: Chạy kiểm tra và xác nhận thất bại**

Run: `cd apps/api && npx ts-node src/database/verify-schema.ts` (hoặc lệnh kiểm schema hiện có trong `package.json`)
Expected: FAIL, báo thiếu cột/giá trị/bảng/view.

- [ ] **Step 4: Viết năm migration**

- `1789700000000`: `ALTER TABLE examcollect.grading_result ADD COLUMN opened_at timestamptz NULL`. `down`: `DROP COLUMN`.
- `1789710000000`: `ALTER TYPE examcollect.teacher_review_kind ADD VALUE 'system_confirm'`; thêm cột `confirmed_computation_id`; sửa CHECK `ck_teacher_review_score_by_kind` (xoá rồi tạo lại) để `system_confirm` yêu cầu `final_score IS NOT NULL` và `confirmed_computation_id IS NOT NULL`.
- `1789720000000`: tạo ba bảng và chỉ mục từng phần như ở Interfaces; chọn hàm sinh uuid theo khuôn các migration gần nhất; gắn `guard_append_only` cho hai bảng nhãn.
- `1789730000000`: `ALTER TYPE examcollect.score_computation_reason ADD VALUE IF NOT EXISTS 'auto_rule_tripped'` (tiền lệ `1789470000000`, `1789490000000`).
- `1789740000000`: `CREATE VIEW examcollect.review_label_v AS ...` theo cột đã nêu, lấy lượt tính mới nhất qua `score_computation` và dòng `teacher_review` mới nhất theo `reviewed_at`. `decision_kind` là `'auto'` khi không có dòng giảng viên.
- `ALTER TYPE ... ADD VALUE` không dùng được trong cùng giao dịch với lệnh dùng giá trị đó; mỗi giá trị enum nằm ở migration riêng như trên.

- [ ] **Step 5: Chạy kiểm tra và xác nhận đạt**

Run: lệnh kiểm schema ở Step 3.
Expected: PASS.

- [ ] **Step 6: Commit (chỉ khi chủ đồ án yêu cầu)**

---

## Task 3: Cờ lớp không lỗi và cờ luật bị chặn trong `decide()`

**Files:**
- Modify: `apps/api/src/grading/decision/types.ts` — thêm `CaseFlagCode`: `'type_auto_disabled' | 'no_error_auto_disabled'`; thêm vào `DecisionInput`: `autoBlockedRuleKeys?: ReadonlySet<string>` (vắng = rỗng), `autoNoErrorEnabled?: boolean` (vắng = `true`).
- Modify: `apps/api/src/grading/decision/decide.ts` — cổng cờ ngay trước điều kiện tự quyết (quanh dòng 206).
- Modify: `apps/api/src/grading/decision/decide.spec.ts` — thêm test.

**Interfaces:**
- Consumes: `DecisionInput` hiện có.
- Produces: `decide()` trả `outcome: 'flagged'` với cờ mới khi bài không lỗi mà `autoNoErrorEnabled === false`, hoặc khi có lỗi thuộc tập chặn; hành vi **không đổi** khi hai tham số vắng mặt.

- [ ] **Step 1: Viết test thất bại**

```ts
it('bài không có lỗi nào không tự chốt khi autoNoErrorEnabled=false', () => {
  const r = decide(input({ errors: [], autoNoErrorEnabled: false }));
  expect(r.outcome).toBe('flagged');
  expect(r.caseFlags.map((f) => f.code)).toContain('no_error_auto_disabled');
});
it('tham số vắng mặt: bài không lỗi vẫn tự chốt như hôm nay', () => {
  expect(decide(input({ errors: [] })).outcome).toBe('auto');
});
it('lỗi thuộc autoBlockedRuleKeys không tự chốt', () => {
  const r = decide(input({ errors: [err({ ruleKey: 'R1', source: 'deterministic' })], autoBlockedRuleKeys: new Set(['R1']) }));
  expect(r.outcome).toBe('flagged');
  expect(r.caseFlags.map((f) => f.code)).toContain('type_auto_disabled');
});
it('tham số vắng mặt: bài có lỗi máy, confidence 1,0 vẫn tự chốt như hôm nay', () => {
  expect(decide(input({ errors: [err({ ruleKey: 'R1', source: 'deterministic' })] })).outcome).toBe('auto');
});
it('tập chặn chứa khoá khác thì không ảnh hưởng', () => {
  expect(decide(input({ errors: [err({ ruleKey: 'R1', source: 'deterministic' })], autoBlockedRuleKeys: new Set(['R2']) })).outcome).toBe('auto');
});
```

`input(...)` và `err(...)` là helper đã có trong `decide.spec.ts`; thêm tham số mới vào helper.

- [ ] **Step 2: Chạy test và xác nhận thất bại**

Run: `cd apps/api && npx jest src/grading/decision/decide.spec.ts`
Expected: FAIL ở các test có tham số mới (cờ chưa tồn tại).

- [ ] **Step 3: Triển khai cổng cờ**

Trong `decide()`, trước khối `if (caseFlags.length === 0 && errorFlags.length === 0 && confidence < input.theta)`:
- nếu `errors.length === 0 && input.autoNoErrorEnabled === false` → đẩy `no_error_auto_disabled`;
- với mỗi lỗi có `ruleKey ∈ (input.autoBlockedRuleKeys ?? ∅)` → đẩy `type_auto_disabled` (một cờ cho mỗi khoá).
Cổng này chỉ thêm cờ, không đổi confidence hay điểm.

- [ ] **Step 4: Chạy test và xác nhận đạt**

Run: `cd apps/api && npx jest src/grading/decision/decide.spec.ts`
Expected: PASS toàn bộ, kể cả test cũ (mặc định giữ hành vi).

- [ ] **Step 5: Commit (chỉ khi chủ đồ án yêu cầu)**

---

## Task 4: Đọc cờ từ env và truyền vào `decide()`

**Files:**
- Modify: `apps/api/src/grading/decision/threshold.ts` — thêm `readAutoBlockedRules(env)` và `readAutoNoError(env)`, theo khuôn `readAutoThreshold`.
- Modify: `apps/api/src/grading/scoring/score-core.ts` (các dòng 17–28, 90–102) — truyền hai trường mới qua hàm.
- Modify: `apps/api/src/grading/scoring/score.service.ts` — đọc lúc khởi tạo cạnh `theta` (dòng 91) và truyền vào `computeScore` trong `compute()` (quanh dòng 526–535). Task 5A hợp thêm cầu dao DB vào đúng chỗ này.
- Modify: `apps/api/eval/cli.ts` (dòng 113) và runner đường điều tra (tìm bằng `grep -rn "investigator-runner" apps/api/eval`).
- Create: `apps/api/src/grading/decision/threshold.spec.ts` (nếu chưa có).

**Interfaces:**
- Consumes: `DecisionInput` từ Task 3.
- Produces: `readAutoBlockedRules(env: NodeJS.ProcessEnv): { keys: ReadonlySet<string>; warning: string | null }`; `readAutoNoError(env: NodeJS.ProcessEnv): { enabled: boolean; warning: string | null }`.

- [ ] **Step 1: Viết test thất bại**

```ts
it('readAutoBlockedRules: chuỗi rỗng hoặc không đặt → tập rỗng, không cảnh báo', () => {
  expect(readAutoBlockedRules({}).keys.size).toBe(0);
  expect(readAutoBlockedRules({ GRADING_AUTO_BLOCK_RULE_KEYS: '' }).keys.size).toBe(0);
});
it('readAutoBlockedRules: tách dấu phẩy, bỏ khoảng trắng', () => {
  expect([...readAutoBlockedRules({ GRADING_AUTO_BLOCK_RULE_KEYS: ' a , b ' }).keys]).toEqual(['a', 'b']);
});
it('readAutoNoError: không đặt → true; "false" → false; giá trị khác → true kèm cảnh báo', () => {
  expect(readAutoNoError({}).enabled).toBe(true);
  expect(readAutoNoError({ GRADING_AUTO_NO_ERROR: 'false' }).enabled).toBe(false);
  expect(readAutoNoError({ GRADING_AUTO_NO_ERROR: 'yes' })).toMatchObject({ enabled: true });
  expect(readAutoNoError({ GRADING_AUTO_NO_ERROR: 'yes' }).warning).not.toBeNull();
});
```

- [ ] **Step 2: Chạy test và xác nhận thất bại**

Run: `cd apps/api && npx jest src/grading/decision/threshold.spec.ts`
Expected: FAIL (hàm chưa tồn tại).

- [ ] **Step 3: Triển khai hai hàm đọc env**

Viết theo khuôn `readAutoThreshold`. Trả cảnh báo khi đặt biến nhưng giá trị vô nghĩa (giá trị vô nghĩa rơi về mặc định `true`). Thêm hai field vào lời gọi `computeScore` ở `score.service.ts` và `decide()` ở `eval/cli.ts`.

- [ ] **Step 4: Chạy test và xác nhận đạt**

Run: `cd apps/api && npx jest src/grading/decision/threshold.spec.ts`
Expected: PASS.

- [ ] **Step 5: Kiểm tra mặc định production không đổi**

Run: `cd apps/api && npx jest --config ./test/jest-e2e.json test/score-service.e2e-spec.ts`
Expected: PASS như trước (env không đặt → hành vi hôm nay). Test nào đỏ thì ghi vào danh sách của Task 11, không sửa tạm.

- [ ] **Step 6: Commit (chỉ khi chủ đồ án yêu cầu)**

---

## Task 5: Quy tắc tắt cầu dao (hàm thuần)

**Files:**
- Create: `apps/api/src/grading/auto-breaker/breaker-verdict.ts`
- Test: `apps/api/src/grading/auto-breaker/breaker-verdict.spec.ts`

**Interfaces:**
- Produces:
  ```ts
  export const BREAKER_P0 = 0.05;
  export const BREAKER_ALPHA = 0.05;
  /** P(X >= d), X ~ Binomial(n, p). */
  export function binomialTailAtLeast(n: number, d: number, p: number): number;
  export function breakerVerdict(input: { n: number; disagreements: number }): { trip: boolean; pValue: number };
  ```

- [ ] **Step 1: Viết test thất bại**

```ts
it.each([
  [1, 1, false], [2, 2, true], [5, 1, false], [5, 2, true], [20, 3, false], [20, 4, true],
])('n=%i d=%i → trip=%s', (n, d, trip) => {
  expect(breakerVerdict({ n, disagreements: d }).trip).toBe(trip);
});
it('n=0 → không tắt, pValue = 1', () => {
  expect(breakerVerdict({ n: 0, disagreements: 0 })).toEqual({ trip: false, pValue: 1 });
});
it('binomialTailAtLeast(2, 2, 0.05) ≈ 0,0025', () => {
  expect(binomialTailAtLeast(2, 2, 0.05)).toBeCloseTo(0.0025, 6);
});
it('d > n, d âm hoặc không nguyên → RangeError', () => {
  expect(() => breakerVerdict({ n: 2, disagreements: 3 })).toThrow(RangeError);
  expect(() => breakerVerdict({ n: 2, disagreements: -1 })).toThrow(RangeError);
  expect(() => breakerVerdict({ n: 2, disagreements: 0.5 })).toThrow(RangeError);
});
```

- [ ] **Step 2: Chạy test và xác nhận thất bại**

Run: `cd apps/api && npx jest src/grading/auto-breaker/breaker-verdict.spec.ts`
Expected: FAIL (module chưa tồn tại).

- [ ] **Step 3: Triển khai**

Tính đuôi nhị thức bằng truy hồi tỉ số các số hạng (không dùng giai thừa); `d = 0` → 1. `trip` là `pValue < BREAKER_ALPHA` (so sánh nghiêm ngặt: ca `n=1, d=1` có `pValue = 0,05` và **không** tắt).

- [ ] **Step 4: Chạy test và xác nhận đạt**

Run: lệnh ở Step 2. Expected: PASS.

- [ ] **Step 5: Commit (chỉ khi chủ đồ án yêu cầu)**

---

## Task 5A: Nhãn, cầu dao (luật và lớp không lỗi), hạ bậc và bật lại

**Files:**
- Create: `apps/api/src/grading/auto-breaker/breaker-queries.ts`
- Create: `apps/api/src/grading/auto-breaker/auto-breaker.service.ts`
- Modify: `apps/api/src/grading/audit/audit-review.service.ts` — `record` ghi nhãn và gọi cầu dao trong cùng giao dịch.
- Modify: `apps/api/src/grading/scoring/score.service.ts` — `compute()` hợp tập chặn DB với tập chặn env (Task 4) và đặt `autoNoErrorEnabled` theo cầu dao lớp; `recomputeForTeacher` thêm `scope.noErrors`. Thêm `auto_rule_tripped` vào `SCORE_COMPUTATION_REASONS` ở `grading-model.types.ts`.
- Modify: `apps/api/src/grading/grading.controller.ts`, `grading.module.ts` — hai route.
- Test: `apps/api/test/auto-breaker.e2e-spec.ts`

**Interfaces:**
- Consumes: `breakerVerdict` (Task 5); bảng và enum (Task 2); `ScoreService.recomputeForTeacher(m, teacherId, reason, actorId, { ruleId?, noErrors?, exceptResultId? })`; `AuditReveal.perRule` (`{ ruleId, ruleKey, ruleName, verdict }`) và `AuditReveal.summary`.
- Produces:
  ```ts
  // breaker-queries.ts (không là provider; ScoreService gọi trực tiếp, tránh vòng phụ thuộc)
  export function loadOpenBreakerRuleKeys(m: EntityManager, teacherId: string): Promise<string[]>;
  export function isNoErrorBreakerOpen(m: EntityManager, teacherId: string): Promise<boolean>;
  export function countRuleLabelsSinceReset(m: EntityManager, ruleId: string): Promise<{ n: number; disagreements: number }>;
  export function countNoErrorLabelsSinceReset(m: EntityManager, teacherId: string): Promise<{ n: number; disagreements: number }>;
  // auto-breaker.service.ts
  recordLabelsAndEvaluate(m: EntityManager, teacherId: string, resultId: string, reveal: AuditReveal): Promise<{ tripped: string[] }>;
  listOpen(teacherId: string): Promise<{ id: string; scope: 'rule' | 'no_error'; ruleId: string | null; ruleKey: string | null; trippedAt: Date; n: number; disagreements: number }[]>;
  reset(teacherId: string, breakerId: string, actorId: string): Promise<void>;
  ```
  Route: `GET auto-breakers`; `POST auto-breakers/:id/reset`.

- [ ] **Step 1: Viết test e2e thất bại**

Dùng fixture của `audit-sampling.e2e-spec.ts` / `multi-problem-p1b-audit.e2e-spec.ts` để có các bài `audit_pending` và `auto_approved` có lỗi của luật R (và bài không lỗi):
- (a) hai bài `audit_pending` có R, giảng viên ghi nhãn mù **không chọn R** cho cả hai → sau lần ghi thứ hai: đúng một dòng `auto_rule_breaker` mở, `scope = 'rule'`, `evidence` có `n=2`, `disagreements=2`; một bài `auto_approved` chưa chốt khác có R (không được rút mẫu) đã là `flagged_for_review`; một bài `finalized` có R không đổi trạng thái và không có lượt tính mới.
- (b) năm nhãn theo luật, một bất đồng → không có dòng cầu dao.
- (c) ghi nhãn lần hai cho cùng bài → 409 `locked` như hôm nay; không có nhãn trùng.
- (d) `reset` bởi giảng viên không sở hữu → 404; bởi chủ → `reset_at` đặt; sau đó một nhãn `both` mới cho `n=1, d=0`, không tắt lại (nhãn trước lần bật lại không đếm).
- (e) lỗi giả lập trong lúc tính lại (spy ném lỗi) → giao dịch lùi: không còn dòng `audit_rule_label`, `audit_no_error_label`, `audit_sample_review`, `auto_rule_breaker` nào cho các bài đó.
- (f) bài vừa được kiểm mẫu không có lượt tính mới do cầu dao (`exceptResultId`).
- (g) lớp không lỗi: hai bài `audit_pending` không lỗi, giảng viên chọn một luật cho cả hai → dòng `auto_rule_breaker` mở với `scope = 'no_error'` và `rule_id` rỗng; bài không lỗi `auto_approved` chưa chốt về `flagged_for_review` với cờ `no_error_auto_disabled`; bài có lỗi `auto_approved` không đổi.
- (h) bài không lỗi mà giảng viên không chọn gì và không ghi lỗi nào → `agree = true`, không tắt.

- [ ] **Step 2: Chạy test và xác nhận thất bại**

Run: `cd apps/api && npx jest --config ./test/jest-e2e.json test/auto-breaker.e2e-spec.ts`
Expected: FAIL (service và route chưa có).

- [ ] **Step 3: Triển khai `recordLabelsAndEvaluate`**

Trong `AuditReviewService.record`, sau `advanceStatus` thành công: gọi `reveal` rồi `recordLabelsAndEvaluate(m, teacherId, resultId, reveal)` **trước khi trả** (cùng giao dịch `m`).
- Phạm vi luật: chèn một dòng `audit_rule_label` cho mỗi luật trong `reveal.perRule`; với mỗi luật chưa có dòng cầu dao mở, đọc `countRuleLabelsSinceReset`, gọi `breakerVerdict`; nếu `trip` thì chèn `auto_rule_breaker` (evidence: `n`, `disagreements`, `pValue`, `p0`, `alpha`) rồi `recomputeForTeacher(m, teacherId, 'auto_rule_tripped', null, { ruleId, exceptResultId: resultId })`.
- Phạm vi lớp không lỗi: nếu `reveal.systemErrors` rỗng, chèn `audit_no_error_label` với `agree = (summary.agreement === 'full')`; nếu chưa có dòng mở `scope = 'no_error'`, đọc `countNoErrorLabelsSinceReset`, gọi `breakerVerdict`; nếu `trip` thì chèn dòng cầu dao và gọi `recomputeForTeacher(..., { noErrors: true, exceptResultId: resultId })`.
- `lockTeacherScoring` đã được lấy trong `record`; `recomputeForTeacher` lấy lại cùng khoá trong cùng giao dịch.

- [ ] **Step 4: Nối cầu dao DB vào `compute()` và mở rộng `recomputeForTeacher`**

Trong `ScoreService.compute()`: gọi `loadOpenBreakerRuleKeys(m, ctx.teacherId)` và `isNoErrorBreakerOpen(m, ctx.teacherId)` (cùng `m`, để thấy dòng vừa chèn trong cùng giao dịch); truyền `autoBlockedRuleKeys` = hợp với tập env, và `autoNoErrorEnabled` = (env bật) và không có cầu dao lớp mở. Trong `recomputeForTeacher`, thêm `scope.noErrors?: boolean` với điều kiện SQL `jsonb_array_length(last.breakdown -> 'errors') = 0` trên lượt tính mới nhất.

- [ ] **Step 5: Triển khai `listOpen`, `reset` và hai route**

`reset` kiểm quyền: giảng viên phải là `teacher_id` của dòng cầu dao; đặt `reset_at = now()` và `reset_by`; không tính lại bài. Controller dùng guard giảng viên của controller đang chứa các route chấm điểm. Đặt route chữ `auto-breakers` trước mọi route tham số có thể che (kiểm bằng `grep -rn "auto-breakers\|error-rules" apps/api/src`).

- [ ] **Step 6: Chạy test và xác nhận đạt**

Run: lệnh ở Step 2. Expected: PASS.

- [ ] **Step 7: Commit (chỉ khi chủ đồ án yêu cầu)**

---

## Task 5B: Sửa so sánh θ (dung sai)

Làm **sau** Task 5A và chỉ merge cùng hoặc sau cầu dao (spec §5.1: sửa này làm tăng số bài tự chốt).

**Files:**
- Modify: `apps/api/src/grading/decision/threshold.ts` — `export const AUTO_THETA_EPSILON = 1e-9;`
- Modify: `apps/api/src/grading/decision/decide.ts` (dòng 206) — `confidence < input.theta - AUTO_THETA_EPSILON`.
- Modify: `apps/api/src/grading/decision/decide.spec.ts` — test biên.

**Interfaces:**
- Produces: `AUTO_THETA_EPSILON: number`.

- [ ] **Step 1: Viết test biên thất bại**

```ts
it('một lỗi llm_with_tools mức trừ 13 hundredths: confidence 0,85 không bị gắn low_confidence', () => {
  const r = decide(input({
    errors: [err({ ruleKey: 'R1', source: 'llm_with_tools', deductionHundredths: 13 })],
    theta: 0.85,
  }));
  expect(r.caseFlags.map((f) => f.code)).not.toContain('low_confidence');
});
```

- [ ] **Step 2: Chạy test và xác nhận thất bại**

Run: `cd apps/api && npx jest src/grading/decision/decide.spec.ts -t "mức trừ 13"`
Expected: FAIL (`low_confidence` đang có).

- [ ] **Step 3: Triển khai dung sai**

Thay so sánh ở dòng 206 bằng `confidence < input.theta - AUTO_THETA_EPSILON`. Không đổi công thức confidence.

- [ ] **Step 4: Chạy test và xác nhận đạt**

Run: `cd apps/api && npx jest src/grading/decision/decide.spec.ts -t "mức trừ 13"`
Expected: PASS.

- [ ] **Step 5: Commit (chỉ khi chủ đồ án yêu cầu)**

---

## Task 6: Gom bài theo lỗi (hàm thuần và endpoint đọc)

**Files:**
- Create: `apps/api/src/grading/review-group/review-group.types.ts`
- Create: `apps/api/src/grading/review-group/review-group.ts` — hàm thuần `groupResults`.
- Create: `apps/api/src/grading/review-group/review-group.spec.ts`
- Create: `apps/api/src/grading/review-group/review-group.service.ts` — đọc DB và gọi `groupResults`.
- Modify: `apps/api/src/grading/grading.controller.ts` — `GET exam-sessions/:id/review-groups`.
- Modify: `apps/api/src/grading/grading.module.ts` — đăng ký provider.

**Interfaces:**
- Produces:
  ```ts
  export interface ReviewGroup {
    key: string;             // ruleId, hoặc 'multi', hoặc 'none'
    label: string;           // service điền tên luật; hàm thuần trả ruleId
    description: string | null; // service điền mô tả luật; hàm thuần trả null
    sources: string[];       // các `source` có trong nhóm, không trùng
    kind: 'single' | 'multi' | 'none';
    ruleId: string | null;
    resultIds: string[];
    sampleResultIds: string[]; // tối đa 3, theo thứ tự id tăng dần
  }
  export interface GroupInput {
    resultId: string;
    errors: { ruleId: string; source: string }[]; // từ lượt tính mới nhất
  }
  export function groupResults(rows: GroupInput[]): ReviewGroup[];
  ```
- Consumes: lượt tính mới nhất từ `score_computation.breakdown` (đường `score-core.ts:30-41`).

- [ ] **Step 1: Viết test thất bại**

```ts
it('bài cùng một ruleId vào cùng nhóm single', () => {
  const g = groupResults([
    { resultId: 'a', errors: [{ ruleId: 'R1', source: 'llm_with_tools' }] },
    { resultId: 'b', errors: [{ ruleId: 'R1', source: 'deterministic' }] },
  ]);
  expect(g).toHaveLength(1);
  expect(g[0]).toMatchObject({ key: 'R1', kind: 'single', resultIds: ['a', 'b'], sampleResultIds: ['a', 'b'] });
  expect(g[0].sources.sort()).toEqual(['deterministic', 'llm_with_tools']);
});
it('bài có nhiều lỗi đứng riêng trong nhóm multi', () => {
  const g = groupResults([{ resultId: 'a', errors: [{ ruleId: 'R1', source: 'deterministic' }, { ruleId: 'R2', source: 'deterministic' }] }]);
  expect(g.find((x) => x.kind === 'multi')!.resultIds).toEqual(['a']);
});
it('bài không lỗi đứng riêng trong nhóm none', () => {
  const g = groupResults([{ resultId: 'a', errors: [] }]);
  expect(g[0]).toMatchObject({ key: 'none', kind: 'none' });
});
it('cùng luật ở hai phiên bản rubric là hai ruleId, hai nhóm', () => {
  const g = groupResults([
    { resultId: 'a', errors: [{ ruleId: 'R1-v1', source: 'deterministic' }] },
    { resultId: 'b', errors: [{ ruleId: 'R1-v2', source: 'deterministic' }] },
  ]);
  expect(g).toHaveLength(2);
});
it('bài mẫu tối đa 3', () => {
  const rows = ['a', 'b', 'c', 'd'].map((resultId) => ({ resultId, errors: [{ ruleId: 'R1', source: 'deterministic' }] }));
  expect(groupResults(rows)[0].sampleResultIds).toEqual(['a', 'b', 'c']);
});
```

- [ ] **Step 2: Chạy test và xác nhận thất bại**

Run: `cd apps/api && npx jest src/grading/review-group/review-group.spec.ts`
Expected: FAIL (module chưa tồn tại).

- [ ] **Step 3: Triển khai `groupResults`**

Hàm thuần. Thứ tự nhóm: đơn lỗi theo `ruleId` tăng dần, rồi `multi`, rồi `none`. `label` cho nhóm đơn là `ruleId`, `description` là `null`; service điền tên và mô tả luật.

- [ ] **Step 4: Chạy test và xác nhận đạt**

Run: `cd apps/api && npx jest src/grading/review-group/review-group.spec.ts`
Expected: PASS.

- [ ] **Step 5: Triển khai service đọc và route**

`ReviewGroupService.listGroups(sessionId, teacherId)`: lấy các `grading_result` của phiên đang `flagged_for_review`, pipeline `investigator`, kèm lượt tính mới nhất; gọi `groupResults`; điền `label` và `description` từ `error_rule_revision` hiện hành. Kiểm quyền bằng khuôn `assertOwned` có sẵn trong `grading/`. Route trả `ReviewGroup[]`.

- [ ] **Step 6: Commit (chỉ khi chủ đồ án yêu cầu)**

---

## Task 7: Xác nhận hàng loạt bài điều tra

**Files:**
- Create: `apps/api/src/grading/review-group/review-group-confirm.service.ts`
- Create: `apps/api/src/grading/review-group/dto/confirm-review-group.dto.ts` — `{ key: string; resultIds?: string[] }`.
- Modify: `apps/api/src/grading/grading.controller.ts` — `POST exam-sessions/:id/review-groups/confirm`.
- Test: `apps/api/test/review-group-confirm.e2e-spec.ts`

**Interfaces:**
- Consumes: `ReviewGroup` (Task 6), `system_confirm` và `confirmed_computation_id` (Task 2), khuôn chuyển trạng thái `advance` trong `teacher-review.service.ts`.
- Produces:
  ```ts
  export interface ConfirmOutcome {
    confirmed: number;
    skipped: { resultId: string; reason: 'not_flagged' | 'has_manual' | 'ungradable' | 'no_computation' | 'not_investigator' }[];
  }
  confirmGroup(sessionId: string, teacherId: string, dto: { key: string; resultIds?: string[] }): Promise<ConfirmOutcome>;
  ```

- [ ] **Step 1: Viết test e2e thất bại**

Các kịch bản (dùng seed có sẵn của `test/helpers/` cho phiên điều tra):
- (a) nhóm 2 bài `flagged_for_review` → `confirmed: 2`, cả hai `teacher_reviewed`, mỗi bài có một dòng `system_confirm` với `confirmed_computation_id` và `final_score` bằng tổng lượt tính.
- (b) bài có `manual_score` → vào `skipped` với `has_manual`.
- (c) bài `ungradable` → vào `skipped` với `ungradable`.
- (d) gọi lần hai → `confirmed: 0`, các bài vào `skipped` với `not_flagged`.
- (e) bài `finalized` không bị đụng tới (không có dòng mới).

- [ ] **Step 2: Chạy test và xác nhận thất bại**

Run: `cd apps/api && npx jest --config ./test/jest-e2e.json test/review-group-confirm.e2e-spec.ts`
Expected: FAIL (route và service chưa có).

- [ ] **Step 3: Triển khai trong một giao dịch**

Với mỗi bài trong nhóm (lọc theo `resultIds` nếu có): kiểm trạng thái, kiểm có `manual_score`, kiểm pipeline; nếu hợp lệ thì ghi `system_confirm` và chuyển `flagged_for_review → teacher_reviewed`. Toàn bộ nằm trong một `ds.transaction`. Bài bị bỏ ghi lý do.

- [ ] **Step 4: Chạy test và xác nhận đạt**

Run: `cd apps/api && npx jest --config ./test/jest-e2e.json test/review-group-confirm.e2e-spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit (chỉ khi chủ đồ án yêu cầu)**

---

## Task 8: Mốc mở bài

**Files:**
- Modify: `apps/api/src/grading/entities/grading-result.entity.ts` — thêm `openedAt` với `name: 'opened_at'`.
- Modify: `apps/api/src/grading/grading.controller.ts` — `POST grading-results/:id/opened`.
- Modify: `apps/api/src/grading/grading.service.ts` — `markOpened(resultId, teacherId)`.
- Test: `apps/api/test/grading-opened.e2e-spec.ts`

**Interfaces:**
- Produces: `markOpened(resultId: string, teacherId: string): Promise<void>`; câu lệnh `UPDATE examcollect.grading_result SET opened_at = now() WHERE id = $1 AND opened_at IS NULL` sau kiểm quyền.

- [ ] **Step 1: Viết test e2e thất bại**

- gọi hai lần → `opened_at` không đổi ở lần hai;
- giảng viên không sở hữu phiên → 404 (theo khuôn kiểm quyền sẵn có).

- [ ] **Step 2: Chạy test và xác nhận thất bại**

Run: `cd apps/api && npx jest --config ./test/jest-e2e.json test/grading-opened.e2e-spec.ts`
Expected: FAIL.

- [ ] **Step 3: Triển khai**

Dùng `UPDATE ... WHERE opened_at IS NULL`, không dùng ORM `save`, để không ghi đè và không chạm các cột bị trigger bảo vệ.

- [ ] **Step 4: Chạy test và xác nhận đạt**

Run: lệnh ở Step 2. Expected: PASS.

- [ ] **Step 5: Commit (chỉ khi chủ đồ án yêu cầu)**

---

## Task 9: Giao diện xác nhận hàng loạt, cầu dao và client OpenAPI

**Files:**
- Create: `apps/web/src/app/teacher/grading/_components/ReviewGroupsPanel.tsx`
- Create: `apps/web/src/app/teacher/grading/_components/ReviewGroupsPanel.test.tsx`
- Modify: trang chi tiết bài của giảng viên (tìm bằng `grep -rln "grading-results" apps/web/src/app/teacher`) — gọi `POST grading-results/:id/opened` một lần khi mở.
- Modify: trang danh sách phiên (`apps/web/src/app/teacher/grading/page.tsx`) — đặt `ReviewGroupsPanel` cho phiên điều tra.
- Regenerate: client OpenAPI theo `cine-openapi-client-regeneration` (chạy API rồi sinh lại `schema.d.ts`).

**Interfaces:**
- Consumes: `ReviewGroup`, `ConfirmOutcome` (Task 6–7); `GET auto-breakers` và `POST auto-breakers/:id/reset` (Task 5A); tất cả đã sinh vào client.
- Produces: `<ReviewGroupsPanel sessionId={string} />`, gồm khối nhóm cần xác nhận và khối "Tự chốt đang tạm dừng".

- [ ] **Step 1: Viết test thất bại**

- Hiển thị một dòng cho mỗi nhóm kèm số bài, mô tả quy tắc, nhãn nguồn, mức chắc chắn, độ khớp với bạn và liên kết tới bài mẫu (`sampleResultIds`);
- chỉ nhóm một lỗi có nút "Duyệt N bài…"; nhóm `multi` và `none` chỉ có "Xem từng bài"; nhóm `none` hiện "Chưa đo được" và các lý do bị gắn cờ (nguồn từ Task 10A);
- nút duyệt mở hộp thoại liệt kê từng bài kèm điểm hệ thống và trạng thái "chưa xem"; nếu chưa mở bài nào thì hiện cảnh báo nhưng **không chặn** nút "Duyệt N bài";
- xác nhận gọi endpoint với `key` của nhóm;
- khối "Tự chốt đang tạm dừng" hiển thị phạm vi (luật hoặc "bài không lỗi"), `n`, `disagreements`; nút "Bật lại" mở hộp xác nhận rồi gọi `reset`; khi danh sách rỗng thì khối không hiện.

- [ ] **Step 2: Chạy test và xác nhận thất bại**

Run: `cd apps/web && npx vitest run src/app/teacher/grading/_components/ReviewGroupsPanel.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Triển khai**

Dùng khuôn của `BulkAcceptEssays.tsx` cho hộp xác nhận. Không thêm màn mới ngoài panel.

- [ ] **Step 4: Chạy test và xác nhận đạt**

Run: lệnh ở Step 2. Expected: PASS.

- [ ] **Step 5: Commit (chỉ khi chủ đồ án yêu cầu)**

---

## Task 10: Số mẫu kiểm tối thiểu theo phiên

**Bắt buộc:** tự chốt đang bật và cầu dao chỉ có mắt khi có mẫu. Cần chủ đồ án xác nhận giá trị mặc định (§10.4); dùng 2 cho tới khi có câu trả lời.

**Files:**
- Modify: `apps/api/src/grading/audit-sampling.ts` — thêm `ensureSessionMinimum(sampled: string[], students: string[], min: number): string[]`.
- Modify: điểm gọi cấp phiên (tìm nơi phiên không còn bài ở `ai_grading`: `grep -rn "ai_grading" apps/api/src/grading/grading-run.service.ts`).
- Test: `apps/api/src/grading/audit-sampling.spec.ts`.

**Interfaces:**
- Produces: `ensureSessionMinimum(sampled, students, min)` — nếu `sampled.length < min(min, students.length)` thì bổ sung sinh viên theo thứ tự xác định (theo hash), không trùng.

- [ ] **Step 1: Viết test thất bại**

- 10 sinh viên, tỉ lệ 20% → 2 mẫu; 3 sinh viên, `min=2` → 2 mẫu; `min` lớn hơn số sinh viên → toàn bộ;
- kết quả xác định: cùng đầu vào → cùng đầu ra;
- bất biến P1b: bổ sung theo sinh viên, không tách các câu của cùng một sinh viên.

- [ ] **Step 2: Chạy test và xác nhận thất bại**

Run: `cd apps/api && npx jest src/grading/audit-sampling.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Triển khai và gắn vào điểm cấp phiên**

- [ ] **Step 4: Chạy test và xác nhận đạt**

Expected: PASS. Chạy thêm `multi-problem-p1b-audit.e2e-spec.ts` để chắc bất biến P1b không đỏ.

- [ ] **Step 5: Commit (chỉ khi chủ đồ án yêu cầu)**

---

## Task 10A: Ghi nguồn của cờ `injection_suspected`

Chỉ **ghi**, không đổi điều kiện bắn cờ (spec §5.7). Mục đích: lượt diễn tập kế tiếp cho biết nguồn nào bắn trên bài sạch (HS2410019).

**Files:**
- Modify: `apps/api/src/grading/investigator/investigate.ts` (dòng 76 và 313–319), `investigator/types.ts` — thêm `InjectionSource = 'submission_pattern' | 'tool_output' | 'model_claim_with_quote' | 'model_claim_without_quote'` và `InvestigationResult.injectionSources?: InjectionSource[]` (vắng mặt trong hồ sơ cũ, coi là rỗng).
- Modify: `apps/api/src/grading/decision/decide.ts` (dòng 165) — `detail` của `investigation_flag` do `injection_suspected` thành `injection_suspected:<nguồn1>,<nguồn2>`.
- Test: `apps/api/src/grading/investigator/investigate.spec.ts` (hoặc spec hiện có của hàm), `decide.spec.ts`.

**Interfaces:**
- Produces: `InvestigationResult.injectionSources: InjectionSource[]` (mọi nguồn khớp, không chỉ nguồn đầu); trong `invalidProgram`, nguồn là `submission_pattern` khi `suspected`.

- [ ] **Step 1: Viết test thất bại**

- model khai `injectionAttempt.detected = true` với đoạn trích có trong bài → `['model_claim_with_quote']`;
- model khai `detected = true` không có đoạn trích → `['model_claim_without_quote']`;
- `submissionSuspected` → `['submission_pattern']`; công cụ có `injectionSuspected` → `['tool_output']`; nhiều nguồn cùng khớp → mảng đủ các nguồn;
- không nguồn nào → cờ không có và mảng rỗng;
- `decide()` cho `detail = 'injection_suspected:submission_pattern'` với nguồn tương ứng; hồ sơ cũ không có `injectionSources` → `detail = 'injection_suspected'` như hôm nay.

- [ ] **Step 2: Chạy test và xác nhận thất bại**

Run: `cd apps/api && npx jest src/grading/investigator src/grading/decision/decide.spec.ts`
Expected: FAIL ở các test mới.

- [ ] **Step 3: Triển khai**

Thu thập nguồn tại điểm bắn cờ, không đổi điều kiện. Chạy `grep -rn "injection_suspected" apps/api` và cập nhật mọi nơi so khớp `detail` bằng chuỗi cũ (eval, rehearsal, test).

- [ ] **Step 4: Chạy test và xác nhận đạt**

Run: lệnh ở Step 2. Expected: PASS.

- [ ] **Step 5: Commit (chỉ khi chủ đồ án yêu cầu)**

---

## Task 11: Cập nhật kỳ vọng test và ghi lịch sử benchmark

Không sửa test cho xanh. Mặc định tham số giữ hành vi cũ nên dự kiến ít test đỏ; chỉ xử lý những test thực sự đỏ.

**Files:**
- Modify: test đỏ trong `apps/api/src/grading/**` và `apps/api/test/**` (ứng viên: `score-service`, `finish-attempt`, `finalize-investigator`, `audit-sampling`, `multi-problem-p1b-*` e2e)
- Create: `docs/rehearsals/2026-10-21-p1-policy-change.md`

- [ ] **Step 1: Chạy toàn bộ bộ test và ghi danh sách đỏ**

Run: `cd apps/api && npx jest` và `npx jest --config ./test/jest-e2e.json`
Expected: danh sách test đỏ (có thể rỗng). Ghi vào file rehearsal.

- [ ] **Step 2: Với mỗi test đỏ, quyết định một trong hai**

- test có chủ đích về cổng tự chốt → truyền tường minh tham số mới để giữ kỳ vọng cũ, và thêm một test riêng cho hành vi mới;
- test không liên quan tới tự chốt → kiểm tra vì sao đỏ rồi sửa dữ liệu seed (không sửa kỳ vọng).

- [ ] **Step 3: Chạy lại và xác nhận đạt**

Expected: PASS, và mọi thay đổi kỳ vọng có ghi trong file rehearsal.

- [ ] **Step 4: Ghi bản so sánh**

Trong `docs/rehearsals/2026-10-21-p1-policy-change.md`: số đếm trước (Task 1), danh sách kỳ vọng đổi có lý do, và ghi chú rằng khi chưa cầu dao nào mở thì hành vi tự chốt không đổi so với `bdde467`.

- [ ] **Step 5: Commit (chỉ khi chủ đồ án yêu cầu)**

---

## Task 12: Triển khai an toàn (không có code)

**Files:** không sửa mã.

- [ ] **Step 1: Áp migration lên Supabase trước khi merge**

Theo `cine-migration-hits-supabase` (memory): `pnpm migration:run` đọc `apps/api/.env` trỏ Supabase từ xa, nên phải override `DATABASE_URL` có chủ đích, rồi kiểm lại bằng `psql` vào đúng DB. Với `migrationsTransactionMode: 'none'` (memory `cine-migration-history-drift`), chạy CLI với `-t all` để nguyên tử.
Expected: `\d examcollect.grading_result` có `opened_at`; `\d examcollect.audit_rule_label`, `\d examcollect.audit_no_error_label` và `\d examcollect.auto_rule_breaker` có bảng và chỉ mục từng phần; `\dv examcollect.review_label_v` có view; hai enum có `system_confirm` và `auto_rule_tripped`.

- [ ] **Step 2: Đặt env trên Railway trước khi merge**

`GRADING_AUTO_BLOCK_RULE_KEYS` để rỗng; `GRADING_AUTO_NO_ERROR=true`; `GRADING_AUTO_THRESHOLD` giữ nguyên.
Expected: biến đã đặt; hành vi tự chốt không đổi so với hôm nay.

- [ ] **Step 3: Merge và kiểm tra sau deploy**

Merge chỉ khi chủ đồ án yêu cầu; chỉ merge Task 5B cùng hoặc sau Task 5A. Kiểm `/health` xanh; mở một phiên thử trên DB dev; ghi một nhãn kiểm mẫu và kiểm có dòng `audit_rule_label`; xác nhận nhóm và xác nhận hàng loạt chạy; kiểm số đếm khớp Task 1 sau lượt tính lại.
Expected: không có lỗi 500 trong truy vấn qua entity.

- [ ] **Step 4: Chạy một lượt diễn tập để đọc nguồn cờ**

Sau deploy, chạy một lượt `ngan-xep-v2` (theo `cine-railway-rehearsal`) và đọc `detail` của `injection_suspected` trên bài sạch (HS2410019, 023). Ghi nguồn vào lịch sử benchmark (memory `grading-benchmark-history`). Quyết định nới điều kiện cờ là một thay đổi riêng, ngoài plan này, và phải đi sau cầu dao cấp lớp.

---

## Task 13: E1 — API cộng thêm cho hồ sơ lỗi có dẫn chứng

Không đổi tính điểm. Độc lập với Task 3–12, chỉ chung `blindResultDetail`.

**Files:**
- Modify: `apps/api/src/grading/decision/confidence.ts` — thêm `confidenceTerms`.
- Modify: `apps/api/src/grading/scoring/result-detail.ts` — `ResultDetailError` thêm `ruleDescription`, `predicate`; `ChallengeVerdictDetail` thêm `toolCallIds`; `ResultDetail` thêm `confidenceTerms`.
- Modify: `apps/api/src/grading/audit-blind.ts` — `blindResultDetail` trả giá trị rỗng cho trường mới.
- Test: `apps/api/src/grading/decision/confidence.spec.ts`, `apps/api/src/grading/scoring/result-detail.spec.ts` (hoặc spec hiện có), `apps/api/src/grading/audit-blind.spec.ts`.

**Interfaces:**
- Produces:
  ```ts
  // confidence.ts
  export interface ConfidenceTerm { ruleKey: string; source: VerdictSource; cap: number; deductionHundredths: number }
  export function confidenceTerms(errors: DiagnosedError[], modelCeiling: number): ConfidenceTerm[];
  // result-detail.ts
  ResultDetailError: { ...hiện có; ruleDescription: string | null; predicate: RulePredicate | null }
  ChallengeVerdictDetail: { ...hiện có; toolCallIds: string[] }
  ResultDetail: { ...hiện có; confidenceTerms: ConfidenceTerm[]; noErrorAgreement: Agreement; testBundle: TestBundleView | null }
  ResultDetailError: { ...hiện có; agreement: Agreement }   // Agreement = { n: number; disagreements: number; paused: boolean }
  // TestBundleView: spec §5.8c — { id, version, origin, filename, approved, caseCount, droppedCount, groups[], unmeasuredRules[], uncoveredFailingCases[] }
  ```
  `confidenceTerms` chỉ gồm lỗi có giá (`deductionHundredths > 0`), cùng điều kiện với `caseConfidence`, `cap = capOf(source, modelCeiling)`. `modelCeiling` lấy từ `StoredInvestigation.modelCeiling`; hồ sơ không có thì `confidenceTerms = []`.

- [ ] **Step 1: Viết test thất bại**

- `confidenceTerms` cho bài HS2410018 (lỗi: `sai_ca_bien` máy 150, `ro_ri_bo_nho` llm_only 100, `ten_bien_vo_nghia` llm_only 50, `thieu_chu_thich` llm_only 50; `modelCeiling` 1) → bốn dòng với cap 1, 0,5, 0,5, 0,5; trung bình có trọng số theo `deductionHundredths` bằng `caseConfidence` (≈ 0,714);
- lỗi chưa có giá (`deductionHundredths` null) không vào `confidenceTerms`;
- `agreement` của từng lỗi đếm từ `audit_rule_label` sau lần bật lại gần nhất (Task 5A), `paused` đúng với dòng `auto_rule_breaker` mở; `noErrorAgreement` đếm từ `audit_no_error_label`;
- `testBundle`: nhóm, ca và `rules` đúng theo `predicate.group` (`test_group_failed`); ca không đạt thuộc nhóm không có quy tắc vào `uncoveredFailingCases`; quy tắc dùng nhóm không có trong gói vào `unmeasuredRules`; gói chạy dở (`aborted` hay ca thiếu) cho `status = 'not_run'`; `constraintQuote` lấy từ `grading_test_case.constraint_quote`; `testBundle = null` khi không có gói;
- `loadResultDetail` trả `ruleDescription` và `predicate` của bản sửa hiện hành cho mỗi lỗi, `predicate = null` với luật bằng lời; `challengeVerdicts[].toolCallIds` lấy từ `perError`;
- **che mù:** với bài `audit_pending`, `blindResultDetail` trả `breakdown: null`, `investigation: null`, `challengeVerdicts: []` và `confidenceTerms: []`; không có lệnh đọc DB nào chạy trước nhánh này (test hiện có của `audit-blind` giữ nguyên và được mở rộng).

- [ ] **Step 2: Chạy test và xác nhận thất bại**

Run: `cd apps/api && npx jest src/grading/decision/confidence.spec.ts src/grading/audit-blind.spec.ts src/grading/scoring/result-detail.spec.ts`
Expected: FAIL (hàm và trường chưa có).

- [ ] **Step 3: Triển khai**

Trong `loadResultDetail`, mở rộng truy vấn tên luật hiện có để lấy thêm `description` và `predicate` từ `error_rule_revision` hiện hành. Tính `confidenceTerms` lúc đọc từ `breakdown.errors` và `stored.modelCeiling` (không đổi hình dạng `score_computation.breakdown`). Thêm trường mới vào `blindResultDetail` (TypeScript buộc kiểu trả về phải đủ trường).

- [ ] **Step 4: Chạy test và xác nhận đạt**

Run: lệnh ở Step 2. Expected: PASS.

- [ ] **Step 5: Kiểm payload thật**

Run: gọi `GET grading-results/:id/investigation` trên DB dev cho một bài `flagged_for_review` và kiểm JSON có `investigation.investigation.structuredResults` hay không.
Expected: ghi kết quả vào mô tả task. Nếu thiếu, mở rộng response để gửi kèm `structuredResults` của các lời gọi (additive), có test.

- [ ] **Step 6: Commit (chỉ khi chủ đồ án yêu cầu)**

---

## Task 14: E1 — Giao diện thẻ lỗi có dẫn chứng và bảng đóng góp confidence

**Files:**
- Create: `apps/web/src/lib/predicate-text.ts` (+ `predicate-text.test.ts`) — `predicateText(predicate: RulePredicate | null): string`.
- Create: `apps/web/src/app/teacher/grading/[resultId]/_components/investigator/ErrorEvidence.tsx` (+ test).
- Create: `apps/web/src/app/teacher/grading/[resultId]/_components/investigator/ConfidenceBreakdown.tsx` (+ test).
- Create: `.../investigator/CertaintyHero.tsx` (số %, thanh có vạch ngưỡng, chip, độ khớp với bạn) và `.../investigator/TestBundleMap.tsx` (gói test ↔ quy tắc trừ điểm) (+ test mỗi file). Mock-up: artboard "Chi tiết một bài", "Mức chắc chắn: các trạng thái", "Gói test: các trạng thái".
- Modify: `ErrorList.tsx`, `CaseFlagsBanner.tsx`, `InvestigationTrail.tsx`, `InvestigatorDossier.tsx` (cùng thư mục), `apps/web/src/lib/grading-vocab.ts` (đổi `SOURCE_LABEL`, `VERDICT_LABEL`, `lensLabel` và thêm câu giải thích nguồn lỗi **đúng bộ từ ngữ ở spec §5.8a**; test cũ chứa nhãn cũ đổi theo), `apps/web/src/lib/api/grading.ts` (kiểu `ResultDetailError`, `ChallengeVerdict`, `ResultDetail` mới; kiểu `structuredResults`).
- Regenerate: client OpenAPI nếu API đổi.

**Interfaces:**
- Consumes: trường mới từ Task 13; danh sách lời gọi của hồ sơ (`d.investigation.investigation.toolCalls`) và `structuredResults`.
- Produces:
  ```ts
  predicateText(predicate: RulePredicate | null): string
  <ErrorEvidence error={ResultDetailError} toolCalls={ToolCallView[]} structured={Record<string, StructuredResult>}
                 verdicts={ChallengeVerdict[]} note={string | null} evidence={ErrorEvidenceItem[] | undefined} />
  <ConfidenceBreakdown terms={ConfidenceTerm[]} confidence={number | null} theta={number} />
  ```
  `ErrorEvidenceItem` = `{ file: string; startLine: number | null; endLine: number | null; quote: string; verified: boolean }` (có từ E2; vắng mặt trước đó).

- [ ] **Step 1: Viết test thất bại**

- `predicateText`: `test_group_failed` → "Có ca kiểm thử thuộc nhóm “X” không đạt"; `calls_function` → "Bài gọi hàm “f”"; `complexity_exceeds_required` → "Độ phức tạp đo được vượt mức đề yêu cầu"; `no_recursion` có và không có `functionName`; `null` → "Quy tắc mô tả bằng lời; hệ thống đọc bài để xét, không có phép đo cụ thể". Chuỗi đúng theo bảng từ ngữ spec §5.8a.
- `ErrorEvidence` (mọi chuỗi theo spec §5.8a): hiện mô tả quy tắc và cách nhận biết; hiện câu giải thích nguồn đúng với từng `source` ("Chạy bài kiểm tra" 100% / "Đọc code + chạy thử" 85% / "Đọc code, nhận định" 50%); hiện ca kiểm thử không đạt trước ca đạt; mỗi bước bằng chứng hiện `#N` và kết quả mở rộng được, kèm liên kết neo tới đúng bước trong "Các bước hệ thống đã làm"; lỗi không có `toolCallIds` và không có đoạn code hiện đúng câu "Chưa có bằng chứng kèm theo; đây mới là nhận định của hệ thống"; **lỗi dạng thiếu** (không có đoạn code để chỉ ra) hiện phạm vi đã đọc (file, số dòng) và liên kết tới bước đọc file; khi có `evidence` hiện `file:dòng` và đoạn code, nhãn "Đã đối chiếu: đoạn này đúng là có trong bài" hoặc cảnh báo "Chưa đối chiếu được: không tìm thấy đoạn này trong bài" theo `verified`; **đoạn dài** hiện đầu và cuối kèm nút "Hiện cả đoạn: còn N dòng ẩn"; mỗi lần hệ thống tự kiểm tra lại hiện kết luận ("Lỗi có thật không?", "Trừ vậy có nặng quá không?"), lý do nếu có (nếu không: "Chưa có lý do kèm theo") và bước căn cứ; lỗi bị đề nghị bỏ hiện "Đồng ý bỏ lỗi này" và "Không đồng ý — vẫn trừ điểm lỗi này ở bài này".
- Khối "Quyết định của bạn" (cột phải, dính khi cuộn): hiện số % chắc chắn, nút "Chấp nhận điểm X" gọi endpoint xác nhận (Task 7) với `resultIds` là một bài, và nút "Chấm tay…"; sau khi chấp nhận, bài chuyển `teacher_reviewed` và khối báo đã ghi nhận.
- `CertaintyHero`: hiện số % lớn, vạch ngưỡng và chip đúng theo ba mức (đạt / vừa đủ / chưa đạt, kèm "thiếu N điểm phần trăm"); bài không có lỗi nào **không hiện số %** mà hiện "Chưa đo được", ô thanh viền đứt không có vạch ngưỡng, chip "Bài không có lỗi nào" và cảnh báo, và **không** hiện chip đạt ngưỡng (kể cả khi giá trị nội bộ là 1,0); bài thuộc phạm vi đã tạm dừng hiện chip "Đã tạm dừng tự chốt" và nút bật lại; dòng "Độ khớp với bạn" cộng dồn các quy tắc, hoặc "chưa có bài kiểm tra ngẫu nhiên nào" khi `n = 0`.
- `TestBundleMap`: hiện dòng giới thiệu gói (phiên bản, nguồn, đã duyệt, số ca, nhóm); mỗi nhóm hiện số ca không đạt và quy tắc dùng nhóm đó; ca không đạt hiện "bằng chứng cho {quy tắc}", câu trích của đề và dữ liệu vào/đáp án/bài làm; ca không đạt chưa thuộc quy tắc nào hiện cảnh báo và nút "Thêm quy tắc cho nhóm"; `unmeasuredRules` hiện "Chưa đo được"; ca `not_run` hiện "Chưa chạy" cùng câu "chưa chạy không có nghĩa là đạt".
- `ConfidenceBreakdown`: hiện từng lỗi với nguồn, trần, mức trừ; hiện trung bình có trọng số; khi chênh với `confidence` đã lưu hơn `1e-9` hiện dòng "giới hạn khác kéo xuống {confidence}"; hiện so với θ.
- `ErrorList`: thẻ lỗi mở khối "Vì sao bị trừ điểm" sẵn khi bài `flagged_for_review`, đóng sẵn ở trạng thái khác; hành động (bỏ lỗi, "Sửa quy tắc này") giữ nguyên; đầu thẻ hiện số % chắc chắn của nguồn lỗi.
- `InvestigationTrail` (tiêu đề "Các bước hệ thống đã làm"): mỗi dòng có `id` neo ổn định (`tc-N`) để liên kết từ thẻ lỗi cuộn tới và mở dòng đó; mỗi dòng ghi "bằng chứng cho {lỗi}" theo các lỗi trích dẫn nó; không hiện tên công cụ nội bộ (`run_tests`, `read_file`…) ra giao diện.

- [ ] **Step 2: Chạy test và xác nhận thất bại**

Run: `cd apps/web && npx vitest run "src/lib/predicate-text.test.ts" "src/app/teacher/grading/[resultId]/_components/investigator"`
Expected: FAIL ở các test mới.

- [ ] **Step 3: Triển khai**

Dùng lại thành phần hiển thị đầu ra của `InvestigationTrail` thay vì viết lại. Khối "Vì sao lỗi này" dùng `Collapsible`/`details` theo khuôn thành phần sẵn có của dự án. Không thêm trình xem mã đầy đủ. Không đổi hành động trên thẻ lỗi.

- [ ] **Step 4: Chạy test và xác nhận đạt**

Run: lệnh ở Step 2, rồi `cd apps/web && npx tsc --noEmit` và lint. Expected: PASS.

- [ ] **Step 5: Kiểm tay trên trình duyệt**

Mở trang chi tiết một bài `flagged_for_review` (dữ liệu diễn tập, ví dụ HS2410018) và một bài `audit_pending`; kiểm ảnh chụp: thẻ lỗi có luật, điều kiện, nguồn, bằng chứng; banner có bảng đóng góp; bài `audit_pending` chỉ hiện màn kiểm mẫu mù, không có bằng chứng.
Expected: khớp mô tả spec §5.8. Ghi nhận xét vào mô tả task.

- [ ] **Step 6: Commit (chỉ khi chủ đồ án yêu cầu)**

---

## Task 15: E2 — Agent trả đoạn trích và lý do (có cổng đo)

Chỉ làm sau Task 14 và chỉ merge khi qua cổng đo. Chỉ hiển thị: không đổi điểm, cờ, quyết định.

**Files:**
- Modify: `apps/api/src/grading/investigator/types.ts` — `VerdictError.evidence?: { file: string; startLine: number | null; endLine: number | null; quote: string; verified: boolean }[]`.
- Modify: `apps/api/src/grading/investigator/protocol.ts` — mô tả khuôn JSON trong prompt (dòng ~189, ~228), zod (dòng ~138) và lọc `T-AG-2`: thêm `evidence` tuỳ chọn; harness đặt `verified` bằng `quoteAppearsInSubmission` (`harness/submission-envelope`) trên nội dung `file`.
- Modify: `apps/api/src/grading/investigator/lens-protocol.ts`, `challenge.ts` (dòng ~55) và các lăng kính per-error trong `investigator/lenses/` — kết luận thêm `reason?: string` (cắt ở `CASE_NOTE_MAX`), chuyển vào `perError[].reason` cho cả `confirmed` và `refuted`.
- Modify: `apps/api/src/grading/investigator/prompt-version.ts` — nâng phiên bản.
- Test: `protocol.spec.ts`, `lens-protocol.spec.ts`, `challenge.spec.ts`, `investigate.spec.ts`; lượt eval/diễn tập.

**Interfaces:**
- Consumes: `quoteAppearsInSubmission(quote: string, contents: string[])`; nội dung file theo `ctx.submission.files`.
- Produces: `VerdictError.evidence` đã gắn `verified`; `perError[].reason` có thể có cho mọi trạng thái; `promptVersionOf()` trả phiên bản mới.

- [ ] **Step 1: Viết test thất bại**

- phản hồi `final` có `evidence` với `quote` có trong file → `verified = true`; `quote` không có trong file hoặc `file` không tồn tại → `verified = false` và **vẫn được lưu**;
- phản hồi `final` **không có** `evidence` hoặc lăng kính **không có** `reason` vẫn là phản hồi hợp lệ (không `bad_output`);
- tối đa 3 mục `evidence` mỗi lỗi và `quote` ≤ 300 ký tự (cắt, không từ chối);
- `perError[].reason` có cho `confirmed` và `refuted`, cắt ở 500 ký tự;
- điểm, `caseFlags`, `errorFlags` và `outcome` của `decide()` giống hệt nhau khi có và không có `evidence`/`reason` trên cùng đầu vào;
- `promptVersionOf()` khác phiên bản trước.

- [ ] **Step 2: Chạy test và xác nhận thất bại**

Run: `cd apps/api && npx jest src/grading/investigator`
Expected: FAIL ở các test mới.

- [ ] **Step 3: Triển khai**

Thêm trường tuỳ chọn vào zod và JSON schema mô tả; viết hướng dẫn trong prompt bằng lời (gateway bỏ qua `json_schema`, memory `cine-gateway-ignores-json-schema`): lỗi `llm_only` phải kèm đoạn trích có thật trong bài; lăng kính nêu lý do một hai câu. Đặt `verified` ở harness, không tin lời model. Nâng phiên bản prompt.

- [ ] **Step 4: Chạy test và xác nhận đạt**

Run: lệnh ở Step 2. Expected: PASS.

- [ ] **Step 5: Chạy lượt đo trước khi merge**

Chạy `ngan-xep-v2`, k = 3, trên môi trường diễn tập thật (theo `cine-railway-rehearsal`), cùng bộ với một lượt nền ngay trước. Ghi vào lịch sử benchmark (memory `grading-benchmark-history`) một bảng so sánh: điểm đúng, lỗi bắt được, tỉ lệ lỗi `llm_only`/`llm_with_tools` có đoạn `verified`, token và thời gian mỗi bài.
Expected: đạt cổng đo ở Global Constraints. Không đạt thì **không merge**, ghi lý do và các số.

- [ ] **Step 6: Commit (chỉ khi chủ đồ án yêu cầu)**

---

## Self-Review

**1. Spec coverage**
- §5.1 θ → Task 5B. §5.2 cờ lớp không lỗi và tập chặn → Tasks 3–4. §5.3 cầu dao (nhãn, hai phạm vi, quy tắc, hạ bậc, bật lại) → Tasks 2, 5, 5A, 9. §5.4 xác nhận và gom (kèm mô tả luật, nguồn, bài mẫu) → Tasks 6, 7, 9. §5.5 nhãn thời gian → Tasks 2, 8. §5.6 kiểm mẫu → Task 10. §5.7 nguồn cờ → Task 10A và Task 12 Step 4. §5.8 E1 → Tasks 13, 14. §5.9 E2 → Task 15. §8 thứ tự → Task 1 → 2 → (3–5A) → 5B → (6–9) → 10A → 12; E1 song song (13–14); E2 sau (15). §9 ảnh hưởng → Task 11 và Task 1. §12 kiểm thử → các task tương ứng.

**2. Step scan:** mỗi step có một kết quả kiểm được. Các chỗ cần người quyết (§10) nằm ở Task 10 (giá trị tối thiểu), Task 12 (env) và Task 15 (cổng đo); không có bước nào "TBD".

**3. Type consistency:** `breakerVerdict`, `binomialTailAtLeast`, `BREAKER_P0`, `BREAKER_ALPHA`, `loadOpenBreakerRuleKeys`, `isNoErrorBreakerOpen`, `countRuleLabelsSinceReset`, `countNoErrorLabelsSinceReset`, `recordLabelsAndEvaluate`, `autoBlockedRuleKeys`, `autoNoErrorEnabled`, `readAutoBlockedRules`, `readAutoNoError`, `ReviewGroup`, `GroupInput`, `groupResults`, `ConfirmOutcome`, `confirmGroup`, `markOpened`, `AUTO_THETA_EPSILON`, `ensureSessionMinimum`, `InjectionSource`, `injectionSources`, `ConfidenceTerm`, `confidenceTerms`, `predicateText`, `ErrorEvidenceItem` xuất hiện đúng tên ở task định nghĩa và task dùng.

**4. Review Focus:** mỗi dòng đã có test trong task sở hữu (xem đầu plan).

**5. Proportion:** plan dài khoảng hai lần spec; phần code chỉ là chữ ký, tên test và assertion. Thân hàm để implementer viết.

**Điểm tôi chưa kiểm trong mã (không đoán):**
- `recomputeForTeacher` hạ đúng bài `auto_approved` khi chỉ đổi cấu hình chặn phụ thuộc `compute()` đọc từ `m`; Task 5A Step 4 và test (a), (g) kiểm điều này.
- Payload thật của `GET grading-results/:id/investigation` có gửi `structuredResults` không (Task 13 Step 5).
- Route `auto-breakers` có bị route tham số che hay không, và fixture e2e có đủ bài chứa cùng một luật hay không (Task 5A).
- Chi phí token và thời gian của E2 chỉ biết sau lượt đo (Task 15 Step 5).

---

## Execution Handoff

Plan đã lưu tại `docs/superpowers/plans/2026-10-21-cham-diem-duyet-nhanh-p1.md`. Chưa có phương pháp thực hiện nào được cung cấp; cần chủ đồ án chọn:

- **Subagent-driven** — một subagent mới cho mỗi task và một reviewer kiểm trước khi sang task kế. Kỹ, nhưng tốn một ngữ cảnh mới cho mỗi task và mỗi lượt review.
- **Native** — tôi tự làm tuần tự trong phiên này, cuối cùng một reviewer kiểm cả nhánh. Rẻ và nhanh hơn, không có review độc lập cho tới cuối.

**Tôi nghiêng về Subagent-driven.** Lý do: 18 task (1–15 cộng 5A, 5B, 10A), phụ thuộc chặt vào interface (cờ → decide → score → cầu dao → audit → endpoint → UI), cầu dao chạy trong giao dịch ghi nhãn kiểm mẫu nên một lỗi ở đó làm hỏng việc ghi nhãn, và E1 đụng `blindResultDetail` nên sai một chỗ là lộ mù; Railway deploy `main` ngay khi merge.

Trước khi bắt đầu, cần chủ đồ án trả lời §10 của spec (đặc biệt câu 2, 4, 5, 6). Plan được thiết kế để Task 2, 3, 5, 6, 8 và 13 làm được ngay không cần câu trả lời; Task 10, 12 và 15 phụ thuộc câu trả lời.
