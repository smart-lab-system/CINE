# Bảng lỗi theo rubric — Backend Implementation Plan (Plan A)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Every task is TDD: write the failing test, watch it fail for the right reason, implement, watch it pass, `tsc`, lint the touched dir, commit.

**Goal:** Move the error table from "one global rule list per teacher" to "errors shared in a library, applied per rubric with their own criterion and deduction": migration + scoring read path + price writes + rubric-scoped API + proposals with context + overview, with grading behaviour unchanged right after migration.

**Architecture:** A new `rubric_error` table (the *application row*: teacher + rubric **name** + error rule + criterion key) and `rubric_error_price` (price per application row per teacher-level `price_table_version`, append-only, whole table copied on every change exactly like today). `loadRuleSnapshots` / `loadRuleEntries` become rubric-scoped and still return the **same shapes**, so `computeScore`, `decide`, `repriceBreakdown` and the stored `breakdown` JSON do not change. Writes go through three services: `RubricErrorService` (assign / move / remove / copy / list), `ErrorRuleService` (library, revise, split, dismiss) and `PriceService` (price per application row). Sightings give proposals their context.

**Tech Stack:** NestJS 10 + TypeORM 0.3 on PostgreSQL (schema `examcollect`, raw SQL for the scoring path), Jest + ts-jest (unit in `src`, e2e in `apps/api/test` against local Docker Postgres/MinIO), class-validator DTOs, `@cine/shared` OpenAPI client regenerated from a running API.

**Spec:** `docs/superpowers/specs/2026-10-07-rules-by-rubric-design.md` (read it first — this plan implements §2, §3, §4, §6, §7.1–7.5). Approved mock-up: `docs/superpowers/mockups/2026-10-07-rules-by-rubric.html`. Companion plan: `2026-10-07-rules-by-rubric-web.md` (starts only after Task A11 here regenerates the OpenAPI client).

## Global Constraints

- **Rubric identity = (`teacher_id`, `name`)**; every version of a rubric shares its application rows and prices (spec D2). `rubric_error.rubric_name` has no foreign key; services check it exists *for this teacher* (404) and that the criterion exists in the **latest** version (400).
- Every service that writes `rubric_error`, `rubric_error_price`, `error_rule*`, `price_table_version` or recomputes **takes `lockTeacherScoring(m, teacherId)` first**, inside its own transaction.
- Deductions travel as **decimal strings** (`"1.50"`) or `null`; JSON numbers are rejected by `parseDeduction` (400). Never route points through floats (§13.2): use `parseHundredths` / `formatHundredths`.
- `RuleSnapshot`, `BreakdownError`, `ScoreBreakdown.mismatchedRules` and the shape of stored `breakdown` JSON are **unchanged**; `ruleId` in a breakdown stays `error_rule.id`.
- `rule_price` and `error_rule_revision.criterion_key` are **never written again** but stay in the schema (spec §2.2). New revisions write `NULL` for `criterion_key`.
- Error messages are Vietnamese; ownership failures are **404** `Không tìm thấy …` (T-POL-8), never 403.
- Migration timestamp `1789500000000`; `migrationsTransactionMode: 'none'`; run migrations **only on local Docker Postgres** (`DATABASE_URL` override — `apps/api/.env` points to remote Supabase; see memory `cine-migration-hits-supabase`).
- e2e runs serially: from `apps/api`, `npx jest --config ./test/jest-e2e.json --runInBand <file-pattern>` (NOT `pnpm test:e2e -- --runInBand`; pnpm turns it into a name filter). Before trusting a run, make sure no stale `jest`/`nest` node processes are alive (memory `cine-e2e-stale-jest-processes`). Needs Postgres + MinIO + the `examcollect-submissions` bucket (memory `cine-e2e-test-prerequisites`).
- `src/eval/**` and `src/grading/investigator/**` must not import from `/entities/` (`no-db.import-scan.spec.ts`). `pnpm check:cycles` must print zero cycles.
- Code style of the repo: 2-space indent, single quotes, trailing commas, comments in Vietnamese explaining *why*, spec section numbers in comments (`§2.2`, `T-POL-8`).
- Branch `feat/rules-by-rubric` in worktree `.claude/worktrees/rules-by-rubric`; commit per task (end every commit message with the attribution line the session's system-reminder asks for); **no push / PR / merge** until Plan A and Plan B are both done and the user says so.
- The docs in this repo that hold the test IDs are the spec's §7; keep `T-RBE-…` IDs in test titles.

## Known-red ledger

The cutover (Task A2) changes shared helpers and signatures, so a few e2e files are **intentionally red** between tasks. Each task lists the e2e files it must keep green; the ledger says when the rest turn green. Task A10 runs the whole suite and the ledger must be empty there.

| e2e file | Red after | Turns green in |
|---|---|---|
| `rules-prices.e2e-spec.ts` (tests `list…`, `tạo luật…`, `preview luật…`) | A2 | A5 (rewritten) |
| `rules-routes.e2e-spec.ts` (first four tests) | A2 | A9 (rewritten) |
| `finish-attempt.e2e-spec.ts` (missing-rules test), `investigator-run.e2e-spec.ts` | A6 starts | A6 (same task) |

## Review Focus

1. **A rule seeded before the criteria exist, or into a rubric without that key, silently has no application row** → the rule vanishes from scoring (no error). → A2 `T-RBE-SCORE-3` (dangling key) and the helper contract in A1 (`seedRule` must be called after `seedInvestigatorSession`).
2. **Copy-all price versions:** `setPrice` on rubric A must carry rubric B's rows (including explicit `NULL` rows) into the new version, and must not invent rows. → A2 `T-RBE-PRICE-1/2`.
3. **Split loses a lecturer's per-submission decisions** (error exceptions point at `error_rule.id`, and the split creates a new id). → A5 `T-RBE-SPLIT-3` runs **before** the route exists.
4. **Backfill must be idempotent and must not invent applications** for rules whose key matches no rubric, nor for `proposed` rules. → A1 `T-RBE-MIG-1/3`; and old≡new scoring → A2 `T-RBE-MIG-2`.
5. **Re-adding a removed application** must reuse the same row (and its price history), replacing the criterion. → A3 `T-RBE-API-2`.
6. **A proposal must be sighted only while it is `proposed`**; a dismissed one that the agent reports again must not reappear. → A6 `T-RBE-API-6`.
7. **A criterion deleted in a newer rubric version** leaves a dangling application: bài on the new version get `mismatchedRules`, bài pinned to the old version do not, and `overview.danglingCount` counts it. → A2 `T-RBE-SCORE-3`, A7 `T-RBE-API-1`.

---

## File Structure

**Create (apps/api/src):**
- `database/migrations/1789500000000-RubricErrors.ts` — DDL + backfill + `down`.
- `database/rubric-errors-backfill.ts` — `BACKFILL_ASSIGNMENTS_SQL`, `BACKFILL_PRICES_SQL` (shared by migration and tests).
- `grading/entities/rubric-error.entity.ts`, `rubric-error-price.entity.ts`, `error-rule-sighting.entity.ts`.
- `grading/rules/rule-key.ts` (+ `rule-key.spec.ts`) — slug + unique key.
- `grading/rules/price-version.ts` — `writeNextPriceVersion`.
- `grading/rules/rubric-error.service.ts` — `owned`, `list`, `assign`, `move`, `remove`, `copy`.
- `grading/rules/proposal.service.ts` — proposals with sightings.
- `grading/rules/rubric-overview.service.ts` — `GET /rubric-errors/overview`.
- `grading/rules/rubric-errors.controller.ts`, `grading/rules/dto/rubric-error.dto.ts`.

**Modify (apps/api/src):** `database/data-source.ts`, `database/verify-schema.ts`, `grading/grading.module.ts`, `grading/entities/error-rule-revision.entity.ts`, `grading/scoring/score-inputs.ts`, `grading/scoring/score.service.ts`, `grading/pipeline/rule-entries.ts`, `grading/pipeline/investigation-context.service.ts`, `grading/rules/price.service.ts`, `grading/rules/error-rule.service.ts` (rewrite), `grading/rules/rule-input.ts` (+ spec), `grading/rules/missing-rules.ts`, `grading/rules/rules.controller.ts`, `grading/rules/dto/rule-body.dto.ts`, `grading/rules/dto/rule-state.dto.ts`, `grading/rubric.service.ts`, `eval/rehearsal/cli.ts`.

**Tests (apps/api/test):** create `rubric-errors-schema.e2e-spec.ts`, `rubric-scoped-pricing.e2e-spec.ts`, `rubric-errors-service.e2e-spec.ts`, `rubric-errors-copy.e2e-spec.ts`, `rule-split.e2e-spec.ts`, `rule-proposals.e2e-spec.ts`, `rubric-overview.e2e-spec.ts`, `rubric-waiver-carry.e2e-spec.ts`, `rubric-errors-routes.e2e-spec.ts`; modify helpers `helpers/investigator-seed.ts`, and tests `rule-entries`, `score-service`, `finalize-investigator`, `error-exception`, `rules-prices`, `rules-routes`, `finish-attempt`, `investigator-run`, `ui-e2e/seed.ts`.

---

## Task A0: Worktree, environment, baseline

**Files:** none in the repo (a ledger file in an ignored dir).

- [ ] **Step 1: Create the branch + worktree and bring the three design docs in**

From the main checkout (`C:\Users\Admin\Main\Desktop\HKI 2026-2027\KLTN\CINE`):

```bash
git worktree add .claude/worktrees/rules-by-rubric -b feat/rules-by-rubric main
mkdir -p .claude/worktrees/rules-by-rubric/docs/superpowers/mockups
cp docs/superpowers/specs/2026-10-07-rules-by-rubric-design.md .claude/worktrees/rules-by-rubric/docs/superpowers/specs/
cp docs/superpowers/mockups/2026-10-07-rules-by-rubric.html .claude/worktrees/rules-by-rubric/docs/superpowers/mockups/
cp docs/superpowers/plans/2026-10-07-rules-by-rubric-backend.md docs/superpowers/plans/2026-10-07-rules-by-rubric-web.md .claude/worktrees/rules-by-rubric/docs/superpowers/plans/
git -C .claude/worktrees/rules-by-rubric add docs
git -C .claude/worktrees/rules-by-rubric commit -m "docs(rules): spec, mock-up and plans for rules-by-rubric"
```

(If the harness rejects a command because a path contains `eval`, put the command in a wrapper script under `.superpowers/sdd/rules-by-rubric/` and call it by a literal relative path — memory `worktree-session-command-guard`.)

- [ ] **Step 2: Install dependencies with the shared virtual store (14 s instead of hours)**

In PowerShell, from the new worktree root:

```powershell
$env:CI = 'true'
pnpm install --frozen-lockfile --config.verify-store-integrity=false "--config.virtual-store-dir=C:\Users\Admin\Main\Desktop\HKI 2026-2027\KLTN\CINE\node_modules\.pnpm"
```

Do **not** run a plain `pnpm install` in this worktree afterwards (memory `cine-worktree-install-shared-virtual-store`). In a `.cmd` file always write `call pnpm …`.

- [ ] **Step 3: Start the local services and create the bucket**

```bash
docker start cine-postgres-1 cine-minio-1 cine-redis-1
docker run --rm --network host --entrypoint sh minio/mc:latest -c "mc alias set local http://localhost:9010 examcollect_admin examcollect_admin_password && mc mb --ignore-existing local/examcollect-submissions"
```

- [ ] **Step 4: Migrate the LOCAL database (never the default .env target)**

Read `DATABASE_URL` from `apps/api/.env.test`, then:

```powershell
cd apps\api
$env:DATABASE_URL = '<value of DATABASE_URL in apps/api/.env.test>'
pnpm migration:run
pnpm exec tsc --noEmit -p tsconfig.json
```

Expected: migrations up to `1789490000000-ScoreReasonSessionRuleSet` are applied; `tsc` prints nothing.

- [ ] **Step 5: Record the baseline (green before we start)**

```powershell
npx jest --config ./test/jest-e2e.json --runInBand 2>&1 | Tee-Object -FilePath ..\..\.superpowers\sdd\rules-by-rubric-e2e-baseline.txt | Select-Object -Last 15
npx jest 2>&1 | Select-Object -Last 8
```

Write the `Tests:` / `Test Suites:` lines of both runs into `.superpowers/sdd/rules-by-rubric/progress.md` (the dir is git-ignored). **If the baseline is not fully green, stop and report which files are red before changing code** — otherwise a pre-existing failure is later blamed on this work. (Memory notes a known-red `exam-authoring-attach` on the master-data branch; record it if it shows here too.)

---

## Task A1: Schema, entities, backfill SQL, new seed helpers (additive — nothing reads the new tables yet)

**Files:**
- Create: `apps/api/src/database/migrations/1789500000000-RubricErrors.ts`, `apps/api/src/database/rubric-errors-backfill.ts`, `apps/api/src/grading/entities/rubric-error.entity.ts`, `rubric-error-price.entity.ts`, `error-rule-sighting.entity.ts`
- Modify: `apps/api/src/grading/entities/error-rule-revision.entity.ts`, `apps/api/src/database/data-source.ts`, `apps/api/src/database/verify-schema.ts`, `apps/api/src/grading/grading.module.ts` (`TypeOrmModule.forFeature`), `apps/api/test/helpers/investigator-seed.ts` (**add** helpers only)
- Test: `apps/api/test/rubric-errors-schema.e2e-spec.ts`

**Interfaces — Produces:**
- `BACKFILL_ASSIGNMENTS_SQL`, `BACKFILL_PRICES_SQL: string` — both take `$1 = teacher uuid | NULL`.
- Test helpers (added to `investigator-seed.ts`; the existing `seedRule` / `seedPrices` keep their old behaviour until Task A2):
  - `seedRuleOnly(ds, teacherId, ruleKey, predicate?: object | null, state?: 'active' | 'proposed'): Promise<{ ruleId: string; revisionId: string }>` — rule + revision 1 with `criterion_key = NULL`, **no** application row.
  - `seedAssignment(ds, teacherId, rubricName, ruleId, criterionKey): Promise<string>` — returns `rubric_error.id`.
  - `seedAssignmentPrices(ds, teacherId, prices: Record<string /*rubric_error.id*/, string | null>): Promise<string>` — a new price version with exactly those rows.
  - `assignmentId(ds, teacherId, rubricName, ruleId): Promise<string>`, `rubricNameOf(ds, rubricId): Promise<string>`.

- [ ] **Step 1: Write the failing schema + backfill test**

`apps/api/test/rubric-errors-schema.e2e-spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { BACKFILL_ASSIGNMENTS_SQL, BACKFILL_PRICES_SQL } from '../src/database/rubric-errors-backfill';
import { seedCriterion, seedSession, seedTeacher } from './helpers/grading-seed';
import { assignmentId, rubricNameOf, seedAssignment, seedAssignmentPrices, seedRuleOnly } from './helpers/investigator-seed';

/** Mô hình cũ: luật mang `criterion_key` ở bản sửa, giá ở `rule_price` — dựng bằng SQL thô cho test backfill. */
async function legacyRule(ds: DataSource, teacherId: string, ruleKey: string, criterionKey: string, state = 'active'): Promise<string> {
  const [r] = await ds.query(
    `INSERT INTO examcollect.error_rule (teacher_id, rule_key, origin, state) VALUES ($1, $2, 'teacher', $3) RETURNING id`,
    [teacherId, ruleKey, state],
  );
  const [v] = await ds.query(
    `INSERT INTO examcollect.error_rule_revision (error_rule_id, revision, name, description, criterion_key, created_by)
     VALUES ($1, 1, $2, $2, $3, $4) RETURNING id`,
    [r.id, ruleKey, criterionKey, teacherId],
  );
  await ds.query(`UPDATE examcollect.error_rule SET current_revision_id = $2 WHERE id = $1`, [r.id, v.id]);
  return r.id as string;
}

async function legacyPriceVersion(ds: DataSource, teacherId: string, prices: Record<string, string | null>): Promise<string> {
  const [{ next }] = await ds.query(
    `SELECT COALESCE(MAX(version), 0) + 1 AS next FROM examcollect.price_table_version WHERE teacher_id = $1`,
    [teacherId],
  );
  const [v] = await ds.query(
    `INSERT INTO examcollect.price_table_version (teacher_id, version, created_by) VALUES ($1, $2, $1) RETURNING id`,
    [teacherId, next],
  );
  for (const [ruleId, deduction] of Object.entries(prices)) {
    await ds.query(
      `INSERT INTO examcollect.rule_price (price_table_version_id, error_rule_id, teacher_id, deduction) VALUES ($1, $2, $3, $4)`,
      [v.id, ruleId, teacherId, deduction],
    );
  }
  return v.id as string;
}

/** Thêm một bản của rubric `name` (đã có hoặc mới) với đúng các tiêu chí `keys`. */
async function addRubricVersion(ds: DataSource, teacherId: string, name: string, version: number, keys: string[]): Promise<string> {
  const [r] = await ds.query(
    `INSERT INTO examcollect.rubric (version, teacher_id, name) VALUES ($1, $2, $3) RETURNING id`,
    [version, teacherId, name],
  );
  for (const k of keys) await seedCriterion(ds, r.id, k, 5);
  return r.id as string;
}

describe('Bảng lỗi theo rubric — lược đồ và backfill (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    ds = app.get(DataSource);
  });
  afterAll(async () => app.close());

  /** Hai giảng viên; mỗi người một phiên (nên một rubric v1 với hai tiêu chí `tinh_dung`, `trinh_bay`). */
  async function twoTeachers(label: string) {
    const a = await seedSession(ds, `${label}-a`);
    const b = await seedSession(ds, `${label}-b`);
    for (const ctx of [a, b]) {
      await seedCriterion(ds, ctx.rubricId, 'tinh_dung', 6);
      await seedCriterion(ds, ctx.rubricId, 'trinh_bay', 4);
    }
    return { a, b, nameA: await rubricNameOf(ds, a.rubricId), nameB: await rubricNameOf(ds, b.rubricId) };
  }

  it('T-RBE-DATA-1: một dòng giá không trỏ được dòng áp dụng của giảng viên khác', async () => {
    const { a, b, nameA } = await twoTeachers('dat1');
    const rule = await seedRuleOnly(ds, a.teacherId, 'sai_bien');
    const assignment = await seedAssignment(ds, a.teacherId, nameA, rule.ruleId, 'tinh_dung');
    const [v] = await ds.query(
      `INSERT INTO examcollect.price_table_version (teacher_id, version, created_by) VALUES ($1, 1, $1) RETURNING id`,
      [b.teacherId],
    );
    await expect(
      ds.query(
        `INSERT INTO examcollect.rubric_error_price (price_table_version_id, rubric_error_id, teacher_id, deduction) VALUES ($1, $2, $3, '1.00')`,
        [v.id, assignment, b.teacherId],
      ),
    ).rejects.toThrow(/fk_rep_error_teacher/);
  });

  it('T-RBE-DATA-2: giá chỉ thêm; dòng áp dụng không xoá được; (giảng viên, rubric, lỗi) duy nhất', async () => {
    const { a, nameA } = await twoTeachers('dat2');
    const rule = await seedRuleOnly(ds, a.teacherId, 'sai_bien');
    const assignment = await seedAssignment(ds, a.teacherId, nameA, rule.ruleId, 'tinh_dung');
    await seedAssignmentPrices(ds, a.teacherId, { [assignment]: '1.00' });
    await expect(ds.query(`UPDATE examcollect.rubric_error_price SET deduction = '2.00' WHERE rubric_error_id = $1`, [assignment])).rejects.toThrow(
      /chỉ thêm/,
    );
    await expect(ds.query(`DELETE FROM examcollect.rubric_error WHERE id = $1`, [assignment])).rejects.toThrow(/không xoá được/);
    await expect(seedAssignment(ds, a.teacherId, nameA, rule.ruleId, 'trinh_bay')).rejects.toThrow(/uq_rubric_error/);
  });

  it('T-RBE-MIG-1: backfill dựng đúng dòng áp dụng và giá của MỌI phiên bản giá, chỉ cho giảng viên được chọn', async () => {
    const { a, b, nameA } = await twoTeachers('mig1');
    // R1 có hai bản: v1 {tinh_dung, trinh_bay} (từ seedSession), v2 {tinh_dung, hieu_nang}; R2 bản 1 {tinh_dung}.
    await addRubricVersion(ds, a.teacherId, nameA, 2, ['tinh_dung', 'hieu_nang']);
    const nameR2 = `R2 ${Date.now()}`;
    await addRubricVersion(ds, a.teacherId, nameR2, 1, ['tinh_dung']);
    const x = await legacyRule(ds, a.teacherId, 'x', 'tinh_dung');
    const y = await legacyRule(ds, a.teacherId, 'y', 'trinh_bay');
    const z = await legacyRule(ds, a.teacherId, 'z', 'hieu_nang');
    await legacyRule(ds, a.teacherId, 'w', 'khong_co_o_dau');
    await legacyRule(ds, a.teacherId, 'p', 'chua_gan', 'proposed');
    const v1 = await legacyPriceVersion(ds, a.teacherId, { [x]: '1.00', [y]: '2.00' });
    const v2 = await legacyPriceVersion(ds, a.teacherId, { [x]: '1.50', [y]: null, [z]: '0.25' });
    // Giảng viên B có một luật khớp rubric của B nhưng KHÔNG được chạm khi backfill chọn A.
    await legacyRule(ds, b.teacherId, 'cua_b', 'tinh_dung');

    await ds.query(BACKFILL_ASSIGNMENTS_SQL, [a.teacherId]);
    await ds.query(BACKFILL_PRICES_SQL, [a.teacherId]);

    const assigned = await ds.query(
      `SELECT re.rubric_name AS rubric, r.rule_key AS rule, re.criterion_key AS criterion
         FROM examcollect.rubric_error re JOIN examcollect.error_rule r ON r.id = re.error_rule_id
        WHERE re.teacher_id = $1`,
      [a.teacherId],
    );
    expect(
      assigned.map((r: { rubric: string; rule: string; criterion: string }) => `${r.rubric}|${r.rule}|${r.criterion}`).sort(),
    ).toEqual(
      [`${nameA}|x|tinh_dung`, `${nameR2}|x|tinh_dung`, `${nameA}|y|trinh_bay`, `${nameA}|z|hieu_nang`].sort(),
    );

    const prices = await ds.query(
      `SELECT v.id AS version_id, r.rule_key AS rule, re.rubric_name AS rubric, p.deduction
         FROM examcollect.rubric_error_price p
         JOIN examcollect.price_table_version v ON v.id = p.price_table_version_id
         JOIN examcollect.rubric_error re ON re.id = p.rubric_error_id
         JOIN examcollect.error_rule r ON r.id = re.error_rule_id
        WHERE p.teacher_id = $1`,
      [a.teacherId],
    );
    const key = (r: { version_id: string; rule: string; rubric: string; deduction: string | null }) =>
      `${r.version_id === v1 ? 'v1' : r.version_id === v2 ? 'v2' : '?'}|${r.rule}|${r.rubric === nameA ? 'R1' : 'R2'}|${r.deduction}`;
    expect(prices.map(key).sort()).toEqual(
      ['v1|x|R1|1.00', 'v1|x|R2|1.00', 'v1|y|R1|2.00', 'v2|x|R1|1.50', 'v2|x|R2|1.50', 'v2|y|R1|null', 'v2|z|R1|0.25'].sort(),
    );

    const [{ n }] = await ds.query(`SELECT count(*)::int AS n FROM examcollect.rubric_error WHERE teacher_id = $1`, [b.teacherId]);
    expect(n).toBe(0);
  });

  it('T-RBE-MIG-3: chạy backfill lần hai không đổi gì; luật proposed và luật không khớp rubric nào không sinh dòng', async () => {
    const { a, nameA } = await twoTeachers('mig3');
    const x = await legacyRule(ds, a.teacherId, 'x', 'tinh_dung');
    await legacyRule(ds, a.teacherId, 'p', 'tinh_dung', 'proposed');
    await legacyPriceVersion(ds, a.teacherId, { [x]: '1.00' });
    const counts = async () => ({
      rows: (await ds.query(`SELECT count(*)::int AS n FROM examcollect.rubric_error WHERE teacher_id = $1`, [a.teacherId]))[0].n,
      prices: (await ds.query(`SELECT count(*)::int AS n FROM examcollect.rubric_error_price WHERE teacher_id = $1`, [a.teacherId]))[0].n,
    });
    await ds.query(BACKFILL_ASSIGNMENTS_SQL, [a.teacherId]);
    await ds.query(BACKFILL_PRICES_SQL, [a.teacherId]);
    const first = await counts();
    await ds.query(BACKFILL_ASSIGNMENTS_SQL, [a.teacherId]);
    await ds.query(BACKFILL_PRICES_SQL, [a.teacherId]);
    expect(await counts()).toEqual(first);
    expect(first).toEqual({ rows: 1, prices: 1 }); // chỉ x@nameA; p (proposed) không có dòng
    expect(await assignmentId(ds, a.teacherId, nameA, x)).toEqual(expect.any(String));
  });

  it('error_rule_revision.criterion_key nhận NULL (bản sửa mới không còn mang tiêu chí)', async () => {
    const t = await seedTeacher(ds, 'null-crit');
    const rule = await seedRuleOnly(ds, t, 'khong_tieu_chi');
    const [v] = await ds.query(`SELECT criterion_key FROM examcollect.error_rule_revision WHERE id = $1`, [rule.revisionId]);
    expect(v.criterion_key).toBeNull();
  });
});
```

- [ ] **Step 2: Add the test helpers (additive) and run — expect FAIL**

Append to `apps/api/test/helpers/investigator-seed.ts` (do **not** touch the existing `seedRule`/`seedPrices` yet):

```ts
/** Luật + bản sửa 1, `criterion_key = NULL` (mô hình mới), KHÔNG dòng áp dụng. */
export async function seedRuleOnly(
  ds: DataSource,
  teacherId: string,
  ruleKey: string,
  predicate: object | null = null,
  state: 'active' | 'proposed' = 'active',
): Promise<{ ruleId: string; revisionId: string }> {
  const [r] = await ds.query(
    `INSERT INTO examcollect.error_rule (teacher_id, rule_key, origin, state) VALUES ($1, $2, 'teacher', $3) RETURNING id`,
    [teacherId, ruleKey, state],
  );
  const [v] = await ds.query(
    `INSERT INTO examcollect.error_rule_revision (error_rule_id, revision, name, description, predicate, created_by)
     VALUES ($1, 1, $2, $2, $3, $4) RETURNING id`,
    [r.id, ruleKey, predicate === null ? null : JSON.stringify(predicate), teacherId],
  );
  await ds.query(`UPDATE examcollect.error_rule SET current_revision_id = $2 WHERE id = $1`, [r.id, v.id]);
  return { ruleId: r.id, revisionId: v.id };
}

/** Một dòng áp dụng: lỗi `ruleId` nằm trong rubric `rubricName` thuộc tiêu chí `criterionKey`. */
export async function seedAssignment(
  ds: DataSource,
  teacherId: string,
  rubricName: string,
  ruleId: string,
  criterionKey: string,
): Promise<string> {
  const [row] = await ds.query(
    `INSERT INTO examcollect.rubric_error (teacher_id, rubric_name, error_rule_id, criterion_key) VALUES ($1, $2, $3, $4) RETURNING id`,
    [teacherId, rubricName, ruleId, criterionKey],
  );
  return row.id as string;
}

/** Phiên bản giá mới với ĐÚNG các giá theo DÒNG ÁP DỤNG (dòng không có = chưa giá). */
export async function seedAssignmentPrices(ds: DataSource, teacherId: string, prices: Record<string, string | null>): Promise<string> {
  const [{ next }] = await ds.query(
    `SELECT COALESCE(MAX(version), 0) + 1 AS next FROM examcollect.price_table_version WHERE teacher_id = $1`,
    [teacherId],
  );
  const [v] = await ds.query(
    `INSERT INTO examcollect.price_table_version (teacher_id, version, created_by) VALUES ($1, $2, $1) RETURNING id`,
    [teacherId, next],
  );
  for (const [rubricErrorId, deduction] of Object.entries(prices)) {
    await ds.query(
      `INSERT INTO examcollect.rubric_error_price (price_table_version_id, rubric_error_id, teacher_id, deduction) VALUES ($1, $2, $3, $4)`,
      [v.id, rubricErrorId, teacherId, deduction],
    );
  }
  return v.id as string;
}

export async function assignmentId(ds: DataSource, teacherId: string, rubricName: string, ruleId: string): Promise<string> {
  const [row] = await ds.query(
    `SELECT id FROM examcollect.rubric_error WHERE teacher_id = $1 AND rubric_name = $2 AND error_rule_id = $3`,
    [teacherId, rubricName, ruleId],
  );
  if (!row) throw new Error(`không có dòng áp dụng của luật ${ruleId} trong rubric "${rubricName}"`);
  return row.id as string;
}

export async function rubricNameOf(ds: DataSource, rubricId: string): Promise<string> {
  const [row] = await ds.query(`SELECT name FROM examcollect.rubric WHERE id = $1`, [rubricId]);
  return row.name as string;
}
```

Run (from `apps/api`): `npx jest --config ./test/jest-e2e.json --runInBand rubric-errors-schema`
Expected: FAIL — `relation "examcollect.rubric_error" does not exist` (and the import of `rubric-errors-backfill` unresolved).

- [ ] **Step 3: Backfill SQL module**

`apps/api/src/database/rubric-errors-backfill.ts`:

```ts
/**
 * Dựng dòng áp dụng và giá của chúng từ mô hình cũ (luật mang `criterion_key` ở bản sửa hiện hành,
 * giá ở `rule_price`). Dùng ở HAI nơi: migration `RubricErrors1789500000000` (`$1 = NULL` → mọi giảng
 * viên) và test (`$1 = một giảng viên`). Idempotent: chạy lại không đổi gì.
 *
 * Quy tắc (spec §6): luật `active` thuộc rubric N của cùng giảng viên khi MỘT phiên bản nào đó của N
 * có tiêu chí cùng khoá — đúng tập (luật, rubric) mà tính điểm hôm nay thực sự áp.
 */
export const BACKFILL_ASSIGNMENTS_SQL = `
  INSERT INTO examcollect.rubric_error (teacher_id, rubric_name, error_rule_id, criterion_key)
  SELECT DISTINCT r.teacher_id, rb.name, r.id, v.criterion_key
    FROM examcollect.error_rule r
    JOIN examcollect.error_rule_revision v ON v.id = r.current_revision_id
    JOIN examcollect.rubric rb ON rb.teacher_id = r.teacher_id
    JOIN examcollect.rubric_criterion rc ON rc.rubric_id = rb.id AND rc.key = v.criterion_key
   WHERE r.state = 'active' AND v.criterion_key IS NOT NULL
     AND ($1::uuid IS NULL OR r.teacher_id = $1)
  ON CONFLICT (teacher_id, rubric_name, error_rule_id) DO NOTHING`;

/** Chép MỌI phiên bản giá — phiên đã chốt (ghim phiên bản cũ) vẫn đọc được giá cũ qua bảng mới. */
export const BACKFILL_PRICES_SQL = `
  INSERT INTO examcollect.rubric_error_price (price_table_version_id, rubric_error_id, teacher_id, deduction)
  SELECT p.price_table_version_id, re.id, p.teacher_id, p.deduction
    FROM examcollect.rule_price p
    JOIN examcollect.rubric_error re ON re.error_rule_id = p.error_rule_id AND re.teacher_id = p.teacher_id
   WHERE ($1::uuid IS NULL OR p.teacher_id = $1)
  ON CONFLICT (price_table_version_id, rubric_error_id) DO NOTHING`;
```

- [ ] **Step 4: Migration**

`apps/api/src/database/migrations/1789500000000-RubricErrors.ts`:

```ts
import { MigrationInterface, QueryRunner } from 'typeorm';
import { BACKFILL_ASSIGNMENTS_SQL, BACKFILL_PRICES_SQL } from '../rubric-errors-backfill';

/**
 * Bảng lỗi theo rubric (spec 2026-10-07-rules-by-rubric-design.md §2, §6).
 * Lỗi (`error_rule`) dùng chung; `rubric_error` là dòng áp dụng riêng từng rubric (theo TÊN) mang tiêu
 * chí; `rubric_error_price` là giá của dòng áp dụng trong một phiên bản bảng giá. `rule_price` và
 * `error_rule_revision.criterion_key` giữ nguyên làm hồ sơ — không ghi nữa.
 */
export class RubricErrors1789500000000 implements MigrationInterface {
  name = 'RubricErrors1789500000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE "examcollect"."rubric_error" (
        "id"            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at"    timestamptz NOT NULL DEFAULT now(),
        "updated_at"    timestamptz NOT NULL DEFAULT now(),
        "teacher_id"    uuid NOT NULL REFERENCES "examcollect"."account"("id") ON DELETE RESTRICT,
        "rubric_name"   text NOT NULL CONSTRAINT "ck_rubric_error_name" CHECK (length(btrim(rubric_name)) BETWEEN 1 AND 200),
        "error_rule_id" uuid NOT NULL,
        "criterion_key" text NOT NULL CONSTRAINT "ck_rubric_error_key" CHECK (criterion_key ~ '^[a-z0-9_]{1,64}$'),
        "removed_at"    timestamptz,
        CONSTRAINT "uq_rubric_error" UNIQUE ("teacher_id", "rubric_name", "error_rule_id"),
        CONSTRAINT "uq_rubric_error_id_teacher" UNIQUE ("id", "teacher_id"),
        CONSTRAINT "fk_rubric_error_rule_teacher" FOREIGN KEY ("error_rule_id", "teacher_id")
          REFERENCES "examcollect"."error_rule"("id", "teacher_id") ON DELETE RESTRICT
      )
    `);
    await q.query(
      `CREATE INDEX "idx_rubric_error_rubric" ON "examcollect"."rubric_error" ("teacher_id", "rubric_name") WHERE removed_at IS NULL`,
    );
    await q.query(`CREATE TRIGGER "set_updated_at_rubric_error" BEFORE UPDATE ON "examcollect"."rubric_error" FOR EACH ROW EXECUTE FUNCTION examcollect.set_updated_at()`);
    await q.query(`CREATE TRIGGER "trg_rubric_error_no_delete" BEFORE DELETE ON "examcollect"."rubric_error" FOR EACH ROW EXECUTE FUNCTION examcollect.guard_no_delete()`);

    await q.query(`
      CREATE TABLE "examcollect"."rubric_error_price" (
        "price_table_version_id" uuid NOT NULL,
        "rubric_error_id"        uuid NOT NULL,
        "teacher_id"             uuid NOT NULL,
        "deduction"              numeric(6,2) CHECK (deduction IS NULL OR deduction >= 0),
        "created_at"             timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_rubric_error_price" PRIMARY KEY ("price_table_version_id", "rubric_error_id"),
        CONSTRAINT "fk_rep_version_teacher" FOREIGN KEY ("price_table_version_id", "teacher_id")
          REFERENCES "examcollect"."price_table_version"("id", "teacher_id") ON DELETE RESTRICT,
        CONSTRAINT "fk_rep_error_teacher" FOREIGN KEY ("rubric_error_id", "teacher_id")
          REFERENCES "examcollect"."rubric_error"("id", "teacher_id") ON DELETE RESTRICT
      )
    `);
    await q.query(`CREATE TRIGGER "trg_rubric_error_price_append_only" BEFORE UPDATE OR DELETE ON "examcollect"."rubric_error_price" FOR EACH ROW EXECUTE FUNCTION examcollect.guard_append_only()`);

    await q.query(`
      CREATE TABLE "examcollect"."error_rule_sighting" (
        "id"                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at"        timestamptz NOT NULL DEFAULT now(),
        "teacher_id"        uuid NOT NULL,
        "error_rule_id"     uuid NOT NULL,
        "grading_result_id" uuid NOT NULL REFERENCES "examcollect"."grading_result"("id") ON DELETE CASCADE,
        "exam_session_id"   uuid NOT NULL REFERENCES "examcollect"."exam_session"("id") ON DELETE CASCADE,
        "rubric_name"       text NOT NULL,
        CONSTRAINT "uq_sighting" UNIQUE ("error_rule_id", "grading_result_id"),
        CONSTRAINT "fk_sighting_rule_teacher" FOREIGN KEY ("error_rule_id", "teacher_id")
          REFERENCES "examcollect"."error_rule"("id", "teacher_id") ON DELETE RESTRICT
      )
    `);
    await q.query(`CREATE INDEX "idx_sighting_rubric" ON "examcollect"."error_rule_sighting" ("teacher_id", "rubric_name")`);

    await q.query(`ALTER TABLE "examcollect"."error_rule_revision" ALTER COLUMN "criterion_key" DROP NOT NULL`);

    await q.query(BACKFILL_ASSIGNMENTS_SQL, [null]);
    await q.query(BACKFILL_PRICES_SQL, [null]);
  }

  public async down(q: QueryRunner): Promise<void> {
    // `rule_price` còn nguyên nên điểm cũ tính lại được. Bản sửa mới ghi NULL → đưa về giá trị giữ chỗ cũ.
    await q.query(`UPDATE "examcollect"."error_rule_revision" SET criterion_key = 'chua_gan' WHERE criterion_key IS NULL`);
    await q.query(`ALTER TABLE "examcollect"."error_rule_revision" ALTER COLUMN "criterion_key" SET NOT NULL`);
    await q.query(`DROP TABLE "examcollect"."error_rule_sighting"`);
    await q.query(`DROP TABLE "examcollect"."rubric_error_price"`);
    await q.query(`DROP TABLE "examcollect"."rubric_error"`);
  }
}
```

Caveat for `down`: `UPDATE` on `error_rule_revision` hits the append-only trigger (`trg_error_rule_revision_append_only`). Therefore in `down()` first run `ALTER TABLE "examcollect"."error_rule_revision" DISABLE TRIGGER "trg_error_rule_revision_append_only"`, do the UPDATE, `ENABLE` the trigger again. Add these two statements around the UPDATE above (this is the one place a revision row is rewritten, and only to undo this migration).

- [ ] **Step 5: Entities**

`apps/api/src/grading/entities/rubric-error.entity.ts`:

```ts
import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../shared/base.entity';

