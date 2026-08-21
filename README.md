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

**Foundation complete.** Auth (`WEB-AUTH-01..03`) and full account management
(`WEB-ACC-01..04` — create, search, edit, delete) work end-to-end through both
the API and the admin UI, on top of the real PostgreSQL v2 schema, with a
Dockerized full-stack deployment and a passing test suite. Everything else —
master data, labs, exam scheduling, policy, submissions, reports — is not yet
built. See [Roadmap](#roadmap).

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
      common/                 PostgresExceptionFilter (23505/23514/23P01/23503 → clean HTTP errors)
      database/               DataSource config, the v2 schema migration, verify-schema script
      main.ts                 bootstrap: cookie-parser, ValidationPipe, CORS, Swagger
    test/                     e2e specs — the suite that actually exercises the DB
  web/                        Next.js 15 admin UI
    src/
      app/(auth)/login/       public login page
      app/(dashboard)/        authenticated pages + shared layout (logout control, QueryClientProvider)
      app/api/auth/           Route Handlers that proxy to the API and set httpOnly cookies
      components/accounts/    AccountForm, EditAccountForm
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

**Not implemented in this repo yet**: master data (students, lecturers,
subjects, terms, course sections), lab/workstation/layout management, exam
event and lab session scheduling, policy templates, submission lookup,
reporting. See [Roadmap](#roadmap).

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

The migration seeds four roles (`admin`, `operator`, `lecturer`, `student`)
but no users, and `POST /auth/register` deliberately can't grant roles to
itself. So the first admin is made by hand:

```bash
curl -X POST http://localhost:4000/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"change-me-please","displayName":"Admin"}'

docker compose exec postgres psql -U lab_admin -d lab_management -c \
  "INSERT INTO lab_management.user_roles (user_id, role_id)
   SELECT u.id, r.id FROM lab_management.users u, lab_management.roles r
   WHERE u.username = 'admin' AND r.code = 'admin';"
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
| `POST /auth/register` | none | creates an `active` account with no roles |
| `POST /auth/login` | none | returns `{ accessToken, refreshToken, user }` |
| `POST /auth/logout` | none | stateless no-op — the client just clears its cookies |
| `POST /auth/refresh` | refresh token (cookie) | rotates both tokens |
| `POST /accounts` | `admin` | create, with `roleCodes` |
| `GET /accounts` | `admin` | search + pagination (`search`, `page`, `pageSize`) |
| `PATCH /accounts/:id` | `admin` | edit `displayName`/`status`/`roleCodes` |
| `DELETE /accounts/:id` | `admin` | soft-delete, blocked at the DB level if the account has active children |

## Tests

**`pnpm --filter api test:e2e` is the suite that matters.** It's what exercises
auth, RBAC, account CRUD, and the Postgres soft-delete-guard triggers, against
the real Dockerized Postgres — so the datastores must be up and the migration
applied first.

```bash
pnpm --filter api test:e2e   # auth + accounts + health, real DB
pnpm --filter api test       # unit specs only (exception filter, service transactions)
pnpm --filter web test       # vitest: middleware, forms, accounts page states
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

1. **Master Data module** (`WEB-MD-01..24`) — students, lecturers, subjects,
   academic terms, course sections + enrollments, Excel import.
2. **Labs module** (`WEB-LAB-01..13`) — labs, workstations, layouts, a
   `react-konva` seating editor.
3. **Exam Events + Lab Sessions module** (`WEB-EXAM-01..19`) — manifest
   hashing, GiST-backed booking conflicts, the draft→scheduled FSM.
4. Policy (`WEB-POL`), Submissions (`WEB-SUB`), Reports (`WEB-RPT`).

Each gets its own design + plan cycle before implementation, same as this one.
