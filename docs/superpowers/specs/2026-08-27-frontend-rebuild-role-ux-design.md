# Frontend rebuild: role-based navigation, design system, and exam-session business fields

## Context

ExamCollect's web app has working auth, a real-time exam-session lobby, and an
accounts CRUD screen, but the UI/UX and navigation structure haven't kept up:
no sidebar/dashboard, admin and teacher share undifferentiated navigation, the
account-creation form is wedged into the list page, and the exam-session
creation form is missing business fields (course, room, exam type) a real
session needs. This spec is the rebuild plan for all of that, scoped to the
Teacher and Admin web app (Student/Agent is out of scope, per CLAUDE.md's
3-role model).

Full architectural context lives in `CLAUDE.md` at the repo root — this spec
does not repeat the schema/security rules already defined there; it only
covers what's changing.

## Grounding: what's already true in the codebase

(See conversation history for the full audit; summarized here so this spec is
self-contained.)

- shadcn is configured (`components.json`, tokens for
  primary/secondary/muted/destructive) with only `button`/`card`/`input`/
  `label`/`table` generated so far.
- `AccountsController` already has `JwtAuthGuard` + `RolesGuard` +
  `@Roles('admin')` — the backend side of admin-API protection already
  exists.
- `CourseEntity` (`id, code, name, semester_id`) already exists;
  `exam_session.course_id` is a nullable FK to it, added ahead of this work.
- The accounts list is already server-paginated + debounced-searched (not
  client-filtered) — only the list/create UI split and the
  hooks/api-layer convention are missing.
- `middleware.ts` only checks "is there an `access_token` cookie" — it never
  decodes or checks `role`. Login branches by role post-login but hardcodes
  two destinations.
- `ExamSessionController` has no role guard (any authenticated account may
  create/own a session) — a deliberate, documented demo-scope choice, not a
  bug, and out of scope for this spec to change.
- `AccountsPage` (`app/(dashboard)/accounts/page.tsx`) calls `apiClient`
  directly in the component body, which violates this project's own stated
  rule (every call goes through `hooks/use<Domain>.ts` +
  `lib/api/<domain>.ts`, correctly demonstrated by `useExamSession.ts` /
  `lib/api/exam-session.ts`). This spec brings it into compliance while
  rebuilding it.
- No `Room` entity, no `exam_type` column, no `GET /courses`, `GET /rooms`,
  or `GET /exam-sessions` (list) endpoints exist yet.

## Decisions (resolved during brainstorming — see rationale in each)

1. **No GSAP.** The `jeffallan-claude-skills` and 7-skill GSAP bundle the
   original brief called for aren't installed in this environment (plugin
   management isn't available here). All micro-interactions (hover/focus,
   dialog open/close, sidebar collapse, list fade-in) use Tailwind CSS
   transitions + Radix's built-in data-state animations, which shadcn's
   `Dialog`/`DropdownMenu` already ship with. No animation library is added.
   Backend work follows this repo's own established NestJS module
   conventions instead of the unavailable skill.
2. **URL scheme: real segments, not route groups.** `/admin/*` and
   `/teacher/*` are real folder segments (`app/admin/`, `app/teacher/`), not
   parenthesized route groups, specifically so `middleware.ts` can gate by a
   simple prefix match. Existing `/accounts` → `/admin/accounts`,
   `/exam-sessions/*` → `/teacher/exam-sessions/*`.
3. **Role source for middleware: decode the JWT's `role` claim, no second
   cookie.** `access_token` is httpOnly but server-readable by middleware.
   Its payload already carries `role: AccountRole` directly
   (`AccessTokenPayload`). Middleware base64-decodes the payload (no
   signature verification — this is routing UX only; `JwtAuthGuard` is the
   real enforcement on every actual API call, unchanged).
4. **`Room` is logistics metadata, never on the auth path.** Course-level
   `Enrollment` auth (CLAUDE.md security rule 1) is untouched by this work.
   A room mix-up must never be able to block or grant session access — Room
   only describes where a session is scheduled to physically happen.
5. **`Room` fields: `id, name, capacity` (capacity nullable).** `location`
   is deliberately deferred (YAGNI — no logic in current scope uses it,
   text-only display value, cheap to add later when there's a real
   multi-building need). `capacity` earns its place: it powers a real,
   cheap, non-blocking validation (see "Capacity warning" below), in the
   spirit of "the system resolves what it can instead of making the user
   spot it."
6. **`exam_session.room_id`: required (`NOT NULL`) + `ON DELETE RESTRICT`,
   but explicitly flagged as a *provisional, lab-scope constraint, not an
   architectural invariant.** RESTRICT is a permanent choice (never silently
   orphan a session by deleting its room). Required is acceptable for this
   capstone's actual deployment context (a physical computer lab), but must
   not be read by future work as "every exam session has exactly one
   physical room" the way course-level auth independence *is* a permanent
   rule — a comment in the entity and in `CLAUDE.md`'s schema section makes
   this explicit, so nobody later assumes this NOT NULL is load-bearing for
   auth or an unchangeable design decision.
