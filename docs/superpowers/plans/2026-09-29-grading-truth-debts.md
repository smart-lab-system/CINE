# Năm nợ đúng-sai của phần chấm điểm (G1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Every task is TDD: write the failing test, watch it fail **for the right reason**, implement, watch it pass, typecheck, lint the touched files, commit.

**Goal:** Close five places where the backend lies or says too little, so the teacher UI can stop locking a safe button, stop fetching N dossiers to draw one table, and stop guessing which code submissions run in the sandbox.

**Architecture:** Backend first, then the web. (1) `computeScore` lets a teacher's per-error exception beat a refutation. (2) `GET /exam-sessions/:id/grading-results` gains `triage`, `deliverableType`, `deliverableLanguage` per row, derived by a new pure function `triageOf`. (3) A new `PATCH /exam-sessions/:id/deliverables/:deliverableId` declares a code deliverable's language (route lives in the **grading** controller because `GradingModule` already imports `ExamSessionModule`, never the reverse); the session response gains `language` and a **backend-computed** `pipeline` per deliverable, so the web never re-implements `pipelineFor`. (4) The web reads all of it: `session-triage.ts` reads `result.triage` instead of per-result dossiers, `ErrorList` gets the two refuted-error buttons, the prepare screen gets a language picker, and code results on the legacy path are labelled "chấm bằng đọc mã".

**Tech Stack:** NestJS 11 + TypeORM (raw SQL for scoring reads) + Jest (unit `*.spec.ts`, e2e `test/*.e2e-spec.ts`, serial, local Postgres:5442/Redis:6390/MinIO:9010 via `.env.test`); Next.js 15 + TanStack Query + Vitest/RTL; `openapi-fetch` client generated into `packages/shared`.

**Spec:** `docs/superpowers/specs/2026-09-29-grading-truth-debts-design.md` (approved 2026-09-29). Parent specs: `2026-09-20-grading-agent-investigator-design.md` (§2.2, §2.3, §14), `2026-09-23-grading-ui-rebuild-design.md` (§3.3, §3.4, §3.7, T-UI-19).

## Global Constraints

