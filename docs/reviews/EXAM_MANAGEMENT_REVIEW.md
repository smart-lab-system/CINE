# Exam Management Review

**Plan:** [`docs/superpowers/plans/2026-08-27-exam-events-and-lab-sessions.md`](../superpowers/plans/2026-08-27-exam-events-and-lab-sessions.md) (`WEB-EXAM-01..19`)  
**Scope of this audit:** working tree vs `origin/main` (`1cff945`), focused on the exam-events / lab-sessions slice.  
**Audit date:** 2026-08-27  
**Independent review:** [Review exam implementation](8ddb8cfb-9a33-4a2b-a999-7eb07ccb993d) (read-only; no Critical defects). This file absorbs that review’s Important findings.  
**Verdict:** Plan Tasks 0–10 are delivered end-to-end. Room conflict is Postgres GiST, not a TypeScript algorithm. Exam seating is API-backed (`seatId` on `session_participants`) but **not** overlaid on the Labs Konva canvas. **With fixes** before merge: atomic event `row_version` on PATCH, reject shrinking the event window under existing sittings, sitting soft-delete 409 while non-draft, idempotent bulk roster, and a sitting-page seat picker (select is enough; canvas overlay is not required).

---

## 1. Executive Summary & Scope

This slice wires **exam events** (one subject exam/practice) and **lab sessions** (one room sitting) onto the existing `lab_management` schema. An admin can create a draft, attach course sections, book sittings against a lab + layout, assign a lead proctor and roster, stub a question file, and **publish** (`draft → scheduled`). Postgres owns the FSM, manifest hash, GiST overlap, child-mutation freeze, and status history.

**What landed**

- Nest `ExamsModule` (events + sessions + stored-objects stub) with decorated OpenAPI DTOs.
- Transaction-local GUCs for history (`setStatusChangeContext`) and `55000` → HTTP 409.
- Next.js **Lịch thi** workspace (`/exam-events`) using the regenerated `apiClient`.
- e2e coverage for CRUD, publish, overlap, FSM, and history against Docker Postgres.

**What this slice is not**

- Not a faculty-wide “đợt thi” (`exam_periods` / `exam_shifts` remain out of scope, as specified).
- Not MinIO / Mongo policy / BullMQ / lecturer UI.
- Not a visual exam occupancy overlay on the seating editor. Labs canvas still maps **workstations** (GV/SV/disabled). Exam roster seats are optional IDs on participants; the admin UI does not pick seats or paint occupants on the map.

**Seating-plan integration (actual)**

| Layer | Integration |
| --- | --- |
| Schema | `lab_sessions.layout_id` → `lab_layouts`; `session_participants.seat_id` optional, same layout |
| API | Validates layout belongs to lab; seat belongs to sitting layout; duplicate seat → 409 |
| UI | Sitting form chooses lab + layout (labels active layouts). Roster is a table + bulk enroll. **No canvas overlay.** |
| Conflict | Same-lab overlap is GiST `ex_lab_sessions_no_overlap` on `scheduled`/`active` rows only |

---

## 2. Specification Compliance Checklist

Legend: `[x]` done as specified · `[~]` done with a justified modification · `[ ]` postponed / missing.

### 2.1 Global constraints

- [x] Schema-first: `synchronize: false`; entities are column maps only (no `@Check` / exclusion decorators).
- [x] API does not write `manifest_sha256`, `manifest_published_at`, or `actual_*`. Publish `UPDATE`s `status` only; triggers hash and cascade rooms.
- [x] Status is not a normal PATCH field. Dedicated `POST .../status` with `{ toStatus, reason, rowVersion }`.
- [x] Rooms are not marked `scheduled` in Nest; `cascade_event_status_to_sessions()` does that. Event `active` comes from `reconcile_event_from_sessions()`.
- [x] Overlap is **not** reimplemented in TypeScript. `23P01` → 409 with room / proctor / student messages.
- [~] Soft-delete while draft: **events** use `findDraftOrThrow` → 409. **Sittings** `remove` does not check `draft`; lifecycle freeze omits `deleted_at`, so `ck_lab_sessions_deleted_at` fails (`23514` → **400**). See §3.5.
- [x] Publish prerequisites trusted to `validate_exam_event_lifecycle()`; UI checklist mirrors them but API remains source of truth.
- [x] Status history GUCs: `app.actor_type`, `app.current_user_id`, `app.command_id`, `app.status_change_reason` (transaction-local).
- [~] Optimistic concurrency: **sessions** PATCH/status use `WHERE id AND row_version`. **Event status** does too. **Event PATCH** checks `rowVersion` in memory then `UPDATE` by id only (TOCTOU). See §3.5.
- [x] `@Roles('admin')` on exam controllers (reads included; lecturer views remain out of scope).
- [x] Decorated response DTOs; OpenAPI client regenerated; web uses `apiClient`.
- [x] `PostgresExceptionFilter` maps `55000` → 409 and surfaces trimmed `driverError.message`.

