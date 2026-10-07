# G4 — Kiểm mẫu ngẫu nhiên và màn kiểm mù — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Every task is TDD: write the failing test, watch it fail **for the right reason**, implement, watch it pass, typecheck, lint the touched files, commit.

**Goal:** Ship the random audit sample that parent spec §8.1 says must ship *with* auto-decision: a deterministic draw at each investigator result's **first** decision, results held in `audit_pending` with the system's score and errors hidden at the **API** (not just the UI), a blind-review screen where the teacher picks errors from their own rule table *before* seeing the system's conclusion, an immutable label, and a reveal that compares the two.

**Architecture:** (1) `audit-sampling.ts` — pure: env reader, SHA-256 bucket, draw. (2) `ScoreService.writeInitial` draws only when it is about to write `auto_approved`, then moves `auto_approved → audit_pending` in a second conditional UPDATE inside the same transaction. (3) `audit-blind.ts` — pure: `blindAuditRow` for the results list, `blindResultDetail` returned by `loadResultDetail` **before it reads anything**; three SQL fixes close the rule-side leaks (`rules/preview`, `price/preview`, and the rule counts). (4) `AuditReviewService`: one transaction, immutable, returns the reveal; plus a route that signs a download URL for the result's own submission. (5) Web: `scoreCell` shows `ẩn` for the audit state, `AuditReview`/`AuditReveal` on the dossier route, and the finalize panel's audit group loses its *cần backend* badge.

**Tech Stack:** NestJS 11 + TypeORM (raw SQL for scoring reads) + Jest (unit `*.spec.ts`, e2e `test/*.e2e-spec.ts`, serial, local Postgres:5442 / Redis:6390 / MinIO:9010 via `.env.test`); Next.js 15 + TanStack Query + Vitest/RTL; `openapi-fetch` client generated into `packages/shared`.

**Spec:** `docs/superpowers/specs/2026-09-29-audit-sampling-design.md`. Parent specs: `2026-09-20-grading-agent-investigator-design.md` (§8.1, §14.3, §9 step 3; tests T-AUDIT-1/2, T-SAMP-1…5), `2026-09-23-grading-ui-rebuild-design.md` (§3.3, §3.9, §3.10).

## Decisions to veto at plan review