- **Branch:** `feat/grading-gaps-g1-g5` (stacked on `feat/grading-ui-rebuild`, PR #64 not merged). Do **not** push or open a PR until the user asks.
- **Work from the worktree** `C:\Users\Admin\Main\Desktop\HKI 2026-2027\KLTN\CINE\.claude\worktrees\grading-ui-rebuild`; shell cwd resets between calls — `cd` in every command. Do not `cd` to the original repo root.
- **CLAUDE.md:** run GitNexus `impact` on a symbol **before** editing it (`repo` must be the absolute path `C:\Users\Admin\Main\Desktop\HKI 2026-2027\KLTN\CINE` — two repos share the name); run `detect_changes()` before every commit. The index is 3 commits behind and covers the main checkout, so treat it as a lower bound and confirm with grep. Report HIGH/CRITICAL risk to the user **before** editing.
- **Module direction:** `exam-session` must never import the grading **module**. A file-level import of the pure helper `grading/pipeline.ts` is fine (`pnpm check:cycles` must print zero; `import type` is ignored by that script).
- **File size:** backend service files < 500 lines (soft). `grading.service.ts` is already 862 — put new logic in new files (`result-triage.ts`, `deliverable-language.service.ts`), touch it only to call them.
- **e2e suite runs serially** (`maxWorkers: 1`); never raise it. e2e uses `apps/api/.env.test` (local). Never run the API or tests against `apps/api/.env` (points at Supabase).
- **Copy is Vietnamese.** Vocabulary of spec UI §2.2: *môi trường chạy bài* (never "sandbox"), *góc kiểm* (never "lăng kính"), *Mô hình + công cụ*, *không chấm được*, *tạm tính*. Comma decimals via `lib/format.ts`.
- **Every score shown comes from `currentScore`.** Never `aiTotalScore`, never `finalScore`.
- **A control with no backing route is `disabled` + `<NeedsBackend />` and sends no request.** This plan removes that treatment only where it adds the route (the two refuted-error buttons); every other *cần backend* label stays.
- **Every mutation error renders the server's message verbatim** in an inline destructive `Alert`.
- **`pipeline` never changes for an existing result:** it is assigned once at `startGrading` and a DB trigger forbids changing it (spec §2.3 rule 8). Nothing here may work around that.
- **Commits:** write the message to a file with the Write tool, then `git commit -F <file>`; the message ends with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. PowerShell 5.1 splits inline multi-line `-m`; the bash tool mangles backticks — patch scripts go in the scratchpad and run with `node file`.
- **Tests:** `pnpm --filter api exec jest <path>` (unit), `pnpm --filter api exec jest --config ./test/jest-e2e.json <path>` (e2e), `pnpm --filter web exec vitest run <path>`, `pnpm --filter web exec tsc --noEmit`. Known unrelated tsc noise: `read-workbook.test.ts`.
- **Ledger:** `.superpowers/sdd/2026-09-29-grading-truth-debts/progress.md` (gitignored); record `Ruling:` lines for every deviation from this plan.

## Review Focus

Inputs and conditions the spec implies but the obvious tests would not exercise. Each has its test in the owning task.

1. **Keeping a refuted error whose rule has no price** — must be `unpriced` with an `unpriced` flag, never a free error scored as 0 with no flag. → Task 1 (test 3).
2. **Declaring a language when the deliverable already has a result but the session is *not* locked** (an all-ungradable session re-opened by spec §2.3 rule 6) — must be 409 and change nothing; the lock check alone does not cover it. → Task 6 (test 8).
3. **`triage` for a result whose latest computation is an ungradable one** (`breakdown.ungradable !== null`, `errors: []`) — must be `null`, not "Không lỗi nào". → Task 3.
4. **A needs-you code result whose `triage` is missing** — the leverage line must say nothing (no claim from partial data), and the reason cell must point at the dossier rather than spin. → Tasks 9, 10.
5. **A finalized code result on the legacy path vs a finalized essay** — the first has no edit button at all; the second still offers *Lưu và ghi nhật ký* (appeal path with audit log). → Task 14.

Not changed, recorded so nobody thinks it was missed: `BulkAcceptEssays` keeps bundling every `one_shot` result in `flagged_for_review`, which includes code results on the legacy path. Behaviour today; out of scope.

---

## File Structure

**Backend (`apps/api`)**
- Modify `src/grading/scoring/score-core.ts` — precedence of teacher exception over refutation.
- Modify `src/grading/scoring/score-core.spec.ts` — three new tests.
- Create `src/grading/scoring/result-triage.ts` + `result-triage.spec.ts` — pure `triageOf`, type `ResultTriage`.
- Modify `src/grading/grading.service.ts` — `listForSession`: one join, one sub-select, three view fields.
- Modify `src/grading/rubric.service.ts` — `RubricView.createdAt`.
- Modify `src/exam-session/dto/exam-session-response.dto.ts`, `src/exam-session/exam-session.service.ts` — `language` + `pipeline` on each deliverable.
- Create `src/grading/dto/declare-language.dto.ts`, `src/grading/deliverable-language.service.ts`; modify `src/grading/grading.controller.ts`, `src/grading/grading.module.ts` — the PATCH route.
- Tests (e2e): modify `test/error-exception.e2e-spec.ts`, `test/grading.e2e-spec.ts`; create `test/grading-results-triage.e2e-spec.ts`, `test/deliverable-language.e2e-spec.ts`.
- Regenerate `packages/shared/src/api/schema.d.ts`.

**Web (`apps/web/src`)**
- Modify `lib/api/grading.ts`, `lib/api/exam-session.ts` — mirror types + `declareDeliverableLanguage`.
- Modify `lib/session-triage.ts` (+ test) — read `result.triage`; add `isReadingCode`.
- Modify `app/teacher/grading/page.tsx`, `_components/ResultsTable.tsx` (+ tests), `hooks/useGrading.ts` — drop per-result dossier fetching.
- Modify `app/teacher/grading/[resultId]/_components/investigator/ErrorList.tsx` (+ test).
- Modify `hooks/useExamSession.ts`; create `app/teacher/grading/_components/DeliverableLanguages.tsx` (+ test).
- Modify `lib/preflight.ts` (+ test), `_components/PreparePanel.tsx` (+ test).
- Modify `app/teacher/grading/[resultId]/page.tsx` (+ test) — reading-code label and frozen-after-finalize.

---

### Task 0: Preflight (no commit)

**Files:** none.

- [ ] **Step 1: Confirm branch and clean tree**

Run: `cd "C:/Users/Admin/Main/Desktop/HKI 2026-2027/KLTN/CINE/.claude/worktrees/grading-ui-rebuild" && git branch --show-current && git status --short`
Expected: `feat/grading-gaps-g1-g5` and no output from `status`.

- [ ] **Step 2: Confirm infra**

Run: `docker ps --format "{{.Names}} {{.Status}}"`
Expected: `cine-postgres-1` healthy, `cine-redis-1`, `cine-minio-1` up. If Docker Desktop is off: open `C:\Program Files\Docker\Docker\Docker Desktop.exe`, then `docker compose up -d postgres minio redis`. The MinIO bucket `examcollect-submissions` must exist (a missing bucket produces errors that look like business bugs — memory `cine-e2e-test-prerequisites`).

- [ ] **Step 3: Record a green baseline**

```bash
cd "C:/Users/Admin/Main/Desktop/HKI 2026-2027/KLTN/CINE/.claude/worktrees/grading-ui-rebuild"
pnpm --filter api exec jest src/grading/scoring
pnpm --filter api exec jest --config ./test/jest-e2e.json test/error-exception.e2e-spec.ts
pnpm --filter web exec vitest run src/lib/session-triage.test.ts src/app/teacher/grading
pnpm --filter web exec tsc --noEmit > "<scratchpad>/tsc-baseline.txt"
```
Expected: all pass. Keep `tsc-baseline.txt`; after Task 8 the error set must be **identical** to it.

- [ ] **Step 4: Impact analysis (record in the ledger)**

Run GitNexus `impact` (`direction: "upstream"`, `repo: "C:\\Users\\Admin\\Main\\Desktop\\HKI 2026-2027\\KLTN\\CINE"`) for: `computeScore`, `listForSession`, `toResponseDto`, `toView`, `preflightOf`, `errorCounts`, `reasonOf`, `leverageOf`, `useResultDetails`. Cross-check each with `grep -rn "<name>" apps --include=*.ts --include=*.tsx`. Expected direct callers: `computeScore` ← `ScoreService`; `listForSession` ← `GradingController.listResults`; `useResultDetails` ← `app/teacher/grading/page.tsx` only. **If any result is HIGH or CRITICAL, stop and tell the user before Task 1.**

- [ ] **Step 5: Create the ledger**

Create `.superpowers/sdd/2026-09-29-grading-truth-debts/progress.md` with the header `# G1 ledger` and the impact results.

---

### Task 1: A teacher's exception beats a refutation in `computeScore`

**Files:**
- Modify: `apps/api/src/grading/scoring/score-core.ts` (the block from `const excludedKeys` to the end of `const common = {…}`; the `computeScore` docblock)
- Test: `apps/api/src/grading/scoring/score-core.spec.ts`

**Interfaces:**
- Consumes: `ScoreCoreInput.exceptions: ReadonlyMap<string, 'exclude' | 'include'>` (ruleId → direction), `decision.errorFlags`, `byKey` (existing locals).
- Produces: `computeScore` output where a refuted error with an `include` exception is `counted`/`unpriced` with no `refuted` flag, and one with an `exclude` exception is `excluded` with no `refuted` flag. `BreakdownError.counted` keeps its four values. `repriceBreakdown` is **unchanged**.

- [ ] **Step 1: Write the failing tests**

In `score-core.spec.ts`, insert immediately before the line `});` that closes `describe('computeScore', …)` — i.e. between the end of the test `'C2 — lỗi luật MÁY QUYẾT MIỄN NHIỄM …'` and `describe('repriceBreakdown', …)`. Use this unique anchor for the Edit:

`    expect(out.breakdown.errorFlags).not.toContainEqual({ ruleKey: 'sai_bien', code: 'refuted' });\n  });\n});\n\ndescribe('repriceBreakdown'`

```ts
  // G1 §1: `refuted` là kết luận của một lượt KHÁC (phản biện lúc chấm); ngoại lệ là quyết định đã đưa ra cho
  // riêng bài này (§2.2). Quyết định của giảng viên thắng.
  describe('ngoại lệ của giảng viên thắng lỗi bị bác bỏ (G1 §1)', () => {
    // ten_bien là luật MODEL, nên góc kiểm được phép bác bỏ nó (§4.1) — cùng khuôn ca "bị bác bỏ" ở trên.
    const refutingTen = () =>
      stored({
        challenge: {
          perError: [{ challenger: 'lens', perError: [{ ruleKey: 'ten_bien', status: 'refuted', toolCallIds: [] }] }],
          caseNotes: [],
        },
      });
    const errorOf = (out: ReturnType<typeof computeScore>) => out.breakdown.errors.find((e) => e.ruleKey === 'ten_bien');

    it('include → lỗi tính vào điểm, cờ refuted mất', () => {
      const out = computeScore(input({ stored: refutingTen(), exceptions: new Map([['id-ten_bien', 'include']]) }));
      expect(errorOf(out)?.counted).toBe('counted');
      expect(out.scoreHundredths).toBe(1000 - 150 - 50);
      expect(out.breakdown.errorFlags).not.toContainEqual({ ruleKey: 'ten_bien', code: 'refuted' });
    });

    it('exclude ("đồng ý bác bỏ") → nhãn excluded chứ không phải refuted, điểm không đổi, cờ refuted mất', () => {
      const out = computeScore(input({ stored: refutingTen(), exceptions: new Map([['id-ten_bien', 'exclude']]) }));
      expect(errorOf(out)?.counted).toBe('excluded');
      expect(out.scoreHundredths).toBe(1000 - 150);
      expect(out.breakdown.errorFlags.map((f) => f.code)).not.toContain('refuted');
    });

    it('include mà luật chưa có giá → unpriced kèm cờ unpriced, không thành lỗi miễn phí (Review Focus 1)', () => {
      const out = computeScore(
        input({
          stored: refutingTen(),
          rules: [BIEN, { ...TEN, deductionHundredths: null }],
          exceptions: new Map([['id-ten_bien', 'include']]),
        }),
      );
      expect(errorOf(out)?.counted).toBe('unpriced');
      expect(out.breakdown.errorFlags).toContainEqual({ ruleKey: 'ten_bien', code: 'unpriced' });
      expect(out.breakdown.errorFlags.map((f) => f.code)).not.toContain('refuted');
      expect(out.scoreHundredths).toBe(1000 - 150);
    });

    it('không có ngoại lệ → vẫn refuted (giữ nguyên hành vi §6.2)', () => {
      const out = computeScore(input({ stored: refutingTen() }));
      expect(errorOf(out)?.counted).toBe('refuted');
      expect(out.breakdown.errorFlags).toContainEqual({ ruleKey: 'ten_bien', code: 'refuted' });
    });

    it('include trên lỗi KHÔNG bị bác bỏ → không đổi so với hôm nay (T-EXC-2)', () => {
      const out = computeScore(input({ exceptions: new Map([['id-ten_bien', 'include']]) }));
      expect(errorOf(out)?.counted).toBe('counted');
      expect(out.scoreHundredths).toBe(1000 - 150 - 50);
    });
  });
```

- [ ] **Step 2: Run to verify RED**

Run: `pnpm --filter api exec jest src/grading/scoring/score-core.spec.ts -t "ngoại lệ của giảng viên thắng"`
Expected: FAIL — `include → …` gets `'refuted'` instead of `'counted'`; `exclude …` gets `'refuted'` instead of `'excluded'`; the `unpriced` test gets `'refuted'`. The last two (`không có ngoại lệ`, `include trên lỗi KHÔNG bị bác bỏ`) already PASS: they are regression guards, not the RED.

- [ ] **Step 3: Implement**

In `score-core.ts` replace

```ts
  const excludedKeys = new Set(used.filter((r) => input.exceptions.get(r.ruleId) === 'exclude').map((r) => r.ruleKey));
  const refutedKeys = new Set(decision.errorFlags.filter((f) => f.code === 'refuted').map((f) => f.ruleKey));
  const common = {
    caseFlags: decision.caseFlags,
    errorFlags: decision.errorFlags.filter((f) => !excludedKeys.has(f.ruleKey)),
```

with

```ts
  const excludedKeys = new Set(used.filter((r) => input.exceptions.get(r.ruleId) === 'exclude').map((r) => r.ruleKey));
  const includedKeys = new Set(used.filter((r) => input.exceptions.get(r.ruleId) === 'include').map((r) => r.ruleKey));
  // Ngoại lệ của giảng viên thắng kết luận phản biện: `refuted` là kết luận của một lượt KHÁC (phản biện lúc chấm),
  // còn ngoại lệ là quyết định đã đưa ra cho riêng bài này (§2.2). `refutedKeys` chỉ còn những lỗi bị bác bỏ mà
  // giảng viên CHƯA quyết — nên `include` đưa lỗi về counted/unpriced, `exclude` đưa nó về excluded.
  const decidedRefuted = decision.errorFlags.filter((f) => f.code === 'refuted').map((f) => f.ruleKey);
  const refutedKeys = new Set(decidedRefuted.filter((key) => !excludedKeys.has(key) && !includedKeys.has(key)));
  // `decide()` tính giá trên tập lỗi ĐÃ loại lỗi bị bác bỏ, nên nó không bao giờ gắn `unpriced` cho chúng. Giữ lại
  // một lỗi như vậy (include) mà luật chưa có giá thì cờ này do đây thêm — không thì lỗi bị trừ 0 mà không cờ nào
  // nói "chờ giá", đúng thứ §2.1 cấm (lỗi chưa giá không được quyết điểm).
  const revivedUnpriced = decidedRefuted
    .filter((key) => includedKeys.has(key) && byKey.get(key)?.deductionHundredths === null)
    .map((ruleKey) => ({ ruleKey, code: 'unpriced' as const }));
  const common = {
    caseFlags: decision.caseFlags,
    errorFlags: [
      ...decision.errorFlags.filter((f) => !excludedKeys.has(f.ruleKey) && !(f.code === 'refuted' && includedKeys.has(f.ruleKey))),
      ...revivedUnpriced,
    ],
```

Leave the remaining lines of `common` (`confidence`, `mismatchedRules`, `notConsidered`, `ungradable`) and the `errors` mapping untouched — `counted` already checks `refutedKeys` first, then `excludedKeys`. Append to the `computeScore` docblock: `Ngoại lệ của giảng viên (exclude/include) thắng kết luận bác bỏ của phản biện (G1 §1).`

- [ ] **Step 4: Run to verify GREEN**

Run: `pnpm --filter api exec jest src/grading/scoring`
Expected: PASS, including the pre-existing T-REFUTE and C2 tests.

- [ ] **Step 5: Check the one other reader of `counted`**

Run: `grep -n "refuted\|excluded" apps/api/src/eval/rehearsal/score-run.ts`
Expected: lines 138 and 159 only *read* `counted`; they do not assume `refuted` always wins. If something does, fix it and add a test in `score-run.spec.ts`.

- [ ] **Step 6: Typecheck, lint, detect changes, commit**

```bash
pnpm --filter api exec tsc --noEmit
pnpm --filter api exec eslint src/grading/scoring/score-core.ts src/grading/scoring/score-core.spec.ts
```
Run GitNexus `detect_changes()`; expected affected symbol: `computeScore` only. Commit message: `fix(grading): a teacher exception beats a refutation in computeScore`.

---

### Task 2: e2e — the exception path on a refuted error, end to end

**Files:**
- Test: `apps/api/test/error-exception.e2e-spec.ts`

**Interfaces:**
- Consumes: `world(label)`, `graded`, `scores`, `exceptions`, `ds`, `SEEN`, `scoresOf`, `statusOf` (existing in the file); `seedInvestigatorResult`, `storedWith` (already imported); `ScoreService.computeInitial`, `ErrorExceptionService.setErrorException` (`(teacherId, resultId, ruleId, direction) → { scoreHundredths, status }`).
- Produces: nothing later tasks use.

This is a **wiring test**: Task 1 is already in, so it passes on first run. If it fails, fix the *fixture shape* (`challenge` must match `StoredChallenge` in `investigator/challenge.ts`), not `score-core`.

- [ ] **Step 1: Write the tests**

Insert after the `T-EXC-2` test (anchor: `    expect(await scoresOf(id)).toEqual(['8.50', '10.00', '8.50']);\n  });`):

```ts
  // G1 §1: góc kiểm bác bỏ `ten_bien` (luật MODEL) → lỗi bị loại khỏi điểm và gắn cờ `refuted`.
  const refutingStored = () => ({
    ...storedWith(SEEN, ['ten_bien']),
    challenge: {
      perError: [{ challenger: 'lens', perError: [{ ruleKey: 'ten_bien', status: 'refuted' as const, toolCallIds: [] as string[] }] }],
      caseNotes: [],
    },
  });
  async function gradedRefuted(ctx: Awaited<ReturnType<typeof world>>['ctx']) {
    const { resultId } = await seedInvestigatorResult(ds, ctx, refutingStored());
    await scores.computeInitial(resultId);
    return resultId;
  }
  const lastBreakdown = async (id: string) =>
    (
      await ds.query(
        `SELECT breakdown FROM examcollect.score_computation WHERE grading_result_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1`,
        [id],
      )
    )[0].breakdown as { errors: { ruleKey: string; counted: string }[]; errorFlags: { ruleKey: string; code: string }[] };
  const countedOf = (b: Awaited<ReturnType<typeof lastBreakdown>>) => b.errors.find((e) => e.ruleKey === 'ten_bien')?.counted;

  it('G1: lỗi bị bác bỏ → "giữ lỗi này" (include) tính lại vào điểm, cờ refuted mất, bài sang teacher_reviewed', async () => {
    const { ctx, ten } = await world('ex-refuted-include');
    const id = await gradedRefuted(ctx);
    expect(countedOf(await lastBreakdown(id))).toBe('refuted');
    expect(await scoresOf(id)).toEqual(['8.50']);
    expect(await statusOf(id)).toBe('flagged_for_review');

    const out = await exceptions.setErrorException(ctx.teacherId, id, ten.ruleId, 'include');
    expect(out).toEqual({ scoreHundredths: 800, status: 'teacher_reviewed' });
    const b = await lastBreakdown(id);
    expect(countedOf(b)).toBe('counted');
    expect(b.errorFlags.map((f) => f.code)).not.toContain('refuted');
    expect(await scoresOf(id)).toEqual(['8.50', '8.00']);
  });

  it('G1: "đồng ý bác bỏ" (exclude) → nhãn excluded, điểm không đổi; "giữ" ngay sau đó gỡ được', async () => {
    const { ctx, ten } = await world('ex-refuted-exclude');
    const id = await gradedRefuted(ctx);
    const out = await exceptions.setErrorException(ctx.teacherId, id, ten.ruleId, 'exclude');
    expect(out).toEqual({ scoreHundredths: 850, status: 'teacher_reviewed' });
    expect(countedOf(await lastBreakdown(id))).toBe('excluded');

    const back = await exceptions.setErrorException(ctx.teacherId, id, ten.ruleId, 'include');
    expect(back.scoreHundredths).toBe(800);
    expect(countedOf(await lastBreakdown(id))).toBe('counted');
    expect(await scoresOf(id)).toEqual(['8.50', '8.50', '8.00']);
  });
```

- [ ] **Step 2: Run**

Run: `pnpm --filter api exec jest --config ./test/jest-e2e.json test/error-exception.e2e-spec.ts`
Expected: PASS (all previous tests + 2 new). If `computeInitial` rejects the stored shape, read `stored-investigation.ts` (`readStoredInvestigation`) and match the `challenge` field it accepts.

- [ ] **Step 3: Lint, commit**

`pnpm --filter api exec eslint test/error-exception.e2e-spec.ts`. Commit: `test(grading): e2e for exceptions on a refuted error`.

---

### Task 3: Pure `triageOf`

**Files:**
- Create: `apps/api/src/grading/scoring/result-triage.ts`
- Test: `apps/api/src/grading/scoring/result-triage.spec.ts`

**Interfaces:**
- Consumes: `ScoreBreakdown` (`./score-core`), `GradingPipeline` (`../grading-model.types`).
- Produces (Tasks 4, 8 rely on these exact names):
  ```ts
  export interface ResultTriage {
    caseFlags: { code: string; detail: string }[];
    errorFlags: { ruleKey: string; code: string }[];
    counts: { counted: number; unpriced: number; refuted: number; excluded: number };
  }
  export function triageOf(input: {
    pipeline: GradingPipeline;
    ungradableClass: string | null;
    breakdown: ScoreBreakdown | null;
  }): ResultTriage | null;
  ```

- [ ] **Step 1: Write the failing spec**

```ts
import type { BreakdownError, ScoreBreakdown } from './score-core';
import { triageOf } from './result-triage';

const err = (ruleKey: string, counted: BreakdownError['counted']): BreakdownError => ({
  ruleId: `id-${ruleKey}`, revisionId: `rev-${ruleKey}`, ruleKey, criterionKey: 'tinh_dung',
  source: 'deterministic', toolCallIds: [], deductionHundredths: 100, counted,
});

const breakdown = (over: Partial<ScoreBreakdown> = {}): ScoreBreakdown => ({
  errors: [], perCriterion: [], caseFlags: [], errorFlags: [], confidence: 1,
  mismatchedRules: [], notConsidered: [], ungradable: null, ...over,
});

const investigator = (b: ScoreBreakdown | null, ungradableClass: string | null = null) =>
  triageOf({ pipeline: 'investigator', ungradableClass, breakdown: b });

describe('triageOf (G1 §2)', () => {
  it('bài tự luận không có bảng lỗi → null', () => {
    expect(triageOf({ pipeline: 'one_shot', ungradableClass: null, breakdown: breakdown() })).toBeNull();
  });

  it('chưa có lượt tính nào → null', () => {
    expect(investigator(null)).toBeNull();
  });

  it('bài không chấm được → null, dù lượt tính cuối có breakdown (Review Focus 3)', () => {
    expect(investigator(breakdown(), 'system')).toBeNull();
    expect(investigator(breakdown({ ungradable: { class: 'submission', reason: 'x' } }))).toBeNull();
  });

  it('đếm lỗi theo nhãn counted, kể cả không lỗi nào (0 chứ không null)', () => {
    expect(investigator(breakdown())?.counts).toEqual({ counted: 0, unpriced: 0, refuted: 0, excluded: 0 });
    const b = breakdown({ errors: [err('a', 'counted'), err('b', 'counted'), err('c', 'unpriced'), err('d', 'refuted'), err('e', 'excluded')] });
    expect(investigator(b)?.counts).toEqual({ counted: 2, unpriced: 1, refuted: 1, excluded: 1 });
  });

  it('chép cờ cấp bài và cờ cấp lỗi nguyên vẹn', () => {
    const b = breakdown({
      caseFlags: [{ code: 'criterion_without_rules', detail: 'tiêu chí "x" không có luật nào trỏ vào' }],
      errorFlags: [{ ruleKey: 'a', code: 'unpriced' }, { ruleKey: 'b', code: 'unverified' }],
    });
    expect(investigator(b)).toMatchObject({
      caseFlags: [{ code: 'criterion_without_rules', detail: 'tiêu chí "x" không có luật nào trỏ vào' }],
      errorFlags: [{ ruleKey: 'a', code: 'unpriced' }, { ruleKey: 'b', code: 'unverified' }],
    });
  });

  it('trả bản sao — sửa kết quả không làm hỏng breakdown gốc', () => {
    const b = breakdown({ errorFlags: [{ ruleKey: 'a', code: 'unpriced' }] });
    const out = investigator(b)!;
    out.errorFlags.push({ ruleKey: 'z', code: 'refuted' });
    expect(b.errorFlags).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run to verify RED**

Run: `pnpm --filter api exec jest src/grading/scoring/result-triage.spec.ts`
Expected: FAIL — `Cannot find module './result-triage'`.

- [ ] **Step 3: Implement**

```ts
import type { GradingPipeline } from '../grading-model.types';
import type { ScoreBreakdown } from './score-core';

/**
 * Tóm tắt bảng lỗi của MỘT bài cho danh sách bài (G1 §2): đủ để vẽ cột "vì sao cần bạn", cột số lỗi và dòng đòn bẩy
 * mà không phải tải hồ sơ từng bài.
 *
 * `null` = không có bảng lỗi để tóm tắt: bài tự luận, bài chưa có lượt tính nào, hay bài không chấm được. Giao diện
 * không cần `triage` để phân biệt ba ca đó — nó đã đọc `pipeline`, `status` và `ungradableReason` trên cùng dòng.
 */
export interface ResultTriage {
  caseFlags: { code: string; detail: string }[];
  errorFlags: { ruleKey: string; code: string }[];
  counts: { counted: number; unpriced: number; refuted: number; excluded: number };
}

export function triageOf(input: {
  pipeline: GradingPipeline;
  ungradableClass: string | null;
  breakdown: ScoreBreakdown | null;
}): ResultTriage | null {
  const { pipeline, ungradableClass, breakdown } = input;
  if (pipeline !== 'investigator' || breakdown === null) return null;
  // Lượt tính dưới sàn có `errors: []` và `ungradable` khác null — "không lỗi nào" ở đây là một lời nói dối.
  if (ungradableClass !== null || breakdown.ungradable !== null) return null;
  const counts = { counted: 0, unpriced: 0, refuted: 0, excluded: 0 };
  for (const e of breakdown.errors) counts[e.counted] += 1;
  return {
    caseFlags: breakdown.caseFlags.map((f) => ({ code: f.code, detail: f.detail })),
    errorFlags: breakdown.errorFlags.map((f) => ({ ruleKey: f.ruleKey, code: f.code })),
    counts,
  };
}
```

- [ ] **Step 4: Run to verify GREEN**

Run: `pnpm --filter api exec jest src/grading/scoring/result-triage.spec.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Lint, commit**

`pnpm --filter api exec eslint src/grading/scoring/result-triage.ts src/grading/scoring/result-triage.spec.ts`. Commit: `feat(grading): pure triageOf for the results list`.

---

### Task 4: `listForSession` carries `triage`, `deliverableType`, `deliverableLanguage`

**Files:**
- Modify: `apps/api/src/grading/grading.service.ts` (imports; `listForSession` query builder ~lines 681–700; `scoreRows` query ~732; row mapping ~750–791; `ScoreSourceRow`; `GradingResultView`)
- Test: create `apps/api/test/grading-results-triage.e2e-spec.ts`

**Interfaces:**
- Consumes: `triageOf`, `ResultTriage` (Task 3); `ScoreBreakdown`; `DeliverableType`, `DeclaredLanguage`.
- Produces on `GradingResultView` (Task 8 mirrors these names): `deliverableType: DeliverableType | null; deliverableLanguage: DeclaredLanguage | null; triage: ResultTriage | null`.

- [ ] **Step 1: Write the failing e2e**

Create `apps/api/test/grading-results-triage.e2e-spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { GradingService } from '../src/grading/grading.service';
import { ScoreService } from '../src/grading/scoring/score.service';
import { seedResult, seedSession } from './helpers/grading-seed';
import { seedInvestigatorResult, seedInvestigatorSession, seedPrices, seedRule, storedWith } from './helpers/investigator-seed';

const SEEN = [
  { ruleKey: 'sai_bien', checkedBy: 'machine' as const },
  { ruleKey: 'ten_bien', checkedBy: 'model' as const },
];

/** G1 §2, §4: mỗi dòng danh sách mang triage, loại bài nộp và ngôn ngữ đã khai. */
describe('GradingResultView — triage, loại bài nộp, ngôn ngữ (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let grading: GradingService;
  let scores: ScoreService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    ds = app.get(DataSource);
    grading = app.get(GradingService);
    scores = app.get(ScoreService);
  }, 60_000);
  afterAll(async () => app.close());

  const rowOf = async (sessionId: string, id: string) => (await grading.listForSession(sessionId)).find((v) => v.id === id)!;

  async function codeWorld(label: string, language: string | null) {
    const ctx = await seedSession(ds, label, { deliverableType: 'code_project', language });
    await seedInvestigatorSession(ds, ctx);
    const bien = await seedRule(ds, ctx.teacherId, 'sai_bien', 'tinh_dung', { kind: 'test_group_failed', group: 'bien' });
    await seedRule(ds, ctx.teacherId, 'ten_bien', 'trinh_bay');
    return { ctx, bien };
  }

  it('bài đường điều tra đã có lượt tính → triage mang số lỗi và cờ; luật chưa có giá đếm là chờ giá', async () => {
    const { ctx, bien } = await codeWorld('triage-unpriced', 'python');
    await seedPrices(ds, ctx.teacherId, { [bien.ruleId]: '1.50' }); // ten_bien không có dòng giá = chưa giá
    const { resultId } = await seedInvestigatorResult(ds, ctx, storedWith(SEEN, ['ten_bien']));
    await scores.computeInitial(resultId);

    const row = await rowOf(ctx.sessionId, resultId);
    expect(row.triage?.counts).toEqual({ counted: 1, unpriced: 1, refuted: 0, excluded: 0 });
    expect(row.triage?.errorFlags).toContainEqual({ ruleKey: 'ten_bien', code: 'unpriced' });
    expect(row).toMatchObject({ pipeline: 'investigator', deliverableType: 'code_project', deliverableLanguage: 'python' });
  });

  it('bài tự luận → triage null, loại document, không ngôn ngữ', async () => {
    const ctx = await seedSession(ds, 'triage-essay');
    const { resultId } = await seedResult(ds, ctx, 'one_shot');
    const row = await rowOf(ctx.sessionId, resultId);
    expect(row.triage).toBeNull();
    expect(row).toMatchObject({ deliverableType: 'document', deliverableLanguage: null });
  });

  it('bài code khai java → đường one_shot (chấm bằng đọc mã), vẫn thấy loại và ngôn ngữ', async () => {
    const ctx = await seedSession(ds, 'triage-java', { deliverableType: 'code_project', language: 'java' });
    const { resultId } = await seedResult(ds, ctx, 'one_shot');
    const row = await rowOf(ctx.sessionId, resultId);
    expect(row).toMatchObject({ pipeline: 'one_shot', deliverableType: 'code_project', deliverableLanguage: 'java', triage: null });
  });

  it('bài đường điều tra chưa có lượt tính nào → triage null', async () => {
    const { ctx } = await codeWorld('triage-nocomp', 'cpp');
    const { resultId } = await seedInvestigatorResult(ds, ctx, storedWith(SEEN));
    expect((await rowOf(ctx.sessionId, resultId)).triage).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify RED**

Run: `pnpm --filter api exec jest --config ./test/jest-e2e.json test/grading-results-triage.e2e-spec.ts`
Expected: FAIL — `triage`/`deliverableType` are `undefined` on the rows (`Cannot read properties of undefined (reading 'counts')`, and `toMatchObject` mismatches).

- [ ] **Step 3: Implement in `grading.service.ts`**

Add imports next to the existing `currentScore` import (skip any already present):

```ts
import type { ScoreBreakdown } from './scoring/score-core';
import { ResultTriage, triageOf } from './scoring/result-triage';
import type { DeliverableType } from '../exam-session/entities/required-deliverable.entity';
import type { DeclaredLanguage } from '../exam-session/declared-language';
```

In `listForSession`, extend the builder — after `.leftJoin('class', 'hc', 'hc.id = s.home_class_id')`:

```ts
      // Loại bài nộp và ngôn ngữ đã khai — để danh sách nói được bài code nào chấm bằng đọc mã (G1 §4).
      .leftJoin('required_deliverable', 'rd', 'rd.id = s.required_deliverable_id')
```

extend `addSelect([...])` with `'rd.deliverable_type AS "deliverableType"'` and `'rd.language AS "deliverableLanguage"'`, and extend the `getRawAndEntities<{…}>()` generic with `deliverableType: DeliverableType | null; deliverableLanguage: DeclaredLanguage | null;`.

In the `scoreRows` SQL insert one more column immediately **after** the line `fc.score AS "finalizedComputationScore",` and **before** the `latestManualScore` sub-select (so the new column ends with a comma and the existing last column stays comma-free):

```sql
                    (SELECT c.breakdown FROM examcollect.score_computation c
                      WHERE c.grading_result_id = g.id ORDER BY c.created_at DESC, c.id DESC LIMIT 1) AS "latestBreakdown",
```

The new sub-select's last line therefore reads `… LIMIT 1) AS "latestBreakdown",` (with the comma). Add `latestBreakdown: ScoreBreakdown | null;` to `interface ScoreSourceRow`.

In the row mapping's returned object add:

```ts
        deliverableType: rows.raw[index].deliverableType ?? null,
        deliverableLanguage: rows.raw[index].deliverableLanguage ?? null,
        triage: triageOf({
          pipeline: entity.pipeline,
          ungradableClass: entity.ungradableClass,
          breakdown: source?.latestBreakdown ?? null,
        }),
