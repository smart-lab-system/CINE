# Design: Academic Resources & Roster Verification

**Date:** 2026-08-29
**Status:** Reviewed by user; revised on that review (sequencing, `super_admin`,
orphan courses, restore condition, late-arrival labels) and awaiting sign-off
**Branch:** `feature/resources-and-roster` (worktree at `.claude/worktrees/resources-and-roster`)
**Builds on:** the submission module (`docs/superpowers/plans/2026-08-27-exam-live-demo.md`
and the submission phase merged in PR #4/#5), which delivered the working
exam → collection pipeline this phase makes trustworthy.

---

## 1. Why this phase exists

The collection pipeline works, and that is exactly what makes its gap
visible. Today the system collects whatever arrives. It cannot answer:

- how many submissions *should* have arrived
- whether this MSSV belongs to this class at all
- whether this person is sitting a make-up exam from another class
- why 45 students were in the room but 46 files came back

`agent:join` currently accepts **any** student ID paired with a valid
session code — no `Enrollment` check — which is a standing violation of
CLAUDE.md Security rule 1 ("a leaked session code alone must not grant
access"). `enrollment` and `class_roster` both exist and are both empty;
nothing imports into them and no code queries them.

This phase supplies the missing source of truth (who *should* be there),
enforces it, and gives the invigilator a pre-exam view they can act on
while there is still time to act.

## 2. Goals / non-goals

**Goals**

- A third role, Trưởng khoa, with a real area and real scope.
- CRUD for the academic resources an exam session is built from.
- Excel import producing the roster that everything else verifies against.
- `agent:join` enforcing enrollment, with a human override path.
- Durable attendance, a pre-exam roll view, and a headcount baseline.
- Periodic snapshot backup, so a wiped machine can be restored on reconnect.

**Non-goals** — deliberate, each with its reason:

- **Per-student filename templates** (`{MSSV}_{HoTen}.docx` and variants).
  Needs the roster this phase creates; scheduled as the next phase.
- **Exam materials + INSTRUCTIONS distribution.** Independent of everything
  here; own phase.
- **Reports from lecturer to Trưởng khoa.** The traversal
  (`class → course → department_head_id`) exists after this phase, but a
  report needs grading data, which the grading module has not produced yet.
  Building it now yields an empty screen.
- **Multi-class exam sessions.** Confirmed with the user: one session, one
  class. Students from other classes attend as make-up cases (§5.3), which
  is a different thing from a session spanning two classes.

## 3. Roles and scope

### 3.1 Three roles, three areas

`account.role` already carries `department_admin` in the DB enum, so no
schema change is needed for the role itself. What is missing is everything
around it — and what exists today is a trap: `middleware.ts` groups
`department_admin` with admins and routes it to `/admin/*`, while
`RolesGuard` matches role strings exactly, so `@Roles('admin')` refuses it.
A Trưởng khoa account today lands on an admin page where every API call
returns 403.

| Role | Area | Menu |
| --- | --- | --- |
| `admin` | `/admin` | Tài khoản, AI, Chi phí, Audit log |
| `department_admin` | `/department` *(new)* | Học kỳ, Môn học, Lớp học, Phòng thi |
| `teacher` | `/teacher` | Kỳ thi, Bài thu, Chấm điểm |

`middleware.ts` branches three ways instead of two.

**`super_admin` is already the same trap, verified not assumed.** An earlier
draft of this document said it "keeps its current behaviour … so this change
cannot introduce a second trap". That was asserted, not checked. Checking it:
the entire API contains exactly two `@Roles(...)` values — `'admin'` on
accounts and `'teacher'` on exam-session and submission. **No handler
anywhere accepts `super_admin`**, while `middleware.ts` routes it into
`/admin/*`. A `super_admin` account would land on an admin page where every
call returns 403 — identical to `department_admin`. It is latent only
because no account carries either role (0 rows, verified).

Fixing that one role by name would leave the same hole open for the next
enum value someone adds. So the fix is general: **a role with no configured
area is sent to an explicit "tài khoản chưa được gán vai trò" page**, not
into an area whose APIs will refuse it. The mapping role → area becomes
exhaustive and anything unmapped fails visibly instead of silently. That
covers `super_admin` today and any future addition for free.

The create-account form gains `department_admin`, labelled "Trưởng khoa".

### 3.2 Scope: one column, no new table

A `department` table was considered and rejected. The scoping surface is
smaller than it first appears because everything already hangs off
`course`:

```
account(teacher) ──teacher_id── class ──course_id──> course ──semester_id──> semester
                                  ↑
                        exam_session, enrollment also carry course_id
```

So the only fact the schema lacks is *who owns a course*:

```sql
course.department_head_id → account   -- nullable, see below
```

`class`, `exam_session` and `enrollment` all inherit scope through
`course_id`. `semester` and `room` are university-wide and carry no scope
column at all.

The column is **nullable**, not NOT NULL, because there is nothing to
backfill it from: no `department_admin` account exists yet, so the two
migration-seeded courses (CS101, CS201) have no owner at the moment the
migration runs. A course with no head belongs to nobody and is listed to
nobody; it becomes visible once a Trưởng khoa is assigned. The dev reset
script and DEMO-RUNBOOK gain a step assigning the seeded courses to the
demo Trưởng khoa. Tightening to NOT NULL is a follow-up once no unassigned
course remains.

**Orphans must not be invisible.** "Belongs to nobody, listed to nobody" is a
silent failure: a course nobody can see is also a course nobody can assign,
which makes the two seeded courses a bootstrap deadlock. Two things close it:

- A course created through the new UI always takes its creator's id, so an
  orphan can only ever be a legacy row, never a newly produced one.
- The FK is `ON DELETE RESTRICT`, so deleting a head who owns courses is
  refused — orphaning by deletion cannot happen either.
- Admin gets a read-only **"Môn học chưa có chủ"** list with an assign
  action, plus a count surfaced on the admin dashboard. Assigning ownership
  is an administrative act, not academic authoring, so this does not
  contradict §3.4.

Rejected alternatives, recorded so this is not relitigated:

- **A `department` table.** Adds a table and a CRUD screen to store a name
  and allow multiple managers per department — neither is required by the
  three-role model. Reversible later: `CREATE TABLE department`, then
  `INSERT … SELECT DISTINCT department_head_id FROM course`, then swap the FK.
  One mechanical migration.
- **A many-to-many `roles`/`user_roles` model.** A prior, now-abandoned
  schema exploration on `worktree-master-data-module` used this, and it
  would handle a lecturer teaching across departments. Not adopted, because
  the confirmed model is one department per person. If cross-department
  teaching ever becomes real, that branch's design is the reference.

### 3.3 Enforcement: guard for the role, service for the ownership

No new mechanism. The project already separates these in
`ExamSessionService.findByIdForOwner(id, teacherId)`:

- **Guard** — `@Roles('department_admin')`: is the caller a Trưởng khoa?
- **Service** — `findByIdForHead(id, headId)` → 404 if absent, 403 if not
  theirs: is this course theirs?

`semester` and `room` are global, so they need only the guard layer.

### 3.4 Who manages what

| Resource | CRUD | Scope |
| --- | --- | --- |
| `semester` | Trưởng khoa | university-wide |
| `room` | Trưởng khoa | university-wide |
| `course` | Trưởng khoa | `department_head_id` |
| `class` | Trưởng khoa | inherited via `course_id` |
| `exam_session` | Giảng viên | existing `teacher_id` |

Admin manages accounts, AI, cost and audit — no academic data. Putting term
dates and lab names on a systems role would be modelling the wrong person;
Trưởng khoa is the only academic-administrative role in the model.

`semester` and `room` being globally writable means two department heads
share one namespace. `semester.name` and `room.name` have **no unique
constraint today** (verified), so two heads can each create
"Học kỳ 1 2026-2027" and their courses end up on different terms that look
identical. This phase adds unique constraints on both. Deletion is already
safe (`ON DELETE RESTRICT` blocks removing a room with sessions); renames
are visible through `audit_log`.

## 4. Data model changes

### 4.1 `class_roster` and `enrollment` are the same table

| | `class_roster` | `enrollment` |
| --- | --- | --- |
| unique key | `(course_id, student_mssv)` | `(course_id, student_mssv)` — identical |
| `home_class_id` | yes | yes |
| `student_name` | yes | no |
| `home_teacher_id` | no | yes (derivable from `class.teacher_id`) |

Same natural key, same grain, same source (one Excel file). CLAUDE.md
describes roster as the raw import and enrollment as the authenticated
source, but no step converts one into the other — no code, no process, and
both are empty.

**Resolution: drop `class_roster`, keep `enrollment`, add `student_name`.**
`enrollment` is the name Security rule 1 and the whole documented flow use.
`class_roster` holds 0 rows, so dropping it costs nothing.

`home_teacher_id` stays despite being derivable: it is a point-in-time
record, and if a class changes lecturer later, submissions collected
earlier must still route to whoever was responsible then.

### 4.2 Session ↔ class, without moving the auth boundary

This is the change most likely to break the architecture if done carelessly.

`exam_session` gains `class_id` (**nullable**), used only to answer *who was
expected*. A session with no class has no expected roster, so §6 degrades
to what the lobby shows today — connected students, no headcount, no
make-up detection. Sessions created through the new form always carry one;
nullable exists for the sessions that predate this phase. **Authentication stays at course level via `enrollment`**, exactly
as CLAUDE.md requires — that is why `enrollment` was designed per-course in
the first place, and it is what makes make-up exams work.

### 4.3 Full list of schema changes

```
+ course.department_head_id       → account, nullable
+ enrollment.student_name         varchar(150) NOT NULL (table is empty; no backfill)
+ exam_session.class_id           → class, nullable
+ exam_session.attendance_confirmed_at    timestamptz null
+ exam_session.attendance_confirmed_count int null
+ unique (semester.name), unique (room.name)
- drop table class_roster
~ submission.home_class_id / home_teacher_id → restore NOT NULL (§5.4)
```

No new tables. `agent_connection_event` already exists, unused, and is
written to for the first time in §6.

## 5. Verification at collection time

### 5.1 The agent stops asking for a name

Once a roster exists, comparing a typed name against it is a guessing
problem — "Nguyễn Văn A" / "Nguyen Van A" / "NGUYỄN VĂN A" are one person,
and fuzzy matching is precisely what this project forbids.

So the comparison is removed rather than solved. The agent asks **MSSV +
session code**; the server answers with the authoritative name:

> "Bạn là Nguyễn Văn A — CS101 Nhóm 03. Đúng chứ?"

The student cannot mistype their own name, there is nothing to match
fuzzily, and the agent gets simpler. This changes the `agent:join` contract
and therefore `apps/agent/src/cli.ts` and `mock-agent.ts`.

The name field does not disappear entirely — see §5.3, where a student with
no roster row has no authoritative name and must supply one.

### 5.2 Three outcomes on join

| Condition | Result |
| --- | --- |
| Enrolled in the course, `home_class_id` = session's class | normal join |
| Enrolled in the course, different class | join, flagged **make-up** |
| Not enrolled in the course | **refused**, new code `NOT_ENROLLED` |

The last row is Security rule 1 enforced for the first time.

A student who *is* enrolled but arrives late joins normally with
`joined_late` set — no approval step. CLAUDE.md Phase 2 step 6 says late
join needs no special action, and adding friction for a fully legitimate
student is the wrong trade. Less time is automatic: `end_time` is fixed.

### 5.3 Access request — the safety valve the refusal requires

Enforcing enrollment creates a failure mode that did not exist before: a
legitimate student missing from the imported file cannot sit the exam at
all, and this is discovered at exam time when nothing can be fixed. The
override path is not optional; it is the counterweight to the rule.

```
MSSV found     → "Bạn là Nguyễn Văn A — CS101 N03. Đúng chứ?" → join
MSSV not found → "Không có MSSV này trong danh sách lớp.
                  Gửi yêu cầu cho giảng viên?" → name + reason → pending
```

The invigilator sees pending requests in the lobby and approves or rejects.
**Every approval writes an `audit_log` entry** — who approved, for which
MSSV, when, and the stated reason. A machine-enforced rule opened by a
human must leave a trace; this is the first real writer of `audit_log`, and
the reason its entity was fixed in PR #5.

New events: `agent:request-access`, `lobby:access_request`,
`teacher:resolve-access-request`, `agent:access-granted` / `:denied`.

### 5.4 Closing the Task 4 debt

With enrollment available at collection time, `submission.home_class_id`
and `home_teacher_id` are finally fillable. Because `agent:join` now
requires enrollment, they cannot be absent — so `NOT NULL` is restored,
which is exactly the path the Task 4 migration's `down()` was written for.
`submission` currently holds 0 rows, so no backfill is needed.

## 6. Verification *before* the exam

Everything above answers questions after the fact. The invigilator needs
answers while the room is still fillable — and a baseline, so that
"45 present, 46 submissions" is detectable at all.

### 6.1 Attendance goes in the log, not in RAM

Today, who has joined lives only in the teacher's browser memory; one
refresh and it is gone. `agent_connection_event` exists for exactly this
and has never been written to.

Every successful `agent:join` writes `connected` — or `reconnected` if that
MSSV already has an event for this session — and disconnects write
`disconnected`. `joined_late` is set from `now > start_time`, automatic,
per CLAUDE.md Phase 2 step 6. Current presence is the latest event per MSSV.

### 6.2 The lobby shows three groups, not one list

| Group | Source | What the invigilator does |
| --- | --- | --- |
| In this class, connected | roster ∩ connected | nothing |
| In this class, not connected | roster ∖ connected | call the name, find the student |
| **From another class (make-up)** | connected, `home_class_id ≠ class_id` | check their make-up authorisation |

The third group shows name, MSSV and **home class**, so a make-up student
reads as "from N05, sitting here" instead of an unfamiliar name among 45
familiar ones. `joined_late` is marked within whichever group applies.

### 6.3 Headcount baseline — an observation, not a lock

A "Chốt sĩ số" action records two columns on `exam_session`:
`attendance_confirmed_at` and `attendance_confirmed_count`. *Which* students
were present is derived from the event log at that timestamp (latest event
per MSSV before `confirmed_at`), so nothing is stored twice.

Confirming does **not** close the session to new joins. A crashed machine
must be able to rejoin, and blocking that harms a real student. Joins after
the baseline are marked, visible and not refused. The mark is derived
(`occurred_at > attendance_confirmed_at`), not stored.

**Two very different things wear that mark, and they must not look alike.**
The event log already separates them:

| | Meaning | Invigilator reads it as |
| --- | --- | --- |
| Has an earlier `connected` event this session | machine crashed and came back | expected, no action |
| No earlier event at all | someone appeared *after* the count | **investigate** |

Showing both as one label would bury the case the headcount exists to catch
underneath the routine one. They render as separate labels.

### 6.4 Detecting the 45/46 case

After finalize, compare distinct students with submissions against
`attendance_confirmed_count`:

```
Confirmed: 45 students
Submitted: 46 students
  → 1 submission from someone not present at headcount
  → name, MSSV, home class, connection time
```

The discrepancy is named, not just counted. This is the question that
`enrollment` and `submission` alone cannot answer, which is why the
attendance log is in scope.

## 7. Excel import

### 7.1 Parsed in the browser, never uploaded

CLAUDE.md Security rule 5: file uploads never go through the NestJS server.
The API has never accepted a file (no `multer`, no `FileInterceptor` —
verified), and this phase does not make it start.

```
Browser: pick .xlsx → parse → map columns → review diff → confirm
   ↓ POST { classId, students: [{ mssv, name }] }        ← plain JSON
API: validate DTO → upsert in one transaction
```

A 40-row roster is ~10KB; routing it through object storage so the server
can fetch and parse it would be ceremony. Parsing client-side keeps the
rule intact, makes the preview instant with no round-trip, and leaves the
API taking an ordinary DTO that `class-validator` checks like any other.

Library: `exceljs` (maintained, pure JS). Not the npm `xlsx` package — the
versions published there are old and have a CVE history.

### 7.2 Columns are chosen, never inferred

Same rule CLAUDE.md sets for `GradeExport` (Security rule 9): no guessing a
column from its header, even one literally labelled "MSSV". The user picks
the class in the UI first — so course and class are never inferred from
file contents — then maps which column is MSSV and which is the name,
against a preview of the first rows.

### 7.3 A bad row blocks the whole file

Four error classes: MSSV failing `^[A-Za-z0-9]{4,20}$`, MSSV duplicated
within the file, missing name, empty row. Any error and **nothing is
imported**; errors are listed by row number.

Importing the valid rows and reporting the rest was rejected: this entire
phase exists to make the headcount trustworthy, and a class imported at
38/40 produces a wrong headcount that still looks healthy. Failing loudly
beats being quietly wrong.

### 7.4 Re-import shows a diff first

| Case | Behaviour |
| --- | --- |
| In file, not in system | **add** |
| In both, name differs | **update name** |
| In system, not in file | **listed, NOT deleted by default** |

Deleting an enrollment locks that student out of the exam, and the mistake
surfaces on exam day when it cannot be undone. Removal requires an explicit
tick. Import is idempotent: the same file twice changes nothing.

## 8. Snapshot backup and reconnect

Reconnect splits into two cases that look alike and are not:

| Case | Today | Needs |
| --- | --- | --- |
| Network blip, agent restarted, machine intact | **already correct** — `cli.ts` creates files with the `wx` flag, so existing work is never truncated | nothing |
| Machine wiped or replaced | **work is gone** | a backup |

The second case is the reason the user asked for reconnect at all, so the
periodic snapshot — previously deferred as "Task 9" — is pulled into this
phase. Without it, reconnect handles the easy case and abandons the hard one.

The agent compresses `./exam-workspace/<studentId>/` every 4 minutes
(one value, not a range, so two agents cannot disagree about it)
(extension whitelist, ignoring `node_modules/`, `.git/`, `dist/`, `build/`)
and PUTs it over the existing presigned-URL path to
`backups/{examSessionId}/{studentId}/latest.zip`, overwriting. No
`Submission` row is created — a backup is not a submission.

On `reconnected`, the server tells the agent a backup exists.

**"Missing locally" is not a usable condition, and an earlier draft got this
wrong.** The agent creates the required files (with the `wx` flag) as part of
joining, so by the time a restore is evaluated the files always exist — on a
wiped machine they exist and are *empty*. A restore gated on "missing" would
therefore never fire in exactly the case it was written for, and the
student's work would be lost silently.

The rule is ordered and content-based instead:

1. On `reconnected` with a backup available, **restore runs first**, before
   any required file is created.
2. A restore **never overwrites a non-empty local file**. Empty (0 bytes) or
   absent is replaced; anything with content is left alone.
3. Required files still missing after the restore are then created empty, as
   on a normal join.

| Situation | Outcome |
| --- | --- |
| Intact machine, work on disk | files non-empty → untouched |
| Wiped machine, no files | restored from backup |
| Wiped machine, agent already made empties | empty → restored |
| Student deliberately emptied a file | restored to its last snapshot |

The last row is a deliberate trade: handing back the student's own earlier
content is recoverable, losing their work is not.

## 9. Testing

Required, each verified RED before the fix:

1. *(Phase 1)* `agent:join` **refuses** an MSSV with no enrollment for the course.
2. *(Phase 4)* `agent:join` **admits** an enrolled student from another
   class, flagged as make-up.
3. *(Phase 2)* A Trưởng khoa editing another head's `course` gets **403**.
4. *(Phase 3)* Import with any bad row writes **nothing**; the same file
   twice changes nothing.
5. *(Phase 1)* An approved access request writes an `audit_log` entry
   naming approver, MSSV and reason.
6. *(Phase 1)* `submission.home_class_id` / `home_teacher_id` are populated
   from enrollment.

Plus: a lecturer sees only their own classes; the headcount discrepancy
check names the extra student.

Existing suites must stay green: api 57 unit + 31 e2e, web 47. The
`agent:join` contract change means `cli.ts`, `mock-agent.ts` and the lobby
page tests all move with it.

## 10. Sequencing — five phases, security first

An earlier draft made this one phase of fourteen workstreams with the
security fix as its third stage. That was wrong. §1 calls the missing
enrollment check a **standing violation of Security rule 1**, and then
queued it behind term and lab CRUD — so any trouble in an Excel edge case
or a `class_id` migration would have delayed closing an open hole. A live
security gap does not wait on CRUD screens.

The gap does not actually depend on that work. Enforcement needs only
`enrollment` rows for a course, and `exam_session.course_id` already
exists; rows can be seeded by SQL until the importer lands.

**Phase 1 — Close Security rule 1** *(first, smallest, ships alone)*
`enrollment.student_name`; `agent:join` requires an enrollment for the
session's course and answers with the authoritative name; `NOT_ENROLLED`;
the access-request flow with its `audit_log` entry;
`submission.home_class_id`/`home_teacher_id` populated and restored to
NOT NULL. Roster seeded by SQL, documented in the runbook.

> **Enforcement and the valve are one deliverable.** Shipping the refusal
> without the access-request path would mean a student missing from a
> hand-seeded roster is locked out on exam day with no recourse — replacing
> a security gap with an availability one. They are never split across
> phases, never merged separately.

No make-up detection yet: without `class_id` every enrolled student in the
course is simply admitted. That is strictly tighter than today and strictly
looser than the end state — safe in both directions.

**Phase 2 — Roles and academic resources**
The unmapped-role page (§3.1, covers `super_admin`); `/department` area and
the three-way middleware; `course.department_head_id` with the orphan list;
CRUD for semester, room, course, class; unique constraints on
`semester.name` and `room.name`.

**Phase 3 — Roster and session ↔ class**
Drop `class_roster`; the Excel importer replacing the SQL seed;
`exam_session.class_id` and the create-session form losing its "Môn thi"
field; lecturer-scoped class selection.

**Phase 4 — Pre-exam verification**
The attendance log; the three-group lobby with make-up detection; the
headcount baseline and the discrepancy check.

**Phase 5 — Snapshot backup and restore on reconnect.**

Phase 1 is the only phase that changes the `agent:join` contract and must
not merge without tests §9.1, §9.5 and §9.6. Every later phase is additive
to a system that is already correct on the security question.

## 11. Deliberately left for later

- Per-student filename templates (`{MSSV}_{HoTen}`, `{PHONG}_{MSSV}_{TEN}_{SOMAY}`).
  The `SOMAY` token needs a seat/workstation concept, which this schema
  does not have; the abandoned `worktree-master-data-module` branch modelled
  it as `lab_seats`/`workstations` and is worth reading before designing it.
- Exam materials and a generated INSTRUCTIONS file in each student folder.
  **Security rule 2 travels with this item and must not be lost because it
  ships outside the main flow**: materials are released to an agent only
  after the server confirms `start_time` has passed, even for an agent that
  connected earlier. Separating "allowed into the lobby" from "allowed to see
  the exam" is the whole point of the rule; a phase that distributes files on
  join would leak the exam to early joiners. The abandoned
  `worktree-master-data-module` branch modelled the storage side as
  `exam_event_files`.
- Reports from lecturer to Trưởng khoa, once grading data exists.
- `super_admin` remains unused. If an academic-affairs tier is ever
  wanted — the role that would really own term dates — that enum slot is
  where it goes.
