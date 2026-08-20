# Web Portal Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Web Management Portal's foundation — monorepo, all four datastores in Docker, the existing PostgreSQL v2 schema applied as a migration, and working auth + account management (`WEB-AUTH-01..03`, `WEB-ACC-01..04`) end-to-end through both the Nest API and the Next.js admin UI.

**Architecture:** pnpm/Turborepo monorepo with `apps/api` (NestJS modular monolith) and `apps/web` (Next.js 15 App Router), sharing generated API types via `packages/shared`. Postgres is schema-first: the already-authored DDL is applied verbatim as the first migration; TypeORM entities describe columns for querying only, never regenerate schema.

**Tech Stack:** NestJS 10, TypeORM 0.3 (raw-SQL migrations, `synchronize: false`), PostgreSQL 16 (schema `lab_management`), argon2 password hashing, JWT (access + refresh), Next.js 15 + React 19, Tailwind + shadcn/ui, TanStack Query/Table, React Hook Form + Zod, Docker Compose for Postgres/MongoDB/Redis/MinIO.

**Spec:** `docs/superpowers/specs/2026-08-20-web-management-portal-design.md`

## Global Constraints

- Data access for Postgres is **TypeORM**, with the existing `postgresql-schema-v2.sql` DDL run verbatim as the first migration. `synchronize` is `false` everywhere, always.
- Passwords are hashed with **argon2** (Argon2id) — never store plaintext or a weaker hash.
- No NextAuth — Nest is the sole source of truth for identity; Next only proxies to Nest and stores tokens in httpOnly cookies.
- No GraphQL/tRPC — REST + Nest's OpenAPI (Swagger) spec feeds a generated TypeScript client consumed from `packages/shared`.
- All infra (Postgres, MongoDB, Redis, MinIO) runs locally via Docker Compose — no cloud dependency for development.
- Postgres objects live in the `lab_management` schema (per the DDL's `CREATE SCHEMA lab_management; SET search_path TO lab_management, public;`), not `public`.
- Booking/exclusion-style Postgres errors (`23P01`, `23514`) must be translated to friendly HTTP responses, never leaked raw to a client — this plan's tasks don't hit exclusion constraints yet (those come with `LabSessionsModule`, a later plan), but the pattern established in Task 4's exception filter must be reused there.

---

### Task 1: Monorepo scaffold + Nest bootstrap with a health endpoint

**Files:**
- Create: `package.json` (root)
- Create: `pnpm-workspace.yaml`
- Create: `turbo.json`
- Create: `tsconfig.base.json`
- Create: `.gitignore`
- Create: `apps/api/package.json`
- Create: `apps/api/tsconfig.json`
- Create: `apps/api/nest-cli.json`
- Create: `apps/api/src/main.ts`
- Create: `apps/api/src/app.module.ts`
- Create: `apps/api/src/health/health.module.ts`
- Create: `apps/api/src/health/health.controller.ts`
- Test: `apps/api/test/health.e2e-spec.ts`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: a running Nest app on `process.env.PORT` (default `4000`) exposing `GET /health` → `{ status: 'ok' }`; root scripts `pnpm dev`, `pnpm build`, `pnpm test`, `pnpm lint` (via Turborepo, delegating to each app).

- [ ] **Step 1: Create the workspace root files**

`package.json`:
```json
{
  "name": "cine-web-portal",
  "private": true,
  "packageManager": "pnpm@9.12.0",
  "scripts": {
    "dev": "turbo run dev",
    "build": "turbo run build",
    "test": "turbo run test",
    "lint": "turbo run lint"
  },
  "devDependencies": {
    "turbo": "^2.1.3",
    "typescript": "^5.6.3"
  }
}
```

`pnpm-workspace.yaml`:
```yaml
packages:
  - "apps/*"
  - "packages/*"
```

`turbo.json`:
```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": { "dependsOn": ["^build"], "outputs": ["dist/**", ".next/**"] },
    "dev": { "cache": false, "persistent": true },
    "test": { "dependsOn": ["build"] },
    "lint": {}
  }
}
```

`tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "moduleResolution": "node",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  }
}
```

`.gitignore`:
```
node_modules/
dist/
.next/
.env
.turbo/
*.log
```

- [ ] **Step 2: Scaffold `apps/api`**

`apps/api/package.json`:
```json
{
  "name": "api",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "build": "nest build",
    "dev": "nest start --watch",
    "start": "node dist/main.js",
    "test": "jest --passWithNoTests",
    "test:e2e": "jest --config ./test/jest-e2e.json",
    "lint": "eslint \"src/**/*.ts\""
  },
  "dependencies": {
    "@nestjs/common": "^10.4.4",
    "@nestjs/core": "^10.4.4",
    "@nestjs/platform-express": "^10.4.4",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.1"
  },
  "devDependencies": {
    "@nestjs/cli": "^10.4.5",
    "@nestjs/testing": "^10.4.4",
    "@types/express": "^4.17.21",
    "@types/jest": "^29.5.13",
    "@types/node": "^20.16.10",
    "@types/supertest": "^6.0.2",
    "jest": "^29.7.0",
    "supertest": "^7.0.0",
    "ts-jest": "^29.2.5",
    "ts-node": "^10.9.2",
    "typescript": "^5.6.3"
  },
  "jest": {
    "rootDir": "src",
    "testRegex": ".*\\.spec\\.ts$",
    "transform": { "^.+\\.(t|j)s$": "ts-jest" },
    "collectCoverageFrom": ["**/*.(t|j)s"]
  }
}
```

`apps/api/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "baseUrl": "./",
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "target": "ES2022"
  }
}
```

`apps/api/nest-cli.json`:
```json
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src"
}
```

`apps/api/src/main.ts`:
```ts
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = process.env.PORT ?? 4000;
  await app.listen(port);
}

bootstrap();
```

`apps/api/src/app.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';

@Module({
  imports: [HealthModule],
})
export class AppModule {}
```

`apps/api/src/health/health.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';

@Module({
  controllers: [HealthController],
})
export class HealthModule {}
```

- [ ] **Step 3: Write the failing e2e test for `GET /health`**

`apps/api/test/health.e2e-spec.ts`:
```ts
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Health (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health returns { status: "ok" }', async () => {
    const response = await request(app.getHttpServer()).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });
});
```

`apps/api/test/jest-e2e.json`:
```json
{
  "moduleFileExtensions": ["js", "json", "ts"],
  "rootDir": ".",
  "testEnvironment": "node",
  "testRegex": ".e2e-spec.ts$",
  "transform": { "^.+\\.(t|j)s$": "ts-jest" }
}
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `pnpm --filter api test:e2e`
Expected: FAIL — `HealthController` does not exist yet (module resolution error).

- [ ] **Step 5: Implement `HealthController`**

`apps/api/src/health/health.controller.ts`:
```ts
import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  check(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm --filter api test:e2e`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-workspace.yaml turbo.json tsconfig.base.json .gitignore apps/api pnpm-lock.yaml
git commit -m "feat(api): bootstrap Nest app with health endpoint"
```

---

### Task 2: Docker Compose infra + apply the existing Postgres v2 DDL as the first migration

**Files:**
- Create: `docker-compose.yml`
- Create: `apps/api/.env.example`
- Create: `apps/api/src/database/data-source.ts`
- Create: `apps/api/src/database/migrations/0001_initial_schema.ts`
- Create: `apps/api/src/database/migrations/sql/0001_initial_schema.sql` (verbatim copy)
- Create: `apps/api/src/database/verify-schema.ts`
- Modify: `apps/api/package.json` (add `typeorm`, `pg`, `dotenv`, migration scripts)

**Interfaces:**
- Consumes: nothing new from Task 1 (independent infra work).
- Produces: `dataSourceOptions` (type `DataSourceOptions`, exported from `apps/api/src/database/data-source.ts`, currently with `entities: []` — Task 3 adds entities); a Postgres instance with every table from the v2 schema already created in the `lab_management` schema.

- [ ] **Step 1: Add Docker Compose services for all four datastores**

`docker-compose.yml`:
```yaml
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_DB: lab_management
      POSTGRES_USER: lab_admin
      POSTGRES_PASSWORD: lab_admin_password
    ports:
      - "5442:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U lab_admin -d lab_management"]
      interval: 5s
      timeout: 5s
      retries: 10

  mongo:
    image: mongo:7
    environment:
      MONGO_INITDB_ROOT_USERNAME: lab_admin
      MONGO_INITDB_ROOT_PASSWORD: lab_admin_password
    ports:
      - "27018:27017"
    volumes:
      - mongo_data:/data/db

  redis:
    image: redis:7-alpine
    ports:
      - "6390:6379"
    volumes:
      - redis_data:/data

  minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: lab_admin
      MINIO_ROOT_PASSWORD: lab_admin_password
    ports:
      - "9010:9000"
      - "9011:9001"
    volumes:
      - minio_data:/data

volumes:
  postgres_data:
  mongo_data:
  redis_data:
  minio_data:
```

The host-side ports (`5442`, `27018`, `6390`, `9010`/`9011`) are deliberately non-default — this dev machine already has other projects' Postgres/Mongo/Redis/MinIO bound to the standard ports (`5432`, `27017`, `6379`, `9000`/`9001`). The container-internal ports stay standard (`5432`, `27017`, `6379`, `9000`/`9001`), so nothing inside the Docker network (service-to-service traffic, e.g. `postgres:5432`) is affected — only host-side access (e.g. running `pnpm --filter api migration:run` from the host during development, before Task 8 containerizes the API too) needs the remapped port. If your machine doesn't have this conflict, these could just as well be the defaults — the specific numbers aren't load-bearing, only that whatever you pick is actually free on the host running this.

Run: `docker compose up -d postgres mongo redis minio`
Expected: all four containers report `running`/`healthy` via `docker compose ps`.

- [ ] **Step 2: Add Postgres env config**

`apps/api/.env.example`:
```
NODE_ENV=development
PORT=4000
DATABASE_URL=postgresql://lab_admin:lab_admin_password@localhost:5442/lab_management
DATABASE_SCHEMA=lab_management
ACCESS_TOKEN_SECRET=dev-access-secret-change-me
ACCESS_TOKEN_TTL=15m
REFRESH_TOKEN_SECRET=dev-refresh-secret-change-me
REFRESH_TOKEN_TTL=7d
```

Copy it: `cp apps/api/.env.example apps/api/.env` (real `.env` stays untracked per `.gitignore`).

- [ ] **Step 3: Add TypeORM + Postgres driver dependencies**

Modify `apps/api/package.json` — add to `dependencies`:
```json
"@nestjs/config": "^3.3.0",
"typeorm": "^0.3.20",
"pg": "^8.13.0",
"dotenv": "^16.4.5"
```
and to `scripts`:
```json
"migration:run": "ts-node -r dotenv/config -r tsconfig-paths/register ./node_modules/typeorm/cli.js migration:run -d src/database/data-source.ts",
"migration:revert": "ts-node -r dotenv/config -r tsconfig-paths/register ./node_modules/typeorm/cli.js migration:revert -d src/database/data-source.ts"
```
and to `devDependencies`: `"tsconfig-paths": "^4.2.0"`.

Run: `pnpm --filter api install`

- [ ] **Step 4: Write the DataSource config**

`apps/api/src/database/data-source.ts`:
```ts
import 'dotenv/config';
import { DataSource, DataSourceOptions } from 'typeorm';

// Entities are added here as they're created — starting with Task 3's
// identity entities. Migrations always run as raw SQL against the
// already-authored DDL; TypeORM never generates or alters schema here.
export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  url: process.env.DATABASE_URL,
  schema: process.env.DATABASE_SCHEMA ?? 'lab_management',
  entities: [],
  migrations: [__dirname + '/migrations/*.{js,ts}'],
  // The initial migration's SQL file already wraps itself in BEGIN/COMMIT
  // (it's the DBA-authored DDL, copied verbatim). Running TypeORM's own
  // transaction wrapper on top would nest a COMMIT inside TypeORM's
  // transaction and commit it early, so per-migration files own their
  // own transaction boundaries instead.
  migrationsTransactionMode: 'none',
  synchronize: false,
  logging: process.env.NODE_ENV === 'development',
};

export default new DataSource(dataSourceOptions);
```

- [ ] **Step 5: Copy the existing DDL verbatim and wrap it in a migration**

```bash
mkdir -p apps/api/src/database/migrations/sql
cp "/c/Users/Admin/Main/Desktop/HKI 2026-2027/KLTN/doc/diagram/postgresql-schema-v2.sql" \
   apps/api/src/database/migrations/sql/0001_initial_schema.sql
```

`apps/api/src/database/migrations/0001_initial_schema.ts`:
```ts
import { MigrationInterface, QueryRunner } from 'typeorm';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export class InitialSchema1755600000000 implements MigrationInterface {
  name = 'InitialSchema1755600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const sql = readFileSync(
      join(__dirname, 'sql', '0001_initial_schema.sql'),
      'utf8',
    );
    await queryRunner.query(sql);
  }

  public async down(): Promise<void> {
    throw new Error(
      'InitialSchema is not reversible — restore from a backup or drop the database instead.',
    );
  }
}
```

- [ ] **Step 6: Write the verification script (fails before the migration runs)**

`apps/api/src/database/verify-schema.ts`:
```ts
import 'dotenv/config';
import { Client } from 'pg';

const EXPECTED_TABLES = [
  'roles',
  'users',
  'user_roles',
  'students',
  'lecturers',
  'subjects',
  'academic_terms',
  'course_sections',
  'labs',
  'workstations',
  'lab_layouts',
  'lab_seats',
  'exam_events',
  'lab_sessions',
];

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const { rows } = await client.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'lab_management'`,
  );
  const found = new Set(rows.map((r) => r.table_name));
  const missing = EXPECTED_TABLES.filter((t) => !found.has(t));

  await client.end();

  if (missing.length > 0) {
    console.error('Missing tables in lab_management schema:', missing);
    process.exit(1);
  }

  console.log(`All ${EXPECTED_TABLES.length} expected tables are present.`);
  process.exit(0);
}