### 2.2 Task 0 — Exception filter + session GUC helper

- [x] Map `object_not_in_prerequisite_state` (`55000`) to `ConflictException`.
- [x] Unit-test the mapping (plus GiST constraint-specific messages).
- [x] Helper `setStatusChangeContext` used by status services; no raw `set_config` in controllers.

**Modified:** filter also maps named exclusions `ex_lab_sessions_no_overlap`, `ex_lecturer_bookings_no_overlap`, `ex_student_bookings_no_overlap` to operator-facing English copy (plan asked for room/proctor/student conflict messages).

### 2.3 Task 1 — TypeORM entities + module wiring

- [x] Nine exam entities + `StoredObjectEntity`; column names match DDL (`scheduled_start_at`, `row_version`, enums).
- [x] Single `ExamsModule` (plan allowed this vs two circular modules).
- [x] Registered on `dataSourceOptions.entities` and imported from `AppModule`.
- [x] `verify-schema.ts` lists `exam_event_sections`, `exam_event_files`, `stored_objects`, `session_proctors`, `session_participants`, plus history tables.
- [x] No TypeORM `@Check` / exclusion decorators.

**Modified (justified DDL gap):** migration `0005_fix_child_mutation_trigger` rewrites `guard_exam_event_child_mutation()` so PL/pgSQL does not compile `NEW.stored_object_id` on `exam_event_sections` (and the same pattern for proctors vs participants). Plan forbade *new tables*; this is a trigger bugfix required for attach-section to work.

`lab_sessions.scheduled_start_at` / `scheduled_end_at` are mapped `nullable: true` so INSERT can omit times; the BEFORE trigger copies the event window. That is a TypeORM map concession, not a DDL change.

### 2.4 Task 2 — Exam event CRUD + attach sections

- [x] `POST/GET/PATCH/DELETE /exam-events`; create always `draft`; `createdBy` = current user.
- [x] Search: `search`, `subjectId`, `status`, `from`, `to`, `page`, `pageSize`; `deleted_at IS NULL`.
- [x] Detail includes sections, files, session summaries, `rowVersion`.
- [x] Attach section copies `subjectId`; service rejects subject mismatch with 400.
- [x] Soft-delete 204; list/get hide deleted.
- [x] Decorated list/detail DTOs (`items` + `total`).
- [x] e2e: create, list, get, patch, delete; attach/remove section; unknown subject; section mismatch; 401/403.

### 2.5 Task 3 — Lab session CRUD

- [x] Nested CRUD under `/exam-events/:id/sessions`.
- [x] Omitted times left null so the trigger copies the event window (e2e: inherit).
- [x] Reject layout that does not belong to `labId`.
- [x] Add after event leaves draft → 409 (`55000`).
- [x] e2e: sitting inside window; window outside event; layout/lab mismatch; patch; soft-delete.

**Postponed / softened:** “preferably active” layout is labeled in the UI (`(đang dùng)`) but **not** required by the service.

### 2.6 Task 4 — Proctors

- [x] `POST/DELETE .../proctors`; service rejects a second `lead`; unique constraint still backs it (`23505` → 409).
- [x] e2e: add lead; reject second lead; remove assistant.
- [x] e2e lecturers are linked to active users (publish lead-readiness).

**Softened:** assign-time service only checks the lecturer row exists. `user_id` + `users.status = active` is enforced at **publish** by `session_has_ready_lead`, not at assign.

### 2.7 Task 5 — Participants (roster; seats optional)

- [x] Add / bulk-add / list / PATCH / DELETE participants.
- [x] `courseSectionId` must be an attached `exam_event_sections` row.
- [x] Student must have an active enrollment on that section.
- [x] `seatId` optional; if set, must belong to the sitting `layout_id`; duplicate occupant → 409.
- [x] Duplicate student on the same session → 409.
- [x] e2e: enroll from attached section; reject unattached section; seat uniqueness; wrong layout; bulk add.

**UI postponed:** roster table does not display or assign `seatId`. Seat assignment is API-only (covered by e2e). Plan sitting page said “proctors, roster, **seats**”; seats in the admin UI are incomplete.

### 2.8 Task 6 — Stored objects + question files + publish

