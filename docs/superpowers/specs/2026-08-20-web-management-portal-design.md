# Design: Web Management Portal — Tech Stack & Architecture

**Date:** 2026-08-20
**Status:** Approved by user, pending spec review by user
**Scope of this document:** Web Management Portal (`WEB`) subsystem only, per
`function-list v2.md`. Master Tutor App, Client Agent, and the Tutor↔Agent
protocol are explicitly out of scope for this design — they will get their
own design docs later.

## 1. Context

Source documents (in the separate `doc` repo at
`KLTN/doc/diagram/`):

- `function-tree v2.md` — four-subsystem functional decomposition
- `function-list v2.md` — 136 functions across WEB/TUT/AGT, with a GĐ1–GĐ4
  delivery plan (75 of the 136 functions are WEB)
- `schema.md` + `postgresql-schema-v2.sql` — fully authored PostgreSQL v2
  schema (already implementation-ready DDL)
- `plan-timeline.md` — Aug 1–Nov 30, 2026 delivery timeline, GĐ1–GĐ4 phases
  locking Oct 20, 2026

The system being built is a NetSupport-School-style lab/exam management
platform. The Web Management Portal is the admin-facing subsystem: identity
and accounts, master data (students/lecturers/subjects/terms/course
sections), lab/workstation/seating-layout management, exam event and lab
session scheduling, policy templates, submission lookup, and reporting.

The central data stores are already decided (from the docs, not this
design): **PostgreSQL** (catalog + transactional data, schema v2 already
written), **MongoDB** (policy templates/snapshots, violation/AI logs),
**Redis** (heartbeat/live machine state — used by Tutor/Agent, but also
available to the Web Portal for caching/queues), **MinIO** (exam file
attachments, submissions, backups), all run locally via Docker.

## 2. Goals / non-goals

**Goals:**
- Pick a concrete, buildable stack for the WEB subsystem's ~75 functions
  (GĐ1: 62, GĐ2: 7, GĐ4: 6 — see `function-list v2.md` §Thống kê).
- Fit a solo-or-small thesis team working to the Oct 20, 2026 feature
  freeze and Nov 30, 2026 final deadline.
- Respect the already-authored PostgreSQL v2 DDL as the source of truth for
  the relational schema, rather than having an ORM try to own/regenerate it.

**Non-goals (this document):**
- Master Tutor App and Client Agent tech stack.
- The real-time Tutor↔Agent command/heartbeat protocol.
- Anything about screen casting, remote control, or OS-level lockdown
  (those belong to Tutor/Agent design docs).

## 3. Architecture overview

Monorepo, modular monolith:

```
apps/
  web/        Next.js 15 (App Router) — admin portal UI
  api/        NestJS — single deployable modular monolith
packages/
  shared/     generated API types (from Nest's OpenAPI spec) + zod schemas
  config/     shared eslint/tsconfig/prettier
```

Tooling: pnpm workspaces + Turborepo.

Nest is organized as one module per business domain, not microservices —
appropriate for team size and timeline:

- `AuthModule` (WEB-AUTH)
- `AccountsModule` (WEB-ACC)
- `MasterDataModule` — students, lecturers, subjects, academic terms,
  course sections + enrollments (WEB-MD)
- `LabsModule` — labs, workstations, layouts (WEB-LAB)
- `ExamEventsModule` — exam events, event↔section links, event files,
  status history (WEB-EXAM part 1)
- `LabSessionsModule` — lab sessions, proctors, participants, bookings
  (WEB-EXAM part 2)
- `PolicyModule` — exam policy templates → MongoDB (WEB-POL)
- `SubmissionsModule` — read-only lookup/download after exam (WEB-SUB)
- `ReportsModule` — results, stats, audit/log lookup, exports (WEB-RPT)

Each module follows controller → service → repository layering; no CQRS —
unnecessary complexity for this scope.

## 4. Data access layer

**Decision: TypeORM**, chosen over Prisma and Drizzle.

Rationale: the PostgreSQL v2 schema is already fully hand-authored as DDL
(`postgresql-schema-v2.sql`), including GiST exclusion constraints,
append-only trigger-protected history tables, composite foreign keys, and
CHECK constraints. Whatever data-access tool is used must treat that SQL
file as the source of truth rather than trying to regenerate the schema.
All three candidates can do this, but TypeORM is the default, officially
documented Nest pairing (`@nestjs/typeorm`) with the deepest pool of
tutorials and troubleshooting material — the right trade-off for a
deadline-bound thesis with no guaranteed mentor availability, even though
Drizzle's introspect-from-existing-SQL workflow is arguably more elegant.

Implementation approach:
1. The existing `postgresql-schema-v2.sql` becomes the first migration,
   run verbatim (as a raw-SQL TypeORM migration or applied directly and
   tracked via `typeorm migration:create` + pasted SQL).
2. TypeORM entities are hand-written (or scaffolded via
   `typeorm-model-generator` against the live DB, then cleaned up) to
   describe columns for querying — they do not attempt to express GiST
   exclusion constraints, triggers, or CHECK constraints; those live only
   in the SQL migration.
3. `synchronize` is **off** everywhere, including local dev — schema
   changes always go through a new SQL migration, never entity-driven
   sync, to avoid TypeORM silently trying to "fix" constraints it doesn't
   understand.

Error handling implication: booking conflicts (GiST exclusion) and CHECK
violations surface as raw Postgres error codes (`23P01`, `23514`), not
ORM-level validation errors. A Nest exception filter translates these into
`409 Conflict` / `400 Bad Request` responses with a friendly message
instead of a raw Postgres error leaking to the client.