main();
```

- [ ] **Step 7: Run the verification script to confirm it fails**

Run: `pnpm --filter api exec ts-node -r dotenv/config src/database/verify-schema.ts`
Expected: FAIL — exits 1, lists all `EXPECTED_TABLES` as missing (schema doesn't exist yet).

- [ ] **Step 8: Run the migration**

Run: `pnpm --filter api migration:run`
Expected: TypeORM reports `InitialSchema1755600000000` as executed, no errors.

- [ ] **Step 9: Run the verification script again to confirm it passes**

Run: `pnpm --filter api exec ts-node -r dotenv/config src/database/verify-schema.ts`
Expected: PASS — prints `All 14 expected tables are present.`, exits 0.

- [ ] **Step 10: Commit**

```bash
git add docker-compose.yml apps/api/.env.example apps/api/package.json apps/api/src/database pnpm-lock.yaml
git commit -m "feat(api): add Docker infra and apply the v2 Postgres schema as the first migration"
```

---

### Task 3: Identity entities + AuthModule (register, login, logout)

**Note on scope:** refresh tokens are stateless JWTs for this plan — there is no server-side revocation list in the v2 schema, so "logout" clears the client's cookies rather than invalidating a token record. This is a deliberate simplification; revisit only if the thesis committee specifically requires forced remote logout.

**Files:**
- Create: `apps/api/src/identity/entities/role.entity.ts`
- Create: `apps/api/src/identity/entities/user.entity.ts`
- Create: `apps/api/src/identity/entities/user-role.entity.ts`
- Create: `apps/api/src/auth/auth.module.ts`
- Create: `apps/api/src/auth/auth.service.ts`
- Create: `apps/api/src/auth/auth.controller.ts`
- Create: `apps/api/src/auth/dto/register.dto.ts`
- Create: `apps/api/src/auth/dto/login.dto.ts`
- Create: `apps/api/src/auth/jwt.strategy.ts`
- Create: `apps/api/src/auth/jwt-auth.guard.ts`
- Create: `apps/api/src/auth/types.ts`
- Modify: `apps/api/src/database/data-source.ts` (register the three entities)
- Modify: `apps/api/src/app.module.ts` (import `TypeOrmModule.forRoot`, `AuthModule`)
- Modify: `apps/api/src/main.ts` (register `cookie-parser` middleware)
- Modify: `apps/api/package.json` (add auth-related dependencies)
- Test: `apps/api/test/auth.e2e-spec.ts`

**Interfaces:**
- Consumes: `dataSourceOptions` from Task 2 (extends it with entities).
- Produces: `AccessTokenPayload = { sub: string; username: string; roles: string[] }`; `AuthService.register(dto): Promise<{ id: string }>`; `AuthService.login(dto): Promise<{ accessToken: string; refreshToken: string; user: { id: string; username: string; displayName: string; roles: string[] } }>`; `JwtAuthGuard` (usable via `@UseGuards(JwtAuthGuard)`); request-scoped `req.user: AccessTokenPayload` once `JwtAuthGuard` passes.

- [ ] **Step 1: Add auth dependencies**

Modify `apps/api/package.json` — add to `dependencies`:
```json
"@nestjs/jwt": "^10.2.0",
"@nestjs/passport": "^10.0.3",
"passport": "^0.7.0",
"passport-jwt": "^4.0.1",
"argon2": "^0.41.1",
"class-validator": "^0.14.1",
"class-transformer": "^0.5.1",
"cookie-parser": "^1.4.7"
```
and to `devDependencies`: `"@types/passport-jwt": "^4.0.1"`, `"@types/cookie-parser": "^1.4.7"`.

`JwtStrategy` (Step 10, below) reads `req.cookies.access_token` — Express only populates `req.cookies` when `cookie-parser` middleware is registered. Without it, `req.cookies` is always `undefined` and that extractor silently falls through to the (unused, in the browser flow) Bearer-header path every time. Step 12 wires the middleware into `main.ts` before that gap can bite Task 6/7's browser-facing login flow.

Run: `pnpm --filter api install`

- [ ] **Step 2: Write the identity entities**

`apps/api/src/identity/entities/role.entity.ts`:
```ts
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'roles' })
export class RoleEntity {
  @PrimaryGeneratedColumn({ type: 'smallint' })
  id!: number;

