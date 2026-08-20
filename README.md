# Web Management Portal

Foundation for the lab/exam management system: a NestJS API (`apps/api`) and a
Next.js 15 admin portal (`apps/web`) in a pnpm/Turborepo monorepo, sharing
generated OpenAPI types through `packages/shared`. Postgres is schema-first —
the DBA-authored v2 DDL runs verbatim as the first migration and TypeORM never
generates schema.

Design and implementation notes live in
`docs/superpowers/plans/2026-08-20-web-portal-foundation.md`.

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

The migration seeds the four roles (`admin`, `operator`, `lecturer`,
`student`) but no users, and `POST /auth/register` deliberately can't grant
roles to itself. So the first admin is made by hand:

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
