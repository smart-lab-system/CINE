# Demo Runbook — Exam Live (create session → agent joins → live lobby)

A checklist to run the full exam-live demo end to end: stand up the stack,
log in, create a session, join it with a real agent and a batch of mock
agents, and watch the lobby update live. Verified start-to-finish against a
freshly-booted stack on 2026-08-27, and re-verified after the
session-activation step below was removed (see
`.superpowers/sdd/2026-08-27-exam-live-demo/task-9-report.md` for the full
run log, including the follow-up). Run from the repo root unless a step
says otherwise.

Every step has a **Do** (commands/actions) and an **Expect** (what success
looks like). A short **If not** line covers the one most likely failure.

---

## 0. Prerequisites

- Node 20+, pnpm 9.12.0 (`corepack enable`), Docker Compose v2.
- Branch `feat/exam-live-demo` (or later) checked out — this is where the
  exam-session REST API, the `/exam-live` WebSocket gateway, the lobby UI,
  and `apps/agent` all live.
- `pnpm install` already run at the repo root.

## 1. Start Postgres

**Do:**
```bash
docker compose up -d postgres
docker compose ps
```
**Expect:** `cine-postgres-1` shows `Up ... (healthy)`.
**If not:** wait a few seconds and re-run `docker compose ps` (the
healthcheck needs ~5-10s); if it never turns healthy, `docker compose logs
postgres`.

## 2. API config + schema

**Do:**
```bash
# only if apps/api/.env doesn't already exist
cp apps/api/.env.example apps/api/.env

pnpm --filter api migration:run
```
**Expect:** either `No migrations are pending` (already applied) or a list
of newly-applied migrations, no errors.
**If not:** confirm step 1's Postgres is healthy first — almost every
migration failure at this step is "can't connect," not a schema problem.

## 3. Start the API

**Do (separate terminal, stays running):**
```bash
pnpm --filter api dev
```
**Expect:** log ends with `Nest application successfully started` (once —
not twice), then:
```bash
curl http://localhost:4000/health
# -> {"status":"ok"}
```
**If not — `EADDRINUSE: address already in use :::4000`:** something is
already bound to port 4000, most often an **orphaned dev server left
running from an earlier terminal/session** (this happened during the real
verification run — over a dozen old `nest start --watch` processes had
accumulated from earlier work and one of them was still silently serving
requests while a fresh `pnpm --filter api dev` failed to bind and crashed
in the background). Find and stop it before trusting anything else in this
runbook:
```bash
netstat -ano | grep ":4000" | grep LISTENING   # note the PID in the last column
taskkill //PID <pid> //F                        # Windows; use kill -9 <pid> on macOS/Linux
```
Then re-run `pnpm --filter api dev` and re-check `/health`.

## 4. Start the web app

**Do (separate terminal, stays running):**
```bash
pnpm --filter web dev
```
**Expect:** `Local: http://localhost:3000`, and `curl -I
http://localhost:3000/login` returns `200`.
**If not:** same port-conflict story as step 3, on port 3000 instead —
check with `netstat -ano | grep ":3000"`.

## 5. Get a teacher account to log in with

There's no self-serve registration (deliberate — see README's "Getting a
first admin account"). The first account on any fresh database has to be
inserted directly.

**Already have one on this machine?** A demo account already exists in
this repo's dev Postgres from the verification run:
`demo-teacher@example.com` / `Demo123456!`. Skip to step 6.

