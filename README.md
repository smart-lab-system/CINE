# CINE — ExamCollect

Web app + backend for **ExamCollect** — a system that automates exam
submission collection and AI-assisted grading for teachers, built as a KLTN
(graduation thesis) project.

**This is NOT a surveillance/anti-cheating system** (no machine lockdown, no
remote control, no blocking CLI/disk access). The scope is: connect to
student machines → collect submissions on time, from the right files → store
them in an organized way → the teacher grades on their own initiative when
ready, with AI-suggested scores as assistance. See `CLAUDE.md` for the full
design (roles, schema, business flow, security rules) — that document is the
source of truth; this README is only a snapshot of what's actually built.

The full system has three subsystems: this **web app** (Next.js) + **API**
(NestJS) monorepo, and a separate, not-yet-started **Student Agent**
(Electron or lightweight .NET, runs on lab machines). This repository
implements the web app + API only.

> **2026-08-26 note:** this repo previously targeted a different, now
> abandoned direction — a NetSupport-School-style "Lab/Computer Room
> Management" proctoring portal (labs, seating charts, exam-event booking).
> That schema and its planning docs (formerly the sibling `KLTN/doc/` repo)
> have been removed. Only the generic, domain-agnostic pieces survived the
> pivot: the Auth and Accounts modules, the monorepo/Docker scaffolding, and
> the generated-API-client pattern.

## Status