/**
 * Dòng áp dụng: lỗi `errorRuleId` nằm trong rubric `rubricName` (theo TÊN, qua mọi phiên bản) thuộc tiêu
 * chí `criterionKey` (spec §2.2). Không xoá dòng (`trg_rubric_error_no_delete`): gỡ là đặt `removedAt`.
 */
@Entity({ name: 'rubric_error' })
@Index('uq_rubric_error', ['teacherId', 'rubricName', 'errorRuleId'], { unique: true })
export class RubricErrorEntity extends BaseEntity {
  @Column({ name: 'teacher_id', type: 'uuid' })
  teacherId!: string;

  @Column({ name: 'rubric_name', type: 'text' })
  rubricName!: string;

  @Column({ name: 'error_rule_id', type: 'uuid' })
  errorRuleId!: string;

  @Column({ name: 'criterion_key', type: 'text' })
  criterionKey!: string;

  @Column({ name: 'removed_at', type: 'timestamptz', nullable: true })
  removedAt!: Date | null;
}
```

`rubric-error-price.entity.ts`:

```ts
import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

/** Giá của một dòng áp dụng trong một phiên bản bảng giá. Null = chưa có giá (§2.1). Chỉ thêm. */
@Entity({ name: 'rubric_error_price' })
export class RubricErrorPriceEntity {
  @PrimaryColumn({ name: 'price_table_version_id', type: 'uuid' })
  priceTableVersionId!: string;

  @PrimaryColumn({ name: 'rubric_error_id', type: 'uuid' })
  rubricErrorId!: string;

  /** Chỉ để hai khoá ngoại ghép chặn giá trỏ dòng của giảng viên khác. */
  @Column({ name: 'teacher_id', type: 'uuid' })
  teacherId!: string;

  @Column({ type: 'numeric', precision: 6, scale: 2, nullable: true })
  deduction!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
```

`error-rule-sighting.entity.ts`:

```ts
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** Nơi agent đã thấy một lỗi chưa có luật (spec D5). Nhật ký, không phải hồ sơ kiểm toán. */
@Entity({ name: 'error_rule_sighting' })
@Index('uq_sighting', ['errorRuleId', 'gradingResultId'], { unique: true })
export class ErrorRuleSightingEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ name: 'teacher_id', type: 'uuid' })
  teacherId!: string;

  @Column({ name: 'error_rule_id', type: 'uuid' })
  errorRuleId!: string;

  @Column({ name: 'grading_result_id', type: 'uuid' })
  gradingResultId!: string;

  @Column({ name: 'exam_session_id', type: 'uuid' })
  examSessionId!: string;

  @Column({ name: 'rubric_name', type: 'text' })
  rubricName!: string;
}
```

Modify `error-rule-revision.entity.ts`: replace the `criterionKey` column with

```ts
  /** Ngừng ghi từ spec 2026-10-07: tiêu chí giờ thuộc dòng áp dụng. Dữ liệu cũ giữ làm hồ sơ. */
  @Column({ name: 'criterion_key', type: 'text', nullable: true })
  criterionKey!: string | null;
```

Register the three entities: add the three `import`s and class names to `entities: [...]` in `database/data-source.ts` (after `RulePriceEntity`) and to `TypeOrmModule.forFeature([...])` in `grading/grading.module.ts`; add `'rubric_error'`, `'rubric_error_price'`, `'error_rule_sighting'` to `EXPECTED_TABLES` in `database/verify-schema.ts`.

- [ ] **Step 6: Apply the migration on the LOCAL DB and run the tests**

```powershell
cd apps\api
$env:DATABASE_URL = '<DATABASE_URL from .env.test>'
pnpm migration:run
pnpm exec tsc --noEmit -p tsconfig.json
npx jest --config ./test/jest-e2e.json --runInBand rubric-errors-schema entity-schema grading-data-model
```

Expected: migration `RubricErrors1789500000000` runs; all three suites PASS (the legacy-shape inserts in `grading-data-model` still work because `criterion_key` is only relaxed).

- [ ] **Step 7: Revert/re-apply check, then full green + commit**

```powershell
pnpm migration:revert; pnpm migration:run
```
Expected: both succeed (the `down` restores `NOT NULL`). Then run the whole e2e suite once (`--runInBand`): must equal the A0 baseline (nothing reads the new tables yet).

```bash
git add apps/api
git commit -m "feat(rules): rubric_error schema, backfill SQL and seed helpers"
```

---

## Task A2: Cutover — scoring reads and price writes go through application rows

This is the one big switch. After it, `loadRuleSnapshots`/`loadRuleEntries` are rubric-scoped, prices live in `rubric_error_price`, `recomputeForTeacher` gains `rubricName`, and the test helpers `seedRule`/`seedPrices` write the new shape (keeping their signatures so most e2e files need no edit).

**Files:**
- Create: `apps/api/src/grading/rules/price-version.ts`, `apps/api/src/grading/rules/rubric-error.service.ts` (minimal: `owned` only — extended in A3)
- Modify: `apps/api/src/grading/scoring/score-inputs.ts`, `score.service.ts`, `apps/api/src/grading/pipeline/rule-entries.ts`, `investigation-context.service.ts`, `apps/api/src/grading/rules/price.service.ts`, `rules.controller.ts`, `apps/api/src/grading/grading.module.ts`
- Modify (tests): `apps/api/test/helpers/investigator-seed.ts`, `rule-entries.e2e-spec.ts`, `score-service.e2e-spec.ts`, `finalize-investigator.e2e-spec.ts`, `error-exception.e2e-spec.ts`, `rules-prices.e2e-spec.ts` (price tests only), `rules-routes.e2e-spec.ts` (delete the price test)
- Test: `apps/api/test/rubric-scoped-pricing.e2e-spec.ts` (new)

**Interfaces — Consumes:** A1 tables/helpers.
**Interfaces — Produces:**
- `loadRuleSnapshots(m: EntityManager, teacherId: string, rubricName: string, priceVersionId: string | null): Promise<RuleSnapshot[]>`
- `loadRuleEntries(m: EntityManager, teacherId: string, rubricName: string): Promise<{ entries: RuleEntry[]; ruleTable: StoredInvestigation['ruleTable'] }>`
- `ScoreContext.rubricName: string`
- `recomputeForTeacher(..., scope: { ruleId?; rubricId?; rubricName?; sessionId?; exceptResultId? })`
- `writeNextPriceVersion(m, teacherId, actorId, changes: { rubricErrorId: string; deduction: string | null }[]): Promise<string>` (returns the new `price_table_version.id`)
- `RubricErrorService.owned(m, teacherId, rubricErrorId): Promise<OwnedAssignment>` with `OwnedAssignment = { id; teacherId; rubricName; errorRuleId; criterionKey }`
- `PriceService.setPrice(teacherId, rubricErrorId, deduction, actorId): Promise<{ versionId: string; recompute: RecomputeSummary }>`; `PriceService.preview(teacherId, rubricErrorId, deduction): Promise<PricePreview>`
- Test helpers (flipped): `seedRule(ds, teacherId, ruleKey, criterionKey, predicate?)` = `seedRuleOnly` + an application row in **every rubric of that teacher that has `criterionKey`** (call it after the criteria exist); `seedPrices(ds, teacherId, { [ruleId]: deduction })` = a new version with that deduction for **every active application row of each rule**.

- [ ] **Step 1: Write the failing cutover test**

`apps/api/test/rubric-scoped-pricing.e2e-spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { BACKFILL_ASSIGNMENTS_SQL, BACKFILL_PRICES_SQL } from '../src/database/rubric-errors-backfill';
import { loadRuleEntries } from '../src/grading/pipeline/rule-entries';
import { PriceService } from '../src/grading/rules/price.service';
import { computeScore } from '../src/grading/scoring/score-core';
import { currentPriceVersion, latestComputationRow, loadRuleSnapshots } from '../src/grading/scoring/score-inputs';
import { ScoreService } from '../src/grading/scoring/score.service';
import { TeacherReviewService } from '../src/grading/teacher-review.service';
import { seedCriterion, seedSession, SeedSession } from './helpers/grading-seed';
import {
  assignmentId,
  rubricNameOf,
  seedAssignment,
  seedAssignmentPrices,
  seedInvestigatorResult,
  seedInvestigatorSession,
  seedPrices,
  seedRule,
  seedRuleOnly,
  storedWith,
} from './helpers/investigator-seed';

const SEEN = [
  { ruleKey: 'chung', checkedBy: 'machine' as const },
  { ruleKey: 'ten_bien', checkedBy: 'model' as const },
];