7. **`exam_session.course_id`: flips nullable → `NOT NULL`, with a safe
   migration.** Directly altering the column would fail if any existing
   `exam_session` row (created by the earlier exam-live demo, before
   `course_id` was wired into the create form) still has `course_id IS
   NULL`. The migration's `up()` must, in order: (a) ensure at least one
   seed `Course`/`Semester` row exists (create if not present — the same
   migration that adds the seed data), (b) `UPDATE exam_session SET
   course_id = <that seed course's id> WHERE course_id IS NULL`, (c) *then*
   `ALTER COLUMN course_id SET NOT NULL`. This is safe whether the table is
   empty or holds stale demo rows, and is idempotent/repeatable.

## Architecture

### Routing & AppShell

```
app/
├── (auth)/login/                    # unchanged
├── admin/
│   ├── layout.tsx                   # <AppShell role="admin" nav={ADMIN_NAV}>
│   ├── dashboard/page.tsx
│   ├── accounts/page.tsx            # list only
│   ├── ai-config/page.tsx           # structured placeholder
│   ├── cost/page.tsx                # structured placeholder
│   └── audit-log/page.tsx           # structured placeholder
├── teacher/
│   ├── layout.tsx                   # <AppShell role="teacher" nav={TEACHER_NAV}>
│   ├── dashboard/page.tsx
│   ├── exam-sessions/
│   │   ├── page.tsx                 # list (new)
│   │   └── new/page.tsx             # create (moved, + new fields)
│   ├── submissions/page.tsx         # structured placeholder
│   └── grading/page.tsx             # structured placeholder
└── (exam-live)/exam-sessions/[id]/  # unchanged — the lobby stays chrome-less
                                      # on purpose (projector-facing), not
                                      # under AppShell
```

`components/layout/app-shell.tsx`: one shared component (Sidebar + Topbar +
`QueryClientProvider` + `Toaster`), takes a `role: 'admin' | 'teacher'` prop
and resolves its own nav array (`ADMIN_NAV`/`TEACHER_NAV`) internally —
*not* a `nav` items array passed in from the layout. `admin/layout.tsx` and
`teacher/layout.tsx` are Server Components; `AppShell` is a Client
Component, and `NavItem`'s `icon` field is a Lucide *component reference*
(a function), which React Server Components cannot serialize across that
boundary as a prop. Passing only the plain `role` string and resolving nav
config inside the Client Component avoids that entirely. Sidebar collapses
on small screens via a shadcn `Sheet`; no animation library, Tailwind
transitions only.

### Route protection (2 layers, unchanged principle from the master brief)

1. **`middleware.ts`** (UX only): no token → `/login`. Token present, decode
   `role`, path under `/admin` but role isn't
   `admin|super_admin|department_admin` → redirect to `/teacher/dashboard`.
   Path under `/teacher` but role is `admin`-family → redirect to
   `/admin/dashboard`. This is a *convenience redirect*, not the security
   boundary.