```

In `interface GradingResultView` add:

```ts
  /** Loại yêu cầu nộp của bài — `null` chỉ khi dòng khai báo không còn (FK RESTRICT nên không xảy ra). */
  deliverableType: DeliverableType | null;
  /** Ngôn ngữ giảng viên đã khai. `deliverableType === 'code_project'` và `pipeline === 'one_shot'` = chấm bằng đọc mã. */
  deliverableLanguage: DeclaredLanguage | null;
  /** Tóm tắt bảng lỗi cho danh sách bài (G1 §2). `null` = không có bảng lỗi để tóm tắt. */
  triage: ResultTriage | null;
```

- [ ] **Step 4: Run to verify GREEN, then the neighbours**

```bash
pnpm --filter api exec jest --config ./test/jest-e2e.json test/grading-results-triage.e2e-spec.ts
pnpm --filter api exec jest --config ./test/jest-e2e.json test/grading-results-view.e2e-spec.ts test/grading-results-current-score.e2e-spec.ts test/teacher-review.e2e-spec.ts test/bulk-review.e2e-spec.ts
```
Expected: PASS. If a neighbour asserts a row with strict `toEqual`, add the three new fields to its expectation (they are legitimately new).

- [ ] **Step 5: Typecheck, lint, detect changes, commit**

`pnpm --filter api exec tsc --noEmit`; `pnpm --filter api exec eslint src/grading/grading.service.ts test/grading-results-triage.e2e-spec.ts`; GitNexus `detect_changes()` (expected: `listForSession`, `GradingResultView`, `ScoreSourceRow`). Commit: `feat(grading): results list carries triage, deliverable type and language`.

---

### Task 5: `RubricView.createdAt`

**Files:**
- Modify: `apps/api/src/grading/rubric.service.ts` (`interface RubricView`, `toView`)
- Test: `apps/api/test/grading.e2e-spec.ts` (the versioning test that lists `/rubrics`, ~line 198–210)

**Interfaces:**
- Produces: `RubricView.createdAt: string` (ISO 8601). No web behaviour changes in G1.

- [ ] **Step 1: Write the failing assertion**

In the versioning test, after the line `expect(versions.find((r: { version: number }) => r.version === 2).isActive).toBe(true);` add:

```ts
      // G1 §5: mỗi bản mang thời điểm tạo, để "rubric mặc định = bản tạo gần nhất" suy ra được.
      const createdAt = (v: number) => Date.parse(versions.find((r: { version: number }) => r.version === v).createdAt);
      expect(Number.isNaN(createdAt(1))).toBe(false);
      expect(createdAt(2)).toBeGreaterThanOrEqual(createdAt(1));
```

- [ ] **Step 2: Run to verify RED**

Run: `pnpm --filter api exec jest --config ./test/jest-e2e.json test/grading.e2e-spec.ts`
Expected: FAIL in the versioning test — `expect(Number.isNaN(createdAt(1))).toBe(false)` fails because `createdAt` is `undefined`. All other tests in the file still pass.

- [ ] **Step 3: Implement**

In `interface RubricView` add `createdAt: string;`. In `toView`'s returned object add `createdAt: rubric.createdAt.toISOString(),`.

- [ ] **Step 4: Run to verify GREEN**

Run: `pnpm --filter api exec jest --config ./test/jest-e2e.json test/grading.e2e-spec.ts test/session-rubric.e2e-spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

`pnpm --filter api exec eslint src/grading/rubric.service.ts`. Commit: `feat(grading): RubricView carries createdAt`.

---

### Task 6: Declare a code deliverable's language after the session is created

**Files:**
- Modify: `apps/api/src/exam-session/dto/exam-session-response.dto.ts` (`RequiredDeliverableResponseDto`)
- Modify: `apps/api/src/exam-session/exam-session.service.ts` (`toResponseDto` mapping; import)
- Create: `apps/api/src/grading/dto/declare-language.dto.ts`, `apps/api/src/grading/deliverable-language.service.ts`
- Modify: `apps/api/src/grading/grading.controller.ts` (constructor + one route), `apps/api/src/grading/grading.module.ts` (provider)
- Test: create `apps/api/test/deliverable-language.e2e-spec.ts`

**Interfaces:**
- Consumes: `pipelineFor(d: { deliverableType; language })` (`grading/pipeline.ts`), `isGradingLocked(manager, sessionId)` and `GRADING_LOCKED_MESSAGE` (`grading/grading-lock.ts`), `ExamSessionService.findEntityForOwner`, `DECLARED_LANGUAGES` (`exam-session/declared-language.ts`, a leaf file).
- Produces (Tasks 8, 12 rely on these exact shapes):
  - Session response: each `requiredDeliverables[]` element gains `language: DeclaredLanguage | null` and `pipeline: 'investigator' | 'one_shot'`.
  - `PATCH /exam-sessions/:id/deliverables/:deliverableId` · body `{ language }` → `200 { id: string; language: DeclaredLanguage; pipeline: 'investigator' | 'one_shot' }`; `400` not a code deliverable / invalid language; `403/404` ownership or wrong session; `409` session locked, or the deliverable already has a grading result.

- [ ] **Step 1: Write the failing e2e**