describe('Nạp luật và giá theo rubric (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let scores: ScoreService;
  let prices: PriceService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    ds = app.get(DataSource);
    scores = app.get(ScoreService);
    prices = app.get(PriceService);
  });
  afterAll(async () => app.close());

  /**
   * Một giảng viên, hai rubric (hai phiên, tên rubric khác nhau, cùng khoá tiêu chí `tinh_dung`/`trinh_bay`).
   * `chung` (máy kiểm nhóm `bien`) và `ten_bien` (bằng lời) áp cho CẢ HAI rubric, giá 1,00 / 0,50 ở cả hai.
   */
  async function twoRubrics(label: string) {
    const a = await seedSession(ds, `${label}-a`);
    await seedInvestigatorSession(ds, a);
    const b = await seedSession(ds, `${label}-b`, { teacherId: a.teacherId, startHoursAgo: 10 });
    await seedInvestigatorSession(ds, b);
    const teacherId = a.teacherId;
    const nameA = await rubricNameOf(ds, a.rubricId);
    const nameB = await rubricNameOf(ds, b.rubricId);
    const chung = await seedRule(ds, teacherId, 'chung', 'tinh_dung', { kind: 'test_group_failed', group: 'bien' });
    const ten = await seedRule(ds, teacherId, 'ten_bien', 'trinh_bay');
    await seedPrices(ds, teacherId, { [chung.ruleId]: '1.00', [ten.ruleId]: '0.50' });
    return {
      a, b, teacherId, nameA, nameB, chung, ten,
      chungA: await assignmentId(ds, teacherId, nameA, chung.ruleId),
      chungB: await assignmentId(ds, teacherId, nameB, chung.ruleId),
      tenA: await assignmentId(ds, teacherId, nameA, ten.ruleId),
      tenB: await assignmentId(ds, teacherId, nameB, ten.ruleId),
    };
  }
  const graded = async (ctx: SeedSession) => {
    const { resultId } = await seedInvestigatorResult(ds, ctx, storedWith(SEEN));
    await scores.computeInitial(resultId);
    return resultId;
  };
  const scoreOf = async (resultId: string) => (await latestComputationRow(ds.manager, resultId))!.score;

  it('T-RBE-SCORE-1: bài của rubric A không thấy luật chỉ có ở rubric B', async () => {
    const a = await seedSession(ds, 'sc1a');
    await seedInvestigatorSession(ds, a);
    const b = await seedSession(ds, 'sc1b', { teacherId: a.teacherId, startHoursAgo: 10 });
    await seedInvestigatorSession(ds, b);
    const nameA = await rubricNameOf(ds, a.rubricId);
    const nameB = await rubricNameOf(ds, b.rubricId);
    const onlyA = await seedRuleOnly(ds, a.teacherId, 'chi_a');
    const onlyB = await seedRuleOnly(ds, a.teacherId, 'chi_b');
    const idA = await seedAssignment(ds, a.teacherId, nameA, onlyA.ruleId, 'tinh_dung');
    const idB = await seedAssignment(ds, a.teacherId, nameB, onlyB.ruleId, 'tinh_dung');
    await seedAssignmentPrices(ds, a.teacherId, { [idA]: '1.00', [idB]: '2.00' });
    const price = (await currentPriceVersion(ds.manager, a.teacherId))!;
    expect((await loadRuleSnapshots(ds.manager, a.teacherId, nameA, price.id)).map((r) => r.ruleKey)).toEqual(['chi_a']);
    expect((await loadRuleSnapshots(ds.manager, a.teacherId, nameB, price.id)).map((r) => r.ruleKey)).toEqual(['chi_b']);
  });

  it('T-RBE-SCORE-2: cùng một lỗi trừ 1,00 ở A và 2,00 ở B → hai bài cùng vi phạm cho hai điểm khác nhau', async () => {
    const w = await twoRubrics('sc2');
    await seedAssignmentPrices(ds, w.teacherId, { [w.chungA]: '1.00', [w.chungB]: '2.00', [w.tenA]: '0.50', [w.tenB]: '0.50' });
    const ra = await graded(w.a);
    const rb = await graded(w.b);
    expect(await scoreOf(ra)).toBe('9.00');
    expect(await scoreOf(rb)).toBe('8.00');
  });

  it('T-RBE-SCORE-3: tiêu chí bị xoá khỏi bản rubric mới → bài theo bản mới có mismatchedRules, bài ghim bản cũ thì không', async () => {
    const w = await twoRubrics('sc3');
    // Bản 2 của rubric A chỉ còn `trinh_bay`: dòng áp dụng của `chung` (tinh_dung) trở thành mồ côi ở bản mới.
    const [v2] = await ds.query(`INSERT INTO examcollect.rubric (version, teacher_id, name) VALUES (2, $1, $2) RETURNING id`, [w.teacherId, w.nameA]);
    await seedCriterion(ds, v2.id, 'trinh_bay', 4);
    const onV1 = await graded(w.a);
    const onV2 = await graded({ ...w.a, rubricId: v2.id });
    const mismatched = async (id: string) => (await latestComputationRow(ds.manager, id))!.breakdown.mismatchedRules.map((m) => m.ruleKey);
    expect(await mismatched(onV1)).toEqual([]);
    expect(await mismatched(onV2)).toEqual(['chung']);
  });

  it('T-RBE-SCORE-4: loadRuleEntries chỉ trả lỗi của rubric của bài; cờ priced theo giá của DÒNG ÁP DỤNG đó', async () => {
    const w = await twoRubrics('sc4');
    await seedAssignmentPrices(ds, w.teacherId, { [w.chungA]: '1.00', [w.tenA]: null, [w.chungB]: '2.00', [w.tenB]: '0.50' });
    const forA = await loadRuleEntries(ds.manager, w.teacherId, w.nameA);
    expect(forA.entries.map((e) => [e.ruleKey, e.priced])).toEqual([['chung', true], ['ten_bien', false]]);
    const forB = await loadRuleEntries(ds.manager, w.teacherId, w.nameB);
    expect(forB.entries.map((e) => [e.ruleKey, e.priced])).toEqual([['chung', true], ['ten_bien', true]]);
    const only = await seedRuleOnly(ds, w.teacherId, 'chi_o_b');
    await seedAssignment(ds, w.teacherId, w.nameB, only.ruleId, 'tinh_dung');
    expect((await loadRuleEntries(ds.manager, w.teacherId, w.nameA)).entries.map((e) => e.ruleKey)).not.toContain('chi_o_b');
  });

  it('T-RBE-MIG-2: sau backfill, loader mới = loader cũ (lọc theo tiêu chí của phiên bản) trên mọi phiên bản rubric, và cùng điểm', async () => {
    const a = await seedSession(ds, 'mig2');
    await seedInvestigatorSession(ds, a);
    const nameA = await rubricNameOf(ds, a.rubricId);
    const [v2] = await ds.query(`INSERT INTO examcollect.rubric (version, teacher_id, name) VALUES (2, $1, $2) RETURNING id`, [a.teacherId, nameA]);
    await seedCriterion(ds, v2.id, 'tinh_dung', 6);
    await seedCriterion(ds, v2.id, 'hieu_nang', 4);
    // Mô hình CŨ bằng SQL thô: hai luật có giá, một luật ở tiêu chí chỉ có ở bản 2, một luật không khớp rubric nào.
    const legacy: Record<string, string> = {};
    for (const [key, crit, dedu] of [['x', 'tinh_dung', '1.00'], ['y', 'trinh_bay', '2.00'], ['z', 'hieu_nang', '0.25'], ['w', 'khong_co', '9.00']]) {
      const [r] = await ds.query(`INSERT INTO examcollect.error_rule (teacher_id, rule_key, origin, state) VALUES ($1, $2, 'teacher', 'active') RETURNING id`, [a.teacherId, key]);
      const [v] = await ds.query(
        `INSERT INTO examcollect.error_rule_revision (error_rule_id, revision, name, description, criterion_key, created_by) VALUES ($1, 1, $2, $2, $3, $4) RETURNING id`,
        [r.id, key, crit, a.teacherId],
      );
      await ds.query(`UPDATE examcollect.error_rule SET current_revision_id = $2 WHERE id = $1`, [r.id, v.id]);
      legacy[r.id] = dedu;
    }
    const [pv] = await ds.query(`INSERT INTO examcollect.price_table_version (teacher_id, version, created_by) VALUES ($1, 1, $1) RETURNING id`, [a.teacherId]);
    for (const [ruleId, dedu] of Object.entries(legacy)) {
      await ds.query(`INSERT INTO examcollect.rule_price (price_table_version_id, error_rule_id, teacher_id, deduction) VALUES ($1, $2, $3, $4)`, [pv.id, ruleId, a.teacherId, dedu]);
    }
    await ds.query(BACKFILL_ASSIGNMENTS_SQL, [a.teacherId]);
    await ds.query(BACKFILL_PRICES_SQL, [a.teacherId]);

    for (const rubricId of [a.rubricId, v2.id as string]) {
      const keys = new Set((await ds.query(`SELECT key FROM examcollect.rubric_criterion WHERE rubric_id = $1`, [rubricId])).map((r: { key: string }) => r.key));
      const oldRows = await ds.query(
        `SELECT r.rule_key, v.criterion_key, p.deduction FROM examcollect.error_rule r
           JOIN examcollect.error_rule_revision v ON v.id = r.current_revision_id
           LEFT JOIN examcollect.rule_price p ON p.error_rule_id = r.id AND p.price_table_version_id = $2
          WHERE r.teacher_id = $1 AND r.state = 'active' ORDER BY r.rule_key`,
        [a.teacherId, pv.id],
      );
      const oldView = oldRows
        .filter((r: { criterion_key: string }) => keys.has(r.criterion_key))
        .map((r: { rule_key: string; criterion_key: string; deduction: string | null }) => [r.rule_key, r.criterion_key, r.deduction === null ? null : Number(r.deduction) * 100]);
      const fresh = await loadRuleSnapshots(ds.manager, a.teacherId, nameA, pv.id);
      const newView = fresh.filter((r) => keys.has(r.criterionKey)).map((r) => [r.ruleKey, r.criterionKey, r.deductionHundredths]);
      expect(newView).toEqual(oldView);
    }
    // Cùng điểm trên cùng hồ sơ (lõi không biết luật đến từ đâu).
    const fresh = await loadRuleSnapshots(ds.manager, a.teacherId, nameA, pv.id);
    const out = computeScore({
      stored: storedWith([{ ruleKey: 'x', checkedBy: 'model' }], ['x']),
      bundleCases: [], rubric: [{ key: 'tinh_dung', maxHundredths: 600 }, { key: 'trinh_bay', maxHundredths: 400 }],
      rules: fresh, sessionModelRules: new Set(['x']), waivedCriteria: [], exceptions: new Map(), theta: 0.85,
    });
    expect(out.scoreHundredths).toBe(1000 - 100);
  });

  it('T-RBE-PRICE-1: đổi điểm trừ ở rubric A không đổi điểm trừ ở B; chỉ bài của A được tính lại', async () => {
    const w = await twoRubrics('pr1');
    const ra = await graded(w.a);
    const rb = await graded(w.b);
    await prices.setPrice(w.teacherId, w.chungA, '3.00', w.teacherId);
    expect(await scoreOf(ra)).toBe('7.00');
    expect(await scoreOf(rb)).toBe('9.00');
    const reasons = (await ds.query(`SELECT reason FROM examcollect.score_computation WHERE grading_result_id = $1 ORDER BY created_at`, [rb])).map((r: { reason: string }) => r.reason);
    expect(reasons).toEqual(['initial']); // B không bị tính lại
    const price = (await currentPriceVersion(ds.manager, w.teacherId))!;
    const rows = await ds.query(`SELECT rubric_error_id, deduction FROM examcollect.rubric_error_price WHERE price_table_version_id = $1`, [price.id]);
    expect(Object.fromEntries(rows.map((r: { rubric_error_id: string; deduction: string }) => [r.rubric_error_id, r.deduction]))).toEqual({
      [w.chungA]: '3.00', [w.chungB]: '1.00', [w.tenA]: '0.50', [w.tenB]: '0.50',
    });
  });

  it('T-RBE-PRICE-2: phiên bản giá mới chép đủ mọi dòng, kể cả dòng NULL tường minh; đặt null hợp lệ', async () => {
    const w = await twoRubrics('pr2');
    await seedAssignmentPrices(ds, w.teacherId, { [w.chungA]: '1.00', [w.chungB]: '1.00', [w.tenA]: '0.50', [w.tenB]: null });
    await prices.setPrice(w.teacherId, w.chungA, null, w.teacherId);
    const price = (await currentPriceVersion(ds.manager, w.teacherId))!;
    const rows = await ds.query(`SELECT rubric_error_id, deduction FROM examcollect.rubric_error_price WHERE price_table_version_id = $1`, [price.id]);
    expect(rows).toHaveLength(4);
    expect(Object.fromEntries(rows.map((r: { rubric_error_id: string; deduction: string | null }) => [r.rubric_error_id, r.deduction]))).toEqual({
      [w.chungA]: null, [w.chungB]: '1.00', [w.tenA]: '0.50', [w.tenB]: null,
    });
  });

  it('T-RBE-PRICE-3: xem trước đếm đúng phiên đang chấm / đã chốt CỦA RUBRIC ĐÓ', async () => {
    const w = await twoRubrics('pr3');
    for (const ctx of [w.a, w.a, w.b]) await graded(ctx);
    const [{ n: before }] = await ds.query(`SELECT count(*)::int AS n FROM examcollect.score_computation`);
    const p = await prices.preview(w.teacherId, w.chungA, '2.00');
    expect(p.openSessions).toEqual([{ sessionId: w.a.sessionId, name: expect.any(String), affected: 2, autoAfter: 2, blockedByOtherUnpriced: 0 }]);
    expect(p.finalizedSessions).toEqual([]);
    const [{ n: after }] = await ds.query(`SELECT count(*)::int AS n FROM examcollect.score_computation`);
    expect(after).toBe(before);
  });

  it('T-RBE-PRICE-4: phiên đã chốt của A giữ giá đã ghim; giá đổi ở B không đụng "áp giá mới" của A', async () => {
    const w = await twoRubrics('pr4');
    const ra = await graded(w.a);
    await app.get(TeacherReviewService).finalizeGrades(w.a.sessionId, w.teacherId);
    await prices.setPrice(w.teacherId, w.chungB, '5.00', w.teacherId);
    expect(await scoreOf(ra)).toBe('9.00');
    expect(await scores.previewReapply(w.a.sessionId, w.teacherId)).toEqual({ changes: [], skipped: [] });
    await prices.setPrice(w.teacherId, w.chungA, '2.00', w.teacherId);
    const plan = await scores.previewReapply(w.a.sessionId, w.teacherId);
    expect(plan.changes.map((c) => [c.oldScore, c.newScore])).toEqual([['9.00', '8.00']]);
  });

  it('T-RBE-PRICE-5: giảng viên khác không ghi/xem được dòng áp dụng của người khác (404)', async () => {
    const w = await twoRubrics('pr5');
    const other = await seedSession(ds, 'pr5-other');
    await expect(prices.setPrice(other.teacherId, w.chungA, '1.00', other.teacherId)).rejects.toThrow(/Không tìm thấy lỗi trong rubric/);
    await expect(prices.preview(other.teacherId, w.chungA, '1.00')).rejects.toThrow(/Không tìm thấy lỗi trong rubric/);
  });
});
```

Run: `npx jest --config ./test/jest-e2e.json --runInBand rubric-scoped-pricing` → Expected FAIL (signatures: `loadRuleSnapshots` takes 3 args, `loadRuleEntries` takes 2, `prices.setPrice` takes a rule id, `seedRule` writes the old tables).

- [ ] **Step 2: `price-version.ts` and the minimal `RubricErrorService`**

`apps/api/src/grading/rules/price-version.ts`:

```ts
import { EntityManager } from 'typeorm';

/**
 * Một `price_table_version` MỚI của giảng viên, chép nguyên bảng giá phiên bản trước (§2.2) rồi ghi các
 * dòng đổi. Người gọi đã khoá giảng viên và đã kiểm mọi `rubricErrorId` thuộc giảng viên.
 * Dòng chưa từng có giá thì không có dòng (NULL tường minh chỉ ghi khi người gọi truyền `deduction: null`).
 */
export async function writeNextPriceVersion(
  m: EntityManager,
  teacherId: string,
  actorId: string,
  changes: { rubricErrorId: string; deduction: string | null }[],
): Promise<string> {
  const [{ next }] = await m.query(
    `SELECT COALESCE(MAX(version), 0) + 1 AS next FROM examcollect.price_table_version WHERE teacher_id = $1`,
    [teacherId],
  );
  const [v] = await m.query(
    `INSERT INTO examcollect.price_table_version (teacher_id, version, created_by) VALUES ($1, $2, $3) RETURNING id`,
    [teacherId, next, actorId],
  );
  await m.query(
    `INSERT INTO examcollect.rubric_error_price (price_table_version_id, rubric_error_id, teacher_id, deduction)
     SELECT $1, p.rubric_error_id, p.teacher_id, p.deduction
       FROM examcollect.rubric_error_price p
       JOIN examcollect.price_table_version pv ON pv.id = p.price_table_version_id
      WHERE pv.teacher_id = $2 AND pv.version = $3 AND NOT (p.rubric_error_id = ANY($4::uuid[]))`,
    [v.id, teacherId, next - 1, changes.map((c) => c.rubricErrorId)],
  );
  for (const c of changes) {
    await m.query(
      `INSERT INTO examcollect.rubric_error_price (price_table_version_id, rubric_error_id, teacher_id, deduction) VALUES ($1, $2, $3, $4)`,
      [v.id, c.rubricErrorId, teacherId, c.deduction],
    );
  }
  return v.id as string;
}
```

`apps/api/src/grading/rules/rubric-error.service.ts` (A2 version — `owned` only):

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';

export interface OwnedAssignment {
  id: string;
  teacherId: string;
  rubricName: string;
  errorRuleId: string;
  criterionKey: string;
}

/** Dòng áp dụng của một lỗi trong một rubric (spec §2). Mở rộng ở Task A3. */
@Injectable()
export class RubricErrorService {
  constructor(@InjectDataSource() protected readonly ds: DataSource) {}

  /** Dòng áp dụng CHƯA GỠ của đúng giảng viên này; không thì 404 — không lộ dòng của người khác (T-POL-8). */
  async owned(m: EntityManager, teacherId: string, rubricErrorId: string): Promise<OwnedAssignment> {
    const [row] = await m.query(
      `SELECT id, teacher_id, rubric_name, error_rule_id, criterion_key
         FROM examcollect.rubric_error WHERE id = $1 AND teacher_id = $2 AND removed_at IS NULL`,
      [rubricErrorId, teacherId],
    );
    if (!row) throw new NotFoundException('Không tìm thấy lỗi trong rubric');
    return { id: row.id, teacherId: row.teacher_id, rubricName: row.rubric_name, errorRuleId: row.error_rule_id, criterionKey: row.criterion_key };
  }
}
```

Register `RubricErrorService` in `grading.module.ts` `providers` (next to `PriceService`).

- [ ] **Step 3: Scoring read path**

`score-inputs.ts`:

1. `ScoreContext` gets `rubricName: string;` (next to `rubricId`).
2. `loadScoreContext` first query: add `rb.name AS rubric_name` and the join. Replace

```ts
            a.outcome AS attempt_outcome, a.investigation
       FROM examcollect.grading_result g
       JOIN examcollect.submission s ON s.id = g.submission_id
       JOIN examcollect.exam_session es ON es.id = s.exam_session_id
       LEFT JOIN examcollect.grading_attempt a ON a.id = g.current_attempt_id
```
with
```ts
            rb.name AS rubric_name, a.outcome AS attempt_outcome, a.investigation
       FROM examcollect.grading_result g
       JOIN examcollect.submission s ON s.id = g.submission_id
       JOIN examcollect.exam_session es ON es.id = s.exam_session_id
       JOIN examcollect.rubric rb ON rb.id = g.rubric_id_version
       LEFT JOIN examcollect.grading_attempt a ON a.id = g.current_attempt_id
```
and in the returned object add `rubricName: row.rubric_name,` after `rubricId: row.rubric_id_version,`.

3. Replace `loadRuleSnapshots` entirely:

```ts
/**
 * Lỗi ĐANG DÙNG trong MỘT rubric (theo tên, mọi phiên bản), giá ở `priceVersionId` (null = chưa có bảng giá:
 * mọi lỗi chưa giá). Kiểu trả về giữ nguyên `RuleSnapshot` — lõi tính điểm không biết lỗi đến từ đâu.
 */
export async function loadRuleSnapshots(
  m: EntityManager,
  teacherId: string,
  rubricName: string,
  priceVersionId: string | null,
): Promise<RuleSnapshot[]> {
  const rows: {
    rule_id: string;
    revision_id: string;
    rule_key: string;
    criterion_key: string;
    predicate: RulePredicate | null;
    deduction: string | null;
  }[] = await m.query(
    `SELECT r.id AS rule_id, v.id AS revision_id, r.rule_key, re.criterion_key, v.predicate, p.deduction
       FROM examcollect.rubric_error re
       JOIN examcollect.error_rule r ON r.id = re.error_rule_id
       JOIN examcollect.error_rule_revision v ON v.id = r.current_revision_id
       LEFT JOIN examcollect.rubric_error_price p ON p.rubric_error_id = re.id AND p.price_table_version_id = $3
      WHERE re.teacher_id = $1 AND re.rubric_name = $2 AND re.removed_at IS NULL AND r.state = 'active'
      ORDER BY r.rule_key`,
    [teacherId, rubricName, priceVersionId],
  );
  return rows.map((r) => ({
    ruleId: r.rule_id,
    revisionId: r.revision_id,
    ruleKey: r.rule_key,
    criterionKey: r.criterion_key,
    predicate: r.predicate,
    deductionHundredths: r.deduction === null ? null : parseHundredths(r.deduction),
  }));
}
```

`score.service.ts` `compute()`: change `const rules = await loadRuleSnapshots(m, ctx.teacherId, price?.id ?? null);` to `const rules = await loadRuleSnapshots(m, ctx.teacherId, ctx.rubricName, price?.id ?? null);`.

`pipeline/rule-entries.ts`: replace the function signature and query:

```ts
export async function loadRuleEntries(
  m: EntityManager,
  teacherId: string,
  rubricName: string,
): Promise<{ entries: RuleEntry[]; ruleTable: StoredInvestigation['ruleTable'] }> {
  const rows: { rule_key: string; name: string; criterion_key: string; predicate: RulePredicate | null; priced: boolean }[] =
    await m.query(
      `SELECT r.rule_key, v.name, re.criterion_key, v.predicate, (p.deduction IS NOT NULL) AS priced
         FROM examcollect.rubric_error re
         JOIN examcollect.error_rule r ON r.id = re.error_rule_id
         JOIN examcollect.error_rule_revision v ON v.id = r.current_revision_id
         LEFT JOIN examcollect.rubric_error_price p
                ON p.rubric_error_id = re.id
               AND p.price_table_version_id = (
                     SELECT id FROM examcollect.price_table_version
                      WHERE teacher_id = $1 ORDER BY version DESC LIMIT 1)
        WHERE re.teacher_id = $1 AND re.rubric_name = $2 AND re.removed_at IS NULL AND r.state = 'active'
        ORDER BY r.rule_key`,
      [teacherId, rubricName],
    );
```
(the `entries`/`return` below it are unchanged). Update the doc comment: *"Bảng lỗi ĐANG DÙNG của một rubric của giảng viên"*.

`pipeline/investigation-context.service.ts`: in `build()`'s first query add `rb.name AS rubric_name` and `JOIN examcollect.rubric rb ON rb.id = g.rubric_id_version` (after the `required_deliverable` join), and replace
`const { entries, ruleTable } = await loadRuleEntries(this.ds.manager, row.teacher_id);`
with
`const { entries, ruleTable } = await loadRuleEntries(this.ds.manager, row.teacher_id, row.rubric_name);`.

`recomputeForTeacher`: extend the scope type and the SQL:

```ts
    scope: { ruleId?: string; rubricId?: string; rubricName?: string; sessionId?: string; exceptResultId?: string } = {},
```
In the query add after the `$5` line:
```sql
          AND ($6::text IS NULL OR g.rubric_id_version IN (
                SELECT id FROM examcollect.rubric WHERE teacher_id = $1 AND name = $6))
```
and pass `scope.rubricName ?? null` as the sixth parameter (`[teacherId, scope.rubricId ?? null, scope.ruleId ?? null, scope.sessionId ?? null, scope.exceptResultId ?? null, scope.rubricName ?? null]`). Update the doc comment: *`rubricName` → chỉ bài của mọi phiên bản rubric mang tên đó.*

- [ ] **Step 4: Price write path**

Replace `price.service.ts` entirely:

```ts
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { parseHundredths } from '../scoring/hundredths';
import { lockTeacherScoring } from '../scoring/score-inputs';
import { RecomputeSummary, ScoreService } from '../scoring/score.service';
import { writeNextPriceVersion } from './price-version';
import { RubricErrorService } from './rubric-error.service';

/** Khối *"Lưu thì điều gì xảy ra"* của spec UI 3.1. */
export interface PricePreview {
  openSessions: { sessionId: string; name: string; affected: number; autoAfter: number; blockedByOtherUnpriced: number }[];
  /** Phiên đã chốt KHÔNG đổi theo (bảng giá ghim lúc chốt, §2.2) — chỉ "áp giá mới cho phiên đã chốt" mới đổi. */
  finalizedSessions: { sessionId: string; name: string; affected: number }[];
}

@Injectable()
export class PriceService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly assignments: RubricErrorService,
    private readonly scores: ScoreService,
  ) {}

  /**
   * Điểm trừ của MỘT dòng áp dụng (lỗi trong một rubric). Một phiên bản bảng giá MỚI, chép cả bảng (§2.2)
   * — dòng của rubric khác đi nguyên theo. Tính lại các bài chưa chốt của ĐÚNG rubric đó, cùng transaction.
   */
  async setPrice(
    teacherId: string,
    rubricErrorId: string,
    deduction: string | null,
    actorId: string,
  ): Promise<{ versionId: string; recompute: RecomputeSummary }> {
    return this.ds.transaction(async (m) => {
      await lockTeacherScoring(m, teacherId);
      const assignment = await this.assignments.owned(m, teacherId, rubricErrorId);
      const versionId = await writeNextPriceVersion(m, teacherId, actorId, [{ rubricErrorId, deduction }]);
      const recompute = await this.scores.recomputeForTeacher(m, teacherId, 'price_change', actorId, {
        rubricName: assignment.rubricName,
        ruleId: assignment.errorRuleId,
      });
      return { versionId, recompute };
    });
  }

  /** Xem trước một giá — KHÔNG ghi gì (T-POL-5). Chỉ bài của rubric đó; bài chấm tay không tính. */
  async preview(teacherId: string, rubricErrorId: string, deduction: string | null): Promise<PricePreview> {
    const assignment = await this.assignments.owned(this.ds.manager, teacherId, rubricErrorId);
    const hundredths = deduction === null ? null : parseHundredths(deduction);
    const rows: { result_id: string; session_id: string; name: string; status: string }[] = await this.ds.query(
      `SELECT g.id AS result_id, es.id AS session_id, es.name, g.status
         FROM examcollect.grading_result g
         JOIN examcollect.submission s ON s.id = g.submission_id
         JOIN examcollect.exam_session es ON es.id = s.exam_session_id
        WHERE es.teacher_id = $1 AND g.pipeline = 'investigator'
          AND g.rubric_id_version IN (SELECT id FROM examcollect.rubric WHERE teacher_id = $1 AND name = $3)
          AND NOT EXISTS (SELECT 1 FROM examcollect.teacher_review t
                           WHERE t.grading_result_id = g.id AND t.kind = 'manual_score')
          AND EXISTS (SELECT 1 FROM (SELECT c.breakdown FROM examcollect.score_computation c
                                      WHERE c.grading_result_id = g.id ORDER BY c.created_at DESC, c.id DESC LIMIT 1) last
                       WHERE last.breakdown -> 'errors' @> jsonb_build_array(jsonb_build_object('ruleId', $2::text)))
        ORDER BY es.name, g.id`,
      [teacherId, assignment.errorRuleId, assignment.rubricName],
    );
    const open = new Map<string, PricePreview['openSessions'][number]>();
    const closed = new Map<string, PricePreview['finalizedSessions'][number]>();
    for (const r of rows) {
      if (r.status === 'finalized' || r.status === 'exported') {
        const s = closed.get(r.session_id) ?? { sessionId: r.session_id, name: r.name, affected: 0 };
        s.affected++;
        closed.set(r.session_id, s);
        continue;
      }
      const s = open.get(r.session_id) ?? { sessionId: r.session_id, name: r.name, affected: 0, autoAfter: 0, blockedByOtherUnpriced: 0 };
      s.affected++;
      const out = await this.scores.preview(r.result_id, (rules) =>
        rules.map((x) => (x.ruleId === assignment.errorRuleId ? { ...x, deductionHundredths: hundredths } : x)),
      );
      if (out.outcome === 'auto') s.autoAfter++;
      else if (out.breakdown.errorFlags.some((f) => f.code === 'unpriced')) s.blockedByOtherUnpriced++;
      open.set(r.session_id, s);
    }
    return { openSessions: [...open.values()], finalizedSessions: [...closed.values()] };
  }
}
```

`score.service.ts` `planReapply`: replace

```ts
    const priceRows: { error_rule_id: string; deduction: string | null }[] = price
      ? await m.query(`SELECT error_rule_id, deduction FROM examcollect.rule_price WHERE price_table_version_id = $1`, [price.id])
      : [];
```
with

```ts
    // Giá của riêng rubric của phiên này (§3.4 spec rules-by-rubric): bảng giá chứa dòng của mọi rubric.
    const priceRows: { error_rule_id: string; deduction: string | null }[] = price
      ? await m.query(
          `SELECT re.error_rule_id, p.deduction
             FROM examcollect.exam_session es
             JOIN examcollect.rubric rb ON rb.id = es.rubric_id
             JOIN examcollect.rubric_error re ON re.teacher_id = es.teacher_id AND re.rubric_name = rb.name AND re.removed_at IS NULL
             JOIN examcollect.rubric_error_price p ON p.rubric_error_id = re.id AND p.price_table_version_id = $2
            WHERE es.id = $1`,
          [sessionId, price.id],
        )
      : [];
```

`rules.controller.ts`: delete the two price routes (`POST rules/:id/price/preview` and `PUT rules/:id/price`), their `PriceBodyDto`/`parseDeduction` imports if now unused, and the `private readonly prices: PriceService` constructor parameter + import (new price routes arrive in Task A9).

- [ ] **Step 5: Flip the shared test helpers**

In `apps/api/test/helpers/investigator-seed.ts` replace the existing `seedRule` and `seedPrices` bodies (keep names and signatures):

```ts
/**
 * Luật + dòng áp dụng ở MỌI rubric của giảng viên đang có tiêu chí `criterionKey` (gọi SAU khi tiêu chí đã
 * có — `seedInvestigatorSession` trước). Trùng hành vi cũ: "luật áp cho rubric nào có khoá đó".
 */
export async function seedRule(
  ds: DataSource,
  teacherId: string,
  ruleKey: string,
  criterionKey: string,
  predicate: object | null = null,
): Promise<{ ruleId: string; revisionId: string }> {
  const rule = await seedRuleOnly(ds, teacherId, ruleKey, predicate);
  await ds.query(
    `INSERT INTO examcollect.rubric_error (teacher_id, rubric_name, error_rule_id, criterion_key)
     SELECT DISTINCT $1::uuid, rb.name, $2::uuid, $3::text
       FROM examcollect.rubric rb
       JOIN examcollect.rubric_criterion rc ON rc.rubric_id = rb.id AND rc.key = $3
      WHERE rb.teacher_id = $1
     ON CONFLICT (teacher_id, rubric_name, error_rule_id) DO NOTHING`,
    [teacherId, rule.ruleId, criterionKey],
  );
  return rule;
}

/** Phiên bản bảng giá mới: mỗi luật nhận giá đã cho ở MỌI dòng áp dụng đang dùng của nó (luật không có = chưa giá). */
export async function seedPrices(ds: DataSource, teacherId: string, prices: Record<string, string | null>): Promise<string> {
  const [{ next }] = await ds.query(
    `SELECT COALESCE(MAX(version), 0) + 1 AS next FROM examcollect.price_table_version WHERE teacher_id = $1`,
    [teacherId],
  );
  const [v] = await ds.query(
    `INSERT INTO examcollect.price_table_version (teacher_id, version, created_by) VALUES ($1, $2, $1) RETURNING id`,
    [teacherId, next],
  );
  for (const [ruleId, deduction] of Object.entries(prices)) {
    await ds.query(
      `INSERT INTO examcollect.rubric_error_price (price_table_version_id, rubric_error_id, teacher_id, deduction)
       SELECT $1, re.id, $3, $4 FROM examcollect.rubric_error re
        WHERE re.error_rule_id = $2 AND re.teacher_id = $3 AND re.removed_at IS NULL`,
      [v.id, ruleId, teacherId, deduction],
    );
  }
  return v.id as string;
}
```

- [ ] **Step 6: Update the directly affected existing tests**

1. `rule-entries.e2e-spec.ts` — replace the file body with rubric-scoped versions of the same two tests:

```ts
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { loadRuleEntries } from '../src/grading/pipeline/rule-entries';
import { seedSession } from './helpers/grading-seed';
import { rubricNameOf, seedInvestigatorSession, seedPrices, seedRule, seedRuleOnly } from './helpers/investigator-seed';

/** Bảng lỗi đang dùng của MỘT rubric → `bang-loi.md` của cuộc điều tra và `ruleTable` của hồ sơ (§2.1, 3c I1). */
describe('loadRuleEntries (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    ds = app.get(DataSource);
  });
  afterAll(async () => app.close());

  it('chỉ luật active của đúng giảng viên VÀ đúng rubric, kèm tên bản sửa, có giá hay chưa, ai kiểm', async () => {
    const a = await seedSession(ds, 're-a');
    await seedInvestigatorSession(ds, a);
    const b = await seedSession(ds, 're-b');
    await seedInvestigatorSession(ds, b);
    const nameA = await rubricNameOf(ds, a.rubricId);
    const bien = await seedRule(ds, a.teacherId, 'sai_bien', 'tinh_dung', { kind: 'test_group_failed', group: 'bien' });
    const ten = await seedRule(ds, a.teacherId, 'ten_bien', 'trinh_bay');
    await seedRuleOnly(ds, a.teacherId, 'de_xuat_x', null, 'proposed');
    const retired = await seedRule(ds, a.teacherId, 'cu', 'trinh_bay');
    await ds.query(`UPDATE examcollect.error_rule SET state = 'retired' WHERE id = $1`, [retired.ruleId]);
    await seedRule(ds, b.teacherId, 'cua_nguoi_khac', 'tinh_dung');
    await seedPrices(ds, a.teacherId, { [bien.ruleId]: '1.50', [ten.ruleId]: null });

    const { entries, ruleTable } = await loadRuleEntries(ds.manager, a.teacherId, nameA);
    expect(entries).toEqual([
      { ruleKey: 'sai_bien', title: 'sai_bien', criterionKey: 'tinh_dung', priced: true, checkedBy: 'machine', machineNote: 'nhóm test bien' },
      { ruleKey: 'ten_bien', title: 'ten_bien', criterionKey: 'trinh_bay', priced: false, checkedBy: 'model', machineNote: null },
    ]);
    expect(ruleTable).toEqual([
      { ruleKey: 'sai_bien', checkedBy: 'machine' },
      { ruleKey: 'ten_bien', checkedBy: 'model' },
    ]);
  });

  it('giảng viên chưa có bảng giá nào → mọi luật chưa có giá', async () => {
    const t = await seedSession(ds, 're-noprice');
    await seedInvestigatorSession(ds, t);
    await seedRule(ds, t.teacherId, 'mot_luat', 'tinh_dung');
    const { entries } = await loadRuleEntries(ds.manager, t.teacherId, await rubricNameOf(ds, t.rubricId));
    expect(entries.map((e) => e.priced)).toEqual([false]);
  });
});
```

