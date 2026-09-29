# Danh sách phiên chấm (bảng, trạng thái chấm, lọc, thao tác hàng loạt) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Every task is TDD: write the failing test, watch it fail for the right reason, implement, watch it pass, `tsc`, lint the touched dir, commit.

**Goal:** Replace the two-column card picker at `/teacher/grading` (no `sessionId`) with a working table: a grading **status** per session, search/filter/sort/group, filters kept in the URL, and **bulk start-grading / bulk assign-rubric**.

**Architecture:** One new read-only API route `GET /grading/sessions-summary` (grading module) returns per-session grading counts; the web merges it with the existing `/submissions/overview` list. All list logic (status, filters, facets, sort, group, bulk eligibility, URL state) is pure code in `apps/web/src/lib/session-list*.ts` with unit tests; components under `_components/session-list/` are thin. Bulk actions run **one session at a time through the existing per-session routes** and report each outcome — the server stays the authority on whether a session may start.

**Tech Stack:** NestJS 11 + TypeORM raw SQL + Jest/supertest (api); Next.js 15 App Router, TanStack Query, Tailwind tokens, shadcn `Dialog`/`DropdownMenu`, Vitest + RTL (web). No Playwright (owner's decision 2026-09-29).

**Spec:** `docs/superpowers/specs/2026-09-29-grading-session-list-design.md` (all of it). Approved mock-up: private artifact "Danh sách phiên chấm" — the spec must and does stand without it.

## Verified facts this plan is built on

- `GET /exam-sessions/:id/grading-progress` → `byStatus` (grouped `grading_result.status`) **per session**; there is no list-level equivalent. `stateOf` (`lib/session-triage.ts`) classifies one result by `status` + `ungradableReason`; `flagged_for_review` with a reason = *không chấm được*, without = *cần bạn xem*; unknown statuses fall to `grading`.
- `SessionOverviewItem` (`lib/api/submissions.ts`) has: `id, name, code, classId, className|null, roomName, examType(TK|GK|CK), startTime, endTime, status, rubricId|null, rubricVersion, expectedCount, rosterKnown, fullySubmittedCount, partialCount, semesterName, archivedAt`. `courseName` is a constant — never filter on it. `roomName` already contains the word "Phòng".
- `preflightOf` (`lib/preflight.ts`) blocks starting when: no rubric / rubric has no criteria; no question chosen (`readiness.hasQuestion`); a `code_project` deliverable has no pinned approved bundle; nothing collected. The list can know only rubric-present and question-present.
- `startGrading(id)` = `POST /exam-sessions/:id/start-grading`; `setSessionRubric(id, rubricId)` = `PATCH /exam-sessions/:id/rubric` (409 once the first result exists). Both throw `Error(serverMessage)` via `fail()`.
- `grading_reference.question_material_id IS NOT NULL` is exactly `readiness.hasQuestion` (`GradingReferenceService.readiness`).
- `Dialog` and `DropdownMenu` (with `DropdownMenuCheckboxItem`) exist in `components/ui`; **no** Popover/Checkbox/Tabs; `@testing-library/user-event` is **not** installed (use `fireEvent`). `vitest.setup.ts` already polyfills pointer-capture/scrollIntoView/ResizeObserver for Radix.
- `next/navigation` is mocked in `grading/page.test.tsx` with `useSearchParams` only — Task 8 extends it.
- New API routes need `packages/shared/src/api/schema.d.ts` regenerated from a **running** API (memory `cine-openapi-client-regeneration`), or `apiClient.GET('/grading/sessions-summary')` fails typecheck.
- e2e needs Postgres + MinIO running and bucket `examcollect-submissions` created; kill stray `jest`/`nest` node processes first (memories `cine-e2e-test-prerequisites`, `cine-e2e-stale-jest-processes`). `apps/api/.env` points at REMOTE Supabase — never run anything against it here; use `.env.test`.

## Global Constraints

- Copy is Vietnamese; comments in the code are Vietnamese, explaining *why* (match the surrounding files).
- `stateOf` vocabulary and icons/colours are reused, not reinvented: needs-you = warning + `TriangleAlert`, running = info (+ `bg-stripes`) + `RefreshCw`, ready = success + `CheckCircle2`, done = primary + `Lock`. Colour is never the only signal (icon and words always present).
- Components never call `apiClient` directly; they use `hooks/useGrading.ts` or `lib/api/grading.ts`.
- A control that cannot act says why (`title` / visible text); it never silently does nothing.
- Web files stay under 500 lines; pages under `app/**/page.tsx` stay thin.
- **Do not touch** the G1–G5 worktree (`.claude/worktrees/grading-ui-rebuild`, branch `feat/grading-gaps-g1-g5`) — another session is executing there. Expect merge friction in `grading.controller.ts` (constructor) and `grading.module.ts` (providers): keep those edits to exactly one injected service, one route, one provider.
- Branch `feat/grading-session-list` (worktree `.claude/worktrees/grading-session-list`, from `origin/main` edaec77). Commit per task with the trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. **No push / PR / merge** until the owner says so (memory `pr-merge-needs-user-review`).

## Review Focus

1. **Bulk actions acting on sessions the teacher can no longer see.** Select two sessions, then narrow a filter so one disappears — the bar must count and act on one. → Task 8 test.
2. **A partly failed bulk start hiding which session failed and why.** One session's `start-grading` rejects: the rest must still run, and the result list must show the server's message next to the right session. → Task 3 (`runSequentially`) + Task 9 tests.
3. **Summary endpoint slow, failing or not yet loaded.** The table must still search/filter/sort/select; tabs, progress and bulk actions must be absent, not wrong. → Task 8 test.
4. **Garbage in the URL** (`?status=zzz&sort=x:y&time=999&sem=`). Must fall back to defaults, never blank the page. → Task 5 tests.
5. **Another teacher's sessions or counts leaking through the summary route**, and **statuses the code has never heard of** (the G-series adds states) being read as "done". → Task 2 e2e (isolation), Task 3 drift test (unknown → `grading`).

---

## Task 0: Worktree environment (no code)

**Files:** none tracked.

- [ ] **Step 1: Install and copy the ignored env files**

```bash
cd "C:/Users/Admin/Main/Desktop/HKI 2026-2027/KLTN/CINE/.claude/worktrees/grading-session-list"
pnpm install --frozen-lockfile
cp "../../../apps/api/.env.test" apps/api/.env.test
ls apps/api/.env.test && git status --short | head
```

Expected: install completes; `.env.test` exists; `git status` shows only the two untracked docs (spec, this plan).

- [ ] **Step 2: Check the services e2e needs**

```bash
docker ps --format '{{.Names}} {{.Status}}' | grep -Ei "postgres|minio|redis"
```

Expected: postgres, minio, redis all `Up`. If `docker ps` errors with `dockerDesktopLinuxEngine`, start Docker Desktop, then `docker compose up -d postgres minio redis`. Confirm the bucket exists (`examcollect-submissions`) — create it by hand if not. Kill leftover workers: `tasklist | grep -i node` and stop any old `jest`/`nest` processes.

- [ ] **Step 3: Baseline**

```bash
cd apps/web && npx vitest run src/app/teacher/grading 2>&1 | tail -6
cd ../api && npx jest src/grading/grading-run 2>&1 | tail -6
```

Expected: existing tests pass. Record any pre-existing failure here before changing anything so it is not blamed on this work.

- [ ] **Step 4: Commit the spec and this plan on their own**

```bash
git add docs/superpowers/specs/2026-09-29-grading-session-list-design.md docs/superpowers/plans/2026-09-29-grading-session-list.md
git commit -m "docs(spec,plan): grading session list" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Task 1: Summary service — the folding function and the query

**Files:**
- Create: `apps/api/src/grading/grading-summary.service.ts`
- Create: `apps/api/src/grading/grading-summary.service.spec.ts`

**Interfaces:**
- Produces: `GradingSessionSummary { examSessionId: string; byStatus: Record<string, number>; ungradable: number; hasQuestion: boolean }`, `SummaryRawRow`, `foldSummaryRows(rows: SummaryRawRow[]): GradingSessionSummary[]`, `GradingSummaryService.summarizeForTeacher(teacherId: string): Promise<GradingSessionSummary[]>`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/grading/grading-summary.service.spec.ts
import { foldSummaryRows, type SummaryRawRow } from './grading-summary.service';

const row = (over: Partial<SummaryRawRow> = {}): SummaryRawRow => ({
  exam_session_id: 's1',
  status: null,
  n: null,
  ungradable: null,
  has_question: false,
  ...over,
});

describe('foldSummaryRows', () => {
  it('gives an empty entry to a session with no results at all', () => {
    expect(foldSummaryRows([row()])).toEqual([
      { examSessionId: 's1', byStatus: {}, ungradable: 0, hasQuestion: false },
    ]);
  });

  it('folds one row per (session, status) into one entry per session', () => {
    const out = foldSummaryRows([
      row({ status: 'auto_approved', n: 3 }),
      row({ status: 'flagged_for_review', n: 2, ungradable: 1 }),
      row({ status: 'ai_grading', n: 1 }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].byStatus).toEqual({ auto_approved: 3, flagged_for_review: 2, ai_grading: 1 });
    expect(out[0].ungradable).toBe(1);
  });

  it('reads Postgres numeric strings as numbers', () => {
    const out = foldSummaryRows([row({ status: 'finalized', n: '12', ungradable: '0' })]);
    expect(out[0].byStatus).toEqual({ finalized: 12 });
  });

  it('keeps hasQuestion from the session, not from a status row', () => {
    const out = foldSummaryRows([
      row({ status: 'auto_approved', n: 1, has_question: true }),
      row({ status: 'finalized', n: 1, has_question: true }),
    ]);
    expect(out[0].hasQuestion).toBe(true);
  });

  it('drops a zero-count row instead of listing the status', () => {
    const out = foldSummaryRows([row({ status: 'auto_approved', n: 0 })]);
    expect(out[0].byStatus).toEqual({});
  });

  it('keeps two sessions apart', () => {
    const out = foldSummaryRows([
      row({ exam_session_id: 'a', status: 'finalized', n: 1 }),
      row({ exam_session_id: 'b', status: 'ai_grading', n: 4 }),
    ]);
    expect(out.map((s) => s.examSessionId).sort()).toEqual(['a', 'b']);
    expect(out.find((s) => s.examSessionId === 'b')!.byStatus).toEqual({ ai_grading: 4 });
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd apps/api && npx jest src/grading/grading-summary.service.spec.ts`
Expected: FAIL — `Cannot find module './grading-summary.service'`.

- [ ] **Step 3: Implement**

```ts
// apps/api/src/grading/grading-summary.service.ts
import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

/**
 * Một phiên trong bảng tóm tắt chấm điểm — nguồn của trang danh sách phiên chấm.
 * Mirror ở apps/web/src/lib/api/grading.ts.
 */
export interface GradingSessionSummary {
  examSessionId: string;
  /** Số `grading_result` theo `status`; chỉ chứa trạng thái có ít nhất một dòng. */
  byStatus: Record<string, number>;
  /**
   * Trong `flagged_for_review`: số bài có `ungradable_reason` (không chấm được).
   * Phần còn lại của `flagged_for_review` là "cần bạn xem" — cùng phép chia của `stateOf` ở web.
   */
  ungradable: number;
  /** Đã chỉ định đề bài — điều kiện bắt buộc để bắt đầu chấm (spec UI §3.7). */
  hasQuestion: boolean;
}

/** Hàng thô: mọi COUNT về đây dưới dạng string ở một số kiểu, nên `n`/`ungradable` nhận cả hai. */
export interface SummaryRawRow {
  exam_session_id: string;
  status: string | null;
  n: number | string | null;
  ungradable: number | string | null;
  has_question: boolean;
}

/**
 * Gộp các hàng (phiên × trạng thái) thành một mục cho mỗi phiên. Hàm thuần: bài test của nó
 * không cần DB, và phép gộp là chỗ dễ sai nhất (phiên chưa có kết quả nào vẫn phải có mục).
 */
export function foldSummaryRows(rows: SummaryRawRow[]): GradingSessionSummary[] {
  const bySession = new Map<string, GradingSessionSummary>();
  for (const row of rows) {
    let item = bySession.get(row.exam_session_id);
    if (!item) {
      item = { examSessionId: row.exam_session_id, byStatus: {}, ungradable: 0, hasQuestion: row.has_question };
      bySession.set(row.exam_session_id, item);
    }
    if (row.status === null) {
      continue;
    }
    const n = Number(row.n ?? 0);
    if (n > 0) {
      item.byStatus[row.status] = (item.byStatus[row.status] ?? 0) + n;
    }
    item.ungradable += Number(row.ungradable ?? 0);
  }
  return [...bySession.values()];
}

/**
 * Tóm tắt chấm điểm của MỌI phiên của một giảng viên trong MỘT truy vấn.
 *
 * Tách khỏi `SubmissionOverviewService` có chủ đích: overview là một CTE lớn của luồng THU BÀI
 * và phục vụ cả trang Bài thu; số liệu chấm thuộc module chấm điểm (CLAUDE.md: hai luồng, hai
 * module). Không có route này, 20 phiên là 20 lần gọi `grading-progress`.
 */
@Injectable()
export class GradingSummaryService {
  constructor(private readonly dataSource: DataSource) {}

  async summarizeForTeacher(teacherId: string): Promise<GradingSessionSummary[]> {
    // Tên schema đến từ cấu hình (DATABASE_SCHEMA), không phải từ caller — nội suy là an toàn.
    const schema = (this.dataSource.options as { schema?: string }).schema ?? 'examcollect';
    const rows: SummaryRawRow[] = await this.dataSource.query(
      `
      WITH res AS (
        SELECT sub.exam_session_id,
               g.status::text AS status,
               COUNT(*)::int AS n,
               -- Cùng phép phân loại với stateOf ở web: chỉ dòng flagged_for_review MANG lý do mới là
               -- "không chấm được"; ungradable_reason ở trạng thái khác không được tính.
               COUNT(*) FILTER (
                 WHERE g.status = 'flagged_for_review' AND g.ungradable_reason IS NOT NULL
               )::int AS ungradable
        FROM ${schema}.grading_result g
        JOIN ${schema}.submission sub ON sub.id = g.submission_id
        JOIN ${schema}.exam_session s ON s.id = sub.exam_session_id
        WHERE s.teacher_id = $1
        GROUP BY sub.exam_session_id, g.status
      )
      SELECT s.id AS exam_session_id,
             r.status, r.n, r.ungradable,
             (ref.question_material_id IS NOT NULL) AS has_question
      FROM ${schema}.exam_session s
      -- LEFT: phiên chưa có kết quả nào (và chưa có tài liệu chấm) vẫn phải có mặt trong kết quả.
      LEFT JOIN res r ON r.exam_session_id = s.id
      LEFT JOIN ${schema}.grading_reference ref ON ref.exam_session_id = s.id
      WHERE s.teacher_id = $1
      `,
      [teacherId],
    );
    return foldSummaryRows(rows);
  }
}
```

- [ ] **Step 4: Run to see it pass**

Run: `cd apps/api && npx jest src/grading/grading-summary.service.spec.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Typecheck and commit**

```bash
cd apps/api && npx tsc --noEmit -p tsconfig.json
cd ../.. && git add apps/api/src/grading/grading-summary.service.ts apps/api/src/grading/grading-summary.service.spec.ts
git commit -m "feat(grading): per-session grading summary service" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Task 2: Route, module wiring, and the e2e (isolation, states, question)

**Files:**
- Modify: `apps/api/src/grading/grading.controller.ts` (constructor + one route)
- Modify: `apps/api/src/grading/grading.module.ts` (import + one provider)
- Create: `apps/api/test/grading-summary.e2e-spec.ts`

**Interfaces:**
- Consumes: `GradingSummaryService.summarizeForTeacher(teacherId)` (Task 1).
- Produces: `GET /grading/sessions-summary` → `{ items: GradingSessionSummary[] }`, `@Roles('teacher')`, JWT required.

- [ ] **Step 1: Write the failing e2e**

```ts
// apps/api/test/grading-summary.e2e-spec.ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { createTestAccount } from './helpers/create-account';
import { forceStatus, seedResult, seedSession } from './helpers/grading-seed';

interface SummaryItem {
  examSessionId: string;
  byStatus: Record<string, number>;
  ungradable: number;
  hasQuestion: boolean;
}

/**
 * `GET /grading/sessions-summary` là nguồn của trạng thái chấm trên trang danh sách phiên.
 * Hai thứ nó không được sai: chỉ phiên CỦA người gọi, và phép chia "cần xem" / "không chấm được".
 */
describe('GET /grading/sessions-summary (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  const stamp = Date.now();
  let token: string;
  let teacherId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();
    ds = app.get(DataSource);

    const email = `summary_${stamp}@example.com`;
    teacherId = await createTestAccount(ds, { email, password: 'correct-horse-battery', role: 'teacher' });
    const login = await request(app.getHttpServer()).post('/auth/login').send({ email, password: 'correct-horse-battery' });
    token = login.body.accessToken as string;
  });

  afterAll(async () => {
    await app.close();
  });

  const summary = () =>
    request(app.getHttpServer()).get('/grading/sessions-summary').set('Authorization', `Bearer ${token}`);
  const find = (items: SummaryItem[], id: string) => items.find((i) => i.examSessionId === id);

  it('counts results by status and separates "không chấm được" from "cần bạn xem"', async () => {
    const ctx = await seedSession(ds, 'sumA', { teacherId, startHoursAgo: 3 });
    await seedResult(ds, ctx); // giữ nguyên ai_grading
    const approved = await seedResult(ds, ctx);
    const needsYou = await seedResult(ds, ctx);
    const ungradable = await seedResult(ds, ctx);
    await forceStatus(ds, approved.resultId, 'auto_approved');
    await forceStatus(ds, needsYou.resultId, 'flagged_for_review');
    await forceStatus(ds, ungradable.resultId, 'flagged_for_review', {
      ungradable_class: 'system',
      ungradable_reason: 'sandbox chết',
      confidence: 0,
    });

    const res = await summary().expect(200);
    const item = find(res.body.items, ctx.sessionId)!;
    expect(item.byStatus).toEqual({ ai_grading: 1, auto_approved: 1, flagged_for_review: 2 });
    expect(item.ungradable).toBe(1);
    expect(item.hasQuestion).toBe(false);
  });

  it('lists a session with no results at all, with empty counts', async () => {
    const ctx = await seedSession(ds, 'sumB', { teacherId, startHoursAgo: 6 });
    const res = await summary().expect(200);
    expect(find(res.body.items, ctx.sessionId)).toEqual({
      examSessionId: ctx.sessionId,
      byStatus: {},
      ungradable: 0,
      hasQuestion: false,
    });
  });

  it('reports hasQuestion once the grading reference names a question material', async () => {
    const ctx = await seedSession(ds, 'sumC', { teacherId, startHoursAgo: 9 });
    const [material] = await ds.query(
      `INSERT INTO examcollect.exam_material (exam_session_id, storage_key, file_name, file_size)
       VALUES ($1, $2, 'DeThi.pdf', 1024) RETURNING id`,
      [ctx.sessionId, `materials/${ctx.sessionId}/de-thi`],
    );
    await ds.query(
      `INSERT INTO examcollect.grading_reference (exam_session_id, question_material_id, created_by)
       VALUES ($1, $2, $3)`,
      [ctx.sessionId, material.id, teacherId],
    );
    const res = await summary().expect(200);
    expect(find(res.body.items, ctx.sessionId)!.hasQuestion).toBe(true);
  });

  it("never returns another teacher's sessions", async () => {
    const other = await seedSession(ds, 'sumOther'); // own teacher
    await seedResult(ds, other);
    const res = await summary().expect(200);
    expect(find(res.body.items, other.sessionId)).toBeUndefined();
  });

  it('requires a login', async () => {
    await request(app.getHttpServer()).get('/grading/sessions-summary').expect(401);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd apps/api && npx jest --config ./test/jest-e2e.json test/grading-summary.e2e-spec.ts`
Expected: FAIL — the first four tests get `404` (route missing); "requires a login" also 404 not 401.

- [ ] **Step 3: Wire the route**

`apps/api/src/grading/grading.controller.ts` — add the import next to the other service imports, add the constructor parameter after `scores`, and add the route right after `listRubrics`/`getRubric`:

```ts
import { GradingSummaryService } from './grading-summary.service';
```

```ts
    private readonly scores: ScoreService,
    private readonly summaries: GradingSummaryService,
    @InjectDataSource() private readonly dataSource: DataSource,
```

```ts
  /**
   * Tóm tắt chấm điểm của MỌI phiên của người gọi — nguồn của trang danh sách phiên chấm.
   *
   * Đường dẫn cố ý là `grading/sessions-summary`, không phải `exam-sessions/sessions-summary`:
   * `GET exam-sessions/:id` của ExamSessionController sẽ bắt chuỗi đó như một `:id` rồi
   * `ParseUUIDPipe` trả 400.
   */
  @Get('grading/sessions-summary')
  @Roles('teacher')
  async sessionsSummary(@Req() req: Request) {
    return { items: await this.summaries.summarizeForTeacher(req.user!.sub) };
  }
```

`apps/api/src/grading/grading.module.ts` — add `import { GradingSummaryService } from './grading-summary.service';` beside the other service imports and add `GradingSummaryService,` to the `providers` array (line ~135, next to `GradingRunService`).

Then check nothing constructs the controller by hand: `grep -rn "new GradingController" apps/api` → expect no output.

- [ ] **Step 4: Run the e2e and the unit spec**

Run: `cd apps/api && npx jest --config ./test/jest-e2e.json test/grading-summary.e2e-spec.ts && npx jest src/grading/grading-summary.service.spec.ts src/grading/grading.module.spec.ts`
Expected: PASS. If `grading.module.spec.ts` lists providers and fails, add `GradingSummaryService` there. If a `forceStatus` call is rejected by a CHECK constraint (triggers are bypassed, CHECKs are not), the error names the constraint: read it in `apps/api/src/database/migrations` and pass the columns it requires through `forceStatus`'s `extra` argument — the assertions stay as written.

- [ ] **Step 5: Typecheck, commit**

```bash
cd apps/api && npx tsc --noEmit -p tsconfig.json && npx eslint src/grading/grading-summary.service.ts src/grading/grading.controller.ts
cd ../.. && git add apps/api && git commit -m "feat(grading): GET /grading/sessions-summary" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Task 3: Web contract — generated client, API function, hook, `countsFromSummary`, bulk runner

**Files:**
- Regenerate: `packages/shared/src/api/schema.d.ts`
- Modify: `apps/web/src/lib/api/grading.ts`, `apps/web/src/hooks/useGrading.ts`, `apps/web/src/lib/session-triage.ts`, `apps/web/src/lib/session-triage.test.ts`
- Create: `apps/web/src/lib/session-list-bulk.ts`, `apps/web/src/lib/session-list-bulk.test.ts`

**Interfaces:**
- Produces: `GradingSessionSummary` (same shape as Task 1), `listGradingSessionSummaries(): Promise<GradingSessionSummary[]>`, `SESSION_SUMMARIES_KEY`, `useGradingSessionSummaries()`, `countsFromSummary(s: Pick<GradingSessionSummary,'byStatus'|'ungradable'>): Record<SessionState, number>`, `BulkOutcome { sessionId: string; ok: boolean; message?: string }`, `runSequentially(ids: string[], action: (id: string) => Promise<unknown>): Promise<BulkOutcome[]>`.

- [ ] **Step 1: Regenerate the OpenAPI client** (memory `cine-openapi-client-regeneration`)

```bash
cd apps/api && pnpm build
DOTENV_CONFIG_PATH=.env.test node -r dotenv/config dist/src/main.js &
SERVER_PID=$!
until curl -s -o /dev/null -w '%{http_code}' http://localhost:4000/api-docs-json | grep -q 200; do sleep 3; done
cd ../../packages/shared && pnpm generate:api-client
kill $SERVER_PID
sleep 2; curl -s -o /dev/null http://localhost:4000/api-docs-json && echo "STILL UP - find and stop it" || echo "server down"
cd ../.. && git diff --stat packages/shared/src/api/schema.d.ts
```

Expected: the diff adds `"/grading/sessions-summary"` and nothing else meaningful. If unrelated paths change, the main checkout's API differs from this branch — investigate before continuing.

- [ ] **Step 2: Write the failing tests**

Append to `apps/web/src/lib/session-triage.test.ts` (add `countsFromSummary` to the existing import from `./session-triage`, and `import type { GradingResult } from './api/grading';` if not present):

```ts
describe('countsFromSummary — agrees with stateOf', () => {
  const summaryOf = (results: GradingResult[]) => {
    const byStatus: Record<string, number> = {};
    let ungradable = 0;
    for (const r of results) {
      byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
      if (r.status === 'flagged_for_review' && r.ungradableReason !== null) ungradable += 1;
    }
    return { byStatus, ungradable };
  };
  const make = (status: string, reason: string | null, times: number): GradingResult[] =>
    Array.from({ length: times }, () => ({ status, ungradableReason: reason }) as unknown as GradingResult);

  it('gives the same seven counts as counting each result with stateOf, for every status', () => {
    const statuses = ['ai_grading', 'ai_graded', 'auto_approved', 'audit_pending', 'flagged_for_review', 'teacher_reviewed', 'finalized', 'exported'];
    const results = [
      ...statuses.flatMap((s) => make(s, null, 2)),
      ...make('flagged_for_review', 'sandbox chết', 3),
      ...make('a_status_from_the_future', null, 1),
    ];
    expect(countsFromSummary(summaryOf(results))).toEqual(countStates(results));
  });

  it('never returns a negative needs-you count if the server sends ungradable > flagged', () => {
    const counts = countsFromSummary({ byStatus: { flagged_for_review: 1 }, ungradable: 3 });
    expect(counts.needsYou).toBe(0);
  });

  it('is all zeros for a session with no results', () => {
    expect(Object.values(countsFromSummary({ byStatus: {}, ungradable: 0 })).every((n) => n === 0)).toBe(true);
  });
});
```

Create `apps/web/src/lib/session-list-bulk.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { runSequentially } from './session-list-bulk';

describe('runSequentially', () => {
  it('runs the ids in order and reports each as ok', async () => {
    const seen: string[] = [];
    const out = await runSequentially(['a', 'b'], async (id) => {
      seen.push(id);
    });
    expect(seen).toEqual(['a', 'b']);
    expect(out).toEqual([{ sessionId: 'a', ok: true }, { sessionId: 'b', ok: true }]);
  });

  it('a rejection is recorded with the server message and does not stop the rest', async () => {
    const action = vi.fn(async (id: string) => {
      if (id === 'b') throw new Error('Phiên chưa ghim gói test.');
    });
    const out = await runSequentially(['a', 'b', 'c'], action);
    expect(action).toHaveBeenCalledTimes(3);
    expect(out).toEqual([
      { sessionId: 'a', ok: true },
      { sessionId: 'b', ok: false, message: 'Phiên chưa ghim gói test.' },
      { sessionId: 'c', ok: true },
    ]);
  });

  it('gives a fallback message when the rejection is not an Error', async () => {
    const out = await runSequentially(['a'], () => Promise.reject('boom'));
    expect(out[0]).toEqual({ sessionId: 'a', ok: false, message: 'Không rõ lỗi.' });
  });

  it('does nothing for an empty list', async () => {
    expect(await runSequentially([], async () => {})).toEqual([]);
  });
});
```

- [ ] **Step 3: Run to see them fail**

Run: `cd apps/web && npx vitest run src/lib/session-triage.test.ts src/lib/session-list-bulk.test.ts`
Expected: FAIL — `countsFromSummary is not a function` / cannot find `./session-list-bulk`.

- [ ] **Step 4: Implement**

`apps/web/src/lib/api/grading.ts` — append after `getGradingProgress`:

```ts
/** Mirrors GradingSessionSummary (apps/api/src/grading/grading-summary.service.ts). */
export interface GradingSessionSummary {
  examSessionId: string;
  /** Số bài theo `status`; chỉ chứa trạng thái có ít nhất một dòng. */
  byStatus: Record<string, number>;
  /** Trong `flagged_for_review`: số bài có lý do "không chấm được". */
  ungradable: number;
  /** Đã chỉ định đề bài. */
  hasQuestion: boolean;
}

/** Tóm tắt chấm điểm của mọi phiên của giảng viên, một lần gọi. Phiên chưa có kết quả vẫn có mục. */
export async function listGradingSessionSummaries(): Promise<GradingSessionSummary[]> {
  const { data, error, response } = await apiClient.GET('/grading/sessions-summary');
  if (error || !response.ok) throw fail(error, response);
  return (data as unknown as { items: GradingSessionSummary[] }).items;
}
```

`apps/web/src/hooks/useGrading.ts` — add `listGradingSessionSummaries` to the existing `@/lib/api/grading` import list, then add:

```ts
export const SESSION_SUMMARIES_KEY = ['grading', 'sessions-summary'] as const;

/**
 * Tóm tắt chấm điểm mọi phiên — trang danh sách phiên đọc nó cạnh `useSessionOverview`.
 * Luôn đọc lại khi mở trang: trạng thái đổi ở các trang khác (bắt đầu chấm, chốt điểm), và một
 * danh sách nói "Chưa chấm" về phiên đang chạy là lời nói dối tệ hơn việc chờ thêm một request.
 */
export function useGradingSessionSummaries() {
  return useQuery({
    queryKey: SESSION_SUMMARIES_KEY,
    queryFn: listGradingSessionSummaries,
    refetchOnMount: 'always',
  });
}
```

`apps/web/src/lib/session-triage.ts` — add the import `import type { GradingSessionSummary } from './api/grading';` (extend the existing type import from `./api/grading`) and append:

```ts
/**
 * Bảy con số của một phiên, từ bảng tóm tắt của server — cùng phép phân loại với `stateOf`, đếm theo
 * số lượng thay vì theo từng bài. Hai bản phải khớp nhau: bài test đối chiếu chúng trên mọi trạng thái.
 * Trạng thái lạ rơi vào `grading` (giống nhánh mặc định của `stateOf`): giấu một bài đắt hơn xếp nhầm nhóm.
 */
export function countsFromSummary(
  summary: Pick<GradingSessionSummary, 'byStatus' | 'ungradable'>,
): Record<SessionState, number> {
  const counts = Object.fromEntries(STATE_ORDER.map((s) => [s, 0])) as Record<SessionState, number>;
  for (const [status, n] of Object.entries(summary.byStatus)) {
    switch (status) {
      case 'auto_approved':
        counts.auto += n;
        break;
      case 'audit_pending':
        counts.audit += n;
        break;
      case 'teacher_reviewed':
        counts.reviewed += n;
        break;
      case 'finalized':
      case 'exported':
        counts.finalised += n;
        break;
      case 'flagged_for_review': {
        const stopped = Math.min(summary.ungradable, n);
        counts.ungradable += stopped;
        counts.needsYou += n - stopped;
        break;
      }
      default:
        counts.grading += n;
    }
  }
  return counts;
}
```

Create `apps/web/src/lib/session-list-bulk.ts`:

```ts
export interface BulkOutcome {
  sessionId: string;
  ok: boolean;
  /** Lời của máy chủ khi bị từ chối. */
  message?: string;
}

/**
 * Chạy một thao tác cho từng phiên, TUẦN TỰ, và báo lại kết quả của từng phiên.
 *
 * Tuần tự vì `start-grading` xếp cả lượt bài vào một hàng đợi dùng chung (năm giảng viên chấm cùng lúc
 * cuối kỳ), và vì thứ tự báo lại phải khớp thứ tự giảng viên đã chọn. Một phiên bị từ chối KHÔNG dừng
 * các phiên sau — nếu dừng, lỗi ở phiên thứ hai biến thành "phiên ba đến mười chưa được bắt đầu" mà
 * không ai được báo.
 */
export async function runSequentially(
  ids: string[],
  action: (id: string) => Promise<unknown>,
): Promise<BulkOutcome[]> {
  const outcomes: BulkOutcome[] = [];
  for (const sessionId of ids) {
    try {
      await action(sessionId);
      outcomes.push({ sessionId, ok: true });
    } catch (error) {
      outcomes.push({ sessionId, ok: false, message: error instanceof Error ? error.message : 'Không rõ lỗi.' });
    }
  }
  return outcomes;
}
```

- [ ] **Step 5: Run, typecheck, commit**

```bash
cd apps/web && npx vitest run src/lib/session-triage.test.ts src/lib/session-list-bulk.test.ts && npx tsc --noEmit
cd ../.. && git add packages/shared apps/web && git commit -m "feat(grading): web contract for the session summary + bulk runner" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

Expected: PASS; `tsc` clean (the generated path makes `apiClient.GET('/grading/sessions-summary')` typecheck).

---

## Task 4: `lib/session-list.ts` — status, rows, filters, facets, sort, group, bulk plan

**Files:**
- Create: `apps/web/src/lib/session-list.ts`, `apps/web/src/lib/session-list.test.ts`, `apps/web/src/lib/session-list.fixtures.ts`

**Interfaces:**
- Consumes: `GradingSessionSummary`, `countsFromSummary`, `STATE_ORDER`, `SessionState`, `SessionOverviewItem`, `EXAM_TYPE_LABELS`.
- Produces (all exported from `session-list.ts`): `ListStatus`, `LIST_STATUS_ORDER`, `LIST_STATUS_LABEL`, `Blocker`, `SessionRow`, `listStatusOf`, `submittedCount`, `buildRows`, `ListFilters`, `EMPTY_LIST_FILTERS`, `hasActiveFilters`, `foldText`, `FacetKey`, `FACET_KEYS`, `matchesFilters`, `FacetOption`, `facetOptions`, `statusCounts`, `SortKey`, `ListView`, `DEFAULT_VIEW`, `DEFAULT_SORT_DIR`, `sortRows`, `RowGroup`, `groupRows`, `BulkPlan`, `bulkPlan`, `sessionHref`, `RowAction`, `rowActionOf`, `progressCaption`, `progressLabel`, `rowNote`, `staleDays`, `formatSessionDate`. Fixtures: `NOW`, `session(over)`, `summary(id, byStatus, over)`, `rowsOf(sessions, summaries)`.

- [ ] **Step 1: Write the fixtures (shared by lib and component tests)**

```ts
// apps/web/src/lib/session-list.fixtures.ts
import type { GradingSessionSummary } from './api/grading';
import type { SessionOverviewItem } from './api/submissions';
import { buildRows } from './session-list';

/** 15:10 29/09/2026, giờ máy — mọi test tính "bao lâu rồi" từ đây, không từ Date.now(). */
export const NOW = new Date(2026, 8, 29, 15, 10).getTime();

export function session(over: Partial<SessionOverviewItem> = {}): SessionOverviewItem {
  return {
    id: 's1',
    name: 'Kiểm tra giữa kỳ',
    code: 'GK-01',
    courseName: 'CTDL&GT',
    classId: 'c1',
    className: 'DHKTPM18ATT',
    roomName: 'Phòng máy A1',
    examType: 'GK',
    startTime: new Date(2026, 8, 28, 7, 30).toISOString(),
    endTime: new Date(2026, 8, 28, 9, 30).toISOString(),
    status: 'completed',
    rubricId: 'ru-1',
    rubricVersion: 3,
    requiredDeliverableCount: 1,
    expectedCount: 40,
    rosterKnown: true,
    fullySubmittedCount: 38,
    partialCount: 0,
    attendedNoSubmissionCount: 0,
    neverAttendedCount: 0,
    satElsewhereCount: 0,
    matchedStudents: null,
    invalidFileCount: 0,
    archiveIssueCount: 0,
    semesterName: 'HK1 2026-2027',
    archivedAt: null,
    attentionClosedAt: null,
    ...over,
  };
}

export function summary(
  id: string,
  byStatus: Record<string, number> = {},
  over: Partial<GradingSessionSummary> = {},
): GradingSessionSummary {
  return { examSessionId: id, byStatus, ungradable: 0, hasQuestion: true, ...over };
}

/** Dựng hàng như trang làm: mỗi phiên kèm tóm tắt cùng id (hoặc không có tóm tắt nào). */
export function rowsOf(sessions: SessionOverviewItem[], summaries: GradingSessionSummary[] | undefined) {
  return buildRows(sessions, summaries);
}
```

- [ ] **Step 2: Write the failing tests**

```ts
// apps/web/src/lib/session-list.test.ts
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_VIEW,
  EMPTY_LIST_FILTERS,
  bulkPlan,
  buildRows,
  facetOptions,
  foldText,
  formatSessionDate,
  groupRows,
  hasActiveFilters,
  listStatusOf,
  matchesFilters,
  progressCaption,
  rowActionOf,
  rowNote,
  sessionHref,
  sortRows,
  statusCounts,
  type ListFilters,
} from './session-list';
import { NOW, rowsOf, session, summary } from './session-list.fixtures';

const zero = { needsYou: 0, audit: 0, ungradable: 0, grading: 0, auto: 0, reviewed: 0, finalised: 0 };
const f = (over: Partial<ListFilters> = {}): ListFilters => ({ ...EMPTY_LIST_FILTERS, ...over });

describe('listStatusOf', () => {
  it('no results at all → todo', () => expect(listStatusOf(zero)).toBe('todo'));
  it('anything needing the teacher → attention, even while grading continues', () => {
    expect(listStatusOf({ ...zero, needsYou: 1, grading: 4, auto: 3 })).toBe('attention');
    expect(listStatusOf({ ...zero, audit: 1 })).toBe('attention');
    expect(listStatusOf({ ...zero, ungradable: 1 })).toBe('attention');
  });
  it('still grading and nothing waiting → running', () => expect(listStatusOf({ ...zero, grading: 2, auto: 5 })).toBe('running'));
  it('every result finalised → done', () => expect(listStatusOf({ ...zero, finalised: 7 })).toBe('done'));
  it('decided but not all finalised → ready', () => {
    expect(listStatusOf({ ...zero, auto: 3, reviewed: 2 })).toBe('ready');
    expect(listStatusOf({ ...zero, auto: 3, finalised: 2 })).toBe('ready');
  });
});

describe('buildRows', () => {
  it('leaves out sessions with nothing collected (same rule the picker had)', () => {
    const rows = rowsOf([session({ id: 'a' }), session({ id: 'b', fullySubmittedCount: 0, partialCount: 0 })], []);
    expect(rows.map((r) => r.session.id)).toEqual(['a']);
  });

  it('status is null for every row while the summary is unknown', () => {
    const rows = rowsOf([session()], undefined);
    expect(rows[0].status).toBeNull();
    expect(rows[0].blocker).toBeNull();
  });

  it('a session missing from the summary counts as not graded yet', () => {
    expect(rowsOf([session({ id: 'a' })], [])[0].status).toBe('todo');
  });

  it('reads counts and status from the summary', () => {
    const [row] = rowsOf([session({ id: 'a' })], [summary('a', { flagged_for_review: 3, auto_approved: 5 })]);
    expect(row.status).toBe('attention');
    expect(row.counts.needsYou).toBe(3);
    expect(row.graded).toBe(8);
  });

  it('todo carries the blocker the list can know: no rubric first, then no question', () => {
    const rows = rowsOf(
      [session({ id: 'a', rubricId: null }), session({ id: 'b' }), session({ id: 'c' })],
      [summary('a', {}, { hasQuestion: true }), summary('b', {}, { hasQuestion: false }), summary('c', {}, { hasQuestion: true })],
    );
    expect(rows.map((r) => r.blocker)).toEqual(['no-rubric', 'no-question', null]);
  });

  it('only todo rows have a blocker', () => {
    const [row] = rowsOf([session({ id: 'a', rubricId: null })], [summary('a', { finalized: 4 })]);
    expect(row.status).toBe('done');
    expect(row.blocker).toBeNull();
  });
});

describe('foldText', () => {
  it('drops diacritics and case, and maps đ', () => {
    expect(foldText('Giữa Kỳ')).toBe('giua ky');
    expect(foldText('Đề thi')).toBe('de thi');
    expect(foldText('ĐỒ THỊ')).toBe('do thi');
  });
});

describe('matchesFilters', () => {
  const rows = rowsOf(
    [
      session({ id: 'a', name: 'Kiểm tra giữa kỳ', className: 'DHKTPM18ATT', classId: 'c1', roomName: 'Phòng máy A1', examType: 'GK' }),
      session({ id: 'b', name: 'Thực hành đồ thị', className: 'DHKTPM19BTT', classId: 'c2', roomName: 'H3.03', examType: 'TK', semesterName: 'HK2 2025-2026', startTime: new Date(2026, 5, 12).toISOString(), rubricId: null }),
    ],
    [summary('a', { flagged_for_review: 1 }), summary('b')],
  );
  const ids = (filters: ListFilters) => rows.filter((r) => matchesFilters(r, filters, NOW)).map((r) => r.session.id);

  it('empty filters match everything', () => expect(ids(f())).toEqual(['a', 'b']));
  it('search ignores diacritics: "giua ky" finds "giữa kỳ"', () => expect(ids(f({ q: 'giua ky' }))).toEqual(['a']));
  it('search reaches class, room and the exam-type label', () => {
    expect(ids(f({ q: 'dhktpm19' }))).toEqual(['b']);
    expect(ids(f({ q: 'h3.03' }))).toEqual(['b']);
    expect(ids(f({ q: 'thuong ky' }))).toEqual(['b']);
  });
  it('several words must all match', () => expect(ids(f({ q: 'giua do' }))).toEqual([]));
  it('inside a facet it is OR, between facets AND', () => {
    expect(ids(f({ classIds: ['c1', 'c2'] }))).toEqual(['a', 'b']);
    expect(ids(f({ classIds: ['c1', 'c2'], examTypes: ['TK'] }))).toEqual(['b']);
  });
  it('status filter', () => expect(ids(f({ status: 'attention' }))).toEqual(['a']));
  it('time window counts back from now', () => {
    expect(ids(f({ time: '7' }))).toEqual(['a']);
    expect(ids(f({ time: '30' }))).toEqual(['a']);
  });
  it('"Thiếu rubric" keeps only sessions without one', () => expect(ids(f({ noRubric: true }))).toEqual(['b']));
  it('an unparseable start time never crashes the filter', () => {
    const [bad] = rowsOf([session({ startTime: 'không phải ngày' })], []);
    expect(() => matchesFilters(bad, f({ time: '7' }), NOW)).not.toThrow();
  });
});

describe('hasActiveFilters', () => {
  it('false for the empty state, true for any single filter', () => {
    expect(hasActiveFilters(EMPTY_LIST_FILTERS)).toBe(false);
    expect(hasActiveFilters(f({ q: 'x' }))).toBe(true);
    expect(hasActiveFilters(f({ status: 'done' }))).toBe(true);
    expect(hasActiveFilters(f({ rooms: ['A'] }))).toBe(true);
    expect(hasActiveFilters(f({ time: '7' }))).toBe(true);
    expect(hasActiveFilters(f({ noRubric: true }))).toBe(true);
  });
});

describe('facetOptions and statusCounts', () => {
  const rows = rowsOf(
    [
      session({ id: 'a', classId: 'c1', className: 'DHKTPM18ATT', semesterName: 'HK1 2026-2027', examType: 'GK' }),
      session({ id: 'b', classId: 'c2', className: 'DHKTPM19BTT', semesterName: 'HK1 2026-2027', examType: 'TK' }),
      session({ id: 'c', classId: 'c2', className: 'DHKTPM19BTT', semesterName: 'HK2 2025-2026', examType: 'CK', startTime: new Date(2026, 5, 12).toISOString() }),
    ],
    [summary('a', { finalized: 1 }), summary('b', { finalized: 1 }), summary('c', { auto_approved: 1 })],
  );

  it("a facet's own filter does not narrow its own counts (so you can add a second choice)", () => {
    const opts = facetOptions(rows, f({ classIds: ['c1'] }), NOW);
    expect(opts.classIds.map((o) => [o.value, o.count])).toEqual([['c1', 1], ['c2', 2]]);
  });

  it("other filters DO narrow a facet's counts", () => {
    const opts = facetOptions(rows, f({ classIds: ['c1'] }), NOW);
    expect(opts.semesters.find((o) => o.value === 'HK1 2026-2027')!.count).toBe(1);
    expect(opts.semesters.find((o) => o.value === 'HK2 2025-2026')!.count).toBe(0);
  });

  it('semesters newest first, exam types in TK/GK/CK order, classes by name', () => {
    const opts = facetOptions(rows, EMPTY_LIST_FILTERS, NOW);
    expect(opts.semesters.map((o) => o.value)).toEqual(['HK1 2026-2027', 'HK2 2025-2026']);
    expect(opts.examTypes.map((o) => o.value)).toEqual(['TK', 'GK', 'CK']);
    expect(opts.classIds.map((o) => o.label)).toEqual(['DHKTPM18ATT', 'DHKTPM19BTT']);
  });

  it('a class with no name is labelled, not blank', () => {
    const [r] = rowsOf([session({ className: null })], []);
    expect(facetOptions([r], EMPTY_LIST_FILTERS, NOW).classIds[0].label).toBe('Không rõ lớp');
  });

  it('status counts follow every other filter but not the status filter itself', () => {
    const counts = statusCounts(rows, f({ status: 'done', classIds: ['c2'] }), NOW);
    expect(counts).toEqual({ all: 2, attention: 0, ready: 1, todo: 0, running: 0, done: 1 });
  });
});

describe('sortRows', () => {
  const at = (day: number) => new Date(2026, 8, day, 8).toISOString();
  const rows = rowsOf(
    [
      session({ id: 'done-old', startTime: at(3) }),
      session({ id: 'attn-old', startTime: at(10) }),
      session({ id: 'attn-new', startTime: at(20) }),
      session({ id: 'todo', startTime: at(15) }),
    ],
    [summary('done-old', { finalized: 1 }), summary('attn-old', { flagged_for_review: 1 }), summary('attn-new', { flagged_for_review: 1 }), summary('todo')],
  );
  const order = (view: Partial<typeof DEFAULT_VIEW>) => sortRows(rows, { ...DEFAULT_VIEW, ...view }).map((r) => r.session.id);

  it('default: needs-you first, newest first within a status, done last', () => {
    expect(order({})).toEqual(['attn-new', 'attn-old', 'todo', 'done-old']);
  });
  it('by date, both directions', () => {
    expect(order({ sortKey: 'date', sortDir: 'desc' })).toEqual(['attn-new', 'todo', 'attn-old', 'done-old']);
    expect(order({ sortKey: 'date', sortDir: 'asc' })).toEqual(['done-old', 'attn-old', 'todo', 'attn-new']);
  });
  it('a row whose status is unknown sorts after every known status', () => {
    const [known] = rowsOf([session({ id: 'k' })], [summary('k', { finalized: 1 })]);
    const [unknown] = rowsOf([session({ id: 'u' })], undefined);
    expect(sortRows([unknown, known], DEFAULT_VIEW).map((r) => r.session.id)).toEqual(['k', 'u']);
  });
  it('by name uses Vietnamese collation with numbers as numbers', () => {
    const named = rowsOf([session({ id: 'b', name: 'Lần 10' }), session({ id: 'a', name: 'Lần 2' })], []);
    expect(sortRows(named, { ...DEFAULT_VIEW, sortKey: 'name', sortDir: 'asc' }).map((r) => r.session.id)).toEqual(['a', 'b']);
  });
  it('does not mutate its input', () => {
    const copy = [...rows];
    sortRows(rows, DEFAULT_VIEW);
    expect(rows).toEqual(copy);
  });
});

describe('groupRows', () => {
  const rows = rowsOf(
    [
      session({ id: 'a', classId: 'c2', className: 'B', semesterName: 'HK2 2025-2026', startTime: new Date(2026, 5, 1).toISOString() }),
      session({ id: 'b', classId: 'c1', className: 'A', semesterName: 'HK1 2026-2027' }),
      session({ id: 'c', classId: 'c2', className: 'B', semesterName: 'HK1 2026-2027' }),
    ],
    [],
  );
  it('none → one unnamed group holding everything, order kept', () => {
    const g = groupRows(rows, 'none');
    expect(g).toHaveLength(1);
    expect(g[0].label).toBeNull();
    expect(g[0].rows.map((r) => r.session.id)).toEqual(['a', 'b', 'c']);
  });
  it('class → groups ordered by class name, rows keep their order inside', () => {
    const g = groupRows(rows, 'class');
    expect(g.map((x) => x.label)).toEqual(['A', 'B']);
    expect(g[1].rows.map((r) => r.session.id)).toEqual(['a', 'c']);
  });
  it('semester → newest semester first', () => {
    expect(groupRows(rows, 'semester').map((x) => x.label)).toEqual(['HK1 2026-2027', 'HK2 2025-2026']);
  });
});

describe('bulkPlan', () => {
  const rows = rowsOf(
    [
      session({ id: 'ready-to-start' }),
      session({ id: 'no-rubric', rubricId: null }),
      session({ id: 'no-question' }),
      session({ id: 'graded' }),
    ],
    [
      summary('ready-to-start'),
      summary('no-rubric'),
      summary('no-question', {}, { hasQuestion: false }),
      summary('graded', { auto_approved: 2 }),
    ],
  );
  it('start = sessions not graded yet with a rubric and a question; rubric = not graded and without rubric', () => {
    const plan = bulkPlan(rows);
    expect(plan.start.map((r) => r.session.id)).toEqual(['ready-to-start']);
    expect(plan.assignRubric.map((r) => r.session.id)).toEqual(['no-rubric']);
    expect(plan.mix).toEqual({ todo: 3, ready: 1 });
  });
  it('offers nothing while statuses are unknown', () => {
    const plan = bulkPlan(rowsOf([session()], undefined));
    expect(plan.start).toEqual([]);
    expect(plan.assignRubric).toEqual([]);
  });
});

describe('row action, note and caption', () => {
  const one = (byStatus: Record<string, number>, over = {}, sOver = {}) => rowsOf([session({ id: 'a', ...over })], [summary('a', byStatus, sOver)])[0];

  it('links carry the session id; attention opens the first non-empty state', () => {
    expect(rowActionOf(one({ flagged_for_review: 2 }))).toMatchObject({ kind: 'link', label: 'Xem xét', href: '/teacher/grading?sessionId=a&state=needsYou' });
    expect(rowActionOf(one({ audit_pending: 1 }))).toMatchObject({ href: '/teacher/grading?sessionId=a&state=audit' });
  });
  it('ready → finalize page; running → session; done → session', () => {
    expect(rowActionOf(one({ auto_approved: 3 }))).toMatchObject({ label: 'Chốt điểm', href: '/teacher/grading/finalize?sessionId=a' });
    expect(rowActionOf(one({ ai_grading: 3 }))).toMatchObject({ label: 'Xem tiến độ', href: '/teacher/grading?sessionId=a' });
    expect(rowActionOf(one({ finalized: 3 }))).toMatchObject({ label: 'Mở kết quả' });
  });
  it('todo: blocked → Chuẩn bị (a link); clear → Bắt đầu chấm (opens the confirm dialog)', () => {
    expect(rowActionOf(one({}, { rubricId: null }))).toMatchObject({ kind: 'link', label: 'Chuẩn bị' });
    expect(rowActionOf(one({}))).toMatchObject({ kind: 'start', label: 'Bắt đầu chấm' });
  });
  it('unknown status → a plain open link', () => {
    expect(rowActionOf(rowsOf([session({ id: 'a' })], undefined)[0])).toMatchObject({ kind: 'link', label: 'Mở' });
  });
  it('sessionHref', () => expect(sessionHref('x', 'audit')).toBe('/teacher/grading?sessionId=x&state=audit'));

  it('notes: blockers, readiness, and staleness', () => {
    expect(rowNote(one({}, { rubricId: null }), NOW)).toEqual({ text: 'Thiếu rubric', tone: 'warn' });
    expect(rowNote(one({}, {}, { hasQuestion: false }), NOW)).toEqual({ text: 'Thiếu đề bài', tone: 'warn' });
    expect(rowNote(one({}), NOW)).toEqual({ text: 'Sẵn sàng chấm', tone: 'ok' });
    const old = { startTime: new Date(2026, 5, 13, 7, 30).toISOString() };
    expect(rowNote(one({ auto_approved: 1 }, old), NOW)).toEqual({ text: 'Thi cách đây 108 ngày', tone: 'warn' });
    expect(rowNote(one({ auto_approved: 1 }), NOW)).toBeNull();
    expect(rowNote(one({ finalized: 1 }, old), NOW)).toBeNull();
  });

  it('captions', () => {
    expect(progressCaption(one({ flagged_for_review: 11, ai_grading: 4, auto_approved: 23 }))).toBe('11 cần xem · 4 đang chấm');
    expect(progressCaption(one({ flagged_for_review: 2, auto_approved: 5 }))).toBe('2 cần xem');
    expect(progressCaption(one({ ai_grading: 22, auto_approved: 14 }))).toBe('14/36 đã chấm');
    expect(progressCaption(one({ auto_approved: 27 }))).toBe('27 chờ chốt');
    expect(progressCaption(one({}))).toBe('0/38 đã chấm');
    expect(progressCaption(one({ finalized: 39 }))).toBe('39/39 đã chốt');
    expect(progressCaption(rowsOf([session()], undefined)[0])).toBe('');
  });
});

describe('formatSessionDate', () => {
  it('local date and time, zero-padded', () => {
    expect(formatSessionDate(new Date(2026, 8, 5, 7, 5).toISOString())).toEqual({ date: '05/09/2026', time: '07:05' });
  });
  it('an unparseable value gives dashes, not "NaN"', () => {
    expect(formatSessionDate('???')).toEqual({ date: '—', time: '' });
  });
});
```

- [ ] **Step 3: Run to see it fail**

Run: `cd apps/web && npx vitest run src/lib/session-list.test.ts`
Expected: FAIL — cannot resolve `./session-list`.

- [ ] **Step 4: Implement `session-list.ts`**

```ts
// apps/web/src/lib/session-list.ts
import type { GradingSessionSummary } from './api/grading';
import type { SessionOverviewItem } from './api/submissions';
import { EXAM_TYPE_LABELS } from './exam-session-display';
import { STATE_ORDER, countsFromSummary, type SessionState } from './session-triage';

/**
 * Logic thuần của danh sách phiên chấm (spec 2026-09-29-grading-session-list-design.md).
 * Không chạm DOM, mạng hay đồng hồ: `now` luôn được truyền vào, để test không phụ thuộc ngày chạy.
 */

const DAY_MS = 86_400_000;
/** Phiên cần xem / sẵn sàng chốt mà thi đã quá số ngày này thì nói ra. */
export const STALE_AFTER_DAYS = 14;

/* ------------------------------------------------------------------ trạng thái */

export type ListStatus = 'attention' | 'ready' | 'todo' | 'running' | 'done';

/** Việc cần làm trước, việc xong sau. Cũng là thứ tự tab. */
export const LIST_STATUS_ORDER: ListStatus[] = ['attention', 'ready', 'todo', 'running', 'done'];

export const LIST_STATUS_LABEL: Record<ListStatus, string> = {
  attention: 'Cần bạn xem',
  ready: 'Sẵn sàng chốt',
  todo: 'Chưa chấm',
  running: 'Đang chấm',
  done: 'Đã chốt',
};

/** Hai điều kiện bắt đầu chấm mà DANH SÁCH biết được; phần còn lại của `preflightOf` chỉ hiện ở màn chuẩn bị. */
export type Blocker = 'no-rubric' | 'no-question';

export interface SessionRow {
  session: SessionOverviewItem;
  /** `null` = chưa biết (bảng tóm tắt chưa tải hoặc lỗi). Mọi thứ không cần trạng thái vẫn chạy. */
  status: ListStatus | null;
  counts: Record<SessionState, number>;
  /** Số bài đã có bản ghi chấm. */
  graded: number;
  /** Chỉ khác null khi `status === 'todo'`. */
  blocker: Blocker | null;
}

const zeroCounts = (): Record<SessionState, number> =>
  Object.fromEntries(STATE_ORDER.map((s) => [s, 0])) as Record<SessionState, number>;

/**
 * Năm giá trị từ bảy con số. `attention` thắng `running`: bài cần xem đã mở được khi lượt chấm còn chạy
 * (trang phiên hiện bảng trong lúc chạy), nên giấu nó sau nhãn "Đang chấm" là giấu việc đang chờ.
 */
export function listStatusOf(counts: Record<SessionState, number>): ListStatus {
  const total = STATE_ORDER.reduce((sum, s) => sum + counts[s], 0);
  if (total === 0) return 'todo';
  if (counts.needsYou + counts.audit + counts.ungradable > 0) return 'attention';
  if (counts.grading > 0) return 'running';
  if (counts.finalised === total) return 'done';
  return 'ready';
}

/** Bài đã thu — cùng phép đếm với `submittedLabel`. */
export function submittedCount(session: SessionOverviewItem): number {
  return session.fullySubmittedCount + session.partialCount;
}

/**
 * Chỉ phiên CÓ bài đã thu (như `SessionPicker` cũ) — nhưng KHÔNG lọc theo rubric hay lưu trữ: phiên thiếu
 * rubric phải hiện ra kèm dấu, vì bài thi thật của sinh viên nằm trong đó.
 */
export function buildRows(sessions: SessionOverviewItem[], summaries: GradingSessionSummary[] | undefined): SessionRow[] {
  const byId = summaries ? new Map(summaries.map((s) => [s.examSessionId, s])) : null;
  return sessions
    .filter((s) => submittedCount(s) > 0)
    .map((session): SessionRow => {
      if (!byId) return { session, status: null, counts: zeroCounts(), graded: 0, blocker: null };
      const summary = byId.get(session.id);
      const counts = summary ? countsFromSummary(summary) : zeroCounts();
      const graded = STATE_ORDER.reduce((sum, s) => sum + counts[s], 0);
      const status = listStatusOf(counts);
      let blocker: Blocker | null = null;
      if (status === 'todo') {
        if (session.rubricId === null) blocker = 'no-rubric';
        // Thiếu cả tóm tắt của phiên → không biết đã có đề bài chưa → coi như chưa (an toàn: không cho bắt đầu).
        else if (!summary?.hasQuestion) blocker = 'no-question';
      }
      return { session, status, counts, graded, blocker };
    });
}

/* ---------------------------------------------------------------------- lọc */

export interface ListFilters {
  q: string;
  status: ListStatus | 'all';
  semesters: string[];
  /** `classId`, không phải tên: tên chỉ để hiện, khoá mới phân biệt hai lớp trùng tên. */
  classIds: string[];
  examTypes: string[];
  rooms: string[];
  time: 'all' | '7' | '30';
  noRubric: boolean;
}

export const EMPTY_LIST_FILTERS: ListFilters = {
  q: '',
  status: 'all',
  semesters: [],
  classIds: [],
  examTypes: [],
  rooms: [],
  time: 'all',
  noRubric: false,
};

export function hasActiveFilters(f: ListFilters): boolean {
  return (
    f.q.trim() !== '' ||
    f.status !== 'all' ||
    f.semesters.length > 0 ||
    f.classIds.length > 0 ||
    f.examTypes.length > 0 ||
    f.rooms.length > 0 ||
    f.time !== 'all' ||
    f.noRubric
  );
}

/** Bỏ dấu, hạ chữ thường, đ → d: gõ "giua ky" vẫn ra "Giữa kỳ". */
export function foldText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/đ/g, 'd');
}

export type FacetKey = 'semesters' | 'classIds' | 'examTypes' | 'rooms';
export const FACET_KEYS: FacetKey[] = ['semesters', 'classIds', 'examTypes', 'rooms'];

const FACET_VALUE: Record<FacetKey, (s: SessionOverviewItem) => string> = {
  semesters: (s) => s.semesterName,
  classIds: (s) => s.classId,
  examTypes: (s) => s.examType,
  rooms: (s) => s.roomName,
};
const FACET_LABEL: Record<FacetKey, (s: SessionOverviewItem) => string> = {
  semesters: (s) => s.semesterName,
  classIds: (s) => s.className ?? 'Không rõ lớp',
  examTypes: (s) => EXAM_TYPE_LABELS[s.examType] ?? s.examType,
  rooms: (s) => s.roomName,
};

/**
 * `skip` bỏ MỘT bộ lọc ra khỏi phép so — dùng để đếm số lượng của chính bộ lọc đó (đếm theo các bộ lọc KHÁC),
 * và để đếm tab trạng thái. Trong một nhóm: OR. Giữa các nhóm: AND. Nhóm rỗng = không lọc.
 */
export function matchesFilters(row: SessionRow, f: ListFilters, now: number, skip?: FacetKey | 'status'): boolean {
  const s = row.session;
  const words = foldText(f.q).split(/\s+/).filter(Boolean);
  if (words.length > 0) {
    const haystack = foldText(
      [s.name, s.className ?? '', s.roomName, s.semesterName, s.code, EXAM_TYPE_LABELS[s.examType] ?? ''].join(' '),
    );
    if (!words.every((w) => haystack.includes(w))) return false;
  }
  for (const key of FACET_KEYS) {
    if (key !== skip && f[key].length > 0 && !f[key].includes(FACET_VALUE[key](s))) return false;
  }
  if (f.time !== 'all') {
    const age = now - Date.parse(s.startTime);
    // Ngày không đọc được → không loại (NaN so sánh luôn sai): giấu phiên vì một ô ngày hỏng đắt hơn hiện thừa.
    if (age > Number(f.time) * DAY_MS) return false;
  }
  if (f.noRubric && s.rubricId !== null) return false;
  if (skip !== 'status' && f.status !== 'all' && row.status !== f.status) return false;
  return true;
}

export interface FacetOption {
  value: string;
  label: string;
  count: number;
}

export function facetOptions(rows: SessionRow[], f: ListFilters, now: number): Record<FacetKey, FacetOption[]> {
  const out = {} as Record<FacetKey, FacetOption[]>;
  for (const key of FACET_KEYS) {
    const labels = new Map<string, string>();
    const newest = new Map<string, number>();
    const counts = new Map<string, number>();
    for (const r of rows) {
      const value = FACET_VALUE[key](r.session);
      labels.set(value, FACET_LABEL[key](r.session));
      newest.set(value, Math.max(newest.get(value) ?? 0, Date.parse(r.session.startTime) || 0));
      if (matchesFilters(r, f, now, key)) counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    const options = [...labels].map(([value, label]) => ({ value, label, count: counts.get(value) ?? 0 }));
    if (key === 'semesters') options.sort((a, b) => (newest.get(b.value) ?? 0) - (newest.get(a.value) ?? 0));
    else if (key === 'examTypes') options.sort((a, b) => ['TK', 'GK', 'CK'].indexOf(a.value) - ['TK', 'GK', 'CK'].indexOf(b.value));
    else options.sort((a, b) => a.label.localeCompare(b.label, 'vi', { numeric: true }));
    out[key] = options;
  }
  return out;
}

export function statusCounts(rows: SessionRow[], f: ListFilters, now: number): Record<ListStatus | 'all', number> {
  const counts: Record<ListStatus | 'all', number> = { all: 0, attention: 0, ready: 0, todo: 0, running: 0, done: 0 };
  for (const r of rows) {
    if (!matchesFilters(r, f, now, 'status')) continue;
    counts.all += 1;
    if (r.status !== null) counts[r.status] += 1;
  }
  return counts;
}

/* ----------------------------------------------------------- sắp xếp, nhóm */

export type SortKey = 'priority' | 'date' | 'name' | 'submitted';

export interface ListView {
  sortKey: SortKey;
  sortDir: 'asc' | 'desc';
  group: 'none' | 'class' | 'semester';
}

export const DEFAULT_VIEW: ListView = { sortKey: 'priority', sortDir: 'asc', group: 'none' };
/** Chiều tự nhiên của từng khoá khi bấm tiêu đề cột lần đầu. */
export const DEFAULT_SORT_DIR: Record<SortKey, 'asc' | 'desc'> = { priority: 'asc', date: 'desc', name: 'asc', submitted: 'desc' };

const rank = (r: SessionRow): number => (r.status === null ? LIST_STATUS_ORDER.length : LIST_STATUS_ORDER.indexOf(r.status));
const newestFirst = (a: SessionRow, b: SessionRow): number => Date.parse(b.session.startTime) - Date.parse(a.session.startTime) || 0;

const COMPARE: Record<SortKey, (a: SessionRow, b: SessionRow) => number> = {
  priority: (a, b) => rank(a) - rank(b) || newestFirst(a, b),
  date: (a, b) => Date.parse(a.session.startTime) - Date.parse(b.session.startTime) || 0,
  name: (a, b) => a.session.name.localeCompare(b.session.name, 'vi', { numeric: true }) || newestFirst(a, b),
  submitted: (a, b) => submittedCount(a.session) - submittedCount(b.session) || newestFirst(a, b),
};

export function sortRows(rows: SessionRow[], view: ListView): SessionRow[] {
  const sign = view.sortDir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => sign * COMPARE[view.sortKey](a, b));
}

export interface RowGroup {
  key: string | null;
  label: string | null;
  rows: SessionRow[];
}

export function groupRows(rows: SessionRow[], group: ListView['group']): RowGroup[] {
  if (group === 'none') return [{ key: null, label: null, rows }];
  const map = new Map<string, RowGroup>();
  for (const r of rows) {
    const key = group === 'class' ? r.session.classId : r.session.semesterName;
    const label = group === 'class' ? (r.session.className ?? 'Không rõ lớp') : r.session.semesterName;
    const entry = map.get(key) ?? { key, label, rows: [] };
    entry.rows.push(r);
    map.set(key, entry);
  }
  const groups = [...map.values()];
  if (group === 'class') return groups.sort((a, b) => a.label!.localeCompare(b.label!, 'vi', { numeric: true }));
  const newest = (g: RowGroup) => Math.max(...g.rows.map((r) => Date.parse(r.session.startTime) || 0));
  return groups.sort((a, b) => newest(b) - newest(a));
}

/* -------------------------------------------------------------- hàng loạt */

export interface BulkPlan {
  /** Chưa chấm, có rubric, có đề bài — ứng viên cho "Bắt đầu chấm". Máy chủ vẫn là người quyết. */
  start: SessionRow[];
  /** Chưa chấm và chưa có rubric. */
  assignRubric: SessionRow[];
  mix: Partial<Record<ListStatus, number>>;
}

export function bulkPlan(selected: SessionRow[]): BulkPlan {
  const plan: BulkPlan = { start: [], assignRubric: [], mix: {} };
  for (const r of selected) {
    if (r.status === null) continue;
    plan.mix[r.status] = (plan.mix[r.status] ?? 0) + 1;
    if (r.status !== 'todo') continue;
    if (r.session.rubricId === null) plan.assignRubric.push(r);
    else if (r.blocker === null) plan.start.push(r);
  }
  return plan;
}

/* ---------------------------------------------------------------- hàng */

export function sessionHref(sessionId: string, state?: SessionState): string {
  return `/teacher/grading?sessionId=${sessionId}${state ? `&state=${state}` : ''}`;
}

export type RowAction =
  | { kind: 'link'; label: string; href: string; tone: 'primary' | 'outline' | 'ghost' }
  | { kind: 'start'; label: string; tone: 'primary' };

export function rowActionOf(row: SessionRow): RowAction {
  const id = row.session.id;
  switch (row.status) {
    case 'attention': {
      const first = (['needsYou', 'audit', 'ungradable'] as SessionState[]).find((s) => row.counts[s] > 0);
      return { kind: 'link', label: 'Xem xét', href: sessionHref(id, first), tone: 'primary' };
    }
    case 'ready':
      return { kind: 'link', label: 'Chốt điểm', href: `/teacher/grading/finalize?sessionId=${id}`, tone: 'outline' };
    case 'todo':
      return row.blocker
        ? { kind: 'link', label: 'Chuẩn bị', href: sessionHref(id), tone: 'outline' }
        : { kind: 'start', label: 'Bắt đầu chấm', tone: 'primary' };
    case 'running':
      return { kind: 'link', label: 'Xem tiến độ', href: sessionHref(id), tone: 'outline' };
    case 'done':
      return { kind: 'link', label: 'Mở kết quả', href: sessionHref(id), tone: 'ghost' };
    default:
      return { kind: 'link', label: 'Mở', href: sessionHref(id), tone: 'outline' };
  }
}

export function staleDays(row: SessionRow, now: number): number | null {
  if (row.status !== 'attention' && row.status !== 'ready') return null;
  const days = Math.floor((now - Date.parse(row.session.startTime)) / DAY_MS);
  return days >= STALE_AFTER_DAYS ? days : null;
}

/** Dòng chú thích dưới pill trạng thái: lý do chặn, sẵn sàng, hoặc "để quá lâu". */
export function rowNote(row: SessionRow, now: number): { text: string; tone: 'warn' | 'ok' } | null {
  if (row.status === 'todo') {
    if (row.blocker === 'no-rubric') return { text: 'Thiếu rubric', tone: 'warn' };
    if (row.blocker === 'no-question') return { text: 'Thiếu đề bài', tone: 'warn' };
    return { text: 'Sẵn sàng chấm', tone: 'ok' };
  }
  const stale = staleDays(row, now);
  return stale === null ? null : { text: `Thi cách đây ${stale} ngày`, tone: 'warn' };
}

export function progressCaption(row: SessionRow): string {
  const c = row.counts;
  const attn = c.needsYou + c.audit + c.ungradable;
  switch (row.status) {
    case 'attention':
      return c.grading > 0 ? `${attn} cần xem · ${c.grading} đang chấm` : `${attn} cần xem`;
    case 'running':
      return `${row.graded - c.grading}/${row.graded} đã chấm`;
    case 'ready':
      return `${c.auto + c.reviewed} chờ chốt`;
    case 'todo':
      return `0/${submittedCount(row.session)} đã chấm`;
    case 'done':
      return `${row.graded}/${row.graded} đã chốt`;
    default:
      return '';
  }
}

/** Cho trình đọc màn hình: ĐỦ các con số của thanh, không chỉ màu. */
export function progressLabel(row: SessionRow): string {
  const c = row.counts;
  const parts = [
    [c.needsYou + c.audit + c.ungradable, 'cần xem'],
    [c.grading, 'đang chấm'],
    [c.auto + c.reviewed, 'chờ chốt'],
    [c.finalised, 'đã chốt'],
  ]
    .filter(([n]) => (n as number) > 0)
    .map(([n, text]) => `${n} ${text}`);
  return `Tiến độ ${row.session.name}: ${parts.length > 0 ? parts.join(', ') : 'chưa chấm bài nào'}`;
}

/** Giờ máy người xem, không phải giờ UTC: giảng viên đọc "07:30", không đọc "00:30Z". */
export function formatSessionDate(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: '—', time: '' };
  const p = (n: number) => String(n).padStart(2, '0');
  return { date: `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`, time: `${p(d.getHours())}:${p(d.getMinutes())}` };
}
```

- [ ] **Step 5: Run to see it pass**

Run: `cd apps/web && npx vitest run src/lib/session-list.test.ts`
Expected: PASS. If a `sortRows` expectation fails, print the actual order before touching the code — the tie rules (newest first inside a status) are the spec's, the test data may need a look first.

- [ ] **Step 6: Typecheck, lint, commit**

```bash
cd apps/web && npx tsc --noEmit && npx eslint src/lib/session-list.ts src/lib/session-list.test.ts src/lib/session-list.fixtures.ts
cd ../.. && git add apps/web/src/lib && git commit -m "feat(grading): pure logic for the session list" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Task 5: URL state and the remembered list

**Files:**
- Create: `apps/web/src/lib/session-list-url.ts`, `apps/web/src/lib/session-list-url.test.ts`, `apps/web/src/lib/session-list-memory.ts`, `apps/web/src/lib/session-list-memory.test.ts`

**Interfaces:**
- Produces: `ListState { filters: ListFilters; view: ListView }`, `parseListState(params: URLSearchParams): ListState`, `serializeListState(state: ListState): URLSearchParams`, `rememberListQuery(query: string): void`, `recalledListHref(base?: string): string`.

- [ ] **Step 1: Write the failing tests**

```ts
// apps/web/src/lib/session-list-url.test.ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_VIEW, EMPTY_LIST_FILTERS } from './session-list';
import { parseListState, serializeListState, type ListState } from './session-list-url';

const parse = (qs: string) => parseListState(new URLSearchParams(qs));

describe('parseListState', () => {
  it('no params → the defaults', () => {
    expect(parse('')).toEqual({ filters: EMPTY_LIST_FILTERS, view: DEFAULT_VIEW });
  });

  it('reads every parameter', () => {
    const s = parse('q=giua+ky&status=attention&sem=HK1&sem=HK2&cls=c1&type=GK&room=A1&time=7&norubric=1&sort=date%3Aasc&group=class');
    expect(s.filters).toEqual({
      q: 'giua ky', status: 'attention', semesters: ['HK1', 'HK2'], classIds: ['c1'], examTypes: ['GK'], rooms: ['A1'], time: '7', noRubric: true,
    });
    expect(s.view).toEqual({ sortKey: 'date', sortDir: 'asc', group: 'class' });
  });

  it('garbage falls back to defaults instead of throwing', () => {
    const s = parse('status=zzz&time=999&sort=foo%3Abar&group=nope&norubric=yes&sem=');
    expect(s.filters.status).toBe('all');
    expect(s.filters.time).toBe('all');
    expect(s.filters.noRubric).toBe(false);
    expect(s.view).toEqual(DEFAULT_VIEW);
    expect(s.filters.semesters).toEqual([]);
  });

  it('a valid sort key with a missing or wrong direction takes that key\'s natural direction', () => {
    expect(parse('sort=date').view).toMatchObject({ sortKey: 'date', sortDir: 'desc' });
    expect(parse('sort=name%3Aupwards').view).toMatchObject({ sortKey: 'name', sortDir: 'asc' });
  });

  it('repeated values are de-duplicated and an enormous q is cut', () => {
    expect(parse('cls=a&cls=a&cls=b').filters.classIds).toEqual(['a', 'b']);
    expect(parse(`q=${'x'.repeat(500)}`).filters.q).toHaveLength(100);
  });
});

describe('serializeListState', () => {
  it('writes nothing for the defaults', () => {
    expect(serializeListState({ filters: EMPTY_LIST_FILTERS, view: DEFAULT_VIEW }).toString()).toBe('');
  });

  it('round-trips a full state', () => {
    const state: ListState = {
      filters: { q: 'đồ thị', status: 'ready', semesters: ['HK1 2026-2027'], classIds: ['c1', 'c2'], examTypes: ['TK'], rooms: ['H3.03'], time: '30', noRubric: true },
      view: { sortKey: 'submitted', sortDir: 'asc', group: 'semester' },
    };
    expect(parseListState(serializeListState(state))).toEqual(state);
  });

  it('never writes a sessionId (the list is what the session screen comes back to)', () => {
    const qs = serializeListState({ filters: { ...EMPTY_LIST_FILTERS, q: 'a' }, view: DEFAULT_VIEW }).toString();
    expect(qs).not.toContain('sessionId');
  });
});
```

```ts
// apps/web/src/lib/session-list-memory.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { recalledListHref, rememberListQuery } from './session-list-memory';

beforeEach(() => sessionStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('remembered list', () => {
  it('nothing remembered → the bare list', () => expect(recalledListHref()).toBe('/teacher/grading'));

  it('a remembered query is put back on the link', () => {
    rememberListQuery('status=attention&cls=c1');
    expect(recalledListHref()).toBe('/teacher/grading?status=attention&cls=c1');
  });

  it('an empty query forgets', () => {
    rememberListQuery('q=a');
    rememberListQuery('');
    expect(recalledListHref()).toBe('/teacher/grading');
  });

  it('storage that throws (private window, blocked site data) is ignored, both ways', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => rememberListQuery('q=a')).not.toThrow();
    expect(recalledListHref()).toBe('/teacher/grading');
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `cd apps/web && npx vitest run src/lib/session-list-url.test.ts src/lib/session-list-memory.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

```ts
// apps/web/src/lib/session-list-url.ts
import {
  DEFAULT_SORT_DIR,
  DEFAULT_VIEW,
  EMPTY_LIST_FILTERS,
  LIST_STATUS_ORDER,
  type ListFilters,
  type ListStatus,
  type ListView,
  type SortKey,
} from './session-list';

/**
 * Trạng thái danh sách ↔ query string. Giá trị lạ bị BỎ (không ném): URL do giảng viên dán, gõ tay hay
 * một bản deploy cũ tạo ra, và trang chấm điểm không được trắng vì một tham số hỏng.
 */
export interface ListState {
  filters: ListFilters;
  view: ListView;
}

const SORT_KEYS: SortKey[] = ['priority', 'date', 'name', 'submitted'];
const GROUPS: ListView['group'][] = ['none', 'class', 'semester'];
const MAX_Q = 100;

const many = (params: URLSearchParams, name: string): string[] => [...new Set(params.getAll(name).filter(Boolean))];

export function parseListState(params: URLSearchParams): ListState {
  const status = params.get('status');
  const time = params.get('time');
  const [rawKey = '', rawDir = ''] = (params.get('sort') ?? '').split(':');
  const key = SORT_KEYS.includes(rawKey as SortKey) ? (rawKey as SortKey) : null;
  const group = params.get('group');
  return {
    filters: {
      q: (params.get('q') ?? '').slice(0, MAX_Q),
      status: LIST_STATUS_ORDER.includes(status as ListStatus) ? (status as ListStatus) : 'all',
      semesters: many(params, 'sem'),
      classIds: many(params, 'cls'),
      examTypes: many(params, 'type'),
      rooms: many(params, 'room'),
      time: time === '7' || time === '30' ? time : 'all',
      noRubric: params.get('norubric') === '1',
    },
    view: {
      sortKey: key ?? DEFAULT_VIEW.sortKey,
      sortDir: key === null ? DEFAULT_VIEW.sortDir : rawDir === 'asc' || rawDir === 'desc' ? rawDir : DEFAULT_SORT_DIR[key],
      group: GROUPS.includes(group as ListView['group']) ? (group as ListView['group']) : DEFAULT_VIEW.group,
    },
  };
}

/** Chỉ ghi cái khác mặc định — URL mặc định là URL trần. KHÔNG bao giờ ghi `sessionId`. */
export function serializeListState({ filters, view }: ListState): URLSearchParams {
  const p = new URLSearchParams();
  if (filters.q.trim()) p.set('q', filters.q.slice(0, MAX_Q));
  if (filters.status !== EMPTY_LIST_FILTERS.status) p.set('status', filters.status);
  filters.semesters.forEach((v) => p.append('sem', v));
  filters.classIds.forEach((v) => p.append('cls', v));
  filters.examTypes.forEach((v) => p.append('type', v));
  filters.rooms.forEach((v) => p.append('room', v));
  if (filters.time !== 'all') p.set('time', filters.time);
  if (filters.noRubric) p.set('norubric', '1');
  if (view.sortKey !== DEFAULT_VIEW.sortKey || view.sortDir !== DEFAULT_VIEW.sortDir) p.set('sort', `${view.sortKey}:${view.sortDir}`);
  if (view.group !== DEFAULT_VIEW.group) p.set('group', view.group);
  return p;
}
```

```ts
// apps/web/src/lib/session-list-memory.ts
const KEY = 'grading.list.query';

/**
 * Nhớ bộ lọc cuối cùng của danh sách trong TAB này (sessionStorage), để nút "Đổi phiên" ở trang một phiên
 * quay về đúng danh sách đã lọc. Không dùng localStorage: bộ lọc của hôm qua không nên chờ ở đầu buổi chấm
 * hôm nay. Mọi truy cập bọc try/catch — cửa sổ ẩn danh hoặc chặn dữ liệu trang làm cả accessor ném lỗi.
 */
export function rememberListQuery(query: string): void {
  try {
    if (query) sessionStorage.setItem(KEY, query);
    else sessionStorage.removeItem(KEY);
  } catch {
    /* không nhớ được thì "Đổi phiên" về danh sách trần — chấp nhận được */
  }
}

export function recalledListHref(base = '/teacher/grading'): string {
  try {
    const query = sessionStorage.getItem(KEY);
    return query ? `${base}?${query}` : base;
  } catch {
    return base;
  }
}
```

- [ ] **Step 4: Run, typecheck, commit**

```bash
cd apps/web && npx vitest run src/lib/session-list-url.test.ts src/lib/session-list-memory.test.ts && npx tsc --noEmit
cd ../.. && git add apps/web/src/lib && git commit -m "feat(grading): session list URL state and remembered filters" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

Expected: PASS (all tests in both files).

---

## Task 6: Table, progress bar, status pill

**Files:**
- Create: `apps/web/src/app/teacher/grading/_components/session-list/StatusPill.tsx`, `SessionProgress.tsx`, `SessionTable.tsx`, `SessionTable.test.tsx`

**Interfaces:**
- Consumes: Task 4 exports.
- Produces: `StatusPill({ status })`, `SessionProgress({ row })`, and

```ts
export interface SessionTableProps {
  groups: RowGroup[];
  view: ListView;
  onSort: (key: SortKey) => void;
  selected: ReadonlySet<string>;
  onToggleRows: (ids: string[], on: boolean) => void;
  collapsed: ReadonlySet<string>;
  onToggleGroup: (key: string) => void;
  onStart: (row: SessionRow) => void;
  density: 'cozy' | 'compact';
  now: number;
}
export function SessionTable(props: SessionTableProps): JSX.Element
```

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/src/app/teacher/grading/_components/session-list/SessionTable.test.tsx
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { DEFAULT_VIEW, groupRows } from '@/lib/session-list';
import { NOW, rowsOf, session, summary } from '@/lib/session-list.fixtures';
import { SessionTable, type SessionTableProps } from './SessionTable';

const rows = rowsOf(
  [
    session({ id: 'a', name: 'Kiểm tra giữa kỳ', className: 'DHKTPM18ATT', roomName: 'Phòng máy A1' }),
    session({ id: 'b', name: 'TEST dien tap - xoa sau 1790588688826', rubricId: null, className: 'DHKTPM19BTT', roomName: 'H3.03', classId: 'c2' }),
    session({ id: 'c', name: 'Kiểm tra cuối kỳ', examType: 'CK' }),
  ],
  [summary('a', { flagged_for_review: 11, ai_grading: 4, auto_approved: 23 }), summary('b'), summary('c', { finalized: 38 })],
);

function props(over: Partial<SessionTableProps> = {}): SessionTableProps {
  return {
    groups: groupRows(rows, 'none'),
    view: DEFAULT_VIEW,
    onSort: vi.fn(),
    selected: new Set(),
    onToggleRows: vi.fn(),
    collapsed: new Set(),
    onToggleGroup: vi.fn(),
    onStart: vi.fn(),
    density: 'cozy',
    now: NOW,
    ...over,
  };
}

// Tên chính xác, không regex: liên kết hành động ở cuối hàng có aria-label lặp lại tên phiên nên regex khớp cả hai.
const rowOf = (name: string) => screen.getByRole('link', { name }).closest('tr') as HTMLElement;

describe('SessionTable', () => {
  it('shows name, class · room, date, submitted count, status and a caption per row', () => {
    render(<SessionTable {...props()} />);
    const row = rowOf('Kiểm tra giữa kỳ');
    expect(within(row).getByText(/DHKTPM18ATT/)).toBeInTheDocument();
    expect(within(row).getByText(/Phòng máy A1/)).toBeInTheDocument();
    expect(within(row).getByText('28/09/2026')).toBeInTheDocument();
    expect(within(row).getByText('07:30')).toBeInTheDocument();
    expect(within(row).getByText('38')).toBeInTheDocument();
    expect(within(row).getByText('Cần bạn xem')).toBeInTheDocument();
    expect(within(row).getByText('11 cần xem · 4 đang chấm')).toBeInTheDocument();
  });

  it('never writes "Phòng Phòng": the room name is shown as typed', () => {
    render(<SessionTable {...props()} />);
    expect(screen.queryByText(/Phòng Phòng/)).not.toBeInTheDocument();
  });

  it('the name is a link that keeps the session in the URL', () => {
    render(<SessionTable {...props()} />);
    expect(screen.getByRole('link', { name: 'Kiểm tra giữa kỳ' })).toHaveAttribute('href', '/teacher/grading?sessionId=a');
  });

  it('a long name keeps its distinguishing tail in the DOM (title carries the full text)', () => {
    render(<SessionTable {...props()} />);
    expect(screen.getByRole('link', { name: 'TEST dien tap - xoa sau 1790588688826' })).toHaveAttribute('title', 'TEST dien tap - xoa sau 1790588688826');
  });

  it('each row has the action its status calls for', () => {
    render(<SessionTable {...props()} />);
    expect(within(rowOf('Kiểm tra giữa kỳ')).getByRole('link', { name: /Xem xét/ })).toHaveAttribute('href', '/teacher/grading?sessionId=a&state=needsYou');
    expect(within(rowOf('TEST dien tap - xoa sau 1790588688826')).getByRole('link', { name: /Chuẩn bị/ })).toBeInTheDocument();
    expect(within(rowOf('Kiểm tra cuối kỳ')).getByRole('link', { name: /Mở kết quả/ })).toBeInTheDocument();
  });

  it('a todo session with no blocker gets a button that opens the confirm dialog, not a link', () => {
    const ready = rowsOf([session({ id: 'r', name: 'Sẵn sàng' })], [summary('r')]);
    const p = props({ groups: groupRows(ready, 'none') });
    render(<SessionTable {...p} />);
    fireEvent.click(screen.getByRole('button', { name: /Bắt đầu chấm/ }));
    expect(p.onStart).toHaveBeenCalledWith(ready[0]);
  });

  it('says why a todo session cannot start', () => {
    render(<SessionTable {...props()} />);
    expect(within(rowOf('TEST dien tap - xoa sau 1790588688826')).getByText('Thiếu rubric')).toBeInTheDocument();
  });

  it('the progress bar is readable without colour: it carries the full numbers', () => {
    render(<SessionTable {...props()} />);
    expect(screen.getByRole('img', { name: /11 cần xem, 4 đang chấm, 23 chờ chốt/ })).toBeInTheDocument();
  });

  it('a row checkbox toggles exactly that row', () => {
    const p = props();
    render(<SessionTable {...p} />);
    fireEvent.click(within(rowOf('Kiểm tra giữa kỳ')).getByRole('checkbox'));
    expect(p.onToggleRows).toHaveBeenCalledWith(['a'], true);
  });

  it('the header checkbox selects every visible row, and is indeterminate when some are', () => {
    const p = props({ selected: new Set(['a']) });
    render(<SessionTable {...p} />);
    const head = screen.getByRole('checkbox', { name: /Chọn tất cả/ }) as HTMLInputElement;
    expect(head.indeterminate).toBe(true);
    fireEvent.click(head);
    expect(p.onToggleRows).toHaveBeenCalledWith(['a', 'b', 'c'], true);
  });

  it('header sort buttons call onSort and mark the active column', () => {
    const p = props();
    render(<SessionTable {...p} />);
    fireEvent.click(screen.getByRole('button', { name: /Ngày thi/ }));
    expect(p.onSort).toHaveBeenCalledWith('date');
    expect(screen.getByRole('columnheader', { name: /Trạng thái/ })).toHaveAttribute('aria-sort', 'ascending');
    expect(screen.getByRole('columnheader', { name: /Ngày thi/ })).toHaveAttribute('aria-sort', 'none');
  });

  it('grouped: a header per group, collapsing hides its rows, the group checkbox selects the group', () => {
    const groups = groupRows(rows, 'class');
    const collapsed = new Set([groups[0].key!]);
    const p = props({ groups, collapsed });
    render(<SessionTable {...p} />);
    expect(screen.getByRole('button', { name: /DHKTPM18ATT/ })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('link', { name: 'Kiểm tra giữa kỳ' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: /Chọn cả nhóm DHKTPM18ATT/ }));
    expect(p.onToggleRows).toHaveBeenCalledWith(['a', 'c'], true);
  });

  it('while statuses are unknown the row still renders, with dashes and a plain open link', () => {
    const unknown = rowsOf([session({ id: 'u', name: 'Chưa rõ' })], undefined);
    render(<SessionTable {...props({ groups: groupRows(unknown, 'none') })} />);
    const row = rowOf('Chưa rõ');
    expect(within(row).getByRole('link', { name: /^Mở/ })).toBeInTheDocument();
    expect(within(row).getAllByText('—').length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `cd apps/web && npx vitest run src/app/teacher/grading/_components/session-list/SessionTable.test.tsx`
Expected: FAIL — cannot resolve `./SessionTable`.

- [ ] **Step 3: Implement the three components**

```tsx
// apps/web/src/app/teacher/grading/_components/session-list/StatusPill.tsx
import { CheckCircle2, CircleDashed, Lock, RefreshCw, TriangleAlert, type LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { LIST_STATUS_LABEL, type ListStatus } from '@/lib/session-list';

/** Biểu tượng và màu giống thanh tổng quan của trang kết quả (`OverviewBar`): một ngôn ngữ trạng thái. */
export const STATUS_PILL: Record<ListStatus, { variant: 'warning' | 'success' | 'default' | 'info' | 'primary'; Icon: LucideIcon }> = {
  attention: { variant: 'warning', Icon: TriangleAlert },
  ready: { variant: 'success', Icon: CheckCircle2 },
  todo: { variant: 'default', Icon: CircleDashed },
  running: { variant: 'info', Icon: RefreshCw },
  done: { variant: 'primary', Icon: Lock },
};

export function StatusPill({ status }: { status: ListStatus | null }) {
  if (status === null) return <span className="text-caption text-muted-foreground">—</span>;
  const { variant, Icon } = STATUS_PILL[status];
  return (
    <Badge variant={variant}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {LIST_STATUS_LABEL[status]}
    </Badge>
  );
}

```

```tsx
// apps/web/src/app/teacher/grading/_components/session-list/SessionProgress.tsx
import { progressCaption, progressLabel, type SessionRow } from '@/lib/session-list';
import { cn } from '@/lib/utils';

/**
 * Thanh tiến độ của một phiên. Màu chỉ để nhìn nhanh (spec UI §2.1 luật 1): cả thanh được đọc ra bằng ĐỦ
 * các con số (`aria-label`), và chú thích bên dưới nói bằng chữ. Đoạn nào 0 bài thì không vẽ.
 */
export function SessionProgress({ row }: { row: SessionRow }) {
  if (row.status === null) return <span className="text-caption text-muted-foreground">—</span>;
  const c = row.counts;
  const segments = [
    { key: 'attn', n: c.needsYou + c.audit + c.ungradable, className: 'bg-warning' },
    { key: 'run', n: c.grading, className: 'bg-info bg-stripes' },
    { key: 'ok', n: c.auto + c.reviewed, className: 'bg-success' },
    { key: 'fin', n: c.finalised, className: 'bg-primary/60' },
  ].filter((s) => s.n > 0);

  return (
    <div className="flex flex-col gap-1.5 group-data-[density=compact]:flex-row group-data-[density=compact]:items-center group-data-[density=compact]:gap-2">
      <div
        role="img"
        aria-label={progressLabel(row)}
        className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full bg-border group-data-[density=compact]:w-14 group-data-[density=compact]:shrink-0"
      >
        {segments.map((s) => (
          <span key={s.key} data-segment={s.key} className={cn('block min-w-1', s.className)} style={{ flexGrow: s.n, flexBasis: 0 }} />
        ))}
      </div>
      <span
        className={cn(
          'truncate text-caption tabular-nums',
          row.status === 'attention' ? 'font-semibold text-warning-strong' : 'text-muted-foreground',
        )}
      >
        {progressCaption(row)}
      </span>
    </div>
  );
}
```

```tsx
// apps/web/src/app/teacher/grading/_components/session-list/SessionTable.tsx
'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronRight, CheckCircle2, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EXAM_TYPE_LABELS } from '@/lib/exam-session-display';
import {
  formatSessionDate,
  rowActionOf,
  rowNote,
  sessionHref,
  submittedCount,
  type ListView,
  type RowGroup,
  type SessionRow,
  type SortKey,
} from '@/lib/session-list';
import { cn } from '@/lib/utils';
import { SessionProgress } from './SessionProgress';
import { StatusPill } from './StatusPill';

export interface SessionTableProps {
  groups: RowGroup[];
  view: ListView;
  onSort: (key: SortKey) => void;
  selected: ReadonlySet<string>;
  onToggleRows: (ids: string[], on: boolean) => void;
  collapsed: ReadonlySet<string>;
  onToggleGroup: (key: string) => void;
  onStart: (row: SessionRow) => void;
  density: 'cozy' | 'compact';
  now: number;
}

/** Ô chọn ba trạng thái: `indeterminate` chỉ đặt được qua thuộc tính DOM, không qua prop. */
function TriCheckbox({ checked, indeterminate, onChange, label }: { checked: boolean; indeterminate: boolean; onChange: (on: boolean) => void; label: string }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      aria-label={label}
      className="h-4 w-4 cursor-pointer accent-primary"
    />
  );
}

function SortHead({ label, sortKey, view, onSort, className }: { label: string; sortKey: SortKey; view: ListView; onSort: (k: SortKey) => void; className?: string }) {
  const active = view.sortKey === sortKey;
  const Icon = !active ? ArrowUpDown : view.sortDir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th
      scope="col"
      aria-sort={active ? (view.sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={cn('sticky top-0 z-10 h-10 bg-surface-2 px-3 text-left text-caption font-semibold text-muted-foreground', active && 'text-foreground', className)}
    >
      <button type="button" onClick={() => onSort(sortKey)} className="inline-flex items-center gap-1 hover:text-foreground">
        {label}
        <Icon className={cn('h-3 w-3', !active && 'opacity-50')} aria-hidden="true" />
      </button>
    </th>
  );
}

const PlainHead = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <th scope="col" className={cn('sticky top-0 z-10 h-10 bg-surface-2 px-3 text-left text-caption font-semibold text-muted-foreground', className)}>
    {children}
  </th>
);

function Row({ row, selected, onToggle, onStart, now }: { row: SessionRow; selected: boolean; onToggle: (on: boolean) => void; onStart: (r: SessionRow) => void; now: number }) {
  const s = row.session;
  const when = formatSessionDate(s.startTime);
  const note = rowNote(row, now);
  const action = rowActionOf(row);
  const typeLabel = EXAM_TYPE_LABELS[s.examType] ?? s.examType;
  const actionLabel = `${action.label}: ${s.name}${s.className ? `, ${s.className}` : ''}`;

  return (
    <tr data-selected={selected} className="border-b border-border last:border-0 hover:bg-surface-2 data-[selected=true]:bg-primary-subtle">
      <td className="px-0 py-2.5 text-center align-middle group-data-[density=compact]:py-1.5">
        <input
          type="checkbox"
          checked={selected}
          onChange={(e) => onToggle(e.target.checked)}
          aria-label={`Chọn phiên ${s.name}${s.className ? `, ${s.className}` : ''}`}
          className="h-4 w-4 cursor-pointer accent-primary"
        />
      </td>
      <td className="px-3 py-2.5 align-middle group-data-[density=compact]:py-1.5">
        <Link href={sessionHref(s.id)} title={s.name} className="line-clamp-2 text-body font-semibold text-foreground hover:underline group-data-[density=compact]:line-clamp-1">
          {s.name}
        </Link>
        <span className="block truncate text-caption text-muted-foreground">
          <span className="min-[1240px]:hidden">{typeLabel} · </span>
          {[s.className, s.roomName].filter(Boolean).join(' · ')}
        </span>
      </td>
      <td className="whitespace-nowrap px-3 py-2.5 align-middle tabular-nums group-data-[density=compact]:py-1.5">
        <span className="block">{when.date}</span>
        <span className="block text-caption text-muted-foreground">{when.time}</span>
      </td>
      <td className="hidden px-3 py-2.5 align-middle min-[1240px]:table-cell group-data-[density=compact]:py-1.5">
        <span className="inline-flex h-6 items-center rounded-md border border-border bg-surface-2 px-2 text-caption font-medium">{typeLabel}</span>
      </td>
      <td className="whitespace-nowrap px-3 py-2.5 align-middle tabular-nums group-data-[density=compact]:py-1.5">
        <span className="font-semibold">{submittedCount(s)}</span>
        <span className="text-muted-foreground">{s.rosterKnown && s.expectedCount > 0 ? `/${s.expectedCount}` : ''}</span>
      </td>
      <td className="px-3 py-2.5 align-middle group-data-[density=compact]:py-1.5">
        <StatusPill status={row.status} />
        {note && (
          <span
            className={cn(
              'mt-1 flex items-center gap-1 text-caption group-data-[density=compact]:hidden',
              note.tone === 'warn' ? 'font-medium text-warning-strong' : 'font-medium text-success-strong',
            )}
          >
            {note.tone === 'warn' ? <TriangleAlert className="h-3 w-3" aria-hidden="true" /> : <CheckCircle2 className="h-3 w-3" aria-hidden="true" />}
            {note.text}
          </span>
        )}
      </td>
      <td className="px-3 py-2.5 align-middle group-data-[density=compact]:py-1.5">
        <SessionProgress row={row} />
      </td>
      <td className="px-3 py-2.5 text-right align-middle group-data-[density=compact]:py-1.5">
        {action.kind === 'link' ? (
          <Button asChild size="sm" variant={action.tone === 'primary' ? 'default' : action.tone}>
            <Link href={action.href} aria-label={actionLabel}>{action.label}</Link>
          </Button>
        ) : (
          <Button type="button" size="sm" onClick={() => onStart(row)} aria-label={actionLabel}>
            {action.label}
          </Button>
        )}
      </td>
    </tr>
  );
}

/**
 * Bảng phiên. Cột "Loại" ẩn dưới 1240px (loại kỳ thi chuyển lên dòng phụ của tên); dưới 820px bảng cuộn
 * ngang trong khung của nó — đầu bảng dính chỉ hoạt động khi khung không cuộn.
 */
export function SessionTable({ groups, view, onSort, selected, onToggleRows, collapsed, onToggleGroup, onStart, density, now }: SessionTableProps) {
  const allRows = groups.flatMap((g) => g.rows);
  const allIds = allRows.map((r) => r.session.id);
  const pickedAll = allIds.length > 0 && allIds.every((id) => selected.has(id));
  const pickedSome = allIds.some((id) => selected.has(id));

  return (
    <div data-density={density} className="group overflow-clip rounded-lg border border-border bg-surface shadow-sm max-[819px]:overflow-x-auto">
      <table className="w-full table-fixed border-separate border-spacing-0 text-small max-[819px]:min-w-[780px]" aria-label="Danh sách phiên chấm">
        <colgroup>
          <col className="w-10" />
          <col />
          <col className="w-[104px]" />
          <col className="hidden w-[92px] min-[1240px]:table-column" />
          <col className="w-[76px]" />
          <col className="w-[152px]" />
          <col className="w-[184px]" />
          <col className="w-[140px]" />
        </colgroup>
        <thead>
          <tr>
            <PlainHead className="px-0 text-center">
              <TriCheckbox checked={pickedAll} indeterminate={!pickedAll && pickedSome} onChange={(on) => onToggleRows(allIds, on)} label="Chọn tất cả phiên đang hiện" />
            </PlainHead>
            <SortHead label="Phiên thi" sortKey="name" view={view} onSort={onSort} />
            <SortHead label="Ngày thi" sortKey="date" view={view} onSort={onSort} />
            <PlainHead className="hidden min-[1240px]:table-cell">Loại</PlainHead>
            <SortHead label="Bài nộp" sortKey="submitted" view={view} onSort={onSort} />
            <SortHead label="Trạng thái" sortKey="priority" view={view} onSort={onSort} />
            <PlainHead>Tiến độ chấm</PlainHead>
            <PlainHead><span className="sr-only">Thao tác</span></PlainHead>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => {
            const open = g.key === null || !collapsed.has(g.key);
            const ids = g.rows.map((r) => r.session.id);
            const inGroup = ids.filter((id) => selected.has(id)).length;
            const attention = g.rows.filter((r) => r.status === 'attention').length;
            const ready = g.rows.filter((r) => r.status === 'ready').length;
            return [
              g.key !== null && (
                <tr key={`group-${g.key}`} className="bg-surface-2">
                  <td className="border-b border-border px-0 text-center">
                    <TriCheckbox checked={inGroup === ids.length && ids.length > 0} indeterminate={inGroup > 0 && inGroup < ids.length} onChange={(on) => onToggleRows(ids, on)} label={`Chọn cả nhóm ${g.label}`} />
                  </td>
                  <td colSpan={7} className="border-b border-border p-0">
                    <button type="button" aria-expanded={open} onClick={() => onToggleGroup(g.key!)} className="flex h-10 w-full items-center gap-3 px-3 text-left text-small">
                      <ChevronRight className={cn('h-4 w-4 transition-transform', open && 'rotate-90')} aria-hidden="true" />
                      <span className="font-semibold">{g.label}</span>
                      <span className="text-caption text-muted-foreground">{ids.length} phiên</span>
                      {attention > 0 && <span className="rounded-full bg-warning-subtle px-2 py-0.5 text-caption font-semibold text-warning-strong">{attention} cần xem</span>}
                      {ready > 0 && <span className="rounded-full bg-success-subtle px-2 py-0.5 text-caption font-semibold text-success-strong">{ready} sẵn sàng chốt</span>}
                    </button>
                  </td>
                </tr>
              ),
              ...(open
                ? g.rows.map((r) => (
                    <Row key={r.session.id} row={r} selected={selected.has(r.session.id)} onToggle={(on) => onToggleRows([r.session.id], on)} onStart={onStart} now={now} />
                  ))
                : []),
            ];
          })}
        </tbody>
      </table>
    </div>
  );
}
```

Note: `STATUS_PILL` is exported from `StatusPill.tsx` so `StatusTabs` (Task 7) shows the same icons.

- [ ] **Step 4: Run to see it pass, fix what the real render disagrees with**

Run: `cd apps/web && npx vitest run src/app/teacher/grading/_components/session-list/SessionTable.test.tsx`
Expected: PASS. Likely friction: `getByText('38')` matching more than one node — if so, scope it with `within(row).getByText('38', { selector: 'span.font-semibold' })`; `Row` returns fragments inside `groups.map` — React needs keys on the array elements, already given.

- [ ] **Step 5: Typecheck, lint, commit**

```bash
cd apps/web && npx tsc --noEmit && npx eslint src/app/teacher/grading/_components/session-list
cd ../.. && git add apps/web/src/app/teacher/grading/_components/session-list && git commit -m "feat(grading): session table, status pill and progress bar" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Task 7: Status tabs and filter bar

**Files:**
- Create: `apps/web/src/app/teacher/grading/_components/session-list/StatusTabs.tsx`, `FilterBar.tsx`, `FilterBar.test.tsx`

**Interfaces:**
- Consumes: `STATUS_PILL` (Task 6), Task 4 exports.
- Produces:

```ts
export function StatusTabs(props: { counts: Record<ListStatus | 'all', number> | null; value: ListStatus | 'all'; onChange: (v: ListStatus | 'all') => void }): JSX.Element | null
export interface FilterBarProps {
  filters: ListFilters;
  options: Record<FacetKey, FacetOption[]>;
  noRubricCount: number;
  onChange: (next: ListFilters) => void;
  searchRef: React.RefObject<HTMLInputElement | null>;
}
export function FilterBar(props: FilterBarProps): JSX.Element
```

- [ ] **Step 1: Write the failing test**

```tsx
// apps/web/src/app/teacher/grading/_components/session-list/FilterBar.test.tsx
import { describe, expect, it, vi } from 'vitest';
import { createRef } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { EMPTY_LIST_FILTERS, facetOptions, type ListFilters } from '@/lib/session-list';
import { NOW, rowsOf, session } from '@/lib/session-list.fixtures';
import { FilterBar, type FilterBarProps } from './FilterBar';
import { StatusTabs } from './StatusTabs';

const rows = rowsOf(
  [
    session({ id: 'a', classId: 'c1', className: 'DHKTPM18ATT' }),
    session({ id: 'b', classId: 'c2', className: 'DHKTPM19BTT', rubricId: null }),
  ],
  [],
);

function setup(filters: ListFilters = EMPTY_LIST_FILTERS, over: Partial<FilterBarProps> = {}) {
  const onChange = vi.fn();
  render(
    <FilterBar
      filters={filters}
      options={facetOptions(rows, filters, NOW)}
      noRubricCount={1}
      onChange={onChange}
      searchRef={createRef<HTMLInputElement>()}
      {...over}
    />,
  );
  return onChange;
}

const openMenu = (name: RegExp) => fireEvent.keyDown(screen.getByRole('button', { name }), { key: 'Enter' });

describe('FilterBar', () => {
  it('typing in the search box reports the text', () => {
    const onChange = setup();
    fireEvent.change(screen.getByRole('searchbox', { name: /Tìm phiên/ }), { target: { value: 'giua ky' } });
    expect(onChange).toHaveBeenCalledWith({ ...EMPTY_LIST_FILTERS, q: 'giua ky' });
  });

  it('"Thiếu rubric" toggles and shows how many sessions it would leave', () => {
    const onChange = setup();
    const button = screen.getByRole('button', { name: /Thiếu rubric/ });
    expect(button).toHaveTextContent('1');
    fireEvent.click(button);
    expect(onChange).toHaveBeenCalledWith({ ...EMPTY_LIST_FILTERS, noRubric: true });
  });

  it('a facet menu lists the values with counts; choosing one adds it to the filter', () => {
    const onChange = setup();
    openMenu(/^Lớp/);
    const item = screen.getByRole('menuitemcheckbox', { name: /DHKTPM19BTT/ });
    expect(item).toHaveTextContent('1');
    fireEvent.click(item);
    expect(onChange).toHaveBeenCalledWith({ ...EMPTY_LIST_FILTERS, classIds: ['c2'] });
  });

  it('choosing a value that is already chosen removes it', () => {
    const onChange = setup({ ...EMPTY_LIST_FILTERS, classIds: ['c1', 'c2'] });
    openMenu(/^Lớp/);
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: /DHKTPM18ATT/ }));
    expect(onChange).toHaveBeenCalledWith({ ...EMPTY_LIST_FILTERS, classIds: ['c2'] });
  });

  it('the facet button names what is chosen', () => {
    setup({ ...EMPTY_LIST_FILTERS, classIds: ['c2'] });
    expect(screen.getByRole('button', { name: /^Lớp/ })).toHaveTextContent('DHKTPM19BTT');
  });

  it('"Xoá bộ lọc" appears only when something is filtered', () => {
    setup();
    expect(screen.queryByRole('button', { name: /Xoá bộ lọc/ })).not.toBeInTheDocument();
  });

  it('clearing resets every filter, status included', () => {
    const onChange = setup({ ...EMPTY_LIST_FILTERS, q: 'x', status: 'done', rooms: ['A1'] });
    fireEvent.click(screen.getByRole('button', { name: /Xoá bộ lọc/ }));
    expect(onChange).toHaveBeenCalledWith(EMPTY_LIST_FILTERS);
  });
});

describe('StatusTabs', () => {
  const counts = { all: 20, attention: 4, ready: 3, todo: 3, running: 1, done: 9 };

  it('shows every status with its count and marks the chosen one', () => {
    render(<StatusTabs counts={counts} value="attention" onChange={() => {}} />);
    expect(screen.getByRole('button', { name: /Tất cả/ })).toHaveTextContent('20');
    const attention = screen.getByRole('button', { name: /Cần bạn xem/ });
    expect(attention).toHaveTextContent('4');
    expect(attention).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /Đã chốt/ })).toHaveAttribute('aria-pressed', 'false');
  });

  it('choosing a tab reports it', () => {
    const onChange = vi.fn();
    render(<StatusTabs counts={counts} value="all" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /Sẵn sàng chốt/ }));
    expect(onChange).toHaveBeenCalledWith('ready');
  });

  it('renders nothing while the statuses are unknown — no tab is better than a wrong count', () => {
    const { container } = render(<StatusTabs counts={null} value="all" onChange={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `cd apps/web && npx vitest run src/app/teacher/grading/_components/session-list/FilterBar.test.tsx`
Expected: FAIL — cannot resolve `./FilterBar`.

- [ ] **Step 3: Implement**

```tsx
// apps/web/src/app/teacher/grading/_components/session-list/StatusTabs.tsx
'use client';

import { LIST_STATUS_LABEL, LIST_STATUS_ORDER, type ListStatus } from '@/lib/session-list';
import { cn } from '@/lib/utils';
import { STATUS_PILL } from './StatusPill';

const TABS: Array<ListStatus | 'all'> = ['all', ...LIST_STATUS_ORDER];

/**
 * Tab trạng thái = bộ lọc chính. Số đếm theo các bộ lọc KHÁC đang bật. Không có số đếm thì không vẽ gì:
 * một tab "Cần bạn xem 0" khi thật ra chưa biết là lời nói dối.
 */
export function StatusTabs({
  counts,
  value,
  onChange,
}: {
  counts: Record<ListStatus | 'all', number> | null;
  value: ListStatus | 'all';
  onChange: (v: ListStatus | 'all') => void;
}) {
  if (counts === null) return null;
  return (
    <div role="group" aria-label="Lọc theo trạng thái chấm" className="flex gap-0.5 overflow-x-auto border-b border-border">
      {TABS.map((tab) => {
        const Icon = tab === 'all' ? null : STATUS_PILL[tab].Icon;
        const label = tab === 'all' ? 'Tất cả' : LIST_STATUS_LABEL[tab];
        return (
          <button
            key={tab}
            type="button"
            aria-pressed={value === tab}
            onClick={() => onChange(tab)}
            className={cn(
              '-mb-px inline-flex h-10 items-center gap-2 whitespace-nowrap border-b-2 border-transparent px-3 text-small font-semibold text-muted-foreground hover:text-foreground',
              value === tab && 'border-primary text-foreground',
            )}
          >
            {Icon && <Icon className="h-4 w-4" aria-hidden="true" />}
            {label}
            <span
              className={cn(
                'grid h-5 min-w-6 place-items-center rounded-full px-1.5 text-caption tabular-nums',
                tab === 'attention' && counts[tab] > 0 ? 'bg-warning-subtle text-warning-strong' : 'bg-surface-2 text-foreground',
              )}
            >
              {counts[tab]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
```

```tsx
// apps/web/src/app/teacher/grading/_components/session-list/FilterBar.tsx
'use client';

import type { RefObject } from 'react';
import { ChevronDown, Search, TriangleAlert, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { EMPTY_LIST_FILTERS, hasActiveFilters, type FacetKey, type FacetOption, type ListFilters } from '@/lib/session-list';
import { cn } from '@/lib/utils';

const FACET_LABEL: Record<FacetKey, string> = { semesters: 'Học kỳ', classIds: 'Lớp', examTypes: 'Loại kỳ thi', rooms: 'Phòng' };
const TIME_LABEL: Record<ListFilters['time'], string> = { all: 'Tất cả', '7': '7 ngày qua', '30': '30 ngày qua' };

export interface FilterBarProps {
  filters: ListFilters;
  options: Record<FacetKey, FacetOption[]>;
  /** Số phiên thiếu rubric theo các bộ lọc khác. */
  noRubricCount: number;
  onChange: (next: ListFilters) => void;
  searchRef: RefObject<HTMLInputElement | null>;
}

function chipClass(active: boolean) {
  return cn('gap-1.5', active && 'border-primary/40 bg-primary-subtle text-primary hover:bg-primary-subtle');
}

function FacetFilter({ facet, options, selected, onChange }: { facet: FacetKey; options: FacetOption[]; selected: string[]; onChange: (next: string[]) => void }) {
  const chosen = options.filter((o) => selected.includes(o.value));
  const summary = chosen.length === 0 ? '' : chosen.length === 1 ? chosen[0].label : `${chosen.length} đã chọn`;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm" className={chipClass(selected.length > 0)}>
          <span>{FACET_LABEL[facet]}{summary && ':'}</span>
          {summary && <span className="max-w-36 truncate font-semibold">{summary}</span>}
          <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 min-w-56 overflow-auto">
        {options.map((o) => (
          <DropdownMenuCheckboxItem
            key={o.value}
            checked={selected.includes(o.value)}
            // Giữ menu mở sau mỗi lần chọn: lọc thường là chọn nhiều giá trị liên tiếp.
            onSelect={(e) => e.preventDefault()}
            onCheckedChange={() => onChange(selected.includes(o.value) ? selected.filter((v) => v !== o.value) : [...selected, o.value])}
          >
            <span className="flex-1 truncate">{o.label}</span>
            <span className="ml-4 text-caption tabular-nums text-muted-foreground">{o.count}</span>
          </DropdownMenuCheckboxItem>
        ))}
        {selected.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onChange([])}>Bỏ chọn</DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Ô tìm + bộ lọc. Không có bộ lọc theo môn: `courseName` là hằng số ở mọi phiên (spec D5). Không có công
 * tắc lưu trữ (spec D4). Bộ lọc nhiều lựa chọn trong nhóm là OR, giữa các nhóm là AND.
 */
export function FilterBar({ filters, options, noRubricCount, onChange, searchRef }: FilterBarProps) {
  const set = (patch: Partial<ListFilters>) => onChange({ ...filters, ...patch });
  return (
    <div className="flex flex-col gap-3">
      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <input
          ref={searchRef}
          type="search"
          value={filters.q}
          onChange={(e) => set({ q: e.target.value })}
          placeholder="Tìm theo tên phiên, lớp, phòng…"
          aria-label="Tìm phiên"
          autoComplete="off"
          className="h-9 w-full rounded-md border border-input bg-surface pl-9 pr-10 text-small placeholder:text-muted-foreground"
        />
        <kbd aria-hidden="true" className="absolute right-2 top-2 grid h-5 min-w-5 place-items-center rounded border border-border bg-surface-2 px-1 text-caption font-semibold text-muted-foreground">
          /
        </kbd>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(['semesters', 'classIds', 'examTypes', 'rooms'] as FacetKey[]).map((facet) => (
          <FacetFilter key={facet} facet={facet} options={options[facet]} selected={filters[facet]} onChange={(next) => onChange({ ...filters, [facet]: next } as ListFilters)} />
        ))}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" size="sm" className={chipClass(filters.time !== 'all')}>
              <span>Thời gian{filters.time !== 'all' && ':'}</span>
              {filters.time !== 'all' && <span className="font-semibold">{TIME_LABEL[filters.time]}</span>}
              <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-44">
            <DropdownMenuRadioGroup value={filters.time} onValueChange={(v) => set({ time: v as ListFilters['time'] })}>
              {(Object.keys(TIME_LABEL) as ListFilters['time'][]).map((t) => (
                <DropdownMenuRadioItem key={t} value={t}>{TIME_LABEL[t]}</DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-pressed={filters.noRubric}
          onClick={() => set({ noRubric: !filters.noRubric })}
          className={cn('gap-1.5', filters.noRubric && 'border-warning-strong/50 bg-warning-subtle text-warning-strong hover:bg-warning-subtle')}
        >
          <TriangleAlert className="h-3.5 w-3.5" aria-hidden="true" />
          Thiếu rubric
          <span className="text-caption tabular-nums">{noRubricCount}</span>
        </Button>

        {hasActiveFilters(filters) && (
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange(EMPTY_LIST_FILTERS)}>
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            Xoá bộ lọc
          </Button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run to see it pass**

Run: `cd apps/web && npx vitest run src/app/teacher/grading/_components/session-list/FilterBar.test.tsx`
Expected: PASS. If a facet-menu test cannot open the menu under jsdom (Radix opens on `pointerdown`/keyboard), first try `fireEvent.pointerDown(button, { button: 0, ctrlKey: false })` instead of `keyDown`; the polyfills in `vitest.setup.ts` cover pointer capture. Do not weaken the assertions to make it pass.

- [ ] **Step 5: Typecheck, lint, commit**

```bash
cd apps/web && npx tsc --noEmit && npx eslint src/app/teacher/grading/_components/session-list
cd ../.. && git add apps/web/src/app/teacher/grading/_components/session-list && git commit -m "feat(grading): status tabs and filter bar" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Task 8: `SessionList` — URL state, selection, page wiring, "Đổi phiên"

**Files:**
- Create: `_components/session-list/useSessionListState.ts`, `_components/session-list/SessionList.tsx`, `_components/session-list/SessionList.test.tsx`, `_components/BackToListLink.tsx`
- Modify: `apps/web/src/app/teacher/grading/page.tsx`, `apps/web/src/app/teacher/grading/page.test.tsx`, `_components/SessionHeader.tsx`
- Delete: `_components/SessionPicker.tsx`

All paths below are under `apps/web/src/app/teacher/grading/`.

**Interfaces:**
- Consumes: Tasks 3–7, plus `BulkBar`/`BulkDialog`/`BulkRequest` from Task 9. **Order note:** build this task with the bulk pieces stubbed out (`selected` state + `<BulkBar />` omitted), commit, then Task 9 adds them and its own SessionList tests. Nothing in this task imports Task 9.
- Produces: `SessionList({ sessions, loading, error }: { sessions: SessionOverviewItem[]; loading: boolean; error: Error | null })`, `useSessionListState(): { state: ListState; setFilters(f: ListFilters): void; setView(v: ListView): void }`, `BackToListLink()`.

- [ ] **Step 1: Write the failing tests**

```tsx
// _components/session-list/SessionList.test.tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { session, summary } from '@/lib/session-list.fixtures';
import { SessionList } from './SessionList';

let search = '';
const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(search),
  useRouter: () => ({ replace }),
  usePathname: () => '/teacher/grading',
}));

const h = vi.hoisted(() => ({
  summaries: { data: undefined as unknown, isLoading: false, isError: false, error: null as Error | null },
}));
vi.mock('@/hooks/useGrading', () => ({ useGradingSessionSummaries: () => h.summaries }));

const sessions = [
  session({ id: 'a', name: 'Kiểm tra giữa kỳ', classId: 'c1', className: 'DHKTPM18ATT' }),
  session({ id: 'b', name: 'Thực hành đồ thị', classId: 'c2', className: 'DHKTPM19BTT', rubricId: null, examType: 'TK' }),
  session({ id: 'c', name: 'Kiểm tra cuối kỳ', classId: 'c1', className: 'DHKTPM18ATT', examType: 'CK' }),
  session({ id: 'none', name: 'Chưa thu bài', fullySubmittedCount: 0, partialCount: 0 }),
];

beforeEach(() => {
  search = '';
  replace.mockReset();
  sessionStorage.clear();
  h.summaries = {
    data: [summary('a', { flagged_for_review: 2, auto_approved: 5 }), summary('b'), summary('c', { finalized: 38 })],
    isLoading: false, isError: false, error: null,
  };
});

const renderList = (over: { loading?: boolean; error?: Error | null; sessions?: typeof sessions } = {}) =>
  render(<SessionList sessions={over.sessions ?? sessions} loading={over.loading ?? false} error={over.error ?? null} />);
// Chỉ liên kết TÊN phiên: liên kết hành động ở cuối hàng có aria-label bắt đầu bằng động từ ("Xem xét: …").
const names = () => screen.getAllByRole('link', { name: /^(Kiểm tra|Thực hành)/ });

describe('SessionList', () => {
  it('lists sessions that have collected work, most urgent first, and leaves out the rest', () => {
    renderList();
    expect(screen.queryByText('Chưa thu bài')).not.toBeInTheDocument();
    expect(names().map((l) => l.textContent)).toEqual(['Kiểm tra giữa kỳ', 'Thực hành đồ thị', 'Kiểm tra cuối kỳ']);
  });

  it('status tabs carry counts, and choosing one narrows the table and writes the URL', () => {
    renderList();
    expect(screen.getByRole('button', { name: /Cần bạn xem/ })).toHaveTextContent('1');
    fireEvent.click(screen.getByRole('button', { name: /Đã chốt/ }));
    expect(replace).toHaveBeenCalledWith('/teacher/grading?status=done', { scroll: false });
  });

  it('reads its state from the URL', () => {
    search = 'status=done';
    renderList();
    expect(names().map((l) => l.textContent)).toEqual(['Kiểm tra cuối kỳ']);
    expect(screen.getByRole('button', { name: /Đã chốt/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('a garbage URL still shows the list', () => {
    search = 'status=zzz&sort=x%3Ay&time=999&group=??';
    renderList();
    expect(names()).toHaveLength(3);
  });

  it('search is applied at once and reaches the URL after a pause', () => {
    vi.useFakeTimers();
    renderList();
    fireEvent.change(screen.getByRole('searchbox', { name: /Tìm phiên/ }), { target: { value: 'do thi' } });
    expect(names().map((l) => l.textContent)).toEqual(['Thực hành đồ thị']);
    expect(replace).not.toHaveBeenCalled();
    vi.advanceTimersByTime(400);
    expect(replace).toHaveBeenCalledWith('/teacher/grading?q=do+thi', { scroll: false });
    vi.useRealTimers();
  });

  it('remembers the query so "Đổi phiên" can come back to it', () => {
    renderList();
    fireEvent.click(screen.getByRole('button', { name: /Đã chốt/ }));
    expect(sessionStorage.getItem('grading.list.query')).toBe('status=done');
  });

  it('nothing to grade → says so; loading → no empty message; error → the alert', () => {
    const { unmount } = renderList({ sessions: [] });
    expect(screen.getByText(/Chưa có phiên thi nào thu được bài/)).toBeInTheDocument();
    unmount();
    const loading = renderList({ sessions: [], loading: true });
    expect(screen.queryByText(/Chưa có phiên thi nào thu được bài/)).not.toBeInTheDocument();
    loading.unmount();
    renderList({ sessions: [], error: new Error('Mất kết nối') });
    expect(screen.getByRole('alert')).toHaveTextContent('Mất kết nối');
  });

  it('filters that match nothing show a way out, not a blank table', () => {
    search = 'q=khong-co-phien-nay';
    renderList();
    expect(screen.getByText(/Không có phiên nào khớp/)).toBeInTheDocument();
    // Hai nút cùng tên: một trên thanh lọc, một ở trạng thái rỗng — cả hai xoá mọi bộ lọc.
    fireEvent.click(screen.getAllByRole('button', { name: /Xoá bộ lọc/ })[0]);
    expect(replace).toHaveBeenCalledWith('/teacher/grading', { scroll: false });
  });

  it('summary failed: table still works, no tabs and no statuses, and it says why', () => {
    h.summaries = { data: undefined, isLoading: false, isError: true, error: new Error('Hết giờ') };
    renderList();
    expect(names()).toHaveLength(3);
    expect(screen.queryByRole('button', { name: /Cần bạn xem/ })).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/trạng thái chấm/);
    expect(screen.getByRole('alert')).toHaveTextContent('Hết giờ');
  });

  it('summary still loading: no tabs yet, table already usable', () => {
    h.summaries = { data: undefined, isLoading: true, isError: false, error: null };
    renderList();
    expect(names()).toHaveLength(3);
    expect(screen.queryByRole('button', { name: /Tất cả/ })).not.toBeInTheDocument();
  });

  it('grouping by class shows a header per class', () => {
    search = 'group=class';
    renderList();
    expect(screen.getByRole('button', { name: /DHKTPM18ATT/ })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: /DHKTPM19BTT/ })).toBeInTheDocument();
  });

  it('"/" focuses the search box unless you are already typing somewhere', () => {
    renderList();
    fireEvent.keyDown(document.body, { key: '/' });
    expect(screen.getByRole('searchbox', { name: /Tìm phiên/ })).toHaveFocus();
  });

  it('remembers the density choice', () => {
    renderList();
    fireEvent.click(screen.getByRole('button', { name: 'Gọn' }));
    expect(localStorage.getItem('grading.list.density')).toBe('compact');
    expect(screen.getByRole('table').parentElement).toHaveAttribute('data-density', 'compact');
  });

  it('selection: only rows that are still visible count (narrowing a filter drops the hidden ones)', () => {
    // `useSearchParams` được mock cố định, nên cho `replace` cập nhật nó rồi render lại — như Next làm.
    replace.mockImplementation((url: string) => {
      search = url.split('?')[1] ?? '';
    });
    const view = renderList();
    const boxes = screen.getAllByRole('checkbox', { name: /^Chọn phiên/ });
    fireEvent.click(boxes[0]);
    fireEvent.click(boxes[1]);
    expect(screen.getByText(/Đã chọn 2 phiên/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Đã chốt/ })); // status=done → chỉ còn phiên "c"
    view.rerender(<SessionList sessions={sessions} loading={false} error={null} />);
    expect(screen.queryByText(/Đã chọn/)).not.toBeInTheDocument();
  });
});
```

Update `page.test.tsx` — the shared mock block and the picker describe:

1. Extend the `next/navigation` mock: `vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(search), useRouter: () => ({ replace: vi.fn() }), usePathname: () => '/teacher/grading' }));`
2. Add `summaries: { data: undefined as unknown, isLoading: false, isError: false, error: null as Error | null },` to `h`, and add `useGradingSessionSummaries: () => h.summaries,` to the `@/hooks/useGrading` mock; in the top-level `beforeEach` add `h.summaries = { data: [], isLoading: false, isError: false, error: null };`.
3. Give the `session()` factory the fields the list reads: `examType: 'GK', startTime: '2026-09-28T00:30:00.000Z', semesterName: 'HK1', code: 'GK-N01'` (leave the rest).
4. Replace the six tests in `describe('/teacher/grading — without a session: the picker')` with:

```tsx
  it('lists the sessions that have collected work, each name a link that keeps the session in the URL', () => {
    render(<GradingPage />);
    expect(screen.getByRole('link', { name: 'Giữa kỳ N01' })).toHaveAttribute('href', '/teacher/grading?sessionId=a');
    expect(screen.getByRole('link', { name: 'Cuối kỳ N02' })).toHaveAttribute('href', '/teacher/grading?sessionId=b');
    expect(screen.queryByText('Phiên chưa thu bài')).not.toBeInTheDocument();
  });

  it('a session with no rubric is still listed, and the row says what is missing', () => {
    h.summaries = { data: [{ examSessionId: 'a', byStatus: {}, ungradable: 0, hasQuestion: true }, { examSessionId: 'b', byStatus: {}, ungradable: 0, hasQuestion: true }], isLoading: false, isError: false, error: null };
    render(<GradingPage />);
    expect(within(screen.getByRole('link', { name: 'Cuối kỳ N02' }).closest('tr') as HTMLElement).getByText('Thiếu rubric')).toBeInTheDocument();
    expect(within(screen.getByRole('link', { name: 'Giữa kỳ N01' }).closest('tr') as HTMLElement).queryByText('Thiếu rubric')).not.toBeInTheDocument();
  });

  it('shows how many results were collected out of how many are expected', () => {
    render(<GradingPage />);
    const row = screen.getByRole('link', { name: 'Giữa kỳ N01' }).closest('tr') as HTMLElement;
    expect(within(row).getByText('32')).toBeInTheDocument();
    expect(within(row).getByText('/40')).toBeInTheDocument();
  });

  it('says so, and why, when there is nothing to grade yet', () => {
    h.overview = { data: [], isLoading: false, isError: false, error: null };
    render(<GradingPage />);
    expect(screen.getByText(/Chưa có phiên thi nào thu được bài/)).toBeInTheDocument();
  });

  it('shows a loading state, not the empty message', () => {
    h.overview = { data: [], isLoading: true, isError: false, error: null };
    render(<GradingPage />);
    expect(screen.queryByText(/Chưa có phiên thi nào thu được bài/)).not.toBeInTheDocument();
  });

  it('shows the load error', () => {
    h.overview = { data: [], isLoading: false, isError: true, error: new Error('Mất kết nối') };
    render(<GradingPage />);
    expect(screen.getByRole('alert')).toHaveTextContent('Mất kết nối');
  });
```

And add to the `session header` describe:

```tsx
  it('"Đổi phiên" goes back to the list the teacher had filtered', () => {
    sessionStorage.setItem('grading.list.query', 'status=attention&cls=c1');
    render(<GradingPage />);
    expect(screen.getByRole('link', { name: 'Đổi phiên' })).toHaveAttribute('href', '/teacher/grading?status=attention&cls=c1');
    sessionStorage.clear();
  });

  it('never shows "Phòng Phòng" for a room whose name already says Phòng', () => {
    h.overview = { data: [session({ roomName: 'Phòng máy B1' })], isLoading: false, isError: false, error: null };
    render(<GradingPage />);
    expect(screen.queryByText(/Phòng Phòng/)).not.toBeInTheDocument();
    expect(screen.getByText(/Phòng máy B1/)).toBeInTheDocument();
  });
```

(The existing `'"Đổi phiên" goes back to the picker'` test keeps passing: nothing is remembered, so the link is the bare `/teacher/grading`.)

- [ ] **Step 2: Run to see them fail**

Run: `cd apps/web && npx vitest run src/app/teacher/grading/_components/session-list/SessionList.test.tsx src/app/teacher/grading/page.test.tsx`
Expected: FAIL — `./SessionList` missing; `page.test` picker tests fail (old cards).

- [ ] **Step 3: Implement**

```ts
// _components/session-list/useSessionListState.ts
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { ListFilters, ListView } from '@/lib/session-list';
import { parseListState, serializeListState, type ListState } from '@/lib/session-list-url';
import { rememberListQuery } from '@/lib/session-list-memory';

const SEARCH_DEBOUNCE_MS = 250;

/**
 * Trạng thái danh sách nằm trên URL (dán được) và được nhớ trong tab cho "Đổi phiên".
 *
 * Riêng ô tìm giữ bản nháp cục bộ: mỗi phím một `router.replace` làm con trỏ giật; danh sách lọc theo bản
 * nháp NGAY, còn URL đuổi theo sau một nhịp ngắn. Dùng `replace`, không `push`, nên Back rời hẳn trang thay
 * vì lùi qua từng phím.
 */
export function useSessionListState() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const state = useMemo(() => parseListState(new URLSearchParams(params.toString())), [params]);

  const [q, setQ] = useState(state.filters.q);
  // Đang gõ = bản nháp đi trước URL. `router.replace` cập nhật `useSearchParams` bất đồng bộ; một URL cũ đến
  // muộn không được ghi đè chữ vừa gõ thêm.
  const typing = useRef(false);

  // URL → ô tìm, khi URL đổi từ bên ngoài (bấm "Chấm điểm" ở thanh bên lúc đang ở danh sách, chẳng hạn).
  useEffect(() => {
    if (!typing.current) setQ(state.filters.q);
  }, [state.filters.q]);

  const commit = useCallback(
    (next: ListState) => {
      typing.current = false;
      const query = serializeListState(next).toString();
      rememberListQuery(query);
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [router, pathname],
  );

  // Ô tìm → URL, sau một nhịp.
  useEffect(() => {
    if (q === state.filters.q) return;
    const timer = setTimeout(() => commit({ ...state, filters: { ...state.filters, q } }), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [q, state, commit]);

  const filters: ListFilters = useMemo(() => ({ ...state.filters, q }), [state.filters, q]);

  const setFilters = useCallback(
    (next: ListFilters) => {
      // Tiếng gõ = chỉ `q` đổi và không rỗng: bản nháp + debounce lo phần URL. Mọi thay đổi khác (một bộ lọc,
      // một tab, "Xoá bộ lọc" — gửi `q: ''`) ghi URL ngay, kèm `q` hiện có của bản nháp.
      const typed = next.q !== q && next.q !== '';
      setQ(next.q);
      if (typed) {
        typing.current = true;
        return;
      }
      commit({ ...state, filters: next });
    },
    [commit, state, q],
  );
  const setView = useCallback((view: ListView) => commit({ ...state, view }), [commit, state]);

  return { filters, view: state.view, setFilters, setView };
}
```

The "search reaches the URL after a pause", "reads its state from the URL" and "Xoá bộ lọc" tests pin exactly this.

```tsx
// _components/BackToListLink.tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { recalledListHref } from '@/lib/session-list-memory';

/**
 * "Đổi phiên" quay về danh sách ĐÃ LỌC mà giảng viên vừa rời. Đọc sessionStorage sau khi mount (server không
 * có nó, và đọc lúc render sẽ làm HTML server lệch HTML client); trước đó là danh sách trần.
 */
export function BackToListLink() {
  const [href, setHref] = useState('/teacher/grading');
  useEffect(() => setHref(recalledListHref()), []);
  return (
    <Button asChild variant="outline">
      <Link href={href}>Đổi phiên</Link>
    </Button>
  );
}
```

`SessionHeader.tsx`: replace the `Đổi phiên` button block with `<BackToListLink />` (add the import; keep the `Link` and `Button` imports — "Chốt điểm phiên" still uses both), and change the room line from `` `Phòng ${session.roomName}` `` to `session.roomName`:

```tsx
          {[session.className, session.roomName].filter(Boolean).join(' · ')}
```

```tsx
// _components/session-list/SessionList.tsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/layout/page-header';
import { useGradingSessionSummaries } from '@/hooks/useGrading';
import type { SessionOverviewItem } from '@/lib/api/submissions';
import {
  DEFAULT_SORT_DIR,
  EMPTY_LIST_FILTERS,
  buildRows,
  facetOptions,
  groupRows,
  matchesFilters,
  sortRows,
  statusCounts,
  type SortKey,
} from '@/lib/session-list';
import { FilterBar } from './FilterBar';
import { SessionTable } from './SessionTable';
import { StatusTabs } from './StatusTabs';
import { useSessionListState } from './useSessionListState';

const DENSITY_KEY = 'grading.list.density';
type Density = 'cozy' | 'compact';

function useDensity(): [Density, (d: Density) => void] {
  const [density, setDensity] = useState<Density>('cozy');
  useEffect(() => {
    try {
      if (localStorage.getItem(DENSITY_KEY) === 'compact') setDensity('compact');
    } catch {
      /* không đọc được thì để Rộng */
    }
  }, []);
  return [
    density,
    (d) => {
      setDensity(d);
      try {
        localStorage.setItem(DENSITY_KEY, d);
      } catch {
        /* không nhớ được thì thôi */
      }
    },
  ];
}

const SORT_PRESETS: Array<[string, string]> = [
  ['priority:asc', 'Cần xử lý trước'],
  ['date:desc', 'Ngày thi mới nhất'],
  ['date:asc', 'Ngày thi cũ nhất'],
  ['name:asc', 'Tên A đến Z'],
  ['submitted:desc', 'Nhiều bài nộp nhất'],
];

/**
 * Chọn phiên để chấm: bảng có trạng thái chấm, tìm, lọc, sắp xếp, nhóm (spec 2026-09-29-grading-session-list).
 * Mỗi phiên vẫn là một liên kết giữ `sessionId` trên URL — trang một-route-ba-trạng-thái chọn màn theo dữ liệu.
 */
export function SessionList({ sessions, loading, error }: { sessions: SessionOverviewItem[]; loading: boolean; error: Error | null }) {
  const summaries = useGradingSessionSummaries();
  const { filters, view, setFilters, setView } = useSessionListState();
  const [density, setDensity] = useDensity();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const searchRef = useRef<HTMLInputElement>(null);
  // Một mốc thời gian, làm mới khi dữ liệu đổi — bộ lọc thời gian không nên chớp mỗi lần gõ.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => setNow(Date.now()), [sessions]);

  const rows = useMemo(() => buildRows(sessions, summaries.data), [sessions, summaries.data]);
  const visible = useMemo(() => sortRows(rows.filter((r) => matchesFilters(r, filters, now)), view), [rows, filters, view, now]);
  const groups = useMemo(() => groupRows(visible, view.group), [visible, view.group]);
  const options = useMemo(() => facetOptions(rows, filters, now), [rows, filters, now]);
  const counts = useMemo(() => (summaries.data ? statusCounts(rows, filters, now) : null), [rows, filters, now, summaries.data]);
  const noRubricCount = useMemo(() => rows.filter((r) => r.session.rubricId === null && matchesFilters(r, { ...filters, noRubric: false }, now)).length, [rows, filters, now]);

  // Vùng chọn chỉ giữ phiên ĐANG HIỆN: thao tác hàng loạt lên phiên đã bị bộ lọc giấu là thao tác lên thứ giảng viên không thấy.
  useEffect(() => {
    setSelected((prev) => {
      const shown = new Set(visible.map((r) => r.session.id));
      const next = new Set([...prev].filter((id) => shown.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [visible]);

  // "/" nhảy vào ô tìm, như các trang danh sách khác — trừ khi đang gõ ở đâu đó.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName ?? '').toUpperCase();
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const toggleRows = (ids: string[], on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => (on ? next.add(id) : next.delete(id)));
      return next;
    });
  const toggleGroup = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const sortBy = (key: SortKey) =>
    setView({ ...view, sortKey: key, sortDir: view.sortKey === key ? (view.sortDir === 'asc' ? 'desc' : 'asc') : DEFAULT_SORT_DIR[key] });

  const presetValue = `${view.sortKey}:${view.sortDir}`;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Chấm điểm" description="Chọn một phiên thi để chuẩn bị, chấm và chốt điểm. Hệ thống chỉ làm việc với bài đã thu." />

      {error && (
        <Alert variant="destructive">
          <AlertDescription>Không tải được danh sách phiên thi — {error.message}.</AlertDescription>
        </Alert>
      )}
      {summaries.isError && (
        <Alert variant="destructive">
          <AlertDescription>
            Không tải được trạng thái chấm của các phiên — {summaries.error?.message}. Bảng vẫn tìm, lọc và mở phiên được; tab trạng thái,
            thanh tiến độ và thao tác hàng loạt tạm ẩn.
          </AlertDescription>
        </Alert>
      )}

      {loading && <Skeleton className="h-40 w-full" />}

      {!loading && !error && rows.length === 0 && (
        <p className="rounded-lg border border-dashed border-border px-4 py-6 text-small text-muted-foreground">
          Chưa có phiên thi nào thu được bài. Chấm điểm chỉ làm việc với bài đã thu.
        </p>
      )}

      {!loading && rows.length > 0 && (
        <>
          <StatusTabs counts={counts} value={filters.status} onChange={(status) => setFilters({ ...filters, status })} />

          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <FilterBar filters={filters} options={options} noRubricCount={noRubricCount} onChange={setFilters} searchRef={searchRef} />
            </div>
            <div className="flex flex-wrap items-center gap-3 text-caption text-muted-foreground">
              <label className="flex items-center gap-2">
                Nhóm theo
                <select
                  value={view.group}
                  onChange={(e) => setView({ ...view, group: e.target.value as typeof view.group })}
                  className="h-9 rounded-md border border-input bg-surface px-2 text-small font-medium text-foreground"
                >
                  <option value="none">Không nhóm</option>
                  <option value="class">Lớp</option>
                  <option value="semester">Học kỳ</option>
                </select>
              </label>
              <label className="flex items-center gap-2">
                Sắp xếp
                <select
                  value={SORT_PRESETS.some(([v]) => v === presetValue) ? presetValue : 'custom'}
                  onChange={(e) => {
                    if (e.target.value === 'custom') return;
                    const [sortKey, sortDir] = e.target.value.split(':') as [SortKey, 'asc' | 'desc'];
                    setView({ ...view, sortKey, sortDir });
                  }}
                  className="h-9 rounded-md border border-input bg-surface px-2 text-small font-medium text-foreground"
                >
                  {SORT_PRESETS.map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                  <option value="custom" hidden>Theo cột đã chọn</option>
                </select>
              </label>
              <div role="group" aria-label="Mật độ hàng" className="inline-flex overflow-hidden rounded-md border border-border bg-surface">
                {(['cozy', 'compact'] as Density[]).map((d) => (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={density === d}
                    onClick={() => setDensity(d)}
                    className={density === d ? 'h-9 bg-primary-subtle px-3 text-small font-semibold text-primary' : 'h-9 px-3 text-small font-semibold text-muted-foreground hover:text-foreground'}
                  >
                    {d === 'cozy' ? 'Rộng' : 'Gọn'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <p role="status" aria-live="polite" className="text-caption text-muted-foreground">
            Hiển thị {visible.length} trong {rows.length} phiên
          </p>

          {visible.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border bg-surface px-4 py-12 text-center">
              <strong className="text-body">Không có phiên nào khớp</strong>
              <p className="max-w-[46ch] text-small text-muted-foreground">Thử bỏ bớt bộ lọc, chọn tab “Tất cả”, hoặc tìm bằng tên lớp hay phòng.</p>
              <Button type="button" variant="outline" size="sm" onClick={() => setFilters(EMPTY_LIST_FILTERS)}>
                Xoá bộ lọc
              </Button>
            </div>
          ) : (
            <SessionTable
              groups={groups}
              view={view}
              onSort={sortBy}
              selected={selected}
              onToggleRows={toggleRows}
              collapsed={collapsed}
              onToggleGroup={toggleGroup}
              onStart={() => undefined /* Task 9 nối hộp xác nhận vào đây */}
              density={density}
              now={now}
            />
          )}

          {selected.size > 0 && (
            <div role="status" className="sticky bottom-4 z-30 self-center rounded-xl bg-primary px-5 py-3 text-small font-semibold text-primary-foreground shadow-lg">
              Đã chọn {selected.size} phiên
            </div>
          )}
        </>
      )}
    </div>
  );
}
```

The `Đã chọn N phiên` bar is a placeholder the next task replaces with `BulkBar`; it exists here so the selection test has something to assert.

`page.tsx`: replace `import { SessionPicker } from './_components/SessionPicker';` with `import { SessionList } from './_components/session-list/SessionList';` and the JSX at line ~49 with `<SessionList sessions={overview.data ?? []} loading={overview.isLoading} error={overview.isError ? overview.error : null} />`. Delete `_components/SessionPicker.tsx` (`git rm`). Before deleting: `grep -rn "SessionPicker" apps/web/src/app/teacher/grading` must show only the import you just replaced (the `exam-authoring` one is a different component in another directory).

- [ ] **Step 4: Run to see them pass**

Run: `cd apps/web && npx vitest run src/app/teacher/grading`
Expected: PASS for the whole grading directory. Debug order if not: (1) the "search reaches the URL after a pause" test — fake timers with `useEffect` timers need `act`; wrap `vi.advanceTimersByTime` in `act(() => …)` from `@testing-library/react`; (2) the `names()` helper in the test file is deliberately loose — if it returns the "Xem xét"/"Chuẩn bị" action links too, tighten it to `link.closest('td')?.previousElementSibling` being the checkbox cell rather than loosening assertions.

- [ ] **Step 5: Typecheck, lint, commit**

```bash
cd apps/web && npx tsc --noEmit && npx eslint src/app/teacher/grading
cd ../.. && git add -A apps/web && git commit -m "feat(grading): session list replaces the card picker" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Task 9: Bulk bar and dialogs (start grading, assign rubric)

**Files:**
- Create: `_components/session-list/BulkBar.tsx`, `_components/session-list/BulkDialog.tsx`, `_components/session-list/BulkDialog.test.tsx`
- Modify: `_components/session-list/SessionList.tsx`, `_components/session-list/SessionList.test.tsx`

Paths under `apps/web/src/app/teacher/grading/`.

**Interfaces:**
- Consumes: `bulkPlan`, `runSequentially`, `startGrading`, `setSessionRubric`, `useRubrics`, `SESSION_SUMMARIES_KEY`, `submittedCount`.
- Produces:

```ts
export interface BulkRequest { kind: 'start' | 'rubric'; rows: SessionRow[]; skipped: number }
export function BulkBar(props: { selected: SessionRow[]; onRequest: (r: BulkRequest) => void; onClear: () => void }): JSX.Element
export function BulkDialog(props: { request: BulkRequest; onClose: () => void; onFinished: () => void }): JSX.Element
```

- [ ] **Step 1: Write the failing tests**

```tsx
// _components/session-list/BulkDialog.test.tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { rowsOf, session, summary } from '@/lib/session-list.fixtures';
import { BulkDialog, type BulkRequest } from './BulkDialog';

const h = vi.hoisted(() => ({
  startGrading: vi.fn(),
  setSessionRubric: vi.fn(),
  rubrics: { data: [] as unknown[], isLoading: false },
}));
vi.mock('@/lib/api/grading', async (orig) => ({ ...(await orig<typeof import('@/lib/api/grading')>()), startGrading: h.startGrading, setSessionRubric: h.setSessionRubric }));
vi.mock('@/hooks/useGrading', async (orig) => ({ ...(await orig<typeof import('@/hooks/useGrading')>()), useRubrics: () => h.rubrics }));

const rows = rowsOf(
  [
    session({ id: 'a', name: 'Phiên A', className: 'L1', fullySubmittedCount: 30 }),
    session({ id: 'b', name: 'Phiên B', className: 'L2', fullySubmittedCount: 41, partialCount: 1 }),
    session({ id: 'c', name: 'Phiên C', className: 'L3', fullySubmittedCount: 5 }),
  ],
  [summary('a'), summary('b'), summary('c')],
);

function open(request: BulkRequest) {
  const onClose = vi.fn();
  const onFinished = vi.fn();
  const client = new QueryClient();
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  render(
    <QueryClientProvider client={client}>
      <BulkDialog request={request} onClose={onClose} onFinished={onFinished} />
    </QueryClientProvider>,
  );
  return { onClose, onFinished, invalidate };
}

beforeEach(() => {
  h.startGrading.mockReset().mockResolvedValue({ queued: 1 });
  h.setSessionRubric.mockReset().mockResolvedValue(undefined);
  h.rubrics = { data: [{ id: 'r3', name: 'CTDL&GT', version: 3, isActive: true }, { id: 'r2', name: 'CTDL&GT', version: 2, isActive: true }, { id: 'old', name: 'Cũ', version: 1, isActive: false }], isLoading: false };
});

describe('BulkDialog — start grading', () => {
  const request = (skipped = 0): BulkRequest => ({ kind: 'start', rows, skipped });

  it('lists the sessions and the total number of bài before doing anything', () => {
    open(request());
    const dialog = screen.getByRole('dialog', { name: /Bắt đầu chấm 3 phiên/ });
    expect(within(dialog).getByText(/77 bài/)).toBeInTheDocument(); // 30 + 42 + 5
    expect(within(dialog).getByText('Phiên B')).toBeInTheDocument();
    expect(h.startGrading).not.toHaveBeenCalled();
  });

  it('is honest that only rubric and question were checked, and that the server decides', () => {
    open(request());
    expect(screen.getByText(/chỉ kiểm rubric và đề bài/i)).toBeInTheDocument();
    expect(screen.getByText(/máy chủ/i)).toBeInTheDocument();
  });

  it('mentions sessions that were left out of the selection because they are not eligible', () => {
    open(request(2));
    expect(screen.getByText(/2 phiên đã chọn không đủ điều kiện/)).toBeInTheDocument();
  });

  it('confirm starts each session, one at a time, in order', async () => {
    open(request());
    fireEvent.click(screen.getByRole('button', { name: /Bắt đầu chấm 3 phiên/ }));
    await waitFor(() => expect(h.startGrading).toHaveBeenCalledTimes(3));
    expect(h.startGrading.mock.calls.map((c) => c[0])).toEqual(['a', 'b', 'c']);
  });

  it('a session the server refuses is reported with the server\'s words; the others still ran', async () => {
    h.startGrading.mockImplementation(async (id: string) => {
      if (id === 'b') throw new Error('Phiên có bài code nhưng chưa ghim gói test.');
    });
    open(request());
    fireEvent.click(screen.getByRole('button', { name: /Bắt đầu chấm 3 phiên/ }));
    await screen.findByText(/Đã bắt đầu 2 phiên, 1 phiên bị từ chối/);
    const failed = screen.getByText('Phiên B').closest('li') as HTMLElement;
    expect(within(failed).getByText(/chưa ghim gói test/)).toBeInTheDocument();
    expect(h.startGrading).toHaveBeenCalledTimes(3);
  });

  it('refreshes the summary and the overview afterwards, and hands control back when closed', async () => {
    const { onFinished, invalidate } = open(request());
    fireEvent.click(screen.getByRole('button', { name: /Bắt đầu chấm 3 phiên/ }));
    await screen.findByText(/Đã bắt đầu 3 phiên/);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['grading', 'sessions-summary'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['submissions', 'overview'] });
    fireEvent.click(screen.getByRole('button', { name: 'Đóng' }));
    expect(onFinished).toHaveBeenCalled();
  });

  it('cancel before confirming sends nothing', () => {
    const { onClose } = open(request());
    fireEvent.click(screen.getByRole('button', { name: 'Huỷ' }));
    expect(onClose).toHaveBeenCalled();
    expect(h.startGrading).not.toHaveBeenCalled();
  });
});

describe('BulkDialog — assign rubric', () => {
  const request = (): BulkRequest => ({ kind: 'rubric', rows: rows.slice(0, 2), skipped: 0 });

  it('offers only active rubrics and applies the chosen one to each session', async () => {
    open(request());
    const select = screen.getByRole('combobox', { name: /Rubric/ });
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(['CTDL&GT · v2', 'CTDL&GT · v3']);
    fireEvent.change(select, { target: { value: 'r3' } });
    fireEvent.click(screen.getByRole('button', { name: /Gắn cho 2 phiên/ }));
    await waitFor(() => expect(h.setSessionRubric).toHaveBeenCalledTimes(2));
    expect(h.setSessionRubric.mock.calls).toEqual([['a', 'r3'], ['b', 'r3']]);
  });

  it('says when the teacher has no rubric to choose, and the confirm button stays off', () => {
    h.rubrics = { data: [], isLoading: false };
    open(request());
    expect(screen.getByText(/Chưa có rubric nào/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Gắn cho 2 phiên/ })).toBeDisabled();
  });

  it('reports a 409 (a session already has results) per session', async () => {
    h.setSessionRubric.mockImplementation(async (id: string) => {
      if (id === 'a') throw new Error('Phiên đã có kết quả chấm, không đổi được rubric.');
    });
    open(request());
    fireEvent.click(screen.getByRole('button', { name: /Gắn cho 2 phiên/ }));
    await screen.findByText(/1 phiên bị từ chối/);
    expect(within(screen.getByText('Phiên A').closest('li') as HTMLElement).getByText(/không đổi được rubric/)).toBeInTheDocument();
  });
});
```

Append to `SessionList.test.tsx` (extend the `next/navigation` and `useGrading` mocks as needed — `BulkDialog` is mocked in this file so the list test stays about the list):

```tsx
vi.mock('./BulkDialog', () => ({
  BulkDialog: (p: { request: { kind: string; rows: unknown[]; skipped: number } }) => (
    <div data-testid="bulk-dialog" data-kind={p.request.kind} data-rows={p.request.rows.length} data-skipped={p.request.skipped} />
  ),
}));

describe('SessionList — bulk bar', () => {
  const pick = (name: RegExp) => fireEvent.click(screen.getByRole('checkbox', { name }));

  it('offers "Bắt đầu chấm" for sessions that are not graded and have rubric + question, counted', () => {
    renderList();
    pick(/Chọn phiên Kiểm tra giữa kỳ/); // attention
    pick(/Chọn phiên Thực hành đồ thị/); // todo, no rubric
    const bar = within(screen.getByRole('region', { name: /Thao tác trên phiên đã chọn/ }));
    expect(bar.getByRole('button', { name: /Bắt đầu chấm/ })).toHaveAttribute('aria-disabled', 'true');
    expect(bar.getByRole('button', { name: /Gắn rubric/ })).toHaveTextContent('1');
  });

  it('opens the confirm dialog with the eligible rows and how many selected sessions were left out', () => {
    h.summaries = { data: [summary('a'), summary('b'), summary('c', { finalized: 38 })], isLoading: false, isError: false, error: null };
    renderList();
    pick(/Chọn phiên Kiểm tra giữa kỳ/); // todo, has rubric+question → eligible
    pick(/Chọn phiên Kiểm tra cuối kỳ/); // done → not eligible
    // Trong thanh: hàng "a" cũng có nút "Bắt đầu chấm" riêng.
    fireEvent.click(within(screen.getByRole('region', { name: /Thao tác trên phiên đã chọn/ })).getByRole('button', { name: /Bắt đầu chấm/ }));
    const dialog = screen.getByTestId('bulk-dialog');
    expect(dialog).toHaveAttribute('data-kind', 'start');
    expect(dialog).toHaveAttribute('data-rows', '1');
    expect(dialog).toHaveAttribute('data-skipped', '1');
  });

  it('there is no bulk finalize and no bulk export', () => {
    renderList();
    pick(/Chọn phiên Kiểm tra giữa kỳ/);
    expect(screen.queryByRole('button', { name: /Chốt điểm/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Xuất/ })).not.toBeInTheDocument();
  });

  it('while statuses are unknown there is no bulk bar at all', () => {
    h.summaries = { data: undefined, isLoading: true, isError: false, error: null };
    renderList();
    pick(/Chọn phiên Kiểm tra giữa kỳ/);
    expect(screen.queryByRole('button', { name: /Bắt đầu chấm/ })).not.toBeInTheDocument();
  });

  it('the row "Bắt đầu chấm" button opens the same dialog for that single session', () => {
    h.summaries = { data: [summary('a'), summary('b'), summary('c')], isLoading: false, isError: false, error: null };
    renderList();
    fireEvent.click(within(screen.getByRole('link', { name: 'Kiểm tra giữa kỳ' }).closest('tr') as HTMLElement).getByRole('button', { name: /Bắt đầu chấm/ }));
    expect(screen.getByTestId('bulk-dialog')).toHaveAttribute('data-rows', '1');
  });

  it('"Bỏ chọn" clears the selection', () => {
    renderList();
    pick(/Chọn phiên Kiểm tra giữa kỳ/);
    fireEvent.click(screen.getByRole('button', { name: /Bỏ chọn/ }));
    expect(screen.queryByText(/Đã chọn/)).not.toBeInTheDocument();
  });
});
```

Replace the selection test in this file that asserted on the placeholder text `Đã chọn 2 phiên` — the real bar renders `Đã chọn 2 phiên` inside a `<strong>`, so `getByText(/Đã chọn 2 phiên/)` keeps working unchanged.

- [ ] **Step 2: Run to see them fail**

Run: `cd apps/web && npx vitest run src/app/teacher/grading/_components/session-list`
Expected: FAIL — `./BulkDialog` missing; the new list tests find no bar.

- [ ] **Step 3: Implement**

```tsx
// _components/session-list/BulkBar.tsx
'use client';

import { Play, Tag, X } from 'lucide-react';
import { LIST_STATUS_LABEL, bulkPlan, type ListStatus, type SessionRow } from '@/lib/session-list';
import { cn } from '@/lib/utils';
import type { BulkRequest } from './BulkDialog';

function mixText(mix: Partial<Record<ListStatus, number>>): string {
  return (Object.keys(LIST_STATUS_LABEL) as ListStatus[])
    .filter((k) => mix[k])
    .map((k) => `${mix[k]} ${LIST_STATUS_LABEL[k].toLowerCase()}`)
    .join(' · ');
}

const BTN = 'inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-md border border-primary-foreground/40 px-3 text-small font-semibold hover:bg-primary-foreground/15 aria-disabled:cursor-not-allowed aria-disabled:opacity-45 aria-disabled:hover:bg-transparent';

/**
 * Thanh nổi ở đáy khi có phiên được chọn. Mỗi nút đếm số phiên ĐỦ ĐIỀU KIỆN và nói vì sao khi không có
 * (`aria-disabled` + `title`, không phải `disabled`: nút tắt mất khỏi thứ tự Tab và không ai đọc được lý do).
 * Cố ý không có "Chốt điểm" và "Xuất điểm" hàng loạt (spec D3, mục 1.1).
 */
export function BulkBar({ selected, onRequest, onClear }: { selected: SessionRow[]; onRequest: (r: BulkRequest) => void; onClear: () => void }) {
  const plan = bulkPlan(selected);
  const act = (kind: BulkRequest['kind'], rows: SessionRow[]) => () => {
    if (rows.length === 0) return; // nút đang aria-disabled: bấm không làm gì, lý do nằm ở `title`
    onRequest({ kind, rows, skipped: selected.length - rows.length });
  };

  return (
    <div role="region" aria-label="Thao tác trên phiên đã chọn" className="sticky bottom-4 z-30 flex w-max max-w-full flex-wrap items-center gap-x-5 gap-y-2 self-center rounded-xl bg-primary px-4 py-2.5 text-primary-foreground shadow-lg">
      <div>
        <strong className="block text-body">Đã chọn {selected.length} phiên</strong>
        <span className="block text-caption opacity-90">{mixText(plan.mix)}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          aria-disabled={plan.start.length === 0}
          title={plan.start.length === 0 ? 'Chọn phiên chưa chấm đã có rubric và đề bài.' : undefined}
          onClick={act('start', plan.start)}
          className={cn(BTN, 'border-transparent bg-primary-foreground text-primary hover:bg-primary-foreground/90 aria-disabled:hover:bg-primary-foreground')}
        >
          <Play className="h-4 w-4" aria-hidden="true" />
          Bắt đầu chấm
          <span className="tabular-nums">· {plan.start.length}</span>
        </button>
        <button
          type="button"
          aria-disabled={plan.assignRubric.length === 0}
          title={plan.assignRubric.length === 0 ? 'Chọn phiên chưa chấm và chưa có rubric.' : undefined}
          onClick={act('rubric', plan.assignRubric)}
          className={BTN}
        >
          <Tag className="h-4 w-4" aria-hidden="true" />
          Gắn rubric
          <span className="tabular-nums">· {plan.assignRubric.length}</span>
        </button>
        <button type="button" onClick={onClear} className={cn(BTN, 'border-transparent')} aria-label="Bỏ chọn">
          <X className="h-4 w-4" aria-hidden="true" />
          Bỏ chọn
        </button>
      </div>
    </div>
  );
}
```


```tsx
// _components/session-list/BulkDialog.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, CircleX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SESSION_SUMMARIES_KEY, useRubrics } from '@/hooks/useGrading';
import { setSessionRubric, startGrading } from '@/lib/api/grading';
import { submittedCount, type SessionRow } from '@/lib/session-list';
import { runSequentially, type BulkOutcome } from '@/lib/session-list-bulk';

export interface BulkRequest {
  kind: 'start' | 'rubric';
  rows: SessionRow[];
  /** Số phiên đã chọn nhưng không đủ điều kiện cho thao tác này, nên bị bỏ qua. */
  skipped: number;
}

type Phase = 'confirm' | 'running' | 'done';

function RubricPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const rubrics = useRubrics();
  const options = useMemo(
    () => (rubrics.data ?? []).filter((r) => r.isActive).sort((a, b) => a.name.localeCompare(b.name, 'vi') || a.version - b.version),
    [rubrics.data],
  );
  useEffect(() => {
    if (!value && options[0]) onChange(options[0].id);
  }, [options, value, onChange]);

  if (rubrics.isLoading) return <p className="text-small text-muted-foreground">Đang tải rubric…</p>;
  if (options.length === 0) return <p className="text-small text-muted-foreground">Chưa có rubric nào. Tạo rubric ở trang Bảng lỗi trước.</p>;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="bulk-rubric" className="text-caption font-semibold text-muted-foreground">Rubric</label>
      <select id="bulk-rubric" value={value} onChange={(e) => onChange(e.target.value)} className="h-10 rounded-md border border-input bg-surface px-3 text-body">
        {options.map((r) => (
          <option key={r.id} value={r.id}>{`${r.name} · v${r.version}`}</option>
        ))}
      </select>
    </div>
  );
}

/**
 * Hộp xác nhận + kết quả cho thao tác hàng loạt. Chạy TUẦN TỰ từng phiên qua chính các route theo-phiên
 * (`start-grading`, `PATCH rubric`) — máy chủ vẫn là người quyết phiên nào được bắt đầu (spec mục 1.1, 5).
 * Bắt đầu chấm luôn có bước xác nhận này: đây là thao tác tường minh của giảng viên mà CLAUDE.md đòi.
 */
export function BulkDialog({ request, onClose, onFinished }: { request: BulkRequest; onClose: () => void; onFinished: () => void }) {
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<Phase>('confirm');
  const [outcomes, setOutcomes] = useState<BulkOutcome[]>([]);
  const [rubricId, setRubricId] = useState('');

  const { kind, rows, skipped } = request;
  const totalPapers = rows.reduce((sum, r) => sum + submittedCount(r.session), 0);
  const nameOf = (id: string) => rows.find((r) => r.session.id === id)?.session.name ?? id;
  const ok = outcomes.filter((o) => o.ok).length;
  const failed = outcomes.length - ok;

  async function run() {
    setPhase('running');
    const ids = rows.map((r) => r.session.id);
    const result = await runSequentially(ids, kind === 'start' ? (id) => startGrading(id) : (id) => setSessionRubric(id, rubricId));
    setOutcomes(result);
    setPhase('done');
    // Trạng thái và rubric của các phiên vừa đổi: đọc lại cả hai nguồn của danh sách.
    void queryClient.invalidateQueries({ queryKey: SESSION_SUMMARIES_KEY });
    void queryClient.invalidateQueries({ queryKey: ['submissions', 'overview'] });
  }

  const title =
    phase === 'done'
      ? kind === 'start'
        ? `Đã bắt đầu ${ok} phiên${failed ? `, ${failed} phiên bị từ chối` : ''}`
        : `Đã gắn rubric cho ${ok} phiên${failed ? `, ${failed} phiên bị từ chối` : ''}`
      : kind === 'start'
        ? `Bắt đầu chấm ${rows.length} phiên?`
        : `Gắn rubric cho ${rows.length} phiên`;

  return (
    <Dialog open onOpenChange={(open) => { if (!open && phase !== 'running') (phase === 'done' ? onFinished : onClose)(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {phase === 'confirm' && kind === 'start' && (
            <DialogDescription>
              Hệ thống sẽ xếp <b>{totalPapers} bài</b> của <b>{rows.length} phiên</b> vào hàng đợi chấm. Bạn vẫn xem và sửa được từng kết quả sau đó.
            </DialogDescription>
          )}
          {phase === 'confirm' && kind === 'rubric' && (
            <DialogDescription>Chỉ áp dụng cho phiên chưa chấm. Sau khi phiên có kết quả đầu tiên, rubric của phiên không đổi được.</DialogDescription>
          )}
        </DialogHeader>

        {phase === 'confirm' && kind === 'rubric' && <RubricPicker value={rubricId} onChange={setRubricId} />}

        {phase !== 'done' ? (
          <ul className="max-h-56 divide-y divide-border overflow-auto rounded-lg border border-border text-small">
            {rows.map((r) => (
              <li key={r.session.id} className="flex justify-between gap-3 px-3 py-2">
                <span className="min-w-0 font-semibold [overflow-wrap:anywhere]">{r.session.name}</span>
                <span className="whitespace-nowrap tabular-nums text-muted-foreground">{r.session.className} · {submittedCount(r.session)} bài</span>
              </li>
            ))}
          </ul>
        ) : (
          <ul className="max-h-64 divide-y divide-border overflow-auto rounded-lg border border-border text-small">
            {outcomes.map((o) => (
              <li key={o.sessionId} className="flex items-start gap-2 px-3 py-2">
                {o.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success-strong" aria-label="Thành công" /> : <CircleX className="mt-0.5 h-4 w-4 shrink-0 text-danger-strong" aria-label="Bị từ chối" />}
                <span className="min-w-0">
                  <span className="block font-semibold [overflow-wrap:anywhere]">{nameOf(o.sessionId)}</span>
                  {!o.ok && <span className="block text-muted-foreground">{o.message}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}

        {phase === 'confirm' && kind === 'start' && (
          <p className="text-small text-muted-foreground">
            Danh sách chỉ kiểm rubric và đề bài. Gói test của bài code và các điều kiện khác do máy chủ kiểm; phiên nào bị từ chối sẽ báo lại lý do.
          </p>
        )}
        {phase === 'confirm' && skipped > 0 && (
          <p className="text-small text-muted-foreground">
            {skipped} phiên đã chọn không đủ điều kiện {kind === 'start' ? 'bắt đầu chấm' : 'cần gắn rubric'} nên được bỏ qua.
          </p>
        )}
        {phase === 'running' && <p role="status" className="text-small text-muted-foreground">Đang xử lý từng phiên…</p>}

        <DialogFooter>
          {phase === 'confirm' && (
            <>
              <Button type="button" variant="outline" onClick={onClose}>Huỷ</Button>
              <Button type="button" onClick={() => void run()} disabled={kind === 'rubric' && !rubricId}>
                {kind === 'start' ? `Bắt đầu chấm ${rows.length} phiên` : `Gắn cho ${rows.length} phiên`}
              </Button>
            </>
          )}
          {phase === 'done' && <Button type="button" onClick={onFinished}>Đóng</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

`SessionList.tsx` — replace the placeholder bar and the `onStart` stub:

```tsx
import { BulkBar } from './BulkBar';
import { BulkDialog, type BulkRequest } from './BulkDialog';
```

```tsx
  const [bulk, setBulk] = useState<BulkRequest | null>(null);
  const selectedRows = useMemo(() => visible.filter((r) => selected.has(r.session.id)), [visible, selected]);
```

```tsx
              onStart={(row) => setBulk({ kind: 'start', rows: [row], skipped: 0 })}
```

```tsx
          {selectedRows.length > 0 && counts !== null && (
            <BulkBar selected={selectedRows} onRequest={setBulk} onClear={() => setSelected(new Set())} />
          )}
        </>
      )}

      {bulk && (
        <BulkDialog
          request={bulk}
          onClose={() => setBulk(null)}
          onFinished={() => {
            setBulk(null);
            setSelected(new Set());
          }}
        />
      )}
    </div>
```

(`counts !== null` doubles as "statuses are known": no bulk bar while they are not.)

- [ ] **Step 4: Run to see them pass**

Run: `cd apps/web && npx vitest run src/app/teacher/grading`
Expected: PASS. Friction to expect: Radix `Dialog` needs a `DialogDescription` or it logs an accessibility warning — the `done` phase has none; add `<DialogDescription className="sr-only">Kết quả từng phiên</DialogDescription>` for that phase if the warning shows. The `aria-disabled` bulk button clicked in the "no eligible" test must not call `onRequest` — that is what `act()` guards.

- [ ] **Step 5: Typecheck, lint, commit**

```bash
cd apps/web && npx tsc --noEmit && npx eslint src/app/teacher/grading
cd ../.. && git add -A apps/web && git commit -m "feat(grading): bulk start-grading and assign-rubric from the session list" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Task 10: Verify end to end

**Files:** none (evidence only — record results in the branch ledger or the final report).

- [ ] **Step 1: Whole web suite, types, lint, build**

```bash
cd apps/web && npx vitest run 2>&1 | tail -8
npx tsc --noEmit && npx eslint . 2>&1 | tail -5
npx next build 2>&1 | tail -15
```

Expected: all green; the build lists `/teacher/grading` without a prerender error (`useSearchParams` is inside `<Suspense>` in `page.tsx` — unchanged).

- [ ] **Step 2: API suites touching the grading module**

```bash
cd apps/api && npx jest src/grading 2>&1 | tail -6
npx jest --config ./test/jest-e2e.json test/grading-summary.e2e-spec.ts test/grading-results-view.e2e-spec.ts test/submission-overview.e2e-spec.ts 2>&1 | tail -8
```

Expected: PASS. `submission-overview` is in the list because it shares the module wiring path and must be unaffected.

- [ ] **Step 3: Real-API smoke without touching demo data** (memory `grading-ui-rebuild-2026-09-29`)

```bash
cd apps/api && DOTENV_CONFIG_PATH=.env.test npx ts-node -r tsconfig-paths/register test/ui-e2e/seed.ts
pnpm build && DOTENV_CONFIG_PATH=.env.test node -r dotenv/config dist/src/main.js &
until curl -s -o /dev/null -w '%{http_code}' http://localhost:4000/api-docs-json | grep -q 200; do sleep 3; done
```

Then, with a small node script in the scratchpad: log in as the seeded teacher (`seed-output.json`), call `GET /grading/sessions-summary` and `GET /exam-sessions/:id/grading-progress` for each seeded session, and assert for every session that `sum(summary.byStatus) === progress.total` and `summary.byStatus` deep-equals `progress.byStatus`. Also assert a session with a question chosen reports `hasQuestion: true` (use `PUT /exam-sessions/:id/grading-reference`). Kill the server by the PID you started and verify port 4000 is free. The two endpoints counting the same table must agree — this is the check that the new SQL and the old one have not drifted.

- [ ] **Step 4: Ask the owner to look at it in a browser**

The mock-up was approved as a picture; the real page needs one human look. `pnpm --filter web dev` against the local API with the seeded teacher; check: tabs and counts, filter menus, sort, group, select two sessions, bulk bar, confirm dialog, browser Back after picking a filter, "Đổi phiên" returns to the filtered list, dark/light. Note anything visibly off as follow-up; do not open a PR.

- [ ] **Step 5: Report**

State plainly: which suites ran and passed, that the code-review handoff (CLAUDE.md HANDOFF RULE) is **pending** — this branch has not had a `code-reviewer` VERDICT — and that nothing was pushed or opened as a PR.
