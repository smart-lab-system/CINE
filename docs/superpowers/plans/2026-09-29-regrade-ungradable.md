# G3 — Chấm lại bài không chấm được — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Every task is TDD: write the failing test, watch it fail **for the right reason**, implement, watch it pass, typecheck, lint the touched files, commit.

**Goal:** Let a teacher re-run grading for results that stopped because of a **system** failure (AI service down, run environment down), one at a time or for a whole session, without ever re-grading a result that already has a score and without pretending a **submission**-class failure can be retried. The buttons that were `disabled` + *cần backend* in four places become real, behind a confirmation that says what it costs.

**Architecture:** (1) `regradeRefusal` — a pure function fixing the *order* of the refusal checks. (2) `GradingResultView` gains `ungradableClass`, so the web can tell the two classes apart. (3) `RegradeService`: one conditional UPDATE (`flagged_for_review → ai_grading`, clearing the class and reason **in the same statement**, under the teacher's scoring lock), then a queue job under `grade-<submissionId>` — after removing a stale `completed`/`failed` job that would otherwise make BullMQ ignore the add. (4) Two routes in a new controller. (5) Web: one `RegradeButton` (confirmation + call + outcome) used in `SessionHeader`, `RunningPanel`, `UngradableView` and a new `AiServiceBand`; pure helpers count only `system`-class results.

**Tech Stack:** NestJS 11 + TypeORM (QueryBuilder for the conditional UPDATE) + BullMQ 6.3.4 + Jest (unit `*.spec.ts`, e2e `test/*.e2e-spec.ts`, serial, local Postgres:5442 / Redis:6390 / MinIO:9010 via `.env.test`); Next.js 15 + TanStack Query + Vitest/RTL; `openapi-fetch` client generated into `packages/shared`.

**Spec:** `docs/superpowers/specs/2026-09-29-regrade-ungradable-design.md` (revision 2). Parent specs: `2026-09-20-grading-agent-investigator-design.md` (§2.3 rules 1-8, §4.4), `2026-09-23-grading-ui-rebuild-design.md` (§2.3, §3.3, §3.4, §3.8).

## Decisions to veto at plan review

1. **Regrading clears `ungradable_class` and `ungradable_reason` in the same UPDATE.** Not optional: `ck_grading_result_ungradable` forbids a class together with a score, and the one-shot path (`gradeOneShot`) never clears it, so keeping the class makes the first score write fail with a 500. The UPDATE is written with QueryBuilder inside `RegradeService` rather than `advanceStatus`, whose `AdvanceExtra` cannot set those columns.
2. **A stale finished job is removed before re-adding.** BullMQ keeps `completed` jobs for 24 h (`removeOnComplete.age`), and `queue.add` with an existing `jobId` is silently ignored — the result would sit in `ai_grading` with no job, and `regradeStuck` would not rescue it (it skips any job that is not `failed`). A *live* job (`active`, `waiting`, …) is left alone and counts as re-queued.
3. **"Chấm lại N bài lỗi hệ thống" now counts only `system`-class results, and needs the API to say which class each is.** A result without `ungradableClass` (old API) is **not counted** — the button disappears rather than showing a number that may be wrong.
4. **No per-row button in `ResultsTable`** (the brief suggested one). The row already opens the dossier, which has the button, and G4 edits the same component.
5. **The "Dịch vụ AI lỗi" band measures *same reason*, not *short time window*.** The list carries no time of stopping, so a window cannot be measured. The band says so on screen.
6. **Regrading costs money and has no cost estimate here.** The confirmation states the count, that each result is a billable model call, and that closing the page does not stop the work. An actual estimate is out of scope.

## Global Constraints

- **Branch:** `feat/grading-g3-regrade`, branched from `feat/grading-gaps-g1-g5`. Do **not** push, open a PR, or merge without the user.
- **Work from the worktree** `C:\Users\Admin\Main\Desktop\HKI 2026-2027\KLTN\CINE\.claude\worktrees\grading-g3-regrade`; the shell cwd resets between calls — `cd` in every command. Do not `cd` to the original repo root.
- **Per-package infrastructure** (from `docs/superpowers/plans/2026-09-29-g2-g5-parallel-execution.md`): database `examcollect_g3`, `REDIS_DB=13`, `PORT=4003`. **No migration in this package** (the range `1789510000000` stays empty). `apps/api/.env.test` is locked with `git update-index --skip-worktree apps/api/.env.test` and edited to `DATABASE_URL=…:5442/examcollect_g3` + `REDIS_DB=13`. **The `examcollect` schema is created by `docker/postgres-init/001-create-schema.sql`, not by any migration** — run `psql -h localhost -p 5442 -U <user from .env.test> -d examcollect_g3 -c "CREATE SCHEMA IF NOT EXISTS examcollect"` once, then `DATABASE_URL=<same as .env.test> DATABASE_SSL=false pnpm --filter api migration:run`. Never run migrations, e2e or the API against `apps/api/.env` (points at the remote Supabase database). Docker Desktop must be running.
- **CLAUDE.md:** run GitNexus `impact` on a symbol **before** editing it (`repo` = the absolute path `C:\Users\Admin\Main\Desktop\HKI 2026-2027\KLTN\CINE` — two repos share the name); report HIGH/CRITICAL risk to the user **before** editing; run `detect_changes()` before every commit. The index may be stale — confirm with grep.
- **e2e suite runs serially** (`maxWorkers: 1`); never raise it. Kill stray `node`/`jest` workers from other sessions first (they eat BullMQ jobs from a shared Redis).
- **A real BullMQ worker runs inside every e2e app** (`GradingProcessor`). Route tests therefore `jest.spyOn` the real queue's `add`/`getJob` so nothing is ever enqueued for it; only Task 4 Step 5 uses the real queue, and it pauses it first.
- **Do not edit** `ResultsTable.tsx`, `FinalizePanel.tsx`, `grading-run.service.ts`, `lifecycle/advance.ts`, `exam-session-response.dto.ts`. Existing tests that must change are listed per task (spec §3); never weaken an assertion to make it pass.
- **Naming:** `grading-regrade.spec.ts` is the *internal* single retry when ≥ 50 % of evidence is unverified (T-G2-1b). It is unrelated. New files here use `regrade.*`; keep the two concepts apart in comments.
- **Copy is Vietnamese.** *môi trường chạy bài* (never "sandbox"), *không chấm được*. Every mutation error renders the server's message **verbatim** in a destructive `Alert`.
- **A control with no backing route stays `disabled` + `<NeedsBackend />` and sends no request.** This plan removes that treatment only from the four regrade controls. The *"Đang chạy ngay lúc này"* block (`RunningPanel.tsx:175`) and the three `PreparePanel` buttons keep it.
- **Commits:** write the message to a file with the Write tool, then `git commit -F <file>`; it ends with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. PowerShell 5.1 splits inline multi-line `-m`; the bash tool mangles backticks — patch scripts go in the scratchpad and run with `node file`.
- **Tests:** `pnpm --filter api exec jest <path>`, `pnpm --filter api exec jest --config ./test/jest-e2e.json <path>`, `pnpm --filter web exec vitest run <path>`, `pnpm --filter web exec tsc --noEmit`. Known unrelated tsc noise on the base branch: 7 lines, all in `src/lib/read-workbook.test.ts`.
- **Indentation of code blocks in this plan:** blocks inside numbered steps may carry two extra leading spaces from the list. Match the file's real indentation (2 spaces per level). When an Edit anchor fails on whitespace, re-read the file and copy its exact text — never loosen the anchor into a fuzzy match.
- **Ledger:** `.superpowers/sdd/2026-09-29-regrade-ungradable/progress.md` (gitignored); record a `Ruling:` line for every deviation from this plan.

## Review Focus

Inputs and conditions the obvious tests would not exercise. Each is pinned by a test in the task that owns the code.

1. **Regrading a one-shot result must clear the class and reason in the same UPDATE.** Otherwise the first score write violates `ck_grading_result_ungradable`. → Task 3 (test 2, a mutation check through `scoreResult`).
2. **Pressing the button twice** must answer *"đang được chấm"* the second time, not *"bài làm không đọc được"* (the row already has class `NULL`, so a class-first check lies). → Task 1 (ordering) and Task 3 (test 6).
3. **A `completed` job with the same `jobId` still in Redis** must be removed, or the add is silently ignored and the result is stuck. → Task 4 (fake-queue tests and one real-Redis proof).
4. **Filtering a session regrade by reason must not pull in a `submission`-class result that happens to carry the same reason text**, nor one that already has a score. → Task 5.
5. **A result whose class the API did not send** is not counted and produces no button. → Task 8 (helpers) and Task 10 (page).
6. **Investigator path end to end:** after regrading, the second attempt has `attempt_no = 2`, the score is written and the class is `NULL`. → Task 6.

7. **Regrading locks the session ruler (rule 6) and the confirm dialog does not say so.** Found when the plan was run: a result moved to `ai_grading` makes `GRADING_LOCKED_SQL` refuse edits to the exam, answer, test bundle and rubric until that result has a score or stops again. Not fixed here (out of scope); spec §8 item 4. A reviewer should decide whether `RegradeButton` must warn.

Not changed, recorded so nobody thinks it was missed: regrading a result that **has** a score is refused (400) — the only route is a manual score with an audit-log entry (spec §1.2/§2.2).

---

## File Structure

**Backend (`apps/api`)**
- Create `src/grading/regrade.service.ts` + `regrade.service.spec.ts` — `regradeRefusal` (pure), `RegradeService`.
- Create `src/grading/regrade.controller.ts`, `src/grading/dto/regrade-ungradable.dto.ts`.
- Modify `src/grading/grading.module.ts` — `RegradeController` into `controllers`, `RegradeService` into `providers`.
- Modify `src/grading/grading.service.ts` — `ungradableClass` on `GradingResultView` and in `listForSession`.
- Tests: create `test/regrade.e2e-spec.ts`, `test/regrade-loop.e2e-spec.ts`, `test/regrade-real-queue.e2e-spec.ts`; modify `test/grading-results-triage.e2e-spec.ts`.

**Web (`apps/web/src`)**
- Modify `lib/api/grading.ts` — `GradingResult.ungradableClass?`.
- Create `lib/api/regrade.ts`, `hooks/useRegrade.ts`, `lib/regrade-triage.ts` (+ test).
- Create `app/teacher/grading/_components/RegradeButton.tsx` (+ test), `AiServiceBand.tsx` (+ test).
- Modify `_components/SessionHeader.tsx`, `_components/RunningPanel.tsx` (+ test), `page.tsx` (+ test), `[resultId]/_components/investigator/UngradableView.tsx` (+ test), `InvestigatorDossier.tsx` (+ test).
- Regenerate `packages/shared/src/api/schema.d.ts` (Task 7, **after** both routes exist).

## Parallel execution

- Branch `feat/grading-g3-regrade` · worktree `grading-g3-regrade` · database `examcollect_g3` · `REDIS_DB=13` · `PORT=4003` · no migration.

### Shared-file touch points

Additive only; each is shared with another stream.

| File | G3 adds (exact anchor) | Who else touches it |
|---|---|---|
| `apps/api/src/grading/grading.module.ts` | `RegradeController` at the end of `controllers: [GradingController, RulesController, TestBundleController]` (line 135); `RegradeService` after `DeliverableLanguageService,` in `providers` (line 140) | G2 adds `TestBundleService` to `exports` (line 188) |
| `apps/api/src/grading/grading.service.ts` | one line after `ungradableReason: string | null;` (interface, ~852) and one after `ungradableReason: entity.ungradableReason,` (mapping, ~785) | G4 changes the *values* of score fields in the same mapping |
| `apps/web/src/app/teacher/grading/page.tsx` | `systemFailed` prop expression (line 114); `sessionId` prop on `<RunningPanel>`; `<AiServiceBand … />` on the line **before** `{loading ? (` (line 125) | G2: one line right after `<SessionHeader />`; stream S: the `!sessionId` branch (lines 47-49) |
| `apps/web/src/app/teacher/grading/_components/SessionHeader.tsx` | replaces the disabled regrade button (lines 55-60) | S adds `BackToListLink` elsewhere in the same file |
| `apps/web/src/app/teacher/grading/[resultId]/_components/investigator/InvestigatorDossier.tsx` | `sameReasonCount` + three props on `<UngradableView>` in the `d.ungradableClass && !handGraded` branch (lines 116-129) | G2: one line in the **final** return (line 133) |
| `packages/shared/src/api/schema.d.ts` | regenerated in Task 7 | regenerated again by G2/G4/G5 — take the union when merging |

Nothing else in this plan is shared. `regrade.*`, `RegradeButton.tsx`, `AiServiceBand.tsx`, `lib/api/regrade.ts`, `hooks/useRegrade.ts`, `lib/regrade-triage.ts` are G3-exclusive.

---

### Task 1: `regradeRefusal` — the order of the checks, as a pure function

**Files:** create `apps/api/src/grading/regrade.service.ts` (types + the pure function only, for now), `apps/api/src/grading/regrade.service.spec.ts`.

**Interfaces**
- Consumes: `GradingResultStatus` (`entities/grading-result.entity.ts:9`), `UngradableClass` (`grading-model.types.ts:10`).
- Produces: `RegradeSkip`, `RegradeOutcome`, `RegradeRefusal`, `regradeRefusal(row): RegradeRefusal | null`, and the constant messages `REGRADE_MESSAGES`.

- [ ] **Step 1: RED — the spec.** Create `apps/api/src/grading/regrade.service.spec.ts`:

  ```ts
  import { regradeRefusal, REGRADE_MESSAGES } from './regrade.service';

  const row = (over: Partial<Parameters<typeof regradeRefusal>[0]> = {}) => ({
    status: 'flagged_for_review' as const,
    aiTotalScore: null as string | null,
    ungradableClass: 'system' as 'system' | 'submission' | null,
    ...over,
  });

  describe('regradeRefusal (G3 §4.1) — nothing here needs a database', () => {
    it('a system-class result with no score is allowed', () => {
      expect(regradeRefusal(row())).toBeNull();
    });

    // Review Focus #2: pressing the button twice. The second time the row is already back in
    // `ai_grading` and its class is NULL — checking the class first would say the submission
    // was unreadable, which is a lie. The status check must come first.
    it('a result already being graded is in_progress (409) even though its class is now NULL', () => {
      expect(regradeRefusal(row({ status: 'ai_grading', ungradableClass: null }))).toEqual({
        code: 'in_progress',
        status: 409,
        message: REGRADE_MESSAGES.in_progress,
      });
    });

    it('ai_graded counts as being graded', () => {
      expect(regradeRefusal(row({ status: 'ai_graded', ungradableClass: null }))?.code).toBe('in_progress');
    });

    it('a flagged result that carries a score has_score (400)', () => {
      expect(regradeRefusal(row({ aiTotalScore: '7.00' }))).toEqual({
        code: 'has_score',
        status: 400,
        message: REGRADE_MESSAGES.has_score,
      });
    });

    it.each(['auto_approved', 'audit_pending', 'teacher_reviewed', 'finalized', 'exported'] as const)(
      'a %s result already has a result (400)',
      (status) => {
        expect(regradeRefusal(row({ status, ungradableClass: null }))?.code).toBe('has_score');
      },
    );

    it('a submission-class result says the only way is grading by hand (400)', () => {
      const refusal = regradeRefusal(row({ ungradableClass: 'submission' }));
      expect(refusal).toMatchObject({ code: 'submission_class', status: 400 });
      expect(refusal?.message).toContain('lối duy nhất là chấm tay');
    });

    it('flagged, no score and no class is not an ungradable result (400)', () => {
      expect(regradeRefusal(row({ ungradableClass: null }))?.code).toBe('not_ungradable');
    });

    it('the messages are the ones the spec fixes, word for word', () => {
      expect(REGRADE_MESSAGES).toEqual({
        in_progress: 'Bài này đang được chấm — chưa cần chấm lại.',
        has_score:
          'Bài này đã có kết quả — chấm lại là đổi thước sau khi đã đo. Nếu điểm chưa đúng, hãy chấm tay: thao tác đó có ghi nhật ký.',
        submission_class:
          'Bài này không chấm được vì bài làm không đọc được — chấm lại sẽ ra đúng kết quả cũ, nên lối duy nhất là chấm tay.',
        not_ungradable: 'Bài này không ở trạng thái không chấm được.',
      });
    });
  });
  ```

  ```bash
  pnpm --filter api exec jest src/grading/regrade.service.spec.ts
  ```

  Expected: **RED** — `Cannot find module './regrade.service'`.

- [ ] **Step 2: GREEN.** Create `apps/api/src/grading/regrade.service.ts`:

  ```ts
  import type { GradingResultStatus } from './entities/grading-result.entity';
  import type { UngradableClass } from './grading-model.types';

  /**
   * Chấm lại bài KHÔNG CHẤM ĐƯỢC do lỗi hệ thống (spec §2.3).
   *
   * Không nhầm với `grading-regrade.spec.ts`: file đó nói về lần chấm lại NỘI BỘ đúng một lần khi ≥ 50% dẫn
   * chứng không kiểm chứng được (T-G2-1b). Ở đây là giảng viên bấm nút, cho bài chưa có điểm nào.
   */
  export interface RegradeSkip {
    resultId: string;
    /** Câu tiếng Việt để hiện thẳng cho giảng viên — không phải mã lỗi. */
    reason: string;
  }

  export interface RegradeOutcome {
    requeued: number;
    skipped: RegradeSkip[];
  }

  export const REGRADE_MESSAGES = {
    in_progress: 'Bài này đang được chấm — chưa cần chấm lại.',
    has_score:
      'Bài này đã có kết quả — chấm lại là đổi thước sau khi đã đo. Nếu điểm chưa đúng, hãy chấm tay: thao tác đó có ghi nhật ký.',
    submission_class:
      'Bài này không chấm được vì bài làm không đọc được — chấm lại sẽ ra đúng kết quả cũ, nên lối duy nhất là chấm tay.',
    not_ungradable: 'Bài này không ở trạng thái không chấm được.',
  } as const;

  export type RegradeRefusal =
    | { code: 'in_progress'; status: 409; message: string }
    | { code: 'has_score'; status: 400; message: string }
    | { code: 'submission_class'; status: 400; message: string }
    | { code: 'not_ungradable'; status: 400; message: string };

  /**
   * Bài này có được chấm lại không — và nếu không thì vì sao.
   *
   * Hàm THUẦN vì thứ tự kiểm là thứ dễ hỏng nhất ở đây: bấm hai lần thì lần hai bài đã ở `ai_grading` với lớp
   * lý do là NULL; kiểm "lớp ≠ system" TRƯỚC sẽ trả "bài làm không đọc được" — một lời nói dối. Trạng thái
   * phải đi trước, rồi điểm, rồi lớp.
   */
  export function regradeRefusal(row: {
    status: GradingResultStatus;
    aiTotalScore: string | null;
    ungradableClass: UngradableClass | null;
  }): RegradeRefusal | null {
    if (row.status === 'ai_grading' || row.status === 'ai_graded') {
      return { code: 'in_progress', status: 409, message: REGRADE_MESSAGES.in_progress };
    }
    if (row.status !== 'flagged_for_review' || row.aiTotalScore !== null) {
      return { code: 'has_score', status: 400, message: REGRADE_MESSAGES.has_score };
    }
    if (row.ungradableClass === 'submission') {
      return { code: 'submission_class', status: 400, message: REGRADE_MESSAGES.submission_class };
    }
    if (row.ungradableClass !== 'system') {
      return { code: 'not_ungradable', status: 400, message: REGRADE_MESSAGES.not_ungradable };
    }
    return null;
  }
  ```

  ```bash
  pnpm --filter api exec jest src/grading/regrade.service.spec.ts
  pnpm --filter api exec tsc --noEmit
  ```

  Expected: 12 passed (the `it.each` expands to 5); `tsc` clean.

- [ ] **Step 3: commit.** Title: `feat(regrade): regradeRefusal — thứ tự kiểm trạng thái, điểm, lớp là một hàm thuần`.

---

### Task 2: the list carries `ungradableClass`

**Files:** `apps/api/src/grading/grading.service.ts`, `apps/api/test/grading-results-triage.e2e-spec.ts` (modify).

**Interfaces**
- Consumes: `GradingResultEntity.ungradableClass` (`entities/grading-result.entity.ts:169-170`).
- Produces: `GradingResultView.ungradableClass: 'system' | 'submission' | null`, placed right after `ungradableReason`.

- [ ] **Step 1: RED.** In `test/grading-results-triage.e2e-spec.ts` change the import line

  ```ts
  import { seedResult, seedSession } from './helpers/grading-seed';
  ```

  to

  ```ts
  import { forceStatus, seedResult, seedSession } from './helpers/grading-seed';
  ```

  and append inside the `describe` (after the last `it`):

  ```ts
    it('G3 §4.3: mỗi dòng mang ungradableClass — system, submission, hoặc null khi bài không dừng', async () => {
      const ctx = await seedSession(ds, 'triage-class');
      const system = await seedResult(ds, ctx, 'one_shot');
      const submission = await seedResult(ds, ctx, 'one_shot');
      const running = await seedResult(ds, ctx, 'one_shot');
      await forceStatus(ds, system.resultId, 'flagged_for_review', {
        ungradable_class: 'system', ungradable_reason: 'Dịch vụ AI không phản hồi.', confidence: 0,
      });
      await forceStatus(ds, submission.resultId, 'flagged_for_review', {
        ungradable_class: 'submission', ungradable_reason: 'Bài nộp là file rỗng.', confidence: 0,
      });

      expect(await rowOf(ctx.sessionId, system.resultId)).toMatchObject({
        ungradableReason: 'Dịch vụ AI không phản hồi.', ungradableClass: 'system',
      });
      expect(await rowOf(ctx.sessionId, submission.resultId)).toMatchObject({
        ungradableReason: 'Bài nộp là file rỗng.', ungradableClass: 'submission',
      });
      expect((await rowOf(ctx.sessionId, running.resultId)).ungradableClass).toBeNull();
    });
  ```

  ```bash
  pnpm --filter api exec jest --config ./test/jest-e2e.json test/grading-results-triage.e2e-spec.ts
  ```

  Expected: **RED** — `Property 'ungradableClass' does not exist on type 'GradingResultView'` (ts-jest) or `undefined` received.

- [ ] **Step 2: GREEN.** In `grading.service.ts` replace exactly

  ```ts
    ungradableReason: string | null;
    criterionResults: unknown[];
  ```

  with

  ```ts
    ungradableReason: string | null;
    /**
     * Lớp lý do không chấm được (§4.4): `system` chấm lại được, `submission` thì không. `null` khi bài không
     * dừng. Đặt ngay sau `ungradableReason` — G3 là gói DUY NHẤT thêm trường vào view này.
     */
    ungradableClass: 'system' | 'submission' | null;
    criterionResults: unknown[];
  ```

  and replace exactly

  ```ts
          ungradableReason: entity.ungradableReason,
          criterionResults: entity.criterionResults,
  ```

  with

  ```ts
          ungradableReason: entity.ungradableReason,
          ungradableClass: entity.ungradableClass ?? null,
          criterionResults: entity.criterionResults,
  ```

  ```bash
  pnpm --filter api exec jest --config ./test/jest-e2e.json test/grading-results-triage.e2e-spec.ts test/grading.e2e-spec.ts
  pnpm --filter api exec tsc --noEmit
  ```

  Expected: green; `tsc` clean. (If `tsc` reports a place that builds a `GradingResultView` literal, add the field there — do not make it optional.)

- [ ] **Step 3: commit.** Title: `feat(grading): danh sách kết quả mang ungradableClass`.

---

### Task 3: regrade one result — service, route, module

**Files:** `apps/api/src/grading/regrade.service.ts` (extend), create `apps/api/src/grading/regrade.controller.ts`, modify `apps/api/src/grading/grading.module.ts`, create `apps/api/test/regrade.e2e-spec.ts`.

**Interfaces**
- Consumes: `regradeRefusal`, `RegradeOutcome` (Task 1); `lockTeacherScoring(m, teacherId)` (`scoring/score-inputs.ts:17`); `GRADE_JOB_OPTIONS`, `GRADING_QUEUE`, `GradeSubmissionJob` (`grading.queue.ts`); `GradingService.findResultForOwner(id, teacherId)` (`grading.service.ts:661`, 404 unknown / 403 not owner).
- Produces: `RegradeService.regradeOne(teacherId: string, resultId: string): Promise<RegradeOutcome>`; `POST /grading-results/:id/regrade` → 201 `RegradeOutcome`.

This task enqueues **naively** (`queue.add` only). Handling a stale finished job is Task 4's RED — do not add it here.

- [ ] **Step 1: RED — the e2e file.** Create `apps/api/test/regrade.e2e-spec.ts`:

  ```ts
  import { randomUUID } from 'node:crypto';
  import { getQueueToken } from '@nestjs/bullmq';
  import { INestApplication, ValidationPipe } from '@nestjs/common';
  import { Test } from '@nestjs/testing';
  import type { Queue } from 'bullmq';
  import request from 'supertest';
  import { DataSource } from 'typeorm';
  import { AppModule } from '../src/app.module';
  import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
  import { GRADING_QUEUE } from '../src/grading/grading.queue';
  import { createTestAccount } from './helpers/create-account';
  import { forceStatus, scoreResult, seedResult, seedSession, type SeedSession } from './helpers/grading-seed';

  /**
   * G3 — chấm lại bài không chấm được. Hàng đợi THẬT có worker thật, nên `add`/`getJob` được `spyOn`:
   * không job nào tới tay worker, và trạng thái DB sau lời gọi đúng là thứ route vừa ghi.
   */
  describe('Chấm lại bài không chấm được (e2e, hàng đợi bị spy)', () => {
    let app: INestApplication;
    let ds: DataSource;
    let queue: Queue;
    let add: jest.SpyInstance;
    let getJob: jest.SpyInstance;
    const stamp = Date.now();

    async function login(label: string): Promise<{ id: string; token: string }> {
      const email = `regrade_${label}_${stamp}@example.com`;
      const id = await createTestAccount(ds, { email, password: 'correct-horse-battery', role: 'teacher' });
      const res = await request(app.getHttpServer()).post('/auth/login').send({ email, password: 'correct-horse-battery' });
      return { id, token: res.body.accessToken as string };
    }
    const as = (token: string) => ({ Authorization: `Bearer ${token}` });

    /** Một bài tự luận đã dừng: lớp và lý do do test chọn. */
    async function ungradable(ctx: SeedSession, kind: 'system' | 'submission', reason = 'Dịch vụ AI không phản hồi.') {
      const made = await seedResult(ds, ctx, 'one_shot');
      await forceStatus(ds, made.resultId, 'flagged_for_review', {
        ungradable_class: kind, ungradable_reason: reason, confidence: 0,
      });
      return made;
    }
    const rowOf = async (resultId: string) =>
      (await ds.query(
        `SELECT status, ungradable_class, ungradable_reason, ai_total_score FROM examcollect.grading_result WHERE id = $1`,
        [resultId],
      ))[0];
    const regrade = (token: string, resultId: string) =>
      request(app.getHttpServer()).post(`/grading-results/${resultId}/regrade`).set(as(token));

    beforeAll(async () => {
      const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
      app = moduleRef.createNestApplication();
      app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
      app.useGlobalFilters(new PostgresExceptionFilter());
      await app.init();
      ds = app.get(DataSource);
      queue = app.get<Queue>(getQueueToken(GRADING_QUEUE));
    }, 60_000);
    afterAll(async () => app.close());

    beforeEach(() => {
      add = jest.spyOn(queue, 'add').mockResolvedValue({ id: 'gia' } as never);
      getJob = jest.spyOn(queue, 'getJob').mockResolvedValue(undefined as never);
    });
    afterEach(() => jest.restoreAllMocks());

    it('bài lớp system → về ai_grading, lớp và lý do đã xoá, job xếp đúng jobId', async () => {
      const owner = await login('a1');
      const ctx = await seedSession(ds, 'regrade-a1', { teacherId: owner.id });
      const made = await ungradable(ctx, 'system');

      const res = await regrade(owner.token, made.resultId);

      expect(res.status).toBe(201);
      expect(res.body).toEqual({ requeued: 1, skipped: [] });
      expect(await rowOf(made.resultId)).toMatchObject({
        status: 'ai_grading', ungradable_class: null, ungradable_reason: null, ai_total_score: null,
      });
      expect(add).toHaveBeenCalledTimes(1);
      expect(add).toHaveBeenCalledWith(
        'grade-submission',
        expect.objectContaining({
          submissionId: made.submissionId,
          requiredFilename: 'Cau1.docx',
          deliverableType: 'document',
          rubricId: ctx.rubricId,
          teacherId: owner.id,
        }),
        expect.objectContaining({ jobId: `grade-${made.submissionId}` }),
      );
    });

    // Review Focus #1 — kiểm chứng đột biến. `gradeOneShot` ghi điểm mà KHÔNG đặt lớp/lý do. Nếu route quên
    // xoá hai cột đó, `ck_grading_result_ungradable` (class IS NULL OR score IS NULL) nổ ngay ở lần ghi điểm
    // đầu — `scoreResult` mô phỏng đúng cú UPDATE ấy. Bỏ hai cột khỏi UPDATE của service thì ca này đỏ (23514).
    it('sau khi chấm lại, ghi điểm lần đầu KHÔNG vi phạm ràng buộc lớp lý do', async () => {
      const owner = await login('a2');
      const ctx = await seedSession(ds, 'regrade-a2', { teacherId: owner.id });
      const made = await ungradable(ctx, 'system');
      await regrade(owner.token, made.resultId).expect(201);

      await expect(scoreResult(ds, made.resultId, '7.00')).resolves.toBeUndefined();
      expect((await rowOf(made.resultId)).ai_total_score).toBe('7.00');
    });

    it('bài lớp submission → 400 nói lối duy nhất là chấm tay, và không đổi gì', async () => {
      const owner = await login('a3');
      const ctx = await seedSession(ds, 'regrade-a3', { teacherId: owner.id });
      const made = await ungradable(ctx, 'submission', 'Bài nộp là file rỗng.');

      const res = await regrade(owner.token, made.resultId);

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('lối duy nhất là chấm tay');
      expect(await rowOf(made.resultId)).toMatchObject({ status: 'flagged_for_review', ungradable_class: 'submission' });
      expect(add).not.toHaveBeenCalled();
    });

    it('bài đã có điểm (flagged nhưng có ai_total_score) → 400, không đổi gì', async () => {
      const owner = await login('a4');
      const ctx = await seedSession(ds, 'regrade-a4', { teacherId: owner.id });
      const made = await seedResult(ds, ctx, 'one_shot');
      await forceStatus(ds, made.resultId, 'flagged_for_review', { ai_total_score: '7.00', confidence: 0.4 });

      const res = await regrade(owner.token, made.resultId);

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('đã có kết quả');
      expect((await rowOf(made.resultId)).ai_total_score).toBe('7.00');
      expect(add).not.toHaveBeenCalled();
    });

    it('bài đang chấm → 409', async () => {
      const owner = await login('a5');
      const ctx = await seedSession(ds, 'regrade-a5', { teacherId: owner.id });
      const made = await seedResult(ds, ctx, 'one_shot'); // seedResult để bài ở ai_grading

      const res = await regrade(owner.token, made.resultId);

      expect(res.status).toBe(409);
      expect(res.body.message).toContain('đang được chấm');
    });

    // Review Focus #2 đầu-cuối: lần hai bài đã ở ai_grading với lớp NULL.
    it('bấm hai lần → lần hai nói "đang được chấm", không phải "bài làm không đọc được"; job chỉ xếp một lần', async () => {
      const owner = await login('a6');
      const ctx = await seedSession(ds, 'regrade-a6', { teacherId: owner.id });
      const made = await ungradable(ctx, 'system');

      await regrade(owner.token, made.resultId).expect(201);
      const second = await regrade(owner.token, made.resultId);

      expect(second.status).toBe(409);
      expect(second.body.message).toContain('đang được chấm');
      expect(second.body.message).not.toContain('không đọc được');
      expect(add).toHaveBeenCalledTimes(1);
    });

    it('giảng viên khác → 403, không đổi gì', async () => {
      const owner = await login('a7');
      const stranger = await login('a7-khac');
      const ctx = await seedSession(ds, 'regrade-a7', { teacherId: owner.id });
      const made = await ungradable(ctx, 'system');

      const res = await regrade(stranger.token, made.resultId);

      expect(res.status).toBe(403);
      expect((await rowOf(made.resultId)).status).toBe('flagged_for_review');
    });

    it('id không tồn tại → 404', async () => {
      const owner = await login('a8');
      expect((await regrade(owner.token, randomUUID())).status).toBe(404);
    });

    // Không có cách dựng "bài đi tiếp giữa lúc kiểm và ghi" bằng HTTP một cách tất định, nên đưa vào một dòng
    // kiểm CŨ: câu SQL nạp dòng của service trả về trạng thái đã hết hạn, trong khi DB thật đã có điểm.
    it('bài đã đi tiếp giữa lúc kiểm và lúc ghi → requeued 0 và nói vì sao', async () => {
      const owner = await login('a9');
      const ctx = await seedSession(ds, 'regrade-a9', { teacherId: owner.id });
      const made = await seedResult(ds, ctx, 'one_shot');
      await scoreResult(ds, made.resultId, '7.00'); // thật ra đã có điểm
      const [real] = await ds.query(
        `SELECT g.id, g.status, g.ai_total_score, g.ungradable_class, g.ungradable_reason, g.submission_id,
                g.rubric_id_version, rd.required_filename, rd.deliverable_type
           FROM examcollect.grading_result g
           JOIN examcollect.submission s ON s.id = g.submission_id
           JOIN examcollect.required_deliverable rd ON rd.id = s.required_deliverable_id
          WHERE g.id = $1`,
        [made.resultId],
      );
      // Chặn theo NỘI DUNG câu SQL chứ không theo thứ tự lời gọi: một guard hay bộ lọc khác cũng có thể gọi
      // `ds.query` trước service, và `mockImplementationOnce` sẽ bị nó tiêu mất.
      const original = ds.query.bind(ds);
      jest.spyOn(ds, 'query').mockImplementation(((sql: string, params?: unknown[]) =>
        sql.includes('examcollect.required_deliverable rd')
          ? Promise.resolve([
              { ...real, status: 'flagged_for_review', ai_total_score: null, ungradable_class: 'system', ungradable_reason: 'cũ' },
            ])
          : original(sql, params)) as never);

      const res = await regrade(owner.token, made.resultId);

      expect(res.status).toBe(201);
      expect(res.body).toEqual({
        requeued: 0,
        skipped: [{ resultId: made.resultId, reason: 'Bài đã đi tiếp — có lượt khác vừa xử lý nó.' }],
      });
      expect(add).not.toHaveBeenCalled();
      expect((await rowOf(made.resultId)).ai_total_score).toBe('7.00');
    });
  });
  ```

  ```bash
  pnpm --filter api exec jest --config ./test/jest-e2e.json test/regrade.e2e-spec.ts
  ```

  Expected: **RED** — every case fails with 404 (no such route).

- [ ] **Step 2: GREEN — the service.** In `regrade.service.ts` replace the two type-only imports at the top with the full import block, and append the class after `regradeRefusal`:

  ```ts
  import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
  import { InjectQueue } from '@nestjs/bullmq';
  import { InjectDataSource } from '@nestjs/typeorm';
  import { Queue } from 'bullmq';
  import { DataSource } from 'typeorm';
  import { GradingResultEntity, type GradingResultStatus } from './entities/grading-result.entity';
  import type { UngradableClass } from './grading-model.types';
  import { GRADE_JOB_OPTIONS, GRADING_QUEUE, type GradeSubmissionJob } from './grading.queue';
  import { lockTeacherScoring } from './scoring/score-inputs';
  ```

  ```ts
  /** Dòng cần để quyết định và để xếp job — một câu SQL, ba bảng. */
  export const REGRADE_ROW_SQL = `
    SELECT g.id, g.status, g.ai_total_score, g.ungradable_class, g.ungradable_reason,
           g.submission_id, g.rubric_id_version, rd.required_filename, rd.deliverable_type
      FROM examcollect.grading_result g
      JOIN examcollect.submission s ON s.id = g.submission_id
      JOIN examcollect.required_deliverable rd ON rd.id = s.required_deliverable_id`;

  interface RegradeRow {
    id: string;
    status: GradingResultStatus;
    aiTotalScore: string | null;
    ungradableClass: UngradableClass | null;
    submissionId: string;
    rubricId: string;
    requiredFilename: string;
    deliverableType: GradeSubmissionJob['deliverableType'];
  }

  function toRow(raw: Record<string, unknown>): RegradeRow {
    return {
      id: raw.id as string,
      status: raw.status as GradingResultStatus,
      aiTotalScore: (raw.ai_total_score as string | null) ?? null,
      ungradableClass: (raw.ungradable_class as UngradableClass | null) ?? null,
      submissionId: raw.submission_id as string,
      rubricId: raw.rubric_id_version as string,
      requiredFilename: raw.required_filename as string,
      deliverableType: raw.deliverable_type as GradeSubmissionJob['deliverableType'],
    };
  }

  const SKIP_MOVED_ON = 'Bài đã đi tiếp — có lượt khác vừa xử lý nó.';

  @Injectable()
  export class RegradeService {
    constructor(
      @InjectDataSource() private readonly ds: DataSource,
      @InjectQueue(GRADING_QUEUE) private readonly queue: Queue<GradeSubmissionJob>,
    ) {}

    /** Quyền sở hữu do controller kiểm TRƯỚC (`findResultForOwner`); ở đây chỉ quyết được-hay-không. */
    async regradeOne(teacherId: string, resultId: string): Promise<RegradeOutcome> {
      const [raw] = await this.ds.query(`${REGRADE_ROW_SQL} WHERE g.id = $1`, [resultId]);
      if (!raw) throw new NotFoundException('Grading result not found');
      const row = toRow(raw);

      const refusal = regradeRefusal(row);
      if (refusal) {
        throw refusal.status === 409
          ? new ConflictException(refusal.message)
          : new BadRequestException(refusal.message);
      }
      return this.requeue(teacherId, row);
    }

    /**
     * Đưa MỘT bài về `ai_grading` rồi xếp job.
     *
     * UPDATE có điều kiện trong một transaction, dưới khoá chấm điểm của giảng viên (cùng thứ tự khoá với
     * `markUngradable` và `startAttempt`). Lớp và lý do bị xoá Ở CHÍNH CÂU LỆNH NÀY: `ck_grading_result_ungradable`
     * cấm một lớp đi kèm điểm, mà `gradeOneShot` không bao giờ xoá nó — giữ lại thì lần ghi điểm đầu tiên nổ.
     * Không dùng `advanceStatus`: `AdvanceExtra` không cho đặt các cột này.
     *
     * Đổi trạng thái TRƯỚC, xếp job SAU: `lockRunning` của đường điều tra đòi bài đang ở `ai_grading`.
     */
    private async requeue(teacherId: string, row: RegradeRow): Promise<RegradeOutcome> {
      const moved = await this.ds.transaction(async (m) => {
        await lockTeacherScoring(m, teacherId);
        const updated = await m
          .createQueryBuilder()
          .update(GradingResultEntity)
          .set({
            status: 'ai_grading',
            ungradableClass: null,
            ungradableReason: null,
            flagForReview: false,
            confidence: null,
          })
          .where('id = :id', { id: row.id })
          .andWhere("status = 'flagged_for_review'")
          .andWhere("ungradable_class = 'system'")
          .andWhere('ai_total_score IS NULL')
          .execute();
        return (updated.affected ?? 0) > 0;
      });
      if (!moved) return { requeued: 0, skipped: [{ resultId: row.id, reason: SKIP_MOVED_ON }] };

      await this.queue.add(
        'grade-submission',
        {
          submissionId: row.submissionId,
          requiredFilename: row.requiredFilename,
          deliverableType: row.deliverableType,
          rubricId: row.rubricId,
          teacherId,
        } satisfies GradeSubmissionJob,
        { ...GRADE_JOB_OPTIONS, jobId: `grade-${row.submissionId}` },
      );
      return { requeued: 1, skipped: [] };
    }
  }
  ```

- [ ] **Step 3: GREEN — controller and module.** Create `apps/api/src/grading/regrade.controller.ts`:

  ```ts
  import { Controller, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
  import type { Request } from 'express';
  import { JwtAuthGuard } from '../auth/jwt-auth.guard';
  import { Roles } from '../auth/roles.decorator';
  import { RolesGuard } from '../auth/roles.guard';
  import { GradingService } from './grading.service';
  import { RegradeService } from './regrade.service';

  /**
   * Chấm lại bài không chấm được — mỗi cú là MỘT hành động giảng viên bấm (§7.1.3), không có `@Interval`.
   * Quyền sở hữu luôn qua `findResultForOwner` trước; không route nào nhận `teacherId` từ body.
   */
  @Controller()
  @UseGuards(JwtAuthGuard, RolesGuard)
  export class RegradeController {
    constructor(
      private readonly regrade: RegradeService,
      private readonly grading: GradingService,
    ) {}

    @Post('grading-results/:id/regrade')
    @Roles('teacher')
    async regradeOne(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
      const result = await this.grading.findResultForOwner(id, req.user!.sub);
      return this.regrade.regradeOne(req.user!.sub, result.id);
    }
  }
  ```

  In `grading.module.ts` add the imports next to the other `./` imports:

  ```ts
  import { RegradeController } from './regrade.controller';
  import { RegradeService } from './regrade.service';
  ```

  replace exactly `  controllers: [GradingController, RulesController, TestBundleController],` with `  controllers: [GradingController, RulesController, TestBundleController, RegradeController],` and replace exactly

  ```ts
      DeliverableLanguageService,
      GradingReferenceService,
  ```

  with

  ```ts
      DeliverableLanguageService,
      RegradeService,
      GradingReferenceService,
  ```

- [ ] **Step 4: GREEN.**

  ```bash
  pnpm --filter api exec jest --config ./test/jest-e2e.json test/regrade.e2e-spec.ts
  pnpm --filter api exec jest src/grading
  pnpm --filter api exec tsc --noEmit
  pnpm check:cycles
  ```

  Expected: 9 passed; unit run green; `tsc` clean (if it rejects `confidence: null`, read the column type on `GradingResultEntity` and match it — do not cast); `0 vòng lặp`.

- [ ] **Step 5: mutation-check Review Focus #1, then restore.** Temporarily delete the lines `ungradableClass: null,` and `ungradableReason: null,` from the `.set({…})` in `requeue`, run

  ```bash
  pnpm --filter api exec jest --config ./test/jest-e2e.json test/regrade.e2e-spec.ts -t "KHÔNG vi phạm ràng buộc"
  ```

  and record in the ledger that the case **fails** (23514 `ck_grading_result_ungradable`). Then restore the two lines and re-run the whole file green. Do not commit the mutated state.

- [ ] **Step 6: `detect_changes` and commit.** Title: `feat(regrade): chấm lại một bài không chấm được — UPDATE có điều kiện xoá lớp lý do, rồi xếp job`.

---

### Task 4: a stale finished job must not swallow the re-add

**Files:** `apps/api/src/grading/regrade.service.ts` (modify), `apps/api/test/regrade.e2e-spec.ts` (modify), create `apps/api/test/regrade-real-queue.e2e-spec.ts`.

**Interfaces**
- Consumes: `Queue.getJob(id)`, `Job.getState(): Promise<JobState | 'unknown'>` and `Job.remove()` (BullMQ 6.3.4; `JobState = 'completed' | 'failed' | 'active' | 'delayed' | 'prioritized' | 'waiting' | 'waiting-children'`).
- Produces: `RegradeService` (private) `enqueue(teacherId, row)`; behaviour: `completed`/`failed` → remove then add; live states → no add, still counted as re-queued; `unknown` or no job → add.

- [ ] **Step 1: RED — the fake-queue cases.** Append inside the `describe` in `test/regrade.e2e-spec.ts`:

  ```ts
    const fakeJob = (state: string) => ({
      getState: jest.fn().mockResolvedValue(state),
      remove: jest.fn().mockResolvedValue(undefined),
    });

    // Review Focus #3 — job hoàn tất nằm lại trong Redis 24 giờ (`removeOnComplete.age`). `queue.add` cùng
    // jobId với nó bị BullMQ bỏ qua im lặng: DB đã sang ai_grading, không job nào chạy, bài kẹt.
    it.each(['completed', 'failed'])('job %s cùng jobId còn trong Redis → bị xoá TRƯỚC khi thêm lại', async (state) => {
      const owner = await login(`b-${state}`);
      const ctx = await seedSession(ds, `regrade-b-${state}`, { teacherId: owner.id });
      const made = await ungradable(ctx, 'system');
      const ghost = fakeJob(state);
      getJob.mockResolvedValue(ghost as never);

      const res = await regrade(owner.token, made.resultId);

      expect(res.body).toEqual({ requeued: 1, skipped: [] });
      expect(getJob).toHaveBeenCalledWith(`grade-${made.submissionId}`);
      expect(ghost.remove).toHaveBeenCalledTimes(1);
      expect(add).toHaveBeenCalledTimes(1);
      expect(ghost.remove.mock.invocationCallOrder[0]).toBeLessThan(add.mock.invocationCallOrder[0]);
    });

    // Một job đang sống sẽ đọc DB MỚI (đọc `result.pipeline`) và chấm bài này; thêm hay xoá nó là làm hỏng.
    it.each(['active', 'waiting', 'delayed', 'prioritized', 'waiting-children'])(
      'job %s → không xoá, không thêm, vẫn tính là đã xếp lại',
      async (state) => {
        const owner = await login(`c-${state}`);
        const ctx = await seedSession(ds, `regrade-c-${state}`, { teacherId: owner.id });
        const made = await ungradable(ctx, 'system');
        const live = fakeJob(state);
        getJob.mockResolvedValue(live as never);

        const res = await regrade(owner.token, made.resultId);

        expect(res.body).toEqual({ requeued: 1, skipped: [] });
        expect(live.remove).not.toHaveBeenCalled();
        expect(add).not.toHaveBeenCalled();
      },
    );

    it('job biến mất giữa hai lời gọi (state unknown) → thêm như chưa có', async () => {
      const owner = await login('d-unknown');
      const ctx = await seedSession(ds, 'regrade-d-unknown', { teacherId: owner.id });
      const made = await ungradable(ctx, 'system');
      const gone = fakeJob('unknown');
      getJob.mockResolvedValue(gone as never);

      await regrade(owner.token, made.resultId).expect(201);

      expect(gone.remove).not.toHaveBeenCalled();
      expect(add).toHaveBeenCalledTimes(1);
    });
  ```

  ```bash
  pnpm --filter api exec jest --config ./test/jest-e2e.json test/regrade.e2e-spec.ts -t "cùng jobId|→ không xoá|state unknown"
  ```

  Expected: **RED** — the `completed`/`failed` cases fail (`ghost.remove` never called: the naive `add` ignores the existing job) and the live-state cases fail (`add` was called).

- [ ] **Step 2: GREEN.** In `regrade.service.ts` replace, inside `requeue`, exactly

  ```ts
      await this.queue.add(
        'grade-submission',
        {
          submissionId: row.submissionId,
          requiredFilename: row.requiredFilename,
          deliverableType: row.deliverableType,
          rubricId: row.rubricId,
          teacherId,
        } satisfies GradeSubmissionJob,
        { ...GRADE_JOB_OPTIONS, jobId: `grade-${row.submissionId}` },
      );
      return { requeued: 1, skipped: [] };
    }
  ```

  with

  ```ts
      await this.enqueue(teacherId, row);
      return { requeued: 1, skipped: [] };
    }

    /**
     * Xếp job cho một bài vừa được đưa về `ai_grading`.
     *
     * `jobId` cố định (`grade-<submissionId>`) là cách loại trùng — nhưng cũng là cái bẫy: BullMQ giữ job hoàn tất
     * 24 giờ (`removeOnComplete.age`) và job hỏng mãi mãi (`removeOnFail: false`), và `queue.add` cùng `jobId` với
     * một job ĐANG TỒN TẠI bị bỏ qua IM LẶNG. Một lượt "không chấm được" kết thúc bình thường (`finishUngradable`
     * không ném) nên job của nó là `completed`; không xoá nó thì bài kẹt ở `ai_grading` không job nào, và
     * `regradeStuck` cũng không cứu (nó bỏ qua mọi job không `failed`).
     *
     * Job SỐNG thì để yên: nó đọc DB lúc chạy và chấm đúng bài này.
     */
    private async enqueue(teacherId: string, row: RegradeRow): Promise<void> {
      const jobId = `grade-${row.submissionId}`;
      const existing = await this.queue.getJob(jobId);
      if (existing) {
        const state = await existing.getState();
        if (state === 'completed' || state === 'failed') {
          await existing.remove();
        } else if (state !== 'unknown') {
          return; // active / waiting / delayed / prioritized / waiting-children: đã có việc sắp chạy
        }
      }
      await this.queue.add(
        'grade-submission',
        {
          submissionId: row.submissionId,
          requiredFilename: row.requiredFilename,
          deliverableType: row.deliverableType,
          rubricId: row.rubricId,
          teacherId,
        } satisfies GradeSubmissionJob,
        { ...GRADE_JOB_OPTIONS, jobId },
      );
    }
  ```

  ```bash
  pnpm --filter api exec jest --config ./test/jest-e2e.json test/regrade.e2e-spec.ts
  pnpm --filter api exec tsc --noEmit
  ```

  Expected: green — the file now has 9 + 2 + 5 + 1 = 17 cases.

- [ ] **Step 3: the same proof against the REAL Redis.** The fake-queue cases prove the branching, not that a real completed job behaves as the spec claims. Create `apps/api/test/regrade-real-queue.e2e-spec.ts`:

  ```ts
  import { randomUUID } from 'node:crypto';
  import { getQueueToken } from '@nestjs/bullmq';
  import { INestApplication } from '@nestjs/common';
  import { Test } from '@nestjs/testing';
  import type { Queue } from 'bullmq';
  import { DataSource } from 'typeorm';
  import { AppModule } from '../src/app.module';
  import { GRADE_JOB_OPTIONS, GRADING_QUEUE } from '../src/grading/grading.queue';
  import { RegradeService } from '../src/grading/regrade.service';
  import { forceStatus, seedResult, seedSession } from './helpers/grading-seed';

  /**
   * G3 §2 D4 với Redis THẬT. Cách dựng một job `completed` mà không cần model: thêm job dưới `grade-<S>` với
   * payload trỏ tới một `submissionId` KHÔNG có dòng chấm — `gradeOneById` ghi cảnh báo rồi trả về, nên job hoàn
   * tất. Sau đó gọi service thật và kiểm job mới (payload đúng bài S) đã thay job ma. Hàng đợi được PAUSE trước để
   * worker thật không nhặt job mới và chấm một bài không có nội dung.
   */
  describe('Chấm lại — job hoàn tất còn trong Redis thật (e2e)', () => {
    let app: INestApplication;
    let ds: DataSource;
    let queue: Queue;

    beforeAll(async () => {
      const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
      app = moduleRef.createNestApplication();
      await app.init();
      ds = app.get(DataSource);
      queue = app.get<Queue>(getQueueToken(GRADING_QUEUE));
    }, 60_000);
    afterAll(async () => {
      await queue.resume();
      await app.close();
    });

    async function waitForState(jobId: string, wanted: string, ms = 15_000): Promise<void> {
      const deadline = Date.now() + ms;
      for (;;) {
        const job = await queue.getJob(jobId);
        if (job && (await job.getState()) === wanted) return;
        if (Date.now() > deadline) throw new Error(`job ${jobId} không tới trạng thái ${wanted}`);
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }

    it('job completed cùng jobId bị thay bằng job mới của đúng bài', async () => {
      const ctx = await seedSession(ds, 'regrade-real');
      const made = await seedResult(ds, ctx, 'one_shot');
      await forceStatus(ds, made.resultId, 'flagged_for_review', {
        ungradable_class: 'system', ungradable_reason: 'Dịch vụ AI không phản hồi.', confidence: 0,
      });
      const jobId = `grade-${made.submissionId}`;

      // 1. Job ma: payload trỏ tới bài KHÔNG có dòng chấm → worker thật bỏ qua và job `completed`.
      await queue.add(
        'grade-submission',
        { submissionId: randomUUID(), requiredFilename: 'x.docx', deliverableType: 'document', rubricId: randomUUID(), teacherId: ctx.teacherId },
        { ...GRADE_JOB_OPTIONS, jobId },
      );
      await waitForState(jobId, 'completed');

      // 2. Từ đây worker không nhặt gì nữa.
      await queue.pause();
      try {
        const outcome = await app.get(RegradeService).regradeOne(ctx.teacherId, made.resultId);
        expect(outcome).toEqual({ requeued: 1, skipped: [] });

        // 3. Không còn job ma: job dưới jobId này mang payload của ĐÚNG bài vừa chấm lại và chưa hoàn tất.
        const job = await queue.getJob(jobId);
        expect(job).toBeDefined();
        expect(job!.data.submissionId).toBe(made.submissionId);
        expect(await job!.getState()).not.toBe('completed');
        await job!.remove(); // dọn khi còn pause: worker không bao giờ chạy nó
      } finally {
        await queue.resume();
      }
    }, 60_000);
  });
  ```

  ```bash
  pnpm --filter api exec jest --config ./test/jest-e2e.json test/regrade-real-queue.e2e-spec.ts
  ```

  Expected: green. If `waitForState` times out the worker is not running in this app (check `.env.test` `REDIS_DB` and that no other session drains this Redis) — do not weaken the test; record the finding.

  **Mutation check:** temporarily change `state === 'completed' || state === 'failed'` to `state === 'failed'`, re-run this file, record that it **fails** (`job.data.submissionId` is the ghost's), restore.

- [ ] **Step 4: commit.** Title: `fix(regrade): job đã hoàn tất còn trong Redis không được nuốt lệnh xếp lại`.

---

### Task 5: regrade a whole session, optionally only results with the same reason

**Files:** `apps/api/src/grading/regrade.service.ts`, `apps/api/src/grading/regrade.controller.ts` (modify), create `apps/api/src/grading/dto/regrade-ungradable.dto.ts`, modify `apps/api/test/regrade.e2e-spec.ts`.

**Interfaces**
- Consumes: `RegradeService.requeue` (private, Task 3/4), `REGRADE_ROW_SQL`, `toRow`; `ExamSessionService.findEntityForOwner(id, teacherId)`.
- Produces: `RegradeService.regradeUngradable(teacherId: string, examSessionId: string, reason: string | null): Promise<RegradeOutcome>`; `POST /exam-sessions/:id/regrade-ungradable` body `{ reason?: string | null }` → 201 `RegradeOutcome`.

- [ ] **Step 1: RED.** Append to `test/regrade.e2e-spec.ts` (inside the top-level `describe`, after the last `it`):

  ```ts
    describe('cả phiên — POST /exam-sessions/:id/regrade-ungradable', () => {
      const R1 = 'Dịch vụ AI không phản hồi.';
      const R2 = 'Môi trường chạy bài hết giờ.';
      const regradeSession = (token: string, sessionId: string, body: object = {}) =>
        request(app.getHttpServer()).post(`/exam-sessions/${sessionId}/regrade-ungradable`).set(as(token)).send(body);

      /** Hai bài system cùng lý do R1, một bài system lý do R2, một bài LỚP submission mang CÙNG chữ R1, một bài đã có điểm. */
      async function world(label: string) {
        const owner = await login(label);
        const ctx = await seedSession(ds, `regrade-${label}`, { teacherId: owner.id });
        const a1 = await ungradable(ctx, 'system', R1);
        const a2 = await ungradable(ctx, 'system', R1);
        const b = await ungradable(ctx, 'system', R2);
        const sub = await ungradable(ctx, 'submission', R1);
        const done = await seedResult(ds, ctx, 'one_shot');
        await scoreResult(ds, done.resultId, '7.00');
        return { owner, ctx, a1, a2, b, sub, done };
      }

      it('không lọc → mọi bài lớp system; bài lớp submission và bài đã có điểm đứng yên', async () => {
        const w = await world('s1');

        const res = await regradeSession(w.owner.token, w.ctx.sessionId);

        expect(res.status).toBe(201);
        expect(res.body).toEqual({ requeued: 3, skipped: [] });
        for (const made of [w.a1, w.a2, w.b]) expect((await rowOf(made.resultId)).status).toBe('ai_grading');
        expect(await rowOf(w.sub.resultId)).toMatchObject({ status: 'flagged_for_review', ungradable_class: 'submission' });
        expect(await rowOf(w.done.resultId)).toMatchObject({ status: 'ai_graded', ai_total_score: '7.00' });
        expect(add).toHaveBeenCalledTimes(3);
      });

      // Review Focus #4: lọc theo lý do so NGUYÊN VĂN — và bài lớp submission mang cùng chữ R1 không được kéo vào.
      it('lọc theo lý do R1 → chỉ hai bài system cùng lý do, không kéo bài submission cùng chữ', async () => {
        const w = await world('s2');

        const res = await regradeSession(w.owner.token, w.ctx.sessionId, { reason: R1 });

        expect(res.body).toEqual({ requeued: 2, skipped: [] });
        expect((await rowOf(w.a1.resultId)).status).toBe('ai_grading');
        expect((await rowOf(w.a2.resultId)).status).toBe('ai_grading');
        expect(await rowOf(w.b.resultId)).toMatchObject({ status: 'flagged_for_review', ungradable_reason: R2 });
        expect(await rowOf(w.sub.resultId)).toMatchObject({ status: 'flagged_for_review', ungradable_class: 'submission' });
        expect(add).toHaveBeenCalledTimes(2);
      });

      it('reason: null gửi rõ ràng giống hệt không gửi', async () => {
        const w = await world('s3');
        const res = await regradeSession(w.owner.token, w.ctx.sessionId, { reason: null });
        expect(res.body).toEqual({ requeued: 3, skipped: [] });
      });

      it('không có gì để chấm lại → 201 với requeued 0, không phải lỗi', async () => {
        const owner = await login('s4');
        const ctx = await seedSession(ds, 'regrade-s4', { teacherId: owner.id });
        const done = await seedResult(ds, ctx, 'one_shot');
        await scoreResult(ds, done.resultId, '7.00');

        const res = await regradeSession(owner.token, ctx.sessionId);

        expect(res.status).toBe(201);
        expect(res.body).toEqual({ requeued: 0, skipped: [] });
        expect(add).not.toHaveBeenCalled();
      });

      it('bấm hai lần liên tiếp → lần hai không còn gì để làm', async () => {
        const w = await world('s5');
        await regradeSession(w.owner.token, w.ctx.sessionId).expect(201);

        const second = await regradeSession(w.owner.token, w.ctx.sessionId);

        expect(second.body).toEqual({ requeued: 0, skipped: [] });
        expect(add).toHaveBeenCalledTimes(3);
      });

      it('giảng viên khác → 403; phiên không tồn tại → 404; reason sai kiểu → 400', async () => {
        const w = await world('s6');
        const stranger = await login('s6-khac');

        expect((await regradeSession(stranger.token, w.ctx.sessionId)).status).toBe(403);
        expect((await regradeSession(w.owner.token, randomUUID())).status).toBe(404);
        expect((await regradeSession(w.owner.token, w.ctx.sessionId, { reason: 123 })).status).toBe(400);
        expect((await rowOf(w.a1.resultId)).status).toBe('flagged_for_review');
      });
    });
  ```

  ```bash
  pnpm --filter api exec jest --config ./test/jest-e2e.json test/regrade.e2e-spec.ts -t "cả phiên"
  ```

  Expected: **RED** — every call returns 404 (no such route).

- [ ] **Step 2: GREEN — the DTO.** Create `apps/api/src/grading/dto/regrade-ungradable.dto.ts`:

  ```ts
  import { IsOptional, IsString, MaxLength } from 'class-validator';

  /**
   * Chấm lại cả phiên. `reason` (tuỳ chọn) giới hạn vào những bài có ĐÚNG câu lý do này — so nguyên văn, vì
   * `ungradable_reason` là văn bản tự do và chuẩn hoá nó là đoán. Bỏ trống hoặc `null` = mọi bài lớp system.
   */
  export class RegradeUngradableDto {
    @IsOptional()
    @IsString()
    @MaxLength(4000)
    reason?: string | null;
  }
  ```

- [ ] **Step 3: GREEN — the service method.** Append inside `RegradeService`, after `regradeOne`:

  ```ts
    /**
     * Chấm lại MỌI bài lớp system của một phiên — tuỳ chọn chỉ những bài cùng `ungradable_reason`.
     *
     * Một `SELECT` lấy ứng viên rồi gọi `requeue` TUẦN TỰ từng bài, không `UPDATE … WHERE id IN (…)` hàng loạt:
     * mỗi dòng phải qua đúng một UPDATE có điều kiện (hai lượt bấm song song không tạo hai lượt chấm), và
     * `skipped` phải nói được bài NÀO bị bỏ vì sao — một mảng id trần nói không được.
     *
     * Lớp `submission` và bài đã có điểm không bao giờ lọt vào `SELECT`, nên cũng không bao giờ lọt vào lọc theo
     * lý do dù có trùng chữ.
     */
    async regradeUngradable(teacherId: string, examSessionId: string, reason: string | null): Promise<RegradeOutcome> {
      const rows: Record<string, unknown>[] = await this.ds.query(
        `${REGRADE_ROW_SQL}
          WHERE s.exam_session_id = $1
            AND g.status = 'flagged_for_review'
            AND g.ungradable_class = 'system'
            AND g.ai_total_score IS NULL
            AND ($2::text IS NULL OR g.ungradable_reason = $2)
          ORDER BY g.id`,
        [examSessionId, reason],
      );
      const outcome: RegradeOutcome = { requeued: 0, skipped: [] };
      for (const raw of rows) {
        const one = await this.requeue(teacherId, toRow(raw));
        outcome.requeued += one.requeued;
        outcome.skipped.push(...one.skipped);
      }
      return outcome;
    }
  ```

- [ ] **Step 4: GREEN — the route.** In `regrade.controller.ts` replace exactly

  ```ts
  import { Controller, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
  ```

  with

  ```ts
  import { Body, Controller, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
  ```

  add `import { ExamSessionService } from '../exam-session/exam-session.service';` and `import { RegradeUngradableDto } from './dto/regrade-ungradable.dto';` with the other imports, replace exactly

  ```ts
      private readonly grading: GradingService,
    ) {}
  ```

  with

  ```ts
      private readonly grading: GradingService,
      private readonly examSessions: ExamSessionService,
    ) {}
  ```

  and replace exactly

  ```ts
      return this.regrade.regradeOne(req.user!.sub, result.id);
    }
  }
  ```

  with

  ```ts
      return this.regrade.regradeOne(req.user!.sub, result.id);
    }

    @Post('exam-sessions/:id/regrade-ungradable')
    @Roles('teacher')
    async regradeUngradable(
      @Param('id', ParseUUIDPipe) id: string,
      @Body() dto: RegradeUngradableDto,
      @Req() req: Request,
    ) {
      const session = await this.examSessions.findEntityForOwner(id, req.user!.sub);
      return this.regrade.regradeUngradable(req.user!.sub, session.id, dto.reason ?? null);
    }
  }
  ```

  ```bash
  pnpm --filter api exec jest --config ./test/jest-e2e.json test/regrade.e2e-spec.ts
  pnpm --filter api exec tsc --noEmit
  pnpm check:cycles
  ```

  Expected: 23 passed (17 + 6); `tsc` clean; `0 vòng lặp`.

- [ ] **Step 5: commit.** Title: `feat(regrade): chấm lại cả phiên, tuỳ chọn lọc theo lý do so nguyên văn`.

---

### Task 6: the investigator path, end to end

**Files:** create `apps/api/test/regrade-loop.e2e-spec.ts`. No production change is expected — this task **proves** the second attempt works; if it fails, that is a finding, not a test to weaken.

**Interfaces**
- Consumes: `RegradeService.regradeOne`; `GradingService.gradeOneById(job)`; `INVESTIGATOR_DEPS` override; `seedCodeSession(ds, storage, label)` → `{ ctx: SeedSession, … }`, `seedCodeSubmission(ds, storage, s)` → `{ submissionId, resultId }` (`test/helpers/code-session-seed.ts`).
- Produces: nothing exported.

- [ ] **Step 1: the test.** Create `apps/api/test/regrade-loop.e2e-spec.ts` (the scripted model and fake sandbox are copied from `investigator-run.e2e-spec.ts:17-42`, which does not export them):

  ```ts
  import { getQueueToken } from '@nestjs/bullmq';
  import { INestApplication } from '@nestjs/common';
  import { Test } from '@nestjs/testing';
  import type { Queue } from 'bullmq';
  import { DataSource } from 'typeorm';
  import { AppModule } from '../src/app.module';
  import type { ChatTextRequest } from '../src/grading/ai-provider/openai-chat';
  import { GRADING_QUEUE, type GradeSubmissionJob } from '../src/grading/grading.queue';
  import { GradingService } from '../src/grading/grading.service';
  import type { ModelTier } from '../src/grading/investigator/model-pool';
  import { execResult, fakeSandbox } from '../src/grading/investigator/testing/fake-sandbox';
  import { INVESTIGATOR_DEPS, InvestigatorDeps } from '../src/grading/pipeline/investigator-deps';
  import { RegradeService } from '../src/grading/regrade.service';
  import type { ExecRequest } from '../src/sandbox/sandbox.client';
  import { StorageService } from '../src/storage/storage.service';
  import { seedCodeSession, seedCodeSubmission } from './helpers/code-session-seed';

  const USAGE = { inputTokens: 100, outputTokens: 20, cacheReadTokens: 0, cacheCreationTokens: 0 };
  const call = (tool: string, extra: Record<string, unknown> = {}) => ({ tool, input: null, group: null, path: null, fromLine: null, toLine: null, ...extra });
  const turn = (...calls: object[]) => JSON.stringify({ action: 'call', calls, verdict: null });
  const final = (errors: object[], missingRules: object[] = []) =>
    JSON.stringify({ action: 'final', calls: [], verdict: { errors, missingRules, injectionAttempt: { detected: false, excerpt: null } } });

  /** Model kịch bản: chạy gói test + đọc bài, rồi kết luận một lỗi lời. */
  function scripted(): ModelTier & { requests: ChatTextRequest[] } {
    const script = [
      turn(call('run_tests'), call('read_file', { path: 'bai-nop/main.cpp' })),
      final([{ ruleKey: 'ten_bien', toolCallIds: ['tc-2'], note: null }]),
    ];
    const requests: ChatTextRequest[] = [];
    return {
      label: 'kịch bản', model: 'kich-ban', ceiling: 1, requests,
      async call(req) {
        requests.push(req);
        return { content: script[Math.min(requests.length - 1, script.length - 1)], usage: USAGE };
      },
    };
  }
  /** Môi trường chạy bài giả: nhóm `bien` fail, mọi ca khác đạt. */
  const bienFails = () =>
    fakeSandbox((req: ExecRequest) =>
      execResult(req.cases.map((c) => ({ name: c.name, group: c.group, status: c.group === 'bien' ? 'fail' : c.expected ? 'pass' : 'ran' }))),
    );

  /** G3 §6 Review Focus #6: chấm lại một bài code không chấm được → lượt chấm thứ hai có điểm. */
  describe('Chấm lại — đường điều tra, đầu-cuối (e2e)', () => {
    let app: INestApplication;
    let ds: DataSource;
    let storage: StorageService;
    let grading: GradingService;
    let queue: Queue;
    const deps: InvestigatorDeps = { models: [], sandbox: null, challengers: [], caseLenses: [], ceilingOf: () => 1, close: async () => undefined };

    beforeAll(async () => {
      const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(INVESTIGATOR_DEPS).useValue(deps).compile();
      app = moduleRef.createNestApplication();
      await app.init();
      ds = app.get(DataSource);
      storage = app.get(StorageService);
      grading = app.get(GradingService);
      queue = app.get<Queue>(getQueueToken(GRADING_QUEUE));
    }, 60_000);
    afterAll(async () => app.close());
    afterEach(() => jest.restoreAllMocks());

    const stateOf = async (resultId: string) =>
      (await ds.query(`SELECT status, ai_total_score, ungradable_class FROM examcollect.grading_result WHERE id = $1`, [resultId]))[0];

    it('môi trường chạy bài chưa cấu hình → không chấm được (system) → chấm lại → lượt thứ hai có điểm, lớp NULL', async () => {
      // Hàng đợi bị spy: không job thật nào tới worker, và ta gọi `gradeOneById` bằng tay đúng như worker sẽ làm.
      const add = jest.spyOn(queue, 'add').mockResolvedValue({ id: 'gia' } as never);
      jest.spyOn(queue, 'getJob').mockResolvedValue(undefined as never);
      deps.models = [scripted()];
      deps.sandbox = null;
      const s = await seedCodeSession(ds, storage, 'loop-a');
      const sub = await seedCodeSubmission(ds, storage, s);
      const job: GradeSubmissionJob = {
        deliverableType: 'code_project',
        submissionId: sub.submissionId,
        requiredFilename: 'Cau1.docx',
        rubricId: s.ctx.rubricId,
        teacherId: s.ctx.teacherId,
      };

      await grading.gradeOneById(job); // lượt 1: môi trường chạy bài chưa cấu hình
      expect(await stateOf(sub.resultId)).toMatchObject({ status: 'flagged_for_review', ungradable_class: 'system' });

      deps.sandbox = bienFails(); // môi trường chạy bài "sống lại"
      const outcome = await app.get(RegradeService).regradeOne(s.ctx.teacherId, sub.resultId);
      expect(outcome).toEqual({ requeued: 1, skipped: [] });
      expect(add).toHaveBeenCalledTimes(1);
      expect(await stateOf(sub.resultId)).toMatchObject({ status: 'ai_grading', ungradable_class: null });

      await grading.gradeOneById(job); // worker chạy lại đúng job vừa được xếp

      const attempts = await ds.query(
        `SELECT attempt_no, outcome FROM examcollect.grading_attempt WHERE grading_result_id = $1 ORDER BY attempt_no`,
        [sub.resultId],
      );
      expect(attempts).toEqual([
        { attempt_no: 1, outcome: 'ungradable' },
        { attempt_no: 2, outcome: 'graded' },
      ]);
      const after = await stateOf(sub.resultId);
      expect(after.ungradable_class).toBeNull();
      expect(after.ai_total_score).not.toBeNull();
      expect(['auto_approved', 'flagged_for_review']).toContain(after.status);
    });
  });
  ```

  ```bash
  pnpm --filter api exec jest --config ./test/jest-e2e.json test/regrade-loop.e2e-spec.ts
  ```

  Expected: green. If `attempt_no` of the second row is not 2, or the second `gradeOneById` returns early, or `startAttempt` returns `null`, that is a real defect in the regrade transition (most likely the status was not `ai_grading` when the worker ran) — stop and report it; do not adjust the test.

- [ ] **Step 2: commit.** Title: `test(regrade): đường điều tra chấm lại đầu-cuối — lượt thứ hai có điểm, lớp lý do NULL`.

---

### Task 7: regenerate the OpenAPI schema; mirror the types; the two thin web modules

**Files:** `packages/shared/src/api/schema.d.ts` (regenerate), `apps/web/src/lib/api/grading.ts` (modify), create `apps/web/src/lib/api/regrade.ts`, `apps/web/src/hooks/useRegrade.ts`.

**Interfaces**
- Consumes: both routes from Tasks 3 and 5, in the generated schema; `investigationQueryKey(gradingResultId)` (`hooks/useGrading.ts:311`, exported).
- Produces: `GradingResult.ungradableClass?: 'system' | 'submission' | null`; `RegradeOutcome`; `regradeResult(resultId)`; `regradeUngradable(examSessionId, reason)`; `useRegradeResult(examSessionId)` (mutate a `resultId`); `useRegradeUngradable(examSessionId)` (mutate `reason: string | null`).

- [ ] **Step 1: Regenerate — only after both routes exist.** The schema is generated from a **running** API (`packages/shared/scripts/generate-api-client.mjs` fetches `API_URL`, default port 4000). Start this package's own server on 4003 from `.env.test` — **never** a bare `node -r dotenv/config …`, which would load `apps/api/.env` and connect to the remote Supabase database:

  ```bash
  cd "C:/Users/Admin/Main/Desktop/HKI 2026-2027/KLTN/CINE/.claude/worktrees/grading-g3-regrade/apps/api"
  pnpm build
  PORT=4003 DOTENV_CONFIG_PATH=.env.test node -r dotenv/config dist/src/main.js   # run in the background
  until [ "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:4003/api-docs-json)" = "200" ]; do sleep 2; done
  cd ../../packages/shared && API_URL=http://localhost:4003/api-docs-json pnpm generate:api-client
  ```

  Expected: `Wrote packages/shared/src/api/schema.d.ts`. Stop the server (`TaskStop`). The startup command is the one recorded and tried in `docs/superpowers/plans/2026-09-29-g2-g5-parallel-execution.md` §2.

- [ ] **Step 2: Mirror the list field.** In `apps/web/src/lib/api/grading.ts` replace exactly

  ```ts
    ungradableReason: string | null;
    criterionResults: {
  ```

  with

  ```ts
    ungradableReason: string | null;
    /**
     * Lớp lý do không chấm được (§4.4): `system` chấm lại được, `submission` thì không. `null` khi bài không dừng.
     * **Tuỳ chọn** vì API cũ không gửi nó — và khi vắng, không dòng nào được coi là `system` (không đoán).
     */
    ungradableClass?: 'system' | 'submission' | null;
    criterionResults: {
  ```

- [ ] **Step 3: The API module.** Create `apps/web/src/lib/api/regrade.ts`:

  ```ts
  import { apiClient } from '@/lib/api-client';

  /** Mirrors `RegradeOutcome` (apps/api/src/grading/regrade.service.ts). */
  export interface RegradeOutcome {
    requeued: number;
    /** `reason` là câu tiếng Việt của server — hiện nguyên văn. */
    skipped: { resultId: string; reason: string }[];
  }

  function fail(error: unknown, response: Response): Error {
    const body = error as { message?: string | string[] } | undefined;
    const message = Array.isArray(body?.message) ? body!.message.join('; ') : body?.message;
    return new Error(message ?? `Yêu cầu thất bại (HTTP ${response.status})`);
  }

  /** Chấm lại MỘT bài không chấm được do lỗi hệ thống. 400/409 kèm câu tiếng Việt nói vì sao không được. */
  export async function regradeResult(resultId: string): Promise<RegradeOutcome> {
    const { data, error, response } = await apiClient.POST('/grading-results/{id}/regrade', {
      params: { path: { id: resultId } },
    });
    if (error || !response.ok) throw fail(error, response);
    return data as unknown as RegradeOutcome;
  }

  /** Chấm lại mọi bài lớp system của phiên; `reason` (nguyên văn) giới hạn vào các bài cùng lý do. */
  export async function regradeUngradable(examSessionId: string, reason: string | null): Promise<RegradeOutcome> {
    const { data, error, response } = await apiClient.POST('/exam-sessions/{id}/regrade-ungradable', {
      params: { path: { id: examSessionId } },
      body: { reason },
    });
    if (error || !response.ok) throw fail(error, response);
    return data as unknown as RegradeOutcome;
  }
  ```

  If `tsc` rejects `body: { reason }` because the generated body type is `Record<string, never>`, cast **only that field** (`body: { reason } as never`) and record a `Ruling:` line — the same situation G1 met for `RequiredDeliverableResponseDto.pipeline`.

- [ ] **Step 4: The hooks.** Create `apps/web/src/hooks/useRegrade.ts`:

  ```ts
  'use client';

  import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
  import { investigationQueryKey } from '@/hooks/useGrading';
  import { regradeResult, regradeUngradable } from '@/lib/api/regrade';

  /**
   * Làm mới cả khi LỖI (`onSettled`): một 409 "đang được chấm" nghĩa là trạng thái vừa đổi, và danh sách đang
   * hiển thị nó sai.
   */
  function refresh(queryClient: QueryClient, examSessionId: string | undefined): void {
    void queryClient.invalidateQueries({ queryKey: ['exam-sessions', examSessionId, 'grading-results'] });
    void queryClient.invalidateQueries({ queryKey: ['exam-sessions', examSessionId, 'grading-progress'] });
  }

  export function useRegradeResult(examSessionId: string | undefined) {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (resultId: string) => regradeResult(resultId),
      onSettled: (_outcome, _error, resultId) => {
        refresh(queryClient, examSessionId);
        void queryClient.invalidateQueries({ queryKey: investigationQueryKey(resultId) });
      },
    });
  }

  export function useRegradeUngradable(examSessionId: string | undefined) {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (reason: string | null) => regradeUngradable(examSessionId!, reason),
      onSettled: () => refresh(queryClient, examSessionId),
    });
  }
  ```

  ```bash
  pnpm --filter web exec tsc --noEmit
  pnpm --filter web exec eslint src/lib/api/regrade.ts src/hooks/useRegrade.ts
  ```

  Expected: `tsc` only the 7 known `read-workbook.test.ts` lines (a type error at `apiClient.POST('/grading-results/{id}/regrade')` means the schema was regenerated before the route existed — redo Step 1); eslint 0 errors.

- [ ] **Step 5: commit.** Title: `chore(web): regenerate schema; ungradableClass trên danh sách; API và hook chấm lại`.

---

### Task 8: pure helpers — count only what can be regraded

**Files:** create `apps/web/src/lib/regrade-triage.ts`, `apps/web/src/lib/regrade-triage.test.ts`.

**Interfaces**
- Consumes: `stateOf(result)` (`lib/session-triage.ts:27`), `GradingResult.ungradableClass?` (Task 7).
- Produces: `countSystemUngradable(results: GradingResult[]): number`; `groupByUngradableReason(results: GradingResult[]): { reason: string; count: number }[]`.

A new file rather than an addition to `session-triage.ts` (stream S adds functions there too).

- [ ] **Step 1: RED.** Create `regrade-triage.test.ts`:

  ```ts
  import { describe, expect, it } from 'vitest';
  import type { GradingResult } from '@/lib/api/grading';
  import { countSystemUngradable, groupByUngradableReason } from './regrade-triage';

  const result = (over: Partial<GradingResult> = {}): GradingResult => ({
    id: 'r', submissionId: 's', studentMssv: '1', studentName: 'An', homeClassId: 'c', homeClassName: 'N01',
    status: 'flagged_for_review', modelUsed: null, aiTotalScore: null, confidence: null, flagForReview: true,
    ungradableReason: 'Dịch vụ AI không phản hồi.', criterionResults: [], advocateOpinion: null,
    contextUsedQuestion: null, contextUsedModelAnswer: null, finalScore: null, reviewedAt: null,
    reviewedByName: null, editedCriteria: null, pipeline: 'one_shot', currentScore: null,
    currentScoreSource: 'computation', ungradableClass: 'system', ...over,
  });

  describe('countSystemUngradable (G3 §4.4)', () => {
    it('counts stopped results of class system', () => {
      expect(countSystemUngradable([result(), result({ id: 'b' })])).toBe(2);
    });

    it('does not count the submission class — regrading it would only reproduce the same failure', () => {
      expect(countSystemUngradable([result(), result({ id: 'b', ungradableClass: 'submission' })])).toBe(1);
    });

    // Review Focus #5: an old API sends no class. Counting those would show a number that may be wrong.
    it('does not count a result whose class the API did not send', () => {
      expect(countSystemUngradable([result({ ungradableClass: undefined }), result({ id: 'b', ungradableClass: null })])).toBe(0);
    });

    it('does not count a result that is no longer stopped, even if it still carries a class', () => {
      expect(countSystemUngradable([result({ status: 'ai_grading', ungradableReason: null })])).toBe(0);
      expect(countSystemUngradable([result({ status: 'finalized', ungradableReason: null })])).toBe(0);
    });
  });

  describe('groupByUngradableReason', () => {
    it('groups by the reason text, largest group first', () => {
      const groups = groupByUngradableReason([
        result({ id: 'a', ungradableReason: 'Hết giờ' }),
        result({ id: 'b', ungradableReason: 'AI lỗi' }),
        result({ id: 'c', ungradableReason: 'AI lỗi' }),
      ]);
      expect(groups).toEqual([
        { reason: 'AI lỗi', count: 2 },
        { reason: 'Hết giờ', count: 1 },
      ]);
    });

    it('leaves out the submission class and results with no class, even with the same text', () => {
      const groups = groupByUngradableReason([
        result({ id: 'a', ungradableReason: 'AI lỗi' }),
        result({ id: 'b', ungradableReason: 'AI lỗi', ungradableClass: 'submission' }),
        result({ id: 'c', ungradableReason: 'AI lỗi', ungradableClass: undefined }),
      ]);
      expect(groups).toEqual([{ reason: 'AI lỗi', count: 1 }]);
    });

    it('is empty when nothing stopped', () => {
      expect(groupByUngradableReason([])).toEqual([]);
    });
  });
  ```

  ```bash
  pnpm --filter web exec vitest run src/lib/regrade-triage.test.ts
  ```

  Expected: **RED** — `Failed to resolve import "./regrade-triage"`.

- [ ] **Step 2: GREEN.** Create `regrade-triage.ts`:

  ```ts
  import type { GradingResult } from '@/lib/api/grading';
  import { stateOf } from '@/lib/session-triage';

  /**
   * Bài "không chấm được" mà CHẤM LẠI ĐƯỢC: dừng vì lỗi phía hệ thống (§4.4). Lớp `submission` không được tính —
   * chấm lại bài nộp hỏng ra đúng kết quả cũ. Bài mà API không gửi lớp cũng KHÔNG được tính: đếm nó là đoán, và
   * nút sẽ hiện một con số có thể sai.
   */
  const isSystemUngradable = (result: GradingResult): boolean =>
    stateOf(result) === 'ungradable' && result.ungradableClass === 'system';

  export function countSystemUngradable(results: GradingResult[]): number {
    return results.filter(isSystemUngradable).length;
  }

  /**
   * Nhóm "cùng lý do" — theo `ungradable_reason` NGUYÊN VĂN. Chuỗi này là văn bản tự do do hệ thống viết, nên gộp
   * theo nó là so chuỗi, không phải hiểu nghĩa: hai câu lỗi cùng nguyên nhân mà khác chữ không gộp (giảng viên
   * bấm hai lần, an toàn), còn gộp nhầm hai lý do khác nhau thì làm mất quyền chọn cái nào chấm lại.
   */
  export function groupByUngradableReason(results: GradingResult[]): { reason: string; count: number }[] {
    const counts = new Map<string, number>();
    for (const result of results) {
      if (!isSystemUngradable(result)) continue;
      const reason = result.ungradableReason ?? '';
      counts.set(reason, (counts.get(reason) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count);
  }
  ```

  ```bash
  pnpm --filter web exec vitest run src/lib/regrade-triage.test.ts
  pnpm --filter web exec tsc --noEmit
  ```

  Expected: 7 passed; `tsc` only the 7 known lines. (If `tsc` reports a required `GradingResult` field the test literal lacks, add it to the literal — copy the field list from `page.test.tsx`'s `result()` helper.)

- [ ] **Step 3: commit.** Title: `feat(web): đếm và nhóm bài không chấm được lớp system, không đoán khi thiếu lớp`.

---

### Task 9: `RegradeButton` — one confirmation for every place

**Files:** create `apps/web/src/app/teacher/grading/_components/RegradeButton.tsx`, `RegradeButton.test.tsx`.

**Interfaces**
- Consumes: `useRegradeResult`, `useRegradeUngradable` (Task 7); `RegradeOutcome`; `Dialog*` from `@/components/ui/dialog`, `Button`/`ButtonProps`, `Alert`.
- Produces: `RegradeScope = { kind: 'result'; sessionId: string; resultId: string } | { kind: 'session'; sessionId: string; reason: string | null; count: number }`; `RegradeButton({ scope, label, variant?, size? })`.

- [ ] **Step 1: RED.** Create `RegradeButton.test.tsx`:

  ```tsx
  import { beforeEach, describe, expect, it, vi } from 'vitest';
  import { fireEvent, render, screen } from '@testing-library/react';
  import '@testing-library/jest-dom/vitest';
  import { RegradeButton, type RegradeScope } from './RegradeButton';

  const fresh = () => ({ mutate: vi.fn(), reset: vi.fn(), isPending: false, isError: false, error: null as Error | null });
  const h = vi.hoisted(() => ({ one: null as unknown as ReturnType<typeof fresh>, many: null as unknown as ReturnType<typeof fresh> }));
  vi.mock('@/hooks/useRegrade', () => ({ useRegradeResult: () => h.one, useRegradeUngradable: () => h.many }));

  const session = (over: Partial<Extract<RegradeScope, { kind: 'session' }>> = {}): RegradeScope => ({
    kind: 'session', sessionId: 's1', reason: null, count: 2, ...over,
  });
  const single: RegradeScope = { kind: 'result', sessionId: 's1', resultId: 'r1' };

  beforeEach(() => {
    h.one = fresh();
    h.many = fresh();
  });

  const open = (label: string) => fireEvent.click(screen.getByRole('button', { name: label }));
  const confirm = () => fireEvent.click(screen.getByRole('button', { name: 'Xác nhận chấm lại' }));

  describe('RegradeButton (G3 §4.4, D10)', () => {
    it('opening the confirmation sends NOTHING, and states the count, the cost and that closing the page does not stop it', () => {
      render(<RegradeButton scope={session()} label="Chấm lại 2 bài lỗi hệ thống" />);
      open('Chấm lại 2 bài lỗi hệ thống');

      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveTextContent('Chấm lại 2 bài?');
      expect(dialog).toHaveTextContent('Mỗi bài là một lượt gọi mô hình có tính phí');
      expect(dialog).toHaveTextContent('Đóng trang không dừng việc chấm');
      expect(h.many.mutate).not.toHaveBeenCalled();
      expect(h.one.mutate).not.toHaveBeenCalled();
    });

    it('a session scope sends the reason (null = every system-class result) only after confirming', () => {
      render(<RegradeButton scope={session({ reason: null })} label="Chấm lại" />);
      open('Chấm lại');
      confirm();
      expect(h.many.mutate).toHaveBeenCalledTimes(1);
      expect(h.many.mutate).toHaveBeenCalledWith(null, expect.objectContaining({ onSuccess: expect.any(Function) }));
    });

    it('a same-reason scope names the reason in the confirmation and sends it verbatim', () => {
      render(<RegradeButton scope={session({ reason: 'Dịch vụ AI không phản hồi.', count: 3 })} label="Chấm lại 3 bài này" />);
      open('Chấm lại 3 bài này');
      expect(screen.getByRole('dialog')).toHaveTextContent('cùng lý do: “Dịch vụ AI không phản hồi.”');
      confirm();
      expect(h.many.mutate).toHaveBeenCalledWith('Dịch vụ AI không phản hồi.', expect.any(Object));
    });

    it('a result scope regrades that one result', () => {
      render(<RegradeButton scope={single} label="Chấm lại bài này" />);
      open('Chấm lại bài này');
      expect(screen.getByRole('dialog')).toHaveTextContent('Chấm lại bài này?');
      confirm();
      expect(h.one.mutate).toHaveBeenCalledWith('r1', expect.any(Object));
      expect(h.many.mutate).not.toHaveBeenCalled();
    });

    it('cancelling closes the confirmation and sends nothing', () => {
      render(<RegradeButton scope={session()} label="Chấm lại" />);
      open('Chấm lại');
      fireEvent.click(screen.getByRole('button', { name: 'Huỷ' }));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(h.many.mutate).not.toHaveBeenCalled();
    });

    it('shows the server refusal verbatim inside the confirmation', () => {
      h.many.isError = true;
      h.many.error = new Error('Bài này đang được chấm — chưa cần chấm lại.');
      render(<RegradeButton scope={session()} label="Chấm lại" />);
      open('Chấm lại');
      expect(screen.getByRole('alert')).toHaveTextContent('Bài này đang được chấm — chưa cần chấm lại.');
    });

    it('after success, says how many were re-queued and groups the skipped ones by their reason', () => {
      h.many.mutate = vi.fn((_reason: unknown, options: { onSuccess: (o: unknown) => void }) =>
        options.onSuccess({
          requeued: 2,
          skipped: [
            { resultId: 'a', reason: 'Bài đã đi tiếp — có lượt khác vừa xử lý nó.' },
            { resultId: 'b', reason: 'Bài đã đi tiếp — có lượt khác vừa xử lý nó.' },
          ],
        }),
      );
      render(<RegradeButton scope={session()} label="Chấm lại" />);
      open('Chấm lại');
      confirm();

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      const status = screen.getByRole('status');
      expect(status).toHaveTextContent('Đã xếp lại 2 bài');
      expect(status).toHaveTextContent('2 bài bỏ qua — Bài đã đi tiếp — có lượt khác vừa xử lý nó.');
    });
  });
  ```

  ```bash
  pnpm --filter web exec vitest run src/app/teacher/grading/_components/RegradeButton.test.tsx
  ```

  Expected: **RED** — `Failed to resolve import "./RegradeButton"`.

- [ ] **Step 2: GREEN.** Create `RegradeButton.tsx`. **Keep both hook calls and both `useState`s above any conditional** (rules of hooks):

  ```tsx
  'use client';

  import { useState } from 'react';
  import { Alert, AlertDescription } from '@/components/ui/alert';
  import { Button, type ButtonProps } from '@/components/ui/button';
  import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
  } from '@/components/ui/dialog';
  import { useRegradeResult, useRegradeUngradable } from '@/hooks/useRegrade';
  import type { RegradeOutcome } from '@/lib/api/regrade';

  export type RegradeScope =
    | { kind: 'result'; sessionId: string; resultId: string }
    | { kind: 'session'; sessionId: string; reason: string | null; count: number };

  /**
   * MỘT nút chấm lại cho cả bốn chỗ (đầu phiên, khối "đã dừng", hồ sơ, băng dịch vụ AI lỗi), để hộp xác nhận nói
   * đúng ba điều ở mọi nơi: (1) bao nhiêu bài; (2) mỗi bài là một lượt gọi mô hình CÓ TÍNH PHÍ; (3) đóng trang
   * không dừng việc chấm. Bấm nút chỉ MỞ hộp; chỉ "Xác nhận chấm lại" mới gửi.
   */
  export function RegradeButton({
    scope,
    label,
    variant = 'outline',
    size = 'sm',
  }: {
    scope: RegradeScope;
    label: string;
    variant?: ButtonProps['variant'];
    size?: ButtonProps['size'];
  }) {
    const one = useRegradeResult(scope.sessionId);
    const many = useRegradeUngradable(scope.sessionId);
    const [open, setOpen] = useState(false);
    const [outcome, setOutcome] = useState<RegradeOutcome | null>(null);

    const mutation = scope.kind === 'result' ? one : many;
    const count = scope.kind === 'session' ? scope.count : 1;

    const done = (data: RegradeOutcome) => {
      setOutcome(data);
      setOpen(false);
    };
    const confirm = () => {
      if (scope.kind === 'result') one.mutate(scope.resultId, { onSuccess: done });
      else many.mutate(scope.reason, { onSuccess: done });
    };

    const skippedByReason = new Map<string, number>();
    for (const skip of outcome?.skipped ?? []) {
      skippedByReason.set(skip.reason, (skippedByReason.get(skip.reason) ?? 0) + 1);
    }

    return (
      <>
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            variant={variant}
            size={size}
            onClick={() => {
              mutation.reset(); // một lỗi cũ không được hiện lại khi mở hộp lần sau
              setOutcome(null);
              setOpen(true);
            }}
          >
            {label}
          </Button>
          {outcome && (
            <Alert variant="success" role="status">
              <AlertDescription>
                <span className="block">
                  Đã xếp lại <strong>{outcome.requeued} bài</strong>.
                </span>
                {[...skippedByReason.entries()].map(([reason, n]) => (
                  <span key={reason} className="block">
                    {n} bài bỏ qua — {reason}
                  </span>
                ))}
              </AlertDescription>
            </Alert>
          )}
        </div>

        <Dialog open={open} onOpenChange={(next) => !next && setOpen(false)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{scope.kind === 'result' ? 'Chấm lại bài này?' : `Chấm lại ${count} bài?`}</DialogTitle>
              <DialogDescription>
                {scope.kind === 'result'
                  ? 'Bài này sẽ được chấm lại từ đầu.'
                  : `Bạn sắp chấm lại ${count} bài không chấm được do lỗi phía hệ thống${
                      scope.reason ? ` — cùng lý do: “${scope.reason}”` : ''
                    }.`}{' '}
                Mỗi bài là một lượt gọi mô hình có tính phí. Đóng trang không dừng việc chấm — kết quả hiện ở danh
                sách khi xong.
              </DialogDescription>
            </DialogHeader>
            {mutation.isError && mutation.error && (
              <Alert variant="destructive">
                <AlertDescription>{mutation.error.message}</AlertDescription>
              </Alert>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Huỷ
              </Button>
              <Button type="button" loading={mutation.isPending} onClick={confirm}>
                Xác nhận chấm lại
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }
  ```

  ```bash
  pnpm --filter web exec vitest run src/app/teacher/grading/_components/RegradeButton.test.tsx
  pnpm --filter web exec tsc --noEmit
  pnpm --filter web exec eslint src/app/teacher/grading/_components/RegradeButton.tsx
  ```

  Expected: 7 passed; `tsc` only the 7 known lines; eslint 0 errors. (`mutation.reset()` is the real `UseMutationResult` method; the test mocks provide it.)

- [ ] **Step 3: commit.** Title: `feat(web): RegradeButton — một hộp xác nhận nói số bài, chi phí và việc đóng trang không dừng chấm`.

---

### Task 10: the header button becomes real, and counts only what can be regraded

**Files:** `apps/web/src/app/teacher/grading/_components/SessionHeader.tsx`, `apps/web/src/app/teacher/grading/page.tsx`, `apps/web/src/app/teacher/grading/page.test.tsx` (modify). (`SessionHeader` has no test file of its own; `page.test.tsx` renders it for real.)

**Interfaces**
- Consumes: `RegradeButton` (Task 9), `countSystemUngradable` (Task 8).
- Produces: `SessionHeader`'s `systemFailed` now means *system-class ungradable results*; the header renders a `RegradeButton` (session scope, `reason: null`).

- [ ] **Step 1: RED — replace the two old tests.** In `page.test.tsx` add, next to the other `_components` mocks (after the `BulkAcceptEssays` mock line):

  ```tsx
  vi.mock('./_components/RegradeButton', () => ({
    RegradeButton: ({ scope, label }: { scope: unknown; label: string }) => (
      <button type="button" data-scope={JSON.stringify(scope)}>
        {label}
      </button>
    ),
  }));
  ```

  Replace exactly the test

  ```tsx
    it('"Chấm lại N bài lỗi hệ thống" is disabled + "cần backend" and sends nothing', () => {
      h.results = { ...h.results, data: [result({ id: 'a' }), result({ id: 'b', status: 'flagged_for_review', ungradableReason: 'x', currentScore: null })] };
      render(<GradingPage />);
      const button = screen.getByRole('button', { name: /Chấm lại 1 bài lỗi hệ thống/ });
      expect(button).toBeDisabled();
      fireEvent.click(button);
      expect(h.regradeMutate).not.toHaveBeenCalled();
    });
  ```

  with the two tests below. Record a `Ruling:` line: the removed test stated the pre-G3 behaviour ("disabled + cần backend"), which G3 deliberately changes; its fixture also had no `ungradableClass`, which now counts as *not countable* by design (Review Focus #5).

  ```tsx
    it('"Chấm lại N bài lỗi hệ thống" is a real button that counts only SYSTEM-class results', () => {
      h.results = {
        ...h.results,
        data: [
          result({ id: 'a' }),
          result({ id: 'b', status: 'flagged_for_review', ungradableReason: 'x', ungradableClass: 'system', currentScore: null }),
          result({ id: 'c', status: 'flagged_for_review', ungradableReason: 'y', ungradableClass: 'submission', currentScore: null }),
        ],
      };
      render(<GradingPage />);
      const button = screen.getByRole('button', { name: 'Chấm lại 1 bài lỗi hệ thống' });
      expect(button).toBeEnabled();
      expect(button).toHaveAttribute('data-scope', JSON.stringify({ kind: 'session', sessionId: 's1', reason: null, count: 1 }));
    });

    // Review Focus #5: an old API sends no class. A number that may be wrong is worse than no button.
    it('offers no regrade for a stopped result whose class the API did not send', () => {
      h.results = {
        ...h.results,
        data: [result({ id: 'a' }), result({ id: 'b', status: 'flagged_for_review', ungradableReason: 'x', currentScore: null })],
      };
      render(<GradingPage />);
      expect(screen.queryByRole('button', { name: /lỗi hệ thống/ })).not.toBeInTheDocument();
    });
  ```

  The existing test right after it, `'does not offer that regrade when nothing failed'`, stays unchanged.

  ```bash
  pnpm --filter web exec vitest run src/app/teacher/grading/page.test.tsx
  ```

  Expected: **RED** — the first new test fails (the header still renders the disabled button with `counts.ungradable`, so the label says `Chấm lại 2 bài…` and there is no `data-scope`).

- [ ] **Step 2: GREEN — `SessionHeader.tsx`.** Replace exactly `import { NeedsBackend } from '@/components/needs-backend';` with `import { RegradeButton } from './RegradeButton';`. Replace exactly `(mang nhãn *cần backend*, §2.3)` (in the doc comment) with `(chỉ đếm bài lớp system, có hộp xác nhận, §2.3)`. Replace exactly

  ```tsx
    /** Số bài "không chấm được" — chấm lại cả loạt là thứ backend chưa có. */
  ```

  with

  ```tsx
    /** Số bài "không chấm được" do lỗi hệ thống (lớp `system`) — đúng số bài mà nút chấm lại sẽ xử lý. */
  ```

  and replace exactly

  ```tsx
          {systemFailed > 0 && (
            <Button type="button" variant="outline" disabled>
              Chấm lại {systemFailed} bài lỗi hệ thống
              <NeedsBackend className="ml-2" />
            </Button>
          )}
  ```

  with

  ```tsx
          {systemFailed > 0 && (
            <RegradeButton
              scope={{ kind: 'session', sessionId, reason: null, count: systemFailed }}
              label={`Chấm lại ${systemFailed} bài lỗi hệ thống`}
            />
          )}
  ```

- [ ] **Step 3: GREEN — `page.tsx`.** Add `import { countSystemUngradable } from '@/lib/regrade-triage';` directly after `import type { SessionOverviewItem } from '@/lib/api/submissions';`, and replace exactly

  ```tsx
        <SessionHeader session={session} sessionId={sessionId} resultCount={list.length} systemFailed={counts.ungradable} />
  ```

  with

  ```tsx
        <SessionHeader session={session} sessionId={sessionId} resultCount={list.length} systemFailed={countSystemUngradable(list)} />
  ```

  (G2 adds one line directly **below** this element; stream S and G2 also edit this file — see the touch-point table.)

  ```bash
  pnpm --filter web exec vitest run src/app/teacher/grading/page.test.tsx
  pnpm --filter web exec tsc --noEmit
  pnpm --filter web exec eslint src/app/teacher/grading/page.tsx src/app/teacher/grading/_components/SessionHeader.tsx
  ```

  Expected: green; `tsc` only the 7 known lines; eslint 0 errors (a now-unused `Button`/`NeedsBackend` import is the usual finding — `SessionHeader` still uses `Button` for *Đổi phiên*/*Chốt điểm phiên*; remove only what is truly unused).

- [ ] **Step 4: commit.** Title: `feat(web): nút chấm lại đầu phiên là nút thật và chỉ đếm bài lớp system`.

---

### Task 11: the "stopped" block in `RunningPanel`

**Files:** `apps/web/src/app/teacher/grading/_components/RunningPanel.tsx`, `RunningPanel.test.tsx`, `apps/web/src/app/teacher/grading/page.tsx` (modify).

**Interfaces**
- Consumes: `RegradeButton`, `countSystemUngradable`.
- Produces: `RunningPanel` gains the required prop `sessionId: string`.

- [ ] **Step 1: RED — `RunningPanel.test.tsx`.** Add the mock right after the imports (before `const result = …`):

  ```tsx
  vi.mock('./RegradeButton', () => ({
    RegradeButton: ({ scope, label }: { scope: unknown; label: string }) => (
      <button type="button" data-scope={JSON.stringify(scope)}>
        {label}
      </button>
    ),
  }));
  ```

  Give the two stopped fixtures a class — replace exactly

  ```tsx
    result({ id: '3', status: 'flagged_for_review', ungradableReason: 'Môi trường chạy bài hết giờ' }),
    result({ id: '4', status: 'flagged_for_review', ungradableReason: 'Môi trường chạy bài hết giờ' }),
  ```

  with

  ```tsx
    result({ id: '3', status: 'flagged_for_review', ungradableReason: 'Môi trường chạy bài hết giờ', ungradableClass: 'system' }),
    result({ id: '4', status: 'flagged_for_review', ungradableReason: 'Môi trường chạy bài hết giờ', ungradableClass: 'system' }),
  ```

  Give `props()` the new prop — replace exactly `  onRegradeStuck: vi.fn(),\n  regrade: { isPending: false, isError: false, error: null, data: undefined },\n  ...over,` (three lines) with:

  ```tsx
    onRegradeStuck: vi.fn(),
    sessionId: 's1',
    regrade: { isPending: false, isError: false, error: null, data: undefined },
    ...over,
  ```

  Replace exactly the test

  ```tsx
    it('regrading system-stopped results is disabled + "cần backend" and sends nothing', () => {
      const onRegradeStuck = vi.fn();
      render(<RunningPanel {...props({ onRegradeStuck })} />);
      const button = screen.getByRole('button', { name: /Chấm lại 2 bài lỗi hệ thống/ });
      expect(button).toBeDisabled();
      fireEvent.click(button);
      expect(onRegradeStuck).not.toHaveBeenCalled();
    });
  ```

  with the two tests below (record a `Ruling:` line — the removed test stated the pre-G3 behaviour, deliberately changed). The describe title `'…what the API cannot tell yet is labelled, not invented (T-UI-10)'` still fits the remaining *"Đang chạy ngay lúc này"* test; leave it.

  ```tsx
    it('regrading system-stopped results is a real button carrying the SYSTEM count', () => {
      render(<RunningPanel {...props()} />);
      const button = screen.getByRole('button', { name: 'Chấm lại 2 bài lỗi hệ thống' });
      expect(button).toBeEnabled();
      expect(button).toHaveAttribute('data-scope', JSON.stringify({ kind: 'session', sessionId: 's1', reason: null, count: 2 }));
    });

    it('a stopped result of class "submission" is not regradable: still said as stopped, but no button', () => {
      render(
        <RunningPanel
          {...props({
            results: [
              result({ id: '1' }),
              result({ id: '3', status: 'flagged_for_review', ungradableReason: 'Bài nộp rỗng', ungradableClass: 'submission' }),
            ],
          })}
        />,
      );
      expect(screen.getByText(/1 bài đã dừng/)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /lỗi hệ thống/ })).not.toBeInTheDocument();
    });
  ```

  ```bash
  pnpm --filter web exec vitest run src/app/teacher/grading/_components/RunningPanel.test.tsx
  ```

  Expected: **RED** — the first new test fails (still a disabled button, and no `data-scope`).

- [ ] **Step 2: GREEN — `RunningPanel.tsx`.** Replace exactly `import { NeedsBackend } from '@/components/needs-backend';` with

  ```tsx
  import { NeedsBackend } from '@/components/needs-backend';
  import { countSystemUngradable } from '@/lib/regrade-triage';
  import { RegradeButton } from './RegradeButton';
  ```

  (`NeedsBackend` stays: the *"Đang chạy ngay lúc này"* block at line 175 keeps its badge.) Replace the two doc-comment lines

  ```tsx
   * KHÔNG. Không băng nào chỉ ghi "đã xảy ra lỗi". Cái API chưa nói được (bài nào đang chạy công cụ gì, dịch vụ
   * AI lỗi hàng loạt) mang nhãn *cần backend* và không gửi gì.
  ```

  with

  ```tsx
   * KHÔNG. Không băng nào chỉ ghi "đã xảy ra lỗi". Cái API chưa nói được (bài nào đang chạy công cụ gì) mang nhãn
   * *cần backend* và không gửi gì. Chấm lại bài dừng vì lỗi hệ thống thì ĐÃ có route (G3): nút thật, có hộp xác nhận.
  ```

  Add the prop — replace exactly

  ```tsx
    onRegradeStuck,
    regrade,
  }: {
  ```

  with

  ```tsx
    onRegradeStuck,
    regrade,
    sessionId,
  }: {
  ```

  and replace exactly

  ```tsx
    onRegradeStuck: () => void;
    regrade: {
  ```

  with

  ```tsx
    onRegradeStuck: () => void;
    /** Phiên đang chấm — để nút chấm lại biết chấm lại ở đâu. */
    sessionId: string;
    regrade: {
  ```

  Replace exactly `  const stopped = Math.min(stoppedCount, progress.done);` with

  ```tsx
    const stopped = Math.min(stoppedCount, progress.done);
    // Chỉ lớp `system` chấm lại được; lớp `submission` chấm lại ra đúng kết quả cũ.
    const systemStopped = countSystemUngradable(results);
  ```

  and replace exactly

  ```tsx
            <p className="flex-1 text-small text-muted-foreground">
              {stopped} bài đã dừng. Bài dừng vì lỗi hệ thống chưa có điểm nào; chấm lại cả loạt cần một route mà backend
              chưa có.
            </p>
            <Button type="button" size="sm" variant="outline" disabled>
              Chấm lại {stopped} bài lỗi hệ thống
              <NeedsBackend className="ml-2" />
            </Button>
  ```

  with

  ```tsx
            <p className="flex-1 text-small text-muted-foreground">
              {stopped} bài đã dừng. Bài dừng vì lỗi hệ thống chưa có điểm nào
              {systemStopped > 0 ? ` — ${systemStopped} bài trong số đó chấm lại được.` : '.'}
            </p>
            {systemStopped > 0 && (
              <RegradeButton
                scope={{ kind: 'session', sessionId, reason: null, count: systemStopped }}
                label={`Chấm lại ${systemStopped} bài lỗi hệ thống`}
              />
            )}
  ```

  In `page.tsx` pass the prop — replace exactly

  ```tsx
              onRegradeStuck={() => regrade.mutate()}
  ```

  with

  ```tsx
              onRegradeStuck={() => regrade.mutate()}
              sessionId={sessionId}
  ```

  ```bash
  pnpm --filter web exec vitest run src/app/teacher/grading/_components/RunningPanel.test.tsx src/app/teacher/grading/page.test.tsx
  pnpm --filter web exec tsc --noEmit
  pnpm --filter web exec eslint src/app/teacher/grading/_components/RunningPanel.tsx
  ```

  Expected: green; `tsc` only the 7 known lines (a missing `sessionId` at another `<RunningPanel>` call site is a real error — there is only `page.tsx`); eslint 0 errors. The other `RunningPanel` tests (stuck-jobs button *Chấm tiếp N bài treo*, offline, server-down) must be untouched and green.

- [ ] **Step 3: commit.** Title: `feat(web): khối "bài đã dừng" ở màn đang chấm có nút chấm lại thật`.

---

### Task 12: the dossier — `UngradableView` and `InvestigatorDossier`

**Files:** `apps/web/src/app/teacher/grading/[resultId]/_components/investigator/UngradableView.tsx`, `UngradableView.test.tsx`, `InvestigatorDossier.tsx`, `InvestigatorDossier.test.tsx` (modify).

**Interfaces**
- Consumes: `RegradeButton`, `groupByUngradableReason`.
- Produces: `UngradableView` gains the required props `sessionId: string`, `resultId: string`, `sameReasonCount: number`.

- [ ] **Step 1: RED — `UngradableView.test.tsx`.** Replace the whole file with (tests 1, 2, 4, 5 keep their assertions; 3 is replaced; a sixth is new — record a `Ruling:` line for test 3: the old one asserted `disabled` + two *cần backend* badges):

  ```tsx
  import { render, screen, fireEvent } from '@testing-library/react';
  import '@testing-library/jest-dom/vitest';
  import { describe, expect, it, vi } from 'vitest';
  import { UngradableView } from './UngradableView';

  vi.mock('@/app/teacher/grading/_components/RegradeButton', () => ({
    RegradeButton: ({ scope, label }: { scope: unknown; label: string }) => (
      <button type="button" data-scope={JSON.stringify(scope)}>
        {label}
      </button>
    ),
  }));

  const investigation = {
    summary: 'x',
    investigation: { toolCalls: [{ id: 'tc-1', tool: 'run_tests', args: {}, status: 'error', output: 'timeout', startedAt: '', wallMs: 0, injectionSuspected: false }] },
  } as never;

  const view = (over: Partial<React.ComponentProps<typeof UngradableView>> = {}) => (
    <UngradableView
      sessionId="s1"
      resultId="r1"
      sameReasonCount={1}
      ungradableClass="system"
      ungradableReason="x"
      investigation={investigation}
      onOpenManualScore={vi.fn()}
      {...over}
    />
  );

  describe('UngradableView', () => {
    it('shows "—" for the score, never 0 or the max (T-UI-5)', () => {
      render(view({ ungradableReason: 'Sandbox không phản hồi.' }));
      expect(screen.getByText('—')).toBeInTheDocument();
      expect(screen.queryByText('10')).not.toBeInTheDocument();
    });

    it('says "môi trường chạy bài", never "sandbox" (spec §2.2 fix #2)', () => {
      render(view({ ungradableReason: 'Môi trường chạy bài không phản hồi.' }));
      expect(screen.queryByText(/sandbox/i)).not.toBeInTheDocument();
    });

    it('class "system": a real regrade for THIS result, and one for all results sharing the reason when there are several (§2.3)', () => {
      render(view({ sameReasonCount: 3, ungradableReason: 'Dịch vụ AI không phản hồi.' }));
      const one = screen.getByRole('button', { name: 'Chấm lại bài này' });
      expect(one).toBeEnabled();
      expect(one).toHaveAttribute('data-scope', JSON.stringify({ kind: 'result', sessionId: 's1', resultId: 'r1' }));
      const all = screen.getByRole('button', { name: 'Chấm lại cả 3 bài cùng lý do' });
      expect(all).toHaveAttribute(
        'data-scope',
        JSON.stringify({ kind: 'session', sessionId: 's1', reason: 'Dịch vụ AI không phản hồi.', count: 3 }),
      );
      expect(screen.queryByText(/cần backend/i)).not.toBeInTheDocument();
    });

    it('with no other result sharing the reason there is no "cả … bài" button — it would only repeat the first', () => {
      render(view({ sameReasonCount: 1 }));
      expect(screen.getByRole('button', { name: 'Chấm lại bài này' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Chấm lại cả/ })).not.toBeInTheDocument();
    });

    it('never offers a regrade path for class "submission" — only chấm tay', () => {
      render(view({ ungradableClass: 'submission' }));
      expect(screen.queryByRole('button', { name: /Chấm lại/i })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Chấm tay bài này' })).toBeEnabled();
    });

    it('calls onOpenManualScore, and does not mount its own dialog', () => {
      const onOpenManualScore = vi.fn();
      render(view({ ungradableClass: 'submission', onOpenManualScore }));
      fireEvent.click(screen.getByRole('button', { name: 'Chấm tay bài này' }));
      expect(onOpenManualScore).toHaveBeenCalled();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });
  ```

  ```bash
  pnpm --filter web exec vitest run "src/app/teacher/grading/[resultId]/_components/investigator/UngradableView.test.tsx"
  ```

  Expected: **RED** — `sessionId`/`resultId`/`sameReasonCount` are not props yet (`tsc`/runtime), and the regrade buttons are still the disabled ones.

- [ ] **Step 2: GREEN — `UngradableView.tsx`.** Replace exactly `import { NeedsBackend } from '@/components/needs-backend';` with `import { RegradeButton } from '@/app/teacher/grading/_components/RegradeButton';`. Replace the props

  ```tsx
  export function UngradableView({
    ungradableClass,
    ungradableReason,
    investigation,
    onOpenManualScore,
  }: {
    ungradableClass: 'system' | 'submission';
    ungradableReason: string;
    investigation: ResultDetail['investigation'];
    onOpenManualScore: () => void;
  }) {
  ```

  with

  ```tsx
  export function UngradableView({
    sessionId,
    resultId,
    sameReasonCount,
    ungradableClass,
    ungradableReason,
    investigation,
    onOpenManualScore,
  }: {
    sessionId: string;
    resultId: string;
    /** Bao nhiêu bài lớp system của phiên mang ĐÚNG câu lý do này (kể cả bài này). */
    sameReasonCount: number;
    ungradableClass: 'system' | 'submission';
    ungradableReason: string;
    investigation: ResultDetail['investigation'];
    onOpenManualScore: () => void;
  }) {
  ```

  and replace exactly

  ```tsx
              {ungradableClass === 'system' && (
                <>
                  <Button disabled>
                    Chấm lại bài này
                    <NeedsBackend className="ml-2" />
                  </Button>
                  <Button variant="outline" disabled>
                    Chấm lại cả các bài cùng lý do
                    <NeedsBackend className="ml-2" />
                  </Button>
                </>
              )}
  ```

  with

  ```tsx
              {ungradableClass === 'system' && (
                <>
                  <RegradeButton
                    scope={{ kind: 'result', sessionId, resultId }}
                    label="Chấm lại bài này"
                    variant="default"
                    size="default"
                  />
                  {sameReasonCount > 1 && (
                    <RegradeButton
                      scope={{ kind: 'session', sessionId, reason: ungradableReason, count: sameReasonCount }}
                      label={`Chấm lại cả ${sameReasonCount} bài cùng lý do`}
                      size="default"
                    />
                  )}
                </>
              )}
  ```

  (`Button` stays imported — *Chấm tay bài này* still uses it.)

- [ ] **Step 3: RED → GREEN — `InvestigatorDossier`.** In `InvestigatorDossier.test.tsx` add the mock after the `useSubmissionOverview` mock line (`vi.mock('@/hooks/useSubmissionOverview', () => ({ useSessionOverview: () => overviewMock() }));`):

  ```tsx
  vi.mock('@/app/teacher/grading/_components/RegradeButton', () => ({
    RegradeButton: ({ scope, label }: { scope: unknown; label: string }) => (
      <button type="button" data-scope={JSON.stringify(scope)}>
        {label}
      </button>
    ),
  }));
  ```

  Replace exactly the assertion

  ```tsx
      expect(screen.getByRole('button', { name: /Chấm lại bài này/ })).toBeDisabled();
  ```

  with

  ```tsx
      expect(screen.getByRole('button', { name: /Chấm lại bài này/ })).toBeEnabled();
  ```

  (record a `Ruling:` line), and add after that test (`'renders the Ungradable view when ungradableClass is set'`):

  ```tsx
    it('offers to regrade every result sharing the reason, counted from the session list', () => {
      resultsMock = () => ({
        data: [
          { ...baseResult, ungradableReason: 'x', ungradableClass: 'system' },
          { ...baseResult, id: 'r2', ungradableReason: 'x', ungradableClass: 'system' },
          { ...baseResult, id: 'r3', ungradableReason: 'x', ungradableClass: 'submission' },
        ],
        isLoading: false,
        isError: false,
      });
      detailMock = () => ({
        data: { pipeline: 'investigator', currentScore: null, currentScoreSource: 'none', status: 'flagged_for_review', ungradableClass: 'system', ungradableReason: 'x', breakdown: null, investigation: { summary: 's', investigation: { toolCalls: [] } }, challengeNotes: [], challengeVerdicts: [] },
        isLoading: false,
      });
      render(<InvestigatorDossier resultId="r1" sessionId="s1" />);
      expect(screen.getByRole('button', { name: 'Chấm lại cả 2 bài cùng lý do' })).toHaveAttribute(
        'data-scope',
        JSON.stringify({ kind: 'session', sessionId: 's1', reason: 'x', count: 2 }),
      );
    });
  ```

  Run the file — **RED** (`sameReasonCount` is not passed, so no `cả 2 bài` button and the props are missing). Then in `InvestigatorDossier.tsx` add `import { groupByUngradableReason } from '@/lib/regrade-triage';` directly after `import { useSessionOverview } from '@/hooks/useSubmissionOverview';`, and replace exactly

  ```tsx
    if (d.ungradableClass && !handGraded) {
      return (
        <div className="flex flex-col gap-4">
          {header(d.status, d.ungradableReason)}
          <UngradableView
            ungradableClass={d.ungradableClass as 'system' | 'submission'}
  ```

  with

  ```tsx
    if (d.ungradableClass && !handGraded) {
      // Bao nhiêu bài lớp system của phiên mang ĐÚNG câu lý do này — cho nút "chấm lại cả … bài cùng lý do".
      const sameReasonCount =
        groupByUngradableReason(results.data ?? []).find((g) => g.reason === (d.ungradableReason ?? ''))?.count ?? 1;
      return (
        <div className="flex flex-col gap-4">
          {header(d.status, d.ungradableReason)}
          <UngradableView
            sessionId={sessionId}
            resultId={resultId}
            sameReasonCount={sameReasonCount}
            ungradableClass={d.ungradableClass as 'system' | 'submission'}
  ```

  ```bash
  pnpm --filter web exec vitest run "src/app/teacher/grading/[resultId]"
  pnpm --filter web exec tsc --noEmit
  pnpm --filter web exec eslint "src/app/teacher/grading/[resultId]/_components/investigator/UngradableView.tsx" "src/app/teacher/grading/[resultId]/_components/investigator/InvestigatorDossier.tsx"
  ```

  Expected: the whole `[resultId]` tree green — including the two tests that must **not** have changed: `UngradableView` *class "submission" never offers a regrade* and `InvestigatorDossier` *bài đã chấm tay → không có nút "Chấm lại bài này"*; `tsc` only the 7 known lines; eslint 0 errors. (G2 edits the *final* return of the same file — a different region.)

- [ ] **Step 4: commit.** Title: `feat(web): hồ sơ bài không chấm được có nút chấm lại thật, đếm cả các bài cùng lý do`.

---

### Task 13: the "Dịch vụ AI lỗi" band

**Files:** create `apps/web/src/app/teacher/grading/_components/AiServiceBand.tsx`, `AiServiceBand.test.tsx`; modify `apps/web/src/app/teacher/grading/page.tsx`, `page.test.tsx`.

**Interfaces**
- Consumes: `groupByUngradableReason` (Task 8), `RegradeButton` (Task 9).
- Produces: `AiServiceBand({ sessionId, results })`.

- [ ] **Step 1: RED — the component test.** Create `AiServiceBand.test.tsx`:

  ```tsx
  import { describe, expect, it, vi } from 'vitest';
  import { render, screen } from '@testing-library/react';
  import '@testing-library/jest-dom/vitest';
  import type { GradingResult } from '@/lib/api/grading';
  import { AiServiceBand } from './AiServiceBand';

  vi.mock('./RegradeButton', () => ({
    RegradeButton: ({ scope, label }: { scope: unknown; label: string }) => (
      <button type="button" data-scope={JSON.stringify(scope)}>
        {label}
      </button>
    ),
  }));

  const result = (over: Partial<GradingResult> = {}): GradingResult => ({
    id: 'r', submissionId: 's', studentMssv: '1', studentName: 'An', homeClassId: 'c', homeClassName: 'N01',
    status: 'flagged_for_review', modelUsed: null, aiTotalScore: null, confidence: null, flagForReview: true,
    ungradableReason: 'Dịch vụ AI không phản hồi.', criterionResults: [], advocateOpinion: null,
    contextUsedQuestion: null, contextUsedModelAnswer: null, finalScore: null, reviewedAt: null,
    reviewedByName: null, editedCriteria: null, pipeline: 'one_shot', currentScore: null,
    currentScoreSource: 'computation', ungradableClass: 'system', ...over,
  });
  const band = (results: GradingResult[]) => render(<AiServiceBand sessionId="s1" results={results} />);

  describe('AiServiceBand (G3 D12)', () => {
    it('two system-class results with the same reason → says so, quotes the reason, offers to regrade exactly those', () => {
      band([result({ id: 'a' }), result({ id: 'b' })]);
      expect(screen.getByText(/Dịch vụ AI lỗi — 2 bài không chấm được cùng một lý do/)).toBeInTheDocument();
      expect(screen.getByText(/“Dịch vụ AI không phản hồi\.”/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Chấm lại 2 bài này' })).toHaveAttribute(
        'data-scope',
        JSON.stringify({ kind: 'session', sessionId: 's1', reason: 'Dịch vụ AI không phản hồi.', count: 2 }),
      );
    });

    it('says plainly what it measures — the same reason, not a time window (the list carries no stop time)', () => {
      band([result({ id: 'a' }), result({ id: 'b' })]);
      expect(screen.getByText(/không đo được khoảng thời gian/)).toBeInTheDocument();
    });

    it('one stopped result is an ordinary failure — no band', () => {
      const { container } = band([result({ id: 'a' })]);
      expect(container).toBeEmptyDOMElement();
    });

    it('two stopped results with DIFFERENT reasons — no band', () => {
      const { container } = band([result({ id: 'a' }), result({ id: 'b', ungradableReason: 'Hết giờ' })]);
      expect(container).toBeEmptyDOMElement();
    });

    it('submission-class results and results without a class never make a band, even with the same text', () => {
      const { container } = band([
        result({ id: 'a', ungradableClass: 'submission' }),
        result({ id: 'b', ungradableClass: 'submission' }),
        result({ id: 'c', ungradableClass: undefined }),
        result({ id: 'd', ungradableClass: undefined }),
      ]);
      expect(container).toBeEmptyDOMElement();
    });

    it('offers the LARGEST group when there are several', () => {
      band([
        result({ id: 'a', ungradableReason: 'Hết giờ' }),
        result({ id: 'b', ungradableReason: 'Hết giờ' }),
        result({ id: 'c', ungradableReason: 'Hết giờ' }),
        result({ id: 'd', ungradableReason: 'AI lỗi' }),
        result({ id: 'e', ungradableReason: 'AI lỗi' }),
      ]);
      expect(screen.getByRole('button', { name: 'Chấm lại 3 bài này' })).toBeInTheDocument();
    });
  });
  ```

  ```bash
  pnpm --filter web exec vitest run src/app/teacher/grading/_components/AiServiceBand.test.tsx
  ```

  Expected: **RED** — `Failed to resolve import "./AiServiceBand"`.

- [ ] **Step 2: GREEN.** Create `AiServiceBand.tsx`:

  ```tsx
  'use client';

  import { Alert, AlertDescription } from '@/components/ui/alert';
  import type { GradingResult } from '@/lib/api/grading';
  import { groupByUngradableReason } from '@/lib/regrade-triage';
  import { RegradeButton } from './RegradeButton';

  /**
   * Băng "Dịch vụ AI lỗi" (UI spec §3.8, hàng "dịch vụ AI lỗi"): nhiều bài lớp system dừng vì CÙNG một lý do.
   *
   * Nó đo "cùng lý do", KHÔNG đo "trong một khoảng ngắn" như spec §4 mô tả: danh sách kết quả không mang lúc từng bài
   * dừng, nên khoảng thời gian không đo được — và băng nói thẳng điều đó thay vì giả vờ. Một bài đơn lẻ là lỗi bình
   * thường, không phải sự cố; từ hai bài cùng lý do trở lên mới hiện.
   */
  export function AiServiceBand({ sessionId, results }: { sessionId: string; results: GradingResult[] }) {
    const top = groupByUngradableReason(results)[0];
    if (!top || top.count < 2) return null;

    return (
      <Alert variant="warning">
        <AlertDescription className="flex flex-col gap-2">
          <span>
            <strong>Dịch vụ AI lỗi — {top.count} bài không chấm được cùng một lý do:</strong> “{top.reason}”
          </span>
          <span className="text-caption">
            Đếm theo cùng một lý do trong danh sách hiện tại — không đo được khoảng thời gian, vì danh sách không ghi lúc
            từng bài dừng. Khi dịch vụ đã ổn, chấm lại các bài này; bài khác lý do giữ nguyên.
          </span>
          <span>
            <RegradeButton
              scope={{ kind: 'session', sessionId, reason: top.reason, count: top.count }}
              label={`Chấm lại ${top.count} bài này`}
            />
          </span>
        </AlertDescription>
      </Alert>
    );
  }
  ```

  ```bash
  pnpm --filter web exec vitest run src/app/teacher/grading/_components/AiServiceBand.test.tsx
  ```

  Expected: 6 passed.

- [ ] **Step 3: mount it.** In `page.test.tsx` add a `describe` after the header-regrade tests' `describe` (the one that holds `'"Chấm lại N bài lỗi hệ thống" is a real button…'`) — at top level:

  ```tsx
  describe('AI service band (G3 D12)', () => {
    const stopped = (id: string, over: Partial<GradingResult> = {}) =>
      result({ id, status: 'flagged_for_review', ungradableReason: 'Dịch vụ AI không phản hồi.', ungradableClass: 'system', currentScore: null, ...over });

    it('is mounted on the session screen and offers to regrade exactly the shared-reason group', () => {
      h.results = { ...h.results, data: [stopped('a'), stopped('b'), result({ id: 'c' })] };
      render(<GradingPage />);
      const band = screen.getByText(/Dịch vụ AI lỗi — 2 bài không chấm được cùng một lý do/).closest('[role="alert"]') as HTMLElement;
      expect(within(band).getByRole('button', { name: 'Chấm lại 2 bài này' })).toHaveAttribute(
        'data-scope',
        JSON.stringify({ kind: 'session', sessionId: 's1', reason: 'Dịch vụ AI không phản hồi.', count: 2 }),
      );
    });

    it('is absent when only one result stopped', () => {
      h.results = { ...h.results, data: [stopped('a'), result({ id: 'c' })] };
      render(<GradingPage />);
      expect(screen.queryByText(/Dịch vụ AI lỗi —/)).not.toBeInTheDocument();
    });
  });
  ```

  Add `GradingResult` to the existing type import in that file if it is not already imported (it is: `import type { GradingProgress, GradingResult, ResultTriage } from '@/lib/api/grading';`). Run it — **RED** (no band is mounted). Then in `page.tsx` add `import { AiServiceBand } from './_components/AiServiceBand';` next to the other `./_components/` imports and replace exactly

  ```tsx
        {loading ? (
          <Skeleton className="h-64 w-full" />
  ```

  with

  ```tsx
        <AiServiceBand sessionId={sessionId} results={list} />

        {loading ? (
          <Skeleton className="h-64 w-full" />
  ```

  ```bash
  pnpm --filter web exec vitest run src/app/teacher/grading
  pnpm --filter web exec tsc --noEmit
  pnpm --filter web exec eslint src/app/teacher/grading
  ```

  Expected: the whole `src/app/teacher/grading` tree green; `tsc` only the 7 known lines; eslint 0 errors.

- [ ] **Step 4: commit.** Title: `feat(web): băng "Dịch vụ AI lỗi" khi nhiều bài lớp system dừng cùng một lý do`.

---

### Task 14: full verification, the three old freeze tests, ledger, and an honest report

**Files:** `docs/superpowers/ledgers/2026-09-29-regrade-ungradable.md` (create, committed — unlike the in-progress ledger this one is a deliverable).

- [ ] **Step 1: Backend unit tests.**

  ```bash
  pnpm --filter api exec jest
  ```

  Expected: the whole suite green. Baseline on `feat/grading-gaps-g1-g5` is 1167 passing, 7 skipped (pre-existing); this package adds 12 (`regrade.service.spec.ts`). A lower number is a regression — re-run before concluding.

- [ ] **Step 2: Backend e2e — this package's suites plus the neighbours.** Kill stray workers first (they eat BullMQ jobs from a shared Redis):

  ```bash
  # List jest workers; stop ONLY the ones whose command line shows THIS worktree's path, by PID (Stop-Process -Id <pid>).
  # Never `taskkill /IM node.exe`: it also kills the jest runs and dev servers of every other session on this machine.
  powershell.exe -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -match 'jest' } | Select-Object ProcessId, CommandLine"
  ```

  ```bash
  pnpm --filter api exec jest --config ./test/jest-e2e.json test/regrade.e2e-spec.ts test/regrade-loop.e2e-spec.ts test/regrade-real-queue.e2e-spec.ts test/grading-results-triage.e2e-spec.ts
  pnpm --filter api exec jest --config ./test/jest-e2e.json test/grading.e2e-spec.ts test/grading-queue.e2e-spec.ts test/grading-lifecycle-v2.e2e-spec.ts test/investigator-run.e2e-spec.ts test/finish-attempt.e2e-spec.ts test/grading-freeze.e2e-spec.ts test/grading-reference.e2e-spec.ts test/session-rubric.e2e-spec.ts
  pnpm --filter api exec jest --config ./test/jest-e2e.json
  ```

  Expected: all green. Compare the full-run totals against the G1 baseline recorded in `.superpowers/sdd/2026-09-29-grading-truth-debts/progress.md` (read it; do not guess): 10 suites / 110 tests there, plus this package's 3 new suites (**23 + 1 + 1** tests) and 1 extended.

- [ ] **Step 3: Web tests, typecheck, lint, cycles, build.**

  ```bash
  pnpm --filter web exec vitest run
  pnpm --filter web exec tsc --noEmit > tsc-g3.txt
  pnpm --filter web exec eslint src
  pnpm --filter api exec eslint src
  pnpm check:cycles
  pnpm --filter web run build
  ```

  Expected: vitest green (G1 baseline: 96 files / 1190 tests; this package adds `regrade-triage` (7), `RegradeButton` (7), `AiServiceBand` (6) and net changes in five files); `tsc-g3.txt` is **byte-identical** to the G1 baseline — 7 lines, all in `src/lib/read-workbook.test.ts`, any other line is a regression from this package; eslint 0 errors; `0 vòng lặp`; **one** `next build`.

- [ ] **Step 4: The three older tests the spec says encode the OLD freeze rule.** For each, read the test and `apps/api/src/grading/grading-lock.ts`, state in the ledger what rule the test asserts, and whether it still matches rule 6 (*a session unlocks when every result is a stopped ungradable one*). **Change one only if it is wrong**; if it is right, record "checked, unchanged" — do not edit it to have something to show.

  ```bash
  grep -n "T-FREEZE-1\|T-FREEZE-3\|T-ATT-2" apps/api/test/*.ts apps/api/src/**/*.spec.ts
  grep -n "409" apps/api/test/session-rubric.e2e-spec.ts
  ```

  Known so far (from reading): `grading-reference.e2e-spec.ts` already has `T-FREEZE-3` — *a session with only ungradable results → editing documents is ALLOWED* — and `T-FREEZE-1` uses a result in `ai_grading`, which does lock. Read `session-rubric.e2e-spec.ts` and the authoring-attach e2e's T-ATT-2 yourself; this plan did not.

- [ ] **Step 5: Why there is no real-API smoke here.** A real-API pass would run the real worker against a real model and run environment, neither of which this package's worktree has. The two full-stack proofs that *are* possible without them are already tests: **Task 4 Step 3** (real Redis, real BullMQ worker — a completed job under the same `jobId` is replaced) and **Task 6** (the investigator path: attempt 1 ungradable → regrade → attempt 2 graded, class `NULL`). State this in the report; do not claim a smoke that was not run.

- [ ] **Step 6: Write the ledger.** Create `docs/superpowers/ledgers/2026-09-29-regrade-ungradable.md` with, per task: the commit hash, the exact test command and its result, every `Ruling:` line from the in-progress ledger with the reason, the two mutation checks (Task 3 Step 5, Task 4 Step 3) with the failures observed, and the Step 4 findings.

  ```bash
  git add docs/superpowers/ledgers/2026-09-29-regrade-ungradable.md && git commit -F <message-file>
  ```

  Title: `docs: ledger thực thi G3 (chấm lại bài không chấm được)`.

- [ ] **Step 7: Report — and say this plainly.**

  > **Chưa có VERDICT của `code-reviewer`.** Người dùng đã hoãn phần review tới **một lượt review chung cho G1→G5**, nên gói này bàn giao ở trạng thái "đã qua test, chưa qua review độc lập".

  And it must list: the files changed; the test totals against the baselines; that **no migration** was used; the `Ruling:` lines; the known gaps (`queue.add` failing after the DB moved on leaves a job-less `ai_grading` row — rescued by the existing *Chấm tiếp N bài treo*; a live job for a just-reset result is left alone and not proven to finish cleanly; the band measures *same reason*, not a time window); and the shared-file touch points that G2/G4/S will need to reconcile.

  Do **not** run `finishing-a-development-branch`. Do not push, do not open a PR, do not merge. The branch and the ledger stay in place for the common review.
