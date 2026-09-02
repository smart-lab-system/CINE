# Design: "Quản lý bài thu" — link to the session lobby when filtered to one session

**Date:** 2026-09-02
**Status:** Approved by user in chat (bounded task — brainstormed and agreed on directly,
written up as a spec per explicit request rather than the usual architectural-path trigger)
**Branch:** `feature/submissions-session-link` (worktree at
`.claude/worktrees/submissions-session-link`)
**Builds on:** PR #19 ("Quản lý bài thu", the cross-session submissions page) and the
existing per-session lobby (`apps/web/src/app/(exam-live)/exam-sessions/[id]/page.tsx`) +
`AttendanceService` (`apps/api/src/agent-connection/attendance.service.ts`).

---

## 1. Why this exists

QA feedback on "Quản lý bài thu" asked for a way to see "who's still missing a
submission" for one exam session, without leaving the page. Investigating first
(reading the actual code, not guessing) found the answer already exists, and more
accurately than a fresh feature on this page would produce it:

- The per-session lobby page already shows
  `{fullySubmitted}/{rows.length} sinh viên đã nộp đủ N file bắt buộc`, plus a full
  per-student × per-deliverable status table below it.
- That page stays viewable after the exam ends — a "Đây là chế độ xem lại" banner
  replaces the live framing once `status` reads as ended, nothing about the roster or
  the count disappears.
- Its roster comes from `AttendanceService.buildView()`, which is built on
  `Enrollment` (the real class roster, present/absent/makeup) — a materially better
  source than "did an agent ever connect to this session", which is all the
  submissions page's own data (`Submission` + `ExamSession`) could offer on its own.

Building a second, independent "who's missing" widget on the submissions page would
mean two answers to the same question, sourced differently, that can silently drift
apart over time. The gap that's real is navigational, not informational: a teacher
who has already filtered this page to one session (the filter already exists) is one
click away from the lobby's answer, but nothing here tells them that page exists or
takes them there.

This was brainstormed directly in chat (bounded path — no separate approaches/
sections walkthrough was needed, the finding above settled the design in one pass);
see that conversation for the full comparison against the alternative (an inline
summary block re-deriving its own "who's missing" baseline) and why it was rejected.

## 2. Goal / non-goal

**Goal:** when the submissions page's exam-session filter is set to exactly one
session, show a link to that session's lobby page.

**Non-goal:** no new summary widget, no new API endpoint, no new baseline/data-source
logic on this page. The lobby page and `AttendanceService` are reused as-is.

## 3. Design

**Where:** a single-line, low-visual-weight row between the filter bar and the
results (table / empty-state / error), visible only when `examSessionId !== 'all'`.

**Content:** short explanatory text plus a link button to
`/exam-sessions/${examSessionId}`, styled like the existing "Phòng chờ" link on
`apps/web/src/app/teacher/exam-sessions/page.tsx:258`
(`Button asChild variant="outline" size="sm"` wrapping a `next/link` `Link`, with the
`DoorOpen` icon) — reusing an established pattern rather than inventing a new one.

**Behavior:**
- Appears/disappears purely from existing filter state (`examSessionId`) — no new
  query, no loading state of its own.
- Independent of `data`/`isLoading`/`error` from the submissions list query — derived
  only from the filter, so it renders correctly even while the list itself is loading
  or errored.
- The selected session's display name is already in `sessionOptions.data.items`
  (fetched for the filter dropdown itself) — reused for the link's label text rather
  than refetched.

## 4. Testing

- Component test: the link is absent when `examSessionId === 'all'`.
- Component test: once a specific session is selected, the link renders with
  `href="/exam-sessions/<that session's id>"`.

## 5. Out of scope (per the same brainstorming conversation)

Column sort, date-range filter, bulk download, manual status edit, delete, Excel
export, link-to-grading — reviewed item by item and deliberately deferred (see chat
log for per-item reasoning: each either has a better future home not yet built, or no
demonstrated need weighed against its risk). None are blocked or touched by this
change.
