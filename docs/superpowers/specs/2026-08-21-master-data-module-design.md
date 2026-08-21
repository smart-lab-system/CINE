# Design: Master Data Module

**Date:** 2026-08-21
**Status:** Approved by user, pending spec review by user
**Scope of this document:** the Master Data module (`WEB-MD-01..24`) — students,
lecturers, subjects, academic terms, course sections, and course-section
enrollments, in both the Nest API and the Next.js admin UI. Builds on the Web
Portal Foundation (`docs/superpowers/specs/2026-08-20-web-management-portal-design.md`,
`docs/superpowers/plans/2026-08-20-web-portal-foundation.md`), which is
already implemented and merged.

## 1. Context

Source: `function-list v2.md`'s `WEB-MD` group (24 functions) and
`schema.md` / `postgresql-schema-v2.sql`'s identity/academic tables — all in
the separate `KLTN/doc/` repo. Column lists and constraints below are taken
directly from the DDL (`postgresql-schema-v2.sql`), not from `schema.md`'s
ERD diagrams, which have at least one stale field (`academic_terms`'s ERD
sketch shows `academic_year_start`/`term_no` columns that don't exist in the
actual DDL — the DDL is authoritative).

This is the first module built on top of the Foundation. It reuses, without
modification: the auth/RBAC layer, the `PostgresExceptionFilter` (including
its `23503` handling for the DB's soft-delete-guard trigger, which already
protects every table this module touches), the TypeORM schema-first
conventions (`IsNull()` for soft-delete filters, no `@DeleteDateColumn()`,
transactional multi-statement writes), and the Tailwind/shadcn UI kit.

## 2. Goals / non-goals

**Goals:**
- CRUD (create/search/edit/delete) for students, lecturers, subjects,
  academic terms, and course sections, end-to-end (API + UI).
- Enrollment management for course sections (assign/unassign students).
- Excel import for students (`WEB-MD-05`), as a background job.
- Close the Foundation plan's carry-forward note: every new list/search
  endpoint gets a properly decorated Swagger response type, so the
  generated client doesn't need the `as unknown as` bridge Accounts needed.

**Non-goals:**
- Labs/workstations/layouts (`WEB-LAB`), exam events/lab sessions
  (`WEB-EXAM`), policy, submissions, reports — separate future modules.
- Lecturer–subject assignment (`lecturer_subject_assignments`) — the DDL
  itself marks this table as "optional / not enforced", not part of the
  core operational model. Not built here.
- Persistent storage for the Excel import file — it's a transient input
  (see §5).

## 3. Data model

All six tables already exist (Foundation's migration applied the full v2
schema). Field lists below are the ones the DTOs/entities need to match —
exact column names/constraints, from the DDL:

| Table | Required | Optional | Key constraints |
| --- | --- | --- | --- |
| `students` | `student_code`, `full_name` | `date_of_birth`, `class_code`, `cohort_year` | `student_code` unique (active), regex `^[A-Za-z0-9._-]{3,32}$`, `cohort_year` 1900–2200 |
| `lecturers` | `employee_code`, `full_name` | `department`, `academic_title` | `employee_code` unique (active), regex `^[A-Za-z0-9._-]{2,32}$` |
| `subjects` | `code`, `name` | `credits` (0–30), `description` | `code` unique (active), regex `^[A-Za-z0-9._-]{2,32}$` |
| `academic_terms` | `code`, `name`, `starts_on`, `ends_on` | `is_active` (default `true`) | `code` unique (active), `ends_on >= starts_on` |
| `course_sections` | `subject_id`, `academic_term_id`, `section_code` | `nominal_class_code`, `name` | unique (active) on `(subject_id, academic_term_id, section_code)`; composite FK ensures the section and its subject agree |
| `course_section_enrollments` | `course_section_id`, `student_id` | — (`enrolled_at` defaults to `now()`) | unique (active) on `(course_section_id, student_id)` |

All six already have a working `guard_master_soft_delete` trigger entry in
the DDL (verified directly, not assumed): deleting a `subject`/`academic_term`
with active `course_sections`, or a `course_section` with active
`enrollments`, raises `23503` — already mapped to a clean `409` by the
existing `PostgresExceptionFilter`. **No new database-error-handling code is
needed anywhere in this module.**

## 4. Backend architecture

`src/master-data/` holds five sub-modules, one per entity —
`students/`, `lecturers/`, `subjects/`, `academic-terms/`, `course-sections/`
— each with its own controller, service, DTOs, and entity file, following
`accounts/`'s existing shape exactly (transactional `create`/`update`/`remove`,
`IsNull()` soft-delete filters, `@Roles('admin')`). `CourseSectionEnrollment`'s
entity and its CRUD live inside `course-sections/`, not as a sixth top-level
module, since it's only ever reached as a sub-resource
(`POST /course-sections/:id/enrollments`, `DELETE .../enrollments/:studentId`).
A thin `MasterDataModule` imports all five into `app.module.ts` as one line.

**Response typing.** Every list/search endpoint declares an explicit
response class (e.g. `StudentListItemDto`/`PaginatedStudentsDto`) with
`@ApiProperty()`-inferable shapes, and controller methods annotate their
return type with that class rather than a bare TS interface — the same
mechanism that already makes request DTOs type correctly, applied to
responses too. This is what closes the gap Accounts left open.

