# Design: Student Agent — from CLI to an Electron app

**Date:** 2026-09-01
**Status:** Approved in chat (package structure, UX mockup, rate-limit
design, teacher-notify broadcast, sequencing) — writing plan next.
**Branch:** `feature/student-agent-app` (worktree at
`.claude/worktrees/student-agent-app`, branched from `origin/main` at
`78ae94c`, after PR #6 merged)
**Builds on:** the whole submission/roster/attendance/backup/materials
pipeline delivered in PR #4, #5, #6 — this phase does not add a server
capability that didn't already exist, except the two named in §5 and §6.

---

## 1. Why this phase exists

Every piece of student-facing logic already exists and already works —
`apps/agent/src/cli.ts` proves it, end to end, against the real API. What it
lacks is a face. A student today runs a terminal command, reads console
output to know whether they are in the exam, and has no way to see "you are
now checked in" except a line of text scrolling past.

CLAUDE.md named Electron for this from the start: *"just a single screen to
enter 3 fields... then minimize to the system tray... passively display a
small checklist... NO confirm/select-file button of any kind."* That text
also still says 3 fields including Full Name — written before the
roster/enrollment redesign (PR #4/#5) made the server the authority on a
student's name and deliberately stopped asking for one to avoid fuzzy-match
identity comparison. This phase corrects that drift explicitly (§3) rather
than silently picking a side.

Nothing about the underlying logic needs rewriting. `snapshot.ts`,
`backup.ts`, `exam-materials.ts`, `submission-uploader.ts` are already pure
Node modules with no terminal dependency — they read/write files and talk to
one socket. The only things tied to a terminal are `promptMissing`,
`promptAccessRequest`, and every `console.log`/`console.warn` used as a
notification. This phase's job is narrow: give that logic a window instead
of a terminal, and give the student a status they can see instead of read.

## 2. Goals / non-goals

**Goals**

- Replace `cli.ts` with an Electron app: join screen, tray, native
  notifications, a detail window — matching the approved mockup
  (https://claude.ai/code/artifact/ca75c73c-bd80-48e0-87b5-acba3cc7183c).
- Reuse every existing Node module in `apps/agent/src/` unchanged.
- Field-level input constraints matching the real backend rules (§5), not
  invented ones.
- Server-enforced, escalating rate limiting on `agent:join`, keyed by MSSV
  (§5.2) — the existing per-socket limiter does not survive a reconnect and
  is not real spam protection.
- A live signal to the teacher when a join fails for `SESSION_NOT_ACTIVE`
  (§6) — the one failure mode that both reaches the server and is not the
  student's fault.
- `cli.ts` deleted once the app has full parity, verified.

**Non-goals**

- **Changing what CLAUDE.md calls "minimal."** No confirm/select-file
  button anywhere; the detail window is read-only.
- **A separate "điểm danh" action.** `agent:join` already writes attendance
  server-side (`AttendanceService.recordJoin`); this phase only makes that
  fact visible on screen. Confirmed with the user — join *is* check-in.
- **Fixing the pure-network-failure case.** If the agent never reaches the
  server, there is no channel to notify the teacher through — that is a
  physical limit, not a gap. The UI states this plainly (mockup group 1b)
  and points the student at the invigilator directly. The existing
  "Chưa vào phòng" group in the teacher's attendance view (built in PR #6)
  is the only signal that already exists for this case, and stays as-is.
- **Persisting the new `SESSION_NOT_ACTIVE` teacher signal.** Ephemeral
  broadcast only (§6.2) — no new `agent_connection_event` type, no
  migration.
- **Packaging/signing/auto-update.** Out of scope for this phase; `pnpm
  --filter agent dev` (electron-vite dev mode) is the target for testing.
  A packaged installer is a later, separable concern.
- **Touching `apps/web` or the two unrelated findings from baseline**
  (the gitlink and the `variant="secondary"` type error) — both reported
  separately, neither blocks this work.

## 3. The join screen asks 2 fields, not 3

`AgentJoinDto.fullName` is accepted-and-ignored server-side, by design
(`apps/api/src/exam-session/dto/agent-join.dto.ts`'s own comment: *"Agents
may stop sending it"*). Showing an ignored field risks the exact confusion
the roster redesign removed — a student typing a name, then seeing a
different one confirmed back. **Decision: MSSV + Mã phiên thi only.** Họ
tên is asked exactly once, only inside the access-request flow (§4, state
f), which is the one place a typed name is real input with no roster row to
fall back on.

## 4. The join flow — 8 states, one window

Mockup: https://claude.ai/code/artifact/ca75c73c-bd80-48e0-87b5-acba3cc7183c

| State | Trigger | Student sees | Notes |
| --- | --- | --- | --- |
| a — Form | default | 2 fields + Xác nhận | §5 constraints live on the inputs |
| b — Đang xác nhận | submit | spinner | |
| c — Đã điểm danh | `agent:join:ack` | roster name, "Đã điểm danh lúc HH:MM", auto-minimize | this *is* the attendance confirmation |
| d — Sai thông tin | `SESSION_NOT_FOUND` / `INVALID_INPUT` | error + Quay lại | counts toward rate limit (§5.2) |
| d2 — Tạm khoá | `RATE_LIMITED` (new) | countdown from server `retryAfterMs`, fields disabled | client never invents the countdown |
| e — Phiên chưa mở/đã đóng | `SESSION_NOT_ACTIVE` | reason + Quay lại | does **not** count toward rate limit; also fires §6's teacher broadcast |
| f — Access request | `NOT_ENROLLED` | họ tên + lý do form | existing flow, UI-only change |
| g — Đang chờ duyệt | request sent | spinner, wait message | existing flow |
| — Connect thất bại | `connect_error` (socket-level) | "không kết nối được, tìm giám thị" | see §2 non-goals — cannot notify the teacher through this channel |

Error → state mapping is the classification table agreed in chat, restated
here as the single source of truth for implementation.

## 5. Field validation and rate limiting

### 5.1 Input constraints — matching real rules, not invented ones

Verified against `apps/api/src/common/student-mssv.ts` and
`apps/api/src/exam-session/exam-session.types.ts`:

- **MSSV**: `^[A-Za-z0-9]{4,20}$` (`STUDENT_MSSV_REGEX`). The input filters
  to this character class and caps at 20, matching every real MSSV in the
  system (`SV20120001`, `MSSVTEST01`, ...) — explicitly **not** an 8-digit
  mask, which would reject every MSSV currently in use.
- **Mã phiên thi**: exactly 6 characters, `EXAM_SESSION_CODE_ALPHABET =
  'A-Z0-9'`. Input auto-uppercases on type and caps at 6.

Both are client-side conveniences only — the server DTOs (`AgentJoinDto`)
remain the actual enforcement, unchanged.

### 5.2 Rate limiting — new, server-side, per-MSSV, escalating

The existing limiter (`ExamSessionGateway.isAgentJoinRateLimited`) stays:
5 attempts / 60s per **socket.id**, silent disconnect. It catches a single
connection hammering the handler without reconnecting.

**New, additional layer**, because the existing one is cleared on every
disconnect (`handleDisconnect` calls `agentJoinAttempts.delete(client.id)`)
and `socket.io-client`'s own `reconnection: true` means a determined actor
resets it for free by reconnecting.

- **Key**: MSSV, lowercased (matches how `citext` already compares it in
  the DB — `sv001` and `SV001` are one entry, not two).
- **Counts as a failure**: `SESSION_NOT_FOUND`, `INVALID_INPUT` only.
  **Does not count**: `NOT_ENROLLED` (penalizing it would undermine the
  access-request valve PR #4/#5 built specifically to not lock out a
  legitimate student) or `SESSION_NOT_ACTIVE` (a patient early student
  retrying is not spam).
- **A successful join clears the counter** for that MSSV.
- **5 cumulative failures → 5 min lockout.** The counter is not
  time-windowed on the counting side (unlike the existing per-socket
  limiter) — it only resets on a successful join or a lockout firing.
  **Each subsequent lockout doubles the previous one** (10 → 20 → 40 →
  60 min, capped at 60): a typical exam session runs 1-3 hours, so a
  student who reaches the cap has failed far past what a mistyped code
  explains, and 60 minutes is most of a session without being permanent.
  In-memory, per process — matches `AccessRequestStore`'s existing pattern;
  does not survive a server restart, an accepted limitation at this
  project's scale (CLAUDE.md: ~10 real concurrent connections, no Redis).
- **An attempt made while already locked is answered with the same
  `RATE_LIMITED` + the remaining time — it does not extend the lockout or
  count as a further violation.** Letting it extend the timer would turn
  the guard into its own attack: anyone could keep a real student's MSSV
  perpetually locked out just by continuing to hit it during the lockout
  window. The clock only restarts on the *next* failure after the lockout
  has actually expired.
- **New error code `RATE_LIMITED`** added to `AgentJoinErrorCode`, with a
  `retryAfterMs` field on the error payload — unlike the existing silent
  disconnect, this one has to reach the UI so state d2 can render a real
  countdown, not a client-guessed one.

## 6. Notifying the teacher when a join fails for `SESSION_NOT_ACTIVE`

### 6.1 The event

New: `lobby:join_attempt_failed`, broadcast to `teacherRoom(session.id)`,
payload `{ studentId, code: 'SESSION_NOT_ACTIVE', occurredAt }`. No more PII
than `lobby:student_joined` already carries.

### 6.2 Ephemeral, not durable

**No new row, no migration.** `agent_connection_event`'s `event_type` enum
is append-only and carefully scoped to answer "who is in the room" — adding
a `join_attempt_failed` value there would extend a domain designed for a
different question, for a signal whose entire value is "right now," not
"on record." If a durable history of failed attempts is wanted later, that
is a separate, explicitly-scoped addition.

### 6.3 Must be throttled too

Broadcast at most once per MSSV per 30s (reuse the same tracking structure
as §5.2, without counting toward the lockout — this is a *notify* concern,
not a *block* concern). Otherwise one early, impatient student retrying
every few seconds floods the teacher's lobby with one repeated event.

## 7. Package structure and process boundary

```
apps/agent/
├── src/                        # unchanged, except:
│   ├── access-request.ts       # drop promptAccessRequest (readline);
│   │                           #   keep sendAccessRequest as-is
│   ├── agent-contract.ts       # NEW — AgentJoinPayload / AgentJoinAck /
│   │                           #   AgentJoinErrorCode / AgentJoinError,
│   │                           #   moved out of cli.ts so mock-agent.ts
│   │                           #   has a type source once cli.ts is gone
│   ├── session-controller.ts   # NEW — cli.ts's orchestration, readline
│   │                           #   replaced by a callback/IPC-friendly API
│   ├── mock-agent.ts           # unchanged behavior; imports types from
│   │                           #   agent-contract.ts instead of cli.ts
│   └── verify-backup.ts        # unchanged
│
└── electron/                   # NEW
    ├── main/                   # owns socket.io-client, fs, session-controller
    ├── preload/                # contextBridge only — no raw Node API surface
    └── renderer/                # React + Tailwind (tokens copied from
                                  #   apps/web/src/app/globals.css)
```

`contextIsolation: true`, `nodeIntegration: false`. Renderer sends exactly
one of: join, resend-access-request, quit. Main pushes state (connection,
join result, file checklist, backup/materials status, notification log) and
fires native `Notification`s.

`cli.ts` is deleted in Phase 3, once parity is confirmed — not before.

## 8. Sequencing

**Phase 1** — Electron shell (main/preload/renderer scaffold via
electron-vite) + `agent-contract.ts` + `session-controller.ts` + the 8-state
join screen (§4) with §5's constraints + tray minimize + native
notifications for the core lifecycle (join success, disconnect, exam
finalize, submission summary) + both server changes (§5.2 rate limit,
§6 broadcast) with their own e2e tests.

**Phase 2** — Detail window (checklist, backup status, materials status,
countdown, notification log) reachable only via the tray icon + native
notifications for backup/materials events.

**Phase 3** — Access-request as a form (state f/g) replacing the readline
prompt; delete `cli.ts`; repoint `mock-agent.ts`'s type imports; update
`DEMO-RUNBOOK.md`'s agent-launch steps.

## 9. Testing

- `session-controller.ts`: unit tests, no Electron needed — same pattern as
  `apps/agent/src/snapshot.test.ts`.
- §5.2 and §6.1: e2e against a real socket, same pattern as every suite in
  `apps/api/test/*.e2e-spec.ts` — verify RED first (no lockout after 4
  failures; lockout after 5; `NOT_ENROLLED`/`SESSION_NOT_ACTIVE` never
  incrementing the counter; the broadcast firing once per MSSV per 30s).
- Electron shell/tray/native notifications: no automated coverage —
  CLAUDE.md already states this project has no CI and verification is
  manual. Run via `pnpm --filter agent dev` against the real API, same as
  every other phase's live verification in this engagement.

## 10. Deliberately left for later

- Packaging (electron-builder, code signing, installer) — dev-mode launch
  is the target for this phase.
- Persisting `join_attempt_failed` history (§6.2).
- A configurable rate-limit cap/backoff curve — the numbers in §5.2 are a
  starting point, not tuned against a real lab.
- The two unrelated `main`-branch findings from this phase's baseline check
  (gitlink tracking, `Button variant="secondary"` type error) — reported
  separately, fixed only if the user asks.