- [x] `POST /stored-objects` admin stub (`bucketName`, `objectKey`, `objectUri`, `sha256Hex`, `sizeBytes`, `contentType?`).
- [x] `POST/DELETE /exam-events/:id/files`.
- [x] Publish: transaction + `setStatusChangeContext` + `UPDATE exam_events SET status = 'scheduled' WHERE id AND row_version AND deleted_at IS NULL`. Nest does not write the hash or session statuses.
- [x] e2e happy-path publish: event + rooms `scheduled`, `manifest_sha256` 64 hex chars.
- [x] e2e publish without question file → 400/409.
- [x] e2e publish without lead → 400/409.
- [x] e2e same-lab overlap after first publish → `23P01` → 409; second event stays `draft`.
- [x] Frozen PATCH after scheduled → 409.

### 2.9 Task 7 — Session status + event cancel/abort

- [x] `POST .../sessions/:sessionId/status` and event `POST .../status` for `cancelled` / `aborted` / `active` / `completed`.
- [x] e2e: start room inside window → session `active`, event `active`.
- [x] e2e: cancel draft/scheduled with no actual starts → rooms cancelled.
- [x] e2e: complete last active room → event completes via reconcile.
- [x] e2e: abort active event → rooms aborted.
- [x] Illegal transition → 400/409, not 500.

**UI postponed:** session detail has **Bắt đầu ca / Kết thúc ca / Dừng ca**. Event workspace has **Công bố lịch** only — no event-level Hủy / Dừng. Those transitions are API + e2e only.

### 2.10 Task 8 — Status history read APIs

- [x] `GET /exam-events/:id/status-history` and `GET .../sessions/:sessionId/status-history`.
- [x] Fields: `fromStatus`, `toStatus`, `reason`, `actorType`, `changedBy`, `commandId`, `createdAt`.
- [x] Append-only (no PATCH/DELETE).
- [x] e2e: `created` on insert; GUC reason / `status_transition` on publish; ordered start + reconcile rows.

### 2.11 Task 9 — Admin UI

- [x] Sidebar group **Lịch thi** → `/exam-events` (`app-sidebar.tsx`).
- [x] List with search, status badges, create/edit/delete (draft only).
- [x] Create draft: subject, code, title, window, duration, exam vs practice (Vietnamese copy).
- [x] Workspace: metadata, lớp tham gia, ca/phòng, giám thị, sĩ số, files, **Công bố lịch**, history.
- [x] `/exam-events/[id]/edit`, `/sessions/new`, `/sessions/[sessionId]`.
- [x] Publish button disabled until checklist (sections, draft sittings, lead per sitting, question file); API errors still shown.
- [x] After OpenAPI regen, list/detail/mutations use `apiClient` (not `apiFetchJson`).
- [x] Unit tests: list page states, form validation, publish checklist, publish panel.
- [ ] Full browser happy-path pass was **not** re-run in this audit (code + vitest only).
- [ ] Sitting canvas / seat picker on the map (see §2.13).
- [ ] Event cancel/abort controls in the UI.

List page does not expose API filters `subjectId` / `from` / `to` (search + status only).

### 2.12 Task 10 — OpenAPI client + README

- [x] `packages/shared/src/api/schema.d.ts` includes exam-events, sessions, stored-objects operations.
- [x] README API table + roadmap item 3 marked done; “Not implemented” paragraph no longer lists exam events.

**Minor:** POST handlers use `@ApiOkResponse` so the generated client documents **200**, while Nest still returns **201** on create (e2e asserts 201). Runtime is correct; OpenAPI status is slightly wrong.

### 2.13 Database schemas, APIs, room conflict, canvas (requested audit axes)

| Axis | Status |
| --- | --- |
| Database schemas | `[x]` Uses v2 aggregates in `0001_initial_schema.sql`. `[~]` `0005` trigger fix only. No `exam_periods` / `exam_shifts`. |
| Backend APIs | `[x]` Full suggested REST surface implemented (table in §4.2). |
| Room conflict algorithms | `[x]` **None in TypeScript.** GiST `EXCLUDE` on `lab_id` + `schedule_window` for `scheduled`/`active` undeleted sittings; sibling exclusions for lecturer and student bookings. Filter translates `23P01`. |
| Frontend UI | `[x]` Happy path minus event cancel and seat picking. |
| Canvas overlays | `[ ]` **Postponed.** `SeatingCanvas` is Labs-only (workstation type / disabled). Exam module never imports it. Occupancy is not an overlay. |

### 2.14 Plan test-plan matrix