Create `apps/api/test/deliverable-language.e2e-spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { createTestAccount } from './helpers/create-account';
import { forceStatus, seedResult, seedSession } from './helpers/grading-seed';

const PASSWORD = 'correct-horse-battery';

/** G1 §3: khai ngôn ngữ bài code sau khi phiên đã tạo; bị từ chối khi đường chấm đã cố định. */
describe('Khai ngôn ngữ bài code (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  const stamp = Date.now();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();
    ds = app.get(DataSource);
  }, 60_000);
  afterAll(async () => app.close());

  async function teacher(label: string) {
    const email = `${label}_${stamp}@example.com`;
    const id = await createTestAccount(ds, { email, password: PASSWORD, role: 'teacher' });
    const login = await request(app.getHttpServer()).post('/auth/login').send({ email, password: PASSWORD });
    return { id, token: login.body.accessToken as string };
  }
  const patch = (token: string, sessionId: string, deliverableId: string, body: object) =>
    request(app.getHttpServer())
      .patch(`/exam-sessions/${sessionId}/deliverables/${deliverableId}`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);
  const detail = (token: string, sessionId: string) =>
    request(app.getHttpServer()).get(`/exam-sessions/${sessionId}`).set('Authorization', `Bearer ${token}`);
  const codeSession = async (label: string) => {
    const t = await teacher(label);
    const ctx = await seedSession(ds, label, { teacherId: t.id, deliverableType: 'code_project' });
    return { t, ctx };
  };
  const languageInDb = async (deliverableId: string) =>
    (await ds.query(`SELECT language FROM examcollect.required_deliverable WHERE id = $1`, [deliverableId]))[0].language;

  it('khai python cho bài code → 200, đường chấm là investigator, và chi tiết phiên phản ánh', async () => {
    const { t, ctx } = await codeSession('dl-python');
    const before = await detail(t.token, ctx.sessionId);
    expect(before.body.requiredDeliverables[0]).toMatchObject({ language: null, pipeline: 'one_shot' });

    const res = await patch(t.token, ctx.sessionId, ctx.deliverableId, { language: 'python' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: ctx.deliverableId, language: 'python', pipeline: 'investigator' });

    const after = await detail(t.token, ctx.sessionId);
    expect(after.body.requiredDeliverables[0]).toMatchObject({ language: 'python', pipeline: 'investigator' });
  });

  it('đổi ngôn ngữ trước khi chấm được: python → java đưa đường chấm về one_shot', async () => {
    const { t, ctx } = await codeSession('dl-switch');
    expect((await patch(t.token, ctx.sessionId, ctx.deliverableId, { language: 'python' })).status).toBe(200);
    const res = await patch(t.token, ctx.sessionId, ctx.deliverableId, { language: 'java' });
    expect(res.body).toEqual({ id: ctx.deliverableId, language: 'java', pipeline: 'one_shot' });
    expect(await languageInDb(ctx.deliverableId)).toBe('java');
  });

  it('bài không phải code → 400, không đổi gì', async () => {
    const t = await teacher('dl-doc');
    const ctx = await seedSession(ds, 'dl-doc', { teacherId: t.id, deliverableType: 'document' });
    const res = await patch(t.token, ctx.sessionId, ctx.deliverableId, { language: 'python' });
    expect(res.status).toBe(400);
    expect(await languageInDb(ctx.deliverableId)).toBeNull();
  });

  it('yêu cầu nộp của phiên KHÁC → 404', async () => {
    const t = await teacher('dl-other-session');
    const a = await seedSession(ds, 'dl-a', { teacherId: t.id, deliverableType: 'code_project' });
    const b = await seedSession(ds, 'dl-b', { teacherId: t.id, deliverableType: 'code_project', startHoursAgo: 6 });
    const res = await patch(t.token, a.sessionId, b.deliverableId, { language: 'cpp' });
    expect(res.status).toBe(404);
    expect(await languageInDb(b.deliverableId)).toBeNull();
  });

  it('giảng viên khác → 403', async () => {
    const { ctx } = await codeSession('dl-owner');
    const stranger = await teacher('dl-stranger');
    expect((await patch(stranger.token, ctx.sessionId, ctx.deliverableId, { language: 'cpp' })).status).toBe(403);
  });

  it('ngôn ngữ ngoài danh sách hoặc thiếu → 400', async () => {
    const { t, ctx } = await codeSession('dl-invalid');
    expect((await patch(t.token, ctx.sessionId, ctx.deliverableId, { language: 'rust' })).status).toBe(400);
    expect((await patch(t.token, ctx.sessionId, ctx.deliverableId, { language: null })).status).toBe(400);
    expect((await patch(t.token, ctx.sessionId, ctx.deliverableId, {})).status).toBe(400);
  });

  it('phiên đã khoá chấm (có bài đang chấm) → 409 nói khoá cùng tài liệu chấm, ngôn ngữ không đổi', async () => {
    const { t, ctx } = await codeSession('dl-locked');
    await seedResult(ds, ctx, 'one_shot'); // status ai_grading → phiên khoá
    const res = await patch(t.token, ctx.sessionId, ctx.deliverableId, { language: 'python' });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/khoá/);
    expect(await languageInDb(ctx.deliverableId)).toBeNull();
  });

  // Review Focus 2: phiên KHÔNG khoá (mọi bài là không chấm được lớp system, đã dừng — spec §2.3 luật 6) nhưng bài
  // đã có dòng kết quả, mà `pipeline` của dòng đó không đổi được nữa. Kiểm khoá một mình không bắt được ca này.
  it('phiên không khoá nhưng bài đã có dòng kết quả → 409 "đường chấm đã cố định", ngôn ngữ không đổi', async () => {
    const { t, ctx } = await codeSession('dl-has-result');
    const { resultId } = await seedResult(ds, ctx, 'one_shot');
    await forceStatus(ds, resultId, 'flagged_for_review', { ungradable_class: 'system', ungradable_reason: 'hết giờ' });
    const res = await patch(t.token, ctx.sessionId, ctx.deliverableId, { language: 'python' });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/đường chấm đã cố định/);
    expect(await languageInDb(ctx.deliverableId)).toBeNull();
  });

  it('chi tiết phiên: bài tài liệu có pipeline one_shot và language null', async () => {
    const t = await teacher('dl-detail-doc');
    const ctx = await seedSession(ds, 'dl-detail-doc', { teacherId: t.id, deliverableType: 'document' });
    const res = await detail(t.token, ctx.sessionId);
    expect(res.body.requiredDeliverables[0]).toMatchObject({ deliverableType: 'document', language: null, pipeline: 'one_shot' });
  });
});
```

- [ ] **Step 2: Run to verify RED**

Run: `pnpm --filter api exec jest --config ./test/jest-e2e.json test/deliverable-language.e2e-spec.ts`
Expected: FAIL — the PATCH calls return `404` (route does not exist) and `requiredDeliverables[0]` has no `pipeline`.

- [ ] **Step 3: Response DTO**

In `exam-session-response.dto.ts` add to `RequiredDeliverableResponseDto` (and the type-only imports at the top: `import type { DeclaredLanguage } from '../declared-language';` and `import type { GradingPipeline } from '../../grading/grading-model.types';`):

```ts
  /** Null = chưa khai (§14.1) — bài đi đường `one_shot`. Hệ thống không đoán ngôn ngữ từ đuôi file. */
  language!: DeclaredLanguage | null;
  /**
   * Đường chấm của yêu cầu nộp này — BACKEND tính bằng `pipelineFor`, cùng hàm mà `startGrading` dùng để gán
   * `grading_result.pipeline`. Giao diện đọc chứ không tự cài lại luật "code + python/cpp ⇒ điều tra".
   */
  pipeline!: GradingPipeline;
```

- [ ] **Step 4: Session service mapping**

In `exam-session.service.ts` add `import { pipelineFor } from '../grading/pipeline';` and, in `toResponseDto`'s `deliverables.map`, after `view.deliverableType = …`:

```ts
      view.language = deliverable.language;
      view.pipeline = pipelineFor(deliverable);
```

- [ ] **Step 5: DTO, service, controller, module**

`apps/api/src/grading/dto/declare-language.dto.ts`:

```ts
import { IsIn } from 'class-validator';
import { DECLARED_LANGUAGES, DeclaredLanguage } from '../../exam-session/declared-language';

/**
 * Một trường, cố ý. Không nhận `null`: gỡ một ngôn ngữ đã khai không có nghĩa gì trước khi chấm — bài chưa khai và
 * bài khai `java` đều đi đường `one_shot` — nên "chưa khai" chỉ là trạng thái ban đầu, không phải một lựa chọn.
 */
export class DeclareLanguageDto {
  @IsIn(DECLARED_LANGUAGES)
  language!: DeclaredLanguage;
}
```

`apps/api/src/grading/deliverable-language.service.ts`:

```ts
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { DeclaredLanguage } from '../exam-session/declared-language';
import { ExamSessionEntity } from '../exam-session/entities/exam-session.entity';
import { RequiredDeliverableEntity } from '../exam-session/entities/required-deliverable.entity';
import { GRADING_LOCKED_MESSAGE, isGradingLocked } from './grading-lock';
import type { GradingPipeline } from './grading-model.types';
import { pipelineFor } from './pipeline';

export interface DeclaredLanguageView {
  id: string;
  language: DeclaredLanguage;
  pipeline: GradingPipeline;
}

/**
 * Khai ngôn ngữ của MỘT yêu cầu nộp code sau khi phiên đã tạo (G1 §3).
 *
 * `pipeline` được gán một lần lúc `startGrading` tạo dòng kết quả và trigger vòng đời chặn đổi (§2.3 luật 8), nên
 * một bài đã có dòng kết quả thì KHÔNG khai được nữa — khai rồi mà đường chấm vẫn cũ là một lời nói dối. Nằm ở
 * module chấm điểm chứ không ở module phiên thi vì cần `isGradingLocked`, mà `GradingModule` đã import
 * `ExamSessionModule`, không phải ngược lại.
 */
@Injectable()
export class DeliverableLanguageService {
  constructor(
    @InjectRepository(RequiredDeliverableEntity)
    private readonly deliverables: Repository<RequiredDeliverableEntity>,
  ) {}

  async declare(session: ExamSessionEntity, deliverableId: string, language: DeclaredLanguage): Promise<DeclaredLanguageView> {
    const deliverable = await this.deliverables.findOne({ where: { id: deliverableId, examSessionId: session.id } });
    if (!deliverable) throw new NotFoundException('Yêu cầu nộp này không thuộc phiên thi này.');
    if (deliverable.deliverableType !== 'code_project') {
      throw new BadRequestException('Chỉ bài code mới khai được ngôn ngữ — yêu cầu nộp này không phải bài code.');
    }
    if (await isGradingLocked(this.deliverables.manager, session.id)) {
      throw new ConflictException(`${GRADING_LOCKED_MESSAGE} — ngôn ngữ khoá cùng tài liệu chấm.`);
    }
    // Một câu UPDATE có điều kiện: kiểm "chưa có dòng kết quả nào" và ghi trong cùng một lệnh, nên không có
    // khoảng hở giữa hai bước. (`startGrading` không khoá dòng khai báo — chỗ đó vẫn còn một cửa sổ hẹp, ghi ở ledger.)
    const updated = await this.deliverables
      .createQueryBuilder()
      .update()
      .set({ language })
      .where('id = :id', { id: deliverable.id })
      .andWhere(
        `NOT EXISTS (
           SELECT 1 FROM examcollect.grading_result g JOIN examcollect.submission s ON s.id = g.submission_id
            WHERE s.required_deliverable_id = required_deliverable.id
         )`,
      )
      .execute();
    if (!updated.affected) {
      throw new ConflictException('Bài này đã có kết quả chấm, nên đường chấm đã cố định — không đổi ngôn ngữ được nữa.');
    }
    return { id: deliverable.id, language, pipeline: pipelineFor({ deliverableType: deliverable.deliverableType, language }) };
  }
}
```

Controller (`grading.controller.ts`): add imports `DeclareLanguageDto` and `DeliverableLanguageService`; add `private readonly deliverableLanguage: DeliverableLanguageService,` to the constructor **before** the `@InjectDataSource()` parameter; add the route right after `setSessionRubric`:

```ts
  /**
   * Khai ngôn ngữ của MỘT yêu cầu nộp code (G1 §3). Ở controller chấm điểm, cùng chỗ với `PATCH …/rubric`, vì cần
   * luật khoá của module này. Trả `{ id, language, pipeline }` — `pipeline` do backend tính (`pipelineFor`).
   */
  @Patch('exam-sessions/:id/deliverables/:deliverableId')
  @Roles('teacher')
  async declareDeliverableLanguage(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('deliverableId', ParseUUIDPipe) deliverableId: string,
    @Body() dto: DeclareLanguageDto,
    @Req() req: Request,
  ) {
    const session = await this.examSessions.findEntityForOwner(id, req.user!.sub);
    return this.deliverableLanguage.declare(session, deliverableId, dto.language);
  }
```

Module (`grading.module.ts`): import `DeliverableLanguageService` and add it to `providers` next to `GradingRunService`.

- [ ] **Step 6: Run to verify GREEN**

```bash
pnpm --filter api exec jest --config ./test/jest-e2e.json test/deliverable-language.e2e-spec.ts
pnpm --filter api exec jest --config ./test/jest-e2e.json test/exam-session.e2e-spec.ts test/start-grading-test-bundle-guard.e2e-spec.ts
```
Expected: PASS. If `NOT EXISTS (… required_deliverable.id)` fails to resolve the outer table, alias it: `.update(RequiredDeliverableEntity, …)` is not needed — instead switch the two lines to raw SQL through `this.deliverables.manager.query('UPDATE examcollect.required_deliverable d SET language = $2 WHERE d.id = $1 AND NOT EXISTS (…) RETURNING d.id')` and treat an empty `RETURNING` (both TypeORM shapes: `rows` or `[rows, count]`) as "no row updated". Record the ruling.

- [ ] **Step 7: Cycles, typecheck, lint, detect changes, commit**

```bash
pnpm check:cycles
pnpm --filter api exec tsc --noEmit
pnpm --filter api exec eslint src/grading src/exam-session test/deliverable-language.e2e-spec.ts
```
Expected: `check:cycles` prints zero cycles. GitNexus `detect_changes()`; expected: `toResponseDto`, `GradingController`, `GradingModule`, the new service. Commit: `feat(grading): declare a code deliverable's language after the session is created`.

---

### Task 7: Regenerate the API client and run the backend regression

**Files:**
- Modify: `packages/shared/src/api/schema.d.ts` (generated)

- [ ] **Step 1: Build and start the API against the LOCAL test env**

```bash
cd "C:/Users/Admin/Main/Desktop/HKI 2026-2027/KLTN/CINE/.claude/worktrees/grading-ui-rebuild"
pnpm --filter api build
cd apps/api && DOTENV_CONFIG_PATH=.env.test node -r dotenv/config dist/src/main.js
```
Run the last command in the background (`run_in_background`). `DOTENV_CONFIG_PATH=.env.test` makes the preload read the local env; `apps/api/.env` points at Supabase and must not be used. Wait until `curl -s -o /dev/null -w "%{http_code}" http://localhost:4000/api-docs-json` prints `200` (~25 s).

- [ ] **Step 2: Generate**

Run: `cd packages/shared && pnpm generate:api-client`
Then stop the API (`TaskStop`).
Expected: `git diff --stat packages/shared` shows `schema.d.ts` changed: the new path `/exam-sessions/{id}/deliverables/{deliverableId}`, and `language`/`pipeline` on the deliverable schema. If the diff is unrelated churn only, the API was not the new build.

- [ ] **Step 3: Backend regression**

```bash
pnpm --filter api exec jest
pnpm check:cycles
pnpm --filter api exec jest --config ./test/jest-e2e.json test/error-exception.e2e-spec.ts test/grading-results-triage.e2e-spec.ts test/deliverable-language.e2e-spec.ts test/grading.e2e-spec.ts test/result-detail.e2e-spec.ts test/finalize-investigator.e2e-spec.ts test/score-service.e2e-spec.ts test/rules-prices.e2e-spec.ts test/test-bundle.e2e-spec.ts test/exam-session.e2e-spec.ts
```
Expected: all green. Before running e2e, kill stray node/jest workers (memory `cine-e2e-stale-jest-processes`).

- [ ] **Step 4: Commit**

Commit: `chore(shared): regenerate the API client for the deliverable route and triage`.

---

### Task 8: Web mirror types