2. **Backend guards** (real enforcement, unchanged pattern): every
   admin-only endpoint keeps/gets `JwtAuthGuard` + `RolesGuard` +
   `@Roles('admin')`. New `GET /courses`, `GET /rooms`, `GET /exam-sessions`
   endpoints just need `JwtAuthGuard` (any authenticated account, matching
   `ExamSessionController`'s existing posture) — no new admin-only surface
   is introduced by this spec.

Login's redirect (`app/(auth)/login/page.tsx`) changes from its current
hardcoded two-destination `router.push` to `/admin/dashboard` /
`/teacher/dashboard`.

### Design system

Extend `globals.css` / `tailwind.config.ts` with `success`, `warning`,
`accent`, `info` token pairs (foreground + background), checked for WCAG AA
contrast, alongside the existing primary/secondary/destructive/muted tokens.
Add shadcn components as needed: `dialog`, `sonner` (toast), `badge`,
`skeleton`, `select`, `dropdown-menu`, `sheet`, `alert`.

## Data model changes

New entity:

```ts
// room.entity.ts
@Entity({ name: 'room' })
export class RoomEntity extends BaseEntity {
  @Column({ type: 'varchar', length: 100 })
  name!: string;

  // Nullable: some rooms may not have a known machine count yet — must not
  // block creating the room record itself.
  @Column({ type: 'int', nullable: true })
  capacity!: number | null;
}
```

`exam_session` gains:

```ts
@Column({ name: 'room_id', type: 'uuid' })
roomId!: string;

// Provisional, lab-scope constraint — NOT an architectural invariant. See
// spec decision 6 / CLAUDE.md schema notes before assuming every session
// must have exactly one physical room.
@ManyToOne(() => RoomEntity, { onDelete: 'RESTRICT', nullable: false })
@JoinColumn({ name: 'room_id' })
room!: RoomEntity;

@Column({
  type: 'enum',
  enum: ['TK', 'GK', 'CK'],
  enumName: 'exam_type',
})
examType!: 'TK' | 'GK' | 'CK';

// Flips from nullable — see migration strategy above for the safe backfill.
@Column({ name: 'course_id', type: 'uuid' })
courseId!: string;

@ManyToOne(() => CourseEntity, { onDelete: 'RESTRICT', nullable: false })
@JoinColumn({ name: 'course_id' })
course!: CourseEntity;
```

One `migration:generate` run from these entity changes (this project's
established convention — see `kltn-examcollect-project` history of the two
prior entity-driven migrations), with the manual backfill step from decision
7 added into the generated migration's `up()` before the `NOT NULL` ALTER.
Seed script adds a few `Semester`/`Course`/`Room` rows for the dropdowns and
for the backfill target.

## API changes

- `GET /courses` (`JwtAuthGuard` only) — returns `{ id, code, name,
  semesterId, enrollmentCount }[]`. `enrollmentCount` is a `COUNT` over
  `enrollment` grouped by `course_id`, joined in one query (no N+1) —
  powers the capacity warning below.
- `GET /rooms` (`JwtAuthGuard` only) — returns `{ id, name, capacity }[]`.
- `GET /exam-sessions` (`JwtAuthGuard` only, owner-scoped like
  `findByIdForOwner`) — paginated list for the teacher's "Quản lý kỳ thi"
  page: `{ items: ExamSessionResponse[], total }`.
- `CreateExamSessionDto` gains `courseId` (`@IsUUID`), `roomId` (`@IsUUID`),
  `examType` (`@IsIn(['TK','GK','CK'])`), all required — mirrored exactly in
  the frontend Zod schema, following this file's existing pattern of
  keeping the two validators byte-for-byte in sync (see
  `SAFE_FILENAME_REGEX`'s existing comment for why that matters).

## Frontend page work

- **Admin dashboard** (`/admin/dashboard`): stat cards — account count and
  active-session count are real (cheap queries against existing tables); AI
  cost / audit-log cards are structured "Sắp có" placeholders (no backing
  module yet).
- **Accounts** (`/admin/accounts`): list-only page, rebuilt onto
  `hooks/useAccounts.ts` + `lib/api/accounts.ts` (fixing the direct
  `apiClient` call). Debounced search, role filter, role badge (color per
  role), skeleton while loading, empty state with a "Tạo tài khoản" CTA,
  error state with retry. "Tạo tài khoản" opens a `Dialog` (not inline);
  submit → toast → close → invalidate list query.
- **Teacher dashboard** (`/teacher/dashboard`): upcoming/active sessions
  (real, from the new list endpoint), "bài chờ chấm" as a structured
  placeholder.
- **Exam sessions list** (`/teacher/exam-sessions`): table with
  name/course/room/type/status/time, action to enter the lobby or view
  detail.
- **Create session form** (`/teacher/exam-sessions/new`): adds Course
  `Select`, Room `Select`, Exam-type `Select` above the existing
  name/time/required-filenames fields — same Card layout, same
  `role="alert"` error pattern already used in this file.
- **Capacity warning** (small, derived from decision 5): once both Course
  and Room are selected, if `room.capacity != null && room.capacity <
  course.enrollmentCount`, show a non-blocking shadcn `Alert` ("Phòng có
  sức chứa N máy nhưng lớp có M sinh viên") above the submit button. Never
  blocks submission — teachers may have valid reasons (partial class
  attendance, overflow handled elsewhere).

## Testing / acceptance

Per the master brief's explicit time-tradeoff for this task: no new unit
tests required. Required per phase: `pnpm build` + `pnpm lint` pass (both
apps), plus one manual pass — happy path (login admin → create teacher
account → login teacher → create session with all new fields → see capacity
warning trigger correctly → enter lobby) and the wrong-role-redirect check
(teacher hitting `/admin/*` redirects, doesn't render). Existing tests
referencing old paths (`/accounts`, `/exam-sessions/new`) are updated, not
deleted, since the underlying behavior they test still exists at the new
path.

## Phasing (maps to 4 sequential implementation plans)

- **Phase 0 — Foundation**: design tokens + shadcn components, `AppShell`,
  route renames, middleware role check, login redirect update.
- **Phase 1 — Admin**: admin dashboard, accounts list/create split +
  hooks/api-layer fix, admin placeholder pages.
- **Phase 2 — Teacher + schema**: `Room` entity + migration (with backfill),
  `GET /courses`/`GET /rooms`/`GET /exam-sessions`, teacher dashboard, exam
  sessions list, create-form new fields + capacity warning, teacher
  placeholder pages.
- **Phase 3 — Polish**: sweep for missing loading/error/empty states and
  toasts, full manual happy-path run, both apps' production build clean.

Each phase gets its own plan doc, executed and code-reviewed before the next
starts automatically (per established workflow), with a short report after
each.

## Out of scope

- Any change to `ExamSessionController`'s authorization posture (still no
  `@Roles`) — not requested, not touched.
- Multi-room-per-session, location/building fields, department-tiered admin
  logic — explicitly deferred (YAGNI / CLAUDE.md out-of-scope list).
- GSAP or any other animation library.
- New automated tests beyond keeping existing ones passing at their new
  paths.