| Case | Status |
| --- | --- |
| Unauthenticated writes → 401 | `[x]` |
| Non-admin → 403 | `[x]` |
| Event CRUD + section attach | `[x]` |
| Session outside event window → 400 | `[x]` |
| Second lead proctor → 409 | `[x]` |
| Publish without question file → 400/409 | `[x]` |
| Publish without lead → 400/409 | `[x]` |
| Happy-path publish + manifest | `[x]` |
| Same-lab overlap after reserved bookings → 409 (`23P01`) | `[x]` |
| Frozen PATCH after scheduled → 409 (`55000`) | `[x]` |
| Start room inside window → session + event `active` | `[x]` |
| Illegal FSM edge → 400/409, never 500 | `[x]` |
| Web form/page unit tests | `[x]` |
| Full browser happy path | `[ ]` not executed in this audit |

---

## 3. Codebase Quality & Type Safety Audit

### 3.1 TypeScript compilation

Fresh `tsc --noEmit` (2026-08-27):

| Package | Command | Result |
| --- | --- | --- |
| `apps/api` | `pnpm --filter api exec tsc --noEmit` | **exit 0** — 0 compiler errors |
| `apps/web` | `pnpm --filter web exec tsc --noEmit` | **exit 0** — 0 compiler errors |

### 3.2 Lint

Exam **production** API files and all exam web files: **0 ESLint errors**.

**Not zero overall:** `apps/api/src/exams/exam-entities.spec.ts` reports **6 errors** (`@typescript-eslint/no-unsafe-function-type` on `Function` helpers used to read TypeORM metadata). Specs still **pass**. This is the only lint failure in the exam-related eslint pass.

Web exam paths (`src/components/exams/**`, `src/app/(dashboard)/exam-events/**`, `app-sidebar.tsx`): clean.

### 3.3 Runtime / regression evidence (this audit)

| Suite | Result |
| --- | --- |
| API unit: exception filter, GUC helper, exam entities, workstations service | **24 passed** |
| API unit: accounts transactions, template geometry | **13 passed** (adjacent regression) |
| Web vitest: exam pages/forms/checklist + seating editor/canvas-related tests | **49 passed** (11 files) |
| e2e vs Docker Postgres: `exam-events`, `lab-sessions`, `exam-event-publish`, `exam-event-status`, `labs.e2e` | **60 passed** (5 suites) |

Labs e2e still covers workstation CRUD, layouts, and seat upsert. Exam code **reads** `LabLayoutEntity` / `LabSeatEntity`; it does not write workstations or layout seats. `SeatingCanvas` has no exam imports. Workstation create DTO (`assetCode`, `hostname`, `type`, …) is unchanged by this slice.

**Live browser walkthrough of `/exam-events` was not performed** in this audit.

### 3.4 Architecture notes (strengths)

- FSM, hash, overlap, and freeze stay in Postgres; Nest is a thin command layer. That matches the plan’s “do not reimplement” rule.
- Publish and session status open a transaction, set GUCs, then a versioned `UPDATE` — correct ownership split.
- GiST messages are constraint-name mapped, so operators see “lab already booked” instead of a raw exclusion string.
- UI checklist is client-side only; failed publish still shows the API message.
- One module avoids circular event/session imports.

### 3.5 Issues found

#### Important (should fix before merge)

1. **Event PATCH is not a versioned SQL update**  
   `ExamEventsService.update` compares `rowVersion` in process, then `this.events.update(id, …)` with no `WHERE row_version`. Two concurrent PATCHes with the same version can both succeed; last write wins. Session PATCH/status already use `WHERE row_version`. Align event PATCH with that QueryBuilder pattern; `ConflictException` when `affected === 0`.

2. **Shrinking the event window can leave sittings outside it**  
   Event PATCH of `scheduledStartAt` / `scheduledEndAt` does not check existing sittings. `validate_lab_session_lifecycle` containment (`NEW.scheduled_*` vs event window) runs on **sitting** writes only, not on event UPDATE. A draft can then be published with sittings outside the event window; room start uses the **event** clock window, so the schedule is silently inconsistent. Reject (or add a trigger) if any active sitting is not contained in the new window.

3. **Non-draft sitting soft-delete is 400, not 409**  
   `LabSessionsService.remove` does not require `draft` (events use `findDraftOrThrow`). Session lifecycle freeze does not include `deleted_at` in the immutable tuple, so `ck_lab_sessions_deleted_at` fails (`23514` → 400). Mirror events: if `status !== 'draft'` → 409, then set `deleted_at`.

4. **Bulk roster is not idempotent**  
   `SessionRosterPanel` posts every active enrollment each time. The service rejects the first student already on the sitting (409). Filter out students already on `participantsQuery` (and/or treat “already on roster” as success).

