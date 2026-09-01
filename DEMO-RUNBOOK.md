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

### The class list is no longer seeded by SQL

`agent:join` refuses any MSSV without an `enrollment` for the session's
course (CLAUDE.md Security rule 1 — knowing the session code is not
access), so a database with no roster admits nobody, including the mock
agent. Until Phase 3 that was patched with `scripts/seed-roster.sql`; the
roster now arrives through the importer, and a demo that reached into
Postgres would be showing a path that no longer exists.

The list is loaded through the UI in **step 5b**, from an .xlsx committed at
`scripts/sample-roster.xlsx`. Nothing to do here.

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

**Already have one on this machine?** Two demo accounts already exist in
this repo's dev Postgres from the verification runs:
`demo-teacher@example.com` / `Demo123456!` (role `teacher`) and
`demo-head@example.com` / `Demo123456!` (role `department_admin` — the
Trưởng khoa). Skip to step 5b.

Both are needed now: a lecturer no longer creates a session for a *course*,
they create one for a **class they were assigned**, and only a Trưởng khoa
creates classes and loads their roster. That split is the point — see
step 5b.

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

## 5b. Set up the class and import its roster (Trưởng khoa)

Everything a lecturer needs before they can run an exam — a class assigned
to them, and a list of who is in it — belongs to the Trưởng khoa. This is
the phase-3 flow, and it replaces the SQL seed entirely.

**Do:** log in at `http://localhost:3000/login` as
`demo-head@example.com` / `Demo123456!`.
**Expect:** `/department/dashboard`. The sidebar has Học kỳ, Môn học, Lớp
học, Phòng thi — and no admin screens, whatever you type in the address bar.

**Do (Môn học):** the dev database seeds `CS101`/`CS201` with no owner, so
they are invisible here by design. Either create your own course under an
existing học kỳ, or log in as an admin and assign one from
`/admin/unowned-courses`. Creating one is faster.
**Expect:** the course appears in the list, owned by you — ownership comes
from the logged-in account and is never accepted from the form.

**Do (Lớp học):** "Thêm lớp", pick the course, name it `Nhóm 01`, and
choose **Demo Teacher** as giảng viên phụ trách.
**Expect:** the row appears with the lecturer's name.
**If not:** an empty giảng viên dropdown means no account has role
`teacher` — create one as in step 5.

**Then log in as the LECTURER** (`demo-teacher@example.com`) and open
**Lớp của tôi** → the class → **Danh sách SV**.

The roster belongs to the lecturer, not the Trưởng khoa: they are the one
the training office sends the file to, and the one who finds out on exam day
that it is wrong. A head can read the list — they need their department's
headcounts — but exactly one person writes it, so two people can never
disagree about who maintains it.

**Do (roster):** pick the file `scripts/sample-roster.xlsx`.
**Expect:** a grid preview with real spreadsheet column letters. The file
has a title row, then headers, so set **Số dòng tiêu đề = 2**, **Cột MSSV =
Cột B**, **Cột họ tên = Cột C**. The review then reads
`Thêm 22 · Đổi tên 0 · Giữ nguyên 0`. Click "Xác nhận nhập danh sách".
**Expect:** `Đã nhập xong: thêm 22, cập nhật 0, giữ nguyên 0`, and the
"Đang có trong lớp (22)" table below fills in.

The file never reaches the API — it is parsed in the browser and posted as
JSON (Security rule 5). Nothing is written until that last click.

**Worth showing, three things:**

1. **Import the same file again.** `Giữ nguyên 22`, nothing changes.
2. **Import `scripts/sample-roster-bad.xlsx`.** One MSSV has spaces in it;
   the whole file is refused and the offending row is named. 22 of 23 would
   give a headcount that looks healthy and is not.
3. **Import a file with a student removed** (delete a row from a copy).
   They are listed under "không có trong file" and **kept**. Removing them
   takes ticking the box — deleting an enrollment locks that student out of
   the exam, and the mistake surfaces on exam day.