**Files:**
- Modify: `apps/web/src/lib/api/grading.ts` (`GradingResult`, `Rubric`), `apps/web/src/lib/api/exam-session.ts` (`RequiredDeliverableResponse`, language union)

**Interfaces:**
- Produces (Tasks 9–14 import these): `ResultTriage`, `GradingResult.triage?/deliverableType?/deliverableLanguage?`, `Rubric.createdAt?`, `DeclaredLanguage`, `RequiredDeliverableResponse.language/pipeline`.

The three `GradingResult` additions are **optional**, following the precedent of `pipeline?`/`currentScore?` right above them ("optional so old fixtures keep compiling — the server always returns it"). Code must treat `undefined` and `null` as "unknown".

- [ ] **Step 1: Edit `lib/api/grading.ts`**

Above `export interface GradingResult` add:

```ts
/** Mirrors ResultTriage (apps/api/src/grading/scoring/result-triage.ts) — tóm tắt bảng lỗi trên mỗi dòng danh sách. */
export interface ResultTriage {
  caseFlags: { code: string; detail: string }[];
  errorFlags: { ruleKey: string; code: string }[];
  counts: { counted: number; unpriced: number; refuted: number; excluded: number };
}
```

In `GradingResult`, after `currentScoreSource?: string;` add:

```ts
  /** Loại yêu cầu nộp của bài. Server LUÔN trả nó; tuỳ chọn chỉ để không phá fixture cũ. */
  deliverableType?: 'document' | 'code_project' | 'image' | null;
  /** Ngôn ngữ đã khai. `code_project` + `pipeline: 'one_shot'` = chấm bằng đọc mã, không chạy. */
  deliverableLanguage?: 'python' | 'cpp' | 'java' | 'node' | null;
  /** Tóm tắt bảng lỗi (G1 §2). `null`/thiếu = không có bảng lỗi để tóm tắt — KHÔNG phải "không lỗi nào". */
  triage?: ResultTriage | null;
```

In `Rubric`, before `criteria:` add `/** Thời điểm tạo bản này (ISO). Server luôn trả; tuỳ chọn để không phá fixture. */ createdAt?: string;`.

- [ ] **Step 2: Edit `lib/api/exam-session.ts`**

Add near the top-level types: `export type DeclaredLanguage = 'python' | 'cpp' | 'java' | 'node';` and change the inline `language?: 'python' | 'cpp' | 'java' | 'node';` in `CreateExamSessionInput` to `language?: DeclaredLanguage;`. In `RequiredDeliverableResponse` add:

```ts
  /** Null = chưa khai. */
  language: DeclaredLanguage | null;
  /** Đường chấm do BACKEND tính (`pipelineFor`) — giao diện không tự suy ra từ `language`. */
  pipeline: 'investigator' | 'one_shot';
```

- [ ] **Step 3: Typecheck against the baseline**

Run: `pnpm --filter web exec tsc --noEmit > "<scratchpad>/tsc-after.txt"` then diff it with `tsc-baseline.txt`.
Expected: the only new errors are object literals typed as `RequiredDeliverableResponse` that lack `language`/`pipeline` (the `PreparePanel.test.tsx` deliverables). Do not fix them here — Task 13 owns that file. Any *other* new error is a mistake; fix it.

- [ ] **Step 4: Commit**

`pnpm --filter web exec eslint src/lib/api/grading.ts src/lib/api/exam-session.ts`. Commit: `feat(web): mirror types for triage, deliverable language and pipeline`.

---

### Task 9: `session-triage.ts` reads `result.triage`

**Files:**
- Modify: `apps/web/src/lib/session-triage.ts`
- Test: `apps/web/src/lib/session-triage.test.ts`

**Interfaces:**
- Consumes: `GradingResult`, `ResultTriage` (Task 8), `caseFlagLabel`, `stateOf`.
- Produces (Tasks 10, 14 rely on these signatures):
  ```ts
  export function isReadingCode(result: Pick<GradingResult, 'pipeline' | 'deliverableType'>): boolean;
  export function errorCounts(triage: ResultTriage | null | undefined): { counted: number; unpriced: number; refuted: number; unverified: number } | null;
  export function reasonOf(result: GradingResult): string | null;
  export function leverageOf(needsYou: GradingResult[]): { waiting: number; total: number; ruleKeys: string[] } | null;
  ```

- [ ] **Step 1: Rewrite the tests**

In `session-triage.test.ts`: change the import to `import type { GradingResult, ResultTriage } from './api/grading';`, add `isReadingCode` to the import list, **delete** the `detail` helper (the `const detail = (breakdown …): ResultDetail => ({…});` block), add

```ts
const triage = (over: Partial<ResultTriage> = {}): ResultTriage => ({
  caseFlags: [], errorFlags: [], counts: { counted: 0, unpriced: 0, refuted: 0, excluded: 0 }, ...over,
});
```

and replace everything from `describe('errorCounts'` to the end of the file with:

```ts
describe('isReadingCode (T-UI-19)', () => {
  it('a code deliverable on the legacy path is graded by reading, not running', () => {
    expect(isReadingCode({ pipeline: 'one_shot', deliverableType: 'code_project' })).toBe(true);
  });
  it('an essay, an image, and a code result on the investigator path are not', () => {
    expect(isReadingCode({ pipeline: 'one_shot', deliverableType: 'document' })).toBe(false);
    expect(isReadingCode({ pipeline: 'one_shot', deliverableType: 'image' })).toBe(false);
    expect(isReadingCode({ pipeline: 'investigator', deliverableType: 'code_project' })).toBe(false);
  });
  it('an unknown deliverable type is not claimed to be code', () => {
    expect(isReadingCode({ pipeline: 'one_shot' })).toBe(false);
    expect(isReadingCode({ pipeline: 'one_shot', deliverableType: null })).toBe(false);
  });
});

describe('errorCounts', () => {
  it('reads the counts and the distinct unverified flags', () => {
    const t = triage({
      counts: { counted: 1, unpriced: 1, refuted: 1, excluded: 1 },
      errorFlags: [{ ruleKey: 'b', code: 'unpriced' }, { ruleKey: 'e', code: 'unverified' }, { ruleKey: 'e', code: 'unverified' }],
    });
    expect(errorCounts(t)).toEqual({ counted: 1, unpriced: 1, refuted: 1, unverified: 1 });
  });
  it('no triage → null, not zeros', () => {
    expect(errorCounts(null)).toBeNull();
    expect(errorCounts(undefined)).toBeNull();
  });
  it('a triage with no errors is zeros — "no errors" is not "unknown"', () => {
    expect(errorCounts(triage())).toEqual({ counted: 0, unpriced: 0, refuted: 0, unverified: 0 });
  });
});

describe('reasonOf', () => {
  const flagged = (over: Partial<GradingResult> = {}) => result({ status: 'flagged_for_review', ...over });

  it('an ungradable result shows the system reason verbatim', () => {
    expect(reasonOf(flagged({ ungradableReason: 'Hết giờ chạy bài' }))).toBe('Hết giờ chạy bài');
  });
  it('an essay always needs the teacher', () => {
    expect(reasonOf(flagged({ pipeline: 'one_shot', deliverableType: 'document' }))).toBe('Bài tự luận — luôn do bạn duyệt');
  });
  it('a code result graded by reading says so instead of calling itself an essay', () => {
    expect(reasonOf(flagged({ pipeline: 'one_shot', deliverableType: 'code_project' }))).toBe('Bài code chấm bằng đọc mã — luôn do bạn duyệt');
  });
  it('a flagged code result without triage has no reason (the UI points at the dossier)', () => {
    expect(reasonOf(flagged())).toBeNull();
    expect(reasonOf(flagged({ triage: null }))).toBeNull();
  });
  it('builds the sentence from case flags and error flags', () => {
    const t = triage({
      caseFlags: [{ code: 'criterion_without_rules', detail: 'x' }],
      errorFlags: [
        { ruleKey: 'a', code: 'unpriced' }, { ruleKey: 'b', code: 'unpriced' },
        { ruleKey: 'c', code: 'unverified' }, { ruleKey: 'd', code: 'refuted' },
      ],
    });
    expect(reasonOf(flagged({ triage: t }))).toBe(
      'Tiêu chí chưa có luật nào · 2 luật chưa có giá · 1 lỗi chưa kiểm được · 1 lỗi bị bác bỏ',
    );
  });
  it('singular and plural stay natural for unpriced rules', () => {
    expect(reasonOf(flagged({ triage: triage({ errorFlags: [{ ruleKey: 'a', code: 'unpriced' }] }) }))).toBe('1 luật chưa có giá');
  });
  it('a triage that names no blocker says so instead of inventing one', () => {
    expect(reasonOf(flagged({ triage: triage() }))).toBe('Hồ sơ không nêu lý do cụ thể — mở hồ sơ để xem.');
  });
  it('is null for a result nobody needs to look at', () => {
    expect(reasonOf(result({ status: 'auto_approved', triage: triage() }))).toBeNull();
  });
});

describe('leverageOf (Review Focus 4: no claim from partial data)', () => {
  const flagged = (id: string, over: Partial<GradingResult> = {}) => result({ id, status: 'flagged_for_review', ...over });
  const waitingOnPrice = (...keys: string[]) => triage({ errorFlags: keys.map((ruleKey) => ({ ruleKey, code: 'unpriced' })) });

  it('says nothing while any code result has no triage', () => {
    expect(leverageOf([flagged('a', { triage: waitingOnPrice('x') }), flagged('b')])).toBeNull();
    expect(leverageOf([flagged('a', { triage: waitingOnPrice('x') }), flagged('b', { triage: null })])).toBeNull();
  });

  it('counts the results whose ONLY blocker is unpriced rules, and the distinct rules', () => {
    const needs = [
      flagged('a', { triage: waitingOnPrice('x', 'y') }),
      flagged('b', { triage: waitingOnPrice('x') }),
      flagged('c', { triage: triage({ caseFlags: [{ code: 'low_confidence', detail: 'θ' }], errorFlags: [{ ruleKey: 'z', code: 'unpriced' }] }) }),
    ];
    expect(leverageOf(needs)).toEqual({ waiting: 2, total: 3, ruleKeys: ['x', 'y'] });
  });

  it('an unverified or refuted flag means prices alone would not clear the result', () => {
    const t = triage({ errorFlags: [{ ruleKey: 'x', code: 'unpriced' }, { ruleKey: 'y', code: 'unverified' }] });
    expect(leverageOf([flagged('a', { triage: t })])).toBeNull();
  });

  it('an essay counts in the total but can never be "waiting for prices" (and needs no triage)', () => {
    const needs = [flagged('a', { triage: waitingOnPrice('x') }), flagged('e', { pipeline: 'one_shot' })];
    expect(leverageOf(needs)).toEqual({ waiting: 1, total: 2, ruleKeys: ['x'] });
  });

  it('is null when nothing is waiting on a price', () => {
    expect(leverageOf([flagged('a', { triage: triage() })])).toBeNull();
    expect(leverageOf([])).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify RED**

Run: `pnpm --filter web exec vitest run src/lib/session-triage.test.ts`
Expected: FAIL — `isReadingCode is not a function`, and `errorCounts`/`reasonOf`/`leverageOf` fail against the old `ResultDetail` shapes.

- [ ] **Step 3: Implement**

In `session-triage.ts`: change the first import to `import type { GradingResult, ResultTriage } from './api/grading';`, delete the `ResultDetail` import, and replace `errorCounts`, the local `distinct` (keep it), `reasonOf` and `leverageOf` with:

```ts
/**
 * Bài code chấm bằng đọc mã, không chạy (spec T-UI-19): đường `one_shot` cho một yêu cầu nộp `code_project` —
 * bài code cũ chưa khai ngôn ngữ, hoặc khai `java`/`node` mà môi trường chạy bài không chạy được.
 */
export function isReadingCode(result: Pick<GradingResult, 'pipeline' | 'deliverableType'>): boolean {
  return result.pipeline === 'one_shot' && result.deliverableType === 'code_project';
}

export function errorCounts(
  triage: ResultTriage | null | undefined,
): { counted: number; unpriced: number; refuted: number; unverified: number } | null {
  if (!triage) return null;
  return {
    counted: triage.counts.counted,
    unpriced: triage.counts.unpriced,
    refuted: triage.counts.refuted,
    unverified: distinct(triage.errorFlags, 'unverified'),
  };
}

const distinct = (flags: { ruleKey: string; code: string }[], code: string) =>
  new Set(flags.filter((f) => f.code === code).map((f) => f.ruleKey)).size;

/**
 * "Vì sao cần bạn" — MỘT câu, ghép từ `triage` mà danh sách đã mang sẵn. `null` = chưa biết; màn hình chỉ đường mở
 * hồ sơ, không đoán.
 */
export function reasonOf(result: GradingResult): string | null {
  const state = stateOf(result);
  if (state === 'ungradable') return result.ungradableReason;
  if (state !== 'needsYou') return null;
  if (result.pipeline === 'one_shot') {
    return isReadingCode(result) ? 'Bài code chấm bằng đọc mã — luôn do bạn duyệt' : 'Bài tự luận — luôn do bạn duyệt';
  }

  const triage = result.triage;
  if (!triage) return null;

  const parts: string[] = triage.caseFlags.map((f) => caseFlagLabel(f.code, f.detail));
  const unpriced = distinct(triage.errorFlags, 'unpriced');
  if (unpriced > 0) parts.push(`${unpriced} luật chưa có giá`);
  const unverified = distinct(triage.errorFlags, 'unverified');
  if (unverified > 0) parts.push(`${unverified} lỗi chưa kiểm được`);
  const refuted = distinct(triage.errorFlags, 'refuted');
  if (refuted > 0) parts.push(`${refuted} lỗi bị bác bỏ`);

  return parts.length > 0 ? parts.join(' · ') : 'Hồ sơ không nêu lý do cụ thể — mở hồ sơ để xem.';
}

/**
 * Dòng nhắc đòn bẩy (spec §3.3): "W trong T bài cần xem đang chờ bạn đặt giá cho R luật".
 *
 * KHÔNG nói gì (`null`) chừng nào còn một bài đường điều tra chưa có `triage` — một lời khẳng định dựng trên dữ liệu
 * thiếu là lời khẳng định sai. Bài tự luận tính vào T nhưng không bao giờ "chờ giá" (nó luôn do người duyệt).
 *
 * "Chờ giá" ở đây nghĩa là: lý do DUY NHẤT đang hiện ra là giá. Nó KHÔNG hứa rằng đặt giá là đủ — `decide()` giấu cờ
 * `low_confidence` khi còn cờ khác (decide.ts:188), nên sau khi đặt giá, lý do đó có thể lộ ra (đã kiểm trên API
 * thật). Lời hiển thị vì vậy nói "đang chờ", không nói "chỉ chờ".
 */
