# Design: a per-session submission detail page, bridging to Chấm điểm

**Date:** 2026-09-02
**Status:** Approved by user in chat (architectural — brainstormed, 2-3 approaches
presented, approach chosen and refined by the user, frontend-design skill applied
to the resulting page plan)
**Branch:** `feature/submission-session-detail-page` (worktree at
`.claude/worktrees/submission-session-detail-page`)
**Builds on:** PR #19 ("Quản lý bài thu"), PR #21 (its session-lobby link, now
retargeted by this change), the existing per-session lobby
(`apps/web/src/app/(exam-live)/exam-sessions/[id]/page.tsx`), and the existing —
previously undocumented in this session's own analysis — Grading page
(`apps/web/src/app/teacher/grading/page.tsx`).

---

## 1. Why this exists

The user's complaint: "Quản lý bài thu" manages at the wrong grain. Its rows are
individual submitted files (`examSessionId + requiredDeliverableId + studentMssv`),
flattened across every exam session a teacher has ever run. A student who sits exams
across several different courses, rooms, and sessions makes that flat list hard to
manage from — there is no larger unit to derive the file-level view from.

Re-reading the system (GitNexus MCP was down this session — `CONNECT_TIMEOUT`; the
CLI's `analyze` was run to refresh the index for when it reconnects, but this
analysis itself was done by reading source directly) found two things:

- Both other teacher-facing screens already organize around **ExamSession**, not
  around files: the lobby page (`/exam-sessions/[id]`) groups by student within one
  session, and — a real discovery, not previously known to this analysis — a
  **Grading page already exists** (`/teacher/grading`) and is *already*
  session-scoped: pick a session from a dropdown, then rubric + AI results are all
  scoped to it.
- "Quản lý bài thu" is the only screen still flattening to file-level rows across
  every session. It is not wrong at what it does (a cross-session search tool for
  "I know the MSSV/name but not which session" — its own header comment already
  says this), but it was being read as the *management* view, a job it never
  actually signed up for.

This also means the "bridge to Chấm điểm" half of the ask needs no new destination —
only a way to arrive there with a session pre-selected, since today it only accepts a
session via an in-page dropdown, never from a URL.

## 2. Approaches considered

