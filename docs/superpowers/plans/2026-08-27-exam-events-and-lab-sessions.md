# Exam Events + Lab Sessions Implementation Plan

> **For agentic workers:** implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Do not invent new tables (`exam_periods`, `exam_shifts`) in this slice — schedule against the existing PostgreSQL v2 aggregates.

**Goal:** Deliver `WEB-EXAM-01..19` (exam event + lab session scheduling) end-to-end through the Nest API and the Next.js admin UI, on top of the already-applied `lab_management` schema. An admin can create a draft exam for a subject, attach course sections, book lab sittings, assign a lead proctor and roster, attach at least one question file, and **publish** (`draft → scheduled`). Postgres owns the FSM, manifest hash, GiST overlap, and status history.

**Architecture:** Two Nest modules matching the portal design — `ExamEventsModule` (event, sections, files, event status/history) and `LabSessionsModule` (sittings, proctors, participants, session status/history). TypeORM entities are query maps only (`synchronize: false`). The Next.js admin UI adds a **Lịch thi** nav group and an event workspace page (same nested-resource pattern as `/course-sections/[id]` enrollments).

**Tech Stack:** Existing portal stack. No new datastores. MinIO uploads may be stubbed in this plan via `stored_objects` rows; MongoDB policy templates stay out of scope (`WEB-POL`). BullMQ is **not** required for v1 — `validate_exam_event_lifecycle()` already computes `manifest_sha256` on `draft → scheduled`.

**Spec:** `docs/superpowers/specs/2026-08-20-web-management-portal-design.md` §§3, 4, 8; `docs/DATABASE_DESIGN.md` §§4.3–4.4, 5.5–5.8, 6.1–6.2; DDL in `apps/api/src/database/migrations/sql/0001_initial_schema.sql`.

**Prerequisites (already in this repo):** Auth, accounts, master data (subjects, terms, lecturers, students, course sections + enrollments), labs, workstations, layouts/seats. `PostgresExceptionFilter` maps `23505` / `23P01` / `23503` → 409 and `23514` → 400; this plan must also map `55000`.

---

## Terminology (UI vs schema)

Planners say “exam period” / “exam shift” (kỳ thi, đợt thi, ca thi). This schema does **not** have those tables. Map labels in the UI; keep English table names in code.

| Planner language | Table | Meaning |
| --- | --- | --- |
| Kỳ thi / đề thi môn | `exam_events` | One exam or practice for **one subject**: code, title, time window, duration, policy refs, package |
| Ca thi / phòng thi | `lab_sessions` | One **room sitting** under an event: lab + layout + start/end |
| Lớp tham gia | `exam_event_sections` | Course sections of that subject |
| Giám thị | `session_proctors` | Lead + assistants on a sitting |
| Danh sách thí sinh | `session_participants` | Roster + optional seat on the sitting’s layout |
| Học kỳ | `academic_terms` | Term calendar only — **not** a đợt thi |

`exam_events.scheduled_start_at` / `scheduled_end_at` is the planning window. Every `lab_session` must be contained in that window (trigger). Same-clock rooms are multiple sittings (GiST only conflicts on the **same** `lab_id`). Overflow cohorts are sittings with different windows inside the same event.