2. `score-service.e2e-spec.ts` — in the two tests that use a `runner` (`review C1`, `lượt tính đầu CHỜ…`), look up the application ids first and swap the raw price inserts. Add after `const { ctx, bien, ten } = await world(...)` in each of those two tests:

```ts
    const name = await rubricNameOf(ds, ctx.rubricId);
    const aBien = await assignmentId(ds, ctx.teacherId, name, bien.ruleId);
    const aTen = await assignmentId(ds, ctx.teacherId, name, ten.ruleId);
```
and replace each block

```ts
      await runner.query(
        `INSERT INTO examcollect.rule_price (price_table_version_id, error_rule_id, teacher_id, deduction)
         VALUES ($1, $2, $4, '3.00'), ($1, $3, $4, '0.50')`,
        [v.id, bien.ruleId, ten.ruleId, ctx.teacherId],
      );
```
with
```ts
      await runner.query(
        `INSERT INTO examcollect.rubric_error_price (price_table_version_id, rubric_error_id, teacher_id, deduction)
         VALUES ($1, $2, $4, '3.00'), ($1, $3, $4, '0.50')`,
        [v.id, aBien, aTen, ctx.teacherId],
      );
```
(extend the helper import with `assignmentId, rubricNameOf`). The `recomputeForTeacher(..., { ruleId: bien.ruleId })` call stays.

3. `finalize-investigator.e2e-spec.ts`:
   - extend the helper import with `assignmentId, rubricNameOf` and declare two more suite variables `let aBien: string; let bBien: string;`; at the end of `beforeAll` (after `v1 = await seedPrices(...)`) add:
     ```ts
     aBien = await assignmentId(ds, teacherId, await rubricNameOf(ds, A.rubricId), bien.ruleId);
     bBien = await assignmentId(ds, teacherId, await rubricNameOf(ds, B.rubricId), bien.ruleId);
     ```
   - **T-PIN-1** (`sửa giá luật chung → …`): replace `await prices.setPrice(teacherId, bien.ruleId, '2.00', teacherId);` with the two calls
     ```ts
     await prices.setPrice(teacherId, aBien, '2.00', teacherId);
     await prices.setPrice(teacherId, bBien, '2.00', teacherId);
     ```
     and replace the preview block
     ```ts
     const p = await prices.preview(teacherId, bien.ruleId, '2.50');
     expect(p.finalizedSessions).toEqual([{ sessionId: A.sessionId, name: expect.any(String), affected: 2 }]);
     expect(p.openSessions.map((s) => [s.sessionId, s.affected])).toEqual([[B.sessionId, 2]]);
     ```
     with
     ```ts
     const pa = await prices.preview(teacherId, aBien, '2.50');
     expect(pa.finalizedSessions).toEqual([{ sessionId: A.sessionId, name: expect.any(String), affected: 2 }]);
     expect(pa.openSessions).toEqual([]);
     const pb = await prices.preview(teacherId, bBien, '2.50');
     expect(pb.openSessions.map((s) => [s.sessionId, s.affected])).toEqual([[B.sessionId, 2]]);
     expect(pb.finalizedSessions).toEqual([]);
     ```
   - The T-FIN-1 test is unchanged: A's assignment already carries 2,00 from T-PIN-1, which is what "áp giá mới" reads.
   - Describe `Áp giá mới … chỉ giá`: its helper `closedSession` and the three tests use `seedRule` + `seedPrices` only (new `seedRule`/`seedPrices` keep them valid) — no edit.

4. `error-exception.e2e-spec.ts` T-EXC-1: add `const name = await rubricNameOf(ds, ctx.rubricId);` and replace the two calls `prices.setPrice(ctx.teacherId, ten.ruleId, '1.00', ctx.teacherId)` / `prices.setPrice(ctx.teacherId, bien.ruleId, '2.00', ctx.teacherId)` with `prices.setPrice(ctx.teacherId, await assignmentId(ds, ctx.teacherId, name, ten.ruleId), '1.00', ctx.teacherId)` and the `bien` equivalent (import `assignmentId, rubricNameOf`).

5. `rules-prices.e2e-spec.ts` — price-related tests only (the other tests stay red until A5):
   - **T-VER-1:** rename the title suffix, add `const name = await rubricNameOf(ds, ctx.rubricId);`, replace `prices.setPrice(ctx.teacherId, bien.ruleId, …)` / `ten.ruleId` with `assignmentId(...)` of the same rule in `name`, and replace the verification query's `examcollect.rule_price` with `examcollect.rubric_error_price` (the expected `[version, deduction]` rows are unchanged because the helper seeds one application row per rule).
   - **T-POL-5:** `const extra = await seedRule(ds, ctx.teacherId, 'bien_2', 'trinh_bay', {…})` → keep; replace `prices.preview(ctx.teacherId, extra.ruleId, '0.25')` with `prices.preview(ctx.teacherId, await assignmentId(ds, ctx.teacherId, await rubricNameOf(ds, ctx.rubricId), extra.ruleId), '0.25')`.
   - **T-POL-8:** replace the three `.rejects.toThrow(/Không tìm thấy luật/)` price/preview expectations by `assignmentId`-based calls with message `/Không tìm thấy lỗi trong rubric/` (the `rules.revise` expectation keeps `/Không tìm thấy luật/`).

6. `rules-routes.e2e-spec.ts`: delete the whole test `xem trước giá không sinh phiên bản; lưu giá sinh đúng một; …` (its routes are gone; the same coverage returns in Task A9).

- [ ] **Step 7: Run, fix, commit**

```powershell
cd apps\api
pnpm exec tsc --noEmit -p tsconfig.json
pnpm exec eslint src/grading src/database
npx jest --config ./test/jest-e2e.json --runInBand rubric-scoped-pricing rule-entries score-service finalize-investigator error-exception criterion-waiver score-inputs result-detail grading-results-current-score investigator-end-to-end investigation-context
```
Expected: all PASS. If a suite fails with "luật không áp" symptoms, the cause is almost always `seedRule` called **before** the criteria exist (Review Focus 1) — reorder the seeding in that test.

Then run the whole e2e once and compare with the A0 baseline: the only red files must be exactly the ledger's A2 row (`rules-prices` three tests, `rules-routes` first tests).

```bash
git add apps/api
git commit -m "feat(rules): cut scoring reads and price writes over to rubric applications"
```

---

## Task A3: `RubricErrorService` — list, assign (three paths), move, remove

**Files:**
- Create: `apps/api/src/grading/rules/rule-key.ts`, `rule-key.spec.ts`
- Modify: `apps/api/src/grading/rules/rule-input.ts`, `rule-input.spec.ts`, `rubric-error.service.ts` (extend)
- Test: `apps/api/test/rubric-errors-service.e2e-spec.ts`

**Interfaces — Produces:**
```ts
// rule-input.ts
export interface NewRuleInput { name: string; description: string; predicate: RulePredicate | null; ruleKey?: string }
export type RuleChanges = Partial<Pick<NewRuleInput, 'name' | 'description' | 'predicate'>>;
export interface AssignInput { rubricName: string; criterionKey: string; deduction?: string | null; ruleId?: string; newRule?: NewRuleInput; changes?: RuleChanges }
export function parseNewRule(x: unknown): NewRuleInput;
export function parseRuleChanges(x: unknown): RuleChanges;           // criterionKey no longer accepted
export function parseAssignInput(x: unknown): AssignInput;           // exactly one of ruleId | newRule
// rule-key.ts
export function slugifyRuleKey(name: string): string;
export function uniqueRuleKey(m: EntityManager, teacherId: string, base: string): Promise<string>;
// rubric-error.service.ts
export interface RubricErrorItem { id; ruleId; ruleKey; name; description; predicate; checkedBy; origin; criterionKey; criterionDangling; deduction; appliedTo; alsoIn }
RubricErrorService.list(teacherId, rubricName): Promise<RubricErrorItem[]>
RubricErrorService.assign(teacherId, input: AssignInput, actorId?: string): Promise<{ rubricErrorId: string; ruleId: string; recompute: RecomputeSummary | null }>
RubricErrorService.move(teacherId, rubricErrorId, criterionKey): Promise<{ recompute: RecomputeSummary }>
RubricErrorService.remove(teacherId, rubricErrorId): Promise<{ recompute: RecomputeSummary }>
```

- [ ] **Step 1: Write the failing unit tests (slug + parsers)**

`rule-key.spec.ts`:

```ts
import { slugifyRuleKey } from './rule-key';

describe('slugifyRuleKey', () => {
  it('bỏ dấu tiếng Việt kể cả đ, hạ chữ thường, gạch dưới', () => {
    expect(slugifyRuleKey('Tên biến không nói lên vai trò')).toBe('ten_bien_khong_noi_len_vai_tro');
    expect(slugifyRuleKey('Đệ quy sai')).toBe('de_quy_sai');
  });
  it('tối đa 60 ký tự để còn chỗ cho hậu tố _N, không kết thúc bằng gạch dưới', () => {
    const k = slugifyRuleKey('a'.repeat(200));
    expect(k.length).toBeLessThanOrEqual(60);
    expect(k.endsWith('_')).toBe(false);
  });
  it('chuỗi không còn ký tự nào → loi_moi', () => {
    expect(slugifyRuleKey('???')).toBe('loi_moi');
  });
});
```

Update `rule-input.spec.ts` (existing): remove the `criterionKey` field from `base`, delete the assertion on `parseRuleInput({criterionKey:''})`, rename `parseRuleInput` use to `parseNewRule`, and add:

```ts
import { parseAssignInput, parseNewRule } from './rule-input';

describe('parseAssignInput', () => {
  const NEW = { name: 'Sai ca biên', description: 'd', predicate: null };
  it('đúng một trong ruleId hoặc newRule', () => {
    expect(() => parseAssignInput({ rubricName: 'R', criterionKey: 'a' })).toThrow(/đúng một/);
    expect(() => parseAssignInput({ rubricName: 'R', criterionKey: 'a', ruleId: '00000000-0000-4000-8000-000000000000', newRule: NEW })).toThrow(/đúng một/);
  });
  it('newRule + deduction chuỗi; ruleKey tường minh phải đúng khuôn', () => {
    expect(parseAssignInput({ rubricName: 'R', criterionKey: 'a', deduction: '1.50', newRule: NEW }).deduction).toBe('1.50');
    expect(() => parseAssignInput({ rubricName: 'R', criterionKey: 'a', newRule: { ...NEW, ruleKey: 'Co Dau' } })).toThrow(/ruleKey/);
    expect(() => parseAssignInput({ rubricName: 'R', criterionKey: 'a', deduction: 1.5, newRule: NEW })).toThrow(/mức trừ/);
  });
  it('changes chỉ đi cùng ruleId', () => {
    expect(() => parseAssignInput({ rubricName: 'R', criterionKey: 'a', newRule: NEW, changes: { name: 'x' } })).toThrow(/changes/);
    expect(parseAssignInput({ rubricName: 'R', criterionKey: 'a', ruleId: '00000000-0000-4000-8000-000000000000', changes: { name: 'x' } }).changes).toEqual({ name: 'x' });
  });
  it('parseNewRule không nhận criterionKey (tiêu chí thuộc dòng áp dụng)', () => {
    expect(parseNewRule({ ...NEW, criterionKey: 'a' })).toEqual({ name: 'Sai ca biên', description: 'd', predicate: null });
  });
});
```

Run `npx jest src/grading/rules` → FAIL (`rule-key` module missing; `parseAssignInput` not exported).

- [ ] **Step 2: Implement `rule-key.ts` and the parsers**

`rule-key.ts`:

```ts
import { EntityManager } from 'typeorm';

/** `rule_key` sinh từ tên: bỏ dấu tiếng Việt (kể cả đ), chữ thường, gạch dưới; ≤ 60 ký tự để còn chỗ cho `_N`. */
export function slugifyRuleKey(name: string): string {
  const slug = name
    .replace(/[đĐ]/g, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60)
    .replace(/_+$/g, '');
  return slug === '' ? 'loi_moi' : slug;
}

/** Khoá chưa dùng của giảng viên: `base`, rồi `base_2`, `base_3`… — giảng viên không bao giờ thấy 409 vì khoá họ chưa từng thấy. */
export async function uniqueRuleKey(m: EntityManager, teacherId: string, base: string): Promise<string> {
  for (let n = 1; n < 1000; n++) {
    const candidate = n === 1 ? base : `${base}_${n}`;
    const [hit] = await m.query(`SELECT 1 FROM examcollect.error_rule WHERE teacher_id = $1 AND rule_key = $2`, [teacherId, candidate]);
    if (!hit) return candidate;
  }
  throw new Error('không sinh được khoá luật duy nhất');
}
```

`rule-input.ts`: replace the `RuleInput`/`RuleChanges` types and the three parse functions (keep `parsePredicate`, `parseDeduction`, `text`, `key`, `bad`):

```ts
export interface NewRuleInput {
  name: string;
  description: string;
  predicate: RulePredicate | null;
  /** Chỉ dành cho công cụ (lệnh diễn tập). Giao diện KHÔNG BAO GIỜ gửi nó — server sinh từ tên. */
  ruleKey?: string;
}
export type RuleChanges = Partial<Pick<NewRuleInput, 'name' | 'description' | 'predicate'>>;
export interface AssignInput {
  rubricName: string;
  criterionKey: string;
  deduction?: string | null;
  ruleId?: string;
  newRule?: NewRuleInput;
  /** Chỉ cho lỗi `proposed` được duyệt: sửa rồi kích hoạt. */
  changes?: RuleChanges;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseNewRule(x: unknown): NewRuleInput {
  const o = (x ?? {}) as Record<string, unknown>;
  const out: NewRuleInput = {
    name: text(o.name, 'name', 200),
    description: text(o.description, 'description', 2000),
    predicate: parsePredicate(o.predicate === undefined ? null : o.predicate),
  };
  if (o.ruleKey !== undefined) out.ruleKey = key(o.ruleKey, 'ruleKey');
  return out;
}

export function parseRuleChanges(x: unknown): RuleChanges {
  const o = (x ?? {}) as Record<string, unknown>;
  const out: RuleChanges = {};
  if (o.name !== undefined) out.name = text(o.name, 'name', 200);
  if (o.description !== undefined) out.description = text(o.description, 'description', 2000);
  if (o.predicate !== undefined) out.predicate = parsePredicate(o.predicate);
  return out;
}

export function parseAssignInput(x: unknown): AssignInput {
  const o = (x ?? {}) as Record<string, unknown>;
  const hasRule = o.ruleId !== undefined;
  const hasNew = o.newRule !== undefined;
  if (hasRule === hasNew) bad('Gửi đúng một trong ruleId hoặc newRule');
  if (hasNew && o.changes !== undefined) bad('changes chỉ đi cùng ruleId');
  const out: AssignInput = {
    rubricName: text(o.rubricName, 'rubricName', 200),
    criterionKey: key(o.criterionKey, 'criterionKey'),
  };
  if (o.deduction !== undefined) out.deduction = parseDeduction(o.deduction);
  if (hasRule) {
    if (typeof o.ruleId !== 'string' || !UUID.test(o.ruleId)) bad('ruleId: không phải uuid');
    out.ruleId = o.ruleId as string;
    if (o.changes !== undefined) out.changes = parseRuleChanges(o.changes);
  } else {
    out.newRule = parseNewRule(o.newRule);
  }
  return out;
}
```
Delete `parseRuleInput` and the old `RuleInput` interface (`error-rule.service.ts` is rewritten in Task A5; until then it still imports `RuleInput` — keep a temporary alias line `export type RuleInput = NewRuleInput & { criterionKey: string };` **only** until A5 removes the importer, and mark it `// xoá ở Task A5`).

Run `npx jest src/grading/rules` → PASS.

- [ ] **Step 3: Write the failing service e2e**

`apps/api/test/rubric-errors-service.e2e-spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { BadRequestException, ConflictException, INestApplication, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { currentPriceVersion, latestComputationRow } from '../src/grading/scoring/score-inputs';
import { RubricErrorService } from '../src/grading/rules/rubric-error.service';
import { ScoreService } from '../src/grading/scoring/score.service';
import { seedSession } from './helpers/grading-seed';
import {
  assignmentId, rubricNameOf, seedInvestigatorResult, seedInvestigatorSession, seedRule, seedRuleOnly, storedWith,
} from './helpers/investigator-seed';

const BIEN = { kind: 'test_group_failed' as const, group: 'bien' };

describe('RubricErrorService (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let errors: RubricErrorService;
  let scores: ScoreService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    ds = app.get(DataSource);
    errors = app.get(RubricErrorService);
    scores = app.get(ScoreService);
  });
  afterAll(async () => app.close());

  /** Một giảng viên, hai rubric (hai phiên), mỗi rubric có `tinh_dung` và `trinh_bay`; CHƯA có lỗi nào. */
  async function world(label: string) {
    const a = await seedSession(ds, `${label}-a`);
    await seedInvestigatorSession(ds, a);
    const b = await seedSession(ds, `${label}-b`, { teacherId: a.teacherId, startHoursAgo: 10 });
    await seedInvestigatorSession(ds, b);
    return { a, b, teacherId: a.teacherId, nameA: await rubricNameOf(ds, a.rubricId), nameB: await rubricNameOf(ds, b.rubricId) };
  }
  const priceOf = async (teacherId: string, rubricErrorId: string) => {
    const v = (await currentPriceVersion(ds.manager, teacherId))!;
    const [row] = await ds.query(`SELECT deduction FROM examcollect.rubric_error_price WHERE price_table_version_id = $1 AND rubric_error_id = $2`, [v.id, rubricErrorId]);
    return row?.deduction as string | null | undefined;
  };

  it('T-RBE-API-2a: newRule → luật + bản sửa 1 (criterion NULL) + dòng áp dụng + giá; ruleKey sinh từ tên, trùng thì thêm _2', async () => {
    const w = await world('as-new');
    const out = await errors.assign(w.teacherId, {
      rubricName: w.nameA, criterionKey: 'tinh_dung', deduction: '1.50',
      newRule: { name: 'Sai ca biên', description: 'Nhóm biên không đạt', predicate: BIEN },
    });
    const [rule] = await ds.query(`SELECT rule_key, state, origin FROM examcollect.error_rule WHERE id = $1`, [out.ruleId]);
    expect(rule).toEqual({ rule_key: 'sai_ca_bien', state: 'active', origin: 'teacher' });
    const [rev] = await ds.query(`SELECT revision, criterion_key FROM examcollect.error_rule_revision WHERE error_rule_id = $1`, [out.ruleId]);
    expect(rev).toEqual({ revision: 1, criterion_key: null });
    expect(await priceOf(w.teacherId, out.rubricErrorId)).toBe('1.50');
    expect(out.recompute).toEqual({ recomputed: 0, promoted: 0, demoted: 0, belowFloor: 0 }); // máy kiểm được → có tính lại (chưa có bài)
    const second = await errors.assign(w.teacherId, {
      rubricName: w.nameB, criterionKey: 'tinh_dung', newRule: { name: 'Sai ca biên', description: 'x', predicate: null },
    });
    const [rule2] = await ds.query(`SELECT rule_key FROM examcollect.error_rule WHERE id = $1`, [second.ruleId]);
    expect(rule2.rule_key).toBe('sai_ca_bien_2');
    expect(second.recompute).toBeNull(); // luật bằng lời không áp ngược (T-FAIR-1)
  });

  it('T-RBE-API-2b: ruleKey tường minh đã có → 409; chưa có → dùng đúng khoá đó', async () => {
    const w = await world('as-key');
    await errors.assign(w.teacherId, { rubricName: w.nameA, criterionKey: 'tinh_dung', newRule: { name: 'A', description: 'a', predicate: null, ruleKey: 'khoa_co_dinh' } });
    await expect(
      errors.assign(w.teacherId, { rubricName: w.nameB, criterionKey: 'tinh_dung', newRule: { name: 'B', description: 'b', predicate: null, ruleKey: 'khoa_co_dinh' } }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('T-RBE-API-2c: ruleId trong thư viện → dòng áp dụng thứ hai ở rubric khác, giá RIÊNG; đã có ở rubric đó → 409', async () => {
    const w = await world('as-lib');
    const first = await errors.assign(w.teacherId, { rubricName: w.nameA, criterionKey: 'tinh_dung', deduction: '1.00', newRule: { name: 'Chung', description: 'c', predicate: BIEN } });
    const second = await errors.assign(w.teacherId, { rubricName: w.nameB, criterionKey: 'trinh_bay', deduction: '2.00', ruleId: first.ruleId });
    expect(second.rubricErrorId).not.toBe(first.rubricErrorId);
    expect(await priceOf(w.teacherId, first.rubricErrorId)).toBe('1.00');
    expect(await priceOf(w.teacherId, second.rubricErrorId)).toBe('2.00');
    await expect(errors.assign(w.teacherId, { rubricName: w.nameB, criterionKey: 'tinh_dung', ruleId: first.ruleId })).rejects.toBeInstanceOf(ConflictException);
  });

  it('T-RBE-API-2d: duyệt lỗi proposed kèm changes → bản sửa 2, state active; changes cho lỗi active → 400', async () => {
    const w = await world('as-adopt');
    const proposed = await seedRuleOnly(ds, w.teacherId, 'de_xuat_1', null, 'proposed');
    const out = await errors.assign(w.teacherId, {
      rubricName: w.nameA, criterionKey: 'tinh_dung', deduction: '0.50', ruleId: proposed.ruleId, changes: { name: 'Tên đã sửa' },
    });
    const [rule] = await ds.query(`SELECT state, current_revision_id FROM examcollect.error_rule WHERE id = $1`, [proposed.ruleId]);
    expect(rule.state).toBe('active');
    const [rev] = await ds.query(`SELECT revision, name FROM examcollect.error_rule_revision WHERE id = $1`, [rule.current_revision_id]);
    expect(rev).toEqual({ revision: 2, name: 'Tên đã sửa' });
    expect(out.ruleId).toBe(proposed.ruleId);
    await expect(
      errors.assign(w.teacherId, { rubricName: w.nameB, criterionKey: 'tinh_dung', ruleId: proposed.ruleId, changes: { name: 'x' } }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('T-RBE-DATA-3: rubric không có (của giảng viên này) → 404; tiêu chí không có ở bản mới nhất → 400; lỗi dismissed → 409', async () => {
    const w = await world('as-guard');
    const input = { criterionKey: 'tinh_dung', newRule: { name: 'x', description: 'x', predicate: null } };
    await expect(errors.assign(w.teacherId, { ...input, rubricName: 'Không có rubric này' })).rejects.toBeInstanceOf(NotFoundException);
    await expect(errors.assign(w.teacherId, { ...input, rubricName: w.nameA, criterionKey: 'khong_co' })).rejects.toBeInstanceOf(BadRequestException);
    const dismissed = await seedRuleOnly(ds, w.teacherId, 'da_bo', null, 'active');
    await ds.query(`UPDATE examcollect.error_rule SET state = 'dismissed' WHERE id = $1`, [dismissed.ruleId]);
    await expect(errors.assign(w.teacherId, { rubricName: w.nameA, criterionKey: 'tinh_dung', ruleId: dismissed.ruleId })).rejects.toBeInstanceOf(ConflictException);
    const other = await seedSession(ds, 'as-other');
    await seedInvestigatorSession(ds, other);
    const stranger = await seedRule(ds, other.teacherId, 'cua_nguoi_khac', 'tinh_dung');
    await expect(errors.assign(w.teacherId, { rubricName: w.nameA, criterionKey: 'tinh_dung', ruleId: stranger.ruleId })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('T-RBE-API-2e: gỡ rồi thêm lại → BẬT LẠI cùng dòng (cùng id), tiêu chí mới; dòng cũ của giá còn nguyên', async () => {
    const w = await world('as-readd');
    const first = await errors.assign(w.teacherId, { rubricName: w.nameA, criterionKey: 'tinh_dung', deduction: '1.00', newRule: { name: 'Lỗi X', description: 'x', predicate: null } });
    await errors.remove(w.teacherId, first.rubricErrorId);
    const again = await errors.assign(w.teacherId, { rubricName: w.nameA, criterionKey: 'trinh_bay', ruleId: first.ruleId });
    expect(again.rubricErrorId).toBe(first.rubricErrorId);
    const [row] = await ds.query(`SELECT criterion_key, removed_at FROM examcollect.rubric_error WHERE id = $1`, [first.rubricErrorId]);
    expect(row).toEqual({ criterion_key: 'trinh_bay', removed_at: null });
    expect(await priceOf(w.teacherId, first.rubricErrorId)).toBe('1.00'); // giá cũ vẫn là giá hiện hành của dòng
  });

  it('T-RBE-API-3: gỡ / chuyển tiêu chí chỉ tính lại bài của ĐÚNG rubric; rubric khác không có dòng tính lại mới', async () => {
    const w = await world('as-scope');
    const chung = await seedRule(ds, w.teacherId, 'chung', 'tinh_dung', BIEN);
    const ten = await seedRule(ds, w.teacherId, 'ten_bien', 'trinh_bay');
    const SEEN = [{ ruleKey: 'chung', checkedBy: 'machine' as const }, { ruleKey: 'ten_bien', checkedBy: 'model' as const }];
    await ds.query(`UPDATE examcollect.rubric_error SET updated_at = now() WHERE teacher_id = $1`, [w.teacherId]);
    const { seedPrices } = await import('./helpers/investigator-seed');
    await seedPrices(ds, w.teacherId, { [chung.ruleId]: '1.00', [ten.ruleId]: '0.50' });
    const ra = (await seedInvestigatorResult(ds, w.a, storedWith(SEEN))).resultId;
    const rb = (await seedInvestigatorResult(ds, w.b, storedWith(SEEN))).resultId;
    await scores.computeInitial(ra);
    await scores.computeInitial(rb);
    const countOf = async (id: string) => (await ds.query(`SELECT count(*)::int AS n FROM examcollect.score_computation WHERE grading_result_id = $1`, [id]))[0].n;
    const aChung = await assignmentId(ds, w.teacherId, w.nameA, chung.ruleId);
    const summary = await errors.remove(w.teacherId, aChung);
    expect(summary.recompute.recomputed).toBe(1);
    expect(await countOf(ra)).toBe(2);
    expect(await countOf(rb)).toBe(1);
    expect((await latestComputationRow(ds.manager, ra))!.score).toBe('9.50'); // chỉ còn ten_bien (0,50)... 10 − 0,50
    const bTen = await assignmentId(ds, w.teacherId, w.nameB, ten.ruleId);
    await errors.move(w.teacherId, bTen, 'tinh_dung');
    expect(await countOf(ra)).toBe(2); // A không bị tính lại
    expect(await countOf(rb)).toBe(2);
  });

  it('list: dòng của rubric, appliedTo đếm bài CỦA RUBRIC ĐÓ, alsoIn nêu rubric khác dùng cùng lỗi, criterionDangling', async () => {
    const w = await world('as-list');
    const chung = await seedRule(ds, w.teacherId, 'chung', 'tinh_dung', BIEN);
    const { seedPrices } = await import('./helpers/investigator-seed');
    await seedPrices(ds, w.teacherId, { [chung.ruleId]: '1.00' });
    const bId = await assignmentId(ds, w.teacherId, w.nameB, chung.ruleId);
    await errors.assign(w.teacherId, { rubricName: w.nameB, criterionKey: 'trinh_bay', deduction: '2.00', ruleId: chung.ruleId }).catch(() => undefined);
    const r = await seedInvestigatorResult(ds, w.a, storedWith([{ ruleKey: 'chung', checkedBy: 'machine' }]));
    await scores.computeInitial(r.resultId);
    const listA = await errors.list(w.teacherId, w.nameA);
    expect(listA).toHaveLength(1);
    expect(listA[0]).toMatchObject({
      ruleKey: 'chung', criterionKey: 'tinh_dung', criterionDangling: false, deduction: '1.00', checkedBy: 'machine',
      appliedTo: { results: 1, sessions: 1 },
      alsoIn: [{ rubricName: w.nameB, criterionKey: 'tinh_dung', deduction: '1.00' }],
    });
    const listB = await errors.list(w.teacherId, w.nameB);
    expect(listB[0].appliedTo).toEqual({ results: 0, sessions: 0 });
    expect(bId).toEqual(expect.any(String));
    await expect(errors.list(w.teacherId, 'Không có rubric này')).rejects.toBeInstanceOf(NotFoundException);
  });
});
```