5. **Sitting UI has no optional seats**  
   Plan sitting page: proctors, roster, **seats**. API + e2e assign `seatId`. Admin table is student + section + remove only — no PATCH seat, no layout-seat fetch. A `<select>` of layout seats is enough; canvas overlay is **not** required. Labs `SeatingCanvas` remains workstation placement, not exam occupancy.

6. **Entity spec lint fails CI if `pnpm --filter api lint` is required**  
   Six `@typescript-eslint/no-unsafe-function-type` errors in `exam-entities.spec.ts`. Replace `Function` with a narrower type or eslint-disable for that spec helper.

#### Minor

7. **Layout `isActive` not required** when creating a sitting (UI hint only).  
8. **Lead `user_id` / active user** not checked at assign time (publish trigger still rejects). Publish checklist is `role === 'lead'` only.  
9. **No capacity check** (roster size vs usable seats on the layout). Disabled seats are not excluded if a `seatId` is posted.  
10. **Draft sittings may overlap** the same lab; GiST applies only when status is `scheduled` or `active` (and proctor/student exclusions when `booking_status = 'reserved'`). First publish wins; second publish 409.  
11. **Event cancel/abort** exist on the API, not on the workspace.  
12. **List filters** `subjectId` / `from` / `to` exist on the API, not on the list page; list `pageSize` is 50 with no pager.  
13. **OpenAPI 200 vs Nest 201** on create POSTs (`@ApiOkResponse`). Generated `201` content is empty next to a 200 body.  
14. **N+1 + cap 100:** workspace loads every sitting via `GET .../sessions/:id` (`fetchExamSessionDetails`). Checklist/leads ignore sittings beyond page 1. Event detail session summaries are thin (id/code/labId/status).  
15. **Stub question files** share a fake SHA-256 (`a` × 64); publish hash is still computed by the DB (unique by `stored_object_id`).  
16. **GET is admin-only** (stricter than “mutating endpoints only”; acceptable for this slice).  
17. **Event form** does not validate end > start client-side; API returns 400.

---

## 4. Delivered Changes Matrix

Uncommitted work in the repo also includes master-data and labs modules (prerequisites). This matrix lists **this plan’s slice** plus shared wiring.

### 4.1 Files (exam slice)

#### Backend — created

| Path |
| --- |
| `apps/api/src/common/db-session-context.ts` |
| `apps/api/src/common/db-session-context.spec.ts` |
| `apps/api/src/exams/exams.module.ts` |
| `apps/api/src/exams/exam-entities.spec.ts` |
| `apps/api/src/exams/entities/exam-event.entity.ts` |
| `apps/api/src/exams/entities/exam-event-section.entity.ts` |
| `apps/api/src/exams/entities/exam-event-file.entity.ts` |
| `apps/api/src/exams/entities/exam-event-status-history.entity.ts` |
| `apps/api/src/exams/entities/stored-object.entity.ts` |
| `apps/api/src/exams/entities/lab-session.entity.ts` |
| `apps/api/src/exams/entities/session-proctor.entity.ts` |
| `apps/api/src/exams/entities/session-participant.entity.ts` |
| `apps/api/src/exams/entities/session-status-history.entity.ts` |
| `apps/api/src/exams/events/exam-events.controller.ts` |
| `apps/api/src/exams/events/exam-events.service.ts` |
| `apps/api/src/exams/events/dto/create-exam-event.dto.ts` |
| `apps/api/src/exams/events/dto/update-exam-event.dto.ts` |
| `apps/api/src/exams/events/dto/search-exam-events.dto.ts` |
| `apps/api/src/exams/events/dto/attach-section.dto.ts` |
| `apps/api/src/exams/events/dto/attach-file.dto.ts` |
| `apps/api/src/exams/events/dto/transition-status.dto.ts` |
| `apps/api/src/exams/events/dto/exam-event-response.dto.ts` |
| `apps/api/src/exams/sessions/lab-sessions.controller.ts` |
| `apps/api/src/exams/sessions/lab-sessions.service.ts` |
| `apps/api/src/exams/sessions/dto/create-lab-session.dto.ts` |
| `apps/api/src/exams/sessions/dto/update-lab-session.dto.ts` |
| `apps/api/src/exams/sessions/dto/assign-proctor.dto.ts` |
| `apps/api/src/exams/sessions/dto/add-participant.dto.ts` |
| `apps/api/src/exams/sessions/dto/bulk-add-participants.dto.ts` |
| `apps/api/src/exams/sessions/dto/update-participant.dto.ts` |
| `apps/api/src/exams/sessions/dto/transition-status.dto.ts` |
| `apps/api/src/exams/sessions/dto/lab-session-response.dto.ts` |
| `apps/api/src/exams/stored-objects/stored-objects.controller.ts` |
| `apps/api/src/exams/stored-objects/stored-objects.service.ts` |
| `apps/api/src/exams/stored-objects/dto/create-stored-object.dto.ts` |
| `apps/api/src/exams/stored-objects/dto/stored-object-response.dto.ts` |
| `apps/api/src/database/migrations/0005_fix_child_mutation_trigger.ts` |
| `apps/api/src/database/migrations/sql/0005_fix_child_mutation_trigger.sql` |
| `apps/api/test/exam-events.e2e-spec.ts` |
| `apps/api/test/lab-sessions.e2e-spec.ts` |
| `apps/api/test/exam-event-publish.e2e-spec.ts` |
| `apps/api/test/exam-event-status.e2e-spec.ts` |