  @Column({ type: 'varchar', length: 32 })
  code!: string;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ name: 'is_system', type: 'boolean', default: false })
  isSystem!: boolean;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
```

`apps/api/src/identity/entities/user.entity.ts`:
```ts
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type AccountStatus = 'pending' | 'active' | 'locked' | 'disabled';

@Entity({ name: 'users' })
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'citext' })
  username!: string;

  @Column({ type: 'citext', nullable: true })
  email!: string | null;

  @Column({ name: 'password_hash', type: 'text' })
  passwordHash!: string;

  @Column({ name: 'display_name', type: 'varchar', length: 150 })
  displayName!: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  phone!: string | null;

  @Column({
    type: 'enum',
    enum: ['pending', 'active', 'locked', 'disabled'],
    enumName: 'account_status',
    default: 'pending',
  })
  status!: AccountStatus;

  @Column({ name: 'last_login_at', type: 'timestamptz', nullable: true })
  lastLoginAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}
```

`apps/api/src/identity/entities/user-role.entity.ts`:
```ts
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'user_roles' })
export class UserRoleEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'role_id', type: 'smallint' })
  roleId!: number;

  @Column({ name: 'assigned_by', type: 'uuid', nullable: true })
  assignedBy!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}
```

Entities intentionally use plain columns, not `@ManyToOne` relations — the DB already enforces FKs with `ON DELETE RESTRICT`; queries that need joins use the repository's `QueryBuilder` explicitly rather than relying on TypeORM's relation/cascade machinery, to avoid it fighting with the DB-level guards defined in the DDL.

- [ ] **Step 3: Register the entities on the DataSource**

Modify `apps/api/src/database/data-source.ts`:
```ts
import { RoleEntity } from '../identity/entities/role.entity';
import { UserEntity } from '../identity/entities/user.entity';
import { UserRoleEntity } from '../identity/entities/user-role.entity';

// ...
  entities: [RoleEntity, UserEntity, UserRoleEntity],
// ...
```

- [ ] **Step 4: Wire TypeORM into the Nest app**

Modify `apps/api/src/app.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { dataSourceOptions } from './database/data-source';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot(dataSourceOptions),
    HealthModule,
    AuthModule,
  ],
})
export class AppModule {}
```

Also add `"@nestjs/typeorm": "^10.0.2"` to `apps/api/package.json` dependencies, then `pnpm --filter api install`.

- [ ] **Step 5: Write shared auth types**

`apps/api/src/auth/types.ts`:
```ts
export interface AccessTokenPayload {
  sub: string;
  username: string;
  roles: string[];
}

export interface PublicUser {
  id: string;
  username: string;
  displayName: string;
  roles: string[];
}
```

- [ ] **Step 6: Write the DTOs**

`apps/api/src/auth/dto/register.dto.ts`:
```ts
import { IsEmail, IsOptional, IsString, Length, Matches } from 'class-validator';

export class RegisterDto {
  @IsString()
  @Matches(/^[A-Za-z0-9._-]{3,64}$/)
  username!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsString()
  @Length(8, 128)
  password!: string;

  @IsString()
  @Length(1, 150)
  displayName!: string;
}
```

`apps/api/src/auth/dto/login.dto.ts`:
```ts
import { IsString } from 'class-validator';

export class LoginDto {
  @IsString()
  username!: string;

  @IsString()
  password!: string;
}
```

- [ ] **Step 7: Write the failing e2e test for register → login**

`apps/api/test/auth.e2e-spec.ts`:
```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Auth (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const username = `auth_test_${Date.now()}`;

  it('registers a new account', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        username,
        password: 'correct-horse-battery',
        displayName: 'Auth Test User',
      });

    expect(response.status).toBe(201);
    expect(response.body.id).toBeDefined();
  });

  it('rejects login with the wrong password', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username, password: 'wrong-password' });

    expect(response.status).toBe(401);
  });

  it('logs in with the correct password and returns tokens', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username, password: 'correct-horse-battery' });

    expect(response.status).toBe(200);
    expect(response.body.accessToken).toBeDefined();
    expect(response.body.refreshToken).toBeDefined();
    expect(response.body.user.username).toBe(username);
  });
});
```

- [ ] **Step 8: Run the tests to verify they fail**

Run: `pnpm --filter api test:e2e`
Expected: FAIL — `AuthModule`/`/auth/register` doesn't exist yet.

- [ ] **Step 9: Implement `AuthService`**

`apps/api/src/auth/auth.service.ts`:
```ts
import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { In, IsNull, Repository } from 'typeorm';
import * as argon2 from 'argon2';
import { UserEntity } from '../identity/entities/user.entity';
import { UserRoleEntity } from '../identity/entities/user-role.entity';
import { RoleEntity } from '../identity/entities/role.entity';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { AccessTokenPayload, PublicUser } from './types';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    @InjectRepository(UserRoleEntity)
    private readonly userRoles: Repository<UserRoleEntity>,
    @InjectRepository(RoleEntity)
    private readonly roles: Repository<RoleEntity>,
    private readonly jwt: JwtService,
  ) {}

  async register(dto: RegisterDto): Promise<{ id: string }> {
    const existing = await this.users.findOne({
      where: { username: dto.username, deletedAt: IsNull() },
    });
    if (existing) {
      throw new ConflictException('Username already in use');
    }

    const passwordHash = await argon2.hash(dto.password, {
      type: argon2.argon2id,
    });

    const user = this.users.create({
      username: dto.username,
      email: dto.email ?? null,
      passwordHash,
      displayName: dto.displayName,
      status: 'active',
    });
    const saved = await this.users.save(user);

    return { id: saved.id };
  }

  async login(dto: LoginDto): Promise<{
    accessToken: string;
    refreshToken: string;
    user: PublicUser;
  }> {
    const user = await this.users.findOne({
      where: { username: dto.username },
    });
    if (!user || user.deletedAt) {
      throw new UnauthorizedException('Invalid username or password');
    }

    const passwordMatches = await argon2.verify(
      user.passwordHash,
      dto.password,
    );
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid username or password');
    }

    const roleCodes = await this.getRoleCodes(user.id);

    await this.users.update(user.id, { lastLoginAt: new Date() });

    const payload: AccessTokenPayload = {
      sub: user.id,
      username: user.username,
      roles: roleCodes,
    };

    const accessToken = this.jwt.sign(payload, {
      secret: process.env.ACCESS_TOKEN_SECRET,
      expiresIn: process.env.ACCESS_TOKEN_TTL ?? '15m',
    });
    const refreshToken = this.jwt.sign(payload, {
      secret: process.env.REFRESH_TOKEN_SECRET,
      expiresIn: process.env.REFRESH_TOKEN_TTL ?? '7d',
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        roles: roleCodes,
      },
    };
  }

  private async getRoleCodes(userId: string): Promise<string[]> {
    const assignments = await this.userRoles.find({
      where: { userId, deletedAt: IsNull() },
    });
    if (assignments.length === 0) {
      return [];
    }
    const roleIds = assignments.map((a) => a.roleId);
    const roles = await this.roles.find({ where: { id: In(roleIds) } });
    return roles.map((r) => r.code);
  }
}
```

- [ ] **Step 10: Implement `JwtStrategy` and `JwtAuthGuard`**

`apps/api/src/auth/jwt.strategy.ts`:
```ts
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AccessTokenPayload } from './types';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req) => req?.cookies?.access_token ?? null,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: process.env.ACCESS_TOKEN_SECRET,
    });
  }

  async validate(payload: AccessTokenPayload): Promise<AccessTokenPayload> {
    return payload;
  }
}
```

`apps/api/src/auth/jwt-auth.guard.ts`:
```ts
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
```

- [ ] **Step 11: Implement `AuthController` and `AuthModule`**

`apps/api/src/auth/auth.controller.ts`:
```ts
import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Post('logout')
  @HttpCode(204)
  logout() {
    // Stateless JWTs: nothing to invalidate server-side. The Next.js
    // Route Handler that calls this endpoint is responsible for clearing
    // the httpOnly cookies on the browser.
    return;
  }
}
```

`apps/api/src/auth/auth.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from '../identity/entities/user.entity';
import { UserRoleEntity } from '../identity/entities/user-role.entity';
import { RoleEntity } from '../identity/entities/role.entity';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserEntity, UserRoleEntity, RoleEntity]),
    PassportModule,
    JwtModule.register({}),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
```

- [ ] **Step 12: Wire `cookie-parser` into `main.ts`**

Modify `apps/api/src/main.ts`:
```ts
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(cookieParser());
  const port = process.env.PORT ?? 4000;
  await app.listen(port);
}