export function leverageOf(needsYou: GradingResult[]): { waiting: number; total: number; ruleKeys: string[] } | null {
  const investigators = needsYou.filter((r) => r.pipeline !== 'one_shot');
  if (investigators.some((r) => !r.triage)) return null;

  const ruleKeys = new Set<string>();
  let waiting = 0;
  for (const r of investigators) {
    const triage = r.triage;
    if (!triage) continue;
    const unpriced = triage.errorFlags.filter((f) => f.code === 'unpriced');
    const onlyPrices =
      unpriced.length > 0 && triage.caseFlags.length === 0 && triage.errorFlags.every((f) => f.code === 'unpriced');
    if (!onlyPrices) continue;
    waiting += 1;
    for (const f of unpriced) ruleKeys.add(f.ruleKey);
  }
  return waiting > 0 ? { waiting, total: needsYou.length, ruleKeys: [...ruleKeys].sort() } : null;
}
```

(The old `distinct` was defined above `reasonOf`; keep exactly one definition — move it above `errorCounts` if the compiler complains about use-before-define.)

- [ ] **Step 4: Run to verify GREEN**

Run: `pnpm --filter web exec vitest run src/lib/session-triage.test.ts`
Expected: PASS.

- [ ] **Step 5: Do NOT commit yet** — `ResultsTable` and `page.tsx` still call the old signatures. Task 10 finishes this change; commit Tasks 9 and 10 together so no commit leaves the tree red. Record that in the ledger.

---

### Task 10: The list stops fetching dossiers

**Files:**
- Modify: `apps/web/src/app/teacher/grading/_components/ResultsTable.tsx`, `apps/web/src/app/teacher/grading/page.tsx`, `apps/web/src/hooks/useGrading.ts`
- Test: `apps/web/src/app/teacher/grading/_components/ResultsTable.test.tsx`, `apps/web/src/app/teacher/grading/page.test.tsx`

**Interfaces:**
- Consumes: `errorCounts`, `reasonOf`, `leverageOf`, `isReadingCode` (Task 9).
- Produces: `ResultsTable` props lose `details` and `detailsSettled`; `useResultDetails` is deleted.

- [ ] **Step 1: Update `ResultsTable.test.tsx`**

Remove `ResultDetail` from the type import, delete the `detail` helper, and drop `details: new Map(), detailsSettled: true,` from the `props()` defaults. Then:

- **Replace** the three tests `'a needs-you result reads its reason and error counts from the dossier'`, `'says it is reading the dossier while it loads — and does not guess'` and `'once everything has settled without a dossier, points the teacher at it instead of spinning forever'` with:

```tsx
  it('a needs-you result reads its reason and error counts from its own triage — no dossier request', () => {
    const triage = {
      caseFlags: [], errorFlags: [{ ruleKey: 'x', code: 'unpriced' }],
      counts: { counted: 1, unpriced: 1, refuted: 0, excluded: 0 },
    };
    render(<ResultsTable {...props({ results: [result({ id: 'b', status: 'flagged_for_review', triage })] })} />);
    expect(screen.getByText('1 luật chưa có giá')).toBeInTheDocument();
    expect(screen.getByText('1 đã trừ · 1 chờ giá')).toBeInTheDocument();
  });

  // Review Focus 4: a code result with no triage is never guessed at — and never left spinning.
  it('a needs-you code result without triage points the teacher at the dossier', () => {
    render(<ResultsTable {...props()} />);
    expect(within(rows()[0]).getByText('Mở hồ sơ để xem lý do.')).toBeInTheDocument();
    expect(screen.queryByText('Đang xem hồ sơ…')).not.toBeInTheDocument();
  });

  it('the errors cell is "—" without triage, and "Không lỗi nào" with an empty one (not the same thing)', () => {
    const empty = { caseFlags: [], errorFlags: [], counts: { counted: 0, unpriced: 0, refuted: 0, excluded: 0 } };
    render(<ResultsTable {...props({ results: [result({ id: 'p', studentMssv: '1', triage: null }), result({ id: 'q', studentMssv: '2', triage: empty })] })} />);
    expect(within(rows()[0]).getByText('—', { selector: 'td.tabular-nums' })).toBeInTheDocument();
    expect(within(rows()[1]).getByText('Không lỗi nào')).toBeInTheDocument();
  });

  it('labels a code result graded by reading — never as an essay — and says why it needs the teacher (T-UI-19)', () => {
    render(
      <ResultsTable
        {...props({ results: [result({ pipeline: 'one_shot', deliverableType: 'code_project', deliverableLanguage: 'java', status: 'flagged_for_review' })] })}
      />,
    );
    expect(screen.getByText('Chấm bằng đọc mã, không chạy')).toBeInTheDocument();
    expect(screen.queryByText('Bài tự luận')).not.toBeInTheDocument();
    expect(screen.getByText('Bài code chấm bằng đọc mã — luôn do bạn duyệt')).toBeInTheDocument();
  });
```

- In `'an essay that needs review says why without any dossier'`, remove `, detailsSettled: false` from the props.

- [ ] **Step 2: Update `page.test.tsx`**

Delete the `details` entry from `h` (`details: { byId: …}`), the line `useResultDetails: () => h.details,` in the `@/hooks/useGrading` mock, the `h.details = …` line in `beforeEach`, and the `dossier` helper plus the `ResultDetail` type import. Add `ResultTriage` to the type import and this helper:

```ts
const priced = (...keys: string[]): ResultTriage => ({
  caseFlags: [],
  errorFlags: keys.map((ruleKey) => ({ ruleKey, code: 'unpriced' })),
  counts: { counted: 0, unpriced: keys.length, refuted: 0, excluded: 0 },
});
```

Replace the last two tests of `describe('list view — filter and the leverage line'` with:

```tsx
  it('shows the leverage line when every needs-you code result carries its triage and they only wait for prices', () => {
    h.results = {
      ...h.results,
      data: needsYou.map((r) => ({ ...r, triage: priced('ten_bien') })),
    };
    render(<GradingPage />);
    expect(screen.getByRole('status')).toHaveTextContent('2 trong 2 bài cần xem đang chờ bạn đặt giá cho 1 luật');
  });

  it('says nothing while a result has no triage — no claim from partial data', () => {
    h.results = {
      ...h.results,
      data: [{ ...needsYou[0], triage: priced('ten_bien') }, { ...needsYou[1], triage: null }],
    };
    render(<GradingPage />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
```

- [ ] **Step 3: Run to verify RED**

Run: `pnpm --filter web exec vitest run src/app/teacher/grading/_components/ResultsTable.test.tsx src/app/teacher/grading/page.test.tsx`
Expected: FAIL — `ResultsTable` still reads `details`; `page.tsx` still imports `useResultDetails`.

- [ ] **Step 4: Implement `ResultsTable.tsx`**

- Import `isReadingCode` from `@/lib/session-triage`; drop `ResultDetail` from the `@/lib/api/grading` import (`import type { GradingResult } from '@/lib/api/grading';`).
- Replace `errorsText` with:

```tsx
function errorsText(triage: GradingResult['triage']): string {
  const counts = errorCounts(triage);
  if (counts === null) return '—';
  const parts: string[] = [];
  if (counts.counted > 0) parts.push(`${counts.counted} đã trừ`);
  if (counts.unpriced > 0) parts.push(`${counts.unpriced} chờ giá`);
  return parts.length > 0 ? parts.join(' · ') : 'Không lỗi nào';
}
```

- Remove `details` and `detailsSettled` from the destructured props and the prop type; update the docblock paragraph *"Danh sách API không mang lý do…"* to: `Lý do và số lỗi đọc từ result.triage mà danh sách đã mang sẵn (G1 §2) — không còn một request hồ sơ cho mỗi bài.`
- Replace `reasonCell` with:

```tsx
  const reasonCell = (r: GradingResult) => {
    const reason = reasonOf(r);
    if (reason !== null) return reason;
    return stateOf(r) === 'needsYou' ? 'Mở hồ sơ để xem lý do.' : '—';
  };
```

- Replace the essay badge line `{r.pipeline === 'one_shot' && <Badge variant="outline">Bài tự luận</Badge>}` with:

```tsx
                        {isReadingCode(r) ? (
                          <Badge variant="info">Chấm bằng đọc mã, không chạy</Badge>
                        ) : (
                          r.pipeline === 'one_shot' && <Badge variant="outline">Bài tự luận</Badge>
                        )}
```

- Replace `{errorsText(details.get(r.id))}` with `{errorsText(r.triage)}`.

- [ ] **Step 5: Implement `page.tsx`**

Remove `useResultDetails` from the `@/hooks/useGrading` import; delete the two lines

```tsx
  // Chỉ bài đường điều tra có hồ sơ chứa lý do/số lỗi; bài tự luận tự nói lý do của nó.
  const details = useResultDetails(needsYou.filter((r) => r.pipeline !== 'one_shot').map((r) => r.id));
```

replace `<LeverageLine leverage={leverageOf(needsYou, details.byId)} />` with `<LeverageLine leverage={leverageOf(needsYou)} />`, and remove the three props `details={details.byId}`, `detailsSettled={details.loading === 0}` from `<ResultsTable …/>`.

- [ ] **Step 6: Delete `useResultDetails`**

In `hooks/useGrading.ts` delete the whole `useResultDetails` function with its docblock ("Hồ sơ của NHIỀU bài cùng lúc …"). Then run `pnpm --filter web exec eslint src/hooks/useGrading.ts` and remove any import it reports unused (`useQueries`, `UseQueryResult`, `useCallback`, `useMemo` — keep any still used elsewhere in the file).

- [ ] **Step 7: Run to verify GREEN**

Run: `pnpm --filter web exec vitest run src/lib/session-triage.test.ts src/app/teacher/grading src/hooks`
Expected: PASS.

- [ ] **Step 8: Typecheck, lint, commit Tasks 9 + 10 together**

```bash
pnpm --filter web exec tsc --noEmit
pnpm --filter web exec eslint src/lib/session-triage.ts src/lib/session-triage.test.ts src/app/teacher/grading src/hooks/useGrading.ts
```
Expected: tsc errors ⊆ the baseline plus Task 13's known `PreparePanel.test.tsx` literals. GitNexus `detect_changes()`. Commit: `feat(web): the results list reads triage instead of fetching every dossier`.

---

### Task 11: `ErrorList` — "Đồng ý bác bỏ" and an unlocked "Không đồng ý"

**Files:**
- Modify: `apps/web/src/app/teacher/grading/[resultId]/_components/investigator/ErrorList.tsx`
- Test: `apps/web/src/app/teacher/grading/[resultId]/_components/investigator/ErrorList.test.tsx`

**Interfaces:**
- Consumes: `useSetErrorException(sessionId).mutate({ resultId, ruleId, direction })` — `direction: 'exclude'` = agree with the refutation, `'include'` = keep the error.
- Produces: nothing later tasks use.

- [ ] **Step 1: Replace the old lock test**

In `ErrorList.test.tsx` replace the comment block starting `// Review C1: the backend never lets \`include\` flip a refuted error …` **and** the whole test `'locks "Không đồng ý" on a refuted error: disabled, badged "cần backend", and sends nothing'` with:

```tsx
  // G1 §1: the backend now honours the teacher's exception over a refutation, so both buttons are real.
  describe('a refuted error (counted: "refuted")', () => {
    const renderRefuted = () =>
      render(
        <ErrorList
          resultId="r1" sessionId="s1" status="flagged_for_review"
          errors={[{ ...baseError, counted: 'refuted', deductionHundredths: 150 }]}
          errorFlags={[]}
          verdicts={[{ lens: 'qua_tay', ruleKey: 'sai_bien', status: 'refuted', reason: 'Khung mã của đề đặt sẵn tên biến.' }]}
          investigationNotes={[]}
        />,
      );

    it('"Đồng ý bác bỏ" sends exclude', () => {
      renderRefuted();
      fireEvent.click(screen.getByRole('button', { name: 'Đồng ý bác bỏ' }));
      expect(mutate).toHaveBeenCalledWith({ resultId: 'r1', ruleId: 'rule-1', direction: 'exclude' });
    });

    it('"Không đồng ý — giữ lỗi này cho riêng bài này" sends include, and is no longer badged "cần backend"', () => {
      renderRefuted();
      const button = screen.getByRole('button', { name: /Không đồng ý — giữ lỗi này/ });
      expect(button).toBeEnabled();
      fireEvent.click(button);
      expect(mutate).toHaveBeenCalledWith({ resultId: 'r1', ruleId: 'rule-1', direction: 'include' });
      expect(screen.queryByText('cần backend')).not.toBeInTheDocument();
    });

    it('says the decision is per-result and cannot go back to the system verdict', () => {
      renderRefuted();
      expect(screen.getByText(/chỉ áp cho bài này/)).toBeInTheDocument();
      expect(screen.getByText(/không quay về kết luận của hệ thống/)).toBeInTheDocument();
    });

    it('offers neither once the result is finalized', () => {
      render(
        <ErrorList
          resultId="r1" sessionId="s1" status="finalized"
          errors={[{ ...baseError, counted: 'refuted' }]}
          errorFlags={[]} verdicts={[]} investigationNotes={[]}
        />,
      );
      expect(screen.queryByRole('button', { name: /Đồng ý bác bỏ|Không đồng ý/ })).not.toBeInTheDocument();
    });
  });
```

- [ ] **Step 2: Run to verify RED**

Run: `pnpm --filter web exec vitest run "src/app/teacher/grading/[resultId]/_components/investigator/ErrorList.test.tsx"`
Expected: FAIL — no button named `Đồng ý bác bỏ`; the other is `disabled` and badged.

- [ ] **Step 3: Implement**

In `ErrorList.tsx` replace the whole `{refuted && ( … )}` block (comment `// Backend gap (review C1) …` through its closing `)}`) with:

```tsx
                  {refuted && (
                    <>
                      <Button
                        variant="link"
                        className="h-auto p-0"
                        disabled={busy}
                        onClick={() => setException.mutate({ resultId, ruleId: error.ruleId, direction: 'exclude' })}
                      >
                        Đồng ý bác bỏ
                      </Button>
                      <Button
                        variant="link"
                        className="h-auto p-0"
                        disabled={busy}
                        onClick={() => setException.mutate({ resultId, ruleId: error.ruleId, direction: 'include' })}
                      >
                        Không đồng ý — giữ lỗi này cho riêng bài này
                      </Button>
                      <span className="text-caption text-muted-foreground">
                        Quyết định này chỉ áp cho bài này và được ghi lại; sau đó chỉ đổi được chiều, không quay về
                        kết luận của hệ thống.
                      </span>
                    </>
                  )}
```

Remove the now-unused `import { NeedsBackend } from '@/components/needs-backend';` (it was used only in that block).

- [ ] **Step 4: Run to verify GREEN**

Run: `pnpm --filter web exec vitest run "src/app/teacher/grading/[resultId]/_components/investigator"`
Expected: PASS (whole folder, including the existing `excluded` "Giữ lại lỗi này" tests — after "Đồng ý bác bỏ" the error becomes `excluded` and that button is the way back).

- [ ] **Step 5: Lint, commit**

`pnpm --filter web exec eslint "src/app/teacher/grading/[resultId]/_components/investigator/ErrorList.tsx"`. Commit: `feat(web): agree or disagree with a refuted error (backend now honours it)`.

---

### Task 12: Declaring a language — API function, hook, and the picker

**Files:**
- Modify: `apps/web/src/lib/api/exam-session.ts`, `apps/web/src/hooks/useExamSession.ts`
- Create: `apps/web/src/app/teacher/grading/_components/DeliverableLanguages.tsx`
- Test: `apps/web/src/app/teacher/grading/_components/DeliverableLanguages.test.tsx`

**Interfaces:**
- Consumes: `DeclaredLanguage`, `RequiredDeliverableResponse` (Task 8); `PATCH /exam-sessions/{id}/deliverables/{deliverableId}` (Tasks 6–7).
- Produces (Task 13 imports):
  ```ts
  export async function declareDeliverableLanguage(examSessionId: string, deliverableId: string, language: DeclaredLanguage): Promise<{ id: string; language: DeclaredLanguage; pipeline: 'investigator' | 'one_shot' }>;
  export function useDeclareDeliverableLanguage(examSessionId: string | undefined): UseMutationResult<…, Error, { deliverableId: string; language: DeclaredLanguage }>;
  export function DeliverableLanguages(props: { sessionId: string; deliverables: RequiredDeliverableResponse[]; hasResults: boolean }): JSX.Element | null;
  ```

- [ ] **Step 1: Write the failing component test**

`DeliverableLanguages.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { DeliverableLanguages } from './DeliverableLanguages';
import type { RequiredDeliverableResponse } from '@/lib/api/exam-session';

const mutate = vi.fn();
let state: { isPending: boolean; isError: boolean; error: Error | null };
vi.mock('@/hooks/useExamSession', () => ({ useDeclareDeliverableLanguage: () => ({ mutate, ...state }) }));

const code = (over: Partial<RequiredDeliverableResponse> = {}): RequiredDeliverableResponse => ({
  id: 'd1', requiredFilename: 'bai.zip', deliverableType: 'code_project', entries: [], language: null, pipeline: 'one_shot', ...over,
});
const doc: RequiredDeliverableResponse = { id: 'd2', requiredFilename: 'Cau1.docx', deliverableType: 'document', entries: [], language: null, pipeline: 'one_shot' };

const renderIt = (deliverables: RequiredDeliverableResponse[], hasResults = false) =>
  render(<DeliverableLanguages sessionId="s1" deliverables={deliverables} hasResults={hasResults} />);

beforeEach(() => {
  mutate.mockReset();
  state = { isPending: false, isError: false, error: null };
});

describe('DeliverableLanguages (G1 §3.5)', () => {
  it('renders nothing when the session has no code deliverable', () => {
    const { container } = renderIt([doc]);
    expect(container).toBeEmptyDOMElement();
  });

  it('lists only the code deliverables', () => {
    renderIt([doc, code()]);
    expect(screen.getByText('bai.zip')).toBeInTheDocument();
    expect(screen.queryByText('Cau1.docx')).not.toBeInTheDocument();
  });

  it('an undeclared deliverable shows "Chưa khai", says it is graded by reading, and that nothing is guessed from the extension', () => {
    renderIt([code()]);
    expect(screen.getByRole('combobox', { name: /Ngôn ngữ của bai\.zip/ })).toHaveValue('');
    expect(screen.getByText('Chưa khai')).toBeInTheDocument();
    expect(screen.getByText(/chấm bằng đọc mã, không chạy mã/)).toBeInTheDocument();
    expect(screen.getByText(/không đoán ngôn ngữ từ đuôi file/)).toBeInTheDocument();
  });

  it('picking a language sends ONE request with the deliverable id and the language', () => {
    renderIt([code()]);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'python' } });
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledWith({ deliverableId: 'd1', language: 'python' });
  });

  it('python/cpp on the investigator path say it runs in the run environment and needs a pinned bundle', () => {
    renderIt([code({ language: 'python', pipeline: 'investigator' })]);
    expect(screen.getByRole('combobox')).toHaveValue('python');
    expect(screen.getByText(/môi trường chạy bài — cần gói test đã ghim/)).toBeInTheDocument();
    expect(screen.queryByText('Chưa khai')).not.toBeInTheDocument();
  });

  it('java says the run environment only runs Python and C++', () => {
    renderIt([code({ language: 'java', pipeline: 'one_shot' })]);
    expect(screen.getByText(/chấm bằng đọc mã, không chạy mã \(môi trường chạy bài chỉ chạy Python và C\+\+\)/)).toBeInTheDocument();
  });

  it('once results exist the select is disabled and says the path is fixed', () => {
    renderIt([code({ language: 'python', pipeline: 'investigator' })], true);
    expect(screen.getByRole('combobox')).toBeDisabled();
    expect(screen.getByText(/đã có kết quả chấm nên đường chấm đã cố định/)).toBeInTheDocument();
  });

  it('shows the server refusal verbatim', () => {
    state = { isPending: false, isError: true, error: new Error('Bài này đã có kết quả chấm, nên đường chấm đã cố định — không đổi ngôn ngữ được nữa.') };
    renderIt([code()]);
    expect(screen.getByRole('alert')).toHaveTextContent('nên đường chấm đã cố định');
  });

  it('is disabled while a request is in flight', () => {
    state = { isPending: true, isError: false, error: null };
    renderIt([code()]);
    expect(screen.getByRole('combobox')).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run to verify RED**

Run: `pnpm --filter web exec vitest run src/app/teacher/grading/_components/DeliverableLanguages.test.tsx`
Expected: FAIL — `Cannot find module './DeliverableLanguages'`.

- [ ] **Step 3: API function** — append to `lib/api/exam-session.ts` (after `getExamSession`):

```ts
/**
 * Khai ngôn ngữ của MỘT yêu cầu nộp code sau khi phiên đã tạo (G1 §3). 409 nếu phiên đã khoá chấm hoặc bài đã có
 * kết quả — câu của server hiện nguyên văn. `pipeline` trong kết quả do BACKEND tính.
 */
export async function declareDeliverableLanguage(
  examSessionId: string,
  deliverableId: string,
  language: DeclaredLanguage,
): Promise<{ id: string; language: DeclaredLanguage; pipeline: 'investigator' | 'one_shot' }> {
  const { data, error, response } = await apiClient.PATCH('/exam-sessions/{id}/deliverables/{deliverableId}', {
    params: { path: { id: examSessionId, deliverableId } },
    body: { language } as never,
  });
  await throwIfFailed(error, response);
  return data as unknown as { id: string; language: DeclaredLanguage; pipeline: 'investigator' | 'one_shot' };
}
```

It is a thin wrapper like the rest of `lib/api`; it is exercised by the real-API smoke in Task 15 rather than a mocked-client test.

- [ ] **Step 4: Hook** — in `hooks/useExamSession.ts` add `declareDeliverableLanguage` and `type DeclaredLanguage` to the `@/lib/api/exam-session` import, and append:

```ts
/**
 * Khai ngôn ngữ của MỘT yêu cầu nộp code (G1 §3). `onSettled`: một lượt bị từ chối (409: phiên đã khoá hay bài đã
 * có kết quả) cũng làm mới chi tiết phiên, để ô chọn không giữ một giá trị mà server vừa phản bác.
 */
export function useDeclareDeliverableLanguage(examSessionId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ deliverableId, language }: { deliverableId: string; language: DeclaredLanguage }) =>
      declareDeliverableLanguage(examSessionId!, deliverableId, language),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['exam-session', examSessionId] });
    },
  });
}
```

- [ ] **Step 5: Component**

`DeliverableLanguages.tsx`:

```tsx
'use client';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { useDeclareDeliverableLanguage } from '@/hooks/useExamSession';
import type { DeclaredLanguage, RequiredDeliverableResponse } from '@/lib/api/exam-session';