#### Backend — modified

| Path | Why |
| --- | --- |
| `apps/api/src/common/postgres-exception.filter.ts` | `55000` → 409; GiST message map |
| `apps/api/src/common/postgres-exception.filter.spec.ts` | Tests for 55000 + named exclusions |
| `apps/api/src/app.module.ts` | `ExamsModule` |
| `apps/api/src/database/data-source.ts` | Exam entities |
| `apps/api/src/database/verify-schema.ts` | Exam tables |
| `README.md` | API table + roadmap |
| `packages/shared/src/api/schema.d.ts` | Generated exam operations |

#### Frontend — created

| Path |
| --- |
| `apps/web/src/components/layout/app-sidebar.tsx` (**Lịch thi**) |
| `apps/web/src/app/(dashboard)/exam-events/page.tsx` |
| `apps/web/src/app/(dashboard)/exam-events/page.test.tsx` |
| `apps/web/src/app/(dashboard)/exam-events/new/page.tsx` |
| `apps/web/src/app/(dashboard)/exam-events/[id]/page.tsx` |
| `apps/web/src/app/(dashboard)/exam-events/[id]/edit/page.tsx` |
| `apps/web/src/app/(dashboard)/exam-events/[id]/sessions/new/page.tsx` |
| `apps/web/src/app/(dashboard)/exam-events/[id]/sessions/[sessionId]/page.tsx` |
| `apps/web/src/components/exams/exam-api.ts` |
| `apps/web/src/components/exams/exam-types.ts` |
| `apps/web/src/components/exams/exam-event-form.tsx` |
| `apps/web/src/components/exams/exam-event-form.test.tsx` |
| `apps/web/src/components/exams/exam-status.ts` |
| `apps/web/src/components/exams/exam-status.test.ts` |
| `apps/web/src/components/exams/exam-status-badge.tsx` |
| `apps/web/src/components/exams/datetime-local.ts` |
| `apps/web/src/components/exams/datetime-local.test.ts` |
| `apps/web/src/components/exams/publish-checklist.ts` |
| `apps/web/src/components/exams/publish-checklist.test.ts` |
| `apps/web/src/components/exams/exam-publish-panel.tsx` |
| `apps/web/src/components/exams/exam-publish-panel.test.tsx` |
| `apps/web/src/components/exams/exam-sections-panel.tsx` |
| `apps/web/src/components/exams/exam-sessions-panel.tsx` |
| `apps/web/src/components/exams/exam-files-panel.tsx` |
| `apps/web/src/components/exams/exam-history-panel.tsx` |
| `apps/web/src/components/exams/session-proctors-panel.tsx` |
| `apps/web/src/components/exams/session-roster-panel.tsx` |

Labs seating files (`seating-canvas.tsx`, `seating-editor.tsx`, workstations UI) are **not** part of this plan’s deliverable and were **not** given exam overlays.

### 4.2 REST endpoints, DTO contracts, validation

Auth: JWT + `RolesGuard` + `@Roles('admin')` on all exam routes below.  
FSM: allowed edges are enforced in Postgres (`draft → scheduled|cancelled`, `scheduled → active|cancelled`, `active → completed|aborted`).