**Do (fresh database — generate the hash, then insert):**
```bash
cd apps/api
node -e "require('argon2').hash('Demo123456!',{type:2}).then(console.log)"
# copy the printed $argon2id$... hash, then:
cd ..
docker compose exec postgres psql -U examcollect_admin -d examcollect -c \
  "INSERT INTO examcollect.account (name, email, password_hash, role)
   VALUES ('Demo Teacher', 'demo-teacher@example.com', '<paste-hash-here>', 'teacher');"
```
**Expect:** `INSERT 0 1`.
**If not:** `duplicate key value violates unique constraint` means the
email is already taken — either reuse it (it's the same account) or pick a
different email.

## 6. Log in through the real UI

**Do:** open `http://localhost:3000/login`, enter the email/password from
step 5, submit.
**Expect:** redirected to `/accounts`; an `access_token` cookie is set
(devtools → Application → Cookies, or just proceed — step 7 will 401
immediately if it wasn't).
**If not:** "Sai email hoặc mật khẩu." means the hash/password don't
match — regenerate the hash in step 5 and re-insert (or `UPDATE
examcollect.account SET password_hash = '<new-hash>' WHERE email = '...'`).

## 7. Create a real exam session

**Do:** go to `http://localhost:3000/exam-sessions/new`. Fill in:
- **Tên phiên thi**: anything, e.g. `Demo — Kiểm tra cuối kỳ`.
- **Thời gian bắt đầu / kết thúc**: pick a window that covers *right now*
  through at least a few hours out (start ≤ now ≤ end). A session is
  created immediately joinable (`status = 'active'`, no separate
  publish/activation step) — but `agent:join` still checks this time
  window server-side, so a start time in the future or an end time
  already passed will still reject joins even though `status` is active.
- **File bắt buộc nộp**: 2-3 filenames, e.g. `baitap1.py`, `baocao.docx`,
  `ket_qua.txt` (click "Thêm file" to add more rows).

Submit ("Tạo phiên thi").
**Expect:** a confirmation screen showing a large 6-character **code**
(e.g. `G1ZFZ6`) and a "Vào phòng chờ phiên thi" link. **Write the code
down** — every agent below needs it.
**If not:** a red "Không tạo được phiên thi" banner — open devtools →
Network and check the `POST /exam-sessions` response body for the actual
validation error (usually a filename with a disallowed character, or
end time not after start time).

## 8. Open the lobby

**Do:** click "Vào phòng chờ phiên thi" from step 7 (or go straight to
`http://localhost:3000/exam-sessions/<id>`).
**Expect:** "Phòng chờ phiên thi", `Số sinh viên đã tham gia: 0 (0 đang kết
nối)`, "Chưa có sinh viên nào tham gia." Leave this tab open — it updates
live via WebSocket, no refresh needed for the next steps.
**If not:** a red "Không thể mở phòng chờ" card means the `teacher:subscribe`
WebSocket call failed — almost always an expired/missing login (re-do step
6) or opening someone else's session id.

## 9. Run the real agent

**Do (new terminal):**
```bash
cd apps/agent
npx ts-node src/cli.ts --full-name="Nguyen Van Demo" --student-id="21120099" --session-code=<YOUR_CODE>
```
(Omit any flag to be prompted for it interactively instead.) The session
from step 7 is joinable immediately — no activation step needed in
between.
**Expect:** console ends with `Đã tạo N file, sẵn sàng làm bài.` and
`Agent đang chạy nền...` (stays running, does not exit). Check the files:
```bash
ls apps/agent/exam-workspace/21120099/
# -> exactly the filenames declared in step 7, all present
```
The **already-open lobby tab** (step 8) updates within ~1s, no refresh:
one row, name/MSSV as passed above, green "Đang kết nối".
**If not:** `[SESSION_NOT_FOUND]` = wrong/mistyped code.
`[SESSION_NOT_ACTIVE]` = the time window from step 7 doesn't cover right
now (a session is active by default, but still time-gated — see step 7).

## 10. Run the mock agent (batch load)

**Do (new terminal, real agent from step 9 keeps running):**
```bash
cd apps/agent
npx ts-node src/mock-agent.ts --session <YOUR_CODE> --count 10 --keep-alive
```
**Expect:** console prints `[01/10] ... OK` through `[10/10] ... OK`, then
a summary with `Thành công (agent:join:ack): 10` / `Thất bại: 0`. It stays
running (`--keep-alive`) — leave it. The lobby tab now shows **11 rows**
total (1 real + 10 mock), all green "Đang kết nối",
`Số sinh viên đã tham gia: 11 (11 đang kết nối)`.
**If not:** any `Thất bại > 0` — check the failing agent's error code in
the per-agent output line, same codes as step 9's "If not".

## 11. Disconnect one agent

**Do:** go to the real agent's terminal (step 9) and press **Ctrl+C**.
**Expect:** the CLI prints a disconnect message and exits. Within ~1s the
lobby tab flips that one row's status from green "Đang kết nối" to red
"Mất kết nối" — **the row stays in the table**, it does not disappear.
`Số sinh viên đã tham gia:` stays at `11`; the connected count in
parentheses drops to `10`.
**If not:** the row disappearing entirely (instead of turning red) would
be a real regression — the frontend is supposed to mark, never remove
(`apps/web/src/app/(exam-live)/exam-sessions/[id]/page.tsx`,
`handleAgentDisconnected`). Nothing like this was observed in the verified
run.

## 12. Tear down

**Do:**
```bash
# Ctrl+C the mock-agent terminal (step 10) — disconnects its 10 kept-alive sockets
# Ctrl+C the api dev / web dev terminals (steps 3-4)
docker compose down          # or leave postgres running for next time
```
No cleanup is required in Postgres — the demo teacher account, exam
session, and required-deliverable rows are harmless dev-only data (same
precedent as every earlier task's manual testing in this plan).

---

## Known gaps this runbook works around (not fixed by this task)

- **No self-serve account registration** — step 5's direct SQL `INSERT` is
  intentional (see README's "Getting a first admin account"), not a
  workaround for a bug.

## Fixed during this task's real run

- `apps/api/src/main.ts`: `bootstrap()` had no `.catch()`, so any startup
  failure (hit for real in step 3, above) crashed the process with a raw
  Node stack trace instead of a readable message. Now prints `API failed
  to start: <reason>` and exits `1`. Small, safe, unrelated to the
  EADDRINUSE root cause itself (that's still an operational gotcha, not a
  bug — see step 3's "If not") but makes it, and any future startup
  failure, obvious instead of alarming.

## Fixed since (follow-up, source-level)

- `apps/api/src/exam-session/exam-session.service.ts`: `create()` used to
  leave `status` unset, so it fell through to the column default
  (`'draft'`) and a freshly-created session needed a manual SQL `UPDATE`
  to `status = 'active'` before any agent could join it — that used to be
  step 8 of this runbook. Fixed at the source (commit `e21238a`): `create()`
  now explicitly sets `status: 'active'`, so a session is joinable the
  moment it's created. Re-verified for real after the fix: created a
  session through the real UI and joined it with the real agent CLI with
  zero SQL run in between (see the task-9 report's follow-up section).
  Step 8 (activation) has been removed from this runbook; steps renumbered
  accordingly.
