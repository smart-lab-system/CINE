# CINE — Web Management Portal

Admin web portal for **Hệ thống quản lý phòng máy** (Lab/Computer Room
Management System), a NetSupport-School-style platform for running proctored
exams and supervised practice sessions in university computer labs — built as
a KLTN (graduation thesis) project.

The full system has four subsystems: this **Web Management Portal**, a
**Master Tutor App** (lecturer desktop app), a **Client Agent** (runs on
student workstations), and a **Central Database**. This repository implements
the Web Management Portal only — the browser-facing admin app that manages
accounts, master data, lab layouts, exam scheduling, policy templates,
submissions, and reporting. The Tutor App and Client Agent are separate,
not-yet-started subsystems; their design will follow once enough of the Web
Portal's data model exists for them to build against.

Non-code planning documents for the whole system (function trees, the
PostgreSQL schema design, the delivery timeline) live in a **separate sibling
repo**, `KLTN/doc/`, not in this repository.

## Status

**Foundation through exam scheduling.** Auth (`WEB-AUTH-01..03`), account
management (`WEB-ACC-01..04`), master data (`WEB-MD`), labs (`WEB-LAB`), and
exam events + lab sessions (`WEB-EXAM-01..19`) work end-to-end through both
the API and the admin UI, on top of the real PostgreSQL v2 schema, with a
Dockerized full-stack deployment and a passing test suite. Excel roster
import (`WEB-MD-05`) and real MinIO package upload are deferred. Policy,
submissions, and reports are not yet built. See [Roadmap](#roadmap).

## Tech stack

| Layer | Choice | Why |
| --- | --- | --- |
| Monorepo | pnpm workspaces + Turborepo | one install, shared types, per-app builds |
| API | NestJS 10 | modular monolith; DI, guards, pipes fit this domain well |
| Data access | TypeORM 0.3, `synchronize: false` always | Postgres schema is **schema-first** — the DBA-authored DDL is the source of truth, entities only describe columns for querying |
| Primary DB | PostgreSQL 16 | the already-designed v2 schema (roles, soft-delete guards, exclusion constraints) |
| Auth | JWT (access + refresh) + argon2id | stateless access tokens, httpOnly cookies, account `status` enforced on every request |
| Frontend | Next.js 15 (App Router) + React 19 | Server/Client Components, Route Handlers proxy auth to the API |
| UI kit | Tailwind CSS + hand-written shadcn/ui primitives | `Button`/`Input`/`Label`/`Card`/`Table` in `apps/web/src/components/ui/` |
| Data fetching | TanStack Query + TanStack Table | typed queries/mutations against the generated API client |
| Forms | React Hook Form + Zod | client-side validation mirroring the API's `class-validator` DTOs |
| API contract | `@nestjs/swagger` (CLI plugin) → `openapi-typescript` → `openapi-fetch` | one generated, fully-typed client in `packages/shared`, no GraphQL/tRPC |
| Infra (dev + prod-like) | Docker Compose | Postgres, MongoDB, Redis, MinIO, plus the `api`/`web` apps themselves |
| Not yet used by this app | MongoDB, Redis, MinIO | reserved for policy templates/violation logs, live machine state, and exam/submission files — consumed by later modules and by the Tutor/Agent subsystems, not by anything in this repo yet |

Full rationale for every choice above: `docs/superpowers/specs/2026-08-20-web-management-portal-design.md`.

## Project structure

```
apps/
  api/                        NestJS modular monolith
    src/
      auth/                   register/login/logout/refresh, JWT strategy, RolesGuard
      accounts/               account CRUD (controller/service/DTOs), transactional writes
      identity/entities/      TypeORM entities for users/roles/user_roles (schema-first)
      health/                 GET /health
      common/                 PostgresExceptionFilter (23505/23514/23P01/23503/55000 → clean HTTP errors)
      database/               DataSource config, unified schema SQL, verify-schema script
      master-data/            students, lecturers, subjects, terms, course sections + enrollments
      labs/                   labs, workstations, layouts/seats, seating templates
      exams/                  exam events, lab sessions, proctors, roster, stub stored objects
      main.ts                 bootstrap: cookie-parser, ValidationPipe, CORS, Swagger
    test/                     e2e specs — the suite that actually exercises the DB
  web/                        Next.js 15 admin UI
    src/
      app/(auth)/login/       public login page
      app/(dashboard)/        authenticated pages + shared layout (logout control, QueryClientProvider)
      app/api/auth/           Route Handlers that proxy to the API and set httpOnly cookies
      components/accounts/    AccountForm, EditAccountForm
      components/exams/       exam event workspace (sections, sittings, proctors, roster, publish)
      components/labs/        lab form, seating editor
      components/ui/          hand-written shadcn/ui primitives
      middleware.ts           gates dashboard routes on cookie presence (not JWT validity)
packages/
  shared/                     generated OpenAPI types + a thin `openapi-fetch` client factory
docker/
  postgres-init/              bootstraps the `lab_management` schema before the first migration runs
docs/superpowers/
  specs/                      design docs (the "why")
  plans/                      implementation plans, task-by-task (the "how it got built")
scripts/
  smoke-test.sh               curl-based check against a running Docker stack
docker-compose.yml            postgres, mongo, redis, minio, api, web
```

## What's implemented

**Auth** (`apps/api/src/auth/`): register, login, logout (client-side cookie
clear only — refresh tokens are stateless, there's no server-side revocation
list), and `/auth/refresh` (rotates both tokens). `JwtStrategy` re-loads the
user on every authenticated request and rejects if it's been soft-deleted or
its `status` is no longer `active` — a locked/disabled account's existing
tokens stop working immediately, not just at their next expiry.

**Accounts** (`apps/api/src/accounts/`, `apps/web/src/components/accounts/`):
create/search/edit/delete, `RolesGuard`-enforced to `admin` only. `create`,
`update`, and `remove` each run in a single DB transaction — a user write and
its role-assignment writes commit or roll back together. The DB's own
`guard_master_soft_delete` trigger backs this up: it refuses to soft-delete a
row that still has active children, surfaced through the API as a clean `409`
rather than a raw Postgres error.

**Master Data** (`apps/api/src/master-data/`, `apps/web` pages under
`/students`, `/lecturers`, `/subjects`, `/academic-terms`, `/course-sections`):
CRUD + search for students, lecturers, subjects, academic terms, and course
sections; enroll/unenroll students on a section. Admin-only. Soft-delete
respects `guard_master_soft_delete` (409 when active children remain). Excel
import is not included yet.

**Labs** (`apps/api/src/labs/`, `apps/web` pages under `/labs` and
`/seating-templates`): lab/workstation CRUD, seating layouts, a
`react-konva` editor, and reusable seating templates. Admin-only.

**Exam Events + Lab Sessions** (`apps/api/src/exams/`, `apps/web` pages under
`/exam-events`): draft a subject exam, attach course sections, book lab
sittings, assign a lead proctor and roster, attach a stub question file, and
**publish** (`draft → scheduled`). Postgres owns the FSM, manifest hash, GiST
overlap, and status history. `POST /stored-objects` is a metadata stub so
publish can proceed without MinIO.

**Not implemented in this repo yet**: policy templates, real MinIO
presigned upload, submission lookup, reporting. See [Roadmap](#roadmap).

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
#    first boot to create an empty `lab_management` schema — TypeORM needs it
#    to exist before it can write its own migrations table in step 4.
docker compose up -d postgres mongo redis minio

# 3. Dependencies (workspace-wide).
pnpm install

# 4. Apply the schema (one script: sql/0001_initial_schema.sql). Wait until
#    `docker compose ps` shows postgres healthy.
pnpm --filter api migration:run

# 5. Run the apps (separate terminals — both are watch processes).
pnpm --filter api dev   # http://localhost:4000, Swagger at /api-docs
pnpm --filter web dev   # http://localhost:3000
```

`apps/web` needs no `.env` for local development: it defaults to
`http://localhost:4000` for both the browser-side API base URL
(`NEXT_PUBLIC_API_URL`) and the Route Handlers' server-side one (`API_URL`).

### Getting a first admin account

Default local login (also created by `node scripts/seed-sample-data.mjs`):

- Username: `691861`
- Password: `Bao@0412`
- Role: `admin`

The schema seeds four roles (`admin`, `operator`, `lecturer`, `student`)
but no users, and `POST /auth/register` cannot grant roles to itself. If
the account is missing, create it and attach the `admin` role:

```bash
curl -X POST http://localhost:4000/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"username":"691861","password":"Bao@0412","displayName":"Admin"}'

docker compose exec postgres psql -U lab_admin -d lab_management -c \
  "INSERT INTO lab_management.user_roles (user_id, role_id)
   SELECT u.id, r.id FROM lab_management.users u, lab_management.roles r
   WHERE u.username = '691861' AND r.code = 'admin';"
```

Then log in at http://localhost:3000/login. Note that only `active` accounts
can log in, and `register` creates accounts as `active` — an admin who later
sets an account to `locked`/`disabled` cuts it off immediately, including any
access token already issued to it.

## Ports

The **host-side** ports are deliberately non-default because this dev machine
already has unrelated projects bound to the standard ones. Container-internal
ports and Docker-network addresses (`postgres:5432`, `api:4000`) are all
standard and unaffected. The numbers themselves aren't load-bearing — pick
whatever is free on your machine. Full rationale: see the plan doc's Task 2
Step 1 (datastores) and Task 9 (api/web).

| Service           | Host   | In-container |
| ----------------- | ------ | ------------ |
| Postgres          | `5442` | `5432`       |
| MongoDB           | `27018`| `27017`      |
| Redis             | `6390` | `6379`       |
| MinIO (S3/console)| `9020`/`9021` | `9000`/`9001` |
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
| `POST /auth/register` | none | creates an `active` account with no roles |
| `POST /auth/login` | none | returns `{ accessToken, refreshToken, user }` |
| `POST /auth/logout` | none | stateless no-op — the client just clears its cookies |
| `POST /auth/refresh` | refresh token (cookie) | rotates both tokens |
| `POST /accounts` | `admin` | create, with `roleCodes` |
| `GET /accounts` | `admin` | search + pagination (`search`, `page`, `pageSize`) |
| `PATCH /accounts/:id` | `admin` | edit `displayName`/`status`/`roleCodes` |
| `DELETE /accounts/:id` | `admin` | soft-delete, blocked at the DB level if the account has active children |
| `POST/GET/PATCH/DELETE /subjects` | `admin` | subject CRUD + search |
| `POST/GET/PATCH/DELETE /academic-terms` | `admin` | term CRUD + search |
| `POST/GET/PATCH/DELETE /students` | `admin` | student CRUD + search (`status` filter) |
| `POST/GET/PATCH/DELETE /lecturers` | `admin` | lecturer CRUD + search |
| `POST/GET/PATCH/DELETE /course-sections` | `admin` | section CRUD + search (`subjectId`, `academicTermId`) |
| `GET /course-sections/:id` | `admin` | section detail |
| `GET/POST/DELETE /course-sections/:id/enrollments` | `admin` | list / enroll / unenroll |
| `POST /course-sections/:id/enrollments/bulk` | `admin` | bulk enroll by `studentIds` |
| `POST/GET/PATCH/DELETE /labs` | `admin` | lab CRUD + search |
| `GET /labs/:id` | `admin` | lab detail |
| `POST/GET/PATCH/DELETE /labs/:labId/workstations` | `admin` | workstation CRUD |
| `PATCH /labs/:labId/workstations/batch-rename` | `admin` | batch rename |
| `POST/GET/PATCH/DELETE /labs/:labId/layouts` | `admin` | seating layouts |
| `POST /labs/:labId/layouts/:id/activate` | `admin` | mark a layout active |
| `POST /labs/:labId/layouts/:id/apply-template` | `admin` | apply a seating template |
| `PUT /labs/:labId/layouts/:id/seats` | `admin` | bulk upsert seats |
| `DELETE /labs/:labId/layouts/:id/seats/:seatId` | `admin` | remove a seat |
| `POST/GET/PATCH/DELETE /seating-templates` | `admin` | reusable seating templates |
| `POST/GET/PATCH/DELETE /exam-events` | `admin` | exam event CRUD + search (`subjectId`, `status`, `from`, `to`) |
| `GET /exam-events/:id` | `admin` | workspace payload (sections, files, session summaries, `rowVersion`) |
| `POST/DELETE /exam-events/:id/sections` | `admin` | attach / detach course sections |
| `POST/DELETE /exam-events/:id/files` | `admin` | attach / detach package files |
| `POST /exam-events/:id/status` | `admin` | FSM (`toStatus`, `reason`, `rowVersion`); DB hashes + cascades rooms |
| `GET /exam-events/:id/status-history` | `admin` | append-only event history |
| `POST/GET/PATCH/DELETE /exam-events/:id/sessions` | `admin` | lab sittings (GiST overlap on the same lab) |
| `GET /exam-events/:id/sessions/:sessionId` | `admin` | sitting detail (proctors, participant count, `rowVersion`) |
| `POST /exam-events/:id/sessions/:sessionId/status` | `admin` | sitting FSM |
| `GET /exam-events/:id/sessions/:sessionId/status-history` | `admin` | append-only sitting history |
| `POST/DELETE /exam-events/:id/sessions/:sessionId/proctors` | `admin` | lead + assistants (exactly one lead) |
| `GET/POST/PATCH/DELETE /exam-events/:id/sessions/:sessionId/participants` | `admin` | roster; optional seats while draft |
| `POST /exam-events/:id/sessions/:sessionId/participants/bulk` | `admin` | bulk enroll from an attached section |
| `POST /stored-objects` | `admin` | stub object metadata so publish can proceed without MinIO |

## Tests

**`pnpm --filter api test:e2e` is the suite that matters.** It's what exercises
auth, RBAC, account CRUD, master data, labs, exam publish/FSM, and the
Postgres guard triggers, against the real Dockerized Postgres — so the
datastores must be up and the schema applied first.

```bash
pnpm --filter api test:e2e   # auth + accounts + master data + labs + exams, real DB
pnpm --filter api test       # unit specs only (exception filter, service transactions)
pnpm --filter web test       # vitest: middleware, forms, accounts/labs/exam page states
```

The root `pnpm test` runs Turborepo's `test` task, which only picks up the two
apps' unit-test scripts — it does **not** run the e2e suite. Don't read a green
root `pnpm test` as "the API works".

## Other commands

```bash
pnpm build                   # turbo: nest build + next build
pnpm lint                    # turbo: eslint in both apps
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

Per `docs/superpowers/plans/2026-08-20-web-portal-foundation.md`'s own
"What's next", in delivery order:

1. ~~**Master Data module** (`WEB-MD`)~~ — done (Excel import still open).
2. ~~**Labs module** (`WEB-LAB-01..13`)~~ — done.
3. ~~**Exam Events + Lab Sessions module** (`WEB-EXAM-01..19`)~~ — done
   (real MinIO package upload still open).
4. Policy (`WEB-POL`), Submissions (`WEB-SUB`), Reports (`WEB-RPT`).

Each gets its own design + plan cycle before implementation, same as this one.