Run → FAIL (`errors.assign is not a function`).

- [ ] **Step 4: Implement the service**

Replace `rubric-error.service.ts` with the full class (keep `OwnedAssignment` and `owned`):

```ts
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { isMachineChecked } from '../decision/predicates';
import type { RulePredicate } from '../decision/types';
import { ErrorRuleEntity } from '../entities/error-rule.entity';
import { ErrorRuleRevisionEntity } from '../entities/error-rule-revision.entity';
import { formatHundredths, parseHundredths } from '../scoring/hundredths';
import { lockTeacherScoring } from '../scoring/score-inputs';
import { RecomputeSummary, ScoreService } from '../scoring/score.service';
import { writeNextPriceVersion } from './price-version';
import { AssignInput, NewRuleInput, RuleChanges } from './rule-input';
import { slugifyRuleKey, uniqueRuleKey } from './rule-key';

export interface OwnedAssignment {
  id: string;
  teacherId: string;
  rubricName: string;
  errorRuleId: string;
  criterionKey: string;
}

export interface RubricErrorItem {
  id: string;
  ruleId: string;
  ruleKey: string;
  name: string;
  description: string;
  predicate: RulePredicate | null;
  checkedBy: 'machine' | 'model';
  origin: string;
  criterionKey: string;
  /** Tiêu chí không còn ở bản MỚI NHẤT của rubric (spec §2.3.4). */
  criterionDangling: boolean;
  deduction: string | null;
  /** Bài mà lượt tính mới nhất (của rubric NÀY) có lỗi này; không tính lỗi đã bỏ cho riêng bài. */
  appliedTo: { results: number; sessions: number };
  alsoIn: { rubricName: string; criterionKey: string; deduction: string | null }[];
}

export interface AssignResult {
  rubricErrorId: string;
  ruleId: string;
  recompute: RecomputeSummary | null;
}

/** Dòng áp dụng của một lỗi trong một rubric (spec §2): thêm, chuyển tiêu chí, gỡ, liệt kê. */
@Injectable()
export class RubricErrorService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly scores: ScoreService,
  ) {}

  /** Dòng áp dụng CHƯA GỠ của đúng giảng viên này; không thì 404 — không lộ dòng của người khác (T-POL-8). */
  async owned(m: EntityManager, teacherId: string, rubricErrorId: string): Promise<OwnedAssignment> {
    const [row] = await m.query(
      `SELECT id, teacher_id, rubric_name, error_rule_id, criterion_key
         FROM examcollect.rubric_error WHERE id = $1 AND teacher_id = $2 AND removed_at IS NULL`,
      [rubricErrorId, teacherId],
    );
    if (!row) throw new NotFoundException('Không tìm thấy lỗi trong rubric');
    return { id: row.id, teacherId: row.teacher_id, rubricName: row.rubric_name, errorRuleId: row.error_rule_id, criterionKey: row.criterion_key };
  }

  /**
   * Rubric `(teacher, name)` phải có (404 — không lộ rubric của người khác) và tiêu chí phải có ở BẢN MỚI NHẤT
   * (400): không có khoá ngoại nên đây là chỗ DUY NHẤT giữ toàn vẹn (spec §2.3.3, T-RBE-DATA-3).
   */
  async assertRubricCriterion(m: EntityManager, teacherId: string, rubricName: string, criterionKey: string): Promise<void> {
    const [latest] = await m.query(
      `SELECT id FROM examcollect.rubric WHERE teacher_id = $1 AND name = $2 ORDER BY version DESC LIMIT 1`,
      [teacherId, rubricName],
    );
    if (!latest) throw new NotFoundException('Không tìm thấy rubric');
    const [crit] = await m.query(`SELECT 1 FROM examcollect.rubric_criterion WHERE rubric_id = $1 AND key = $2`, [latest.id, criterionKey]);
    if (!crit) throw new BadRequestException(`Tiêu chí "${criterionKey}" không có trong rubric "${rubricName}"`);
  }

  async list(teacherId: string, rubricName: string): Promise<RubricErrorItem[]> {
    await this.assertRubricExists(this.ds.manager, teacherId, rubricName);
    const rows: Record<string, unknown>[] = await this.ds.query(
      `WITH price AS (
         SELECT p.rubric_error_id, p.deduction FROM examcollect.rubric_error_price p
          WHERE p.price_table_version_id = (SELECT id FROM examcollect.price_table_version WHERE teacher_id = $1 ORDER BY version DESC LIMIT 1)),
       latest_rubric AS (SELECT id FROM examcollect.rubric WHERE teacher_id = $1 AND name = $2 ORDER BY version DESC LIMIT 1),
       latest AS (
         SELECT DISTINCT ON (c.grading_result_id) c.grading_result_id, c.breakdown, s.exam_session_id
           FROM examcollect.score_computation c
           JOIN examcollect.grading_result g ON g.id = c.grading_result_id
           JOIN examcollect.submission s ON s.id = g.submission_id
          WHERE g.rubric_id_version IN (SELECT id FROM examcollect.rubric WHERE teacher_id = $1 AND name = $2)
          ORDER BY c.grading_result_id, c.created_at DESC, c.id DESC),
       applied AS (
         SELECT e ->> 'ruleId' AS rule_id, l.grading_result_id, l.exam_session_id
           FROM latest l CROSS JOIN LATERAL jsonb_array_elements(l.breakdown -> 'errors') e
          WHERE e ->> 'counted' <> 'excluded')
       SELECT re.id, r.id AS rule_id, r.rule_key, r.origin, v.name, v.description, v.predicate, re.criterion_key, price.deduction,
              (SELECT count(DISTINCT a.grading_result_id)::int FROM applied a WHERE a.rule_id = r.id::text) AS results,
              (SELECT count(DISTINCT a.exam_session_id)::int FROM applied a WHERE a.rule_id = r.id::text) AS sessions,
              NOT EXISTS (SELECT 1 FROM examcollect.rubric_criterion rc
                           WHERE rc.rubric_id = (SELECT id FROM latest_rubric) AND rc.key = re.criterion_key) AS dangling
         FROM examcollect.rubric_error re
         JOIN examcollect.error_rule r ON r.id = re.error_rule_id
         JOIN examcollect.error_rule_revision v ON v.id = r.current_revision_id
         LEFT JOIN price ON price.rubric_error_id = re.id
        WHERE re.teacher_id = $1 AND re.rubric_name = $2 AND re.removed_at IS NULL AND r.state = 'active'
        ORDER BY re.criterion_key, r.rule_key`,
      [teacherId, rubricName],
    );
    const ruleIds = rows.map((r) => r.rule_id as string);
    const others: { error_rule_id: string; rubric_name: string; criterion_key: string; deduction: string | null }[] = ruleIds.length
      ? await this.ds.query(
          `SELECT re.error_rule_id, re.rubric_name, re.criterion_key, p.deduction
             FROM examcollect.rubric_error re
             LEFT JOIN examcollect.rubric_error_price p ON p.rubric_error_id = re.id
              AND p.price_table_version_id = (SELECT id FROM examcollect.price_table_version WHERE teacher_id = $1 ORDER BY version DESC LIMIT 1)
            WHERE re.teacher_id = $1 AND re.rubric_name <> $2 AND re.removed_at IS NULL AND re.error_rule_id = ANY($3::uuid[])
            ORDER BY re.rubric_name`,
          [teacherId, rubricName, ruleIds],
        )
      : [];
    const fmt = (d: unknown) => (d === null || d === undefined ? null : formatHundredths(parseHundredths(d as string)));
    return rows.map((r) => ({
      id: r.id as string,
      ruleId: r.rule_id as string,
      ruleKey: r.rule_key as string,
      name: r.name as string,
      description: r.description as string,
      predicate: r.predicate as RulePredicate | null,
      checkedBy: isMachineChecked(r.predicate as RulePredicate | null) ? 'machine' : 'model',
      origin: r.origin as string,
      criterionKey: r.criterion_key as string,
      criterionDangling: r.dangling as boolean,
      deduction: fmt(r.deduction),
      appliedTo: { results: r.results as number, sessions: r.sessions as number },
      alsoIn: others
        .filter((o) => o.error_rule_id === r.rule_id)
        .map((o) => ({ rubricName: o.rubric_name, criterionKey: o.criterion_key, deduction: fmt(o.deduction) })),
    }));
  }

  /**
   * Thêm một lỗi vào rubric — ba đường: lỗi có sẵn (`ruleId`), lỗi `proposed` được duyệt (`ruleId` + `changes`),
   * lỗi mới (`newRule`). Giá (nếu có) ghi MỘT phiên bản giá mới. Dòng đã gỡ thì BẬT LẠI cùng id.
   */
  async assign(teacherId: string, input: AssignInput, actorId: string = teacherId): Promise<AssignResult> {
    return this.ds.transaction(async (m) => {
      await lockTeacherScoring(m, teacherId);
      await this.assertRubricCriterion(m, teacherId, input.rubricName, input.criterionKey);
      const { ruleId, predicate } = input.newRule
        ? await this.createRule(m, teacherId, input.newRule, actorId)
        : await this.adoptRule(m, teacherId, input.ruleId!, input.changes, actorId);
      const [existing] = await m.query(
        `SELECT id, removed_at FROM examcollect.rubric_error WHERE teacher_id = $1 AND rubric_name = $2 AND error_rule_id = $3`,
        [teacherId, input.rubricName, ruleId],
      );
      if (existing && existing.removed_at === null) throw new ConflictException('Lỗi này đã có trong rubric');
      let rubricErrorId: string;
      if (existing) {
        await m.query(`UPDATE examcollect.rubric_error SET removed_at = NULL, criterion_key = $2 WHERE id = $1`, [existing.id, input.criterionKey]);
        rubricErrorId = existing.id;
      } else {
        const [row] = await m.query(
          `INSERT INTO examcollect.rubric_error (teacher_id, rubric_name, error_rule_id, criterion_key) VALUES ($1, $2, $3, $4) RETURNING id`,
          [teacherId, input.rubricName, ruleId, input.criterionKey],
        );
        rubricErrorId = row.id;
      }
      if (input.deduction !== undefined) await writeNextPriceVersion(m, teacherId, actorId, [{ rubricErrorId, deduction: input.deduction }]);
      // Luật máy kiểm được đo ngay trên kết quả đã lưu (bậc 2); luật lời không áp cho bài đã chấm (T-FAIR-1).
      const recompute = isMachineChecked(predicate)
        ? await this.scores.recomputeForTeacher(m, teacherId, 'rule_revision', actorId, { rubricName: input.rubricName })
        : null;
      return { rubricErrorId, ruleId, recompute };
    });
  }

  async move(teacherId: string, rubricErrorId: string, criterionKey: string): Promise<{ recompute: RecomputeSummary }> {
    return this.ds.transaction(async (m) => {
      await lockTeacherScoring(m, teacherId);
      const row = await this.owned(m, teacherId, rubricErrorId);
      await this.assertRubricCriterion(m, teacherId, row.rubricName, criterionKey);
      await m.query(`UPDATE examcollect.rubric_error SET criterion_key = $2 WHERE id = $1`, [rubricErrorId, criterionKey]);
      return { recompute: await this.scores.recomputeForTeacher(m, teacherId, 'rule_revision', teacherId, { rubricName: row.rubricName }) };
    });
  }

  /** "Gỡ khỏi rubric này": đặt `removed_at`, không xoá dòng; lỗi vẫn ở thư viện, rubric khác không đổi. */
  async remove(teacherId: string, rubricErrorId: string): Promise<{ recompute: RecomputeSummary }> {
    return this.ds.transaction(async (m) => {
      await lockTeacherScoring(m, teacherId);
      const row = await this.owned(m, teacherId, rubricErrorId);
      await m.query(`UPDATE examcollect.rubric_error SET removed_at = now() WHERE id = $1`, [rubricErrorId]);
      return { recompute: await this.scores.recomputeForTeacher(m, teacherId, 'rule_revision', teacherId, { rubricName: row.rubricName }) };
    });
  }

  private async assertRubricExists(m: EntityManager, teacherId: string, rubricName: string): Promise<void> {
    const [row] = await m.query(`SELECT 1 FROM examcollect.rubric WHERE teacher_id = $1 AND name = $2 LIMIT 1`, [teacherId, rubricName]);
    if (!row) throw new NotFoundException('Không tìm thấy rubric');
  }

  private async createRule(m: EntityManager, teacherId: string, input: NewRuleInput, actorId: string): Promise<{ ruleId: string; predicate: RulePredicate | null }> {
    let ruleKey = input.ruleKey;
    if (ruleKey) {
      const [dup] = await m.query(`SELECT 1 FROM examcollect.error_rule WHERE teacher_id = $1 AND rule_key = $2`, [teacherId, ruleKey]);
      if (dup) throw new ConflictException(`Luật "${ruleKey}" đã có trong bảng lỗi của bạn`);
    } else {
      ruleKey = await uniqueRuleKey(m, teacherId, slugifyRuleKey(input.name));
    }
    const rules = m.getRepository(ErrorRuleEntity);
    const rule = await rules.save(rules.create({ teacherId, ruleKey, state: 'active', origin: 'teacher', currentRevisionId: null }));
    const revs = m.getRepository(ErrorRuleRevisionEntity);
    const rev = await revs.save(
      revs.create({ errorRuleId: rule.id, revision: 1, name: input.name, description: input.description, criterionKey: null, predicate: input.predicate, createdBy: actorId }),
    );
    await m.update(ErrorRuleEntity, rule.id, { currentRevisionId: rev.id });
    return { ruleId: rule.id, predicate: input.predicate };
  }

  private async adoptRule(
    m: EntityManager,
    teacherId: string,
    ruleId: string,
    changes: RuleChanges | undefined,
    actorId: string,
  ): Promise<{ ruleId: string; predicate: RulePredicate | null }> {
    const rule = await m.getRepository(ErrorRuleEntity).findOne({ where: { id: ruleId, teacherId } });
    if (!rule) throw new NotFoundException('Không tìm thấy luật');
    if (rule.state !== 'active' && rule.state !== 'proposed') throw new ConflictException('Lỗi này đã bị bỏ hoặc gỡ — không thêm vào rubric được');
    const current = await m.getRepository(ErrorRuleRevisionEntity).findOneByOrFail({ id: rule.currentRevisionId! });
    const hasChanges = changes !== undefined && Object.keys(changes).length > 0;
    if (hasChanges && rule.state !== 'proposed') throw new BadRequestException('changes chỉ dùng cho lỗi AI đề xuất');
    let predicate = current.predicate;
    let currentRevisionId = rule.currentRevisionId;
    if (hasChanges) {
      const revs = m.getRepository(ErrorRuleRevisionEntity);
      const merged = {
        name: changes!.name ?? current.name,
        description: changes!.description ?? current.description,
        predicate: changes!.predicate !== undefined ? changes!.predicate : current.predicate,
      };
      const rev = await revs.save(revs.create({ errorRuleId: rule.id, revision: current.revision + 1, criterionKey: null, createdBy: actorId, ...merged }));
      predicate = merged.predicate;
      currentRevisionId = rev.id;
    }
    if (rule.state === 'proposed') await m.update(ErrorRuleEntity, rule.id, { state: 'active', currentRevisionId });
    return { ruleId: rule.id, predicate };
  }
}
```

(`ErrorRuleService.owned` still serves other callers; `RubricErrorService` does not depend on it.)

- [ ] **Step 5: Run, lint, commit**

```powershell
npx jest src/grading/rules
pnpm exec tsc --noEmit -p tsconfig.json
pnpm exec eslint src/grading/rules
npx jest --config ./test/jest-e2e.json --runInBand rubric-errors-service rubric-scoped-pricing
```
Expected: PASS (the temporary `RuleInput` alias keeps `error-rule.service.ts` compiling until A5).

```bash
git add apps/api
git commit -m "feat(rules): RubricErrorService assign/move/remove/list and rule-key generator"
```

---

## Task A4: Copy errors between rubrics

**Files:** Modify `rubric-error.service.ts`; Test `apps/api/test/rubric-errors-copy.e2e-spec.ts`.

**Interfaces — Produces:**
```ts
RubricErrorService.copy(teacherId: string, fromRubricName: string, toRubricName: string, actorId?: string):
  Promise<{ copied: number; skippedNoCriterion: number; skippedExisting: number; recompute: RecomputeSummary | null }>
```

- [ ] **Step 1: Write the failing test**

```ts
import { Test } from '@nestjs/testing';
import { BadRequestException, INestApplication, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { RubricErrorService } from '../src/grading/rules/rubric-error.service';
import { currentPriceVersion } from '../src/grading/scoring/score-inputs';
import { seedCriterion, seedSession } from './helpers/grading-seed';
import { assignmentId, rubricNameOf, seedAssignment, seedAssignmentPrices, seedInvestigatorSession, seedRuleOnly } from './helpers/investigator-seed';

describe('Sao chép lỗi giữa rubric (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let errors: RubricErrorService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    ds = app.get(DataSource);
    errors = app.get(RubricErrorService);
  });
  afterAll(async () => app.close());

  /** Nguồn S có `tinh_dung`, `trinh_bay`, `rieng` và 3 lỗi (giá 1,00 / 2,00 / 0,50); đích D chỉ có `tinh_dung`, `trinh_bay`. */
  async function world(label: string) {
    const s = await seedSession(ds, `${label}-s`);
    await seedInvestigatorSession(ds, s);
    await seedCriterion(ds, s.rubricId, 'rieng', 3);
    const d = await seedSession(ds, `${label}-d`, { teacherId: s.teacherId, startHoursAgo: 10 });
    await seedInvestigatorSession(ds, d);
    const t = s.teacherId;
    const nameS = await rubricNameOf(ds, s.rubricId);
    const nameD = await rubricNameOf(ds, d.rubricId);
    const x = await seedRuleOnly(ds, t, 'x');
    const y = await seedRuleOnly(ds, t, 'y');
    const z = await seedRuleOnly(ds, t, 'z');
    const ax = await seedAssignment(ds, t, nameS, x.ruleId, 'tinh_dung');
    const ay = await seedAssignment(ds, t, nameS, y.ruleId, 'trinh_bay');
    const az = await seedAssignment(ds, t, nameS, z.ruleId, 'rieng');
    await seedAssignmentPrices(ds, t, { [ax]: '1.00', [ay]: '2.00', [az]: '0.50' });
    return { t, nameS, nameD, x, y, z };
  }

  it('T-RBE-API-4: ghép theo khoá tiêu chí; bỏ qua tiêu chí không có ở đích; đếm đúng; MỘT phiên bản giá mới; nguồn không đổi', async () => {
    const w = await world('cp1');
    const before = (await currentPriceVersion(ds.manager, w.t))!;
    const out = await errors.copy(w.t, w.nameS, w.nameD);
    expect(out).toMatchObject({ copied: 2, skippedNoCriterion: 1, skippedExisting: 0 });
    const price = (await currentPriceVersion(ds.manager, w.t))!;
    expect(price.version).toBe(before.version + 1);
    const rows = await ds.query(
      `SELECT r.rule_key, re.criterion_key, p.deduction FROM examcollect.rubric_error re
         JOIN examcollect.error_rule r ON r.id = re.error_rule_id
         LEFT JOIN examcollect.rubric_error_price p ON p.rubric_error_id = re.id AND p.price_table_version_id = $3
        WHERE re.teacher_id = $1 AND re.rubric_name = $2 AND re.removed_at IS NULL ORDER BY r.rule_key`,
      [w.t, w.nameD, price.id],
    );
    expect(rows).toEqual([
      { rule_key: 'x', criterion_key: 'tinh_dung', deduction: '1.00' },
      { rule_key: 'y', criterion_key: 'trinh_bay', deduction: '2.00' },
    ]);
    const src = await ds.query(`SELECT count(*)::int AS n FROM examcollect.rubric_error WHERE teacher_id = $1 AND rubric_name = $2 AND removed_at IS NULL`, [w.t, w.nameS]);
    expect(src[0].n).toBe(3);
  });

  it('chạy lại: dòng đã có ở đích bị bỏ qua (skippedExisting), không tạo thêm phiên bản giá', async () => {
    const w = await world('cp2');
    await errors.copy(w.t, w.nameS, w.nameD);
    const v = (await currentPriceVersion(ds.manager, w.t))!;
    const again = await errors.copy(w.t, w.nameS, w.nameD);
    expect(again).toMatchObject({ copied: 0, skippedNoCriterion: 1, skippedExisting: 2 });
    expect((await currentPriceVersion(ds.manager, w.t))!.version).toBe(v.version);
  });

  it('dòng đã gỡ ở đích được bật lại khi sao chép; điểm trừ độc lập sau đó (sửa ở đích không đổi nguồn)', async () => {
    const w = await world('cp3');
    await errors.copy(w.t, w.nameS, w.nameD);
    const dx = await assignmentId(ds, w.t, w.nameD, w.x.ruleId);
    await errors.remove(w.t, dx);
    const out = await errors.copy(w.t, w.nameS, w.nameD);
    expect(out.copied).toBe(1);
    expect(await assignmentId(ds, w.t, w.nameD, w.x.ruleId)).toBe(dx);
  });

  it('nguồn = đích → 400; rubric không có → 404', async () => {
    const w = await world('cp4');
    await expect(errors.copy(w.t, w.nameS, w.nameS)).rejects.toBeInstanceOf(BadRequestException);
    await expect(errors.copy(w.t, 'Không có', w.nameD)).rejects.toBeInstanceOf(NotFoundException);
    await expect(errors.copy(w.t, w.nameS, 'Không có')).rejects.toBeInstanceOf(NotFoundException);
  });
});
```

Run → FAIL (`errors.copy is not a function`).

- [ ] **Step 2: Implement `copy`**

Add to `RubricErrorService`:

```ts
  /**
   * Sao chép các dòng áp dụng CHƯA GỠ của rubric nguồn sang rubric đích, ghép theo `criterion_key` (spec D3):
   * đích đã có lỗi đó thì bỏ qua; tiêu chí không có ở BẢN MỚI NHẤT của đích thì bỏ qua và đếm. Điểm trừ lấy từ
   * phiên bản giá hiện hành của nguồn, ghi MỘT phiên bản mới. Sau đó hai rubric độc lập.
   */
  async copy(
    teacherId: string,
    fromRubricName: string,
    toRubricName: string,
    actorId: string = teacherId,
  ): Promise<{ copied: number; skippedNoCriterion: number; skippedExisting: number; recompute: RecomputeSummary | null }> {
    if (fromRubricName === toRubricName) throw new BadRequestException('Rubric nguồn và rubric đích phải khác nhau');
    return this.ds.transaction(async (m) => {
      await lockTeacherScoring(m, teacherId);
      await this.assertRubricExists(m, teacherId, fromRubricName);
      await this.assertRubricExists(m, teacherId, toRubricName);
      const targetKeys = new Set<string>(
        (
          await m.query(
            `SELECT key FROM examcollect.rubric_criterion
              WHERE rubric_id = (SELECT id FROM examcollect.rubric WHERE teacher_id = $1 AND name = $2 ORDER BY version DESC LIMIT 1)`,
            [teacherId, toRubricName],
          )
        ).map((r: { key: string }) => r.key),
      );
      const sources: { error_rule_id: string; criterion_key: string; deduction: string | null }[] = await m.query(
        `SELECT re.error_rule_id, re.criterion_key, p.deduction
           FROM examcollect.rubric_error re
           JOIN examcollect.error_rule r ON r.id = re.error_rule_id AND r.state = 'active'
           LEFT JOIN examcollect.rubric_error_price p ON p.rubric_error_id = re.id
            AND p.price_table_version_id = (SELECT id FROM examcollect.price_table_version WHERE teacher_id = $1 ORDER BY version DESC LIMIT 1)
          WHERE re.teacher_id = $1 AND re.rubric_name = $2 AND re.removed_at IS NULL
          ORDER BY re.criterion_key, r.rule_key`,
        [teacherId, fromRubricName],
      );
      let skippedNoCriterion = 0;
      let skippedExisting = 0;
      const changes: { rubricErrorId: string; deduction: string | null }[] = [];
      for (const src of sources) {
        if (!targetKeys.has(src.criterion_key)) {
          skippedNoCriterion++;
          continue;
        }
        const [existing] = await m.query(
          `SELECT id, removed_at FROM examcollect.rubric_error WHERE teacher_id = $1 AND rubric_name = $2 AND error_rule_id = $3`,
          [teacherId, toRubricName, src.error_rule_id],
        );
        if (existing && existing.removed_at === null) {
          skippedExisting++;
          continue;
        }
        let id: string;
        if (existing) {
          await m.query(`UPDATE examcollect.rubric_error SET removed_at = NULL, criterion_key = $2 WHERE id = $1`, [existing.id, src.criterion_key]);
          id = existing.id;
        } else {
          const [row] = await m.query(
            `INSERT INTO examcollect.rubric_error (teacher_id, rubric_name, error_rule_id, criterion_key) VALUES ($1, $2, $3, $4) RETURNING id`,
            [teacherId, toRubricName, src.error_rule_id, src.criterion_key],
          );
          id = row.id;
        }
        changes.push({ rubricErrorId: id, deduction: src.deduction });
      }
      if (changes.length > 0) await writeNextPriceVersion(m, teacherId, actorId, changes);
      const recompute =
        changes.length > 0 ? await this.scores.recomputeForTeacher(m, teacherId, 'rule_revision', actorId, { rubricName: toRubricName }) : null;
      return { copied: changes.length, skippedNoCriterion, skippedExisting, recompute };
    });
  }
```