const LANGUAGES: { value: DeclaredLanguage; label: string }[] = [
  { value: 'python', label: 'Python' },
  { value: 'cpp', label: 'C++' },
  { value: 'java', label: 'Java' },
  { value: 'node', label: 'Node.js' },
];

/** Đường chấm của một yêu cầu nộp code, nói bằng lời. `pipeline` do backend tính — không suy ra từ `language`. */
function routeText(d: RequiredDeliverableResponse): string {
  if (d.pipeline === 'investigator') return 'Chấm trong môi trường chạy bài — cần gói test đã ghim.';
  if (d.language === null) {
    return 'Chưa khai — chấm bằng đọc mã, không chạy mã. Hệ thống không đoán ngôn ngữ từ đuôi file.';
  }
  return 'Chấm bằng đọc mã, không chạy mã (môi trường chạy bài chỉ chạy Python và C++).';
}

/**
 * Khai ngôn ngữ cho từng yêu cầu nộp code (G1 §3.5, spec UI §3.7). Ngôn ngữ quyết đường chấm của cả bài và khoá cùng
 * tài liệu chấm, nên khi phiên đã có kết quả thì ô bị khoá — lý do là dữ liệu thật (bài đã có dòng kết quả), và câu
 * từ chối của server vẫn hiện nguyên văn nếu vẫn bị từ chối.
 */