**Foundation reused, full domain schema in place.** Auth (login/logout/
refresh) and account management (create/search/edit/delete, `admin`-only)
still work end-to-end through both the API and the admin UI. The database
schema now covers the entire ExamCollect domain — courses/semesters/classes/
enrollments, exam sessions, submissions, versioned rubrics, AI grading
results, grade export, admin/cost/audit tables (21 tables total; see
`CLAUDE.md`'s Database Schema section and the entity classes under
`apps/api/src/*/entities/`). No service/controller/UI code for those new
tables exists yet — only the schema, ready to build modules against. See
[Roadmap](#roadmap).

## Tech stack

| Layer | Choice | Why |
| --- | --- | --- |
| Monorepo | pnpm workspaces + Turborepo | one install, shared types, per-app builds |
| API | NestJS 10 | modular monolith; DI, guards, pipes fit this domain well |
| Data access | TypeORM 0.3, entity-driven | **entities are the source of truth** (2026-08-27) — every table's columns/types/constraints/relations are declared as TypeORM decorators; `pnpm --filter api migration:generate` diffs them against the live DB to produce the next migration. `synchronize` stays `false` always — migrations are still explicit, reviewed files, just generated instead of hand-authored from scratch. Anything decorators can't express (trigger functions/triggers, `audit_log`'s RANGE partitioning) is hand-appended to the generated migration — see the comment at the top of `apps/api/src/database/migrations/*-InitialSchema.ts`. |
| Primary DB | PostgreSQL 16 | versioned rubrics, JSONB for AI grading output, hard deletes protected by `ON DELETE RESTRICT` (no soft-delete column anywhere in this schema) |
| Auth | JWT (access + refresh) + argon2id | stateless access tokens, httpOnly cookies, account existence re-checked on every request (accounts are hard-deleted — there's no separate lock/disable status) |
| Frontend | Next.js 15 (App Router) + React 19 | Server/Client Components, Route Handlers proxy auth to the API |
| UI kit | Tailwind CSS + hand-written shadcn/ui primitives | `Button`/`Input`/`Label`/`Card`/`Table` in `apps/web/src/components/ui/` |
| Data fetching | TanStack Query + TanStack Table | typed queries/mutations against the generated API client |
| Forms | React Hook Form + Zod | client-side validation mirroring the API's `class-validator` DTOs |
| API contract | `@nestjs/swagger` (CLI plugin) → `openapi-typescript` → `openapi-fetch` | one generated, fully-typed client in `packages/shared`, no GraphQL/tRPC |
| Infra (dev + prod-like) | Docker Compose | Postgres, MongoDB, Redis, MinIO, plus the `api`/`web` apps themselves |
| Not yet used by this app | MongoDB, Redis, MinIO | reserved for agent heartbeat/online-status (Redis), exam materials + submission files (MinIO/S3 via presigned URL) — consumed by modules not built yet, not by anything in this repo today |

## Project structure

```
apps/
  api/                        NestJS modular monolith
    src/
      auth/                   login/logout/refresh, JWT strategy, RolesGuard (no self-serve register)
      accounts/               account CRUD (controller/service/DTOs) — admin-only
      identity/entities/      AccountEntity (Teacher/Admin — Student never gets a login row)
      course/entities/        Semester, Course, Class, ClassRoster, Enrollment
      exam-session/entities/  ExamSession, RequiredDeliverable, ExamMaterial
      agent-connection/entities/  AgentConnectionEvent (append-only)
      submission/entities/    Submission
      grading/entities/       Rubric, RubricCriterion, GradingResult, TeacherReview, GradeExport
      calibration/entities/   CalibrationRun
      admin/entities/         AuditLog (append-only, partitioned), RubricTemplate, CostBudget, GradingPipelineConfig
      shared/                 BaseEntity (id/createdAt/updatedAt column mixin — no soft-delete)
      health/                 GET /health
      common/                 PostgresExceptionFilter (23505/23514/23P01/23503 → clean HTTP errors)
      database/               DataSource config (entities array), migrations, verify-schema script
      main.ts                 bootstrap: cookie-parser, ValidationPipe, CORS, Swagger
    test/                     e2e specs — the suite that actually exercises the DB
  web/                        Next.js 15 app
    src/
      app/(auth)/login/       public login page (email + password)
      app/(dashboard)/        authenticated pages + shared layout (logout control, QueryClientProvider)
      app/api/auth/           Route Handlers that proxy to the API and set httpOnly cookies
      components/accounts/    AccountForm, EditAccountForm
      components/ui/          hand-written shadcn/ui primitives
      middleware.ts           gates dashboard routes on cookie presence (not JWT validity)
packages/
  shared/                     generated OpenAPI types + a thin `openapi-fetch` client factory
docker/
  postgres-init/              bootstraps the `examcollect` schema before the first migration runs
docs/superpowers/
  specs/                      design docs (the "why")
  plans/                      implementation plans, task-by-task (the "how it got built")
scripts/
  smoke-test.sh               curl-based check against a running Docker stack
docker-compose.yml            postgres, mongo, redis, minio, api, web
CLAUDE.md                     the actual product spec — roles, schema, business flow, security rules
```

## What's implemented

**Auth** (`apps/api/src/auth/`): login (by email) and `/auth/refresh`
(rotates both tokens). No `/auth/register` — `account.role` is `NOT NULL`
with no "signed up, not yet approved" state to land in, so every account
(including the first admin) is provisioned deliberately via `POST /accounts`
or the manual bootstrap below, never by a stranger hitting a public
endpoint. `JwtStrategy` re-loads the account on every authenticated request
and rejects if the row is gone — accounts are hard-deleted, so "not found"
is the only revocation state (no separate lock/disable status column).

**Accounts** (`apps/api/src/accounts/`, `apps/web/src/components/accounts/`):
create/search/edit/delete, `RolesGuard`-enforced to `admin` only. Single-
table, single-statement writes (`account.role` is a plain column — no
`roles`/`user_roles` join table). Deleting an account that's still
referenced elsewhere (e.g. `enrollment.home_teacher_id`) is blocked by a
plain `ON DELETE RESTRICT` foreign key, surfaced through the API as a clean
`409` rather than a raw Postgres error. Only `admin` and `teacher` are
offered by the web UI — `super_admin`/`department_admin` are valid
`account.role` values reserved for future Department/Super-Admin tiering,
but nothing (`RolesGuard` included) treats them as admin-equivalent yet, so
the create/edit forms don't expose them. Student never gets an `account`
row — the Agent authenticates against `enrollment` directly (see
`CLAUDE.md`).

**Not implemented in this repo yet**: everything domain-specific — course/
semester/roster/enrollment management, exam session creation, the Student
Agent's WebSocket connection, submission collection, rubric authoring, the
AI grading pipeline, teacher review, grade export, and the admin cost/audit
views. The database schema and TypeORM entities for all of it already exist
(see `CLAUDE.md`'s Database Schema section and the `entities/` folders
above); no service/controller/UI code has been written against it yet. See
[Roadmap](#roadmap).

## Prerequisites

| Tool           | Version                                              |
| -------------- | ---------------------------------------------------- |
| Node.js        | 20+ (22 works; the Docker images pin `node:20-alpine`) |
| pnpm           | 9.12.0 (`corepack enable` picks it up from `packageManager`) |
| Docker         | Compose v2 (`docker compose`, not `docker-compose`)  |

## First-time setup

Run these in order — each step depends on the one before it.

```bash
# 1. API config. The real .env stays untracked; the defaults in the example
#    already point at the Docker ports below, so no edits are needed for
#    local development.
cp apps/api/.env.example apps/api/.env

# 2. Datastores. Postgres runs docker/postgres-init/001-create-schema.sql on
#    first boot to create an empty `examcollect` schema — TypeORM needs it
#    to exist before it can write its own migrations table in step 4.
docker compose up -d postgres mongo redis minio

# 3. Dependencies (workspace-wide).
pnpm install

# 4. Apply the schema. Wait until `docker compose ps` shows postgres healthy.
pnpm --filter api migration:run

# 5. Run the apps (separate terminals — both are watch processes).
pnpm --filter api dev   # http://localhost:4000, Swagger at /api-docs
pnpm --filter web dev   # http://localhost:3000
```

`apps/web` needs no `.env` for local development: it defaults to
`http://localhost:4000` for both the browser-side API base URL
(`NEXT_PUBLIC_API_URL`) and the Route Handlers' server-side one (`API_URL`).

### Getting a first admin account

There's no self-serve register endpoint (see "What's implemented" above),
so the first admin is inserted directly:

```bash
docker compose exec postgres psql -U examcollect_admin -d examcollect -c \
  "INSERT INTO examcollect.account (name, email, password_hash, role)
   VALUES ('Admin', 'admin@example.com', '<argon2id-hash>', 'admin');"
```

Generate the argon2id hash first (matches what `AccountsService#create()`
does): `node -e "require('argon2').hash('change-me-please',{type:2}).then(console.log)"`
from `apps/api` (needs `pnpm install` already done). Then log in at
http://localhost:3000/login with that email/password. Every account after
this one can be created normally through `POST /accounts` (or the "Tạo tài
khoản mới" form) once you're logged in as this admin.

### Changing the schema

Edit the entity file(s) under `apps/api/src/*/entities/`, then run
`pnpm --filter api migration:generate src/database/migrations/<Name>` to
produce the next migration. Review the generated file before running it —
TypeORM has occasionally emitted a duplicate `CREATE TYPE` for an enum
reused across two entities, which needs manually de-duplicating (see the
comment at the top of the existing `*-InitialSchema.ts` for a real example).
Anything decorators can't express (triggers, `PARTITION BY`) has to be
hand-appended to the generated file — it won't be regenerated automatically
on the next `migration:generate` run, so keep it in a clearly-marked section
like the existing migration does.

## Ports

The **host-side** ports are deliberately non-default because this dev machine
already has unrelated projects bound to the standard ones. Container-internal
ports and Docker-network addresses (`postgres:5432`, `api:4000`) are all
standard and unaffected. The numbers themselves aren't load-bearing — pick
whatever is free on your machine.

| Service           | Host   | In-container |
| ----------------- | ------ | ------------ |
| Postgres          | `5442` | `5432`       |
| MongoDB           | `27018`| `27017`      |
| Redis             | `6390` | `6379`       |
| MinIO (S3/console)| `9010`/`9011` | `9000`/`9001` |
| API (Docker)      | `4010` | `4000`       |
| Web (Docker)      | `3010` | `3000`       |

Running the apps from the host with `pnpm dev` (not Docker) uses the plain
`4000`/`3000` — the remapping applies only to the containerized `api`/`web`
services.

## API surface (current)

Full detail always lives in Swagger (`/api-docs`, `/api-docs-json`) — this is
just an index of what exists today.

| Method + path | Auth | Notes |
| --- | --- | --- |
| `GET /health` | none | `{ status: 'ok' }` |
| `POST /auth/login` | none | body `{ email, password }`, returns `{ accessToken, refreshToken, account }` |
| `POST /auth/logout` | none | stateless no-op — the client just clears its cookies |
| `POST /auth/refresh` | refresh token (cookie) | rotates both tokens |
| `POST /accounts` | `admin` | create, body `{ name, email, password, role }` |
| `GET /accounts` | `admin` | search + pagination (`search`, `page`, `pageSize`) |
| `PATCH /accounts/:id` | `admin` | edit `name`/`email`/`role` |
| `DELETE /accounts/:id` | `admin` | hard delete, blocked (`409`) if the account is still referenced elsewhere |

## Tests

**`pnpm --filter api test:e2e` is the suite that matters.** It's what exercises
auth, RBAC, account CRUD, and the FK-RESTRICT protection on account
deletion, against the real Dockerized Postgres — so the datastores must be
up and the migration applied first. There's no `/auth/register` any more,
so e2e specs bootstrap test accounts by inserting directly into
`examcollect.account` (see `apps/api/test/helpers/create-account.ts`) —
the same thing a real deployment does for its first admin.

```bash
pnpm --filter api test:e2e   # auth + accounts + health, real DB
pnpm --filter api test       # unit specs only (exception filter, accounts service)
pnpm --filter web test       # vitest: middleware, forms, accounts page states
```

The root `pnpm test` runs Turborepo's `test` task, which only picks up the two
apps' unit-test scripts — it does **not** run the e2e suite. Don't read a green
root `pnpm test` as "the API works".

## Other commands

```bash
pnpm build                       # turbo: nest build + next build
pnpm lint                        # turbo: eslint in both apps
pnpm --filter api migration:generate src/database/migrations/<Name>
pnpm --filter api migration:revert
```

## Running the whole stack in Docker

```bash
docker compose up -d --build     # datastores + api + web
pnpm --filter api migration:run  # still run from the host, against port 5442
./scripts/smoke-test.sh          # health, /api-docs-json, and /login respond
```

The API image's entry point is `dist/src/main.js`, not `dist/main.js`:
`apps/api/tsconfig.json` sets no `rootDir`, so `tsc` mirrors both `src/` and
`test/` under `dist/`.

## Roadmap

Per `CLAUDE.md`'s Main Business Flow and MVP scope, in rough delivery order
(each still needs its own design + plan cycle before implementation — the
schema/entities below already exist, only the service/controller/UI layer
doesn't):

1. **Course/Semester/Roster module** — courses, semesters, classes, Excel
   import of `class_roster`, and deriving `enrollment` (course-level
   join-auth, independent of physical room/class — see `CLAUDE.md` Security
   rule 1).
2. **Exam Session module** — session creation, `RequiredDeliverable`
   declaration, exam-material upload (presigned URL, released only after
   `start_time`), the WebSocket gateway the Student Agent connects to.
3. **Student Agent** (separate app, not started) — connect, create the
   working folder with required files, periodic snapshot backup, finalize on
   command.
4. **Submission collection** — exact-filename matching against
   `RequiredDeliverable`, backup fallback, real-time status on the web.
5. **Grading module** — rubric authoring, the AI grading queue (model
   cascade via `GradingPipelineConfig`, `AIGradingProvider` abstraction),
   teacher review, `GradeExport` (writes scores back into the teacher's own
   gradebook file), calibration runs.
6. **Admin module** — teacher account management (builds on what's already
   here), AI cost dashboard/budget, audit log viewer.

Word/Excel submissions come first (lowest risk), then code (autograder
sandbox), then photographed handwritten answers (vision model, highest
accuracy risk) — per `CLAUDE.md`'s MVP scope.