**Course sections' search/list response** includes the joined subject and
term display fields (code + name), resolved via `QueryBuilder` joins in the
service (same pattern as `AccountsService.search()`'s raw `ILIKE` query) —
entities still don't carry relation decorators, per the schema-first
convention; the join happens in the query, not the entity graph.

**Endpoint shape**, repeated per entity except where noted:
- `POST /{entity}` — create, `admin`
- `GET /{entity}?search=&page=&pageSize=` — search, `admin`
- `PATCH /{entity}/:id` — edit, `admin`
- `DELETE /{entity}/:id` — soft-delete, `admin`, relies entirely on the
  existing DB trigger + exception filter for the "has active children"
  case

Course sections additionally:
- `POST /course-sections/:id/enrollments` — body `{ studentId }`
- `DELETE /course-sections/:id/enrollments/:studentId`
- `GET /course-sections/:id/enrollments?search=&page=&pageSize=`

## 5. Excel import (`WEB-MD-05`)

**Decision: BullMQ + Redis**, per the user's explicit choice — this is the
first real consumer of the Redis container the Foundation plan already
provisioned but never used, and the first background-job infrastructure in
the codebase.

- `POST /students/import` (multipart, `admin`): the file is read into memory
  (multer memory storage — student rosters are small, at most a few hundred
  KB) and passed as the job payload. **Deliberately not stored in MinIO** —
  it's a transient input to a one-shot job, not an artifact worth persisting
  past that job's lifetime; introducing object storage for this would be
  scope creep against a boundary the design doc for the Foundation plan
  already drew (MinIO is for exam files and submissions, consumed by later
  modules). Returns `{ jobId }`, `202 Accepted`.
- A worker (`@nestjs/bullmq` processor) parses the buffer with `exceljs`,
  validates each row against the same rules `CreateStudentDto` enforces, and
  **upserts by `student_code`**: update the row if that code already has an
  active student, otherwise create one. This is the standard shape for
  "re-import a refreshed roster" without hitting the unique-constraint error
  a naive insert-only import would.
- `GET /students/import/:jobId` (`admin`): status endpoint —
  `{ status: 'waiting' | 'active' | 'completed' | 'failed', result?: { totalRows, created, updated, errors: [{ row, message }] } }`.
  Partial success is allowed: a bad row is reported in `errors`, good rows
  in the same file still import. The frontend polls this via TanStack Query
  with a refetch interval, matching the pattern the Foundation design spec
  already described for background jobs generally.

## 6. Frontend architecture

**Shared CRUD scaffold.** Accounts' page (Task 7/8 of the Foundation plan)
established the list+search+create+edit+delete pattern once, bespoke. Five
more near-identical pages would mean a lot of duplicated TanStack
Query/Table wiring for no benefit — this is the point where extracting a
shared hook/component pair pays for itself. The scaffold owns: the search
input, the TanStack Table wiring, the create/edit form swap, and the
mutations' `onSuccess` → `invalidateQueries` wiring. Each entity page
supplies only its columns and its form component (schema/fields differ per
entity; the surrounding plumbing doesn't). `window.confirm()` stays the
delete-confirmation mechanism, consistent with Accounts — still no `Dialog`
primitive needed for this module.

**Course sections** get one additional page/panel for enrollment management:
search students, add to the section, remove from it — built on the same
scaffold's list half, without the create/edit form half (enrollment doesn't
have its own editable fields beyond existing/not-existing).

**Students' import** gets a small dedicated UI: a file input, a submit that
POSTs and starts polling, and a result view (counts + a table of per-row
errors) once the job completes.

## 7. Auth & RBAC

No changes — every new endpoint is `@Roles('admin')` behind the existing
`JwtAuthGuard`/`RolesGuard`, exactly like Accounts.

## 8. Testing

Same bar as the Foundation plan: real e2e tests against the real Dockerized
Postgres for every CRUD endpoint (including exercising the soft-delete-guard
`23503` path for at least one entity, the way Accounts' test suite already
does), a real BullMQ worker test for the import job — actually enqueuing and
processing a job against a test queue, not mocking the processor — and
component tests for the shared CRUD scaffold plus each entity's form.

## 9. Open questions / deferred decisions

1. Whether `operator`/`lecturer` roles should get read access to master data
   (currently `admin`-only, matching Accounts). Deferred — easy to broaden
   later, and no requirement in the function list currently calls for it.
2. Whether Excel import should also cover lecturers (only students are in
   scope per `WEB-MD-05`'s literal text). Deferred until asked for.
3. `lecturer_subject_assignments` — explicitly out of scope per §2; revisit
   only if a future module needs the "suggest a lecturer for a subject"
   feature the DDL's changelog mentions as optional.

## 10. References

- `docs/superpowers/specs/2026-08-20-web-management-portal-design.md`
- `docs/superpowers/plans/2026-08-20-web-portal-foundation.md`
- `KLTN/doc/diagram/function-list v2.md` (`WEB-MD` group)
- `KLTN/doc/diagram/schema.md`, `KLTN/doc/diagram/postgresql-schema-v2.sql`