bootstrap();
```

This is the only thing that makes `JwtStrategy`'s `req.cookies.access_token` extractor (Step 10) actually work — without it `req.cookies` is always `undefined` on Express. Task 4 will modify this same file again to add `ValidationPipe` and the Postgres exception filter; Task 5 adds Swagger; Task 7 adds CORS. Each of those steps shows the file's state after its own addition, always including this `cookieParser()` call.

- [ ] **Step 13: Run the tests to verify they pass**

Run: `pnpm --filter api test:e2e`
Expected: PASS — all three `Auth (e2e)` tests green.

- [ ] **Step 14: Commit**

```bash
git add apps/api/src/identity apps/api/src/auth apps/api/src/app.module.ts apps/api/src/database/data-source.ts apps/api/src/main.ts apps/api/package.json apps/api/test/auth.e2e-spec.ts pnpm-lock.yaml
git commit -m "feat(api): add identity entities and JWT-based AuthModule"
```

---

### Task 4: RolesGuard + AccountsModule (create, search, update, delete)

Maps to `WEB-ACC-01..04`. Seed roles already exist from the DDL's seed insert: `admin`, `operator`, `lecturer`, `student` (see `postgresql-schema-v2.sql`, end of file).

**Files:**
- Create: `apps/api/src/auth/roles.decorator.ts`
- Create: `apps/api/src/auth/roles.guard.ts`
- Create: `apps/api/src/common/postgres-exception.filter.ts`
- Create: `apps/api/src/accounts/accounts.module.ts`
- Create: `apps/api/src/accounts/accounts.service.ts`
- Create: `apps/api/src/accounts/accounts.controller.ts`
- Create: `apps/api/src/accounts/dto/create-account.dto.ts`
- Create: `apps/api/src/accounts/dto/update-account.dto.ts`
- Create: `apps/api/src/accounts/dto/search-accounts.dto.ts`
- Modify: `apps/api/src/main.ts` (register the global exception filter)
- Modify: `apps/api/src/app.module.ts` (import `AccountsModule`)
- Test: `apps/api/test/accounts.e2e-spec.ts`

**Interfaces:**
- Consumes: `AccessTokenPayload`, `JwtAuthGuard`, `UserEntity`/`UserRoleEntity`/`RoleEntity` from Task 3.
- Produces: `@Roles(...codes: string[])` decorator + `RolesGuard`; REST endpoints `POST /accounts`, `GET /accounts?search=&page=&pageSize=`, `PATCH /accounts/:id`, `DELETE /accounts/:id`, all requiring `admin` role.

- [ ] **Step 1: Implement `@Roles()` and `RolesGuard`**

`apps/api/src/auth/roles.decorator.ts`:
```ts
import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
```

`apps/api/src/auth/roles.guard.ts`:
```ts
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from './roles.decorator';
import { AccessTokenPayload } from './types';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as AccessTokenPayload | undefined;
    if (!user) {
      return false;
    }

    return requiredRoles.some((role) => user.roles.includes(role));
  }
}
```

`RolesGuard` must always run after `JwtAuthGuard` (it reads `request.user`) — apply both together as `@UseGuards(JwtAuthGuard, RolesGuard)`.

- [ ] **Step 2: Implement the Postgres exception filter**

`apps/api/src/common/postgres-exception.filter.ts`:
```ts
import {
  ArgumentsHost,
  Catch,
  ConflictException,
  ExceptionFilter,
  BadRequestException,
} from '@nestjs/common';
import { QueryFailedError } from 'typeorm';

// Postgres error codes: https://www.postgresql.org/docs/current/errcodes-appendix.html
const UNIQUE_VIOLATION = '23505';
const CHECK_VIOLATION = '23514';
const EXCLUSION_VIOLATION = '23P01';

@Catch(QueryFailedError)
export class PostgresExceptionFilter implements ExceptionFilter {
  catch(exception: QueryFailedError, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse();
    const code = (exception as any).code as string | undefined;

    if (code === UNIQUE_VIOLATION || code === EXCLUSION_VIOLATION) {
      const conflict = new ConflictException(
        'This request conflicts with an existing record.',
      );
      return response.status(conflict.getStatus()).json(conflict.getResponse());
    }
    if (code === CHECK_VIOLATION) {
      const badRequest = new BadRequestException(
        'This request violates a data rule.',
      );
      return response
        .status(badRequest.getStatus())
        .json(badRequest.getResponse());
    }
    throw exception;
  }
}
```

- [ ] **Step 3: Register the filter globally**

Modify `apps/api/src/main.ts`:
```ts
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { PostgresExceptionFilter } from './common/postgres-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new PostgresExceptionFilter());
  const port = process.env.PORT ?? 4000;
  await app.listen(port);
}

bootstrap();
```

- [ ] **Step 4: Write the DTOs**

`apps/api/src/accounts/dto/create-account.dto.ts`:
```ts
import {
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';

export class CreateAccountDto {
  @IsString()
  @Matches(/^[A-Za-z0-9._-]{3,64}$/)
  username!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsString()
  @Length(8, 128)
  password!: string;

  @IsString()
  @Length(1, 150)
  displayName!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  roleCodes!: string[];
}
```

`apps/api/src/accounts/dto/update-account.dto.ts`:
```ts
import { IsArray, IsEmail, IsIn, IsOptional, IsString, Length } from 'class-validator';

export class UpdateAccountDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @Length(1, 150)
  displayName?: string;

  @IsOptional()
  @IsIn(['pending', 'active', 'locked', 'disabled'])
  status?: 'pending' | 'active' | 'locked' | 'disabled';

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  roleCodes?: string[];
}
```

`apps/api/src/accounts/dto/search-accounts.dto.ts`:
```ts
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class SearchAccountsDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 20;
}
```

- [ ] **Step 5: Write the failing e2e test**

`apps/api/test/accounts.e2e-spec.ts`:
```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';

describe('Accounts (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    const dataSource = app.get(DataSource);
    const adminUsername = `accounts_admin_${Date.now()}`;

    await request(app.getHttpServer()).post('/auth/register').send({
      username: adminUsername,
      password: 'correct-horse-battery',
      displayName: 'Accounts Test Admin',
    });

    // Grant the admin role directly — there's no self-serve "become admin"
    // endpoint, and there shouldn't be.
    const [{ id: userId }] = await dataSource.query(
      `SELECT id FROM users WHERE username = $1`,
      [adminUsername],
    );
    const [{ id: roleId }] = await dataSource.query(
      `SELECT id FROM roles WHERE code = 'admin'`,
    );
    await dataSource.query(
      `INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)`,
      [userId, roleId],
    );

    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: adminUsername, password: 'correct-horse-battery' });
    adminToken = loginResponse.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  let createdAccountId: string;

  it('rejects account creation without a token', async () => {
    const response = await request(app.getHttpServer())
      .post('/accounts')
      .send({
        username: 'nobody',
        password: 'irrelevant-password',
        displayName: 'Nobody',
        roleCodes: ['student'],
      });

    expect(response.status).toBe(401);
  });

  it('creates an account as admin', async () => {
    const response = await request(app.getHttpServer())
      .post('/accounts')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        username: `managed_${Date.now()}`,
        password: 'correct-horse-battery',
        displayName: 'Managed User',
        roleCodes: ['lecturer'],
      });

    expect(response.status).toBe(201);
    expect(response.body.id).toBeDefined();
    createdAccountId = response.body.id;
  });

  it('searches accounts', async () => {
    const response = await request(app.getHttpServer())
      .get('/accounts?search=Managed&page=1&pageSize=20')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.total).toBeGreaterThanOrEqual(1);
    expect(
      response.body.items.some((item: any) => item.id === createdAccountId),
    ).toBe(true);
  });

  it('updates an account', async () => {
    const response = await request(app.getHttpServer())
      .patch(`/accounts/${createdAccountId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ displayName: 'Managed User (Updated)' });

    expect(response.status).toBe(200);
    expect(response.body.displayName).toBe('Managed User (Updated)');
  });

  it('deletes an account with no active role assignments left standing', async () => {
    const response = await request(app.getHttpServer())
      .delete(`/accounts/${createdAccountId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(204);
  });
});
```

- [ ] **Step 6: Run the tests to verify they fail**

Run: `pnpm --filter api test:e2e`
Expected: FAIL — `/accounts` routes don't exist yet.

- [ ] **Step 7: Implement `AccountsService`**

`apps/api/src/accounts/accounts.service.ts`:
```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import * as argon2 from 'argon2';
import { UserEntity } from '../identity/entities/user.entity';
import { UserRoleEntity } from '../identity/entities/user-role.entity';
import { RoleEntity } from '../identity/entities/role.entity';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import { SearchAccountsDto } from './dto/search-accounts.dto';

export interface AccountView {
  id: string;
  username: string;
  email: string | null;
  displayName: string;
  status: string;
  roles: string[];
}