- **A — add a rollup column to "Quản lý kỳ thi"** (`/teacher/exam-sessions`, PR #18):
  cheapest, reuses that list's existing filters entirely. Rejected by the user in
  favor of a page dedicated to submission review, not a wider column on the session
  list.
- **B (as first proposed) — accordion by session, inline on "Quản lý bài thu"**:
  keeps one page, but re-implements a second version of the per-session status table
  already living on the lobby page. Rejected: needless duplication of matrix-status
  rendering logic in a third place.
- **B, as the user refined it (chosen)** — a **new, separate detail page**,
  `/teacher/submissions/[sessionId]`, reached from "Quản lý bài thu" (retargeting
  PR #21's existing conditional link) rather than folded into the flat page's own
  markup. This is architecturally the cleaner cut: the lobby page is genuinely a
  *live-monitoring* screen (websocket lifecycle, access-request handling, the
  "Chốt bài ngay" action) that happens to still render after the exam ends; this new
  page is a *pure post-hoc review* screen with none of that — same underlying facts,
  a different job, so a different page is the honest shape, not redundancy. This
  also happens to restore the original two-module frontend split CLAUDE.md's own
  structure diagram always described (`(exam-live)/exam-sessions/[id]` vs
  `(management)/submissions/[sessionId]`), which PR #19 had drifted away from by
  building the flat list instead.

## 3. Design

### 3.1 New route: `/teacher/submissions/[sessionId]`

`apps/web/src/app/teacher/submissions/[sessionId]/page.tsx`. No new backend
endpoint — composes three hooks the lobby page already uses and that are already
teacher/session-scoped server-side: `useExamSessionDetail`, `useAttendance`,
`useSubmissions`. Purely REST: no socket connect, no `AccessRequestPanel`, no
`AttendancePanel` confirm action, no finalize button — none of those are this page's
job.

### 3.2 Shared row-building logic, extracted (not duplicated)

The lobby page currently builds its `SubmissionRowStudent[]` rows and its
`fullySubmitted` count inline, unexported. Both are needed verbatim by the new page,
so they move to a new module, `apps/web/src/lib/submission-rows.ts`:

- `DeliverableState`, `DeliverableColumn`, `SubmissionRowStudent` — moved here from
  `SubmissionStatusTable.tsx` (they were already cross-page types the moment a
  second page needs them; CLAUDE.md's own frontend rule 2 puts a type used by 2+
  components in `lib/`, not owned by one component file).
- `buildSubmissionRows(attendance, submissionItems)` — the present/absent/makeup ∪
  submissions merge, unchanged in behavior from the lobby page's current inline
  version, minus the live-websocket overlay step (lobby-only, stays in that page).
- `countFullySubmitted(rows, deliverables)` — the existing rollup count.

`SubmissionStatusTable.tsx` imports its types from this module instead of declaring
them. The lobby page calls `buildSubmissionRows` for its base rows, then applies its
own live-overlay loop on top (cloning before mutating, so the memoized base rows are
never mutated in place across renders).

### 3.3 Page content

Header: icon-chip using `Inbox` (matching this page's own nav icon — "Quản lý bài
thu" — rather than `ClipboardCheck`, already claimed by both the lobby and the
Grading page) + session name + status badge. Rollup line, worded identically to the
lobby page's own ("**X/Y** sinh viên đã nộp đủ N file bắt buộc") — same fact, same
words, deliberately not reinvented. A **"Chấm điểm"** button — `variant="default"`
(the app's teal CTA, reserved for the one actual next step on this screen, not
`outline` like the informational actions elsewhere on the page) with the
`ClipboardCheck` icon (matching the destination page's own icon) — linking to
`/teacher/grading?sessionId=<id>`. Body: `SubmissionStatusTable` reused as-is, given
a `emptyStudentsDescription` override (see below) since its default empty-state copy
assumes a live auto-updating table, which would be false here.

**States:**
- Loading → skeleton, matching "Quản lý bài thu"'s own loading treatment.
- Session not found / not this teacher's / any other load failure →
  `Alert variant="destructive"` + "Thử lại" button (`sessionDetail.refetch()`) — the
  same generic-message-plus-retry shape "Quản lý bài thu" already uses for its own
  list-load failure, not a new invented distinction between 404 and 403 (the REST
  call here has no typed error code to distinguish them, unlike the lobby's
  WebSocket subscribe errors).
- Zero required deliverables, or zero students → `SubmissionStatusTable`'s own
  existing empty states, the latter's copy overridden per above.

**New optional prop on `SubmissionStatusTable`:** `emptyStudentsDescription?: string`
— defaults to the current live-page copy ("Bảng sẽ tự cập nhật ngay khi agent... —
không cần tải lại trang"), so the lobby page's call site needs no change. The new
detail page passes "Chưa có sinh viên nào nộp bài trong phiên này." — true for a
static snapshot, where the live-update sentence would not be.

### 3.4 Entry points wired up

- **"Quản lý bài thu" → this page:** PR #21's conditional link (shown when the
  exam-session filter narrows to one session) is retargeted from
  `/exam-sessions/${examSessionId}` (the lobby) to
  `/teacher/submissions/${examSessionId}` (this new page). Label/icon/copy updated
  to match the new destination (no longer "Phòng chờ").
- **This page → Chấm điểm:** the "Chấm điểm" button above.
- **Chấm điểm reads the session from the URL:** `apps/web/src/app/teacher/grading/
  page.tsx` currently only ever gets `sessionId` from an in-page `<Select>`
  (`useState('')`). It changes to seed that state from
  `useSearchParams().get('sessionId')` on first render — the teacher still sees and
  can change the dropdown, it simply starts on the right session instead of empty.
  `useSearchParams()` requires a `Suspense` boundary per Next.js App Router; the page
  export wraps its body accordingly.

## 4. Testing

- `submission-rows.ts`: unit tests for `buildSubmissionRows` (present/absent/makeup
  ∪ submissions merge, a student appearing in both, a submission for someone with no
  attendance row) and `countFullySubmitted` (full match, partial, zero deliverables).
- `SubmissionStatusTable.test.tsx`: the `emptyStudentsDescription` override renders
  when passed, the default copy renders when it is not.
- New page component test: loading skeleton, error + retry, the rollup line's count,
  the "Chấm điểm" link's `href` includes the session id, table renders from the
  composed hooks.
- "Quản lý bài thu" page test: the conditional link now targets
  `/teacher/submissions/<id>`.
- Grading page test: initial `sessionId` seeded from `?sessionId=` in the URL.
- Lobby page test suite: unchanged behavior (same rows/count, now via the shared
  helper) — existing tests must keep passing unmodified as the regression check.

## 5. Out of scope

No backend changes (all data already flows through existing, teacher-scoped
endpoints). No change to "Quản lý kỳ thi" (Approach A, not chosen). No live/socket
behavior on the new page. No attempt to keep the Grading page's `sessionId` in sync
with a *later* in-place URL change — the entry point here is always a fresh
navigation, not a same-page query update.
