# Bảng lỗi theo rubric — Web Implementation Plan (Plan B)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Every task is TDD: write the failing test, watch it fail for the right reason, implement, watch it pass, `tsc`, lint the touched directories, commit.

**Goal:** Rebuild `/teacher/rules` as the approved mock-up: pick a rubric first, see that rubric's errors grouped by criterion with their own deduction, with a readiness banner, add/edit drawers, AI-proposed errors with context, a shared-error library, and a search picker + semester filter once there are many rubrics.

**Architecture:** `apps/web` reads the new rubric-scoped API through two hook modules (`useRubricErrors`, `useRules`) over two API modules (`lib/api/rubric-errors.ts`, `lib/api/rules.ts`). All decisions that can be pure live in two tested modules: `lib/rubric-board.ts` (status, tasks, picker filtering/sorting, semesters, copy preview, impact text, recent list) and `lib/error-form.ts` (detection ⇄ predicate mapping, validation, change sets). Components under `app/teacher/rules/_components/` are small and take their data/handlers as props; the page composes them and owns only URL (`?rubric=`), tab, drawer and dialog state.

**Tech Stack:** Next.js 15 App Router, React 19, TanStack Query 5, Tailwind tokens (`primary` = Deep Indigo), Radix Dialog/Dropdown/Select via `components/ui`, `sonner` toasts, Vitest + React Testing Library (jsdom), `@cine/shared` OpenAPI client.

**Spec:** `docs/add/rubric/spec/2026-10-07-rules-by-rubric-design.md` (this plan implements §4 as a client, §5 and §7.6). Approved mock-up: `docs/add/mockups/2026-10-07-rules-by-rubric.html` — open it with `#s=1`…`#s=13` to see each state. Backend plan: `docs/add/rubric/plan/2026-10-07-rules-by-rubric-backend.md` — **this plan starts only after its Task A11** (OpenAPI client regenerated and committed).

## Global Constraints

- **Vocabulary (spec §5.7), text the lecturer reads:** *Lỗi* (not luật), *Điểm trừ / Đặt điểm trừ / Chưa có điểm trừ* (not giá), *Cách phát hiện: Tự động (chạy test) / AI đọc bài* (not Cách khớp / Máy kiểm / Bằng lời), *Điểm tối đa* (not trần), *Đã gặp* (not Đang áp vào), *Lỗi AI đề xuất*, *Tiêu chí này không trừ điểm*, *Sửa tiêu chí & điểm tối đa*. No "phiên bản rubric", no "lệch tiêu chí", no "cần backend", no criterion keys (`tinh_dung`…) and no `ruleKey` on screen. **T-RBE-UI-2** asserts the page text never contains `giá`, `trần`, `luật`, `Cách khớp`, `cần backend`, `chua_gan` as words.
- **One colour (D13):** `primary` tokens only (`bg-primary`, `text-primary`, `border-primary`, `bg-primary-subtle`, `Button variant="primary"`). Teal (`accent`, `Button variant="default"`) is **not** used on this page. Status uses the existing `warning`/`success` tokens only for the three readiness states.
- **Deductions are decimal strings** (`"1.50"`) or `null`; never JSON numbers (`parseDeductionInput` produces them). A blank deduction in a drawer means *omit* the field (no new price version); a blank in the price popover means *explicit `null`*.
- **The open rubric lives in the URL:** `/teacher/rules?rubric=<name>` (`rulesHref(name)` builds it with `encodeURIComponent`). No `rubric`, or a name that no longer exists → the first rubric of the overview; no rubric at all → onboarding.
- **Picker thresholds:** `MANY = 4` (≥ 5 rubrics → "Rubric đang mở" + picker), recent chips = 3, recent stored = 8. Every list of rubric names is capped by `capNames` ("A, B và 8 rubric khác").
- **Semester filter never blocks anything** (`CLAUDE.md` §1.2): it only narrows the picker. Default is *Tất cả học kỳ*; creating a rubric resets it.
- **No API call inside a component body:** components call hooks from `hooks/`; hooks call `lib/api/`. `localStorage` is touched only in `lib/rubric-board.ts`, always inside `try/catch`, and the page must render correctly without it.
- Page and component files < 500 lines. Code comments in Vietnamese, explaining *why*, with spec/test IDs (`T-RBE-UI-n`).
- Test commands run from `apps/web`: `pnpm exec vitest run <path>`; type-check `pnpm exec tsc --noEmit`; lint `pnpm exec eslint <dirs>`. Reuse this checkout's `node_modules` (same branch as Plan A). **No new npm dependency** — the price popover is a small own primitive for that reason.
- Commit per task on the **current branch** (same checkout as Plan A; do not create a separate worktree). End every commit message with the attribution line the session's system-reminder asks for. No push / PR / merge until the user says so.

## Review Focus

1. **A rubric name with `&`, `#`, `?`, `/`, `%`, `+`, diacritics or trailing spaces** must survive `?rubric=`, the API query string and the picker. → B1 `rulesHref` round-trip test and `listRubricErrors` request test; B11 page test opens `?rubric=` with such a name.
2. **`?rubric=` names a rubric that does not exist (renamed, typo), or was just created and the overview is still refetching.** Expected: open the first rubric (or a skeleton while refetching), never a blank page or the wrong rubric flashing. → B11.
3. **`localStorage` blocked or throwing** (private window, quota): the "gần đây" chips are simply empty; nothing else changes. → B2 + B11.
4. **An error whose criterion no longer exists** (`criterionDangling`, or a key missing from the overview) must still render, be counted, and be movable/removable — not crash the criterion grouping. → B6.
5. **Adopting an AI proposal must reuse the proposal's rule** (`ruleId` + `changes`), not create a second rule and leave the proposal in the list. → B7 (and B11 for the click path).
6. **Editing an old error that carries a non-test predicate** (`calls_function`, …): changing only the name must send no `predicate`, so the stored condition is not wiped. → B2 `buildChanges`, B8.

## File Structure

**Create (`apps/web/src`):**
- `lib/api/error.ts`, `lib/api/rubric-errors.ts` (+ `.test.ts`), `lib/api/rules.test.ts`
- `hooks/board-cache.ts`, `hooks/useRubricErrors.ts` (+ `.test.tsx`)
- `lib/rules-links.ts` (+ test), `lib/rubric-board.ts` (+ test), `lib/error-form.ts` (+ test)
- `components/ui/popover.tsx` (+ test)
- `app/teacher/rules/_components/`: `RubricStatus`, `RubricTabs`, `RubricPicker`, `RubricSwitcher`, `RubricMeta`, `CopyFromRubric`, `ReadinessBanner`, `DetectionBadge`, `CriterionGroup`, `ErrorRow`, `PricePopover`, `UsesMore`, `ErrorMenu`, `ErrorDialogs` (move/remove), `ErrorsTab`, `ErrorFields`, `AddErrorDrawer`, `EditErrorDrawer`, `ProposalsTab`, `LibraryTab`, `WaiverDialog`, `Onboarding` (each `.tsx` + `.test.tsx`)
- `app/teacher/rules/page.test.tsx` (also holds the T-RBE-UI-2 vocabulary sweep)
- `hooks/useRulesLink.ts` (+ test)

**Modify:** `lib/api/rules.ts` (rewrite), `hooks/useRules.ts` (rewrite), `lib/rules-vocab.ts` (+ test, trim and reword), `hooks/useGrading.ts` (`useSaveRubric` invalidation), `lib/preflight.ts` (+ test), `lib/rubric-form.ts` (+ test: vocabulary, drop two dead helpers), `app/teacher/grading/_components/PreparePanel.tsx` (+ test), `app/teacher/rules/_components/RubricDialog.tsx` (+ test), `app/teacher/rules/_components/fixtures.ts` (rewrite), `app/teacher/rules/page.tsx` (shell in B3, real in B11), `app/teacher/rules/new/page.tsx` and `[ruleId]/page.tsx` (redirects, B3), and the link sites in B12 (`CaseFlagsBanner`, `ErrorList`/`InvestigatorDossier`, `LeverageLine`, `ReapplyPricesPanel`/`FinalizePanel`, `RubricRow`, grading `page.tsx` and `finalize/page.tsx`).

**Delete (B3):** `lib/rule-form.ts`, `lib/rules-filter.ts` (+ tests); `_components/` `ApplyPreview`, `CeilingCard`, `MissingRulesPanel`, `PriceSheet`, `RuleForm`, `RuleSummary`, `RuleTable`, `RuleToolbar` (+ tests); old `page.test.tsx`.

**Task order:** B1 data layer → B2 pure logic → B3 cutover (`tsc` green again) → B4 switcher → B5 banner + copy → B6 errors tab → B7 add drawer → B8 edit drawer → B9 proposals + library → B10 waiver dialog + first-time screen + rubric dialog → B11 page assembly → B12 grading-page links → B13 acceptance.

---

## Task B1: API layer, hooks, vocabulary, links and fixtures

The regenerated OpenAPI client (Plan A, A11) no longer has the old price/preview/create routes, so `apps/web` does not type-check until Task B3 finishes the cutover. This task builds the new data layer beside the old code; nothing visible changes yet. **`tsc` stays red until B3** (errors only in the old rules tree and the files that import its removed exports) — vitest per file is the gate for B1 and B2.

**Files:**
- Create: `lib/api/error.ts`, `lib/api/rubric-errors.ts`, `lib/api/rubric-errors.test.ts`, `lib/api/rules.test.ts`, `hooks/board-cache.ts`, `hooks/useRubricErrors.ts`, `hooks/useRubricErrors.test.tsx`, `lib/rules-links.ts`, `lib/rules-links.test.ts`
- Rewrite: `lib/api/rules.ts`, `hooks/useRules.ts`, `lib/rules-vocab.ts`, `lib/rules-vocab.test.ts`, `app/teacher/rules/_components/fixtures.ts`
- Modify: `hooks/useGrading.ts`

**Interfaces — Produces** (every later task uses these exact names):

```ts
// lib/api/rules.ts
export type RulePredicate = | { kind: 'test_group_failed'; group: string } | { kind: 'calls_function'; name: string }
  | { kind: 'complexity_exceeds_required' } | { kind: 'no_recursion'; functionName?: string };
export interface RecomputeSummary { recomputed: number; promoted: number; demoted: number; belowFloor: number }
export interface PricePreview { openSessions: { sessionId: string; name: string; affected: number; autoAfter: number; blockedByOtherUnpriced: number }[];
  finalizedSessions: { sessionId: string; name: string; affected: number }[] }
export interface ErrorChanges { name?: string; description?: string; predicate?: RulePredicate | null }
export interface LibraryRule { id: string; ruleKey: string; origin: string;
  revision: { id: string; revision: number; name: string; description: string; predicate: RulePredicate | null };
  checkedBy: 'machine' | 'model'; uses: { rubricName: string; criterionKey: string; deduction: string | null }[] }
export interface ProposalItem { id: string; ruleKey: string; name: string; description: string;
  sightings: { sessions: { id: string; name: string }[]; results: number }; legacy: boolean }
listLibrary(): Promise<LibraryRule[]>            listProposals(rubricName?: string): Promise<ProposalItem[]>
reviseRule(ruleId, changes: ErrorChanges): Promise<{ revisionId: string; recompute: RecomputeSummary | null }>
splitRule(ruleId, rubricName, changes: ErrorChanges): Promise<{ ruleId: string; rubricErrorId: string; recompute: RecomputeSummary }>
setRuleState(ruleId, state: 'dismissed' | 'retired'): Promise<{ recompute: RecomputeSummary }>
setWaiver(rubricId, criterionKey): Promise<{ waiverId: string; recompute: RecomputeSummary | null }>
revokeWaiver(waiverId): Promise<{ recompute: RecomputeSummary }>

// lib/api/rubric-errors.ts
export type RubricSessionState = 'not_started' | 'grading' | 'finalized';
export interface OverviewCriterion { key: string; description: string; maxPoints: number; errorCount: number; waiverId: string | null }
export interface OverviewSession { id: string; name: string; semesterName: string; state: RubricSessionState; resultCount: number }
export interface RubricOverview { rubricName: string; rubricId: string; totalPoints: number; criteria: OverviewCriterion[];
  errorCount: number; unpricedCount: number; danglingCount: number; proposalCount: number; sessions: OverviewSession[]; semesters: string[] }
export interface RubricErrorItem { id: string; ruleId: string; ruleKey: string; name: string; description: string;
  predicate: RulePredicate | null; checkedBy: 'machine' | 'model'; origin: string; criterionKey: string; criterionDangling: boolean;
  deduction: string | null; appliedTo: { results: number; sessions: number };
  alsoIn: { rubricName: string; criterionKey: string; deduction: string | null }[] }
export interface NewErrorInput { name: string; description: string; predicate: RulePredicate | null }
export interface AssignInput { rubricName: string; criterionKey: string; deduction?: string | null; ruleId?: string; newRule?: NewErrorInput; changes?: ErrorChanges }
export interface AssignResult { rubricErrorId: string; ruleId: string; recompute: RecomputeSummary | null }
export interface CopyResult { copied: number; skippedNoCriterion: number; skippedExisting: number; recompute: RecomputeSummary | null }
getRubricOverview() · listRubricErrors(rubricName) · assignError(AssignInput) · moveError(id, criterionKey) · removeError(id)
copyErrors(from, to) · previewErrorPrice(id, deduction) · setErrorPrice(id, deduction)

// hooks/useRubricErrors.ts
useRubricOverview() · useRubricErrors(rubricName: string | undefined)
useAssignError()  .mutate(AssignInput)                         → AssignResult
useMoveError()    .mutate({ rubricErrorId, criterionKey })     → { recompute: RecomputeSummary }
useRemoveError()  .mutate(rubricErrorId: string)               → { recompute: RecomputeSummary }
useCopyErrors()   .mutate({ from, to })                        → CopyResult
usePreviewErrorPrice() .mutate({ rubricErrorId, deduction })   → PricePreview     (no cache invalidation)
useSetErrorPrice()     .mutate({ rubricErrorId, deduction })   → { versionId: string; recompute: RecomputeSummary }
// hooks/useRules.ts
useLibrary() · useProposals(rubricName?: string)
useReviseRule() .mutate({ ruleId, changes })  · useSplitRule() .mutate({ ruleId, rubricName, changes })
useDismissRule() .mutate({ ruleId })          · useSetWaiver(rubricId) .mutate(criterionKey) · useRevokeWaiver() .mutate(waiverId)
// lib/rules-vocab.ts: formatDeductionString · deductionLabel · parseDeductionInput · describeRecompute
// lib/rules-links.ts: RULES_PATH · rulesHref(rubricName?: string | null)
// _components/fixtures.ts: criterion · session · overview · errorItem · libraryRule · proposal · mutation
```

- [ ] **Step 1: Confirm the gate and record what is red**

From the repo root:

```bash
git log --oneline -8
grep -c "rubric-errors" packages/shared/src/api/schema.d.ts
grep -n "\"/rules/{id}/price\"\|\"/rules/preview\"" packages/shared/src/api/schema.d.ts
```
Expected: the A11 commit is in the log; the first `grep` prints a number > 0 (`/rubric-errors` paths exist); the second prints nothing. If the first is `0`, stop — Plan A, Task A11 has not been done.

```powershell
cd apps\web
pnpm exec tsc --noEmit 2>&1 | Select-String "error TS" | Select-Object -First 40
```
Expected: errors only in `lib/api/rules.ts` (routes that no longer exist) and the files that import its removed exports. Save the list of files in `.superpowers/sdd/rules-by-rubric/progress.md` (git-ignored). Also record the baseline unit result: `pnpm exec vitest run 2>&1 | Select-Object -Last 8` — every failure at this point must be in files this task deletes or rewrites; anything else is a pre-existing failure and goes in the note.

- [ ] **Step 2: Write the failing tests for the API layer**

`lib/api/rubric-errors.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ GET: vi.fn(), POST: vi.fn(), PUT: vi.fn(), PATCH: vi.fn(), DELETE: vi.fn() }));
vi.mock('@/lib/api-client', () => ({ apiClient: h }));

import {
  assignError,
  copyErrors,
  getRubricOverview,
  listRubricErrors,
  moveError,
  previewErrorPrice,
  removeError,
  setErrorPrice,
} from './rubric-errors';

const ok = (data: unknown) => ({ data, error: undefined, response: { ok: true, status: 200 } });
const bad = (message: unknown, status = 409) => ({ data: undefined, error: { message }, response: { ok: false, status } });

beforeEach(() => Object.values(h).forEach((fn) => fn.mockReset()));

describe('lib/api/rubric-errors', () => {
  it('đọc tổng quan từ GET /rubric-errors/overview', async () => {
    h.GET.mockResolvedValue(ok([{ rubricName: 'A' }]));
    await expect(getRubricOverview()).resolves.toEqual([{ rubricName: 'A' }]);
    expect(h.GET).toHaveBeenCalledWith('/rubric-errors/overview');
  });

  it('liệt kê lỗi của một rubric bằng query rubricName (tên có ký tự đặc biệt đi nguyên văn)', async () => {
    h.GET.mockResolvedValue(ok([]));
    await listRubricErrors('A&B #1 — Giữa kỳ?');
    expect(h.GET).toHaveBeenCalledWith('/rubric-errors', { params: { query: { rubricName: 'A&B #1 — Giữa kỳ?' } } });
  });

  it('thêm lỗi gửi đúng nguyên thân (điểm trừ là chuỗi)', async () => {
    h.POST.mockResolvedValue(ok({ rubricErrorId: 'e1', ruleId: 'r1', recompute: null }));
    const input = { rubricName: 'A', criterionKey: 'x', deduction: '1.5', ruleId: 'r1' };
    await expect(assignError(input)).resolves.toMatchObject({ rubricErrorId: 'e1' });
    expect(h.POST).toHaveBeenCalledWith('/rubric-errors', { body: input });
  });

  it('chuyển tiêu chí, gỡ, sao chép dùng đúng đường dẫn', async () => {
    h.PATCH.mockResolvedValue(ok({ recompute: { recomputed: 1, promoted: 0, demoted: 0, belowFloor: 0 } }));
    h.DELETE.mockResolvedValue(ok({ recompute: { recomputed: 0, promoted: 0, demoted: 0, belowFloor: 0 } }));
    h.POST.mockResolvedValue(ok({ copied: 2, skippedNoCriterion: 0, skippedExisting: 0, recompute: null }));
    await moveError('e1', 'bo_nho');
    expect(h.PATCH).toHaveBeenCalledWith('/rubric-errors/{id}', { params: { path: { id: 'e1' } }, body: { criterionKey: 'bo_nho' } });
    await removeError('e1');
    expect(h.DELETE).toHaveBeenCalledWith('/rubric-errors/{id}', { params: { path: { id: 'e1' } } });
    await copyErrors('Từ', 'Đến');
    expect(h.POST).toHaveBeenCalledWith('/rubric-errors/copy', { body: { fromRubricName: 'Từ', toRubricName: 'Đến' } });
  });

  it('xem trước và lưu điểm trừ: chuỗi thập phân hoặc null tường minh', async () => {
    h.POST.mockResolvedValue(ok({ openSessions: [], finalizedSessions: [] }));
    h.PUT.mockResolvedValue(ok({ versionId: 'v2', recompute: { recomputed: 0, promoted: 0, demoted: 0, belowFloor: 0 } }));
    await previewErrorPrice('e1', '2.25');
    expect(h.POST).toHaveBeenCalledWith('/rubric-errors/{id}/price/preview', { params: { path: { id: 'e1' } }, body: { deduction: '2.25' } });
    await setErrorPrice('e1', null);
    expect(h.PUT).toHaveBeenCalledWith('/rubric-errors/{id}/price', { params: { path: { id: 'e1' } }, body: { deduction: null } });
  });

  it('lỗi của máy chủ hiện nguyên văn; thông điệp dạng mảng nối bằng "; "; không có thông điệp thì nêu mã HTTP', async () => {
    h.POST.mockResolvedValueOnce(bad('Lỗi này đã có trong rubric'));
    await expect(assignError({ rubricName: 'A', criterionKey: 'x', ruleId: 'r1' })).rejects.toThrow('Lỗi này đã có trong rubric');
    h.POST.mockResolvedValueOnce(bad(['a sai', 'b sai'], 400));
    await expect(assignError({ rubricName: 'A', criterionKey: 'x', ruleId: 'r1' })).rejects.toThrow('a sai; b sai');
    h.GET.mockResolvedValueOnce(bad(undefined, 500));
    await expect(getRubricOverview()).rejects.toThrow('Yêu cầu thất bại (HTTP 500)');
  });
});
```

`lib/api/rules.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ GET: vi.fn(), POST: vi.fn(), PUT: vi.fn(), PATCH: vi.fn(), DELETE: vi.fn() }));
vi.mock('@/lib/api-client', () => ({ apiClient: h }));

import { listLibrary, listProposals, reviseRule, revokeWaiver, setRuleState, setWaiver, splitRule } from './rules';

const ok = (data: unknown) => ({ data, error: undefined, response: { ok: true, status: 200 } });
const recompute = { recomputed: 1, promoted: 0, demoted: 0, belowFloor: 0 };

beforeEach(() => Object.values(h).forEach((fn) => fn.mockReset()));

describe('lib/api/rules', () => {
  it('thư viện lỗi: GET /rules', async () => {
    h.GET.mockResolvedValue(ok([{ id: 'r1' }]));
    await expect(listLibrary()).resolves.toEqual([{ id: 'r1' }]);
    expect(h.GET).toHaveBeenCalledWith('/rules');
  });

  it('lỗi AI đề xuất: có rubricName thì lọc, không có thì không gửi query', async () => {
    h.GET.mockResolvedValue(ok([]));
    await listProposals('Giữa kỳ');
    expect(h.GET).toHaveBeenLastCalledWith('/rules/missing', { params: { query: { rubricName: 'Giữa kỳ' } } });
    await listProposals();
    expect(h.GET).toHaveBeenLastCalledWith('/rules/missing', { params: { query: {} } });
  });

  it('sửa cả N rubric: PATCH /rules/{id}; tách bản riêng: POST /rules/{id}/split kèm rubricName', async () => {
    h.PATCH.mockResolvedValue(ok({ revisionId: 'v2', recompute: null }));
    h.POST.mockResolvedValue(ok({ ruleId: 'r2', rubricErrorId: 'e1', recompute }));
    await reviseRule('r1', { name: 'Mới' });
    expect(h.PATCH).toHaveBeenCalledWith('/rules/{id}', { params: { path: { id: 'r1' } }, body: { name: 'Mới' } });
    await splitRule('r1', 'Giữa kỳ', { name: 'Riêng', predicate: null });
    expect(h.POST).toHaveBeenCalledWith('/rules/{id}/split', {
      params: { path: { id: 'r1' } },
      body: { rubricName: 'Giữa kỳ', changes: { name: 'Riêng', predicate: null } },
    });
  });

  it('"không phải lỗi" và đánh dấu không trừ điểm', async () => {
    h.POST.mockResolvedValue(ok({ recompute }));
    await setRuleState('r1', 'dismissed');
    expect(h.POST).toHaveBeenLastCalledWith('/rules/{id}/state', { params: { path: { id: 'r1' } }, body: { state: 'dismissed' } });
    h.POST.mockResolvedValue(ok({ waiverId: 'w1', recompute: null }));
    await setWaiver('ru-1', 'bo_nho');
    expect(h.POST).toHaveBeenLastCalledWith('/rubrics/{id}/criterion-waivers', { params: { path: { id: 'ru-1' } }, body: { criterionKey: 'bo_nho' } });
    h.POST.mockResolvedValue(ok({ recompute }));
    await revokeWaiver('w1');
    expect(h.POST).toHaveBeenLastCalledWith('/criterion-waivers/{id}/revoke', { params: { path: { id: 'w1' } } });
  });
});
```

`lib/rules-links.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { RULES_PATH, rulesHref } from './rules-links';

describe('rulesHref (T-RBE-UI-9)', () => {
  it('không biết rubric thì về trang gốc', () => {
    expect(rulesHref()).toBe(RULES_PATH);
    expect(rulesHref(null)).toBe(RULES_PATH);
    expect(rulesHref('')).toBe(RULES_PATH);
  });

  it('tên rubric đi vòng qua URL không mất ký tự nào (Review Focus 1)', () => {
    for (const name of ['Giữa kỳ CTDL', 'A&B #1 — Giữa kỳ?', 'a/b%c+d', ' có khoảng trắng ', 'Đề B (lần 2)']) {
      const href = rulesHref(name);
      expect(href.startsWith(`${RULES_PATH}?rubric=`)).toBe(true);
      expect(new URLSearchParams(href.split('?')[1]).get('rubric')).toBe(name);
    }
  });
});
```

`hooks/useRubricErrors.test.tsx`:

```tsx
import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '@/lib/api/rubric-errors';
import { useAssignError, usePreviewErrorPrice, useRubricErrors, useSetErrorPrice } from './useRubricErrors';

vi.mock('@/lib/api/rubric-errors', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/rubric-errors')>();
  return {
    ...actual,
    getRubricOverview: vi.fn(),
    listRubricErrors: vi.fn(),
    assignError: vi.fn(),
    previewErrorPrice: vi.fn(),
    setErrorPrice: vi.fn(),
  };
});

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
  return { wrapper, invalidate };
}

beforeEach(() => vi.clearAllMocks());

describe('hooks/useRubricErrors', () => {
  it('chưa biết rubric thì không gọi API', () => {
    const { wrapper } = setup();
    renderHook(() => useRubricErrors(undefined), { wrapper });
    expect(api.listRubricErrors).not.toHaveBeenCalled();
  });

  it('thêm lỗi xong làm mới cả tổng quan lẫn thư viện (hai họ khoá)', async () => {
    vi.mocked(api.assignError).mockResolvedValue({ rubricErrorId: 'e1', ruleId: 'r1', recompute: null });
    const { wrapper, invalidate } = setup();
    const { result } = renderHook(() => useAssignError(), { wrapper });
    await act(async () => {
      result.current.mutate({ rubricName: 'A', criterionKey: 'x', ruleId: 'r1' });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.assignError).toHaveBeenCalledWith({ rubricName: 'A', criterionKey: 'x', ruleId: 'r1' });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['rubric-errors'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['rules'] });
  });

  it('xem trước điểm trừ KHÔNG làm mới gì (T-POL-5: không ghi)', async () => {
    vi.mocked(api.previewErrorPrice).mockResolvedValue({ openSessions: [], finalizedSessions: [] });
    const { wrapper, invalidate } = setup();
    const { result } = renderHook(() => usePreviewErrorPrice(), { wrapper });
    await act(async () => {
      result.current.mutate({ rubricErrorId: 'e1', deduction: '1.5' });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.previewErrorPrice).toHaveBeenCalledWith('e1', '1.5');
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('lưu điểm trừ chuyển đúng tham số và làm mới', async () => {
    vi.mocked(api.setErrorPrice).mockResolvedValue({ versionId: 'v2', recompute: { recomputed: 0, promoted: 0, demoted: 0, belowFloor: 0 } });
    const { wrapper, invalidate } = setup();
    const { result } = renderHook(() => useSetErrorPrice(), { wrapper });
    await act(async () => {
      result.current.mutate({ rubricErrorId: 'e1', deduction: null });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.setErrorPrice).toHaveBeenCalledWith('e1', null);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['rubric-errors'] });
  });
});
```

`lib/rules-vocab.test.ts` (overwrite):

```ts
import { describe, expect, it } from 'vitest';
import { deductionLabel, describeRecompute, formatDeductionString, parseDeductionInput } from './rules-vocab';

describe('formatDeductionString', () => {
  it('chuỗi thập phân → số kiểu Việt Nam, luôn mang dấu trừ', () => {
    expect(formatDeductionString('1.50')).toBe('−1,5');
    expect(formatDeductionString('0.25')).toBe('−0,25');
    expect(formatDeductionString('0.00')).toBe('0');
  });
  it('chưa có điểm trừ → "—"', () => {
    expect(formatDeductionString(null)).toBe('—');
  });
});

describe('deductionLabel', () => {
  it('dùng trong danh sách: số hoặc chữ "chưa có điểm trừ"', () => {
    expect(deductionLabel('2.00')).toBe('−2,0');
    expect(deductionLabel(null)).toBe('chưa có điểm trừ');
  });
});

describe('parseDeductionInput', () => {
  it('để trống = chưa có điểm trừ (null tường minh)', () => {
    expect(parseDeductionInput('')).toEqual({ ok: true, value: null });
    expect(parseDeductionInput('   ')).toEqual({ ok: true, value: null });
  });
  it('nhận dấu phẩy và trả CHUỖI (server từ chối số JSON)', () => {
    expect(parseDeductionInput('1,5')).toEqual({ ok: true, value: '1.5' });
    expect(parseDeductionInput('0')).toEqual({ ok: true, value: '0' });
    expect(parseDeductionInput('12.25')).toEqual({ ok: true, value: '12.25' });
  });
  it('từ chối chữ, số âm, quá hai chữ số lẻ, quá bốn chữ số nguyên', () => {
    for (const bad of ['abc', '-1', '1.234', '12345', '1,,5']) {
      expect(parseDeductionInput(bad)).toEqual({ ok: false, message: 'Điểm trừ: số không âm, tối đa hai chữ số lẻ.' });
    }
  });
});

describe('describeRecompute', () => {
  it('null = lỗi AI đọc bài không tính lại bài đã chấm (T-FAIR-1) — nói ra, không im lặng', () => {
    expect(describeRecompute(null)).toBe('Lỗi này không tính lại bài nào đã chấm — chỉ áp cho phiên chấm sau.');
  });
  it('không bài nào bị ảnh hưởng', () => {
    expect(describeRecompute({ recomputed: 0, promoted: 0, demoted: 0, belowFloor: 0 })).toBe('Không có bài nào bị ảnh hưởng.');
  });
  it('đọc kết quả bằng lời', () => {
    expect(describeRecompute({ recomputed: 9, promoted: 3, demoted: 1, belowFloor: 2 })).toBe(
      'Đã tính lại 9 bài: 3 bài đủ điều kiện tự quyết; 1 bài chuyển về "Cần bạn xem"; 2 bài chưa cho điểm được (dưới sàn).',
    );
    expect(describeRecompute({ recomputed: 4, promoted: 0, demoted: 0, belowFloor: 0 })).toBe('Đã tính lại 4 bài, không bài nào đổi nhóm.');
  });
});
```

Run `pnpm exec vitest run src/lib/api src/hooks/useRubricErrors.test.tsx src/lib/rules-links.test.ts src/lib/rules-vocab.test.ts` → Expected FAIL (modules do not exist / old exports).

- [ ] **Step 3: Implement the API layer**

`lib/api/error.ts`:

```ts
/** Lỗi từ máy chủ → `Error` mang thông điệp nguyên văn (mảng thì nối bằng "; "). Dùng chung cho mọi module `lib/api/*` của Bảng lỗi. */
export function apiFailure(error: unknown, response: Response): Error {
  const body = error as { message?: string | string[] } | undefined;
  const message = Array.isArray(body?.message) ? body!.message.join('; ') : body?.message;
  return new Error(message ?? `Yêu cầu thất bại (HTTP ${response.status})`);
}
```

`lib/api/rules.ts` (overwrite):

```ts
import { apiClient } from '@/lib/api-client';
import { apiFailure } from './error';

/**
 * Bốn mẫu điều kiện có sẵn, hoặc `null` (AI đọc bài) — mirrors `RulePredicate`
 * (apps/api/src/grading/decision/types.ts). Giao diện chỉ TẠO mẫu `test_group_failed`; ba mẫu còn lại chỉ còn ở
 * lỗi cũ (spec D9) và được hiện như "AI đọc bài" kèm ghi chú.
 */
export type RulePredicate =
  | { kind: 'test_group_failed'; group: string }
  | { kind: 'calls_function'; name: string }
  | { kind: 'complexity_exceeds_required' }
  | { kind: 'no_recursion'; functionName?: string };

/**
 * Kết quả tính lại mà máy chủ trả sau mỗi thao tác đổi lỗi / điểm trừ / đánh dấu — mirrors `RecomputeSummary`
 * (apps/api/src/grading/scoring/score.service.ts). Luôn đọc lại bằng lời cho giảng viên (`describeRecompute`).
 */
export interface RecomputeSummary {
  recomputed: number;
  promoted: number;
  demoted: number;
  belowFloor: number;
}

/** Mirrors PricePreview (apps/api/src/grading/rules/price.service.ts). */
export interface PricePreview {
  openSessions: { sessionId: string; name: string; affected: number; autoAfter: number; blockedByOtherUnpriced: number }[];
  /** Phiên đã chốt KHÔNG đổi theo: bảng điểm trừ đã ghim lúc chốt (§2.2). */
  finalizedSessions: { sessionId: string; name: string; affected: number }[];
}

export interface ErrorChanges {
  name?: string;
  description?: string;
  predicate?: RulePredicate | null;
}

/** Một lỗi trong THƯ VIỆN — mirrors LibraryRule (apps/api/src/grading/rules/error-rule.service.ts). */
export interface LibraryRule {
  id: string;
  ruleKey: string;
  origin: string;
  revision: { id: string; revision: number; name: string; description: string; predicate: RulePredicate | null };
  checkedBy: 'machine' | 'model';
  uses: { rubricName: string; criterionKey: string; deduction: string | null }[];
}

/** Lỗi AI đề xuất kèm nơi thấy — mirrors ProposalItem (apps/api/src/grading/rules/proposal.service.ts). */
export interface ProposalItem {
  id: string;
  ruleKey: string;
  name: string;
  description: string;
  sightings: { sessions: { id: string; name: string }[]; results: number };
  /** Báo trước khi có bảng ghi nhận nơi thấy — không biết thấy ở đâu nên hiện ở mọi rubric. */
  legacy: boolean;
}

export async function listLibrary(): Promise<LibraryRule[]> {
  const { data, error, response } = await apiClient.GET('/rules');
  if (error || !response.ok) throw apiFailure(error, response);
  return data as unknown as LibraryRule[];
}

/** Có `rubricName`: chỉ lỗi thấy ở rubric đó (số liệu của rubric đó). Không có: mọi lỗi đề xuất. */
export async function listProposals(rubricName?: string): Promise<ProposalItem[]> {
  const { data, error, response } = await apiClient.GET('/rules/missing', {
    params: { query: rubricName ? { rubricName } : {} } as never,
  });
  if (error || !response.ok) throw apiFailure(error, response);
  return data as unknown as ProposalItem[];
}

/** Sửa tên / mô tả / điều kiện cho CẢ các rubric đang dùng lỗi này. */
export async function reviseRule(
  ruleId: string,
  changes: ErrorChanges,
): Promise<{ revisionId: string; recompute: RecomputeSummary | null }> {
  const { data, error, response } = await apiClient.PATCH('/rules/{id}', {
    params: { path: { id: ruleId } },
    body: changes as never,
  });
  if (error || !response.ok) throw apiFailure(error, response);
  return data as unknown as { revisionId: string; recompute: RecomputeSummary | null };
}

/** Sửa CHỈ cho một rubric: tách thành bản riêng, rubric còn lại giữ nguyên (D4). */
export async function splitRule(
  ruleId: string,
  rubricName: string,
  changes: ErrorChanges,
): Promise<{ ruleId: string; rubricErrorId: string; recompute: RecomputeSummary }> {
  const { data, error, response } = await apiClient.POST('/rules/{id}/split', {
    params: { path: { id: ruleId } },
    body: { rubricName, changes } as never,
  });
  if (error || !response.ok) throw apiFailure(error, response);
  return data as unknown as { ruleId: string; rubricErrorId: string; recompute: RecomputeSummary };
}

/** "Không phải lỗi" (`dismissed`). Duyệt một lỗi đề xuất đi qua `assignError`, không qua đây. */
export async function setRuleState(
  ruleId: string,
  state: 'dismissed' | 'retired',
): Promise<{ recompute: RecomputeSummary }> {
  const { data, error, response } = await apiClient.POST('/rules/{id}/state', {
    params: { path: { id: ruleId } },
    body: { state },
  });
  if (error || !response.ok) throw apiFailure(error, response);
  return data as unknown as { recompute: RecomputeSummary };
}

export async function setWaiver(
  rubricId: string,
  criterionKey: string,
): Promise<{ waiverId: string; recompute: RecomputeSummary | null }> {
  const { data, error, response } = await apiClient.POST('/rubrics/{id}/criterion-waivers', {
    params: { path: { id: rubricId } },
    body: { criterionKey },
  });
  if (error || !response.ok) throw apiFailure(error, response);
  return data as unknown as { waiverId: string; recompute: RecomputeSummary | null };
}

export async function revokeWaiver(waiverId: string): Promise<{ recompute: RecomputeSummary }> {
  const { data, error, response } = await apiClient.POST('/criterion-waivers/{id}/revoke', {
    params: { path: { id: waiverId } },
  });
  if (error || !response.ok) throw apiFailure(error, response);
  return data as unknown as { recompute: RecomputeSummary };
}
```

`lib/api/rubric-errors.ts`:

```ts
import { apiClient } from '@/lib/api-client';
import { apiFailure } from './error';
import type { ErrorChanges, PricePreview, RecomputeSummary, RulePredicate } from './rules';

export type RubricSessionState = 'not_started' | 'grading' | 'finalized';

export interface OverviewCriterion {
  key: string;
  description: string;
  maxPoints: number;
  /** Dòng áp dụng chưa gỡ ở tiêu chí này. */
  errorCount: number;
  /** ≠ null: tiêu chí đã đánh dấu "không trừ điểm". */
  waiverId: string | null;
}

export interface OverviewSession {
  id: string;
  name: string;
  semesterName: string;
  state: RubricSessionState;
  resultCount: number;
}

/** Một phần tử cho MỖI rubric (theo tên) — mirrors RubricOverview (apps/api/src/grading/rules/rubric-overview.service.ts). */
export interface RubricOverview {
  rubricName: string;
  /** Phiên bản mới nhất — dùng cho đánh dấu tiêu chí và hộp thoại sửa tiêu chí. */
  rubricId: string;
  totalPoints: number;
  criteria: OverviewCriterion[];
  errorCount: number;
  unpricedCount: number;
  /** Lỗi gắn tiêu chí không còn ở bản mới nhất (spec mục 2.3.4). */
  danglingCount: number;
  proposalCount: number;
  sessions: OverviewSession[];
  semesters: string[];
}

/** Mirrors RubricErrorItem (apps/api/src/grading/rules/rubric-error.service.ts). */
export interface RubricErrorItem {
  id: string;
  ruleId: string;
  ruleKey: string;
  name: string;
  description: string;
  predicate: RulePredicate | null;
  checkedBy: 'machine' | 'model';
  origin: string;
  criterionKey: string;
  criterionDangling: boolean;
  deduction: string | null;
  appliedTo: { results: number; sessions: number };
  alsoIn: { rubricName: string; criterionKey: string; deduction: string | null }[];
}

export interface NewErrorInput {
  name: string;
  description: string;
  predicate: RulePredicate | null;
}

export interface AssignInput {
  rubricName: string;
  criterionKey: string;
  /** Bỏ qua = không ghi phiên bản điểm trừ nào. `null` = ghi "chưa có điểm trừ" tường minh. */
  deduction?: string | null;
  ruleId?: string;
  newRule?: NewErrorInput;
  /** Chỉ cho lỗi đề xuất được duyệt: sửa rồi kích hoạt. */
  changes?: ErrorChanges;
}

export interface AssignResult {
  rubricErrorId: string;
  ruleId: string;
  recompute: RecomputeSummary | null;
}

export interface CopyResult {
  copied: number;
  skippedNoCriterion: number;
  skippedExisting: number;
  recompute: RecomputeSummary | null;
}

export async function getRubricOverview(): Promise<RubricOverview[]> {
  const { data, error, response } = await apiClient.GET('/rubric-errors/overview');
  if (error || !response.ok) throw apiFailure(error, response);
  return data as unknown as RubricOverview[];
}

export async function listRubricErrors(rubricName: string): Promise<RubricErrorItem[]> {
  const { data, error, response } = await apiClient.GET('/rubric-errors', {
    params: { query: { rubricName } } as never,
  });
  if (error || !response.ok) throw apiFailure(error, response);
  return data as unknown as RubricErrorItem[];
}

export async function assignError(input: AssignInput): Promise<AssignResult> {
  const { data, error, response } = await apiClient.POST('/rubric-errors', { body: input as never });
  if (error || !response.ok) throw apiFailure(error, response);
  return data as unknown as AssignResult;
}

export async function moveError(rubricErrorId: string, criterionKey: string): Promise<{ recompute: RecomputeSummary }> {
  const { data, error, response } = await apiClient.PATCH('/rubric-errors/{id}', {
    params: { path: { id: rubricErrorId } },
    body: { criterionKey } as never,
  });
  if (error || !response.ok) throw apiFailure(error, response);
  return data as unknown as { recompute: RecomputeSummary };
}

/** "Gỡ khỏi rubric này": lỗi vẫn ở thư viện, rubric khác không đổi. */
export async function removeError(rubricErrorId: string): Promise<{ recompute: RecomputeSummary }> {
  const { data, error, response } = await apiClient.DELETE('/rubric-errors/{id}', {
    params: { path: { id: rubricErrorId } },
  });
  if (error || !response.ok) throw apiFailure(error, response);
  return data as unknown as { recompute: RecomputeSummary };
}

/** Sao chép lỗi + điểm trừ từ rubric nguồn sang rubric đích, ghép theo tiêu chí. Sau đó hai rubric độc lập (D3). */
export async function copyErrors(fromRubricName: string, toRubricName: string): Promise<CopyResult> {
  const { data, error, response } = await apiClient.POST('/rubric-errors/copy', {
    body: { fromRubricName, toRubricName } as never,
  });
  if (error || !response.ok) throw apiFailure(error, response);
  return data as unknown as CopyResult;
}

/** "Lưu thì ảnh hưởng bao nhiêu bài" (T-POL-5) — gọi TRƯỚC `setErrorPrice`; không ghi gì. */
export async function previewErrorPrice(rubricErrorId: string, deduction: string | null): Promise<PricePreview> {
  const { data, error, response } = await apiClient.POST('/rubric-errors/{id}/price/preview', {
    params: { path: { id: rubricErrorId } },
    // `deduction` khai `@Allow()` ở DTO (kiểm ở parseDeduction, §13.2) nên openapi-typescript không suy được kiểu.
    body: { deduction } as never,
  });
  if (error || !response.ok) throw apiFailure(error, response);
  return data as unknown as PricePreview;
}

export async function setErrorPrice(
  rubricErrorId: string,
  deduction: string | null,
): Promise<{ versionId: string; recompute: RecomputeSummary }> {
  const { data, error, response } = await apiClient.PUT('/rubric-errors/{id}/price', {
    params: { path: { id: rubricErrorId } },
    body: { deduction } as never,
  });
  if (error || !response.ok) throw apiFailure(error, response);
  return data as unknown as { versionId: string; recompute: RecomputeSummary };
}
```

`lib/rules-links.ts`:

```ts
export const RULES_PATH = '/teacher/rules';

/**
 * Liên kết tới Bảng lỗi; biết rubric thì mở đúng rubric đó (`?rubric=<tên>`, spec mục 5.8, T-RBE-UI-9).
 * Tên rubric là chữ giảng viên gõ nên LUÔN qua `encodeURIComponent` — `&`, `#`, `?`, `%`, `+` đều có thể có mặt.
 */
export function rulesHref(rubricName?: string | null): string {
  return rubricName ? `${RULES_PATH}?rubric=${encodeURIComponent(rubricName)}` : RULES_PATH;
}
```

`hooks/board-cache.ts`:

```ts
import type { QueryClient } from '@tanstack/react-query';

/**
 * Mọi thao tác GHI ở Bảng lỗi đổi cả tổng quan, danh sách lỗi của rubric, thư viện và lỗi AI đề xuất (đếm trên
 * dải trạng thái đọc từ tổng quan). Hai họ khoá, một hàm — để không thao tác nào quên một nửa.
 */
export function invalidateBoard(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: ['rubric-errors'] });
  void queryClient.invalidateQueries({ queryKey: ['rules'] });
}
```

`hooks/useRubricErrors.ts`:

```ts
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  assignError,
  copyErrors,
  getRubricOverview,
  listRubricErrors,
  moveError,
  previewErrorPrice,
  removeError,
  setErrorPrice,
  type AssignInput,
  type AssignResult,
  type CopyResult,
} from '@/lib/api/rubric-errors';
import type { PricePreview, RecomputeSummary } from '@/lib/api/rules';
import { invalidateBoard } from './board-cache';

export const OVERVIEW_KEY = ['rubric-errors', 'overview'] as const;
export const errorsKey = (rubricName: string) => ['rubric-errors', 'list', rubricName] as const;

/** Một phần tử cho mỗi rubric: nuôi ô chọn, trạng thái và dải việc cần làm. */
export function useRubricOverview() {
  return useQuery({ queryKey: OVERVIEW_KEY, queryFn: getRubricOverview });
}

export function useRubricErrors(rubricName: string | undefined) {
  return useQuery({
    queryKey: errorsKey(rubricName ?? ''),
    queryFn: () => listRubricErrors(rubricName!),
    enabled: Boolean(rubricName),
  });
}

export function useAssignError() {
  const queryClient = useQueryClient();
  return useMutation<AssignResult, Error, AssignInput>({
    mutationFn: (input) => assignError(input),
    onSuccess: () => invalidateBoard(queryClient),
  });
}

export function useMoveError() {
  const queryClient = useQueryClient();
  return useMutation<{ recompute: RecomputeSummary }, Error, { rubricErrorId: string; criterionKey: string }>({
    mutationFn: ({ rubricErrorId, criterionKey }) => moveError(rubricErrorId, criterionKey),
    onSuccess: () => invalidateBoard(queryClient),
  });
}

export function useRemoveError() {
  const queryClient = useQueryClient();
  return useMutation<{ recompute: RecomputeSummary }, Error, string>({
    mutationFn: (rubricErrorId) => removeError(rubricErrorId),
    onSuccess: () => invalidateBoard(queryClient),
  });
}

export function useCopyErrors() {
  const queryClient = useQueryClient();
  return useMutation<CopyResult, Error, { from: string; to: string }>({
    mutationFn: ({ from, to }) => copyErrors(from, to),
    onSuccess: () => invalidateBoard(queryClient),
  });
}

/** Không cache, không làm mới: xem trước không ghi gì (T-POL-5). */
export function usePreviewErrorPrice() {
  return useMutation<PricePreview, Error, { rubricErrorId: string; deduction: string | null }>({
    mutationFn: ({ rubricErrorId, deduction }) => previewErrorPrice(rubricErrorId, deduction),
  });
}

export function useSetErrorPrice() {
  const queryClient = useQueryClient();
  return useMutation<{ versionId: string; recompute: RecomputeSummary }, Error, { rubricErrorId: string; deduction: string | null }>({
    mutationFn: ({ rubricErrorId, deduction }) => setErrorPrice(rubricErrorId, deduction),
    onSuccess: () => invalidateBoard(queryClient),
  });
}
```

`hooks/useRules.ts` (overwrite):

```ts
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  listLibrary,
  listProposals,
  reviseRule,
  revokeWaiver,
  setRuleState,
  setWaiver,
  splitRule,
  type ErrorChanges,
  type RecomputeSummary,
} from '@/lib/api/rules';
import { invalidateBoard } from './board-cache';

export const LIBRARY_KEY = ['rules', 'library'] as const;
export const proposalsKey = (rubricName: string | undefined) => ['rules', 'proposals', rubricName ?? null] as const;

/** Thư viện lỗi của giảng viên, kèm nơi dùng (rubric · tiêu chí · điểm trừ). */
export function useLibrary() {
  return useQuery({ queryKey: LIBRARY_KEY, queryFn: listLibrary });
}

/** Lỗi AI đề xuất; có `rubricName` thì chỉ lỗi thấy ở rubric đó. */
export function useProposals(rubricName?: string) {
  return useQuery({ queryKey: proposalsKey(rubricName), queryFn: () => listProposals(rubricName) });
}

/** Sửa cả các rubric đang dùng lỗi này. */
export function useReviseRule() {
  const queryClient = useQueryClient();
  return useMutation<{ revisionId: string; recompute: RecomputeSummary | null }, Error, { ruleId: string; changes: ErrorChanges }>({
    mutationFn: ({ ruleId, changes }) => reviseRule(ruleId, changes),
    onSuccess: () => invalidateBoard(queryClient),
  });
}

/** Sửa CHỈ rubric đang mở (tách bản riêng). */
export function useSplitRule() {
  const queryClient = useQueryClient();
  return useMutation<
    { ruleId: string; rubricErrorId: string; recompute: RecomputeSummary },
    Error,
    { ruleId: string; rubricName: string; changes: ErrorChanges }
  >({
    mutationFn: ({ ruleId, rubricName, changes }) => splitRule(ruleId, rubricName, changes),
    onSuccess: () => invalidateBoard(queryClient),
  });
}

/** "Không phải lỗi". */
export function useDismissRule() {
  const queryClient = useQueryClient();
  return useMutation<{ recompute: RecomputeSummary }, Error, { ruleId: string }>({
    mutationFn: ({ ruleId }) => setRuleState(ruleId, 'dismissed'),
    onSuccess: () => invalidateBoard(queryClient),
  });
}

/** Đánh dấu tiêu chí "không trừ điểm" — trạng thái đánh dấu nằm trong tổng quan nên làm mới cả bảng. */
export function useSetWaiver(rubricId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation<{ waiverId: string; recompute: RecomputeSummary | null }, Error, string>({
    mutationFn: (criterionKey) => setWaiver(rubricId!, criterionKey),
    onSuccess: () => invalidateBoard(queryClient),
  });
}

export function useRevokeWaiver() {
  const queryClient = useQueryClient();
  return useMutation<{ recompute: RecomputeSummary }, Error, string>({
    mutationFn: (waiverId) => revokeWaiver(waiverId),
    onSuccess: () => invalidateBoard(queryClient),
  });
}
```

`lib/rules-vocab.ts` (overwrite — drops `MatchKind`, `matchKindOf`, `MATCH_KIND_LABEL`, `originLabel`, `slugifyRuleKey`; the server now derives `ruleKey`):

```ts
import type { RecomputeSummary } from './api/rules';
import { formatVnPoints } from './format';

/** Điểm trừ lưu dạng chuỗi thập phân ("1.50") → hiện "−1,5"; chưa có → "—". */
export function formatDeductionString(deduction: string | null): string {
  if (deduction === null) return '—';
  const n = Number(deduction);
  if (n === 0) return '0';
  return formatVnPoints(-n);
}

/** Nhãn một điểm trừ trong danh sách: "−1,5" hoặc chữ "chưa có điểm trừ". */
export function deductionLabel(deduction: string | null): string {
  return deduction === null ? 'chưa có điểm trừ' : formatDeductionString(deduction);
}

const DEDUCTION_ERROR = 'Điểm trừ: số không âm, tối đa hai chữ số lẻ.';

/**
 * Ô nhập điểm trừ → giá trị gửi lên API. Server chỉ nhận CHUỖI khớp `/^(\d{1,4})(?:\.(\d{1,2}))?$/` hoặc `null`;
 * số JSON bị 400. Nhận cả dấu phẩy (giảng viên gõ "1,5"); để trống = chưa có điểm trừ (`null`).
 */
export function parseDeductionInput(raw: string): { ok: true; value: string | null } | { ok: false; message: string } {
  const text = raw.trim();
  if (text === '') return { ok: true, value: null };
  const normalized = text.replace(',', '.');
  if (!/^\d{1,4}(\.\d{1,2})?$/.test(normalized)) return { ok: false, message: DEDUCTION_ERROR };
  return { ok: true, value: normalized };
}

/**
 * Kết quả tính lại đọc bằng lời. `null` = lỗi do AI đọc bài không áp ngược cho bài đã chấm (T-FAIR-1) — nói ra,
 * không im lặng.
 */
export function describeRecompute(r: RecomputeSummary | null): string {
  if (r === null) return 'Lỗi này không tính lại bài nào đã chấm — chỉ áp cho phiên chấm sau.';
  if (r.recomputed === 0) return 'Không có bài nào bị ảnh hưởng.';
  const parts: string[] = [];
  if (r.promoted > 0) parts.push(`${r.promoted} bài đủ điều kiện tự quyết`);
  if (r.demoted > 0) parts.push(`${r.demoted} bài chuyển về "Cần bạn xem"`);
  if (r.belowFloor > 0) parts.push(`${r.belowFloor} bài chưa cho điểm được (dưới sàn)`);
  if (parts.length === 0) return `Đã tính lại ${r.recomputed} bài, không bài nào đổi nhóm.`;
  return `Đã tính lại ${r.recomputed} bài: ${parts.join('; ')}.`;
}
```

In `hooks/useGrading.ts`, the rubric list changes the overview too (a new rubric must appear in the picker). Edit `useSaveRubric`:

```ts
    }) => saveRubric(input.name, input.criteria),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['rubrics'] });
      // Rubric mới / sửa tiêu chí đổi cả tổng quan Bảng lỗi (ô chọn, đếm tiêu chí, lỗi mồ côi).
      void queryClient.invalidateQueries({ queryKey: ['rubric-errors'] });
    },
```

- [ ] **Step 4: Fixtures**

`app/teacher/rules/_components/fixtures.ts` (overwrite — builders used by every later test):

```ts
import { vi } from 'vitest';
import type { OverviewCriterion, OverviewSession, RubricErrorItem, RubricOverview } from '@/lib/api/rubric-errors';
import type { LibraryRule, ProposalItem } from '@/lib/api/rules';

export const criterion = (over: Partial<OverviewCriterion> = {}): OverviewCriterion => ({
  key: 'tinh_dung',
  description: 'Tính đúng đắn',
  maxPoints: 6,
  errorCount: 1,
  waiverId: null,
  ...over,
});

export const session = (over: Partial<OverviewSession> = {}): OverviewSession => ({
  id: 's1',
  name: 'Giữa kỳ HK1 — Ca sáng',
  semesterName: 'HK1 2026-2027',
  state: 'grading',
  resultCount: 38,
  ...over,
});

/** Mặc định: một rubric SẴN SÀNG — mọi tiêu chí có lỗi, không còn việc nào. Ghi đè để dựng trạng thái khác. */
export function overview(over: Partial<RubricOverview> = {}): RubricOverview {
  const criteria = over.criteria ?? [
    criterion({ key: 'tinh_dung', description: 'Tính đúng đắn', maxPoints: 6, errorCount: 2 }),
    criterion({ key: 'bo_nho', description: 'Quản lý bộ nhớ', maxPoints: 2, errorCount: 1 }),
    criterion({ key: 'trinh_bay', description: 'Trình bày', maxPoints: 2, errorCount: 1 }),
  ];
  const sessions = over.sessions ?? [];
  return {
    rubricName: 'Giữa kỳ CTDL',
    rubricId: 'ru-1',
    totalPoints: criteria.reduce((sum, c) => sum + c.maxPoints, 0),
    criteria,
    errorCount: criteria.reduce((sum, c) => sum + c.errorCount, 0),
    unpricedCount: 0,
    danglingCount: 0,
    proposalCount: 0,
    sessions,
    semesters: [...new Set(sessions.map((s) => s.semesterName))],
    ...over,
  };
}

export const errorItem = (over: Partial<RubricErrorItem> = {}): RubricErrorItem => ({
  id: 'e1',
  ruleId: 'r1',
  ruleKey: 'sai_ca_bien',
  name: 'Sai ca biên',
  description: 'Kết quả sai khi danh sách rỗng hoặc chỉ có một phần tử.',
  predicate: { kind: 'test_group_failed', group: 'bien' },
  checkedBy: 'machine',
  origin: 'teacher',
  criterionKey: 'tinh_dung',
  criterionDangling: false,
  deduction: '1.50',
  appliedTo: { results: 5, sessions: 2 },
  alsoIn: [],
  ...over,
});

export const libraryRule = (over: Partial<LibraryRule> = {}): LibraryRule => ({
  id: 'r1',
  ruleKey: 'sai_ca_bien',
  origin: 'teacher',
  revision: {
    id: 'v1',
    revision: 1,
    name: 'Sai ca biên',
    description: 'Kết quả sai khi danh sách rỗng hoặc chỉ có một phần tử.',
    predicate: { kind: 'test_group_failed', group: 'bien' },
  },
  checkedBy: 'machine',
  uses: [{ rubricName: 'Giữa kỳ CTDL', criterionKey: 'tinh_dung', deduction: '1.50' }],
  ...over,
});

export const proposal = (over: Partial<ProposalItem> = {}): ProposalItem => ({
  id: 'p1',
  ruleKey: 'de_xuat_1',
  name: 'Hàm pop không kiểm tra ngăn xếp rỗng',
  description: 'Hàm pop không kiểm tra ngăn xếp rỗng',
  sightings: { sessions: [{ id: 's1', name: 'Giữa kỳ HK1 — Ca sáng' }], results: 4 },
  legacy: false,
  ...over,
});

/** Giả một `useMutation`: test gọi `mutate.mock.calls[0][1]?.onSuccess(...)` để mô phỏng máy chủ trả lời. */
export const mutation = () => ({
  mutate: vi.fn(),
  isPending: false,
  isError: false,
  error: null as Error | null,
  reset: vi.fn(),
});
```

- [ ] **Step 5: Run the new tests**

```powershell
pnpm exec vitest run src/lib/api src/hooks/useRubricErrors.test.tsx src/lib/rules-links.test.ts src/lib/rules-vocab.test.ts
pnpm exec eslint src/lib/api src/hooks src/lib/rules-links.ts src/lib/rules-vocab.ts
```
Expected: PASS and clean. `tsc` is expected to stay red until Task B3.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib apps/web/src/hooks apps/web/src/app/teacher/rules/_components/fixtures.ts
git commit -m "feat(web): rubric-scoped API client, hooks, vocabulary and test fixtures"
```

---

## Task B2: Pure logic — `rubric-board.ts` and `error-form.ts` (T-RBE-UI-1)

**Files:**
- Create: `lib/rubric-board.ts`, `lib/rubric-board.test.ts`, `lib/error-form.ts`, `lib/error-form.test.ts`

**Interfaces — Produces:**

```ts
// lib/rubric-board.ts
export const MANY = 4; RECENT_SHOWN = 3; RECENT_STORED = 8; NO_SEMESTER = '__none';
export type BoardStatus = 'new' | 'todo' | 'ready';
export type BoardTask = { kind: 'empty_criteria'; criteria: OverviewCriterion[] } | { kind: 'unpriced'; count: number }
  | { kind: 'proposals'; count: number } | { kind: 'dangling'; count: number };
tasksOf(o): BoardTask[]            statusOf(o): { status: BoardStatus; tasks: BoardTask[]; label: string }
warningSentences(o): string[]      fold(s): string     capNames(names, max = 2, unit = 'rubric'): string     shorten(text, max = 40): string
semestersOf(o): string[]           semesterLabel(value: string | null): string
semesterChoices(all): { value: string | null; label: string; count: number }[]      inSemester(all, sem: string | null): RubricOverview[]
type PickFilter = 'all' | 'todo' | 'ready' | 'new'; type PickSort = 'recent' | 'name' | 'todo';
interface PickQuery { q: string; filter: PickFilter; sort: PickSort; sem: string | null }
filterCounts(all, sem): Record<PickFilter, number>      pickRubrics(all, query: PickQuery, recent: string[]): RubricOverview[]
readRecent(teacherId: string | null): string[]   pushRecent(list: string[], name: string): string[]   writeRecent(teacherId, list): void
copySources(all, targetName): RubricOverview[]   copyStats(source, target): { errors: number; criteria: number; skipped: number }
copyPreviewText(stats): string
interface ImpactLine { sessionId: string; name: string; state: RubricSessionState; text: string }
impactLines(sessions: OverviewSession[], detection: 'auto' | 'ai'): ImpactLine[]     NO_SESSION_IMPACT: string
scopeLine(sessions: OverviewSession[], detection: 'auto' | 'ai'): string
overCap(deductions: (string | null)[], max: number): number | null
// lib/error-form.ts
type Detection = 'auto' | 'ai';  interface ErrorFormState { name: string; description: string; detection: Detection; group: string }
EMPTY_ERROR_FORM · detectionOf(predicate) · formFromRule(rule) · validateErrorForm(form) · predicateOf(form) · buildNewRule(form) · buildChanges(rule, form) · isDirty(rule, form)
```

- [ ] **Step 1: Write the failing tests**

`lib/rubric-board.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { criterion, overview, session } from '@/app/teacher/rules/_components/fixtures';
import {
  MANY,
  NO_SEMESTER,
  NO_SESSION_IMPACT,
  RECENT_STORED,
  capNames,
  copyPreviewText,
  copySources,
  copyStats,
  filterCounts,
  fold,
  impactLines,
  inSemester,
  overCap,
  pickRubrics,
  pushRecent,
  readRecent,
  scopeLine,
  semesterChoices,
  semesterLabel,
  shorten,
  statusOf,
  tasksOf,
  warningSentences,
  writeRecent,
} from './rubric-board';

const todo = (name: string, over = {}) => overview({ rubricName: name, unpricedCount: 1, ...over });
const fresh = (name: string, over = {}) => overview({ rubricName: name, criteria: [criterion({ errorCount: 0 })], ...over });
const ready = (name: string, over = {}) => overview({ rubricName: name, ...over });

describe('statusOf — bảng chân trị 16 tổ hợp việc cần làm (T-RBE-UI-1)', () => {
  const combos = Array.from({ length: 16 }, (_, i) => ({ empty: !!(i & 1), unpriced: !!(i & 2), proposals: !!(i & 4), dangling: !!(i & 8) }));
  it.each(combos)('tiêu chí rỗng=$empty chưa điểm trừ=$unpriced đề xuất=$proposals mồ côi=$dangling', ({ empty, unpriced, proposals, dangling }) => {
    const criteria = [criterion({ key: 'a', errorCount: 2 }), criterion({ key: 'b', errorCount: empty ? 0 : 1 })];
    const o = overview({ criteria, unpricedCount: unpriced ? 1 : 0, proposalCount: proposals ? 3 : 0, danglingCount: dangling ? 2 : 0 });
    const n = [empty, unpriced, proposals, dangling].filter(Boolean).length;
    const s = statusOf(o);
    expect(s.tasks).toHaveLength(n);
    expect(s.status).toBe(n === 0 ? 'ready' : 'todo');
    expect(s.label).toBe(n === 0 ? 'Sẵn sàng chấm tự động' : `Còn ${n} việc`);
  });

  it('chưa có lỗi nào và chưa phải mọi tiêu chí đều không trừ điểm → "new", dù còn việc khác', () => {
    const o = overview({ criteria: [criterion({ errorCount: 0 }), criterion({ key: 'b', errorCount: 0, waiverId: 'w1' })], proposalCount: 3 });
    expect(statusOf(o)).toMatchObject({ status: 'new', label: 'Chưa có lỗi nào' });
  });

  it('mọi tiêu chí đều đã đánh dấu không trừ điểm và không có lỗi → "ready"', () => {
    const o = overview({ criteria: [criterion({ errorCount: 0, waiverId: 'w1' })] });
    expect(statusOf(o).status).toBe('ready');
  });

  it('một tiêu chí đã đánh dấu thì không tính là tiêu chí rỗng', () => {
    const o = overview({ criteria: [criterion({ key: 'a', errorCount: 1 }), criterion({ key: 'b', errorCount: 0, waiverId: 'w1' })] });
    expect(tasksOf(o)).toEqual([]);
  });

  it('tiêu chí rỗng mang đủ thông tin để cuộn tới nó', () => {
    const o = overview({ criteria: [criterion({ key: 'a', errorCount: 1 }), criterion({ key: 'b', description: 'Trình bày', errorCount: 0 })] });
    const [task] = tasksOf(o);
    expect(task).toMatchObject({ kind: 'empty_criteria' });
    expect(task.kind === 'empty_criteria' && task.criteria.map((c) => c.key)).toEqual(['b']);
  });
});

describe('warningSentences — nuôi dòng "Bảng lỗi" của màn chuẩn bị chấm', () => {
  it('sẵn sàng → không câu nào', () => {
    expect(warningSentences(ready('A'))).toEqual([]);
  });
  it('rubric mới → một câu nói bài sẽ vào "Cần bạn xem"', () => {
    expect(warningSentences(fresh('A'))).toEqual([
      'Rubric này chưa có lỗi nào — mọi bài chấm theo rubric này sẽ chuyển sang “Cần bạn xem” thay vì tự duyệt.',
    ]);
  });
  it('mỗi loại việc một câu, theo thứ tự', () => {
    const o = overview({
      criteria: [criterion({ key: 'a', errorCount: 1 }), criterion({ key: 'b', description: 'Trình bày', errorCount: 0 })],
      unpricedCount: 2,
      proposalCount: 1,
      danglingCount: 3,
    });
    expect(warningSentences(o)).toEqual([
      'Tiêu chí Trình bày chưa có lỗi nào — bài dính tiêu chí đó không tự quyết.',
      '2 lỗi chưa có điểm trừ — bài dính chúng sẽ vào nhóm cần bạn xem.',
      '1 lỗi AI đề xuất chưa xử lý — đang bị loại khỏi điểm.',
      '3 lỗi gắn tiêu chí không còn trong rubric — chuyển sang tiêu chí khác.',
    ]);
  });
});

describe('chuỗi', () => {
  it('fold bỏ dấu, đ → d, không phân biệt hoa thường', () => {
    expect(fold('Cuối KỲ — Đồ thị')).toBe('cuoi ky — do thi');
  });
  it('capNames chặn trần danh sách', () => {
    expect(capNames(['A', 'B'])).toBe('A, B');
    expect(capNames(['A', 'B', 'C', 'D'])).toBe('A, B và 2 rubric khác');
    expect(capNames(['P1', 'P2', 'P3'], 2, 'phiên')).toBe('P1, P2 và 1 phiên khác');
  });
  it('shorten cắt tên tiêu chí dài, giữ nguyên tên ngắn', () => {
    expect(shorten('Trình bày')).toBe('Trình bày');
    expect(shorten('x'.repeat(60), 10)).toBe('xxxxxxxxx…');
  });
});

describe('học kỳ (D8)', () => {
  const all = [
    ready('A', { sessions: [session({ semesterName: 'HK1 2026-2027' }), session({ id: 's2', semesterName: 'HK2 2025-2026' })] }),
    ready('B', { sessions: [session({ id: 's3', semesterName: 'HK1 2025-2026' })] }),
    ready('C'),
  ];
  it('danh sách học kỳ dựng từ phiên, mới nhất trước (năm rồi HK), "Chưa gắn học kỳ" cuối', () => {
    expect(semesterChoices(all)).toEqual([
      { value: null, label: 'Tất cả học kỳ', count: 3 },
      { value: 'HK1 2026-2027', label: 'HK1 2026-2027', count: 1 },
      { value: 'HK2 2025-2026', label: 'HK2 2025-2026', count: 1 },
      { value: 'HK1 2025-2026', label: 'HK1 2025-2026', count: 1 },
      { value: NO_SEMESTER, label: 'Chưa gắn học kỳ', count: 1 },
    ]);
  });
  it('một rubric thuộc MỌI học kỳ nó từng được dùng; chưa gắn phiên nào thì thuộc "chưa gắn"', () => {
    expect(inSemester(all, 'HK2 2025-2026').map((o) => o.rubricName)).toEqual(['A']);
    expect(inSemester(all, NO_SEMESTER).map((o) => o.rubricName)).toEqual(['C']);
    expect(inSemester(all, null)).toHaveLength(3);
  });
  it('nhãn', () => {
    expect(semesterLabel(null)).toBe('Tất cả học kỳ');
    expect(semesterLabel(NO_SEMESTER)).toBe('Chưa gắn học kỳ');
    expect(semesterLabel('HK1 2026-2027')).toBe('HK1 2026-2027');
  });
});

describe('ô chọn rubric (T-RBE-UI-1)', () => {
  const all = [
    todo('Giữa kỳ CTDL', { sessions: [session({ semesterName: 'HK1 2026-2027' })] }),
    fresh('Cuối kỳ CTDL'),
    ready('Thực hành — Hàng đợi', { sessions: [session({ id: 's2', semesterName: 'HK2 2025-2026' })] }),
    ready('Bài tập lớn — Đồ thị'),
  ];
  const q = (over = {}) => ({ q: '', filter: 'all' as const, sort: 'recent' as const, sem: null, ...over });
  const names = (list: { rubricName: string }[]) => list.map((o) => o.rubricName);

  it('ngưỡng chuyển sang ô chọn là 4', () => {
    expect(MANY).toBe(4);
  });
  it('tìm không phân biệt dấu và đ → d', () => {
    expect(names(pickRubrics(all, q({ q: 'cuoi ky' }), []))).toEqual(['Cuối kỳ CTDL']);
    expect(names(pickRubrics(all, q({ q: 'do thi' }), []))).toEqual(['Bài tập lớn — Đồ thị']);
    expect(pickRubrics(all, q({ q: 'khong co' }), [])).toEqual([]);
  });
  it('lọc theo tình trạng', () => {
    expect(names(pickRubrics(all, q({ filter: 'todo' }), []))).toEqual(['Giữa kỳ CTDL']);
    expect(names(pickRubrics(all, q({ filter: 'new' }), []))).toEqual(['Cuối kỳ CTDL']);
    expect(names(pickRubrics(all, q({ filter: 'ready' }), []))).toEqual(['Thực hành — Hàng đợi', 'Bài tập lớn — Đồ thị']);
  });
  it('hợp của học kỳ + tình trạng + từ khoá', () => {
    expect(names(pickRubrics(all, q({ sem: 'HK2 2025-2026', filter: 'ready', q: 'hang doi' }), []))).toEqual(['Thực hành — Hàng đợi']);
    expect(pickRubrics(all, q({ sem: 'HK2 2025-2026', filter: 'todo' }), [])).toEqual([]);
  });
  it('sắp "gần đây": theo lịch sử đã mở, rồi theo thứ tự lưu mới nhất của máy chủ', () => {
    expect(names(pickRubrics(all, q(), ['Bài tập lớn — Đồ thị', 'Cuối kỳ CTDL']))).toEqual([
      'Bài tập lớn — Đồ thị',
      'Cuối kỳ CTDL',
      'Giữa kỳ CTDL',
      'Thực hành — Hàng đợi',
    ]);
  });
  it('sắp A–Z theo locale vi', () => {
    expect(names(pickRubrics(all, q({ sort: 'name' }), []))).toEqual(['Bài tập lớn — Đồ thị', 'Cuối kỳ CTDL', 'Giữa kỳ CTDL', 'Thực hành — Hàng đợi']);
  });
  it('sắp "cần làm trước": todo, rồi new, rồi ready', () => {
    expect(names(pickRubrics(all, q({ sort: 'todo' }), []))).toEqual(['Giữa kỳ CTDL', 'Cuối kỳ CTDL', 'Thực hành — Hàng đợi', 'Bài tập lớn — Đồ thị']);
  });
  it('số trên các nút lọc đếm theo học kỳ đang chọn', () => {
    expect(filterCounts(all, null)).toEqual({ all: 4, todo: 1, ready: 2, new: 1 });
    expect(filterCounts(all, 'HK1 2026-2027')).toEqual({ all: 1, todo: 1, ready: 0, new: 0 });
  });
});

describe('lịch sử "gần đây" (D7)', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('pushRecent đưa lên đầu, bỏ trùng, giữ tối đa 8', () => {
    expect(pushRecent(['a', 'b', 'c'], 'b')).toEqual(['b', 'a', 'c']);
    const long = Array.from({ length: 12 }, (_, i) => `r${i}`);
    expect(pushRecent(long, 'mới')).toHaveLength(RECENT_STORED);
  });
  it('lưu theo giảng viên: hai tài khoản trên cùng máy không thấy lịch sử của nhau', () => {
    writeRecent('t1', ['x', 'y']);
    expect(readRecent('t1')).toEqual(['x', 'y']);
    expect(readRecent('t2')).toEqual([]);
    expect(readRecent(null)).toEqual([]);
  });
  it('dữ liệu hỏng thì coi như rỗng', () => {
    localStorage.setItem('rules.recent.t1', '{không phải json');
    expect(readRecent('t1')).toEqual([]);
    localStorage.setItem('rules.recent.t1', '{"a":1}');
    expect(readRecent('t1')).toEqual([]);
    localStorage.setItem('rules.recent.t1', '["ok", 5, null]');
    expect(readRecent('t1')).toEqual(['ok']);
  });
  it('trình duyệt chặn lưu trữ (chế độ riêng tư) → không ném lỗi, trả rỗng (Review Focus 3)', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(readRecent('t1')).toEqual([]);
    expect(() => writeRecent('t1', ['x'])).not.toThrow();
  });
});

describe('sao chép lỗi từ rubric khác (D3, T-RBE-UI-3)', () => {
  const source = overview({
    rubricName: 'Nguồn',
    criteria: [criterion({ key: 'a', errorCount: 3 }), criterion({ key: 'b', errorCount: 2 }), criterion({ key: 'c', errorCount: 0 }), criterion({ key: 'd', errorCount: 4 })],
  });
  const target = fresh('Đích', { criteria: [criterion({ key: 'a', errorCount: 0 }), criterion({ key: 'b', errorCount: 0 }), criterion({ key: 'c', errorCount: 0 })] });

  it('nguồn hợp lệ: rubric khác có ít nhất một lỗi', () => {
    expect(copySources([source, target, fresh('Trống')], 'Đích').map((o) => o.rubricName)).toEqual(['Nguồn']);
  });
  it('đếm lỗi sẽ chép, tiêu chí trùng khoá, và lỗi bị bỏ vì đích không có tiêu chí đó', () => {
    expect(copyStats(source, target)).toEqual({ errors: 5, criteria: 2, skipped: 4 });
  });
  it('câu xem trước', () => {
    expect(copyPreviewText({ errors: 5, criteria: 2, skipped: 4 })).toBe(
      'Sẽ sao chép 5 lỗi vào 2 tiêu chí trùng tên, giữ nguyên điểm trừ để bạn chỉnh cho kỳ này. 4 lỗi thuộc tiêu chí không có ở rubric này sẽ không được sao chép. Sau khi sao chép, hai rubric độc lập.',
    );
    expect(copyPreviewText({ errors: 1, criteria: 1, skipped: 0 })).not.toMatch(/không được sao chép/);
  });
});

describe('"Lưu thì áp vào đâu" (spec 1.1, không gọi API)', () => {
  const sessions = [
    session({ id: 'a', name: 'Ca sáng', state: 'grading', resultCount: 38 }),
    session({ id: 'b', name: 'Ca chiều', state: 'finalized', resultCount: 41 }),
    session({ id: 'c', name: 'Ca tối', state: 'not_started', resultCount: 0 }),
  ];
  it('chưa gắn phiên nào', () => {
    expect(impactLines([], 'auto')).toEqual([]);
    expect(NO_SESSION_IMPACT).toMatch(/chưa gắn phiên thi nào/);
  });
  it('Tự động: tính lại ngay phiên đang chấm; phiên đã chốt giữ nguyên; phiên chưa chấm thì dùng khi bắt đầu', () => {
    expect(impactLines(sessions, 'auto').map((l) => l.text)).toEqual([
      'Tính lại ngay các bài dính lỗi này (trong 38 bài).',
      'Giữ nguyên điểm — bảng điểm trừ đã được ghim lúc chốt.',
      'Chưa chấm bài nào — lỗi sẽ được dùng khi bắt đầu chấm.',
    ]);
  });
  it('AI đọc bài: không tính lại bài đã chấm (T-FAIR-1)', () => {
    expect(impactLines(sessions, 'ai')[0].text).toBe('AI xét lỗi này từ các bài chưa chấm; bài đã chấm không tính lại.');
  });
  it('scopeLine gộp theo phiên đang chấm / đã chốt và chặn trần tên phiên', () => {
    expect(scopeLine(sessions, 'auto')).toBe('Ca sáng (đang chấm): tính lại ngay các bài dính lỗi; Ca chiều (đã chốt) giữ nguyên.');
    expect(scopeLine(sessions, 'ai')).toBe('Ca sáng (đang chấm): AI xét theo mô tả mới, từ các bài chưa chấm; Ca chiều (đã chốt) giữ nguyên.');
    expect(scopeLine([], 'auto')).toBe('chưa có phiên đang chấm.');
    const many = ['P1', 'P2', 'P3', 'P4'].map((name, i) => session({ id: `m${i}`, name, state: 'grading' }));
    expect(scopeLine(many, 'auto')).toMatch(/^P1, P2 và 2 phiên khác \(đang chấm\)/);
  });
});

describe('overCap — lời nhắc khi cộng các điểm trừ vượt điểm tối đa', () => {
  it('trả tổng khi vượt, null khi không', () => {
    expect(overCap(['2.00', '1.50', '1.00'], 4)).toBe(4.5);
    expect(overCap(['2.00'], 4)).toBeNull();
    expect(overCap(['2.00', '2.00'], 4)).toBeNull();
    expect(overCap(['2.00', null, '3.00'], 4)).toBe(5);
    expect(overCap([], 4)).toBeNull();
  });
});
```

`lib/error-form.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { libraryRule } from '@/app/teacher/rules/_components/fixtures';
import {
  EMPTY_ERROR_FORM,
  buildChanges,
  buildNewRule,
  detectionOf,
  formFromRule,
  isDirty,
  predicateOf,
  validateErrorForm,
} from './error-form';

const legacy = libraryRule({
  revision: { id: 'v1', revision: 1, name: 'Gọi sort', description: 'Dùng sort có sẵn', predicate: { kind: 'calls_function', name: 'sort' } },
  checkedBy: 'model',
});
const ai = libraryRule({ revision: { id: 'v1', revision: 1, name: 'Đặt tên', description: 'Tên biến khó hiểu', predicate: null }, checkedBy: 'model' });

describe('detectionOf (D9)', () => {
  it('nhóm test → Tự động, mang tên nhóm', () => {
    expect(detectionOf({ kind: 'test_group_failed', group: 'bien' })).toEqual({ detection: 'auto', group: 'bien', legacyNote: null });
  });
  it('không có điều kiện → AI đọc bài, không ghi chú', () => {
    expect(detectionOf(null)).toEqual({ detection: 'ai', group: '', legacyNote: null });
  });
  it('ba mẫu cũ → AI đọc bài kèm một dòng ghi chú điều kiện', () => {
    expect(detectionOf({ kind: 'calls_function', name: 'sort' })).toMatchObject({ detection: 'ai', legacyNote: 'gọi hàm “sort”' });
    expect(detectionOf({ kind: 'complexity_exceeds_required' })).toMatchObject({ detection: 'ai', legacyNote: 'độ phức tạp vượt yêu cầu của đề' });
    expect(detectionOf({ kind: 'no_recursion' }).legacyNote).toBe('không dùng đệ quy');
    expect(detectionOf({ kind: 'no_recursion', functionName: 'dfs' }).legacyNote).toBe('không dùng đệ quy trong hàm “dfs”');
  });
});

describe('validateErrorForm', () => {
  const ok = { ...EMPTY_ERROR_FORM, name: 'Sai ca biên', description: 'Mô tả' };
  it('hợp lệ', () => {
    expect(validateErrorForm(ok)).toEqual({});
    expect(validateErrorForm({ ...ok, detection: 'auto', group: 'bien' })).toEqual({});
  });
  it('tên và mô tả bắt buộc, có trần độ dài', () => {
    expect(validateErrorForm(EMPTY_ERROR_FORM)).toEqual({
      name: 'Đặt tên cho lỗi này.',
      description: 'Mô tả lỗi để giảng viên khác và AI hiểu cùng một nghĩa.',
    });
    expect(validateErrorForm({ ...ok, name: 'x'.repeat(201) }).name).toBe('Tên tối đa 200 ký tự.');
    expect(validateErrorForm({ ...ok, description: 'x'.repeat(2001) }).description).toBe('Mô tả tối đa 2000 ký tự.');
  });
  it('Tự động đòi tên nhóm test; AI đọc bài thì bỏ qua ô nhóm', () => {
    expect(validateErrorForm({ ...ok, detection: 'auto', group: '  ' }).group).toBe('Nhập tên nhóm test.');
    expect(validateErrorForm({ ...ok, detection: 'auto', group: 'g'.repeat(101) }).group).toBe('Tên nhóm tối đa 100 ký tự.');
    expect(validateErrorForm({ ...ok, detection: 'ai', group: '' })).toEqual({});
  });
});

describe('predicateOf / buildNewRule', () => {
  it('Tự động → test_group_failed; AI đọc bài → null; tên và mô tả được cắt khoảng trắng', () => {
    expect(predicateOf({ ...EMPTY_ERROR_FORM, detection: 'auto', group: ' bien ' })).toEqual({ kind: 'test_group_failed', group: 'bien' });
    expect(predicateOf({ ...EMPTY_ERROR_FORM, detection: 'ai', group: 'bien' })).toBeNull();
    expect(buildNewRule({ name: ' Sai ca biên ', description: ' mô tả ', detection: 'auto', group: 'bien' })).toEqual({
      name: 'Sai ca biên',
      description: 'mô tả',
      predicate: { kind: 'test_group_failed', group: 'bien' },
    });
  });
});

describe('buildChanges — chỉ gửi điều ĐÃ ĐỔI (Review Focus 6)', () => {
  it('không đổi gì → rỗng, không bẩn', () => {
    const form = formFromRule(ai);
    expect(buildChanges(ai, form)).toEqual({});
    expect(isDirty(ai, form)).toBe(false);
  });
  it('đổi tên → chỉ name', () => {
    expect(buildChanges(ai, { ...formFromRule(ai), name: 'Tên mới ' })).toEqual({ name: 'Tên mới' });
  });
  it('lỗi cũ có điều kiện "gọi hàm": chỉ đổi tên thì KHÔNG gửi predicate (giữ nguyên điều kiện)', () => {
    const form = { ...formFromRule(legacy), name: 'Gọi sort có sẵn' };
    expect(buildChanges(legacy, form)).toEqual({ name: 'Gọi sort có sẵn' });
  });
  it('lỗi cũ: chọn Tự động rồi chọn lại AI đọc bài thì vẫn là "không đổi điều kiện"', () => {
    const back = { ...formFromRule(legacy), detection: 'ai' as const, group: 'bien' };
    expect(buildChanges(legacy, back)).toEqual({});
  });
  it('AI → Tự động thay điều kiện bằng test_group_failed; Tự động → AI xoá điều kiện (null)', () => {
    expect(buildChanges(ai, { ...formFromRule(ai), detection: 'auto', group: 'bien' })).toEqual({ predicate: { kind: 'test_group_failed', group: 'bien' } });
    const auto = libraryRule();
    expect(buildChanges(auto, { ...formFromRule(auto), detection: 'ai' })).toEqual({ predicate: null });
  });
  it('đổi nhóm test của lỗi Tự động', () => {
    const auto = libraryRule();
    expect(buildChanges(auto, { ...formFromRule(auto), group: 'co_ban' })).toEqual({ predicate: { kind: 'test_group_failed', group: 'co_ban' } });
    expect(isDirty(auto, { ...formFromRule(auto), group: 'co_ban' })).toBe(true);
  });
});
```

Run `pnpm exec vitest run src/lib/rubric-board.test.ts src/lib/error-form.test.ts` → Expected FAIL (modules do not exist).

- [ ] **Step 2: Implement `lib/rubric-board.ts`**

```ts
import type { OverviewCriterion, OverviewSession, RubricOverview, RubricSessionState } from './api/rubric-errors';
import { formatVnPoints } from './format';

/**
 * Logic thuần của trang Bảng lỗi (spec mục 5.2, 5.6): trạng thái và việc cần làm của một rubric, ô chọn rubric
 * khi có nhiều rubric, học kỳ, xem trước sao chép và câu "Lưu thì áp vào đâu". Không React, không mạng — để test
 * được từng luật (T-RBE-UI-1). Chỗ DUY NHẤT chạm `localStorage` của trang cũng nằm ở đây, luôn trong try/catch.
 */

/** Quá ngưỡng này, hàng thẻ chuyển thành ô "Rubric đang mở" có tìm kiếm. */
export const MANY = 4;
export const RECENT_SHOWN = 3;
export const RECENT_STORED = 8;
/** Giá trị bộ lọc cho rubric chưa gắn phiên thi nào (không có học kỳ). */
export const NO_SEMESTER = '__none';

// ── trạng thái và việc cần làm ───────────────────────────────────────────────────────────────

export type BoardStatus = 'new' | 'todo' | 'ready';
export type BoardTask =
  | { kind: 'empty_criteria'; criteria: OverviewCriterion[] }
  | { kind: 'unpriced'; count: number }
  | { kind: 'proposals'; count: number }
  | { kind: 'dangling'; count: number };

/** Mỗi LOẠI việc có mặt đếm một (không đếm theo số lỗi) — đúng "Còn N việc" ở mock-up. */
export function tasksOf(o: RubricOverview): BoardTask[] {
  const tasks: BoardTask[] = [];
  const empty = o.criteria.filter((c) => c.errorCount === 0 && c.waiverId === null);
  if (empty.length > 0) tasks.push({ kind: 'empty_criteria', criteria: empty });
  if (o.unpricedCount > 0) tasks.push({ kind: 'unpriced', count: o.unpricedCount });
  if (o.proposalCount > 0) tasks.push({ kind: 'proposals', count: o.proposalCount });
  if (o.danglingCount > 0) tasks.push({ kind: 'dangling', count: o.danglingCount });
  return tasks;
}

/**
 * `new`: chưa có lỗi nào (và chưa phải mọi tiêu chí đều "không trừ điểm"); `todo`: còn việc; `ready`: hết việc.
 * Đúng với T-FLOOR-6: tiêu chí không có lỗi và không được đánh dấu thì bài chấm theo rubric không tự quyết.
 */
export function statusOf(o: RubricOverview): { status: BoardStatus; tasks: BoardTask[]; label: string } {
  const tasks = tasksOf(o);
  const allWaived = o.criteria.every((c) => c.waiverId !== null);
  if (o.errorCount === 0 && !allWaived) return { status: 'new', tasks, label: 'Chưa có lỗi nào' };
  if (tasks.length > 0) return { status: 'todo', tasks, label: `Còn ${tasks.length} việc` };
  return { status: 'ready', tasks, label: 'Sẵn sàng chấm tự động' };
}

function taskSentence(task: BoardTask): string {
  switch (task.kind) {
    case 'empty_criteria':
      return `Tiêu chí ${capNames(task.criteria.map((c) => shorten(c.description)), 3, 'tiêu chí')} chưa có lỗi nào — bài dính tiêu chí đó không tự quyết.`;
    case 'unpriced':
      return `${task.count} lỗi chưa có điểm trừ — bài dính chúng sẽ vào nhóm cần bạn xem.`;
    case 'proposals':
      return `${task.count} lỗi AI đề xuất chưa xử lý — đang bị loại khỏi điểm.`;
    case 'dangling':
      return `${task.count} lỗi gắn tiêu chí không còn trong rubric — chuyển sang tiêu chí khác.`;
  }
}

/** Các câu cảnh báo cho màn chuẩn bị chấm (`preflight`); rỗng = sẵn sàng. */
export function warningSentences(o: RubricOverview): string[] {
  const { status, tasks } = statusOf(o);
  if (status === 'ready') return [];
  if (status === 'new') {
    return ['Rubric này chưa có lỗi nào — mọi bài chấm theo rubric này sẽ chuyển sang “Cần bạn xem” thay vì tự duyệt.'];
  }
  return tasks.map(taskSentence);
}

// ── chuỗi ────────────────────────────────────────────────────────────────────────────────────

/** Bỏ dấu tiếng Việt (kể cả đ), chữ thường — để tìm "cuoi ky" ra "Cuối kỳ". */
export const fold = (s: string): string =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

/** "A, B và 8 rubric khác" — mọi chỗ liệt kê rubric / phiên đều chặn trần (D7). */
export function capNames(names: string[], max = 2, unit = 'rubric'): string {
  return names.length <= max ? names.join(', ') : `${names.slice(0, max).join(', ')} và ${names.length - max} ${unit} khác`;
}

export function shorten(text: string, max = 40): string {
  const t = text.trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

// ── học kỳ (D8) ──────────────────────────────────────────────────────────────────────────────

export const semestersOf = (o: RubricOverview): string[] => (o.semesters.length > 0 ? o.semesters : [NO_SEMESTER]);

export function semesterLabel(value: string | null): string {
  if (value === null) return 'Tất cả học kỳ';
  return value === NO_SEMESTER ? 'Chưa gắn học kỳ' : value;
}

/**
 * Học kỳ là chuỗi giảng viên gõ ("HK1 2026-2027") nên không có ngày để sắp. Xếp theo năm đầu tiên trong chuỗi rồi
 * theo số HK: đủ để "mới nhất trước" đúng với cách đặt tên thông thường; chuỗi lạ rơi về cuối theo thứ tự chữ.
 */
function semesterRank(label: string): number {
  const year = /(\d{4})/.exec(label);
  const term = /HK\s*(\d)/i.exec(label);
  return year ? Number(year[1]) * 10 + (term ? Number(term[1]) : 0) : 0;
}

export function semesterChoices(all: RubricOverview[]): { value: string | null; label: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const o of all) for (const s of semestersOf(o)) counts.set(s, (counts.get(s) ?? 0) + 1);
  const named = [...counts.keys()]
    .filter((s) => s !== NO_SEMESTER)
    .sort((a, b) => semesterRank(b) - semesterRank(a) || b.localeCompare(a));
  const choices: { value: string | null; label: string; count: number }[] = [
    { value: null, label: semesterLabel(null), count: all.length },
    ...named.map((value) => ({ value, label: value, count: counts.get(value)! })),
  ];
  if (counts.has(NO_SEMESTER)) choices.push({ value: NO_SEMESTER, label: semesterLabel(NO_SEMESTER), count: counts.get(NO_SEMESTER)! });
  return choices;
}

/** Lọc theo học kỳ chỉ THU HẸP tầm nhìn — không bao giờ chặn thao tác (`CLAUDE.md` §1.2). */
export const inSemester = (all: RubricOverview[], sem: string | null): RubricOverview[] =>
  sem === null ? all : all.filter((o) => semestersOf(o).includes(sem));

// ── ô chọn rubric ────────────────────────────────────────────────────────────────────────────

export type PickFilter = 'all' | 'todo' | 'ready' | 'new';
export type PickSort = 'recent' | 'name' | 'todo';
export interface PickQuery {
  q: string;
  filter: PickFilter;
  sort: PickSort;
  sem: string | null;
}

export function filterCounts(all: RubricOverview[], sem: string | null): Record<PickFilter, number> {
  const base = inSemester(all, sem);
  const counts: Record<PickFilter, number> = { all: base.length, todo: 0, ready: 0, new: 0 };
  for (const o of base) counts[statusOf(o).status]++;
  return counts;
}

/**
 * "Gần đây" = rubric đã mở gần đây trước (theo lịch sử), rồi theo thứ tự máy chủ trả (lưu mới nhất trước) —
 * không sắp theo tên khi chưa có lịch sử, vì rubric vừa lưu mới là cái giảng viên đang tìm.
 */
export function pickRubrics(all: RubricOverview[], query: PickQuery, recent: string[]): RubricOverview[] {
  const needle = fold(query.q.trim());
  const rows = inSemester(all, query.sem)
    .map((o, index) => ({ o, index, status: statusOf(o).status }))
    .filter(({ o, status }) => (query.filter === 'all' || status === query.filter) && fold(o.rubricName).includes(needle));
  const rank = (name: string) => {
    const i = recent.indexOf(name);
    return i < 0 ? Number.MAX_SAFE_INTEGER : i;
  };
  const order: Record<BoardStatus, number> = { todo: 0, new: 1, ready: 2 };
  type Row = (typeof rows)[number];
  const compare: Record<PickSort, (a: Row, b: Row) => number> = {
    name: (a, b) => a.o.rubricName.localeCompare(b.o.rubricName, 'vi'),
    todo: (a, b) => order[a.status] - order[b.status] || rank(a.o.rubricName) - rank(b.o.rubricName) || a.index - b.index,
    recent: (a, b) => rank(a.o.rubricName) - rank(b.o.rubricName) || a.index - b.index,
  };
  return rows.sort(compare[query.sort]).map((r) => r.o);
}

// ── lịch sử "gần đây": localStorage, luôn trong try/catch ──────────────────────────────────────

const recentKey = (teacherId: string) => `rules.recent.${teacherId}`;

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readRecent(teacherId: string | null): string[] {
  if (!teacherId) return [];
  try {
    const raw = storage()?.getItem(recentKey(teacherId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string').slice(0, RECENT_STORED) : [];
  } catch {
    return [];
  }
}

export const pushRecent = (list: string[], name: string): string[] => [name, ...list.filter((x) => x !== name)].slice(0, RECENT_STORED);

export function writeRecent(teacherId: string | null, list: string[]): void {
  if (!teacherId) return;
  try {
    storage()?.setItem(recentKey(teacherId), JSON.stringify(list));
  } catch {
    // Chế độ riêng tư / hết dung lượng: bỏ qua. Lịch sử chỉ là tiện ích, trang vẫn chạy đúng (Review Focus 3).
  }
}

// ── sao chép lỗi từ rubric khác ──────────────────────────────────────────────────────────────

/** Nguồn hợp lệ: rubric khác, có ít nhất một lỗi. */
export const copySources = (all: RubricOverview[], target: string): RubricOverview[] =>
  all.filter((o) => o.rubricName !== target && o.errorCount > 0);

/** Xem trước theo dữ liệu tổng quan: ghép theo KHOÁ tiêu chí, đúng như máy chủ sẽ làm. */
export function copyStats(source: RubricOverview, target: RubricOverview): { errors: number; criteria: number; skipped: number } {
  const targetKeys = new Set(target.criteria.map((c) => c.key));
  let errors = 0;
  let criteria = 0;
  let skipped = 0;
  for (const c of source.criteria) {
    if (targetKeys.has(c.key)) {
      if (c.errorCount > 0) {
        errors += c.errorCount;
        criteria++;
      }
    } else {
      skipped += c.errorCount;
    }
  }
  return { errors, criteria, skipped };
}

export function copyPreviewText(s: { errors: number; criteria: number; skipped: number }): string {
  return (
    `Sẽ sao chép ${s.errors} lỗi vào ${s.criteria} tiêu chí trùng tên, giữ nguyên điểm trừ để bạn chỉnh cho kỳ này.` +
    (s.skipped > 0 ? ` ${s.skipped} lỗi thuộc tiêu chí không có ở rubric này sẽ không được sao chép.` : '') +
    ' Sau khi sao chép, hai rubric độc lập.'
  );
}

// ── "Lưu thì áp vào đâu" ─────────────────────────────────────────────────────────────────────

export const NO_SESSION_IMPACT =
  'Rubric này chưa gắn phiên thi nào nên lỗi chưa ảnh hưởng bài nào. Khi gắn vào phiên thi, lỗi sẽ được dùng để chấm.';

export interface ImpactLine {
  sessionId: string;
  name: string;
  state: RubricSessionState;
  text: string;
}

/** Chữ dựng từ phiên của rubric, không gọi API: máy chủ không có "bậc áp luật" nữa (spec 1.1). */
export function impactLines(sessions: OverviewSession[], detection: 'auto' | 'ai'): ImpactLine[] {
  return sessions.map((s) => ({
    sessionId: s.id,
    name: s.name,
    state: s.state,
    text:
      s.state === 'finalized'
        ? 'Giữ nguyên điểm — bảng điểm trừ đã được ghim lúc chốt.'
        : s.state === 'not_started'
          ? 'Chưa chấm bài nào — lỗi sẽ được dùng khi bắt đầu chấm.'
          : detection === 'auto'
            ? `Tính lại ngay các bài dính lỗi này (trong ${s.resultCount} bài).`
            : 'AI xét lỗi này từ các bài chưa chấm; bài đã chấm không tính lại.',
  }));
}

/** Hậu quả của một lần sửa lên một nhóm phiên (ngăn kéo "Sửa lỗi"). */
export function scopeLine(sessions: OverviewSession[], detection: 'auto' | 'ai'): string {
  const open = sessions.filter((s) => s.state === 'grading');
  const done = sessions.filter((s) => s.state === 'finalized');
  const what =
    open.length > 0
      ? `${capNames(open.map((s) => s.name), 2, 'phiên')} (đang chấm): ${
          detection === 'auto' ? 'tính lại ngay các bài dính lỗi' : 'AI xét theo mô tả mới, từ các bài chưa chấm'
        }`
      : 'chưa có phiên đang chấm';
  return `${what}${done.length > 0 ? `; ${capNames(done.map((s) => s.name), 2, 'phiên')} (đã chốt) giữ nguyên` : ''}.`;
}

/** Tổng các điểm trừ nếu vượt điểm tối đa của tiêu chí (bài chỉ bị trừ tới mức tối đa), không thì null. */
export function overCap(deductions: (string | null)[], max: number): number | null {
  const hundredths = deductions.reduce((sum, d) => sum + (d === null ? 0 : Math.round(Number(d) * 100)), 0);
  return hundredths > Math.round(max * 100) ? hundredths / 100 : null;
}

/** Tổng điểm hiện "10,0 điểm" — dùng chung cho ô chọn và thanh thông tin rubric. */
export const pointsText = (value: number): string => `${formatVnPoints(value)} điểm`;
```

- [ ] **Step 3: Implement `lib/error-form.ts`**

```ts
import type { NewErrorInput } from './api/rubric-errors';
import type { ErrorChanges, RulePredicate } from './api/rules';

/**
 * Logic thuần của form lỗi (ngăn kéo "Thêm lỗi" và "Sửa lỗi", spec mục 5.4–5.5, D9). Giao diện chỉ có HAI cách
 * phát hiện: Tự động (nhóm test trượt) và AI đọc bài (không có điều kiện). Ba mẫu điều kiện cũ vẫn chạy ở máy chủ
 * và hiện như "AI đọc bài" kèm ghi chú — form KHÔNG BAO GIỜ gửi `predicate` nếu giảng viên không đổi cách phát hiện,
 * để sửa tên một lỗi cũ không âm thầm xoá điều kiện của nó (Review Focus 6).
 */

export type Detection = 'auto' | 'ai';

export interface ErrorFormState {
  name: string;
  description: string;
  detection: Detection;
  /** Tên nhóm test; chỉ có nghĩa khi `detection === 'auto'`. */
  group: string;
}

export const EMPTY_ERROR_FORM: ErrorFormState = { name: '', description: '', detection: 'ai', group: '' };

const NAME_MAX = 200;
const DESCRIPTION_MAX = 2000;
const GROUP_MAX = 100;

export function detectionOf(predicate: RulePredicate | null): { detection: Detection; group: string; legacyNote: string | null } {
  if (predicate === null) return { detection: 'ai', group: '', legacyNote: null };
  switch (predicate.kind) {
    case 'test_group_failed':
      return { detection: 'auto', group: predicate.group, legacyNote: null };
    case 'calls_function':
      return { detection: 'ai', group: '', legacyNote: `gọi hàm “${predicate.name}”` };
    case 'complexity_exceeds_required':
      return { detection: 'ai', group: '', legacyNote: 'độ phức tạp vượt yêu cầu của đề' };
    case 'no_recursion':
      return {
        detection: 'ai',
        group: '',
        legacyNote: predicate.functionName ? `không dùng đệ quy trong hàm “${predicate.functionName}”` : 'không dùng đệ quy',
      };
  }
}

type RuleLike = { revision: { name: string; description: string; predicate: RulePredicate | null } };

export function formFromRule(rule: RuleLike): ErrorFormState {
  const d = detectionOf(rule.revision.predicate);
  return { name: rule.revision.name, description: rule.revision.description, detection: d.detection, group: d.group };
}

export interface ErrorFormErrors {
  name?: string;
  description?: string;
  group?: string;
}

export function validateErrorForm(form: ErrorFormState): ErrorFormErrors {
  const errors: ErrorFormErrors = {};
  const name = form.name.trim();
  if (name === '') errors.name = 'Đặt tên cho lỗi này.';
  else if (name.length > NAME_MAX) errors.name = `Tên tối đa ${NAME_MAX} ký tự.`;
  const description = form.description.trim();
  if (description === '') errors.description = 'Mô tả lỗi để giảng viên khác và AI hiểu cùng một nghĩa.';
  else if (description.length > DESCRIPTION_MAX) errors.description = `Mô tả tối đa ${DESCRIPTION_MAX} ký tự.`;
  if (form.detection === 'auto') {
    const group = form.group.trim();
    if (group === '') errors.group = 'Nhập tên nhóm test.';
    else if (group.length > GROUP_MAX) errors.group = `Tên nhóm tối đa ${GROUP_MAX} ký tự.`;
  }
  return errors;
}

export function predicateOf(form: ErrorFormState): RulePredicate | null {
  return form.detection === 'auto' ? { kind: 'test_group_failed', group: form.group.trim() } : null;
}

/** Lỗi MỚI. `ruleKey` do máy chủ sinh từ tên — form không bao giờ gửi nó (spec 4.2). */
export function buildNewRule(form: ErrorFormState): NewErrorInput {
  return { name: form.name.trim(), description: form.description.trim(), predicate: predicateOf(form) };
}

/**
 * Chỉ những gì ĐÃ ĐỔI so với lỗi gốc. `predicate` chỉ có mặt khi cách phát hiện đổi (auto ⇄ ai) hoặc nhóm test
 * của lỗi Tự động đổi; lỗi cũ mang điều kiện lạ mà vẫn để "AI đọc bài" thì không gửi `predicate`.
 */
export function buildChanges(rule: RuleLike, form: ErrorFormState): ErrorChanges {
  const orig = formFromRule(rule);
  const changes: ErrorChanges = {};
  if (form.name.trim() !== orig.name) changes.name = form.name.trim();
  if (form.description.trim() !== orig.description) changes.description = form.description.trim();
  const detectionChanged = form.detection !== orig.detection;
  const groupChanged = form.detection === 'auto' && form.group.trim() !== orig.group;
  if (detectionChanged || groupChanged) changes.predicate = predicateOf(form);
  return changes;
}

export const isDirty = (rule: RuleLike, form: ErrorFormState): boolean => Object.keys(buildChanges(rule, form)).length > 0;
```

- [ ] **Step 4: Run, lint, commit**

```powershell
pnpm exec vitest run src/lib/rubric-board.test.ts src/lib/error-form.test.ts
pnpm exec eslint src/lib/rubric-board.ts src/lib/error-form.ts
```
Expected: PASS and clean. (`tsc` over the whole app is still red in the old tree until Task B3; to check just these two files, `pnpm exec tsc --noEmit 2>&1 | Select-String "rubric-board|error-form"` must print nothing.)

```bash
git add apps/web/src/lib/rubric-board.ts apps/web/src/lib/rubric-board.test.ts apps/web/src/lib/error-form.ts apps/web/src/lib/error-form.test.ts
git commit -m "feat(web): pure board logic (status, picker, semesters, copy preview) and error form"
```

---

## Task B3: Cutover — consumers off the old shape, old page tree removed, shells in place

`apps/web` type-checks again at the end of this task. It needs B1 (new API/hooks/fixtures) and B2 (`warningSentences` is used by `preflight`).

**Files:**
- Modify: `lib/preflight.ts`, `lib/preflight.test.ts`, `app/teacher/grading/_components/PreparePanel.tsx`, `PreparePanel.test.tsx`
- Rewrite: `app/teacher/rules/page.tsx` (shell), `app/teacher/rules/new/page.tsx`, `app/teacher/rules/[ruleId]/page.tsx`, and their two `page.test.tsx`
- Delete: see File Structure.

- [ ] **Step 1: `preflight` and `PreparePanel` onto the per-rubric board**

`lib/preflight.ts` — three edits.

(1) Replace the two imports `import type { Rule } from './api/rules';` and keep `formatVnPoints`:

```ts
import type { Rubric } from './api/grading';
import type { RubricOverview } from './api/rubric-errors';
import { formatVnPoints } from './format';
import { warningSentences } from './rubric-board';
import { rulesHref } from './rules-links';
```

(2) In `PreflightInput` replace the `rules` and `waivedKeys` members with:

```ts
  /** Tổng quan Bảng lỗi của RUBRIC ĐÃ GHIM cho phiên (đã gồm số lỗi chưa có điểm trừ và các tiêu chí đã đánh dấu không trừ điểm). */
  board: RubricOverview | undefined;
```
and update the header comment ("cảnh báo = … lỗi chưa có điểm trừ, tiêu chí chưa có lỗi").

(3) Replace the whole `// Bảng lỗi — cảnh báo, không chặn` block (from `const unpriced = …` through the closing `}` of the `else` that pushes the "ok" row) with:

```ts
  // Bảng lỗi của rubric đã ghim — cảnh báo, không chặn
  if (!input.hasRubricId) {
    rows.push({ key: 'rules', label: 'Bảng lỗi', status: 'warn', text: 'Chưa có rubric nên chưa kiểm tra được Bảng lỗi. Không chặn việc bắt đầu.' });
  } else if (!input.board) {
    rows.push({ key: 'rules', label: 'Bảng lỗi', status: 'warn', text: 'Đang đọc Bảng lỗi của rubric này… Không chặn việc bắt đầu.' });
  } else {
    const warnings = warningSentences(input.board);
    if (warnings.length > 0) {
      rows.push({
        key: 'rules',
        label: 'Bảng lỗi',
        status: 'warn',
        text: `${warnings.join(' ')} Không chặn việc bắt đầu.`,
        link: { href: rulesHref(input.board.rubricName), label: 'Mở Bảng lỗi' },
      });
    } else {
      rows.push({ key: 'rules', label: 'Bảng lỗi', status: 'ok', text: 'Mọi lỗi đã có điểm trừ và mọi tiêu chí đã có lỗi.' });
    }
  }
```
(`warningSentences` and `rulesHref` come from B2 and B1, both already done at this point.)

`PreparePanel.tsx` — four edits:
1. `import { useRules, useWaivers } from '@/hooks/useRules';` → `import { useRubricOverview } from '@/hooks/useRubricErrors';`
2. `const rules = useRules();` → `const overviews = useRubricOverview();`
3. `const waivers = useWaivers(rubric?.id);` → `const board = rubric ? overviews.data?.find((o) => o.rubricName === rubric.name) : undefined;`
4. In the `preflightOf({…})` call replace the two lines `rules: rules.data ?? [],` and `waivedKeys: (waivers.data ?? []).map((w) => w.criterionKey),` with `board,`.

Test updates:

`lib/preflight.test.ts` — replace the imports/`base` and the whole `describe('rules table …')` block:

```ts
import { describe, expect, it } from 'vitest';
import { preflightOf, type PreflightInput } from './preflight';
import { criterion, overview } from '@/app/teacher/rules/_components/fixtures';
import type { Rubric } from './api/grading';
```
and in `base`: remove `rules: [...]` and `waivedKeys: []`, add

```ts
  board: overview({
    rubricName: 'CTDL',
    criteria: [
      criterion({ key: 'tinh_dung', description: 'Tính đúng', maxPoints: 6, errorCount: 1 }),
      criterion({ key: 'trinh_bay', description: 'Trình bày', maxPoints: 4, errorCount: 1 }),
    ],
  }),
```
Rules block:

```ts
  describe('Bảng lỗi của rubric đã ghim — cảnh báo, không bao giờ chặn', () => {
    const board = (over: Parameters<typeof overview>[0]) => overview({ rubricName: 'CTDL', ...over });

    it('ok khi mọi lỗi có điểm trừ và mọi tiêu chí có lỗi', () => {
      expect(row(base(), 'rules').status).toBe('ok');
    });
    it('đếm lỗi chưa có điểm trừ và nói bài dính chúng sẽ cần giảng viên', () => {
      const input = base({ board: board({ unpricedCount: 2 }) });
      expect(row(input, 'rules')).toMatchObject({ status: 'warn' });
      expect(row(input, 'rules').text).toMatch(/2 lỗi chưa có điểm trừ/);
      expect(preflightOf(input).canStart).toBe(true);
    });
    it('gọi tên tiêu chí chưa có lỗi, và dẫn thẳng tới đúng rubric', () => {
      const input = base({
        board: board({ criteria: [criterion({ key: 'tinh_dung', description: 'Tính đúng', errorCount: 1 }), criterion({ key: 'trinh_bay', description: 'Trình bày', errorCount: 0 })] }),
      });
      expect(row(input, 'rules').text).toMatch(/Trình bày chưa có lỗi nào/);
      expect(row(input, 'rules').link).toEqual({ href: '/teacher/rules?rubric=CTDL', label: 'Mở Bảng lỗi' });
    });
    it('tiêu chí đã đánh dấu không trừ điểm thì không bị nhắc', () => {
      const input = base({
        board: board({ criteria: [criterion({ key: 'tinh_dung', errorCount: 1 }), criterion({ key: 'trinh_bay', description: 'Trình bày', errorCount: 0, waiverId: 'w1' })] }),
      });
      expect(row(input, 'rules').status).toBe('ok');
    });
    it('rubric chưa có lỗi nào: nói bài sẽ chuyển sang "Cần bạn xem"', () => {
      const input = base({ board: board({ criteria: [criterion({ errorCount: 0 })] }) });
      expect(row(input, 'rules').text).toMatch(/chưa có lỗi nào/);
      expect(row(input, 'rules').text).toMatch(/Cần bạn xem/);
    });
    it('chưa đọc xong Bảng lỗi: cảnh báo "đang đọc", không chặn', () => {
      const input = base({ board: undefined });
      expect(row(input, 'rules')).toMatchObject({ status: 'warn' });
      expect(row(input, 'rules').text).toMatch(/Đang đọc Bảng lỗi/);
      expect(preflightOf(input).canStart).toBe(true);
    });
  });
```

`PreparePanel.test.tsx`: (a) replace the fixture import with `import { criterion, overview } from '@/app/teacher/rules/_components/fixtures';`; (b) in `vi.hoisted` replace `rules: …` and `waivers: …` lines with `overview: { data: [] as unknown[] },`; (c) replace `vi.mock('@/hooks/useRules', …)` with `vi.mock('@/hooks/useRubricErrors', () => ({ useRubricOverview: () => h.overview }));`; (d) in `beforeEach` replace the `h.rules = …` and `h.waivers = …` lines with

```ts
  h.overview = { data: [overview({ rubricName: 'CTDL', criteria: [criterion({ key: 'tinh_dung', description: 'Tính đúng', maxPoints: 10, errorCount: 1 })] })] };
```
(e) replace the test `'warnings (unpriced rules, criteria without rules) do NOT block …'` with:

```ts
  it('cảnh báo (lỗi chưa có điểm trừ, tiêu chí chưa có lỗi) KHÔNG chặn — chỉ nói trước khi bắt đầu', () => {
    h.overview = {
      data: [overview({ rubricName: 'CTDL', unpricedCount: 1, errorCount: 1, criteria: [criterion({ key: 'tinh_dung', description: 'Tính đúng', maxPoints: 10, errorCount: 0 })] })],
    };
    renderPanel();
    expect(startButton()).toBeEnabled();
    expect(screen.getByText(/1 lỗi chưa có điểm trừ/)).toBeInTheDocument();
    expect(screen.getByText(/Tính đúng chưa có lỗi nào/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Mở Bảng lỗi' })).toHaveAttribute('href', '/teacher/rules?rubric=CTDL');
  });
```

- [ ] **Step 2: Redirect tests (T-RBE-UI-9, D11) — write them first**

Redirect tests — `app/teacher/rules/new/page.test.tsx` and `app/teacher/rules/[ruleId]/page.test.tsx` (overwrite both old files):

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';

const redirect = vi.fn();
vi.mock('next/navigation', () => ({ redirect: (...args: unknown[]) => redirect(...args) }));

import NewRulePage from './page';

describe('/teacher/rules/new (T-RBE-UI-9, D11)', () => {
  beforeEach(() => redirect.mockClear());

  it('trang tạo luật riêng đã bỏ: dấu trang cũ về Bảng lỗi', () => {
    NewRulePage();
    expect(redirect).toHaveBeenCalledWith('/teacher/rules');
  });
});
```
For `[ruleId]/page.test.tsx` use the same text with `import EditRulePage from './page'`, `describe('/teacher/rules/[ruleId]', …)`, `EditRulePage()`.

Run `pnpm exec vitest run src/app/teacher/rules/new src/app/teacher/rules/[ruleId]` → Expected FAIL (the old pages are still the forms).

- [ ] **Step 3: Delete the old tree and put the shells in place**

```bash
cd apps/web/src
git rm -r app/teacher/rules/_components/ApplyPreview.tsx app/teacher/rules/_components/ApplyPreview.test.tsx \
  app/teacher/rules/_components/CeilingCard.tsx app/teacher/rules/_components/CeilingCard.test.tsx \
  app/teacher/rules/_components/MissingRulesPanel.tsx app/teacher/rules/_components/MissingRulesPanel.test.tsx \
  app/teacher/rules/_components/PriceSheet.tsx app/teacher/rules/_components/PriceSheet.test.tsx \
  app/teacher/rules/_components/RuleForm.tsx app/teacher/rules/_components/RuleForm.test.tsx \
  app/teacher/rules/_components/RuleSummary.tsx app/teacher/rules/_components/RuleSummary.test.tsx \
  app/teacher/rules/_components/RuleTable.tsx app/teacher/rules/_components/RuleTable.test.tsx \
  app/teacher/rules/_components/RuleToolbar.tsx app/teacher/rules/_components/RuleToolbar.test.tsx \
  app/teacher/rules/page.test.tsx lib/rule-form.ts lib/rule-form.test.ts lib/rules-filter.ts lib/rules-filter.test.ts
```

`app/teacher/rules/page.tsx` (interim shell — replaced whole by Task B11; nothing ships in between):

```tsx
'use client';

import { PageHeader } from '@/components/layout/page-header';

/** Vỏ tạm trong lúc dựng lại Bảng lỗi theo rubric (spec rules-by-rubric); ruột trang là Task B11. */
export default function RulesPage() {
  return <PageHeader title="Bảng lỗi" description="Đang được dựng lại theo rubric." />;
}
```

`app/teacher/rules/new/page.tsx`:

```tsx
import { redirect } from 'next/navigation';

/**
 * Trang tạo luật riêng đã bỏ (spec rules-by-rubric D11): thêm lỗi giờ là ngăn kéo ngay trong Bảng lỗi, có sẵn
 * rubric và tiêu chí. Giữ đường dẫn để dấu trang cũ không rơi vào 404.
 */
export default function NewRulePage(): never {
  redirect('/teacher/rules');
}
```
`app/teacher/rules/[ruleId]/page.tsx`: the same with `EditRulePage` and the comment "Trang sửa luật riêng đã bỏ: sửa lỗi nay là ngăn kéo trong Bảng lỗi."

- [ ] **Step 4: Run everything**

```powershell
pnpm exec tsc --noEmit
pnpm exec vitest run
pnpm exec eslint src/lib src/hooks src/app/teacher/rules src/app/teacher/grading
```
Expected: `tsc` prints nothing; every vitest file passes (the deleted files are gone, the rewritten ones pass); eslint clean. If `tsc` reports an error in a file this plan does not mention, it is a consumer of a removed export — fix it by moving it to the new module, not by re-adding the old export.

- [ ] **Step 5: Commit**

```bash
git add -A apps/web
git commit -m "feat(web): cut Bảng lỗi over to rubric-scoped API; remove old page tree"
```

---

## Task B4: Rubric switcher — status, tabs, picker, meta (T-RBE-UI-2, UI-10)

**Files:**
- Create: `_components/RubricStatus.tsx`, `RubricTabs.tsx`, `RubricPicker.tsx`, `RubricSwitcher.tsx`, `RubricMeta.tsx` and tests `RubricSwitcher.test.tsx`, `RubricMeta.test.tsx` (all under `app/teacher/rules/_components/`)

**Interfaces — Produces:**

```tsx
<RubricStatus overview={RubricOverview} />
<RubricTabs overviews current onSelect(name) onNew() />
<RubricPicker overviews current: RubricOverview recent: string[] sem: string | null onSem(value) onSelect(name) onNew() />
<RubricSwitcher overviews current: RubricOverview recent sem onSem onSelect onNew />   // ≤ MANY → tabs, else picker
<RubricMeta overview onEdit() />
```

- [ ] **Step 1: Write the failing tests**

`RubricSwitcher.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { RubricSwitcher } from './RubricSwitcher';
import { criterion, overview, session } from './fixtures';
import type { RubricOverview } from '@/lib/api/rubric-errors';

const named = (name: string, over: Partial<RubricOverview> = {}) => overview({ rubricName: name, ...over });
const FEW = [named('Giữa kỳ CTDL', { unpricedCount: 1 }), named('Diễn tập'), named('Cuối kỳ CTDL', { criteria: [criterion({ errorCount: 0 })] })];

/** 14 rubric: tên thật, trạng thái xen kẽ, một nửa có phiên ở HK khác nhau. */
const NAMES = [
  'Giữa kỳ CTDL', 'Diễn tập — Ngăn xếp', 'Cuối kỳ CTDL', 'Giữa kỳ CTDL 2025', 'Cuối kỳ CTDL 2025', 'Kiểm tra 15 phút — Mảng',
  'Thực hành — Hàng đợi', 'Giữa kỳ Lập trình C', 'Cuối kỳ Lập trình C', 'Bài tập lớn — Đồ thị', 'Thực hành — Cây nhị phân',
  'Kiểm tra giữa kỳ — Sắp xếp', 'Cuối kỳ CTDL (đề B)', 'Thi lại CTDL',
];
const MANY_LIST = NAMES.map((name, i) =>
  named(name, {
    ...(i % 3 === 0 ? { unpricedCount: 1 } : {}),
    ...(i % 3 === 2 ? { criteria: [criterion({ errorCount: 0 })] } : {}),
    sessions: i % 2 === 0 ? [session({ id: `s${i}`, semesterName: i % 4 === 0 ? 'HK2 2025-2026' : 'HK1 2026-2027', state: i % 4 === 0 ? 'finalized' : 'grading' })] : [],
  }),
);

function show(overviews: RubricOverview[], over: Partial<React.ComponentProps<typeof RubricSwitcher>> = {}) {
  const props = {
    overviews,
    current: overviews[0],
    recent: [] as string[],
    sem: null as string | null,
    onSem: vi.fn(),
    onSelect: vi.fn(),
    onNew: vi.fn(),
    ...over,
  };
  return { props, ...render(<RubricSwitcher {...props} />) };
}

describe('RubricSwitcher — ít rubric: hàng thẻ (T-RBE-UI-2)', () => {
  it('mỗi rubric một thẻ có tên và tình trạng; thẻ đang mở được chọn', () => {
    show(FEW);
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(3);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    expect(tabs[0]).toHaveTextContent('Giữa kỳ CTDL');
    expect(tabs[0]).toHaveTextContent('Còn 1 việc');
    expect(tabs[1]).toHaveTextContent('Sẵn sàng chấm tự động');
    expect(tabs[2]).toHaveTextContent('Chưa có lỗi nào');
  });
  it('bấm thẻ chuyển rubric; "Rubric mới" mở hộp thoại tạo', () => {
    const { props } = show(FEW);
    fireEvent.click(screen.getByRole('tab', { name: /Cuối kỳ CTDL/ }));
    expect(props.onSelect).toHaveBeenCalledWith('Cuối kỳ CTDL');
    fireEvent.click(screen.getByRole('button', { name: /Rubric mới/ }));
    expect(props.onNew).toHaveBeenCalled();
  });
  it('đúng 4 rubric vẫn là hàng thẻ (ngưỡng là > 4)', () => {
    show([...FEW, named('Thứ tư')]);
    expect(screen.getAllByRole('tab')).toHaveLength(4);
    expect(screen.queryByRole('button', { name: /Đổi rubric/ })).not.toBeInTheDocument();
  });
});

describe('RubricSwitcher — nhiều rubric: ô chọn có tìm kiếm', () => {
  it('từ 5 rubric: không còn hàng thẻ; hiện "Rubric đang mở" và nút Đổi rubric kèm tổng số', () => {
    show([...FEW, named('Bốn'), named('Năm')]);
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.getByText('Rubric đang mở')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Đổi rubric \(5\)/ })).toBeInTheDocument();
  });

  it('mở bảng: tìm không phân biệt dấu, lọc tình trạng, số trên nút lọc', () => {
    show(MANY_LIST);
    fireEvent.click(screen.getByRole('button', { name: /Đổi rubric/ }));
    const list = () => within(screen.getByRole('listbox', { name: 'Danh sách rubric' })).getAllByRole('option');
    expect(list()).toHaveLength(14);
    fireEvent.change(screen.getByLabelText('Tìm rubric theo tên'), { target: { value: 'cuoi ky' } });
    expect(list().map((o) => o.textContent)).toEqual(expect.arrayContaining([expect.stringContaining('Cuối kỳ CTDL')]));
    expect(list().every((o) => /cuối kỳ/i.test(o.textContent ?? ''))).toBe(true);
    fireEvent.change(screen.getByLabelText('Tìm rubric theo tên'), { target: { value: 'không khớp' } });
    expect(screen.getByText(/Không có rubric nào khớp/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Xoá tìm kiếm và bộ lọc' }));
    expect(list()).toHaveLength(14);
    fireEvent.click(screen.getByRole('button', { name: /^Cần làm/ }));
    expect(list().length).toBe(MANY_LIST.filter((o) => o.unpricedCount > 0).length);
  });

  it('bấm một dòng chuyển rubric và đóng bảng; tìm kiếm và lọc được đặt lại', () => {
    const { props } = show(MANY_LIST);
    fireEvent.click(screen.getByRole('button', { name: /Đổi rubric/ }));
    fireEvent.change(screen.getByLabelText('Tìm rubric theo tên'), { target: { value: 'thi lai' } });
    fireEvent.click(screen.getByRole('option', { name: /Thi lại CTDL/ }));
    expect(props.onSelect).toHaveBeenCalledWith('Thi lại CTDL');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Đổi rubric/ }));
    expect(screen.getByLabelText('Tìm rubric theo tên')).toHaveValue('');
  });

  it('Enter trong ô tìm chọn dòng đầu; Esc đóng; bấm ra ngoài đóng', () => {
    const { props } = show(MANY_LIST);
    fireEvent.click(screen.getByRole('button', { name: /Đổi rubric/ }));
    const search = screen.getByLabelText('Tìm rubric theo tên');
    fireEvent.change(search, { target: { value: 'thi lai' } });
    fireEvent.keyDown(search, { key: 'Enter' });
    expect(props.onSelect).toHaveBeenCalledWith('Thi lại CTDL');
    fireEvent.click(screen.getByRole('button', { name: /Đổi rubric/ }));
    fireEvent.keyDown(screen.getByLabelText('Tìm rubric theo tên'), { key: 'Escape' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Đổi rubric/ }));
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('mũi tên xuống đưa tiêu điểm vào danh sách', () => {
    show(MANY_LIST);
    fireEvent.click(screen.getByRole('button', { name: /Đổi rubric/ }));
    fireEvent.keyDown(screen.getByLabelText('Tìm rubric theo tên'), { key: 'ArrowDown' });
    expect(screen.getAllByRole('option')[0]).toHaveFocus();
  });

  it('"Gần đây": tối đa 3 chip, không gồm rubric đang mở, bỏ tên không còn tồn tại', () => {
    const { props } = show(MANY_LIST, { recent: ['Giữa kỳ CTDL', 'Thi lại CTDL', 'Đã bị xoá', 'Cuối kỳ CTDL', 'Diễn tập — Ngăn xếp', 'Giữa kỳ CTDL 2025'] });
    const chips = screen.getAllByRole('button', { name: /^(Thi lại CTDL|Cuối kỳ CTDL|Diễn tập — Ngăn xếp|Giữa kỳ CTDL 2025)$/ });
    expect(chips.map((c) => c.textContent)).toEqual(['Thi lại CTDL', 'Cuối kỳ CTDL', 'Diễn tập — Ngăn xếp']);
    fireEvent.click(chips[0]);
    expect(props.onSelect).toHaveBeenCalledWith('Thi lại CTDL');
  });

  it('dòng tóm tắt đếm đúng và "N cần làm" bấm được (mở bảng với bộ lọc Cần làm)', () => {
    show(MANY_LIST);
    const todo = MANY_LIST.filter((o) => o.unpricedCount > 0).length;
    fireEvent.click(screen.getByRole('button', { name: `${todo} cần làm` }));
    expect(screen.getByRole('button', { name: /^Cần làm/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('T-RBE-UI-10: lọc học kỳ — danh sách dựng từ phiên, mới nhất trước, "Chưa gắn học kỳ" cuối', () => {
    show(MANY_LIST);
    fireEvent.click(screen.getByRole('button', { name: /Đổi rubric/ }));
    const options = within(screen.getByLabelText('Lọc theo học kỳ')).getAllByRole('option').map((o) => o.textContent);
    expect(options[0]).toMatch(/^Tất cả học kỳ/);
    expect(options[1]).toMatch(/^HK1 2026-2027/);
    expect(options[2]).toMatch(/^HK2 2025-2026/);
    expect(options[options.length - 1]).toMatch(/^Chưa gắn học kỳ/);
  });

  it('T-RBE-UI-10: chọn học kỳ gọi onSem; đang lọc thì hiện chip + "Bỏ lọc", nút ghi (x/y), và đếm theo học kỳ', () => {
    const { props, rerender } = show(MANY_LIST);
    fireEvent.click(screen.getByRole('button', { name: /Đổi rubric/ }));
    fireEvent.change(screen.getByLabelText('Lọc theo học kỳ'), { target: { value: 'HK2 2025-2026' } });
    expect(props.onSem).toHaveBeenCalledWith('HK2 2025-2026');
    rerender(<RubricSwitcher {...props} sem="HK2 2025-2026" />);
    const inSem = MANY_LIST.filter((o) => o.semesters.includes('HK2 2025-2026')).length;
    expect(screen.getByRole('button', { name: new RegExp(`Đổi rubric \\(${inSem}/14\\)`) })).toBeInTheDocument();
    expect(screen.getByText(/Học kỳ: HK2 2025-2026/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Bỏ lọc' }));
    expect(props.onSem).toHaveBeenLastCalledWith(null);
  });

  it('T-RBE-UI-10: lọc học kỳ không vô hiệu hoá nút nào — "Rubric mới" và "Đổi rubric" vẫn bấm được', () => {
    const { props } = show(MANY_LIST, { sem: 'HK2 2025-2026' });
    expect(screen.getAllByRole('button', { name: /Rubric mới/ })[0]).toBeEnabled();
    expect(screen.getByRole('button', { name: /Đổi rubric/ })).toBeEnabled();
    fireEvent.click(screen.getAllByRole('button', { name: /Rubric mới/ })[0]);
    expect(props.onNew).toHaveBeenCalled();
  });
});
```

`RubricMeta.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { RubricMeta } from './RubricMeta';
import { overview, session } from './fixtures';

describe('RubricMeta', () => {
  it('điểm tổng, số tiêu chí và nút sửa tiêu chí — không có chữ "phiên bản"', () => {
    const onEdit = vi.fn();
    render(<RubricMeta overview={overview()} onEdit={onEdit} />);
    expect(screen.getByText(/10,0/)).toBeInTheDocument();
    expect(screen.getByText(/3 tiêu chí/)).toBeInTheDocument();
    expect(screen.queryByText(/phiên bản/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Sửa tiêu chí & điểm tối đa/ }));
    expect(onEdit).toHaveBeenCalled();
  });

  it('chưa gắn phiên nào thì nói vậy', () => {
    render(<RubricMeta overview={overview({ sessions: [] })} onEdit={vi.fn()} />);
    expect(screen.getByText(/chưa gắn phiên thi nào/)).toBeInTheDocument();
  });

  it('liệt kê phiên kèm trạng thái, chặn trần ở 3 phiên', () => {
    const sessions = [
      session({ id: 'a', name: 'Ca sáng', state: 'grading' }),
      session({ id: 'b', name: 'Ca chiều', state: 'finalized' }),
      session({ id: 'c', name: 'Ca tối', state: 'not_started' }),
      session({ id: 'd', name: 'Ca khuya', state: 'grading' }),
      session({ id: 'e', name: 'Ca nữa', state: 'grading' }),
    ];
    render(<RubricMeta overview={overview({ sessions })} onEdit={vi.fn()} />);
    expect(screen.getByText('Ca sáng')).toBeInTheDocument();
    expect(screen.getByText('đang chấm', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByText('đã chốt')).toBeInTheDocument();
    expect(screen.queryByText('Ca khuya')).not.toBeInTheDocument();
    expect(screen.getByText(/và 2 phiên khác/)).toBeInTheDocument();
  });
});
```
(`getByText('đang chấm', {selector:'span'})` would match several if two sessions are grading — only one of the first three is `grading`, so it is unique.)

Run `pnpm exec vitest run src/app/teacher/rules/_components/RubricSwitcher.test.tsx src/app/teacher/rules/_components/RubricMeta.test.tsx` → Expected FAIL (components missing).

- [ ] **Step 2: Implement**

`RubricStatus.tsx`:

```tsx
import { Check, Info, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { RubricOverview } from '@/lib/api/rubric-errors';
import { statusOf } from '@/lib/rubric-board';

/** Tình trạng một rubric: biểu tượng + chữ (không truyền tin chỉ bằng màu — spec UI §2.1 luật 1). */
export function RubricStatus({ overview, className }: { overview: RubricOverview; className?: string }) {
  const { status, label } = statusOf(overview);
  const Icon = status === 'ready' ? Check : status === 'todo' ? TriangleAlert : Info;
  const tone = status === 'ready' ? 'text-success-strong' : status === 'todo' ? 'text-warning-strong' : 'text-primary';
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-small font-semibold', tone, className)}>
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      {label}
    </span>
  );
}
```

`RubricTabs.tsx`:

```tsx
'use client';

import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { RubricOverview } from '@/lib/api/rubric-errors';
import { RubricStatus } from './RubricStatus';

/** Từ 1 đến MANY rubric: mỗi rubric một thẻ (tên + tình trạng). Nhiều hơn thì dùng `RubricPicker`. */
export function RubricTabs({
  overviews,
  current,
  onSelect,
  onNew,
}: {
  overviews: RubricOverview[];
  current: string;
  onSelect: (name: string) => void;
  onNew: () => void;
}) {
  return (
    <div role="tablist" aria-label="Chọn rubric" className="flex flex-wrap items-stretch gap-2.5">
      {overviews.map((o) => {
        const selected = o.rubricName === current;
        return (
          <button
            key={o.rubricName}
            type="button"
            role="tab"
            aria-selected={selected}
            title={o.rubricName}
            onClick={() => onSelect(o.rubricName)}
            className={cn(
              'flex min-w-[210px] max-w-[290px] flex-col items-start gap-0.5 rounded-lg border bg-surface px-3.5 py-2.5 text-left shadow-sm hover:bg-surface-2',
              selected ? 'border-primary ring-2 ring-primary-subtle' : 'border-border',
            )}
          >
            <span className={cn('max-w-full truncate text-body font-semibold', selected && 'text-primary')}>{o.rubricName}</span>
            <RubricStatus overview={o} />
          </button>
        );
      })}
      <Button type="button" variant="ghost" className="self-center text-primary hover:text-primary" onClick={onNew}>
        <Plus className="h-4 w-4" aria-hidden="true" />
        Rubric mới
      </Button>
    </div>
  );
}
```

`RubricPicker.tsx`:

```tsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { RubricOverview } from '@/lib/api/rubric-errors';
import {
  RECENT_SHOWN,
  filterCounts,
  inSemester,
  pickRubrics,
  pointsText,
  semesterChoices,
  semesterLabel,
  statusOf,
  type PickFilter,
  type PickSort,
} from '@/lib/rubric-board';
import { RubricStatus } from './RubricStatus';

const FILTERS: { id: PickFilter; label: string }[] = [
  { id: 'all', label: 'Tất cả' },
  { id: 'todo', label: 'Cần làm' },
  { id: 'ready', label: 'Sẵn sàng' },
  { id: 'new', label: 'Mới' },
];

/**
 * Từ MANY+1 rubric: "Rubric đang mở" + nút Đổi rubric (spec D7, mục 5.6). Bảng chọn có tìm kiếm không phân biệt
 * dấu, lọc tình trạng, lọc học kỳ, sắp xếp, ↑↓ Enter Esc, và 3 rubric mở gần đây để chuyển nhanh.
 *
 * Lọc học kỳ thuộc về TRANG (`sem`, `onSem`): nó phải giữ nguyên sau khi chọn rubric và được đặt lại khi tạo
 * rubric mới. Còn từ khoá / tình trạng / sắp xếp là việc nội bộ của bảng nên ở đây.
 */
export function RubricPicker({
  overviews,
  current,
  recent,
  sem,
  onSem,
  onSelect,
  onNew,
}: {
  overviews: RubricOverview[];
  current: RubricOverview;
  recent: string[];
  sem: string | null;
  onSem: (value: string | null) => void;
  onSelect: (name: string) => void;
  onNew: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<PickFilter>('all');
  const [sort, setSort] = useState<PickSort>('recent');
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const base = useMemo(() => inSemester(overviews, sem), [overviews, sem]);
  const counts = useMemo(() => filterCounts(overviews, sem), [overviews, sem]);
  const choices = useMemo(() => semesterChoices(overviews), [overviews]);
  const list = useMemo(() => pickRubrics(overviews, { q, filter, sort, sem }, recent), [overviews, q, filter, sort, sem, recent]);
  const recentChips = recent.filter((n) => n !== current.rubricName && overviews.some((o) => o.rubricName === n)).slice(0, RECENT_SHOWN);

  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  // Bấm ra ngoài thì đóng.
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };
  const pick = (name: string) => {
    setQ('');
    setFilter('all');
    setOpen(false);
    onSelect(name);
  };
  const clearAll = () => {
    setQ('');
    setFilter('all');
    onSem(null);
  };

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key === 'Enter' && event.target === searchRef.current) {
      event.preventDefault();
      if (list[0]) pick(list[0].rubricName);
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const items = [...(wrapRef.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? [])];
    if (items.length === 0) return;
    event.preventDefault();
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (event.key === 'ArrowDown') items[i < 0 ? 0 : Math.min(items.length - 1, i + 1)].focus();
    else if (i <= 0) searchRef.current?.focus();
    else items[i - 1].focus();
  }

  const openTodo = () => {
    setFilter('todo');
    setQ('');
    setOpen(true);
  };

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
      <div ref={wrapRef} className="relative" onKeyDown={onKeyDown}>
        <div className="flex items-center gap-3 rounded-lg border border-primary bg-surface py-2 pl-4 pr-2 shadow-sm ring-2 ring-primary-subtle">
          <span className="text-caption font-semibold uppercase tracking-wide text-muted-foreground">Rubric đang mở</span>
          <b className="max-w-[330px] truncate text-h3 text-primary" title={current.rubricName}>
            {current.rubricName}
          </b>
          <RubricStatus overview={current} />
          <Button
            ref={triggerRef}
            type="button"
            variant="outline"
            aria-haspopup="dialog"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            Đổi rubric ({sem === null ? overviews.length : `${base.length}/${overviews.length}`})
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>

        {open && (
          <div
            role="dialog"
            aria-label="Chọn rubric"
            className="absolute left-0 top-full z-30 mt-2 flex w-[620px] max-w-[calc(100vw-2rem)] flex-col rounded-lg border border-border bg-surface shadow-lg"
          >
            <div className="flex flex-col gap-2.5 border-b border-border p-3">
              <input
                ref={searchRef}
                type="search"
                aria-label="Tìm rubric theo tên"
                placeholder="Tìm rubric theo tên…"
                autoComplete="off"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="h-10 w-full rounded-md border border-input bg-surface px-3 text-body focus:border-primary focus:outline-none"
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="flex items-center gap-1.5 text-small text-muted-foreground">
                  Học kỳ
                  <select
                    aria-label="Lọc theo học kỳ"
                    value={sem ?? ''}
                    onChange={(e) => onSem(e.target.value === '' ? null : e.target.value)}
                    className="h-8 min-w-[190px] rounded-md border border-input bg-surface px-1.5 text-small"
                  >
                    {choices.map((c) => (
                      <option key={c.value ?? 'all'} value={c.value ?? ''}>
                        {c.label} ({c.count})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-1.5 text-small text-muted-foreground">
                  Sắp xếp
                  <select
                    aria-label="Sắp xếp"
                    value={sort}
                    onChange={(e) => setSort(e.target.value as PickSort)}
                    className="h-8 rounded-md border border-input bg-surface px-1.5 text-small"
                  >
                    <option value="recent">Dùng gần đây</option>
                    <option value="name">Tên A–Z</option>
                    <option value="todo">Cần làm trước</option>
                  </select>
                </label>
              </div>
              <div role="group" aria-label="Lọc theo tình trạng" className="flex flex-wrap gap-1.5">
                {FILTERS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    aria-pressed={filter === f.id}
                    onClick={() => setFilter(f.id)}
                    className={cn(
                      'h-7 rounded-full border px-3 text-small font-semibold',
                      filter === f.id ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-surface text-muted-foreground hover:bg-surface-2',
                    )}
                  >
                    {f.label}
                    <span className="ml-1.5 opacity-80">{counts[f.id]}</span>
                  </button>
                ))}
              </div>
            </div>

            <div role="listbox" aria-label="Danh sách rubric" className="max-h-[340px] overflow-auto p-1.5">
              {list.length === 0 ? (
                <div className="flex flex-col items-center gap-2.5 p-6 text-center text-muted-foreground">
                  <p>Không có rubric nào khớp{q.trim() ? ` “${q.trim()}”` : ''}.</p>
                  <Button type="button" size="sm" variant="outline" onClick={clearAll}>
                    Xoá tìm kiếm và bộ lọc
                  </Button>
                </div>
              ) : (
                list.map((o) => {
                  const selected = o.rubricName === current.rubricName;
                  const grading = o.sessions.filter((s) => s.state === 'grading').length;
                  return (
                    <button
                      key={o.rubricName}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onClick={() => pick(o.rubricName)}
                      className={cn(
                        'flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-2 text-left hover:bg-surface-2 focus-visible:bg-surface-2',
                        selected && 'bg-primary-subtle',
                      )}
                    >
                      <span className="flex min-w-0 flex-col">
                        <b className="truncate font-semibold">{o.rubricName}</b>
                        <span className="text-small text-muted-foreground">
                          {pointsText(o.totalPoints)} · {o.criteria.length} tiêu chí · {o.errorCount} lỗi
                          {grading > 0 ? ` · ${grading} phiên đang chấm` : ''}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <RubricStatus overview={o} />
                        {selected && <Check className="h-4 w-4 text-primary" aria-hidden="true" />}
                      </span>
                    </button>
                  );
                })
              )}
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-border px-3 py-2">
              <Button type="button" size="sm" variant="ghost" className="text-primary hover:text-primary" onClick={onNew}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                Rubric mới
              </Button>
              <span aria-live="polite" className="text-small text-muted-foreground">
                {list.length} / {base.length} rubric
              </span>
              <span className="text-small text-muted-foreground">↑ ↓ chọn · Enter mở · Esc đóng</span>
            </div>
          </div>
        )}
      </div>

      {recentChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-small text-muted-foreground">Gần đây:</span>
          {recentChips.map((name) => (
            <button
              key={name}
              type="button"
              title={name}
              onClick={() => onSelect(name)}
              className="h-[30px] max-w-[210px] truncate rounded-full border border-border bg-surface px-3 text-small hover:bg-surface-2"
            >
              {name}
            </button>
          ))}
        </div>
      )}

      <Button type="button" variant="ghost" className="text-primary hover:text-primary" onClick={onNew}>
        <Plus className="h-4 w-4" aria-hidden="true" />
        Rubric mới
      </Button>

      <p className="basis-full text-small text-muted-foreground">
        {sem === null ? `${overviews.length} rubric` : `${base.length} / ${overviews.length} rubric`}
        {' · '}
        <button type="button" className="font-semibold text-primary underline underline-offset-2" onClick={openTodo}>
          {counts.todo} cần làm
        </button>
        {` · ${counts.ready} sẵn sàng · ${counts.new} mới`}
        {sem !== null && (
          <span className="ml-2 inline-flex items-center gap-2 rounded-full bg-primary-subtle px-2.5 py-0.5 text-primary">
            Học kỳ: {semesterLabel(sem)}
            <button type="button" className="font-semibold underline underline-offset-2" onClick={() => onSem(null)}>
              Bỏ lọc
            </button>
          </span>
        )}
      </p>
    </div>
  );
}
```
Note: the trigger `Button` needs `ref` — `components/ui/button.tsx` is `forwardRef`. The summary line renders `Bỏ lọc` while the open panel may also render it nowhere else — unique.

`RubricSwitcher.tsx`:

```tsx
'use client';

import { MANY } from '@/lib/rubric-board';
import type { RubricOverview } from '@/lib/api/rubric-errors';
import { RubricPicker } from './RubricPicker';
import { RubricTabs } from './RubricTabs';

/** Trục chính của trang: chọn rubric. Ít rubric → hàng thẻ; nhiều → ô chọn có tìm kiếm (spec D7). */
export function RubricSwitcher(props: {
  overviews: RubricOverview[];
  current: RubricOverview;
  recent: string[];
  sem: string | null;
  onSem: (value: string | null) => void;
  onSelect: (name: string) => void;
  onNew: () => void;
}) {
  if (props.overviews.length > MANY) return <RubricPicker {...props} />;
  return <RubricTabs overviews={props.overviews} current={props.current.rubricName} onSelect={props.onSelect} onNew={props.onNew} />;
}
```

`RubricMeta.tsx`:

```tsx
'use client';

import { Pencil } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { RubricOverview } from '@/lib/api/rubric-errors';
import { formatVnPoints } from '@/lib/format';

const SHOWN = 3;

/** Dòng thông tin dưới ô chọn rubric: điểm tổng, số tiêu chí, nơi dùng, và lối sửa tiêu chí. */
export function RubricMeta({ overview, onEdit }: { overview: RubricOverview; onEdit: () => void }) {
  const shown = overview.sessions.slice(0, SHOWN);
  const more = overview.sessions.length - shown.length;
  return (
    <div className="mt-3.5 flex flex-wrap items-center gap-x-3.5 gap-y-1 px-0.5 text-small text-muted-foreground">
      <span>
        <b className="text-foreground">{formatVnPoints(overview.totalPoints)}</b> điểm · {overview.criteria.length} tiêu chí
      </span>
      <span className="flex flex-wrap items-center gap-x-1.5">
        Dùng ở:
        {shown.length === 0 && <span>chưa gắn phiên thi nào</span>}
        {shown.map((s, i) => (
          <span key={s.id} className="inline-flex items-center gap-1.5">
            {i > 0 && <span aria-hidden="true">·</span>}
            {s.name}
            {s.state === 'grading' && <Badge variant="primary">đang chấm</Badge>}
            {s.state === 'finalized' && <Badge>đã chốt</Badge>}
          </span>
        ))}
        {more > 0 && <span>và {more} phiên khác</span>}
      </span>
      <Button type="button" variant="ghost" size="sm" className="text-primary hover:text-primary" onClick={onEdit}>
        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
        Sửa tiêu chí &amp; điểm tối đa
      </Button>
    </div>
  );
}
```

- [ ] **Step 3: Run, lint, commit**

```powershell
pnpm exec vitest run src/app/teacher/rules/_components/RubricSwitcher.test.tsx src/app/teacher/rules/_components/RubricMeta.test.tsx
pnpm exec tsc --noEmit
pnpm exec eslint src/app/teacher/rules
```
Expected: PASS. If the `getByRole('button', { name: /^Cần làm/ })` in a test matches the *summary* button "N cần làm" too, tighten the test to `within(screen.getByRole('group', { name: 'Lọc theo tình trạng' }))`; the regex `^Cần làm` does not match "1 cần làm" (starts with a digit), so it is unambiguous as written.

```bash
git add apps/web/src/app/teacher/rules
git commit -m "feat(web): rubric switcher — cards for few rubrics, search picker + semester filter for many"
```

---

## Task B5: Readiness banner and copy-from-rubric (T-RBE-UI-3)

**Files:**
- Create: `_components/CopyFromRubric.tsx`, `ReadinessBanner.tsx`, tests `CopyFromRubric.test.tsx`, `ReadinessBanner.test.tsx`

**Interfaces:**
- Consumes: `useCopyErrors` (B1), `copySources`, `copyStats`, `copyPreviewText`, `statusOf`, `tasksOf`, `capNames`, `shorten` (B2).
- Produces:

```tsx
<CopyFromRubric target={RubricOverview} sources={RubricOverview[]} onAddManually={() => void} />
<ReadinessBanner overview errors: RubricErrorItem[] | undefined overviews: RubricOverview[]
   onAddManually onGoToCriterion(key: string) onOpenProposals() onOpenDangling() />
```

- [ ] **Step 1: Write the failing tests**

`CopyFromRubric.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { toast } from 'sonner';
import { CopyFromRubric } from './CopyFromRubric';
import { criterion, mutation, overview } from './fixtures';

const h = vi.hoisted(() => ({ copy: undefined as unknown }));
vi.mock('@/hooks/useRubricErrors', () => ({ useCopyErrors: () => h.copy }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const target = overview({ rubricName: 'Đích', criteria: [criterion({ key: 'a', errorCount: 0 }), criterion({ key: 'b', errorCount: 0 })] });
const sources = [
  overview({ rubricName: 'Nguồn 1', criteria: [criterion({ key: 'a', errorCount: 3 }), criterion({ key: 'b', errorCount: 2 }), criterion({ key: 'z', errorCount: 4 })] }),
  overview({ rubricName: 'Nguồn 2', criteria: [criterion({ key: 'a', errorCount: 1 })] }),
];

beforeEach(() => {
  vi.clearAllMocks();
  h.copy = mutation();
});

describe('CopyFromRubric (D3: giảng viên TỰ chọn nguồn)', () => {
  it('không chọn sẵn nguồn nào; nút Sao chép khoá tới khi chọn; chưa có dòng xem trước', () => {
    render(<CopyFromRubric target={target} sources={sources} onAddManually={vi.fn()} />);
    expect(screen.getByLabelText('Sao chép lỗi và điểm trừ từ')).toHaveValue('');
    expect(screen.getByRole('button', { name: /Sao chép/ })).toBeDisabled();
    expect(screen.queryByText(/Sẽ sao chép/)).not.toBeInTheDocument();
  });

  it('mỗi nguồn ghi số lỗi; chọn nguồn thì hiện xem trước đúng số và mở nút', () => {
    render(<CopyFromRubric target={target} sources={sources} onAddManually={vi.fn()} />);
    const select = screen.getByLabelText('Sao chép lỗi và điểm trừ từ');
    expect(screen.getByRole('option', { name: 'Nguồn 1 — 9 lỗi' })).toBeInTheDocument();
    fireEvent.change(select, { target: { value: 'Nguồn 1' } });
    expect(screen.getByText(/Sẽ sao chép 5 lỗi vào 2 tiêu chí trùng tên/)).toBeInTheDocument();
    expect(screen.getByText(/4 lỗi thuộc tiêu chí không có ở rubric này sẽ không được sao chép/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sao chép/ })).toBeEnabled();
  });

  it('Sao chép gửi đúng nguồn → đích; thành công báo bằng lời, kể cả số lỗi bị bỏ', () => {
    render(<CopyFromRubric target={target} sources={sources} onAddManually={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Sao chép lỗi và điểm trừ từ'), { target: { value: 'Nguồn 1' } });
    fireEvent.click(screen.getByRole('button', { name: /Sao chép/ }));
    const m = (h.copy as ReturnType<typeof mutation>).mutate;
    expect(m).toHaveBeenCalledWith({ from: 'Nguồn 1', to: 'Đích' }, expect.anything());
    m.mock.calls[0][1].onSuccess({ copied: 5, skippedNoCriterion: 4, skippedExisting: 0, recompute: null });
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('Đã sao chép 5 lỗi từ “Nguồn 1”. Hai rubric từ giờ độc lập'));
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('4 lỗi thuộc tiêu chí không có ở rubric này nên không sao chép'));
  });

  it('lỗi của máy chủ hiện nguyên văn ngay dưới', () => {
    (h.copy as ReturnType<typeof mutation>).isError = true;
    (h.copy as ReturnType<typeof mutation>).error = new Error('Không tìm thấy rubric');
    render(<CopyFromRubric target={target} sources={sources} onAddManually={vi.fn()} />);
    expect(screen.getByText('Không tìm thấy rubric')).toBeInTheDocument();
  });

  it('"Tự thêm từng lỗi" mở ngăn kéo thêm lỗi', () => {
    const onAddManually = vi.fn();
    render(<CopyFromRubric target={target} sources={sources} onAddManually={onAddManually} />);
    fireEvent.click(screen.getByRole('button', { name: 'Tự thêm từng lỗi' }));
    expect(onAddManually).toHaveBeenCalled();
  });

  it('không có nguồn nào: nói rõ và chỉ còn lối tự thêm — không hiện ô chọn', () => {
    render(<CopyFromRubric target={target} sources={[]} onAddManually={vi.fn()} />);
    expect(screen.getByText('Chưa có rubric nào khác có lỗi để sao chép.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Sao chép lỗi và điểm trừ từ')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tự thêm từng lỗi' })).toBeInTheDocument();
  });
});
```

`ReadinessBanner.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ReadinessBanner } from './ReadinessBanner';
import { criterion, errorItem, mutation, overview } from './fixtures';

vi.mock('@/hooks/useRubricErrors', () => ({ useCopyErrors: () => mutation() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const handlers = () => ({ onAddManually: vi.fn(), onGoToCriterion: vi.fn(), onOpenProposals: vi.fn(), onOpenDangling: vi.fn() });
const mount = (o = overview(), errors: React.ComponentProps<typeof ReadinessBanner>['errors'] = [], overviews = [o]) => {
  const h = handlers();
  render(<ReadinessBanner overview={o} errors={errors} overviews={overviews} {...h} />);
  return h;
};

beforeEach(() => vi.clearAllMocks());

describe('ReadinessBanner (T-RBE-UI-3)', () => {
  it('sẵn sàng: nói rõ và không có việc nào', () => {
    mount();
    expect(screen.getByRole('heading', { name: 'Sẵn sàng chấm tự động' })).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('rubric mới: tiêu đề, câu hậu quả, ô chọn nguồn KHÔNG chọn sẵn', () => {
    const fresh = overview({ criteria: [criterion({ errorCount: 0 })] });
    const other = overview({ rubricName: 'Cũ' });
    mount(fresh, [], [fresh, other]);
    expect(screen.getByRole('heading', { name: 'Rubric mới — chưa có lỗi nào' })).toBeInTheDocument();
    expect(screen.getByText(/Khi chưa có lỗi, mọi bài chấm theo rubric này sẽ chuyển sang “Cần bạn xem” thay vì tự duyệt/)).toBeInTheDocument();
    expect(screen.getByLabelText('Sao chép lỗi và điểm trừ từ')).toHaveValue('');
  });

  it('còn việc: tiêu đề đếm số LOẠI việc; mỗi dòng việc là một nút làm đúng việc', () => {
    const o = overview({
      criteria: [criterion({ key: 'a', description: 'Tính đúng', errorCount: 1 }), criterion({ key: 'b', description: 'Trình bày', errorCount: 0 })],
      unpricedCount: 2,
      proposalCount: 3,
      danglingCount: 1,
    });
    const errors = [errorItem({ id: 'e1', criterionKey: 'a', deduction: '1.00' }), errorItem({ id: 'e2', criterionKey: 'a', deduction: null })];
    const h = mount(o, errors);
    expect(screen.getByRole('heading', { name: 'Chưa sẵn sàng chấm tự động — còn 4 việc' })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(4);
    fireEvent.click(screen.getByRole('button', { name: 'Thêm lỗi' }));
    expect(h.onGoToCriterion).toHaveBeenLastCalledWith('b');
    fireEvent.click(screen.getByRole('button', { name: 'Đặt điểm trừ' }));
    expect(h.onGoToCriterion).toHaveBeenLastCalledWith('a');
    fireEvent.click(screen.getByRole('button', { name: 'Xem lỗi AI đề xuất' }));
    expect(h.onOpenProposals).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Chuyển sang tiêu chí khác' }));
    expect(h.onOpenDangling).toHaveBeenCalled();
    expect(screen.getByText(/3 lỗi AI thấy/)).toBeInTheDocument();
    expect(screen.getByText(/đang bị bỏ ra khỏi điểm/)).toBeInTheDocument();
  });

  it('danh sách lỗi chưa tải xong (undefined) thì "Đặt điểm trừ" nhảy tới nhóm đầu tiên thay vì hỏng', () => {
    const o = overview({ unpricedCount: 1 });
    const h = handlers();
    render(<ReadinessBanner overview={o} overviews={[o]} errors={undefined} {...h} />);
    fireEvent.click(screen.getByRole('button', { name: 'Đặt điểm trừ' }));
    expect(h.onGoToCriterion).toHaveBeenCalledWith('tinh_dung');
  });
});
```

Run → Expected FAIL (components missing).

- [ ] **Step 2: Implement**

`CopyFromRubric.tsx`:

```tsx
'use client';

import { useId, useState } from 'react';
import { Copy } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useCopyErrors } from '@/hooks/useRubricErrors';
import type { RubricOverview } from '@/lib/api/rubric-errors';
import { copyPreviewText, copyStats } from '@/lib/rubric-board';

/**
 * Sao chép lỗi + điểm trừ từ một rubric khác (D3). Giảng viên TỰ chọn nguồn — không chọn sẵn, không gợi ý: chọn
 * sẵn một nguồn là thay họ quyết định. Xem trước tính từ dữ liệu tổng quan, ghép theo khoá tiêu chí như máy chủ.
 */
export function CopyFromRubric({
  target,
  sources,
  onAddManually,
}: {
  target: RubricOverview;
  sources: RubricOverview[];
  onAddManually: () => void;
}) {
  const id = useId();
  const [source, setSource] = useState('');
  const copy = useCopyErrors();
  const chosen = sources.find((s) => s.rubricName === source);

  if (sources.length === 0) {
    return (
      <div className="mt-3.5 flex flex-wrap items-center gap-2.5">
        <Button type="button" variant="outline" onClick={onAddManually}>
          Tự thêm từng lỗi
        </Button>
        <span className="text-small">Chưa có rubric nào khác có lỗi để sao chép.</span>
      </div>
    );
  }

  function run() {
    if (!chosen) return;
    copy.mutate(
      { from: chosen.rubricName, to: target.rubricName },
      {
        onSuccess: (r) =>
          toast.success(
            `Đã sao chép ${r.copied} lỗi từ “${chosen.rubricName}”. Hai rubric từ giờ độc lập — chỉnh điểm trừ cho kỳ này.` +
              (r.skippedNoCriterion > 0 ? ` ${r.skippedNoCriterion} lỗi thuộc tiêu chí không có ở rubric này nên không sao chép.` : ''),
          ),
      },
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="mt-3.5 flex flex-wrap items-center gap-2.5 text-foreground">
        <label htmlFor={id} className="font-semibold text-primary">
          Sao chép lỗi và điểm trừ từ
        </label>
        <select
          id={id}
          value={source}
          onChange={(e) => setSource(e.target.value)}
          className="h-9 w-80 max-w-full rounded-md border border-input bg-surface px-2.5 font-medium"
        >
          <option value="">Chọn rubric…</option>
          {sources.map((s) => (
            <option key={s.rubricName} value={s.rubricName}>
              {s.rubricName} — {s.errorCount} lỗi
            </option>
          ))}
        </select>
        <Button type="button" variant="primary" disabled={!chosen} loading={copy.isPending} onClick={run}>
          <Copy className="h-4 w-4" aria-hidden="true" />
          Sao chép
        </Button>
        <span className="text-small text-muted-foreground">hoặc</span>
        <Button type="button" variant="outline" onClick={onAddManually}>
          Tự thêm từng lỗi
        </Button>
      </div>
      <p aria-live="polite" className="min-h-5 text-small text-foreground">
        {chosen ? copyPreviewText(copyStats(chosen, target)) : ''}
      </p>
      {copy.isError && <p role="alert" className="text-small font-medium text-danger-strong">{copy.error.message}</p>}
    </div>
  );
}
```
(Test `getByText(/Sẽ sao chép 5 lỗi vào…/)` matches the single `<p>`; the destructive text uses `getByText('Không tìm thấy rubric')`. `Button variant="primary"` is indigo.)

`ReadinessBanner.tsx`:

```tsx
'use client';

import { Check, Info, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { RubricErrorItem, RubricOverview } from '@/lib/api/rubric-errors';
import { capNames, copySources, shorten, statusOf, type BoardTask } from '@/lib/rubric-board';
import { CopyFromRubric } from './CopyFromRubric';

const TONE = {
  new: { box: 'border-primary/20 bg-primary-subtle text-primary', icon: 'bg-primary text-primary-foreground', Icon: Info },
  ready: { box: 'border-success/30 bg-success-subtle text-success-strong', icon: 'bg-success text-white', Icon: Check },
  todo: { box: 'border-warning/40 bg-warning-subtle text-warning-strong', icon: 'bg-warning text-foreground', Icon: TriangleAlert },
} as const;

/**
 * Dải trạng thái của rubric đang mở (spec mục 5.3): thay bốn thẻ số cũ. Mỗi dòng việc là MỘT NÚT làm đúng việc đó —
 * kể cả "lỗi AI thấy mà chưa tính điểm", thứ trước đây nằm chôn dưới cuối trang.
 */
export function ReadinessBanner({
  overview,
  overviews,
  errors,
  onAddManually,
  onGoToCriterion,
  onOpenProposals,
  onOpenDangling,
}: {
  overview: RubricOverview;
  overviews: RubricOverview[];
  /** Danh sách lỗi của rubric; chưa tải xong thì `undefined`. */
  errors: RubricErrorItem[] | undefined;
  onAddManually: () => void;
  onGoToCriterion: (criterionKey: string) => void;
  onOpenProposals: () => void;
  onOpenDangling: () => void;
}) {
  const { status, tasks } = statusOf(overview);
  const tone = TONE[status];
  const heading =
    status === 'new' ? 'Rubric mới — chưa có lỗi nào' : status === 'ready' ? 'Sẵn sàng chấm tự động' : `Chưa sẵn sàng chấm tự động — còn ${tasks.length} việc`;

  const row = (task: BoardTask) => {
    switch (task.kind) {
      case 'empty_criteria':
        return (
          <>
            <span>
              <b>{capNames(task.criteria.map((c) => shorten(c.description)), 2, 'tiêu chí')}</b> chưa có lỗi nào.
            </span>
            <button type="button" onClick={() => onGoToCriterion(task.criteria[0].key)}>
              Thêm lỗi
            </button>
          </>
        );
      case 'unpriced': {
        // Cuộn tới tiêu chí chứa lỗi chưa có điểm trừ đầu tiên; danh sách lỗi chưa về thì tới nhóm đầu tiên.
        const first = errors?.find((e) => e.deduction === null)?.criterionKey ?? overview.criteria[0]?.key;
        return (
          <>
            <span>
              <b>{task.count} lỗi</b> chưa có điểm trừ.
            </span>
            <button type="button" onClick={() => first && onGoToCriterion(first)}>
              Đặt điểm trừ
            </button>
          </>
        );
      }
      case 'proposals':
        return (
          <>
            <span>
              <b>{task.count} lỗi AI thấy</b> khi chấm nhưng chưa có trong bảng — đang bị bỏ ra khỏi điểm.
            </span>
            <button type="button" onClick={onOpenProposals}>
              Xem lỗi AI đề xuất
            </button>
          </>
        );
      case 'dangling':
        return (
          <>
            <span>
              <b>{task.count} lỗi</b> đang gắn vào tiêu chí không còn trong rubric.
            </span>
            <button type="button" onClick={onOpenDangling}>
              Chuyển sang tiêu chí khác
            </button>
          </>
        );
    }
  };

  return (
    <div role="status" className={cn('mt-[18px] flex gap-3.5 rounded-lg border px-4 py-3.5', tone.box)}>
      <div className={cn('grid h-[34px] w-[34px] shrink-0 place-items-center rounded-full', tone.icon)}>
        <tone.Icon className="h-4 w-4" aria-hidden="true" />
      </div>
      <div className="flex-1">
        <h2 className="text-body font-bold">{heading}</h2>
        {status === 'new' && (
          <>
            <p className="mt-0.5 text-small">Khi chưa có lỗi, mọi bài chấm theo rubric này sẽ chuyển sang “Cần bạn xem” thay vì tự duyệt.</p>
            <CopyFromRubric target={overview} sources={copySources(overviews, overview.rubricName)} onAddManually={onAddManually} />
          </>
        )}
        {status === 'ready' && <p className="mt-0.5 text-small">Mọi tiêu chí đều có lỗi và điểm trừ, và AI chưa báo lỗi nào ngoài bảng.</p>}
        {status === 'todo' && (
          <>
            <p className="mt-0.5 text-small">Cho tới khi xong, bài chấm theo rubric này sẽ chuyển sang “Cần bạn xem” thay vì tự duyệt.</p>
            <ul className="mt-2.5 flex flex-col gap-1.5">
              {tasks.map((task) => (
                <li key={task.kind} className="flex items-center gap-2.5 text-small [&_button]:font-semibold [&_button]:underline [&_button]:underline-offset-2">
                  <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
                  {row(task)}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
```
Note (`ReadinessBanner.test`): in the "rubric mới" case the heading contains "Rubric mới — chưa có lỗi nào"; the `role="status"` wrapper is the banner.

- [ ] **Step 3: Run, lint, commit**

```powershell
pnpm exec vitest run src/app/teacher/rules/_components/CopyFromRubric.test.tsx src/app/teacher/rules/_components/ReadinessBanner.test.tsx
pnpm exec tsc --noEmit
pnpm exec eslint src/app/teacher/rules
```
Expected: PASS. The `ReadinessBanner` test mocks `useCopyErrors` with `mutation()` called per render — fine because the module-level mock returns a fresh stub each call and the test never inspects it.

```bash
git add apps/web/src/app/teacher/rules
git commit -m "feat(web): readiness banner and copy-from-rubric with user-chosen source"
```

---

## Task B6: "Lỗi theo tiêu chí" tab — groups, rows, price popover, row menu (T-RBE-UI-2, UI-4, UI-8)

**Files:**
- Create: `components/ui/popover.tsx` (+ `popover.test.tsx`); `_components/DetectionBadge.tsx`, `UsesMore.tsx`, `PricePopover.tsx`, `ErrorMenu.tsx`, `ErrorRow.tsx`, `CriterionGroup.tsx`, `ErrorDialogs.tsx`, `ErrorsTab.tsx`; tests `PricePopover.test.tsx`, `ErrorDialogs.test.tsx`, `ErrorsTab.test.tsx`

**Interfaces — Produces:**

```tsx
<Popover open onOpenChange(open) anchor={ReactNode} label={string} className? >{children}</Popover>
<DetectionBadge predicate={RulePredicate | null} />
<UsesMore label title items={{ key; name; sub?; value }[]} onPick?(name) />
<PricePopover item={RubricErrorItem} rubricName criterion?={OverviewCriterion} onClose />        // keyed by item.id by the caller
<ErrorMenu item onEdit onMove onRemove />
export const ROW_GRID: string                                                                      // shared grid template
<ErrorRow item criterion? rubricName pricingOpen onPricingOpenChange onEdit onMove onRemove onOpenRubric />
<CriterionGroup criterion errors open onToggle onAdd onWaive onUnwaive>{rows}</CriterionGroup>
<MoveErrorDialog item={RubricErrorItem | null} criteria={OverviewCriterion[]} onClose />  <RemoveErrorDialog item rubricName onClose />
export const DANGLING_KEY = '__dangling'
<ErrorsTab overview errors={RubricErrorItem[] | undefined} loading error={Error | null}
   focus={{ key: string; n: number } | null} onAdd(criterionKey: string | null) onEdit(item) onWaive(criterion) onUnwaive(criterion) onOpenRubric(name) />
```

- [ ] **Step 1: Write the failing tests**

`components/ui/popover.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { Popover } from './popover';

const mount = (open: boolean, onOpenChange = vi.fn()) =>
  render(
    <div>
      <button type="button">ngoài</button>
      <Popover open={open} onOpenChange={onOpenChange} label="Sửa điểm trừ" anchor={<button type="button">mở</button>}>
        <input aria-label="trong" />
      </Popover>
    </div>,
  );

describe('Popover', () => {
  it('đóng thì không có nội dung', () => {
    mount(false);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'mở' })).toBeInTheDocument();
  });

  it('mở thì có hộp thoại mang nhãn', () => {
    mount(true);
    expect(screen.getByRole('dialog', { name: 'Sửa điểm trừ' })).toBeInTheDocument();
  });

  it('bấm ra ngoài thì đóng; bấm bên trong thì không', () => {
    const onOpenChange = vi.fn();
    mount(true, onOpenChange);
    fireEvent.mouseDown(screen.getByLabelText('trong'));
    expect(onOpenChange).not.toHaveBeenCalled();
    fireEvent.mouseDown(screen.getByRole('button', { name: 'ngoài' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('Esc đóng và trả tiêu điểm về nút neo', () => {
    const onOpenChange = vi.fn();
    mount(true, onOpenChange);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(screen.getByRole('button', { name: 'mở' })).toHaveFocus();
  });

  it('không lắng nghe gì khi đang đóng (không đóng nhầm cái khác)', () => {
    const onOpenChange = vi.fn();
    mount(false, onOpenChange);
    fireEvent.mouseDown(document.body);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
```

`PricePopover.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { toast } from 'sonner';
import { PricePopover } from './PricePopover';
import { criterion, errorItem } from './fixtures';
import type { PricePreview } from '@/lib/api/rules';

const previewMutate = vi.fn();
const previewReset = vi.fn();
const saveMutate = vi.fn();
let previewData: PricePreview | undefined;
let previewError: Error | null;
let saveError: Error | null;

vi.mock('@/hooks/useRubricErrors', () => ({
  usePreviewErrorPrice: () => ({
    mutate: previewMutate,
    reset: previewReset,
    get data() {
      return previewData;
    },
    isPending: false,
    isError: previewError !== null,
    error: previewError,
  }),
  useSetErrorPrice: () => ({ mutate: saveMutate, isPending: false, isError: saveError !== null, error: saveError }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const RECOMPUTE = { recomputed: 9, promoted: 3, demoted: 0, belowFloor: 0 };
const IMPACT: PricePreview = {
  openSessions: [
    { sessionId: 's1', name: 'Giữa kỳ N01', affected: 4, autoAfter: 3, blockedByOtherUnpriced: 1 },
    { sessionId: 's2', name: 'Kiểm tra tuần 6', affected: 5, autoAfter: 5, blockedByOtherUnpriced: 0 },
  ],
  finalizedSessions: [{ sessionId: 's3', name: 'Cuối kỳ cũ', affected: 3 }],
};

beforeEach(() => {
  vi.clearAllMocks();
  previewData = undefined;
  previewError = null;
  saveError = null;
  // Giả lập máy chủ trả lời ngay: xem trước thành công → cập nhật dữ liệu rồi gọi onSuccess.
  previewMutate.mockImplementation((_vars: unknown, opts?: { onSuccess?: () => void }) => {
    previewData = IMPACT;
    opts?.onSuccess?.();
  });
  saveMutate.mockImplementation((_vars: unknown, opts?: { onSuccess?: (r: unknown) => void }) =>
    opts?.onSuccess?.({ versionId: 'v2', recompute: RECOMPUTE }),
  );
});

const input = () => screen.getByLabelText('Điểm trừ') as HTMLInputElement;

function show(over: Partial<React.ComponentProps<typeof PricePopover>> = {}) {
  const onClose = vi.fn();
  const utils = render(<PricePopover item={errorItem({ id: 'e1' })} rubricName="Giữa kỳ CTDL" onClose={onClose} {...over} />);
  return { onClose, ...utils };
}

describe('PricePopover (T-RBE-UI-4)', () => {
  it('ô nhập điền sẵn điểm trừ hiện tại (dấu phẩy) và có tiêu điểm', () => {
    show();
    expect(input().value).toBe('1,5');
    expect(input()).toHaveFocus();
  });

  it('lỗi chưa có điểm trừ: tiêu đề "Đặt điểm trừ", ô trống, nói hệ quả của việc để trống', () => {
    show({ item: errorItem({ deduction: null }) });
    expect(screen.getByText('Đặt điểm trừ — Sai ca biên')).toBeInTheDocument();
    expect(input().value).toBe('');
    expect(screen.getByText(/Để trống = chưa có điểm trừ/)).toBeInTheDocument();
  });

  it('lỗi đã có điểm trừ: tiêu đề "Sửa điểm trừ" kèm tên lỗi', () => {
    show();
    expect(screen.getByText('Sửa điểm trừ — Sai ca biên')).toBeInTheDocument();
  });

  it('nói rõ chỉ áp cho rubric này và các rubric khác giữ điểm trừ riêng (bị chặn trần)', () => {
    show({
      item: errorItem({
        alsoIn: [
          { rubricName: 'Cuối kỳ CTDL', criterionKey: 'x', deduction: '2.00' },
          { rubricName: 'Diễn tập', criterionKey: 'x', deduction: null },
          { rubricName: 'Thi lại', criterionKey: 'x', deduction: null },
        ],
      }),
    });
    expect(screen.getByText(/Chỉ áp cho rubric “Giữa kỳ CTDL”/)).toBeInTheDocument();
    expect(screen.getByText(/Ở Cuối kỳ CTDL, Diễn tập và 1 rubric khác lỗi này giữ điểm trừ riêng/)).toBeInTheDocument();
  });

  it('rời ô với "1,5" → xem trước với CHUỖI "1.5" (máy chủ từ chối số JSON)', () => {
    show({ item: errorItem({ deduction: null }) });
    fireEvent.change(input(), { target: { value: '1,5' } });
    fireEvent.blur(input());
    expect(previewMutate).toHaveBeenCalledWith({ rubricErrorId: 'e1', deduction: '1.5' }, expect.anything());
  });

  it('không hợp lệ ("abc") → thông báo cạnh ô, KHÔNG gọi xem trước', () => {
    show({ item: errorItem({ deduction: null }) });
    fireEvent.change(input(), { target: { value: 'abc' } });
    fireEvent.blur(input());
    expect(screen.getByText('Điểm trừ: số không âm, tối đa hai chữ số lẻ.')).toBeInTheDocument();
    expect(previewMutate).not.toHaveBeenCalled();
  });

  it('chưa xem trước thì chưa lưu được (T-UI-2)', () => {
    show();
    expect(screen.getByRole('button', { name: 'Lưu' })).toBeDisabled();
  });

  it('sau khi xem trước: nút lưu nói đúng số bài bị tính lại và bật lên', () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Xem tác động' }));
    expect(screen.getByRole('button', { name: 'Lưu và tính lại 9 bài' })).toBeEnabled();
  });

  it('bảng tác động: từng phiên chưa chốt, bài tự quyết được, bài còn chờ lỗi khác', () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Xem tác động' }));
    expect(screen.getByText('Giữa kỳ N01')).toBeInTheDocument();
    expect(screen.getByText('Kiểm tra tuần 6')).toBeInTheDocument();
    expect(screen.getByText(/3 bài đủ điều kiện tự quyết/)).toBeInTheDocument();
    expect(screen.getByText(/1 bài vẫn chờ vì còn dính lỗi khác chưa có điểm trừ/)).toBeInTheDocument();
  });

  it('phiên đã chốt: nói giữ nguyên điểm và vì sao (bảng điểm trừ ghim lúc chốt)', () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Xem tác động' }));
    expect(screen.getByText(/3 bài thuộc phiên đã chốt: giữ nguyên điểm/)).toBeInTheDocument();
  });

  it('chưa áp vào bài nào thì nói vậy', () => {
    previewMutate.mockImplementation((_v: unknown, opts?: { onSuccess?: () => void }) => {
      previewData = { openSessions: [], finalizedSessions: [] };
      opts?.onSuccess?.();
    });
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Xem tác động' }));
    expect(screen.getByText('Điểm trừ này chưa áp vào bài nào.')).toBeInTheDocument();
  });

  it('đổi số sau khi xem trước → xoá xem trước cũ và khoá nút lưu (không lưu theo tác động của số cũ)', () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Xem tác động' }));
    expect(screen.getByRole('button', { name: /Lưu và tính lại/ })).toBeEnabled();
    fireEvent.change(input(), { target: { value: '2' } });
    expect(previewReset).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Lưu' })).toBeDisabled();
  });

  it('lưu gửi đúng dòng + chuỗi điểm trừ, báo bằng lời kết quả tính lại, rồi đóng', () => {
    const { onClose } = show();
    fireEvent.change(input(), { target: { value: '2,25' } });
    fireEvent.click(screen.getByRole('button', { name: 'Xem tác động' }));
    fireEvent.click(screen.getByRole('button', { name: /Lưu và tính lại/ }));
    expect(saveMutate).toHaveBeenCalledWith({ rubricErrorId: 'e1', deduction: '2.25' }, expect.anything());
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('Đã lưu điểm trừ −2,25. Đã tính lại 9 bài: 3 bài đủ điều kiện tự quyết.'));
    expect(onClose).toHaveBeenCalled();
  });

  it('để trống ô = gửi null tường minh (chưa có điểm trừ), không phải bỏ qua', () => {
    show({ item: errorItem({ deduction: null }) });
    fireEvent.click(screen.getByRole('button', { name: 'Xem tác động' }));
    expect(previewMutate).toHaveBeenCalledWith({ rubricErrorId: 'e1', deduction: null }, expect.anything());
    fireEvent.click(screen.getByRole('button', { name: /Lưu và tính lại/ }));
    expect(saveMutate).toHaveBeenCalledWith({ rubricErrorId: 'e1', deduction: null }, expect.anything());
  });

  it('lỗi từ máy chủ khi lưu / khi xem trước hiện nguyên văn', () => {
    saveError = new Error('Không tìm thấy lỗi trong rubric');
    previewError = new Error('mức trừ: chuỗi thập phân tối đa hai chữ số lẻ, không âm');
    show();
    expect(screen.getByText('Không tìm thấy lỗi trong rubric')).toBeInTheDocument();
    expect(screen.getByText('mức trừ: chuỗi thập phân tối đa hai chữ số lẻ, không âm')).toBeInTheDocument();
  });

  it('có tiêu chí → nói điểm tối đa và rằng điểm trừ cao hơn vẫn lưu được; không có tiêu chí thì không bịa', () => {
    const { unmount } = show({ criterion: criterion({ key: 'tinh_dung', description: 'Tính đúng đắn', maxPoints: 4 }) });
    expect(screen.getByText(/“Tính đúng đắn” tối đa 4,0 điểm/)).toBeInTheDocument();
    expect(screen.getByText(/Điểm trừ cao hơn mức tối đa vẫn lưu được/)).toBeInTheDocument();
    unmount();
    show();
    expect(screen.queryByText(/tối đa 4,0/)).not.toBeInTheDocument();
  });

  it('"Huỷ" đóng mà không lưu', () => {
    const { onClose } = show();
    fireEvent.click(screen.getByRole('button', { name: 'Huỷ' }));
    expect(onClose).toHaveBeenCalled();
    expect(saveMutate).not.toHaveBeenCalled();
  });
});
```

`ErrorDialogs.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { toast } from 'sonner';
import { MoveErrorDialog, RemoveErrorDialog } from './ErrorDialogs';
import { criterion, errorItem, mutation } from './fixtures';

const h = vi.hoisted(() => ({ move: undefined as unknown, remove: undefined as unknown }));
vi.mock('@/hooks/useRubricErrors', () => ({ useMoveError: () => h.move, useRemoveError: () => h.remove }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const RECOMPUTE = { recomputed: 2, promoted: 0, demoted: 1, belowFloor: 0 };
const criteria = [
  criterion({ key: 'tinh_dung', description: 'Tính đúng đắn' }),
  criterion({ key: 'bo_nho', description: 'Quản lý bộ nhớ', maxPoints: 2 }),
  criterion({ key: 'trinh_bay', description: 'Trình bày', maxPoints: 2 }),
];

beforeEach(() => {
  vi.clearAllMocks();
  h.move = mutation();
  h.remove = mutation();
});

describe('MoveErrorDialog', () => {
  it('chỉ mời chọn tiêu chí KHÁC; chưa chọn thì chưa xác nhận được', () => {
    render(<MoveErrorDialog item={errorItem({ criterionKey: 'tinh_dung' })} criteria={criteria} onClose={vi.fn()} />);
    const options = screen.getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual(['Chọn tiêu chí…', 'Quản lý bộ nhớ · tối đa 2,0', 'Trình bày · tối đa 2,0']);
    expect(screen.getByRole('button', { name: 'Chuyển' })).toBeDisabled();
  });

  it('lỗi mồ côi (tiêu chí không còn): mọi tiêu chí hiện hành đều là lựa chọn', () => {
    render(<MoveErrorDialog item={errorItem({ criterionKey: 'da_xoa', criterionDangling: true })} criteria={criteria} onClose={vi.fn()} />);
    expect(screen.getAllByRole('option')).toHaveLength(4);
  });

  it('xác nhận gửi đúng dòng + tiêu chí, báo bằng lời, rồi đóng', () => {
    const onClose = vi.fn();
    render(<MoveErrorDialog item={errorItem({ id: 'e9' })} criteria={criteria} onClose={onClose} />);
    fireEvent.change(screen.getByLabelText('Tiêu chí mới'), { target: { value: 'bo_nho' } });
    fireEvent.click(screen.getByRole('button', { name: 'Chuyển' }));
    const m = (h.move as ReturnType<typeof mutation>).mutate;
    expect(m).toHaveBeenCalledWith({ rubricErrorId: 'e9', criterionKey: 'bo_nho' }, expect.anything());
    m.mock.calls[0][1].onSuccess({ recompute: RECOMPUTE });
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('Đã chuyển “Sai ca biên” sang “Quản lý bộ nhớ”.'));
    expect(onClose).toHaveBeenCalled();
  });

  it('lỗi của máy chủ hiện nguyên văn và không đóng', () => {
    (h.move as ReturnType<typeof mutation>).isError = true;
    (h.move as ReturnType<typeof mutation>).error = new Error('Tiêu chí "x" không có trong rubric');
    const onClose = vi.fn();
    render(<MoveErrorDialog item={errorItem()} criteria={criteria} onClose={onClose} />);
    expect(screen.getByText('Tiêu chí "x" không có trong rubric')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('item = null thì không hiện gì', () => {
    render(<MoveErrorDialog item={null} criteria={criteria} onClose={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('RemoveErrorDialog', () => {
  it('nói hậu quả: lỗi còn ở thư viện, rubric khác không đổi, bài chưa chốt của rubric này tính lại', () => {
    render(<RemoveErrorDialog item={errorItem()} rubricName="Giữa kỳ CTDL" onClose={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Gỡ “Sai ca biên” khỏi rubric “Giữa kỳ CTDL”?' })).toBeInTheDocument();
    expect(screen.getByText(/Lỗi vẫn còn trong Thư viện lỗi, các rubric khác không đổi/)).toBeInTheDocument();
    expect(screen.getByText(/bài chưa chốt của rubric này được tính lại/)).toBeInTheDocument();
  });

  it('xác nhận gửi id dòng áp dụng, báo kết quả, đóng', () => {
    const onClose = vi.fn();
    render(<RemoveErrorDialog item={errorItem({ id: 'e5' })} rubricName="A" onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Gỡ khỏi rubric này' }));
    const m = (h.remove as ReturnType<typeof mutation>).mutate;
    expect(m).toHaveBeenCalledWith('e5', expect.anything());
    m.mock.calls[0][1].onSuccess({ recompute: RECOMPUTE });
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('Đã gỡ “Sai ca biên” khỏi “A”.'));
    expect(onClose).toHaveBeenCalled();
  });

  it('Huỷ không gửi gì', () => {
    const onClose = vi.fn();
    render(<RemoveErrorDialog item={errorItem()} rubricName="A" onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Huỷ' }));
    expect(onClose).toHaveBeenCalled();
    expect((h.remove as ReturnType<typeof mutation>).mutate).not.toHaveBeenCalled();
  });
});
```

`ErrorsTab.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ErrorsTab } from './ErrorsTab';
import { criterion, errorItem, mutation, overview } from './fixtures';
import type { RubricErrorItem, RubricOverview } from '@/lib/api/rubric-errors';

vi.mock('@/hooks/useRubricErrors', () => ({
  usePreviewErrorPrice: () => mutation(),
  useSetErrorPrice: () => mutation(),
  useMoveError: () => mutation(),
  useRemoveError: () => mutation(),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const board = (): RubricOverview =>
  overview({
    criteria: [
      criterion({ key: 'tinh_dung', description: 'Tính đúng đắn', maxPoints: 6, errorCount: 2 }),
      criterion({ key: 'bo_nho', description: 'Quản lý bộ nhớ', maxPoints: 2, errorCount: 0 }),
      criterion({ key: 'trinh_bay', description: 'Trình bày', maxPoints: 2, errorCount: 0, waiverId: 'w1' }),
    ],
  });

const rows = (): RubricErrorItem[] => [
  errorItem({ id: 'e1', ruleId: 'r1', name: 'Sai ca biên', criterionKey: 'tinh_dung', deduction: '2.00' }),
  errorItem({
    id: 'e2',
    ruleId: 'r2',
    name: 'Đặt tên biến',
    description: 'Tên biến khó hiểu',
    predicate: null,
    checkedBy: 'model',
    criterionKey: 'tinh_dung',
    deduction: null,
    appliedTo: { results: 0, sessions: 0 },
  }),
];

function mount(over: Partial<React.ComponentProps<typeof ErrorsTab>> = {}) {
  const handlers = { onAdd: vi.fn(), onEdit: vi.fn(), onWaive: vi.fn(), onUnwaive: vi.fn(), onOpenRubric: vi.fn() };
  const props = { overview: board(), errors: rows(), loading: false, error: null, focus: null, ...handlers, ...over };
  render(<ErrorsTab {...props} />);
  return handlers;
}

beforeEach(() => vi.clearAllMocks());

describe('ErrorsTab — nhóm theo tiêu chí (T-RBE-UI-2)', () => {
  it('mỗi tiêu chí một nhóm: tên, số lỗi, điểm tối đa — không hiện khoá kỹ thuật', () => {
    mount();
    const group = screen.getByRole('region', { name: 'Tính đúng đắn' });
    expect(within(group).getByText('2 lỗi')).toBeInTheDocument();
    expect(within(group).getByText('6,0')).toBeInTheDocument();
    expect(screen.queryByText('tinh_dung')).not.toBeInTheDocument();
    expect(screen.queryByText('sai_ca_bien')).not.toBeInTheDocument();
  });

  it('chú giải hai cách phát hiện hiển thị sẵn, không phải tooltip', () => {
    mount();
    expect(screen.getByText(/Máy so kết quả chạy test với đáp án: chắc chắn, không cần bạn xem/)).toBeInTheDocument();
    expect(screen.getByText(/AI đọc mã rồi kết luận: kém chắc chắn hơn nên có thể cần bạn duyệt/)).toBeInTheDocument();
  });

  it('dòng lỗi: tên, mô tả, cách phát hiện, điểm trừ, đã gặp', () => {
    mount();
    const row = screen.getByText('Sai ca biên').closest('[data-testid="error-row"]') as HTMLElement;
    expect(within(row).getByText('Tự động')).toBeInTheDocument();
    expect(within(row).getByRole('button', { name: /Sửa điểm trừ Sai ca biên, hiện −2,0/ })).toBeInTheDocument();
    expect(within(row).getByText('5 bài · 2 phiên')).toBeInTheDocument();
    const ai = screen.getByText('Đặt tên biến').closest('[data-testid="error-row"]') as HTMLElement;
    expect(within(ai).getByText('AI đọc bài')).toBeInTheDocument();
    expect(within(ai).getByText('Chưa gặp bài nào')).toBeInTheDocument();
  });

  it('lỗi chưa có điểm trừ: nhãn cảnh báo và nút "Đặt điểm trừ" mở ô nổi', () => {
    mount();
    expect(screen.getByText('Chưa có điểm trừ')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Đặt điểm trừ' }));
    expect(screen.getByRole('dialog', { name: 'Đặt điểm trừ Đặt tên biến' })).toBeInTheDocument();
  });

  it('bấm số điểm trừ mở ô nổi điền sẵn; mở ô khác thì ô cũ đóng', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: /Sửa điểm trừ Sai ca biên/ }));
    expect((screen.getByLabelText('Điểm trừ') as HTMLInputElement).value).toBe('2,0');
    fireEvent.click(screen.getByRole('button', { name: 'Đặt điểm trừ' }));
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByRole('dialog', { name: 'Đặt điểm trừ Đặt tên biến' })).toBeInTheDocument();
  });

  it('cộng điểm trừ vượt điểm tối đa thì nhắc: bài chỉ bị trừ tới mức tối đa', () => {
    mount({
      errors: [errorItem({ id: 'a', deduction: '4.00' }), errorItem({ id: 'b', name: 'Khác', deduction: '3.00' })],
      overview: overview({ criteria: [criterion({ key: 'tinh_dung', description: 'Tính đúng đắn', maxPoints: 6, errorCount: 2 })] }),
    });
    expect(screen.getByText('Cộng hết các lỗi là 7,0, vượt điểm tối đa 6,0 — bài chỉ bị trừ tới 6,0.')).toBeInTheDocument();
  });

  it('gập nhóm ẩn các dòng lỗi', () => {
    mount();
    const group = screen.getByRole('region', { name: 'Tính đúng đắn' });
    fireEvent.click(within(group).getByRole('button', { expanded: true }));
    expect(screen.queryByText('Sai ca biên')).not.toBeInTheDocument();
  });

  it('"Thêm lỗi vào …" mở ngăn kéo với tiêu chí đã biết', () => {
    const h = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Thêm lỗi vào “Tính đúng đắn”' }));
    expect(h.onAdd).toHaveBeenCalledWith('tinh_dung');
  });
});

describe('ErrorsTab — tiêu chí chưa có lỗi và tiêu chí không trừ điểm', () => {
  it('chưa có lỗi: nói hậu quả và đưa hai lối đi', () => {
    const h = mount();
    const group = screen.getByRole('region', { name: 'Quản lý bộ nhớ' });
    expect(within(group).getByText('Chưa có lỗi nào cho tiêu chí này.')).toBeInTheDocument();
    fireEvent.click(within(group).getByRole('button', { name: 'Thêm lỗi đầu tiên' }));
    expect(h.onAdd).toHaveBeenCalledWith('bo_nho');
    fireEvent.click(within(group).getByRole('button', { name: 'Tiêu chí này không trừ điểm' }));
    expect(h.onWaive).toHaveBeenCalledWith(expect.objectContaining({ key: 'bo_nho' }));
  });

  it('đã đánh dấu không trừ điểm: nói trọn điểm và cho bỏ đánh dấu', () => {
    const h = mount();
    const group = screen.getByRole('region', { name: 'Trình bày' });
    expect(within(group).getByText(/mọi bài được trọn 2,0 điểm/)).toBeInTheDocument();
    fireEvent.click(within(group).getByRole('button', { name: 'Bỏ đánh dấu' }));
    expect(h.onUnwaive).toHaveBeenCalledWith(expect.objectContaining({ key: 'trinh_bay' }));
  });
});

describe('ErrorsTab — lỗi dùng chung', () => {
  const shared = errorItem({
    id: 'e1',
    alsoIn: [
      { rubricName: 'Cuối kỳ CTDL', criterionKey: 'tinh_dung', deduction: '3.00' },
      { rubricName: 'Diễn tập', criterionKey: 'tinh_dung', deduction: null },
      { rubricName: 'Thi lại', criterionKey: 'tinh_dung', deduction: '1.00' },
    ],
  });

  it('nói lỗi này còn ở rubric nào và trừ bao nhiêu; chặn trần hai tên', () => {
    mount({ errors: [shared] });
    // Khối chứa cả câu lẫn nút "N rubric khác" là một <div> (nút mở ô nổi là <div> nên không được nằm trong <p>).
    expect(screen.getByText(/Cũng dùng ở/).closest('div')).toHaveTextContent(
      'Cuối kỳ CTDL (−3,0); Diễn tập (chưa có điểm trừ) và 1 rubric khác',
    );
  });

  it('"N rubric khác" mở danh sách đầy đủ; bấm một dòng chuyển sang rubric đó (T-RBE-UI-8)', () => {
    const h = mount({ errors: [shared] });
    fireEvent.click(screen.getByRole('button', { name: '1 rubric khác' }));
    const list = screen.getByRole('dialog', { name: 'Sai ca biên — đang dùng ở 3 rubric khác' });
    expect(within(list).getByText('Thi lại')).toBeInTheDocument();
    fireEvent.click(within(list).getByRole('button', { name: /Thi lại/ }));
    expect(h.onOpenRubric).toHaveBeenCalledWith('Thi lại');
  });
});

describe('ErrorsTab — menu ⋯ của dòng', () => {
  const open = (name = 'Sai ca biên') => fireEvent.keyDown(screen.getByRole('button', { name: `Thao tác với ${name}` }), { key: 'Enter' });

  it('Sửa tên, mô tả, cách phát hiện → onEdit với đúng dòng', () => {
    const h = mount();
    open();
    fireEvent.click(screen.getByRole('menuitem', { name: /Sửa tên, mô tả, cách phát hiện/ }));
    expect(h.onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 'e1' }));
  });

  it('nói lỗi này đang dùng ở mấy rubric', () => {
    mount({ errors: [errorItem({ alsoIn: [{ rubricName: 'B', criterionKey: 'x', deduction: null }] })] });
    open();
    expect(screen.getByText('Lỗi này đang dùng ở 2 rubric — bạn chọn đổi cả 2 hoặc chỉ rubric này')).toBeInTheDocument();
  });

  it('Chuyển sang tiêu chí khác mở hộp thoại; Gỡ khỏi rubric này mở hộp xác nhận', () => {
    mount();
    open();
    fireEvent.click(screen.getByRole('menuitem', { name: /Chuyển sang tiêu chí khác/ }));
    expect(screen.getByRole('heading', { name: /Chuyển “Sai ca biên” sang tiêu chí khác/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Huỷ' }));
    open();
    fireEvent.click(screen.getByRole('menuitem', { name: /Gỡ khỏi rubric này/ }));
    expect(screen.getByRole('heading', { name: /Gỡ “Sai ca biên” khỏi rubric/ })).toBeInTheDocument();
  });
});

describe('ErrorsTab — lỗi gắn tiêu chí không còn (Review Focus 4)', () => {
  const orphans = [
    errorItem({ id: 'o1', name: 'Mồ côi A', criterionKey: 'da_xoa', criterionDangling: true }),
    // Máy chủ không đánh dấu nhưng khoá không có trong tổng quan (hai lần đọc lệch nhau): vẫn phải hiện, không văng.
    errorItem({ id: 'o2', name: 'Mồ côi B', criterionKey: 'khong_ai_biet', criterionDangling: false }),
  ];

  it('hiện ở nhóm "Chưa có tiêu chí" cuối trang, kèm lời giải thích', () => {
    mount({ errors: [...rows(), ...orphans] });
    const group = screen.getByRole('region', { name: 'Chưa có tiêu chí' });
    expect(within(group).getByText('Mồ côi A')).toBeInTheDocument();
    expect(within(group).getByText('Mồ côi B')).toBeInTheDocument();
    expect(within(group).getByText('2 lỗi')).toBeInTheDocument();
    expect(within(group).getByText(/Chuyển chúng sang tiêu chí khác hoặc gỡ khỏi rubric/)).toBeInTheDocument();
  });

  it('vẫn chuyển được và gỡ được', () => {
    mount({ errors: orphans });
    fireEvent.keyDown(screen.getByRole('button', { name: 'Thao tác với Mồ côi A' }), { key: 'Enter' });
    fireEvent.click(screen.getByRole('menuitem', { name: /Chuyển sang tiêu chí khác/ }));
    expect(screen.getAllByRole('option').length).toBeGreaterThan(1);
  });

  it('không có lỗi mồ côi thì không có nhóm đó', () => {
    mount();
    expect(screen.queryByRole('region', { name: 'Chưa có tiêu chí' })).not.toBeInTheDocument();
  });
});

describe('ErrorsTab — tải, lỗi, và nhảy tới một nhóm', () => {
  const noop = { onAdd: vi.fn(), onEdit: vi.fn(), onWaive: vi.fn(), onUnwaive: vi.fn(), onOpenRubric: vi.fn() };

  it('đang tải / lỗi tải', () => {
    const { unmount } = render(<ErrorsTab overview={board()} errors={undefined} loading error={null} focus={null} {...noop} />);
    expect(screen.getByText('Đang tải…')).toBeInTheDocument();
    unmount();
    render(<ErrorsTab overview={board()} errors={undefined} loading={false} error={new Error('Máy chủ không trả lời')} focus={null} {...noop} />);
    expect(screen.getByText(/Không tải được danh sách lỗi — Máy chủ không trả lời/)).toBeInTheDocument();
  });

  it('focus mở lại nhóm đang gập và cuộn tới nó', () => {
    const spy = vi.spyOn(Element.prototype, 'scrollIntoView');
    const { rerender } = render(<ErrorsTab overview={board()} errors={rows()} loading={false} error={null} focus={null} {...noop} />);
    const group = screen.getByRole('region', { name: 'Tính đúng đắn' });
    fireEvent.click(within(group).getByRole('button', { expanded: true }));
    expect(screen.queryByText('Sai ca biên')).not.toBeInTheDocument();
    rerender(<ErrorsTab overview={board()} errors={rows()} loading={false} error={null} focus={{ key: 'tinh_dung', n: 1 }} {...noop} />);
    expect(screen.getByText('Sai ca biên')).toBeInTheDocument();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
```

Run `pnpm exec vitest run src/components/ui/popover.test.tsx src/app/teacher/rules/_components/PricePopover.test.tsx src/app/teacher/rules/_components/ErrorDialogs.test.tsx src/app/teacher/rules/_components/ErrorsTab.test.tsx` → Expected FAIL (modules missing).

- [ ] **Step 2: Implement the popover primitive and the small parts**

`components/ui/popover.tsx`:

```tsx
'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Ô nổi neo vào một nút. Không dùng Radix: dự án chưa có `@radix-ui/react-popover`, và thêm phụ thuộc npm
 * chỉ cho popover này là việc nặng không đáng. Đủ cho nhu cầu hiện có:
 * mở/đóng do bên ngoài điều khiển; đóng khi bấm ra ngoài hoặc nhấn Esc (trả tiêu điểm về nút neo).
 *
 * Neo ở mép phải của nút (`right-0`) vì mọi chỗ dùng đều nằm ở cột phải của một hàng.
 */
export function Popover({
  open,
  onOpenChange,
  anchor,
  label,
  children,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anchor: ReactNode;
  /** Tên của hộp thoại cho trình đọc màn hình. */
  label: string;
  children: ReactNode;
  className?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) onOpenChange(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      onOpenChange(false);
      wrapRef.current?.querySelector<HTMLElement>('[data-popover-anchor] button, [data-popover-anchor] a')?.focus();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onOpenChange]);

  return (
    <div ref={wrapRef} className="relative inline-flex">
      <div data-popover-anchor className="inline-flex">
        {anchor}
      </div>
      {open && (
        <div
          role="dialog"
          aria-label={label}
          className={cn(
            'absolute right-0 top-full z-30 mt-1.5 flex w-[380px] max-w-[calc(100vw-2rem)] flex-col gap-3 rounded-lg border border-border bg-surface p-4 shadow-lg',
            className,
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
}
```

`_components/DetectionBadge.tsx`:

```tsx
import { Bot, Cpu } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { RulePredicate } from '@/lib/api/rules';
import { detectionOf } from '@/lib/error-form';

/** Hai cách phát hiện (D9). Lỗi cũ mang điều kiện lạ hiện như "AI đọc bài", ghi chú điều kiện nằm trong `title`. */
export function DetectionBadge({ predicate }: { predicate: RulePredicate | null }) {
  const d = detectionOf(predicate);
  if (d.detection === 'auto') {
    return (
      <Badge variant="primary">
        <Cpu className="h-3 w-3" aria-hidden="true" />
        Tự động
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-primary text-primary" title={d.legacyNote ? `Điều kiện cũ: ${d.legacyNote}` : undefined}>
      <Bot className="h-3 w-3" aria-hidden="true" />
      AI đọc bài
    </Badge>
  );
}
```

`_components/UsesMore.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { Popover } from '@/components/ui/popover';

export interface UseItem {
  key: string;
  name: string;
  sub?: string;
  value: string;
}

/** "và N rubric khác": mở danh sách đầy đủ, bấm một dòng để chuyển sang rubric đó (D7 — mọi chỗ liệt kê đều chặn trần). */
export function UsesMore({
  label,
  title,
  items,
  onPick,
}: {
  label: string;
  title: string;
  items: UseItem[];
  onPick?: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      label={title}
      anchor={
        <button type="button" className="font-semibold text-primary underline underline-offset-2" onClick={() => setOpen((v) => !v)}>
          {label}
        </button>
      }
    >
      <h3 className="text-body font-semibold">{title}</h3>
      <ul className="flex max-h-64 flex-col overflow-auto">
        {items.map((item) => (
          <li key={item.key}>
            <button
              type="button"
              className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left hover:bg-surface-2"
              onClick={() => {
                setOpen(false);
                onPick?.(item.name);
              }}
            >
              <span className="flex min-w-0 flex-col">
                <b className="truncate font-semibold">{item.name}</b>
                {item.sub && <span className="truncate text-small text-muted-foreground">{item.sub}</span>}
              </span>
              <span className="shrink-0 text-small font-semibold">{item.value}</span>
            </button>
          </li>
        ))}
      </ul>
    </Popover>
  );
}
```

`_components/PricePopover.tsx`:

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { Info, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { usePreviewErrorPrice, useSetErrorPrice } from '@/hooks/useRubricErrors';
import type { OverviewCriterion, RubricErrorItem } from '@/lib/api/rubric-errors';
import { formatVnPoints } from '@/lib/format';
import { capNames, shorten } from '@/lib/rubric-board';
import { describeRecompute, formatDeductionString, parseDeductionInput } from '@/lib/rules-vocab';

/**
 * Nội dung ô nổi "Đặt / Sửa điểm trừ" của MỘT dòng áp dụng (spec D1: điểm trừ riêng từng rubric). Người gọi `key`
 * nó theo id dòng để mỗi lỗi một trạng thái riêng.
 *
 * Giữ ba bài học của bảng đặt giá cũ: (1) ô nhập luôn hiện giá trị hiện tại; (2) lỗi khi xem trước / khi lưu hiện
 * nguyên văn; (3) "đã xem trước cho giá trị nào" là một state riêng (`previewedFor`) — đổi số thì xem trước cũ mất
 * và nút lưu khoá lại, nên không bao giờ lưu theo tác động của một số khác (T-POL-5).
 */
export function PricePopover({
  item,
  rubricName,
  criterion,
  onClose,
}: {
  item: RubricErrorItem;
  rubricName: string;
  /** Tiêu chí chứa lỗi, nếu biết — chỉ để nói điểm tối đa. */
  criterion?: OverviewCriterion;
  onClose: () => void;
}) {
  const [text, setText] = useState(item.deduction === null ? '' : formatVnPoints(Number(item.deduction)));
  const [fieldError, setFieldError] = useState<string | null>(null);
  /** Số mà bản xem trước đang hiện là của số nào; `undefined` = chưa xem trước. `null` là một giá trị hợp lệ. */
  const [previewedFor, setPreviewedFor] = useState<string | null | undefined>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);
  const preview = usePreviewErrorPrice();
  const save = useSetErrorPrice();

  useEffect(() => inputRef.current?.focus(), []);

  const parsed = parseDeductionInput(text);
  const canSave = parsed.ok && previewedFor !== undefined && previewedFor === parsed.value && !save.isPending;
  const others = item.alsoIn.map((a) => a.rubricName);

  function runPreview() {
    if (!parsed.ok) {
      setFieldError(parsed.message);
      return;
    }
    setFieldError(null);
    if (preview.isPending || previewedFor === parsed.value) return;
    const value = parsed.value;
    preview.mutate({ rubricErrorId: item.id, deduction: value }, { onSuccess: () => setPreviewedFor(value) });
  }

  const impact = previewedFor !== undefined ? preview.data : undefined;
  const openTotal = impact?.openSessions.reduce((sum, s) => sum + s.affected, 0) ?? 0;
  const finalTotal = impact?.finalizedSessions.reduce((sum, s) => sum + s.affected, 0) ?? 0;

  function submit() {
    if (!parsed.ok) return;
    const value = parsed.value;
    save.mutate(
      { rubricErrorId: item.id, deduction: value },
      {
        onSuccess: (r) => {
          toast.success(`Đã lưu điểm trừ ${value === null ? '(để trống)' : formatDeductionString(value)}. ${describeRecompute(r.recompute)}`);
          onClose();
        },
      },
    );
  }

  return (
    <>
      <h3 className="text-body font-semibold">
        {item.deduction === null ? 'Đặt' : 'Sửa'} điểm trừ — {item.name}
      </h3>
      <p className="text-small text-muted-foreground">
        Chỉ áp cho rubric “{rubricName}”.
        {others.length > 0 && ` Ở ${capNames(others, 2)} lỗi này giữ điểm trừ riêng.`}
      </p>

      <FormField
        id={`price-${item.id}`}
        label="Điểm trừ"
        error={fieldError ?? undefined}
        hint={
          <>
            {criterion && (
              <span className="block">
                “{shorten(criterion.description)}” tối đa {formatVnPoints(criterion.maxPoints)} điểm. Điểm trừ cao hơn mức tối đa vẫn lưu được, nhưng bài chỉ bị trừ tới mức tối đa.
              </span>
            )}
            {text.trim() === '' && (
              <span className="block">
                Để trống = chưa có điểm trừ: lỗi vẫn được ghi nhận, nhưng bài dính nó không tự quyết được cho tới khi bạn đặt điểm trừ.
              </span>
            )}
          </>
        }
      >
        <div className="flex items-center gap-2">
          <Input
            ref={inputRef}
            id={`price-${item.id}`}
            inputMode="decimal"
            value={text}
            invalid={fieldError !== null}
            placeholder={item.deduction === null ? 'Ví dụ 1,0' : `Hiện tại ${formatVnPoints(Number(item.deduction))}`}
            onChange={(event) => {
              setText(event.target.value);
              setFieldError(null);
              setPreviewedFor(undefined);
              preview.reset();
            }}
            onBlur={runPreview}
          />
          <Button type="button" variant="outline" onClick={runPreview} disabled={preview.isPending}>
            Xem tác động
          </Button>
        </div>
      </FormField>

      {preview.isError && (
        <Alert variant="destructive">
          <AlertDescription>{preview.error?.message}</AlertDescription>
        </Alert>
      )}

      {impact && (
        <section aria-label="Lưu thì điều gì xảy ra" className="overflow-hidden rounded-lg border border-border">
          <h3 className="bg-surface-2 px-3.5 py-2 text-small font-semibold">Lưu thì điều gì xảy ra</h3>
          <div className="flex flex-col gap-2 px-3.5 py-3 text-small">
            {impact.openSessions.length === 0 && impact.finalizedSessions.length === 0 && (
              <p className="text-muted-foreground">Điểm trừ này chưa áp vào bài nào.</p>
            )}
            {impact.openSessions.length > 0 && (
              <>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Đã gặp ở</span>
                  <strong className="tabular-nums">{openTotal} bài</strong>
                </div>
                {impact.openSessions.map((s) => (
                  <div key={s.sessionId} className="flex flex-col gap-0.5 pl-3">
                    <div className="flex justify-between">
                      <span>{s.name}</span>
                      <span className="tabular-nums">{s.affected} bài</span>
                    </div>
                    <span className="text-caption text-muted-foreground">{s.autoAfter} bài đủ điều kiện tự quyết sau khi lưu</span>
                    {s.blockedByOtherUnpriced > 0 && (
                      <span className="text-caption text-warning-strong">
                        {s.blockedByOtherUnpriced} bài vẫn chờ vì còn dính lỗi khác chưa có điểm trừ
                      </span>
                    )}
                  </div>
                ))}
                <p className="flex items-center gap-1.5 text-primary">
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                  {openTotal} bài được tính lại ngay với điểm trừ mới.
                </p>
              </>
            )}
            {impact.finalizedSessions.length > 0 && (
              <p className="flex items-start gap-1.5 rounded-md bg-surface-2 p-2.5 text-muted-foreground">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>
                  {finalTotal} bài thuộc phiên đã chốt: giữ nguyên điểm, vì bảng điểm trừ đã được ghim lúc chốt. Muốn áp điểm trừ mới cho phiên đó, dùng mục áp lại ở trang chấm điểm của phiên — mỗi bài đổi điểm có một dòng nhật ký.
                </span>
              </p>
            )}
          </div>
        </section>
      )}

      {save.isError && (
        <Alert variant="destructive">
          <AlertDescription>{save.error?.message}</AlertDescription>
        </Alert>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onClose}>
          Huỷ
        </Button>
        <Button type="button" variant="primary" size="sm" disabled={!canSave} loading={save.isPending} onClick={submit}>
          {impact ? `Lưu và tính lại ${openTotal} bài` : 'Lưu'}
        </Button>
      </div>
    </>
  );
}
```

`_components/ErrorMenu.tsx`:

```tsx
'use client';

import { Ellipsis } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import type { RubricErrorItem } from '@/lib/api/rubric-errors';

// Primitive dùng tông teal cho trạng thái focus; trang này chỉ dùng một màu chủ đạo (D13) nên ghi đè ở đây.
const ITEM = 'flex flex-col items-start gap-0.5 focus:bg-primary-subtle focus:text-primary';

/** Menu ⋯ của một dòng lỗi: sửa nội dung lỗi, chuyển tiêu chí, gỡ khỏi rubric này. */
export function ErrorMenu({
  item,
  onEdit,
  onMove,
  onRemove,
}: {
  item: RubricErrorItem;
  onEdit: () => void;
  onMove: () => void;
  onRemove: () => void;
}) {
  const rubrics = item.alsoIn.length + 1;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Thao tác với ${item.name}`}
          className="grid h-[34px] w-[34px] place-items-center rounded-md text-muted-foreground hover:bg-surface-2 hover:text-foreground"
        >
          <Ellipsis className="h-4 w-4" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuItem className={ITEM} onSelect={onEdit}>
          <span>Sửa tên, mô tả, cách phát hiện</span>
          <small className="text-caption text-muted-foreground">
            {rubrics > 1
              ? `Lỗi này đang dùng ở ${rubrics} rubric — bạn chọn đổi cả ${rubrics} hoặc chỉ rubric này`
              : 'Chỉ rubric này đang dùng lỗi này'}
          </small>
        </DropdownMenuItem>
        <DropdownMenuItem className={ITEM} onSelect={onMove}>
          <span>Chuyển sang tiêu chí khác</span>
          <small className="text-caption text-muted-foreground">Chỉ đổi ở rubric này</small>
        </DropdownMenuItem>
        <DropdownMenuItem className={`${ITEM} text-danger-strong focus:text-danger-strong`} onSelect={onRemove}>
          <span>Gỡ khỏi rubric này</span>
          <small className="text-caption text-muted-foreground">Lỗi vẫn còn trong thư viện, ở rubric khác không đổi</small>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

`_components/ErrorRow.tsx`:

```tsx
'use client';

import { Link2, Pencil, TriangleAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover } from '@/components/ui/popover';
import type { OverviewCriterion, RubricErrorItem } from '@/lib/api/rubric-errors';
import { deductionLabel, formatDeductionString } from '@/lib/rules-vocab';
import { DetectionBadge } from './DetectionBadge';
import { ErrorMenu } from './ErrorMenu';
import { PricePopover } from './PricePopover';
import { UsesMore } from './UsesMore';

/** Lưới của một dòng lỗi (từ lg trở lên): lỗi · cách phát hiện · điểm trừ · đã gặp · ⋯. Dưới lg các ô xếp dọc. */
export const ROW_GRID = 'lg:grid lg:grid-cols-[minmax(0,1fr)_150px_190px_130px_40px] lg:items-center lg:gap-3.5';

export function ErrorRow({
  item,
  criterion,
  rubricName,
  pricingOpen,
  onPricingOpenChange,
  onEdit,
  onMove,
  onRemove,
  onOpenRubric,
}: {
  item: RubricErrorItem;
  criterion?: OverviewCriterion;
  rubricName: string;
  pricingOpen: boolean;
  onPricingOpenChange: (open: boolean) => void;
  onEdit: () => void;
  onMove: () => void;
  onRemove: () => void;
  onOpenRubric: (name: string) => void;
}) {
  const unpriced = item.deduction === null;
  const shown = item.alsoIn.slice(0, 2);
  const more = item.alsoIn.length - shown.length;
  const verb = unpriced ? 'Đặt' : 'Sửa';
  return (
    <div data-testid="error-row" className={`flex flex-col gap-2 border-t border-border px-4 py-3 first:border-t-0 ${ROW_GRID}`}>
      <div className="min-w-0">
        <b className="font-semibold">{item.name}</b>
        <p className="mt-px text-small text-muted-foreground">{item.description}</p>
        {item.alsoIn.length > 0 && (
          <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 text-caption text-muted-foreground">
            <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
            <span>
              Cũng dùng ở{' '}
              {shown.map((a, i) => (
                <span key={a.rubricName}>
                  {i > 0 && '; '}
                  <b>{a.rubricName}</b> ({deductionLabel(a.deduction)})
                </span>
              ))}
              {more > 0 && ' và '}
            </span>
            {more > 0 && (
              <UsesMore
                label={`${more} rubric khác`}
                title={`${item.name} — đang dùng ở ${item.alsoIn.length} rubric khác`}
                items={item.alsoIn.map((a) => ({ key: a.rubricName, name: a.rubricName, value: deductionLabel(a.deduction) }))}
                onPick={onOpenRubric}
              />
            )}
          </div>
        )}
      </div>

      <div>
        <DetectionBadge predicate={item.predicate} />
      </div>

      <div className="flex items-center gap-2 lg:justify-end">
        <Popover
          open={pricingOpen}
          onOpenChange={onPricingOpenChange}
          label={`${verb} điểm trừ ${item.name}`}
          anchor={
            unpriced ? (
              <span className="flex items-center gap-2">
                <Badge variant="warning">
                  <TriangleAlert className="h-3 w-3" aria-hidden="true" />
                  Chưa có điểm trừ
                </Badge>
                <Button type="button" size="sm" variant="outline" className="border-primary text-primary" onClick={() => onPricingOpenChange(true)}>
                  Đặt điểm trừ
                </Button>
              </span>
            ) : (
              <button
                type="button"
                aria-label={`Sửa điểm trừ ${item.name}, hiện ${formatDeductionString(item.deduction)}`}
                onClick={() => onPricingOpenChange(true)}
                className="group inline-flex h-[34px] items-center gap-2 rounded-md border border-transparent px-2.5 text-body font-bold tabular-nums hover:border-border hover:bg-surface-2"
              >
                {formatDeductionString(item.deduction)}
                <Pencil className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden="true" />
              </button>
            )
          }
        >
          <PricePopover key={item.id} item={item} rubricName={rubricName} criterion={criterion} onClose={() => onPricingOpenChange(false)} />
        </Popover>
      </div>

      <div className="text-small tabular-nums text-muted-foreground">
        {item.appliedTo.results > 0 ? `${item.appliedTo.results} bài · ${item.appliedTo.sessions} phiên` : 'Chưa gặp bài nào'}
      </div>

      <div className="flex lg:justify-end">
        <ErrorMenu item={item} onEdit={onEdit} onMove={onMove} onRemove={onRemove} />
      </div>
    </div>
  );
}
```

`_components/CriterionGroup.tsx`:

```tsx
'use client';

import type { ReactNode } from 'react';
import { ChevronDown, Info, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { OverviewCriterion, RubricErrorItem } from '@/lib/api/rubric-errors';
import { formatVnPoints } from '@/lib/format';
import { overCap } from '@/lib/rubric-board';
import { ROW_GRID } from './ErrorRow';

/**
 * Một nhóm tiêu chí: tiêu đề (tên tiêu chí = mô tả của nó, số lỗi, điểm tối đa), rồi các dòng lỗi — hoặc lời nói
 * thẳng về hậu quả khi chưa có lỗi nào / khi tiêu chí đã đánh dấu không trừ điểm (spec mục 5.3). Không hiện khoá
 * kỹ thuật của tiêu chí.
 */
export function CriterionGroup({
  criterion,
  errors,
  open,
  onToggle,
  onAdd,
  onWaive,
  onUnwaive,
  children,
}: {
  criterion: OverviewCriterion;
  errors: RubricErrorItem[];
  open: boolean;
  onToggle: () => void;
  onAdd: () => void;
  onWaive: () => void;
  onUnwaive: () => void;
  children: ReactNode;
}) {
  const waived = criterion.waiverId !== null;
  const max = formatVnPoints(criterion.maxPoints);
  const over = overCap(errors.map((e) => e.deduction), criterion.maxPoints);
  return (
    <section id={`crit-${criterion.key}`} aria-label={criterion.description} className="mt-3.5 rounded-lg border border-border bg-surface shadow-sm">
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={onToggle}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onToggle();
          }
        }}
        className="flex cursor-pointer items-center gap-3 rounded-lg px-4 py-3.5 hover:bg-background"
      >
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', !open && '-rotate-90')} aria-hidden="true" />
        <h3 className="min-w-0 flex-1 truncate text-h3" title={criterion.description}>
          {criterion.description}
        </h3>
        <Badge>{errors.length} lỗi</Badge>
        <span className="whitespace-nowrap text-small text-muted-foreground">
          Tối đa <b className="text-body text-foreground">{max}</b> điểm
        </span>
      </div>

      {open && (
        <div className="border-t border-border">
          {waived && (
            <div className="m-4 flex items-center justify-between gap-2.5 rounded-lg bg-surface-2 px-3.5 py-3">
              <span>
                <b>Tiêu chí này không trừ điểm</b> — mọi bài được trọn {max} điểm.
              </span>
              <Button type="button" size="sm" variant="outline" onClick={onUnwaive}>
                Bỏ đánh dấu
              </Button>
            </div>
          )}

          {!waived && errors.length === 0 && (
            <div className="m-4 flex flex-wrap items-center justify-between gap-4 rounded-lg border-[1.5px] border-dashed border-border p-[18px]">
              <p className="max-w-[520px]">
                <b>Chưa có lỗi nào cho tiêu chí này.</b>
                <br />
                <span className="text-muted-foreground">
                  Bài chấm theo rubric này sẽ không tự duyệt được cho tới khi có lỗi, hoặc bạn xác nhận tiêu chí này không trừ điểm.
                </span>
              </p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" className="border-primary text-primary" onClick={onAdd}>
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Thêm lỗi đầu tiên
                </Button>
                <Button type="button" variant="outline" onClick={onWaive}>
                  Tiêu chí này không trừ điểm
                </Button>
              </div>
            </div>
          )}

          {errors.length > 0 && (
            <>
              <div className={cn('hidden bg-surface-2 px-4 py-2 text-caption font-semibold uppercase tracking-wide text-muted-foreground', ROW_GRID)}>
                <span>Lỗi</span>
                <span>Cách phát hiện</span>
                <span className="text-right">Điểm trừ</span>
                <span>Đã gặp</span>
                <span className="sr-only">Thao tác</span>
              </div>
              {children}
              {over !== null && (
                <p className="flex items-center gap-2 px-4 pb-3 text-small text-muted-foreground">
                  <Info className="h-4 w-4 shrink-0" aria-hidden="true" />
                  Cộng hết các lỗi là {formatVnPoints(over)}, vượt điểm tối đa {max} — bài chỉ bị trừ tới {max}.
                </p>
              )}
              <div className="border-t border-border px-3 py-2">
                <Button type="button" variant="ghost" size="sm" className="text-primary hover:text-primary" onClick={onAdd}>
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Thêm lỗi vào “{criterion.description}”
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
```

`_components/ErrorDialogs.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FormField } from '@/components/ui/form-field';
import { useMoveError, useRemoveError } from '@/hooks/useRubricErrors';
import type { OverviewCriterion, RubricErrorItem } from '@/lib/api/rubric-errors';
import { formatVnPoints } from '@/lib/format';
import { shorten } from '@/lib/rubric-board';
import { describeRecompute } from '@/lib/rules-vocab';

/** "Chuyển sang tiêu chí khác": chỉ đổi ở rubric đang mở; chọn tiêu chí đích rồi xác nhận. */
export function MoveErrorDialog({
  item,
  criteria,
  onClose,
}: {
  item: RubricErrorItem | null;
  criteria: OverviewCriterion[];
  onClose: () => void;
}) {
  return (
    <Dialog open={item !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>{item && <MoveBody key={item.id} item={item} criteria={criteria} onClose={onClose} />}</DialogContent>
    </Dialog>
  );
}

function MoveBody({ item, criteria, onClose }: { item: RubricErrorItem; criteria: OverviewCriterion[]; onClose: () => void }) {
  const [target, setTarget] = useState('');
  const move = useMoveError();
  // Lỗi mồ côi mang khoá không có trong `criteria`, nên lọc theo khoá vẫn đúng: mọi tiêu chí hiện hành đều là đích.
  const options = criteria.filter((c) => c.key !== item.criterionKey);
  const chosen = options.find((c) => c.key === target);

  return (
    <>
      <DialogHeader>
        <DialogTitle>Chuyển “{item.name}” sang tiêu chí khác</DialogTitle>
        <DialogDescription>Chỉ đổi ở rubric này. Các bài chưa chốt của rubric này được tính lại.</DialogDescription>
      </DialogHeader>
      <FormField id="move-target" label="Tiêu chí mới">
        <select
          id="move-target"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          className="h-10 w-full rounded-md border border-input bg-surface px-3 text-body"
        >
          <option value="">Chọn tiêu chí…</option>
          {options.map((c) => (
            <option key={c.key} value={c.key}>
              {shorten(c.description, 60)} · tối đa {formatVnPoints(c.maxPoints)}
            </option>
          ))}
        </select>
      </FormField>
      {move.isError && (
        <Alert variant="destructive">
          <AlertDescription>{move.error?.message}</AlertDescription>
        </Alert>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Huỷ
        </Button>
        <Button
          type="button"
          variant="primary"
          disabled={!chosen}
          loading={move.isPending}
          onClick={() => {
            if (!chosen) return;
            move.mutate(
              { rubricErrorId: item.id, criterionKey: chosen.key },
              {
                onSuccess: (r) => {
                  toast.success(`Đã chuyển “${item.name}” sang “${shorten(chosen.description, 60)}”. ${describeRecompute(r.recompute)}`);
                  onClose();
                },
              },
            );
          }}
        >
          Chuyển
        </Button>
      </DialogFooter>
    </>
  );
}

/** "Gỡ khỏi rubric này": hỏi xác nhận vì bài chưa chốt của rubric được tính lại; lỗi vẫn còn ở thư viện. */
export function RemoveErrorDialog({
  item,
  rubricName,
  onClose,
}: {
  item: RubricErrorItem | null;
  rubricName: string;
  onClose: () => void;
}) {
  return (
    <Dialog open={item !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>{item && <RemoveBody key={item.id} item={item} rubricName={rubricName} onClose={onClose} />}</DialogContent>
    </Dialog>
  );
}

function RemoveBody({ item, rubricName, onClose }: { item: RubricErrorItem; rubricName: string; onClose: () => void }) {
  const remove = useRemoveError();
  return (
    <>
      <DialogHeader>
        <DialogTitle>
          Gỡ “{item.name}” khỏi rubric “{rubricName}”?
        </DialogTitle>
        <DialogDescription>
          Lỗi vẫn còn trong Thư viện lỗi, các rubric khác không đổi. Các bài chưa chốt của rubric này được tính lại — lỗi này sẽ không còn bị trừ ở đó.
        </DialogDescription>
      </DialogHeader>
      {remove.isError && (
        <Alert variant="destructive">
          <AlertDescription>{remove.error?.message}</AlertDescription>
        </Alert>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Huỷ
        </Button>
        <Button
          type="button"
          variant="destructive"
          loading={remove.isPending}
          onClick={() =>
            remove.mutate(item.id, {
              onSuccess: (r) => {
                toast.success(`Đã gỡ “${item.name}” khỏi “${rubricName}”. ${describeRecompute(r.recompute)}`);
                onClose();
              },
            })
          }
        >
          Gỡ khỏi rubric này
        </Button>
      </DialogFooter>
    </>
  );
}
```

`_components/ErrorsTab.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import type { OverviewCriterion, RubricErrorItem, RubricOverview } from '@/lib/api/rubric-errors';
import { CriterionGroup } from './CriterionGroup';
import { DetectionBadge } from './DetectionBadge';
import { MoveErrorDialog, RemoveErrorDialog } from './ErrorDialogs';
import { ErrorRow } from './ErrorRow';

/** Khoá của nhóm "Chưa có tiêu chí" (lỗi mồ côi) — dùng để cuộn tới nó (`focus`). */
export const DANGLING_KEY = '__dangling';

/**
 * Tab "Lỗi theo tiêu chí": một nhóm cho mỗi tiêu chí của rubric, và — nếu có — một nhóm "Chưa có tiêu chí" ở cuối
 * cho lỗi gắn tiêu chí đã bị xoá (spec 2.3.4). Một lỗi có khoá KHÔNG có trong tổng quan cũng rơi vào nhóm cuối dù
 * máy chủ chưa đánh dấu mồ côi (hai lần đọc lệch nhau): hiện được còn hơn làm sập trang (Review Focus 4).
 *
 * `focus` là yêu cầu "cuộn tới nhóm này và nháy khung" từ dải trạng thái; `n` đổi mỗi lần bấm để bấm lại cùng một
 * nhóm vẫn có tác dụng.
 */
export function ErrorsTab({
  overview,
  errors,
  loading,
  error,
  focus,
  onAdd,
  onEdit,
  onWaive,
  onUnwaive,
  onOpenRubric,
}: {
  overview: RubricOverview;
  errors: RubricErrorItem[] | undefined;
  loading: boolean;
  error: Error | null;
  focus: { key: string; n: number } | null;
  onAdd: (criterionKey: string | null) => void;
  onEdit: (item: RubricErrorItem) => void;
  onWaive: (criterion: OverviewCriterion) => void;
  onUnwaive: (criterion: OverviewCriterion) => void;
  onOpenRubric: (name: string) => void;
}) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [pricing, setPricing] = useState<string | null>(null);
  const [moving, setMoving] = useState<RubricErrorItem | null>(null);
  const [removing, setRemoving] = useState<RubricErrorItem | null>(null);

  useEffect(() => {
    if (!focus) return;
    setCollapsed((prev) => ({ ...prev, [focus.key]: false }));
    const el = document.getElementById(`crit-${focus.key}`);
    if (!el) return;
    el.scrollIntoView({ block: 'center' });
    if (typeof el.animate === 'function') {
      el.animate([{ boxShadow: '0 0 0 3px hsl(var(--warning))' }, { boxShadow: '0 0 0 0 transparent' }], { duration: 1400 });
    }
  }, [focus]);

  if (loading) {
    return (
      <div className="mt-4 flex flex-col gap-2">
        <p className="text-small text-muted-foreground">Đang tải…</p>
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (error) {
    return (
      <Alert variant="destructive" className="mt-4">
        <AlertDescription>Không tải được danh sách lỗi — {error.message}. Thử tải lại trang.</AlertDescription>
      </Alert>
    );
  }

  const list = errors ?? [];
  const known = new Set(overview.criteria.map((c) => c.key));
  const dangling = list.filter((e) => e.criterionDangling || !known.has(e.criterionKey));

  const row = (item: RubricErrorItem, criterion?: OverviewCriterion) => (
    <ErrorRow
      key={item.id}
      item={item}
      criterion={criterion}
      rubricName={overview.rubricName}
      pricingOpen={pricing === item.id}
      onPricingOpenChange={(open) => setPricing((prev) => (open ? item.id : prev === item.id ? null : prev))}
      onEdit={() => onEdit(item)}
      onMove={() => setMoving(item)}
      onRemove={() => setRemoving(item)}
      onOpenRubric={onOpenRubric}
    />
  );

  return (
    <div>
      <div className="mx-0.5 mb-1 mt-3.5 flex flex-wrap gap-x-[18px] gap-y-1.5 text-small text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <DetectionBadge predicate={{ kind: 'test_group_failed', group: '' }} /> Máy so kết quả chạy test với đáp án: chắc chắn, không cần bạn xem.
        </span>
        <span className="flex items-center gap-1.5">
          <DetectionBadge predicate={null} /> AI đọc mã rồi kết luận: kém chắc chắn hơn nên có thể cần bạn duyệt.
        </span>
      </div>

      {overview.criteria.map((criterion) => {
        const rows = list.filter((e) => e.criterionKey === criterion.key && !e.criterionDangling);
        return (
          <CriterionGroup
            key={criterion.key}
            criterion={criterion}
            errors={rows}
            open={!collapsed[criterion.key]}
            onToggle={() => setCollapsed((prev) => ({ ...prev, [criterion.key]: !prev[criterion.key] }))}
            onAdd={() => onAdd(criterion.key)}
            onWaive={() => onWaive(criterion)}
            onUnwaive={() => onUnwaive(criterion)}
          >
            {rows.map((item) => row(item, criterion))}
          </CriterionGroup>
        );
      })}

      {dangling.length > 0 && (
        <section id={`crit-${DANGLING_KEY}`} aria-label="Chưa có tiêu chí" className="mt-3.5 rounded-lg border border-warning/40 bg-surface shadow-sm">
          <div className="flex items-center gap-3 px-4 py-3.5">
            <h3 className="min-w-0 flex-1 text-h3">Chưa có tiêu chí</h3>
            <Badge>{dangling.length} lỗi</Badge>
          </div>
          <p className="px-4 pb-3 text-small text-muted-foreground">
            Các lỗi này gắn với tiêu chí đã bị xoá khỏi rubric nên chưa được tính vào điểm. Chuyển chúng sang tiêu chí khác hoặc gỡ khỏi rubric.
          </p>
          <div className="border-t border-border">{dangling.map((item) => row(item))}</div>
        </section>
      )}

      <MoveErrorDialog item={moving} criteria={overview.criteria} onClose={() => setMoving(null)} />
      <RemoveErrorDialog item={removing} rubricName={overview.rubricName} onClose={() => setRemoving(null)} />
    </div>
  );
}
```
(The legend's `DetectionBadge` instances render "Tự động" / "AI đọc bài" text too. In the row test `within(row).getByText('Tự động')` is scoped to a row, so the legend does not interfere. Elsewhere avoid unscoped `getByText('Tự động')`.)

- [ ] **Step 3: Run, lint, commit**

```powershell
pnpm exec vitest run src/components/ui/popover.test.tsx src/app/teacher/rules/_components/PricePopover.test.tsx src/app/teacher/rules/_components/ErrorDialogs.test.tsx src/app/teacher/rules/_components/ErrorsTab.test.tsx
pnpm exec tsc --noEmit
pnpm exec eslint src/components/ui src/app/teacher/rules
```
Expected: PASS. If a Radix dropdown test cannot open the menu with `keyDown Enter`, use `fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false })` instead — the same trick other tests in `grading/_components/session-list` use is `keyDown` + `Enter`, which is what is written here.

```bash
git add apps/web/src/components/ui apps/web/src/app/teacher/rules
git commit -m "feat(web): errors-by-criterion tab with inline deduction popover and row menu"
```

---

## Task B7: "Thêm lỗi" drawer (T-RBE-UI-5)

**Files:**
- Create: `_components/ErrorFields.tsx`, `_components/AddErrorDrawer.tsx`, `_components/AddErrorDrawer.test.tsx`

**Interfaces:**
- Consumes: `useAssignError` (B1), `lib/error-form` + `lib/rubric-board` (B2), `DetectionBadge` (B6).
- Produces:

```tsx
<ErrorFields form={ErrorFormState} onChange(patch: Partial<ErrorFormState>) idPrefix={string} legacyNote?={string | null} />
<AddErrorDrawer overview={RubricOverview} library={LibraryRule[] | undefined} criterionKey={string | null}
                prefill={ProposalItem | null} onClose />
```

- [ ] **Step 1: Write the failing tests**

`AddErrorDrawer.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { toast } from 'sonner';
import { AddErrorDrawer } from './AddErrorDrawer';
import { criterion, libraryRule, mutation, overview, proposal, session } from './fixtures';

const h = vi.hoisted(() => ({ assign: undefined as unknown }));
vi.mock('@/hooks/useRubricErrors', () => ({ useAssignError: () => h.assign }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const board = overview({
  rubricName: 'Giữa kỳ CTDL',
  criteria: [
    criterion({ key: 'tinh_dung', description: 'Tính đúng đắn', maxPoints: 6, errorCount: 1 }),
    criterion({ key: 'trinh_bay', description: 'Trình bày', maxPoints: 2, errorCount: 0 }),
  ],
  sessions: [
    session({ id: 's1', name: 'Ca sáng', state: 'grading', resultCount: 38 }),
    session({ id: 's2', name: 'Ca chiều', state: 'finalized' }),
  ],
});

const library = [
  // Đã có ở rubric này → không được mời thêm lần nữa.
  libraryRule({ id: 'dung', uses: [{ rubricName: 'Giữa kỳ CTDL', criterionKey: 'tinh_dung', deduction: '1.50' }] }),
  libraryRule({
    id: 'ro',
    revision: { id: 'v2', revision: 1, name: 'Rò rỉ bộ nhớ', description: 'Cấp phát mà không giải phóng', predicate: null },
    checkedBy: 'model',
    uses: [{ rubricName: 'Cuối kỳ CTDL', criterionKey: 'bo_nho', deduction: '1.00' }],
  }),
  libraryRule({
    id: 'ten',
    revision: { id: 'v3', revision: 1, name: 'Đặt tên biến khó hiểu', description: 'Tên một chữ cái', predicate: null },
    checkedBy: 'model',
    uses: [],
  }),
];

const assign = () => (h.assign as ReturnType<typeof mutation>).mutate;
function open(over: Partial<React.ComponentProps<typeof AddErrorDrawer>> = {}) {
  const onClose = vi.fn();
  render(<AddErrorDrawer overview={board} library={library} criterionKey="tinh_dung" prefill={null} onClose={onClose} {...over} />);
  return onClose;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.assign = mutation();
});

describe('AddErrorDrawer — ngữ cảnh (T-RBE-UI-5)', () => {
  it('mở từ một nhóm tiêu chí: rubric › tiêu chí (điểm tối đa) cố định, không có ô chọn', () => {
    open();
    expect(screen.getByText('Rubric: Giữa kỳ CTDL')).toBeInTheDocument();
    expect(screen.getByText('Tiêu chí: Tính đúng đắn · tối đa 6,0')).toBeInTheDocument();
    expect(screen.getByText('Lỗi bạn thêm ở đây chỉ nằm trong rubric này.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Tiêu chí')).not.toBeInTheDocument();
  });

  it('mở từ nút toàn trang: tiêu chí là một ô chọn; chưa chọn thì nút lưu khoá và nói vì sao', () => {
    open({ criterionKey: null });
    expect(screen.getByLabelText('Tiêu chí')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Rò rỉ bộ nhớ/ }));
    expect(screen.getByRole('button', { name: 'Thêm vào tiêu chí' })).toBeDisabled();
    expect(screen.getByText('Chọn tiêu chí trước')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Tiêu chí'), { target: { value: 'trinh_bay' } });
    expect(screen.getByRole('button', { name: 'Thêm vào tiêu chí' })).toBeEnabled();
  });
});

describe('AddErrorDrawer — chọn lỗi có sẵn', () => {
  it('không mời lỗi đã có ở rubric này; tab ghi đúng số', () => {
    open();
    expect(screen.getByRole('tab', { name: 'Chọn lỗi có sẵn (2)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Rò rỉ bộ nhớ/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Đặt tên biến khó hiểu/ })).toBeInTheDocument();
    expect(screen.queryByText('Sai ca biên')).not.toBeInTheDocument();
  });

  it('tìm không phân biệt dấu', () => {
    open();
    fireEvent.change(screen.getByLabelText('Tìm lỗi'), { target: { value: 'ro ri' } });
    expect(screen.getByRole('button', { name: /Rò rỉ bộ nhớ/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Đặt tên biến/ })).not.toBeInTheDocument();
  });

  it('mỗi lỗi nói đang dùng ở rubric nào, bao nhiêu', () => {
    open();
    expect(screen.getByText('Đang dùng ở: Cuối kỳ CTDL (−1,0)')).toBeInTheDocument();
    expect(screen.getByText('Chưa dùng ở rubric nào')).toBeInTheDocument();
  });

  it('chọn một lỗi: ô điểm trừ điền gợi ý từ rubric khác và SỬA ĐƯỢC', () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: /Rò rỉ bộ nhớ/ }));
    const price = screen.getByLabelText('Điểm trừ cho rubric này') as HTMLInputElement;
    expect(price.value).toBe('1,0');
    expect(screen.getByText('Gợi ý từ Cuối kỳ CTDL: 1,0. Sửa tuỳ ý.')).toBeInTheDocument();
    fireEvent.change(price, { target: { value: '2' } });
    expect(price.value).toBe('2');
  });

  it('lưu gửi ruleId + chuỗi điểm trừ, báo bằng lời, đóng ngăn kéo', () => {
    const onClose = open();
    fireEvent.click(screen.getByRole('button', { name: /Rò rỉ bộ nhớ/ }));
    fireEvent.change(screen.getByLabelText('Điểm trừ cho rubric này'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Thêm vào tiêu chí' }));
    expect(assign()).toHaveBeenCalledWith(
      { rubricName: 'Giữa kỳ CTDL', criterionKey: 'tinh_dung', ruleId: 'ro', deduction: '2' },
      expect.anything(),
    );
    assign().mock.calls[0][1].onSuccess({ rubricErrorId: 'e9', ruleId: 'ro', recompute: null });
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('Đã thêm “Rò rỉ bộ nhớ” vào “Tính đúng đắn” (−2,0).'));
    expect(onClose).toHaveBeenCalled();
  });

  it('để trống điểm trừ: KHÔNG gửi trường deduction (không sinh phiên bản giá), và nói chưa có điểm trừ', () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: /Đặt tên biến khó hiểu/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Thêm vào tiêu chí' }));
    const body = assign().mock.calls[0][0];
    expect(body).toEqual({ rubricName: 'Giữa kỳ CTDL', criterionKey: 'tinh_dung', ruleId: 'ten' });
    expect(body).not.toHaveProperty('deduction');
    assign().mock.calls[0][1].onSuccess({ rubricErrorId: 'e9', ruleId: 'ten', recompute: null });
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('— chưa có điểm trừ'));
  });

  it('điểm trừ sai định dạng khoá nút lưu và nói lý do', () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: /Rò rỉ bộ nhớ/ }));
    fireEvent.change(screen.getByLabelText('Điểm trừ cho rubric này'), { target: { value: 'abc' } });
    expect(screen.getByRole('button', { name: 'Thêm vào tiêu chí' })).toBeDisabled();
    expect(screen.getByText('Điểm trừ: số không âm, tối đa hai chữ số lẻ.')).toBeInTheDocument();
  });
});

describe('AddErrorDrawer — tạo lỗi mới', () => {
  const toNew = () => fireEvent.click(screen.getByRole('tab', { name: 'Tạo lỗi mới' }));

  it('thiếu tên/mô tả thì khoá; điền đủ thì lưu newRule (AI đọc bài → predicate null)', () => {
    open();
    toNew();
    expect(screen.getByRole('button', { name: 'Tạo và thêm vào tiêu chí' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Tên lỗi'), { target: { value: ' Quên giải phóng nút ' } });
    fireEvent.change(screen.getByLabelText('Mô tả lỗi'), { target: { value: 'Xoá phần tử cuối mà không free' } });
    fireEvent.change(screen.getByLabelText('Điểm trừ cho rubric này'), { target: { value: '1,5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo và thêm vào tiêu chí' }));
    expect(assign()).toHaveBeenCalledWith(
      {
        rubricName: 'Giữa kỳ CTDL',
        criterionKey: 'tinh_dung',
        deduction: '1.5',
        newRule: { name: 'Quên giải phóng nút', description: 'Xoá phần tử cuối mà không free', predicate: null },
      },
      expect.anything(),
    );
  });

  it('Tự động đòi tên nhóm test, rồi gửi test_group_failed; giao diện không bao giờ gửi ruleKey', () => {
    open();
    toNew();
    fireEvent.change(screen.getByLabelText('Tên lỗi'), { target: { value: 'Sai ca biên' } });
    fireEvent.change(screen.getByLabelText('Mô tả lỗi'), { target: { value: 'Nhóm biên không đạt' } });
    fireEvent.click(screen.getByRole('button', { name: /^Tự động \(chạy test\)/ }));
    expect(screen.getByRole('button', { name: 'Tạo và thêm vào tiêu chí' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Tên nhóm test'), { target: { value: 'bien' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo và thêm vào tiêu chí' }));
    const body = assign().mock.calls[0][0];
    expect(body.newRule).toEqual({ name: 'Sai ca biên', description: 'Nhóm biên không đạt', predicate: { kind: 'test_group_failed', group: 'bien' } });
    expect(body.newRule).not.toHaveProperty('ruleKey');
  });

  it('không còn mẫu "gọi hàm / độ phức tạp / đệ quy" để tạo mới (D9)', () => {
    open();
    toNew();
    expect(screen.queryByText(/Mã có gọi một hàm/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Máy chưa đo được/)).not.toBeInTheDocument();
  });
});

describe('AddErrorDrawer — duyệt lỗi AI đề xuất (Review Focus 5)', () => {
  it('mở sẵn tab "Tạo lỗi mới", điền sẵn tên và mô tả, tiêu chí CHƯA chọn nên nút lưu khoá', () => {
    open({ criterionKey: null, prefill: proposal({ id: 'p9', name: 'Hàm pop không kiểm tra rỗng', description: 'Gọi pop khi rỗng' }) });
    expect(screen.getByRole('tab', { name: 'Tạo lỗi mới' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByLabelText('Tên lỗi')).toHaveValue('Hàm pop không kiểm tra rỗng');
    expect(screen.getByLabelText('Mô tả lỗi')).toHaveValue('Gọi pop khi rỗng');
    expect(screen.getByRole('button', { name: 'Tạo và thêm vào tiêu chí' })).toBeDisabled();
    expect(screen.getByText('Chọn tiêu chí trước')).toBeInTheDocument();
  });

  it('lưu nguyên văn: duyệt đúng lỗi đó bằng ruleId, KHÔNG tạo lỗi thứ hai, không gửi changes', () => {
    open({ prefill: proposal({ id: 'p9', name: 'Hàm pop không kiểm tra rỗng', description: 'Gọi pop khi rỗng' }) });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo và thêm vào tiêu chí' }));
    const body = assign().mock.calls[0][0];
    expect(body).toEqual({ rubricName: 'Giữa kỳ CTDL', criterionKey: 'tinh_dung', ruleId: 'p9' });
    expect(body).not.toHaveProperty('newRule');
  });

  it('sửa tên trước khi duyệt: gửi changes chỉ có phần đã đổi', () => {
    open({ prefill: proposal({ id: 'p9', name: 'Hàm pop', description: 'Gọi pop khi rỗng' }) });
    fireEvent.change(screen.getByLabelText('Tên lỗi'), { target: { value: 'Hàm pop không kiểm tra ngăn xếp rỗng' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo và thêm vào tiêu chí' }));
    expect(assign().mock.calls[0][0]).toEqual({
      rubricName: 'Giữa kỳ CTDL',
      criterionKey: 'tinh_dung',
      ruleId: 'p9',
      changes: { name: 'Hàm pop không kiểm tra ngăn xếp rỗng' },
    });
  });
});

describe('AddErrorDrawer — "Lưu thì áp vào đâu" (không gọi API)', () => {
  it('viết bằng tên phiên thật: phiên đang chấm / đã chốt', () => {
    open();
    const box = screen.getByRole('region', { name: 'Lưu thì áp vào đâu' });
    expect(within(box).getByText('Ca sáng')).toBeInTheDocument();
    expect(within(box).getByText(/AI xét lỗi này từ các bài chưa chấm; bài đã chấm không tính lại/)).toBeInTheDocument();
    expect(within(box).getByText('Ca chiều')).toBeInTheDocument();
    expect(within(box).getByText(/Giữ nguyên điểm — bảng điểm trừ đã được ghim lúc chốt/)).toBeInTheDocument();
    expect(within(box).getByText('Rubric khác không bị ảnh hưởng.')).toBeInTheDocument();
  });

  it('đổi sang Tự động thì phiên đang chấm được tính lại ngay', () => {
    open();
    fireEvent.click(screen.getByRole('tab', { name: 'Tạo lỗi mới' }));
    fireEvent.click(screen.getByRole('button', { name: /^Tự động \(chạy test\)/ }));
    expect(screen.getByText('Tính lại ngay các bài dính lỗi này (trong 38 bài).')).toBeInTheDocument();
  });

  it('rubric chưa gắn phiên nào thì nói lỗi chưa ảnh hưởng bài nào', () => {
    open({ overview: { ...board, sessions: [] } });
    expect(screen.getByText(/chưa gắn phiên thi nào nên lỗi chưa ảnh hưởng bài nào/)).toBeInTheDocument();
  });
});

describe('AddErrorDrawer — lỗi và huỷ', () => {
  it('lỗi của máy chủ hiện nguyên văn (409: lỗi đã có trong rubric)', () => {
    (h.assign as ReturnType<typeof mutation>).isError = true;
    (h.assign as ReturnType<typeof mutation>).error = new Error('Lỗi này đã có trong rubric');
    open();
    expect(screen.getByText('Lỗi này đã có trong rubric')).toBeInTheDocument();
  });

  it('thư viện chưa tải xong: không hỏng, danh sách rỗng và nói vậy', () => {
    open({ library: undefined });
    expect(screen.getByRole('tab', { name: 'Chọn lỗi có sẵn (0)' })).toBeInTheDocument();
    expect(screen.getByText(/Mọi lỗi trong thư viện đã có ở rubric này/)).toBeInTheDocument();
  });

  it('Huỷ đóng, không gửi gì', () => {
    const onClose = open();
    fireEvent.click(screen.getByRole('button', { name: 'Huỷ' }));
    expect(onClose).toHaveBeenCalled();
    expect(assign()).not.toHaveBeenCalled();
  });
});
```
(The "Mọi lỗi trong thư viện đã có ở rubric này" sentence is shown whenever `available` is empty — for `library: undefined` that is the same empty state; it reads fine while the library loads because the page passes `library` only when loaded and the drawer is mounted lazily; see B11.)

Run `pnpm exec vitest run src/app/teacher/rules/_components/AddErrorDrawer.test.tsx` → Expected FAIL (module missing).

- [ ] **Step 2: Implement**

`_components/ErrorFields.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { AutoTextarea } from '@/components/ui/auto-textarea';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { validateErrorForm, type ErrorFormState } from '@/lib/error-form';
import { cn } from '@/lib/utils';

type Field = 'name' | 'description' | 'group';

const OPTIONS: { id: ErrorFormState['detection']; title: string; text: string }[] = [
  { id: 'auto', title: 'Tự động (chạy test)', text: 'Chọn một nhóm test; bài trượt nhóm đó thì bị lỗi. Chắc chắn, không cần bạn xem.' },
  { id: 'ai', title: 'AI đọc bài', text: 'AI đọc mã và kết luận theo mô tả ở trên. Mô tả càng cụ thể, AI càng ít nhầm.' },
];

/**
 * Bốn trường của một lỗi (tên, mô tả, cách phát hiện, nhóm test) dùng chung cho ngăn kéo "Thêm lỗi" và "Sửa lỗi".
 * Thông báo kiểm tra chỉ hiện sau khi giảng viên đã rời ô đó — không mắng người chưa kịp gõ.
 */
export function ErrorFields({
  form,
  onChange,
  idPrefix,
  legacyNote,
}: {
  form: ErrorFormState;
  onChange: (patch: Partial<ErrorFormState>) => void;
  idPrefix: string;
  /** Lỗi cũ mang điều kiện ngoài "nhóm test": hiện một dòng ghi chú dưới ô cách phát hiện. */
  legacyNote?: string | null;
}) {
  const [touched, setTouched] = useState<ReadonlySet<Field>>(new Set());
  const errors = validateErrorForm(form);
  const shown = (field: Field) => (touched.has(field) ? errors[field] : undefined);
  const touch = (field: Field) => setTouched((prev) => new Set(prev).add(field));

  return (
    <>
      <FormField id={`${idPrefix}-name`} label="Tên lỗi" error={shown('name')}>
        <Input
          id={`${idPrefix}-name`}
          value={form.name}
          invalid={shown('name') !== undefined}
          placeholder="Ví dụ: Quên giải phóng nút đầu danh sách"
          onChange={(e) => onChange({ name: e.target.value })}
          onBlur={() => touch('name')}
        />
      </FormField>

      <FormField
        id={`${idPrefix}-description`}
        label="Mô tả lỗi"
        error={shown('description')}
        hint="Viết sao cho giảng viên khác và AI hiểu cùng một nghĩa."
      >
        <AutoTextarea
          id={`${idPrefix}-description`}
          rows={3}
          value={form.description}
          onChange={(e) => onChange({ description: e.target.value })}
          onBlur={() => touch('description')}
        />
      </FormField>

      <div role="group" aria-labelledby={`${idPrefix}-detection`} className="flex flex-col gap-2">
        <span id={`${idPrefix}-detection`} className="text-small font-medium">
          Cách phát hiện
        </span>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {OPTIONS.map((o) => (
            <button
              key={o.id}
              type="button"
              aria-pressed={form.detection === o.id}
              onClick={() => onChange({ detection: o.id })}
              className={cn(
                'flex flex-col gap-1 rounded-lg border p-3 text-left',
                form.detection === o.id ? 'border-primary bg-primary-subtle' : 'border-border bg-surface hover:bg-surface-2',
              )}
            >
              <b className="text-small font-semibold">{o.title}</b>
              <span className="text-caption text-muted-foreground">{o.text}</span>
            </button>
          ))}
        </div>
        {form.detection === 'ai' && legacyNote && (
          <p className="text-small text-muted-foreground">
            Điều kiện cũ: {legacyNote}. Hệ thống vẫn dùng điều kiện đó khi AI đọc bài; sửa tên hoặc mô tả không đổi điều kiện này.
          </p>
        )}
      </div>

      {form.detection === 'auto' && (
        <FormField id={`${idPrefix}-group`} label="Tên nhóm test" error={shown('group')}>
          <Input
            id={`${idPrefix}-group`}
            className="font-mono"
            value={form.group}
            invalid={shown('group') !== undefined}
            placeholder="vd: bien, mang_rong"
            onChange={(e) => onChange({ group: e.target.value })}
            onBlur={() => touch('group')}
          />
        </FormField>
      )}
    </>
  );
}
```

`_components/AddErrorDrawer.tsx`:

```tsx
'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useAssignError } from '@/hooks/useRubricErrors';
import type { AssignInput, RubricOverview } from '@/lib/api/rubric-errors';
import type { LibraryRule, ProposalItem } from '@/lib/api/rules';
import {
  EMPTY_ERROR_FORM,
  buildChanges,
  buildNewRule,
  detectionOf,
  validateErrorForm,
  type ErrorFormState,
} from '@/lib/error-form';
import { formatVnPoints } from '@/lib/format';
import { NO_SESSION_IMPACT, capNames, fold, impactLines, shorten } from '@/lib/rubric-board';
import { deductionLabel, describeRecompute, formatDeductionString, parseDeductionInput } from '@/lib/rules-vocab';
import { cn } from '@/lib/utils';
import { DetectionBadge } from './DetectionBadge';
import { ErrorFields } from './ErrorFields';

export interface AddErrorDrawerProps {
  overview: RubricOverview;
  /** Thư viện lỗi; chưa tải xong thì `undefined`. */
  library: LibraryRule[] | undefined;
  /** Tiêu chí chọn sẵn (mở từ một nhóm); `null` = giảng viên chọn trong ngăn kéo. */
  criterionKey: string | null;
  /** Mở từ "Lỗi AI đề xuất": tab "Tạo lỗi mới" điền sẵn; lưu thì DUYỆT đúng lỗi đó, không tạo lỗi thứ hai. */
  prefill: ProposalItem | null;
  onClose: () => void;
}

/** Điểm trừ gợi ý: của rubric khác đang dùng lỗi này (D: "Đặt điểm trừ riêng cho rubric này", sửa được). */
function suggestionOf(rule: LibraryRule): { from: string; value: string } | null {
  const use = rule.uses.find((u) => u.deduction !== null);
  return use ? { from: use.rubricName, value: use.deduction as string } : null;
}

/**
 * Ngăn kéo "Thêm lỗi" (spec mục 5.4): đầu ngăn kéo cố định **rubric › tiêu chí (điểm tối đa)**; hai đường — chọn lỗi
 * có sẵn trong thư viện (dùng lại, đặt điểm trừ riêng cho rubric này) hoặc tạo lỗi mới. Khối "Lưu thì áp vào đâu"
 * là chữ dựng từ các phiên của rubric — không gọi API.
 */
export function AddErrorDrawer({ overview, library, criterionKey, prefill, onClose }: AddErrorDrawerProps) {
  const [crit, setCrit] = useState<string | null>(criterionKey);
  const [tab, setTab] = useState<'lib' | 'new'>(prefill ? 'new' : 'lib');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [libPts, setLibPts] = useState('');
  const [form, setForm] = useState<ErrorFormState>(() =>
    prefill ? { ...EMPTY_ERROR_FORM, name: prefill.name, description: prefill.description } : EMPTY_ERROR_FORM,
  );
  const [pts, setPts] = useState('');
  const assign = useAssignError();

  const criterion = overview.criteria.find((c) => c.key === crit);
  const available = useMemo(
    () => (library ?? []).filter((r) => !r.uses.some((u) => u.rubricName === overview.rubricName)),
    [library, overview.rubricName],
  );
  const needle = fold(search.trim());
  const listed = available.filter((r) => fold(`${r.revision.name} ${r.revision.description}`).includes(needle));
  const selected = available.find((r) => r.id === selectedId) ?? null;
  const suggestion = selected ? suggestionOf(selected) : null;

  const price = parseDeductionInput(tab === 'lib' ? libPts : pts);
  let reason: string | null = null;
  if (crit === null) reason = 'Chọn tiêu chí trước';
  else if (tab === 'lib' && selected === null) reason = 'Chọn một lỗi trong danh sách';
  else if (tab === 'new' && Object.keys(validateErrorForm(form)).length > 0) reason = 'Điền tên, mô tả và cách phát hiện của lỗi';
  // Câu dài của ô điểm trừ chỉ hiện MỘT lần (dưới ô); chân ngăn kéo chỉ nhắc ngắn để không lặp lại.
  else if (!price.ok) reason = 'Sửa điểm trừ cho đúng định dạng';
  const ready = reason === null && !assign.isPending;

  const detectionNow = tab === 'lib' ? (selected ? detectionOf(selected.revision.predicate).detection : 'ai') : form.detection;
  const impact = impactLines(overview.sessions, detectionNow);

  function select(rule: LibraryRule) {
    setSelectedId(rule.id);
    const s = suggestionOf(rule);
    setLibPts(s ? formatVnPoints(Number(s.value)) : '');
  }

  function save() {
    if (!ready || crit === null || !price.ok) return;
    const base = {
      rubricName: overview.rubricName,
      criterionKey: crit,
      // Để trống = không gửi trường: không sinh phiên bản bảng điểm trừ cho một lựa chọn chưa quyết định.
      ...(price.value !== null ? { deduction: price.value } : {}),
    };
    let input: AssignInput;
    let name: string;
    if (tab === 'lib' && selected) {
      input = { ...base, ruleId: selected.id };
      name = selected.revision.name;
    } else if (prefill) {
      const changes = buildChanges({ revision: { name: prefill.name, description: prefill.description, predicate: null } }, form);
      input = { ...base, ruleId: prefill.id, ...(Object.keys(changes).length > 0 ? { changes } : {}) };
      name = form.name.trim();
    } else {
      input = { ...base, newRule: buildNewRule(form) };
      name = form.name.trim();
    }
    const where = shorten(criterion?.description ?? crit, 60);
    const value = price.value;
    assign.mutate(input, {
      onSuccess: (r) => {
        toast.success(
          `Đã thêm “${name}” vào “${where}”${value !== null ? ` (${formatDeductionString(value)})` : ' — chưa có điểm trừ'}. ${describeRecompute(r.recompute)}`,
        );
        onClose();
      },
    });
  }

  const tabButton = (id: 'lib' | 'new', label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={tab === id}
      onClick={() => setTab(id)}
      className={cn('h-[34px] flex-1 rounded-[7px] text-small font-semibold', tab === id ? 'bg-surface text-foreground shadow-sm' : 'text-muted-foreground')}
    >
      {label}
    </button>
  );

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" aria-describedby={undefined} className="flex w-full max-w-[560px] flex-col gap-0 p-0">
        <SheetHeader className="border-b border-border p-6 pb-4">
          <SheetTitle>Thêm lỗi</SheetTitle>
          <div className="mt-2 flex flex-col gap-1.5 rounded-lg bg-primary-subtle px-3.5 py-2.5 text-small text-primary">
            <div className="flex flex-wrap items-center gap-2 font-semibold">
              <span>Rubric: {overview.rubricName}</span>
              <span aria-hidden="true">›</span>
              {criterion ? (
                <span>
                  Tiêu chí: {shorten(criterion.description, 60)} · tối đa {formatVnPoints(criterion.maxPoints)}
                </span>
              ) : (
                <>
                  <label className="sr-only" htmlFor="add-crit">
                    Tiêu chí
                  </label>
                  <select
                    id="add-crit"
                    value={crit ?? ''}
                    onChange={(e) => setCrit(e.target.value || null)}
                    className="h-[30px] rounded-md border border-primary/30 bg-surface px-2 font-semibold text-primary"
                  >
                    <option value="">Chọn tiêu chí…</option>
                    {overview.criteria.map((c) => (
                      <option key={c.key} value={c.key}>
                        {shorten(c.description, 50)} · tối đa {formatVnPoints(c.maxPoints)}
                      </option>
                    ))}
                  </select>
                </>
              )}
            </div>
            <span className="font-normal">Lỗi bạn thêm ở đây chỉ nằm trong rubric này.</span>
          </div>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-6">
          <div role="tablist" aria-label="Cách thêm" className="flex gap-1 rounded-lg bg-surface-2 p-1">
            {tabButton('lib', `Chọn lỗi có sẵn (${available.length})`)}
            {tabButton('new', 'Tạo lỗi mới')}
          </div>

          {tab === 'lib' ? (
            <>
              <Input aria-label="Tìm lỗi" placeholder={`Tìm trong ${available.length} lỗi chưa dùng ở rubric này`} value={search} onChange={(e) => setSearch(e.target.value)} />
              {available.length === 0 ? (
                <p className="text-muted-foreground">Mọi lỗi trong thư viện đã có ở rubric này. Hãy tạo lỗi mới.</p>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {listed.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      aria-pressed={selectedId === r.id}
                      onClick={() => select(r)}
                      className={cn(
                        'flex flex-col gap-1.5 rounded-lg border bg-surface p-3 text-left',
                        selectedId === r.id ? 'border-primary ring-2 ring-primary-subtle' : 'border-border hover:bg-background',
                      )}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <b className="font-semibold">{r.revision.name}</b>
                        <DetectionBadge predicate={r.revision.predicate} />
                      </span>
                      <span className="text-small text-muted-foreground">{r.revision.description}</span>
                      <span className="text-small text-muted-foreground">
                        {r.uses.length > 0
                          ? `Đang dùng ở: ${capNames(r.uses.map((u) => `${u.rubricName} (${deductionLabel(u.deduction)})`), 2)}`
                          : 'Chưa dùng ở rubric nào'}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {selected && (
                <FormField
                  id="add-lib-price"
                  label="Điểm trừ cho rubric này"
                  error={price.ok ? undefined : price.message}
                  hint={
                    suggestion
                      ? `Gợi ý từ ${suggestion.from}: ${formatVnPoints(Number(suggestion.value))}. Sửa tuỳ ý.`
                      : 'Để trống nếu chưa quyết định; bài dính lỗi này sẽ chưa tự duyệt được.'
                  }
                >
                  <Input id="add-lib-price" inputMode="decimal" className="w-28 text-right font-bold" placeholder="0,0" value={libPts} invalid={!price.ok} onChange={(e) => setLibPts(e.target.value)} />
                </FormField>
              )}
            </>
          ) : (
            <>
              <ErrorFields form={form} onChange={(patch) => setForm((prev) => ({ ...prev, ...patch }))} idPrefix="add" />
              <FormField
                id="add-new-price"
                label="Điểm trừ cho rubric này"
                error={price.ok ? undefined : price.message}
                hint={
                  criterion
                    ? `“${shorten(criterion.description, 40)}” tối đa ${formatVnPoints(criterion.maxPoints)} điểm. Để trống nếu chưa quyết định; bài dính lỗi này sẽ chưa tự duyệt được.`
                    : 'Chọn tiêu chí ở trên để biết điểm tối đa.'
                }
              >
                <Input id="add-new-price" inputMode="decimal" className="w-28 text-right font-bold" placeholder="1,0" value={pts} invalid={!price.ok} onChange={(e) => setPts(e.target.value)} />
              </FormField>
            </>
          )}

          <section aria-label="Lưu thì áp vào đâu" className="overflow-hidden rounded-lg border border-border">
            <h3 className="bg-surface-2 px-3.5 py-2 text-small font-semibold">Lưu thì áp vào đâu</h3>
            <div className="px-3.5 py-3 text-small">
              {impact.length === 0 ? (
                <p className="text-muted-foreground">{NO_SESSION_IMPACT}</p>
              ) : (
                <>
                  <ul className="flex flex-col gap-2.5">
                    {impact.map((line) => (
                      <li key={line.sessionId}>
                        <b className="font-semibold">{line.name}</b>
                        {line.state === 'finalized' && <span className="ml-1.5 rounded-full bg-surface-2 px-2 py-px text-caption font-semibold text-muted-foreground">đã chốt</span>}
                        {line.state === 'grading' && <span className="ml-1.5 rounded-full bg-primary-subtle px-2 py-px text-caption font-semibold text-primary">đang chấm</span>}
                        <br />
                        <span className="text-muted-foreground">{line.text}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2.5 text-muted-foreground">Rubric khác không bị ảnh hưởng.</p>
                </>
              )}
            </div>
          </section>

          {assign.isError && (
            <Alert variant="destructive">
              <AlertDescription>{assign.error?.message}</AlertDescription>
            </Alert>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2.5 border-t border-border p-4">
          {reason && <span className="mr-auto text-small text-muted-foreground">{reason}</span>}
          <Button type="button" variant="outline" onClick={onClose}>
            Huỷ
          </Button>
          <Button type="button" variant="primary" disabled={!ready} loading={assign.isPending} title={reason ?? undefined} onClick={save}>
            {tab === 'lib' ? 'Thêm vào tiêu chí' : 'Tạo và thêm vào tiêu chí'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
```
Notes the tests rely on: the select `Tiêu chí` has an `sr-only` label so `getByLabelText('Tiêu chí')` finds it, and with `criterionKey` given there is no select; the long "Điểm trừ: số không âm…" message is shown once (under the field), the footer only says `Sửa điểm trừ cho đúng định dạng`.

- [ ] **Step 3: Run, lint, commit**

```powershell
pnpm exec vitest run src/app/teacher/rules/_components/AddErrorDrawer.test.tsx
pnpm exec tsc --noEmit
pnpm exec eslint src/app/teacher/rules
```
Expected: PASS.

```bash
git add apps/web/src/app/teacher/rules
git commit -m "feat(web): add-error drawer with fixed rubric context, library reuse, proposal adoption"
```

---

## Task B8: "Sửa lỗi" drawer — one scope or both (T-RBE-UI-6)

**Files:**
- Create: `_components/EditErrorDrawer.tsx`, `_components/EditErrorDrawer.test.tsx`

**Interfaces:**
- Consumes: `useReviseRule`, `useSplitRule` (B1), `lib/error-form`, `lib/rubric-board` (B2), `ErrorFields` (B7).
- Produces:

```tsx
<EditErrorDrawer rule={LibraryRule | undefined} loading={boolean} fromRubric={string | null}
                 overviews={RubricOverview[]} onClose />
```
`fromRubric` = the rubric the lecturer opened it from (`null` = from the library).

- [ ] **Step 1: Write the failing tests**

`EditErrorDrawer.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { toast } from 'sonner';
import { EditErrorDrawer } from './EditErrorDrawer';
import { criterion, libraryRule, mutation, overview, session } from './fixtures';

const h = vi.hoisted(() => ({ revise: undefined as unknown, split: undefined as unknown }));
vi.mock('@/hooks/useRules', () => ({ useReviseRule: () => h.revise, useSplitRule: () => h.split }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const A = overview({
  rubricName: 'Giữa kỳ CTDL',
  criteria: [criterion({ key: 'tinh_dung', description: 'Tính đúng đắn' })],
  sessions: [session({ id: 'a', name: 'Ca sáng', state: 'grading' }), session({ id: 'b', name: 'Ca chiều', state: 'finalized' })],
});
const B = overview({ rubricName: 'Cuối kỳ CTDL', criteria: [criterion({ key: 'tinh_dung', description: 'Tính đúng đắn' })] });

const shared = libraryRule({
  id: 'r1',
  uses: [
    { rubricName: 'Giữa kỳ CTDL', criterionKey: 'tinh_dung', deduction: '2.00' },
    { rubricName: 'Cuối kỳ CTDL', criterionKey: 'tinh_dung', deduction: null },
  ],
});
const single = libraryRule({ id: 'r2', uses: [{ rubricName: 'Giữa kỳ CTDL', criterionKey: 'tinh_dung', deduction: '2.00' }] });
const legacy = libraryRule({
  id: 'r3',
  revision: { id: 'v1', revision: 1, name: 'Gọi sort', description: 'Dùng sort có sẵn', predicate: { kind: 'calls_function', name: 'sort' } },
  checkedBy: 'model',
  uses: [{ rubricName: 'Giữa kỳ CTDL', criterionKey: 'tinh_dung', deduction: '1.00' }],
});

const revise = () => (h.revise as ReturnType<typeof mutation>).mutate;
const split = () => (h.split as ReturnType<typeof mutation>).mutate;
function open(rule = shared, fromRubric: string | null = 'Giữa kỳ CTDL', over: Partial<React.ComponentProps<typeof EditErrorDrawer>> = {}) {
  const onClose = vi.fn();
  render(<EditErrorDrawer rule={rule} loading={false} fromRubric={fromRubric} overviews={[A, B]} onClose={onClose} {...over} />);
  return onClose;
}
const rename = (value = 'Sai ca biên (đã sửa)') => fireEvent.change(screen.getByLabelText('Tên lỗi'), { target: { value } });

beforeEach(() => {
  vi.clearAllMocks();
  h.revise = mutation();
  h.split = mutation();
});

describe('EditErrorDrawer — lỗi dùng ở ≥ 2 rubric, mở từ một rubric (D4)', () => {
  it('hai nút, mỗi nút kèm một dòng hệ quả bằng tên rubric', () => {
    open();
    expect(screen.getByRole('button', { name: 'Lưu cho cả 2 rubric' })).toBeInTheDocument();
    expect(screen.getByText('Đổi ở Giữa kỳ CTDL, Cuối kỳ CTDL.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Chỉ lưu cho “Giữa kỳ CTDL”' })).toBeInTheDocument();
    expect(screen.getByText('Tách bản riêng; Cuối kỳ CTDL giữ bản cũ.')).toBeInTheDocument();
  });

  it('khối phạm vi nói hậu quả theo phiên thật của từng nhóm', () => {
    open();
    const box = screen.getByText('Áp dụng thay đổi cho').closest('div') as HTMLElement;
    expect(within(box).getByText('Cả 2 rubric')).toBeInTheDocument();
    // Chuỗi ĐẦY ĐỦ (khớp nguyên văn) — dòng "Chỉ …" chứa cùng câu này nhưng dài hơn, nên không bị trùng.
    expect(within(box).getByText('Ca sáng (đang chấm): tính lại ngay các bài dính lỗi; Ca chiều (đã chốt) giữ nguyên.')).toBeInTheDocument();
    expect(within(box).getByText(/Tách thành bản riêng cho rubric này, 1 rubric còn lại giữ nguyên bản cũ “Sai ca biên”/)).toBeInTheDocument();
  });

  it('chưa đổi gì thì cả hai nút khoá và nói vì sao', () => {
    open();
    expect(screen.getByRole('button', { name: 'Lưu cho cả 2 rubric' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Chỉ lưu cho “Giữa kỳ CTDL”' })).toBeDisabled();
    expect(screen.getByText('Chưa có thay đổi để lưu.')).toBeInTheDocument();
  });

  it('"Lưu cho cả 2 rubric" sửa lỗi chung: PATCH với changes chỉ gồm phần đã đổi', () => {
    const onClose = open();
    rename();
    fireEvent.click(screen.getByRole('button', { name: 'Lưu cho cả 2 rubric' }));
    expect(revise()).toHaveBeenCalledWith({ ruleId: 'r1', changes: { name: 'Sai ca biên (đã sửa)' } }, expect.anything());
    expect(split()).not.toHaveBeenCalled();
    revise().mock.calls[0][1].onSuccess({ revisionId: 'v2', recompute: null });
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('Đã lưu “Sai ca biên (đã sửa)” cho cả 2 rubric.'));
    expect(onClose).toHaveBeenCalled();
  });

  it('"Chỉ lưu cho …" tách bản riêng cho rubric đang mở: split với đúng rubricName', () => {
    const onClose = open();
    rename('Sai ca biên riêng');
    fireEvent.click(screen.getByRole('button', { name: 'Chỉ lưu cho “Giữa kỳ CTDL”' }));
    expect(split()).toHaveBeenCalledWith({ ruleId: 'r1', rubricName: 'Giữa kỳ CTDL', changes: { name: 'Sai ca biên riêng' } }, expect.anything());
    expect(revise()).not.toHaveBeenCalled();
    split().mock.calls[0][1].onSuccess({ ruleId: 'r9', rubricErrorId: 'e1', recompute: { recomputed: 2, promoted: 0, demoted: 0, belowFloor: 0 } });
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('Đã tách bản riêng của “Sai ca biên riêng” cho “Giữa kỳ CTDL”. 1 rubric còn lại giữ nguyên bản cũ.'));
    expect(onClose).toHaveBeenCalled();
  });

  it('tên hoặc mô tả để trống thì khoá cả hai nút', () => {
    open();
    rename('   ');
    expect(screen.getByRole('button', { name: 'Lưu cho cả 2 rubric' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Chỉ lưu cho “Giữa kỳ CTDL”' })).toBeDisabled();
  });

  it('ngữ cảnh: chip nơi dùng, chặn trần 4, nói rõ tiêu chí và điểm trừ không sửa ở đây', () => {
    const many = libraryRule({
      id: 'r4',
      uses: ['A', 'B', 'C', 'D', 'E', 'F'].map((n) => ({ rubricName: n, criterionKey: 'tinh_dung', deduction: '1.00' })),
    });
    open(many, 'A');
    expect(screen.getByText(/^A · .* · −1,0$/)).toBeInTheDocument();
    expect(screen.getByText('+2 nơi dùng khác')).toBeInTheDocument();
    expect(screen.getByText(/Tiêu chí và điểm trừ không sửa ở đây/)).toBeInTheDocument();
    expect(screen.getByText(/Bạn đang mở từ rubric “A”/)).toBeInTheDocument();
  });
});

describe('EditErrorDrawer — mở từ Thư viện, hoặc lỗi chỉ ở một rubric', () => {
  it('từ Thư viện: chỉ "Lưu cho cả N rubric" và hướng dẫn đổi riêng; không có nút hẹp', () => {
    open(shared, null);
    rename();
    expect(screen.getByRole('button', { name: 'Lưu cho cả 2 rubric' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: /Chỉ lưu cho/ })).not.toBeInTheDocument();
    expect(screen.getByText('Muốn đổi riêng một rubric: mở rubric đó, bấm ⋯ ở dòng lỗi rồi chọn Sửa.')).toBeInTheDocument();
    expect(screen.getByText('Bạn đang mở từ Thư viện lỗi.', { exact: false })).toBeInTheDocument();
  });

  it('lỗi chỉ ở một rubric: một nút "Lưu", sửa trực tiếp', () => {
    open(single);
    rename();
    expect(screen.queryByRole('button', { name: /cho cả/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));
    expect(revise()).toHaveBeenCalledWith({ ruleId: 'r2', changes: { name: 'Sai ca biên (đã sửa)' } }, expect.anything());
    revise().mock.calls[0][1].onSuccess({ revisionId: 'v2', recompute: null });
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('Đã lưu “Sai ca biên (đã sửa)”.'));
  });
});

describe('EditErrorDrawer — cách phát hiện (D9, Review Focus 6)', () => {
  it('lỗi cũ mang điều kiện "gọi hàm": hiện AI đọc bài kèm ghi chú; chỉ đổi tên thì KHÔNG gửi predicate', () => {
    open(legacy);
    expect(screen.getByRole('button', { name: /^AI đọc bài/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/Điều kiện cũ: gọi hàm “sort”/)).toBeInTheDocument();
    rename('Gọi sort có sẵn');
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));
    expect(revise().mock.calls[0][0].changes).toEqual({ name: 'Gọi sort có sẵn' });
  });

  it('đổi sang Tự động phải có tên nhóm test, rồi mới gửi predicate test_group_failed', () => {
    open(legacy);
    fireEvent.click(screen.getByRole('button', { name: /^Tự động \(chạy test\)/ }));
    expect(screen.getByRole('button', { name: 'Lưu' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Tên nhóm test'), { target: { value: 'bien' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));
    expect(revise().mock.calls[0][0].changes).toEqual({ predicate: { kind: 'test_group_failed', group: 'bien' } });
  });

  it('lỗi Tự động: đổi nhóm test là một thay đổi; đổi sang AI đọc bài gửi predicate null', () => {
    open(single);
    fireEvent.change(screen.getByLabelText('Tên nhóm test'), { target: { value: 'co_ban' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));
    expect(revise().mock.calls[0][0].changes).toEqual({ predicate: { kind: 'test_group_failed', group: 'co_ban' } });
  });
});

describe('EditErrorDrawer — trạng thái khác', () => {
  it('đang tải thư viện thì nói đang tải; tải xong mà không có lỗi thì nói không tìm thấy', () => {
    const { unmount } = render(<EditErrorDrawer rule={undefined} loading fromRubric={null} overviews={[A]} onClose={vi.fn()} />);
    expect(screen.getByText('Đang tải…')).toBeInTheDocument();
    unmount();
    render(<EditErrorDrawer rule={undefined} loading={false} fromRubric={null} overviews={[A]} onClose={vi.fn()} />);
    expect(screen.getByText('Không tìm thấy lỗi này — có thể nó đã bị bỏ.')).toBeInTheDocument();
  });

  it('lỗi của máy chủ hiện nguyên văn', () => {
    (h.split as ReturnType<typeof mutation>).isError = true;
    (h.split as ReturnType<typeof mutation>).error = new Error('Lỗi này chỉ dùng ở một rubric — sửa trực tiếp');
    open();
    expect(screen.getByText('Lỗi này chỉ dùng ở một rubric — sửa trực tiếp')).toBeInTheDocument();
  });

  it('Huỷ đóng, không gửi gì', () => {
    const onClose = open();
    fireEvent.click(screen.getByRole('button', { name: 'Huỷ' }));
    expect(onClose).toHaveBeenCalled();
    expect(revise()).not.toHaveBeenCalled();
    expect(split()).not.toHaveBeenCalled();
  });
});
```

Run `pnpm exec vitest run src/app/teacher/rules/_components/EditErrorDrawer.test.tsx` → Expected FAIL.

- [ ] **Step 2: Implement**

`_components/EditErrorDrawer.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useReviseRule, useSplitRule } from '@/hooks/useRules';
import type { RubricOverview } from '@/lib/api/rubric-errors';
import type { LibraryRule } from '@/lib/api/rules';
import { buildChanges, detectionOf, formFromRule, validateErrorForm, type ErrorFormState } from '@/lib/error-form';
import { capNames, scopeLine, shorten } from '@/lib/rubric-board';
import { deductionLabel, describeRecompute } from '@/lib/rules-vocab';
import { ErrorFields } from './ErrorFields';

const CHIPS = 4;

/**
 * Ngăn kéo "Sửa lỗi" (spec mục 5.5, D4). Chỉ sửa NỘI DUNG lỗi (tên, mô tả, cách phát hiện) — tiêu chí và điểm trừ
 * mỗi rubric một khác nên không sửa ở đây. Lỗi đang dùng ở ≥ 2 rubric: giảng viên chọn phạm vi bằng hai nút, mỗi nút
 * kèm một dòng hệ quả bằng tên rubric và phiên thật. Mở từ Thư viện thì chỉ có "Lưu cho cả N rubric".
 */
export function EditErrorDrawer({
  rule,
  loading,
  fromRubric,
  overviews,
  onClose,
}: {
  rule: LibraryRule | undefined;
  /** Thư viện chưa tải xong. */
  loading: boolean;
  /** Rubric mà giảng viên mở ngăn kéo từ đó; `null` = từ Thư viện lỗi. */
  fromRubric: string | null;
  overviews: RubricOverview[];
  onClose: () => void;
}) {
  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" aria-describedby={undefined} className="flex w-full max-w-[560px] flex-col gap-0 p-0">
        <SheetHeader className="border-b border-border p-6 pb-4">
          <SheetTitle>Sửa lỗi</SheetTitle>
        </SheetHeader>
        {rule ? (
          <EditBody key={rule.id} rule={rule} fromRubric={fromRubric} overviews={overviews} onClose={onClose} />
        ) : (
          <p className="p-6 text-muted-foreground">{loading ? 'Đang tải…' : 'Không tìm thấy lỗi này — có thể nó đã bị bỏ.'}</p>
        )}
      </SheetContent>
    </Sheet>
  );
}

function EditBody({
  rule,
  fromRubric,
  overviews,
  onClose,
}: {
  rule: LibraryRule;
  fromRubric: string | null;
  overviews: RubricOverview[];
  onClose: () => void;
}) {
  const orig = formFromRule(rule);
  const [form, setForm] = useState<ErrorFormState>(orig);
  const revise = useReviseRule();
  const split = useSplitRule();

  const used = [...new Set(rule.uses.map((u) => u.rubricName))];
  const n = used.length;
  const here = fromRubric !== null && used.includes(fromRubric) ? fromRubric : null;
  const changes = buildChanges(rule, form);
  const valid = Object.keys(validateErrorForm(form)).length === 0;
  const ok = Object.keys(changes).length > 0 && valid;
  const sessionsOf = (names: string[]) => overviews.filter((o) => names.includes(o.rubricName)).flatMap((o) => o.sessions);
  const criterionTitle = (rubricName: string, key: string) =>
    shorten(overviews.find((o) => o.rubricName === rubricName)?.criteria.find((c) => c.key === key)?.description ?? 'tiêu chí đã xoá', 30);
  const name = form.name.trim() || orig.name;
  const error = revise.error ?? split.error;

  function saveAll() {
    revise.mutate(
      { ruleId: rule.id, changes },
      {
        onSuccess: (r) => {
          toast.success(`${n > 1 ? `Đã lưu “${name}” cho cả ${n} rubric.` : `Đã lưu “${name}”.`} ${describeRecompute(r.recompute)}`);
          onClose();
        },
      },
    );
  }

  function saveOne() {
    if (here === null) return;
    split.mutate(
      { ruleId: rule.id, rubricName: here, changes },
      {
        onSuccess: (r) => {
          toast.success(`Đã tách bản riêng của “${name}” cho “${here}”. ${n - 1} rubric còn lại giữ nguyên bản cũ. ${describeRecompute(r.recompute)}`);
          onClose();
        },
      },
    );
  }

  const pending = revise.isPending || split.isPending;
  const hint = <span className="text-small text-muted-foreground">{ok ? '' : 'Chưa có thay đổi để lưu.'}</span>;

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-6">
        <div className="flex flex-col gap-1.5 rounded-lg bg-primary-subtle px-3.5 py-2.5 text-small text-primary">
          <span className="font-semibold">{orig.name}</span>
          <div className="flex flex-wrap gap-1.5">
            {rule.uses.slice(0, CHIPS).map((u) => (
              <Badge key={u.rubricName}>
                {u.rubricName} · {criterionTitle(u.rubricName, u.criterionKey)} · {deductionLabel(u.deduction)}
              </Badge>
            ))}
            {rule.uses.length > CHIPS && <Badge>+{rule.uses.length - CHIPS} nơi dùng khác</Badge>}
            {rule.uses.length === 0 && <span>Chưa dùng ở rubric nào</span>}
          </div>
          <span className="font-normal">
            {here ? `Bạn đang mở từ rubric “${here}”.` : 'Bạn đang mở từ Thư viện lỗi.'} Tiêu chí và điểm trừ không sửa ở đây — mỗi rubric một khác; bấm số điểm trừ ở dòng lỗi để đổi.
          </span>
        </div>

        <ErrorFields form={form} onChange={(patch) => setForm((prev) => ({ ...prev, ...patch }))} idPrefix="edit" legacyNote={detectionOf(rule.revision.predicate).legacyNote} />

        {n > 1 && (
          <div className="overflow-hidden rounded-lg border border-border">
            <h3 className="bg-surface-2 px-3.5 py-2 text-small font-semibold">Áp dụng thay đổi cho</h3>
            <div className="flex flex-col gap-0.5 border-t border-border px-3.5 py-3 text-small">
              <b className="font-semibold">Cả {n} rubric</b>
              <span className="text-muted-foreground">{capNames(used, 3)}</span>
              <span className="mt-1">{scopeLine(sessionsOf(used), form.detection)}</span>
            </div>
            <div className="flex flex-col gap-0.5 border-t border-border px-3.5 py-3 text-small">
              {here ? (
                <>
                  <b className="font-semibold">Chỉ “{here}”</b>
                  <span className="text-muted-foreground">
                    Tách thành bản riêng cho rubric này, {n - 1} rubric còn lại giữ nguyên bản cũ “{orig.name}”. {scopeLine(sessionsOf([here]), form.detection)}
                  </span>
                </>
              ) : (
                <span className="text-muted-foreground">Muốn đổi riêng một rubric: mở rubric đó, bấm ⋯ ở dòng lỗi rồi chọn Sửa.</span>
              )}
            </div>
          </div>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        )}
      </div>

      {n > 1 && here ? (
        <div className="grid grid-cols-[auto_1fr_1fr] items-start gap-x-3 gap-y-2 border-t border-border p-4">
          <Button type="button" variant="outline" onClick={onClose}>
            Huỷ
          </Button>
          <div className="flex flex-col gap-1.5 text-center">
            <Button type="button" variant="outline" className="h-auto min-h-9 w-full whitespace-normal border-primary text-primary" disabled={!ok || pending} loading={revise.isPending} onClick={saveAll}>
              Lưu cho cả {n} rubric
            </Button>
            <p className="text-caption text-muted-foreground">Đổi ở {capNames(used, 2)}.</p>
          </div>
          <div className="flex flex-col gap-1.5 text-center">
            <Button type="button" variant="primary" className="h-auto min-h-9 w-full whitespace-normal" disabled={!ok || pending} loading={split.isPending} onClick={saveOne}>
              Chỉ lưu cho “{here}”
            </Button>
            <p className="text-caption text-muted-foreground">Tách bản riêng; {capNames(used.filter((r) => r !== here), 2)} giữ bản cũ.</p>
          </div>
          <div className="col-span-3">{hint}</div>
        </div>
      ) : (
        <div className="flex items-center justify-end gap-2.5 border-t border-border p-4">
          <span className="mr-auto">{hint}</span>
          <Button type="button" variant="outline" onClick={onClose}>
            Huỷ
          </Button>
          <Button type="button" variant="primary" disabled={!ok || pending} loading={revise.isPending} onClick={saveAll}>
            {n > 1 ? `Lưu cho cả ${n} rubric` : 'Lưu'}
          </Button>
        </div>
      )}
    </>
  );
}
```
Checks against the tests: the chip text `A · Tính đúng đắn · −1,0` — `criterionTitle('A', …)` finds no overview named "A" in `[A, B]` (overview names are 'Giữa kỳ CTDL'/'Cuối kỳ CTDL'), so the title falls back to `tiêu chí đã xoá` and the chip reads `A · tiêu chí đã xoá · −1,0`; the test regex `/^A · .* · −1,0$/` still matches. The test `getByText('Bạn đang mở từ Thư viện lỗi.', { exact: false })` matches the context `<span>` ("Bạn đang mở từ Thư viện lỗi. Tiêu chí và điểm trừ không sửa ở đây — …") ✓.

- [ ] **Step 3: Run, lint, commit**

```powershell
pnpm exec vitest run src/app/teacher/rules/_components/EditErrorDrawer.test.tsx
pnpm exec tsc --noEmit
pnpm exec eslint src/app/teacher/rules
```
Expected: PASS.

```bash
git add apps/web/src/app/teacher/rules
git commit -m "feat(web): edit-error drawer — save for all rubrics or only the open one"
```

---

## Task B9: "Lỗi AI đề xuất" and "Thư viện lỗi" tabs (T-RBE-UI-7, UI-8)

**Files:**
- Create: `_components/ProposalsTab.tsx`, `_components/LibraryTab.tsx`, tests `ProposalsTab.test.tsx`, `LibraryTab.test.tsx`

**Interfaces:**
- Consumes: `useDismissRule` (B1), `UsesMore`, `DetectionBadge` (B6), `capNames`, `shorten` (B2).
- Produces:

```tsx
<ProposalsTab overview proposals={ProposalItem[] | undefined} loading error={Error | null} onAdd(p: ProposalItem) />
<LibraryTab rules={LibraryRule[] | undefined} loading error={Error | null} overviews={RubricOverview[]}
            onEdit(rule: LibraryRule) onOpenRubric(name: string) />
```

- [ ] **Step 1: Write the failing tests**

`ProposalsTab.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { toast } from 'sonner';
import { ProposalsTab } from './ProposalsTab';
import { mutation, overview, proposal } from './fixtures';

const h = vi.hoisted(() => ({ dismiss: undefined as unknown }));
vi.mock('@/hooks/useRules', () => ({ useDismissRule: () => h.dismiss }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const board = overview({ rubricName: 'Giữa kỳ CTDL', proposalCount: 2 });
const items = [
  proposal({ id: 'p1', name: 'Hàm pop không kiểm tra ngăn xếp rỗng', sightings: { sessions: [{ id: 's1', name: 'Ca sáng' }], results: 4 } }),
  proposal({ id: 'p2', name: 'Con trỏ top không được cập nhật', sightings: { sessions: [{ id: 's1', name: 'Ca sáng' }, { id: 's2', name: 'Ca chiều' }, { id: 's3', name: 'Ca tối' }], results: 2 } }),
];

const mount = (over: Partial<React.ComponentProps<typeof ProposalsTab>> = {}) => {
  const onAdd = vi.fn();
  render(<ProposalsTab overview={board} proposals={items} loading={false} error={null} onAdd={onAdd} {...over} />);
  return onAdd;
};

beforeEach(() => {
  vi.clearAllMocks();
  h.dismiss = mutation();
});

describe('ProposalsTab (T-RBE-UI-7)', () => {
  it('nói đây là lỗi AI thấy mà chưa tính điểm, kèm số lượng', () => {
    mount();
    expect(screen.getByText(/2 lỗi AI thấy khi chấm nhưng chưa có trong bảng/)).toBeInTheDocument();
    expect(screen.getByText(/bị bỏ ra khỏi điểm/)).toBeInTheDocument();
  });

  it('mỗi thẻ có ngữ cảnh: số bài, phiên (chặn trần), rubric', () => {
    mount();
    const card = screen.getByRole('heading', { name: 'Con trỏ top không được cập nhật' }).closest('li') as HTMLElement;
    expect(within(card).getByText('Thấy ở 2 bài')).toBeInTheDocument();
    expect(within(card).getByText('Ca sáng, Ca chiều và 1 phiên khác')).toBeInTheDocument();
    expect(within(card).getByText('Rubric: Giữa kỳ CTDL')).toBeInTheDocument();
  });

  it('lỗi cũ chưa từng ghi nhận nơi thấy: nói thẳng là chưa rõ, không bịa số bài', () => {
    mount({ proposals: [proposal({ id: 'p9', name: 'Lỗi cũ', legacy: true, sightings: { sessions: [], results: 0 } })] });
    expect(screen.getByText('Chưa rõ thấy ở đâu')).toBeInTheDocument();
    expect(screen.queryByText(/Thấy ở/)).not.toBeInTheDocument();
  });

  it('"Thêm vào rubric này" chuyển đúng lỗi đề xuất cho ngăn kéo', () => {
    const onAdd = mount();
    fireEvent.click(within(screen.getByRole('heading', { name: 'Hàm pop không kiểm tra ngăn xếp rỗng' }).closest('li') as HTMLElement).getByRole('button', { name: 'Thêm vào rubric này' }));
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1' }));
  });

  it('"Không phải lỗi" hỏi xác nhận nêu hệ quả; xác nhận rồi mới gửi', () => {
    mount();
    fireEvent.click(within(screen.getByRole('heading', { name: 'Hàm pop không kiểm tra ngăn xếp rỗng' }).closest('li') as HTMLElement).getByRole('button', { name: 'Không phải lỗi' }));
    expect(screen.getByRole('heading', { name: 'Đánh dấu “không phải lỗi”?' })).toBeInTheDocument();
    expect(screen.getByText(/các bài đang chờ nó được tính lại/)).toBeInTheDocument();
    const m = (h.dismiss as ReturnType<typeof mutation>).mutate;
    expect(m).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Đánh dấu không phải lỗi' }));
    expect(m).toHaveBeenCalledWith({ ruleId: 'p1' }, expect.anything());
  });

  it('sau khi đánh dấu: đọc kết quả tính lại bằng lời và đóng hộp thoại', () => {
    mount();
    fireEvent.click(within(screen.getByRole('heading', { name: 'Hàm pop không kiểm tra ngăn xếp rỗng' }).closest('li') as HTMLElement).getByRole('button', { name: 'Không phải lỗi' }));
    fireEvent.click(screen.getByRole('button', { name: 'Đánh dấu không phải lỗi' }));
    (h.dismiss as ReturnType<typeof mutation>).mutate.mock.calls[0][1].onSuccess({ recompute: { recomputed: 3, promoted: 2, demoted: 0, belowFloor: 0 } });
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('Đã tính lại 3 bài: 2 bài đủ điều kiện tự quyết.'));
    expect(screen.queryByRole('heading', { name: 'Đánh dấu “không phải lỗi”?' })).not.toBeInTheDocument();
  });

  it('lỗi của máy chủ khi đánh dấu hiện nguyên văn trong hộp thoại', () => {
    (h.dismiss as ReturnType<typeof mutation>).isError = true;
    (h.dismiss as ReturnType<typeof mutation>).error = new Error('Không tìm thấy luật');
    mount();
    fireEvent.click(within(screen.getByRole('heading', { name: 'Hàm pop không kiểm tra ngăn xếp rỗng' }).closest('li') as HTMLElement).getByRole('button', { name: 'Không phải lỗi' }));
    expect(screen.getByText('Không tìm thấy luật')).toBeInTheDocument();
  });

  it('không có lỗi đề xuất: nói vậy, không để trang trống', () => {
    mount({ proposals: [] });
    expect(screen.getByText('AI chưa báo lỗi nào ngoài bảng ở rubric này.')).toBeInTheDocument();
  });

  it('đang tải / lỗi tải', () => {
    const { unmount } = render(<ProposalsTab overview={board} proposals={undefined} loading error={null} onAdd={vi.fn()} />);
    expect(screen.getByText('Đang tải…')).toBeInTheDocument();
    unmount();
    render(<ProposalsTab overview={board} proposals={undefined} loading={false} error={new Error('Máy chủ không trả lời')} onAdd={vi.fn()} />);
    expect(screen.getByText(/Không tải được lỗi AI đề xuất — Máy chủ không trả lời/)).toBeInTheDocument();
  });
});
```
(The `Không tìm thấy luật` string is a server message shown verbatim; the vocabulary test in B11 never renders this error path.)

`LibraryTab.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { LibraryTab } from './LibraryTab';
import { criterion, libraryRule, overview } from './fixtures';

const boards = [
  overview({ rubricName: 'Giữa kỳ CTDL', criteria: [criterion({ key: 'tinh_dung', description: 'Tính đúng đắn' })] }),
  overview({ rubricName: 'Cuối kỳ CTDL', criteria: [criterion({ key: 'tinh_dung', description: 'Tính đúng đắn' })] }),
];
const used = (n: number) => Array.from({ length: n }, (_, i) => ({ rubricName: i === 0 ? 'Giữa kỳ CTDL' : i === 1 ? 'Cuối kỳ CTDL' : `Rubric ${i + 1}`, criterionKey: 'tinh_dung', deduction: i === 2 ? null : '1.50' }));

function mount(over: Partial<React.ComponentProps<typeof LibraryTab>> = {}) {
  const h = { onEdit: vi.fn(), onOpenRubric: vi.fn() };
  render(<LibraryTab rules={[libraryRule({ uses: used(2) })]} loading={false} error={null} overviews={boards} {...h} {...over} />);
  return h;
}

describe('LibraryTab (T-RBE-UI-8)', () => {
  it('nói đây là lỗi dùng chung: sửa ở đây đổi cả các rubric; điểm trừ mỗi rubric một khác', () => {
    mount();
    expect(screen.getByText(/Sửa ở đây là đổi cho tất cả rubric đang dùng lỗi đó/)).toBeInTheDocument();
    expect(screen.getByText(/mỗi rubric một khác/)).toBeInTheDocument();
  });

  it('mỗi lỗi: tên, mô tả, cách phát hiện, và nơi dùng (rubric · tiêu chí · điểm trừ)', () => {
    mount();
    const row = screen.getByText('Sai ca biên').closest('[data-testid="library-row"]') as HTMLElement;
    expect(within(row).getByText('Tự động')).toBeInTheDocument();
    expect(within(row).getByText('Giữa kỳ CTDL · Tính đúng đắn')).toBeInTheDocument();
    expect(within(row).getAllByText('−1,5')).toHaveLength(2);
  });

  it('chưa dùng ở rubric nào thì nói vậy', () => {
    mount({ rules: [libraryRule({ uses: [] })] });
    expect(screen.getByText('Chưa dùng ở rubric nào')).toBeInTheDocument();
  });

  it('chặn trần ba nơi dùng; "và N nơi dùng khác" mở đủ danh sách, bấm một dòng chuyển rubric', () => {
    const h = mount({ rules: [libraryRule({ uses: used(5) })] });
    const row = screen.getByText('Sai ca biên').closest('[data-testid="library-row"]') as HTMLElement;
    expect(within(row).queryByText('Rubric 5 · tiêu chí đã xoá')).not.toBeInTheDocument();
    fireEvent.click(within(row).getByRole('button', { name: 'và 2 nơi dùng khác' }));
    const list = screen.getByRole('dialog', { name: 'Sai ca biên — đang dùng ở 5 nơi' });
    expect(within(list).getByText('Rubric 5')).toBeInTheDocument();
    expect(within(list).getAllByRole('listitem')).toHaveLength(5);
    fireEvent.click(within(list).getByRole('button', { name: /Rubric 5/ }));
    expect(h.onOpenRubric).toHaveBeenCalledWith('Rubric 5');
  });

  it('"Sửa lỗi" gửi đúng lỗi cho ngăn kéo', () => {
    const rule = libraryRule({ id: 'r7' });
    const h = mount({ rules: [rule] });
    fireEvent.click(screen.getByRole('button', { name: 'Sửa lỗi Sai ca biên' }));
    expect(h.onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 'r7' }));
  });

  it('thư viện rỗng, đang tải, lỗi tải', () => {
    const { unmount } = render(<LibraryTab rules={[]} loading={false} error={null} overviews={boards} onEdit={vi.fn()} onOpenRubric={vi.fn()} />);
    expect(screen.getByText(/Thư viện chưa có lỗi nào/)).toBeInTheDocument();
    unmount();
    const second = render(<LibraryTab rules={undefined} loading error={null} overviews={boards} onEdit={vi.fn()} onOpenRubric={vi.fn()} />);
    expect(screen.getByText('Đang tải…')).toBeInTheDocument();
    second.unmount();
    render(<LibraryTab rules={undefined} loading={false} error={new Error('Máy chủ không trả lời')} overviews={boards} onEdit={vi.fn()} onOpenRubric={vi.fn()} />);
    expect(screen.getByText(/Không tải được thư viện lỗi — Máy chủ không trả lời/)).toBeInTheDocument();
  });
});
```
(In `used(5)` the third use has `deduction: null` and rubric names `Rubric 3..5` do not exist in `boards`, so their criterion title falls back to `tiêu chí đã xoá`.)

Run both → Expected FAIL (modules missing).

- [ ] **Step 2: Implement**

`_components/ProposalsTab.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { Info, Plus, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useDismissRule } from '@/hooks/useRules';
import type { RubricOverview } from '@/lib/api/rubric-errors';
import type { ProposalItem } from '@/lib/api/rules';
import { capNames } from '@/lib/rubric-board';
import { describeRecompute } from '@/lib/rules-vocab';

/**
 * "Lỗi AI đề xuất" (spec D5): lỗi agent gặp khi chấm mà bảng chưa có dòng nào khớp. Mỗi thẻ nói rõ nó thấy ở phiên
 * nào, bao nhiêu bài (của rubric đang mở), và rằng lỗi đó ĐANG BỊ BỎ KHỎI ĐIỂM — hệ thống không đoán lỗi gần nhất.
 * "Không phải lỗi" đổi điểm các phiên chưa chốt nên luôn hỏi xác nhận trước.
 */
export function ProposalsTab({
  overview,
  proposals,
  loading,
  error,
  onAdd,
}: {
  overview: RubricOverview;
  proposals: ProposalItem[] | undefined;
  loading: boolean;
  error: Error | null;
  onAdd: (proposal: ProposalItem) => void;
}) {
  const [confirming, setConfirming] = useState<ProposalItem | null>(null);
  const dismiss = useDismissRule();

  if (loading) {
    return (
      <div className="mt-4 flex flex-col gap-2">
        <p className="text-small text-muted-foreground">Đang tải…</p>
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }
  if (error) {
    return (
      <Alert variant="destructive" className="mt-4">
        <AlertDescription>Không tải được lỗi AI đề xuất — {error.message}. Thử tải lại trang.</AlertDescription>
      </Alert>
    );
  }
  const list = proposals ?? [];
  if (list.length === 0) {
    return (
      <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-primary/20 bg-primary-subtle px-4 py-3 text-primary">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>AI chưa báo lỗi nào ngoài bảng ở rubric này.</span>
      </div>
    );
  }

  return (
    <div>
      <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-warning/40 bg-warning-subtle px-4 py-3 text-warning-strong">
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          <b>{list.length} lỗi AI thấy khi chấm nhưng chưa có trong bảng.</b> Các lỗi này đang <b>bị bỏ ra khỏi điểm</b> — hệ thống không tự đoán lỗi gần nhất. Thêm vào rubric này, hoặc đánh dấu “không phải lỗi”.
        </span>
      </div>

      <ul className="mt-3.5 grid gap-3.5 md:grid-cols-2">
        {list.map((p) => (
          <li key={p.id} className="flex flex-col justify-between gap-3 rounded-lg border border-border bg-surface p-4 shadow-sm">
            <div>
              <h3 className="text-body font-semibold">{p.name}</h3>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {p.legacy ? (
                  <Badge>Chưa rõ thấy ở đâu</Badge>
                ) : (
                  <>
                    <Badge>Thấy ở {p.sightings.results} bài</Badge>
                    {p.sightings.sessions.length > 0 && <Badge>{capNames(p.sightings.sessions.map((s) => s.name), 2, 'phiên')}</Badge>}
                  </>
                )}
                <Badge>Rubric: {overview.rubricName}</Badge>
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="outline" className="border-primary text-primary" onClick={() => onAdd(p)}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                Thêm vào rubric này
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setConfirming(p)}>
                Không phải lỗi
              </Button>
            </div>
          </li>
        ))}
      </ul>

      <Dialog open={confirming !== null} onOpenChange={(open) => !open && setConfirming(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Đánh dấu “không phải lỗi”?</DialogTitle>
            <DialogDescription>Lỗi này sẽ không xuất hiện ở bài nữa; các bài đang chờ nó được tính lại.</DialogDescription>
          </DialogHeader>
          {confirming && <p className="text-small text-muted-foreground">{confirming.name}</p>}
          {dismiss.isError && (
            <Alert variant="destructive">
              <AlertDescription>{dismiss.error?.message}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirming(null)}>
              Huỷ
            </Button>
            <Button
              type="button"
              variant="primary"
              loading={dismiss.isPending}
              onClick={() => {
                if (!confirming) return;
                const target = confirming;
                dismiss.mutate(
                  { ruleId: target.id },
                  {
                    onSuccess: (r) => {
                      toast.success(`Đã đánh dấu “${target.name}” là không phải lỗi. ${describeRecompute(r.recompute)}`);
                      setConfirming(null);
                    },
                  },
                );
              }}
            >
              Đánh dấu không phải lỗi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

`_components/LibraryTab.tsx`:

```tsx
'use client';

import { Info } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { RubricOverview } from '@/lib/api/rubric-errors';
import type { LibraryRule } from '@/lib/api/rules';
import { shorten } from '@/lib/rubric-board';
import { deductionLabel } from '@/lib/rules-vocab';
import { DetectionBadge } from './DetectionBadge';
import { UsesMore } from './UsesMore';

const SHOWN = 3;

/**
 * Thư viện lỗi: danh tính lỗi dùng chung (tên, mô tả, cách phát hiện). Không có cột điểm trừ chung vì điểm trừ mỗi
 * rubric một khác (D1) — thay vào đó mỗi lỗi liệt kê nơi nó đang dùng, chặn trần ba dòng (T-RBE-UI-8).
 */
export function LibraryTab({
  rules,
  loading,
  error,
  overviews,
  onEdit,
  onOpenRubric,
}: {
  rules: LibraryRule[] | undefined;
  loading: boolean;
  error: Error | null;
  overviews: RubricOverview[];
  onEdit: (rule: LibraryRule) => void;
  onOpenRubric: (name: string) => void;
}) {
  if (loading) {
    return (
      <div className="mt-4 flex flex-col gap-2">
        <p className="text-small text-muted-foreground">Đang tải…</p>
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }
  if (error) {
    return (
      <Alert variant="destructive" className="mt-4">
        <AlertDescription>Không tải được thư viện lỗi — {error.message}. Thử tải lại trang.</AlertDescription>
      </Alert>
    );
  }

  const title = (rubricName: string, key: string) =>
    shorten(overviews.find((o) => o.rubricName === rubricName)?.criteria.find((c) => c.key === key)?.description ?? 'tiêu chí đã xoá', 40);
  const list = rules ?? [];

  return (
    <div>
      <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-primary/20 bg-primary-subtle px-4 py-3 text-primary">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          Đây là danh sách các lỗi bạn đã viết. <b>Sửa ở đây là đổi cho tất cả rubric đang dùng lỗi đó.</b> Muốn đổi riêng một rubric: mở rubric đó, bấm ⋯ ở dòng lỗi rồi chọn Sửa. <b>Tiêu chí và điểm trừ thì mỗi rubric một khác</b>, nên không có cột điểm trừ chung ở đây.
        </span>
      </div>

      {list.length === 0 ? (
        <p className="mt-4 text-muted-foreground">Thư viện chưa có lỗi nào. Lỗi bạn thêm vào rubric sẽ xuất hiện ở đây.</p>
      ) : (
        <div className="mt-3.5 overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
          {list.map((rule) => {
            const shown = rule.uses.slice(0, SHOWN);
            const more = rule.uses.length - shown.length;
            return (
              <div
                key={rule.id}
                data-testid="library-row"
                className="flex flex-col gap-3 border-t border-border px-4 py-3 first:border-t-0 lg:grid lg:grid-cols-[minmax(0,1.1fr)_140px_minmax(0,1.4fr)_120px] lg:items-center lg:gap-4"
              >
                <div className="min-w-0">
                  <b className="font-semibold">{rule.revision.name}</b>
                  <p className="text-small text-muted-foreground">{rule.revision.description}</p>
                </div>
                <div>
                  <DetectionBadge predicate={rule.revision.predicate} />
                </div>
                <div className="flex flex-col gap-1 text-small">
                  {rule.uses.length === 0 && <span className="text-muted-foreground">Chưa dùng ở rubric nào</span>}
                  {shown.map((u) => (
                    <div key={u.rubricName} className="flex flex-wrap items-baseline gap-1.5">
                      <span>{`${u.rubricName} · ${title(u.rubricName, u.criterionKey)}`}</span>
                      <b className="tabular-nums">{deductionLabel(u.deduction)}</b>
                    </div>
                  ))}
                  {more > 0 && (
                    <div>
                      <UsesMore
                        label={`và ${more} nơi dùng khác`}
                        title={`${rule.revision.name} — đang dùng ở ${rule.uses.length} nơi`}
                        items={rule.uses.map((u) => ({
                          key: u.rubricName,
                          name: u.rubricName,
                          sub: title(u.rubricName, u.criterionKey),
                          value: deductionLabel(u.deduction),
                        }))}
                        onPick={onOpenRubric}
                      />
                    </div>
                  )}
                </div>
                <div className="flex lg:justify-end">
                  <Button type="button" size="sm" variant="outline" aria-label={`Sửa lỗi ${rule.revision.name}`} onClick={() => onEdit(rule)}>
                    Sửa lỗi
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Run, lint, commit**

```powershell
pnpm exec vitest run src/app/teacher/rules/_components/ProposalsTab.test.tsx src/app/teacher/rules/_components/LibraryTab.test.tsx
pnpm exec tsc --noEmit
pnpm exec eslint src/app/teacher/rules
```
Expected: PASS.

```bash
git add apps/web/src/app/teacher/rules
git commit -m "feat(web): AI-proposed errors with context and the shared-error library"
```

---

## Task B10: Waiver dialog, first-time screen, rubric dialog with copy (T-RBE-UI-3, UI-10)

**Files:**
- Create: `_components/WaiverDialog.tsx`, `_components/Onboarding.tsx`, tests `WaiverDialog.test.tsx`, `Onboarding.test.tsx`
- Rewrite: `_components/RubricDialog.tsx`, `_components/RubricDialog.test.tsx`
- Modify: `lib/rubric-form.ts`, `lib/rubric-form.test.ts`

**Interfaces:**

```tsx
<WaiverDialog target={{ criterion: OverviewCriterion; rubricId: string } | null} onClose />
<Onboarding onCreate() />
<RubricDialog open onOpenChange(open) rubric?={Rubric} existingNames errorCounts={Record<string, number>}
              overviews={RubricOverview[]} onSaved(saved: Rubric) />
```
`RubricDialog` without `rubric` = create; with `overviews.length > 0` it starts in "copy from an existing rubric" mode with **no source preselected** and, after the new rubric is saved, calls `copyErrors(source, new)` if the box "Sao chép cả N lỗi và điểm trừ" is checked.

- [ ] **Step 1: Write the failing tests**

`WaiverDialog.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { toast } from 'sonner';
import { WaiverDialog } from './WaiverDialog';
import { criterion, mutation } from './fixtures';

const h = vi.hoisted(() => ({ set: undefined as unknown, revoke: undefined as unknown, rubricId: undefined as string | undefined }));
vi.mock('@/hooks/useRules', () => ({
  useSetWaiver: (rubricId: string | undefined) => {
    h.rubricId = rubricId;
    return h.set;
  },
  useRevokeWaiver: () => h.revoke,
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const empty = criterion({ key: 'bo_nho', description: 'Quản lý bộ nhớ', maxPoints: 2, errorCount: 0 });
const waived = criterion({ key: 'bo_nho', description: 'Quản lý bộ nhớ', maxPoints: 2, errorCount: 0, waiverId: 'w1' });

beforeEach(() => {
  vi.clearAllMocks();
  h.set = mutation();
  h.revoke = mutation();
});

describe('WaiverDialog', () => {
  it('đánh dấu: nói hậu quả (trọn điểm, tính lại phiên chưa chốt) rồi gửi đúng khoá tiêu chí cho đúng rubric', () => {
    const onClose = vi.fn();
    render(<WaiverDialog target={{ criterion: empty, rubricId: 'ru-9' }} onClose={onClose} />);
    expect(h.rubricId).toBe('ru-9');
    expect(screen.getByRole('heading', { name: 'Đánh dấu tiêu chí không trừ điểm?' })).toBeInTheDocument();
    expect(screen.getByText(/“Quản lý bộ nhớ” luôn trọn điểm cho mọi bài chấm theo rubric này/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Đánh dấu không trừ điểm' }));
    const m = (h.set as ReturnType<typeof mutation>).mutate;
    expect(m).toHaveBeenCalledWith('bo_nho', expect.anything());
    m.mock.calls[0][1].onSuccess({ waiverId: 'w9', recompute: { recomputed: 4, promoted: 4, demoted: 0, belowFloor: 0 } });
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('Đã tính lại 4 bài: 4 bài đủ điều kiện tự quyết.'));
    expect(onClose).toHaveBeenCalled();
  });

  it('đánh dấu đã có từ trước (recompute null): nói không tính lại bài nào', () => {
    render(<WaiverDialog target={{ criterion: empty, rubricId: 'ru-9' }} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Đánh dấu không trừ điểm' }));
    (h.set as ReturnType<typeof mutation>).mutate.mock.calls[0][1].onSuccess({ waiverId: 'w9', recompute: null });
    expect(toast.success).toHaveBeenCalledWith('Đánh dấu này đã có từ trước, không tính lại bài nào.');
  });

  it('bỏ đánh dấu: nói bài chưa có lỗi cho tiêu chí này sẽ không tự quyết được, rồi gửi id đánh dấu', () => {
    render(<WaiverDialog target={{ criterion: waived, rubricId: 'ru-9' }} onClose={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Bỏ đánh dấu "không trừ điểm"?' })).toBeInTheDocument();
    expect(screen.getByText(/không tự quyết được \("Cần bạn xem"\)/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Bỏ đánh dấu' }));
    expect((h.revoke as ReturnType<typeof mutation>).mutate).toHaveBeenCalledWith('w1', expect.anything());
  });

  it('lỗi của máy chủ hiện nguyên văn', () => {
    (h.set as ReturnType<typeof mutation>).isError = true;
    (h.set as ReturnType<typeof mutation>).error = new Error('Tiêu chí đã có lỗi');
    render(<WaiverDialog target={{ criterion: empty, rubricId: 'ru-9' }} onClose={vi.fn()} />);
    expect(screen.getByText('Tiêu chí đã có lỗi')).toBeInTheDocument();
  });

  it('target = null thì không hiện gì; Huỷ không gửi gì', () => {
    const { unmount } = render(<WaiverDialog target={null} onClose={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    unmount();
    const onClose = vi.fn();
    render(<WaiverDialog target={{ criterion: empty, rubricId: 'ru-9' }} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Huỷ' }));
    expect(onClose).toHaveBeenCalled();
    expect((h.set as ReturnType<typeof mutation>).mutate).not.toHaveBeenCalled();
  });
});
```

`Onboarding.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { Onboarding } from './Onboarding';

describe('Onboarding (chưa có rubric nào)', () => {
  it('dạy cây Rubric → Tiêu chí → Lỗi và thứ tự việc, thay cho ngõ cụt', () => {
    render(<Onboarding onCreate={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Bắt đầu với một rubric' })).toBeInTheDocument();
    expect(screen.getByText('Tạo rubric')).toBeInTheDocument();
    expect(screen.getByText('Thêm lỗi cho từng tiêu chí')).toBeInTheDocument();
    expect(screen.getByText('Gắn rubric vào phiên thi')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Cách các phần ghép lại' })).toBeInTheDocument();
    expect(screen.getByText(/Một lỗi có thể dùng ở nhiều rubric, mỗi rubric có điểm trừ riêng/)).toBeInTheDocument();
  });

  it('"Tạo rubric đầu tiên" mở hộp thoại tạo', () => {
    const onCreate = vi.fn();
    render(<Onboarding onCreate={onCreate} />);
    fireEvent.click(screen.getByRole('button', { name: 'Tạo rubric đầu tiên' }));
    expect(onCreate).toHaveBeenCalled();
  });
});
```

`RubricDialog.test.tsx` (overwrite — the old assertions ported to the new vocabulary, plus the copy flow):

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { toast } from 'sonner';
import { RubricDialog } from './RubricDialog';
import { criterion, overview } from './fixtures';
import type { Rubric } from '@/lib/api/grading';

const mutate = vi.fn();
const copyMutate = vi.fn();
let saveState: { isPending: boolean; isError: boolean; error: Error | null };
vi.mock('@/hooks/useGrading', () => ({ useSaveRubric: () => ({ mutate, ...saveState }) }));
vi.mock('@/hooks/useRubricErrors', () => ({ useCopyErrors: () => ({ mutate: copyMutate, isPending: false }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const rubric: Rubric = {
  id: 'ru-1', teacherId: 't', name: 'CTDL', version: 2, isActive: true, totalPoints: 8.5,
  criteria: [
    { id: 'c1', key: 'tinh_dung', description: 'Tính đúng', maxPoints: 6 },
    { id: 'c2', key: 'trinh_bay', description: 'Trình bày', maxPoints: 2.5 },
  ],
};
const saved: Rubric = { ...rubric, id: 'ru-3', version: 3 };

type Props = React.ComponentProps<typeof RubricDialog>;
const props = (over: Partial<Props> = {}): Props => ({
  open: true, onOpenChange: vi.fn(), rubric, existingNames: ['CTDL'], errorCounts: {}, overviews: [], onSaved: vi.fn(), ...over,
});
const saveButton = () => screen.getByRole('button', { name: /^(Lưu thay đổi|Tạo rubric)/ });

beforeEach(() => {
  vi.clearAllMocks();
  mutate.mockReset();
  copyMutate.mockReset();
  saveState = { isPending: false, isError: false, error: null };
});

describe('RubricDialog — sửa tiêu chí & điểm tối đa của một rubric', () => {
  it('hiện tên rubric như chữ (tên làm nên danh tính), các hàng điền sẵn', () => {
    render(<RubricDialog {...props()} />);
    expect(screen.getByRole('heading', { name: /Sửa tiêu chí & điểm tối đa/ })).toHaveTextContent('CTDL');
    expect(screen.queryByLabelText('Tên rubric')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Tiêu chí 1')).toHaveValue('Tính đúng');
    expect(screen.getByLabelText('Điểm tối đa 2')).toHaveValue('2.5');
  });

  it('khoá của tiêu chí có sẵn chỉ đọc — không có ô để đổi', () => {
    render(<RubricDialog {...props()} />);
    expect(screen.getByText('tinh_dung')).toHaveClass('font-mono');
    expect(screen.queryByLabelText(/Khoá tiêu chí 1/)).not.toBeInTheDocument();
  });

  it('nói hệ thống tự giữ lịch sử, KHÔNG nhắc "phiên bản"', () => {
    render(<RubricDialog {...props()} />);
    expect(screen.getByText(/Hệ thống tự giữ lịch sử mọi lần sửa/)).toBeInTheDocument();
    expect(screen.queryByText(/phiên bản/i)).not.toBeInTheDocument();
  });

  it('Lưu thay đổi khoá cho tới khi có gì đổi', () => {
    render(<RubricDialog {...props()} />);
    expect(saveButton()).toBeDisabled();
  });

  // Review Focus 1 của spec cũ — lý do hộp thoại này tồn tại thay cho RubricEditor.
  it('viết lại mô tả thì gửi KHOÁ GỐC của tiêu chí đó, và của mọi tiêu chí còn lại', () => {
    render(<RubricDialog {...props()} />);
    fireEvent.change(screen.getByLabelText('Tiêu chí 1'), { target: { value: 'Chương trình chạy đúng trên mọi test' } });
    fireEvent.click(saveButton());
    expect(mutate).toHaveBeenCalledWith(
      {
        name: 'CTDL',
        criteria: [
          { description: 'Chương trình chạy đúng trên mọi test', maxPoints: 6, key: 'tinh_dung' },
          { description: 'Trình bày', maxPoints: 2.5, key: 'trinh_bay' },
        ],
      },
      expect.anything(),
    );
  });

  it('nhận điểm tối đa gõ bằng dấu phẩy và gửi số', () => {
    render(<RubricDialog {...props()} />);
    fireEvent.change(screen.getByLabelText('Điểm tối đa 2'), { target: { value: '3,25' } });
    fireEvent.click(saveButton());
    expect(mutate.mock.calls[0][0].criteria[1]).toMatchObject({ maxPoints: 3.25, key: 'trinh_bay' });
  });

  it('tiêu chí mới có thể mang khoá tự gõ, hoặc không (máy chủ tự sinh)', () => {
    render(<RubricDialog {...props()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Thêm tiêu chí' }));
    fireEvent.change(screen.getByLabelText('Tiêu chí 3'), { target: { value: 'Xử lý ngoại lệ' } });
    fireEvent.change(screen.getByLabelText('Khoá tiêu chí 3 (tuỳ chọn)'), { target: { value: 'ngoai_le' } });
    fireEvent.click(screen.getByRole('button', { name: 'Thêm tiêu chí' }));
    fireEvent.change(screen.getByLabelText('Tiêu chí 4'), { target: { value: 'Đặt tên biến rõ nghĩa' } });
    fireEvent.click(saveButton());
    const criteria = mutate.mock.calls[0][0].criteria;
    expect(criteria[2]).toEqual({ description: 'Xử lý ngoại lệ', maxPoints: 1, key: 'ngoai_le' });
    expect('key' in criteria[3]).toBe(false);
  });

  it('xoá một tiêu chí thì nó rời khỏi yêu cầu', () => {
    render(<RubricDialog {...props()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Xoá tiêu chí 2' }));
    fireEvent.click(saveButton());
    expect(mutate.mock.calls[0][0].criteria).toHaveLength(1);
  });

  it('cảnh báo — không chặn — rằng các lỗi nằm trong tiêu chí bị xoá sẽ cần chuyển sang tiêu chí khác', () => {
    render(<RubricDialog {...props({ errorCounts: { trinh_bay: 3 } })} />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Xoá tiêu chí 2' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Còn 3 lỗi đang nằm trong tiêu chí “Trình bày” — sau khi lưu, chúng cần được chuyển sang tiêu chí khác.');
    expect(saveButton()).toBeEnabled();
  });

  it('không xoá được tiêu chí cuối cùng', () => {
    render(<RubricDialog {...props()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Xoá tiêu chí 2' }));
    expect(screen.getByRole('button', { name: 'Xoá tiêu chí 1' })).toBeDisabled();
  });

  it('điểm tối đa sai: thông báo cạnh ô, khoá nút lưu, không gửi gì', () => {
    render(<RubricDialog {...props()} />);
    fireEvent.change(screen.getByLabelText('Điểm tối đa 1'), { target: { value: '0' } });
    fireEvent.blur(screen.getByLabelText('Điểm tối đa 1'));
    expect(screen.getByText('Điểm tối đa: từ 0,25 đến 100, tối đa hai chữ số lẻ.')).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
    fireEvent.click(saveButton());
    expect(mutate).not.toHaveBeenCalled();
  });

  it('khoá gõ trùng bị bắt trước khi tới máy chủ', () => {
    render(<RubricDialog {...props()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Thêm tiêu chí' }));
    fireEvent.change(screen.getByLabelText('Tiêu chí 3'), { target: { value: 'Một tiêu chí mới' } });
    fireEvent.change(screen.getByLabelText('Khoá tiêu chí 3 (tuỳ chọn)'), { target: { value: 'tinh_dung' } });
    fireEvent.blur(screen.getByLabelText('Khoá tiêu chí 3 (tuỳ chọn)'));
    expect(screen.getByText('Trùng khoá với một tiêu chí khác.')).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
  });

  it('thành công: báo rubric đã lưu và đóng', () => {
    mutate.mockImplementation((_input: unknown, opts: { onSuccess: (r: Rubric) => void }) => opts.onSuccess(saved));
    const onSaved = vi.fn();
    const onOpenChange = vi.fn();
    render(<RubricDialog {...props({ onSaved, onOpenChange })} />);
    fireEvent.change(screen.getByLabelText('Điểm tối đa 1'), { target: { value: '7' } });
    fireEvent.click(saveButton());
    expect(onSaved).toHaveBeenCalledWith(saved);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('lỗi của máy chủ khi lưu hiện nguyên văn', () => {
    saveState = { isPending: false, isError: true, error: new Error('Hai tiêu chí cùng khai key "x"') };
    render(<RubricDialog {...props()} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Hai tiêu chí cùng khai key "x"');
  });

  it('mỗi lần mở bắt đầu từ rubric như HIỆN TẠI, không phải thứ gõ dở lần trước', () => {
    const { rerender } = render(<RubricDialog {...props()} />);
    fireEvent.change(screen.getByLabelText('Tiêu chí 1'), { target: { value: 'dang dở' } });
    rerender(<RubricDialog {...props({ open: false })} />);
    rerender(<RubricDialog {...props({ open: true })} />);
    expect(screen.getByLabelText('Tiêu chí 1')).toHaveValue('Tính đúng');
  });
});

describe('RubricDialog — tạo rubric mới', () => {
  const create = (over: Partial<Props> = {}) => props({ rubric: undefined, ...over });
  const source = overview({
    rubricName: 'Nguồn',
    criteria: [
      criterion({ key: 'tinh_dung', description: 'Tính đúng', maxPoints: 6, errorCount: 3 }),
      criterion({ key: 'trinh_bay', description: 'Trình bày', maxPoints: 2.5, errorCount: 2 }),
    ],
  });

  describe('chưa có rubric nào (tạo trống)', () => {
    it('hỏi tên và bắt đầu với một tiêu chí trống; không có lựa chọn "bắt đầu từ"', () => {
      render(<RubricDialog {...create()} />);
      expect(screen.getByRole('heading', { name: 'Tạo rubric mới' })).toBeInTheDocument();
      expect(screen.queryByRole('group', { name: 'Bắt đầu từ' })).not.toBeInTheDocument();
      expect(screen.getByLabelText('Tên rubric')).toHaveValue('');
      expect(screen.getByLabelText('Tiêu chí 1')).toHaveValue('');
      expect(saveButton()).toBeDisabled();
    });

    it('từ chối tên đã có: lưu cùng tên là âm thầm tạo bản kế tiếp và sinh lại mọi khoá', () => {
      render(<RubricDialog {...create()} />);
      fireEvent.change(screen.getByLabelText('Tên rubric'), { target: { value: 'CTDL' } });
      fireEvent.blur(screen.getByLabelText('Tên rubric'));
      expect(screen.getByText(/Đã có rubric tên này/)).toBeInTheDocument();
      expect(saveButton()).toBeDisabled();
    });

    it('gửi tên và tiêu chí không kèm khoá', () => {
      render(<RubricDialog {...create()} />);
      fireEvent.change(screen.getByLabelText('Tên rubric'), { target: { value: 'Giữa kỳ Toán rời rạc' } });
      fireEvent.change(screen.getByLabelText('Tiêu chí 1'), { target: { value: 'Chứng minh đúng' } });
      fireEvent.change(screen.getByLabelText('Điểm tối đa 1'), { target: { value: '5' } });
      fireEvent.click(saveButton());
      expect(mutate).toHaveBeenCalledWith({ name: 'Giữa kỳ Toán rời rạc', criteria: [{ description: 'Chứng minh đúng', maxPoints: 5 }] }, expect.anything());
    });
  });

  describe('đã có rubric khác: sao chép (D3)', () => {
    it('mặc định là "Một rubric đã có"; ô nguồn KHÔNG chọn sẵn; chưa chọn thì nút tạo khoá và nói vì sao', () => {
      render(<RubricDialog {...create({ overviews: [source] })} />);
      expect(screen.getByRole('button', { name: /^Một rubric đã có/ })).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByLabelText('Sao chép từ')).toHaveValue('');
      expect(screen.getByRole('option', { name: 'Nguồn — 5 lỗi' })).toBeInTheDocument();
      expect(screen.getByText(/Chọn rubric ở trên để xem các tiêu chí sẽ được sao chép/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Tạo rubric' })).toBeDisabled();
    });

    it('chọn nguồn: điền sẵn tên "… — bản sao", tiêu chí và điểm tối đa; hộp sao chép lỗi được chọn sẵn', () => {
      render(<RubricDialog {...create({ overviews: [source] })} />);
      fireEvent.change(screen.getByLabelText('Sao chép từ'), { target: { value: 'Nguồn' } });
      expect(screen.getByLabelText('Tên rubric')).toHaveValue('Nguồn — bản sao');
      expect(screen.getByLabelText('Tiêu chí 1')).toHaveValue('Tính đúng');
      expect(screen.getByLabelText('Điểm tối đa 2')).toHaveValue('2.5');
      expect(screen.getByRole('checkbox', { name: /Sao chép cả 5 lỗi và điểm trừ/ })).toBeChecked();
    });

    it('lưu: tiêu chí GIỮ khoá của nguồn (để ghép lỗi), rồi sao chép lỗi vào rubric mới, rồi đóng', () => {
      mutate.mockImplementation((_i: unknown, opts: { onSuccess: (r: Rubric) => void }) => opts.onSuccess({ ...saved, id: 'ru-9', name: 'Nguồn — bản sao' }));
      copyMutate.mockImplementation((_v: unknown, opts: { onSuccess: (r: unknown) => void; onSettled: () => void }) => {
        opts.onSuccess({ copied: 5, skippedNoCriterion: 0, skippedExisting: 0, recompute: null });
        opts.onSettled();
      });
      const onSaved = vi.fn();
      const onOpenChange = vi.fn();
      render(<RubricDialog {...create({ overviews: [source], onSaved, onOpenChange })} />);
      fireEvent.change(screen.getByLabelText('Sao chép từ'), { target: { value: 'Nguồn' } });
      fireEvent.click(saveButton());
      expect(mutate).toHaveBeenCalledWith(
        {
          name: 'Nguồn — bản sao',
          criteria: [
            { description: 'Tính đúng', maxPoints: 6, key: 'tinh_dung' },
            { description: 'Trình bày', maxPoints: 2.5, key: 'trinh_bay' },
          ],
        },
        expect.anything(),
      );
      expect(copyMutate).toHaveBeenCalledWith({ from: 'Nguồn', to: 'Nguồn — bản sao' }, expect.anything());
      expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('sao chép 5 lỗi. Hai rubric từ giờ độc lập.'));
      expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ name: 'Nguồn — bản sao' }));
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('bỏ chọn hộp sao chép lỗi: chỉ tạo rubric, không sao chép gì', () => {
      mutate.mockImplementation((_i: unknown, opts: { onSuccess: (r: Rubric) => void }) => opts.onSuccess(saved));
      const onSaved = vi.fn();
      render(<RubricDialog {...create({ overviews: [source], onSaved })} />);
      fireEvent.change(screen.getByLabelText('Sao chép từ'), { target: { value: 'Nguồn' } });
      fireEvent.click(screen.getByRole('checkbox', { name: /Sao chép cả 5 lỗi/ }));
      fireEvent.click(saveButton());
      expect(copyMutate).not.toHaveBeenCalled();
      expect(onSaved).toHaveBeenCalledWith(saved);
    });

    it('sao chép lỗi hỏng sau khi rubric đã tạo: báo rõ, rubric vẫn được báo là đã lưu và hộp thoại đóng', () => {
      mutate.mockImplementation((_i: unknown, opts: { onSuccess: (r: Rubric) => void }) => opts.onSuccess({ ...saved, name: 'Nguồn — bản sao' }));
      copyMutate.mockImplementation((_v: unknown, opts: { onError: (e: Error) => void; onSettled: () => void }) => {
        opts.onError(new Error('Không tìm thấy rubric'));
        opts.onSettled();
      });
      const onSaved = vi.fn();
      render(<RubricDialog {...create({ overviews: [source], onSaved })} />);
      fireEvent.change(screen.getByLabelText('Sao chép từ'), { target: { value: 'Nguồn' } });
      fireEvent.click(saveButton());
      expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('nhưng chưa sao chép được lỗi — Không tìm thấy rubric'));
      expect(onSaved).toHaveBeenCalled();
    });

    it('chọn "Tạo trống": bỏ ô nguồn, bảng tiêu chí trống', () => {
      render(<RubricDialog {...create({ overviews: [source] })} />);
      fireEvent.click(screen.getByRole('button', { name: /^Tạo trống/ }));
      expect(screen.queryByLabelText('Sao chép từ')).not.toBeInTheDocument();
      expect(screen.getByLabelText('Tiêu chí 1')).toHaveValue('');
      expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    });
  });
});
```

Run `pnpm exec vitest run src/app/teacher/rules/_components/WaiverDialog.test.tsx src/app/teacher/rules/_components/Onboarding.test.tsx src/app/teacher/rules/_components/RubricDialog.test.tsx` → Expected FAIL (new components missing; RubricDialog props changed).

- [ ] **Step 2: Implement `WaiverDialog` and `Onboarding`**

`_components/WaiverDialog.tsx`:

```tsx
'use client';

import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useRevokeWaiver, useSetWaiver } from '@/hooks/useRules';
import type { OverviewCriterion } from '@/lib/api/rubric-errors';
import { shorten } from '@/lib/rubric-board';
import { describeRecompute } from '@/lib/rules-vocab';

export interface WaiverTarget {
  criterion: OverviewCriterion;
  /** Phiên bản MỚI NHẤT của rubric — đánh dấu gắn theo nó và được chép sang bản sau (spec 3.7). */
  rubricId: string;
}

/**
 * "Tiêu chí này không trừ điểm" (đánh dấu / bỏ đánh dấu). Cả hai đổi điểm các phiên chưa chốt nên LUÔN hỏi xác nhận
 * nói hậu quả trước, rồi đọc kết quả tính lại bằng lời sau.
 */
export function WaiverDialog({ target, onClose }: { target: WaiverTarget | null; onClose: () => void }) {
  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>{target && <WaiverBody key={target.criterion.key} target={target} onClose={onClose} />}</DialogContent>
    </Dialog>
  );
}

function WaiverBody({ target, onClose }: { target: WaiverTarget; onClose: () => void }) {
  const set = useSetWaiver(target.rubricId);
  const revoke = useRevokeWaiver();
  const { criterion } = target;
  const title = shorten(criterion.description, 60);
  const revoking = criterion.waiverId !== null;
  const mutation = revoking ? revoke : set;

  function confirm() {
    if (criterion.waiverId !== null) {
      revoke.mutate(criterion.waiverId, {
        onSuccess: (r) => {
          toast.success(describeRecompute(r.recompute));
          onClose();
        },
      });
      return;
    }
    set.mutate(criterion.key, {
      onSuccess: (r) => {
        toast.success(r.recompute === null ? 'Đánh dấu này đã có từ trước, không tính lại bài nào.' : describeRecompute(r.recompute));
        onClose();
      },
    });
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{revoking ? 'Bỏ đánh dấu "không trừ điểm"?' : 'Đánh dấu tiêu chí không trừ điểm?'}</DialogTitle>
        <DialogDescription>
          {revoking
            ? `Bỏ đánh dấu: “${title}” lại cần có lỗi. Bài nào chưa có lỗi cho tiêu chí này sẽ không tự quyết được ("Cần bạn xem"); các phiên chưa chốt được tính lại.`
            : `Từ giờ “${title}” luôn trọn điểm cho mọi bài chấm theo rubric này; các phiên chưa chốt được tính lại.`}
        </DialogDescription>
      </DialogHeader>
      {mutation.isError && (
        <Alert variant="destructive">
          <AlertDescription>{mutation.error?.message}</AlertDescription>
        </Alert>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Huỷ
        </Button>
        <Button type="button" variant="primary" loading={mutation.isPending} onClick={confirm}>
          {revoking ? 'Bỏ đánh dấu' : 'Đánh dấu không trừ điểm'}
        </Button>
      </DialogFooter>
    </>
  );
}
```

`_components/Onboarding.tsx`:

```tsx
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const STEPS = [
  { title: 'Tạo rubric', text: 'Đặt tên, ghi các tiêu chí và điểm tối đa của từng tiêu chí.' },
  { title: 'Thêm lỗi cho từng tiêu chí', text: 'Mỗi lỗi có điểm trừ riêng; chọn cách phát hiện: chạy test hay để AI đọc bài.' },
  { title: 'Gắn rubric vào phiên thi', text: 'Ở bước Tạo phiên thi, hoặc trong trang Chấm điểm.' },
];

const TREE = [
  'Rubric — một kỳ thi, 10,0 điểm',
  '  └ Tiêu chí — Tính đúng đắn, tối đa 6,0',
  '      └ Lỗi — Sai ca biên, trừ 1,5',
  '      └ Lỗi — Sai ca cơ bản, trừ 1,5',
  '  └ Tiêu chí — Quản lý bộ nhớ, tối đa 2,0',
  '      └ Lỗi — Rò rỉ bộ nhớ, trừ 1,0',
];

/** Màn hình lần đầu (chưa có rubric nào): dạy cây Rubric → Tiêu chí → Lỗi và thứ tự việc, thay cho ngõ cụt cũ. */
export function Onboarding({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="mt-1.5 grid gap-7 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <div className="rounded-lg border border-border bg-surface p-6 shadow-sm">
        <h2 className="text-h2">Bắt đầu với một rubric</h2>
        <p className="mt-1.5 text-muted-foreground">Bạn chưa có rubric nào. Rubric là bảng thang điểm của một kỳ thi. Làm lần lượt ba việc:</p>
        <ol className="my-[18px] flex flex-col gap-3.5">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex gap-3.5">
              <span
                className={cn(
                  'grid h-7 w-7 shrink-0 place-items-center rounded-full text-small font-bold',
                  i === 0 ? 'bg-primary text-primary-foreground' : 'bg-surface-2 text-muted-foreground',
                )}
              >
                {i + 1}
              </span>
              <div>
                <b className="block">{s.title}</b>
                <span className="text-small text-muted-foreground">{s.text}</span>
              </div>
            </li>
          ))}
        </ol>
        <Button type="button" variant="primary" onClick={onCreate}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Tạo rubric đầu tiên
        </Button>
      </div>

      <div className="rounded-lg border border-border bg-surface p-6 shadow-sm">
        <h3 className="text-h3">Cách các phần ghép lại</h3>
        <p className="mt-1 text-muted-foreground">Bài chấm được trừ điểm theo cây này, từ trên xuống.</p>
        <div className="mt-3.5 whitespace-pre rounded-lg bg-surface-2 p-4 font-mono text-small leading-8" aria-label="Ví dụ cây rubric" role="img">
          {TREE.join('\n')}
        </div>
        <p className="mt-3 text-small text-muted-foreground">Một lỗi có thể dùng ở nhiều rubric, mỗi rubric có điểm trừ riêng.</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Rewrite `RubricDialog.tsx`**

```tsx
'use client';

import { useRef, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { useSaveRubric } from '@/hooks/useGrading';
import { useCopyErrors } from '@/hooks/useRubricErrors';
import type { Rubric } from '@/lib/api/grading';
import type { RubricOverview } from '@/lib/api/rubric-errors';
import { shorten } from '@/lib/rubric-board';
import {
  buildSaveInput,
  hasErrors,
  newRow,
  parseCap,
  removedKeys,
  rowsFromRubric,
  validateRubric,
  type CriterionRow,
} from '@/lib/rubric-form';
import { cn } from '@/lib/utils';

/**
 * Sửa tiêu chí & điểm tối đa của một rubric, hoặc tạo rubric mới (spec mục 5, D3). Giữ nguyên ý của hộp thoại cũ:
 * tiêu chí CÓ SẴN gửi lại KHOÁ gốc của nó và không cho gõ khoá — máy chủ sinh lại khoá từ mô tả cho tiêu chí nào
 * thiếu `key`, nên sửa một câu mô tả từng âm thầm cắt liên kết "lỗi → tiêu chí". Chỉ tiêu chí MỚI có ô khoá (tuỳ chọn).
 *
 * Tạo rubric: nếu giảng viên đã có rubric khác, mặc định là "sao chép từ một rubric đã có" — nhưng KHÔNG chọn sẵn
 * nguồn nào (D3). Tiêu chí sao chép GIỮ khoá của nguồn, vì đó là cách máy chủ ghép lỗi sang rubric mới.
 *
 * Ruột form nằm TRONG DialogContent — mỗi lần mở là một lần mount mới, không thừa hưởng nội dung gõ dở.
 */
export function RubricDialog({
  open,
  onOpenChange,
  rubric,
  existingNames,
  errorCounts,
  overviews,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Bản mới nhất của rubric cần sửa; bỏ trống = tạo rubric mới. */
  rubric?: Rubric;
  existingNames: string[];
  /** Số lỗi ĐANG DÙNG gắn vào mỗi khoá tiêu chí — để cảnh báo khi xoá tiêu chí. */
  errorCounts: Record<string, number>;
  /** Mọi rubric của giảng viên: nguồn để sao chép khi tạo rubric mới. */
  overviews: RubricOverview[];
  onSaved: (saved: Rubric) => void;
}) {
  const close = () => onOpenChange(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        {rubric ? (
          <RubricForm rubric={rubric} existingNames={existingNames} errorCounts={errorCounts} onSaved={onSaved} onClose={close} />
        ) : (
          <CreateBody existingNames={existingNames} overviews={overviews} onSaved={onSaved} onClose={close} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function CreateBody({
  existingNames,
  overviews,
  onSaved,
  onClose,
}: {
  existingNames: string[];
  overviews: RubricOverview[];
  onSaved: (saved: Rubric) => void;
  onClose: () => void;
}) {
  const hasAny = overviews.length > 0;
  const [mode, setMode] = useState<'copy' | 'blank'>(hasAny ? 'copy' : 'blank');
  const [source, setSource] = useState('');
  const src = mode === 'copy' ? overviews.find((o) => o.rubricName === source) : undefined;

  const option = (id: 'copy' | 'blank', title: string, text: string) => (
    <button
      type="button"
      aria-pressed={mode === id}
      onClick={() => setMode(id)}
      className={cn(
        'flex flex-col gap-1 rounded-lg border p-3 text-left',
        mode === id ? 'border-primary bg-primary-subtle' : 'border-border hover:bg-surface-2',
      )}
    >
      <b className="text-small font-semibold">{title}</b>
      <span className="text-caption text-muted-foreground">{text}</span>
    </button>
  );

  return (
    <>
      <DialogHeader>
        <DialogTitle>Tạo rubric mới</DialogTitle>
      </DialogHeader>

      {hasAny && (
        <div role="group" aria-label="Bắt đầu từ" className="grid gap-2.5 sm:grid-cols-2">
          {option('copy', 'Một rubric đã có (khuyên dùng)', 'Sao chép tiêu chí, điểm tối đa, lỗi và điểm trừ. Sau đó hai rubric độc lập: sửa bên này không đổi bên kia.')}
          {option('blank', 'Tạo trống', 'Tự nhập tiêu chí và điểm tối đa; thêm lỗi sau.')}
        </div>
      )}

      {mode === 'copy' && (
        <FormField id="rubric-source" label="Sao chép từ">
          <select
            id="rubric-source"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className="h-10 w-full rounded-md border border-input bg-surface px-3 text-body"
          >
            <option value="">Chọn rubric muốn sao chép…</option>
            {overviews.map((o) => (
              <option key={o.rubricName} value={o.rubricName}>
                {o.rubricName} — {o.errorCount} lỗi
              </option>
            ))}
          </select>
        </FormField>
      )}

      {mode === 'copy' && !src ? (
        <>
          <p className="text-small text-muted-foreground">Chọn rubric ở trên để xem các tiêu chí sẽ được sao chép. Bạn vẫn sửa được trước khi tạo.</p>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Huỷ
            </Button>
            <Button type="button" variant="primary" disabled title="Chọn rubric muốn sao chép, hoặc chọn Tạo trống">
              Tạo rubric
            </Button>
          </DialogFooter>
        </>
      ) : (
        <RubricForm
          key={`${mode}:${source}`}
          existingNames={existingNames}
          errorCounts={{}}
          onSaved={onSaved}
          onClose={onClose}
          seed={
            src
              ? {
                  name: `${src.rubricName} — bản sao`,
                  rows: src.criteria.map((c) => ({
                    id: `src-${c.key}`,
                    key: c.key,
                    existing: true,
                    description: c.description,
                    maxPoints: String(c.maxPoints),
                  })),
                }
              : undefined
          }
          copyFrom={src ? { name: src.rubricName, errorCount: src.errorCount } : undefined}
        />
      )}
    </>
  );
}

/** Dấu vân tay các hàng — để biết giảng viên đã đổi gì so với bản đang dùng. */
const fingerprint = (rows: CriterionRow[]) =>
  JSON.stringify(rows.map((r) => [r.id, r.key.trim(), r.description.trim(), parseCap(r.maxPoints)]));

function RubricForm({
  rubric,
  existingNames,
  errorCounts,
  onSaved,
  onClose,
  seed,
  copyFrom,
}: {
  rubric?: Rubric;
  existingNames: string[];
  errorCounts: Record<string, number>;
  onSaved: (saved: Rubric) => void;
  onClose: () => void;
  /** Tạo từ bản sao: tên và hàng tiêu chí điền sẵn (đều sửa được). */
  seed?: { name: string; rows: CriterionRow[] };
  /** Có = sau khi lưu có thể sao chép lỗi từ rubric này sang rubric mới. */
  copyFrom?: { name: string; errorCount: number };
}) {
  const seq = useRef(0);
  const nextId = () => `new-${++seq.current}`;
  const [name, setName] = useState(seed?.name ?? '');
  const [initialRows] = useState<CriterionRow[]>(() => (rubric ? rowsFromRubric(rubric) : (seed?.rows ?? [newRow('new-0')])));
  const [rows, setRows] = useState<CriterionRow[]>(initialRows);
  const [touched, setTouched] = useState<ReadonlySet<string>>(new Set());
  const [copyErrorsToo, setCopyErrorsToo] = useState(true);
  const save = useSaveRubric();
  const copy = useCopyErrors();

  const editing = rubric !== undefined;
  const errors = validateRubric({ name, nameEditable: !editing, existingNames }, rows);
  const changed = !editing || fingerprint(rows) !== fingerprint(initialRows);
  const busy = save.isPending || copy.isPending;
  const canSave = !hasErrors(errors) && changed && !busy;

  const touch = (field: string) => setTouched((prev) => new Set(prev).add(field));
  const shown = (field: string, message: string | undefined) => (touched.has(field) ? message : undefined);
  const patchRow = (id: string, patch: Partial<CriterionRow>) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const warnings = removedKeys(rubric, rows)
    .map((key) => ({ key, count: errorCounts[key] ?? 0, title: shorten(rubric?.criteria.find((c) => c.key === key)?.description ?? key, 40) }))
    .filter((w) => w.count > 0);

  function finish(saved: Rubric) {
    onSaved(saved);
    onClose();
  }

  function submit() {
    save.mutate(buildSaveInput(editing ? rubric.name : name, rows), {
      onSuccess: (saved) => {
        if (!copyFrom || !copyErrorsToo) {
          finish(saved);
          return;
        }
        copy.mutate(
          { from: copyFrom.name, to: saved.name },
          {
            onSuccess: (r) => toast.success(`Đã tạo “${saved.name}” từ “${copyFrom.name}” — sao chép ${r.copied} lỗi. Hai rubric từ giờ độc lập.`),
            // Rubric ĐÃ được tạo: không rollback, chỉ nói rõ và chỉ đường làm lại ở dải "Rubric mới".
            onError: (e) =>
              toast.error(`Đã tạo “${saved.name}” nhưng chưa sao chép được lỗi — ${e.message}. Bạn có thể sao chép lại ở dải “Rubric mới”.`),
            onSettled: () => finish(saved),
          },
        );
      },
    });
  }

  return (
    <>
      {editing && (
        <DialogHeader>
          <DialogTitle>Sửa tiêu chí &amp; điểm tối đa — {rubric.name}</DialogTitle>
        </DialogHeader>
      )}

      <p className="text-caption text-muted-foreground">
        Hệ thống tự giữ lịch sử mọi lần sửa: bài đã chấm và phiên thi đã gắn rubric này giữ nguyên kết quả cũ.
      </p>

      {!editing && (
        <FormField id="rubric-name" label="Tên rubric" error={shown('name', errors.name)}>
          <Input
            id="rubric-name"
            value={name}
            invalid={shown('name', errors.name) !== undefined}
            placeholder="Ví dụ: Giữa kỳ CTDL"
            onChange={(e) => setName(e.target.value)}
            onBlur={() => touch('name')}
          />
        </FormField>
      )}

      <div className="flex flex-col gap-4">
        {rows.map((row, index) => {
          const n = index + 1;
          const rowErrors = errors.rows[row.id] ?? {};
          return (
            <div key={row.id} className="flex flex-col gap-2 rounded-md border border-border p-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                <FormField
                  id={`criterion-${row.id}`}
                  label={`Tiêu chí ${n}`}
                  className="flex-1"
                  error={shown(`${row.id}:description`, rowErrors.description)}
                >
                  <Input
                    id={`criterion-${row.id}`}
                    value={row.description}
                    invalid={shown(`${row.id}:description`, rowErrors.description) !== undefined}
                    placeholder="Ví dụ: Trình bày thuật toán rõ ràng, có độ phức tạp"
                    onChange={(e) => patchRow(row.id, { description: e.target.value })}
                    onBlur={() => touch(`${row.id}:description`)}
                  />
                </FormField>
                <FormField
                  id={`cap-${row.id}`}
                  label={`Điểm tối đa ${n}`}
                  className="w-full sm:w-32"
                  error={shown(`${row.id}:maxPoints`, rowErrors.maxPoints)}
                >
                  <Input
                    id={`cap-${row.id}`}
                    inputMode="decimal"
                    value={row.maxPoints}
                    invalid={shown(`${row.id}:maxPoints`, rowErrors.maxPoints) !== undefined}
                    onChange={(e) => patchRow(row.id, { maxPoints: e.target.value })}
                    onBlur={() => touch(`${row.id}:maxPoints`)}
                  />
                </FormField>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="shrink-0 hover:bg-danger-subtle hover:text-danger-strong sm:mt-7"
                  aria-label={`Xoá tiêu chí ${n}`}
                  disabled={rows.length === 1}
                  onClick={() => setRows((prev) => prev.filter((r) => r.id !== row.id))}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>

              {row.existing ? (
                <p className="text-caption text-muted-foreground">
                  Khoá <span className="font-mono">{row.key}</span> — cố định, các lỗi gắn với tiêu chí này theo khoá đó.
                </p>
              ) : (
                <FormField
                  id={`key-${row.id}`}
                  label={`Khoá tiêu chí ${n} (tuỳ chọn)`}
                  error={shown(`${row.id}:key`, rowErrors.key)}
                  hint="Để trống: hệ thống tự đặt từ mô tả. Không đổi được sau khi lưu."
                >
                  <Input
                    id={`key-${row.id}`}
                    className="font-mono"
                    value={row.key}
                    invalid={shown(`${row.id}:key`, rowErrors.key) !== undefined}
                    onChange={(e) => patchRow(row.id, { key: e.target.value })}
                    onBlur={() => touch(`${row.id}:key`)}
                  />
                </FormField>
              )}
            </div>
          );
        })}
      </div>

      <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => setRows((prev) => [...prev, newRow(nextId())])}>
        <Plus className="h-4 w-4" aria-hidden="true" />
        Thêm tiêu chí
      </Button>

      {copyFrom && (
        <label className="flex cursor-pointer items-start gap-2.5">
          <input type="checkbox" className="mt-1" checked={copyErrorsToo} onChange={(e) => setCopyErrorsToo(e.target.checked)} />
          <span>
            <b className="font-semibold">Sao chép cả {copyFrom.errorCount} lỗi và điểm trừ</b>
            <br />
            <span className="text-small text-muted-foreground">
              Lỗi thuộc tiêu chí bạn xoá khỏi rubric mới sẽ không được sao chép. Lỗi AI đề xuất không sao chép.
            </span>
          </span>
        </label>
      )}

      {errors.general && (
        <p role="alert" className="text-small font-medium text-danger-strong">
          {errors.general}
        </p>
      )}

      {warnings.map((w) => (
        <Alert key={w.key} variant="warning">
          <AlertDescription>
            Còn {w.count} lỗi đang nằm trong tiêu chí “{w.title}” — sau khi lưu, chúng cần được chuyển sang tiêu chí khác.
          </AlertDescription>
        </Alert>
      ))}

      {save.isError && (
        <Alert variant="destructive">
          <AlertDescription>{save.error?.message}</AlertDescription>
        </Alert>
      )}

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          Huỷ
        </Button>
        <Button type="button" variant="primary" disabled={!canSave} loading={busy} onClick={submit}>
          {editing ? 'Lưu thay đổi' : 'Tạo rubric'}
        </Button>
      </DialogFooter>
    </>
  );
}
```
Notes tied to the tests: the dialog heading text is `Sửa tiêu chí & điểm tối đa — CTDL` (JSX `&amp;` renders `&`); in the existing-warning test `getByRole('alert')` must match exactly one alert: the `<p role="alert">` for `errors.general` is absent, `Alert` has `role="alert"` ✓ one.

In the "lỗi của máy chủ khi lưu" test, `getByRole('alert')` is the destructive Alert ✓ (warnings none).

- [ ] **Step 4: Update `lib/rubric-form.ts` and its test**

In `lib/rubric-form.ts`:
- `const CAP_ERROR = 'Điểm tối đa: từ 0,25 đến 100, tối đa hai chữ số lẻ.';`
- the duplicate-name message → `'Đã có rubric tên này — chọn nó ở trên rồi bấm “Sửa tiêu chí & điểm tối đa” thay vì tạo lại.'`; the comment two lines above it: `…rồi bấm "Sửa tiêu chí & điểm tối đa".`
- the doc comment of `removedKeys`: `/** Khoá của tiêu chí có sẵn mà bản mới không còn — lỗi gắn với chúng sẽ thành lỗi mồ côi (cần chuyển sang tiêu chí khác). */`
- delete the exported functions `activeCriteria` and `defaultRubricName` (their only callers were the deleted `RuleForm`, `CeilingCard` and old page). Confirm with `grep -rn "activeCriteria\|defaultRubricName" src` → no hit outside `lib/rubric-form*` before deleting.

In `lib/rubric-form.test.ts`: remove `activeCriteria` and `defaultRubricName` from the import list, delete the `describe('activeCriteria', …)` block (lines 29–43) and the `describe('defaultRubricName', …)` block (lines 176–184), and change the assertion at line 108 to `expect(errs.rows.n0.maxPoints).toBe('Điểm tối đa: từ 0,25 đến 100, tối đa hai chữ số lẻ.');`. If the test file's local `rubric()` helper becomes unused, delete it too (eslint will say so).

- [ ] **Step 5: Run, lint, commit**

```powershell
pnpm exec vitest run src/app/teacher/rules/_components/WaiverDialog.test.tsx src/app/teacher/rules/_components/Onboarding.test.tsx src/app/teacher/rules/_components/RubricDialog.test.tsx src/lib/rubric-form.test.ts
pnpm exec tsc --noEmit
pnpm exec eslint src/lib src/app/teacher/rules
```
Expected: PASS and clean.

```bash
git add apps/web/src
git commit -m "feat(web): waiver dialog, first-time screen and rubric dialog with copy-from-rubric"
```

---

## Task B11: Assemble the page; vocabulary sweep (T-RBE-UI-2, UI-9, UI-10; Review Focus 1–3)

**Files:**
- Rewrite: `app/teacher/rules/page.tsx`
- Create: `app/teacher/rules/page.test.tsx`

**Interfaces — Consumes:** everything from B1–B10. **Produces:** the page at `/teacher/rules?rubric=<name>`.

- [ ] **Step 1: Write the failing tests**

`app/teacher/rules/page.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import RulesPage from './page';
import { criterion, errorItem, libraryRule, overview, proposal, session } from './_components/fixtures';
import { rulesHref } from '@/lib/rules-links';
import type { RubricOverview } from '@/lib/api/rubric-errors';

let search = '';
const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(search),
  useRouter: () => ({ replace }),
}));

const h = vi.hoisted(() => {
  const mut = () => ({ mutate: vi.fn(), isPending: false, isError: false, error: null as Error | null, reset: vi.fn() });
  return {
    overview: { data: [] as unknown[], isLoading: false, isFetching: false, isError: false, error: null as Error | null },
    errors: { data: [] as unknown[], isLoading: false, isError: false, error: null as Error | null },
    proposals: { data: [] as unknown[], isLoading: false, isError: false, error: null as Error | null },
    library: { data: [] as unknown[], isLoading: false, isError: false, error: null as Error | null },
    rubrics: { data: [] as unknown[] },
    save: mut(), copy: mut(), assign: mut(), move: mut(), remove: mut(), preview: mut(), price: mut(),
    revise: mut(), split: mut(), dismiss: mut(), setWaiver: mut(), revokeWaiver: mut(),
  };
});
vi.mock('@/hooks/useGrading', () => ({ useRubrics: () => h.rubrics, useSaveRubric: () => h.save }));
vi.mock('@/hooks/useRubricErrors', () => ({
  useRubricOverview: () => h.overview,
  useRubricErrors: () => h.errors,
  useCopyErrors: () => h.copy,
  useAssignError: () => h.assign,
  useMoveError: () => h.move,
  useRemoveError: () => h.remove,
  usePreviewErrorPrice: () => h.preview,
  useSetErrorPrice: () => h.price,
}));
vi.mock('@/hooks/useRules', () => ({
  useLibrary: () => h.library,
  useProposals: () => h.proposals,
  useReviseRule: () => h.revise,
  useSplitRule: () => h.split,
  useDismissRule: () => h.dismiss,
  useSetWaiver: () => h.setWaiver,
  useRevokeWaiver: () => h.revokeWaiver,
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const GK = overview({
  rubricName: 'Giữa kỳ CTDL',
  rubricId: 'ru-1',
  criteria: [
    criterion({ key: 'tinh_dung', description: 'Tính đúng đắn', maxPoints: 6, errorCount: 2 }),
    criterion({ key: 'bo_nho', description: 'Quản lý bộ nhớ', maxPoints: 2, errorCount: 0 }),
  ],
  unpricedCount: 1,
  proposalCount: 2,
  sessions: [session({ id: 's1', name: 'Ca sáng', state: 'grading' })],
});
const DT = overview({ rubricName: 'Diễn tập', rubricId: 'ru-2' });
const CK = overview({ rubricName: 'Cuối kỳ CTDL', rubricId: 'ru-3', criteria: [criterion({ errorCount: 0 })] });

const items = [
  errorItem({ id: 'e1', ruleId: 'r1', name: 'Sai ca biên', criterionKey: 'tinh_dung', deduction: '2.00' }),
  errorItem({ id: 'e2', ruleId: 'r2', name: 'Đặt tên biến', predicate: null, checkedBy: 'model', criterionKey: 'tinh_dung', deduction: null }),
];
const rubricRecord = { id: 'ru-1', teacherId: 't1', name: 'Giữa kỳ CTDL', version: 1, isActive: true, totalPoints: 8, criteria: [{ id: 'c1', key: 'tinh_dung', description: 'Tính đúng đắn', maxPoints: 6 }, { id: 'c2', key: 'bo_nho', description: 'Quản lý bộ nhớ', maxPoints: 2 }] };

const extra = (n: number): RubricOverview[] => Array.from({ length: n }, (_, i) => overview({ rubricName: `Rubric thêm ${i + 1}`, rubricId: `x${i}` }));

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  search = '';
  h.overview = { data: [GK, DT, CK], isLoading: false, isFetching: false, isError: false, error: null };
  h.errors = { data: items, isLoading: false, isError: false, error: null };
  h.proposals = { data: [proposal({ id: 'p1' }), proposal({ id: 'p2', name: 'Con trỏ top không cập nhật' })], isLoading: false, isError: false, error: null };
  h.library = { data: [libraryRule({ id: 'r1' })], isLoading: false, isError: false, error: null };
  h.rubrics = { data: [rubricRecord] };
});

describe('Bảng lỗi — chọn rubric và URL (Review Focus 1, 2)', () => {
  it('không có ?rubric= thì mở rubric đầu tiên của tổng quan (lưu gần nhất)', () => {
    render(<RulesPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Bảng lỗi' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Giữa kỳ CTDL/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Sai ca biên')).toBeInTheDocument();
  });

  it('?rubric= mở đúng rubric đó', () => {
    search = `rubric=${encodeURIComponent('Diễn tập')}`;
    render(<RulesPage />);
    expect(screen.getByRole('tab', { name: /Diễn tập/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('heading', { name: 'Sẵn sàng chấm tự động' })).toBeInTheDocument();
  });

  it('tên rubric có & # ? / và dấu đi vòng qua URL không mất ký tự nào', () => {
    const name = 'A&B #1 — Giữa kỳ? 50%+';
    h.overview.data = [GK, overview({ rubricName: name, rubricId: 'sp' })];
    search = `rubric=${encodeURIComponent(name)}`;
    render(<RulesPage />);
    expect(screen.getByRole('tab', { name: new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) })).toHaveAttribute('aria-selected', 'true');
  });

  it('?rubric= trỏ tên không còn tồn tại thì mở rubric đầu tiên, không trống trang', () => {
    search = 'rubric=Da%20xoa';
    render(<RulesPage />);
    expect(screen.getByRole('tab', { name: /Giữa kỳ CTDL/ })).toHaveAttribute('aria-selected', 'true');
  });

  it('vừa tạo rubric, tổng quan đang tải lại: hiện khung chờ thay vì mở nhầm rubric khác', () => {
    search = 'rubric=Moi%20tao';
    h.overview.isFetching = true;
    render(<RulesPage />);
    expect(screen.queryByRole('tab', { name: /Giữa kỳ CTDL/ })).not.toBeInTheDocument();
    expect(screen.getByText('Đang tải…')).toBeInTheDocument();
  });

  it('bấm rubric khác thì đổi URL bằng rulesHref (không cuộn) và về tab lỗi', () => {
    render(<RulesPage />);
    fireEvent.click(screen.getByRole('tab', { name: /Diễn tập/ }));
    expect(replace).toHaveBeenCalledWith(rulesHref('Diễn tập'), { scroll: false });
  });

  it('rubric đang mở được ghi vào "gần đây" theo giảng viên; đổi rubric thì lên đầu', () => {
    const { rerender } = render(<RulesPage />);
    expect(JSON.parse(localStorage.getItem('rules.recent.t1') ?? '[]')).toEqual(['Giữa kỳ CTDL']);
    search = `rubric=${encodeURIComponent('Diễn tập')}`;
    rerender(<RulesPage />);
    expect(JSON.parse(localStorage.getItem('rules.recent.t1') ?? '[]')).toEqual(['Diễn tập', 'Giữa kỳ CTDL']);
  });

  it('localStorage bị chặn: trang vẫn chạy đúng (Review Focus 3)', () => {
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    render(<RulesPage />);
    expect(screen.getByText('Sai ca biên')).toBeInTheDocument();
    get.mockRestore();
    set.mockRestore();
  });
});

describe('Bảng lỗi — các trạng thái của trang', () => {
  it('đang tải / lỗi tải tổng quan', () => {
    h.overview = { data: [], isLoading: true, isFetching: true, isError: false, error: null };
    const { unmount } = render(<RulesPage />);
    expect(screen.getByText('Đang tải…')).toBeInTheDocument();
    unmount();
    h.overview = { data: [], isLoading: false, isFetching: false, isError: true, error: new Error('Máy chủ không trả lời') };
    render(<RulesPage />);
    expect(screen.getByText(/Không tải được Bảng lỗi — Máy chủ không trả lời/)).toBeInTheDocument();
  });

  it('chưa có rubric nào: màn hình lần đầu; "Tạo rubric đầu tiên" mở hộp thoại; nút "Thêm lỗi" khoá', () => {
    h.overview.data = [];
    render(<RulesPage />);
    expect(screen.getByRole('heading', { name: 'Bắt đầu với một rubric' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Thêm lỗi' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Tạo rubric đầu tiên' }));
    expect(screen.getByRole('heading', { name: 'Tạo rubric mới' })).toBeInTheDocument();
  });

  it('dải trạng thái, thông tin rubric và ba tab có đếm', () => {
    render(<RulesPage />);
    expect(screen.getByRole('heading', { name: 'Chưa sẵn sàng chấm tự động — còn 3 việc' })).toBeInTheDocument();
    expect(screen.getByText(/Dùng ở:/)).toHaveTextContent('Ca sáng');
    expect(screen.getByRole('tab', { name: 'Lỗi theo tiêu chí 2' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Lỗi AI đề xuất 2' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Thư viện lỗi 1' })).toBeInTheDocument();
  });
});

describe('Bảng lỗi — việc cần làm là nút làm đúng việc (T-RBE-UI-3)', () => {
  it('"Xem lỗi AI đề xuất" mở tab đề xuất', () => {
    render(<RulesPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Xem lỗi AI đề xuất' }));
    expect(screen.getByRole('tab', { name: /Lỗi AI đề xuất/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('heading', { name: 'Con trỏ top không cập nhật' })).toBeInTheDocument();
  });

  it('"Thêm lỗi" của tiêu chí rỗng cuộn tới nhóm đó', () => {
    const spy = vi.spyOn(Element.prototype, 'scrollIntoView');
    render(<RulesPage />);
    fireEvent.click(within(screen.getByRole('status')).getByRole('button', { name: 'Thêm lỗi' }));
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('"Đặt điểm trừ" của dải cuộn tới tiêu chí chứa lỗi chưa có điểm trừ', () => {
    const spy = vi.spyOn(Element.prototype, 'scrollIntoView');
    render(<RulesPage />);
    fireEvent.click(within(screen.getByRole('status')).getByRole('button', { name: 'Đặt điểm trừ' }));
    expect(spy).toHaveBeenCalled();
    expect((spy.mock.instances.at(-1) as unknown as HTMLElement).id).toBe('crit-tinh_dung');
    spy.mockRestore();
  });
});

describe('Bảng lỗi — ngăn kéo và hộp thoại', () => {
  it('"Thêm lỗi" (đầu trang) mở ngăn kéo với ô chọn tiêu chí', () => {
    render(<RulesPage />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Thêm lỗi' })[0]);
    expect(screen.getByRole('dialog', { name: 'Thêm lỗi' })).toBeInTheDocument();
    expect(screen.getByLabelText('Tiêu chí')).toBeInTheDocument();
  });

  it('"Thêm lỗi vào …" của một nhóm mở ngăn kéo với tiêu chí đã biết', () => {
    render(<RulesPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Thêm lỗi vào “Tính đúng đắn”' }));
    expect(screen.getByText('Tiêu chí: Tính đúng đắn · tối đa 6,0')).toBeInTheDocument();
  });

  it('"Thêm vào rubric này" ở một lỗi đề xuất mở ngăn kéo tab "Tạo lỗi mới" điền sẵn (Review Focus 5)', () => {
    render(<RulesPage />);
    fireEvent.click(screen.getByRole('tab', { name: /Lỗi AI đề xuất/ }));
    fireEvent.click(within(screen.getByRole('heading', { name: 'Con trỏ top không cập nhật' }).closest('li') as HTMLElement).getByRole('button', { name: 'Thêm vào rubric này' }));
    expect(screen.getByRole('tab', { name: 'Tạo lỗi mới' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByLabelText('Tên lỗi')).toHaveValue('Con trỏ top không cập nhật');
  });

  it('⋯ → Sửa tên, mô tả, cách phát hiện mở ngăn kéo sửa, từ rubric đang mở', () => {
    render(<RulesPage />);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Thao tác với Sai ca biên' }), { key: 'Enter' });
    fireEvent.click(screen.getByRole('menuitem', { name: /Sửa tên, mô tả, cách phát hiện/ }));
    expect(screen.getByRole('dialog', { name: 'Sửa lỗi' })).toBeInTheDocument();
    expect(screen.getByText(/Bạn đang mở từ rubric “Giữa kỳ CTDL”/)).toBeInTheDocument();
  });

  it('Thư viện lỗi → "Sửa lỗi" mở ngăn kéo sửa từ Thư viện', () => {
    render(<RulesPage />);
    fireEvent.click(screen.getByRole('tab', { name: /Thư viện lỗi/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Sửa lỗi Sai ca biên' }));
    expect(screen.getByText(/Bạn đang mở từ Thư viện lỗi/)).toBeInTheDocument();
  });

  it('"Tiêu chí này không trừ điểm" hỏi xác nhận rồi mới gửi đúng khoá cho đúng rubric', () => {
    render(<RulesPage />);
    fireEvent.click(within(screen.getByRole('region', { name: 'Quản lý bộ nhớ' })).getByRole('button', { name: 'Tiêu chí này không trừ điểm' }));
    expect(h.setWaiver.mutate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Đánh dấu không trừ điểm' }));
    expect(h.setWaiver.mutate).toHaveBeenCalledWith('bo_nho', expect.anything());
  });

  it('"Sửa tiêu chí & điểm tối đa" mở hộp thoại sửa của đúng rubric', () => {
    render(<RulesPage />);
    fireEvent.click(screen.getByRole('button', { name: /Sửa tiêu chí & điểm tối đa/ }));
    expect(screen.getByRole('heading', { name: /Sửa tiêu chí & điểm tối đa — Giữa kỳ CTDL/ })).toBeInTheDocument();
  });
});

describe('Bảng lỗi — nhiều rubric và học kỳ (T-RBE-UI-10)', () => {
  it('từ 5 rubric: ô "Rubric đang mở"; tạo rubric mới đặt lại bộ lọc học kỳ và chuyển sang rubric vừa tạo', () => {
    h.overview.data = [GK, DT, CK, ...extra(3)];
    const saved = { ...rubricRecord, id: 'ru-new', name: 'Rubric mới tạo', version: 1 };
    h.save.mutate.mockImplementation((_i: unknown, opts: { onSuccess: (r: unknown) => void }) => opts.onSuccess(saved));
    render(<RulesPage />);
    fireEvent.click(screen.getByRole('button', { name: /Đổi rubric/ }));
    fireEvent.change(screen.getByLabelText('Lọc theo học kỳ'), { target: { value: 'HK1 2026-2027' } });
    expect(screen.getByText(/Học kỳ: HK1 2026-2027/)).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: /Rubric mới/ })[0]);
    fireEvent.click(screen.getByRole('button', { name: /^Tạo trống/ }));
    fireEvent.change(screen.getByLabelText('Tên rubric'), { target: { value: 'Rubric mới tạo' } });
    fireEvent.change(screen.getByLabelText('Tiêu chí 1'), { target: { value: 'Tính đúng' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo rubric' }));
    expect(replace).toHaveBeenCalledWith(rulesHref('Rubric mới tạo'), { scroll: false });
    expect(screen.queryByText(/Học kỳ: HK1 2026-2027/)).not.toBeInTheDocument();
  });
});

/**
 * T-RBE-UI-2: chữ giảng viên đọc không còn từ vựng của dev. Quét văn bản thật của trang ở nhiều trạng thái; khi
 * hỏng, thông báo nêu đúng từ vi phạm. Từ "luật/giá/trần" chỉ cấm đứng riêng một chữ (không cấm "đánh giá").
 */
describe('Bảng lỗi — từ vựng (T-RBE-UI-2)', () => {
  const BANNED = /(?<![\p{L}\p{N}_])(giá|trần|luật|cách khớp|cần backend|chua_gan)(?![\p{L}\p{N}_])/iu;
  const clean = () => expect((document.body.textContent ?? '').match(BANNED)?.[0]).toBeUndefined();

  it('tab lỗi theo tiêu chí, đề xuất, thư viện', () => {
    render(<RulesPage />);
    clean();
    fireEvent.click(screen.getByRole('tab', { name: /Lỗi AI đề xuất/ }));
    clean();
    fireEvent.click(screen.getByRole('tab', { name: /Thư viện lỗi/ }));
    clean();
  });

  it('ngăn kéo thêm lỗi (cả hai tab), ngăn kéo sửa lỗi', () => {
    render(<RulesPage />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Thêm lỗi' })[0]);
    clean();
    fireEvent.click(screen.getByRole('tab', { name: 'Tạo lỗi mới' }));
    clean();
    fireEvent.click(screen.getByRole('button', { name: 'Huỷ' }));
    fireEvent.click(screen.getByRole('tab', { name: /Thư viện lỗi/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Sửa lỗi Sai ca biên' }));
    clean();
  });

  it('rubric mới (dải sao chép), ô chọn nhiều rubric, màn hình lần đầu, hộp thoại tạo rubric', () => {
    h.overview.data = [CK, GK];
    const first = render(<RulesPage />);
    clean();
    first.unmount();
    h.overview.data = [GK, DT, CK, ...extra(3)];
    const many = render(<RulesPage />);
    fireEvent.click(screen.getByRole('button', { name: /Đổi rubric/ }));
    clean();
    many.unmount();
    h.overview.data = [];
    render(<RulesPage />);
    clean();
    fireEvent.click(screen.getByRole('button', { name: 'Tạo rubric đầu tiên' }));
    clean();
  });
});
```
(The banner is the only `role="status"` element on the page, which is why the two "scroll to criterion" tests scope their click with `within(screen.getByRole('status'))`: the page header also has a "Thêm lỗi" button.)

Run `pnpm exec vitest run src/app/teacher/rules/page.test.tsx` → Expected FAIL (page is still the shell).

- [ ] **Step 2: Implement the page**

`app/teacher/rules/page.tsx` (overwrite):

```tsx
'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useRubrics } from '@/hooks/useGrading';
import { useRubricErrors, useRubricOverview } from '@/hooks/useRubricErrors';
import { useLibrary, useProposals } from '@/hooks/useRules';
import type { OverviewCriterion, RubricErrorItem } from '@/lib/api/rubric-errors';
import type { ProposalItem } from '@/lib/api/rules';
import { pushRecent, readRecent, writeRecent } from '@/lib/rubric-board';
import { rulesHref } from '@/lib/rules-links';
import { cn } from '@/lib/utils';
import { AddErrorDrawer } from './_components/AddErrorDrawer';
import { EditErrorDrawer } from './_components/EditErrorDrawer';
import { DANGLING_KEY, ErrorsTab } from './_components/ErrorsTab';
import { LibraryTab } from './_components/LibraryTab';
import { Onboarding } from './_components/Onboarding';
import { ProposalsTab } from './_components/ProposalsTab';
import { ReadinessBanner } from './_components/ReadinessBanner';
import { RubricDialog } from './_components/RubricDialog';
import { RubricMeta } from './_components/RubricMeta';
import { RubricSwitcher } from './_components/RubricSwitcher';
import { WaiverDialog } from './_components/WaiverDialog';

type RulesTab = 'errors' | 'proposals' | 'library';
type Drawer =
  | { kind: 'add'; criterionKey: string | null; prefill: ProposalItem | null }
  | { kind: 'edit'; ruleId: string; fromRubric: string | null }
  | null;

/**
 * Bảng lỗi theo rubric (spec 2026-10-07): chọn rubric trước, rồi thấy đúng các lỗi của rubric đó, nhóm theo tiêu
 * chí, mỗi lỗi một điểm trừ riêng. Rubric đang mở nằm trong URL (`?rubric=<tên>`) để mở thẳng và giữ khi tải lại.
 * `useSearchParams` đòi ranh giới Suspense khi build tĩnh, nên phần ruột tách ra.
 */
export default function RulesPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <RulesContent />
    </Suspense>
  );
}

function RulesContent() {
  const router = useRouter();
  const params = useSearchParams();
  const overview = useRubricOverview();
  const rubrics = useRubrics();
  const library = useLibrary();

  const [tab, setTab] = useState<RulesTab>('errors');
  const [sem, setSem] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [rubricDialog, setRubricDialog] = useState<'edit' | 'create' | null>(null);
  const [waiver, setWaiver] = useState<OverviewCriterion | null>(null);
  const [focus, setFocus] = useState<{ key: string; n: number } | null>(null);
  const [recent, setRecent] = useState<string[]>([]);

  const overviews = useMemo(() => overview.data ?? [], [overview.data]);
  const wanted = params.get('rubric');
  const found = wanted === null ? undefined : overviews.find((o) => o.rubricName === wanted);
  // Tên không còn tồn tại (đổi tên, gõ sai) → rubric đầu tiên. Nhưng vừa tạo rubric mà tổng quan còn đang tải lại thì
  // CHỜ, đừng mở nhầm rubric khác rồi nhảy (Review Focus 2).
  const waiting = wanted !== null && found === undefined && overview.isFetching;
  const current = found ?? (waiting ? undefined : overviews[0]);
  const teacherId = rubrics.data?.[0]?.teacherId ?? null;

  const errors = useRubricErrors(current?.rubricName);
  const proposals = useProposals(current?.rubricName);

  // "Gần đây": nạp từ localStorage khi biết giảng viên, đẩy rubric đang mở lên đầu, rồi ghi lại. Ba effect riêng để
  // phần cập nhật state thuần (không ghi lưu trữ trong hàm cập nhật) và để không ghi đè lịch sử bằng danh sách rỗng
  // trước khi nạp xong (`loadedFor`).
  const loadedFor = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    setRecent(readRecent(teacherId));
    loadedFor.current = teacherId;
  }, [teacherId]);
  useEffect(() => {
    const name = current?.rubricName;
    if (!name) return;
    setRecent((prev) => (prev[0] === name ? prev : pushRecent(prev, name)));
  }, [current?.rubricName, teacherId]);
  useEffect(() => {
    if (loadedFor.current === teacherId && recent.length > 0) writeRecent(teacherId, recent);
  }, [recent, teacherId]);

  const select = useCallback(
    (name: string) => {
      setTab('errors');
      router.replace(rulesHref(name), { scroll: false });
    },
    [router],
  );
  const goToCriterion = (key: string) => {
    setTab('errors');
    setFocus((prev) => ({ key, n: (prev?.n ?? 0) + 1 }));
  };

  if (overview.isLoading || waiting) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-small text-muted-foreground">Đang tải…</p>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (overview.isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>Không tải được Bảng lỗi — {overview.error?.message}. Thử tải lại trang.</AlertDescription>
      </Alert>
    );
  }

  const rubricRecord = current ? rubrics.data?.find((r) => r.id === current.rubricId) : undefined;
  const errorCounts = Object.fromEntries((current?.criteria ?? []).map((c) => [c.key, c.errorCount]));
  const editRule = drawer?.kind === 'edit' ? library.data?.find((r) => r.id === drawer.ruleId) : undefined;

  const tabButton = (id: RulesTab, label: string, count: number | null, warn = false) => (
    <button
      type="button"
      role="tab"
      aria-selected={tab === id}
      onClick={() => setTab(id)}
      className={cn(
        '-mb-px flex items-center gap-2 border-b-2 px-3.5 py-2.5 font-semibold',
        tab === id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground',
      )}
    >
      {label}
      {count !== null && (
        <>
          {/* Khoảng trắng thật giữa chữ và số: tên truy cập của tab là "Lỗi theo tiêu chí 2", không dính liền. */}
          {' '}
          <span
            className={cn(
              'inline-grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-caption',
              warn && count > 0 ? 'bg-warning text-foreground' : 'bg-surface-2 text-muted-foreground',
            )}
          >
            {count}
          </span>
        </>
      )}
    </button>
  );

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Bảng lỗi"
        description={
          current
            ? 'Chọn rubric, rồi ghi lại những lỗi sinh viên hay mắc ở từng tiêu chí và điểm bị trừ cho mỗi lỗi. Bài chấm sẽ trừ điểm đúng theo bảng này.'
            : 'Nơi bạn ghi lại những lỗi sinh viên hay mắc và điểm bị trừ cho từng lỗi, để bài thi được chấm đúng theo cách của bạn.'
        }
        actions={
          <Button type="button" variant="primary" disabled={!current} onClick={() => setDrawer({ kind: 'add', criterionKey: null, prefill: null })}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Thêm lỗi
          </Button>
        }
      />

      {!current ? (
        <div className="mt-6">
          <Onboarding onCreate={() => setRubricDialog('create')} />
        </div>
      ) : (
        <>
          <div className="mt-6">
            <RubricSwitcher
              overviews={overviews}
              current={current}
              recent={recent}
              sem={sem}
              onSem={setSem}
              onSelect={select}
              onNew={() => setRubricDialog('create')}
            />
          </div>
          <RubricMeta
            overview={current}
            onEdit={() => {
              // Cần bản đầy đủ của rubric (từ danh sách rubric) để sửa; chưa tải xong thì chưa mở.
              if (rubricRecord) setRubricDialog('edit');
            }}
          />
          <ReadinessBanner
            overview={current}
            overviews={overviews}
            errors={errors.data}
            onAddManually={() => setDrawer({ kind: 'add', criterionKey: null, prefill: null })}
            onGoToCriterion={goToCriterion}
            onOpenProposals={() => setTab('proposals')}
            onOpenDangling={() => goToCriterion(DANGLING_KEY)}
          />

          <div role="tablist" aria-label="Nội dung" className="mt-6 flex gap-1 border-b border-border">
            {tabButton('errors', 'Lỗi theo tiêu chí', current.errorCount)}
            {tabButton('proposals', 'Lỗi AI đề xuất', current.proposalCount, true)}
            {tabButton('library', 'Thư viện lỗi', library.data?.length ?? null)}
          </div>

          {tab === 'errors' && (
            <ErrorsTab
              overview={current}
              errors={errors.data}
              loading={errors.isLoading}
              error={errors.isError ? errors.error : null}
              focus={focus}
              onAdd={(criterionKey) => setDrawer({ kind: 'add', criterionKey, prefill: null })}
              onEdit={(item: RubricErrorItem) => setDrawer({ kind: 'edit', ruleId: item.ruleId, fromRubric: current.rubricName })}
              onWaive={setWaiver}
              onUnwaive={setWaiver}
              onOpenRubric={select}
            />
          )}
          {tab === 'proposals' && (
            <ProposalsTab
              overview={current}
              proposals={proposals.data}
              loading={proposals.isLoading}
              error={proposals.isError ? proposals.error : null}
              onAdd={(prefill) => setDrawer({ kind: 'add', criterionKey: null, prefill })}
            />
          )}
          {tab === 'library' && (
            <LibraryTab
              rules={library.data}
              loading={library.isLoading}
              error={library.isError ? library.error : null}
              overviews={overviews}
              onEdit={(rule) => setDrawer({ kind: 'edit', ruleId: rule.id, fromRubric: null })}
              onOpenRubric={select}
            />
          )}
        </>
      )}

      {drawer?.kind === 'add' && current && (
        <AddErrorDrawer overview={current} library={library.data} criterionKey={drawer.criterionKey} prefill={drawer.prefill} onClose={() => setDrawer(null)} />
      )}
      {drawer?.kind === 'edit' && (
        <EditErrorDrawer rule={editRule} loading={library.isLoading} fromRubric={drawer.fromRubric} overviews={overviews} onClose={() => setDrawer(null)} />
      )}
      <WaiverDialog target={waiver && current ? { criterion: waiver, rubricId: current.rubricId } : null} onClose={() => setWaiver(null)} />
      <RubricDialog
        open={rubricDialog !== null}
        onOpenChange={(open) => !open && setRubricDialog(null)}
        rubric={rubricDialog === 'edit' ? rubricRecord : undefined}
        existingNames={overviews.map((o) => o.rubricName)}
        errorCounts={errorCounts}
        overviews={overviews}
        onSaved={(saved) => {
          // Rubric mới chưa gắn phiên nào nên chưa thuộc học kỳ nào: bỏ lọc để nó không biến mất khỏi danh sách.
          setSem(null);
          select(saved.name);
        }}
      />
    </div>
  );
}
```
Notes tied to the tests: tab accessible names are `label + count` ("Lỗi theo tiêu chí 2"); the "Thêm lỗi" button in the page header and the banner's "Thêm lỗi" button share a name, hence `getAllByRole(...)[0]` for the header and `within(status)` for the banner; `RubricMeta`'s edit button is guarded so it does nothing while the full `Rubric` record is not loaded.

- [ ] **Step 3: Run, lint, build, commit**

```powershell
pnpm exec vitest run src/app/teacher/rules
pnpm exec tsc --noEmit
pnpm exec eslint src/app/teacher/rules
pnpm build
```
Expected: all pass; `next build` succeeds (the page is a client component under `Suspense`). If the vocabulary test reports a word, it prints the exact offending word — fix the string in the component, not the regex.

```bash
git add apps/web/src/app/teacher/rules
git commit -m "feat(web): assemble Bảng lỗi — rubric in URL, tabs, drawers; vocabulary sweep"
```

---

## Task B12: Links from the grading pages carry `?rubric=` (T-RBE-UI-9)

Spec 5.8 keeps the existing paths and adds `?rubric=<name>` wherever the rubric of the session/result is known. Only the **href** changes; link texts and body copy on the grading pages stay as they are (a vocabulary pass over the grading screens is outside this spec — see Task B13's note).

**Files:**
- Create: `hooks/useRulesLink.ts`, `hooks/useRulesLink.test.tsx`
- Modify: `app/teacher/grading/[resultId]/_components/investigator/CaseFlagsBanner.tsx` (+ test), `ErrorList.tsx` (+ test), `InvestigatorDossier.tsx`; `app/teacher/grading/_components/LeverageLine.tsx` (+ test), `ReapplyPricesPanel.tsx` (+ test), `FinalizePanel.tsx`, `RubricRow.tsx` (+ test); `app/teacher/grading/page.tsx`, `app/teacher/grading/page.test.tsx`, `app/teacher/grading/finalize/page.tsx`, `finalize/page.test.tsx`

- [ ] **Step 1: Write the failing tests**

`hooks/useRulesLink.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useRulesLink } from './useRulesLink';

const h = vi.hoisted(() => ({ rubrics: { data: undefined as undefined | { id: string; name: string }[] } }));
vi.mock('./useGrading', () => ({ useRubrics: () => h.rubrics }));

describe('useRulesLink', () => {
  it('biết rubric của phiên thì liên kết mở đúng rubric đó', () => {
    h.rubrics = { data: [{ id: 'ru-1', name: 'Giữa kỳ CTDL' }] };
    expect(renderHook(() => useRulesLink('ru-1')).result.current).toBe('/teacher/rules?rubric=Gi%E1%BB%AFa%20k%E1%BB%B3%20CTDL');
  });
  it('phiên chưa gắn rubric, rubric chưa tải, hoặc không tìm thấy thì về trang gốc', () => {
    h.rubrics = { data: [{ id: 'ru-1', name: 'A' }] };
    expect(renderHook(() => useRulesLink(null)).result.current).toBe('/teacher/rules');
    expect(renderHook(() => useRulesLink('ru-khac')).result.current).toBe('/teacher/rules');
    h.rubrics = { data: undefined };
    expect(renderHook(() => useRulesLink('ru-1')).result.current).toBe('/teacher/rules');
  });
});
```

Component tests (add to the existing files; the default behaviour tests stay untouched):

- `CaseFlagsBanner.test.tsx`: 
  ```tsx
  it('mang ?rubric= khi biết rubric của bài', () => {
    render(
      <CaseFlagsBanner
        caseFlags={[{ code: 'criterion_without_rules', detail: 'x' }]}
        errorFlags={[{ ruleKey: 'ten_bien', code: 'unpriced' }]}
        onManualScore={vi.fn()}
        rulesHref="/teacher/rules?rubric=CTDL"
      />,
    );
    expect(screen.getByRole('link', { name: /Đặt giá/i })).toHaveAttribute('href', '/teacher/rules?rubric=CTDL');
    expect(screen.getByRole('link', { name: 'Tạo luật cho tiêu chí này' })).toHaveAttribute('href', '/teacher/rules?rubric=CTDL');
  });
  ```
- `ErrorList.test.tsx`: in the existing test file, find the case that renders a counted, non-unverified error and asserts the link `Sửa luật này` (search the file for `'Sửa luật này'` positive assertions; the negative one is at line ~119) and add `rulesHref="/teacher/rules?rubric=CTDL"` to a copy of it asserting the `href`. If no positive assertion exists, add one using the same `render` helper the file uses for a counted error:
  ```tsx
  it('"Sửa luật này" mở Bảng lỗi đúng rubric của bài', () => {
    renderList({ rulesHref: '/teacher/rules?rubric=CTDL' }); // helper name as in the file; counted + verified error
    expect(screen.getByRole('link', { name: 'Sửa luật này' })).toHaveAttribute('href', '/teacher/rules?rubric=CTDL');
  });
  ```
- `LeverageLine.test.tsx`:
  ```tsx
  it('liên kết mang ?rubric= khi biết rubric', () => {
    render(<LeverageLine leverage={{ waiting: 1, total: 1, ruleKeys: ['x'] }} rulesHref="/teacher/rules?rubric=CTDL" />);
    expect(screen.getByRole('link', { name: 'Đặt giá ở Bảng lỗi' })).toHaveAttribute('href', '/teacher/rules?rubric=CTDL');
  });
  ```
- `ReapplyPricesPanel.test.tsx`: next to the existing case at line ~145 (the `skipped` branch), add the same assertion with `rulesHref="/teacher/rules?rubric=CTDL"` passed to the panel.
- `RubricRow.test.tsx`: the "Sửa trần ở Bảng lỗi" link (pinned rubric, test at line ~50) must now have `href` `/teacher/rules?rubric=<pinned name>`: change that assertion to `toHaveAttribute('href', rulesHref(<name of the pinned rubric in the fixture>))` (import `rulesHref` from `@/lib/rules-links`); the "Tạo rubric ở Bảng lỗi" link (no rubric yet, line ~86) keeps `/teacher/rules`.
- `grading/page.test.tsx` and `grading/finalize/page.test.tsx`: add `vi.mock('@/hooks/useRulesLink', () => ({ useRulesLink: () => '/teacher/rules?rubric=CTDL' }));` and one assertion each that the value reaches the child: for the grading page, the mocked `PreparePanel`/`RunningPanel` aren't relevant — add a case that renders the ready state and asserts the `LeverageLine` link (when the file has a case rendering it; otherwise mock `./_components/LeverageLine` like the other children and record the props) with `rulesHref` equal to the mocked value; for the finalize page the mocked `FinalizePanel` records props — assert `props.rulesHref`.

Run the touched test files → Expected FAIL (props not wired).

- [ ] **Step 2: Implement**

`hooks/useRulesLink.ts`:

```ts
'use client';

import { rulesHref } from '@/lib/rules-links';
import { useRubrics } from './useGrading';

/** Liên kết tới Bảng lỗi mở đúng rubric của một phiên (theo id rubric đã ghim); chưa biết thì về trang gốc. */
export function useRulesLink(rubricId: string | null | undefined): string {
  const rubrics = useRubrics();
  const name = rubricId ? rubrics.data?.find((r) => r.id === rubricId)?.name : undefined;
  return rulesHref(name);
}
```

Edits (each is a prop with the previous literal as its default, so every existing caller and test keeps working):

1. `CaseFlagsBanner.tsx`: `import { RULES_PATH } from '@/lib/rules-links';`; add `rulesHref = RULES_PATH` to the destructured props and `rulesHref?: string;` to the prop type; replace both `href="/teacher/rules"` with `href={rulesHref}`.
2. `ErrorList.tsx`: same import; add `rulesHref = RULES_PATH` / `rulesHref?: string` to the props; the one `<Link href="/teacher/rules" …>Sửa luật này</Link>` becomes `href={rulesHref}`.
3. `InvestigatorDossier.tsx`: `import { rulesHref } from '@/lib/rules-links';` and pass `rulesHref={rulesHref(rubric?.name)}` to both `<CaseFlagsBanner …/>` and `<ErrorList …/>` (the `rubric` variable on line ~34 is already the pinned rubric).
4. `LeverageLine.tsx`: add `rulesHref = RULES_PATH` / `rulesHref?: string`; `<Link href={rulesHref}>`.
5. `ReapplyPricesPanel.tsx`: add `rulesHref = RULES_PATH` / `rulesHref?: string` to `{ sessionId }`; `<Link href={rulesHref} …>Đặt giá ở Bảng lỗi</Link>`.
6. `FinalizePanel.tsx`: add `rulesHref?: string` to its props and pass `rulesHref={rulesHref}` to `<ReapplyPricesPanel sessionId={sessionId} />`.
7. `RubricRow.tsx`: `import { rulesHref } from '@/lib/rules-links';` and replace the link inside the `pinned ? (…)` block `href="/teacher/rules"` with `href={rulesHref(pinned.name)}`; leave the "Tạo rubric ở Bảng lỗi" link as `/teacher/rules`.
8. `grading/page.tsx` (`SessionScreen`): `import { useRulesLink } from '@/hooks/useRulesLink';`, then `const rulesLink = useRulesLink(session.rubricId);` after the other hooks, and `<LeverageLine leverage={leverageOf(needsYou, details.byId)} rulesHref={rulesLink} />`.
9. `grading/finalize/page.tsx` (`FinalizeContent`): the same import; directly after `const session = overview.data?.find(…)` add `const rulesLink = useRulesLink(session?.rubricId);` (before the early returns — hooks must not be conditional) and pass `rulesHref={rulesLink}` to `<FinalizePanel …/>`.

`LeverageLine` today is a plain function component with no hooks, which is why the rubric lookup lives in the page (`useRulesLink`) and arrives as a prop — the same shape for `FinalizePanel` → `ReapplyPricesPanel`, so none of those components (or their tests) needs a `QueryClientProvider`.

- [ ] **Step 3: Run, lint, commit**

```powershell
pnpm exec vitest run src/hooks/useRulesLink.test.tsx src/app/teacher/grading src/app/teacher/exam-sessions
pnpm exec tsc --noEmit
pnpm exec eslint src/hooks src/app/teacher
```
Expected: PASS (the `RubricPicker` of "Tạo phiên thi" is intentionally untouched: no rubric is chosen there yet).

```bash
git add apps/web/src
git commit -m "feat(web): links from grading pages open Bảng lỗi on the right rubric"
```

---

## Task B13: Whole-app verification and acceptance against the mock-up

**Files:** `docs/rehearsals/2026-10-07-rules-by-rubric-ui.md` (new, the acceptance record). No product code unless a check below fails.

- [ ] **Step 1: Full automated pass**

```powershell
cd apps\web
pnpm exec tsc --noEmit
pnpm exec eslint .
pnpm exec vitest run 2>&1 | Select-Object -Last 12
pnpm build
cd ..\..
pnpm check:cycles
```
Expected: zero type/lint errors; every vitest file passes (compare the totals with the B1 baseline in `.superpowers/sdd/rules-by-rubric/progress.md`); `next build` succeeds; `check:cycles` prints zero cycles. Sweep for leftovers:

```bash
grep -rn "criterionKey: string; deduction\|useRules()\|lib/rule-form\|rules-filter\|CeilingCard\|PriceSheet\|MissingRulesPanel" apps/web/src | grep -v "\.test\." 
```
Expected: no hit (the old names are gone). `grep -rn "/rules/preview\|/rules/{id}/price" apps/web/src packages/shared/src` → no hit.

- [ ] **Step 2: Start the stack with realistic data**

Follow `apps/api/test/ui-e2e/README.md` (it seeds a teacher, rubrics, rules — one unpriced — sessions and graded results) against the **local** Docker Postgres/MinIO/Redis; start the built API from Plan A (A11) and `pnpm --filter web dev` with `NEXT_PUBLIC_API_URL=http://localhost:4000`. For the many-rubric states (11–13) create 11 more rubrics through the UI ("Rubric mới" → "Tạo trống") or `POST /rubrics`, and put sessions with different `semester_name` on a few of them. Drive the browser with the Playwright MCP local driver (memory `playwright-mcp-local-driver`: script `pw-mcp.mjs`; it lives with the CINE tooling — take it from the checkout that has it) and save screenshots under `.superpowers/sdd/rules-by-rubric/shots/` (git-ignored; embed none in the repo).

- [ ] **Step 3: Walk the 13 states of the approved mock-up and record the comparison**

Open `docs/add/mockups/2026-10-07-rules-by-rubric.html#s=N` beside the running page for N = 1…13. For each row fill the table in `docs/rehearsals/2026-10-07-rules-by-rubric-ui.md`:

| # | State (mock-up) | How reached in the product | Matches? | Difference / follow-up |
|---|---|---|---|---|
| 1 | Cần làm tiếp | rubric with an unpriced error, an empty criterion and proposals | | |
| 2 | Sẵn sàng | rubric with every criterion covered and priced | | |
| 3 | Rubric mới (trống) | create a blank rubric | | |
| 4 | Chưa có rubric nào | fresh teacher account | | |
| 5 | Thêm lỗi | "Thêm lỗi vào …" on an empty criterion | | |
| 6 | Lỗi AI đề xuất | tab with sightings (run a grading attempt that reports a missing error) | | |
| 7 | Thư viện lỗi | tab | | |
| 8 | Tạo rubric từ rubric cũ | "Rubric mới" → pick a source | | |
| 9 | Sửa điểm trừ | click a deduction | | |
| 10 | Sửa lỗi dùng chung | ⋯ → Sửa on a shared error | | |
| 11 | Nhiều rubric (≥ 5) | picker closed | | |
| 12 | Nhiều rubric — đang tìm | picker open, type "giua" | | |
| 13 | Nhiều rubric — lọc học kỳ | pick a semester | | |

Also check by hand, and note in the record: (a) a real unpriced error shows "Chưa có điểm trừ" and saving a deduction recomputes the session shown in the popover; (b) "Chỉ lưu cho …" on a shared error leaves the other rubric's error unchanged (open it afterwards); (c) deleting a criterion in "Sửa tiêu chí & điểm tối đa" turns its errors into the "Chưa có tiêu chí" group and the banner counts them; (d) with the browser's localStorage blocked the page still works; (e) resize to a phone width — rows stack, nothing is cut off; (f) tab through the page with the keyboard: every control reachable, focus visible, Esc closes popover/picker/drawer.

- [ ] **Step 4: Fix, re-run, commit the record**

Any "Matches? = no" that is a real defect gets a failing test first (in the owning task's test file) and a fix; a deliberate difference is written down with the reason. Then:

```bash
git add docs/rehearsals/2026-10-07-rules-by-rubric-ui.md
git commit -m "docs(rules): record UI acceptance against the approved mock-up"
```

- [ ] **Step 5: Hand-off note for the user (do not push or open a PR)**

Report: both plans ran on the current branch (same checkout; no separate worktree); Plan A's rehearsal record and this acceptance record are in `docs/rehearsals/`; Q1/Q2 were locked before implementation (Q1: D9 as in plan — no *creation* of the three "máy chưa đo được" templates; Q2: mock-up defaults — constants `MANY`, `RECENT_SHOWN` in `lib/rubric-board.ts`); and one thing deliberately **not** changed: the link and body texts on the grading screens still say "giá/luật" (`CaseFlagsBanner`, `LeverageLine`, `ReapplyPricesPanel`, `ErrorList`, `RubricRow`) although the Bảng lỗi page now says "điểm trừ/lỗi" — spec 5.8 only asked for `?rubric=`; a vocabulary pass over those screens is a separate small task if the user wants it.

---

## Self-Review

**Spec coverage (§5, §7.6) — each requirement and the task that implements it:**

| Spec | Task |
|---|---|
| 5.1 structure (header, switcher, meta, banner, tabs, groups, rows, drawers) | B4–B11 |
| 5.1 URL `?rubric=`, fallback to first, onboarding | B1 (`rulesHref`), B11 |
| 5.2 status/tasks purity, 8+ combinations | B2 `statusOf` 16-row truth table |
| 5.3 banner rows are buttons; dangling "Chuyển sang tiêu chí khác" | B5, B6 (dangling group), B11 |
| 5.4 add drawer: fixed context, library + new, suggestions editable, proposal prefill, impact text | B7 |
| 5.5 edit drawer: two buttons with consequence lines; library = one button; 1 rubric = one button; legacy predicate | B8 + B2 `buildChanges` |
| 5.6 many rubrics, picker, filters, sort, recent, semester filter, chip + "Bỏ lọc", reset on create | B2, B4, B11 |
| 5.7 vocabulary | all components; enforced by B11 vocabulary test |
| 5.8 links with `?rubric=`; redirects | B3 (redirect pages), B12 |
| T-RBE-UI-1 | B2 · UI-2 | B4, B6, B11 · UI-3 | B5 · UI-4 | B6 `PricePopover` · UI-5 | B7 · UI-6 | B8 · UI-7 | B9 · UI-8 | B6 `UsesMore`, B9 · UI-9 | B1, B3, B12 · UI-10 | B4, B11 |
| §7.7 manual acceptance 1–13 | B13 |

**Placeholder scan:** no "TBD/TODO/implement later" in the plan. Two intentional pointers to existing files whose exact lines are not reproduced (B12 Step 1: the `ErrorList` positive-link test and the `RubricRow` fixture name) say how to find them and give the assertion to add; B13's acceptance table is a template to fill at run time, not code.

**Type consistency:** `RubricOverview.criteria[].{key, description, maxPoints, errorCount, waiverId}` (B1) is read the same way in `statusOf`/`tasksOf` (B2), `CriterionGroup` (B6), `AddErrorDrawer` (B7), `RubricDialog` copy rows (B10); `ErrorFormState`/`buildChanges(rule, form)` (B2) are used with a `LibraryRule` in B8 and with an inline `{ revision: {…} }` literal for proposals in B7; mutation variable shapes (`{ rubricErrorId, criterionKey }`, `{ ruleId, rubricName, changes }`, `{ from, to }`) are the same in B1 hooks, B6/B7/B8/B10 callers and their test assertions; `rulesHref` (function, B1) vs the `rulesHref` **prop** (B12) never collide inside one scope except in `InvestigatorDossier`, where the function is called inline as a prop value.

**Review Focus coverage:** 1 → B1 `rulesHref` round trip, B11 special-character rubric name; 2 → B11 unknown-name and refetching tests; 3 → B2 storage tests, B11 blocked-storage test; 4 → B6 dangling-group tests; 5 → B7 proposal adoption tests (`ruleId`, no `newRule`, `changes` only when edited); 6 → B2 `buildChanges`, B8 legacy-predicate test.