@Injectable()
export class AccountsService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    @InjectRepository(UserRoleEntity)
    private readonly userRoles: Repository<UserRoleEntity>,
    @InjectRepository(RoleEntity)
    private readonly roles: Repository<RoleEntity>,
  ) {}

  async create(dto: CreateAccountDto): Promise<{ id: string }> {
    const passwordHash = await argon2.hash(dto.password, {
      type: argon2.argon2id,
    });
    const user = await this.users.save(
      this.users.create({
        username: dto.username,
        email: dto.email ?? null,
        passwordHash,
        displayName: dto.displayName,
        status: 'active',
      }),
    );

    const roles = await this.roles.find({ where: { code: In(dto.roleCodes) } });
    await this.userRoles.save(
      roles.map((role) =>
        this.userRoles.create({ userId: user.id, roleId: role.id }),
      ),
    );

    return { id: user.id };
  }

  async search(
    query: SearchAccountsDto,
  ): Promise<{ items: AccountView[]; total: number }> {
    const qb = this.users
      .createQueryBuilder('u')
      .where('u.deleted_at IS NULL');

    if (query.search) {
      qb.andWhere(
        '(u.username ILIKE :term OR u.display_name ILIKE :term OR u.email ILIKE :term)',
        { term: `%${query.search}%` },
      );
    }

    qb.orderBy('u.created_at', 'DESC')
      .skip((query.page - 1) * query.pageSize)
      .take(query.pageSize);

    const [users, total] = await qb.getManyAndCount();
    const items = await Promise.all(users.map((u) => this.toView(u)));

    return { items, total };
  }

  async update(id: string, dto: UpdateAccountDto): Promise<AccountView> {
    const user = await this.findActiveOrThrow(id);

    await this.users.update(id, {
      email: dto.email ?? user.email,
      displayName: dto.displayName ?? user.displayName,
      status: dto.status ?? user.status,
    });

    if (dto.roleCodes) {
      await this.userRoles.softDelete({ userId: id });
      const roles = await this.roles.find({ where: { code: In(dto.roleCodes) } });
      await this.userRoles.save(
        roles.map((role) =>
          this.userRoles.create({ userId: id, roleId: role.id }),
        ),
      );
    }

    const updated = await this.findActiveOrThrow(id);
    return this.toView(updated);
  }

  async remove(id: string): Promise<void> {
    await this.findActiveOrThrow(id);
    await this.userRoles.softDelete({ userId: id });
    await this.users.softDelete(id);
  }

  private async findActiveOrThrow(id: string): Promise<UserEntity> {
    const user = await this.users.findOne({ where: { id } });
    if (!user || user.deletedAt) {
      throw new NotFoundException('Account not found');
    }
    return user;
  }

  private async toView(user: UserEntity): Promise<AccountView> {
    const assignments = await this.userRoles.find({
      where: { userId: user.id, deletedAt: IsNull() },
    });
    const roleIds = assignments.map((a) => a.roleId);
    const roles =
      roleIds.length > 0
        ? await this.roles.find({ where: { id: In(roleIds) } })
        : [];

    return {
      id: user.id,
      username: user.username,
      email: user.email,
      displayName: user.displayName,
      status: user.status,
      roles: roles.map((r) => r.code),
    };
  }
}
```

`softDelete` on `userRoles`/`users` sets `deleted_at`, which is exactly the column the DDL's `guard_master_soft_delete` trigger watches — for `users` it raises if any active `user_roles`/`students`/`lecturers` row still references it, so role assignments must be cleared first (as `remove()` does above). This surfaces as a `23514`/raised-exception style Postgres error if a future caller ever deletes out of order — caught by `PostgresExceptionFilter` either way.

- [ ] **Step 8: Implement `AccountsController` and `AccountsModule`**

`apps/api/src/accounts/accounts.controller.ts`:
```ts
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { AccountsService } from './accounts.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import { SearchAccountsDto } from './dto/search-accounts.dto';

@Controller('accounts')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @Post()
  create(@Body() dto: CreateAccountDto) {
    return this.accounts.create(dto);
  }

  @Get()
  search(@Query() query: SearchAccountsDto) {
    return this.accounts.search(query);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateAccountDto) {
    return this.accounts.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string) {
    await this.accounts.remove(id);
  }
}
```

`apps/api/src/accounts/accounts.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from '../identity/entities/user.entity';
import { UserRoleEntity } from '../identity/entities/user-role.entity';
import { RoleEntity } from '../identity/entities/role.entity';
import { AccountsService } from './accounts.service';
import { AccountsController } from './accounts.controller';

@Module({
  imports: [TypeOrmModule.forFeature([UserEntity, UserRoleEntity, RoleEntity])],
  controllers: [AccountsController],
  providers: [AccountsService],
})
export class AccountsModule {}
```

Modify `apps/api/src/app.module.ts` to import `AccountsModule` alongside `AuthModule`.

- [ ] **Step 9: Run the tests to verify they pass**

Run: `pnpm --filter api test:e2e`
Expected: PASS — all `Accounts (e2e)` tests green, plus the earlier `Health` and `Auth` suites still green.

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/auth/roles.decorator.ts apps/api/src/auth/roles.guard.ts apps/api/src/common apps/api/src/accounts apps/api/src/main.ts apps/api/src/app.module.ts apps/api/test/accounts.e2e-spec.ts
git commit -m "feat(api): add RolesGuard and AccountsModule CRUD"
```

---

### Task 5: Swagger/OpenAPI + generated TypeScript client in `packages/shared`

**Files:**
- Modify: `apps/api/src/main.ts` (mount Swagger)
- Modify: `apps/api/package.json` (add `@nestjs/swagger`, `swagger-ui-express`)
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/scripts/generate-api-client.mjs`
- Create: `packages/shared/src/index.ts`

**Interfaces:**
- Consumes: the running Nest app's `/api-docs-json` OpenAPI document.
- Produces: `packages/shared` exporting generated types (`packages/shared/src/api/schema.d.ts`, generated — not hand-written) and a thin fetch wrapper `apiClient(path, init)` from `packages/shared/src/index.ts`.

- [ ] **Step 1: Add Swagger dependencies**

Modify `apps/api/package.json` — add to `dependencies`: `"@nestjs/swagger": "^7.4.2"`, `"swagger-ui-express": "^5.0.1"`.
Run: `pnpm --filter api install`

- [ ] **Step 2: Mount Swagger in `main.ts`**

Modify `apps/api/src/main.ts`:
```ts
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { PostgresExceptionFilter } from './common/postgres-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new PostgresExceptionFilter());

  const config = new DocumentBuilder()
    .setTitle('Web Management Portal API')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api-docs', app, document);

  const port = process.env.PORT ?? 4000;
  await app.listen(port);
}

bootstrap();
```

Run: `pnpm --filter api dev`, then open `http://localhost:4000/api-docs` and `http://localhost:4000/api-docs-json`.
Expected: Swagger UI loads; the JSON document lists `/health`, `/auth/*`, `/accounts/*`.

- [ ] **Step 3: Scaffold `packages/shared`**

`packages/shared/package.json`:
```json
{
  "name": "@cine/shared",
  "version": "0.1.0",
  "private": true,
  "main": "src/index.ts",
  "scripts": {
    "generate:api-client": "node scripts/generate-api-client.mjs"
  },
  "dependencies": {
    "openapi-fetch": "^0.13.0"
  },
  "devDependencies": {
    "openapi-typescript": "^7.4.1",
    "typescript": "^5.6.3"
  }
}
```

`packages/shared/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "./dist", "declaration": true }
}
```

`packages/shared/scripts/generate-api-client.mjs`:
```js
import { writeFile } from 'node:fs/promises';
import openapiTS, { astToString } from 'openapi-typescript';

const API_URL = process.env.API_URL ?? 'http://localhost:4000/api-docs-json';

const ast = await openapiTS(new URL(API_URL));
const contents = astToString(ast);

await writeFile(
  new URL('../src/api/schema.d.ts', import.meta.url),
  contents,
);

console.log('Wrote packages/shared/src/api/schema.d.ts');
```

`packages/shared/src/index.ts`:
```ts
import createClient from 'openapi-fetch';
import type { paths } from './api/schema';

export const createApiClient = (baseUrl: string, accessToken?: string) =>
  createClient<paths>({
    baseUrl,
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
  });
```

- [ ] **Step 4: Generate the client and verify it type-checks**

Run (with the Nest dev server from Step 2 still running):
```bash
mkdir -p packages/shared/src/api
pnpm --filter @cine/shared install
API_URL=http://localhost:4000/api-docs-json pnpm --filter @cine/shared generate:api-client
```
Expected: `packages/shared/src/api/schema.d.ts` is created and contains a `paths` type with `"/health"`, `"/auth/register"`, `"/auth/login"`, `"/accounts"` keys.