MongoDB access (policy templates, `WEB-POL`) uses `@nestjs/mongoose` +
`mongoose` — separate from the Postgres/TypeORM path, since policy
documents are schema-flexible by design.

## 5. NestJS backend libraries

| Concern | Library |
|---|---|
| Config | `@nestjs/config` + zod-validated env schema |
| Postgres | `@nestjs/typeorm`, `pg` |
| MongoDB (policy templates, snapshots) | `@nestjs/mongoose`, `mongoose` |
| Redis (cache + job queue backing) | `ioredis` |
| Background jobs (Excel import, manifest SHA-256, report export) | `@nestjs/bullmq` + `bullmq` |
| Object storage (MinIO) | `minio` SDK, presigned URLs for upload/download |
| Auth | `@nestjs/jwt`, `@nestjs/passport` + `passport-jwt` (access + refresh tokens) |
| Password hashing | `argon2` — matches the doc's "Argon2id ở app" requirement |
| Validation | `class-validator` + `class-transformer` on DTOs |
| API docs / codegen source | `@nestjs/swagger` (OpenAPI spec feeds the frontend's generated client) |
| Excel import/export | `exceljs` |
| Report/PDF export | `pdfmake` (server-generated, run as a BullMQ job for larger reports) |
| Rate limiting (login) | `@nestjs/throttler` |
| Logging | `nestjs-pino` |
| Health checks (Docker) | `@nestjs/terminus` |
| Testing | Jest (default) + `supertest` for e2e |

## 6. Next.js frontend libraries

| Concern | Library |
|---|---|
| Styling/UI kit | Tailwind CSS + shadcn/ui (Radix-based) |
| Data fetching/mutations | TanStack Query against a typed client generated from Nest's OpenAPI spec (`openapi-typescript` + `openapi-fetch`) |
| Tables | TanStack Table — most WEB entities need sortable/paginated/searchable list views |
| Forms | React Hook Form + Zod (`@hookform/resolvers/zod`) |
| Lab layout / seating diagram editor | `react-konva` — `lab_seats` has free-form `position_x`/`position_y`/`rotation_degrees`, so a canvas library fits better than a grid-based drag-and-drop lib |
| Charts (usage/violation stats, WEB-RPT) | `recharts` |
| Auth on the Next side | Route Handler proxies login to Nest, stores access+refresh JWTs as httpOnly cookies; Next Middleware gates routes by role |

No NextAuth — Nest already owns the user/session/role model
(`users`/`roles`/`user_roles` in the schema), so introducing a second auth
framework on the frontend would duplicate that source of truth.

No GraphQL/tRPC — REST + OpenAPI-generated types is simpler to build under
the deadline and is the more commonly taught/documented pattern; GraphQL's
benefit (avoiding over/under-fetch on nested reads like session →
proctors/participants/seats) doesn't outweigh the added complexity at this
scope.

## 7. Auth & RBAC

Nest is the single source of truth for identity. JWT access token
(short-lived) + refresh token (httpOnly cookie, rotated on use). A
`RolesGuard` + `@Roles('admin' | 'lecturer')` decorator handles
authorization. No CASL — the schema's roles are coarse enough that a
simple guard covers WEB-ACC's needs; revisit only if resource-level
permission checks become necessary later.

## 8. Background jobs

Redis-backed BullMQ queues for anything that shouldn't block a request:
- Excel import (`WEB-MD-05`, student roster import)
- `manifest_sha256` computation when an exam event moves
  `draft → scheduled` (`WEB-EXAM-08`)
- Report export (`WEB-RPT-02`), especially PDF generation via `pdfmake`

The Nest module handling the transition/import returns immediately with a
job id; the frontend polls a status endpoint (TanStack Query with a
refetch interval) rather than requiring a websocket connection — no
real-time infrastructure is introduced for the Web Portal at this scope.

## 9. Deployment

A single `docker-compose.yml`, extending the existing Postgres/Mongo/
Redis/MinIO services with `api` (Nest) and `web` (Next.js standalone
output) services. This keeps the whole portal "local-first," consistent
with the docs' "Docker nội bộ" approach, and gives a one-command startup
for development and for the thesis defense demo.

## 10. Testing strategy

- Nest: Jest unit tests per service; `supertest`-based e2e tests per
  module, run against a disposable Postgres/Mongo via Docker in CI (or
  locally before each GĐ milestone's kiểm thử/đánh giá checkpoint per
  `plan-timeline.md`).
- Next: component tests optional at this scope given timeline pressure;
  prioritize e2e coverage of the critical admin flows (create exam event →
  attach sections/files → schedule → create lab sessions → assign seats)
  since these are the flows the GĐ1 kiểm thử criteria call out explicitly.

## 11. Open questions / deferred decisions

These don't block starting implementation but should be revisited:

1. Whether the Web Portal needs any live/real-time updates (e.g., lab
   session status changing as Tutor/Agent activity happens) — deferred
   until the Tutor↔Agent design is done, since that's where the real-time
   transport gets decided anyway.
2. Multi-language (VI/EN) UI — not addressed; all source docs are
   Vietnamese-only, so no i18n library is included by default.
3. CASL/fine-grained permissions — deferred unless WEB-ACC requirements
   grow beyond simple role checks.

## 12. References

- `KLTN/doc/README.md`
- `KLTN/doc/diagram/function-tree v2.md`
- `KLTN/doc/diagram/function-list v2.md`
- `KLTN/doc/diagram/schema.md`
- `KLTN/doc/diagram/postgresql-schema-v2.sql`
- `KLTN/doc/diagram/plan-timeline.md`