A faculty-wide “Đợt thi GK HK1” that groups many subjects is **out of scope** (see [Follow-ups](#follow-ups)).

---

## Global constraints

- Schema-first: no TypeORM `synchronize`; no new SQL migration unless a real DDL gap is found. Entities describe columns only — they do **not** express GiST exclusions, CHECKs, or triggers.
- Do **not** set `manifest_sha256`, `manifest_published_at`, or `actual_*` from the API. Triggers own those.
- Do **not** PATCH `status` as a normal field. Dedicated `POST .../status` commands only. Allowed edges:
  - Event / session: `draft → scheduled | cancelled`; `scheduled → active | cancelled`; `active → completed | aborted`.
- Do **not** mark rooms `scheduled` when publishing an event — `cascade_event_status_to_sessions()` does that. Do **not** mark the event `active` — `reconcile_event_from_sessions()` does that when the first room starts.
- Do **not** reimplement overlap checks in TypeScript. On `23P01`, return 409 with a room / proctor / student conflict message.
- Soft-delete only while `draft`. After leave `draft`, event config, sections, files, and session schedule are immutable (`guard_exam_event_child_mutation`, session lifecycle).
- `draft → scheduled` on an event **fails** unless all of these hold (trust the trigger, but the UI must collect them):
  1. ≥1 active `exam_event_sections` row
  2. ≥1 active `lab_sessions` row, all still `draft`
  3. every sitting has a **lead** proctor whose lecturer has an **active** `users` row
  4. ≥1 active `exam_event_files` row with `file_role = 'question'` (joined to a live `stored_objects` row)
- Publish hash is computed in the DB (`digest` of `role|sort_order|stored_object_id|sha256_hex|size_bytes` lines). Nest must not invent a parallel hash.
- Status history needs transaction GUCs (`set_config(..., true)` = local to the transaction):

```sql
SELECT set_config('app.actor_type', 'user', true);
SELECT set_config('app.current_user_id', :userId, true);
SELECT set_config('app.command_id', :commandId, true);
SELECT set_config('app.status_change_reason', :reason, true);
```

- Optimistic concurrency: `row_version` on `exam_events` and `lab_sessions`. PATCH / status commands send the expected version; update `WHERE id = :id AND row_version = :expected` (DB increments on write).
- RBAC for this slice: `@Roles('admin')` on all mutating WEB-EXAM endpoints (same as labs / master data). Lecturer-facing schedule views are a later concern.
- Response DTOs are decorated classes (`@ApiOkResponse`) so OpenAPI codegen is not empty. After API endpoints exist, regenerate `packages/shared` with `API_URL=http://localhost:4000/api-docs-json pnpm --filter @cine/shared generate:api-client`. Until then, the web app may use `apiFetchJson` (`apps/web/src/lib/api-fetch.ts`).
- `PostgresExceptionFilter` must map `55000` (`object_not_in_prerequisite_state`) → 409. Lifecycle guards use that code for frozen rows and illegal transitions; today those 500.

---

## Suggested API surface

Base paths are REST, nested like course-section enrollments.

### Exam events (`ExamEventsModule`)

| Method | Path | Notes |
| --- | --- | --- |
| `POST` | `/exam-events` | Force `status = draft`; `createdBy` = current user |
| `GET` | `/exam-events` | `search`, `subjectId`, `status`, `from`, `to`, `page`, `pageSize` |
| `GET` | `/exam-events/:id` | Include sections, session summaries, files, `rowVersion` |
| `PATCH` | `/exam-events/:id` | Draft only: code, title, window, duration, `sessionType`, policy ids |
| `DELETE` | `/exam-events/:id` | Soft-delete; draft only; 204 |
| `POST` | `/exam-events/:id/sections` | Body `{ courseSectionId }`; composite FK requires same `subjectId` |
| `DELETE` | `/exam-events/:id/sections/:sectionLinkId` | Soft-delete; 204 |
| `POST` | `/exam-events/:id/files` | Body `{ storedObjectId, fileRole, title?, sortOrder? }` |
| `DELETE` | `/exam-events/:id/files/:fileId` | Soft-delete; 204 |
| `POST` | `/exam-events/:id/status` | `{ toStatus, reason, rowVersion }` |
| `GET` | `/exam-events/:id/status-history` | Read-only |

### Lab sessions (`LabSessionsModule`)

| Method | Path | Notes |
| --- | --- | --- |
| `POST` | `/exam-events/:id/sessions` | `labId`, `layoutId` (layout must belong to lab, preferably active); times optional (inherit event window) |
| `GET` | `/exam-events/:id/sessions` | List sittings for the event |
| `GET` | `/exam-events/:id/sessions/:sessionId` | Include proctors, participant counts, `rowVersion` |
| `PATCH` | `/exam-events/:id/sessions/:sessionId` | Draft only |
| `DELETE` | `/exam-events/:id/sessions/:sessionId` | Soft-delete; draft only; 204 |
| `POST` | `/exam-events/:id/sessions/:sessionId/proctors` | `{ lecturerId, role }` — exactly one `lead` (DDL partial unique) |
| `DELETE` | `/exam-events/:id/sessions/:sessionId/proctors/:proctorId` | 204 |
| `GET` | `/exam-events/:id/sessions/:sessionId/participants` | Roster |
| `POST` | `/exam-events/:id/sessions/:sessionId/participants` | `{ studentId, courseSectionId, seatId? }` — student enrolled in an attached section |
| `POST` | `/exam-events/:id/sessions/:sessionId/participants/bulk` | `{ studentIds, courseSectionId }` |
| `PATCH` | `/exam-events/:id/sessions/:sessionId/participants/:participantId` | Seat / notes while draft (and seat changes rules after schedule — keep v1 draft-only) |
| `DELETE` | `/exam-events/:id/sessions/:sessionId/participants/:participantId` | 204 |
| `POST` | `/exam-events/:id/sessions/:sessionId/status` | `{ toStatus, reason, rowVersion }` |
| `GET` | `/exam-events/:id/sessions/:sessionId/status-history` | Read-only |

### Files (minimal, this plan)

| Method | Path | Notes |
| --- | --- | --- |
| `POST` | `/stored-objects` | Admin stub: `{ bucketName, objectKey, objectUri, sha256Hex, sizeBytes, contentType? }` so publish can proceed without MinIO. Real presigned upload is `WEB-POL`/storage follow-up. |

---

## Admin UI surface

Sidebar group **Lịch thi** in `apps/web/src/components/layout/app-sidebar.tsx`:

| Route | Page |
| --- | --- |
| `/exam-events` | Searchable list + status badges |
| `/exam-events/new` | Create draft (subject, code, title, window, duration, exam vs practice) |
| `/exam-events/[id]` | Workspace: metadata, lớp tham gia, ca/phòng, giám thị, sĩ số, files, **Công bố lịch**, history |
| `/exam-events/[id]/edit` | Edit draft metadata (or inline on the workspace) |
| `/exam-events/[id]/sessions/new` | Add sitting |
| `/exam-events/[id]/sessions/[sessionId]` | Sitting detail: proctors, roster, seats, start/complete/abort |

Vietnamese copy in the UI; English identifiers in code (`exam-events`, `lab_sessions`).

Happy-path operator flow the UI must support:

1. Create draft event (window wide enough for every sitting).
2. Attach course sections of that subject.
3. Add sittings (lab + layout + times inside the window).
4. Assign a lead proctor (optional assistants).
5. Assign students (bulk from section enrollments); optional seats.
6. Attach ≥1 question file (via stub `stored-objects` or later MinIO).
7. Publish → DB hashes manifest and schedules all rooms.
8. (Optional in this plan) Start a room `scheduled → active` to prove cascade/reconcile.

---

## Task list

### Task 0: Exception filter + session GUC helper

**Files:**
- Modify: `apps/api/src/common/postgres-exception.filter.ts`
- Modify: `apps/api/src/common/postgres-exception.filter.spec.ts`
- Create: `apps/api/src/common/db-session-context.ts` (or similar) — `setStatusChangeContext(qr, { userId, commandId, reason })`

**Produces:** `55000` → 409; unit test; a reusable helper that issues the four `set_config` calls on a `QueryRunner`. Prefer surfacing `driverError.message` (or a trimmed form) on 409/400 so FSM failures are actionable.

- [x] Map `object_not_in_prerequisite_state` (`55000`) to `ConflictException`.
- [x] Unit-test the new mapping.
- [x] Helper used by later status services; do not sprinkle raw `set_config` in controllers.

---

### Task 1: TypeORM entities + module wiring

**Files:**
- Create: `apps/api/src/exams/entities/exam-event.entity.ts`
- Create: `apps/api/src/exams/entities/exam-event-section.entity.ts`
- Create: `apps/api/src/exams/entities/exam-event-file.entity.ts`
- Create: `apps/api/src/exams/entities/exam-event-status-history.entity.ts`
- Create: `apps/api/src/exams/entities/stored-object.entity.ts`
- Create: `apps/api/src/exams/entities/lab-session.entity.ts`
- Create: `apps/api/src/exams/entities/session-proctor.entity.ts`
- Create: `apps/api/src/exams/entities/session-participant.entity.ts`
- Create: `apps/api/src/exams/entities/session-status-history.entity.ts`
- Create: `apps/api/src/exams/exam-events.module.ts`
- Create: `apps/api/src/exams/lab-sessions.module.ts` (or one `ExamsModule` exporting both controllers — pick one Nest module if two circular-import; a single `ExamsModule` is acceptable)
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/src/database/data-source.ts`
- Modify: `apps/api/src/database/verify-schema.ts` — add `exam_event_sections`, `exam_event_files`, `stored_objects`, `session_proctors`, `session_participants` if not already listed

**Produces:** Entities with `name:` matching DDL columns (`scheduled_start_at`, `row_version`, enums as `enum`/`varchar` matching Postgres types). `synchronize` remains false. No relations required beyond what queries need.

- [x] Register entities on `dataSourceOptions.entities`.
- [x] Import the module(s) in `AppModule`.
- [x] Do not add TypeORM `@Check` / exclusion decorators.

---

### Task 2: Exam event CRUD + attach sections

**Files:**
- Create: `apps/api/src/exams/events/exam-events.controller.ts`
- Create: `apps/api/src/exams/events/exam-events.service.ts`
- Create: DTOs under `apps/api/src/exams/events/dto/` (`create`, `update`, `search`, `response`, `attach-section`, `transition-status` can wait until Task 6)
- Test: extend or create `apps/api/test/exam-events.e2e-spec.ts` (CRUD + 401 + admin-only for now)

**Produces:** `POST/GET/PATCH/DELETE /exam-events`, `POST/DELETE /exam-events/:id/sections`. Create always `draft`. Soft-delete sets `deleted_at`. Search filters `deleted_at IS NULL`. Attaching a section copies `subject_id` from the event and verifies the course section’s subject matches (composite FK will 409/400 otherwise — still validate in the service for a clearer message).

- [x] Decorated list/detail response DTOs (`items` + `total`).
- [x] e2e: create, list, get, patch, delete; attach/remove section; reject unknown subject/section mismatch.

---

### Task 3: Lab session CRUD

**Files:**
- Create: `apps/api/src/exams/sessions/lab-sessions.controller.ts`
- Create: `apps/api/src/exams/sessions/lab-sessions.service.ts`
- Create: DTOs under `apps/api/src/exams/sessions/dto/`
- Test: `apps/api/test/lab-sessions.e2e-spec.ts` (or the same exam e2e file)

**Produces:** Nested session CRUD under `/exam-events/:id/sessions`. On insert, if times omitted, leave null so the trigger copies the event window. Reject layout that does not belong to `labId`. Adding a session to a non-draft event must fail (trigger `55000` → 409).

- [x] e2e: add sitting inside window; reject window outside event; reject add after event is no longer draft (once Task 6 exists, or insert via SQL status for this task).

---

### Task 4: Proctors

**Files:**
- Extend: lab-sessions controller/service + DTOs
- Test: e2e in the exam suite

**Produces:** Assign/remove proctors. Enforce one `lead` in the service **and** rely on `uq_session_proctors_lead`. Publish (Task 6) requires `session_has_ready_lead` — lecturer must have `user_id` and that user `status = active`. Seed/e2e must create lecturers **linked to active users**.

- [x] e2e: add lead; reject second lead (`23505` → 409); remove assistant.

---

### Task 5: Participants (roster; seats optional)

**Files:**
- Extend: lab-sessions controller/service + DTOs
- Test: e2e

**Produces:** Add / bulk-add / remove participants. `courseSectionId` must be an attached `exam_event_sections` row. Student should have an active enrollment on that section. `seatId` optional; if set, must belong to the sitting’s `layout_id`. Duplicate student on the same session → 409.

- [x] e2e: enroll from attached section; reject student from a section not on the event; optional seat uniqueness.

---

### Task 6: Stored objects + question files + publish (`draft → scheduled`)

**Files:**
- Create: stored-objects controller/service (minimal) **or** a private helper used only by the files endpoint that inserts `stored_objects`
- Extend: exam-events files + `POST /exam-events/:id/status`
- Extend: `PostgresExceptionFilter` messages if not done in Task 0
- Test: e2e **happy-path publish** and **failed publish** (missing question file / missing lead)

**Produces:** Attaching a `question` file and transitioning the event to `scheduled` in one documented flow. Service:

1. Open a transaction / `QueryRunner`.
2. `setStatusChangeContext`.
3. `UPDATE exam_events SET status = 'scheduled' WHERE id = :id AND row_version = :v AND deleted_at IS NULL`.
4. Commit. Trigger fills `manifest_sha256` + `manifest_published_at` and cascades rooms to `scheduled`.

Do not write the hash in Nest. Do not update `lab_sessions.status` in the same service.

- [x] e2e: full fixture (subject, section + enrollments, lab + layout, lecturer+user, event, section link, sitting, lead, stored object + question file) → `POST .../status` `{ toStatus: 'scheduled' }` → 200; event `scheduled`; sessions `scheduled`; `manifest_sha256` non-null.
- [x] e2e: same without question file → 400 or 409 (check/violation).
- [x] e2e: overlapping `scheduled` sittings on the **same lab** → `23P01` → 409 (two events or two sittings after publish; easiest: two draft events, same lab, overlapping windows, both published — second publish/session-schedule hits exclusion).

---

### Task 7: Session status + event cancel/abort (thin)

**Files:**
- Extend: `POST .../sessions/:sessionId/status` and event `cancelled` / `aborted` (and `active`/`completed` if easy)
- Test: e2e

**Produces:** After publish, a sitting can move `scheduled → active` (must be inside the event window **at clock time** — e2e may need a window that includes `now()`). Completing all rooms should let the event complete via `reconcile_event_from_sessions` (or explicit event complete if still needed). Cancel only before any room has started.

- [x] e2e: start one room → event becomes `active`.
- [x] e2e: cancel draft/scheduled event with no actual starts → rooms cancelled.
- [x] Illegal transition → 400/409, not 500.

---

### Task 8: Status history read APIs

**Files:**
- Extend: controllers + response DTOs
- Test: e2e GET after Task 6/7 transitions

**Produces:** Ordered history with `fromStatus`, `toStatus`, `reason`, `actorType`, `changedBy`, `commandId`, `createdAt`. Append-only tables — no PATCH/DELETE.

- [x] History contains `created` on insert and `status_transition:...` or the GUC reason on publish.

---

### Task 9: Admin UI — list, create, workspace

**Files:**
- Modify: `apps/web/src/components/layout/app-sidebar.tsx`
- Create: `apps/web/src/app/(dashboard)/exam-events/page.tsx`
- Create: `apps/web/src/app/(dashboard)/exam-events/new/page.tsx`
- Create: `apps/web/src/app/(dashboard)/exam-events/[id]/page.tsx`
- Create: `apps/web/src/components/exams/exam-event-form.tsx` (and tests if matching labs/master-data form tests)
- Create: sitting + proctor + roster panels on the workspace (or nested routes from the UI surface table)
- Optional: `apps/web/src/app/(dashboard)/exam-events/[id]/edit/page.tsx`

**Produces:** Admin can complete the happy path in the browser (use `apiFetchJson` until OpenAPI is regenerated). Copy in Vietnamese. Status badges for `draft` / `scheduled` / `active` / `completed` / `cancelled` / `aborted`. Publish button disabled until the workspace checklist is complete (sections, sittings, lead, question file) — still treat API errors as source of truth.

- [x] Sidebar **Lịch thi** → `/exam-events`.
- [x] Create + list + workspace attach section / sitting / lead / file / publish.
- [x] After OpenAPI regen, switch list/detail to `apiClient` where types exist.

---

### Task 10: OpenAPI client + README index

**Files:**
- Modify: `packages/shared/src/api/schema.d.ts` (generated)
- Modify: `README.md` — API surface table + roadmap item 3 (Exam Events) marked in progress/done; “Not implemented” paragraph
- Optional: `apps/web` pages switch from `apiFetchJson` to `apiClient`

**Produces:** `pnpm --filter @cine/shared generate:api-client` against a running API. README lists the new routes (same style as current master-data/labs rows).

- [x] Regen client.
- [x] README API table + roadmap updated.

---

## Test plan (suite that matters)

`pnpm --filter api test:e2e` must cover this module against Docker Postgres (migration applied). Minimum cases:

| Case | Expected |
| --- | --- |
| Unauthenticated writes | 401 |
| Non-admin | 403 |
| Event CRUD + section attach | 201/200/204 |
| Session outside event window | 400 |
| Second lead proctor | 409 |
| Publish without question file | 400/409 |
| Publish without lead | 400/409 |
| Happy-path publish | event + rooms `scheduled`, manifest set |
| Same-lab overlap after reserved bookings | 409 (`23P01`) |
| Frozen PATCH after scheduled | 409 (`55000`) |
| Start room inside window | session `active`, event `active` |
| Illegal FSM edge | 400/409, never 500 |

Web: form/page unit tests in the same style as `lab-form.test.tsx` / accounts page tests; full browser pass of the happy path when UI lands (Task 9).

---

## Explicit non-goals (this plan)

- New tables `exam_periods` / `exam_shifts` / reusable “Ca 1 07:30–09:30” catalog
- MongoDB policy templates and snapshots (`WEB-POL`) — columns may stay null
- Real MinIO presigned upload/download (stub `stored_objects` is enough to publish)
- BullMQ manifest job (DDL already hashes on transition)
- Tutor App / Client Agent start-exam protocol (admin `POST .../sessions/:id/status` is enough to prove reconcile)
- Submissions, reports, Excel roster import into sittings
- Lecturer-role UI (admin-only)
- Live occupancy / Redis heartbeats

---

## Follow-ups

If product language still needs a faculty-wide **đợt thi** that groups many subjects:

1. New SQL migration: `exam_periods` (`academic_term_id`, `code`, `name`, `starts_on`, `ends_on`, soft-delete).
2. Nullable `exam_period_id` on `exam_events` (RESTRICT, not cascade).
3. Optional `exam_shift_slots` lookup used only to **fill** `lab_sessions.scheduled_*`; the sitting remains the source of truth.

Policy (`WEB-POL`), real package upload, Submissions (`WEB-SUB`), and Reports (`WEB-RPT`) follow the GĐ2/GĐ4 timeline in the portal design.

---

## Implementation order (do not skip)

Tasks 2–5 can land as draft-only CRUD, but **Task 6 is the first vertical slice that proves scheduling**. Do not polish UI (Task 9) before a green publish e2e. Do not ship publish without files + lead — the trigger will always reject it.

```
Task 0 (filter + GUCs)
  → Task 1 (entities)
  → Task 2 (events + sections)
  → Task 3 (sessions)
  → Task 4 (proctors)
  → Task 5 (participants)
  → Task 6 (files + publish)   ← first “it works” milestone
  → Task 7 (session/event status)
  → Task 8 (history)
  → Task 9 (UI)
  → Task 10 (OpenAPI + README)
```