Run: `pnpm --filter @cine/shared exec tsc --noEmit`
Expected: PASS — no type errors in `src/index.ts` against the generated schema.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/main.ts apps/api/package.json packages/shared pnpm-lock.yaml
git commit -m "feat(shared): add Swagger docs and generated OpenAPI client package"
```

Note: `packages/shared/src/api/schema.d.ts` is generated output. Commit it anyway (so `apps/web` can type-check without running the API first) and regenerate it whenever the API's routes change — add a reminder comment at the top of the generated file's containing folder via a `packages/shared/src/api/README.md`:
```markdown
`schema.d.ts` is generated. Regenerate with:
`API_URL=http://localhost:4000/api-docs-json pnpm --filter @cine/shared generate:api-client`
```

---

### Task 6: Next.js scaffold + Tailwind/shadcn UI kit + login flow

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/next.config.ts`
- Create: `apps/web/postcss.config.js`
- Create: `apps/web/tailwind.config.ts`
- Create: `apps/web/components.json`
- Create: `apps/web/src/lib/utils.ts`
- Create: `apps/web/src/components/ui/button.tsx`
- Create: `apps/web/src/components/ui/input.tsx`
- Create: `apps/web/src/components/ui/label.tsx`
- Create: `apps/web/src/components/ui/card.tsx`
- Create: `apps/web/src/components/ui/table.tsx`
- Create: `apps/web/src/app/layout.tsx`
- Create: `apps/web/src/app/globals.css`
- Create: `apps/web/src/app/(auth)/login/page.tsx`
- Create: `apps/web/src/app/api/auth/login/route.ts`
- Create: `apps/web/src/app/api/auth/logout/route.ts`
- Create: `apps/web/src/middleware.ts`
- Test: `apps/web/src/middleware.test.ts`

**Interfaces:**
- Consumes: Nest's `POST /auth/login`, `POST /auth/logout` (called server-side from the Route Handlers, plain `fetch`, not the generated client — Route Handlers run on the server and don't need the browser-facing client).
- Produces: cookies `access_token` / `refresh_token` (httpOnly, `SameSite=Lax`) set by `/api/auth/login`; `middleware.ts` exporting a `config.matcher` guarding every route under `(dashboard)`; a `cn()` helper and five shadcn/ui primitives (`Button`, `Input`, `Label`, `Card`/`CardHeader`/`CardTitle`/`CardContent`, `Table`/`TableHeader`/`TableBody`/`TableRow`/`TableHead`/`TableCell`) importable from `@/components/ui/*` and `@/lib/utils`, for Task 7 to reuse.

- [ ] **Step 1: Scaffold `apps/web` with Tailwind CSS**

`apps/web/package.json`:
```json
{
  "name": "web",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "test": "vitest run"
  },
  "dependencies": {
    "@cine/shared": "workspace:*",
    "next": "^15.0.2",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.1.1",
    "tailwind-merge": "^2.5.3",
    "@radix-ui/react-slot": "^1.1.0",
    "@radix-ui/react-label": "^2.1.0"
  },
  "devDependencies": {
    "@types/node": "^20.16.10",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "typescript": "^5.6.3",
    "vitest": "^2.1.2",
    "tailwindcss": "^3.4.13",
    "postcss": "^8.4.47",
    "autoprefixer": "^10.4.20"
  }
}
```

`apps/web/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "esnext",
    "moduleResolution": "bundler",
    "jsx": "preserve",
    "lib": ["dom", "dom.iterable", "esnext"],
    "plugins": [{ "name": "next" }],
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["src", "next-env.d.ts"]
}
```

`apps/web/next.config.ts`:
```ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
};

export default nextConfig;
```

`apps/web/postcss.config.js`:
```js
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

`apps/web/tailwind.config.ts`:
```ts
import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
    },
  },
  plugins: [],
};

export default config;
```

`apps/web/components.json` (lets the `shadcn` CLI add more components later, aligned with what we hand-wrote below):
```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "default",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.ts",
    "css": "src/app/globals.css",
    "baseColor": "slate",
    "cssVariables": true
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils"
  }
}
```

`apps/web/src/lib/utils.ts`:
```ts
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

`apps/web/src/app/globals.css` (Tailwind directives + the shadcn "slate" theme's CSS variables):
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --primary: 222.2 47.4% 11.2%;
    --primary-foreground: 210 40% 98%;
    --secondary: 210 40% 96.1%;
    --secondary-foreground: 222.2 47.4% 11.2%;
    --muted: 210 40% 96.1%;
    --muted-foreground: 215.4 16.3% 46.9%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 210 40% 98%;
    --border: 214.3 31.8% 91.4%;
    --input: 214.3 31.8% 91.4%;
    --ring: 222.2 84% 4.9%;
    --radius: 0.5rem;
  }
}

body {
  @apply bg-background text-foreground;
}
```

`apps/web/src/app/layout.tsx`:
```tsx
import './globals.css';
import type { ReactNode } from 'react';