export function DeliverableLanguages({
  sessionId,
  deliverables,
  hasResults,
}: {
  sessionId: string;
  deliverables: RequiredDeliverableResponse[];
  /** Phiên đã có ít nhất một kết quả — đường chấm của các bài đã cố định. */
  hasResults: boolean;
}) {
  const declare = useDeclareDeliverableLanguage(sessionId);
  const code = deliverables.filter((d) => d.deliverableType === 'code_project');
  if (code.length === 0) return null;

  return (
    <section aria-label="Ngôn ngữ bài code" className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <h2 className="text-small font-semibold">Ngôn ngữ bài code</h2>
      <ul className="flex flex-col gap-3">
        {code.map((d) => (
          <li key={d.id} className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-mono text-small">{d.requiredFilename}</span>
              <label className="sr-only" htmlFor={`language-${d.id}`}>
                Ngôn ngữ của {d.requiredFilename}
              </label>
              <select
                id={`language-${d.id}`}
                value={d.language ?? ''}
                disabled={hasResults || declare.isPending}
                onChange={(e) => declare.mutate({ deliverableId: d.id, language: e.target.value as DeclaredLanguage })}
                className="h-9 rounded-md border border-border bg-surface px-2 text-small disabled:opacity-60"
              >
                {d.language === null && (
                  <option value="" disabled>
                    Chưa khai
                  </option>
                )}
                {LANGUAGES.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </select>
            </div>
            <p className="text-caption text-muted-foreground">
              {hasResults ? 'Bài này đã có kết quả chấm nên đường chấm đã cố định.' : routeText(d)}
            </p>
          </li>
        ))}
      </ul>
      {declare.isError && (
        <Alert variant="destructive">
          <AlertDescription>{declare.error.message}</AlertDescription>
        </Alert>
      )}
    </section>
  );
}
```

- [ ] **Step 6: Run to verify GREEN**

Run: `pnpm --filter web exec vitest run src/app/teacher/grading/_components/DeliverableLanguages.test.tsx`
Expected: PASS (9 tests).

- [ ] **Step 7: Typecheck, lint, commit**

`pnpm --filter web exec tsc --noEmit` (errors ⊆ baseline + Task 13's `PreparePanel.test.tsx` literals); `pnpm --filter web exec eslint src/lib/api/exam-session.ts src/hooks/useExamSession.ts src/app/teacher/grading/_components/DeliverableLanguages.tsx src/app/teacher/grading/_components/DeliverableLanguages.test.tsx`. Commit: `feat(web): declare a code deliverable's language on the prepare screen`.

---

### Task 13: Preflight counts code deliverables by the backend's `pipeline`

**Files:**
- Modify: `apps/web/src/lib/preflight.ts`, `apps/web/src/app/teacher/grading/_components/PreparePanel.tsx`
- Test: `apps/web/src/lib/preflight.test.ts`, `apps/web/src/app/teacher/grading/_components/PreparePanel.test.tsx`

**Interfaces:**
- Consumes: `RequiredDeliverableResponse` (Task 8), `DeliverableLanguages` (Task 12).
- Produces: `PreflightInput.deliverables: { deliverableType; language; pipeline }[]` replaces `hasCodeDeliverable: boolean`. The `language` row loses `needsBackend`.

- [ ] **Step 1: Update `preflight.test.ts`**

In `base()` replace `hasCodeDeliverable: false,` with `deliverables: [],`. Add at the top of the file `import type { PreflightInput } from './preflight';` is already imported — add a helper after `base`:

```ts
const codeDeliverable = (over: Partial<PreflightInput['deliverables'][number]> = {}): PreflightInput['deliverables'][number] => ({
  deliverableType: 'code_project', language: 'python', pipeline: 'investigator', ...over,
});
```

In `describe('test bundle (Gói test) …')`: replace `'not needed without a code deliverable'` and `'ok when a bundle is pinned'` and the `it.each` body's `hasCodeDeliverable: true` uses with the following (keep the `it.each` table):

```ts
    it('not needed without a code deliverable', () => {
      expect(row(base(), 'bundle')).toMatchObject({ status: 'ok' });
    });
    // G1 §3: the server only demands a bundle for investigator-path submissions, so the UI must not ask for more.
    it('not needed when every code deliverable is graded by reading', () => {
      const input = base({ deliverables: [codeDeliverable({ language: 'java', pipeline: 'one_shot' }), codeDeliverable({ language: null, pipeline: 'one_shot' })] });
      expect(row(input, 'bundle')).toMatchObject({ status: 'ok' });
      expect(preflightOf(input).canStart).toBe(true);
    });
    it('ok when a bundle is pinned', () => {
      expect(row(base({ deliverables: [codeDeliverable()], bundle: { pinned: true, total: 1, approved: 1 } }), 'bundle').status).toBe('ok');
    });
```

and inside the `it.each` change `base({ hasCodeDeliverable: true, bundle })` to `base({ deliverables: [codeDeliverable()], bundle })`.

Replace `describe('code language — the API does not return it yet', …)` with:

```ts
  describe('code language (G1 §3) — counted by the backend pipeline, never blocking', () => {
    it('no row without a code deliverable', () => {
      expect(preflightOf(base()).rows.some((r) => r.key === 'language')).toBe(false);
    });
    it('all run in the run environment → ok, no warning, no "cần backend"', () => {
      const r = row(base({ deliverables: [codeDeliverable(), codeDeliverable({ language: 'cpp' })], bundle: { pinned: true, total: 1, approved: 1 } }), 'language');
      expect(r.status).toBe('ok');
      expect(r.needsBackend).toBeUndefined();
      expect(r.text).toBe('2 bài code chạy trong môi trường chạy bài.');
    });
    it('some graded by reading → warns with the counts, and how many never declared a language', () => {
      const input = base({
        deliverables: [codeDeliverable(), codeDeliverable({ language: 'java', pipeline: 'one_shot' }), codeDeliverable({ language: null, pipeline: 'one_shot' })],
        bundle: { pinned: true, total: 1, approved: 1 },
      });
      const r = row(input, 'language');
      expect(r.status).toBe('warn');
      expect(r.text).toBe('1 bài code chạy trong môi trường chạy bài; 2 bài code chấm bằng đọc mã, không chạy (1 bài chưa khai ngôn ngữ).');
      expect(preflightOf(input).canStart).toBe(true);
    });
    it('documents and images are not counted as code', () => {
      const input = base({ deliverables: [{ deliverableType: 'document', language: null, pipeline: 'one_shot' }] });
      expect(preflightOf(input).rows.some((r) => r.key === 'language')).toBe(false);
    });
  });
```

- [ ] **Step 2: Update `PreparePanel.test.tsx`**

Add `vi.mock('./DeliverableLanguages', () => ({ DeliverableLanguages: () => <div data-testid="deliverable-languages" /> }));` next to the other `vi.mock('./…')` lines. In every code deliverable literal (`{ id: 'd', requiredFilename: 'a.zip', deliverableType: 'code_project', entries: [] }`, four places) add `language: 'python', pipeline: 'investigator'`; in the document literal in `detail()` add `language: null, pipeline: 'one_shot'`. Then add:

```tsx
  it('does not show the language picker for a session without a code deliverable', () => {
    renderPanel();
    expect(screen.queryByTestId('deliverable-languages')).not.toBeInTheDocument();
  });

  it('shows the language picker for a session with a code deliverable', () => {
    h.detail = detail({ requiredDeliverables: [{ id: 'd', requiredFilename: 'a.zip', deliverableType: 'code_project', entries: [], language: null, pipeline: 'one_shot' }] });
    renderPanel();
    expect(screen.getByTestId('deliverable-languages')).toBeInTheDocument();
  });

  // The server demands a pinned bundle only for investigator-path submissions (start-grading-test-bundle-guard).
  it('a code deliverable graded by reading does NOT block starting for want of a bundle', () => {
    h.detail = detail({ requiredDeliverables: [{ id: 'd', requiredFilename: 'a.zip', deliverableType: 'code_project', entries: [], language: 'java', pipeline: 'one_shot' }] });
    renderPanel();
    expect(startButton()).toBeEnabled();
  });
```

- [ ] **Step 3: Run to verify RED**

Run: `pnpm --filter web exec vitest run src/lib/preflight.test.ts src/app/teacher/grading/_components/PreparePanel.test.tsx`
Expected: FAIL — `preflightOf` still reads `hasCodeDeliverable`; the picker is not rendered.

- [ ] **Step 4: Implement `preflight.ts`**

- Add `import type { DeclaredLanguage } from './api/exam-session';`.
- In `PreflightInput` replace `/** Phiên có ít nhất một deliverable \`code_project\`. */ hasCodeDeliverable: boolean;` with:

```ts
  /** Mọi yêu cầu nộp của phiên. `pipeline` do BACKEND tính (`pipelineFor`) — không suy ra ở đây (G1 §3.3). */
  deliverables: {
    deliverableType: 'document' | 'code_project' | 'image';
    language: DeclaredLanguage | null;
    pipeline: 'investigator' | 'one_shot';
  }[];
```

- After destructuring (`const { rubric, readiness } = input;`) add:

```ts
  const codeDeliverables = input.deliverables.filter((d) => d.deliverableType === 'code_project');
  const investigators = codeDeliverables.filter((d) => d.pipeline === 'investigator');
  const readByReading = codeDeliverables.length - investigators.length;
  const undeclared = codeDeliverables.filter((d) => d.language === null).length;
```

- In the bundle block change `if (!input.hasCodeDeliverable) {` to `if (investigators.length === 0) {` and its text to `'Phiên không có bài code chạy trong môi trường chạy bài — không cần gói test.'` (keep `status: 'ok'`; keep the other two branches).
- Replace the whole `// Ngôn ngữ bài code — API chưa trả` block with:

```ts
  // Ngôn ngữ bài code — đếm theo đường chấm mà backend đã tính; không chặn (bài đọc mã vẫn chấm được)
  if (codeDeliverables.length > 0) {
    const parts: string[] = [];
    if (investigators.length > 0) parts.push(`${investigators.length} bài code chạy trong môi trường chạy bài`);
    if (readByReading > 0) {
      parts.push(
        `${readByReading} bài code chấm bằng đọc mã, không chạy${undeclared > 0 ? ` (${undeclared} bài chưa khai ngôn ngữ)` : ''}`,
      );
    }
    rows.push({
      key: 'language',
      label: 'Ngôn ngữ bài code',
      status: readByReading > 0 ? 'warn' : 'ok',
      text: `${parts.join('; ')}.`,
    });
  }
```

- [ ] **Step 5: Implement `PreparePanel.tsx`**

Import `DeliverableLanguages` from `./DeliverableLanguages`. Keep `const hasCode = …` (it still decides whether to show the bundle card and the picker, because the teacher may declare a language and turn a deliverable into an investigator one). Replace `hasCodeDeliverable: hasCode,` in the `preflightOf({…})` call with:

```tsx
    deliverables: deliverables.map((d) => ({ deliverableType: d.deliverableType, language: d.language, pipeline: d.pipeline })),
```

and, in the left column just above the `{hasCode && ( <section aria-label="Gói test" …` block, add:

```tsx
          <DeliverableLanguages sessionId={sessionId} deliverables={deliverables} hasResults={allUngradable} />
```

(`allUngradable` is exactly "the session has results and all of them are ungradable" — the only case in which this screen shows while results exist, so every code deliverable already has its result.)

- [ ] **Step 6: Run to verify GREEN**

Run: `pnpm --filter web exec vitest run src/lib/preflight.test.ts src/app/teacher/grading`
Expected: PASS.

- [ ] **Step 7: Typecheck (baseline must now match), lint, commit**

```bash
pnpm --filter web exec tsc --noEmit > "<scratchpad>/tsc-after.txt"
```
Expected: identical error set to `tsc-baseline.txt` (the `PreparePanel.test.tsx` literals are fixed). `pnpm --filter web exec eslint src/lib/preflight.ts src/lib/preflight.test.ts src/app/teacher/grading/_components/PreparePanel.tsx src/app/teacher/grading/_components/PreparePanel.test.tsx`. Commit: `feat(web): preflight counts code deliverables by the backend pipeline`.

---

### Task 14: The dossier of a code result graded by reading

**Files:**
- Modify: `apps/web/src/app/teacher/grading/[resultId]/page.tsx`
- Test: `apps/web/src/app/teacher/grading/[resultId]/page.test.tsx`

**Interfaces:**
- Consumes: `isReadingCode` (Task 9); `GradingResult.deliverableType`.
- Produces: nothing later tasks use.

- [ ] **Step 1: Write the failing tests**

In `page.test.tsx`, after `'bài đã chốt thì cảnh báo sẽ ghi nhật ký'` add:

```tsx
  // T-UI-19 / Review Focus 5. A code result on the legacy path has no run evidence to correct against; an essay does
  // (appeal path with an audit log). Only the first loses its edit button after finalizing.
  const codeByReading = (over: Partial<GradingResult> = {}) =>
    result({ pipeline: 'one_shot', deliverableType: 'code_project', deliverableLanguage: 'java', ...over });

  it('bài code chấm bằng đọc mã: có nhãn, và chưa chốt thì vẫn duyệt được', async () => {
    resultsData = [codeByReading()];
    await page();
    expect(screen.getByText('Chấm bằng đọc mã, không chạy')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lưu duyệt' })).toBeInTheDocument();
  });

  it('bài code chấm bằng đọc mã đã chốt: KHÔNG còn nút sửa nào và nói vì sao', async () => {
    resultsData = [codeByReading({ status: 'finalized', finalScore: 4 })];
    await page();
    expect(screen.queryByRole('button', { name: /Lưu/ })).not.toBeInTheDocument();
    expect(screen.getByText(/không sửa được/)).toBeInTheDocument();
    // The "changes will be logged" warning would contradict the missing button.
    expect(screen.queryByText(/sẽ được ghi vào nhật ký/)).not.toBeInTheDocument();
  });

  it('bài tự luận đã chốt vẫn sửa được và ghi nhật ký (không đổi)', async () => {
    resultsData = [result({ status: 'finalized', finalScore: 4, deliverableType: 'document' })];
    await page();
    expect(screen.getByRole('button', { name: /Lưu và ghi nhật ký/ })).toBeInTheDocument();
    expect(screen.queryByText('Chấm bằng đọc mã, không chạy')).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run to verify RED**

Run: `pnpm --filter web exec vitest run "src/app/teacher/grading/[resultId]/page.test.tsx"`
Expected: FAIL — no badge; the finalized code result still shows `Lưu và ghi nhật ký`.

- [ ] **Step 3: Implement**

In `page.tsx`: add `import { isReadingCode } from '@/lib/session-triage';`. After `const published = PUBLISHED.includes(result.status);` add:

```tsx
  const readsCode = isReadingCode(result);
  // Bài code chấm bằng đọc mã, đã chốt: không có bằng chứng chạy nào để sửa theo (T-UI-19) — không nút sửa nào.
  // Bài tự luận đã chốt thì KHÁC: sửa sau chốt là đường khiếu nại và có nhật ký.
  const frozen = readOnly || (published && readsCode);
```

Then replace `readOnly` with `frozen` in exactly these four places: `onPin={readOnly ? undefined : pinEvidence}`; the `{!readOnly && ( <p className="mt-3 border-l-2 …` hint; the `{!readOnly && ( <div className="sticky bottom-0 …` footer with the save button; and the `{!readOnly && ( <Card> … Ghi chú` block. Leave the `{readOnly && ( <Alert variant="info"> AI đang chấm …` alert on `readOnly`.

In the header's badge row (`<div className="flex flex-wrap items-center gap-2">`) add as first child:

```tsx
          {readsCode && <Badge variant="info">Chấm bằng đọc mã, không chạy</Badge>}
```

After the `readOnly` alert add:

```tsx
      {readsCode && (
        <Alert variant="info">
          <AlertDescription>
            Bài code này chấm bằng đọc mã, không chạy: không có độ phủ hay bằng chứng lời gọi công cụ.
            {published && ' Điểm đã chốt — hồ sơ chỉ để xem, không sửa được.'}
          </AlertDescription>
        </Alert>
      )}
```

and change `{published && ( <Alert variant="warning"> … sẽ được ghi vào nhật ký` to `{published && !frozen && (`.

- [ ] **Step 4: Run to verify GREEN**

Run: `pnpm --filter web exec vitest run "src/app/teacher/grading/[resultId]"`
Expected: PASS (existing tests included).

- [ ] **Step 5: Lint, commit**

`pnpm --filter web exec eslint "src/app/teacher/grading/[resultId]/page.tsx"`. GitNexus `detect_changes()`. Commit: `feat(web): label code results graded by reading and freeze them after finalize`.

---

### Task 15: Whole-branch verification, real-API smoke, review

**Files:** none (a throwaway smoke script lives outside the repo).

- [ ] **Step 1: Web regression**

```bash
cd "C:/Users/Admin/Main/Desktop/HKI 2026-2027/KLTN/CINE/.claude/worktrees/grading-ui-rebuild"
pnpm --filter web test
pnpm --filter web exec tsc --noEmit
pnpm --filter web exec eslint src
rm -rf apps/web/.next && pnpm --filter web build
```
Expected: all green; tsc = baseline only; eslint 0 errors; build OK (`rm -rf .next` first — stale `.next/types` break tsc after routes change).

- [ ] **Step 2: Backend regression (repeat, now with everything in)**

`pnpm --filter api exec jest`, `pnpm check:cycles`, `pnpm --filter api build`, and the e2e list from Task 7 Step 3.

- [ ] **Step 3: Real-API smoke (fresh seed, demo data untouched)**

Start the built API with `DOTENV_CONFIG_PATH=.env.test node -r dotenv/config dist/src/main.js` (background). In a throwaway Node script (scratchpad, not the repo) using `fetch` + a freshly created teacher and session — reuse the login/seed approach of `test/helpers/*` via SQL — verify each, and record the outputs in the ledger:

1. `PATCH …/deliverables/:id {language:'python'}` → `200 {…, pipeline:'investigator'}`; `GET /exam-sessions/:id` shows the same `language` and `pipeline`; after `POST …/start-grading`, the same PATCH → `409` with the "khoá" message.
2. On a seeded investigator result with a refuted error: `POST /grading-results/:id/error-exceptions {direction:'exclude'}` then `{direction:'include'}` → `GET /grading-results/:id/investigation` shows `counted` going `refuted → excluded → counted`, `currentScore` changing accordingly, no `refuted` flag left.
3. `GET /exam-sessions/:id/grading-results`: a needs-you investigator row has `triage` with `errorFlags`/`counts`; an essay row has `triage: null` and `deliverableType: 'document'`; a `java` code row has `deliverableLanguage: 'java'`, `pipeline: 'one_shot'`.
4. `GET /rubrics` rows carry `createdAt`.

Stop the API afterwards (`TaskStop`). Any surprise becomes a `Ruling:` and, if it is a real defect, a fix with a test — as Plan C's smoke did.

- [ ] **Step 4: Ledger and memory**

Update the ledger with the final state. Update memory `grading-ui-rebuild-2026-09-29.md` (and the `MEMORY.md` line) to say G1 is implemented on `feat/grading-gaps-g1-g5`, listing anything the smoke found.

- [ ] **Step 5: Code review — required before reporting done (CLAUDE.md HANDOFF rule)**

Dispatch the `code-reviewer` agent on the whole branch diff against `feat/grading-ui-rebuild` (`git diff feat/grading-ui-rebuild...HEAD`), giving it the spec, this plan and the ledger. Fix every Critical/Important finding, re-run the affected tests, and re-review until the **VERDICT is PASS**. Do not report "done" without it.

- [ ] **Step 6: Report**

Tell the user, in Vietnamese: what changed, the smoke results, the reviewer's VERDICT, and that nothing was pushed. Ask whether to push and open a PR stacked on `feat/grading-ui-rebuild`. Then hand back for G3's brainstorming.