1. **Sampling is OFF by default under `NODE_ENV=test`** (only when the env var is unset). Without this, dozens of existing e2e suites turn randomly red: `score-service.e2e-spec.ts:57` asserts `status: 'auto_approved'` right after `computeInitial`, and 20 % of results would land in `audit_pending`. Precedent: `selectAuthoringProvider` / `selectAdvocateProvider` are also stubbed under `NODE_ENV=test`. G4's own e2e sets `GRADING_AUDIT_SAMPLE_PERCENT=100`. Dev and production are never off (unset = 20 %).
2. **Four rule-side reads stop counting results in the audit sample:** `POST rules/preview` (it returns *per-result* `before` scores and its SQL deliberately included `audit_pending`), `POST rules/:id/price/preview`, and `GET rules` / `GET rules/missing` (rule counts, from which a teacher can subtract to recover a hidden result's errors). **Visible consequence:** the Rules page counts fewer results until the audit results are reviewed.
3. **The sample is drawn only at the first decision** (`ai_graded → auto_approved`). A result that becomes auto-approved *after* being flagged (a teacher priced the blocking rule) is never sampled — parent spec §8.1 / T-SAMP-5. That group therefore never yields a label; calibration must not extrapolate to it.
4. **An invalid `GRADING_AUDIT_SAMPLE_PERCENT` falls back to 20 % with a warning; `1-4` is raised to the floor of 5; it can never produce 0.** Same convention as the sibling reader `readAutoThreshold` — not a boot failure.
5. **No migration.** `grading_seed` is not protected by a DB trigger (nothing in the code writes it; the draw is recorded in `audit_sampled`, so changing the seed later does not rewrite history). Existing `auto_approved` results are not sampled retroactively.
6. **A new read route `GET /grading-results/:id/submission-download`** signs a URL for the result's own submission. The teacher cannot open a code submission from the grading screen today (`DossierHeader` shows *Mở bài nộp* disabled), and the session page's `SubmissionStatusItem` carries no `submissionId`, so matching by MSSV is ambiguous. It leaks nothing about the system's judgement.

## Global Constraints

- **Branch:** `feat/grading-g4-audit`, branched from `feat/grading-gaps-g1-g5`. Do **not** push, open a PR, or merge without the user.
- **Work from the worktree** `C:\Users\Admin\Main\Desktop\HKI 2026-2027\KLTN\CINE\.claude\worktrees\grading-g4-audit`; the shell cwd resets between calls — `cd` in every command. Do not `cd` to the original repo root.
- **Per-package infrastructure** (from `docs/superpowers/plans/2026-09-29-g2-g5-parallel-execution.md`): database `examcollect_g4`, `REDIS_DB=14`, `PORT=4004`. **No migration in this package** (the range `1789520000000` stays empty). `apps/api/.env.test` is locked with `git update-index --skip-worktree apps/api/.env.test` and edited to `DATABASE_URL=…:5442/examcollect_g4` + `REDIS_DB=14`. **The `examcollect` schema is created by `docker/postgres-init/001-create-schema.sql`, not by any migration** — run `psql -h localhost -p 5442 -U <user from .env.test> -d examcollect_g4 -c "CREATE SCHEMA IF NOT EXISTS examcollect"` once, then `DATABASE_URL=<same as .env.test> DATABASE_SSL=false pnpm --filter api migration:run`. Never run migrations, e2e or the API against `apps/api/.env` (points at the remote Supabase database). Docker Desktop must be running.
- **CLAUDE.md:** run GitNexus `impact` on a symbol **before** editing it (`repo` = the absolute path `C:\Users\Admin\Main\Desktop\HKI 2026-2027\KLTN\CINE` — two repos share the name); report HIGH/CRITICAL risk to the user **before** editing (`ScoreService.writeInitial` and `listForSession` are likely HIGH — say so, then proceed: the user approved this plan); run `detect_changes()` before every commit. The index may be stale — confirm with grep.
- **e2e suite runs serially** (`maxWorkers: 1`); never raise it. Kill stray `node`/`jest` workers from other sessions first.
- **`ScoreService` reads the env at construction** (like `theta`), so each e2e file that needs a percentage builds its own app **after** setting `process.env`, and restores it in `afterAll`.
- **Do not edit** `ResultsTable` logic beyond the score cell, `[resultId]/page.tsx` beyond the import, the `audited` state and the one branch, `DossierHeader.tsx`, `exam-session-response.dto.ts`, `grading-run.service.ts`, `lifecycle/advance.ts`. Existing tests that must change are listed per task (spec §3); never weaken an assertion to make it pass.
- **Copy is Vietnamese.** *môi trường chạy bài* (never "sandbox"), *góc kiểm*, *không chấm được*. Status/source labels carry **an icon and words**. Every mutation error renders the server's message **verbatim** in a destructive `Alert`.
- **Commits:** write the message to a file with the Write tool, then `git commit -F <file>`; it ends with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. PowerShell 5.1 splits inline multi-line `-m`; the bash tool mangles backticks — patch scripts go in the scratchpad and run with `node file`.
- **Tests:** `pnpm --filter api exec jest <path>`, `pnpm --filter api exec jest --config ./test/jest-e2e.json <path>`, `pnpm --filter web exec vitest run <path>`, `pnpm --filter web exec tsc --noEmit`. Known unrelated tsc noise on the base branch: 7 lines, all in `src/lib/read-workbook.test.ts`.
- **Indentation of code blocks in this plan:** blocks inside numbered steps may carry two extra leading spaces from the list. Match the file's real indentation (2 spaces per level). When an Edit anchor fails on whitespace, re-read the file and copy its exact text — never loosen the anchor into a fuzzy match.
- **Ledger:** `.superpowers/sdd/2026-09-29-audit-sampling/progress.md` (gitignored); record a `Ruling:` line for every deviation from this plan.

## Review Focus

Inputs and conditions the obvious tests would not exercise. Each is pinned by a test in the task that owns the code.

1. **Every read path, not just the list and the dossier.** Two rule-side endpoints return *per-result* data and one SQL statement deliberately includes `audit_pending`; two more leak by subtraction. → Task 4 (the canary calls all of them and, on the rule counts, proves the exclusion is by *status* by checking they rise once the result is reviewed).
2. **Sampling happens only at the first decision.** A result flagged first and auto-approved later (after a price is set) must not be drawn, even at 100 %. → Task 2 (T-SAMP-5).
3. **The percentage can never be 0**, whatever the env holds — including `0`, negatives, text, decimals and out-of-range values. → Task 1 (T-AUDIT-2, over the whole range).
4. **Existing suites must not turn flaky.** Unset env under `NODE_ENV=test` means no sampling. → Task 2 (a dedicated case), plus `score-service.e2e-spec.ts` staying green **unmodified**.
5. **The label is atomic and immutable, and survives disagreement.** A second write is 409 with a Vietnamese message; a manual score after the reveal leaves the label untouched. → Task 6 (T-SAMP-2).
6. **The reveal must not vanish before it is read.** The dossier route flips to the normal dossier as soon as the status changes, so the web keeps the reveal until the teacher clicks *Mở hồ sơ*. → Task 10.

Not changed, recorded so nobody thinks it was missed: `ruleLayerTransition` still moves an `audit_pending` result to `flagged_for_review` (and clears `audit_sampled`) when a price change makes it non-auto — a teacher who changes a price and sees a sample result change group can infer it carries that rule. Existing behaviour, tested by T-DEMOTE-1, kept on purpose.

---

## File Structure

**Backend (`apps/api`)**
- Create `src/grading/audit-sampling.ts` + `audit-sampling.spec.ts` — `readAuditSampling`, `auditBucket`, `drawnForAudit`.
- Create `src/grading/audit-blind.ts` + `audit-blind.spec.ts` — `blindAuditRow`, `blindResultDetail`.
- Create `src/grading/audit/audit-compare.ts` + `.spec.ts`, `audit-review.service.ts`, `audit-review.controller.ts`, `dto/audit-review.dto.ts`.
- Modify `src/grading/scoring/score.service.ts` — the draw in `writeInitial`, the env field, the warning log.
- Modify `src/grading/grading.service.ts` — wrap `listForSession`'s result in `blindAuditRow`.
- Modify `src/grading/scoring/result-detail.ts` — the blind guard at the top of `loadResultDetail`.
- Modify `src/grading/rules/error-rule.service.ts`, `src/grading/rules/price.service.ts` — exclude `audit_pending` (three SQL edits).
- Modify `src/grading/grading.module.ts` — `AuditReviewController` into `controllers`, `AuditReviewService` into `providers`.
- Tests: create `test/audit-sampling.e2e-spec.ts`, `test/audit-blind.e2e-spec.ts`, `test/audit-review.e2e-spec.ts`.

**Web (`apps/web/src`)**
- Create `lib/api/audit.ts`, `hooks/useAudit.ts`, `app/teacher/grading/[resultId]/_components/AuditReview.tsx` (+ test) and `AuditReveal.tsx` (+ test).
- Modify `lib/session-triage.ts` (+ test) — `scoreCell` for the audit state, `ScoreTag`.
- Modify `app/teacher/grading/_components/ResultsTable.tsx` (+ test) — `EyeOff` icon in the score cell of an audit row.
- Modify `app/teacher/grading/_components/FinalizePanel.tsx` (+ test) — the audit group loses *cần backend*.
- Modify `app/teacher/grading/[resultId]/page.tsx` (+ test) — the import, the `audited` state and the one branch.
- Regenerate `packages/shared/src/api/schema.d.ts` (Task 7, **after** both routes exist).

## Parallel execution

- Branch `feat/grading-g4-audit` · worktree `grading-g4-audit` · database `examcollect_g4` · `REDIS_DB=14` · `PORT=4004` · no migration.

### Shared-file touch points

Additive only; each is shared with another stream.

| File | G4 adds (exact anchor) | Who else touches it |
|---|---|---|
| `apps/api/src/grading/grading.module.ts` | `AuditReviewController` at the end of `controllers: [GradingController, RulesController, TestBundleController…]` (line 135); `AuditReviewService` after `TestBundleService,` in `providers` (line 138) | G3 appends `RegradeController` to the **same `controllers` line** — a one-line conflict, take the union; G2 edits `exports` (line 188) |
| `apps/api/src/grading/grading.service.ts` | `import { blindAuditRow } from './audit-blind';` after the `result-triage` import (line 36); `return {` → `const view: GradingResultView = {` and `return blindAuditRow(view);` around the mapping in `listForSession` (lines 773 and 809-810) | G3 adds one line **inside** that object (`ungradableClass`, after `ungradableReason`) |
| `apps/web/src/app/teacher/grading/[resultId]/page.tsx` | one import (`AuditReview`), one `useState` (`audited`, after `studentFeedback`, line 67) and one `if (result && (result.status === 'audit_pending' \|\| audited)) return <AuditReview … />;` directly **before** the `if (result?.pipeline === 'investigator')` block (line 119) | G2 does **not** edit this file (it puts its line in `InvestigatorDossier`) |
| `apps/web/src/app/teacher/grading/_components/FinalizePanel.tsx` | removes `, needsBackend: true` from the audit group (line 73) and the `{g.needsBackend && <NeedsBackend />}` line (121) | G5 replaces the gradebook block (lines 100-112). **G4 keeps the `NeedsBackend` import, and so does G5** (line 121 / its own branch still use it); whoever merges the second of the two removes the then-unused import |
| `apps/web/src/lib/session-triage.ts` | `scoreCell` branch for `'audit'` and one value in `ScoreTag` (lines 65-78) | stream S adds functions elsewhere in the file |
| `packages/shared/src/api/schema.d.ts` | regenerated in Task 7 | regenerated again by G2/G3/G5 — take the union when merging |

Nothing else in this plan is shared. `audit-sampling.ts`, `audit-blind.ts`, `audit/*`, `lib/api/audit.ts`, `hooks/useAudit.ts`, `AuditReview.tsx`, `AuditReveal.tsx` are G4-exclusive.

---

### Task 1: the draw, as a pure module

**Files:** create `apps/api/src/grading/audit-sampling.ts`, `apps/api/src/grading/audit-sampling.spec.ts`.

**Interfaces**
- Consumes: `node:crypto` only.
- Produces: `AUDIT_DEFAULT_PERCENT = 20`, `AUDIT_FLOOR_PERCENT = 5`; `AuditSampling { enabled: boolean; percent: number; warning: string | null }`; `readAuditSampling(env: NodeJS.ProcessEnv): AuditSampling`; `auditBucket(seed: string, resultId: string): number` (an integer in `[0, 9999]`); `drawnForAudit(seed: string, resultId: string, percent: number): boolean`.

- [ ] **Step 1: RED — the spec.** Create `audit-sampling.spec.ts`:

  ```ts
  import { AUDIT_DEFAULT_PERCENT, AUDIT_FLOOR_PERCENT, auditBucket, drawnForAudit, readAuditSampling } from './audit-sampling';

  const ids = (n: number) => Array.from({ length: n }, (_, i) => `00000000-0000-4000-8000-${i.toString(16).padStart(12, '0')}`);
  const SEED = '6f1c1c1e-0d0a-4f0e-9d63-2a4f6d1f7a10';
  const drawn = (seed: string, percent: number, n = 20_000) => ids(n).filter((id) => drawnForAudit(seed, id, percent));

  describe('the draw (T-AUDIT-1, T-SAMP-3) — no database, no scores', () => {
    it('a bucket is an integer in [0, 9999]', () => {
      for (const id of ids(2000)) {
        const b = auditBucket(SEED, id);
        expect(Number.isInteger(b)).toBe(true);
        expect(b).toBeGreaterThanOrEqual(0);
        expect(b).toBeLessThan(10_000);
      }
    });

    it('draws the requested share of a large frame (T-AUDIT-1)', () => {
      expect(drawn(SEED, 20).length / 20_000).toBeGreaterThan(0.18);
      expect(drawn(SEED, 20).length / 20_000).toBeLessThan(0.22);
      expect(drawn(SEED, 5).length / 20_000).toBeGreaterThan(0.04);
      expect(drawn(SEED, 5).length / 20_000).toBeLessThan(0.06);
    });

    it('100 % draws everything', () => {
      expect(drawn(SEED, 100, 2000)).toHaveLength(2000);
    });

    it('is monotone: whoever is drawn at 5 % is still drawn at 20 % (same seed)', () => {
      const at20 = new Set(drawn(SEED, 20));
      for (const id of drawn(SEED, 5)) expect(at20.has(id)).toBe(true);
    });

    // T-SAMP-3. The function has no score parameter, and this pins that nothing else sneaks in.
    it('the drawn set depends on the seed and the ids only — changing every score changes nothing', () => {
      const frame = ids(3000).map((id, i) => ({ id, score: (i % 11) / 10 }));
      const before = frame.filter((r) => drawnForAudit(SEED, r.id, 20)).map((r) => r.id);
      for (const r of frame) r.score = 10 - r.score;
      const after = frame.filter((r) => drawnForAudit(SEED, r.id, 20)).map((r) => r.id);
      expect(after).toEqual(before);
    });

    it('a different seed draws a different set', () => {
      expect(drawn('11111111-1111-4111-8111-111111111111', 20, 3000)).not.toEqual(drawn(SEED, 20, 3000));
    });
  });

  describe('readAuditSampling (T-AUDIT-2 — never 0)', () => {
    it('unset in production or dev: on, 20 %', () => {
      expect(readAuditSampling({})).toEqual({ enabled: true, percent: 20, warning: null });
    });

    it('unset or blank under NODE_ENV=test: OFF — existing suites stay deterministic', () => {
      expect(readAuditSampling({ NODE_ENV: 'test' })).toEqual({ enabled: false, percent: 20, warning: null });
      expect(readAuditSampling({ NODE_ENV: 'test', GRADING_AUDIT_SAMPLE_PERCENT: '  ' }).enabled).toBe(false);
    });

    it('set explicitly under NODE_ENV=test: on', () => {
      expect(readAuditSampling({ NODE_ENV: 'test', GRADING_AUDIT_SAMPLE_PERCENT: '100' })).toEqual({
        enabled: true, percent: 100, warning: null,
      });
    });

    it.each([['5', 5], ['20', 20], ['35', 35], ['100', 100]])('%s is used as is', (raw, percent) => {
      expect(readAuditSampling({ GRADING_AUDIT_SAMPLE_PERCENT: raw })).toEqual({ enabled: true, percent, warning: null });
    });

    it.each(['1', '2', '3', '4'])('%s is below the floor: raised to 5 with a warning', (raw) => {
      const r = readAuditSampling({ GRADING_AUDIT_SAMPLE_PERCENT: raw });
      expect(r.percent).toBe(AUDIT_FLOOR_PERCENT);
      expect(r.warning).toContain('GRADING_AUDIT_SAMPLE_PERCENT');
    });

    it('above 100 is capped at 100 with a warning', () => {
      const r = readAuditSampling({ GRADING_AUDIT_SAMPLE_PERCENT: '250' });
      expect(r.percent).toBe(100);
      expect(r.warning).toContain('GRADING_AUDIT_SAMPLE_PERCENT');
    });

    it.each(['0', '-5', 'abc', '7.5', '1e-3', 'NaN'])('%s is meaningless: default 20 % with a warning, never 0', (raw) => {
      const r = readAuditSampling({ GRADING_AUDIT_SAMPLE_PERCENT: raw });
      expect(r).toMatchObject({ enabled: true, percent: AUDIT_DEFAULT_PERCENT });
      expect(r.warning).toContain('GRADING_AUDIT_SAMPLE_PERCENT');
    });

    it('over every value a person could type, the percentage is never below the floor', () => {
      const typed = [...Array.from({ length: 400 }, (_, i) => String(i - 100)), '', ' ', 'x', '5.5', '99999'];
      for (const raw of typed) {
        const r = readAuditSampling({ GRADING_AUDIT_SAMPLE_PERCENT: raw });
        if (r.enabled) expect(r.percent).toBeGreaterThanOrEqual(AUDIT_FLOOR_PERCENT);
      }
    });
  });
  ```

  ```bash
  pnpm --filter api exec jest src/grading/audit-sampling.spec.ts
  ```

  Expected: **RED** — `Cannot find module './audit-sampling'`.

- [ ] **Step 2: GREEN.** Create `audit-sampling.ts`:

  ```ts
  import { createHash } from 'node:crypto';

  /**
   * Rút mẫu kiểm (parent spec §8.1) — file THUẦN: không DB, không điểm, không đọc `process.env` trực tiếp.
   *
   * Bài được rút khi `hash(seed của phiên, id kết quả) < N`. Chỉ phụ thuộc seed và id — KHÔNG phụ thuộc điểm —
   * vì được chọn thì người ta chọn bài dễ (T-SAMP-3).
   */
  export const AUDIT_DEFAULT_PERCENT = 20;
  /** Sàn: dưới đây bộ hiệu chỉnh (§8) mất nguồn nhãn. */
  export const AUDIT_FLOOR_PERCENT = 5;
  const KEY = 'GRADING_AUDIT_SAMPLE_PERCENT';

  export interface AuditSampling {
    enabled: boolean;
    percent: number;
    warning: string | null;
  }

  /**
   * N% từ env, theo khuôn của `readAutoThreshold` (`decision/threshold.ts`): hàm thuần nhận `env`, mặc định KÈM
   * cảnh báo khi giá trị vô nghĩa — không nổ lúc khởi động. KHÔNG nhánh nào cho ra `percent` dưới sàn, nên N
   * không bao giờ về 0.
   *
   * Thiếu hoặc rỗng → mặc định; riêng dưới `NODE_ENV=test` thì TẮT: hàng chục e2e có sẵn khẳng định `auto_approved`
   * ngay sau `computeInitial`, và 20% số bài sẽ sang `audit_pending`. Cùng tiền lệ với `selectAuthoringProvider`,
   * cũng giả lập dưới `NODE_ENV=test`. Đặt biến tường minh thì bật, kể cả ở test.
   */
  export function readAuditSampling(env: NodeJS.ProcessEnv): AuditSampling {
    const raw = env[KEY];
    if (raw === undefined || raw.trim() === '') {
      return { enabled: env.NODE_ENV !== 'test', percent: AUDIT_DEFAULT_PERCENT, warning: null };
    }
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 1) {
      return {
        enabled: true,
        percent: AUDIT_DEFAULT_PERCENT,
        warning: `${KEY}=${JSON.stringify(raw)} không phải số nguyên từ 1 trở lên — dùng mặc định ${AUDIT_DEFAULT_PERCENT}%. Kiểm mẫu không bao giờ về 0.`,
      };
    }
    if (value < AUDIT_FLOOR_PERCENT) {
      return {
        enabled: true,
        percent: AUDIT_FLOOR_PERCENT,
        warning: `${KEY}=${value} thấp hơn sàn — nâng lên ${AUDIT_FLOOR_PERCENT}%. Kiểm mẫu không bao giờ về 0.`,
      };
    }
    if (value > 100) {
      return { enabled: true, percent: 100, warning: `${KEY}=${value} lớn hơn 100 — dùng 100%.` };
    }
    return { enabled: true, percent: value, warning: null };
  }

  /** Số nguyên trong [0, 9999], tất định theo (seed, id). SHA-256: đều, và đơn điệu khi so với `percent × 100`. */
  export function auditBucket(seed: string, resultId: string): number {
    return createHash('sha256').update(`${seed}:${resultId}`).digest().readUInt32BE(0) % 10_000;
  }

  export function drawnForAudit(seed: string, resultId: string, percent: number): boolean {
    return auditBucket(seed, resultId) < percent * 100;
  }
  ```

  ```bash
  pnpm --filter api exec jest src/grading/audit-sampling.spec.ts
  pnpm --filter api exec tsc --noEmit
  ```

  Expected: all green (the `it.each` blocks expand to 4 + 4 + 6 cases); `tsc` clean.

- [ ] **Step 3: commit.** Title: `feat(audit): hàm rút mẫu thuần — SHA-256 theo seed và id, sàn 5%, không bao giờ 0`.

---

### Task 2: draw at the first decision

**Files:** `apps/api/src/grading/scoring/score.service.ts` (modify), create `apps/api/test/audit-sampling.e2e-spec.ts`.

**Interfaces**
- Consumes: `readAuditSampling`, `drawnForAudit` (Task 1); `advanceStatus(m, id, from[], to, extra)` with `auditSampled`/`auditSampledAt` (`lifecycle/advance.ts`); `ScoreContext.sessionId`, `.resultId`.
- Produces: `writeInitial` moves a drawn result to `audit_pending` (two conditional UPDATEs, one transaction); the existing return shape is unchanged.

- [ ] **Step 1: RED — the e2e.** Create `apps/api/test/audit-sampling.e2e-spec.ts` (the helpers mirror `score-service.e2e-spec.ts`, whose `world()` and `SEEN` are not exported):

  ```ts
  import { randomUUID } from 'node:crypto';
  import { INestApplication } from '@nestjs/common';
  import { Test } from '@nestjs/testing';
  import { DataSource } from 'typeorm';
  import { AppModule } from '../src/app.module';
  import { drawnForAudit } from '../src/grading/audit-sampling';
  import { ScoreService } from '../src/grading/scoring/score.service';
  import { seedSession } from './helpers/grading-seed';
  import { seedInvestigatorResult, seedInvestigatorSession, seedPrices, seedRule, storedWith } from './helpers/investigator-seed';

  const SEEN = [
    { ruleKey: 'sai_bien', checkedBy: 'machine' as const },
    { ruleKey: 'ten_bien', checkedBy: 'model' as const },
  ];

  /**
   * `ScoreService` đọc env lúc KHỞI TẠO (như `theta`), nên mỗi mức tỉ lệ cần một app RIÊNG dựng sau khi đặt env.
   * `restore` trả env về như cũ — Jest có thể dùng chung `process.env` giữa các file trong một worker.
   */
  async function boot(percent: string | undefined) {
    const before = process.env.GRADING_AUDIT_SAMPLE_PERCENT;
    if (percent === undefined) delete process.env.GRADING_AUDIT_SAMPLE_PERCENT;
    else process.env.GRADING_AUDIT_SAMPLE_PERCENT = percent;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const app: INestApplication = moduleRef.createNestApplication();
    await app.init();
    const restore = () => {
      if (before === undefined) delete process.env.GRADING_AUDIT_SAMPLE_PERCENT;
      else process.env.GRADING_AUDIT_SAMPLE_PERCENT = before;
    };
    return { app, ds: app.get(DataSource), scores: app.get(ScoreService), restore };
  }

  /** Phiên, hai luật, bảng giá v1: sai_bien 1,50 và ten_bien 0,50 — bài `storedWith(SEEN)` ra 8,50 và tự quyết. */
  async function world(ds: DataSource, label: string) {
    const ctx = await seedSession(ds, label);
    await seedInvestigatorSession(ds, ctx);
    const bien = await seedRule(ds, ctx.teacherId, 'sai_bien', 'tinh_dung', { kind: 'test_group_failed', group: 'bien' });
    const ten = await seedRule(ds, ctx.teacherId, 'ten_bien', 'trinh_bay');
    await seedPrices(ds, ctx.teacherId, { [bien.ruleId]: '1.50', [ten.ruleId]: '0.50' });
    return { ctx, bien, ten };
  }
  const rowOf = async (ds: DataSource, id: string) =>
    (await ds.query(`SELECT status, audit_sampled, audit_sampled_at FROM examcollect.grading_result WHERE id = $1`, [id]))[0];

  describe('Rút mẫu ở quyết định đầu tiên — 100 % (e2e)', () => {
    let ctxApp: Awaited<ReturnType<typeof boot>>;
    beforeAll(async () => {
      ctxApp = await boot('100');
    }, 60_000);
    afterAll(async () => {
      await ctxApp.app.close();
      ctxApp.restore();
    });

    it('bài tự quyết ngay từ đầu → audit_pending, cờ và mốc ghi CÙNG một câu lệnh (T-AUDIT-1)', async () => {
      const { ds, scores } = ctxApp;
      const { ctx } = await world(ds, 'samp-first');
      const { resultId } = await seedInvestigatorResult(ds, ctx, storedWith(SEEN));

      const out = await scores.computeInitial(resultId);

      expect(out.outcome).toBe('auto'); // quyết định vẫn là tự quyết; rút mẫu là bước sau nó
      const row = await rowOf(ds, resultId);
      expect(row.status).toBe('audit_pending');
      expect(row.audit_sampled).toBe(true);
      expect(row.audit_sampled_at).not.toBeNull();
    });

    it('bài bị gắn cờ ở lượt đầu KHÔNG vào mẫu', async () => {
      const { ds, scores } = ctxApp;
      const { ctx } = await world(ds, 'samp-flagged');
      // Một luật máy kiểm chưa có giá, có lỗi → chặn tự quyết (§2.1).
      await seedRule(ds, ctx.teacherId, 'bien_2', 'trinh_bay', { kind: 'test_group_failed', group: 'bien' });
      const { resultId } = await seedInvestigatorResult(ds, ctx, storedWith(SEEN));

      expect(await scores.computeInitial(resultId)).toMatchObject({ outcome: 'flagged' });

      expect(await rowOf(ds, resultId)).toMatchObject({ status: 'flagged_for_review', audit_sampled: false, audit_sampled_at: null });
    });

    // T-SAMP-5, Review Focus #2: đặt giá cho luật đang chặn đưa bài lên tự quyết — nhưng lúc còn gắn cờ giảng viên
    // có thể đã mở hồ sơ, nên nhãn của nó lệch và nó KHÔNG vào khung rút, kể cả ở 100%.
    it('bài thành tự quyết SAU khi bị gắn cờ (đặt giá) không được rút, dù ở 100 %', async () => {
      const { ds, scores } = ctxApp;
      const { ctx, bien, ten } = await world(ds, 'samp-promote');
      const extra = await seedRule(ds, ctx.teacherId, 'bien_2', 'trinh_bay', { kind: 'test_group_failed', group: 'bien' });
      const { resultId } = await seedInvestigatorResult(ds, ctx, storedWith(SEEN));
      expect(await scores.computeInitial(resultId)).toMatchObject({ outcome: 'flagged' });

      await seedPrices(ds, ctx.teacherId, { [bien.ruleId]: '1.50', [ten.ruleId]: '0.50', [extra.ruleId]: '0.25' });
      const sum = await ds.transaction((m) =>
        scores.recomputeForTeacher(m, ctx.teacherId, 'price_change', ctx.teacherId, { ruleId: extra.ruleId }),
      );

      expect(sum.promoted).toBe(1);
      expect(await rowOf(ds, resultId)).toMatchObject({ status: 'auto_approved', audit_sampled: false, audit_sampled_at: null });
    });
  });

  describe('Rút mẫu phụ thuộc seed và id, không phụ thuộc gì khác — 5 % (e2e)', () => {
    let ctxApp: Awaited<ReturnType<typeof boot>>;
    beforeAll(async () => {
      ctxApp = await boot('5');
    }, 60_000);
    afterAll(async () => {
      await ctxApp.app.close();
      ctxApp.restore();
    });

    /** Chọn một seed mà `drawnForAudit(seed, resultId, 5)` trả `want` — hàm là tất định nên chọn trước được. */
    function seedFor(resultId: string, want: boolean): string {
      for (let i = 0; i < 500; i++) {
        const seed = randomUUID();
        if (drawnForAudit(seed, resultId, 5) === want) return seed;
      }
      throw new Error('không tìm được seed phù hợp sau 500 lần thử');
    }

    it.each([[true, 'audit_pending'], [false, 'auto_approved']])(
      'seed đã chọn để rút=%s → %s',
      async (want, expected) => {
        const { ds, scores } = ctxApp;
        const { ctx } = await world(ds, `samp-seed-${want}`);
        const { resultId } = await seedInvestigatorResult(ds, ctx, storedWith(SEEN));
        await ds.query(`UPDATE examcollect.exam_session SET grading_seed = $2 WHERE id = $1`, [ctx.sessionId, seedFor(resultId, want)]);

        await scores.computeInitial(resultId);

        expect((await rowOf(ds, resultId)).status).toBe(expected);
      },
    );
  });

  describe('Rút mẫu dưới NODE_ENV=test khi env chưa đặt (e2e)', () => {
    let ctxApp: Awaited<ReturnType<typeof boot>>;
    beforeAll(async () => {
      ctxApp = await boot(undefined);
    }, 60_000);
    afterAll(async () => {
      await ctxApp.app.close();
      ctxApp.restore();
    });

    // Review Focus #4: đây là ca giữ cho `score-service.e2e-spec.ts:57` và cả chục suite khác không đỏ ngẫu nhiên.
    it('tắt: bài tự quyết vẫn là auto_approved, không bao giờ audit_pending', async () => {
      expect(process.env.NODE_ENV).toBe('test');
      const { ds, scores } = ctxApp;
      for (let i = 0; i < 5; i++) {
        const { ctx } = await world(ds, `samp-off-${i}`);
        const { resultId } = await seedInvestigatorResult(ds, ctx, storedWith(SEEN));
        await scores.computeInitial(resultId);
        expect(await rowOf(ds, resultId)).toMatchObject({ status: 'auto_approved', audit_sampled: false });
      }
    });
  });
  ```

  ```bash
  pnpm --filter api exec jest --config ./test/jest-e2e.json test/audit-sampling.e2e-spec.ts
  ```

  Expected: **RED** — at 100 % the first case gets `auto_approved` (nothing draws yet) and the `seed…rút=true` case likewise; the other cases already pass and must stay passing.

- [ ] **Step 2: GREEN.** In `score.service.ts` replace exactly

  ```ts
  import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
  ```

  with

  ```ts
  import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
  ```

  Add, next to the other `../` imports (after `import { readAutoThreshold } from '../decision/threshold';`):

  ```ts
  import { drawnForAudit, readAuditSampling } from '../audit-sampling';
  ```

  Replace exactly

  ```ts
    private readonly theta = readAutoThreshold(process.env).theta;

    constructor(
      @InjectDataSource() private readonly ds: DataSource,
      // Sửa điểm đã công bố phải để lại dấu vết — Security rule 4, do service chịu (không trigger).
      private readonly audit: AuditLogService,
    ) {}
  ```

  with

  ```ts
    private readonly theta = readAutoThreshold(process.env).theta;
    /** Tỉ lệ kiểm mẫu — đọc lúc khởi tạo như `theta`. Tên khác `audit`: field đó là `AuditLogService`. */
    private readonly sampling = readAuditSampling(process.env);

    constructor(
      @InjectDataSource() private readonly ds: DataSource,
      // Sửa điểm đã công bố phải để lại dấu vết — Security rule 4, do service chịu (không trigger).
      private readonly audit: AuditLogService,
    ) {
      if (this.sampling.warning) new Logger(ScoreService.name).warn(this.sampling.warning);
    }
  ```

  In `writeInitial`, replace exactly

  ```ts
      await advanceStatus(m, ctx.resultId, ['ai_graded'], to, { flagForReview: to === 'flagged_for_review' });
  ```

  with

  ```ts
      await advanceStatus(m, ctx.resultId, ['ai_graded'], to, { flagForReview: to === 'flagged_for_review' });

      // §8.1 — rút mẫu kiểm ở QUYẾT ĐỊNH ĐẦU TIÊN, và chỉ ở đây. `writeInitial` là lượt tính đầu (cả
      // `computeInitial` lẫn `finishAttempt` đều qua nó), nên bài nào tới đây với `auto_approved` là bài hệ thống
      // tự tin ngay từ đầu. Bài thành tự quyết SAU khi gắn cờ (`ruleLayerTransition`) không đi qua đây → không
      // bao giờ vào khung (T-SAMP-5). Trigger không có cặp `ai_graded → audit_pending`, nên là HAI bước trong
      // cùng transaction; hai cột cờ đổi trong MỘT câu lệnh vì `ck_grading_result_audit_sampled_at`.
      if (to === 'auto_approved' && (await this.drawnForAudit(m, ctx))) {
        await advanceStatus(m, ctx.resultId, ['auto_approved'], 'audit_pending', {
          auditSampled: true,
          auditSampledAt: new Date(),
        });
      }
  ```

  and add the private method immediately before `/** §14.3 — chỉ lượt tính TẦNG LUẬT mới được đưa bài flagged ⇄ auto_approved. */`:

  ```ts
    /** Bài này có được rút vào mẫu kiểm không — chỉ phụ thuộc seed của phiên và id kết quả. */
    private async drawnForAudit(m: EntityManager, ctx: ScoreContext): Promise<boolean> {
      if (!this.sampling.enabled) return false;
      const [row] = await m.query(`SELECT grading_seed FROM examcollect.exam_session WHERE id = $1`, [ctx.sessionId]);
      return row !== undefined && drawnForAudit(row.grading_seed as string, ctx.resultId, this.sampling.percent);
    }

  ```

  ```bash
  pnpm --filter api exec jest --config ./test/jest-e2e.json test/audit-sampling.e2e-spec.ts test/score-service.e2e-spec.ts test/finish-attempt.e2e-spec.ts test/investigator-run.e2e-spec.ts
  pnpm --filter api exec tsc --noEmit
  pnpm check:cycles
  ```

  Expected: `audit-sampling` 6 passed (3 + 2 + 1 — the `it.each` counts twice); `score-service`, `finish-attempt`, `investigator-run` **green and unmodified** (Review Focus #4); `tsc` clean; `0 vòng lặp`.

- [ ] **Step 3: `detect_changes` and commit.** Title: `feat(audit): rút mẫu kiểm ở quyết định đầu tiên — hai bước trong một transaction`.

---

### Task 3: hide the system's score and errors at the API

**Files:** create `apps/api/src/grading/audit-blind.ts`, `apps/api/src/grading/audit-blind.spec.ts`; modify `apps/api/src/grading/grading.service.ts`, `apps/api/src/grading/scoring/result-detail.ts`.

**Interfaces**
- Consumes: `ResultDetail` (`scoring/result-detail.ts:29`), `GradingResultView` (`grading.service.ts`).
- Produces: `blindAuditRow<T extends BlindableRow>(row: T): T`; `blindResultDetail(result: { pipeline: GradingPipeline; status: string }): ResultDetail`.

- [ ] **Step 1: RED — the unit spec.** Create `audit-blind.spec.ts`:

  ```ts
  import { blindAuditRow, blindResultDetail } from './audit-blind';

  const row = (over: Record<string, unknown> = {}) => ({
    id: 'r1', studentMssv: '20120001', status: 'audit_pending', pipeline: 'investigator',
    aiTotalScore: 8.63, confidence: 0.91, criterionResults: [{ criterionId: 'x', evidence: 'BÍ MẬT' }],
    advocateOpinion: { note: 'BÍ MẬT' }, finalScore: 8.63, currentScore: 8.63, currentScoreSource: 'computation',
    triage: { caseFlags: [], errorFlags: [], counts: { counted: 1, unpriced: 0, refuted: 0, excluded: 0 } },
    ...over,
  });

  describe('blindAuditRow (T-SAMP-1, list side)', () => {
    it('an audit_pending row loses the score, the confidence, the evidence and the triage', () => {
      const out = blindAuditRow(row());
      expect(out).toMatchObject({
        aiTotalScore: null, confidence: null, criterionResults: [], advocateOpinion: null,
        finalScore: null, currentScore: null, currentScoreSource: 'none', triage: null,
      });
    });

    it('nothing of the secret survives serialisation', () => {
      const json = JSON.stringify(blindAuditRow(row()));
      expect(json).not.toContain('8.63');
      expect(json).not.toContain('BÍ MẬT');
    });

    it('keeps everything that is not the system\'s judgement', () => {
      expect(blindAuditRow(row())).toMatchObject({ id: 'r1', studentMssv: '20120001', status: 'audit_pending', pipeline: 'investigator' });
    });

    it('does not mutate its input', () => {
      const input = row();
      blindAuditRow(input);
      expect(input.aiTotalScore).toBe(8.63);
      expect(input.triage).not.toBeNull();
    });

    it.each(['ai_grading', 'ai_graded', 'auto_approved', 'flagged_for_review', 'teacher_reviewed', 'finalized', 'exported'])(
      'a %s row is returned untouched',
      (status) => {
        const input = row({ status });
        expect(blindAuditRow(input)).toBe(input);
      },
    );
  });

  describe('blindResultDetail (T-SAMP-1, dossier side)', () => {
    it('is a complete ResultDetail with no score, no breakdown and no investigation', () => {
      expect(blindResultDetail({ pipeline: 'investigator', status: 'audit_pending' })).toEqual({
        pipeline: 'investigator',
        currentScore: null,
        currentScoreSource: 'none',
        status: 'audit_pending',
        ungradableClass: null,
        ungradableReason: null,
        breakdown: null,
        investigation: null,
        challengeNotes: [],
        challengeVerdicts: [],
      });
    });
  });
  ```

  ```bash
  pnpm --filter api exec jest src/grading/audit-blind.spec.ts
  ```

  Expected: **RED** — `Cannot find module './audit-blind'`.

- [ ] **Step 2: GREEN — the module.** Create `audit-blind.ts`:

  ```ts
  import type { GradingPipeline } from './grading-model.types';
  import type { ResultDetail } from './scoring/result-detail';

  /**
   * Giấu điểm và lỗi của hệ thống khỏi một bài `audit_pending` (parent spec §8.1 luật 2) — Ở TẦNG API, không chỉ ở
   * tầng hiển thị. Hai hàm THUẦN, mỗi endpoint đi qua đúng một chỗ để không ai quên được.
   *
   * Nhận xét được ghi thì bài rời `audit_pending` (sang `teacher_reviewed`) và các trường này hiện lại như mọi
   * bài — đó là lúc che mù kết thúc.
   */
  export interface BlindableRow {
    status: string;
    aiTotalScore: number | null;
    confidence: number | null;
    criterionResults: unknown[];
    advocateOpinion: unknown;
    finalScore: number | null;
    currentScore: number | null;
    currentScoreSource: string;
    triage: unknown;
  }

  export function blindAuditRow<T extends BlindableRow>(row: T): T {
    if (row.status !== 'audit_pending') return row;
    return {
      ...row,
      aiTotalScore: null,
      confidence: null,
      criterionResults: [],
      advocateOpinion: null,
      finalScore: null,
      currentScore: null,
      currentScoreSource: 'none',
      triage: null,
    };
  }

  /**
   * Bản hồ sơ MÙ, dựng sẵn — `loadResultDetail` trả nó NGAY ĐẦU hàm, trước khi đọc bất kỳ dòng tính điểm hay lượt
   * chấm nào. Không đọc thì không thể rò.
   */
  export function blindResultDetail(result: { pipeline: GradingPipeline; status: string }): ResultDetail {
    return {
      pipeline: result.pipeline,
      currentScore: null,
      currentScoreSource: 'none',
      status: result.status,
      ungradableClass: null,
      ungradableReason: null,
      breakdown: null,
      investigation: null,
      challengeNotes: [],
      challengeVerdicts: [],
    };
  }
  ```

  ```bash
  pnpm --filter api exec jest src/grading/audit-blind.spec.ts
  ```

  Expected: 12 passed (4 + 7 from the `it.each` + 1).

- [ ] **Step 3: GREEN — wire the list.** In `grading.service.ts` add, directly after `import { ResultTriage, triageOf } from './scoring/result-triage';`:

  ```ts
  import { blindAuditRow } from './audit-blind';
  ```

  Replace exactly

  ```ts
        return {
          id: entity.id,
          submissionId: entity.submissionId,
          studentMssv: rows.raw[index].studentMssv,
  ```

  with

  ```ts
        // MỘT chỗ giấu điểm/lỗi của bài kiểm mẫu chưa kiểm — `blindAuditRow` bọc ở cuối (§8.1 luật 2).
        const view: GradingResultView = {
          id: entity.id,
          submissionId: entity.submissionId,
          studentMssv: rows.raw[index].studentMssv,
  ```

  and replace exactly

  ```ts
            breakdown: source?.latestBreakdown ?? null,
          }),
        };
      });
    }
  }
  ```

  with

  ```ts
            breakdown: source?.latestBreakdown ?? null,
          }),
        };
        return blindAuditRow(view);
      });
    }
  }
  ```

- [ ] **Step 4: GREEN — wire the dossier.** In `scoring/result-detail.ts` add, with the other imports:

  ```ts
  import { blindResultDetail } from '../audit-blind';
  ```

  and replace exactly

  ```ts
  export async function loadResultDetail(ds: DataSource, result: GradingResultEntity): Promise<ResultDetail> {
    const computation = await latestComputationRow(ds.manager, result.id);
  ```

  with

  ```ts
  export async function loadResultDetail(ds: DataSource, result: GradingResultEntity): Promise<ResultDetail> {
    // Bài kiểm mẫu chưa kiểm: trả bản mù NGAY, trước khi đọc bất kỳ dòng tính điểm hay lượt chấm nào (§8.1 luật 2).
    if (result.status === 'audit_pending') return blindResultDetail(result);

    const computation = await latestComputationRow(ds.manager, result.id);
  ```

  ```bash
  pnpm --filter api exec jest src/grading
  pnpm --filter api exec jest --config ./test/jest-e2e.json test/grading-results-triage.e2e-spec.ts test/grading.e2e-spec.ts
  pnpm --filter api exec tsc --noEmit
  pnpm check:cycles
  ```

  Expected: green; `tsc` clean (if it rejects `const view: GradingResultView = {…}`, the object has a field the interface lacks or the reverse — fix the object, not the type); `0 vòng lặp` (`audit-blind.ts` imports **types only** from `result-detail.ts`, and `result-detail.ts` imports its function — `import type` is ignored by the script).

- [ ] **Step 5: commit.** Title: `feat(audit): giấu điểm và lỗi của bài kiểm mẫu ở danh sách và hồ sơ, ở tầng API`.

---

### Task 4: the rule-side leaks, and a canary over every read route

**Files:** `apps/api/src/grading/rules/error-rule.service.ts`, `apps/api/src/grading/rules/price.service.ts` (modify), create `apps/api/test/audit-blind.e2e-spec.ts`.

**Interfaces**
- Consumes: `blindAuditRow`, `blindResultDetail` (Task 3); `ErrorRuleService.preview(teacherId, input)`, `PriceService.preview(teacherId, ruleId, deduction)`.
- Produces: `audit_pending` results are excluded from the tier-2 rule preview, the price preview, and the rule counts of `GET rules` / `GET rules/missing`.

- [ ] **Step 1: RED — the canary.** Create `apps/api/test/audit-blind.e2e-spec.ts`. It seeds one `audit_pending` result whose score (`8.63`) and rule key (`sai_bien_bi_mat`) are distinctive, then calls **every** read path and looks for them:

  ```ts
  import { INestApplication, ValidationPipe } from '@nestjs/common';
  import { Test } from '@nestjs/testing';
  import request from 'supertest';
  import { DataSource } from 'typeorm';
  import { AppModule } from '../src/app.module';
  import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
  import { ErrorRuleService } from '../src/grading/rules/error-rule.service';
  import { PriceService } from '../src/grading/rules/price.service';
  import { ScoreService } from '../src/grading/scoring/score.service';
  import { createTestAccount } from './helpers/create-account';
  import { forceStatus, seedSession } from './helpers/grading-seed';
  import { seedInvestigatorResult, seedInvestigatorSession, seedPrices, seedRule, storedWith } from './helpers/investigator-seed';

  const SECRET_SCORE = '8.63'; // 10 − 1,37
  const SECRET_RULE = 'sai_bien_bi_mat';

  /**
   * T-SAMP-1 (parent spec): bài kiểm mẫu chưa kiểm — không đường ĐỌC nào lộ điểm hay lỗi của hệ thống. Bài này là
   * lưới an toàn cuối: một endpoint đọc mới mà quên giấu sẽ làm nó đỏ.
   */
  describe('Bài kiểm mẫu chưa kiểm: mọi đường đọc đều mù (e2e)', () => {
    let app: INestApplication;
    let ds: DataSource;
    const stamp = Date.now();

    async function login(label: string): Promise<{ id: string; token: string }> {
      const email = `blind_${label}_${stamp}@example.com`;
      const id = await createTestAccount(ds, { email, password: 'correct-horse-battery', role: 'teacher' });
      const res = await request(app.getHttpServer()).post('/auth/login').send({ email, password: 'correct-horse-battery' });
      return { id, token: res.body.accessToken as string };
    }
    const as = (token: string) => ({ Authorization: `Bearer ${token}` });
    const get = (token: string, url: string) => request(app.getHttpServer()).get(url).set(as(token));

    beforeAll(async () => {
      const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
      app = moduleRef.createNestApplication();
      app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
      app.useGlobalFilters(new PostgresExceptionFilter());
      await app.init();
      ds = app.get(DataSource);
    }, 60_000);
    afterAll(async () => app.close());

    async function world(label: string) {
      const owner = await login(label);
      const ctx = await seedSession(ds, `blind-${label}`, { teacherId: owner.id, deliverableType: 'code_project', language: 'cpp' });
      await seedInvestigatorSession(ds, ctx);
      const secret = await seedRule(ds, ctx.teacherId, SECRET_RULE, 'tinh_dung', { kind: 'test_group_failed', group: 'bien' });
      await seedPrices(ds, ctx.teacherId, { [secret.ruleId]: '1.37' });
      const { resultId } = await seedInvestigatorResult(ds, ctx, storedWith([{ ruleKey: SECRET_RULE, checkedBy: 'machine' }]));
      await app.get(ScoreService).computeInitial(resultId); // → 8,63
      await forceStatus(ds, resultId, 'audit_pending', { audit_sampled: true, audit_sampled_at: new Date() });
      return { owner, ctx, secret, resultId };
    }
    const ruleCount = async (token: string) => {
      const rules: { ruleKey: string; appliedTo: { results: number } }[] = (await get(token, '/rules')).body;
      return rules.find((r) => r.ruleKey === SECRET_RULE)!.appliedTo.results;
    };

    it('danh sách: không điểm, không triage, không độ tin cậy', async () => {
      const w = await world('list');
      const res = await get(w.owner.token, `/exam-sessions/${w.ctx.sessionId}/grading-results`);
      expect(res.status).toBe(200);
      const row = (res.body as { id: string }[]).find((r) => r.id === w.resultId)!;
      expect(row).toMatchObject({
        status: 'audit_pending', aiTotalScore: null, confidence: null, currentScore: null, currentScoreSource: 'none', triage: null,
      });
      expect(JSON.stringify(res.body)).not.toContain(SECRET_SCORE);
      expect(JSON.stringify(res.body)).not.toContain(SECRET_RULE);
    });

    it('hồ sơ: không breakdown, không điều tra, không điểm', async () => {
      const w = await world('detail');
      const res = await get(w.owner.token, `/grading-results/${w.resultId}/investigation`);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ status: 'audit_pending', breakdown: null, investigation: null, currentScore: null });
      expect(JSON.stringify(res.body)).not.toContain(SECRET_SCORE);
      expect(JSON.stringify(res.body)).not.toContain(SECRET_RULE);
    });

    it('tiến độ: chỉ số bài theo trạng thái, không lộ gì', async () => {
      const w = await world('progress');
      const res = await get(w.owner.token, `/exam-sessions/${w.ctx.sessionId}/grading-progress`);
      expect(res.status).toBe(200);
      expect(JSON.stringify(res.body)).not.toContain(SECRET_SCORE);
    });

    // Review Focus #1 — phía luật. Hai đường trả TỪNG BÀI, hai đường rò bằng phép trừ.
    it('xem trước luật (tier 2) không trả bài kiểm mẫu và điểm `before` của nó', async () => {
      const w = await world('rprev');
      const preview = await app.get(ErrorRuleService).preview(w.ctx.teacherId, {
        ruleId: w.secret.ruleId, ruleKey: SECRET_RULE, name: SECRET_RULE, description: SECRET_RULE,
        criterionKey: 'tinh_dung', predicate: { kind: 'test_group_failed', group: 'bien' },
      });
      expect(preview.tier).toBe(2);
      expect(JSON.stringify(preview)).not.toContain(w.resultId);
      expect(JSON.stringify(preview)).not.toContain(SECRET_SCORE);
    });

    it('xem trước giá không đếm bài kiểm mẫu', async () => {
      const w = await world('pprev');
      const preview = await app.get(PriceService).preview(w.ctx.teacherId, w.secret.ruleId, '2.00');
      expect(preview.openSessions).toEqual([]);
    });

    it('số đếm của luật không tính bài kiểm mẫu — và tính lại ngay khi bài được nhận xét (loại theo TRẠNG THÁI)', async () => {
      const w = await world('rcount');
      expect(await ruleCount(w.owner.token)).toBe(0);
      expect(JSON.stringify((await get(w.owner.token, '/rules/missing')).body)).not.toContain(SECRET_SCORE);

      await forceStatus(ds, w.resultId, 'teacher_reviewed'); // đã nhận xét → hết mù
      expect(await ruleCount(w.owner.token)).toBe(1);
      const detail = await get(w.owner.token, `/grading-results/${w.resultId}/investigation`);
      expect(detail.body.breakdown).not.toBeNull();
      expect(detail.body.currentScore).toBe(8.63);
    });
  });
  ```

  ```bash
  pnpm --filter api exec jest --config ./test/jest-e2e.json test/audit-blind.e2e-spec.ts
  ```

  Expected: **RED** — `danh sách` and `hồ sơ` and `tiến độ` pass (Task 3, or nothing to leak); `xem trước luật` fails (`preview` contains the result id and `8.63`), `xem trước giá` fails (`openSessions` has one entry), `số đếm của luật` fails (`ruleCount` is 1, not 0).

- [ ] **Step 2: GREEN — three SQL edits, one line each.**

  In `error-rule.service.ts` replace exactly

  ```ts
            AND g.status IN ('auto_approved', 'audit_pending', 'flagged_for_review', 'teacher_reviewed')
  ```

  with

  ```ts
            AND g.status IN ('auto_approved', 'flagged_for_review', 'teacher_reviewed')
  ```

  (this is the tier-2 preview; `audit_pending` was listed **on purpose** and returned each result's `before` score). In the same file, in `listByState`'s `latest` CTE, replace exactly

  ```ts
            WHERE es.teacher_id = $1
            ORDER BY c.grading_result_id, c.created_at DESC, c.id DESC),
  ```

  with

  ```ts
            WHERE es.teacher_id = $1
              -- Bài kiểm mẫu chưa kiểm không được tính vào số đếm luật: trừ số đếm ra là suy được tập lỗi của nó.
              AND g.status <> 'audit_pending'
            ORDER BY c.grading_result_id, c.created_at DESC, c.id DESC),
  ```

  In `price.service.ts` replace exactly

  ```ts
          WHERE es.teacher_id = $1 AND g.pipeline = 'investigator'
            AND NOT EXISTS (SELECT 1 FROM examcollect.teacher_review t
  ```

  with

  ```ts
          WHERE es.teacher_id = $1 AND g.pipeline = 'investigator'
            AND g.status <> 'audit_pending'
            AND NOT EXISTS (SELECT 1 FROM examcollect.teacher_review t
  ```

  `recomputeForTeacher` (`score.service.ts:288`) keeps `audit_pending` in its status list on purpose: it only **writes** (so a hidden result's score stays right when a price changes) and returns nothing.

  ```bash
  pnpm --filter api exec jest --config ./test/jest-e2e.json test/audit-blind.e2e-spec.ts
  pnpm --filter api exec jest --config ./test/jest-e2e.json test/rules-prices.e2e-spec.ts test/rules-routes.e2e-spec.ts test/rule-entries.e2e-spec.ts test/score-service.e2e-spec.ts
  pnpm --filter api exec tsc --noEmit
  ```

  Expected: canary 6 passed; the neighbouring suites green **unmodified** (if one asserts a rule count or a preview that included an `audit_pending` result, that assertion was written against the very leak this task closes — read it and record a `Ruling:` line before changing anything). `tsc` clean. **Mutation check:** revert the `latest` CTE edit alone, re-run the canary, record that `số đếm của luật` fails; restore.

- [ ] **Step 3: commit.** Title: `fix(audit): loại bài kiểm mẫu khỏi xem trước luật, xem trước giá và số đếm luật; canary mọi đường đọc`.

---

### Task 5: comparing the teacher's picks with the system's — a pure function

**Files:** create `apps/api/src/grading/audit/audit-compare.ts`, `apps/api/src/grading/audit/audit-compare.spec.ts`.

**Interfaces**
- Consumes: nothing.
- Produces: `AuditVerdict = 'both' | 'teacher_only' | 'system_only'`; `AuditSummary { both; teacherOnly; systemOnly; neither; extra: number; agreement: 'full' | 'partial' | 'none' }`; `compareAudit(input: { picked: string[]; systemRuleIds: string[]; extraCount: number; activeRuleCount: number }): { perRule: { ruleId: string; verdict: AuditVerdict }[]; summary: AuditSummary }`.

`agreement`: `full` when there is no `teacherOnly`, no `systemOnly` and no extra error; `none` when nothing is shared (`both = 0`) but something disagrees; otherwise `partial`. An extra error (one the teacher found that is *not in their own rule table*) is by definition something the system could not have named, so it always counts as disagreement.

- [ ] **Step 1: RED.** Create `audit-compare.spec.ts`:

  ```ts
  import { compareAudit } from './audit-compare';

  const cmp = (over: Partial<Parameters<typeof compareAudit>[0]> = {}) =>
    compareAudit({ picked: [], systemRuleIds: [], extraCount: 0, activeRuleCount: 3, ...over });

  describe('compareAudit (parent spec §8.1 rule 3)', () => {
    it('both saw nothing: full agreement, every rule is "neither"', () => {
      expect(cmp()).toEqual({
        perRule: [],
        summary: { both: 0, teacherOnly: 0, systemOnly: 0, neither: 3, extra: 0, agreement: 'full' },
      });
    });

    it('the same set: full agreement', () => {
      const out = cmp({ picked: ['a', 'b'], systemRuleIds: ['b', 'a'] });
      expect(out.perRule).toEqual([
        { ruleId: 'a', verdict: 'both' },
        { ruleId: 'b', verdict: 'both' },
      ]);
      expect(out.summary).toMatchObject({ both: 2, neither: 1, agreement: 'full' });
    });

    it('the teacher saw a rule the system missed, and the system saw one the teacher did not', () => {
      const out = cmp({ picked: ['a', 'c'], systemRuleIds: ['a', 'b'] });
      expect(Object.fromEntries(out.perRule.map((r) => [r.ruleId, r.verdict]))).toEqual({
        a: 'both', c: 'teacher_only', b: 'system_only',
      });
      expect(out.summary).toMatchObject({ both: 1, teacherOnly: 1, systemOnly: 1, agreement: 'partial' });
    });

    it('nothing shared but something disagrees: none', () => {
      expect(cmp({ picked: ['a'], systemRuleIds: ['b'] }).summary.agreement).toBe('none');
      expect(cmp({ picked: ['a'] }).summary.agreement).toBe('none');
      expect(cmp({ systemRuleIds: ['b'] }).summary.agreement).toBe('none');
    });

    it('an extra error alone is disagreement — the system cannot name a rule the teacher does not have', () => {
      expect(cmp({ extraCount: 1 }).summary).toMatchObject({ extra: 1, agreement: 'none' });
      expect(cmp({ picked: ['a'], systemRuleIds: ['a'], extraCount: 2 }).summary).toMatchObject({ both: 1, extra: 2, agreement: 'partial' });
    });

    it('duplicates in either list do not double-count', () => {
      const out = cmp({ picked: ['a', 'a'], systemRuleIds: ['a', 'a', 'a'] });
      expect(out.perRule).toEqual([{ ruleId: 'a', verdict: 'both' }]);
      expect(out.summary.both).toBe(1);
    });

    it('"neither" never goes negative when the system found a rule that is no longer active', () => {
      const out = cmp({ picked: ['a'], systemRuleIds: ['retired_1', 'retired_2'], activeRuleCount: 1 });
      expect(out.summary.neither).toBe(0);
    });
  });
  ```

  ```bash
  pnpm --filter api exec jest src/grading/audit/audit-compare.spec.ts
  ```

  Expected: **RED** — `Cannot find module './audit-compare'`.

- [ ] **Step 2: GREEN.** Create `audit-compare.ts`:

  ```ts
  export type AuditVerdict = 'both' | 'teacher_only' | 'system_only';

  export interface AuditSummary {
    both: number;
    teacherOnly: number;
    systemOnly: number;
    /** Luật đang dùng mà cả hai đều không thấy. */
    neither: number;
    /** Lỗi giảng viên tự viết ngoài bảng lỗi. */
    extra: number;
    agreement: 'full' | 'partial' | 'none';
  }

  /**
   * So tập lỗi giảng viên chọn với tập lỗi hệ thống giữ (parent spec §8.1 luật 3) — theo TỪNG luật, để đọc ra
   * được hệ thống thừa ở đâu, thiếu ở đâu. HÀM THUẦN: nhãn được ghi dù sau đó bất đồng thế nào.
   *
   * Một lỗi "khác" (ngoài bảng lỗi của chính giảng viên) hệ thống không thể gọi tên được, nên luôn tính là bất đồng.
   */
  export function compareAudit(input: {
    picked: string[];
    systemRuleIds: string[];
    extraCount: number;
    activeRuleCount: number;
  }): { perRule: { ruleId: string; verdict: AuditVerdict }[]; summary: AuditSummary } {
    const picked = new Set(input.picked);
    const system = new Set(input.systemRuleIds);
    const perRule = [...new Set([...picked, ...system])].map((ruleId) => ({
      ruleId,
      verdict: (picked.has(ruleId) && system.has(ruleId)
        ? 'both'
        : picked.has(ruleId)
          ? 'teacher_only'
          : 'system_only') as AuditVerdict,
    }));
    const count = (verdict: AuditVerdict) => perRule.filter((r) => r.verdict === verdict).length;
    const both = count('both');
    const teacherOnly = count('teacher_only');
    const systemOnly = count('system_only');
    const disagreement = teacherOnly + systemOnly + input.extraCount;
    return {
      perRule,
      summary: {
        both,
        teacherOnly,
        systemOnly,
        neither: Math.max(0, input.activeRuleCount - perRule.length),
        extra: input.extraCount,
        agreement: disagreement === 0 ? 'full' : both === 0 ? 'none' : 'partial',
      },
    };
  }
  ```

  ```bash
  pnpm --filter api exec jest src/grading/audit/audit-compare.spec.ts
  pnpm --filter api exec tsc --noEmit
  ```

  Expected: 7 passed; `tsc` clean.

- [ ] **Step 3: commit.** Title: `feat(audit): so nhãn giảng viên với chẩn đoán hệ thống theo từng luật (hàm thuần)`.

---

### Task 6: record the blind review — one transaction, immutable — and sign a download for the result's own submission

**Files:** create `apps/api/src/grading/audit/audit-review.service.ts`, `audit-review.controller.ts`, `dto/audit-review.dto.ts`, `apps/api/test/audit-review.e2e-spec.ts`; modify `apps/api/src/grading/grading.module.ts`.

**Interfaces**
- Consumes: `compareAudit`, `AuditVerdict`, `AuditSummary` (Task 5); `lockTeacherScoring`, `latestComputationRow`, `loadCurrentScore` (`scoring/score-inputs.ts`); `advanceStatus` (`lifecycle/advance.ts`); `StorageService.generateDownloadUrl(key, { filename })`; `GradingService.findResultForOwner`.
- Produces: `AuditReviewService.record(teacherId, resultId, dto): Promise<AuditReveal>`; `AuditReviewService.submissionDownload(resultId): Promise<{ downloadUrl: string; fileName: string }>`; `POST /grading-results/:id/audit-review` → 201 `AuditReveal`; `GET /grading-results/:id/submission-download`.

- [ ] **Step 1: RED — the e2e.** Create `apps/api/test/audit-review.e2e-spec.ts`:

  ```ts
  import { randomUUID } from 'node:crypto';
  import { INestApplication, ValidationPipe } from '@nestjs/common';
  import { Test } from '@nestjs/testing';
  import request from 'supertest';
  import { DataSource } from 'typeorm';
  import { AppModule } from '../src/app.module';
  import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
  import { ScoreService } from '../src/grading/scoring/score.service';
  import { createTestAccount } from './helpers/create-account';
  import { forceStatus, seedSession } from './helpers/grading-seed';
  import { seedInvestigatorResult, seedInvestigatorSession, seedPrices, seedRule, storedWith } from './helpers/investigator-seed';

  const SEEN = [
    { ruleKey: 'sai_bien', checkedBy: 'machine' as const },
    { ruleKey: 'ten_bien', checkedBy: 'model' as const },
  ];

  /** T-SAMP-2 và T-SAMP-4 (parent spec), cùng tiết lộ, quyền và các lỗi 4xx. */
  describe('Nhận xét kiểm mẫu (e2e)', () => {
    let app: INestApplication;
    let ds: DataSource;
    const stamp = Date.now();

    async function login(label: string): Promise<{ id: string; token: string }> {
      const email = `audrev_${label}_${stamp}@example.com`;
      const id = await createTestAccount(ds, { email, password: 'correct-horse-battery', role: 'teacher' });
      const res = await request(app.getHttpServer()).post('/auth/login').send({ email, password: 'correct-horse-battery' });
      return { id, token: res.body.accessToken as string };
    }
    const as = (token: string) => ({ Authorization: `Bearer ${token}` });

    beforeAll(async () => {
      const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
      app = moduleRef.createNestApplication();
      app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
      app.useGlobalFilters(new PostgresExceptionFilter());
      await app.init();
      ds = app.get(DataSource);
    }, 60_000);
    afterAll(async () => app.close());

    /** Một bài kiểm mẫu: hệ thống thấy `sai_bien` (bị trừ 1,50 → 8,50); `ten_bien` không có lỗi. */
    async function world(label: string) {
      const owner = await login(label);
      const ctx = await seedSession(ds, `audrev-${label}`, { teacherId: owner.id, deliverableType: 'code_project', language: 'cpp' });
      await seedInvestigatorSession(ds, ctx);
      const bien = await seedRule(ds, ctx.teacherId, 'sai_bien', 'tinh_dung', { kind: 'test_group_failed', group: 'bien' });
      const ten = await seedRule(ds, ctx.teacherId, 'ten_bien', 'trinh_bay');
      await seedPrices(ds, ctx.teacherId, { [bien.ruleId]: '1.50', [ten.ruleId]: '0.50' });
      const { resultId } = await seedInvestigatorResult(ds, ctx, storedWith(SEEN));
      await app.get(ScoreService).computeInitial(resultId);
      await forceStatus(ds, resultId, 'audit_pending', { audit_sampled: true, audit_sampled_at: new Date() });
      return { owner, ctx, bien, ten, resultId };
    }
    const post = (token: string, resultId: string, body: object) =>
      request(app.getHttpServer()).post(`/grading-results/${resultId}/audit-review`).set(as(token)).send(body);
    const statusOf = async (id: string) =>
      (await ds.query(`SELECT status, audit_sampled FROM examcollect.grading_result WHERE id = $1`, [id]))[0];
    const labelOf = async (id: string) =>
      (await ds.query(`SELECT teacher_id, picked_rule_ids, extra_errors FROM examcollect.audit_sample_review WHERE grading_result_id = $1`, [id]));

    it('ghi nhãn và tiết lộ: điểm hệ thống, lỗi hệ thống giữ, so sánh từng luật; bài sang teacher_reviewed', async () => {
      const w = await world('ok');

      const res = await post(w.owner.token, w.resultId, { pickedRuleIds: [w.bien.ruleId], extraErrors: [] });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ status: 'teacher_reviewed', currentScore: 8.5, currentScoreSource: 'computation' });
      expect(res.body.systemErrors).toEqual([
        expect.objectContaining({ ruleId: w.bien.ruleId, ruleKey: 'sai_bien', counted: 'counted' }),
      ]);
      expect(res.body.perRule).toEqual([
        { ruleId: w.bien.ruleId, ruleKey: 'sai_bien', ruleName: 'sai_bien', verdict: 'both' },
      ]);
      expect(res.body.summary).toEqual({ both: 1, teacherOnly: 0, systemOnly: 0, neither: 1, extra: 0, agreement: 'full' });
      expect(await statusOf(w.resultId)).toMatchObject({ status: 'teacher_reviewed', audit_sampled: true });
      expect(await labelOf(w.resultId)).toEqual([
        { teacher_id: w.owner.id, picked_rule_ids: [w.bien.ruleId], extra_errors: [] },
      ]);
    });

    // T-SAMP-2, nửa "vẫn là nhãn dù bước sau chọn gì": bất đồng, rồi chấm tay — nhãn không đổi.
    it('bất đồng với hệ thống vẫn ghi nhãn, và chấm tay sau đó không đụng nhãn', async () => {
      const w = await world('disagree');

      const res = await post(w.owner.token, w.resultId, { pickedRuleIds: [w.ten.ruleId], extraErrors: ['  Thiếu chú thích  '] });

      expect(res.status).toBe(201);
      expect(Object.fromEntries(res.body.perRule.map((r: { ruleKey: string; verdict: string }) => [r.ruleKey, r.verdict]))).toEqual({
        ten_bien: 'teacher_only', sai_bien: 'system_only',
      });
      expect(res.body.summary).toMatchObject({ teacherOnly: 1, systemOnly: 1, extra: 1, agreement: 'none' });
      expect(res.body.extraErrors).toEqual(['Thiếu chú thích']);

      // Giờ bài ở teacher_reviewed nên sửa được bằng đường có sẵn.
      await request(app.getHttpServer())
        .post(`/grading-results/${w.resultId}/manual-score`).set(as(w.owner.token)).send({ score: '7.00' }).expect(201);
      expect(await labelOf(w.resultId)).toEqual([
        { teacher_id: w.owner.id, picked_rule_ids: [w.ten.ruleId], extra_errors: ['Thiếu chú thích'] },
      ]);
    });

    // T-SAMP-2, nửa "ghi rồi thì khoá".
    it('ghi lần hai → 409 nói nhãn đã khoá, không có dòng thứ hai, nhãn đầu giữ nguyên', async () => {
      const w = await world('twice');
      await post(w.owner.token, w.resultId, { pickedRuleIds: [w.bien.ruleId], extraErrors: [] }).expect(201);

      const second = await post(w.owner.token, w.resultId, { pickedRuleIds: [w.ten.ruleId], extraErrors: [] });

      expect(second.status).toBe(409);
      expect(second.body.message).toContain('Nhận xét kiểm mẫu của bài này đã ghi');
      const rows = await labelOf(w.resultId);
      expect(rows).toHaveLength(1);
      expect(rows[0].picked_rule_ids).toEqual([w.bien.ruleId]);
    });

    it('bài không ở trạng thái kiểm mẫu → 409', async () => {
      const w = await world('notaudit');
      await forceStatus(ds, w.resultId, 'auto_approved', { audit_sampled: false, audit_sampled_at: null });

      const res = await post(w.owner.token, w.resultId, { pickedRuleIds: [], extraErrors: [] });

      expect(res.status).toBe(409);
      expect(res.body.message).toContain('không ở trạng thái kiểm mẫu');
      expect(await labelOf(w.resultId)).toEqual([]);
    });

    it('luật của giảng viên khác → 400, không ghi gì, bài vẫn kiểm mẫu', async () => {
      const w = await world('foreign');
      const other = await world('foreign-other');

      const res = await post(w.owner.token, w.resultId, { pickedRuleIds: [other.bien.ruleId], extraErrors: [] });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('không thuộc bảng lỗi đang dùng');
      expect(await labelOf(w.resultId)).toEqual([]);
      expect((await statusOf(w.resultId)).status).toBe('audit_pending');
    });

    it('luật đã thôi dùng → 400', async () => {
      const w = await world('retired');
      await ds.query(`UPDATE examcollect.error_rule SET state = 'retired' WHERE id = $1`, [w.ten.ruleId]);

      const res = await post(w.owner.token, w.resultId, { pickedRuleIds: [w.ten.ruleId], extraErrors: [] });

      expect(res.status).toBe(400);
    });

    it('dòng "lỗi khác" chỉ có khoảng trắng → 400; id không phải uuid → 400', async () => {
      const w = await world('bad');
      expect((await post(w.owner.token, w.resultId, { pickedRuleIds: [], extraErrors: ['   '] })).status).toBe(400);
      expect((await post(w.owner.token, w.resultId, { pickedRuleIds: ['khong-phai-uuid'], extraErrors: [] })).status).toBe(400);
      expect((await post(w.owner.token, w.resultId, { pickedRuleIds: [] })).status).toBe(400);
    });

    // Spec D8: độ dài của dòng "lỗi khác" tính SAU khi trim.
    it('dòng "lỗi khác" dài quá 500 ký tự sau khi trim → 400; đúng 500 ký tự kèm khoảng trắng hai đầu → nhận', async () => {
      const w = await world('long');
      const tooLong = await post(w.owner.token, w.resultId, { pickedRuleIds: [], extraErrors: ['x'.repeat(501)] });
      expect(tooLong.status).toBe(400);
      expect(tooLong.body.message).toContain('tối đa 500 ký tự');
      expect(await labelOf(w.resultId)).toEqual([]);

      const padded = await post(w.owner.token, w.resultId, { pickedRuleIds: [], extraErrors: [`  ${'x'.repeat(500)}  `] });
      expect(padded.status).toBe(201);
      expect(padded.body.extraErrors).toEqual(['x'.repeat(500)]);
    });

    it('giảng viên khác → 403; bài không tồn tại → 404', async () => {
      const w = await world('perm');
      const stranger = await login('perm-khac');
      expect((await post(stranger.token, w.resultId, { pickedRuleIds: [], extraErrors: [] })).status).toBe(403);
      expect((await post(w.owner.token, randomUUID(), { pickedRuleIds: [], extraErrors: [] })).status).toBe(404);
    });

    // T-SAMP-4: bài kiểm mẫu chưa kiểm chặn chốt điểm — và hết chặn ngay khi nhận xét được ghi.
    it('còn bài kiểm mẫu chưa kiểm → chốt điểm 409; nhận xét xong → chốt được', async () => {
      const w = await world('finalize');
      const finalize = () => request(app.getHttpServer()).post(`/exam-sessions/${w.ctx.sessionId}/finalize-grades`).set(as(w.owner.token));

      const blocked = await finalize();
      expect(blocked.status).toBe(409);
      expect(blocked.body.message).toContain('chưa duyệt xong');

      await post(w.owner.token, w.resultId, { pickedRuleIds: [w.bien.ruleId], extraErrors: [] }).expect(201);
      const done = await finalize();
      expect(done.status).toBe(200);
      expect((await statusOf(w.resultId)).status).toBe('finalized');
    });

    describe('GET /grading-results/:id/submission-download', () => {
      it('bài chưa có file trên kho → 404 với câu tiếng Việt', async () => {
        const w = await world('dl-none');
        const res = await request(app.getHttpServer()).get(`/grading-results/${w.resultId}/submission-download`).set(as(w.owner.token));
        expect(res.status).toBe(404);
        expect(res.body.message).toContain('chưa có file');
      });

      it('bài có file → URL ký cho đúng khoá của bài, kèm tên file đã khai', async () => {
        const w = await world('dl-ok');
        const key = `submissions/${randomUUID()}/mssv/deliverable`;
        await ds.query(
          `UPDATE examcollect.submission SET storage_key = $2 WHERE id = (SELECT submission_id FROM examcollect.grading_result WHERE id = $1)`,
          [w.resultId, key],
        );

        const res = await request(app.getHttpServer()).get(`/grading-results/${w.resultId}/submission-download`).set(as(w.owner.token));

        expect(res.status).toBe(200);
        expect(res.body.fileName).toBe('Cau1.docx');
        expect(res.body.downloadUrl).toContain(key);
      });

      it('giảng viên khác → 403', async () => {
        const w = await world('dl-perm');
        const stranger = await login('dl-perm-khac');
        const res = await request(app.getHttpServer()).get(`/grading-results/${w.resultId}/submission-download`).set(as(stranger.token));
        expect(res.status).toBe(403);
      });
    });
  });
  ```

  ```bash
  pnpm --filter api exec jest --config ./test/jest-e2e.json test/audit-review.e2e-spec.ts
  ```

  Expected: **RED** — every call returns 404 (no such route). (`world()` itself must work first: if `computeInitial` or a seed fails, fix the seed call — do not skip the case.)

- [ ] **Step 2: GREEN — the DTO.** Create `apps/api/src/grading/audit/dto/audit-review.dto.ts`:

  ```ts
  import { ArrayMaxSize, IsArray, IsString, IsUUID, MaxLength } from 'class-validator';

  /**
   * Nhận xét kiểm mẫu (parent spec §8.1 luật 3). Cả hai trường bắt buộc và ĐƯỢC RỖNG: "bài này không có lỗi" là
   * một nhãn thật — thiếu trường thì 400, còn mảng rỗng thì ghi.
   */
  export class AuditReviewDto {
    /** Luật giảng viên thấy trong bài, từ bảng lỗi ĐANG DÙNG của chính họ. */
    @IsArray()
    @ArrayMaxSize(200)
    @IsUUID('all', { each: true })
    pickedRuleIds!: string[];

    /**
     * Lỗi không có trong bảng lỗi — mỗi dòng một lỗi. Độ dài THẬT (1–500) kiểm SAU khi trim ở service (spec D8);
     * `MaxLength(2000)` ở đây chỉ chặn tải trọng khổng lồ trước khi tới service.
     */
    @IsArray()
    @ArrayMaxSize(20)
    @IsString({ each: true })
    @MaxLength(2000, { each: true })
    extraErrors!: string[];
  }
  ```

  Note: the DTO bounds the *shape*, the service owns the *meaning* — `'   '` and a 501-character line both pass the DTO and are refused by the service with a Vietnamese 400; a 500-character line padded with spaces is accepted, because the limit applies **after** trimming (spec D8).

- [ ] **Step 3: GREEN — the service.** Create `apps/api/src/grading/audit/audit-review.service.ts`:

  ```ts
  import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
  import { InjectDataSource } from '@nestjs/typeorm';
  import { DataSource, EntityManager } from 'typeorm';
  import { advanceStatus } from '../lifecycle/advance';
  import { latestComputationRow, loadCurrentScore, lockTeacherScoring } from '../scoring/score-inputs';
  import { StorageService } from '../../storage/storage.service';
  import { compareAudit, type AuditSummary, type AuditVerdict } from './audit-compare';

  export const AUDIT_EXTRA_MAX_LENGTH = 500;

  export const AUDIT_MESSAGES = {
    notSampled: 'Bài này không ở trạng thái kiểm mẫu — không ghi nhận xét kiểm mẫu được.',
    locked: 'Nhận xét kiểm mẫu của bài này đã ghi — khoá, không ghi lại được.',
    foreignRule: 'Có luật được chọn không thuộc bảng lỗi đang dùng của bạn.',
    blankExtra: 'Mỗi lỗi khác phải có nội dung.',
    longExtra: `Mỗi lỗi khác tối đa ${AUDIT_EXTRA_MAX_LENGTH} ký tự.`,
    noFile: 'Bài này chưa có file trên kho lưu trữ.',
  } as const;

  /** Bản tiết lộ: lúc che mù kết thúc. */
  export interface AuditReveal {
    status: 'teacher_reviewed';
    currentScore: number | null;
    currentScoreSource: string;
    systemErrors: { ruleId: string; ruleKey: string; ruleName: string; counted: 'counted' | 'unpriced' }[];
    perRule: { ruleId: string; ruleKey: string; ruleName: string; verdict: AuditVerdict }[];
    extraErrors: string[];
    summary: AuditSummary;
  }

  @Injectable()
  export class AuditReviewService {
    constructor(
      @InjectDataSource() private readonly ds: DataSource,
      private readonly storage: StorageService,
    ) {}

    /**
     * Ghi nhận xét kiểm mẫu VÀ tiết lộ, trong MỘT transaction: không có khoảng "đã ghi mà chưa mở" để nhãn bị sửa.
     * Quyền sở hữu do controller kiểm trước (`findResultForOwner`).
     *
     * Thứ tự khoá như `ErrorExceptionService.lockEditable`: khoá chấm điểm của giảng viên rồi mới khoá dòng.
     * Nhãn chỉ-thêm ở DB (khoá chính = id kết quả + `guard_append_only`), nhưng kiểm tường minh TRƯỚC khi ghi để
     * trả một câu tiếng Việt thay vì 23505 chung chung.
     *
     * Bài sang `teacher_reviewed`; điểm là lượt tính mới nhất của hệ thống, KHÔNG đổi, và không có dòng
     * `teacher_review` — `finalizeGrades` chốt bài điều tra `teacher_reviewed` không cần nó. Bất đồng thì giảng
     * viên dùng đường có sẵn (ngoại lệ, chấm tay): giờ mở vì `teacher_reviewed` sửa được.
     */
    async record(
      teacherId: string,
      resultId: string,
      dto: { pickedRuleIds: string[]; extraErrors: string[] },
    ): Promise<AuditReveal> {
      const picked = [...new Set(dto.pickedRuleIds)];
      const extras = dto.extraErrors.map((line) => line.trim());
      if (extras.some((line) => line === '')) throw new BadRequestException(AUDIT_MESSAGES.blankExtra);
      if (extras.some((line) => line.length > AUDIT_EXTRA_MAX_LENGTH)) throw new BadRequestException(AUDIT_MESSAGES.longExtra);

      return this.ds.transaction(async (m) => {
        await lockTeacherScoring(m, teacherId);
        const [row] = await m.query(`SELECT status FROM examcollect.grading_result WHERE id = $1 FOR UPDATE`, [resultId]);
        if (!row || row.status !== 'audit_pending') throw new ConflictException(AUDIT_MESSAGES.notSampled);
        const [done] = await m.query(`SELECT 1 FROM examcollect.audit_sample_review WHERE grading_result_id = $1`, [resultId]);
        if (done) throw new ConflictException(AUDIT_MESSAGES.locked);

        // Luật hợp lệ = bảng lỗi ĐANG DÙNG của CHÍNH giảng viên (§8.1 luật 3), không phải mọi luật.
        const active: { id: string }[] = await m.query(
          `SELECT id FROM examcollect.error_rule WHERE teacher_id = $1 AND state = 'active'`,
          [teacherId],
        );
        const activeIds = new Set(active.map((r) => r.id));
        if (picked.some((id) => !activeIds.has(id))) throw new BadRequestException(AUDIT_MESSAGES.foreignRule);

        await m.query(
          `INSERT INTO examcollect.audit_sample_review (grading_result_id, teacher_id, picked_rule_ids, extra_errors)
           VALUES ($1, $2, $3, $4)`,
          [resultId, teacherId, picked, extras],
        );
        const moved = await advanceStatus(m, resultId, ['audit_pending'], 'teacher_reviewed', { flagForReview: false });
        if (!moved) throw new ConflictException(AUDIT_MESSAGES.notSampled);

        return this.reveal(m, resultId, picked, extras, activeIds.size);
      });
    }

    /** "Hệ thống thấy lỗi nào" = lượt tính mới nhất, bỏ lỗi bị bác (`refuted`) và bị bỏ (`excluded`). */
    private async reveal(
      m: EntityManager,
      resultId: string,
      picked: string[],
      extras: string[],
      activeRuleCount: number,
    ): Promise<AuditReveal> {
      const latest = await latestComputationRow(m, resultId);
      const kept = (latest?.breakdown.errors ?? []).filter((e) => e.counted === 'counted' || e.counted === 'unpriced');
      const cmp = compareAudit({
        picked,
        systemRuleIds: kept.map((e) => e.ruleId),
        extraCount: extras.length,
        activeRuleCount,
      });

      const ids = [...new Set([...cmp.perRule.map((r) => r.ruleId), ...kept.map((e) => e.ruleId)])];
      const names = new Map<string, { key: string; name: string }>();
      if (ids.length > 0) {
        const rows: { id: string; rule_key: string; name: string }[] = await m.query(
          `SELECT r.id, r.rule_key, v.name FROM examcollect.error_rule r
             JOIN examcollect.error_rule_revision v ON v.id = r.current_revision_id
            WHERE r.id = ANY($1::uuid[])`,
          [ids],
        );
        for (const r of rows) names.set(r.id, { key: r.rule_key, name: r.name });
      }
      const label = (ruleId: string, fallbackKey: string) => ({
        ruleKey: names.get(ruleId)?.key ?? fallbackKey,
        ruleName: names.get(ruleId)?.name ?? fallbackKey,
      });
      const score = await loadCurrentScore(m, resultId);
      return {
        status: 'teacher_reviewed',
        currentScore: score.value,
        currentScoreSource: score.source,
        systemErrors: kept.map((e) => ({
          ruleId: e.ruleId,
          ...label(e.ruleId, e.ruleKey),
          counted: e.counted as 'counted' | 'unpriced',
        })),
        perRule: cmp.perRule.map((r) => ({ ruleId: r.ruleId, ...label(r.ruleId, r.ruleId), verdict: r.verdict })),
        extraErrors: extras,
        summary: cmp.summary,
      };
    }

    /**
     * URL tải bài nộp của ĐÚNG bài này. Giảng viên không mở được bài nộp code từ màn chấm hôm nay, và
     * `SubmissionStatusItem` không mang `submissionId` nên khớp theo MSSV mơ hồ khi phiên có nhiều yêu cầu nộp.
     * Không lộ gì về phán đoán của hệ thống. Quyền sở hữu do controller kiểm trước.
     */
    async submissionDownload(resultId: string): Promise<{ downloadUrl: string; fileName: string }> {
      const [row] = await this.ds.query(
        `SELECT s.storage_key, rd.required_filename
           FROM examcollect.grading_result g
           JOIN examcollect.submission s ON s.id = g.submission_id
           JOIN examcollect.required_deliverable rd ON rd.id = s.required_deliverable_id
          WHERE g.id = $1`,
        [resultId],
      );
      if (!row?.storage_key) throw new NotFoundException(AUDIT_MESSAGES.noFile);
      const { downloadUrl } = await this.storage.generateDownloadUrl(row.storage_key as string, {
        filename: row.required_filename as string,
      });
      return { downloadUrl, fileName: row.required_filename as string };
    }
  }
  ```

- [ ] **Step 4: GREEN — controller and module.** Create `audit-review.controller.ts`:

  ```ts
  import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
  import type { Request } from 'express';
  import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
  import { Roles } from '../../auth/roles.decorator';
  import { RolesGuard } from '../../auth/roles.guard';
  import { GradingService } from '../grading.service';
  import { AuditReviewDto } from './dto/audit-review.dto';
  import { AuditReviewService } from './audit-review.service';

  /** Nhận xét kiểm mẫu (parent spec §8.1). Quyền sở hữu luôn qua `findResultForOwner` trước. */
  @Controller()
  @UseGuards(JwtAuthGuard, RolesGuard)
  export class AuditReviewController {
    constructor(
      private readonly audit: AuditReviewService,
      private readonly grading: GradingService,
    ) {}

    @Post('grading-results/:id/audit-review')
    @Roles('teacher')
    async record(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AuditReviewDto, @Req() req: Request) {
      const result = await this.grading.findResultForOwner(id, req.user!.sub);
      return this.audit.record(req.user!.sub, result.id, dto);
    }

    @Get('grading-results/:id/submission-download')
    @Roles('teacher')
    async download(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
      const result = await this.grading.findResultForOwner(id, req.user!.sub);
      return this.audit.submissionDownload(result.id);
    }
  }
  ```

  In `grading.module.ts` add the two imports directly after `import { TestBundleService } from './test-bundle/test-bundle.service';`:

  ```ts
  import { AuditReviewController } from './audit/audit-review.controller';
  import { AuditReviewService } from './audit/audit-review.service';
  ```

  replace exactly `  controllers: [GradingController, RulesController, TestBundleController],` with `  controllers: [GradingController, RulesController, TestBundleController, AuditReviewController],` and replace exactly

  ```ts
      TestBundleService,
      GradingRunService,
  ```

  with

  ```ts
      TestBundleService,
      AuditReviewService,
      GradingRunService,
  ```

  ```bash
  pnpm --filter api exec jest --config ./test/jest-e2e.json test/audit-review.e2e-spec.ts
  pnpm --filter api exec jest --config ./test/jest-e2e.json test/error-exception.e2e-spec.ts test/finalize-investigator.e2e-spec.ts test/grading-lifecycle-v2.e2e-spec.ts
  pnpm --filter api exec tsc --noEmit
  pnpm check:cycles
  ```

  Expected: `audit-review` 13 passed (10 + 3 in the download block); neighbours green (the `error-exception` 409 *"hãy ghi nhận xét kiểm mẫu trước"* now points at a route that exists); `tsc` clean (`StorageModule` is already imported by `GradingModule`, so `StorageService` injects); `0 vòng lặp`.

- [ ] **Step 5: `detect_changes` and commit.** Title: `feat(audit): ghi nhận xét kiểm mẫu nguyên tử và bất biến, tiết lộ so sánh; route tải bài nộp`.

---

### Task 7: regenerate the OpenAPI schema; the web API and hooks

**Files:** `packages/shared/src/api/schema.d.ts` (regenerate), create `apps/web/src/lib/api/audit.ts`, `apps/web/src/hooks/useAudit.ts`.

**Interfaces**
- Consumes: both routes from Task 6, in the generated schema; `investigationQueryKey(gradingResultId)` (`hooks/useGrading.ts:311`).
- Produces: `AuditReveal` (web mirror), `recordAuditReview(resultId, body)`, `getSubmissionDownload(resultId)`; `useRecordAuditReview(resultId)` (does **not** refresh — D19), `useSubmissionDownload(resultId)`, `useOpenDossierAfterAudit(sessionId, resultId)` (returns a function that refreshes the list and the dossier).

- [ ] **Step 1: Regenerate — only after both routes exist.** The schema is generated from a **running** API (`packages/shared/scripts/generate-api-client.mjs` fetches `API_URL`, default port 4000). Start this package's own server on 4004 from `.env.test` — **never** a bare `node -r dotenv/config …`, which would load `apps/api/.env` and connect to the remote Supabase database:

  ```bash
  cd "C:/Users/Admin/Main/Desktop/HKI 2026-2027/KLTN/CINE/.claude/worktrees/grading-g4-audit/apps/api"
  pnpm build
  PORT=4004 DOTENV_CONFIG_PATH=.env.test node -r dotenv/config dist/src/main.js   # run in the background
  until [ "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:4004/api-docs-json)" = "200" ]; do sleep 2; done
  cd ../../packages/shared && API_URL=http://localhost:4004/api-docs-json pnpm generate:api-client
  ```

  Expected: `Wrote packages/shared/src/api/schema.d.ts`. Stop the server (`TaskStop`). The startup command is the one recorded and tried in `docs/superpowers/plans/2026-09-29-g2-g5-parallel-execution.md` §2.

- [ ] **Step 2: The API module.** Create `apps/web/src/lib/api/audit.ts`:

  ```ts
  import { apiClient } from '@/lib/api-client';

  /** Mirrors `AuditReveal` (apps/api/src/grading/audit/audit-review.service.ts). */
  export interface AuditReveal {
    status: 'teacher_reviewed';
    currentScore: number | null;
    currentScoreSource: string;
    systemErrors: { ruleId: string; ruleKey: string; ruleName: string; counted: 'counted' | 'unpriced' }[];
    perRule: { ruleId: string; ruleKey: string; ruleName: string; verdict: 'both' | 'teacher_only' | 'system_only' }[];
    extraErrors: string[];
    summary: {
      both: number;
      teacherOnly: number;
      systemOnly: number;
      neither: number;
      extra: number;
      agreement: 'full' | 'partial' | 'none';
    };
  }

  function fail(error: unknown, response: Response): Error {
    const body = error as { message?: string | string[] } | undefined;
    const message = Array.isArray(body?.message) ? body!.message.join('; ') : body?.message;
    return new Error(message ?? `Yêu cầu thất bại (HTTP ${response.status})`);
  }

  /** Ghi nhận xét kiểm mẫu rồi nhận bản tiết lộ. Ghi rồi thì khoá: lần hai server trả 409. */
  export async function recordAuditReview(
    resultId: string,
    body: { pickedRuleIds: string[]; extraErrors: string[] },
  ): Promise<AuditReveal> {
    const { data, error, response } = await apiClient.POST('/grading-results/{id}/audit-review', {
      params: { path: { id: resultId } },
      body,
    });
    if (error || !response.ok) throw fail(error, response);
    return data as unknown as AuditReveal;
  }

  /** URL tải bài nộp của ĐÚNG bài này (không phán đoán của hệ thống nào đi kèm). */
  export async function getSubmissionDownload(resultId: string): Promise<{ downloadUrl: string; fileName: string }> {
    const { data, error, response } = await apiClient.GET('/grading-results/{id}/submission-download', {
      params: { path: { id: resultId } },
    });
    if (error || !response.ok) throw fail(error, response);
    return data as unknown as { downloadUrl: string; fileName: string };
  }
  ```

  If `tsc` rejects `body` because the generated request type differs, fix the call to match the generated type — the DTO's two arrays are the contract. Cast only the response (`as unknown as …`), as the sibling API modules do.

- [ ] **Step 3: The hooks.** Create `apps/web/src/hooks/useAudit.ts`:

  ```ts
  'use client';

  import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
  import { investigationQueryKey } from '@/hooks/useGrading';
  import { getSubmissionDownload, recordAuditReview } from '@/lib/api/audit';

  /**
   * KHÔNG làm mới danh sách/hồ sơ khi ghi thành công: ngay khi trạng thái đổi sang `teacher_reviewed`, trang hồ sơ
   * chuyển sang hồ sơ thường và bản tiết lộ biến mất trước khi người dùng kịp đọc. Làm mới do
   * `useOpenDossierAfterAudit` — chỉ khi giảng viên bấm *Mở hồ sơ*.
   */
  export function useRecordAuditReview(resultId: string) {
    return useMutation({
      mutationFn: (body: { pickedRuleIds: string[]; extraErrors: string[] }) => recordAuditReview(resultId, body),
    });
  }

  export function useSubmissionDownload(resultId: string) {
    return useQuery({
      queryKey: ['grading-results', resultId, 'submission-download'],
      queryFn: () => getSubmissionDownload(resultId),
      // URL ký có hạn; không giữ lâu.
      staleTime: 60_000,
    });
  }

  /** Trả một hàm làm mới danh sách và hồ sơ — gọi khi giảng viên bấm *Mở hồ sơ*. */
  export function useOpenDossierAfterAudit(sessionId: string, resultId: string) {
    const queryClient = useQueryClient();
    return () => {
      void queryClient.invalidateQueries({ queryKey: ['exam-sessions', sessionId, 'grading-results'] });
      void queryClient.invalidateQueries({ queryKey: ['exam-sessions', sessionId, 'grading-progress'] });
      void queryClient.invalidateQueries({ queryKey: investigationQueryKey(resultId) });
    };
  }
  ```

  ```bash
  pnpm --filter web exec tsc --noEmit
  pnpm --filter web exec eslint src/lib/api/audit.ts src/hooks/useAudit.ts
  ```

  Expected: `tsc` only the 7 known `read-workbook.test.ts` lines (a type error at `apiClient.POST('/grading-results/{id}/audit-review')` means the schema was regenerated before the route existed — redo Step 1); eslint 0 errors.

- [ ] **Step 4: commit.** Title: `chore(web): regenerate schema; API và hook nhận xét kiểm mẫu`.


---

### Task 8: the list hides the score; the finalize panel's audit group becomes real

**Files:** modify `apps/web/src/lib/session-triage.ts` (+ `session-triage.test.ts`), `apps/web/src/app/teacher/grading/_components/ResultsTable.tsx` (+ `ResultsTable.test.tsx`), `apps/web/src/app/teacher/grading/_components/FinalizePanel.tsx` (+ `FinalizePanel.test.tsx`).

**Interfaces**
- Consumes: `stateOf` (`'audit'` already exists for `audit_pending`), `formatVnPoints`.
- Produces: `ScoreTag` gains `'chờ nhận xét của bạn'`; `scoreCell(result, 'audit')` → `{ text: 'ẩn', tag: 'chờ nhận xét của bạn' }` **whatever `currentScore` holds** (the API already hides it — this is the second lock, so a stale cache or a future leak still shows nothing); `reasonOf` answers for the `audit` state.

**Existing tests that encode the old behaviour (read before editing; never weaken):**

| Test | Today | After |
|---|---|---|
| `FinalizePanel.test.tsx:62-64` — *"the sampling audit step is 'cần backend'"* | asserts the badge is present | **replaced**: the group is a real blocker with a link to the audit-filtered list and **no** badge (the rest of that `describe` is untouched) |
| `session-triage.test.ts:103-123` `scoreCell` block | null → `—`; computed → tạm tính; manual; finalised; zero | unchanged — every state other than `audit` behaves as before |
| `ResultsTable.test.tsx:120,132` | no `Kiểm mẫu` chip when no audit rows; the empty-filter message | unchanged |

- [ ] **Step 1: RED — the pure functions.** In `session-triage.test.ts`, after the test `never reads aiTotalScore or finalScore`, inside the same `describe`, add:

  ```ts
  it('an audit-pending result shows "ẩn", never a number — even if the payload carried one (T-SAMP-1, second lock)', () => {
    expect(scoreCell(result({ currentScore: 8.63 }), 'audit')).toEqual({ text: 'ẩn', tag: 'chờ nhận xét của bạn' });
    expect(scoreCell(result({ currentScore: 0 }), 'audit')).toEqual({ text: 'ẩn', tag: 'chờ nhận xét của bạn' });
  });
  it('an audit-pending result without a score is still "ẩn", not "chưa có điểm" (those are different claims)', () => {
    expect(scoreCell(result({ currentScore: null }), 'audit')).toEqual({ text: 'ẩn', tag: 'chờ nhận xét của bạn' });
  });
  ```

  and in `describe('reasonOf'`, after `is null for a result nobody needs to look at`:

  ```ts
  it('an audit-pending result says why its score is hidden', () => {
    expect(reasonOf(result({ status: 'audit_pending', triage: null }))).toBe(
      'Kiểm mẫu ngẫu nhiên — ghi nhận xét của bạn trước, điểm hệ thống hiện sau.',
    );
  });
  it('a result in any other state is unaffected by the audit sentence', () => {
    expect(reasonOf(result({ status: 'teacher_reviewed', triage: triage() }))).toBeNull();
  });
  ```

  In `ResultsTable.test.tsx`, before `describe('filter'`, add:

  ```tsx
  it('an audit-pending row hides the score behind "ẩn", says why, and still opens the dossier (T-SAMP-1)', () => {
    render(<ResultsTable {...props({ results: [result({ id: 'q', studentMssv: '20120099', status: 'audit_pending', currentScore: 8.63, triage: null })] })} />);
    const row = rows()[0];
    expect(within(row).getByText('ẩn')).toBeInTheDocument();
    expect(within(row).getByText('chờ nhận xét của bạn')).toBeInTheDocument();
    expect(row).not.toHaveTextContent('8,6');
    expect(row).not.toHaveTextContent('8.63');
    expect(within(row).getByText('Kiểm mẫu ngẫu nhiên — ghi nhận xét của bạn trước, điểm hệ thống hiện sau.')).toBeInTheDocument();
    expect(within(row).getByRole('link', { name: '20120099' })).toHaveAttribute('href', '/teacher/grading/q?sessionId=s1');
  });
  ```

  In `FinalizePanel.test.tsx`, **replace** the test at lines 62-64 (`the sampling audit step is "cần backend" — …`, three lines) with:

  ```tsx
  it('the sampling audit step is a real blocker the teacher clears in the list — no "cần backend" badge', () => {
    renderPanel(blocked());
    const item = screen.getByText('1 bài kiểm mẫu chưa kiểm').closest('li')!;
    expect(within(item).queryByText('cần backend')).not.toBeInTheDocument();
    expect(within(item).getByRole('link', { name: /Xem 1 bài kiểm mẫu chưa kiểm/ })).toHaveAttribute(
      'href',
      '/teacher/grading?sessionId=s1&state=audit',
    );
  });
  ```

  ```bash
  pnpm --filter web exec vitest run src/lib/session-triage.test.ts src/app/teacher/grading/_components/ResultsTable.test.tsx src/app/teacher/grading/_components/FinalizePanel.test.tsx
  ```

  Expected: **RED** — the `scoreCell`/`reasonOf` cases fail on the value, the `ResultsTable` case on `getByText('ẩn')`, the `FinalizePanel` case on the badge that is still there.

- [ ] **Step 2: GREEN — `session-triage.ts`.** Replace exactly

  ```ts
  export type ScoreTag = 'tạm tính' | 'chấm tay' | 'đã chốt' | 'chưa có điểm';
  ```

  with

  ```ts
  export type ScoreTag = 'tạm tính' | 'chấm tay' | 'đã chốt' | 'chưa có điểm' | 'chờ nhận xét của bạn';
  ```

  replace exactly

  ```ts
    const score = result.currentScore ?? null;
    if (score === null) return { text: '—', tag: 'chưa có điểm' };
  ```

  with

  ```ts
    // Bài kiểm mẫu chưa kiểm: điểm hệ thống bị ẩn tới khi giảng viên ghi nhận xét (parent spec §8.1 luật 2). API đã bỏ
    // điểm khỏi payload — dòng này là khoá thứ hai, để một cache cũ hay một lỗi sau này cũng không lộ con số.
    if (state === 'audit') return { text: 'ẩn', tag: 'chờ nhận xét của bạn' };
    const score = result.currentScore ?? null;
    if (score === null) return { text: '—', tag: 'chưa có điểm' };
  ```

  and replace exactly

  ```ts
    const state = stateOf(result);
    if (state === 'ungradable') return result.ungradableReason;
    if (state !== 'needsYou') return null;
  ```

  with

  ```ts
    const state = stateOf(result);
    if (state === 'ungradable') return result.ungradableReason;
    if (state === 'audit') return 'Kiểm mẫu ngẫu nhiên — ghi nhận xét của bạn trước, điểm hệ thống hiện sau.';
    if (state !== 'needsYou') return null;
  ```

- [ ] **Step 3: GREEN — `ResultsTable.tsx`.** Add the import directly after `import Link from 'next/link';`:

  ```tsx
  import { EyeOff } from 'lucide-react';
  ```

  and replace exactly

  ```tsx
                      <TableCell data-cell="score" className="text-right">
                        <span className="font-semibold tabular-nums">{score.text}</span>{' '}
  ```

  with

  ```tsx
                      <TableCell data-cell="score" className="text-right">
                        {state === 'audit' && <EyeOff className="mr-1 inline h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />}
                        <span className="font-semibold tabular-nums">{score.text}</span>{' '}
  ```

  (the original line carries six extra spaces of indentation in the file — copy them from the file, not from this block).

- [ ] **Step 4: GREEN — `FinalizePanel.tsx`.** Replace exactly

  ```tsx
      { key: 'audit', n: block.audit, label: `${block.audit} bài kiểm mẫu chưa kiểm`, state: 'audit', needsBackend: true },
  ```

  with

  ```tsx
      { key: 'audit', n: block.audit, label: `${block.audit} bài kiểm mẫu chưa kiểm`, state: 'audit' },
  ```

  and replace exactly

  ```tsx
                  <span className="flex flex-wrap items-center gap-2 text-small font-medium">
                    <span>{g.label}</span>
                    {g.needsBackend && <NeedsBackend />}
                  </span>
  ```

  with

  ```tsx
                  <span className="text-small font-medium">{g.label}</span>
  ```

  **Keep** `import { NeedsBackend } from '@/components/needs-backend';` — the gradebook block below (G5's) still renders it. Removing an import that is still used breaks the build. G5 keeps it too (line 121 still uses it on G5's branch); after **both** G4 and G5 are merged nothing uses it any more, and whoever merges the second one removes the import (eslint reports it as unused).

  ```bash
  pnpm --filter web exec vitest run src/lib/session-triage.test.ts src/app/teacher/grading/_components/ResultsTable.test.tsx src/app/teacher/grading/_components/FinalizePanel.test.tsx
  pnpm --filter web exec tsc --noEmit
  pnpm --filter web exec eslint src/lib/session-triage.ts src/app/teacher/grading/_components/ResultsTable.tsx src/app/teacher/grading/_components/FinalizePanel.tsx
  ```

  Expected: the three files green (session-triage +4, ResultsTable +1, FinalizePanel net 0); `tsc` only the 7 known `read-workbook.test.ts` lines (a new error naming `needsBackend` means one of the two `FinalizePanel` edits was applied without the other); eslint 0 errors.

- [ ] **Step 5: commit.** Title: `feat(web): danh sách ẩn điểm bài kiểm mẫu; nhóm kiểm mẫu ở màn chốt điểm không còn "cần backend"`.

---

### Task 9: the reveal card — pure presentation

**Files:** create `apps/web/src/app/teacher/grading/[resultId]/_components/AuditReveal.tsx`, `AuditReveal.test.tsx`.

**Interfaces**
- Consumes: `AuditReveal` data type (`lib/api/audit.ts`, Task 7 — imported here as `AuditRevealData` because the component takes the same name), `formatVnPoints`.
- Produces: `AuditReveal({ reveal, onOpenDossier })`.

This card shows the moment the blindness ends: the system's score, the errors it kept, and a per-rule comparison **in words** (a colour alone tells a colour-blind teacher nothing). It states plainly that the score did not change because of the teacher's answer, and where to go if they disagree.

- [ ] **Step 1: RED.** Create `AuditReveal.test.tsx`:

  ```tsx
  import { describe, expect, it, vi } from 'vitest';
  import { fireEvent, render, screen, within } from '@testing-library/react';
  import '@testing-library/jest-dom/vitest';
  import { AuditReveal } from './AuditReveal';
  import type { AuditReveal as AuditRevealData } from '@/lib/api/audit';

  const reveal = (over: Partial<AuditRevealData> = {}): AuditRevealData => ({
    status: 'teacher_reviewed',
    currentScore: 8.5,
    currentScoreSource: 'computation',
    systemErrors: [
      { ruleId: 'a', ruleKey: 'sai_bien', ruleName: 'Sai biên', counted: 'counted' },
      { ruleId: 'b', ruleKey: 'ten_bien', ruleName: 'Đặt tên biến', counted: 'unpriced' },
    ],
    perRule: [
      { ruleId: 'a', ruleKey: 'sai_bien', ruleName: 'Sai biên', verdict: 'both' },
      { ruleId: 'b', ruleKey: 'ten_bien', ruleName: 'Đặt tên biến', verdict: 'system_only' },
      { ruleId: 'c', ruleKey: 'thieu_ct', ruleName: 'Thiếu chú thích', verdict: 'teacher_only' },
    ],
    extraErrors: ['Nộp thiếu file đầu vào'],
    summary: { both: 1, teacherOnly: 1, systemOnly: 1, neither: 2, extra: 1, agreement: 'partial' },
    ...over,
  });

  const renderIt = (over: Partial<AuditRevealData> = {}, onOpenDossier = vi.fn()) => {
    render(<AuditReveal reveal={reveal(over)} onOpenDossier={onOpenDossier} />);
    return onOpenDossier;
  };

  describe('AuditReveal (parent spec §8.1 rule 3)', () => {
    it('shows the system score, and says it did not change because of the teacher\'s answer', () => {
      renderIt();
      expect(screen.getByText('8,5')).toBeInTheDocument();
      expect(screen.getByText(/không đổi vì nhận xét của bạn/)).toBeInTheDocument();
      expect(screen.getByText(/Ngoại lệ hoặc Chấm tay/)).toBeInTheDocument();
    });

    it('a missing score is "—", never 0', () => {
      renderIt({ currentScore: null });
      expect(screen.getByText('—')).toBeInTheDocument();
      expect(screen.queryByText('0')).not.toBeInTheDocument();
    });

    it('compares every rule in words: both saw it / only you / only the system', () => {
      renderIt();
      const items = within(screen.getByRole('list', { name: 'So sánh từng luật' })).getAllByRole('listitem');
      expect(items).toHaveLength(3);
      expect(items[0]).toHaveTextContent('Sai biên');
      expect(items[0]).toHaveTextContent('Cả hai đều thấy');
      expect(items[1]).toHaveTextContent('Đặt tên biến');
      expect(items[1]).toHaveTextContent('Chỉ hệ thống thấy');
      expect(items[2]).toHaveTextContent('Thiếu chú thích');
      expect(items[2]).toHaveTextContent('Chỉ bạn thấy');
    });

    it('every verdict carries an icon as well as words', () => {
      renderIt();
      const items = within(screen.getByRole('list', { name: 'So sánh từng luật' })).getAllByRole('listitem');
      for (const item of items) expect(item.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    });

    it('marks a system-only error that has no price yet (the score does not count it)', () => {
      renderIt();
      const items = within(screen.getByRole('list', { name: 'So sánh từng luật' })).getAllByRole('listitem');
      expect(items[1]).toHaveTextContent('chưa có giá');
      expect(items[0]).not.toHaveTextContent('chưa có giá');
    });

    it.each([
      ['full', 'Trùng khớp hoàn toàn'],
      ['partial', 'Trùng một phần'],
      ['none', 'Không trùng'],
    ] as const)('agreement %s reads "%s"', (agreement, label) => {
      renderIt({ summary: { ...reveal().summary, agreement } });
      expect(screen.getByText(label)).toBeInTheDocument();
    });

    it('lists the errors the teacher wrote outside the rule table, and omits the section when there are none', () => {
      const { unmount } = render(<AuditReveal reveal={reveal()} onOpenDossier={vi.fn()} />);
      expect(screen.getByText('Nộp thiếu file đầu vào')).toBeInTheDocument();
      unmount();
      renderIt({ extraErrors: [], summary: { ...reveal().summary, extra: 0 } });
      expect(screen.queryByText(/Lỗi bạn ghi ngoài bảng lỗi/)).not.toBeInTheDocument();
    });

    it('states every count of the summary, including the rules nobody saw', () => {
      renderIt();
      const summary = screen.getByRole('list', { name: 'Tổng kết' });
      expect(within(summary).getByText('Cả hai thấy: 1')).toBeInTheDocument();
      expect(within(summary).getByText('Chỉ bạn thấy: 1')).toBeInTheDocument();
      expect(within(summary).getByText('Chỉ hệ thống thấy: 1')).toBeInTheDocument();
      expect(within(summary).getByText('Không ai thấy: 2')).toBeInTheDocument();
      expect(within(summary).getByText('Lỗi ngoài bảng lỗi: 1')).toBeInTheDocument();
    });

    it('when neither side saw any error it says so instead of showing an empty list', () => {
      renderIt({
        systemErrors: [], perRule: [], extraErrors: [],
        summary: { both: 0, teacherOnly: 0, systemOnly: 0, neither: 3, extra: 0, agreement: 'full' },
      });
      expect(screen.getByText(/Cả bạn và hệ thống đều không thấy lỗi nào/)).toBeInTheDocument();
      expect(screen.queryByRole('list', { name: 'So sánh từng luật' })).not.toBeInTheDocument();
    });

    it('"Mở hồ sơ" hands over to the dossier exactly once', () => {
      const onOpenDossier = renderIt();
      fireEvent.click(screen.getByRole('button', { name: 'Mở hồ sơ' }));
      expect(onOpenDossier).toHaveBeenCalledTimes(1);
    });
  });
  ```

  ```bash
  pnpm --filter web exec vitest run "src/app/teacher/grading/[resultId]/_components/AuditReveal.test.tsx"
  ```

  Expected: **RED** — `Failed to resolve import "./AuditReveal"`.

- [ ] **Step 2: GREEN.** Create `AuditReveal.tsx`:

  ```tsx
  'use client';

  import { Bot, Check, User } from 'lucide-react';
  import { Alert, AlertDescription } from '@/components/ui/alert';
  import { Badge } from '@/components/ui/badge';
  import { Button } from '@/components/ui/button';
  import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
  import type { AuditReveal as AuditRevealData } from '@/lib/api/audit';
  import { formatVnPoints } from '@/lib/format';

  const VERDICT_LABEL = {
    both: 'Cả hai đều thấy',
    teacher_only: 'Chỉ bạn thấy',
    system_only: 'Chỉ hệ thống thấy',
  } as const;

  const AGREEMENT_LABEL = { full: 'Trùng khớp hoàn toàn', partial: 'Trùng một phần', none: 'Không trùng' } as const;
  const AGREEMENT_VARIANT = { full: 'success', partial: 'warning', none: 'warning' } as const;
  /** Biểu tượng đi KÈM chữ — màu một mình không nói gì với người mù màu. */
  const VERDICT_ICON = { both: Check, teacher_only: User, system_only: Bot } as const;

  /**
   * Lúc che mù kết thúc (parent spec §8.1 luật 3): điểm hệ thống, lỗi nó giữ, và so sánh với những gì giảng viên vừa
   * chọn — THEO TỪNG LUẬT, bằng chữ. Nhận xét đã khoá; điểm không đổi. Bất đồng thì giảng viên dùng đường có sẵn trong
   * hồ sơ (ngoại lệ từng lỗi, hoặc chấm tay) — màn này không sửa điểm.
   */
  export function AuditReveal({ reveal, onOpenDossier }: { reveal: AuditRevealData; onOpenDossier: () => void }) {
    const unpriced = new Set(reveal.systemErrors.filter((e) => e.counted === 'unpriced').map((e) => e.ruleId));
    const { summary } = reveal;

    return (
      <div className="flex flex-col gap-4">
        <Alert variant="success">
          <AlertDescription>Đã ghi nhận xét của bạn — khoá, không sửa được nữa. Đây là điều hệ thống đã giữ.</AlertDescription>
        </Alert>

        <Card>
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-h3">Điểm hệ thống</CardTitle>
            <Badge variant={AGREEMENT_VARIANT[summary.agreement]}>{AGREEMENT_LABEL[summary.agreement]}</Badge>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <p className="text-h1 tabular-nums">{formatVnPoints(reveal.currentScore)}</p>
            <p className="text-small text-muted-foreground">
              Điểm này không đổi vì nhận xét của bạn. Nếu bạn không đồng ý với hệ thống, dùng Ngoại lệ hoặc Chấm tay trong
              hồ sơ.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-h3">So sánh từng luật</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {reveal.perRule.length === 0 ? (
              <p className="text-small text-muted-foreground">Cả bạn và hệ thống đều không thấy lỗi nào trong bảng lỗi.</p>
            ) : (
              <ul aria-label="So sánh từng luật" className="flex flex-col divide-y divide-border rounded-lg border border-border">
                {reveal.perRule.map((r) => (
                  <li key={r.ruleId} className="flex flex-wrap items-center justify-between gap-2 p-3 text-small">
                    <span className="font-medium">{r.ruleName}</span>
                    <span className="flex items-center gap-2">
                      {r.verdict === 'system_only' && unpriced.has(r.ruleId) && (
                        <span className="text-caption text-muted-foreground">chưa có giá — chưa trừ điểm</span>
                      )}
                      <VerdictBadge verdict={r.verdict} />
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {reveal.extraErrors.length > 0 && (
              <div className="flex flex-col gap-1">
                <h3 className="text-small font-semibold">Lỗi bạn ghi ngoài bảng lỗi</h3>
                <ul className="list-disc pl-5 text-small">
                  {reveal.extraErrors.map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ul>
              </div>
            )}

            <ul aria-label="Tổng kết" className="flex flex-wrap gap-x-4 gap-y-1 text-caption text-muted-foreground">
              <li>Cả hai thấy: {summary.both}</li>
              <li>Chỉ bạn thấy: {summary.teacherOnly}</li>
              <li>Chỉ hệ thống thấy: {summary.systemOnly}</li>
              <li>Không ai thấy: {summary.neither}</li>
              <li>Lỗi ngoài bảng lỗi: {summary.extra}</li>
            </ul>
          </CardContent>
        </Card>

        <Button type="button" className="self-start" onClick={onOpenDossier}>
          Mở hồ sơ
        </Button>
      </div>
    );
  }

  function VerdictBadge({ verdict }: { verdict: keyof typeof VERDICT_LABEL }) {
    const Icon = VERDICT_ICON[verdict];
    return (
      <Badge variant={verdict === 'both' ? 'accent' : 'warning'}>
        <Icon className="h-3 w-3" aria-hidden="true" />
        {VERDICT_LABEL[verdict]}
      </Badge>
    );
  }
  ```

  ```bash
  pnpm --filter web exec vitest run "src/app/teacher/grading/[resultId]/_components/AuditReveal.test.tsx"
  pnpm --filter web exec tsc --noEmit
  pnpm --filter web exec eslint "src/app/teacher/grading/[resultId]/_components/AuditReveal.tsx"
  ```

  Expected: 12 passed (the `it.each` counts three); `tsc` only the 7 known lines; eslint 0 errors. If `getByText('8,5')` fails because the score also appears elsewhere, the fixture has a stray `8,5` — fix the fixture, not the assertion.

- [ ] **Step 3: commit.** Title: `feat(web): thẻ tiết lộ kiểm mẫu — so sánh từng luật bằng chữ`.

---

### Task 10: the blind-review panel, and the one branch on the dossier route

**Files:** create `apps/web/src/app/teacher/grading/[resultId]/_components/AuditReview.tsx`, `AuditReview.test.tsx`; modify `apps/web/src/app/teacher/grading/[resultId]/page.tsx`, `page.test.tsx`.

**Interfaces**
- Consumes: `useRecordAuditReview`, `useSubmissionDownload`, `useOpenDossierAfterAudit` (Task 7), `useRules` (active rules of the signed-in teacher), `AuditReveal` (Task 9).
- Produces: `AuditReview({ resultId, sessionId, studentMssv, studentName, onRecorded, onOpenDossier })`.

Behaviour the tests pin:
1. **Blind first.** Before the label is written the panel shows the student, a link to *their own* submission, and the teacher's own rule table as checkboxes (name and description — **no price**, which would bias the pick). No score, no error.
2. **An empty label must be deliberate.** Nothing ticked and nothing written is a real label ("this submission has no errors"), so the button stays disabled until the teacher ticks *Tôi xác nhận: bài này không có lỗi nào*. The tick resets as soon as they pick or write anything.
3. **The label locks — and the panel says so twice before it happens:** inline under the form, and in a confirmation dialog the button opens (*Xem lại* / *Ghi và khoá*). Nothing is sent until *Ghi và khoá*.
4. **The reveal survives the status change.** Recording moves the result to `teacher_reviewed`; a list refetch (window focus, an interval) would then flip the route to the normal dossier before the teacher reads the comparison. The **page** keeps the panel mounted (`audited` state) until *Mở hồ sơ*.
5. **Server refusals are shown verbatim.** A 409 (*đã khoá*) leaves the form on screen with the message.

- [ ] **Step 1: RED — the panel.** Create `AuditReview.test.tsx`:

  ```tsx
  import { beforeEach, describe, expect, it, vi } from 'vitest';
  import { fireEvent, render, screen, within } from '@testing-library/react';
  import '@testing-library/jest-dom/vitest';
  import { AuditReview } from './AuditReview';
  import type { AuditReveal as AuditRevealData } from '@/lib/api/audit';
  import type { Rule } from '@/lib/api/rules';

  const record = vi.fn();
  const refreshDossier = vi.fn();
  let recordState: { isPending: boolean; isError: boolean; error: Error | null };
  let downloadState: { data?: { downloadUrl: string; fileName: string }; isLoading: boolean; isError: boolean; error: Error | null };
  let rulesState: { data?: Rule[]; isLoading: boolean; isError: boolean; error: Error | null };

  vi.mock('@/hooks/useAudit', () => ({
    useRecordAuditReview: () => ({ mutate: record, ...recordState }),
    useSubmissionDownload: () => downloadState,
    useOpenDossierAfterAudit: () => refreshDossier,
  }));
  vi.mock('@/hooks/useRules', () => ({ useRules: () => rulesState }));

  const rule = (id: string, key: string, name: string, description: string): Rule =>
    ({
      id, ruleKey: key, state: 'active', origin: 'teacher',
      revision: { id: `rev-${id}`, revision: 1, name, description, criterionKey: 'tinh_dung', predicate: null },
      checkedBy: 'machine', deduction: '1.50', appliedTo: { results: 0, sessions: 0 }, mismatchedIn: 0,
    }) as unknown as Rule;

  const revealed: AuditRevealData = {
    status: 'teacher_reviewed', currentScore: 8.5, currentScoreSource: 'computation',
    systemErrors: [{ ruleId: 'r1', ruleKey: 'sai_bien', ruleName: 'Sai biên', counted: 'counted' }],
    perRule: [{ ruleId: 'r1', ruleKey: 'sai_bien', ruleName: 'Sai biên', verdict: 'both' }],
    extraErrors: [],
    summary: { both: 1, teacherOnly: 0, systemOnly: 0, neither: 1, extra: 0, agreement: 'partial' },
  };

  const onRecorded = vi.fn();
  const onOpenDossier = vi.fn();
  const renderIt = () =>
    render(
      <AuditReview resultId="res1" sessionId="s1" studentMssv="20120001" studentName="Nguyễn Văn A"
        onRecorded={onRecorded} onOpenDossier={onOpenDossier} />,
    );
  const submit = () => screen.getByRole('button', { name: /^Ghi nhận xét/ });
  /** Nút mở hộp xác nhận, rồi nút xác nhận trong hộp — nhãn khoá thì phải qua cả hai. */
  const confirmAndSend = () => {
    fireEvent.click(submit());
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Ghi và khoá' }));
  };
  const extraBox = () => screen.getByLabelText(/Lỗi khác/);

  beforeEach(() => {
    record.mockReset();
    refreshDossier.mockReset();
    onRecorded.mockReset();
    onOpenDossier.mockReset();
    recordState = { isPending: false, isError: false, error: null };
    downloadState = { data: { downloadUrl: 'https://storage.local/x', fileName: 'Cau1.docx' }, isLoading: false, isError: false, error: null };
    rulesState = {
      data: [rule('r1', 'sai_bien', 'Sai biên', 'Test nhóm biên thất bại'), rule('r2', 'ten_bien', 'Đặt tên biến', 'Tên biến vô nghĩa')],
      isLoading: false, isError: false, error: null,
    };
  });

  describe('AuditReview — before the label is written', () => {
    it('names the student, links their own submission, and says the system\'s score and errors are hidden until the teacher writes their own', () => {
      renderIt();
      expect(screen.getByRole('heading', { name: 'Nguyễn Văn A' })).toBeInTheDocument();
      expect(screen.getByText('20120001')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /Tải bài nộp/ })).toHaveAttribute('href', 'https://storage.local/x');
      expect(screen.getByText(/đang được ẩn cho tới khi bạn ghi nhận xét/)).toBeInTheDocument();
      // Nói thẳng ba điều (spec §4.5): chọn ngẫu nhiên không theo điểm, điểm đang ẩn, và bước này tốn công.
      expect(screen.getByText('Kiểm mẫu')).toBeInTheDocument();
      expect(screen.getByText(/không dựa vào điểm/)).toBeInTheDocument();
      expect(screen.getByText(/tốn công hơn một bài cần xem/)).toBeInTheDocument();
    });

    it('lists the teacher\'s active rules as checkboxes with name and description — and no price (a price would bias the pick)', () => {
      renderIt();
      expect(screen.getByRole('checkbox', { name: /Sai biên/ })).not.toBeChecked();
      expect(screen.getByText('Test nhóm biên thất bại')).toBeInTheDocument();
      expect(screen.getByRole('checkbox', { name: /Đặt tên biến/ })).toBeInTheDocument();
      expect(screen.queryByText(/1,50|1\.50/)).not.toBeInTheDocument();
    });

    it('sends the ticked rules and the non-blank "other" lines, trimmed', () => {
      renderIt();
      fireEvent.click(screen.getByRole('checkbox', { name: /Sai biên/ }));
      fireEvent.change(extraBox(), { target: { value: '  Thiếu chú thích \n\n Sai chính tả  \n   ' } });
      confirmAndSend();
      expect(record).toHaveBeenCalledWith(
        { pickedRuleIds: ['r1'], extraErrors: ['Thiếu chú thích', 'Sai chính tả'] },
        expect.any(Object),
      );
    });

    it('an empty label must be deliberate: disabled until "không có lỗi nào" is ticked, then sends two empty lists', () => {
      renderIt();
      expect(submit()).toBeDisabled();
      fireEvent.click(screen.getByRole('checkbox', { name: /bài này không có lỗi nào/ }));
      expect(submit()).toBeEnabled();
      confirmAndSend();
      expect(record).toHaveBeenCalledWith({ pickedRuleIds: [], extraErrors: [] }, expect.any(Object));
    });

    it('the "no errors" tick disappears once anything is picked, and does not survive picking and un-picking', () => {
      renderIt();
      fireEvent.click(screen.getByRole('checkbox', { name: /bài này không có lỗi nào/ }));
      fireEvent.click(screen.getByRole('checkbox', { name: /Sai biên/ }));
      expect(screen.queryByRole('checkbox', { name: /bài này không có lỗi nào/ })).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('checkbox', { name: /Sai biên/ }));
      expect(screen.getByRole('checkbox', { name: /bài này không có lỗi nào/ })).not.toBeChecked();
      expect(submit()).toBeDisabled();
    });

    it('refuses more than 20 "other" lines or a line over 500 characters, saying why', () => {
      renderIt();
      fireEvent.change(extraBox(), { target: { value: Array.from({ length: 21 }, (_, i) => `lỗi ${i}`).join('\n') } });
      expect(submit()).toBeDisabled();
      expect(screen.getByText(/Tối đa 20 lỗi khác/)).toBeInTheDocument();
      fireEvent.change(extraBox(), { target: { value: 'x'.repeat(501) } });
      expect(submit()).toBeDisabled();
      expect(screen.getByText(/mỗi lỗi tối đa 500 ký tự/i)).toBeInTheDocument();
    });

    it('says BEFORE the click that the label locks', () => {
      renderIt();
      expect(screen.getByText(/Ghi xong là khoá/)).toBeInTheDocument();
    });

    it('the button only opens a confirmation that says the label locks; nothing is sent until "Ghi và khoá"', () => {
      renderIt();
      fireEvent.click(screen.getByRole('checkbox', { name: /bài này không có lỗi nào/ }));
      fireEvent.click(submit());
      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveTextContent('Nhận xét ghi rồi thì khoá, không sửa được');
      expect(record).not.toHaveBeenCalled();
      fireEvent.click(within(dialog).getByRole('button', { name: 'Ghi và khoá' }));
      expect(record).toHaveBeenCalledTimes(1);
    });

    it('"Xem lại" closes the confirmation and sends nothing', () => {
      renderIt();
      fireEvent.click(screen.getByRole('checkbox', { name: /bài này không có lỗi nào/ }));
      fireEvent.click(submit());
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Xem lại' }));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(record).not.toHaveBeenCalled();
    });

    it('shows the server refusal verbatim and keeps the form on screen', () => {
      recordState = { isPending: false, isError: true, error: new Error('Nhận xét kiểm mẫu của bài này đã ghi — khoá, không ghi lại được.') };
      renderIt();
      expect(screen.getByText('Nhận xét kiểm mẫu của bài này đã ghi — khoá, không ghi lại được.')).toBeInTheDocument();
      expect(extraBox()).toBeInTheDocument();
    });

    it('a submission that cannot be linked says why, and the form is still there', () => {
      downloadState = { isLoading: false, isError: true, error: new Error('Bài này chưa có file trên kho lưu trữ.') };
      renderIt();
      expect(screen.getByText('Bài này chưa có file trên kho lưu trữ.')).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: /Tải bài nộp/ })).not.toBeInTheDocument();
      expect(extraBox()).toBeInTheDocument();
    });

    it('cannot submit a label when the rule table failed to load — a blind label without the picks would be wrong data', () => {
      rulesState = { data: undefined, isLoading: false, isError: true, error: new Error('Không tải được bảng lỗi') };
      renderIt();
      expect(screen.getByText(/Không tải được bảng lỗi/)).toBeInTheDocument();
      fireEvent.change(extraBox(), { target: { value: 'Thiếu chú thích' } });
      expect(submit()).toBeDisabled();
    });

    it('a teacher with no active rules is told so, and can still label with "other" lines', () => {
      rulesState = { data: [], isLoading: false, isError: false, error: null };
      renderIt();
      expect(screen.getByText(/chưa có luật nào đang dùng/)).toBeInTheDocument();
      fireEvent.change(extraBox(), { target: { value: 'Thiếu chú thích' } });
      expect(submit()).toBeEnabled();
    });
  });

  describe('AuditReview — after the label is written', () => {
    it('replaces the form with the reveal, tells the page, and refreshes only when the teacher opens the dossier', () => {
      record.mockImplementation((_body: unknown, opts: { onSuccess: (d: AuditRevealData) => void }) => opts.onSuccess(revealed));
      renderIt();
      fireEvent.click(screen.getByRole('checkbox', { name: /Sai biên/ }));
      confirmAndSend();

      expect(onRecorded).toHaveBeenCalledTimes(1);
      expect(screen.queryByLabelText(/Lỗi khác/)).not.toBeInTheDocument();
      expect(screen.getByText('Trùng một phần')).toBeInTheDocument();
      expect(refreshDossier).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole('button', { name: 'Mở hồ sơ' }));
      expect(refreshDossier).toHaveBeenCalledTimes(1);
      expect(onOpenDossier).toHaveBeenCalledTimes(1);
    });
  });
  ```

  ```bash
  pnpm --filter web exec vitest run "src/app/teacher/grading/[resultId]/_components/AuditReview.test.tsx"
  ```

  Expected: **RED** — `Failed to resolve import "./AuditReview"`.

- [ ] **Step 2: GREEN — the panel.** Create `AuditReview.tsx`:

  ```tsx
  'use client';

  import { useState } from 'react';
  import Link from 'next/link';
  import { ArrowLeft, Download } from 'lucide-react';
  import { Alert, AlertDescription } from '@/components/ui/alert';
  import { Badge } from '@/components/ui/badge';
  import { Button } from '@/components/ui/button';
  import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
  import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
  } from '@/components/ui/dialog';
  import { Label } from '@/components/ui/label';
  import { Skeleton } from '@/components/ui/skeleton';
  import { useOpenDossierAfterAudit, useRecordAuditReview, useSubmissionDownload } from '@/hooks/useAudit';
  import { useRules } from '@/hooks/useRules';
  import type { AuditReveal as AuditRevealData } from '@/lib/api/audit';
  import { AuditReveal } from './AuditReveal';

  const MAX_EXTRA_LINES = 20;
  const MAX_EXTRA_LENGTH = 500;

  /**
   * Màn kiểm mù (parent spec §8.1): bài thuộc mẫu kiểm, điểm và lỗi hệ thống bị ẩn ở API. Giảng viên tick lỗi họ thấy
   * — từ bảng lỗi ĐANG DÙNG của chính họ — ghi thêm lỗi ngoài bảng, rồi ghi nhận xét. Ghi xong là khoá; bản tiết lộ
   * hiện ngay tại đây và ở lại cho tới khi họ bấm *Mở hồ sơ* (trang cha giữ panel, kể cả khi danh sách làm mới đổi
   * trạng thái bài).
   */
  export function AuditReview({
    resultId,
    sessionId,
    studentMssv,
    studentName,
    onRecorded,
    onOpenDossier,
  }: {
    resultId: string;
    sessionId: string;
    studentMssv: string;
    studentName: string;
    onRecorded: () => void;
    onOpenDossier: () => void;
  }) {
    const [reveal, setReveal] = useState<AuditRevealData | null>(null);
    const record = useRecordAuditReview(resultId);
    const refreshDossier = useOpenDossierAfterAudit(sessionId, resultId);

    return (
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          <Link
            href={`/teacher/grading?sessionId=${sessionId}`}
            className="flex w-fit items-center gap-1.5 text-caption text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Về màn Điều phối
          </Link>
          <Badge variant="info" className="w-fit">
            Kiểm mẫu
          </Badge>
          <h1 className="text-h1">{studentName}</h1>
          <p className="text-caption text-muted-foreground">
            <span className="font-mono">{studentMssv}</span>
          </p>
        </div>

        {reveal ? (
          <AuditReveal
            reveal={reveal}
            onOpenDossier={() => {
              refreshDossier();
              onOpenDossier();
            }}
          />
        ) : (
          <>
            <Alert variant="info">
              <AlertDescription>
                Bài này được hệ thống chọn ngẫu nhiên để kiểm — không dựa vào điểm của nó. Hệ thống đã chấm xong, nhưng
                điểm và lỗi hệ thống đã giữ đang được ẩn cho tới khi bạn ghi nhận xét của mình. Bước này gần như chấm
                lại từ đầu, nên tốn công hơn một bài cần xem.
              </AlertDescription>
            </Alert>
            <SubmissionDownload resultId={resultId} />
            <ReviewForm
              pending={record.isPending}
              error={record.isError ? record.error : null}
              onSubmit={(body, onFailed) =>
                record.mutate(body, {
                  onSuccess: (data) => {
                    setReveal(data);
                    onRecorded();
                  },
                  // Đóng hộp xác nhận để lỗi máy chủ hiện nguyên văn ở form, không bị hộp che.
                  onError: onFailed,
                })
              }
            />
          </>
        )}
      </div>
    );
  }

  function SubmissionDownload({ resultId }: { resultId: string }) {
    const download = useSubmissionDownload(resultId);
    if (download.isLoading) return <Skeleton className="h-9 w-56" />;
    if (download.isError || !download.data) {
      return (
        <Alert variant="warning">
          <AlertDescription>{download.error?.message ?? 'Không lấy được đường dẫn tải bài nộp.'}</AlertDescription>
        </Alert>
      );
    }
    return (
      <a
        href={download.data.downloadUrl}
        rel="noopener"
        className="inline-flex w-fit items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-small font-medium hover:bg-surface-2"
      >
        <Download className="h-4 w-4" aria-hidden="true" />
        Tải bài nộp ({download.data.fileName})
      </a>
    );
  }

  function ReviewForm({
    pending,
    error,
    onSubmit,
  }: {
    pending: boolean;
    error: Error | null;
    onSubmit: (body: { pickedRuleIds: string[]; extraErrors: string[] }, onFailed: () => void) => void;
  }) {
    const rules = useRules();
    const [picked, setPicked] = useState<string[]>([]);
    const [extraText, setExtraText] = useState('');
    const [confirmNone, setConfirmNone] = useState(false);
    const [confirming, setConfirming] = useState(false);

    const active = (rules.data ?? []).filter((r) => r.state === 'active');
    const extras = extraText
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '');
    const tooMany = extras.length > MAX_EXTRA_LINES;
    const tooLong = extras.some((line) => line.length > MAX_EXTRA_LENGTH);
    const empty = picked.length === 0 && extras.length === 0;
    // Không nộp khi chưa có bảng lỗi: một nhãn thiếu phần chọn luật là dữ liệu sai chứ không phải nhãn "không có lỗi".
    const canSubmit = !pending && rules.data !== undefined && !tooMany && !tooLong && (!empty || confirmNone);

    const toggle = (id: string) => {
      setConfirmNone(false);
      setPicked((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));
    };

    return (
      <>
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          // Ghi là khoá: nút chỉ MỞ hộp xác nhận, gửi thật nằm trong hộp.
          if (canSubmit) setConfirming(true);
        }}
      >
        <Card>
          <CardHeader>
            <CardTitle className="text-h3">Nhận xét của bạn về bài này</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="text-small text-muted-foreground">
              Tick những lỗi bạn thấy trong bài, theo bảng lỗi đang dùng của bạn. Lỗi nào chưa có trong bảng thì ghi ở ô
              bên dưới — mỗi dòng một lỗi.
            </p>

            {rules.isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : rules.data === undefined ? (
              <Alert variant="destructive">
                <AlertDescription>{rules.error?.message ?? 'Không tải được bảng lỗi.'}</AlertDescription>
              </Alert>
            ) : active.length === 0 ? (
              <p className="text-small text-muted-foreground">
                Bạn chưa có luật nào đang dùng — ghi lỗi ở ô bên dưới, hoặc xác nhận bài không có lỗi nào.
              </p>
            ) : (
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 text-small font-semibold">Lỗi trong bảng lỗi của bạn</legend>
                {active.map((r) => (
                  <label key={r.id} className="flex cursor-pointer items-start gap-2 rounded-md border border-border p-3 text-small">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 accent-accent"
                      checked={picked.includes(r.id)}
                      onChange={() => toggle(r.id)}
                    />
                    <span>
                      <span className="font-medium">{r.revision.name}</span>
                      <span className="block text-caption text-muted-foreground">{r.revision.description}</span>
                    </span>
                  </label>
                ))}
              </fieldset>
            )}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="audit-extra">Lỗi khác (không có trong bảng lỗi)</Label>
              <textarea
                id="audit-extra"
                rows={3}
                value={extraText}
                onChange={(event) => {
                  setConfirmNone(false);
                  setExtraText(event.target.value);
                }}
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-small"
              />
              {tooMany && <p className="text-caption text-danger-strong">Tối đa {MAX_EXTRA_LINES} lỗi khác.</p>}
              {tooLong && <p className="text-caption text-danger-strong">Mỗi lỗi tối đa {MAX_EXTRA_LENGTH} ký tự.</p>}
            </div>

            {empty && rules.data !== undefined && (
              <label className="flex cursor-pointer items-start gap-2 text-small">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 accent-accent"
                  checked={confirmNone}
                  onChange={(event) => setConfirmNone(event.target.checked)}
                />
                <span>Tôi xác nhận: bài này không có lỗi nào</span>
              </label>
            )}
          </CardContent>
        </Card>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-col gap-2">
          <p className="text-caption text-muted-foreground">
            Ghi xong là khoá — bạn không sửa được nhận xét này nữa. Nếu sau đó bạn không đồng ý với hệ thống, dùng Ngoại
            lệ hoặc Chấm tay trong hồ sơ.
          </p>
          <Button type="submit" className="self-start" disabled={!canSubmit}>
            Ghi nhận xét và xem kết luận của hệ thống
          </Button>
        </div>
      </form>

      <Dialog open={confirming} onOpenChange={(open) => !open && setConfirming(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ghi nhận xét kiểm mẫu?</DialogTitle>
            <DialogDescription>
              Nhận xét ghi rồi thì khoá, không sửa được. Sau đó bạn sẽ thấy điểm và lỗi hệ thống đã giữ cho bài này.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirming(false)}>
              Xem lại
            </Button>
            <Button
              type="button"
              loading={pending}
              onClick={() => onSubmit({ pickedRuleIds: picked, extraErrors: extras }, () => setConfirming(false))}
            >
              Ghi và khoá
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </>
    );
  }
  ```

  ```bash
  pnpm --filter web exec vitest run "src/app/teacher/grading/[resultId]/_components/AuditReview.test.tsx"
  pnpm --filter web exec tsc --noEmit
  pnpm --filter web exec eslint "src/app/teacher/grading/[resultId]/_components/AuditReview.tsx"
  ```

  Inside `ReviewForm`'s fragment, indent the whole `<form>…</form>` block two more spaces (formatting only — the plan shows it without the extra indentation).

  Expected: 14 passed; `tsc` only the 7 known lines; eslint 0 errors. `useMutation`'s `error` is typed `Error | null` in the installed TanStack Query; if `record.error` does not typecheck, fix the prop type to match — do not cast the message away.

- [ ] **Step 3: RED — the page.** In `page.test.tsx`, add the mock directly **before** `function result(over: Partial<GradingResult> = {}): GradingResult {`:

  ```tsx
  // Panel kiểm mù có test riêng (AuditReview.test.tsx); ở đây chỉ kiểm việc trang có dựng nó đúng lúc và giữ nó đúng lúc.
  vi.mock('./_components/AuditReview', () => ({
    AuditReview: (p: { resultId: string; studentMssv: string; onRecorded: () => void; onOpenDossier: () => void }) => (
      <div data-testid="audit-panel" data-result={p.resultId} data-mssv={p.studentMssv}>
        <button type="button" onClick={p.onRecorded}>ghi nhận xét</button>
        <button type="button" onClick={p.onOpenDossier}>mở hồ sơ</button>
      </div>
    ),
  }));

  ```

  and add these tests directly **before** `it('bài đang chấm thì chỉ đọc, không có nút Lưu', async () => {`:

  ```tsx
  it('bài kiểm mẫu chưa kiểm → panel kiểm mù, không phải hồ sơ điều tra và không phải form chấm theo tiêu chí (T-SAMP-1)', async () => {
    resultsData = [result({ pipeline: 'investigator', status: 'audit_pending', currentScore: null, criterionResults: [] })];
    await page();

    const panel = await screen.findByTestId('audit-panel');
    expect(panel).toHaveAttribute('data-result', 'r1');
    expect(panel).toHaveAttribute('data-mssv', '2151010023');
    expect(screen.queryByRole('button', { name: /Lưu duyệt/ })).not.toBeInTheDocument();
  });

  it('bài đã nhận xét (teacher_reviewed) không còn là panel kiểm mù', async () => {
    resultsData = [result({ pipeline: 'investigator', status: 'teacher_reviewed', currentScore: 8.5, criterionResults: [] })];
    await page();

    expect(screen.queryByTestId('audit-panel')).not.toBeInTheDocument();
  });

  // D19: ghi nhận xét đổi trạng thái bài sang teacher_reviewed; nếu danh sách làm mới (focus cửa sổ) trước khi giảng
  // viên đọc so sánh thì trang chuyển sang hồ sơ thường và bản tiết lộ biến mất.
  it('giữ panel sau khi ghi nhận xét dù danh sách đã đổi trạng thái bài, tới khi bấm "Mở hồ sơ"', async () => {
    resultsData = [result({ pipeline: 'investigator', status: 'audit_pending', currentScore: null, criterionResults: [] })];
    const params = Promise.resolve({ resultId: 'r1' });
    const tree = (
      <Suspense fallback={null}>
        <GradingDetailPage params={params} />
      </Suspense>
    );
    let view!: ReturnType<typeof render>;
    await act(async () => {
      view = render(tree);
    });

    fireEvent.click(await screen.findByRole('button', { name: 'ghi nhận xét' }));
    resultsData = [result({ pipeline: 'investigator', status: 'teacher_reviewed', currentScore: 8.5, criterionResults: [] })];
    await act(async () => {
      view.rerender(tree);
    });
    expect(screen.getByTestId('audit-panel')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'mở hồ sơ' }));
    expect(screen.queryByTestId('audit-panel')).not.toBeInTheDocument();
  });

  ```

  ```bash
  pnpm --filter web exec vitest run "src/app/teacher/grading/[resultId]/page.test.tsx"
  ```

  Expected: **RED** — the first and third tests cannot find `audit-panel` (the page has no such branch yet); the second passes already and stays as a guard.

- [ ] **Step 4: GREEN — `page.tsx`.** Three edits.

  (a) Directly after `import { InvestigatorDossier } from './_components/investigator/InvestigatorDossier';` add:

  ```tsx
  import { AuditReview } from './_components/AuditReview';
  ```

  (b) Directly after `  const [studentFeedback, setStudentFeedback] = useState('');` add:

  ```tsx
    // Đã ghi nhận xét kiểm mẫu trong lần xem này: giữ bản tiết lộ trên màn hình dù danh sách làm mới đổi trạng thái bài
    // sang teacher_reviewed — tới khi giảng viên bấm "Mở hồ sơ" (D19).
    const [audited, setAudited] = useState(false);
  ```

  (c) Directly **before** the line `  // Bài chấm theo đường điều tra (§3.11 spec UI): hồ sơ riêng, không đi qua bàn chấm theo tiêu chí.` add:

  ```tsx
    // Bài kiểm mẫu chưa kiểm: che mù (parent spec §8.1) — KHÔNG dựng hồ sơ, vì hồ sơ chính là thứ đang bị che.
    // Đặt SAU mọi hook và TRƯỚC nhánh điều tra, theo trạng thái chứ không theo pipeline.
    if (result && (result.status === 'audit_pending' || audited)) {
      return (
        <AuditReview
          resultId={resultId}
          sessionId={sessionId}
          studentMssv={result.studentMssv}
          studentName={result.studentName}
          onRecorded={() => setAudited(true)}
          onOpenDossier={() => setAudited(false)}
        />
      );
    }

  ```

  ```bash
  pnpm --filter web exec vitest run "src/app/teacher/grading/[resultId]/page.test.tsx"
  pnpm --filter web exec vitest run "src/app/teacher/grading/[resultId]"
  pnpm --filter web exec tsc --noEmit
  pnpm --filter web exec eslint "src/app/teacher/grading/[resultId]/page.tsx" "src/app/teacher/grading/[resultId]/_components/AuditReview.tsx"
  ```

  Expected: the page suite green (existing tests untouched, +3); the whole `[resultId]` folder green; `tsc` only the 7 known lines; eslint 0 errors (`react-hooks/rules-of-hooks` would fire if the branch were placed before a hook — it is placed after the last one).

- [ ] **Step 5: mutation check — prove the third test guards D19.** Temporarily change `(result.status === 'audit_pending' || audited)` to `(result.status === 'audit_pending')` and run the page suite:

  ```bash
  pnpm --filter web exec vitest run "src/app/teacher/grading/[resultId]/page.test.tsx"
  ```

  Expected: exactly `giữ panel sau khi ghi nhận xét …` fails (`audit-panel` gone after the rerender). Restore the condition, re-run, and record the failure text in the ledger. If it does **not** fail, the test is not testing what it claims — fix the test before going on.

- [ ] **Step 6: commit.** Title: `feat(web): panel kiểm mù trên trang hồ sơ; giữ bản tiết lộ tới khi bấm Mở hồ sơ`.

---

### Task 11: full verification, ledger, and an honest report

**Files:** `docs/superpowers/ledgers/2026-09-29-audit-sampling.md` (create, committed — this one is a deliverable, unlike the in-progress ledger).

- [ ] **Step 1: Backend unit tests.**

  ```bash
  pnpm --filter api exec jest
  ```

  Expected: the whole suite green. Baseline on `feat/grading-gaps-g1-g5` is 1167 passing, 7 skipped (pre-existing); this package adds `audit-sampling.spec.ts`, `audit-blind.spec.ts` and `audit-compare.spec.ts` (7). A lower total than the baseline is a regression — re-run before concluding.

- [ ] **Step 2: Backend e2e — this package's suites plus the neighbours.** Kill stray workers first (they eat BullMQ jobs from a shared Redis):

  ```bash
  # List jest workers; stop ONLY the ones whose command line shows THIS worktree's path, by PID (Stop-Process -Id <pid>).
  # Never `taskkill /IM node.exe`: it also kills the jest runs and dev servers of every other session on this machine.
  powershell.exe -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -match 'jest' } | Select-Object ProcessId, CommandLine"
  ```

  ```bash
  pnpm --filter api exec jest --config ./test/jest-e2e.json test/audit-sampling.e2e-spec.ts test/audit-blind.e2e-spec.ts test/audit-review.e2e-spec.ts
  pnpm --filter api exec jest --config ./test/jest-e2e.json test/score-service.e2e-spec.ts test/rules-prices.e2e-spec.ts test/rules-routes.e2e-spec.ts test/rule-entries.e2e-spec.ts test/error-exception.e2e-spec.ts test/finalize-investigator.e2e-spec.ts test/grading-lifecycle-v2.e2e-spec.ts test/grading-results-triage.e2e-spec.ts
  pnpm --filter api exec jest --config ./test/jest-e2e.json
  ```

  Expected: all green. **`score-service.e2e-spec.ts` must pass unmodified** — it is the proof that the `NODE_ENV=test` default (sampling off when the env var is unset) does not disturb the suites that assert `auto_approved`. Compare the full-run totals with the baseline in `.superpowers/sdd/2026-09-29-grading-truth-debts/progress.md` (read it; do not guess), plus this package's three new suites.

- [ ] **Step 3: Web tests, typecheck, lint, cycles, build.**

  ```bash
  pnpm --filter web exec vitest run
  pnpm --filter web exec tsc --noEmit > tsc-g4.txt
  pnpm --filter web exec eslint src
  pnpm --filter api exec eslint src
  pnpm check:cycles
  pnpm --filter web run build
  ```

  Expected: vitest green (G1 baseline: 96 files / 1190 tests; this package adds `AuditReveal` (12), `AuditReview` (14), `session-triage` (+4), `ResultsTable` (+1), `page` (+3); `FinalizePanel` net 0); `tsc-g4.txt` is **byte-identical** to the G1 baseline — 7 lines, all in `src/lib/read-workbook.test.ts`, any other line is a regression from this package; eslint 0 errors; `0 vòng lặp`; **one** `next build`. Delete `tsc-g4.txt` afterwards.

- [ ] **Step 4: `detect_changes`.** Run `mcp__gitnexus__detect_changes` with `repo` = the absolute path `C:\Users\Admin\Main\Desktop\HKI 2026-2027\KLTN\CINE` and `scope: "all"`. The affected flows must be `ScoreService.writeInitial` (first decision), `GradingService.listForSession`, `loadResultDetail`, the two rule-side previews and the new audit routes — anything else is unexpected and gets explained in the ledger.

- [ ] **Step 5: What this package does not prove — write it down, do not imply otherwise.**
  - **No browser pass.** The UI is proven by React Testing Library against mocked hooks. Nothing has driven the real API from the real page. The API side is proven end to end by `audit-review.e2e-spec.ts` (real DB, real HTTP), the web side by Tasks 8–10; **the join between them is Task 7's generated client**, which `tsc` checks but no test exercises. A screenshot pass over one seeded `audit_pending` result is the first thing the common review should do.
  - **Sampling is off under `NODE_ENV=test` unless the variable is set.** Dev and production are never off. Say so; do not let the e2e's `GRADING_AUDIT_SAMPLE_PERCENT=100` be read as "the default is 100".
  - **The sample is drawn once, at the first decision.** Results auto-approved after being flagged never yield a label (T-SAMP-5) — calibration must not extrapolate to them.
  - **Existing `auto_approved` results are not sampled retroactively.**
  - **A price change can still demote a sampled result** (`ruleLayerTransition`, T-DEMOTE-1) — kept on purpose and listed in *Review Focus*.

- [ ] **Step 6: Write the ledger.** Create `docs/superpowers/ledgers/2026-09-29-audit-sampling.md` with, per task: the commit hash, the exact test command and its result, every `Ruling:` line from the in-progress ledger with its reason, the mutation check of Task 10 Step 5 with the failure observed, and the Step 4 findings.

  ```bash
  git add docs/superpowers/ledgers/2026-09-29-audit-sampling.md && git commit -F <message-file>
  ```

  Title: `docs: ledger thực thi G4 (kiểm mẫu ngẫu nhiên và màn kiểm mù)`.

- [ ] **Step 7: Report — and say this plainly.**

  > **Chưa có VERDICT của `code-reviewer`.** Người dùng đã hoãn phần review tới **một lượt review chung cho G1→G5**, nên gói này bàn giao ở trạng thái "đã qua test, chưa qua review độc lập".

  And it must list: the files changed; the test totals against the baselines; that **no migration** was used; the `Ruling:` lines; Step 5's *not proven* list verbatim; and the shared-file touch points G2/G3/G5 will need to reconcile (`grading.module.ts` `controllers` line, `grading.service.ts` `listForSession` object, `FinalizePanel.tsx` dashed block and the kept `NeedsBackend` import, `session-triage.ts`, `schema.d.ts`).

  Do **not** run `finishing-a-development-branch`. Do not push, do not open a PR, do not merge. The branch and the ledger stay in place for the common review.