**Do (one student by hand):** in **Thêm thủ công một sinh viên**, type an
MSSV and a name. For the late transfer and the correction — the cases where
sending the whole file again would be theatre. The typed row is held to the
same MSSV rule as a row of the file, and the row's bin icon is the undo.

**If not:** "Không đọc được file" means it is not a real .xlsx (an old .xls
or a renamed .csv). Regenerate the fixtures with
`pnpm --filter web make:sample-roster`. A **403** on import means you are
logged in as the Trưởng khoa — switch to the lecturer who teaches the class.

## 6. Log in through the real UI

**Do:** log out of the Trưởng khoa account, then open
`http://localhost:3000/login` and log in as `demo-teacher@example.com`.
**Expect:** redirected to `/teacher/dashboard` (the demo account from step
5 is a `teacher`; an `admin` account instead lands on `/admin/dashboard` —
login redirects by role, and `middleware.ts` independently re-checks role
on every navigation, so a teacher can never land in `/admin/*` or vice
versa). An `access_token` cookie is set either way (devtools → Application
→ Cookies, or just proceed — step 7 will 401 immediately if it wasn't).
**If not:** "Sai email hoặc mật khẩu." means the hash/password don't
match — regenerate the hash in step 5 and re-insert (or `UPDATE
examcollect.account SET password_hash = '<new-hash>' WHERE email = '...'`).

## 7. Create a real exam session

**Do:** from the dashboard, click "Tạo phiên thi" in the sidebar (or go
straight to `http://localhost:3000/teacher/exam-sessions/new`). Fill in:
- **Tên phiên thi**: anything, e.g. `Demo — Kiểm tra cuối kỳ`.
- **Lớp thi**: the class from step 5b, shown as `<mã môn> — Nhóm 01
  (22 SV)`. Only classes assigned to *this* lecturer appear, and the course
  is derived from the class server-side — a lecturer picks the class they
  teach, never a course. An empty dropdown means no class names this
  account; go back to step 5b.
- **Phòng thi** / **Loại kỳ thi**: any option — the dev DB seeds 3 rooms
  (migration `AddCourseRoomExamType`). If Phòng thi is empty, `GET /rooms`
  failed; check the API terminal.
- A class with **0 SV** still creates a session, with a warning: it is
  legal, but nobody would get in, and finding that out at the start of an
  exam is the failure the warning exists to prevent.
- **Thời gian bắt đầu / kết thúc**: pick a window that covers *right now*
  through at least a few hours out (start ≤ now ≤ end). A session is
  created immediately joinable (`status = 'active'`, no separate
  publish/activation step) — but `agent:join` still checks this time
  window server-side, so a start time in the future or an end time
  already passed will still reject joins even though `status` is active.
- **File bắt buộc nộp**: 2-3 filenames, e.g. `baitap1.py`, `baocao.docx`,
  `ket_qua.txt` (click "Thêm file" to add more rows).
- **Tên file riêng cho từng sinh viên**: click the `{MSSV}` / `{TEN}` /
  `{PHONG}` / `{SOMAY}` chips to build a pattern like
  `{PHONG}_{MSSV}_{TEN}.docx`. A preview under the field shows what one
  student would get. The server fills these from the roster and the room, so
  every student is told a different, finished filename and nobody types one.
  Diacritics are stripped: "Nguyễn Văn An" becomes `NguyenVanAn`.
  `{SOMAY}` is the machine's own hostname — useful only if the lab names
  its machines after seats; it renders `UNKNOWN` otherwise, visibly.

Submit ("Tạo phiên thi").
**Expect:** a confirmation screen showing a large 6-character **code**
(e.g. `G1ZFZ6`) and a "Vào phòng chờ phiên thi" link. **Write the code
down** — every agent below needs it.
**If not:** a red "Không tạo được phiên thi" banner — open devtools →
Network and check the `POST /exam-sessions` response body for the actual
validation error (usually a filename with a disallowed character, or
end time not after start time).

## 7b. Upload the exam paper

**Do:** open the session (step 8's lobby link) and use the **"Đề thi và tài
liệu"** card to upload any PDF or dataset.
**Expect:** the file listed with its size, and a blue notice naming the time
students will first be able to open it.

**The thing worth showing:** uploading does NOT publish. An agent that
connects early gets a COUNT of materials on its join ack and nothing else;
the files come from a separate request that re-reads the clock every time
(CLAUDE.md Security rule 2 — "allowed into the lobby" and "allowed to see
the exam" are different questions). Putting the files on the join ack is
precisely the leak the rule names, and the join ack is checked in the test
suite for not containing a filename.

Delete removes the object as well as the row — a paper the teacher believes
they deleted must not stay readable to anyone holding an old signed URL.

**If not:** an upload that fails at the confirm step means the PUT to MinIO
did not land; check `docker compose ps` and the browser's Network tab. No
row is written until the object is really there, on purpose.

## 8. Open the lobby

**Do:** click "Vào phòng chờ phiên thi" from step 7 (or go straight to
`http://localhost:3000/exam-sessions/<id>`).
**Expect:** "Phòng chờ phiên thi", `Số sinh viên đã tham gia: 0 (0 đang kết
nối)`, "Chưa có sinh viên nào tham gia." Leave this tab open — it updates
live via WebSocket, no refresh needed for the next steps.
**If not:** a red "Không thể mở phòng chờ" card means the `teacher:subscribe`
WebSocket call failed — almost always an expired/missing login (re-do step
6) or opening someone else's session id.

## 8b. The three groups, and the headcount

The lobby is not one list of whoever connected. It answers three separate
questions, because an invigilator standing in the room does three separate
things about them.

**Do:** with the real agent from step 9 connected (come back here after it),
look at the "Điểm danh" card.
**Expect:**
- **Có mặt** — students of this class who are connected. Nothing to do.
- **Chưa vào phòng** — on the class list and not here. These are the names
  to call out. A student who connected and then dropped shows here too, with
  the time they were lost, because "never turned up" and "their machine
  died" need the same action but not the same explanation.
- **Thi bù (lớp khác)** — connected, enrolled in this course through a
  DIFFERENT class. They show with their home class, so they read as "from
  Nhóm 05, sitting here" rather than as an unfamiliar name. To see this,
  import a second class's roster (step 5b) and join with one of its MSSVs.

All of it comes from the server's log, not from this browser tab. **Refresh
the page** — the room is still there. Before this it was page state, and one
refresh emptied it.

**Do:** press **Chốt sĩ số**.
**Expect:** "Đã chốt N lúc HH:MM:SS". It does NOT close the session.

**Then start one more agent.** It joins fine, and gets a red badge: **"Mới
vào sau khi chốt"**. Now Ctrl+C an already-counted agent and restart it — it
gets a blue **"Kết nối lại sau khi chốt"** instead. Two labels, never one:
a machine that crashed and came back is routine, someone who appeared after
the count is the case the count exists to catch.

**After finalize (step 12),** if more students submitted than were counted,
the card names them — MSSV, name, home class, and when they connected.
That is the question the class list and the submission list cannot answer
on their own.

**If not:** an empty "Điểm danh" card with "chưa có danh sách để đối chiếu"
means the session has no class — it predates step 5b's flow. Create a new
session through the form.

## 9. Run the real agent

**An Electron app is replacing this CLI** (see
`docs/superpowers/specs/2026-09-01-student-agent-electron-design.md`) —
`pnpm --filter agent dev` launches it: a real window instead of a
terminal, the same MSSV + session-code fields, native notifications
instead of console lines. It is not yet the documented path here because
`cli.ts` is the only thing that has ever proven this whole flow
start-to-finish, and it stays that way until the design's §8.4 parity
checklist has actually been walked through against it — do that first if
you're validating the new app, using the steps below as the reference
behavior to match. Once confirmed, `cli.ts` is deleted and this section
gets rewritten around the Electron app instead.

**Do (new terminal):**
```bash
cd apps/agent
npx ts-node src/cli.ts --student-id="SV20120001" --session-code=<YOUR_CODE>
```
**No `--full-name` any more.** The agent asks for MSSV and session code
only; the server answers with the name on the roster. A typed name would
have to be reconciled against the roster spelling ("Nguyen Van A" vs
"Nguyễn Văn A"), which is a guess, so the comparison was removed rather
than solved.

`SV20120001` comes from the roster seeded in step 2. **An MSSV that is not
on the roster is refused** — that is step 9b.

**Expect:** the console confirms the identity before anything else:
```
Xác nhận danh tính: Nguyễn Văn A (MSSV SV20120001).
Nếu KHÔNG phải bạn, hãy thoát ngay và báo giám thị.
Đã tạo N file, sẵn sàng làm bài.
Agent đang chạy nền...          (stays running, does not exit)
```
Check the files:
```bash
ls apps/agent/exam-workspace/SV20120001/
# -> exactly the filenames declared in step 7, all present
```
The **already-open lobby tab** (step 8) updates within ~1s, no refresh:
one row, name/MSSV as passed above, green "Đang kết nối".
**If not:** `[SESSION_NOT_FOUND]` = wrong/mistyped code.
`[SESSION_NOT_ACTIVE]` = the time window from step 7 doesn't cover right
now (a session is active by default, but still time-gated — see step 7).

## 9b. Refuse an outsider, then let them in on purpose

The part worth showing: the system refuses someone it should refuse, and a
human can still let them in without anyone editing the database.

**Do (new terminal), with an MSSV deliberately NOT on the roster:**
```bash
cd apps/agent
npx ts-node src/cli.ts --student-id="SV20124444" --session-code=<YOUR_CODE>
```
**Expect:** the agent does not die. It offers the way out and waits:
```
MSSV SV20124444 không có trong danh sách lớp của môn thi này.
Bạn có thể gửi yêu cầu để giảng viên duyệt cho vào thi.
Họ và tên của bạn: _
```
Type a name and a reason. Then:
```
Đã gửi yêu cầu. Đang chờ giảng viên duyệt — KHÔNG tắt cửa sổ này.
```

This is what a leaked session code buys someone on its own: nothing.
Knowing the code is not access (CLAUDE.md Security rule 1).

**Then, in the lobby tab (step 8):** the request appears with the name and
reason given. Approve it, choosing the class. The waiting agent joins by
itself — no restart:
```
Giảng viên đã duyệt. Đang vào phòng thi...
Xác nhận danh tính: <tên vừa nhập> (MSSV SV20124444).
```

**Then show the trail** — a human overriding the machine is never silent:
```bash
docker compose exec postgres psql -U examcollect_admin -d examcollect -c \
  "SELECT actor_id, action, new_value FROM examcollect.audit_log
     WHERE action = 'exam_session.access_granted'
     ORDER BY occurred_at DESC LIMIT 1;"
```
**Expect:** one row naming the approving teacher, the MSSV, the reason they
gave, and the class they were assigned to.

**If the agent exits with "không có terminal":** it was started without an
interactive console (piped or redirected stdin). Run it directly in a
terminal window — it refuses to hang waiting for input that cannot arrive.

## 10. Run the mock agent (batch load)

The mock identities (`MSSVTEST01`…`MSSVTEST20`) are exactly the first 20
rows of `scripts/sample-roster.xlsx`, imported in step 5b, so `--count 20`
works as-is. Raising `--count` past 20 means adding rows in
`apps/web/scripts/make-sample-roster.mjs`, regenerating and re-importing —
otherwise the extra agents get `NOT_ENROLLED`, which is the rule working.

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

## 11b. Snapshot backup and restore on a wiped machine

Reconnect is two cases that look alike. A network blip with the machine
intact **already worked** — the agent creates files with the `wx` flag, so
work is never truncated. This is the other one: the machine is wiped or
swapped and the work is simply gone.

**Do:** with an agent running from step 9, write something real into its
workspace file:
```bash
echo "bai lam that cua sinh vien" > apps/agent/exam-workspace/SV20120001/baitap1.py
```
Wait for the snapshot (four minutes), or force one immediately:
```bash
pnpm --filter agent exec ts-node src/verify-backup.ts <YOUR_CODE> SV20120001
```
**Expect:** `8/8 checks passed`. That script drives the real
uploadSnapshot/restoreBackup against real MinIO and checks all three rows of
the design's table — an intact machine keeps its work, a wiped one gets it
back, and a machine whose files exist but are empty gets it back too.

**Do (by hand, the way it really happens):** Ctrl+C the agent, delete its
workspace entirely, and start it again with the same MSSV:
```bash
rm -rf apps/agent/exam-workspace/SV20120001
cd apps/agent && npx ts-node src/cli.ts --student-id=SV20120001 --session-code=<YOUR_CODE>
```
**Expect:**
```
Máy chủ báo có bản sao lưu bài làm của bạn. Đang khôi phục...
Đã khôi phục N file từ bản sao lưu.
```
and the file contains what you wrote before the wipe.

**Why the restore runs before the files are created:** the agent creates
every required file empty as part of joining. A rule of "restore what is
missing" would therefore never fire — on a wiped machine the files exist and
are empty — and the student's work would be lost silently in exactly the
case the backup was built for. The rule is content-based instead: empty or
absent is replaced, anything with content is left alone.

**A backup is not a submission.** No Submission row is written; restoring
hands the work back to the student, who submits it normally at finalize.

**If not:** `NO_BACKUP` means no snapshot exists yet for that (session,
MSSV) — take one first. A restore that reports `failed` means MinIO is
unreachable; check `docker compose ps`.

## 11c. Chấm điểm (AI-assisted)

Grading is a SEPARATE screen reached by choosing a session, and that is the
design: collection and grading are two pipelines joined by one explicit
teacher action. A finished session can sit for a week and nothing happens.

**Do:** go to **Chấm điểm** in the sidebar and pick the session.
**Expect:** an empty result table saying nothing has been graded — because
finalizing collected the work and started nothing.

**Do (rubric):** add two criteria, e.g. "Trình bày thuật toán rõ ràng" (5đ)
and "Có kiểm thử cho trường hợp biên" (5đ), then **"Lưu thành phiên bản
mới"**.
**Expect:** "phiên bản 1 · 10 điểm". Save again after editing → **phiên bản
2**, and version 1 is still listed. There is no update button anywhere, and
that is deliberate: changing criteria that existing results cite is what
Security rule 7 forbids.

**Do:** press **"Bắt đầu chấm"**.
**Expect:** "Đã chấm N bài bằng rubric phiên bản 2", then a row per student
with a suggested score, the model name **`keyword-match@1`**, and a
**"Cần giảng viên xem"** badge. Click "Bằng chứng" to see the per-criterion
verdict and why.

**Why every row is flagged:** no AI model is configured, so the local
keyword provider runs. It is not pretending to be a model — it names itself
in every result and its confidence is capped below the auto-approval
threshold, so nothing it produces is ever approved without a human. Wiring a
real provider is one binding in `grading.module.ts`.

**Press "Bắt đầu chấm" again.** Nothing changes: a submission that already
has a result is skipped. One click, one AI opinion.

**If not:** "Môn học này chưa có rubric" means the active rubric belongs to
a different course — the rubric is per COURSE, shared by every class of it.

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