- [ ] **Step 3: Run, lint, commit**

```powershell
pnpm exec tsc --noEmit -p tsconfig.json
pnpm exec eslint src/grading/rules
npx jest --config ./test/jest-e2e.json --runInBand rubric-errors-copy rubric-errors-service
```
Expected: PASS.

```bash
git add apps/api
git commit -m "feat(rules): copy errors between rubrics matched by criterion key"
```

---

## Task A5: `ErrorRuleService` — library, revise, split, dismiss (and retire the old create/preview)

**Files:**
- Modify (rewrite): `apps/api/src/grading/rules/error-rule.service.ts`
- Modify: `apps/api/src/grading/rules/rule-input.ts` (remove the temporary `RuleInput` alias), `rules.controller.ts` (remove `POST rules`, `POST rules/preview`, make `PATCH`/`state` use the new signatures; library + split are wired in A9), `dto/rule-state.dto.ts`, `dto/rule-body.dto.ts`
- Modify (tests): `apps/api/test/rules-prices.e2e-spec.ts` (rewrite the remaining tests), `apps/api/test/rules-routes.e2e-spec.ts` (delete the tests of removed routes only)
- Test: `apps/api/test/rule-split.e2e-spec.ts`

**Interfaces — Produces:**
```ts
export interface RuleUse { rubricName: string; criterionKey: string; deduction: string | null }
export interface LibraryRule { id: string; ruleKey: string; origin: string; revision: { id: string; revision: number; name: string; description: string; predicate: RulePredicate | null }; checkedBy: 'machine' | 'model'; uses: RuleUse[] }
ErrorRuleService.owned(m, teacherId, ruleId): Promise<ErrorRuleEntity>            // unchanged contract
ErrorRuleService.library(teacherId): Promise<LibraryRule[]>
ErrorRuleService.revise(teacherId, ruleId, changes: RuleChanges): Promise<{ revisionId: string; recompute: RecomputeSummary | null }>
ErrorRuleService.setState(teacherId, ruleId, state: 'dismissed' | 'retired'): Promise<{ recompute: RecomputeSummary }>
ErrorRuleService.split(teacherId, ruleId, input: { rubricName: string; changes: RuleChanges }): Promise<{ ruleId: string; rubricErrorId: string; recompute: RecomputeSummary }>
```

- [ ] **Step 1: Write the failing split/library tests**

`apps/api/test/rule-split.e2e-spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { ConflictException, INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { ErrorExceptionService } from '../src/grading/review/error-exception.service';
import { ErrorRuleService } from '../src/grading/rules/error-rule.service';
import { latestComputationRow } from '../src/grading/scoring/score-inputs';
import { ScoreService } from '../src/grading/scoring/score.service';
import { seedSession } from './helpers/grading-seed';
import {
  assignmentId, rubricNameOf, seedInvestigatorResult, seedInvestigatorSession, seedPrices, seedRule, storedWith,
} from './helpers/investigator-seed';

const SEEN = [
  { ruleKey: 'chung', checkedBy: 'machine' as const },
  { ruleKey: 'ten_bien', checkedBy: 'model' as const },
];

describe('Thư viện lỗi, sửa cả N rubric, tách bản riêng (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let rules: ErrorRuleService;
  let scores: ScoreService;
  let exceptions: ErrorExceptionService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    ds = app.get(DataSource);
    rules = app.get(ErrorRuleService);
    scores = app.get(ScoreService);
    exceptions = app.get(ErrorExceptionService);
  });
  afterAll(async () => app.close());

  /** Một giảng viên, hai rubric; `chung` (máy kiểm `bien`) + `ten_bien` áp ở cả hai, giá 1,00 / 0,50. */
  async function world(label: string) {
    const a = await seedSession(ds, `${label}-a`);
    await seedInvestigatorSession(ds, a);
    const b = await seedSession(ds, `${label}-b`, { teacherId: a.teacherId, startHoursAgo: 10 });
    await seedInvestigatorSession(ds, b);
    const t = a.teacherId;
    const nameA = await rubricNameOf(ds, a.rubricId);
    const nameB = await rubricNameOf(ds, b.rubricId);
    const chung = await seedRule(ds, t, 'chung', 'tinh_dung', { kind: 'test_group_failed', group: 'bien' });
    const ten = await seedRule(ds, t, 'ten_bien', 'trinh_bay');
    await seedPrices(ds, t, { [chung.ruleId]: '1.00', [ten.ruleId]: '0.50' });
    return { a, b, t, nameA, nameB, chung, ten };
  }
  const graded = async (ctx: Parameters<typeof seedInvestigatorResult>[1]) => {
    const { resultId } = await seedInvestigatorResult(ds, ctx, storedWith(SEEN, ['ten_bien']));
    await scores.computeInitial(resultId);
    return resultId;
  };

  it('library: lỗi active kèm nơi dùng (rubric, tiêu chí, điểm trừ); lỗi proposed/dismissed không có mặt', async () => {
    const w = await world('lib');
    const lib = await rules.library(w.t);
    const chung = lib.find((r) => r.ruleKey === 'chung')!;
    expect(chung).toMatchObject({ checkedBy: 'machine', revision: { name: 'chung', predicate: { kind: 'test_group_failed', group: 'bien' } } });
    expect(chung.uses.map((u) => [u.rubricName, u.criterionKey, u.deduction]).sort()).toEqual(
      [[w.nameA, 'tinh_dung', '1.00'], [w.nameB, 'tinh_dung', '1.00']].sort(),
    );
  });

  it('T-RBE-SPLIT-1: PATCH đổi ở CẢ rubric dùng nó; split chỉ đổi rubric đó, rubric kia giữ nguyên nội dung cũ', async () => {
    const w = await world('sp1');
    await rules.revise(w.t, w.ten.ruleId, { name: 'Tên chung mới' });
    const lib = await rules.library(w.t);
    expect(lib.find((r) => r.ruleKey === 'ten_bien')!.revision.name).toBe('Tên chung mới');

    const out = await rules.split(w.t, w.ten.ruleId, { rubricName: w.nameA, changes: { name: 'Tên riêng của A', description: 'riêng A' } });
    const split = (await rules.library(w.t)).find((r) => r.id === out.ruleId)!;
    expect(split.revision).toMatchObject({ revision: 1, name: 'Tên riêng của A', description: 'riêng A' });
    expect(split.uses.map((u) => u.rubricName)).toEqual([w.nameA]);
    const original = (await rules.library(w.t)).find((r) => r.id === w.ten.ruleId)!;
    expect(original.revision.name).toBe('Tên chung mới');
    expect(original.uses.map((u) => u.rubricName)).toEqual([w.nameB]);
  });

  it('T-RBE-SPLIT-2: split giữ tiêu chí, điểm trừ và dòng giá; ruleKey mới duy nhất; luật chỉ ở 1 rubric → 409', async () => {
    const w = await world('sp2');
    const before = await assignmentId(ds, w.t, w.nameA, w.ten.ruleId);
    const out = await rules.split(w.t, w.ten.ruleId, { rubricName: w.nameA, changes: { name: 'Riêng A' } });
    expect(out.rubricErrorId).toBe(before); // cùng dòng áp dụng, trỏ sang luật mới → giá đi theo
    const [row] = await ds.query(`SELECT error_rule_id, criterion_key FROM examcollect.rubric_error WHERE id = $1`, [before]);
    expect(row).toEqual({ error_rule_id: out.ruleId, criterion_key: 'trinh_bay' });
    const [rule] = await ds.query(`SELECT rule_key FROM examcollect.error_rule WHERE id = $1`, [out.ruleId]);
    expect(rule.rule_key).toBe('rieng_a');
    await expect(rules.split(w.t, out.ruleId, { rubricName: w.nameA, changes: { name: 'Lại' } })).rejects.toBeInstanceOf(ConflictException);
  });

  it('T-RBE-SPLIT-3: ngoại lệ cấp lỗi của bài thuộc rubric đó theo sang luật mới (điểm bài không đổi); bài rubric khác không bị chép', async () => {
    const w = await world('sp3');
    const ra = await graded(w.a);
    const rb = await graded(w.b);
    await exceptions.setErrorException(w.t, ra, w.ten.ruleId, 'exclude'); // bỏ lỗi ten_bien cho riêng bài A
    const scoreA = (await latestComputationRow(ds.manager, ra))!.score;
    const out = await rules.split(w.t, w.ten.ruleId, { rubricName: w.nameA, changes: { name: 'Riêng A' } });
    expect((await latestComputationRow(ds.manager, ra))!.score).toBe(scoreA);
    const copied = await ds.query(
      `SELECT grading_result_id, direction FROM examcollect.teacher_review WHERE kind = 'error_exception' AND error_rule_id = $1`,
      [out.ruleId],
    );
    expect(copied).toEqual([{ grading_result_id: ra, direction: 'exclude' }]);
    expect((await latestComputationRow(ds.manager, rb))!.breakdown.errors.some((e) => e.ruleKey === 'ten_bien' && e.counted === 'counted')).toBe(true);
  });

  it('setState: dismissed / retired bỏ lỗi khỏi tính điểm; cả giảng viên được tính lại', async () => {
    const w = await world('st');
    const ra = await graded(w.a);
    const out = await rules.setState(w.t, w.ten.ruleId, 'retired');
    expect(out.recompute.recomputed).toBeGreaterThanOrEqual(1);
    expect((await latestComputationRow(ds.manager, ra))!.breakdown.errors.map((e) => e.ruleKey)).not.toContain('ten_bien');
  });
});
```

Also rewrite the remaining tests of `rules-prices.e2e-spec.ts` (T-RULEREV-1, "sửa chữ của luật", T-VER-1, T-POL-5, T-POL-8 are already adapted in A2 — here replace the three tests that use removed APIs):

- **T-RULEREV-1** `đổi tiêu chí → bản sửa 2…` becomes **`đổi điều kiện → bản sửa 2, luật trỏ bản 2, lượt tính cũ vẫn mang bản 1`**: call `rules.revise(ctx.teacherId, ten.ruleId, { predicate: { kind: 'test_group_failed', group: 'co_ban' } })` (a predicate change is what triggers a recompute now), assert the same revision list `[1, 2]`, `current_revision_id`, reasons `['initial', 'rule_revision']`, and the `revisionId` carried by each breakdown.
- **`sửa chữ của luật…`**: unchanged (name only → no recompute).
- **`list: appliedTo…; trùng ruleKey → 409`** is deleted (now covered by A3 `list` and `T-RBE-API-2b`).
- **`tạo luật máy kiểm → tính lại bậc 2…`** and **`preview luật…`** are deleted (replaced by A3 `T-RBE-API-2a`; the preview endpoint is removed).

In `rules-routes.e2e-spec.ts` delete the tests `tạo luật → 201 …`, `điều kiện ngoài bốn mẫu → 400; xem trước…` and `sửa luật, đổi trạng thái qua route` (they exercise removed routes; replaced in A9). Leave the manual-score/reapply/waiver tests.

Run `npx jest --config ./test/jest-e2e.json --runInBand rule-split rules-prices` → FAIL (`rules.library is not a function`).

- [ ] **Step 2: Rewrite `error-rule.service.ts`**

```ts
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { isMachineChecked } from '../decision/predicates';
import type { RulePredicate } from '../decision/types';
import { ErrorRuleEntity } from '../entities/error-rule.entity';
import { ErrorRuleRevisionEntity } from '../entities/error-rule-revision.entity';
import { formatHundredths, parseHundredths } from '../scoring/hundredths';
import { lockTeacherScoring } from '../scoring/score-inputs';
import { RecomputeSummary, ScoreService } from '../scoring/score.service';
import { RuleChanges } from './rule-input';
import { slugifyRuleKey, uniqueRuleKey } from './rule-key';

export interface RuleUse {
  rubricName: string;
  criterionKey: string;
  deduction: string | null;
}

/** Một lỗi trong THƯ VIỆN: danh tính + cách phát hiện, kèm nơi nó đang dùng (spec §4.3). */
export interface LibraryRule {
  id: string;
  ruleKey: string;
  origin: string;
  revision: { id: string; revision: number; name: string; description: string; predicate: RulePredicate | null };
  checkedBy: 'machine' | 'model';
  uses: RuleUse[];
}

/**
 * Lỗi của MỘT giảng viên (§2.1): thư viện, sửa danh tính (cả N rubric), tách bản riêng, bỏ. Tiêu chí và điểm
 * trừ KHÔNG ở đây — chúng thuộc dòng áp dụng (`RubricErrorService`, `PriceService`). Không xoá dòng nào; sửa là
 * bản sửa mới (§14.1).
 */
@Injectable()
export class ErrorRuleService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly scores: ScoreService,
  ) {}

  async owned(m: EntityManager, teacherId: string, ruleId: string): Promise<ErrorRuleEntity> {
    const rule = await m.getRepository(ErrorRuleEntity).findOne({ where: { id: ruleId, teacherId } });
    if (!rule) throw new NotFoundException('Không tìm thấy luật');
    return rule;
  }

  async library(teacherId: string): Promise<LibraryRule[]> {
    const rules: Record<string, unknown>[] = await this.ds.query(
      `SELECT r.id, r.rule_key, r.origin, v.id AS revision_id, v.revision, v.name, v.description, v.predicate
         FROM examcollect.error_rule r
         JOIN examcollect.error_rule_revision v ON v.id = r.current_revision_id
        WHERE r.teacher_id = $1 AND r.state = 'active'
        ORDER BY r.rule_key`,
      [teacherId],
    );
    const uses: { error_rule_id: string; rubric_name: string; criterion_key: string; deduction: string | null }[] = await this.ds.query(
      `SELECT re.error_rule_id, re.rubric_name, re.criterion_key, p.deduction
         FROM examcollect.rubric_error re
         LEFT JOIN examcollect.rubric_error_price p ON p.rubric_error_id = re.id
          AND p.price_table_version_id = (SELECT id FROM examcollect.price_table_version WHERE teacher_id = $1 ORDER BY version DESC LIMIT 1)
        WHERE re.teacher_id = $1 AND re.removed_at IS NULL
        ORDER BY re.rubric_name`,
      [teacherId],
    );
    const fmt = (d: string | null) => (d === null ? null : formatHundredths(parseHundredths(d)));
    return rules.map((r) => ({
      id: r.id as string,
      ruleKey: r.rule_key as string,
      origin: r.origin as string,
      revision: {
        id: r.revision_id as string,
        revision: r.revision as number,
        name: r.name as string,
        description: r.description as string,
        predicate: r.predicate as RulePredicate | null,
      },
      checkedBy: isMachineChecked(r.predicate as RulePredicate | null) ? 'machine' : 'model',
      uses: uses
        .filter((u) => u.error_rule_id === r.id)
        .map((u) => ({ rubricName: u.rubric_name, criterionKey: u.criterion_key, deduction: fmt(u.deduction) })),
    }));
  }

  /** Sửa tên / mô tả / điều kiện cho CẢ rubric đang dùng lỗi này. Chỉ `predicate` đổi mới đổi điểm (§3.3). */
  async revise(teacherId: string, ruleId: string, changes: RuleChanges): Promise<{ revisionId: string; recompute: RecomputeSummary | null }> {
    return this.ds.transaction(async (m) => {
      await lockTeacherScoring(m, teacherId);
      const rule = await this.owned(m, teacherId, ruleId);
      const current = await m.getRepository(ErrorRuleRevisionEntity).findOneByOrFail({ id: rule.currentRevisionId! });
      const next = {
        name: changes.name ?? current.name,
        description: changes.description ?? current.description,
        predicate: changes.predicate !== undefined ? changes.predicate : current.predicate,
      };
      const rev = await this.insertRevision(m, rule.id, current.revision + 1, next, teacherId);
      await m.update(ErrorRuleEntity, rule.id, { currentRevisionId: rev.id });
      const scoring = JSON.stringify(next.predicate) !== JSON.stringify(current.predicate);
      const recompute = scoring ? await this.scores.recomputeForTeacher(m, teacherId, 'rule_revision', teacherId) : null;
      return { revisionId: rev.id, recompute };
    });
  }

  /** *Không phải lỗi* (`dismissed`) hay gỡ hẳn (`retired`). Tập luật đổi → tính lại cả giảng viên (như hôm nay). */
  async setState(teacherId: string, ruleId: string, state: 'dismissed' | 'retired'): Promise<{ recompute: RecomputeSummary }> {
    return this.ds.transaction(async (m) => {
      await lockTeacherScoring(m, teacherId);
      await this.owned(m, teacherId, ruleId);
      await m.update(ErrorRuleEntity, ruleId, { state });
      return { recompute: await this.scores.recomputeForTeacher(m, teacherId, 'rule_revision', teacherId) };
    });
  }

  /**
   * *Chỉ rubric đang mở* (spec D4): tạo luật MỚI từ luật này kèm `changes`, chuyển dòng áp dụng của rubric đó
   * sang luật mới (dòng giá khoá theo dòng áp dụng nên đi theo), chép ngoại lệ cấp lỗi của bài thuộc rubric đó
   * (§3.6), rồi tính lại rubric đó. Luật cũ và dòng áp dụng ở rubric khác không đổi.
   */
  async split(
    teacherId: string,
    ruleId: string,
    input: { rubricName: string; changes: RuleChanges },
  ): Promise<{ ruleId: string; rubricErrorId: string; recompute: RecomputeSummary }> {
    return this.ds.transaction(async (m) => {
      await lockTeacherScoring(m, teacherId);
      const rule = await this.owned(m, teacherId, ruleId);
      const [assignment] = await m.query(
        `SELECT id FROM examcollect.rubric_error WHERE teacher_id = $1 AND rubric_name = $2 AND error_rule_id = $3 AND removed_at IS NULL`,
        [teacherId, input.rubricName, ruleId],
      );
      if (!assignment) throw new NotFoundException('Không tìm thấy lỗi trong rubric');
      const [{ n }] = await m.query(
        `SELECT count(DISTINCT rubric_name)::int AS n FROM examcollect.rubric_error WHERE teacher_id = $1 AND error_rule_id = $2 AND removed_at IS NULL`,
        [teacherId, ruleId],
      );
      if (n < 2) throw new ConflictException('Lỗi này chỉ dùng ở một rubric — sửa trực tiếp, không cần tách bản riêng');
      const current = await m.getRepository(ErrorRuleRevisionEntity).findOneByOrFail({ id: rule.currentRevisionId! });
      const merged = {
        name: input.changes.name ?? current.name,
        description: input.changes.description ?? current.description,
        predicate: input.changes.predicate !== undefined ? input.changes.predicate : current.predicate,
      };
      const ruleKey = await uniqueRuleKey(m, teacherId, slugifyRuleKey(merged.name));
      const rules = m.getRepository(ErrorRuleEntity);
      const created = await rules.save(rules.create({ teacherId, ruleKey, state: 'active', origin: 'teacher', currentRevisionId: null }));
      const rev = await this.insertRevision(m, created.id, 1, merged, teacherId);
      await m.update(ErrorRuleEntity, created.id, { currentRevisionId: rev.id });
      await m.query(`UPDATE examcollect.rubric_error SET error_rule_id = $2 WHERE id = $1`, [assignment.id, created.id]);
      // Ngoại lệ hiện hành của bài thuộc rubric đó theo sang luật mới (đường ghi của ErrorExceptionService.writeReview).
      await m.query(
        `INSERT INTO examcollect.teacher_review (grading_result_id, teacher_id, final_score, kind, error_rule_id, direction, edited_criteria, reviewed_at)
         SELECT x.grading_result_id, $1, NULL, 'error_exception', $3, x.direction, '[]'::jsonb, clock_timestamp()
           FROM (SELECT DISTINCT ON (t.grading_result_id) t.grading_result_id, t.direction
                   FROM examcollect.teacher_review t
                   JOIN examcollect.grading_result g ON g.id = t.grading_result_id
                  WHERE t.kind = 'error_exception' AND t.error_rule_id = $2
                    AND g.rubric_id_version IN (SELECT id FROM examcollect.rubric WHERE teacher_id = $1 AND name = $4)
                  ORDER BY t.grading_result_id, t.reviewed_at DESC, t.created_at DESC, t.id DESC) x`,
        [teacherId, ruleId, created.id, input.rubricName],
      );
      const recompute = await this.scores.recomputeForTeacher(m, teacherId, 'rule_revision', teacherId, { rubricName: input.rubricName });
      return { ruleId: created.id, rubricErrorId: assignment.id as string, recompute };
    });
  }

  private insertRevision(
    m: EntityManager,
    ruleId: string,
    revision: number,
    input: { name: string; description: string; predicate: RulePredicate | null },
    actorId: string,
  ): Promise<ErrorRuleRevisionEntity> {
    const repo = m.getRepository(ErrorRuleRevisionEntity);
    return repo.save(
      repo.create({ errorRuleId: ruleId, revision, name: input.name, description: input.description, criterionKey: null, predicate: input.predicate, createdBy: actorId }),
    );
  }
}
```

Controller + DTO adjustments (just enough to compile; full wiring in A9): in `rules.controller.ts` delete `POST rules` (`create`) and `POST rules/preview`, change `list` to `this.rules.library(req.user!.sub)`, change `missing` temporarily to return `[]` with a `// Task A6` marker is **not allowed** — instead remove the `missing` route here and re-add it in A6 together with its service; change `revise` to `parseRuleChanges`, and `setState` to pass `dto.state` typed `'dismissed' | 'retired'`. In `dto/rule-state.dto.ts` change to `@IsIn(['dismissed', 'retired']) state!: 'dismissed' | 'retired';` and update its comment (*"duyệt đi qua POST /rubric-errors; `proposed`/`active` không đặt được bằng tay"*). In `dto/rule-body.dto.ts` delete `criterionKey`, `RuleBodyDto`, `RulePreviewDto` (keep `RuleChangesDto` with `name`, `description`, `predicate`). In `rule-input.ts` delete the temporary `RuleInput` alias.

- [ ] **Step 3: Run, lint, commit**

```powershell
pnpm exec tsc --noEmit -p tsconfig.json
pnpm exec eslint src/grading/rules
npx jest --config ./test/jest-e2e.json --runInBand rule-split rules-prices rubric-errors-service rubric-errors-copy error-exception
```
Expected: PASS. The Known-red ledger now has only `rules-routes` (A9), and `finish-attempt` / `investigator-run` will go red in A6 — fixed in the same task.

```bash
git add apps/api
git commit -m "feat(rules): library, revise, split and dismiss on ErrorRuleService; drop create/preview"
```

---

## Task A6: Sightings and proposals with context

**Files:**
- Modify: `apps/api/src/grading/rules/missing-rules.ts`, `apps/api/src/grading/scoring/score.service.ts` (`finishAttempt` passes the context)
- Create: `apps/api/src/grading/rules/proposal.service.ts`
- Modify: `apps/api/src/grading/grading.module.ts` (provider), `apps/api/src/grading/rules/rules.controller.ts` (re-add `GET rules/missing`)
- Modify (tests): `finish-attempt.e2e-spec.ts`, `investigator-run.e2e-spec.ts`
- Test: `apps/api/test/rule-proposals.e2e-spec.ts`

**Interfaces — Produces:**
```ts
recordMissingRules(m, teacherId, missing: readonly { description: string }[], ctx: { resultId: string; sessionId: string; rubricName: string }): Promise<number>
export interface ProposalItem { id: string; ruleKey: string; name: string; description: string; sightings: { sessions: { id: string; name: string }[]; results: number }; legacy: boolean }
ProposalService.list(teacherId: string, rubricName?: string): Promise<ProposalItem[]>
```

- [ ] **Step 1: Write the failing tests**

`apps/api/test/rule-proposals.e2e-spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { recordMissingRules } from '../src/grading/rules/missing-rules';
import { ProposalService } from '../src/grading/rules/proposal.service';
import { seedResult, seedSession } from './helpers/grading-seed';
import { rubricNameOf, seedInvestigatorSession, seedRuleOnly } from './helpers/investigator-seed';

describe('Lỗi AI đề xuất kèm ngữ cảnh (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let proposals: ProposalService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    ds = app.get(DataSource);
    proposals = app.get(ProposalService);
  });
  afterAll(async () => app.close());

  async function world(label: string) {
    const a = await seedSession(ds, `${label}-a`);
    await seedInvestigatorSession(ds, a);
    const b = await seedSession(ds, `${label}-b`, { teacherId: a.teacherId, startHoursAgo: 10 });
    await seedInvestigatorSession(ds, b);
    return { a, b, t: a.teacherId, nameA: await rubricNameOf(ds, a.rubricId), nameB: await rubricNameOf(ds, b.rubricId) };
  }
  const report = async (ctx: Awaited<ReturnType<typeof world>>['a'], rubricName: string, description: string) => {
    const { resultId } = await seedResult(ds, ctx, 'investigator');
    await ds.transaction((m) => recordMissingRules(m, ctx.teacherId, [{ description }], { resultId, sessionId: ctx.sessionId, rubricName }));
    return resultId;
  };

  it('T-RBE-API-6: ghi nhận MỘT lần mỗi (luật, bài); chạy lại không nhân đôi; bản sửa không còn "chua_gan"', async () => {
    const w = await world('pr6');
    const r = await report(w.a, w.nameA, 'Dùng biến toàn cục');
    await ds.transaction((m) => recordMissingRules(m, w.t, [{ description: 'Dùng biến toàn cục' }], { resultId: r, sessionId: w.a.sessionId, rubricName: w.nameA }));
    const [{ n }] = await ds.query(`SELECT count(*)::int AS n FROM examcollect.error_rule_sighting WHERE teacher_id = $1`, [w.t]);
    expect(n).toBe(1);
    const [rev] = await ds.query(
      `SELECT v.criterion_key FROM examcollect.error_rule r JOIN examcollect.error_rule_revision v ON v.id = r.current_revision_id WHERE r.teacher_id = $1 AND r.state = 'proposed'`,
      [w.t],
    );
    expect(rev.criterion_key).toBeNull();
  });

  it('T-RBE-API-6b: lỗi đã bị bỏ (dismissed) mà agent báo lại → KHÔNG ghi nhận thêm', async () => {
    const w = await world('pr6b');
    await report(w.a, w.nameA, 'Quên giải phóng bộ nhớ');
    await ds.query(`UPDATE examcollect.error_rule SET state = 'dismissed' WHERE teacher_id = $1`, [w.t]);
    await report(w.a, w.nameA, 'Quên giải phóng bộ nhớ');
    const [{ n }] = await ds.query(`SELECT count(*)::int AS n FROM examcollect.error_rule_sighting WHERE teacher_id = $1`, [w.t]);
    expect(n).toBe(1);
  });

  it('T-RBE-API-5: lọc theo rubric — số bài/phiên CỦA rubric đó; lỗi legacy (chưa từng có sighting) hiện ở mọi rubric', async () => {
    const w = await world('pr5');
    await report(w.a, w.nameA, 'Lỗi chỉ thấy ở A');
    await report(w.a, w.nameA, 'Lỗi chỉ thấy ở A');
    await report(w.b, w.nameB, 'Lỗi thấy ở cả hai');
    await report(w.a, w.nameA, 'Lỗi thấy ở cả hai');
    await seedRuleOnly(ds, w.t, 'cu_chua_ro_noi', null, 'proposed'); // legacy: không có sighting nào
    const forA = await proposals.list(w.t, w.nameA);
    expect(forA.map((p) => [p.name, p.sightings.results, p.legacy])).toEqual(
      expect.arrayContaining([['Lỗi chỉ thấy ở A', 2, false], ['Lỗi thấy ở cả hai', 1, false], ['cu_chua_ro_noi', 0, true]]),
    );
    expect(forA.find((p) => p.name === 'Lỗi chỉ thấy ở A')!.sightings.sessions).toEqual([{ id: w.a.sessionId, name: expect.any(String) }]);
    const forB = await proposals.list(w.t, w.nameB);
    expect(forB.map((p) => p.name).sort()).toEqual(['Lỗi thấy ở cả hai', 'cu_chua_ro_noi']);
    expect((await proposals.list(w.t)).length).toBe(3); // không lọc: mọi lỗi proposed
  });
});
```