export const metadata = {
  title: 'Lab Management — Web Portal',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 2: Hand-write the shadcn/ui primitives this plan needs**

These are the standard `shadcn` CLI output for each component (hand-written here so the plan doesn't depend on a network call to a component registry succeeding mid-build). Later work can still run `pnpm dlx shadcn@latest add <component>` for anything new — `components.json` above is what makes that work.

`apps/web/src/components/ui/button.tsx`:
```tsx
import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        outline: 'border border-input bg-background hover:bg-secondary',
        destructive:
          'bg-destructive text-destructive-foreground hover:bg-destructive/90',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 px-3 text-xs',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
```

`apps/web/src/components/ui/input.tsx`:
```tsx
import * as React from 'react';
import { cn } from '@/lib/utils';

const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, type, ...props }, ref) => (
  <input
    type={type}
    className={cn(
      'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
      className,
    )}
    ref={ref}
    {...props}
  />
));
Input.displayName = 'Input';

export { Input };
```

`apps/web/src/components/ui/label.tsx`:
```tsx
import * as React from 'react';
import * as LabelPrimitive from '@radix-ui/react-label';
import { cn } from '@/lib/utils';

const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn('text-sm font-medium leading-none', className)}
    {...props}
  />
));
Label.displayName = LabelPrimitive.Root.displayName;

export { Label };
```

`apps/web/src/components/ui/card.tsx`:
```tsx
import * as React from 'react';
import { cn } from '@/lib/utils';

const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('rounded-lg border bg-background shadow-sm', className)}
      {...props}
    />
  ),
);
Card.displayName = 'Card';

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('flex flex-col gap-1.5 p-6', className)} {...props} />
));
CardHeader.displayName = 'CardHeader';

const CardTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3 ref={ref} className={cn('text-lg font-semibold leading-none', className)} {...props} />
));
CardTitle.displayName = 'CardTitle';

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('p-6 pt-0', className)} {...props} />
));
CardContent.displayName = 'CardContent';

export { Card, CardHeader, CardTitle, CardContent };
```

`apps/web/src/components/ui/table.tsx`:
```tsx
import * as React from 'react';
import { cn } from '@/lib/utils';

const Table = React.forwardRef<HTMLTableElement, React.HTMLAttributes<HTMLTableElement>>(
  ({ className, ...props }, ref) => (
    <div className="w-full overflow-auto">
      <table ref={ref} className={cn('w-full caption-bottom text-sm', className)} {...props} />
    </div>
  ),
);
Table.displayName = 'Table';

const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead ref={ref} className={cn('[&_tr]:border-b', className)} {...props} />
));
TableHeader.displayName = 'TableHeader';

const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody ref={ref} className={cn('[&_tr:last-child]:border-0', className)} {...props} />
));
TableBody.displayName = 'TableBody';

const TableRow = React.forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement>
>(({ className, ...props }, ref) => (
  <tr
    ref={ref}
    className={cn('border-b transition-colors hover:bg-muted/50', className)}
    {...props}
  />
));
TableRow.displayName = 'TableRow';

const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <th
    ref={ref}
    className={cn(
      'h-10 px-2 text-left align-middle font-medium text-muted-foreground',
      className,
    )}
    {...props}
  />
));
TableHead.displayName = 'TableHead';

const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <td ref={ref} className={cn('p-2 align-middle', className)} {...props} />
));
TableCell.displayName = 'TableCell';

export { Table, TableHeader, TableBody, TableRow, TableHead, TableCell };
```

- [ ] **Step 3: Write the login Route Handlers**

`apps/web/src/app/api/auth/login/route.ts`:
```ts
import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

export async function POST(request: NextRequest) {
  const body = await request.json();

  const apiResponse = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!apiResponse.ok) {
    const error = await apiResponse.json().catch(() => ({}));
    return NextResponse.json(error, { status: apiResponse.status });
  }

  const { accessToken, refreshToken, user } = await apiResponse.json();

  const response = NextResponse.json({ user });
  response.cookies.set('access_token', accessToken, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 15,
  });
  response.cookies.set('refresh_token', refreshToken, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });

  return response;
}
```

`apps/web/src/app/api/auth/logout/route.ts`:
```ts
import { NextResponse } from 'next/server';

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete('access_token');
  response.cookies.delete('refresh_token');
  return response;
}
```

- [ ] **Step 4: Write the login page, styled with the shadcn/ui primitives from Step 2**

`apps/web/src/app/(auth)/login/page.tsx`:
```tsx
'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const form = new FormData(event.currentTarget);
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: form.get('username'),
        password: form.get('password'),
      }),
    });

    if (!response.ok) {
      setError('Sai tên đăng nhập hoặc mật khẩu.');
      return;
    }

    router.push('/accounts');
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Đăng nhập</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="username">Tên đăng nhập</Label>
              <Input id="username" name="username" required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Mật khẩu</Label>
              <Input id="password" name="password" type="password" required />
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button type="submit" className="w-full">
              Đăng nhập
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
```

- [ ] **Step 5: Write the failing test for the middleware's route-matching logic**

`apps/web/src/middleware.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { isProtectedPath } from './middleware';

describe('isProtectedPath', () => {
  it('protects dashboard routes', () => {
    expect(isProtectedPath('/accounts')).toBe(true);
    expect(isProtectedPath('/accounts/123')).toBe(true);
  });

  it('does not protect the login route', () => {
    expect(isProtectedPath('/login')).toBe(false);
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `pnpm --filter web test`
Expected: FAIL — `apps/web/src/middleware.ts` (and `isProtectedPath`) don't exist yet.

- [ ] **Step 7: Implement `middleware.ts`**

`apps/web/src/middleware.ts`:
```ts
import { NextRequest, NextResponse } from 'next/server';

const PUBLIC_PATHS = ['/login'];

export function isProtectedPath(pathname: string): boolean {
  return !PUBLIC_PATHS.some(
    (publicPath) => pathname === publicPath || pathname.startsWith(`${publicPath}/`),
  );
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!isProtectedPath(pathname)) {
    return NextResponse.next();
  }

  const accessToken = request.cookies.get('access_token');
  if (!accessToken) {
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next|api|favicon.ico).*)'],
};
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `pnpm --filter web test`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add apps/web pnpm-lock.yaml
git commit -m "feat(web): scaffold Next.js app with Tailwind/shadcn UI kit, login flow, and route protection"
```

---

### Task 7: Accounts admin page (list + create + edit)

**Files:**
- Create: `apps/web/src/lib/api-client.ts`
- Create: `apps/web/vitest.config.ts`
- Create: `apps/web/src/app/(dashboard)/accounts/page.tsx`
- Create: `apps/web/src/components/accounts/account-form.tsx`
- Create: `apps/web/src/components/accounts/account-form.test.tsx`
- Modify: `apps/web/package.json` (add `@tanstack/react-query`, `@tanstack/react-table`, `react-hook-form`, `zod`, `@hookform/resolvers`, testing libs)

**Interfaces:**
- Consumes: `createApiClient` from `@cine/shared`; the `access_token` cookie set by Task 6; the `Button`/`Input`/`Label`/`Table`-family components from `@/components/ui/*` (Task 6, Step 2).
- Produces: `/accounts` page rendering a searchable, paginated table with create/edit forms wired to the real API.

- [ ] **Step 1: Add frontend data/UI dependencies**

Modify `apps/web/package.json` — add to `dependencies`:
```json
"@tanstack/react-query": "^5.59.0",
"@tanstack/react-table": "^8.20.5",
"react-hook-form": "^7.53.0",
"zod": "^3.23.8",
"@hookform/resolvers": "^3.9.0"
```
and to `devDependencies`:
```json
"@testing-library/react": "^16.0.1",
"@testing-library/jest-dom": "^6.5.0",
"jsdom": "^25.0.1"
```

Run: `pnpm --filter web install`

Task 6's `test` script (`vitest run`) has run with Vitest's default `node` environment so far — fine for `middleware.test.ts`, which only calls a plain function. This task's `account-form.test.tsx` renders into a DOM via Testing Library, so it needs `jsdom`. Add a project-wide Vitest config now rather than annotating every future component test file individually:

`apps/web/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
  },
});
```

- [ ] **Step 2: Write the browser-side API client helper**

`apps/web/src/lib/api-client.ts`:
```ts
'use client';

import { createApiClient } from '@cine/shared';

// The browser calls the Nest API directly for data (not through a Next
// Route Handler) — the access_token cookie is httpOnly, so it can't be
// read here; requests rely on the cookie being sent automatically because
// both apps share the same top-level domain in production, and in local
// dev the Nest API's CORS config allows credentials from localhost:3000.
export const apiClient = createApiClient(
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000',
);
```

This requires the Nest API to accept credentialed cross-origin requests from the web app's dev origin — note this as a dependency for whoever wires CORS (add `app.enableCors({ origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000', credentials: true })` to `apps/api/src/main.ts` as part of this task):

Modify `apps/api/src/main.ts` — add before `await app.listen(port)`:
```ts
  app.enableCors({
    origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000',
    credentials: true,
  });
```

- [ ] **Step 3: Write the failing test for the account form's validation**

`apps/web/src/components/accounts/account-form.test.tsx`:
```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { AccountForm } from './account-form';

describe('AccountForm', () => {
  it('rejects submission when no role is selected', async () => {
    const onSubmit = vi.fn();
    render(<AccountForm onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText(/tên đăng nhập/i), {
      target: { value: 'new_user' },
    });
    fireEvent.change(screen.getByLabelText(/họ tên/i), {
      target: { value: 'New User' },
    });
    fireEvent.change(screen.getByLabelText(/mật khẩu/i), {
      target: { value: 'correct-horse-battery' },
    });
    fireEvent.click(screen.getByRole('button', { name: /lưu/i }));

    await waitFor(() => {
      expect(screen.getByText(/chọn ít nhất một vai trò/i)).toBeInTheDocument();
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits with valid data', async () => {
    const onSubmit = vi.fn();
    render(<AccountForm onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText(/tên đăng nhập/i), {
      target: { value: 'new_user' },
    });
    fireEvent.change(screen.getByLabelText(/họ tên/i), {
      target: { value: 'New User' },
    });
    fireEvent.change(screen.getByLabelText(/mật khẩu/i), {
      target: { value: 'correct-horse-battery' },
    });
    fireEvent.click(screen.getByLabelText(/giảng viên/i));
    fireEvent.click(screen.getByRole('button', { name: /lưu/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      username: 'new_user',
      displayName: 'New User',
      password: 'correct-horse-battery',
      roleCodes: ['lecturer'],
    });
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `pnpm --filter web test`
Expected: FAIL — `./account-form` doesn't exist yet.

- [ ] **Step 5: Implement `AccountForm`**

`apps/web/src/components/accounts/account-form.tsx`:
```tsx
'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const ROLE_OPTIONS = ['admin', 'operator', 'lecturer', 'student'] as const;
const ROLE_LABELS: Record<(typeof ROLE_OPTIONS)[number], string> = {
  admin: 'Quản trị',
  operator: 'Vận hành phòng máy',
  lecturer: 'Giảng viên',
  student: 'Sinh viên',
};

const accountFormSchema = z.object({
  username: z.string().min(3).max(64),
  displayName: z.string().min(1).max(150),
  password: z.string().min(8).max(128),
  roleCodes: z.array(z.enum(ROLE_OPTIONS)).min(1, 'Chọn ít nhất một vai trò'),
});

export type AccountFormValues = z.infer<typeof accountFormSchema>;

export function AccountForm({
  onSubmit,
}: {
  onSubmit: (values: AccountFormValues) => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AccountFormValues>({
    resolver: zodResolver(accountFormSchema),
    defaultValues: { roleCodes: [] },
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="account-username">Tên đăng nhập</Label>
        <Input id="account-username" {...register('username')} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="account-display-name">Họ tên</Label>
        <Input id="account-display-name" {...register('displayName')} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="account-password">Mật khẩu</Label>
        <Input id="account-password" type="password" {...register('password')} />
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Vai trò</legend>
        {ROLE_OPTIONS.map((role) => (
          <div key={role} className="flex items-center gap-2">
            <input
              id={`account-role-${role}`}
              type="checkbox"
              value={role}
              className="h-4 w-4 rounded border-input"
              {...register('roleCodes')}
            />
            <Label htmlFor={`account-role-${role}`} className="font-normal">
              {ROLE_LABELS[role]}
            </Label>
          </div>
        ))}
      </fieldset>
      {errors.roleCodes && (
        <p role="alert" className="text-sm text-destructive">
          {errors.roleCodes.message}
        </p>
      )}
      <Button type="submit">Lưu</Button>
    </form>
  );
}
```

Native `<input type="checkbox">` elements are kept for role selection (rather than a Radix `Checkbox` primitive) — they work directly with React Hook Form's `register()` via ref, and Radix's button-based checkbox would need a `Controller` wrapper for no real visual gain at this scale.

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm --filter web test`
Expected: PASS

- [ ] **Step 7: Wire the accounts page (list + create) with TanStack Query/Table**

`apps/web/src/app/(dashboard)/accounts/page.tsx`:
```tsx
'use client';

import { useState } from 'react';
import {
  useQuery,
  useMutation,
  useQueryClient,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import {
  useReactTable,
  getCoreRowModel,
  createColumnHelper,
  flexRender,
} from '@tanstack/react-table';
import { apiClient } from '../../../lib/api-client';
import { AccountForm, AccountFormValues } from '../../../components/accounts/account-form';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface AccountRow {
  id: string;
  username: string;
  displayName: string;
  status: string;
  roles: string[];
}

const columnHelper = createColumnHelper<AccountRow>();
const columns = [
  columnHelper.accessor('username', { header: 'Tên đăng nhập' }),
  columnHelper.accessor('displayName', { header: 'Họ tên' }),
  columnHelper.accessor('status', { header: 'Trạng thái' }),
  columnHelper.accessor((row) => row.roles.join(', '), { header: 'Vai trò' }),
];

const queryClient = new QueryClient();

function AccountsTable() {
  const [search, setSearch] = useState('');

  const { data } = useQuery({
    queryKey: ['accounts', search],
    queryFn: async () => {
      const { data, error } = await apiClient.GET('/accounts', {
        params: { query: { search, page: 1, pageSize: 20 } },
      });
      if (error) throw error;
      return data as { items: AccountRow[]; total: number };
    },
  });

  const queryClientInstance = useQueryClient();
  const createAccount = useMutation({
    mutationFn: async (values: AccountFormValues) => {
      const { error } = await apiClient.POST('/accounts', { body: values });
      if (error) throw error;
    },
    onSuccess: () => queryClientInstance.invalidateQueries({ queryKey: ['accounts'] }),
  });

  const table = useReactTable({
    data: data?.items ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 p-8">
      <h1 className="text-2xl font-semibold">Quản lý tài khoản</h1>

      <Input
        placeholder="Tìm kiếm..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-xs"
      />

      <Card>
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tạo tài khoản mới</CardTitle>
        </CardHeader>
        <CardContent>
          <AccountForm onSubmit={(values) => createAccount.mutate(values)} />
        </CardContent>
      </Card>
    </main>
  );
}

export default function AccountsPage() {
  return (
    <QueryClientProvider client={queryClient}>
      <AccountsTable />
    </QueryClientProvider>
  );
}
```

- [ ] **Step 8: Manual verification (full stack)**

Run: `docker compose up -d postgres mongo redis minio`, `pnpm --filter api migration:run` (skip if already applied), `pnpm --filter api dev`, `pnpm --filter web dev`.
Then open `http://localhost:3000/login`, log in with an account created via `POST /accounts` (or `/auth/register` + manual role grant, same as the e2e test's setup), and confirm the accounts table loads, search filters it, and the create form adds a new row.

- [ ] **Step 9: Commit**

```bash
git add apps/web apps/api/src/main.ts pnpm-lock.yaml
git commit -m "feat(web): add accounts admin page with list, search, and create"
```

---

### Task 8: Full Docker Compose wiring for api + web + smoke test

**Files:**
- Create: `apps/api/Dockerfile`
- Create: `apps/web/Dockerfile`
- Modify: `docker-compose.yml` (add `api` and `web` services)
- Create: `scripts/smoke-test.sh`

**Interfaces:**
- Consumes: everything from Tasks 1–7.
- Produces: `docker compose up` brings up the entire portal (4 datastores + api + web); `scripts/smoke-test.sh` exits 0 only if every service responds.

- [ ] **Step 1: Write `apps/api/Dockerfile`**

```dockerfile
FROM node:20-alpine AS base
WORKDIR /app
RUN corepack enable

FROM base AS build
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/api ./apps/api
COPY packages/shared ./packages/shared
RUN pnpm install --frozen-lockfile
RUN pnpm --filter api build

FROM base AS runtime
ENV NODE_ENV=production
# pnpm workspaces hoist dependencies into a content-addressed store under
# the root node_modules/.pnpm, with apps/api/node_modules holding symlinks
# into it — copying apps/api/node_modules alone would ship dangling
# symlinks. Copy the whole /app tree from the build stage instead so the
# symlink structure stays intact.
COPY --from=build /app /app
EXPOSE 4000
CMD ["node", "apps/api/dist/main.js"]
```

- [ ] **Step 2: Write `apps/web/Dockerfile`**

```dockerfile
FROM node:20-alpine AS base
WORKDIR /app
RUN corepack enable

FROM base AS build
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/web ./apps/web
COPY packages/shared ./packages/shared
RUN pnpm install --frozen-lockfile
RUN pnpm --filter web build

FROM base AS runtime
ENV NODE_ENV=production
# next.config.ts's `output: 'standalone'` already traces and copies only
# the production dependencies each page needs into .next/standalone, so
# (unlike the API image) there's no pnpm-symlink concern here.
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
```

- [ ] **Step 3: Add `api` and `web` services to `docker-compose.yml`**

Modify `docker-compose.yml` — add under `services:`:
```yaml
  api:
    build:
      context: .
      dockerfile: apps/api/Dockerfile
    environment:
      PORT: 4000
      DATABASE_URL: postgresql://lab_admin:lab_admin_password@postgres:5432/lab_management
      DATABASE_SCHEMA: lab_management
      ACCESS_TOKEN_SECRET: dev-access-secret-change-me
      REFRESH_TOKEN_SECRET: dev-refresh-secret-change-me
      WEB_ORIGIN: http://localhost:3000
    ports:
      - "4000:4000"
    depends_on:
      postgres:
        condition: service_healthy

  web:
    build:
      context: .
      dockerfile: apps/web/Dockerfile
    environment:
      API_URL: http://api:4000
      NEXT_PUBLIC_API_URL: http://localhost:4000
    ports:
      - "3000:3000"
    depends_on:
      - api
```

- [ ] **Step 4: Write the smoke test script**

`scripts/smoke-test.sh`:
```bash
#!/usr/bin/env bash
set -euo pipefail

echo "Checking API health..."
curl --fail --silent http://localhost:4000/health | grep -q '"status":"ok"'

echo "Checking Swagger docs..."
curl --fail --silent http://localhost:4000/api-docs-json > /dev/null

echo "Checking web app responds..."
curl --fail --silent http://localhost:3000/login > /dev/null

echo "All smoke checks passed."
```

Run: `chmod +x scripts/smoke-test.sh`

- [ ] **Step 5: Run the full stack and the smoke test**

Run:
```bash
pnpm --filter api migration:run
docker compose up -d --build
./scripts/smoke-test.sh
```
Expected: `All smoke checks passed.` printed, exit code 0.

The `pnpm --filter api migration:run` above runs from the host, against `postgres`'s host-side port mapping from Task 2 (using `apps/api/.env`'s `DATABASE_URL=postgresql://...@localhost:<host-port>/...`) — the same command and same already-applied migration Task 2 used, just re-confirming it's still applied before the containerized `api` starts. It is idempotent (TypeORM records applied migrations and skips them), so running it again here is always safe.

- [ ] **Step 6: Commit**

```bash
git add apps/api/Dockerfile apps/web/Dockerfile docker-compose.yml scripts/smoke-test.sh
git commit -m "feat: wire full docker-compose stack and add a smoke test"
```

---

## Plan self-review notes

- **Spec coverage:** monorepo/Turborepo (§1) → Task 1; TypeORM decision + migration approach (§4) → Task 2; identity/auth/argon2/JWT (§5, §7) → Task 3; RBAC + Postgres exception handling (§4, §7) → Task 4; Swagger/OpenAPI client generation (§6) → Task 5; Tailwind CSS + shadcn/ui (§6) → Task 6, Step 2 (five hand-written primitives: `Button`, `Input`, `Label`, `Card`, `Table`), used throughout Tasks 6–7's pages instead of unstyled HTML; no-NextAuth cookie proxy (§6) → Task 6. Background jobs (§8), MongoDB policy templates (§4 module list), and reports (§9's testing note) are out of scope for this plan — they belong to later module plans (Master Data, Labs, Exam Events/Sessions, Policy, Submissions, Reports), each of which should get its own plan following this one and can add further shadcn components (e.g. `Select`, `Dialog`) via `pnpm dlx shadcn@latest add <component>` against the `components.json` this plan establishes.
- **Placeholder scan:** no TBDs; every step has runnable code or an exact command.
- **Type consistency:** `AccessTokenPayload` (Task 3) is reused as-is in Task 4's `RolesGuard`; `AccountFormValues` (Task 7) matches `CreateAccountDto`'s shape (`username`, `displayName`, `password`, `roleCodes`) field-for-field.

---

## What's next

This plan covers `WEB-AUTH-01..03` and `WEB-ACC-01..04`, plus all shared infrastructure. Once it's implemented and green, the next plans (each following this same task-based format) are, in `plan-timeline.md`'s GĐ1 order:

1. **Master Data module** (`WEB-MD-01..24`) — students, lecturers, subjects, academic terms, course sections + enrollments, Excel import. Reuses the Tailwind/shadcn primitives from this plan; add new shadcn components (e.g. `Select`, `Dialog`) as needed via `pnpm dlx shadcn@latest add <component>`.
2. **Labs module** (`WEB-LAB-01..13`) — labs, workstations, layouts, the `react-konva` seating editor.
3. **Exam Events + Lab Sessions module** (`WEB-EXAM-01..19`) — the most complex remaining slice: manifest hashing, booking conflicts (first real use of the `PostgresExceptionFilter`'s exclusion-constraint path), and the draft→scheduled FSM.

Policy (`WEB-POL`), Submissions (`WEB-SUB`), and Reports (`WEB-RPT`) follow per the GĐ2/GĐ4 timeline.