| Method | Path | Body / query | Success | Validation / rules |
| --- | --- | --- | --- | --- |
| `POST` | `/exam-events` | `CreateExamEventDto` | 201 `{ id }` | `code` `^[A-Za-z0-9._-]{2,64}$`; `title` 1–250; `subjectId` UUID; `sessionType` exam\|practice; ISO window; `durationMinutes` 1–32767; optional policy ids 1–64. Forced `status=draft`. End after start (service). |
| `GET` | `/exam-events` | `SearchExamEventsDto` | 200 `{ items, total }` | Optional `search`, `subjectId`, `status`, `from`, `to`; `page` ≥1; `pageSize` 1–100 (default 20). Overlap-style window filter on event schedule. |
| `GET` | `/exam-events/:id` | — | 200 `ExamEventDetailDto` | 404 if missing/deleted. Includes sections, files, session summaries, `rowVersion`, hex `manifestSha256`. |
| `PATCH` | `/exam-events/:id` | `UpdateExamEventDto` | 200 detail | **Required** `rowVersion`. Optional metadata. Draft only (service 409). **SQL update is not version-gated** (see §3.5). |
| `DELETE` | `/exam-events/:id` | — | 204 | Draft only; sets `deleted_at`. |
| `POST` | `/exam-events/:id/sections` | `{ courseSectionId }` UUID | 201 `{ id }` | Section exists; subject matches; draft. Composite FK still applies. |
| `DELETE` | `/exam-events/:id/sections/:sectionLinkId` | — | 204 | Soft-delete; draft. |
| `POST` | `/exam-events/:id/files` | `AttachFileDto` | 201 `{ id }` | `storedObjectId` UUID live; `fileRole` question\|attachment\|answer_template\|guide; optional `title`, `sortOrder` ≥0. |
| `DELETE` | `/exam-events/:id/files/:fileId` | — | 204 | Soft-delete; draft. |
| `POST` | `/exam-events/:id/status` | `{ toStatus, reason, rowVersion }` | 200 detail | `toStatus` ≠ draft; `reason` 1–2000; versioned `UPDATE`. Trigger: hash, cascade, GUCs. |
| `GET` | `/exam-events/:id/status-history` | — | 200 `{ items, total }` | Ordered `createdAt`, `id`. |
| `POST` | `/exam-events/:id/sessions` | `CreateLabSessionDto` | 201 `{ id }` | `code`/`title`/`labId`/`layoutId`; optional times. Layout must belong to lab. Times omitted → trigger copies event window. Non-draft event → 409. Window outside event → 400. |
| `GET` | `/exam-events/:id/sessions` | pagination | 200 `{ items, total }` | Event must exist. |
| `GET` | `/exam-events/:id/sessions/:sessionId` | — | 200 `LabSessionDetailDto` | Proctors + `participantCount` + `rowVersion`. |
| `PATCH` | `/exam-events/:id/sessions/:sessionId` | `UpdateLabSessionDto` | 200 view | **Required** `rowVersion`; `WHERE row_version`. Draft freeze via trigger. |
| `DELETE` | `/exam-events/:id/sessions/:sessionId` | — | 204 | Soft-delete; draft only (DB). |
| `POST` | `.../sessions/:sessionId/proctors` | `{ lecturerId, role }` | 201 `{ id }` | `role` lead\|assistant; second lead → 409. |
| `DELETE` | `.../proctors/:proctorId` | — | 204 | Hard delete of assignment row. |
| `GET` | `.../participants` | — | 200 `{ items, total }` | Roster. |
| `POST` | `.../participants` | `{ studentId, courseSectionId, seatId? }` | 201 `{ id }` | Attached section; active enrollment; optional seat on layout; unique student/seat. |
| `POST` | `.../participants/bulk` | `{ studentIds[1+], courseSectionId }` | 200 `{ ids }` | UUID each; seats left null. |
| `PATCH` | `.../participants/:participantId` | `{ seatId?, notes? }` | 200 view | Seat may be `null`; uniqueness vs other occupants. v1 intended draft-only (trigger after schedule). |
| `DELETE` | `.../participants/:participantId` | — | 204 | Hard delete. |
| `POST` | `.../sessions/:sessionId/status` | `{ toStatus, reason, rowVersion }` | 200 detail | Same shape as event status; versioned SQL `UPDATE`. |
| `GET` | `.../sessions/:sessionId/status-history` | — | 200 `{ items, total }` | Append-only. |
| `POST` | `/stored-objects` | `CreateStoredObjectDto` | 201 `{ id }` | Bucket DNS-like; URI scheme; SHA-256 64 hex; `sizeBytes` ≥0; optional content type. Metadata stub only. |

**Error mapping (Postgres → HTTP)**

| SQLSTATE | HTTP | Typical cause |
| --- | --- | --- |
| `23505` | 409 | Unique (second lead, duplicate student, codes) |
| `23P01` | 409 | GiST overlap (lab / proctor / student) |
| `23503` | 409 | FK / soft-delete children |
| `55000` | 409 | Frozen row, illegal child mutation, illegal FSM |
| `23514` | 400 | CHECK (window, transition, duration) |

---

## 5. Edge Cases, Limitations & Next Steps

### Known limitations (this plan + follow-ups already named)