Update the two existing tests that read proposals through the old API:
- `finish-attempt.e2e-spec.ts` (`hai bài báo cùng một luật còn thiếu…`): replace `const missing = await app.get(ErrorRuleService).missing(ctx.teacherId);` + the two `expect`s with
  ```ts
  const missing = await app.get(ProposalService).list(ctx.teacherId);
  expect(missing).toHaveLength(1);
  expect(missing[0]).toMatchObject({ name: 'Dùng biến toàn cục thay tham số', legacy: false, sightings: { results: 2 } });
  ```
  (import `ProposalService` instead of `ErrorRuleService`).
- `investigator-run.e2e-spec.ts` (line ~96, `missing()` has length 1): same replacement with `ProposalService.list`.

Run → FAIL (module `proposal.service` missing; `recordMissingRules` has no 4th parameter).

- [ ] **Step 2: Implement**

`missing-rules.ts`: delete `UNASSIGNED_CRITERION`, extend the function, and ghi sighting:

```ts
export interface MissingContext {
  resultId: string;
  sessionId: string;
  rubricName: string;
}

export async function recordMissingRules(
  m: EntityManager,
  teacherId: string,
  missing: readonly { description: string }[],
  ctx: MissingContext,
): Promise<number> {
  let created = 0;
  const seen = new Set<string>();
  for (const { description } of missing) {
    const text = description.trim();
    if (!text) continue;
    const ruleKey = missingRuleKey(text);
    if (seen.has(ruleKey)) continue;
    seen.add(ruleKey);
    const [rule] = await m.query(
      `INSERT INTO examcollect.error_rule (teacher_id, rule_key, origin, state)
       VALUES ($1, $2, 'agent_reported', 'proposed')
       ON CONFLICT (teacher_id, rule_key) DO NOTHING
       RETURNING id`,
      [teacherId, ruleKey],
    );
    if (rule) {
      // Tiêu chí KHÔNG còn là việc của agent: nó thuộc dòng áp dụng, do giảng viên chọn khi duyệt (spec D5).
      const [revision] = await m.query(
        `INSERT INTO examcollect.error_rule_revision (error_rule_id, revision, name, description, predicate, created_by)
         VALUES ($1, 1, $2, $3, NULL, $4) RETURNING id`,
        [rule.id, text.slice(0, 200), text, teacherId],
      );
      await m.query(`UPDATE examcollect.error_rule SET current_revision_id = $2 WHERE id = $1`, [rule.id, revision.id]);
      created++;
    }
    // Ghi nơi thấy — chỉ khi lỗi còn là đề xuất: lỗi đã duyệt hay đã bỏ thì không còn "thiếu".
    await m.query(
      `INSERT INTO examcollect.error_rule_sighting (teacher_id, error_rule_id, grading_result_id, exam_session_id, rubric_name)
       SELECT r.teacher_id, r.id, $3, $4, $5 FROM examcollect.error_rule r
        WHERE r.teacher_id = $1 AND r.rule_key = $2 AND r.state = 'proposed'
       ON CONFLICT (error_rule_id, grading_result_id) DO NOTHING`,
      [teacherId, ruleKey, ctx.resultId, ctx.sessionId, ctx.rubricName],
    );
  }
  return created;
}
```
Update the file's doc comment (*"Tiêu chí giữ chỗ"* paragraph removed; mention sightings).

`score.service.ts` `finishAttempt`: replace `await recordMissingRules(m, ctx.teacherId, stored.result.verdict.missingRules);` with
`await recordMissingRules(m, ctx.teacherId, stored.result.verdict.missingRules, { resultId, sessionId: ctx.sessionId, rubricName: ctx.rubricName });`.

`proposal.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export interface ProposalItem {
  id: string;
  ruleKey: string;
  name: string;
  description: string;
  /** Số liệu CỦA RUBRIC được hỏi (hoặc của mọi rubric khi không lọc). */
  sightings: { sessions: { id: string; name: string }[]; results: number };
  /** Báo trước khi có bảng ghi nhận nơi thấy: không biết thấy ở đâu, hiện ở mọi rubric (spec §4.3). */
  legacy: boolean;
}

/** Lỗi AI đề xuất (`proposed`) kèm nơi thấy. Chưa duyệt thì chưa vào điểm — bị loại khỏi điểm (§2.1, T-RULE-1). */
@Injectable()
export class ProposalService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async list(teacherId: string, rubricName?: string): Promise<ProposalItem[]> {
    const rows: {
      id: string; rule_key: string; name: string; description: string; has_any: boolean;
      grading_result_id: string | null; session_id: string | null; session_name: string | null;
    }[] = await this.ds.query(
      `SELECT r.id, r.rule_key, v.name, v.description,
              EXISTS (SELECT 1 FROM examcollect.error_rule_sighting x WHERE x.error_rule_id = r.id) AS has_any,
              s.grading_result_id, s.exam_session_id AS session_id, es.name AS session_name
         FROM examcollect.error_rule r
         JOIN examcollect.error_rule_revision v ON v.id = r.current_revision_id
         LEFT JOIN examcollect.error_rule_sighting s ON s.error_rule_id = r.id AND ($2::text IS NULL OR s.rubric_name = $2)
         LEFT JOIN examcollect.exam_session es ON es.id = s.exam_session_id
        WHERE r.teacher_id = $1 AND r.state = 'proposed'
          AND ($2::text IS NULL
               OR NOT EXISTS (SELECT 1 FROM examcollect.error_rule_sighting x WHERE x.error_rule_id = r.id)
               OR EXISTS (SELECT 1 FROM examcollect.error_rule_sighting x WHERE x.error_rule_id = r.id AND x.rubric_name = $2))
        ORDER BY r.created_at, r.rule_key, es.name`,
      [teacherId, rubricName ?? null],
    );
    const byRule = new Map<string, ProposalItem & { _results: Set<string>; _sessions: Map<string, string> }>();
    for (const r of rows) {
      let item = byRule.get(r.id);
      if (!item) {
        item = { id: r.id, ruleKey: r.rule_key, name: r.name, description: r.description, legacy: !r.has_any, sightings: { sessions: [], results: 0 }, _results: new Set(), _sessions: new Map() };
        byRule.set(r.id, item);
      }
      if (r.grading_result_id) item._results.add(r.grading_result_id);
      if (r.session_id) item._sessions.set(r.session_id, r.session_name ?? '');
    }
    return [...byRule.values()].map(({ _results, _sessions, ...item }) => ({
      ...item,
      sightings: { results: _results.size, sessions: [..._sessions].map(([id, name]) => ({ id, name })) },
    }));
  }
}
```

Register `ProposalService` in `grading.module.ts` providers; in `rules.controller.ts` re-add

```ts
  /** *Lỗi AI đề xuất* — spec §4.3. `rubricName` lọc theo nơi thấy. */
  @Get('rules/missing')
  @Roles('teacher')
  missing(@Req() req: Request, @Query('rubricName') rubricName?: string) {
    return this.proposals.list(req.user!.sub, rubricName);
  }
```
(inject `private readonly proposals: ProposalService`; import `Query`). Keep it declared **before** `rules/:id`.

- [ ] **Step 3: Run, lint, commit**

```powershell
pnpm exec tsc --noEmit -p tsconfig.json
pnpm exec eslint src/grading
npx jest --config ./test/jest-e2e.json --runInBand rule-proposals finish-attempt investigator-run rule-split
```
Expected: PASS.

```bash
git add apps/api
git commit -m "feat(rules): proposals carry sightings (rubric, session, results)"
```

---

## Task A7: Rubric overview

**Files:** Create `apps/api/src/grading/rules/rubric-overview.service.ts`; modify `grading.module.ts`; Test `apps/api/test/rubric-overview.e2e-spec.ts`.

**Interfaces — Produces:** `RubricOverview` (spec §4.1 verbatim) and `RubricOverviewService.overview(teacherId): Promise<RubricOverview[]>`.

- [ ] **Step 1: Write the failing test**

```ts
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { recordMissingRules } from '../src/grading/rules/missing-rules';
import { RubricErrorService } from '../src/grading/rules/rubric-error.service';
import { RubricOverviewService } from '../src/grading/rules/rubric-overview.service';
import { ScoreService } from '../src/grading/scoring/score.service';
import { TeacherReviewService } from '../src/grading/teacher-review.service';
import { seedCriterion, seedResult, seedSession } from './helpers/grading-seed';
import {
  assignmentId, rubricNameOf, seedAssignment, seedAssignmentPrices, seedInvestigatorResult, seedInvestigatorSession, seedRule, seedRuleOnly, storedWith,
} from './helpers/investigator-seed';

describe('Tổng quan rubric (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let overview: RubricOverviewService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    ds = app.get(DataSource);
    overview = app.get(RubricOverviewService);
  });
  afterAll(async () => app.close());

  it('T-RBE-API-1: đếm tiêu chí rỗng / chưa có điểm trừ / mồ côi / đề xuất; học kỳ suy từ phiên; trạng thái phiên đúng ba giá trị; sắp theo bản lưu mới nhất', async () => {
    const a = await seedSession(ds, 'ov-a');
    await seedInvestigatorSession(ds, a); // tinh_dung 6, trinh_bay 4
    await seedCriterion(ds, a.rubricId, 'hieu_nang', 2);
    const t = a.teacherId;
    const nameA = await rubricNameOf(ds, a.rubricId);
    // Phiên thứ hai (rubric thứ hai, mới lưu hơn) chưa chấm bài nào → not_started.
    const b = await seedSession(ds, 'ov-b', { teacherId: t, startHoursAgo: 10 });
    await seedInvestigatorSession(ds, b);
    const nameB = await rubricNameOf(ds, b.rubricId);
    await ds.query(`UPDATE examcollect.rubric SET created_at = now() + interval '1 minute' WHERE id = $1`, [b.rubricId]);

    const x = await seedRuleOnly(ds, t, 'x');
    const y = await seedRuleOnly(ds, t, 'y');
    const ax = await seedAssignment(ds, t, nameA, x.ruleId, 'tinh_dung');
    const ay = await seedAssignment(ds, t, nameA, y.ruleId, 'trinh_bay');
    await seedAssignmentPrices(ds, t, { [ax]: '1.00', [ay]: null }); // y chưa có điểm trừ
    // Dòng mồ côi: gắn tiêu chí chỉ có ở bản 1, rồi lưu bản 2 không có nó.
    const z = await seedRuleOnly(ds, t, 'z');
    await seedAssignment(ds, t, nameA, z.ruleId, 'hieu_nang');
    const [v2] = await ds.query(`INSERT INTO examcollect.rubric (version, teacher_id, name) VALUES (2, $1, $2) RETURNING id`, [t, nameA]);
    await seedCriterion(ds, v2.id, 'tinh_dung', 6);
    await seedCriterion(ds, v2.id, 'trinh_bay', 4);
    await seedCriterion(ds, v2.id, 'rong', 1); // tiêu chí chưa có lỗi nào
    // Một lỗi AI đề xuất thấy ở A.
    const { resultId } = await seedResult(ds, a, 'investigator');
    await ds.transaction((m) => recordMissingRules(m, t, [{ description: 'Đề xuất mới' }], { resultId, sessionId: a.sessionId, rubricName: nameA }));
    // Phiên A: hai kết quả đang chấm; học kỳ cố định.
    await ds.query(`UPDATE examcollect.exam_session SET semester_name = 'HK1 2026-2027' WHERE id = ANY($1)`, [[a.sessionId, b.sessionId]]);

    const list = await overview.overview(t);
    expect(list.map((o) => o.rubricName)).toEqual([nameB, nameA]); // B lưu mới hơn
    const ovA = list.find((o) => o.rubricName === nameA)!;
    expect(ovA.rubricId).toBe(v2.id);
    expect(ovA.errorCount).toBe(3);
    expect(ovA.unpricedCount).toBe(2); // y (null) và z (không có dòng giá)
    expect(ovA.danglingCount).toBe(1); // z → hieu_nang không còn ở bản 2
    expect(ovA.proposalCount).toBe(1);
    expect(ovA.criteria.map((c) => [c.key, c.errorCount])).toEqual(expect.arrayContaining([['tinh_dung', 1], ['trinh_bay', 1], ['rong', 0]]));
    expect(ovA.sessions).toEqual([{ id: a.sessionId, name: expect.any(String), semesterName: 'HK1 2026-2027', state: 'grading', resultCount: 1 }]);
    expect(ovA.semesters).toEqual(['HK1 2026-2027']);
    const ovB = list.find((o) => o.rubricName === nameB)!;
    expect(ovB.sessions).toEqual([{ id: b.sessionId, name: expect.any(String), semesterName: 'HK1 2026-2027', state: 'not_started', resultCount: 0 }]);
  });

  it('phiên đã chốt hết → finalized; rubric chưa có phiên → semesters rỗng', async () => {
    const a = await seedSession(ds, 'ov-fin');
    await seedInvestigatorSession(ds, a);
    const nameA = await rubricNameOf(ds, a.rubricId);
    const bien = await seedRule(ds, a.teacherId, 'sai_bien', 'tinh_dung', { kind: 'test_group_failed', group: 'bien' });
    const ten = await seedRule(ds, a.teacherId, 'ten_bien', 'trinh_bay');
    const { seedPrices } = await import('./helpers/investigator-seed');
    await seedPrices(ds, a.teacherId, { [bien.ruleId]: '1.50', [ten.ruleId]: '0.50' });
    const { resultId } = await seedInvestigatorResult(ds, a, storedWith([{ ruleKey: 'sai_bien', checkedBy: 'machine' }, { ruleKey: 'ten_bien', checkedBy: 'model' }]));
    await app.get(ScoreService).computeInitial(resultId);
    await app.get(TeacherReviewService).finalizeGrades(a.sessionId, a.teacherId);
    const ov = (await overview.overview(a.teacherId)).find((o) => o.rubricName === nameA)!;
    expect(ov.sessions[0]).toMatchObject({ state: 'finalized', resultCount: 1 });
    const lone = await seedSession(ds, 'ov-lone');
    await ds.query(`UPDATE examcollect.exam_session SET rubric_id = NULL WHERE id = $1`, [lone.sessionId]);
    const loneOv = (await overview.overview(lone.teacherId)).find((o) => o.rubricName === (await rubricNameOf(ds, lone.rubricId)))!;
    expect(loneOv.sessions).toEqual([]);
    expect(loneOv.semesters).toEqual([]);
  });

  it('đánh dấu "không trừ điểm" hiện ở criteria[].waiverId', async () => {
    const a = await seedSession(ds, 'ov-waiver');
    await seedInvestigatorSession(ds, a);
    const [w] = await ds.query(`INSERT INTO examcollect.criterion_waiver (rubric_id, criterion_key, set_by) VALUES ($1, 'trinh_bay', $2) RETURNING id`, [a.rubricId, a.teacherId]);
    const ov = (await overview.overview(a.teacherId)).find((o) => o.rubricId === a.rubricId)!;
    expect(ov.criteria.find((c) => c.key === 'trinh_bay')!.waiverId).toBe(w.id);
    expect(ov.criteria.find((c) => c.key === 'tinh_dung')!.waiverId).toBeNull();
    expect(app.get(RubricErrorService)).toBeDefined();
    expect(assignmentId).toBeDefined();
  });
});
```
(The last two `expect`s only keep the unused-import linter quiet; delete the unused imports `RubricErrorService`, `assignmentId` instead if lint allows — the executor should remove them.)

Run → FAIL (`rubric-overview.service` missing).

- [ ] **Step 2: Implement**

```ts
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export interface RubricOverview {
  rubricName: string;
  /** Phiên bản mới nhất — dùng cho đánh dấu tiêu chí và hộp thoại sửa. */
  rubricId: string;
  totalPoints: number;
  criteria: { key: string; description: string; maxPoints: number; errorCount: number; waiverId: string | null }[];
  errorCount: number;
  unpricedCount: number;
  /** Dòng áp dụng gắn tiêu chí không còn ở bản mới nhất (spec §2.3.4). */
  danglingCount: number;
  /** Lỗi AI đề xuất thấy ở rubric này + lỗi cũ chưa rõ nơi thấy. */
  proposalCount: number;
  sessions: { id: string; name: string; semesterName: string; state: 'not_started' | 'grading' | 'finalized'; resultCount: number }[];
  semesters: string[];
}

/** Một phần tử cho MỖI rubric (theo tên): nuôi ô chọn, trạng thái và dải việc cần làm (spec §4.1). */
@Injectable()
export class RubricOverviewService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async overview(teacherId: string): Promise<RubricOverview[]> {
    const versions: { id: string; name: string; version: number; created_at: Date }[] = await this.ds.query(
      `SELECT id, name, version, created_at FROM examcollect.rubric WHERE teacher_id = $1 ORDER BY name, version DESC`,
      [teacherId],
    );
    const latest = new Map<string, { id: string; created_at: Date }>();
    for (const v of versions) {
      const cur = latest.get(v.name);
      if (!cur || v.created_at > cur.created_at) latest.set(v.name, { id: v.id, created_at: v.created_at });
    }
    if (latest.size === 0) return [];
    const latestIds = [...latest.values()].map((l) => l.id);

    const criteria: { rubric_id: string; key: string; description: string; max_points: string }[] = await this.ds.query(
      `SELECT rubric_id, key, description, max_points FROM examcollect.rubric_criterion
        WHERE rubric_id = ANY($1::uuid[]) ORDER BY sort_order, created_at, key`,
      [latestIds],
    );
    const waivers: { id: string; rubric_id: string; criterion_key: string }[] = await this.ds.query(
      `SELECT id, rubric_id, criterion_key FROM examcollect.criterion_waiver WHERE rubric_id = ANY($1::uuid[]) AND revoked_at IS NULL`,
      [latestIds],
    );
    const apps: { rubric_name: string; criterion_key: string; deduction: string | null }[] = await this.ds.query(
      `SELECT re.rubric_name, re.criterion_key, p.deduction
         FROM examcollect.rubric_error re
         JOIN examcollect.error_rule r ON r.id = re.error_rule_id AND r.state = 'active'
         LEFT JOIN examcollect.rubric_error_price p ON p.rubric_error_id = re.id
          AND p.price_table_version_id = (SELECT id FROM examcollect.price_table_version WHERE teacher_id = $1 ORDER BY version DESC LIMIT 1)
        WHERE re.teacher_id = $1 AND re.removed_at IS NULL`,
      [teacherId],
    );
    const sightingRows: { rubric_name: string; n: number }[] = await this.ds.query(
      `SELECT s.rubric_name, count(DISTINCT s.error_rule_id)::int AS n
         FROM examcollect.error_rule_sighting s
         JOIN examcollect.error_rule r ON r.id = s.error_rule_id AND r.state = 'proposed'
        WHERE s.teacher_id = $1 GROUP BY s.rubric_name`,
      [teacherId],
    );
    const [{ legacy }] = await this.ds.query(
      `SELECT count(*)::int AS legacy FROM examcollect.error_rule r
        WHERE r.teacher_id = $1 AND r.state = 'proposed'
          AND NOT EXISTS (SELECT 1 FROM examcollect.error_rule_sighting x WHERE x.error_rule_id = r.id)`,
      [teacherId],
    );
    const sessions: { id: string; name: string; semester_name: string; rubric_name: string; total: number; published: number }[] = await this.ds.query(
      `SELECT es.id, es.name, es.semester_name, rb.name AS rubric_name,
              count(g.id)::int AS total,
              count(g.id) FILTER (WHERE g.status IN ('finalized', 'exported'))::int AS published
         FROM examcollect.exam_session es
         JOIN examcollect.rubric rb ON rb.id = es.rubric_id
         LEFT JOIN examcollect.submission s ON s.exam_session_id = es.id
         LEFT JOIN examcollect.grading_result g ON g.submission_id = s.id
        WHERE es.teacher_id = $1
        GROUP BY es.id, es.name, es.semester_name, rb.name, es.start_time
        ORDER BY es.start_time DESC`,
      [teacherId],
    );

    const out: (RubricOverview & { _at: Date })[] = [];
    for (const [rubricName, { id, created_at }] of latest) {
      const crit = criteria.filter((c) => c.rubric_id === id);
      const keys = new Set(crit.map((c) => c.key));
      const mine = apps.filter((a) => a.rubric_name === rubricName);
      const rubricSessions = sessions
        .filter((s) => s.rubric_name === rubricName)
        .map((s) => ({
          id: s.id,
          name: s.name,
          semesterName: s.semester_name,
          state: (s.total === 0 ? 'not_started' : s.published === s.total ? 'finalized' : 'grading') as 'not_started' | 'grading' | 'finalized',
          resultCount: s.total,
        }));
      out.push({
        _at: created_at,
        rubricName,
        rubricId: id,
        totalPoints: Math.round(crit.reduce((sum, c) => sum + Number(c.max_points), 0) * 100) / 100,
        criteria: crit.map((c) => ({
          key: c.key,
          description: c.description,
          maxPoints: Number(c.max_points),
          errorCount: mine.filter((a) => a.criterion_key === c.key).length,
          waiverId: waivers.find((w) => w.rubric_id === id && w.criterion_key === c.key)?.id ?? null,
        })),
        errorCount: mine.length,
        unpricedCount: mine.filter((a) => a.deduction === null).length,
        danglingCount: mine.filter((a) => !keys.has(a.criterion_key)).length,
        proposalCount: (sightingRows.find((s) => s.rubric_name === rubricName)?.n ?? 0) + legacy,
        sessions: rubricSessions,
        semesters: [...new Set(rubricSessions.map((s) => s.semesterName))],
      });
    }
    return out.sort((a, b) => b._at.getTime() - a._at.getTime()).map(({ _at, ...o }) => o);
  }
}
```
Register in `grading.module.ts` providers.

- [ ] **Step 3: Run, lint, commit**

```powershell
pnpm exec tsc --noEmit -p tsconfig.json
pnpm exec eslint src/grading/rules
npx jest --config ./test/jest-e2e.json --runInBand rubric-overview
```
Expected: PASS.

```bash
git add apps/api
git commit -m "feat(rules): rubric overview (readiness inputs, sessions, semesters)"
```

---

## Task A8: Carry "không trừ điểm" marks across rubric versions

**Files:** Modify `apps/api/src/grading/rubric.service.ts` (`saveNewVersion`); Test `apps/api/test/rubric-waiver-carry.e2e-spec.ts`.

- [ ] **Step 1: Write the failing test**

```ts
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { RubricService } from '../src/grading/rubric.service';
import { seedTeacher } from './helpers/grading-seed';

describe('Đánh dấu "không trừ điểm" theo qua phiên bản rubric (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let rubrics: RubricService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    ds = app.get(DataSource);
    rubrics = app.get(RubricService);
  });
  afterAll(async () => app.close());

  it('T-RBE-WAIVER-1: lưu bản mới chép đánh dấu còn hiệu lực cho tiêu chí còn lại, bỏ tiêu chí đã xoá; đánh dấu đã gỡ không theo sang', async () => {
    const t = await seedTeacher(ds, 'wv');
    const name = `Rubric wv ${Date.now()}`;
    const v1 = await rubrics.saveNewVersion(t, {
      name,
      criteria: [
        { description: 'Tính đúng', maxPoints: 6, key: 'tinh_dung' },
        { description: 'Trình bày', maxPoints: 2, key: 'trinh_bay' },
        { description: 'Hiệu năng', maxPoints: 2, key: 'hieu_nang' },
      ],
    });
    const mark = async (key: string, revoked = false) => {
      const [row] = await ds.query(
        `INSERT INTO examcollect.criterion_waiver (rubric_id, criterion_key, set_by, revoked_at, revoked_by)
         VALUES ($1, $2, $3, ${revoked ? 'now()' : 'NULL'}, ${revoked ? '$3' : 'NULL'}) RETURNING id`,
        [v1.id, key, t],
      );
      return row.id as string;
    };
    await mark('trinh_bay');
    await mark('hieu_nang');
    await mark('tinh_dung', true); // đã gỡ — không theo sang
    const v2 = await rubrics.saveNewVersion(t, {
      name,
      criteria: [
        { description: 'Tính đúng', maxPoints: 6, key: 'tinh_dung' },
        { description: 'Trình bày', maxPoints: 4, key: 'trinh_bay' },
      ], // bỏ hieu_nang
    });
    const carried = await ds.query(
      `SELECT criterion_key FROM examcollect.criterion_waiver WHERE rubric_id = $1 AND revoked_at IS NULL ORDER BY criterion_key`,
      [v2.id],
    );
    expect(carried.map((c: { criterion_key: string }) => c.criterion_key)).toEqual(['trinh_bay']);
    // Bản cũ giữ nguyên đánh dấu của nó (hồ sơ).
    const old = await ds.query(`SELECT count(*)::int AS n FROM examcollect.criterion_waiver WHERE rubric_id = $1 AND revoked_at IS NULL`, [v1.id]);
    expect(old[0].n).toBe(2);
  });

  it('rubric lần đầu (không có bản trước) không sinh đánh dấu nào', async () => {
    const t = await seedTeacher(ds, 'wv-first');
    const v1 = await rubrics.saveNewVersion(t, { name: `R ${Date.now()}`, criteria: [{ description: 'A', maxPoints: 1, key: 'a' }] });
    expect(await ds.query(`SELECT 1 FROM examcollect.criterion_waiver WHERE rubric_id = $1`, [v1.id])).toHaveLength(0);
  });
});
```
Run → FAIL (carried list is `[]`).

- [ ] **Step 2: Implement**

In `RubricService.saveNewVersion`, after the `manager.save(RubricCriterionEntity, …)` call and before `return this.toView(...)`, add:

```ts
      // Đánh dấu "tiêu chí này không trừ điểm" gắn PHIÊN BẢN, nên lưu bản mới là mất. Với D2 (rubric là danh tính
      // theo tên) giảng viên không biết "phiên bản" là gì — chép các đánh dấu còn hiệu lực sang bản mới cho
      // những tiêu chí còn tồn tại ở đó (spec §3.7). Bản cũ giữ nguyên của nó.
      if (latest) {
        await manager.query(
          `INSERT INTO examcollect.criterion_waiver (rubric_id, criterion_key, set_by, set_at)
           SELECT $1, w.criterion_key, w.set_by, w.set_at
             FROM examcollect.criterion_waiver w
            WHERE w.rubric_id = $2 AND w.revoked_at IS NULL
              AND EXISTS (SELECT 1 FROM examcollect.rubric_criterion rc WHERE rc.rubric_id = $1 AND rc.key = w.criterion_key)`,
          [rubric.id, latest.id],
        );
      }
```
(`latest` is the variable already in scope at the top of the method.)

- [ ] **Step 3: Run, lint, commit**

```powershell
pnpm exec tsc --noEmit -p tsconfig.json
npx jest --config ./test/jest-e2e.json --runInBand rubric-waiver-carry criterion-waiver session-rubric
```
Expected: PASS.

```bash
git add apps/api
git commit -m "feat(rules): carry active criterion waivers into new rubric versions"
```

---

## Task A9: HTTP layer — controllers, DTOs, routes, route e2e

**Files:**
- Create: `apps/api/src/grading/rules/rubric-errors.controller.ts`, `apps/api/src/grading/rules/dto/rubric-error.dto.ts`
- Modify: `apps/api/src/grading/rules/rules.controller.ts`, `apps/api/src/grading/grading.module.ts` (controllers)
- Test: `apps/api/test/rubric-errors-routes.e2e-spec.ts`; rewrite the removed first tests of `apps/api/test/rules-routes.e2e-spec.ts`

**Interfaces — Produces (HTTP):**

| Method | Path | Body / query | Response |
|---|---|---|---|
| GET | `/rubric-errors/overview` | — | `RubricOverview[]` |
| GET | `/rubric-errors?rubricName=` | — | `RubricErrorItem[]` |
| POST | `/rubric-errors` | `AssignInput` | `AssignResult` |
| POST | `/rubric-errors/copy` | `{ fromRubricName, toRubricName }` | `{ copied, skippedNoCriterion, skippedExisting, recompute }` |
| PATCH | `/rubric-errors/:id` | `{ criterionKey }` | `{ recompute }` |
| DELETE | `/rubric-errors/:id` | — | `{ recompute }` |
| PUT | `/rubric-errors/:id/price` | `{ deduction: string \| null }` | `{ versionId, recompute }` |
| POST | `/rubric-errors/:id/price/preview` | `{ deduction }` | `PricePreview` |
| GET | `/rules` | — | `LibraryRule[]` |
| GET | `/rules/missing?rubricName=` | — | `ProposalItem[]` |
| PATCH | `/rules/:id` | `RuleChanges` | `{ revisionId, recompute }` |
| POST | `/rules/:id/split` | `{ rubricName, changes }` | `{ ruleId, rubricErrorId, recompute }` |
| POST | `/rules/:id/state` | `{ state: 'dismissed' \| 'retired' }` | `{ recompute }` |

- [ ] **Step 1: Write the failing route test**

`apps/api/test/rubric-errors-routes.e2e-spec.ts` (HTTP, supertest — same bootstrapping as `rules-routes.e2e-spec.ts`: `ValidationPipe({ whitelist: true, transform: true })`, `PostgresExceptionFilter`, `login()` helper creating two teachers):

```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { createTestAccount } from './helpers/create-account';
import { seedCriterion, seedSession } from './helpers/grading-seed';
import { rubricNameOf } from './helpers/investigator-seed';

describe('Route lỗi theo rubric (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  const stamp = Date.now();
  let idA: string;
  let tokenA: string;
  let tokenB: string;
  let nameA: string;
  let nameB: string;

  async function login(label: string): Promise<{ id: string; token: string }> {
    const email = `rbe_${label}_${stamp}@example.com`;
    const id = await createTestAccount(ds, { email, password: 'correct-horse-battery', role: 'teacher' });
    const res = await request(app.getHttpServer()).post('/auth/login').send({ email, password: 'correct-horse-battery' });
    return { id, token: res.body.accessToken as string };
  }
  const as = (token: string) => ({ Authorization: `Bearer ${token}` });
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();
    ds = app.get(DataSource);
    const a = await login('a');
    idA = a.id;
    tokenA = a.token;
    tokenB = (await login('b')).token;
    // Hai rubric của A (mỗi cái một phiên) với `tinh_dung`, `trinh_bay`.
    for (const label of ['x', 'y']) {
      const ctx = await seedSession(ds, `rbe-${label}`, { teacherId: idA, startHoursAgo: label === 'x' ? 20 : 40 });
      await seedCriterion(ds, ctx.rubricId, 'tinh_dung', 6);
      await seedCriterion(ds, ctx.rubricId, 'trinh_bay', 4);
      if (label === 'x') nameA = await rubricNameOf(ds, ctx.rubricId);
      else nameB = await rubricNameOf(ds, ctx.rubricId);
    }
  }, 60_000);
  afterAll(async () => app.close());

  it('thêm lỗi mới → 201; GET theo rubric thấy nó; trùng → 409; không token → 401; rubric lạ → 404; tiêu chí lạ → 400', async () => {
    const body = { rubricName: nameA, criterionKey: 'tinh_dung', deduction: '1.50', newRule: { name: 'Sai ca biên', description: 'Nhóm biên không đạt', predicate: { kind: 'test_group_failed', group: 'bien' } } };
    const created = await http().post('/rubric-errors').set(as(tokenA)).send(body);
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ rubricErrorId: expect.any(String), ruleId: expect.any(String) });
    const list = await http().get('/rubric-errors').query({ rubricName: nameA }).set(as(tokenA));
    expect(list.status).toBe(200);
    expect(list.body.map((i: { ruleKey: string; deduction: string }) => [i.ruleKey, i.deduction])).toEqual([['sai_ca_bien', '1.50']]);
    expect((await http().post('/rubric-errors').set(as(tokenA)).send({ ...body, newRule: undefined, ruleId: created.body.ruleId })).status).toBe(409);
    expect((await http().post('/rubric-errors').send(body)).status).toBe(401);
    expect((await http().post('/rubric-errors').set(as(tokenA)).send({ ...body, rubricName: 'Không có' })).status).toBe(404);
    expect((await http().post('/rubric-errors').set(as(tokenA)).send({ ...body, criterionKey: 'khong_co' })).status).toBe(400);
    expect((await http().post('/rubric-errors').set(as(tokenA)).send({ ...body, deduction: 1.5 })).status).toBe(400); // số JSON bị từ chối
    expect((await http().post('/rubric-errors').set(as(tokenA)).send({ rubricName: nameA, criterionKey: 'tinh_dung' })).status).toBe(400); // thiếu ruleId/newRule
    expect((await http().get('/rubric-errors').query({ rubricName: nameA }).set(as(tokenB))).status).toBe(404);
  });

  it('điểm trừ: xem trước không sinh phiên bản; lưu sinh đúng một; giảng viên khác → 404; số JSON → 400', async () => {
    const list = await http().get('/rubric-errors').query({ rubricName: nameA }).set(as(tokenA));
    const id = list.body[0].id as string;
    const versions = async () => (await ds.query(`SELECT count(*)::int AS n FROM examcollect.price_table_version WHERE teacher_id = $1`, [idA]))[0].n as number;
    const before = await versions();
    const preview = await http().post(`/rubric-errors/${id}/price/preview`).set(as(tokenA)).send({ deduction: '2.00' });
    expect(preview.status).toBe(200);
    expect(preview.body).toEqual({ openSessions: [], finalizedSessions: [] });
    expect(await versions()).toBe(before);
    const put = await http().put(`/rubric-errors/${id}/price`).set(as(tokenA)).send({ deduction: '2.00' });
    expect(put.status).toBe(200);
    expect(await versions()).toBe(before + 1);
    expect((await http().put(`/rubric-errors/${id}/price`).set(as(tokenB)).send({ deduction: '3.00' })).status).toBe(404);
    expect((await http().put(`/rubric-errors/${id}/price`).set(as(tokenA)).send({ deduction: 1.5 })).status).toBe(400);
    expect((await http().put(`/rubric-errors/not-a-uuid/price`).set(as(tokenA)).send({ deduction: '1.00' })).status).toBe(400);
  });

  it('sao chép giữa rubric, chuyển tiêu chí, gỡ; nguồn = đích → 400', async () => {
    const copy = await http().post('/rubric-errors/copy').set(as(tokenA)).send({ fromRubricName: nameA, toRubricName: nameB });
    expect(copy.status).toBe(201);
    expect(copy.body).toMatchObject({ copied: 1, skippedNoCriterion: 0, skippedExisting: 0 });
    expect((await http().post('/rubric-errors/copy').set(as(tokenA)).send({ fromRubricName: nameA, toRubricName: nameA })).status).toBe(400);
    const inB = (await http().get('/rubric-errors').query({ rubricName: nameB }).set(as(tokenA))).body[0] as { id: string; deduction: string };
    expect(inB.deduction).toBe('2.00');
    expect((await http().patch(`/rubric-errors/${inB.id}`).set(as(tokenA)).send({ criterionKey: 'trinh_bay' })).status).toBe(200);
    expect((await http().patch(`/rubric-errors/${inB.id}`).set(as(tokenA)).send({ criterionKey: 'khong_co' })).status).toBe(400);
    expect((await http().delete(`/rubric-errors/${inB.id}`).set(as(tokenA))).status).toBe(200);
    expect((await http().get('/rubric-errors').query({ rubricName: nameB }).set(as(tokenA))).body).toEqual([]);
  });

  it('overview và thư viện: GET /rubric-errors/overview, GET /rules (uses), PATCH, split, state; route đã gỡ trả 404', async () => {
    const overview = await http().get('/rubric-errors/overview').set(as(tokenA));
    expect(overview.status).toBe(200);
    expect(overview.body.map((o: { rubricName: string }) => o.rubricName).sort()).toEqual([nameA, nameB].sort());
    const lib = await http().get('/rules').set(as(tokenA));
    const rule = lib.body.find((r: { ruleKey: string }) => r.ruleKey === 'sai_ca_bien') as { id: string; uses: unknown[] };
    expect(rule.uses).toHaveLength(1);
    const patched = await http().patch(`/rules/${rule.id}`).set(as(tokenA)).send({ name: 'Sai ca biên (đã sửa)' });
    expect(patched.status).toBe(200);
    expect(patched.body.revisionId).toEqual(expect.any(String));
    expect((await http().patch(`/rules/${rule.id}`).set(as(tokenA)).send({ criterionKey: 'x' })).status).toBe(200); // trường lạ bị whitelist bỏ, không lỗi
    expect((await http().post(`/rules/${rule.id}/split`).set(as(tokenA)).send({ rubricName: nameA, changes: { name: 'Tách' } })).status).toBe(409); // chỉ ở 1 rubric
    const missing = await http().get('/rules/missing').query({ rubricName: nameA }).set(as(tokenA));
    expect(missing.status).toBe(200);
    expect((await http().post(`/rules/${rule.id}/state`).set(as(tokenA)).send({ state: 'active' })).status).toBe(400);
    expect((await http().post(`/rules/${rule.id}/state`).set(as(tokenA)).send({ state: 'retired' })).status).toBe(200);
    for (const [method, path] of [['post', '/rules'], ['post', '/rules/preview'], ['put', `/rules/${rule.id}/price`], ['post', `/rules/${rule.id}/price/preview`]] as const) {
      expect((await http()[method](path).set(as(tokenA)).send({})).status).toBe(404);
    }
  });
});
```
Run → FAIL (404 on `/rubric-errors`).

- [ ] **Step 2: DTOs and controllers**

`dto/rubric-error.dto.ts`:

```ts
import { Allow, IsOptional, IsString, IsUUID, Matches } from 'class-validator';

/** Mọi trường khai ở đây để `ValidationPipe({ whitelist: true })` không lột mất; kiểm THẬT ở `parseAssignInput`. */
export class AssignErrorDto {
  @IsString() rubricName!: string;
  @IsString() criterionKey!: string;
  @IsOptional() @Allow() deduction?: unknown;
  @IsOptional() @IsUUID() ruleId?: string;
  @IsOptional() @Allow() newRule?: unknown;
  @IsOptional() @Allow() changes?: unknown;
}

export class MoveErrorDto {
  @IsString()
  @Matches(/^[a-z0-9_]{1,64}$/)
  criterionKey!: string;
}

export class CopyErrorsDto {
  @IsString() fromRubricName!: string;
  @IsString() toRubricName!: string;
}

export class SplitRuleDto {
  @IsString() rubricName!: string;
  @IsOptional() @Allow() changes?: unknown;
}
```

`rubric-errors.controller.ts`:

```ts
import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { AssignErrorDto, CopyErrorsDto, MoveErrorDto } from './dto/rubric-error.dto';
import { PriceBodyDto } from './dto/price-body.dto';
import { PriceService } from './price.service';
import { parseAssignInput, parseDeduction } from './rule-input';
import { RubricErrorService } from './rubric-error.service';
import { RubricOverviewService } from './rubric-overview.service';

/**
 * Lỗi theo rubric (spec 2026-10-07 §4.1–4.2): dòng áp dụng, điểm trừ, sao chép. Giảng viên lấy từ JWT; không
 * route nào nhận `teacherId` ở body; dòng/rubric của người khác → 404 (T-POL-8). Route tĩnh (`overview`,
 * `copy`) khai TRƯỚC `:id`.
 */
@Controller('rubric-errors')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RubricErrorsController {
  constructor(
    private readonly errors: RubricErrorService,
    private readonly prices: PriceService,
    private readonly overview: RubricOverviewService,
  ) {}

  @Get('overview')
  @Roles('teacher')
  getOverview(@Req() req: Request) {
    return this.overview.overview(req.user!.sub);
  }

  @Post('copy')
  @Roles('teacher')
  copy(@Req() req: Request, @Body() dto: CopyErrorsDto) {
    return this.errors.copy(req.user!.sub, dto.fromRubricName, dto.toRubricName);
  }

  @Get()
  @Roles('teacher')
  list(@Req() req: Request, @Query('rubricName') rubricName?: string) {
    if (!rubricName) throw new BadRequestException('Thiếu rubricName');
    return this.errors.list(req.user!.sub, rubricName);
  }

  @Post()
  @Roles('teacher')
  assign(@Req() req: Request, @Body() dto: AssignErrorDto) {
    return this.errors.assign(req.user!.sub, parseAssignInput(dto));
  }

  @Patch(':id')
  @Roles('teacher')
  move(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request, @Body() dto: MoveErrorDto) {
    return this.errors.move(req.user!.sub, id, dto.criterionKey);
  }

  @Delete(':id')
  @Roles('teacher')
  @HttpCode(200)
  remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    return this.errors.remove(req.user!.sub, id);
  }

  /** *"Lưu thì điều gì xảy ra"* (spec UI 3.1, T-POL-5) — KHÔNG ghi. */
  @Post(':id/price/preview')
  @Roles('teacher')
  @HttpCode(200)
  pricePreview(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request, @Body() dto: PriceBodyDto) {
    return this.prices.preview(req.user!.sub, id, parseDeduction(dto.deduction));
  }

  /** Một phiên bản bảng giá mới + tính lại bài chưa chốt của đúng rubric đó (§2.2). */
  @Put(':id/price')
  @Roles('teacher')
  setPrice(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request, @Body() dto: PriceBodyDto) {
    return this.prices.setPrice(req.user!.sub, id, parseDeduction(dto.deduction), req.user!.sub);
  }
}
```

`rules.controller.ts` (final): constructor takes `ErrorRuleService`, `ProposalService`, `CriterionWaiverService`; routes in order `GET rules` → `library`, `GET rules/missing`, `PATCH rules/:id` (`parseRuleChanges`), `POST rules/:id/split` (`SplitRuleDto`, `parseRuleChanges(dto.changes ?? {})`), `POST rules/:id/state`, then the unchanged three waiver routes. Register `RubricErrorsController` in `grading.module.ts` `controllers`.

- [ ] **Step 3: Restore the remaining `rules-routes.e2e-spec.ts` coverage**

The tests deleted in A2/A5 are covered by the new suite; keep the manual-score/exception/reapply and waiver tests there unchanged. Confirm `rules-routes` no longer imports the removed helpers (`rule()` factory can go).

- [ ] **Step 4: Run, lint, commit**

```powershell
pnpm exec tsc --noEmit -p tsconfig.json
pnpm exec eslint src/grading
npx jest --config ./test/jest-e2e.json --runInBand rubric-errors-routes rules-routes
```
Expected: PASS (the Known-red ledger is now empty).

```bash
git add apps/api
git commit -m "feat(rules): rubric-errors routes, library and split routes, DTOs"
```

---

## Task A10: Rehearsal CLI, ui-e2e seed, whole-suite sweep

**Files:**
- Modify: `apps/api/src/eval/rehearsal/cli.ts` (`ensureRubricAndRules`), `apps/api/test/ui-e2e/seed.ts` (only if a suite below shows it red), `apps/api/test/ui-e2e/README.md` (wording)
- Verify (no edit expected): `apps/api/src/eval/**` specs, `score-core.spec.ts`

- [ ] **Step 1: Make the rehearsal CLI use the new routes**

Replace `ensureRubricAndRules` in `apps/api/src/eval/rehearsal/cli.ts`:

```ts
async function ensureRubricAndRules(s: RehearsalScenario): Promise<string> {
  const rubrics = itemsOf<{ id: string; name: string }>(await api('GET', '/rubrics'));
  const rubric = rubrics.find((r) => r.name === s.rubric.name) ?? (await api<{ id: string }>('POST', '/rubrics', s.rubric));
  // Lỗi đã có ở rubric này (theo ruleKey) thì bỏ qua; lỗi đã có trong thư viện nhưng chưa áp thì thêm bằng ruleId.
  const here = itemsOf<{ ruleKey: string }>(await api('GET', `/rubric-errors?rubricName=${encodeURIComponent(s.rubric.name)}`));
  const library = itemsOf<{ id: string; ruleKey: string }>(await api('GET', '/rules'));
  for (const rule of s.rules) {
    if (here.some((r) => r.ruleKey === rule.ruleKey)) continue;
    const known = library.find((r) => r.ruleKey === rule.ruleKey);
    const base = { rubricName: s.rubric.name, criterionKey: rule.criterionKey, deduction: String(rule.price) };
    await api(
      'POST',
      '/rubric-errors',
      known
        ? { ...base, ruleId: known.id }
        // `ruleKey` tường minh: lệnh diễn tập so kết quả theo khoá cố định của kịch bản.
        : { ...base, newRule: { ruleKey: rule.ruleKey, name: rule.name, description: rule.description, predicate: rule.predicate } },
    );
    console.log(`  + lỗi ${rule.ruleKey}`);
  }
  return rubric.id;
}
```
(`rule.price` in the scenario is a string such as `'1.5'`/`'3'`; the server accepts any decimal string ≤ 2 digits.)

- [ ] **Step 2: Run the whole API verification**

```powershell
cd apps\api
pnpm exec tsc --noEmit -p tsconfig.json
pnpm exec eslint .
npx jest 2>&1 | Select-Object -Last 8
npx jest --config ./test/jest-e2e.json --runInBand 2>&1 | Tee-Object -FilePath ..\..\.superpowers\sdd\rules-by-rubric-e2e-final.txt | Select-Object -Last 15
cd ..\..
pnpm check:cycles
```
Expected: `tsc` and `eslint` clean; unit `Tests:` all pass (the `score-core.spec.ts` `mismatchedRules` test still holds because the core keeps that filter); e2e `Tests:` equals the A0 baseline plus the new suites, **zero failures**; `check:cycles` prints zero cycles. Anything red here is a regression — fix before continuing. In particular re-check `ui-e2e` seeding by reading `apps/api/test/ui-e2e/seed.ts`: it calls `seedInvestigatorSession` **before** `seedRule`, so the helper assigns correctly; the "unpriced" state is preserved because `seedPrices` omits `ten_bien`.

- [ ] **Step 3: Record the comparison and commit**

Append to `.superpowers/sdd/rules-by-rubric/progress.md` the A0 vs final `Tests:` / `Test Suites:` lines.

```bash
git add apps/api
git commit -m "feat(rules): rehearsal CLI on rubric-errors routes; suite green"
```

---

## Task A11: OpenAPI client, documentation, rehearsal gate

**Files:** Modify `packages/shared/src/api/schema.d.ts` (generated), `docs/update-grading-system-guide.md`, `CLAUDE.md`, `docs/superpowers/specs/2026-09-20-grading-agent-investigator-design.md` (a one-line amendment banner at §14.1), `docs/superpowers/specs/2026-09-23-grading-ui-rebuild-design.md` (banner at §3.1/§3.2). Create `docs/rehearsals/<date>-rules-by-rubric.md` (gate record).

- [ ] **Step 1: Regenerate the OpenAPI client (memory `cine-openapi-client-regeneration`)**

```powershell
cd apps\api
pnpm build
$env:DATABASE_URL = '<DATABASE_URL from .env.test>'
Start-Process -FilePath node -ArgumentList @('-r','dotenv/config','dist/src/main.js') -PassThru -RedirectStandardOutput ..\..\.superpowers\sdd\api.out -RedirectStandardError ..\..\.superpowers\sdd\api.err
# chờ tới khi curl -s -o NUL -w "%{http_code}" http://localhost:4000/api-docs-json trả 200 (≈25 s)
cd ..\..\packages\shared
pnpm generate:api-client
# tắt ĐÚNG tiến trình vừa khởi động (theo PID), đừng giết theo tên
```
Check `git diff --stat packages/shared/src/api/schema.d.ts`: it must now contain `/rubric-errors`, `/rubric-errors/overview`, `/rubric-errors/copy`, `/rubric-errors/{id}/price`, `/rules/{id}/split`, and no longer contain `/rules/preview` or `/rules/{id}/price`. Then `pnpm --filter @cine/shared exec tsc --noEmit` (or the package's build) must pass. **Plan B starts from this commit.**

Expected and not to be fixed here: `apps/web` no longer type-checks after this regeneration (the old `/rules/{id}/price`, `/rules/preview` and `POST /rules` paths are gone from `schema.d.ts`). Plan B Task B1 is the cutover that makes it green again — do not patch `apps/web` in this plan.

- [ ] **Step 2: Documentation**

- `docs/update-grading-system-guide.md`: add a new revision section *"Bảng lỗi theo rubric"* — the two-level model (lỗi dùng chung / dòng áp dụng), the three tables, price table per application row, `loadRuleSnapshots(rubricName)`, sightings, and the list of routes (copy the table from Task A9). Mark the old "luật toàn cục" paragraphs as superseded.
- `CLAUDE.md`: in *AI Grading Strategy → Tiered autonomy*, change the sentence "The teacher's intervention point is the **rule table**, not individual scores" to "…the **rule table of each rubric**…"; in the Academic Structure §5.1 add one line: *"Bảng lỗi (dòng áp dụng) và điểm trừ gắn với **tên rubric**, qua mọi phiên bản"*.
- Spec banners: at the top of §14.1 of the investigator spec and §3.1/§3.2 of the UI spec add `> **Sửa đổi 2026-10-07:** xem 2026-10-07-rules-by-rubric-design.md.`

- [ ] **Step 3: Rehearsal gate (grading behaviour must not change — spec D12, §7.7)**

This needs the real deployment (Railway) and the user's accounts, so the executor **stops and asks the user to run or authorize it**:

1. Deploy the branch to the rehearsal environment (user action).
2. Run `pnpm --filter api rehearsal` (see `apps/api/src/eval/rehearsal/cli.ts` header for the env vars: `REHEARSAL_BASE_URL`, credentials).
3. Record the run in `docs/rehearsals/<date>-rules-by-rubric.md` and append a row to the comparison table, **compared with the previous recorded run**: score accuracy, error recall/precision, correct auto/review decisions, false flags, missed flags, lens failures, wall time (memory `grading-benchmark-history`).
4. Expected: **no change** versus the previous run. If anything moved, stop: the cutover changed grading and must be explained before Plan B proceeds.

Do not claim the work done on green tests alone — the recorded rehearsal is the evidence.

- [ ] **Step 4: Commit**

```bash
git add packages/shared docs CLAUDE.md
git commit -m "chore(rules): regenerate OpenAPI client, update guide, record rehearsal"
```

---

## Self-Review (run before handing over)

**Spec coverage** — each spec requirement and the task that implements it:

| Spec | Task |
|---|---|
| §2.2 tables, §2.3 invariants | A1 (DDL, FKs, triggers), A3 (`assertRubricCriterion`), tests `T-RBE-DATA-1/2/3` |
| §3.1 loaders, `rubricName` in context | A2 |
| §3.2 price per application row, copy-all | A2 (`writeNextPriceVersion`, `PriceService`) |
| §3.3 recompute scopes | A2 (`rubricName` scope), A3/A4/A5 (callers) |
| §3.4 chốt / reapply | A2 (`planReapply`), `T-RBE-PRICE-4` |
| §3.5 `mismatchedRules` | A2 `T-RBE-SCORE-3` (core unchanged) |
| §3.6 split + exceptions | A5 `T-RBE-SPLIT-3` |
| §3.7 waiver carry-forward | A8 |
| §4.1 overview | A7 |
| §4.2 assign / move / remove / price / copy | A3, A4, A2, A9 |
| §4.3 library, proposals, PATCH, split, state | A5, A6, A9 |
| §4.4 removed routes | A2 (price), A5 (create/preview), A9 (404 test) |
| §6 migration + backfill, down | A1, A2 `T-RBE-MIG-2` |
| §7.1–7.5 tests | A1–A9 |
| §7.7 rehearsal | A11 |

**Placeholder scan:** the plan contains no "TBD/TODO/implement later"; the two spots that say "see Task A9"/"temporary alias" name the exact task and the exact line to delete.

**Type consistency:** `AssignInput`, `NewRuleInput`, `RuleChanges` are defined in A3 and used unchanged in A5 (`RuleChanges`) and A9 (`parseAssignInput`); `RubricErrorService.owned` (A2) keeps its signature in A3; `PriceService.setPrice/preview` take a `rubricErrorId` everywhere (A2 tests, A9 controller); `recomputeForTeacher` scope keys (`rubricName`, `ruleId`, `rubricId`) are the same in A2–A5; `ProposalService.list` (A6) matches the controller (A9) and the overview's `proposalCount` rule (A7).

**Review Focus coverage:** 1 → A1 helper contract + A2 Step 7 note + `T-RBE-SCORE-3`; 2 → `T-RBE-PRICE-1/2`; 3 → `T-RBE-SPLIT-3` (service level, before the route exists in A9); 4 → `T-RBE-MIG-1/2/3`; 5 → `T-RBE-API-2e`; 6 → `T-RBE-API-6b`; 7 → `T-RBE-SCORE-3` + `T-RBE-API-1`.