- No `exam_periods` / reusable “Ca 1 07:30–09:30” catalog.
- Policy template/snapshot columns may stay null (`WEB-POL`).
- `POST /stored-objects` does not upload bytes; UI stub uses a constant SHA-256.
- No BullMQ manifest job (DB hashes on `draft → scheduled`).
- No Tutor App / Client Agent protocol; admin `POST .../status` proves reconcile.
- No submissions, reports, Excel roster import.
- No lecturer-role UI; all exam HTTP is admin.
- No live occupancy / Redis heartbeats.

### Capacity and scheduling edge cases

- **GiST only after reserve:** two draft sittings on the same lab and window are allowed. Conflict appears when the second event (or sitting) becomes `scheduled`/`active`.
- **Overflow cohorts:** different windows on the same event are allowed; same-clock rooms are multiple sittings. Same `lab_id` + overlapping `schedule_window` + reserved status → 409.
- **Roster vs seats:** bulk enroll does not cap at layout seat count or skip `isDisabled` seats. Overflow is a data issue until a later allocator. Repeating “Thêm sĩ số lớp” 409s on the first duplicate student.
- **Seat uniqueness** is per sitting, not per lab across events (a student still cannot double-book via `ex_student_bookings_no_overlap` once reserved).
- **Lead without login:** assign succeeds; publish fails with a lead-readiness message from the trigger.
- **Inactive / non-active layout:** sitting can still be created if the layout belongs to the lab.
- **Start sitting:** e2e uses a window that includes `now()`; starting outside the event clock window is a DB rejection (400/409), matching Task 7.
- **Event PATCH race:** see §3.5 item 1.  
- **Event window vs sittings:** see §3.5 item 2.  
- **Non-draft sitting DELETE:** 400 via CHECK, not 409.  
- **Workspace N+1** and lookup `pageSize: 100` (subjects, labs, lecturers, sections).

### Suggested follow-ups (priority)

1. Make event PATCH `UPDATE ... WHERE id AND row_version` (same as sessions).  
2. Reject event-window edits that exclude existing sittings (service now; optional trigger if DB should own it).  
3. Sitting `remove`: 409 unless `draft`, then set `deleted_at`.  
4. Make bulk roster idempotent (skip students already on the sitting).  
5. Seat `<select>` on the sitting/roster page (layout seats; canvas overlay is optional later).  
6. Fix `exam-entities.spec.ts` lint (`Function` type).  
7. Event-level Hủy / Dừng on the workspace (API already exists).  
8. Optionally require `layout.isActive` (or warn) when booking a sitting.  
9. Check lead `user_id` + active user at assign time for a clearer 400.  
10. Capacity warning: enrolled count vs usable seats.  
11. List filters: subject + date range (API already supports them).  
12. Annotate POST `@ApiCreatedResponse` and regenerate the client so `201` carries `{ id }`.  
13. Optional: include sitting times / `hasLead` on `GET /exam-events/:id` to drop the N+1.  
14. Real MinIO (`WEB-POL` / storage), then replace stub files.  
15. If product still needs a faculty-wide đợt thi: `exam_periods` migration as in the plan Follow-ups.

### Suggested operator smoke path (when UI is walked in a browser)

1. Create draft with a window that covers every sitting.  
2. Attach a course section of that subject.  
3. Add a sitting (lab + layout; leave times blank to inherit).  
4. Assign a lead whose lecturer has an active user.  
5. Bulk-add enrollments; optionally PATCH seats via API.  
6. Stub-attach a question file.  
7. Công bố lịch → rooms `scheduled`, manifest set.  
8. On sitting detail, Bắt đầu ca (window must include now) → event `active`.

---

## Appendix A — Verification commands run in this audit

```text
pnpm --filter api exec tsc --noEmit          # exit 0
pnpm --filter web exec tsc --noEmit          # exit 0
pnpm --filter api exec eslint <exam paths>   # 6 errors in exam-entities.spec.ts only
pnpm --filter web exec eslint <exam paths>   # exit 0
pnpm --filter api exec jest --testPathPattern="postgres-exception.filter|db-session-context|exam-entities|workstations.service"
                                             # 24 passed
pnpm --filter api exec jest --testPathPattern="accounts.service.spec|template-geometry"
                                             # 13 passed
pnpm --filter web exec vitest run <exam + seating tests>
                                             # 49 passed
pnpm --filter api test:e2e -- --testPathPattern="exam-event|lab-sessions|labs.e2e"
                                             # 60 passed (Postgres healthy on :5442)
```

## Appendix B — Explicit non-goals (unchanged)

Confirmed **not** implemented, as required: `exam_periods` / `exam_shifts`, Mongo policy snapshots, real MinIO, BullMQ hash job, client-agent start-exam protocol, submissions/reports/Excel import, lecturer UI, Redis occupancy.
