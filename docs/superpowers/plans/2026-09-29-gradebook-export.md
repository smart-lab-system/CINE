# G5 — Ghi điểm vào sổ điểm của giảng viên — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Every task is TDD: write the failing test, watch it fail **for the right reason**, implement, watch it pass, typecheck, lint the touched files, commit.

**Goal:** Let a teacher write the finalized scores of a session **into their own gradebook `.xlsx`**, into exactly the cells they chose, leaving every other cell, style and file part untouched — with a preview before anything is written, an explicit rounding choice, blank cells explained instead of zero-filled, and a safe **re-export** that separates score decreases from increases and asks for confirmation before lowering anything already handed out.

**Architecture:** A new backend module `apps/api/src/grade-export/`. (1) `xlsx/` — a tiny OOXML layer: `zip-io` (read with `yauzl` under size limits, write with `jszip`), `workbook-reader` (sheets, cells, merges, protection), `sheet-patch` (rewrite only the target `<c>` elements + force recalculation on open). (2) Pure domain: rounding, MSSV matching, blank reasons, rule diff, and `buildPlan`. (3) `GradeExportDataService` (SQL loaders) and `GradeExportService` (template upload/inspect, preview, write, list, download) behind `GradeExportController`. (4) Migration `1789530000000` adds `grade_export_row` and the recorded rounding/confirmation columns. (5) Web: a new route `/teacher/grading/export` (upload → choose columns → preview & write) and a real entry point in `FinalizePanel`.

**Tech Stack:** NestJS + TypeORM (raw SQL) + Jest (unit `*.spec.ts` in `src/`, e2e `test/*.e2e-spec.ts`, serial, local Postgres:5442 / Redis:6390 / MinIO:9010 via `.env.test`); `yauzl` (already a dependency) and `jszip@^3.10.1` (**moved from `devDependencies` to `dependencies` — Task 1**); Next.js 15 + TanStack Query + Vitest/RTL; `openapi-fetch` client generated into `packages/shared`.

**Spec:** `docs/superpowers/specs/2026-09-29-gradebook-export-design.md`. Parent specs: `2026-09-20-grading-agent-investigator-design.md` (§13.1 seven rules, §13.2 integer arithmetic, §14.1 `grade_export_row`), `2026-09-23-grading-ui-rebuild-design.md` (§3.6, §3.10). `CLAUDE.md`: Security rule 5 (uploads never through NestJS) and rule 9 (never guess the gradebook column mapping).

## Decisions to veto at plan review

1. **Only `.xlsx` is accepted — no `.csv`, `.xls`, `.xlsm`.** UI spec §3.6 says `.xlsx`, `.csv`. A CSV needs a guessed delimiter and a guessed encoding (Excel in Vietnam often writes Windows-1258 or UTF-16), which is exactly the kind of guessing rule 9 forbids. The error message tells the teacher to open the file in Excel and save it as `.xlsx`. *If the demo teacher only has a CSV, this is the decision that bites.*
2. **`jszip` moves to `dependencies` and the XML is patched by hand — `exceljs` is not used.** Round-tripping a whole workbook through `exceljs` rebuilds it from that library's own model; patching only the target cells lets a test **prove** every other part of the file is unchanged byte for byte. Cost: ~300 lines of XML handling, a one-place lockfile change, and files with an unusual structure are **refused** with a clear message rather than handled. One visible side effect of D25: the output sets `fullCalcOnLoad`, so Excel asks *"Save changes?"* when the teacher closes the file.
3. **The output file reaches storage through a `PUT` to a signed URL the server mints for itself, not through `StorageService.putObject`.** G2 is restoring `putObject` in the same file; two streams adding one method to one file is a certain conflict. Once G2 is in, switching is a one-line change.
4. **A session with more than one required deliverable makes the teacher pick which deliverable's score to write; scores are never summed.** Adding scores is a business decision the system must not make. A two-column gradebook (Câu 1, Câu 2) becomes two exports.
5. **There is no way to clear a score cell, and no rounding or column is preselected.** A student who was written before but is now unfinished keeps the old cell (reported separately). The only text ever removed is a reason label the system itself wrote earlier. Rounding offers 0,01 (none) / 0,1 / 0,25 / 0,5, half up, and the chosen step is stored on the export. The data-start row is an extra explicit input, so title/header rows do not count as "unmatched".
6. **The API is looser than the UI about *when*: it needs at least one finalized result, and writes a student only if *that student's* result is `finalized`/`exported`;** the web only shows the entry point when everything is final. This is what gives the four blank meanings of §13.1 rule 5 (absent / not finished / not gradable / flagged) any way to occur.

## Global Constraints

- **Branch:** `feat/grading-g5-gradebook`, branched from `feat/grading-gaps-g1-g5`. Do **not** push, open a PR, or merge without the user.
- **Work from the worktree** `C:\Users\Admin\Main\Desktop\HKI 2026-2027\KLTN\CINE\.claude\worktrees\grading-g5-gradebook`; the shell cwd resets between calls — `cd` in every command. Do not `cd` to the original repo root.
- **Per-package infrastructure** (from `docs/superpowers/plans/2026-09-29-g2-g5-parallel-execution.md`): database `examcollect_g5`, `REDIS_DB=15`, `PORT=4005`, migration timestamp `1789530000000`. `apps/api/.env.test` is locked with `git update-index --skip-worktree apps/api/.env.test` and edited to `DATABASE_URL=…:5442/examcollect_g5` + `REDIS_DB=15`. The `examcollect` schema is created by `docker/postgres-init`, not by a migration: `docker exec -e PGPASSWORD=examcollect_admin_password cine-postgres-1 psql -U examcollect_admin -d examcollect_g5 -c "CREATE SCHEMA IF NOT EXISTS examcollect"` once, then `DATABASE_URL=postgresql://examcollect_admin:examcollect_admin_password@localhost:5442/examcollect_g5 DATABASE_SSL=false pnpm --filter api migration:run`. **Never** run migrations, e2e or the API against `apps/api/.env` (it points at the remote Supabase database). Docker Desktop must be running; the MinIO bucket `examcollect-submissions` must exist (a missing bucket produces errors that look like business bugs).
- **This package adds a dependency change on purpose (Task 1):** `jszip` moves from `devDependencies` to `dependencies` at the **same version** `^3.10.1`. No new package is downloaded; `pnpm-lock.yaml` changes in exactly one place (the `apps/api` importer). If `git diff pnpm-lock.yaml` shows anything else, stop and report.
- **Numbers.** In `apps/api/src/grade-export/**` a score is a **string** until `parseHundredths` turns it into an integer. **No `parseFloat`, no `Number(<score string>)`, no floating-point arithmetic on scores** (spec D8; parent §13.2). Task 15 greps for it.
- **Library boundaries.** `yauzl` and `jszip` are imported **only** in `xlsx/zip-io.ts`. `exceljs` is never imported in `apps/api`. `jszip` never *reads* an untrusted file.
- **CLAUDE.md:** run GitNexus `impact` on a symbol **before** editing it (`repo` = the absolute path `C:\Users\Admin\Main\Desktop\HKI 2026-2027\KLTN\CINE` — two repos share the name); report HIGH/CRITICAL risk before editing; run `detect_changes()` before every commit. The index may be stale — confirm with grep. This package edits only additive lines in shared files (table below).
- **e2e suite runs serially** (`maxWorkers: 1`); never raise it. Kill stray `node`/`jest` workers from other sessions first.
- **Copy is Vietnamese.** *môi trường chạy bài* (never "sandbox"), *không chấm được*. Status/direction labels carry **an icon and words**. Every mutation error renders the server's message **verbatim** in a destructive `Alert`. Decimal comma via `lib/format.ts`.
- **Do not edit** anything outside the files this plan lists. Existing tests that must change are listed per task; never weaken an assertion to make it pass.
- **Commits:** write the message to a file with the Write tool, then `git commit -F <file>`; it ends with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. PowerShell 5.1 splits inline multi-line `-m`; the bash tool mangles backticks — patch scripts go in the scratchpad and run with `node file`.
- **Tests:** `pnpm --filter api exec jest <path>`, `pnpm --filter api exec jest --config ./test/jest-e2e.json <path>`, `pnpm --filter web exec vitest run <path>`, `pnpm --filter web exec tsc --noEmit`. Known unrelated tsc noise on the base branch: 7 lines, all in `apps/web/src/lib/read-workbook.test.ts`.
- **Indentation of code blocks in this plan:** blocks inside numbered steps may carry two extra leading spaces from the list. Match the file's real indentation (2 spaces per level). When an Edit anchor fails on whitespace, re-read the file and copy its exact text — never loosen the anchor into a fuzzy match.
- **Ledger:** `.superpowers/sdd/2026-09-29-gradebook-export/progress.md` (gitignored); record a `Ruling:` line for every deviation from this plan.

## Review Focus

Inputs and conditions the obvious tests would not exercise. Each is pinned by a test in the task that owns the code.

1. **Everything the teacher did not ask us to touch is still there, byte for byte.** Styles, other sheets, media, `calcChain`, the theme, the formulas beside the cell we write. → Task 4 (`patchWorkbook` unit test: every other entry identical, `workbook.xml` differs only by `fullCalcOnLoad`, the sheet differs only in the edited cells) and Task 10 (the same, on the file read back from real storage).
2. **No floating point anywhere near a score.** `10 − 0,1 − 0,2`, `2,675`, `7,10` and `7,20` both round to `7,0` at step 0,5 while `7,24 → 7,26` changes `7,0 → 7,5`, and the score used is exactly the one `loadCurrentScore` reports for every result. → Task 5 (rounding), Task 7 (data e2e: every finalized result equals `loadCurrentScore`).
3. **Nothing is guessed.** A numeric MSSV cell that lost its leading zero matches only when exactly one session MSSV fits and says so; a duplicated MSSV blocks the write; nothing is preselected in the UI. → Task 5 (matching, unit), Task 9 (duplicates and the leading-zero case, e2e), Task 13 (nothing preselected, UI).
4. **A blank is never `0` and never a provisional number.** A student whose result is merely `teacher_reviewed` (not finalized) gets a blank with a reason, even though a score exists. → Task 7 (data e2e), Task 9 and Task 10 (preview and written file).
5. **Re-export compares rounded values, separates down from up, and cannot be confirmed against a stale preview.** A change of rounding step alone is attributed to rounding, not to a rule; the write refuses when the digest differs. → Task 6, Task 9, Task 10.
6. **Hostile or odd files fail loudly.** Zip bomb, password-protected/`.xls`, protected sheet, formula in the target cell, prefixed XML namespace, a valued cell past column BH, and CSV formula injection in the downloadable blank report. → Tasks 2–4 (zip, reader, patcher), 8 (bad files over HTTP), 9 (protected sheet, formula), 10 (nothing written on a refusal), 12 (CSV guard).

Not changed, recorded so nobody thinks it was missed: `finalized → exported` stays unused (D18); Excel/LibreOffice have **not** opened an output file (spec §9) — the first thing the common review should do.

---

## File Structure

**Backend (`apps/api`)**
- Modify `package.json` (+ `pnpm-lock.yaml`) — `jszip` to `dependencies`.
- Create `src/database/migrations/1789530000000-GradeExportRows.ts`.
- Create `src/grade-export/grade-export.types.ts`, `grade-export.keys.ts`, `grade-export.module.ts`, `grade-export.controller.ts`, `grade-export.service.ts`, `grade-export.data.ts`, `grade-export-file-store.ts`, `dto/*.ts`.
- Create `src/grade-export/entities/grade-export-row.entity.ts`; modify `src/grading/entities/grade-export.entity.ts` (new columns).
- Create `src/grade-export/xlsx/{zip-io,xml-text,workbook-reader,sheet-patch}.ts` (+ `.spec.ts`), `src/grade-export/testing/xlsx-fixture.ts`.
- Create `src/grade-export/{rounding,blank-reason,mssv-match,diff-rules,plan,score-string}.ts` (+ `.spec.ts`).
- Modify `src/app.module.ts` (one import + one entry), `src/database/data-source.ts` (import + entity), `src/database/verify-schema.ts` (table name).
- Tests: create `test/grade-export-schema.e2e-spec.ts`, `test/grade-export-inspect.e2e-spec.ts`, `test/grade-export-preview.e2e-spec.ts`, `test/grade-export.e2e-spec.ts`.

**Web (`apps/web/src`)**
- Create `lib/api/grade-export.ts`, `hooks/useGradeExport.ts`, `lib/grade-export-view.ts` (+ test).
- Create `app/teacher/grading/export/page.tsx` (+ test) and `export/_components/{ExportWizard,StepUpload,StepColumns,StepPreview,PreviousExports}.tsx` (+ tests).
- Modify `lib/grading-export.ts` (`export` on `csvField`), `app/teacher/grading/_components/FinalizePanel.tsx` (+ test) — the gradebook block.
- Regenerate `packages/shared/src/api/schema.d.ts` (Task 11, **after** every route exists).

## Parallel execution

- Branch `feat/grading-g5-gradebook` · worktree `grading-g5-gradebook` · database `examcollect_g5` · `REDIS_DB=15` · `PORT=4005` · migration `1789530000000`.

### Shared-file touch points

Additive only; each is shared with another stream.

| File | G5 adds (exact anchor) | Who else touches it |
|---|---|---|
| `apps/api/package.json` | removes `"jszip": "^3.10.1",` from `devDependencies` (between `"jest"` and `"socket.io-client"`), adds it to `dependencies` (between `"ioredis"` and `"mammoth"`) | nobody planned |
| `pnpm-lock.yaml` | the `apps/api` importer: `jszip` moves from `devDependencies` to `dependencies` | every stream that touches a dependency — on conflict, **regenerate** the lockfile, do not hand-merge. **Not** with a plain `pnpm install --lockfile-only` inside a worktree whose `node_modules` uses a shared `.pnpm` virtual store: pnpm then purges that `node_modules` (found when this plan was run; restore with the `--config.virtual-store-dir` form in the parallel-execution protocol §2). Do it from a worktree that owns its full `node_modules`, or edit the 3-line `jszip` block by hand and check it with `pnpm install --frozen-lockfile --lockfile-only` (a read-only check) |
| `apps/api/src/app.module.ts` | `import { GradeExportModule } from './grade-export/grade-export.module';` after the `CourseModule` import; `GradeExportModule,` after `CourseModule,` in `imports` | S may add its own module — keep both |
| `apps/api/src/database/data-source.ts` | `import { GradeExportRowEntity } …;` after the `GradeExportEntity` import; `GradeExportRowEntity,` after `GradeExportEntity,` in `entities` | G2 adds entities — keep all |
| `apps/api/src/database/verify-schema.ts` | `'grade_export_row',` after `'audit_sample_review',` | any stream adding a table |
| `apps/api/src/grading/entities/grade-export.entity.ts` | new columns at the end of the class | only G5 |
| `apps/web/src/lib/grading-export.ts` | the word `export` in front of `function csvField` | only G5 |
| `apps/web/src/app/teacher/grading/_components/FinalizePanel.tsx` | replaces the `<section aria-label="Ghi điểm vào sổ điểm" …>` block (lines 100-112) | G4 edits `groups` and the `needsBackend` line — **different regions**. **Both G4 and G5 keep the `NeedsBackend` import** (each branch still uses it); the person merging the second of the two removes the then-unused import |
| `packages/shared/src/api/schema.d.ts` | regenerated in Task 11 | regenerated again by G2/G3/G4 — take the union / regenerate |

Nothing else in this plan is shared. `apps/api/src/grade-export/**`, `test/grade-export*.e2e-spec.ts`, `lib/api/grade-export.ts`, `hooks/useGradeExport.ts`, `lib/grade-export-view.ts` and `app/teacher/grading/export/**` are G5-exclusive.

---

### Task 1: the dependency move, the migration, the entities

**Files:** modify `apps/api/package.json`, `pnpm-lock.yaml`, `apps/api/src/grading/entities/grade-export.entity.ts`, `apps/api/src/database/data-source.ts`, `apps/api/src/database/verify-schema.ts`; create `apps/api/src/database/migrations/1789530000000-GradeExportRows.ts`, `apps/api/src/grade-export/grade-export.types.ts`, `apps/api/src/grade-export/entities/grade-export-row.entity.ts`, `apps/api/test/grade-export-schema.e2e-spec.ts`.

**Interfaces**
- Consumes: `guard_append_only()` (`1789440000000-ErrorRulesAndPrices.ts:17`), `seedSession` (`test/helpers/grading-seed.ts`).
- Produces: `BLANK_REASONS`, `BlankReason`, `ROUNDING_STEPS`, `RoundingStep`, `MAX_TEMPLATE_BYTES`, `MAX_SHEET_ROW`, `MAX_DATA_ROWS`, `MAX_COLUMNS`, `MAX_CELLS`, `GRID_ROWS` (`grade-export.types.ts`); table `grade_export_row`; the new `grade_export` columns of spec §4.1.

- [ ] **Step 1: Move `jszip` to `dependencies`.** In `apps/api/package.json` delete exactly

  ```json
      "jszip": "^3.10.1",
  ```

  from `devDependencies` (it sits between `"jest": "^29.7.0",` and `"socket.io-client": "^4.8.3",`) and add the same line to `dependencies`, between `"ioredis": "^5.4.1",` and `"mammoth": "^1.12.2",`. Then, from the worktree root. **Warning:** if this worktree shares another worktree's `.pnpm` virtual store (the G2–G5 parallel setup), a plain `pnpm install --lockfile-only` makes pnpm purge `node_modules`. Move the 3-line `jszip:` block under `importers → apps/api` from `devDependencies:` to `dependencies:` **by hand** (alphabetical position) and verify with the read-only check below instead of the first command:

  ```bash
  pnpm install --frozen-lockfile --lockfile-only
  git diff --stat -- pnpm-lock.yaml apps/api/package.json
  git diff -- pnpm-lock.yaml
  node -e "const p=require('./apps/api/package.json');console.log(p.dependencies.jszip, p.devDependencies.jszip)"
  pnpm install --frozen-lockfile
  ```

  Expected: the lockfile diff is a few lines inside `importers → apps/api`, `jszip` leaving `devDependencies:` and entering `dependencies:` with the **same** `specifier` and `version`; the `node -e` prints `^3.10.1 undefined`; `pnpm install --frozen-lockfile` succeeds. If the lockfile diff touches any other importer or any package version, `git checkout -- pnpm-lock.yaml`, then stop and report — do not commit an unrelated lockfile change. (`--lockfile-only` may need the network; if it fails offline, run `pnpm install`, then apply the same diff check.)

- [ ] **Step 2: RED — the schema test.** Create `apps/api/test/grade-export-schema.e2e-spec.ts`:

  ```ts
  import { INestApplication } from '@nestjs/common';
  import { Test } from '@nestjs/testing';
  import { DataSource } from 'typeorm';
  import { AppModule } from '../src/app.module';
  import { seedSession } from './helpers/grading-seed';

  describe('Lượt xuất sổ điểm — bảng và ràng buộc (e2e)', () => {
    let app: INestApplication;
    let ds: DataSource;

    beforeAll(async () => {
      const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
      app = moduleRef.createNestApplication();
      await app.init();
      ds = app.get(DataSource);
    }, 60_000);
    afterAll(async () => app.close());

    async function newExport(label: string) {
      const ctx = await seedSession(ds, label);
      const [row] = await ds.query(
        `INSERT INTO examcollect.grade_export (exam_session_id, exported_by, template_storage_key, mssv_column, score_column)
         VALUES ($1, $2, 'grade-exports/x/templates/y', 'B', 'F')
         RETURNING id, rounding_step_hundredths, rounding_mode, written_count, blank_count, overwrite_count, decrease_count,
                   sheet_name, reason_column, required_deliverable_id, decrease_confirmed_by`,
        [ctx.sessionId, ctx.teacherId],
      );
      return { ctx, exportId: row.id as string, row };
    }
    const insertRow = (exportId: string, mssv: string, written: number | null, reason: string | null, fileRow = 5) =>
      ds.query(
        `INSERT INTO examcollect.grade_export_row (grade_export_id, file_row, mssv, written_hundredths, blank_reason)
         VALUES ($1, $2, $3, $4, $5)`,
        [exportId, fileRow, mssv, written, reason],
      );

    it('các cột mới có mặc định: làm tròn 0,01 nửa lên, mọi bộ đếm 0, người xác nhận null', async () => {
      const { row } = await newExport('gx-defaults');
      expect(row).toMatchObject({
        rounding_step_hundredths: 1, rounding_mode: 'half_up',
        written_count: 0, blank_count: 0, overwrite_count: 0, decrease_count: 0,
        sheet_name: null, reason_column: null, required_deliverable_id: null, decrease_confirmed_by: null,
      });
    });

    it('một dòng HOẶC ghi điểm HOẶC trống có lý do — cả hai hay không cái nào đều bị CHECK từ chối', async () => {
      const { exportId } = await newExport('gx-oneof');
      await insertRow(exportId, 'SV000001', 750, null);
      await insertRow(exportId, 'SV000002', null, 'absent');
      await expect(insertRow(exportId, 'SV000003', 750, 'absent')).rejects.toThrow(/ck_grade_export_row_one_of/);
      await expect(insertRow(exportId, 'SV000004', null, null)).rejects.toThrow(/ck_grade_export_row_one_of/);
    });

    it('điểm đã ghi không âm', async () => {
      const { exportId } = await newExport('gx-nonneg');
      await expect(insertRow(exportId, 'SV000005', -1, null)).rejects.toThrow(/check/i);
    });

    it('một MSSV một lần trong một lượt, KHÔNG phân biệt hoa/thường (citext)', async () => {
      const { exportId } = await newExport('gx-unique');
      await insertRow(exportId, 'sv000001', 100, null);
      await expect(insertRow(exportId, 'SV000001', 200, null, 6)).rejects.toThrow(/uq_grade_export_row_mssv/);
    });

    it('lý do trống ngoài bốn giá trị bị enum từ chối', async () => {
      const { exportId } = await newExport('gx-enum');
      await expect(insertRow(exportId, 'SV000006', null, 'lazy')).rejects.toThrow(/grade_export_blank_reason/);
    });

    it('bước làm tròn ngoài {1, 10, 25, 50} bị từ chối', async () => {
      const ctx = await seedSession(ds, 'gx-step');
      await expect(
        ds.query(
          `INSERT INTO examcollect.grade_export (exam_session_id, exported_by, template_storage_key, mssv_column, score_column, rounding_step_hundredths)
           VALUES ($1, $2, 'k', 'B', 'F', 5)`,
          [ctx.sessionId, ctx.teacherId],
        ),
      ).rejects.toThrow(/ck_grade_export_rounding_step/);
    });

    it('cả hai bảng chỉ-thêm: UPDATE và DELETE đều bị từ chối', async () => {
      const { exportId } = await newExport('gx-append');
      await insertRow(exportId, 'SV000007', 100, null);
      await expect(ds.query(`UPDATE examcollect.grade_export SET mssv_column = 'C' WHERE id = $1`, [exportId])).rejects.toThrow(/chỉ thêm/);
      await expect(ds.query(`DELETE FROM examcollect.grade_export WHERE id = $1`, [exportId])).rejects.toThrow(/chỉ thêm/);
      await expect(
        ds.query(`UPDATE examcollect.grade_export_row SET written_hundredths = 0 WHERE grade_export_id = $1`, [exportId]),
      ).rejects.toThrow(/chỉ thêm/);
      await expect(ds.query(`DELETE FROM examcollect.grade_export_row WHERE grade_export_id = $1`, [exportId])).rejects.toThrow(/chỉ thêm/);
    });
  });
  ```

  ```bash
  pnpm --filter api exec jest --config ./test/jest-e2e.json test/grade-export-schema.e2e-spec.ts
  ```

  Expected: **RED** — the first case fails with `column "rounding_step_hundredths" does not exist` (or `relation "examcollect.grade_export_row" does not exist` for the others). That is the right reason.

- [ ] **Step 3: GREEN — types, migration, entities, registrations.**

  Create `apps/api/src/grade-export/grade-export.types.ts`:

  ```ts
  /**
   * Hằng số và kiểu dùng chung của module ghi điểm vào sổ điểm
   * (spec 2026-09-29-gradebook-export-design.md).
   */
  export const BLANK_REASONS = ['absent', 'not_finished', 'ungradable', 'flagged'] as const;
  export type BlankReason = (typeof BLANK_REASONS)[number];

  /** Bước làm tròn tính bằng phần trăm điểm: 1 = không làm tròn, 10 = 0,1, 25 = 0,25, 50 = 0,5. */
  export const ROUNDING_STEPS = [1, 10, 25, 50] as const;
  export type RoundingStep = (typeof ROUNDING_STEPS)[number];

  /** File mẫu tối đa 5 MiB (đo bằng HeadObject) — cùng con số của đọc roster ở web. */
  export const MAX_TEMPLATE_BYTES = 5 * 1024 * 1024;
  /** Dòng lớn nhất có giá trị mà ta chịu đọc. */
  export const MAX_SHEET_ROW = 5000;
  /** Số dòng dữ liệu tối đa một lượt xuất. */
  export const MAX_DATA_ROWS = 2000;
  /** Cột lớn nhất có giá trị: 60 = BH. */
  export const MAX_COLUMNS = 60;
  /** Trần số ô đọc từ một trang tính — chặn file dựng để phồng bộ nhớ. */
  export const MAX_CELLS = 400_000;
  /** Số dòng lưới xem trước mỗi lần. */
  export const GRID_ROWS = 40;
  ```

  Create `apps/api/src/database/migrations/1789530000000-GradeExportRows.ts`:

  ```ts
  import { MigrationInterface, QueryRunner } from 'typeorm';

  /**
   * Ghi điểm vào sổ điểm (spec `2026-09-29-gradebook-export-design.md` §4.1, parent §13.1 luật 2 và 7, §14.1).
   *
   * `grade_export` chưa từng có dòng nào (không service nào ghi nó), nên thêm cột mặc định là an toàn.
   * Cả hai bảng CHỈ-THÊM: một lượt xuất là hồ sơ — *"một con số đã xuất phải giải thích lại được"* — nên sai
   * thì xuất lượt mới, không sửa lượt cũ. Trigger `set_updated_at` của `grade_export` (migration đầu tiên)
   * đứng sau trigger chỉ-thêm theo thứ tự tên nên không bao giờ chạy tới.
   */
  export class GradeExportRows1789530000000 implements MigrationInterface {
    name = 'GradeExportRows1789530000000';

    public async up(q: QueryRunner): Promise<void> {
      await q.query(
        `CREATE TYPE "examcollect"."grade_export_blank_reason" AS ENUM ('absent', 'not_finished', 'ungradable', 'flagged')`,
      );
      await q.query(`
        ALTER TABLE "examcollect"."grade_export"
          ADD COLUMN "sheet_name" varchar(31),
          ADD COLUMN "first_data_row" int,
          ADD COLUMN "reason_column" varchar(20),
          ADD COLUMN "required_deliverable_id" uuid REFERENCES "examcollect"."required_deliverable"("id") ON DELETE RESTRICT,
          ADD COLUMN "rounding_step_hundredths" int NOT NULL DEFAULT 1,
          ADD COLUMN "rounding_mode" text NOT NULL DEFAULT 'half_up',
          ADD COLUMN "written_count" int NOT NULL DEFAULT 0,
          ADD COLUMN "blank_count" int NOT NULL DEFAULT 0,
          ADD COLUMN "overwrite_count" int NOT NULL DEFAULT 0,
          ADD COLUMN "decrease_count" int NOT NULL DEFAULT 0,
          ADD COLUMN "decrease_confirmed_by" uuid REFERENCES "examcollect"."account"("id") ON DELETE RESTRICT,
          ADD COLUMN "template_file_name" varchar(255),
          ADD COLUMN "output_file_name" varchar(255),
          ADD CONSTRAINT "ck_grade_export_rounding_step" CHECK (rounding_step_hundredths IN (1, 10, 25, 50))
      `);
      await q.query(`CREATE INDEX "idx_grade_export_session_time" ON "examcollect"."grade_export" ("exam_session_id", "exported_at")`);
      await q.query(`
        CREATE TABLE "examcollect"."grade_export_row" (
          "id"                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
          "grade_export_id"     uuid NOT NULL REFERENCES "examcollect"."grade_export"("id") ON DELETE RESTRICT,
          "file_row"            int NOT NULL CHECK (file_row >= 1),
          "mssv"                citext NOT NULL,
          "written_hundredths"  int CHECK (written_hundredths IS NULL OR written_hundredths >= 0),
          "blank_reason"        "examcollect"."grade_export_blank_reason",
          "score_computation_id" uuid REFERENCES "examcollect"."score_computation"("id") ON DELETE RESTRICT,
          CONSTRAINT "ck_grade_export_row_one_of" CHECK ((written_hundredths IS NULL) <> (blank_reason IS NULL)),
          CONSTRAINT "uq_grade_export_row_mssv" UNIQUE ("grade_export_id", "mssv")
        )
      `);
      for (const table of ['grade_export', 'grade_export_row']) {
        await q.query(
          `CREATE TRIGGER "trg_${table}_append_only" BEFORE UPDATE OR DELETE ON "examcollect"."${table}" FOR EACH ROW EXECUTE FUNCTION examcollect.guard_append_only()`,
        );
      }
    }

    public async down(q: QueryRunner): Promise<void> {
      await q.query(`DROP TRIGGER IF EXISTS "trg_grade_export_row_append_only" ON "examcollect"."grade_export_row"`);
      await q.query(`DROP TRIGGER IF EXISTS "trg_grade_export_append_only" ON "examcollect"."grade_export"`);
      await q.query(`DROP TABLE "examcollect"."grade_export_row"`);
      await q.query(`DROP INDEX "examcollect"."idx_grade_export_session_time"`);
      await q.query(`
        ALTER TABLE "examcollect"."grade_export"
          DROP CONSTRAINT "ck_grade_export_rounding_step",
          DROP COLUMN "output_file_name", DROP COLUMN "template_file_name", DROP COLUMN "decrease_confirmed_by",
          DROP COLUMN "decrease_count", DROP COLUMN "overwrite_count", DROP COLUMN "blank_count", DROP COLUMN "written_count",
          DROP COLUMN "rounding_mode", DROP COLUMN "rounding_step_hundredths", DROP COLUMN "required_deliverable_id",
          DROP COLUMN "reason_column", DROP COLUMN "first_data_row", DROP COLUMN "sheet_name"
      `);
      await q.query(`DROP TYPE "examcollect"."grade_export_blank_reason"`);
    }
  }
  ```

  Create `apps/api/src/grade-export/entities/grade-export-row.entity.ts`:

  ```ts
  import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
  import { GradeExportEntity } from '../../grading/entities/grade-export.entity';
  import { BLANK_REASONS, type BlankReason } from '../grade-export.types';

  /**
   * Bản chụp MỘT sinh viên của một lượt xuất (parent §13.1 luật 2, §14.1). Chỉ thêm.
   * Hoặc đã ghi điểm (`written_hundredths`), hoặc để trống kèm lý do (`blank_reason`) — không bao giờ cả hai
   * hay không cái nào (`ck_grade_export_row_one_of`). `mssv` là MSSV CỦA PHIÊN, không phải chữ trong file.
   */
  @Entity({ name: 'grade_export_row' })
  @Index('uq_grade_export_row_mssv', ['gradeExportId', 'mssv'], { unique: true })
  export class GradeExportRowEntity {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ name: 'grade_export_id', type: 'uuid' })
    gradeExportId!: string;

    @ManyToOne(() => GradeExportEntity, { onDelete: 'RESTRICT', nullable: false })
    @JoinColumn({ name: 'grade_export_id' })
    gradeExport!: GradeExportEntity;

    @Column({ name: 'file_row', type: 'int' })
    fileRow!: number;

    @Column({ name: 'mssv', type: 'citext' })
    mssv!: string;

    @Column({ name: 'written_hundredths', type: 'int', nullable: true })
    writtenHundredths!: number | null;

    @Column({ name: 'blank_reason', type: 'enum', enum: BLANK_REASONS, enumName: 'grade_export_blank_reason', nullable: true })
    blankReason!: BlankReason | null;

    @Column({ name: 'score_computation_id', type: 'uuid', nullable: true })
    scoreComputationId!: string | null;
  }
  ```

  In `apps/api/src/grading/entities/grade-export.entity.ts` add, directly **before** the final `}` of the class (after the `exportedAt` column), and add `JoinColumn`… is already imported — nothing else to import:

  ```ts

    // ---- Ghi điểm vào sổ điểm (migration 1789530000000). Bản ghi của MỘT lượt xuất; chỉ-thêm.
    @Column({ name: 'sheet_name', type: 'varchar', length: 31, nullable: true })
    sheetName!: string | null;

    @Column({ name: 'first_data_row', type: 'int', nullable: true })
    firstDataRow!: number | null;

    @Column({ name: 'reason_column', type: 'varchar', length: 20, nullable: true })
    reasonColumn!: string | null;

    /** Null khi phiên chỉ có một yêu cầu nộp. */
    @Column({ name: 'required_deliverable_id', type: 'uuid', nullable: true })
    requiredDeliverableId!: string | null;

    /** Phần trăm điểm: 1 = không làm tròn, 10, 25, 50 (§13.1 luật 7). */
    @Column({ name: 'rounding_step_hundredths', type: 'int', default: 1 })
    roundingStepHundredths!: number;

    @Column({ name: 'rounding_mode', type: 'text', default: 'half_up' })
    roundingMode!: string;

    @Column({ name: 'written_count', type: 'int', default: 0 })
    writtenCount!: number;

    @Column({ name: 'blank_count', type: 'int', default: 0 })
    blankCount!: number;

    @Column({ name: 'overwrite_count', type: 'int', default: 0 })
    overwriteCount!: number;

    @Column({ name: 'decrease_count', type: 'int', default: 0 })
    decreaseCount!: number;

    /** Người xác nhận các bài bị giảm điểm (§13.1 luật 4). Null khi không có bài giảm. */
    @Column({ name: 'decrease_confirmed_by', type: 'uuid', nullable: true })
    decreaseConfirmedBy!: string | null;

    @Column({ name: 'template_file_name', type: 'varchar', length: 255, nullable: true })
    templateFileName!: string | null;

    @Column({ name: 'output_file_name', type: 'varchar', length: 255, nullable: true })
    outputFileName!: string | null;
  ```

  In `apps/api/src/database/data-source.ts` add the import directly after `import { GradeExportEntity } from '../grading/entities/grade-export.entity';`:

  ```ts
  import { GradeExportRowEntity } from '../grade-export/entities/grade-export-row.entity';
  ```

  and replace exactly

  ```ts
      GradeExportEntity,
      CalibrationRunEntity,
  ```

  with

  ```ts
      GradeExportEntity,
      GradeExportRowEntity,
      CalibrationRunEntity,
  ```

  In `apps/api/src/database/verify-schema.ts` replace exactly

  ```ts
    'audit_sample_review',
  ];
  ```

  with

  ```ts
    'audit_sample_review',
    'grade_export_row',
  ];
  ```

- [ ] **Step 4: Run the migration on this package's own database, then the test.**

  ```bash
  DATABASE_URL=postgresql://examcollect_admin:examcollect_admin_password@localhost:5442/examcollect_g5 DATABASE_SSL=false pnpm --filter api migration:run
  docker exec -e PGPASSWORD=examcollect_admin_password cine-postgres-1 psql -U examcollect_admin -d examcollect_g5 -c "\d examcollect.grade_export_row"
  pnpm --filter api exec jest --config ./test/jest-e2e.json test/grade-export-schema.e2e-spec.ts
  pnpm --filter api exec tsc --noEmit
  DATABASE_URL=postgresql://examcollect_admin:examcollect_admin_password@localhost:5442/examcollect_g5 pnpm --filter api exec ts-node src/database/verify-schema.ts
  ```

  Expected: `\d` lists the seven columns, `uq_grade_export_row_mssv`, `ck_grade_export_row_one_of`, and trigger `trg_grade_export_row_append_only`; the e2e shows **7 passed**; `tsc` clean; `verify-schema` prints `All 30 expected tables are present.` (29 before + 1 — count `EXPECTED_TABLES` if the number differs).

- [ ] **Step 5: `detect_changes` and commit.** Two commits keep the dependency change reviewable on its own: first `chore(api): chuyển jszip sang dependencies (dùng để ghi .xlsx ở server)` with **only** `apps/api/package.json` and `pnpm-lock.yaml`; then `feat(grade-export): bảng grade_export_row, cột bản ghi làm tròn và xác nhận, chỉ-thêm` with the rest.

---

### Task 2: reading and writing the zip, safely

**Files:** create `apps/api/src/grade-export/xlsx/zip-io.ts`, `apps/api/src/grade-export/xlsx/zip-io.spec.ts`.

**Interfaces**
- Consumes: `yauzl`, `jszip`.
- Produces:
  - `interface ZipEntry { name: string; data: Buffer; date: Date; isDirectory: boolean }`
  - `interface ZipLimits { maxEntries: number; maxEntryBytes: number; maxTotalBytes: number }`, `DEFAULT_ZIP_LIMITS` (500 / 20 MiB / 60 MiB)
  - `readZipEntries(buffer: Buffer, limits?: ZipLimits): Promise<ZipEntry[]>` — validated, order-preserving
  - `writeZip(entries: ZipEntry[]): Promise<Buffer>`
  - `NotZipError`, `EncryptedOrLegacyError`, `ZipLimitError`, `CorruptZipError`

`yauzl` opens with `lazyEntries`, checks the central directory (entry count, declared sizes) **before** inflating anything, and its read streams are size-validated (`validateEntrySizes` defaults to `true`; the stream errors if the real length differs from the declared one — `yauzl/index.js:611,918`). `jszip` only **creates** the output zip from buffers that already passed those checks. `createFolders: false` matters: JSZip's default would add directory entries the original did not have.

- [ ] **Step 1: RED.** Create `zip-io.spec.ts`:

  ```ts
  import JSZip from 'jszip';
  import {
    CorruptZipError,
    EncryptedOrLegacyError,
    NotZipError,
    ZipLimitError,
    readZipEntries,
    writeZip,
  } from './zip-io';

  const DATE = new Date(Date.UTC(2026, 8, 1, 10, 20, 30));

  async function makeZip(files: Record<string, string | Buffer>, opts: { dirs?: string[] } = {}): Promise<Buffer> {
    const zip = new JSZip();
    for (const dir of opts.dirs ?? []) zip.file(dir, null, { dir: true, date: DATE, createFolders: false });
    for (const [name, data] of Object.entries(files)) zip.file(name, data, { date: DATE, createFolders: false });
    return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  }

  describe('readZipEntries / writeZip', () => {
    it('reads every entry, in order, with its bytes', async () => {
      const bytes = Buffer.from(Array.from({ length: 300 }, (_, i) => i % 256));
      const entries = await readZipEntries(await makeZip({ '[Content_Types].xml': '<a/>', 'xl/b.xml': '<b/>', 'xl/media/logo.png': bytes }));
      expect(entries.map((e) => e.name)).toEqual(['[Content_Types].xml', 'xl/b.xml', 'xl/media/logo.png']);
      expect(entries[0]!.data.toString()).toBe('<a/>');
      expect(entries[2]!.data.equals(bytes)).toBe(true);
      expect(entries.every((e) => !e.isDirectory)).toBe(true);
    });

    it('write → read gives back the same names, order, bytes and dates', async () => {
      const source = await readZipEntries(await makeZip({ 'a.txt': 'một', 'b/c.txt': 'hai' }));
      const again = await readZipEntries(await writeZip(source));
      expect(again.map((e) => e.name)).toEqual(['a.txt', 'b/c.txt']);
      expect(again.map((e) => e.data.toString())).toEqual(['một', 'hai']);
      expect(again[0]!.date).toEqual(DATE);
    });

    it('does NOT invent directory entries the original did not have (createFolders: false)', async () => {
      const again = await readZipEntries(await writeZip(await readZipEntries(await makeZip({ 'xl/worksheets/sheet1.xml': '<w/>' }))));
      expect(again.map((e) => e.name)).toEqual(['xl/worksheets/sheet1.xml']);
    });

    it('keeps directory entries the original DID have', async () => {
      const source = await readZipEntries(await makeZip({ 'xl/a.xml': '<a/>' }, { dirs: ['xl/'] }));
      expect(source.map((e) => [e.name, e.isDirectory])).toEqual([['xl/', true], ['xl/a.xml', false]]);
      const again = await readZipEntries(await writeZip(source));
      expect(again.map((e) => [e.name, e.isDirectory])).toEqual([['xl/', true], ['xl/a.xml', false]]);
    });

    it('an empty archive reads as no entries', async () => {
      expect(await readZipEntries(await new JSZip().generateAsync({ type: 'nodebuffer' }))).toEqual([]);
    });

    it('an old .xls / password-protected file (CFB container) is named as such', async () => {
      const cfb = Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(64)]);
      await expect(readZipEntries(cfb)).rejects.toBeInstanceOf(EncryptedOrLegacyError);
    });

    it('something that is not a zip at all is named as such', async () => {
      await expect(readZipEntries(Buffer.from('MSSV,Điểm\n1,2\n'))).rejects.toBeInstanceOf(NotZipError);
      await expect(readZipEntries(Buffer.alloc(0))).rejects.toBeInstanceOf(NotZipError);
    });

    it('a truncated zip is corrupt, not "not a zip"', async () => {
      const zip = await makeZip({ 'a.txt': 'x'.repeat(2000) });
      await expect(readZipEntries(zip.subarray(0, Math.floor(zip.length / 2)))).rejects.toBeInstanceOf(CorruptZipError);
    });

    it('refuses more entries than the limit', async () => {
      const zip = await makeZip({ a: '1', b: '2', c: '3', d: '4', e: '5' });
      await expect(readZipEntries(zip, { maxEntries: 3, maxEntryBytes: 1000, maxTotalBytes: 1000 })).rejects.toBeInstanceOf(ZipLimitError);
    });

    it('refuses an entry whose declared size is over the per-entry limit — before inflating it', async () => {
      const zip = await makeZip({ big: 'x'.repeat(100) });
      await expect(readZipEntries(zip, { maxEntries: 10, maxEntryBytes: 50, maxTotalBytes: 1000 })).rejects.toBeInstanceOf(ZipLimitError);
    });

    it('refuses a total declared size over the limit even when every entry is small', async () => {
      const zip = await makeZip({ a: 'x'.repeat(40), b: 'y'.repeat(40), c: 'z'.repeat(40) });
      await expect(readZipEntries(zip, { maxEntries: 10, maxEntryBytes: 50, maxTotalBytes: 100 })).rejects.toBeInstanceOf(ZipLimitError);
    });
  });
  ```

  ```bash
  pnpm --filter api exec jest src/grade-export/xlsx/zip-io.spec.ts
  ```

  Expected: **RED** — `Cannot find module './zip-io'`.

- [ ] **Step 2: GREEN.** Create `zip-io.ts`:

  ```ts
  import JSZip from 'jszip';
  import * as yauzl from 'yauzl';

  /**
   * Đọc và ghi zip cho `.xlsx` — MỘT chỗ duy nhất import `yauzl` và `jszip` (plan G5, Global Constraints).
   *
   * ĐỌC bằng `yauzl`: mục lục trước (số entry, kích thước khai) rồi mới tới từng luồng, mà luồng của nó tự kiểm số
   * byte thật so với số đã khai. `jszip.loadAsync` tin mục lục và phồng bộ nhớ trước khi có chỗ nào để đếm —
   * chính lý do `archive-reader.ts` cũng dùng `yauzl`. GHI bằng `jszip`, và chỉ từ buffer đã qua cửa kiểm này.
   */
  export interface ZipEntry {
    name: string;
    data: Buffer;
    /** Giờ DOS của entry, đọc theo UTC để ghi lại đúng từng trường. */
    date: Date;
    isDirectory: boolean;
  }

  export interface ZipLimits {
    maxEntries: number;
    maxEntryBytes: number;
    maxTotalBytes: number;
  }

  export const DEFAULT_ZIP_LIMITS: ZipLimits = {
    maxEntries: 500,
    maxEntryBytes: 20 * 1024 * 1024,
    maxTotalBytes: 60 * 1024 * 1024,
  };

  export class NotZipError extends Error {}
  /** Container CFB (`D0 CF 11 E0`): `.xls` cũ, hoặc `.xlsx` có mật khẩu (Excel bọc nó vào CFB). */
  export class EncryptedOrLegacyError extends Error {}
  export class ZipLimitError extends Error {}
  export class CorruptZipError extends Error {}

  const CFB_MAGIC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0]);
  const ZIP_MAGICS = [Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from([0x50, 0x4b, 0x05, 0x06])];

  const startsWith = (buffer: Buffer, magic: Buffer) =>
    buffer.length >= magic.length && buffer.subarray(0, magic.length).equals(magic);

  function assertLooksLikeZip(buffer: Buffer): void {
    if (startsWith(buffer, CFB_MAGIC)) throw new EncryptedOrLegacyError('container CFB');
    if (!ZIP_MAGICS.some((magic) => startsWith(buffer, magic))) throw new NotZipError('không có chữ ký zip');
  }

  export function readZipEntries(buffer: Buffer, limits: ZipLimits = DEFAULT_ZIP_LIMITS): Promise<ZipEntry[]> {
    return new Promise((resolve, reject) => {
      try {
        assertLooksLikeZip(buffer);
      } catch (error) {
        reject(error);
        return;
      }
      yauzl.fromBuffer(buffer, { lazyEntries: true }, (openError, zipfile) => {
        if (openError || !zipfile) {
          reject(new CorruptZipError(openError?.message ?? 'không mở được'));
          return;
        }
        if (zipfile.entryCount > limits.maxEntries) {
          zipfile.close();
          reject(new ZipLimitError(`${zipfile.entryCount} entry, tối đa ${limits.maxEntries}`));
          return;
        }

        const out: ZipEntry[] = [];
        let total = 0;
        let settled = false;
        const fail = (error: Error) => {
          if (settled) return;
          settled = true;
          zipfile.close();
          reject(error);
        };

        zipfile.on('error', (error: Error) => fail(new CorruptZipError(error.message)));
        zipfile.on('end', () => {
          if (settled) return;
          settled = true;
          resolve(out);
        });
        zipfile.on('entry', (entry: yauzl.Entry) => {
          const date = entry.getLastModDate({ timezone: 'UTC' });
          if (entry.fileName.endsWith('/')) {
            out.push({ name: entry.fileName, data: Buffer.alloc(0), date, isDirectory: true });
            zipfile.readEntry();
            return;
          }
          if (entry.isEncrypted()) {
            fail(new EncryptedOrLegacyError(`entry mã hoá: ${entry.fileName}`));
            return;
          }
          if (entry.uncompressedSize > limits.maxEntryBytes) {
            fail(new ZipLimitError(`${entry.fileName}: ${entry.uncompressedSize} byte, tối đa ${limits.maxEntryBytes}`));
            return;
          }
          total += entry.uncompressedSize;
          if (total > limits.maxTotalBytes) {
            fail(new ZipLimitError(`tổng kích thước giải nén khai vượt ${limits.maxTotalBytes}`));
            return;
          }
          zipfile.openReadStream(entry, (streamError, stream) => {
            if (streamError || !stream) {
              fail(new CorruptZipError(streamError?.message ?? `không đọc được ${entry.fileName}`));
              return;
            }
            const chunks: Buffer[] = [];
            stream.on('data', (chunk: Buffer) => chunks.push(chunk));
            stream.on('error', (error: Error) => fail(new CorruptZipError(error.message)));
            stream.on('end', () => {
              out.push({ name: entry.fileName, data: Buffer.concat(chunks), date, isDirectory: false });
              zipfile.readEntry();
            });
          });
        });
        zipfile.readEntry();
      });
    });
  }

  /**
   * `createFolders: false` là bắt buộc: mặc định của JSZip thêm entry thư mục mà file gốc không có, và bất biến của
   * G5 là *"mọi phần khác của file giống hệt"*.
   */
  export async function writeZip(entries: ZipEntry[]): Promise<Buffer> {
    const zip = new JSZip();
    for (const entry of entries) {
      if (entry.isDirectory) zip.file(entry.name, null, { dir: true, date: entry.date, createFolders: false });
      else zip.file(entry.name, entry.data, { date: entry.date, createFolders: false, binary: true });
    }
    return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  }
  ```

  ```bash
  pnpm --filter api exec jest src/grade-export/xlsx/zip-io.spec.ts
  pnpm --filter api exec tsc --noEmit
  pnpm --filter api exec eslint src/grade-export/xlsx/zip-io.ts src/grade-export/xlsx/zip-io.spec.ts
  ```

  Expected: 11 passed; `tsc` clean; eslint 0 errors. If the date assertion fails, the DOS-time timezone convention of the two libraries differs — change `getLastModDate({ timezone: 'UTC' })` to `'local'` and re-run; **do not delete the assertion** (a zip whose dates drift is a changed file). If `tsc` rejects `zipfile.on('entry', …)`'s parameter type, use `yauzl.Entry` as written (it is exported by `@types/yauzl@3.4.0`).

- [ ] **Step 3: commit.** Title: `feat(grade-export): đọc zip có giới hạn bằng yauzl, ghi bằng jszip, giữ thứ tự và không thêm thư mục`.

---

### Task 3: the XML helpers, the fixture builder, and the workbook reader

**Files:** create `apps/api/src/grade-export/xlsx/xml-text.ts`, `xml-text.spec.ts`, `workbook-reader.ts`, `workbook-reader.spec.ts`, `apps/api/src/grade-export/testing/xlsx-fixture.ts`.

**Interfaces**
- Consumes: `ZipEntry` (Task 2), `MAX_CELLS`, `MAX_COLUMNS`, `MAX_SHEET_ROW` (Task 1).
- Produces:
  - `xml-text.ts`: `decodeXml`, `encodeXml`, `colToIndex`, `indexToCol`, `parseRef`, `readAttr`, `readPrefixedAttr`.
  - `workbook-reader.ts`: `openWorkbook(entries): Workbook`, `readSheet(wb, name): SheetRead`, `cellAt(sheet, col, row): CellRead`, `isMergedNonMaster(sheet, col, row): boolean`, `textOfRuns`; errors `NotWorkbookError`, `MacroWorkbookError`, `UnsupportedWorkbookError`, `SheetNotFoundError`, `SheetTooLargeError`.
  - `testing/xlsx-fixture.ts`: `buildXlsx(sheets, opts?): Promise<Buffer>`, `FIXTURE_DATE`.

Only **unprefixed** SpreadsheetML is read (spec D22): the writer must emit elements with the same prefix, and every real gradebook (Excel, LibreOffice, Google Sheets) is unprefixed. A file that is not gets a named refusal.

- [ ] **Step 1: RED — `xml-text.spec.ts`.**

  ```ts
  import { colToIndex, decodeXml, encodeXml, indexToCol, parseRef, readAttr, readPrefixedAttr } from './xml-text';

  describe('decodeXml / encodeXml', () => {
    it('decodes the five entities and numeric references', () => {
      expect(decodeXml('A &amp; B &lt;C&gt; &quot;d&quot; &apos;e&apos; &#65;&#x42;')).toBe('A & B <C> "d" \'e\' AB');
    });
    it('decodes Excel\'s _xHHHH_ control escapes, and only once', () => {
      expect(decodeXml('a_x000D_b')).toBe('a\rb');
      expect(decodeXml('_x005F_x000D_')).toBe('_x000D_');
    });
    it('leaves an unknown entity alone and drops an out-of-range code point', () => {
      expect(decodeXml('&nbsp;')).toBe('&nbsp;');
      expect(decodeXml('&#x110000;')).toBe('');
    });
    it('encodes markup characters and strips characters XML 1.0 forbids', () => {
      expect(encodeXml('=SUM(A1) & <b> "x"')).toBe('=SUM(A1) &amp; &lt;b&gt; &quot;x&quot;');
      expect(encodeXml('a\u0000b\u0008c')).toBe('abc');
    });
    it('round-trips Vietnamese text', () => {
      const text = 'Vắng — không có bài nộp';
      expect(decodeXml(encodeXml(text))).toBe(text);
    });
  });

  describe('column and reference helpers', () => {
    it.each([['A', 1], ['Z', 26], ['AA', 27], ['AZ', 52], ['BH', 60], ['XFD', 16384]])('%s ↔ %i', (letters, index) => {
      expect(colToIndex(letters)).toBe(index);
      expect(indexToCol(index)).toBe(letters);
    });
    it('parses a cell reference, and refuses anything else', () => {
      expect(parseRef('F12')).toEqual({ col: 6, row: 12 });
      expect(parseRef('AA1')).toEqual({ col: 27, row: 1 });
      for (const bad of ['', 'A', '12', 'A0', 'a1', 'F-1', 'ABCD1', 'A1:B2']) expect(parseRef(bad)).toBeNull();
    });
  });

  describe('attribute readers', () => {
    it('reads double- and single-quoted attributes and decodes them', () => {
      expect(readAttr(' r="A1" s=\'3\' name="A &amp; B"', 'r')).toBe('A1');
      expect(readAttr(' r="A1" s=\'3\'', 's')).toBe('3');
      expect(readAttr(' name="A &amp; B"', 'name')).toBe('A & B');
    });
    it('does not confuse an attribute with one that merely ends the same way', () => {
      expect(readAttr(' sheetId="2" r:id="rId1"', 'id')).toBeNull();
      expect(readAttr(' dyDescent="1" r="5"', 'r')).toBe('5');
    });
    it('reads a namespace-prefixed attribute whatever the prefix is', () => {
      expect(readPrefixedAttr(' name="S" sheetId="1" r:id="rId7"', 'id')).toBe('rId7');
      expect(readPrefixedAttr(' name="S" ns1:id="rId9"', 'id')).toBe('rId9');
      expect(readPrefixedAttr(' name="S" sheetId="1"', 'id')).toBeNull();
    });
  });
  ```

  Create `apps/api/src/grade-export/testing/xlsx-fixture.ts` now (it is needed by the reader spec; the spec of Task 4 and the e2e reuse it):

  ```ts
  import JSZip from 'jszip';
  import { encodeXml, indexToCol } from '../xlsx/xml-text';

  /**
   * Dựng một `.xlsx` TỐI THIỂU nhưng đủ hình dạng thật (sharedStrings, styles, theme, calcChain, một ảnh, docProps) để
   * test "mọi phần khác giữ nguyên" có cái để giữ. Chỉ dùng trong test — cùng chỗ với `eval/testing/mini-de.ts`.
   */
  export const FIXTURE_DATE = new Date(Date.UTC(2026, 8, 1, 10, 20, 30));

  export type FixtureCell =
    | string
    | number
    | null
    | undefined
    | { formula: string; value?: string | number }
    /** Chuỗi chia sẻ dạng rich text (hai đoạn <r>). */
    | { rich: string }
    /** Ô có style tường minh. */
    | { v: string | number; s: number };

  export interface FixtureSheet {
    name: string;
    /** Chỉ số 0 = dòng 1. `null` = KHÔNG có phần tử <row> cho dòng đó; `[]` = dòng tự đóng `<row r="n"/>`. */
    rows: (FixtureCell[] | null)[];
    hidden?: boolean;
    /** Ví dụ ['A1:F1']. */
    merges?: string[];
    protect?: boolean;
    /** Ghi chuỗi bằng inlineStr thay vì sharedStrings. */
    inline?: boolean;
    /** Style áp cho MỌI ô của cột (1-based), kể cả ô rỗng: { 5: 1 } → cột E dùng cellXfs[1]. */
    columnStyle?: Record<number, number>;
    /** Bỏ thuộc tính `r` của ô — để thử từ chối. */
    omitCellRefs?: boolean;
    /** Thêm thuộc tính spans vào mọi dòng. */
    spans?: boolean;
  }

  export interface FixtureOptions {
    extraEntries?: { name: string; data: Buffer | string }[];
    workbookContentType?: string;
    /** Trang tính dùng tiền tố `x:` — để thử từ chối. */
    prefixed?: boolean;
    noCalcPr?: boolean;
  }

  const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const MAIN_CT = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml';
  const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

  export async function buildXlsx(sheets: FixtureSheet[], opts: FixtureOptions = {}): Promise<Buffer> {
    const shared: string[] = [];
    const sharedIndex = (xml: string): number => {
      shared.push(xml);
      return shared.length - 1;
    };
    const plain = (text: string) => `<si><t xml:space="preserve">${encodeXml(text)}</t></si>`;
    const rich = (text: string) =>
      `<si><r><t xml:space="preserve">${encodeXml(text.slice(0, 1))}</t></r><r><rPr><b/></rPr><t xml:space="preserve">${encodeXml(text.slice(1))}</t></r><rPh sb="0" eb="1"><t>ph</t></rPh></si>`;

    const sheetXml = sheets.map((sheet) => {
      if (opts.prefixed) {
        return `${XML}<x:worksheet xmlns:x="${NS}"><x:sheetData><x:row r="1"><x:c r="A1"><x:v>1</x:v></x:c></x:row></x:sheetData></x:worksheet>`;
      }
      const maxCol = Math.max(1, ...sheet.rows.map((r) => r?.length ?? 0));
      const rows = sheet.rows
        .map((cells, rowIndex) => {
          if (cells === null) return '';
          const r = rowIndex + 1;
          const spans = sheet.spans ? ` spans="1:${maxCol}"` : '';
          if (cells.length === 0) return `<row r="${r}"${spans}/>`;
          const body = cells
            .map((cell, colIndex) => {
              const col = colIndex + 1;
              const ref = `${indexToCol(col)}${r}`;
              const rAttr = sheet.omitCellRefs ? '' : ` r="${ref}"`;
              const colStyle = sheet.columnStyle?.[col];
              const styleOf = (explicit?: number) => {
                const s = explicit ?? colStyle;
                return s === undefined ? '' : ` s="${s}"`;
              };
              if (cell === null || cell === undefined) return colStyle === undefined ? '' : `<c${rAttr}${styleOf()}/>`;
              if (typeof cell === 'number') return `<c${rAttr}${styleOf()}><v>${cell}</v></c>`;
              if (typeof cell === 'string') {
                return sheet.inline
                  ? `<c${rAttr}${styleOf()} t="inlineStr"><is><t xml:space="preserve">${encodeXml(cell)}</t></is></c>`
                  : `<c${rAttr}${styleOf()} t="s"><v>${sharedIndex(plain(cell))}</v></c>`;
              }
              if ('formula' in cell) {
                const value = cell.value;
                if (typeof value === 'string') return `<c${rAttr}${styleOf()} t="str"><f>${encodeXml(cell.formula)}</f><v>${encodeXml(value)}</v></c>`;
                return `<c${rAttr}${styleOf()}><f>${encodeXml(cell.formula)}</f>${value === undefined ? '' : `<v>${value}</v>`}</c>`;
              }
              if ('rich' in cell) return `<c${rAttr}${styleOf()} t="s"><v>${sharedIndex(rich(cell.rich))}</v></c>`;
              return typeof cell.v === 'number'
                ? `<c${rAttr}${styleOf(cell.s)}><v>${cell.v}</v></c>`
                : `<c${rAttr}${styleOf(cell.s)} t="s"><v>${sharedIndex(plain(cell.v))}</v></c>`;
            })
            .join('');
          return `<row r="${r}"${spans}>${body}</row>`;
        })
        .join('');
      const merges = sheet.merges?.length
        ? `<mergeCells count="${sheet.merges.length}">${sheet.merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>`
        : '';
      const protect = sheet.protect ? '<sheetProtection sheet="1" objects="1" scenarios="1"/>' : '';
      return (
        `${XML}<worksheet xmlns="${NS}" xmlns:r="${REL}"><dimension ref="A1:${indexToCol(maxCol)}${sheet.rows.length}"/>` +
        `<sheetViews><sheetView workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="15"/>` +
        `<cols><col min="1" max="1" width="14" customWidth="1"/></cols><sheetData>${rows}</sheetData>${protect}${merges}` +
        `<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/></worksheet>`
      );
    });

    const n = sheets.length;
    const workbook =
      `${XML}<workbook xmlns="${NS}" xmlns:r="${REL}"><bookViews><workbookView/></bookViews><sheets>` +
      sheets.map((s, i) => `<sheet name="${encodeXml(s.name)}" sheetId="${i + 1}"${s.hidden ? ' state="hidden"' : ''} r:id="rId${i + 1}"/>`).join('') +
      `</sheets>${opts.noCalcPr ? '' : '<calcPr calcId="191029"/>'}</workbook>`;
    const rels =
      `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${REL}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
      `<Relationship Id="rId${n + 1}" Type="${REL}/styles" Target="styles.xml"/>` +
      `<Relationship Id="rId${n + 2}" Type="${REL}/sharedStrings" Target="sharedStrings.xml"/>` +
      `<Relationship Id="rId${n + 3}" Type="${REL}/theme" Target="theme/theme1.xml"/></Relationships>`;
    const contentTypes =
      `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/>` +
      `<Override PartName="/xl/workbook.xml" ContentType="${opts.workbookContentType ?? MAIN_CT}"/>` +
      sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') +
      `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
      `<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>`;
    const styles =
      `${XML}<styleSheet xmlns="${NS}"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>` +
      `<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>` +
      `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
      `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
      `<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="2" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
      `<xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs></styleSheet>`;
    const sst = `${XML}<sst xmlns="${NS}" count="${shared.length}" uniqueCount="${shared.length}">${shared.join('')}</sst>`;

    const files: [string, string | Buffer][] = [
      ['[Content_Types].xml', contentTypes],
      ['_rels/.rels', `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
      ['docProps/core.xml', `${XML}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"/>`],
      ['xl/workbook.xml', workbook],
      ['xl/_rels/workbook.xml.rels', rels],
      ['xl/styles.xml', styles],
      ['xl/sharedStrings.xml', sst],
      ...sheetXml.map((xml, i): [string, string] => [`xl/worksheets/sheet${i + 1}.xml`, xml]),
      ['xl/theme/theme1.xml', `${XML}<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Office"/>`],
      ['xl/calcChain.xml', `${XML}<calcChain xmlns="${NS}"><c r="F3" i="1"/></calcChain>`],
      ['xl/media/logo.png', Buffer.from(Array.from({ length: 256 }, (_, i) => i))],
      ...(opts.extraEntries ?? []).map((e): [string, string | Buffer] => [e.name, e.data]),
    ];

    const zip = new JSZip();
    for (const [name, data] of files) zip.file(name, data, { date: FIXTURE_DATE, createFolders: false });
    return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  }
  ```

  Create `workbook-reader.spec.ts`:

  ```ts
  import { buildXlsx, type FixtureSheet } from '../testing/xlsx-fixture';
  import {
    MacroWorkbookError,
    NotWorkbookError,
    SheetNotFoundError,
    SheetTooLargeError,
    UnsupportedWorkbookError,
    cellAt,
    isMergedNonMaster,
    openWorkbook,
    readSheet,
  } from './workbook-reader';
  import { readZipEntries, writeZip } from './zip-io';

  const open = async (sheets: FixtureSheet[], opts?: Parameters<typeof buildXlsx>[1]) =>
    openWorkbook(await readZipEntries(await buildXlsx(sheets, opts)));

  const GRADEBOOK: FixtureSheet = {
    name: 'Bảng điểm',
    rows: [
      ['BẢNG ĐIỂM LỚP N01'],
      ['STT', 'MSSV', 'Họ tên', 'Giữa kỳ', 'Cuối kỳ', 'Tổng'],
      [1, '20120001', 'Nguyễn Văn An', 7, null, { formula: 'D3*0.3+E3*0.7', value: 2.1 }],
      [2, 20120002, 'A & B <C>', 8.5, { v: 9, s: 1 }, { formula: 'IF(E4>5,"Đạt","Trượt")', value: 'Đạt' }],
      [3, '  ', 'Trống', null, null, null],
    ],
    merges: ['A1:F1'],
    columnStyle: { 5: 1 },
  };

  describe('openWorkbook', () => {
    it('lists the sheets in workbook order and flags hidden ones', async () => {
      const wb = await open([{ name: 'Một', rows: [['a']] }, { name: 'Hai', rows: [['b']], hidden: true }]);
      expect(wb.sheets.map((s) => [s.name, s.hidden, s.path])).toEqual([
        ['Một', false, 'xl/worksheets/sheet1.xml'],
        ['Hai', true, 'xl/worksheets/sheet2.xml'],
      ]);
    });

    it('refuses a macro workbook by name', async () => {
      await expect(open([{ name: 'S', rows: [] }], { workbookContentType: 'application/vnd.ms-excel.sheet.macroEnabled.main+xml' })).rejects.toBeInstanceOf(MacroWorkbookError);
    });

    it('refuses a zip that is not a workbook', async () => {
      const entries = await readZipEntries(await writeZip([{ name: 'a.txt', data: Buffer.from('x'), date: new Date(), isDirectory: false }]));
      expect(() => openWorkbook(entries)).toThrow(NotWorkbookError);
    });

    it('refuses a workbook whose main part is not a workbook (a template, for instance)', async () => {
      await expect(open([{ name: 'S', rows: [] }], { workbookContentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.template.main+xml' })).rejects.toBeInstanceOf(NotWorkbookError);
    });
  });

  describe('readSheet', () => {
    it('reads shared strings, numbers, inline strings and formula results with the right kind', async () => {
      const wb = await open([GRADEBOOK]);
      const sheet = readSheet(wb, 'Bảng điểm');
      expect(cellAt(sheet, 2, 2)).toMatchObject({ text: 'MSSV', kind: 'text', hasFormula: false });
      expect(cellAt(sheet, 2, 3)).toMatchObject({ text: '20120001', kind: 'text' });
      expect(cellAt(sheet, 2, 4)).toMatchObject({ text: '20120002', kind: 'number' });
      expect(cellAt(sheet, 4, 4)).toMatchObject({ text: '8.5', kind: 'number' });
      expect(cellAt(sheet, 6, 3)).toMatchObject({ text: '2.1', kind: 'number', hasFormula: true });
      expect(cellAt(sheet, 6, 4)).toMatchObject({ text: 'Đạt', kind: 'text', hasFormula: true });
      const inline = readSheet(await open([{ ...GRADEBOOK, inline: true }]), 'Bảng điểm');
      expect(cellAt(inline, 3, 3)).toMatchObject({ text: 'Nguyễn Văn An', kind: 'text' });
    });

    it('decodes entities and reads rich text without the phonetic runs', async () => {
      const wb = await open([{ name: 'S', rows: [['A & B <C> "x"', { rich: 'Xin chào' }]] }]);
      const sheet = readSheet(wb, 'S');
      expect(cellAt(sheet, 1, 1).text).toBe('A & B <C> "x"');
      expect(cellAt(sheet, 2, 1).text).toBe('Xin chào');
    });

    it('a style-only cell, a whitespace-only string and a missing cell are all "empty"', async () => {
      const sheet = readSheet(await open([GRADEBOOK]), 'Bảng điểm');
      expect(cellAt(sheet, 5, 3)).toMatchObject({ text: '', kind: 'empty' }); // <c r="E3" s="1"/>
      expect(cellAt(sheet, 2, 5)).toMatchObject({ kind: 'empty' }); // '  '
      expect(cellAt(sheet, 30, 99)).toMatchObject({ text: '', kind: 'empty', hasFormula: false }); // no such cell
    });

    it('reports merges, and only the top-left cell of a merge is the master', async () => {
      const sheet = readSheet(await open([GRADEBOOK]), 'Bảng điểm');
      expect(sheet.merges).toEqual([{ col1: 1, row1: 1, col2: 6, row2: 1 }]);
      expect(isMergedNonMaster(sheet, 1, 1)).toBe(false);
      expect(isMergedNonMaster(sheet, 3, 1)).toBe(true);
      expect(isMergedNonMaster(sheet, 3, 2)).toBe(false);
    });

    it('rowCount and columnCount count only cells with a value or a formula', async () => {
      const sheet = readSheet(await open([GRADEBOOK]), 'Bảng điểm');
      expect(sheet.rowCount).toBe(5);
      expect(sheet.columnCount).toBe(6);
      const styledOnly = readSheet(await open([{ name: 'S', rows: [['a'], [], [null, null, null]], columnStyle: { 3: 1 } }]), 'S');
      expect(styledOnly.rowCount).toBe(1);
      expect(styledOnly.columnCount).toBe(1);
    });

    it('detects a protected sheet', async () => {
      expect(readSheet(await open([{ name: 'S', rows: [['a']], protect: true }]), 'S').protected).toBe(true);
      expect(readSheet(await open([{ name: 'S', rows: [['a']] }]), 'S').protected).toBe(false);
    });

    it('a row with no <row> element and a self-closed row are both fine', async () => {
      const sheet = readSheet(await open([{ name: 'S', rows: [['a'], null, [], ['d']] }]), 'S');
      expect(cellAt(sheet, 1, 4).text).toBe('d');
      expect(sheet.rowCount).toBe(4);
    });

    it('throws for an unknown sheet', async () => {
      const wb = await open([{ name: 'S', rows: [] }]);
      expect(() => readSheet(wb, 'Nope')).toThrow(SheetNotFoundError);
    });

    it('refuses a prefixed-namespace sheet instead of misreading it', async () => {
      const wb = await open([{ name: 'S', rows: [] }], { prefixed: true });
      expect(() => readSheet(wb, 'S')).toThrow(UnsupportedWorkbookError);
    });

    it('refuses a cell that has no address', async () => {
      const wb = await open([{ name: 'S', rows: [['a']], omitCellRefs: true }]);
      expect(() => readSheet(wb, 'S')).toThrow(UnsupportedWorkbookError);
    });

    it('refuses a VALUED cell past column BH', async () => {
      const wb = await open([{ name: 'S', rows: [Array.from({ length: 61 }, (_, i) => (i === 60 ? 'x' : null))] }]);
      expect(() => readSheet(wb, 'S')).toThrow(SheetTooLargeError);
    });

    it('refuses a VALUED cell past row 5000, but ignores a self-closed row there', async () => {
      const tall = (row: string[]): (string[] | null)[] => {
        const rows: (string[] | null)[] = Array.from({ length: 5001 }, () => null);
        rows[5000] = row;
        return rows;
      };
      const valued = await open([{ name: 'S', rows: tall(['x']) }]);
      expect(() => readSheet(valued, 'S')).toThrow(SheetTooLargeError);
      const empty = await open([{ name: 'S', rows: [['a'], ...tall([]).slice(1)] }]);
      expect(readSheet(empty, 'S').rowCount).toBe(1);
    });
  });
  ```

  ```bash
  pnpm --filter api exec jest src/grade-export/xlsx/xml-text.spec.ts src/grade-export/xlsx/workbook-reader.spec.ts
  ```

  Expected: **RED** — `Cannot find module './xml-text'` / `'./workbook-reader'`.

- [ ] **Step 2: GREEN — `xml-text.ts`.**

  ```ts
  /**
   * Chữ và địa chỉ trong SpreadsheetML — hàm thuần, không phụ thuộc thư viện nào.
   */
  export function decodeXml(text: string): string {
    return text
      .replace(/&(#x[0-9A-Fa-f]+|#[0-9]+|amp|lt|gt|quot|apos);/g, (match, body: string) => {
        switch (body) {
          case 'amp': return '&';
          case 'lt': return '<';
          case 'gt': return '>';
          case 'quot': return '"';
          case 'apos': return "'";
        }
        const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
        return Number.isFinite(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
      })
      // Excel viết ký tự điều khiển là _xHHHH_; một lượt duy nhất nên `_x005F_x000D_` (dấu gạch dưới được thoát) đọc ra `_x000D_`.
      .replace(/_x([0-9A-Fa-f]{4})_/g, (_match, hex: string) => String.fromCharCode(parseInt(hex, 16)));
  }

  /** Thoát chữ để đưa vào nội dung/thuộc tính XML, bỏ ký tự XML 1.0 cấm. */
  export function encodeXml(text: string): string {
    return text
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /** `A`=1 … `Z`=26, `AA`=27. */
  export function colToIndex(letters: string): number {
    let n = 0;
    for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
    return n;
  }

  export function indexToCol(index: number): string {
    let s = '';
    let n = index;
    while (n > 0) {
      const rem = (n - 1) % 26;
      s = String.fromCharCode(65 + rem) + s;
      n = Math.floor((n - 1) / 26);
    }
    return s;
  }

  /** `F12` → `{ col: 6, row: 12 }`; mọi thứ khác (kể cả `a1`, `A0`, `A1:B2`) → null. */
  export function parseRef(ref: string): { col: number; row: number } | null {
    const match = /^([A-Z]{1,3})([1-9]\d{0,6})$/.exec(ref);
    return match ? { col: colToIndex(match[1]!), row: Number(match[2]) } : null;
  }

  const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  /** Giá trị thuộc tính (nháy kép hoặc đơn), đã giải mã; null nếu không có. `attrs` là chuỗi thuộc tính của một thẻ. */
  export function readAttr(attrs: string, name: string): string | null {
    const match = new RegExp(`(?:^|\\s)${escapeRegExp(name)}=(?:"([^"]*)"|'([^']*)')`).exec(attrs);
    return match ? decodeXml(match[1] ?? match[2] ?? '') : null;
  }

  /** Như `readAttr` nhưng cho thuộc tính có tiền tố namespace bất kỳ (`r:id`, `ns1:id`…); `sheetId` không khớp. */
  export function readPrefixedAttr(attrs: string, local: string): string | null {
    const match = new RegExp(`(?:^|\\s)[A-Za-z_][\\w.-]*:${escapeRegExp(local)}=(?:"([^"]*)"|'([^']*)')`).exec(attrs);
    return match ? decodeXml(match[1] ?? match[2] ?? '') : null;
  }
  ```

- [ ] **Step 3: GREEN — `workbook-reader.ts`.**

  ```ts
  import { posix } from 'node:path';
  import { MAX_CELLS, MAX_COLUMNS, MAX_SHEET_ROW } from '../grade-export.types';
  import { decodeXml, indexToCol, parseRef, readAttr, readPrefixedAttr } from './xml-text';
  import type { ZipEntry } from './zip-io';

  /**
   * Bộ đọc SpreadsheetML tối thiểu — chỉ đủ cho việc ghi điểm vào sổ điểm (spec §4.2). Chỉ đọc bản KHÔNG TIỀN TỐ
   * namespace: bộ vá ghi phải phát ra phần tử cùng tiền tố, và mọi file thật của giảng viên (Excel, LibreOffice,
   * Google Sheets) không tiền tố. File lạ bị từ chối có tên, không bị đọc sai (D22).
   */
  export class NotWorkbookError extends Error {}
  export class MacroWorkbookError extends Error {}
  export class UnsupportedWorkbookError extends Error {}
  export class SheetNotFoundError extends Error {}
  export class SheetTooLargeError extends Error {}

  const MAIN_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml';

  export interface SheetInfo {
    name: string;
    hidden: boolean;
    path: string;
  }
  export interface Workbook {
    entries: Map<string, ZipEntry>;
    sheets: SheetInfo[];
    sharedStrings: string[];
  }
  export interface CellRead {
    ref: string;
    text: string;
    kind: 'empty' | 'text' | 'number' | 'other';
    hasFormula: boolean;
  }
  export interface MergeRange {
    col1: number;
    row1: number;
    col2: number;
    row2: number;
  }
  export interface SheetRead {
    name: string;
    path: string;
    protected: boolean;
    /** Dòng cuối có ô mang giá trị hoặc công thức. */
    rowCount: number;
    /** Cột cuối có ô mang giá trị hoặc công thức. */
    columnCount: number;
    cells: Map<string, CellRead>;
    merges: MergeRange[];
  }

  function part(entries: Map<string, ZipEntry>, name: string): string | null {
    const entry = entries.get(name);
    return entry ? entry.data.toString('utf8').replace(/^\uFEFF/, '') : null;
  }

  const resolveTarget = (target: string) => posix.normalize(target.startsWith('/') ? target.slice(1) : `xl/${target}`);

  export function openWorkbook(list: ZipEntry[]): Workbook {
    const entries = new Map(list.map((entry) => [entry.name, entry]));
    const contentTypes = part(entries, '[Content_Types].xml');
    const workbookXml = part(entries, 'xl/workbook.xml');
    if (contentTypes === null || workbookXml === null) throw new NotWorkbookError('thiếu [Content_Types].xml hoặc xl/workbook.xml');

    const override = /<Override\b[^>]*?\bPartName="\/xl\/workbook\.xml"[^>]*?\/?>/.exec(contentTypes);
    const contentType = override ? readAttr(override[0], 'ContentType') : null;
    if (contentType === null) throw new NotWorkbookError('không khai loại nội dung của xl/workbook.xml');
    if (contentType.includes('macroEnabled')) throw new MacroWorkbookError(contentType);
    if (contentType !== MAIN_CONTENT_TYPE) throw new NotWorkbookError(`loại nội dung ${contentType}`);
    if (!/<workbook[\s>]/.test(workbookXml)) throw new UnsupportedWorkbookError('workbook.xml có tiền tố namespace');

    const relsXml = part(entries, 'xl/_rels/workbook.xml.rels');
    if (relsXml === null) throw new NotWorkbookError('thiếu xl/_rels/workbook.xml.rels');
    const targets = new Map<string, string>();
    for (const match of relsXml.matchAll(/<Relationship\b([^>]*?)\/?>/g)) {
      const id = readAttr(match[1] ?? '', 'Id');
      const target = readAttr(match[1] ?? '', 'Target');
      if (id && target) targets.set(id, resolveTarget(target));
    }

    const sheets: SheetInfo[] = [];
    for (const match of workbookXml.matchAll(/<sheet\b([^>]*?)\/?>/g)) {
      const attrs = match[1] ?? '';
      const name = readAttr(attrs, 'name');
      const rid = readPrefixedAttr(attrs, 'id');
      if (name === null || rid === null) throw new UnsupportedWorkbookError('trang tính thiếu tên hoặc r:id');
      const path = targets.get(rid);
      if (!path) throw new UnsupportedWorkbookError(`trang tính "${name}" trỏ tới quan hệ ${rid} không có`);
      const state = readAttr(attrs, 'state');
      sheets.push({ name, hidden: state === 'hidden' || state === 'veryHidden', path });
    }
    return { entries, sheets, sharedStrings: parseSharedStrings(part(entries, 'xl/sharedStrings.xml')) };
  }

  /** Ghép mọi `<t>` của một chuỗi — bỏ chú thích ngữ âm (`rPh`) vì nó không phải chữ hiển thị. */
  export function textOfRuns(inner: string): string {
    const cleaned = inner.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').replace(/<phoneticPr\b[^>]*\/>/g, '');
    let text = '';
    for (const match of cleaned.matchAll(/<t\b[^>]*?(?:\/>|>([\s\S]*?)<\/t>)/g)) text += decodeXml(match[1] ?? '');
    return text;
  }

  function parseSharedStrings(xml: string | null): string[] {
    if (xml === null) return [];
    const out: string[] = [];
    for (const match of xml.matchAll(/<si\b[^>]*?(?:\/>|>([\s\S]*?)<\/si>)/g)) out.push(textOfRuns(match[1] ?? ''));
    return out;
  }

  function readCell(ref: string, attrs: string, inner: string, sst: string[]): CellRead {
    const t = readAttr(attrs, 't');
    const hasFormula = /<f[\s>/]/.test(inner);
    const vMatch = /<v\b[^>]*?(?:\/>|>([\s\S]*?)<\/v>)/.exec(inner);
    const v = vMatch ? decodeXml(vMatch[1] ?? '') : '';
    const make = (text: string, kind: CellRead['kind']): CellRead => ({
      ref,
      text,
      kind: text.trim() === '' ? 'empty' : kind,
      hasFormula,
    });
    switch (t) {
      case 's':
        return make(sst[Number(v)] ?? '', 'text');
      case 'inlineStr': {
        const is = /<is\b[^>]*>([\s\S]*?)<\/is>/.exec(inner);
        return make(is ? textOfRuns(is[1] ?? '') : '', 'text');
      }
      case 'str':
        return make(v, 'text');
      case 'b':
        return { ref, text: v === '1' ? 'TRUE' : 'FALSE', kind: 'other', hasFormula };
      case 'e':
      case 'd':
        return make(v, 'other');
      default:
        return make(v.trim(), 'number');
    }
  }

  export function readSheet(wb: Workbook, name: string): SheetRead {
    const info = wb.sheets.find((sheet) => sheet.name === name);
    if (!info) throw new SheetNotFoundError(name);
    const xml = part(wb.entries, info.path);
    if (xml === null) throw new UnsupportedWorkbookError(`thiếu ${info.path}`);
    if (!/<worksheet[\s>]/.test(xml)) throw new UnsupportedWorkbookError('trang tính có tiền tố namespace');

    const cells = new Map<string, CellRead>();
    let rowCount = 0;
    let columnCount = 0;
    let seen = 0;
    const sheetData = /<sheetData\b[^>]*?(?:\/>|>([\s\S]*?)<\/sheetData>)/.exec(xml);
    for (const rowMatch of (sheetData?.[1] ?? '').matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
      const rAttr = readAttr(rowMatch[1] ?? '', 'r');
      const rowNumber = rAttr === null ? NaN : Number(rAttr);
      if (!Number.isInteger(rowNumber) || rowNumber < 1) throw new UnsupportedWorkbookError('dòng không có địa chỉ (r)');
      for (const cellMatch of (rowMatch[2] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        if (++seen > MAX_CELLS) throw new SheetTooLargeError(`quá ${MAX_CELLS} ô`);
        const attrs = cellMatch[1] ?? '';
        const ref = readAttr(attrs, 'r');
        if (ref === null) throw new UnsupportedWorkbookError('ô không có địa chỉ (r)');
        const pos = parseRef(ref);
        if (!pos) throw new UnsupportedWorkbookError(`địa chỉ ô "${ref}" không hợp lệ`);
        const cell = readCell(ref, attrs, cellMatch[2] ?? '', wb.sharedStrings);
        const valued = cell.kind !== 'empty' || cell.hasFormula;
        const outside = pos.col > MAX_COLUMNS || pos.row > MAX_SHEET_ROW;
        if (outside && valued) throw new SheetTooLargeError(`ô ${ref} nằm ngoài cột ${indexToCol(MAX_COLUMNS)} / dòng ${MAX_SHEET_ROW}`);
        if (outside) continue;
        cells.set(ref, cell);
        if (valued) {
          rowCount = Math.max(rowCount, pos.row);
          columnCount = Math.max(columnCount, pos.col);
        }
      }
    }

    const merges: MergeRange[] = [];
    for (const match of xml.matchAll(/<mergeCell\b([^>]*?)\/?>/g)) {
      const ref = readAttr(match[1] ?? '', 'ref');
      if (!ref) continue;
      const [a, b] = ref.split(':');
      const p1 = parseRef(a ?? '');
      const p2 = parseRef(b ?? a ?? '');
      if (p1 && p2) {
        merges.push({ col1: Math.min(p1.col, p2.col), row1: Math.min(p1.row, p2.row), col2: Math.max(p1.col, p2.col), row2: Math.max(p1.row, p2.row) });
      }
    }

    return {
      name,
      path: info.path,
      protected: /<sheetProtection\b[^>]*?\bsheet=(?:"(?:1|true)"|'(?:1|true)')/.test(xml),
      rowCount,
      columnCount,
      cells,
      merges,
    };
  }

  export function cellAt(sheet: SheetRead, col: number, row: number): CellRead {
    const ref = `${indexToCol(col)}${row}`;
    return sheet.cells.get(ref) ?? { ref, text: '', kind: 'empty', hasFormula: false };
  }

  /** Ô nằm trong một vùng gộp nhưng KHÔNG phải ô trên-trái: ghi vào đó không hiện ra và làm hỏng vùng gộp. */
  export function isMergedNonMaster(sheet: SheetRead, col: number, row: number): boolean {
    return sheet.merges.some(
      (m) => col >= m.col1 && col <= m.col2 && row >= m.row1 && row <= m.row2 && !(col === m.col1 && row === m.row1),
    );
  }

  ```

  ```bash
  pnpm --filter api exec jest src/grade-export/xlsx
  pnpm --filter api exec tsc --noEmit
  pnpm --filter api exec eslint src/grade-export/xlsx src/grade-export/testing
  ```

  Expected: `xml-text` 15 passed, `workbook-reader` 16 passed, `zip-io` 11 passed; `tsc` clean; eslint 0 errors. If a reader case fails on `kind: 'number'` for the `<c><v>20120002</v></c>` cell, check that the fixture wrote it as a number (`typeof cell === 'number'`) — that cell is deliberately numeric.

- [ ] **Step 4: commit.** Title: `feat(grade-export): bộ đọc SpreadsheetML tối thiểu (chuỗi chia sẻ, công thức, ô gộp, bảo vệ) và xlsx-fixture cho test`.

---

### Task 4: rewriting only the cells we were asked to write

**Files:** create `apps/api/src/grade-export/xlsx/sheet-patch.ts`, `apps/api/src/grade-export/xlsx/sheet-patch.spec.ts`.

**Interfaces**
- Consumes: `xml-text.ts` helpers, `ZipEntry` (Task 2).
- Produces:
  - `type CellEdit = { ref: string; kind: 'number'; hundredths: number } | { ref: string; kind: 'text'; text: string } | { ref: string; kind: 'clear' }`
  - `hundredthsToXml(h: number): string`
  - `patchSheet(xml: string, edits: CellEdit[]): string`
  - `forceRecalcOnLoad(workbookXml: string): string`
  - `patchWorkbook(entries: ZipEntry[], sheetPath: string, edits: CellEdit[]): ZipEntry[]`
  - `PatchError`

The contract that matters (Review Focus 1): an existing cell keeps every attribute except `t`; a missing cell or row is inserted **in order**; untouched rows are re-emitted verbatim; `spans` is dropped only from rows that change; a cell with a formula is **refused**; numbers are written from integers (`725` → `7.25`, `750` → `7.5`, `1000` → `10`); text goes in as `inlineStr` so `sharedStrings.xml` is never touched; `<dimension>` grows only if a written cell falls outside it.

- [ ] **Step 1: RED.** Create `sheet-patch.spec.ts`:

  ```ts
  import { buildXlsx, type FixtureSheet } from '../testing/xlsx-fixture';
  import { PatchError, forceRecalcOnLoad, hundredthsToXml, patchSheet, patchWorkbook, type CellEdit } from './sheet-patch';
  import { readZipEntries, writeZip } from './zip-io';

  const SHEET: FixtureSheet = {
    name: 'Bảng điểm',
    rows: [
      ['BẢNG ĐIỂM LỚP N01'],
      ['STT', 'MSSV', 'Họ tên', 'Giữa kỳ', 'Cuối kỳ', 'Tổng'],
      [1, '20120001', 'Nguyễn Văn An', 7, null, { formula: 'D3*0.3+E3*0.7', value: 2.1 }],
      [2, '20120002', 'Trần Thị Bình', 8, { v: 'cũ', s: 2 }, { formula: 'D4*0.3+E4*0.7', value: 2.4 }],
      [3, '20120003', 'Lê Văn Cường', 6],
      null,
      [],
      [6, '20120006', 'Vũ Thị Hà', 9],
    ],
    columnStyle: { 5: 1 },
  };

  async function sheetXml(sheet: FixtureSheet = SHEET): Promise<string> {
    const entries = await readZipEntries(await buildXlsx([sheet]));
    return entries.find((e) => e.name === 'xl/worksheets/sheet1.xml')!.data.toString('utf8');
  }
  const refsOf = (xml: string, row: number): string[] => {
    const m = new RegExp(`<row\\b[^>]*\\br="${row}"[^>]*?(?:/>|>([\\s\\S]*?)</row>)`).exec(xml);
    return m?.[1] ? [...m[1].matchAll(/<c\b[^>]*\br="([A-Z]+\d+)"/g)].map((x) => x[1]!) : [];
  };
  /** Cắt các ô đã sửa ra khỏi XML để so phần CÒN LẠI. */
  const without = (xml: string, refs: string[]) =>
    refs.reduce((acc, ref) => acc.replace(new RegExp(`<c\\b[^>]*\\br="${ref}"[^>]*?(?:/>|>[\\s\\S]*?</c>)`), ''), xml);
  const num = (ref: string, hundredths: number): CellEdit => ({ ref, kind: 'number', hundredths });

  describe('hundredthsToXml — a score is written from an integer, never a float', () => {
    it.each([[0, '0'], [5, '0.05'], [10, '0.1'], [99, '0.99'], [100, '1'], [725, '7.25'], [750, '7.5'], [999, '9.99'], [1000, '10']])('%i → %s', (h, xml) => {
      expect(hundredthsToXml(h)).toBe(xml);
    });
    it('refuses what is not a non-negative integer', () => {
      expect(() => hundredthsToXml(-1)).toThrow(PatchError);
      expect(() => hundredthsToXml(1.5)).toThrow(PatchError);
      expect(() => hundredthsToXml(Number.NaN)).toThrow(PatchError);
    });
  });

  describe('patchSheet', () => {
    it('writes a number into an existing styled-empty cell: keeps `s`, no `t`, and changes nothing else', async () => {
      const xml = await sheetXml();
      const out = patchSheet(xml, [num('E3', 750)]);
      expect(out).toContain('<c r="E3" s="1"><v>7.5</v></c>');
      expect(without(out, ['E3'])).toBe(without(xml, ['E3']));
    });

    it('overwriting a text cell drops its `t` and keeps its style', async () => {
      const xml = await sheetXml();
      const out = patchSheet(xml, [num('E4', 825)]);
      expect(out).toContain('<c r="E4" s="2"><v>8.25</v></c>');
      expect(out).not.toMatch(/<c r="E4"[^>]*t="s"/);
    });

    it('inserts a missing cell in COLUMN order — after the last, and between two', async () => {
      const xml = await sheetXml();
      const out = patchSheet(xml, [num('G3', 100), num('E5', 250)]);
      expect(refsOf(out, 3)).toEqual(['A3', 'B3', 'C3', 'D3', 'E3', 'F3', 'G3']);
      expect(refsOf(out, 5)).toEqual(['A5', 'B5', 'C5', 'D5', 'E5']);
      const sparse = await sheetXml({ name: 'S', rows: [['a', null, 'c']] });
      expect(refsOf(patchSheet(sparse, [num('B1', 100)]), 1)).toEqual(['A1', 'B1', 'C1']);
    });

    it('expands a self-closed row', async () => {
      const out = patchSheet(await sheetXml(), [num('E7', 100)]);
      expect(out).toContain('<row r="7"><c r="E7"><v>1</v></c></row>');
    });

    it('creates a missing row in ROW order — between two existing rows and after the last', async () => {
      const xml = await sheetXml();
      const out = patchSheet(xml, [num('E6', 100), num('E12', 200)]);
      const order = [...out.matchAll(/<row\b[^>]*\br="(\d+)"/g)].map((m) => Number(m[1]));
      expect(order).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 12]);
      expect(out).toContain('<row r="6"><c r="E6"><v>1</v></c></row>');
      expect(out).toContain('<row r="12"><c r="E12"><v>2</v></c></row>');
    });

    it('creates a missing row when the sheet has no rows at all (self-closed <sheetData/>)', async () => {
      const empty = (await sheetXml({ name: 'S', rows: [] })).replace('<sheetData></sheetData>', '<sheetData/>');
      expect(patchSheet(empty, [num('A1', 100)])).toContain('<sheetData><row r="1"><c r="A1"><v>1</v></c></row></sheetData>');
    });

    it('drops `spans` from a row it changes and from no other row', async () => {
      const xml = await sheetXml({ ...SHEET, spans: true });
      const out = patchSheet(xml, [num('E3', 100)]);
      expect(/<row r="3"[^>]*spans=/.test(out)).toBe(false);
      expect(/<row r="4"[^>]*spans=/.test(out)).toBe(true);
    });

    it('writes text as an inline string with markup escaped, and never as a formula', async () => {
      const out = patchSheet(await sheetXml(), [
        { ref: 'G3', kind: 'text', text: 'Vắng — không có bài nộp' },
        { ref: 'G4', kind: 'text', text: '=SUM(A1) & <b> "x"' },
      ]);
      expect(out).toContain('<c r="G3" t="inlineStr"><is><t xml:space="preserve">Vắng — không có bài nộp</t></is></c>');
      expect(out).toContain('<t xml:space="preserve">=SUM(A1) &amp; &lt;b&gt; &quot;x&quot;</t>');
      expect(out).not.toMatch(/<c r="G4"[^>]*><f>/);
    });

    it('`clear` empties an existing cell but keeps its style; on a missing cell it does nothing at all', async () => {
      const xml = await sheetXml();
      const out = patchSheet(xml, [{ ref: 'E4', kind: 'clear' }, { ref: 'Z50', kind: 'clear' }]);
      expect(out).toContain('<c r="E4" s="2"/>');
      expect(out).not.toContain('r="50"');
    });

    it('refuses to write into a cell that has a formula — even a `clear`', async () => {
      const xml = await sheetXml();
      expect(() => patchSheet(xml, [num('F3', 100)])).toThrow(/công thức/);
      expect(() => patchSheet(xml, [{ ref: 'F4', kind: 'clear' }])).toThrow(/công thức/);
    });

    it('grows <dimension> only when a written cell falls outside it', async () => {
      const xml = await sheetXml();
      expect(xml).toContain('<dimension ref="A1:F8"/>');
      expect(patchSheet(xml, [num('H3', 100)])).toContain('<dimension ref="A1:H8"/>');
      expect(patchSheet(xml, [num('E20', 100)])).toContain('<dimension ref="A1:F20"/>');
      expect(patchSheet(xml, [num('E3', 100)])).toContain('<dimension ref="A1:F8"/>');
      expect(patchSheet(xml, [{ ref: 'Z99', kind: 'clear' }])).toContain('<dimension ref="A1:F8"/>');
    });

    it('with no edits it returns the XML untouched', async () => {
      const xml = await sheetXml();
      expect(patchSheet(xml, [])).toBe(xml);
    });

    it('refuses the same cell twice, a bad address, a row without `r`, rows out of order, and stray content', async () => {
      const xml = await sheetXml();
      expect(() => patchSheet(xml, [num('E3', 1), num('E3', 2)])).toThrow(PatchError);
      expect(() => patchSheet(xml, [num('e3', 1)])).toThrow(PatchError);
      expect(() => patchSheet(xml.replace('<row r="3">', '<row>'), [num('E3', 1)])).toThrow(PatchError);
      expect(() => patchSheet(xml.replace('<row r="4">', '<row r="2">'), [num('E3', 1)])).toThrow(PatchError);
      expect(() => patchSheet(xml.replace('<row r="4">', '<junk/><row r="4">'), [num('E3', 1)])).toThrow(PatchError);
      expect(() => patchSheet(xml.replace('<worksheet ', '<x:worksheet ').replace('</worksheet>', '</x:worksheet>'), [num('E3', 1)])).toThrow(PatchError);
    });
  });

  describe('forceRecalcOnLoad (spec D25)', () => {
    it('adds the attribute to an existing <calcPr>', () => {
      expect(forceRecalcOnLoad('<workbook><sheets/><calcPr calcId="191029"/></workbook>')).toBe('<workbook><sheets/><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>');
    });
    it('turns a false value into 1', () => {
      expect(forceRecalcOnLoad('<workbook><calcPr fullCalcOnLoad="0" calcId="1"/></workbook>')).toContain('fullCalcOnLoad="1"');
    });
    it('handles a non-self-closed <calcPr></calcPr> without adding a second one', () => {
      const out = forceRecalcOnLoad('<workbook><calcPr calcId="1"></calcPr></workbook>');
      expect(out.match(/<calcPr/g)).toHaveLength(1);
      expect(out).toContain('fullCalcOnLoad="1"');
    });
    it('creates <calcPr> in schema order: after definedNames, before oleSize / extLst / the end', () => {
      expect(forceRecalcOnLoad('<workbook><sheets/><definedNames/></workbook>')).toBe('<workbook><sheets/><definedNames/><calcPr fullCalcOnLoad="1"/></workbook>');
      expect(forceRecalcOnLoad('<workbook><sheets/><oleSize ref="A1"/></workbook>')).toBe('<workbook><sheets/><calcPr fullCalcOnLoad="1"/><oleSize ref="A1"/></workbook>');
      expect(forceRecalcOnLoad('<workbook><sheets/><extLst/></workbook>')).toBe('<workbook><sheets/><calcPr fullCalcOnLoad="1"/><extLst/></workbook>');
    });
    it('refuses a prefixed workbook', () => {
      expect(() => forceRecalcOnLoad('<x:workbook></x:workbook>')).toThrow(PatchError);
    });
  });

  describe('patchWorkbook — everything else in the package is unchanged (Review Focus 1)', () => {
    it('every entry except the sheet and workbook.xml is byte-identical; workbook.xml differs only by fullCalcOnLoad; the sheet only in the edited cells', async () => {
      const original = await readZipEntries(await buildXlsx([SHEET]));
      const patched = await readZipEntries(await writeZip(patchWorkbook(original, 'xl/worksheets/sheet1.xml', [num('E3', 750), { ref: 'G3', kind: 'text', text: 'Vắng — không có bài nộp' }])));

      expect(patched.map((e) => e.name)).toEqual(original.map((e) => e.name));
      for (const before of original) {
        const after = patched.find((e) => e.name === before.name)!;
        if (before.name === 'xl/worksheets/sheet1.xml' || before.name === 'xl/workbook.xml') continue;
        expect({ name: before.name, same: after.data.equals(before.data) }).toEqual({ name: before.name, same: true });
        expect(after.date).toEqual(before.date);
      }
      const wbBefore = original.find((e) => e.name === 'xl/workbook.xml')!.data.toString();
      const wbAfter = patched.find((e) => e.name === 'xl/workbook.xml')!.data.toString();
      expect(wbAfter.replace(' fullCalcOnLoad="1"', '')).toBe(wbBefore);
      const shBefore = original.find((e) => e.name === 'xl/worksheets/sheet1.xml')!.data.toString();
      const shAfter = patched.find((e) => e.name === 'xl/worksheets/sheet1.xml')!.data.toString();
      expect(without(shAfter, ['E3', 'G3'])).toBe(without(shBefore, ['E3', 'G3']).replace('<dimension ref="A1:F8"/>', '<dimension ref="A1:G8"/>'));
    });

    it('a workbook with no <calcPr> gets one; with no edits nothing at all changes', async () => {
      const original = await readZipEntries(await buildXlsx([SHEET], { noCalcPr: true }));
      const patched = patchWorkbook(original, 'xl/worksheets/sheet1.xml', [num('E3', 100)]);
      const wb = patched.find((e) => e.name === 'xl/workbook.xml')!.data.toString();
      expect(wb.replace('<calcPr fullCalcOnLoad="1"/>', '')).toBe(original.find((e) => e.name === 'xl/workbook.xml')!.data.toString());
      expect(patchWorkbook(original, 'xl/worksheets/sheet1.xml', [])).toBe(original);
    });

    it('refuses a sheet part that is not in the package', async () => {
      const original = await readZipEntries(await buildXlsx([SHEET]));
      expect(() => patchWorkbook(original, 'xl/worksheets/sheet9.xml', [num('E3', 100)])).toThrow(PatchError);
    });
  });
  ```

  ```bash
  pnpm --filter api exec jest src/grade-export/xlsx/sheet-patch.spec.ts
  ```

  Expected: **RED** — `Cannot find module './sheet-patch'`.

- [ ] **Step 2: GREEN.** Create `sheet-patch.ts`:

  ```ts
  import { encodeXml, indexToCol, parseRef, readAttr } from './xml-text';
  import type { ZipEntry } from './zip-io';

  /**
   * Vá ĐÚNG các ô được yêu cầu trong XML của một trang tính — không dựng lại workbook (spec D1). Mọi dòng không
   * đụng tới được phát lại NGUYÊN VĂN; ô có sẵn giữ mọi thuộc tính trừ `t`; ô/dòng thiếu được chèn ĐÚNG THỨ TỰ.
   * Ô có công thức bị từ chối: ghi đè nó phá dữ liệu của giảng viên và làm `calcChain` lệch.
   */
  export class PatchError extends Error {}

  export type CellEdit =
    | { ref: string; kind: 'number'; hundredths: number }
    | { ref: string; kind: 'text'; text: string }
    | { ref: string; kind: 'clear' };

  /** `725` → `7.25`, `750` → `7.5`, `1000` → `10`. Từ SỐ NGUYÊN, không qua số thực (parent §13.2). */
  export function hundredthsToXml(hundredths: number): string {
    if (!Number.isInteger(hundredths) || hundredths < 0) throw new PatchError(`điểm ${hundredths} không hợp lệ`);
    const whole = Math.floor(hundredths / 100);
    const frac = hundredths % 100;
    if (frac === 0) return String(whole);
    return frac % 10 === 0 ? `${whole}.${frac / 10}` : `${whole}.${String(frac).padStart(2, '0')}`;
  }

  const ROW_RE = /<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g;
  const CELL_RE = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
  const HAS_FORMULA = /<f[\s>/]/;

  const keepAttrs = (attrs: string) => attrs.replace(/\s+(?:r|t)=(?:"[^"]*"|'[^']*')/g, '');

  function cellXml(ref: string, kept: string, edit: CellEdit): string {
    const head = `<c r="${ref}"${kept}`;
    switch (edit.kind) {
      case 'number':
        return `${head}><v>${hundredthsToXml(edit.hundredths)}</v></c>`;
      case 'text':
        return `${head} t="inlineStr"><is><t xml:space="preserve">${encodeXml(edit.text)}</t></is></c>`;
      case 'clear':
        return `${head}/>`;
    }
  }

  function groupByColumn(row: number, edits: CellEdit[]): Map<number, CellEdit> {
    const byCol = new Map<number, CellEdit>();
    for (const edit of edits) {
      const pos = parseRef(edit.ref)!;
      if (pos.row !== row) throw new PatchError(`ô ${edit.ref} không thuộc dòng ${row}`);
      if (byCol.has(pos.col)) throw new PatchError(`ô ${edit.ref} được sửa hai lần`);
      byCol.set(pos.col, edit);
    }
    return byCol;
  }

  function newRow(row: number, edits: CellEdit[]): string {
    const cells = [...groupByColumn(row, edits)]
      .filter(([, edit]) => edit.kind !== 'clear') // xoá một ô chưa có là không làm gì — không tạo dòng chỉ để xoá
      .sort((a, b) => a[0] - b[0])
      .map(([, edit]) => cellXml(edit.ref, '', edit));
    return cells.length === 0 ? '' : `<row r="${row}">${cells.join('')}</row>`;
  }

  function patchRow(rowXml: string, row: number, edits: CellEdit[]): string {
    const m = /^<row\b([^>]*?)(\/>|>([\s\S]*)<\/row>)$/.exec(rowXml);
    if (!m) throw new PatchError(`không đọc được dòng ${row}`);
    const attrs = (m[1] ?? '').replace(/\s+spans=(?:"[^"]*"|'[^']*')/, ''); // `spans` chỉ là gợi ý tối ưu; bỏ để không sai
    const content = m[3] ?? '';

    const cells: { col: number; xml: string; attrs: string; formula: boolean }[] = [];
    let cursor = 0;
    for (const c of content.matchAll(CELL_RE)) {
      if (content.slice(cursor, c.index ?? 0).trim() !== '') throw new PatchError(`nội dung lạ giữa các ô ở dòng ${row}`);
      const ref = readAttr(c[1] ?? '', 'r');
      const pos = ref ? parseRef(ref) : null;
      if (!pos || pos.row !== row) throw new PatchError(`ô không có địa chỉ hợp lệ trong dòng ${row}`);
      const prev = cells[cells.length - 1];
      if (prev && pos.col <= prev.col) throw new PatchError(`các ô của dòng ${row} không theo thứ tự cột`);
      cells.push({ col: pos.col, xml: c[0], attrs: c[1] ?? '', formula: HAS_FORMULA.test(c[2] ?? '') });
      cursor = (c.index ?? 0) + c[0].length;
    }
    if (content.slice(cursor).trim() !== '') throw new PatchError(`nội dung lạ sau ô cuối của dòng ${row}`);

    const byCol = groupByColumn(row, edits);
    const out: { col: number; xml: string }[] = [];
    const used = new Set<number>();
    let changed = false;
    for (const cell of cells) {
      const edit = byCol.get(cell.col);
      if (!edit) {
        out.push({ col: cell.col, xml: cell.xml });
        continue;
      }
      if (cell.formula) throw new PatchError(`ô ${edit.ref} có công thức — không ghi được`);
      used.add(cell.col);
      changed = true;
      out.push({ col: cell.col, xml: cellXml(edit.ref, keepAttrs(cell.attrs), edit) });
    }
    for (const [col, edit] of byCol) {
      if (used.has(col) || edit.kind === 'clear') continue;
      changed = true;
      out.push({ col, xml: cellXml(edit.ref, '', edit) });
    }
    if (!changed) return rowXml;
    out.sort((a, b) => a.col - b.col);
    return `<row${attrs}>${out.map((c) => c.xml).join('')}</row>`;
  }

  function extendDimension(xml: string, written: { col: number; row: number }[]): string {
    if (written.length === 0) return xml;
    const m = /<dimension\b([^>]*?)\/>/.exec(xml);
    if (!m) return xml;
    const ref = readAttr(m[1] ?? '', 'ref');
    if (!ref) return xml;
    const [a, b] = ref.split(':');
    const p1 = parseRef(a ?? '');
    const p2 = parseRef(b ?? a ?? '');
    if (!p1 || !p2) return xml;
    let { col: col1, row: row1 } = p1;
    let { col: col2, row: row2 } = p2;
    for (const p of written) {
      col1 = Math.min(col1, p.col);
      row1 = Math.min(row1, p.row);
      col2 = Math.max(col2, p.col);
      row2 = Math.max(row2, p.row);
    }
    if (col1 === p1.col && row1 === p1.row && col2 === p2.col && row2 === p2.row) return xml;
    return xml.replace(m[0], () => `<dimension ref="${indexToCol(col1)}${row1}:${indexToCol(col2)}${row2}"/>`);
  }

  export function patchSheet(xml: string, edits: CellEdit[]): string {
    if (edits.length === 0) return xml;
    if (!/<worksheet[\s>]/.test(xml)) throw new PatchError('trang tính có tiền tố namespace');

    const byRow = new Map<number, CellEdit[]>();
    const written: { col: number; row: number }[] = [];
    for (const edit of edits) {
      const pos = parseRef(edit.ref);
      if (!pos) throw new PatchError(`địa chỉ ô "${edit.ref}" không hợp lệ`);
      if (edit.kind !== 'clear') written.push(pos);
      byRow.set(pos.row, [...(byRow.get(pos.row) ?? []), edit]);
    }

    const open = /<sheetData\b[^>]*?(\/>|>)/.exec(xml);
    if (!open) throw new PatchError('trang tính không có <sheetData>');
    const openEnd = open.index + open[0].length;
    let inner = '';
    let closeEnd = openEnd;
    if (open[1] === '>') {
      const closeAt = xml.indexOf('</sheetData>', openEnd);
      if (closeAt < 0) throw new PatchError('<sheetData> không đóng');
      inner = xml.slice(openEnd, closeAt);
      closeEnd = closeAt + '</sheetData>'.length;
    }

    const chunks: { row: number; text: string }[] = [];
    let cursor = 0;
    for (const m of inner.matchAll(ROW_RE)) {
      if (inner.slice(cursor, m.index ?? 0).trim() !== '') throw new PatchError('có nội dung lạ giữa các dòng');
      const rAttr = readAttr(m[1] ?? '', 'r');
      const row = rAttr === null ? NaN : Number(rAttr);
      if (!Number.isInteger(row) || row < 1) throw new PatchError('dòng không có địa chỉ (r)');
      const prev = chunks[chunks.length - 1];
      if (prev && row <= prev.row) throw new PatchError('các dòng không theo thứ tự tăng dần');
      chunks.push({ row, text: m[0] });
      cursor = (m.index ?? 0) + m[0].length;
    }
    if (inner.slice(cursor).trim() !== '') throw new PatchError('có nội dung lạ sau dòng cuối');

    const pending = [...byRow.keys()].sort((a, b) => a - b);
    let p = 0;
    const out: string[] = [];
    const flushNewRowsBefore = (limit: number) => {
      while (p < pending.length && pending[p]! < limit) {
        out.push(newRow(pending[p]!, byRow.get(pending[p]!)!));
        p++;
      }
    };
    for (const chunk of chunks) {
      flushNewRowsBefore(chunk.row);
      if (p < pending.length && pending[p] === chunk.row) {
        out.push(patchRow(chunk.text, chunk.row, byRow.get(chunk.row)!));
        p++;
      } else {
        out.push(chunk.text);
      }
    }
    flushNewRowsBefore(Number.POSITIVE_INFINITY);

    const openTag = open[1] === '>' ? xml.slice(open.index, openEnd) : '<sheetData>';
    const result = xml.slice(0, open.index) + openTag + out.join('') + '</sheetData>' + xml.slice(closeEnd);
    return extendDimension(result, written);
  }

  /**
   * D25 — công thức phụ thuộc ô ta ghi (cột *Tổng kết*) giữ giá trị đệm CŨ nếu ta chỉ vá ô điểm. `fullCalcOnLoad`
   * bảo Excel tính lại khi mở. Đây là thay đổi DUY NHẤT ngoài trang tính đích.
   */
  export function forceRecalcOnLoad(workbookXml: string): string {
    if (!/<workbook[\s>]/.test(workbookXml)) throw new PatchError('workbook.xml có tiền tố namespace');
    const calc = /<calcPr\b([^>]*?)(?:\/>|>\s*<\/calcPr>)/.exec(workbookXml);
    if (calc) {
      const attrs = calc[1] ?? '';
      const next = /\sfullCalcOnLoad=(?:"[^"]*"|'[^']*')/.test(attrs)
        ? attrs.replace(/(\sfullCalcOnLoad=)(?:"[^"]*"|'[^']*')/, '$1"1"')
        : `${attrs} fullCalcOnLoad="1"`;
      return workbookXml.replace(calc[0], () => `<calcPr${next}/>`);
    }
    // Thứ tự phần tử của CT_Workbook: … definedNames, calcPr, oleSize, customWorkbookViews, pivotCaches, … extLst.
    const after = ['<oleSize', '<customWorkbookViews', '<pivotCaches', '<smartTagPr', '<smartTagTypes', '<webPublishing', '<fileRecoveryPr', '<webPublishObjects', '<extLst', '</workbook>'];
    let at = -1;
    for (const marker of after) {
      const i = workbookXml.indexOf(marker);
      if (i >= 0 && (at < 0 || i < at)) at = i;
    }
    if (at < 0) throw new PatchError('workbook.xml không có </workbook>');
    return workbookXml.slice(0, at) + '<calcPr fullCalcOnLoad="1"/>' + workbookXml.slice(at);
  }

  /** Thay trang tính đích và (khi có ô sửa) `xl/workbook.xml`; mọi entry khác được trả về NGUYÊN đối tượng. */
  export function patchWorkbook(entries: ZipEntry[], sheetPath: string, edits: CellEdit[]): ZipEntry[] {
    if (!entries.some((entry) => entry.name === sheetPath)) throw new PatchError(`không có ${sheetPath}`);
    if (edits.length === 0) return entries;
    return entries.map((entry) => {
      if (entry.name === sheetPath) return { ...entry, data: Buffer.from(patchSheet(entry.data.toString('utf8'), edits), 'utf8') };
      if (entry.name === 'xl/workbook.xml') return { ...entry, data: Buffer.from(forceRecalcOnLoad(entry.data.toString('utf8')), 'utf8') };
      return entry;
    });
  }
  ```

  ```bash
  pnpm --filter api exec jest src/grade-export/xlsx
  pnpm --filter api exec tsc --noEmit
  pnpm --filter api exec eslint src/grade-export/xlsx
  ```

  Expected: all four suites green (`sheet-patch` 31 passed: the `it.each` counts nine); `tsc` clean; eslint 0 errors. The two assertions most likely to need a second look are the row-order one (`[1,2,3,4,5,6,7,8,12]` — the fixture has rows 1-5, `null` at row 6, `[]` at row 7, then row 8) and the `dimension` values (`A1:F8`, produced by the fixture from `rows.length = 8`); if either differs, fix the **expectation to what the fixture really builds**, not the implementation, after checking the XML by eye.

- [ ] **Step 3: mutation check — prove the preservation test bites.** Temporarily change `patchWorkbook` so it also rewrites one other entry (for example `entry.name === 'xl/styles.xml'` returns `{ ...entry, data: Buffer.from(entry.data.toString('utf8') + ' ', 'utf8') }`) and run the last `describe`:

  ```bash
  pnpm --filter api exec jest src/grade-export/xlsx/sheet-patch.spec.ts -t "everything else in the package"
  ```

  Expected: the first case fails naming `xl/styles.xml` (`same: false`). Restore, re-run green, and record the failure line in the ledger. If it does **not** fail, the test is not proving what it claims — fix the test first.

- [ ] **Step 4: commit.** Title: `feat(grade-export): vá đúng các ô được yêu cầu trong trang tính, giữ nguyên mọi phần khác; buộc tính lại công thức khi mở`.


---

### Task 5: four small pure modules — the score as a string, rounding, blank reasons, MSSV matching

**Files:** create `apps/api/src/grade-export/{score-string,rounding,blank-reason,mssv-match}.ts` and the four `.spec.ts` beside them.

**Interfaces**
- Consumes: `currentScore`, `CurrentScoreInput`, `CurrentScore` (`grading/scoring/current-score.ts`), `parseHundredths` (`grading/scoring/hundredths.ts`), `BlankReason`, `ROUNDING_STEPS` (Task 1).
- Produces:
  - `pickScore(input: CurrentScoreInput): { raw: string; hundredths: number; source: CurrentScore['source'] } | null`
  - `roundHalfUp(hundredths: number, step: number): number`
  - `BLANK_LABELS: Record<BlankReason, string>`, `blankReasonOf({ hasSubmission, status, ungradableClass }): BlankReason | null`, `isOwnLabel(text: string): boolean`
  - `normalizeMssv`, `buildMssvIndex`, `matchMssv`, types `SessionStudent`, `MssvCell`, `MssvIndex`, `MatchResult`

`pickScore` is where spec D8 lives: `currentScore()` decides **which source wins** (so §14.2 stays in one place) and we then read the **raw string of that source** — the `value` it returns is a float and is never used.

- [ ] **Step 1: RED — the four specs.**

  `score-string.spec.ts`:

  ```ts
  import { currentScore, type CurrentScoreInput } from '../grading/scoring/current-score';
  import { pickScore } from './score-string';

  const base: CurrentScoreInput = {
    pipeline: 'investigator', aiTotalScore: null, latestScoredReview: null, latestManualScore: null,
    finalized: false, finalizedComputationScore: null, latestComputationScore: null,
  };

  const CASES: [string, CurrentScoreInput, string | null, string][] = [
    ['one_shot: the teacher review wins over the AI score', { ...base, pipeline: 'one_shot', aiTotalScore: '7.00', latestScoredReview: { kind: 'review', finalScore: '6.50' } }, '6.50', 'review'],
    ['one_shot: the AI score when nobody reviewed', { ...base, pipeline: 'one_shot', aiTotalScore: '7.00' }, '7.00', 'ai'],
    ['one_shot: nothing', { ...base, pipeline: 'one_shot' }, null, 'none'],
    ['investigator: a manual score beats everything', { ...base, latestManualScore: '5.25', finalized: true, finalizedComputationScore: '9.00', latestComputationScore: '9.50' }, '5.25', 'manual'],
    ['investigator: finalized uses the FINALIZED computation, not the latest', { ...base, finalized: true, finalizedComputationScore: '9.00', latestComputationScore: '8.00' }, '9.00', 'finalized'],
    ['investigator: not finalized uses the latest computation', { ...base, finalizedComputationScore: '9.00', latestComputationScore: '8.00' }, '8.00', 'computation'],
    ['investigator: ai_total_score is never the current score', { ...base, aiTotalScore: '9.99' }, null, 'none'],
    ['investigator: nothing', base, null, 'none'],
  ];

  describe('pickScore — same source and same number as currentScore(), but as a string', () => {
    it.each(CASES)('%s', (_name, input, raw, source) => {
      const picked = pickScore(input);
      const current = currentScore(input);
      expect(picked?.raw ?? null).toBe(raw);
      expect(picked?.source ?? 'none').toBe(source);
      expect(picked === null).toBe(current.value === null);
      if (picked) expect(Number(picked.raw)).toBe(current.value); // parity check only — production code never does this
    });

    it('turns the string into integer hundredths without a float', () => {
      const at = (score: string) => pickScore({ ...base, latestComputationScore: score })!.hundredths;
      expect(at('9.70')).toBe(970);
      expect(at('10.00')).toBe(1000);
      expect(at('0.10')).toBe(10);
      expect(at('7.5')).toBe(750);
      expect(at('0')).toBe(0);
    });

    it('a malformed score is an error, not a guess', () => {
      expect(() => pickScore({ ...base, latestComputationScore: 'abc' })).toThrow();
      expect(() => pickScore({ ...base, latestComputationScore: '-1.00' })).toThrow();
    });
  });
  ```

  `rounding.spec.ts`:

  ```ts
  import { ROUNDING_STEPS } from './grade-export.types';
  import { roundHalfUp } from './rounding';

  describe('roundHalfUp — integer arithmetic only (parent §13.2)', () => {
    it.each([
      // v, step, expected
      [725, 50, 750], [724, 50, 700], [726, 50, 750], [710, 50, 700], [720, 50, 700], [775, 50, 800],
      [725, 25, 725], [730, 25, 725], [737, 25, 725], [739, 25, 750], [738, 25, 750],
      [265, 10, 270], [264, 10, 260], [675, 10, 680], [674, 10, 670],
      [725, 1, 725], [0, 50, 0], [1000, 50, 1000], [999, 50, 1000],
    ])('%i at step %i → %i', (hundredths, step, expected) => {
      expect(roundHalfUp(hundredths, step)).toBe(expected);
    });

    it('7,10 and 7,20 both give 7,0 at 0,5 (nothing changed) while 7,24 → 7,26 gives 7,0 → 7,5 (it did) — spec §13.1 rule 3', () => {
      expect(roundHalfUp(710, 50)).toBe(roundHalfUp(720, 50));
      expect(roundHalfUp(726, 50)).toBeGreaterThan(roundHalfUp(724, 50));
    });

    it('10 − 0,1 − 0,2 is exactly 9,70 on the integer path (floats give 9,700000000000001)', () => {
      expect(1000 - 10 - 20).toBe(970);
      expect(roundHalfUp(1000 - 10 - 20, 1)).toBe(970);
      expect(10 - 0.1 - 0.2).not.toBe(9.7); // the hazard this module exists to avoid
    });

    it('2,65 goes UP to 2,7 at step 0,1 — toFixed would say 2,6', () => {
      expect(roundHalfUp(265, 10)).toBe(270);
      expect((2.65).toFixed(1)).toBe('2.6'); // the hazard
    });

    it('is idempotent and never moves a score by more than half a step', () => {
      for (const step of ROUNDING_STEPS) {
        for (let v = 0; v <= 1000; v++) {
          const r = roundHalfUp(v, step);
          expect(roundHalfUp(r, step)).toBe(r);
          expect(r % step).toBe(0);
          expect(Math.abs(r - v) * 2).toBeLessThanOrEqual(step);
        }
      }
    });

    it('refuses a step outside {1, 10, 25, 50} and a score that is not a non-negative integer', () => {
      expect(() => roundHalfUp(700, 5)).toThrow(RangeError);
      expect(() => roundHalfUp(700, 0)).toThrow(RangeError);
      expect(() => roundHalfUp(7.5, 10)).toThrow(RangeError);
      expect(() => roundHalfUp(-1, 10)).toThrow(RangeError);
    });
  });
  ```

  `blank-reason.spec.ts`:

  ```ts
  import { BLANK_LABELS, blankReasonOf, isOwnLabel } from './blank-reason';

  describe('blankReasonOf (parent §13.1 rule 5 — four meanings of an empty cell)', () => {
    const at = (status: string | null, ungradableClass: string | null = null, hasSubmission = true) =>
      blankReasonOf({ hasSubmission, status, ungradableClass });

    it('no submission is "absent" — whatever else is known', () => {
      expect(at(null, null, false)).toBe('absent');
      expect(at('finalized', null, false)).toBe('absent');
    });
    it('a submission with no grading result is "not finished"', () => {
      expect(at(null)).toBe('not_finished');
    });
    it('a published result has no blank reason at all', () => {
      expect(at('finalized')).toBeNull();
      expect(at('exported')).toBeNull();
    });
    it('a result that could not be graded is "ungradable" — either class', () => {
      expect(at('flagged_for_review', 'system')).toBe('ungradable');
      expect(at('flagged_for_review', 'submission')).toBe('ungradable');
    });
    it('a result waiting for the teacher is "flagged"', () => {
      expect(at('flagged_for_review')).toBe('flagged');
      expect(at('audit_pending')).toBe('flagged');
    });
    it.each(['ai_grading', 'ai_graded', 'auto_approved', 'teacher_reviewed'])('%s is "not finished" — even if a score already exists (never provisional)', (status) => {
      expect(at(status)).toBe('not_finished');
    });
  });

  describe('labels', () => {
    it('has four distinct Vietnamese labels', () => {
      expect(Object.keys(BLANK_LABELS).sort()).toEqual(['absent', 'flagged', 'not_finished', 'ungradable']);
      expect(new Set(Object.values(BLANK_LABELS)).size).toBe(4);
      expect(BLANK_LABELS.absent).toBe('Vắng — không có bài nộp');
    });
    it('isOwnLabel recognises exactly the labels the system writes (trimmed, case-sensitive)', () => {
      for (const label of Object.values(BLANK_LABELS)) {
        expect(isOwnLabel(label)).toBe(true);
        expect(isOwnLabel(`  ${label} `)).toBe(true);
      }
      expect(isOwnLabel('')).toBe(false);
      expect(isOwnLabel('Vắng')).toBe(false);
      expect(isOwnLabel(BLANK_LABELS.absent.toUpperCase())).toBe(false);
      expect(isOwnLabel('Ghi chú của thầy')).toBe(false);
    });
  });
  ```

  `mssv-match.spec.ts`:

  ```ts
  import { buildMssvIndex, matchMssv, normalizeMssv, type MssvCell } from './mssv-match';

  const students = [
    { mssv: '20120001', name: 'An' },
    { mssv: 'SV000002', name: 'Bình' },
    { mssv: '0012345', name: 'Cường' },
  ];
  const index = buildMssvIndex(students);
  const text = (t: string): MssvCell => ({ text: t, kind: 'text' });
  const number = (t: string): MssvCell => ({ text: t, kind: 'number' });

  describe('normalizeMssv', () => {
    it('trims, drops zero-width characters and folds full-width digits', () => {
      expect(normalizeMssv('  20120001 ')).toBe('20120001');
      expect(normalizeMssv('2012​0001')).toBe('20120001');
      expect(normalizeMssv(' 20120001 ')).toBe('20120001');
      expect(normalizeMssv('２０１２０００１')).toBe('20120001');
    });
  });

  describe('matchMssv (spec D10)', () => {
    it('matches exactly, ignoring case (citext) and surrounding blanks', () => {
      expect(matchMssv(text(' 20120001 '), index)).toMatchObject({ kind: 'matched', student: { name: 'An' }, note: null });
      expect(matchMssv(text('sv000002'), index)).toMatchObject({ kind: 'matched', student: { name: 'Bình' }, note: null });
    });
    it('a numeric cell matches when the digits are the same', () => {
      expect(matchMssv(number('20120001'), index)).toMatchObject({ kind: 'matched', note: null });
    });
    it('a NUMERIC cell that lost its leading zeros matches the one session MSSV that fits — and says so', () => {
      expect(matchMssv(number('12345'), index)).toMatchObject({ kind: 'matched', student: { name: 'Cường' }, note: 'Khớp sau khi bỏ số 0 đầu (ô số).' });
    });
    it('a TEXT cell never gets the leading-zero treatment', () => {
      expect(matchMssv(text('12345'), index)).toMatchObject({ kind: 'unmatched', reason: 'not_found' });
    });
    it('is ambiguous — and refuses — when two session MSSVs fit after stripping zeros', () => {
      const two = buildMssvIndex([{ mssv: '012345', name: 'A' }, { mssv: '0012345', name: 'B' }]);
      expect(matchMssv(number('12345'), two)).toMatchObject({ kind: 'unmatched', reason: 'ambiguous' });
    });
    it('an exact match beats the leading-zero rule', () => {
      const both = buildMssvIndex([{ mssv: '12345', name: 'Exact' }, { mssv: '012345', name: 'Padded' }]);
      expect(matchMssv(number('12345'), both)).toMatchObject({ kind: 'matched', student: { name: 'Exact' }, note: null });
    });
    it('something that does not look like an MSSV is "not_mssv", not "not found"', () => {
      for (const bad of ['MSSV', 'Họ tên', '2012 0001', 'A-1', '123', 'x'.repeat(21)]) {
        expect(matchMssv(text(bad), index)).toMatchObject({ kind: 'unmatched', reason: 'not_mssv' });
      }
    });
    it('a well-formed MSSV that is not in the session is "not_found"', () => {
      expect(matchMssv(text('99999999'), index)).toMatchObject({ kind: 'unmatched', reason: 'not_found', note: 'Không có trong danh sách sinh viên của phiên.' });
    });
    it('a numeric cell in scientific notation cannot match anything', () => {
      expect(matchMssv(number('2.0120001E7'), index)).toMatchObject({ kind: 'unmatched' });
    });
  });
  ```

  ```bash
  pnpm --filter api exec jest src/grade-export/score-string.spec.ts src/grade-export/rounding.spec.ts src/grade-export/blank-reason.spec.ts src/grade-export/mssv-match.spec.ts
  ```

  Expected: **RED** — four `Cannot find module` errors.

- [ ] **Step 2: GREEN — the four modules.**

  `score-string.ts`:

  ```ts
  import { currentScore, type CurrentScore, type CurrentScoreInput } from '../grading/scoring/current-score';
  import { parseHundredths } from '../grading/scoring/hundredths';

  export interface PickedScore {
    /** Chuỗi `numeric` thô của đúng nguồn được chọn — không bao giờ qua số thực. */
    raw: string;
    hundredths: number;
    source: CurrentScore['source'];
  }

  /**
   * Điểm hiện tại của MỘT bài, dạng chuỗi (spec D8). `currentScore()` quyết nguồn nào thắng — đúng một chỗ
   * (§14.2) — rồi ta lấy chuỗi thô của nguồn đó. Trường `value` (số thực) của `currentScore()` KHÔNG được dùng:
   * đọc điểm qua số thực là hỏng theo parent §13.2.
   */
  export function pickScore(input: CurrentScoreInput): PickedScore | null {
    const { source } = currentScore(input);
    let raw: string | null;
    switch (source) {
      case 'review':
        raw = input.latestScoredReview?.finalScore ?? null;
        break;
      case 'ai':
        raw = input.aiTotalScore;
        break;
      case 'manual':
        raw = input.latestManualScore;
        break;
      case 'finalized':
        raw = input.finalizedComputationScore;
        break;
      case 'computation':
        raw = input.latestComputationScore;
        break;
      default:
        raw = null;
    }
    return raw === null ? null : { raw, hundredths: parseHundredths(raw), source };
  }
  ```

  `rounding.ts`:

  ```ts
  import { ROUNDING_STEPS } from './grade-export.types';

  /**
   * Làm tròn NỬA LÊN với bước `step` phần trăm điểm, bằng số nguyên: `⌊(2v + s) / 2s⌋ × s` (parent §13.2).
   * Chỉ lúc ghi ra file; trong hệ thống điểm không bao giờ bị làm tròn (§13.1 luật 7).
   */
  export function roundHalfUp(hundredths: number, step: number): number {
    if (!Number.isInteger(hundredths) || hundredths < 0) throw new RangeError(`${hundredths} không phải số nguyên phần trăm điểm hợp lệ`);
    if (!(ROUNDING_STEPS as readonly number[]).includes(step)) throw new RangeError(`bước làm tròn ${step} không hợp lệ`);
    return Math.floor((2 * hundredths + step) / (2 * step)) * step;
  }
  ```

  `blank-reason.ts`:

  ```ts
  import type { BlankReason } from './grade-export.types';

  /** Bốn nghĩa của một ô trống (§13.1 luật 5) — chữ này được ghi vào cột lý do nếu giảng viên chọn cột đó. */
  export const BLANK_LABELS: Record<BlankReason, string> = {
    absent: 'Vắng — không có bài nộp',
    not_finished: 'Chưa chấm xong hoặc chưa chốt điểm',
    ungradable: 'Hệ thống không chấm được bài',
    flagged: 'Đang chờ giảng viên duyệt',
  };

  /**
   * Vì sao sinh viên này KHÔNG có điểm để ghi; `null` = bài đã công bố (`finalized`/`exported`), có điểm.
   * Một bài mới chỉ `teacher_reviewed`/`auto_approved` là "chưa chốt" dù đã có điểm tạm — điểm tạm không bao giờ
   * ra ngoài (§13.1 luật 5).
   */
  export function blankReasonOf(input: { hasSubmission: boolean; status: string | null; ungradableClass: string | null }): BlankReason | null {
    if (!input.hasSubmission) return 'absent';
    if (input.status === null) return 'not_finished';
    if (input.status === 'finalized' || input.status === 'exported') return null;
    if (input.status === 'flagged_for_review') return input.ungradableClass ? 'ungradable' : 'flagged';
    if (input.status === 'audit_pending') return 'flagged';
    return 'not_finished';
  }

  const OWN_LABELS: ReadonlySet<string> = new Set(Object.values(BLANK_LABELS));

  /** Chữ này do CHÍNH hệ thống ghi từ một lượt xuất trước → được phép xoá/ghi đè mà không hỏi (D13, D17). */
  export const isOwnLabel = (text: string): boolean => OWN_LABELS.has(text.trim());
  ```

  `mssv-match.ts`:

  ```ts
  export interface SessionStudent {
    mssv: string;
    name: string;
  }
  export interface MssvCell {
    text: string;
    kind: 'empty' | 'text' | 'number' | 'other';
  }
  export interface MssvIndex {
    byLower: Map<string, SessionStudent>;
    byStripped: Map<string, SessionStudent[]>;
  }
  export type MatchResult =
    | { kind: 'matched'; student: SessionStudent; note: string | null }
    | { kind: 'unmatched'; reason: 'not_found' | 'ambiguous' | 'not_mssv'; note: string };

  /** Cùng khuôn với `ck_session_roster_mssv` / `ck_submission_mssv`. */
  const MSSV_SHAPE = /^[A-Za-z0-9]{4,20}$/;

  /** Bỏ ký tự rộng-bằng-không, đổi chữ số toàn-góc về ASCII (NFKC), cắt khoảng trắng (kể cả NBSP). */
  export function normalizeMssv(raw: string): string {
    return raw.replace(/[​-‍﻿]/g, '').normalize('NFKC').trim();
  }

  const stripZeros = (s: string) => s.replace(/^0+(?=.)/, '');

  export function buildMssvIndex<T extends SessionStudent>(students: T[]): MssvIndex {
    const byLower = new Map<string, SessionStudent>();
    const byStripped = new Map<string, SessionStudent[]>();
    for (const student of students) {
      const key = student.mssv.toLowerCase();
      byLower.set(key, student);
      const stripped = stripZeros(key);
      byStripped.set(stripped, [...(byStripped.get(stripped) ?? []), student]);
    }
    return { byLower, byStripped };
  }

  /**
   * Khớp MỘT ô MSSV của file với sinh viên của phiên (spec D10). Không đoán ngầm: ô số mất số 0 đầu chỉ khớp khi
   * ĐÚNG MỘT MSSV của phiên hợp lý, và dòng đó mang ghi chú; mơ hồ thì từ chối.
   */
  export function matchMssv(cell: MssvCell, index: MssvIndex): MatchResult {
    const text = normalizeMssv(cell.text);
    if (!MSSV_SHAPE.test(text)) {
      return { kind: 'unmatched', reason: 'not_mssv', note: 'Không giống MSSV (4–20 chữ hoặc số, không dấu cách).' };
    }
    const exact = index.byLower.get(text.toLowerCase());
    if (exact) return { kind: 'matched', student: exact, note: null };

    if (cell.kind === 'number' && /^\d+$/.test(text)) {
      const candidates = (index.byStripped.get(stripZeros(text)) ?? []).filter((s) => s.mssv.toLowerCase() !== text.toLowerCase());
      if (candidates.length === 1) {
        return { kind: 'matched', student: candidates[0]!, note: 'Khớp sau khi bỏ số 0 đầu (ô số).' };
      }
      if (candidates.length > 1) {
        return { kind: 'unmatched', reason: 'ambiguous', note: `Mơ hồ: ${candidates.length} MSSV của phiên cùng khớp sau khi bỏ số 0 đầu.` };
      }
    }
    return { kind: 'unmatched', reason: 'not_found', note: 'Không có trong danh sách sinh viên của phiên.' };
  }
  ```

  ```bash
  pnpm --filter api exec jest src/grade-export/score-string.spec.ts src/grade-export/rounding.spec.ts src/grade-export/blank-reason.spec.ts src/grade-export/mssv-match.spec.ts
  pnpm --filter api exec tsc --noEmit
  pnpm --filter api exec eslint src/grade-export
  ```

  Expected: **score-string 10 passed, rounding 24 passed, blank-reason 11 passed, mssv-match 10 passed**; `tsc` clean; eslint 0 errors. Every row of the rounding table was checked with plain Node before this plan was written; if one disagrees, recompute it by hand with `⌊(2v+s)/2s⌋×s` before touching the code (`738 at step 25` is `⌊(1476+25)/50⌋ = 30 → 750`, which is why the table has `737 → 725` and `738 → 750`).

- [ ] **Step 3: commit.** Title: `feat(grade-export): điểm dạng chuỗi, làm tròn nửa lên bằng số nguyên, lý do ô trống, khớp MSSV không đoán`.

---

### Task 6: the plan — the messages, the rule diff, and `buildPlan`

**Files:** create `apps/api/src/grade-export/grade-export.messages.ts`, `diff-rules.ts`, `diff-rules.spec.ts`, `plan.ts`, `plan.spec.ts`.

**Interfaces**
- Consumes: Task 5 modules, `ScoreBreakdown`/`BreakdownError` (`grading/scoring/score-core.ts`), `parseHundredths`.
- Produces:
  - `MSG` (all Vietnamese messages of spec §4.7).
  - `diffRules(before, after): RuleDelta[]`, `attribute(input: AttributeInput): Cause[]`, `summarizeChanges(rows, previousExports): ChangesSummary | null`, types `Cause`, `RuleDelta`, `CauseTally`, `ChangesSummary`.
  - `buildPlan(input: PlanInput): ExportPlan`, types `FileCell`, `FileRowInput`, `StudentOutcome`, `PlanStudent`, `PreviousWrite`, `PlanInput`, `PlanRow`, `RowAction`, `ExportPlan`.

`buildPlan` is pure: it turns *file rows + session students + previous writes + rounding* into one row per file line and the counts, blockers and digest the routes return. Nothing here reads a database or a file.

- [ ] **Step 1: RED — `diff-rules.spec.ts` and `plan.spec.ts`.**

  `diff-rules.spec.ts`:

  ```ts
  import type { BreakdownError, ScoreBreakdown } from '../grading/scoring/score-core';
  import { attribute, diffRules, summarizeChanges } from './diff-rules';

  const err = (ruleKey: string, deductionHundredths: number | null, counted: BreakdownError['counted'] = 'counted'): BreakdownError => ({
    ruleId: `id-${ruleKey}`, revisionId: `rev-${ruleKey}`, ruleKey, criterionKey: 'tinh_dung', source: 'deterministic', toolCallIds: [], deductionHundredths, counted,
  });
  const bd = (...errors: BreakdownError[]): ScoreBreakdown => ({
    errors, perCriterion: [], caseFlags: [], errorFlags: [], confidence: null, mismatchedRules: [], notConsidered: [], ungradable: null,
  });

  describe('diffRules — effective deduction = counted ? deduction : 0', () => {
    it('a rule that appeared costs more (+), a rule that disappeared costs less (−)', () => {
      expect(diffRules(bd(err('a', 150)), bd(err('a', 150), err('b', 50)))).toEqual([{ ruleId: 'id-b', ruleKey: 'b', revisionId: 'rev-b', delta: 50 }]);
      expect(diffRules(bd(err('a', 150), err('b', 50)), bd(err('a', 150)))).toEqual([{ ruleId: 'id-b', ruleKey: 'b', revisionId: 'rev-b', delta: -50 }]);
    });
    it('a price change is the difference in deduction', () => {
      expect(diffRules(bd(err('a', 150)), bd(err('a', 200)))).toMatchObject([{ ruleKey: 'a', delta: 50 }]);
    });
    it('counted → excluded/refuted stops costing anything; unpriced → counted starts', () => {
      expect(diffRules(bd(err('a', 150)), bd(err('a', 150, 'excluded')))).toMatchObject([{ delta: -150 }]);
      expect(diffRules(bd(err('a', 150)), bd(err('a', 150, 'refuted')))).toMatchObject([{ delta: -150 }]);
      expect(diffRules(bd(err('a', null, 'unpriced')), bd(err('a', 150)))).toMatchObject([{ delta: 150 }]);
    });
    it('identical breakdowns differ in nothing; a missing "before" makes everything +', () => {
      expect(diffRules(bd(err('a', 150)), bd(err('a', 150)))).toEqual([]);
      expect(diffRules(null, bd(err('a', 150)))).toMatchObject([{ delta: 150 }]);
      expect(diffRules(bd(err('a', 150)), null)).toMatchObject([{ delta: -150 }]);
    });
  });

  describe('attribute — why did this student’s rounded score change?', () => {
    const names = new Map([['rev-a', 'Sai biên']]);
    const base = { currentSource: 'finalized', previousWritten: 850, previousStep: 1, currentRaw: 800, previousBreakdown: bd(err('a', 150)), currentBreakdown: bd(err('a', 200)), ruleNames: names };

    it('a rule that now costs more explains a decrease', () => {
      expect(attribute({ ...base, direction: 'down' })).toEqual([{ kind: 'rule', ruleKey: 'a', ruleName: 'Sai biên', delta: 50 }]);
    });
    it('a rule that now costs less explains an increase — and a decrease is never blamed on it', () => {
      const flip = { ...base, previousWritten: 800, currentRaw: 850, previousBreakdown: bd(err('a', 200)), currentBreakdown: bd(err('a', 150)) };
      expect(attribute({ ...flip, direction: 'up' })).toMatchObject([{ kind: 'rule', delta: -50 }]);
      expect(attribute({ ...flip, direction: 'down' })).toEqual([{ kind: 'unknown' }]);
    });
    it('a score that rounds to what was written under the OLD step means only the step changed', () => {
      // 7,25 was written as 7,5 at step 0,5; at step 0,01 it is 7,25 — lower, but only because of the step.
      expect(attribute({ ...base, previousWritten: 750, previousStep: 50, currentRaw: 725, direction: 'down' })).toEqual([{ kind: 'rounding' }]);
    });
    it('the same holds for a hand-graded score, which has no computation to compare', () => {
      expect(attribute({ ...base, currentSource: 'manual', previousWritten: 550, previousStep: 50, currentRaw: 525, direction: 'down' })).toEqual([{ kind: 'rounding' }]);
    });
    it('a finer step can also expose a small real change; it is still called rounding, because that is what the teacher can see', () => {
      expect(attribute({ ...base, previousWritten: 700, previousStep: 50, currentRaw: 720, direction: 'up' })).toEqual([{ kind: 'rounding' }]);
    });
    it('a hand-graded or reviewed score is named as such', () => {
      expect(attribute({ ...base, currentSource: 'manual', direction: 'down' })).toEqual([{ kind: 'manual_score' }]);
      expect(attribute({ ...base, currentSource: 'review', direction: 'down' })).toEqual([{ kind: 'review' }]);
    });
    it('no earlier computation to compare with is "unknown", not a guess', () => {
      expect(attribute({ ...base, previousBreakdown: null, direction: 'down' })).toEqual([{ kind: 'unknown' }]);
      expect(attribute({ ...base, currentBreakdown: null, direction: 'down' })).toEqual([{ kind: 'unknown' }]);
    });
    it('a rule with no name on file still gets a cause, with a null name', () => {
      expect(attribute({ ...base, ruleNames: new Map(), direction: 'down' })).toEqual([{ kind: 'rule', ruleKey: 'a', ruleName: null, delta: 50 }]);
    });
  });

  describe('summarizeChanges', () => {
    const rule = (ruleKey: string, ruleName: string) => ({ kind: 'rule' as const, ruleKey, ruleName, delta: 50 });
    it('is null on a first export', () => {
      expect(summarizeChanges([{ direction: null, causes: [] }], 0)).toBeNull();
    });
    it('counts directions and tallies causes per direction, one count per student', () => {
      const out = summarizeChanges(
        [
          { direction: 'down', causes: [rule('a', 'Sai biên')] },
          { direction: 'down', causes: [rule('a', 'Sai biên'), { kind: 'rounding' }] },
          { direction: 'up', causes: [{ kind: 'manual_score' }] },
          { direction: 'same', causes: [] },
          { direction: 'new', causes: [] },
          { direction: null, causes: [] },
        ],
        2,
      );
      expect(out).toMatchObject({ previousExports: 2, up: 1, down: 2, same: 1, new: 1 });
      expect(out!.downByCause).toEqual([
        { kind: 'rule', ruleKey: 'a', ruleName: 'Sai biên', students: 2 },
        { kind: 'rounding', ruleKey: null, ruleName: null, students: 1 },
      ]);
      expect(out!.upByCause).toEqual([{ kind: 'manual_score', ruleKey: null, ruleName: null, students: 1 }]);
    });
  });
  ```

  `plan.spec.ts`:

  ```ts
  import { BLANK_LABELS } from './blank-reason';
  import type { BlankReason } from './grade-export.types';
  import { buildPlan, type FileCell, type FileRowInput, type PlanInput, type PlanStudent, type StudentOutcome } from './plan';

  const scored = (hundredths: number, computationId: string | null = 'c1'): StudentOutcome => ({ kind: 'scored', hundredths, computationId, source: 'finalized' });
  const blank = (reason: BlankReason): StudentOutcome => ({ kind: 'blank', reason });
  const student = (mssv: string, outcome: StudentOutcome, name = `SV ${mssv}`): PlanStudent => ({ mssv, name, outcome });
  const cell = (text: string, kind: FileCell['kind'] = 'text', over: Partial<FileCell> = {}): FileCell => ({
    text, kind: text === '' ? 'empty' : kind, hasFormula: false, mergedNonMaster: false, ...over,
  });
  const row = (n: number, mssv: string, over: { mssvKind?: FileCell['kind']; score?: FileCell; reason?: FileCell | null } = {}): FileRowInput => ({
    row: n, mssv: cell(mssv, over.mssvKind ?? 'text'), score: over.score ?? cell(''), reason: over.reason === undefined ? null : over.reason,
  });
  const input = (over: Partial<PlanInput> = {}): PlanInput => ({
    firstDataRow: 3, rows: [], students: [], previous: new Map(), roundingStep: 1, hasReasonColumn: false, sheetProtected: false, ...over,
  });
  const only = (plan: ReturnType<typeof buildPlan>) => plan.rows[0]!;

  describe('buildPlan — what is written', () => {
    it('writes the ROUNDED score, keeps the system score beside it, never a float', () => {
      const plan = buildPlan(input({ roundingStep: 50, students: [student('20120001', scored(725))], rows: [row(3, '20120001')] }));
      expect(only(plan)).toMatchObject({ action: 'write', systemHundredths: 725, writtenHundredths: 750, studentMssv: '20120001', note: null });
      expect(plan.summary).toMatchObject({ write: 1, blank: 0, kept: 0, unmatched: 0 });
    });

    it('a blank student is NEVER given a number', () => {
      const reasons: BlankReason[] = ['absent', 'not_finished', 'ungradable', 'flagged'];
      const plan = buildPlan(input({
        students: reasons.map((r, i) => student(`SV00000${i}`, blank(r))),
        rows: reasons.map((_, i) => row(3 + i, `SV00000${i}`)),
      }));
      expect(plan.rows.map((r) => [r.action, r.writtenHundredths, r.blankReason])).toEqual(reasons.map((r) => ['blank', null, r]));
      expect(plan.summary.blank).toBe(4);
    });

    it('rows before/around the data — empty MSSV cells — are ignored and counted, not "unmatched"', () => {
      const plan = buildPlan(input({ students: [student('20120001', scored(700))], rows: [row(3, '20120001'), row(4, ''), row(5, '   ')] }));
      expect(plan.rows).toHaveLength(1);
      expect(plan.summary.ignoredEmpty).toBe(2);
      expect(plan.summary.unmatched).toBe(0);
    });
  });

  describe('buildPlan — matching', () => {
    it('an MSSV that is not in the session is unmatched, with the reason', () => {
      const plan = buildPlan(input({ students: [student('20120001', scored(700))], rows: [row(3, '99999999'), row(4, 'Họ tên')] }));
      expect(plan.rows.map((r) => [r.action, r.studentMssv])).toEqual([['unmatched', null], ['unmatched', null]]);
      expect(plan.rows[1]!.note).toContain('Không giống MSSV');
      expect(plan.summary.unmatched).toBe(2);
    });

    it('a numeric cell that lost its zeros matches and the row says how', () => {
      const plan = buildPlan(input({ students: [student('0012345', scored(700))], rows: [row(3, '12345', { mssvKind: 'number' })] }));
      expect(only(plan)).toMatchObject({ action: 'write', studentMssv: '0012345', note: 'Khớp sau khi bỏ số 0 đầu (ô số).' });
    });

    it('the same student on two rows makes BOTH rows "duplicate" and blocks the write', () => {
      const plan = buildPlan(input({ students: [student('20120001', scored(700))], rows: [row(3, '20120001'), row(9, '20120001')] }));
      expect(plan.rows.map((r) => r.action)).toEqual(['duplicate', 'duplicate']);
      expect(plan.rows[0]!.note).toBe('MSSV trùng ở các dòng 3, 9.');
      expect(plan.summary.duplicates).toBe(2);
      expect(plan.blockers[0]).toContain('1 MSSV xuất hiện nhiều lần trong file (20120001)');
    });

    it('a duplicate differing only in letter case is still a duplicate', () => {
      const plan = buildPlan(input({ students: [student('SV000001', scored(700))], rows: [row(3, 'SV000001'), row(4, 'sv000001')] }));
      expect(plan.rows.map((r) => r.action)).toEqual(['duplicate', 'duplicate']);
    });

    it('students the file never mentions are listed, sorted, not added', () => {
      const plan = buildPlan(input({
        students: [student('20120009', scored(700)), student('20120001', scored(800)), student('20120005', blank('absent'))],
        rows: [row(3, '20120005')],
      }));
      expect(plan.notInFile.map((s) => s.mssv)).toEqual(['20120001', '20120009']);
      expect(plan.summary.notInFile).toBe(2);
    });
  });

  describe('buildPlan — cells we must not touch', () => {
    it('a formula in the score cell skips the row; a merged non-master cell too', () => {
      const plan = buildPlan(input({
        students: [student('20120001', scored(700)), student('20120002', scored(800))],
        rows: [row(3, '20120001', { score: cell('7', 'number', { hasFormula: true }) }), row(4, '20120002', { score: cell('', 'empty', { mergedNonMaster: true }) })],
      }));
      expect(plan.rows.map((r) => r.action)).toEqual(['skipped_formula', 'skipped_merged']);
      expect(plan.rows[0]!.note).toBe('Ô điểm có công thức — không ghi.');
      expect(plan.summary.skipped).toBe(2);
    });

    it('a blank student does not care about a formula in the SCORE cell (nothing is written there)', () => {
      const plan = buildPlan(input({ students: [student('20120001', blank('absent'))], rows: [row(3, '20120001', { score: cell('7', 'number', { hasFormula: true }) })] }));
      expect(only(plan).action).toBe('blank');
    });

    it('but a formula in the REASON cell skips a row that would write a reason there', () => {
      const plan = buildPlan(input({
        hasReasonColumn: true,
        students: [student('20120001', blank('absent'))],
        rows: [row(3, '20120001', { reason: cell('x', 'text', { hasFormula: true }) })],
      }));
      expect(only(plan)).toMatchObject({ action: 'skipped_formula', note: 'Ô lý do có công thức — không ghi.' });
    });

    it('a protected sheet blocks everything', () => {
      const plan = buildPlan(input({ sheetProtected: true, students: [student('20120001', scored(700))], rows: [row(3, '20120001')] }));
      expect(plan.blockers).toContain('Trang tính đang được bảo vệ. Hãy bỏ bảo vệ trong Excel rồi tải lại.');
    });

    it('no row matching anything is a blocker that names the start row', () => {
      const plan = buildPlan(input({ firstDataRow: 12, students: [student('20120001', scored(700))], rows: [row(12, '99999999')] }));
      expect(plan.blockers).toEqual(['Không có dòng nào từ dòng 12 khớp sinh viên của phiên — hãy kiểm tra lại cột MSSV và dòng bắt đầu.']);
    });
  });

  describe('buildPlan — overwriting', () => {
    it('counts a score cell that already has a DIFFERENT value, not one that already holds what we would write', () => {
      const plan = buildPlan(input({
        roundingStep: 50,
        students: [student('20120001', scored(725)), student('20120002', scored(800)), student('20120003', scored(700)), student('20120004', scored(700))],
        rows: [
          row(3, '20120001', { score: cell('6.5', 'number') }), // 7.5 would replace 6.5 → overwrite
          row(4, '20120002', { score: cell('8', 'number') }), // already 8 → not an overwrite
          row(5, '20120003', { score: cell('bỏ thi', 'text') }), // text → overwrite
          row(6, '20120004', { score: cell('') }), // empty → none
        ],
      }));
      expect(plan.rows.map((r) => r.overwritesScore)).toEqual([true, false, true, false]);
      expect(plan.overwrite).toEqual({ score: 2, reason: 0 });
    });

    it('a reason cell holding OUR OWN label is not "a value"; anyone else’s text is', () => {
      const plan = buildPlan(input({
        hasReasonColumn: true,
        students: [student('20120001', blank('absent')), student('20120002', blank('absent')), student('20120003', blank('absent'))],
        rows: [
          row(3, '20120001', { reason: cell(BLANK_LABELS.absent) }),
          row(4, '20120002', { reason: cell('Nghỉ có phép') }),
          row(5, '20120003', { reason: cell('') }),
        ],
      }));
      expect(plan.rows.map((r) => [r.writesReason, r.overwritesReason])).toEqual([[true, false], [true, true], [true, false]]);
      expect(plan.overwrite).toEqual({ score: 0, reason: 1 });
    });

    it('a student who NOW has a score clears a stale reason label of ours — and only ours', () => {
      const plan = buildPlan(input({
        hasReasonColumn: true,
        students: [student('20120001', scored(700)), student('20120002', scored(800))],
        rows: [row(3, '20120001', { reason: cell(BLANK_LABELS.not_finished) }), row(4, '20120002', { reason: cell('Học lại') })],
      }));
      expect(plan.rows.map((r) => [r.clearsReason, r.overwritesReason])).toEqual([[true, false], [false, false]]);
    });

    it('without a reason column nothing about reasons is planned', () => {
      const plan = buildPlan(input({ students: [student('20120001', blank('absent'))], rows: [row(3, '20120001', { reason: cell('x') })] }));
      expect(only(plan)).toMatchObject({ writesReason: false, overwritesReason: false, clearsReason: false });
    });
  });

  describe('buildPlan — a re-export (parent §13.1 rules 3, 4, 6)', () => {
    const prev = (hundredths: number, computationId: string | null = 'old', step = 1) => ({ hundredths, computationId, step });

    it('compares the ROUNDED values: 7,10 → 7,20 at step 0,5 is unchanged', () => {
      const plan = buildPlan(input({ roundingStep: 50, previous: new Map([['20120001', prev(700)]]), students: [student('20120001', scored(720))], rows: [row(3, '20120001')] }));
      expect(only(plan)).toMatchObject({ writtenHundredths: 700, previousHundredths: 700, direction: 'same' });
    });

    it('7,24 → 7,26 at step 0,5 went up', () => {
      const plan = buildPlan(input({ roundingStep: 50, previous: new Map([['20120001', prev(700)]]), students: [student('20120001', scored(726))], rows: [row(3, '20120001')] }));
      expect(only(plan)).toMatchObject({ writtenHundredths: 750, direction: 'up' });
    });

    it('separates down from up, marks a student with no earlier write as "new", and leaves a first export with no direction at all', () => {
      const previous = new Map([['20120001', prev(800)], ['20120002', prev(600)]]);
      const students = [student('20120001', scored(750)), student('20120002', scored(650)), student('20120003', scored(900))];
      const rows = [row(3, '20120001'), row(4, '20120002'), row(5, '20120003')];
      expect(buildPlan(input({ previous, students, rows })).rows.map((r) => r.direction)).toEqual(['down', 'up', 'new']);
      expect(buildPlan(input({ students, rows })).rows.map((r) => r.direction)).toEqual([null, null, null]);
    });

    it('a student written before who is blank now is KEPT: the score cell is untouched and the row says what was there', () => {
      const plan = buildPlan(input({ previous: new Map([['20120001', prev(750)]]), students: [student('20120001', blank('flagged'))], rows: [row(3, '20120001', { score: cell('7.5', 'number') })] }));
      expect(only(plan)).toMatchObject({ action: 'kept', writtenHundredths: null, previousHundredths: 750, blankReason: 'flagged' });
      expect(only(plan).note).toBe('Lần trước đã ghi 7,5; lần này bài đang chờ giảng viên duyệt — giữ nguyên ô điểm.');
      expect(plan.summary).toMatchObject({ kept: 1, blank: 0 });
    });

    it('a kept row still writes the reason when a reason column was chosen', () => {
      const plan = buildPlan(input({ hasReasonColumn: true, previous: new Map([['20120001', prev(750)]]), students: [student('20120001', blank('flagged'))], rows: [row(3, '20120001', { reason: cell('') })] }));
      expect(only(plan)).toMatchObject({ action: 'kept', writesReason: true });
    });
  });

  describe('buildPlan — the digest', () => {
    const students = [student('20120001', scored(725)), student('20120002', blank('absent'))];
    const rows = [row(3, '20120001'), row(4, '20120002')];

    it('is stable: same input, same digest — whatever order the students arrive in', () => {
      const a = buildPlan(input({ students, rows })).digest;
      expect(a).toMatch(/^[0-9a-f]{64}$/);
      expect(buildPlan(input({ students: [...students].reverse(), rows })).digest).toBe(a);
    });

    it('changes when the rounding step, a written value, an action or the reason column changes', () => {
      const a = buildPlan(input({ students, rows })).digest;
      expect(buildPlan(input({ students, rows, roundingStep: 50 })).digest).not.toBe(a);
      expect(buildPlan(input({ students: [student('20120001', scored(726)), students[1]!], rows, roundingStep: 1 })).digest).not.toBe(a);
      expect(buildPlan(input({ students: [students[0]!, student('20120002', blank('flagged'))], rows })).digest).not.toBe(a);
      expect(buildPlan(input({ students, rows, hasReasonColumn: true })).digest).not.toBe(a);
    });
  });
  ```

  ```bash
  pnpm --filter api exec jest src/grade-export/diff-rules.spec.ts src/grade-export/plan.spec.ts
  ```

  Expected: **RED** — `Cannot find module './diff-rules'` / `'./plan'`.

- [ ] **Step 2: GREEN — `grade-export.messages.ts`.**

  ```ts
  import { MAX_DATA_ROWS } from './grade-export.types';

  /** Mọi câu tiếng Việt của module — chốt ở spec §4.7 để test khẳng định NGUYÊN VĂN. */
  export const MSG = {
    wrongExtension: 'Chỉ nhận file .xlsx. Nếu sổ điểm của bạn là .csv hoặc .xls, hãy mở bằng Excel rồi lưu lại thành .xlsx.',
    tooLarge: 'File quá lớn (giới hạn 5 MB).',
    noFile: 'Chưa thấy file trên kho lưu trữ — hãy tải lên trước.',
    encryptedOrLegacy: 'File có mật khẩu hoặc là định dạng .xls cũ. Hãy bỏ mật khẩu, mở bằng Excel và lưu lại thành .xlsx.',
    notZip: 'Đây không phải file .xlsx.',
    corrupt: 'File .xlsx bị hỏng hoặc không đọc được.',
    macro: 'File có macro (.xlsm) — hãy lưu lại thành .xlsx thường.',
    zipLimit: (detail: string) => `File giải nén ra quá lớn hoặc có quá nhiều phần (${detail}).`,
    unsupported: (detail: string) => `Cấu trúc file không được hỗ trợ (${detail}). Hãy mở bằng Excel và lưu lại thành .xlsx.`,
    sheetTooLarge: (detail: string) => `Trang tính quá lớn hoặc quá rộng (${detail}).`,
    noSheet: (name: string) => `Không thấy trang tính "${name}" trong file.`,
    protectedSheet: 'Trang tính đang được bảo vệ. Hãy bỏ bảo vệ trong Excel rồi tải lại.',
    notFinalized: 'Phiên chưa chốt điểm — chốt điểm trước rồi mới ghi vào sổ điểm.',
    needDeliverable: (n: number) => `Phiên có ${n} yêu cầu nộp — hãy chọn ghi điểm của yêu cầu nào.`,
    foreignDeliverable: 'Yêu cầu nộp này không thuộc phiên thi.',
    sameColumns: 'Cột MSSV, cột điểm và cột lý do phải là ba cột khác nhau.',
    columnTooFar: (col: string) => `Cột ${col} nằm ngoài giới hạn (tối đa cột BH).`,
    tooManyRows: `Quá ${MAX_DATA_ROWS} dòng dữ liệu — hãy tách file.`,
    duplicates: (n: number, examples: string) => `${n} MSSV xuất hiện nhiều lần trong file (${examples}). Hãy sửa file rồi tải lại — hệ thống không đoán ghi vào dòng nào.`,
    noMatch: (firstDataRow: number) => `Không có dòng nào từ dòng ${firstDataRow} khớp sinh viên của phiên — hãy kiểm tra lại cột MSSV và dòng bắt đầu.`,
    overwrite: (n: number) => `${n} ô đã có giá trị và sẽ bị ghi đè — hãy xác nhận ghi đè.`,
    decreases: (n: number) => `${n} bài bị giảm điểm so với lần ghi trước — hãy xem và xác nhận trước khi ghi.`,
    digestChanged: 'Kết quả chấm đã đổi kể từ lúc xem trước — hãy xem trước lại.',
    exportNotFound: 'Không tìm thấy lượt xuất này.',
    noOutput: 'Lượt xuất này chưa có file đầu ra.',
    outputWriteFailed: (status: number) => `Không ghi được file kết quả lên kho lưu trữ (HTTP ${status}).`,
  } as const;
  ```

- [ ] **Step 3: GREEN — `diff-rules.ts`.**

  ```ts
  import type { BreakdownError, ScoreBreakdown } from '../grading/scoring/score-core';
  import { roundHalfUp } from './rounding';

  export interface RuleDelta {
    ruleId: string;
    ruleKey: string;
    revisionId: string;
    /** Dương: luật này nay trừ NHIỀU hơn (điểm giảm). Âm: trừ ít hơn (điểm tăng). Phần trăm điểm. */
    delta: number;
  }

  export type Cause =
    | { kind: 'rule'; ruleKey: string; ruleName: string | null; delta: number }
    | { kind: 'manual_score' }
    | { kind: 'review' }
    | { kind: 'rounding' }
    | { kind: 'unknown' };

  /** Mức trừ HIỆU LỰC: chỉ lỗi `counted` mới trừ điểm (`excluded`, `refuted`, `unpriced` thì không). */
  const effective = (e: BreakdownError): number => (e.counted === 'counted' ? (e.deductionHundredths ?? 0) : 0);

  /** Luật nào đổi mức trừ giữa hai lượt tính — khuôn `changedRules` ở `score.service.ts` (private nên viết riêng). */
  export function diffRules(before: ScoreBreakdown | null, after: ScoreBreakdown | null): RuleDelta[] {
    const b = new Map((before?.errors ?? []).map((e) => [e.ruleId, e] as const));
    const a = new Map((after?.errors ?? []).map((e) => [e.ruleId, e] as const));
    const out: RuleDelta[] = [];
    for (const id of new Set([...b.keys(), ...a.keys()])) {
      const nextError = a.get(id);
      const prevError = b.get(id);
      const delta = (nextError ? effective(nextError) : 0) - (prevError ? effective(prevError) : 0);
      if (delta === 0) continue;
      const any = (nextError ?? prevError)!;
      out.push({ ruleId: id, ruleKey: any.ruleKey, revisionId: any.revisionId, delta });
    }
    return out;
  }

  export interface AttributeInput {
    direction: 'up' | 'down';
    currentSource: string;
    /** Giá trị ĐÃ GHI lần trước và bước làm tròn của lượt đó (phần trăm điểm). */
    previousWritten: number;
    previousStep: number;
    /** Điểm THÔ hiện tại (phần trăm), CHƯA làm tròn. */
    currentRaw: number;
    previousBreakdown: ScoreBreakdown | null;
    currentBreakdown: ScoreBreakdown | null;
    /** revisionId → tên luật. */
    ruleNames: ReadonlyMap<string, string>;
  }

  /**
   * Vì sao điểm ĐÃ LÀM TRÒN của sinh viên này đổi so với lần ghi trước (D15). Không đoán: không so được thì
   * `unknown`, không gán bừa cho một luật.
   */
  export function attribute(i: AttributeInput): Cause[] {
    // Điểm thô hiện tại, làm tròn theo bước CỦA LƯỢT TRƯỚC, vẫn ra đúng giá trị đã ghi → điều duy nhất đổi là bước làm tròn.
    // Không cần id lượt tính, nên bài chấm tay hay tự luận (không có lượt tính) cũng nhận ra được.
    if (roundHalfUp(i.currentRaw, i.previousStep) === i.previousWritten) return [{ kind: 'rounding' }];
    if (i.currentSource === 'manual') return [{ kind: 'manual_score' }];
    if (i.currentSource === 'review') return [{ kind: 'review' }];
    if (i.previousBreakdown === null || i.currentBreakdown === null) return [{ kind: 'unknown' }];
    const causes = diffRules(i.previousBreakdown, i.currentBreakdown)
      .filter((d) => (i.direction === 'down' ? d.delta > 0 : d.delta < 0))
      .map((d): Cause => ({ kind: 'rule', ruleKey: d.ruleKey, ruleName: i.ruleNames.get(d.revisionId) ?? null, delta: d.delta }));
    return causes.length > 0 ? causes : [{ kind: 'unknown' }];
  }

  export interface CauseTally {
    kind: Cause['kind'];
    ruleKey: string | null;
    ruleName: string | null;
    students: number;
  }
  export interface ChangesSummary {
    previousExports: number;
    up: number;
    down: number;
    same: number;
    new: number;
    downByCause: CauseTally[];
    upByCause: CauseTally[];
  }

  function tally(rows: { causes: Cause[] }[]): CauseTally[] {
    const byKey = new Map<string, CauseTally>();
    for (const row of rows) {
      for (const cause of row.causes) {
        const key = cause.kind === 'rule' ? `rule:${cause.ruleKey}` : cause.kind;
        const entry = byKey.get(key) ?? {
          kind: cause.kind,
          ruleKey: cause.kind === 'rule' ? cause.ruleKey : null,
          ruleName: cause.kind === 'rule' ? cause.ruleName : null,
          students: 0,
        };
        entry.students += 1;
        byKey.set(key, entry);
      }
    }
    return [...byKey.values()].sort((x, y) => y.students - x.students || (x.ruleKey ?? x.kind).localeCompare(y.ruleKey ?? y.kind));
  }

  /** Dải "↓ N giảm · ↑ M tăng" của màn xuất lại; `null` ở lượt xuất đầu tiên. */
  export function summarizeChanges(
    rows: { direction: 'up' | 'down' | 'same' | 'new' | null; causes: Cause[] }[],
    previousExports: number,
  ): ChangesSummary | null {
    if (previousExports === 0) return null;
    const count = (d: 'up' | 'down' | 'same' | 'new') => rows.filter((r) => r.direction === d).length;
    return {
      previousExports,
      up: count('up'),
      down: count('down'),
      same: count('same'),
      new: count('new'),
      downByCause: tally(rows.filter((r) => r.direction === 'down')),
      upByCause: tally(rows.filter((r) => r.direction === 'up')),
    };
  }
  ```

- [ ] **Step 4: GREEN — `plan.ts`.**

  ```ts
  import { createHash } from 'node:crypto';
  import { parseHundredths } from '../grading/scoring/hundredths';
  import { isOwnLabel } from './blank-reason';
  import type { Cause } from './diff-rules';
  import type { BlankReason } from './grade-export.types';
  import { MSG } from './grade-export.messages';
  import { buildMssvIndex, matchMssv, normalizeMssv, type MatchResult } from './mssv-match';
  import { roundHalfUp } from './rounding';

  export interface FileCell {
    text: string;
    kind: 'empty' | 'text' | 'number' | 'other';
    hasFormula: boolean;
    mergedNonMaster: boolean;
  }
  export interface FileRowInput {
    row: number;
    mssv: FileCell;
    score: FileCell;
    reason: FileCell | null;
  }
  export type StudentOutcome =
    | { kind: 'scored'; hundredths: number; computationId: string | null; source: string }
    | { kind: 'blank'; reason: BlankReason };
  export interface PlanStudent {
    mssv: string;
    name: string;
    outcome: StudentOutcome;
  }
  export interface PreviousWrite {
    hundredths: number;
    computationId: string | null;
    /** Bước làm tròn của lượt xuất đã ghi giá trị đó (phần trăm điểm) — để nhận ra thay đổi CHỈ do đổi bước. */
    step: number;
  }
  export interface PlanInput {
    firstDataRow: number;
    /** Các dòng từ `firstDataRow`, theo thứ tự dòng tăng dần. */
    rows: FileRowInput[];
    students: PlanStudent[];
    /** Khoá: MSSV chữ thường. */
    previous: ReadonlyMap<string, PreviousWrite>;
    roundingStep: number;
    hasReasonColumn: boolean;
    sheetProtected: boolean;
  }

  export type RowAction = 'write' | 'blank' | 'kept' | 'unmatched' | 'duplicate' | 'skipped_formula' | 'skipped_merged';
  export type Direction = 'up' | 'down' | 'same' | 'new';

  export interface PlanRow {
    row: number;
    mssvInFile: string;
    studentMssv: string | null;
    studentName: string | null;
    action: RowAction;
    systemHundredths: number | null;
    writtenHundredths: number | null;
    blankReason: BlankReason | null;
    previousHundredths: number | null;
    direction: Direction | null;
    computationId: string | null;
    source: string | null;
    causes: Cause[];
    note: string | null;
    overwritesScore: boolean;
    overwritesReason: boolean;
    writesReason: boolean;
    clearsReason: boolean;
  }

  export interface ExportPlan {
    rows: PlanRow[];
    notInFile: PlanStudent[];
    summary: { write: number; blank: number; kept: number; unmatched: number; duplicates: number; skipped: number; ignoredEmpty: number; notInFile: number };
    overwrite: { score: number; reason: number };
    blockers: string[];
    digest: string;
  }

  const EMPTY_CELL: FileCell = { text: '', kind: 'empty', hasFormula: false, mergedNonMaster: false };

  /** "7,5", "7,25", "8,0" — cùng kiểu với `formatVnPoints` của web, từ số nguyên. */
  function vn(hundredths: number): string {
    const whole = Math.floor(hundredths / 100);
    const frac = hundredths % 100;
    return frac === 0 ? `${whole},0` : frac % 10 === 0 ? `${whole},${frac / 10}` : `${whole},${String(frac).padStart(2, '0')}`;
  }

  const BLANK_NOTE_TAIL: Record<BlankReason, string> = {
    absent: 'không có bài nộp',
    not_finished: 'chưa chấm xong hoặc chưa chốt điểm',
    ungradable: 'hệ thống không chấm được',
    flagged: 'đang chờ giảng viên duyệt',
  };

  function cellProblem(cell: FileCell, label: string): { action: 'skipped_formula' | 'skipped_merged'; note: string } | null {
    if (cell.hasFormula) return { action: 'skipped_formula', note: `${label} có công thức — không ghi.` };
    if (cell.mergedNonMaster) return { action: 'skipped_merged', note: `${label} nằm trong vùng gộp ô — không ghi.` };
    return null;
  }

  /** Giá trị SỐ đang có trong ô điểm, để biết ghi vào có thật sự đổi gì không. */
  function existingHundredths(cell: FileCell): number | null {
    return cell.kind === 'number' && /^\d{1,4}(\.\d{1,2})?$/.test(cell.text) ? parseHundredths(cell.text) : null;
  }

  const blankRow = (row: number, mssvInFile: string): PlanRow => ({
    row, mssvInFile, studentMssv: null, studentName: null, action: 'unmatched', systemHundredths: null, writtenHundredths: null,
    blankReason: null, previousHundredths: null, direction: null, computationId: null, source: null, causes: [], note: null,
    overwritesScore: false, overwritesReason: false, writesReason: false, clearsReason: false,
  });

  export function buildPlan(input: PlanInput): ExportPlan {
    const index = buildMssvIndex(input.students);
    const byKey = new Map(input.students.map((s) => [s.mssv.toLowerCase(), s] as const));

    let ignoredEmpty = 0;
    const firstPass: { file: FileRowInput; match: MatchResult }[] = [];
    const rowsByStudent = new Map<string, number[]>();
    for (const file of input.rows) {
      if (file.mssv.kind === 'empty') {
        ignoredEmpty += 1;
        continue;
      }
      const match = matchMssv(file.mssv, index);
      if (match.kind === 'matched') {
        const key = match.student.mssv.toLowerCase();
        rowsByStudent.set(key, [...(rowsByStudent.get(key) ?? []), file.row]);
      }
      firstPass.push({ file, match });
    }
    const duplicated = new Set([...rowsByStudent].filter(([, list]) => list.length > 1).map(([key]) => key));

    const rows = firstPass.map(({ file, match }): PlanRow => {
      const base = blankRow(file.row, normalizeMssv(file.mssv.text));
      if (match.kind === 'unmatched') return { ...base, action: 'unmatched', note: match.note };

      const key = match.student.mssv.toLowerCase();
      const student = byKey.get(key)!;
      const known: PlanRow = { ...base, studentMssv: student.mssv, studentName: student.name, note: match.note };
      if (duplicated.has(key)) {
        return { ...known, action: 'duplicate', note: `MSSV trùng ở các dòng ${rowsByStudent.get(key)!.join(', ')}.` };
      }

      const previous = input.previous.get(key) ?? null;
      const reasonCell = input.hasReasonColumn ? (file.reason ?? EMPTY_CELL) : null;
      const outcome = student.outcome;

      if (outcome.kind === 'scored') {
        // Ô ta sẽ đụng: ô điểm, và ô lý do NẾU nó đang mang nhãn cũ của chính hệ thống (để xoá).
        const clearsReason = reasonCell !== null && reasonCell.kind === 'text' && isOwnLabel(reasonCell.text);
        const problem = cellProblem(file.score, 'Ô điểm') ?? (clearsReason ? cellProblem(reasonCell!, 'Ô lý do') : null);
        if (problem) return { ...known, action: problem.action, note: problem.note };

        const written = roundHalfUp(outcome.hundredths, input.roundingStep);
        const existing = existingHundredths(file.score);
        const direction: Direction | null =
          input.previous.size === 0 ? null : previous === null ? 'new' : written > previous.hundredths ? 'up' : written < previous.hundredths ? 'down' : 'same';
        return {
          ...known,
          action: 'write',
          systemHundredths: outcome.hundredths,
          writtenHundredths: written,
          previousHundredths: previous?.hundredths ?? null,
          direction,
          computationId: outcome.computationId,
          source: outcome.source,
          overwritesScore: file.score.kind !== 'empty' && existing !== written,
          clearsReason,
        };
      }

      const problem = reasonCell ? cellProblem(reasonCell, 'Ô lý do') : null;
      if (problem) return { ...known, action: problem.action, note: problem.note };
      const kept = previous !== null;
      return {
        ...known,
        action: kept ? 'kept' : 'blank',
        blankReason: outcome.reason,
        previousHundredths: previous?.hundredths ?? null,
        writesReason: reasonCell !== null,
        overwritesReason: reasonCell !== null && reasonCell.kind !== 'empty' && !isOwnLabel(reasonCell.text),
        note: kept ? `Lần trước đã ghi ${vn(previous.hundredths)}; lần này bài ${BLANK_NOTE_TAIL[outcome.reason]} — giữ nguyên ô điểm.` : known.note,
      };
    });

    const notInFile = input.students
      .filter((s) => !rowsByStudent.has(s.mssv.toLowerCase()))
      .sort((a, b) => (a.mssv.toLowerCase() < b.mssv.toLowerCase() ? -1 : a.mssv.toLowerCase() > b.mssv.toLowerCase() ? 1 : 0));

    const count = (...actions: RowAction[]) => rows.filter((r) => actions.includes(r.action)).length;
    const actionable = count('write', 'blank', 'kept');

    const blockers: string[] = [];
    if (input.sheetProtected) blockers.push(MSG.protectedSheet);
    if (duplicated.size > 0) {
      const examples = [...duplicated].slice(0, 3).map((k) => byKey.get(k)!.mssv).join(', ');
      blockers.push(MSG.duplicates(duplicated.size, examples));
    }
    if (actionable === 0) blockers.push(MSG.noMatch(input.firstDataRow));

    const digest = createHash('sha256')
      .update(
        JSON.stringify({
          step: input.roundingStep,
          reason: input.hasReasonColumn,
          rows: rows.map((r) => [r.row, r.action, r.studentMssv, r.writtenHundredths, r.blankReason, r.writesReason, r.clearsReason]),
          notInFile: notInFile.map((s) => s.mssv),
        }),
      )
      .digest('hex');

    return {
      rows,
      notInFile,
      summary: {
        write: count('write'),
        blank: count('blank'),
        kept: count('kept'),
        unmatched: count('unmatched'),
        duplicates: count('duplicate'),
        skipped: count('skipped_formula', 'skipped_merged'),
        ignoredEmpty,
        notInFile: notInFile.length,
      },
      overwrite: { score: rows.filter((r) => r.overwritesScore).length, reason: rows.filter((r) => r.overwritesReason).length },
      blockers,
      digest,
    };
  }
  ```

  ```bash
  pnpm --filter api exec jest src/grade-export/diff-rules.spec.ts src/grade-export/plan.spec.ts
  pnpm --filter api exec tsc --noEmit
  pnpm --filter api exec eslint src/grade-export
  ```

  Expected: `diff-rules` 14 passed, `plan` 24 passed; `tsc` clean; eslint 0 errors. Cases most likely to need a second look: the `overwritesScore` table (`['6.5' number vs 7.5]` → true; `'8' number vs 8` → false: `existingHundredths('8')` is `800`, the written is `800`) and the `kept` note wording — fix the **expectation to the literal in `BLANK_NOTE_TAIL`**, not the other way round, once you have read the sentence aloud.

- [ ] **Step 5: commit.** Title: `feat(grade-export): kế hoạch ghi thuần — khớp dòng, ô trống, ghi đè, xuất lại giảm/tăng, digest`.

---

### Task 7: loading the session’s students and scores, and the seed helper every later e2e uses

**Files:** create `apps/api/src/grade-export/grade-export.data.ts`, `apps/api/src/grade-export/grade-export.module.ts`, `apps/api/test/helpers/grade-export-seed.ts`, `apps/api/test/grade-export-data.e2e-spec.ts`; modify `apps/api/src/app.module.ts`.

**Interfaces**
- Consumes: `pickScore`, `blankReasonOf`, `PlanStudent`, `PreviousWrite` (Tasks 5–6); `CurrentScoreInput`; `ScoreBreakdown`; test helpers `seedSession`, `seedResult`, `scoreResult`, `forceStatus`, `seedInvestigatorSession`, `seedRule`, `seedPrices`, `seedInvestigatorResult`, `storedWith`, `createTestAccount`.
- Produces:
  - `GradeExportDataService` with `deliverables(m, sessionId): Promise<DeliverableInfo[]>`, `loadStudents(m, sessionId, deliverableId: string | null): Promise<{ students: PlanStudent[]; publishedResults: number }>`, `previousWrites(m, sessionId, deliverableId): Promise<Map<string, PreviousWrite>>`, `previousExportCount(m, sessionId, deliverableId): Promise<number>`, `computations(m, ids: string[]): Promise<Map<string, { raw: number | null; breakdown: ScoreBreakdown }>>`, `ruleNames(m, revisionIds: string[]): Promise<Map<string, string>>`.
  - `GradeExportModule` (registered in `AppModule`; later tasks add the service and controller).
  - `test/helpers/grade-export-seed.ts`: `seedFinalizedBase(app, label)` (a finalized session with three scored students — enough for every re-export case), `seedGradebookWorld(app, label)` (that plus the six kinds of student who have nothing to write), `everyone(w)`, `oneShotReviewed`, `loginTeacher`, `uploadTemplate`, `gradebookRows`, `buildGradebook`, `planBody`, `DEFAULT_PLAN`.

**The scope of a "student"** is `session_roster` (frozen at session start, and its own comment says it exists for *"xuất bảng điểm"*) **union** anyone who submitted. Roster gives the *absent*; submissions give everything else.

- [ ] **Step 1: The seed helper.** Create `apps/api/test/helpers/grade-export-seed.ts`:

  ```ts
  import { INestApplication } from '@nestjs/common';
  import request from 'supertest';
  import { DataSource } from 'typeorm';
  import { buildXlsx, type FixtureCell } from '../../src/grade-export/testing/xlsx-fixture';
  import { ScoreService } from '../../src/grading/scoring/score.service';
  import { TeacherReviewService } from '../../src/grading/teacher-review.service';
  import { createTestAccount } from './create-account';
  import { forceStatus, scoreResult, seedResult, seedSession, SeedSession } from './grading-seed';
  import { seedInvestigatorResult, seedInvestigatorSession, seedPrices, seedRule, storedWith } from './investigator-seed';

  export interface WorldStudent {
    resultId: string | null;
    submissionId: string | null;
    mssv: string;
    name: string;
  }

  export interface Teacher {
    id: string;
    token: string;
    email: string;
  }

  /**
   * Phiên ĐÃ CHỐT với ba sinh viên có điểm — đủ cho mọi ca xuất lại (áp giá mới cho phiên đã chốt cần MỌI bài đã chốt):
   *
   *   auto      — đường điều tra, tự quyết → chốt: 8,50 (nguồn `finalized`, có lượt tính)
   *   reviewed  — tự luận, giảng viên duyệt 6,50 → chốt (nguồn `review`, không có lượt tính)
   *   manual    — đường điều tra, giảng viên chấm tay 5,25 → chốt (nguồn `manual`)
   */
  export interface FinalizedBase {
    ctx: SeedSession;
    teacher: Teacher;
    bien: { ruleId: string; revisionId: string };
    ten: { ruleId: string; revisionId: string };
    auto: WorldStudent;
    reviewed: WorldStudent;
    manual: WorldStudent;
  }

  /**
   * Thêm các loại sinh viên KHÔNG có điểm để ghi — mọi bài này đến SAU khi chốt, nên ô của họ trống có lý do:
   *
   *   late        — đang chấm                                              → not_finished
   *   notFinal    — giảng viên duyệt 9,00 nhưng CHƯA CHỐT                  → not_finished (điểm tạm KHÔNG ra ngoài)
   *   ungradable  — không chấm được (system)                               → ungradable
   *   flagged     — đang gắn cờ chờ duyệt                                  → flagged
   *   noResult    — có bài nộp nhưng chưa từng chấm                        → not_finished
   *   absent      — chỉ có trong session_roster                            → absent
   */
  export interface GradebookWorld extends FinalizedBase {
    late: WorldStudent;
    notFinal: WorldStudent;
    ungradable: WorldStudent;
    flagged: WorldStudent;
    noResult: WorldStudent;
    absent: WorldStudent;
  }

  const SEEN = [
    { ruleKey: 'sai_bien', checkedBy: 'machine' as const },
    { ruleKey: 'ten_bien', checkedBy: 'model' as const },
  ];
  const stamp = Date.now();

  export async function studentOf(ds: DataSource, r: { resultId: string; submissionId: string }): Promise<WorldStudent> {
    const [s] = await ds.query(`SELECT student_mssv AS mssv, student_name_input AS name FROM examcollect.submission WHERE id = $1`, [r.submissionId]);
    return { resultId: r.resultId, submissionId: r.submissionId, mssv: s.mssv as string, name: s.name as string };
  }

  export async function loginTeacher(app: INestApplication, ds: DataSource, label: string): Promise<Teacher> {
    const email = `gx_${label}_${stamp}@example.com`;
    const id = await createTestAccount(ds, { email, password: 'correct-horse-battery', role: 'teacher' });
    const res = await request(app.getHttpServer()).post('/auth/login').send({ email, password: 'correct-horse-battery' });
    return { id, token: res.body.accessToken as string, email };
  }

  /** Bài tự luận: AI chấm, gắn cờ (mọi bài one_shot), giảng viên duyệt `finalScore`, sang `teacher_reviewed`. */
  export async function oneShotReviewed(ds: DataSource, ctx: SeedSession, finalScore: string): Promise<{ resultId: string; submissionId: string }> {
    const r = await seedResult(ds, ctx);
    await scoreResult(ds, r.resultId, '7.00');
    await ds.query(`UPDATE examcollect.grading_result SET status = 'flagged_for_review' WHERE id = $1`, [r.resultId]);
    await ds.query(`INSERT INTO examcollect.teacher_review (grading_result_id, teacher_id, final_score) VALUES ($1, $2, $3)`, [r.resultId, ctx.teacherId, finalScore]);
    await ds.query(`UPDATE examcollect.grading_result SET status = 'teacher_reviewed' WHERE id = $1`, [r.resultId]);
    return r;
  }

  export async function seedFinalizedBase(app: INestApplication, label: string): Promise<FinalizedBase> {
    const ds = app.get(DataSource);
    const scores = app.get(ScoreService);
    const teacher = await loginTeacher(app, ds, label);
    const ctx = await seedSession(ds, `gx-${label}`, { teacherId: teacher.id, deliverableType: 'code_project', language: 'cpp' });
    await seedInvestigatorSession(ds, ctx);
    const bien = await seedRule(ds, ctx.teacherId, 'sai_bien', 'tinh_dung', { kind: 'test_group_failed', group: 'bien' });
    const ten = await seedRule(ds, ctx.teacherId, 'ten_bien', 'trinh_bay');
    await seedPrices(ds, ctx.teacherId, { [bien.ruleId]: '1.50', [ten.ruleId]: '0.50' });

    const investigator = async (): Promise<{ resultId: string; submissionId: string }> => {
      const seeded = await seedInvestigatorResult(ds, ctx, storedWith(SEEN));
      await scores.computeInitial(seeded.resultId);
      const [g] = await ds.query(`SELECT submission_id FROM examcollect.grading_result WHERE id = $1`, [seeded.resultId]);
      return { resultId: seeded.resultId, submissionId: g.submission_id as string };
    };

    const autoSeed = await investigator(); // tự quyết → auto_approved, 8,50
    const manualSeed = await investigator();
    await ds.query(
      `INSERT INTO examcollect.teacher_review (grading_result_id, teacher_id, final_score, kind) VALUES ($1, $2, '5.25', 'manual_score')`,
      [manualSeed.resultId, ctx.teacherId],
    );
    await ds.query(`UPDATE examcollect.grading_result SET status = 'teacher_reviewed' WHERE id = $1`, [manualSeed.resultId]);
    const reviewedSeed = await oneShotReviewed(ds, ctx, '6.50');

    await app.get(TeacherReviewService).finalizeGrades(ctx.sessionId, ctx.teacherId);
    return {
      ctx, teacher, bien, ten,
      auto: await studentOf(ds, autoSeed),
      reviewed: await studentOf(ds, reviewedSeed),
      manual: await studentOf(ds, manualSeed),
    };
  }

  export async function seedGradebookWorld(app: INestApplication, label: string): Promise<GradebookWorld> {
    const ds = app.get(DataSource);
    const base = await seedFinalizedBase(app, label);
    const { ctx } = base;

    const late = await studentOf(ds, await seedResult(ds, ctx));
    const notFinal = await studentOf(ds, await oneShotReviewed(ds, ctx, '9.00'));

    const ungradableSeed = await seedResult(ds, ctx);
    await forceStatus(ds, ungradableSeed.resultId, 'flagged_for_review', { ungradable_class: 'system', ungradable_reason: 'hết giờ', confidence: 0 });
    const ungradable = await studentOf(ds, ungradableSeed);

    const flaggedSeed = await seedResult(ds, ctx);
    await scoreResult(ds, flaggedSeed.resultId, '4.00');
    await ds.query(`UPDATE examcollect.grading_result SET status = 'flagged_for_review' WHERE id = $1`, [flaggedSeed.resultId]);
    const flagged = await studentOf(ds, flaggedSeed);

    const noResultMssv = `NR${String(stamp).slice(-8)}`;
    const [noResultSub] = await ds.query(
      `INSERT INTO examcollect.submission (exam_session_id, required_deliverable_id, student_mssv, student_name_input, home_class_id, home_teacher_id, status)
       VALUES ($1, $2, $3, 'Chưa chấm', $4, $5, 'received') RETURNING id`,
      [ctx.sessionId, ctx.deliverableId, noResultMssv, ctx.classId, ctx.teacherId],
    );
    const noResult: WorldStudent = { resultId: null, submissionId: noResultSub.id as string, mssv: noResultMssv, name: 'Chưa chấm' };

    const absentMssv = `AB${String(stamp).slice(-8)}`;
    await ds.query(
      `INSERT INTO examcollect.session_roster (exam_session_id, student_mssv, student_name, home_class_id, home_teacher_id, source)
       VALUES ($1, $2, 'Sinh viên vắng', $3, $4, 'manual')`,
      [ctx.sessionId, absentMssv, ctx.classId, ctx.teacherId],
    );
    const absent: WorldStudent = { resultId: null, submissionId: null, mssv: absentMssv, name: 'Sinh viên vắng' };

    return { ...base, late, notFinal, ungradable, flagged, noResult, absent };
  }

  /** Chín người của thế giới, theo thứ tự cố định — dòng 3 → 11 của sổ điểm mẫu. */
  export const everyone = (w: GradebookWorld): WorldStudent[] => [w.auto, w.reviewed, w.manual, w.late, w.notFinal, w.ungradable, w.flagged, w.noResult, w.absent];

  // ---- sổ điểm mẫu và các lời gọi HTTP dùng chung ------------------------------------------------------------------
  export const GRADEBOOK_SHEET = 'Bảng điểm';

  /** Tựa đề (dòng 1, gộp A1:E1), tiêu đề (dòng 2), rồi mỗi sinh viên một dòng từ dòng 3: STT · MSSV · Họ tên · Điểm · Ghi chú. */
  export function gradebookRows(students: { mssv: string; name: string }[]): FixtureCell[][] {
    return [
      ['BẢNG ĐIỂM LỚP N01'],
      ['STT', 'MSSV', 'Họ tên', 'Điểm', 'Ghi chú'],
      ...students.map((s, i): FixtureCell[] => [i + 1, s.mssv, s.name, null, null]),
    ];
  }

  /** Cột D (Điểm) mang style `s=1` kể cả ô rỗng — như một sổ điểm thật đã định dạng sẵn. */
  export const buildGradebook = (rows: FixtureCell[][]): Promise<Buffer> =>
    buildXlsx([{ name: GRADEBOOK_SHEET, rows, merges: ['A1:E1'], columnStyle: { 4: 1 } }]);

  export const DEFAULT_PLAN = { sheetName: GRADEBOOK_SHEET, firstDataRow: 3, mssvColumn: 'B', scoreColumn: 'D', roundingStepHundredths: 1 } as const;

  export const planBody = (templateId: string, over: Record<string, unknown> = {}) => ({ templateId, ...DEFAULT_PLAN, ...over });

  /** Mint URL → PUT byte thẳng lên MinIO → trả templateId (đúng luồng của trình duyệt). */
  export async function uploadTemplate(app: INestApplication, token: string, sessionId: string, bytes: Buffer, fileName = 'so-diem.xlsx'): Promise<string> {
    const res = await request(app.getHttpServer())
      .post(`/exam-sessions/${sessionId}/grade-exports/template-upload`)
      .set({ Authorization: `Bearer ${token}` })
      .send({ fileName, fileSize: bytes.length });
    if (res.status !== 201) throw new Error(`template-upload → ${res.status} ${JSON.stringify(res.body)}`);
    const put = await fetch(res.body.uploadUrl as string, { method: 'PUT', body: new Uint8Array(bytes) });
    if (!put.ok) throw new Error(`PUT template → ${put.status}`);
    return res.body.templateId as string;
  }
  ```

  `seedFinalizedBase` is where the plan asserts a fact it could not run: that `finalizeGrades` accepts this mix (two investigator results and one essay, all in `auto_approved` / `teacher_reviewed`). If it throws (`Còn N bài chưa duyệt xong`), the seed put a result in a blocking state before the finalize call — fix the seed order, not `finalizeGrades`.

- [ ] **Step 2: RED — the data e2e.** Create `apps/api/test/grade-export-data.e2e-spec.ts`:

  ```ts
  import { randomUUID } from 'node:crypto';
  import { INestApplication } from '@nestjs/common';
  import { Test } from '@nestjs/testing';
  import { DataSource } from 'typeorm';
  import { AppModule } from '../src/app.module';
  import { GradeExportDataService } from '../src/grade-export/grade-export.data';
  import { loadCurrentScore } from '../src/grading/scoring/score-inputs';
  import { seedGradebookWorld, type GradebookWorld } from './helpers/grade-export-seed';

  describe('Nạp sinh viên và điểm của phiên để ghi vào sổ điểm (e2e)', () => {
    let app: INestApplication;
    let ds: DataSource;
    let data: GradeExportDataService;
    let w: GradebookWorld;

    beforeAll(async () => {
      const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
      app = moduleRef.createNestApplication();
      await app.init();
      ds = app.get(DataSource);
      data = app.get(GradeExportDataService);
      w = await seedGradebookWorld(app, 'data');
    }, 90_000);
    afterAll(async () => app.close());

    const outcomes = async (deliverableId: string | null = null) => {
      const { students, publishedResults } = await data.loadStudents(ds.manager, w.ctx.sessionId, deliverableId);
      return { byMssv: new Map(students.map((s) => [s.mssv.toLowerCase(), s.outcome])), publishedResults, total: students.length };
    };

    it('điểm của bài đã chốt: đúng nguồn, đúng số nguyên phần trăm, đúng lượt tính nguồn', async () => {
      const { byMssv, publishedResults } = await outcomes();
      const [g] = await ds.query(`SELECT finalized_computation_id FROM examcollect.grading_result WHERE id = $1`, [w.auto.resultId]);
      expect(byMssv.get(w.auto.mssv.toLowerCase())).toEqual({ kind: 'scored', hundredths: 850, computationId: g.finalized_computation_id, source: 'finalized' });
      expect(byMssv.get(w.reviewed.mssv.toLowerCase())).toEqual({ kind: 'scored', hundredths: 650, computationId: null, source: 'review' });
      expect(byMssv.get(w.manual.mssv.toLowerCase())).toEqual({ kind: 'scored', hundredths: 525, computationId: null, source: 'manual' });
      expect(publishedResults).toBe(3);
    });

    // Review Focus 2: cùng điểm với `loadCurrentScore` cho từng bài — hai câu SQL, một sự thật.
    it('khớp `loadCurrentScore` từng bài đã chốt', async () => {
      const { byMssv } = await outcomes();
      for (const s of [w.auto, w.reviewed, w.manual]) {
        const outcome = byMssv.get(s.mssv.toLowerCase());
        const current = await loadCurrentScore(ds.manager, s.resultId!);
        expect(outcome).toMatchObject({ kind: 'scored' });
        expect((outcome as { hundredths: number }).hundredths).toBe(Math.round(current.value! * 100));
      }
    });

    // Review Focus 4: bài đã có điểm tạm nhưng chưa chốt KHÔNG bao giờ ra ngoài.
    it('bài mới sau chốt là ô trống có lý do — kể cả bài đã có điểm tạm 9,00', async () => {
      const { byMssv } = await outcomes();
      const [g] = await ds.query(`SELECT status FROM examcollect.grading_result WHERE id = $1`, [w.notFinal.resultId]);
      expect(g.status).toBe('teacher_reviewed');
      expect(byMssv.get(w.notFinal.mssv.toLowerCase())).toEqual({ kind: 'blank', reason: 'not_finished' });
      expect(byMssv.get(w.late.mssv.toLowerCase())).toEqual({ kind: 'blank', reason: 'not_finished' });
      expect(byMssv.get(w.ungradable.mssv.toLowerCase())).toEqual({ kind: 'blank', reason: 'ungradable' });
      expect(byMssv.get(w.flagged.mssv.toLowerCase())).toEqual({ kind: 'blank', reason: 'flagged' });
      expect(byMssv.get(w.noResult.mssv.toLowerCase())).toEqual({ kind: 'blank', reason: 'not_finished' });
      expect(byMssv.get(w.absent.mssv.toLowerCase())).toEqual({ kind: 'blank', reason: 'absent' });
    });

    it('mỗi sinh viên đúng một lần: danh sách phiên hợp với người đã nộp, tên ưu tiên danh sách phiên', async () => {
      const { total } = await outcomes();
      expect(total).toBe(9);
      const { students } = await data.loadStudents(ds.manager, w.ctx.sessionId, null);
      expect(students.find((s) => s.mssv === w.absent.mssv)?.name).toBe('Sinh viên vắng');
    });

    it('lọc theo yêu cầu nộp: một yêu cầu không có bài nào cho ra toàn bộ sinh viên trong danh sách phiên là vắng', async () => {
      const { byMssv, publishedResults } = await outcomes(randomUUID());
      expect([...byMssv.values()]).toEqual([{ kind: 'blank', reason: 'absent' }]);
      expect(publishedResults).toBe(0);
    });

    it('deliverables: liệt kê yêu cầu nộp của phiên', async () => {
      expect(await data.deliverables(ds.manager, w.ctx.sessionId)).toEqual([{ id: w.ctx.deliverableId, requiredFilename: 'Cau1.docx' }]);
    });

    describe('previousWrites — giá trị đã ghi cuối cùng, theo phiên và theo yêu cầu nộp', () => {
      async function exportWith(deliverableId: string | null, at: string, rows: [string, number | null][]): Promise<string> {
        const [e] = await ds.query(
          `INSERT INTO examcollect.grade_export (exam_session_id, exported_by, template_storage_key, mssv_column, score_column, required_deliverable_id, exported_at)
           VALUES ($1, $2, 'k', 'B', 'F', $3, $4) RETURNING id`,
          [w.ctx.sessionId, w.ctx.teacherId, deliverableId, at],
        );
        for (const [i, [mssv, written]] of rows.entries()) {
          await ds.query(
            `INSERT INTO examcollect.grade_export_row (grade_export_id, file_row, mssv, written_hundredths, blank_reason) VALUES ($1, $2, $3, $4, $5)`,
            [e.id, 5 + i, mssv, written, written === null ? 'absent' : null],
          );
        }
        return e.id as string;
      }

      it('lượt mới nhất thắng; dòng trống không tính; MSSV không phân biệt hoa/thường; tách theo yêu cầu nộp', async () => {
        const a = w.auto.mssv.toUpperCase();
        await exportWith(null, '2026-09-29T08:00:00Z', [[a, 800], [w.reviewed.mssv, 600]]);
        const second = await exportWith(null, '2026-09-29T09:00:00Z', [[w.auto.mssv.toLowerCase(), 850], [w.absent.mssv, null]]);
        await exportWith(w.ctx.deliverableId, '2026-09-29T10:00:00Z', [[w.auto.mssv, 999]]);

        const prev = await data.previousWrites(ds.manager, w.ctx.sessionId, null);
        expect(prev.get(w.auto.mssv.toLowerCase())).toEqual({ hundredths: 850, computationId: null, step: 1 });
        expect(prev.get(w.reviewed.mssv.toLowerCase())).toEqual({ hundredths: 600, computationId: null, step: 1 });
        expect(prev.has(w.absent.mssv.toLowerCase())).toBe(false);
        expect(prev.size).toBe(2);

        const scoped = await data.previousWrites(ds.manager, w.ctx.sessionId, w.ctx.deliverableId);
        expect([...scoped]).toEqual([[w.auto.mssv.toLowerCase(), { hundredths: 999, computationId: null, step: 1 }]]);

        expect(await data.previousExportCount(ds.manager, w.ctx.sessionId, null)).toBe(2);
        expect(await data.previousExportCount(ds.manager, w.ctx.sessionId, w.ctx.deliverableId)).toBe(1);
        expect(second).toBeTruthy();
      });
    });

    it('computations và ruleNames: điểm thô, breakdown, tên bản sửa luật', async () => {
      const [g] = await ds.query(`SELECT finalized_computation_id FROM examcollect.grading_result WHERE id = $1`, [w.auto.resultId]);
      const map = await data.computations(ds.manager, [g.finalized_computation_id]);
      const got = map.get(g.finalized_computation_id)!;
      expect(got.raw).toBe(850);
      expect(got.breakdown.errors.map((e) => e.ruleKey)).toEqual(['sai_bien']);
      const names = await data.ruleNames(ds.manager, [w.bien.revisionId]);
      expect(names.get(w.bien.revisionId)).toBe('sai_bien');
      expect((await data.computations(ds.manager, [])).size).toBe(0);
      expect((await data.ruleNames(ds.manager, [])).size).toBe(0);
    });
  });
  ```

  ```bash
  pnpm --filter api exec jest --config ./test/jest-e2e.json test/grade-export-data.e2e-spec.ts
  ```

  Expected: **RED** — TypeScript cannot resolve `../src/grade-export/grade-export.data`.

- [ ] **Step 3: GREEN — the data service and the module.** Create `apps/api/src/grade-export/grade-export.data.ts`:

  ```ts
  import { Injectable } from '@nestjs/common';
  import { EntityManager } from 'typeorm';
  import type { TeacherReviewKind } from '../grading/grading-model.types';
  import type { CurrentScoreInput } from '../grading/scoring/current-score';
  import { parseHundredths } from '../grading/scoring/hundredths';
  import type { ScoreBreakdown } from '../grading/scoring/score-core';
  import { blankReasonOf } from './blank-reason';
  import type { PlanStudent, PreviousWrite, StudentOutcome } from './plan';
  import { pickScore } from './score-string';

  export interface DeliverableInfo {
    id: string;
    requiredFilename: string;
  }

  interface ResultRow {
    mssv: string;
    name: string;
    status: string | null;
    pipeline: 'one_shot' | 'investigator' | null;
    ungradable_class: string | null;
    ai_total_score: string | null;
    finalized_computation_id: string | null;
    review_kind: string | null;
    review_score: string | null;
    manual_score: string | null;
    finalized_score: string | null;
    latest_computation_id: string | null;
    latest_score: string | null;
  }

  /**
   * Cùng các cột mà `loadCurrentScore` (`scoring/score-inputs.ts:147`) nạp — nhưng cho CẢ PHIÊN và kèm mssv. Chỉ SQL
   * được lặp; thứ tự ưu tiên nguồn vẫn ở `currentScore()` (qua `pickScore`), và một e2e đòi hai bên ra cùng điểm.
   */
  const RESULTS_SQL = `
    SELECT s.student_mssv AS mssv, s.student_name_input AS name,
           g.status, g.pipeline, g.ungradable_class, g.ai_total_score, g.finalized_computation_id,
           rv.kind AS review_kind, rv.final_score AS review_score,
           (SELECT t.final_score FROM examcollect.teacher_review t
             WHERE t.grading_result_id = g.id AND t.kind = 'manual_score'
             ORDER BY t.reviewed_at DESC, t.id DESC LIMIT 1) AS manual_score,
           fc.score AS finalized_score,
           (SELECT c.id FROM examcollect.score_computation c
             WHERE c.grading_result_id = g.id ORDER BY c.created_at DESC, c.id DESC LIMIT 1) AS latest_computation_id,
           (SELECT c.score FROM examcollect.score_computation c
             WHERE c.grading_result_id = g.id ORDER BY c.created_at DESC, c.id DESC LIMIT 1) AS latest_score
      FROM examcollect.submission s
      LEFT JOIN examcollect.grading_result g ON g.submission_id = s.id
      LEFT JOIN examcollect.score_computation fc ON fc.id = g.finalized_computation_id
      LEFT JOIN LATERAL (
        SELECT t.kind, t.final_score FROM examcollect.teacher_review t
         WHERE t.grading_result_id = g.id AND t.final_score IS NOT NULL
         ORDER BY t.reviewed_at DESC, t.id DESC LIMIT 1) rv ON true
     WHERE s.exam_session_id = $1 AND ($2::uuid IS NULL OR s.required_deliverable_id = $2::uuid)`;

  function outcomeOf(r: ResultRow): StudentOutcome {
    const reason = blankReasonOf({ hasSubmission: true, status: r.status, ungradableClass: r.ungradable_class });
    if (reason !== null) return { kind: 'blank', reason };
    const input: CurrentScoreInput = {
      pipeline: r.pipeline ?? 'one_shot',
      aiTotalScore: r.ai_total_score,
      latestScoredReview: r.review_kind ? { kind: r.review_kind as TeacherReviewKind, finalScore: r.review_score! } : null,
      latestManualScore: r.manual_score,
      finalized: true, // blankReasonOf đã loại mọi bài chưa chốt
      finalizedComputationScore: r.finalized_score,
      latestComputationScore: r.latest_score,
    };
    const picked = pickScore(input);
    if (picked === null) return { kind: 'blank', reason: 'not_finished' };
    const computationId =
      picked.source === 'finalized' ? r.finalized_computation_id : picked.source === 'computation' ? r.latest_computation_id : null;
    return { kind: 'scored', hundredths: picked.hundredths, computationId, source: picked.source };
  }

  /** SQL nạp dữ liệu cho việc ghi điểm vào sổ điểm — mọi hàm nhận `EntityManager` để chạy trong transaction của người gọi. */
  @Injectable()
  export class GradeExportDataService {
    async deliverables(m: EntityManager, sessionId: string): Promise<DeliverableInfo[]> {
      const rows: { id: string; required_filename: string }[] = await m.query(
        `SELECT id, required_filename FROM examcollect.required_deliverable WHERE exam_session_id = $1 ORDER BY required_filename, id`,
        [sessionId],
      );
      return rows.map((r) => ({ id: r.id, requiredFilename: r.required_filename }));
    }

    /**
     * Sinh viên của phiên = `session_roster` (chụp cứng lúc mở phiên; chính comment của nó nói có để xuất bảng điểm)
     * HỢP với người đã nộp. Roster cho ra "vắng"; bài nộp cho ra mọi thứ còn lại. `publishedResults` = số bài
     * `finalized`/`exported` trong phạm vi — cổng D6.
     */
    async loadStudents(
      m: EntityManager,
      sessionId: string,
      deliverableId: string | null,
    ): Promise<{ students: PlanStudent[]; publishedResults: number }> {
      const roster: { mssv: string; name: string }[] = await m.query(
        `SELECT student_mssv AS mssv, student_name AS name FROM examcollect.session_roster WHERE exam_session_id = $1`,
        [sessionId],
      );
      const results: ResultRow[] = await m.query(RESULTS_SQL, [sessionId, deliverableId]);

      const map = new Map<string, PlanStudent>();
      for (const r of roster) map.set(r.mssv.toLowerCase(), { mssv: r.mssv, name: r.name, outcome: { kind: 'blank', reason: 'absent' } });
      let publishedResults = 0;
      for (const r of results) {
        if (r.status === 'finalized' || r.status === 'exported') publishedResults += 1;
        const key = r.mssv.toLowerCase();
        const known = map.get(key);
        map.set(key, { mssv: known?.mssv ?? r.mssv, name: known?.name ?? r.name, outcome: outcomeOf(r) });
      }
      return { students: [...map.values()], publishedResults };
    }

    /**
     * Giá trị ĐÃ GHI cuối cùng cho từng sinh viên trong các lượt trước của phiên, cùng yêu cầu nộp (D15). Dòng trống
     * (`written_hundredths IS NULL`) không tính: chúng không nói gì về điều đã nói ra bên ngoài. Khoá: MSSV chữ thường.
     */
    async previousWrites(m: EntityManager, sessionId: string, deliverableId: string | null): Promise<Map<string, PreviousWrite>> {
      const rows: { key: string; hundredths: number; computation_id: string | null; step: number }[] = await m.query(
        `SELECT DISTINCT ON (lower(r.mssv::text)) lower(r.mssv::text) AS key,
                r.written_hundredths AS hundredths, r.score_computation_id AS computation_id,
                e.rounding_step_hundredths AS step
           FROM examcollect.grade_export_row r
           JOIN examcollect.grade_export e ON e.id = r.grade_export_id
          WHERE e.exam_session_id = $1
            AND e.required_deliverable_id IS NOT DISTINCT FROM $2::uuid
            AND r.written_hundredths IS NOT NULL
          ORDER BY lower(r.mssv::text), e.exported_at DESC, e.id DESC`,
        [sessionId, deliverableId],
      );
      return new Map(rows.map((r) => [r.key, { hundredths: r.hundredths, computationId: r.computation_id, step: r.step }]));
    }

    async previousExportCount(m: EntityManager, sessionId: string, deliverableId: string | null): Promise<number> {
      const [row]: { n: number }[] = await m.query(
        `SELECT count(*)::int AS n FROM examcollect.grade_export WHERE exam_session_id = $1 AND required_deliverable_id IS NOT DISTINCT FROM $2::uuid`,
        [sessionId, deliverableId],
      );
      return row?.n ?? 0;
    }

    /** Điểm thô (phần trăm) và breakdown của các lượt tính — để nói VÌ SAO một điểm đổi (D15). */
    async computations(m: EntityManager, ids: string[]): Promise<Map<string, { raw: number | null; breakdown: ScoreBreakdown }>> {
      if (ids.length === 0) return new Map();
      const rows: { id: string; score: string | null; breakdown: ScoreBreakdown }[] = await m.query(
        `SELECT id, score, breakdown FROM examcollect.score_computation WHERE id = ANY($1::uuid[])`,
        [ids],
      );
      return new Map(rows.map((r) => [r.id, { raw: r.score === null ? null : parseHundredths(r.score), breakdown: r.breakdown }]));
    }

    async ruleNames(m: EntityManager, revisionIds: string[]): Promise<Map<string, string>> {
      if (revisionIds.length === 0) return new Map();
      const rows: { id: string; name: string }[] = await m.query(
        `SELECT id, name FROM examcollect.error_rule_revision WHERE id = ANY($1::uuid[])`,
        [revisionIds],
      );
      return new Map(rows.map((r) => [r.id, r.name]));
    }
  }
  ```

  Create `apps/api/src/grade-export/grade-export.module.ts`:

  ```ts
  import { Module } from '@nestjs/common';
  import { GradeExportDataService } from './grade-export.data';

  /**
   * Ghi điểm vào sổ điểm của giảng viên (spec `2026-09-29-gradebook-export-design.md`). Module RIÊNG để không đụng
   * `grading.controller.ts`; các task sau thêm service, controller và các phụ thuộc của chúng.
   */
  @Module({
    providers: [GradeExportDataService],
    exports: [GradeExportDataService],
  })
  export class GradeExportModule {}
  ```

  In `apps/api/src/app.module.ts` add the import directly after `import { CourseModule } from './course/course.module';`:

  ```ts
  import { GradeExportModule } from './grade-export/grade-export.module';
  ```

  and replace exactly

  ```ts
      CourseModule,
    ],
  })
  export class AppModule {}
  ```

  with

  ```ts
      CourseModule,
      GradeExportModule,
    ],
  })
  export class AppModule {}
  ```

  ```bash
  pnpm --filter api exec jest --config ./test/jest-e2e.json test/grade-export-data.e2e-spec.ts
  pnpm --filter api exec tsc --noEmit
  pnpm --filter api exec eslint src/grade-export test/helpers/grade-export-seed.ts test/grade-export-data.e2e-spec.ts
  pnpm check:cycles
  ```

  Expected: **8 passed**; `tsc` clean; eslint 0 errors; `0 vòng lặp`. If `seedGradebookWorld` throws inside `finalizeGrades`, read its message (`Còn N bài chưa duyệt xong` names how many results are blocking) before touching anything; if a `computeInitial` returns `flagged` instead of `auto`, the `SEEN` rules do not match `storedWith` — compare with `score-service.e2e-spec.ts:57` which uses the same pair. The `total` of 9 is the nine people of the world (auto, manual, reviewed, late, notFinal, ungradable, flagged, noResult, absent).

- [ ] **Step 4: commit.** Title: `feat(grade-export): nạp sinh viên và điểm đã chốt của phiên; dữ liệu nền cho lượt xuất trước; helper seed phiên đã chốt`.

---

### Task 8: the template upload and the inspect route

**Files:** create `apps/api/src/grade-export/{grade-export.keys,grade-export.errors,inspect-grid,grade-export-file-store,grade-export.service,grade-export.controller}.ts`, `apps/api/src/grade-export/dto/{template-upload,inspect,plan,write}.dto.ts`, `apps/api/src/grade-export/{grade-export.errors,inspect-grid}.spec.ts`, `apps/api/test/grade-export-inspect.e2e-spec.ts`; modify `apps/api/src/grade-export/grade-export.module.ts`.

**Interfaces**
- Consumes: `StorageService` (`generateUploadUrl`, `getObject`, `getObjectSize`), `ExamSessionService.findEntityForOwner`, `readZipEntries`, `openWorkbook`, `readSheet`, `MSG`, `MAX_TEMPLATE_BYTES`, `GRID_ROWS`, `SAFE_KEY_SEGMENT_REGEX`, `GradeExportDataService.deliverables`.
- Produces:
  - `buildTemplateKey(sessionId, templateId)`, `buildOutputKey(sessionId, exportId)`.
  - `toHttpError(error: unknown): unknown` — the one place every workbook error becomes a Vietnamese 400.
  - `buildGrid(sheet: SheetRead, fromRow: number): InspectGrid`.
  - `GradeExportFileStore.put(key, bytes)`.
  - `GradeExportService.requestTemplateUpload(sessionId, dto)`, `.inspect(sessionId, dto)` and the private `loadWorkbook(sessionId, templateId)` (Tasks 9–11 add the rest).
  - Routes `POST /exam-sessions/:id/grade-exports/template-upload` (201) and `POST /exam-sessions/:id/grade-exports/inspect` (200).
  - The four DTO classes, all of them, so later tasks add no DTO file.

**The key is rebuilt from the session and the template id, never taken from the request** (the `exam-material` rule). That is also what makes *"a template of another session cannot be used"* true without extra code: teacher A's template lives under session S1's prefix, so asking for it under S2 points at an object that does not exist.

- [ ] **Step 1: RED — the two pure specs.**

  `grade-export.errors.spec.ts`:

  ```ts
  import { BadRequestException } from '@nestjs/common';
  import { MSG } from './grade-export.messages';
  import { toHttpError } from './grade-export.errors';
  import { MacroWorkbookError, NotWorkbookError, SheetNotFoundError, SheetTooLargeError, UnsupportedWorkbookError } from './xlsx/workbook-reader';
  import { CorruptZipError, EncryptedOrLegacyError, NotZipError, ZipLimitError } from './xlsx/zip-io';

  describe('toHttpError — every workbook problem is a Vietnamese 400', () => {
    const cases: [string, Error, string][] = [
      ['CFB', new EncryptedOrLegacyError('x'), MSG.encryptedOrLegacy],
      ['not a zip', new NotZipError('x'), MSG.notZip],
      ['corrupt', new CorruptZipError('x'), MSG.corrupt],
      ['zip limit', new ZipLimitError('20 entry'), MSG.zipLimit('20 entry')],
      ['not a workbook', new NotWorkbookError('x'), MSG.notZip],
      ['macro', new MacroWorkbookError('x'), MSG.macro],
      ['unsupported', new UnsupportedWorkbookError('ô không có địa chỉ (r)'), MSG.unsupported('ô không có địa chỉ (r)')],
      ['too large', new SheetTooLargeError('ô Z9'), MSG.sheetTooLarge('ô Z9')],
      ['no sheet', new SheetNotFoundError('Điểm'), MSG.noSheet('Điểm')],
    ];
    it.each(cases)('%s', (_name, error, message) => {
      const out = toHttpError(error);
      expect(out).toBeInstanceOf(BadRequestException);
      expect((out as BadRequestException).message).toBe(message);
    });
    it('passes an unknown error through untouched — a bug must not be dressed up as a bad file', () => {
      const boom = new Error('boom');
      expect(toHttpError(boom)).toBe(boom);
    });
  });
  ```

  `inspect-grid.spec.ts`:

  ```ts
  import { GRID_ROWS } from './grade-export.types';
  import { buildGrid } from './inspect-grid';
  import type { CellRead, SheetRead } from './xlsx/workbook-reader';

  function sheet(rows: (string | number | null)[][], over: Partial<SheetRead> = {}): SheetRead {
    const cells = new Map<string, CellRead>();
    let columnCount = 0;
    rows.forEach((cells_, r) =>
      cells_.forEach((v, c) => {
        if (v === null) return;
        const ref = `${String.fromCharCode(65 + c)}${r + 1}`;
        cells.set(ref, { ref, text: String(v), kind: typeof v === 'number' ? 'number' : 'text', hasFormula: false });
        columnCount = Math.max(columnCount, c + 1);
      }),
    );
    return { name: 'S', path: 'p', protected: false, rowCount: rows.length, columnCount, cells, merges: [], ...over };
  }

  describe('buildGrid', () => {
    it('lists a column letter for every used column and one entry per row from `fromRow`', () => {
      const grid = buildGrid(sheet([['STT', 'MSSV', 'Điểm'], [1, '20120001', null]]), 1);
      expect(grid.columns).toEqual(['A', 'B', 'C']);
      expect(grid.rows.map((r) => r.row)).toEqual([1, 2]);
      expect(grid.rows[1]!.cells.map((c) => [c.text, c.kind])).toEqual([['1', 'number'], ['20120001', 'text'], ['', 'empty']]);
      expect(grid).toMatchObject({ name: 'S', rowCount: 2, columnCount: 3, protected: false, fromRow: 1, hasMore: false });
    });

    it('shows at most GRID_ROWS rows and says there are more; paging continues from `fromRow`', () => {
      const rows = Array.from({ length: 100 }, (_, i) => [i + 1]);
      const first = buildGrid(sheet(rows), 1);
      expect(first.rows).toHaveLength(GRID_ROWS);
      expect(first.hasMore).toBe(true);
      const third = buildGrid(sheet(rows), 81);
      expect(third.rows[0]!.row).toBe(81);
      expect(third.rows).toHaveLength(20);
      expect(third.hasMore).toBe(false);
    });

    it('a start row past the end gives no rows, not an error', () => {
      expect(buildGrid(sheet([['a']]), 50).rows).toEqual([]);
    });

    it('truncates a very long cell text and never leaks "other" as a fourth kind', () => {
      const s = sheet([['x'.repeat(500)]]);
      s.cells.set('B1', { ref: 'B1', text: 'TRUE', kind: 'other', hasFormula: false });
      s.columnCount = 2;
      const grid = buildGrid(s, 1);
      expect(grid.rows[0]!.cells[0]!.text).toHaveLength(200);
      expect(grid.rows[0]!.cells[1]!.kind).toBe('text');
    });

    it('carries the formula flag and an empty sheet still has one column', () => {
      const s = sheet([['=A1']]);
      s.cells.set('A1', { ref: 'A1', text: '3', kind: 'number', hasFormula: true });
      expect(buildGrid(s, 1).rows[0]!.cells[0]!.formula).toBe(true);
      expect(buildGrid(sheet([]), 1)).toMatchObject({ columns: ['A'], rows: [], rowCount: 0 });
    });
  });
  ```

  ```bash
  pnpm --filter api exec jest src/grade-export/grade-export.errors.spec.ts src/grade-export/inspect-grid.spec.ts
  ```

  Expected: **RED** — `Cannot find module './grade-export.errors'` / `'./inspect-grid'`.

- [ ] **Step 2: GREEN — the pure pieces.**

  `grade-export.keys.ts`:

  ```ts
  import { InternalServerErrorException } from '@nestjs/common';
  import { SAFE_KEY_SEGMENT_REGEX } from '../storage/storage.types';

  const PREFIX = 'grade-exports';

  /** Mọi đoạn khoá là uuid hoặc hằng của ta; ném thay vì âm thầm sửa (như `StorageService.buildMaterialKey`). */
  function key(...segments: string[]): string {
    for (const segment of segments) {
      if (!segment || !SAFE_KEY_SEGMENT_REGEX.test(segment)) {
        throw new InternalServerErrorException(`Refusing to build a storage key from an unsafe segment: ${JSON.stringify(segment)}`);
      }
    }
    return [PREFIX, ...segments].join('/');
  }

  /** File sổ điểm mẫu giảng viên tải lên. Khoá dựng từ phiên + id do SERVER cấp — không bao giờ từ body. */
  export const buildTemplateKey = (sessionId: string, templateId: string): string => key(sessionId, 'templates', templateId);

  /** File đã ghi điểm do server sinh. */
  export const buildOutputKey = (sessionId: string, exportId: string): string => key(sessionId, 'outputs', exportId);
  ```

  `grade-export.errors.ts`:

  ```ts
  import { BadRequestException } from '@nestjs/common';
  import { MSG } from './grade-export.messages';
  import { MacroWorkbookError, NotWorkbookError, SheetNotFoundError, SheetTooLargeError, UnsupportedWorkbookError } from './xlsx/workbook-reader';
  import { CorruptZipError, EncryptedOrLegacyError, NotZipError, ZipLimitError } from './xlsx/zip-io';

  /** Một chỗ duy nhất biến lỗi của lớp `.xlsx` thành câu tiếng Việt. Lỗi lạ được trả NGUYÊN — một bug không được giả làm file xấu. */
  export function toHttpError(error: unknown): unknown {
    if (error instanceof EncryptedOrLegacyError) return new BadRequestException(MSG.encryptedOrLegacy);
    if (error instanceof NotZipError || error instanceof NotWorkbookError) return new BadRequestException(MSG.notZip);
    if (error instanceof CorruptZipError) return new BadRequestException(MSG.corrupt);
    if (error instanceof ZipLimitError) return new BadRequestException(MSG.zipLimit(error.message));
    if (error instanceof MacroWorkbookError) return new BadRequestException(MSG.macro);
    if (error instanceof UnsupportedWorkbookError) return new BadRequestException(MSG.unsupported(error.message));
    if (error instanceof SheetTooLargeError) return new BadRequestException(MSG.sheetTooLarge(error.message));
    if (error instanceof SheetNotFoundError) return new BadRequestException(MSG.noSheet(error.message));
    return error;
  }
  ```

  `inspect-grid.ts`:

  ```ts
  import { GRID_ROWS, MAX_COLUMNS } from './grade-export.types';
  import { cellAt, type SheetRead } from './xlsx/workbook-reader';
  import { indexToCol } from './xlsx/xml-text';

  export interface GridCell {
    text: string;
    kind: 'empty' | 'text' | 'number';
    formula: boolean;
  }
  export interface InspectGrid {
    name: string;
    rowCount: number;
    columnCount: number;
    protected: boolean;
    fromRow: number;
    columns: string[];
    rows: { row: number; cells: GridCell[] }[];
    hasMore: boolean;
  }

  const MAX_CELL_TEXT = 200;

  /** Lưới xem trước để giảng viên chọn cột — `GRID_ROWS` dòng từ `fromRow`, mỗi ô cắt còn 200 ký tự. */
  export function buildGrid(sheet: SheetRead, fromRow: number): InspectGrid {
    const width = Math.min(Math.max(sheet.columnCount, 1), MAX_COLUMNS);
    const columns = Array.from({ length: width }, (_, i) => indexToCol(i + 1));
    const last = Math.min(fromRow + GRID_ROWS - 1, sheet.rowCount);
    const rows: InspectGrid['rows'] = [];
    for (let row = fromRow; row <= last; row++) {
      rows.push({
        row,
        cells: columns.map((_, i) => {
          const cell = cellAt(sheet, i + 1, row);
          return { text: cell.text.slice(0, MAX_CELL_TEXT), kind: cell.kind === 'other' ? 'text' : cell.kind, formula: cell.hasFormula };
        }),
      });
    }
    return {
      name: sheet.name,
      rowCount: sheet.rowCount,
      columnCount: sheet.columnCount,
      protected: sheet.protected,
      fromRow,
      columns,
      rows,
      hasMore: last < sheet.rowCount,
    };
  }
  ```

  ```bash
  pnpm --filter api exec jest src/grade-export/grade-export.errors.spec.ts src/grade-export/inspect-grid.spec.ts
  ```

  Expected: `errors` 10 passed (nine `it.each` + one), `grid` 5 passed.

- [ ] **Step 3: RED — the inspect e2e.** Create `apps/api/test/grade-export-inspect.e2e-spec.ts`:

  ```ts
  import { INestApplication, ValidationPipe } from '@nestjs/common';
  import { Test } from '@nestjs/testing';
  import request from 'supertest';
  import { DataSource } from 'typeorm';
  import { AppModule } from '../src/app.module';
  import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
  import { buildXlsx, type FixtureSheet } from '../src/grade-export/testing/xlsx-fixture';
  import { loginTeacher } from './helpers/grade-export-seed';
  import { seedSession } from './helpers/grading-seed';

  const GRADEBOOK: FixtureSheet = {
    name: 'Bảng điểm',
    rows: [
      ['BẢNG ĐIỂM LỚP N01'],
      ['STT', 'MSSV', 'Họ tên', 'Giữa kỳ', 'Cuối kỳ'],
      [1, '20120001', 'Nguyễn Văn An', 7, null],
      [2, '20120002', 'Trần Thị Bình', 8, null],
    ],
  };

  describe('Tải file sổ điểm mẫu và xem nội dung (e2e)', () => {
    let app: INestApplication;
    let ds: DataSource;
    let teacher: { id: string; token: string };
    let other: { id: string; token: string };
    let sessionId: string;

    const as = (token: string) => ({ Authorization: `Bearer ${token}` });
    const http = () => request(app.getHttpServer());

    /** Mint URL → PUT byte thẳng lên MinIO → trả templateId (đúng luồng của trình duyệt). */
    async function upload(bytes: Buffer, over: { token?: string; sessionId?: string; fileName?: string; fileSize?: number } = {}): Promise<string> {
      const res = await http()
        .post(`/exam-sessions/${over.sessionId ?? sessionId}/grade-exports/template-upload`)
        .set(as(over.token ?? teacher.token))
        .send({ fileName: over.fileName ?? 'so-diem.xlsx', fileSize: over.fileSize ?? bytes.length });
      expect(res.status).toBe(201);
      const put = await fetch(res.body.uploadUrl as string, { method: 'PUT', body: new Uint8Array(bytes) });
      expect(put.ok).toBe(true);
      return res.body.templateId as string;
    }
    const inspect = (body: object, token = teacher.token, id = sessionId) =>
      http().post(`/exam-sessions/${id}/grade-exports/inspect`).set(as(token)).send(body);

    beforeAll(async () => {
      const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
      app = moduleRef.createNestApplication();
      app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
      app.useGlobalFilters(new PostgresExceptionFilter());
      await app.init();
      ds = app.get(DataSource);
      teacher = await loginTeacher(app, ds, 'insp-a');
      other = await loginTeacher(app, ds, 'insp-b');
      sessionId = (await seedSession(ds, 'gx-inspect', { teacherId: teacher.id })).sessionId;
    }, 60_000);
    afterAll(async () => app.close());

    it('tải lên qua URL ký, rồi xem: trang tính, yêu cầu nộp, lưới có chữ cột và kiểu ô', async () => {
      const templateId = await upload(await buildXlsx([GRADEBOOK]));
      const res = await inspect({ templateId });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        templateId,
        sheets: [{ name: 'Bảng điểm', hidden: false }],
        deliverables: [{ requiredFilename: 'Cau1.docx' }],
        sheet: { name: 'Bảng điểm', rowCount: 4, columnCount: 5, protected: false, fromRow: 1, columns: ['A', 'B', 'C', 'D', 'E'], hasMore: false },
      });
      expect(res.body.fileSizeBytes).toBeGreaterThan(0);
      expect(res.body.sheet.rows[1].cells.map((c: { text: string }) => c.text)).toEqual(['STT', 'MSSV', 'Họ tên', 'Giữa kỳ', 'Cuối kỳ']);
      expect(res.body.sheet.rows[2].cells[0]).toEqual({ text: '1', kind: 'number', formula: false });
    });

    it('nhiều trang tính: không chọn thì không có lưới (không đoán trang); chọn rồi mới có', async () => {
      const templateId = await upload(await buildXlsx([GRADEBOOK, { name: 'Ghi chú', rows: [['x']] }]));
      const none = await inspect({ templateId });
      expect(none.status).toBe(200);
      expect(none.body.sheets.map((s: { name: string }) => s.name)).toEqual(['Bảng điểm', 'Ghi chú']);
      expect(none.body.sheet).toBeNull();
      const chosen = await inspect({ templateId, sheetName: 'Ghi chú' });
      expect(chosen.body.sheet.name).toBe('Ghi chú');
    });

    it('phân trang lưới bằng fromRow', async () => {
      const rows = Array.from({ length: 100 }, (_, i) => [i + 1, `SV${String(i).padStart(6, '0')}`]);
      const templateId = await upload(await buildXlsx([{ name: 'S', rows }]));
      const page = await inspect({ templateId, fromRow: 81 });
      expect(page.body.sheet.rows[0].row).toBe(81);
      expect(page.body.sheet.rows).toHaveLength(20);
      expect(page.body.sheet.hasMore).toBe(false);
    });

    it('sai đuôi file → 400 nói cách chuyển sang .xlsx; quá 5 MB khai → 400', async () => {
      const bad = await http().post(`/exam-sessions/${sessionId}/grade-exports/template-upload`).set(as(teacher.token)).send({ fileName: 'so-diem.csv', fileSize: 100 });
      expect(bad.status).toBe(400);
      expect(bad.body.message).toContain('Chỉ nhận file .xlsx. Nếu sổ điểm của bạn là .csv hoặc .xls, hãy mở bằng Excel rồi lưu lại thành .xlsx.');
      const big = await http().post(`/exam-sessions/${sessionId}/grade-exports/template-upload`).set(as(teacher.token)).send({ fileName: 'a.xlsx', fileSize: 6 * 1024 * 1024 });
      expect(big.status).toBe(400);
      expect(big.body.message).toContain('File quá lớn (giới hạn 5 MB).');
    });

    it('server TỰ đo kích thước: khai 100 byte nhưng đẩy lên hơn 5 MiB → 400', async () => {
      const templateId = await upload(Buffer.alloc(5 * 1024 * 1024 + 1, 0x50), { fileSize: 100 });
      const res = await inspect({ templateId });
      expect(res.status).toBe(400);
      expect(res.body.message).toBe('File quá lớn (giới hạn 5 MB).');
    });

    it('chưa tải gì lên → 400 "Chưa thấy file"', async () => {
      const res = await inspect({ templateId: '00000000-0000-4000-8000-000000000000' });
      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Chưa thấy file trên kho lưu trữ — hãy tải lên trước.');
    });

    it('mỗi loại file xấu nhận đúng câu của nó', async () => {
      const good = await buildXlsx([GRADEBOOK]);
      const cases: [string, Buffer, string][] = [
        ['không phải zip', Buffer.from('MSSV,Điểm\n1,2\n'), 'Đây không phải file .xlsx.'],
        ['.xls / có mật khẩu', Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(200)]), 'File có mật khẩu hoặc là định dạng .xls cũ'],
        ['hỏng', good.subarray(0, Math.floor(good.length / 2)), 'File .xlsx bị hỏng hoặc không đọc được.'],
        ['macro', await buildXlsx([GRADEBOOK], { workbookContentType: 'application/vnd.ms-excel.sheet.macroEnabled.main+xml' }), 'File có macro (.xlsm)'],
        ['tiền tố namespace', await buildXlsx([GRADEBOOK], { prefixed: true }), 'Cấu trúc file không được hỗ trợ'],
      ];
      for (const [name, bytes, message] of cases) {
        const templateId = await upload(bytes);
        const res = await inspect({ templateId, sheetName: 'Bảng điểm' });
        expect({ name, status: res.status }).toEqual({ name, status: 400 });
        expect({ name, message: res.body.message as string }).toEqual({ name, message: expect.stringContaining(message) });
      }
    });

    it('trang tính không có tên đó → 400 nêu tên', async () => {
      const templateId = await upload(await buildXlsx([GRADEBOOK]));
      const res = await inspect({ templateId, sheetName: 'Không có' });
      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Không thấy trang tính "Không có" trong file.');
    });

    it('templateId không phải uuid → 400; không đăng nhập → 401', async () => {
      expect((await inspect({ templateId: 'abc' })).status).toBe(400);
      expect((await http().post(`/exam-sessions/${sessionId}/grade-exports/inspect`).send({ templateId: '00000000-0000-4000-8000-000000000000' })).status).toBe(401);
    });

    it('giảng viên khác không xin URL và không xem được phiên này → 403', async () => {
      const templateId = await upload(await buildXlsx([GRADEBOOK]));
      expect((await inspect({ templateId }, other.token)).status).toBe(403);
      const mint = await http().post(`/exam-sessions/${sessionId}/grade-exports/template-upload`).set(as(other.token)).send({ fileName: 'a.xlsx', fileSize: 10 });
      expect(mint.status).toBe(403);
    });

    it('file mẫu của phiên khác không dùng được — khoá dựng từ phiên, nên trỏ vào object không tồn tại', async () => {
      const second = (await seedSession(ds, 'gx-inspect-2', { teacherId: teacher.id, startHoursAgo: 6 })).sessionId;
      const templateId = await upload(await buildXlsx([GRADEBOOK]), { sessionId: second });
      expect((await inspect({ templateId }, teacher.token, second)).status).toBe(200);
      const res = await inspect({ templateId }, teacher.token, sessionId);
      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Chưa thấy file trên kho lưu trữ — hãy tải lên trước.');
    });
  });
  ```

  ```bash
  pnpm --filter api exec jest --config ./test/jest-e2e.json test/grade-export-inspect.e2e-spec.ts
  ```

  Expected: **RED** — every route answers 404.

- [ ] **Step 4: GREEN — DTOs, file store, service, controller, module.**

  `dto/template-upload.dto.ts`:

  ```ts
  import { IsInt, IsString, Length, Matches, Max, Min } from 'class-validator';
  import { MAX_TEMPLATE_BYTES } from '../grade-export.types';
  import { MSG } from '../grade-export.messages';

  /** Xin URL ký để tải file sổ điểm mẫu. `fileSize` chỉ để báo sớm — server tự đo lại bằng HeadObject. */
  export class TemplateUploadDto {
    @IsString()
    @Length(1, 255)
    @Matches(/\.xlsx$/i, { message: MSG.wrongExtension })
    fileName!: string;

    @IsInt()
    @Min(1)
    @Max(MAX_TEMPLATE_BYTES, { message: MSG.tooLarge })
    fileSize!: number;
  }
  ```

  `dto/inspect.dto.ts`:

  ```ts
  import { IsInt, IsOptional, IsString, IsUUID, Length, Max, Min } from 'class-validator';
  import { MAX_SHEET_ROW } from '../grade-export.types';

  export class InspectDto {
    @IsUUID()
    templateId!: string;

    /** Bắt buộc khi file có nhiều trang tính: không có trang nào được chọn thay giảng viên. */
    @IsOptional()
    @IsString()
    @Length(1, 31)
    sheetName?: string;

    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(MAX_SHEET_ROW)
    fromRow?: number;
  }
  ```

  `dto/plan.dto.ts`:

  ```ts
  import { IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Matches, Max, Min } from 'class-validator';
  import { MAX_SHEET_ROW, ROUNDING_STEPS } from '../grade-export.types';

  const COLUMN = /^[A-Z]{1,3}$/;

  /**
   * Mọi thứ định vị ô là trường TƯỜNG MINH, không mặc định (rule 9, spec D5): trang tính, dòng bắt đầu, ba cột,
   * bước làm tròn. Web không chọn sẵn cái nào.
   */
  export class PlanDto {
    @IsUUID()
    templateId!: string;

    @IsString()
    @Length(1, 31)
    sheetName!: string;

    @IsInt()
    @Min(1)
    @Max(MAX_SHEET_ROW)
    firstDataRow!: number;

    @Matches(COLUMN)
    mssvColumn!: string;

    @Matches(COLUMN)
    scoreColumn!: string;

    @IsOptional()
    @Matches(COLUMN)
    reasonColumn?: string;

    /** Bắt buộc khi phiên có nhiều hơn một yêu cầu nộp (D7). */
    @IsOptional()
    @IsUUID()
    deliverableId?: string;

    @IsIn([...ROUNDING_STEPS])
    roundingStepHundredths!: number;
  }
  ```

  `dto/write.dto.ts`:

  ```ts
  import { IsBoolean, IsOptional, IsString, Length, Matches } from 'class-validator';
  import { PlanDto } from './plan.dto';

  export class WriteDto extends PlanDto {
    /** Digest của bản xem trước mà giảng viên đã xem (D20). */
    @Matches(/^[0-9a-f]{64}$/)
    expectedDigest!: string;

    /** Tên file giảng viên đã chọn — chỉ để đặt tên file tải về, được làm sạch ở service. */
    @IsString()
    @Length(1, 255)
    templateFileName!: string;

    @IsOptional()
    @IsBoolean()
    overwriteExisting?: boolean;

    @IsOptional()
    @IsBoolean()
    confirmDecreases?: boolean;
  }
  ```

  `grade-export-file-store.ts`:

  ```ts
  import { Injectable, InternalServerErrorException } from '@nestjs/common';
  import { StorageService } from '../storage/storage.service';
  import { MSG } from './grade-export.messages';

  /**
   * Đưa file kết quả (do SERVER sinh) lên storage bằng `PUT` tới URL ký sẵn mà chính `generateUploadUrl` cấp — như
   * helper `putObject` của test (spec D3). Rule 5 cấm byte của CLIENT đi qua NestJS; byte này do ta dựng. Không thêm
   * `StorageService.putObject`: G2 đang khôi phục chính hàm đó trong file ấy.
   */
  @Injectable()
  export class GradeExportFileStore {
    constructor(private readonly storage: StorageService) {}

    async put(key: string, bytes: Buffer): Promise<void> {
      const { uploadUrl } = await this.storage.generateUploadUrl(key);
      const res = await fetch(uploadUrl, { method: 'PUT', body: new Uint8Array(bytes) });
      if (!res.ok) throw new InternalServerErrorException(MSG.outputWriteFailed(res.status));
    }
  }
  ```

  `grade-export.service.ts`:

  ```ts
  import { randomUUID } from 'node:crypto';
  import { BadRequestException, Injectable } from '@nestjs/common';
  import { InjectDataSource } from '@nestjs/typeorm';
  import { DataSource } from 'typeorm';
  import { StorageService } from '../storage/storage.service';
  import { InspectDto } from './dto/inspect.dto';
  import { TemplateUploadDto } from './dto/template-upload.dto';
  import { toHttpError } from './grade-export.errors';
  import { GradeExportDataService, type DeliverableInfo } from './grade-export.data';
  import { buildTemplateKey } from './grade-export.keys';
  import { MSG } from './grade-export.messages';
  import { MAX_TEMPLATE_BYTES } from './grade-export.types';
  import { buildGrid, type InspectGrid } from './inspect-grid';
  import { openWorkbook, readSheet, type SheetRead, type Workbook } from './xlsx/workbook-reader';
  import { readZipEntries, type ZipEntry } from './xlsx/zip-io';

  export interface InspectResponse {
    templateId: string;
    fileSizeBytes: number;
    sheets: { name: string; hidden: boolean }[];
    deliverables: DeliverableInfo[];
    sheet: InspectGrid | null;
  }

  export interface LoadedTemplate {
    workbook: Workbook;
    entries: ZipEntry[];
    size: number;
  }

  /**
   * Ghi điểm vào sổ điểm của giảng viên (spec `2026-09-29-gradebook-export-design.md`). Quyền sở hữu phiên do
   * controller kiểm TRƯỚC (`findEntityForOwner`); mọi khoá storage dựng lại từ phiên + id, không tin body.
   */
  @Injectable()
  export class GradeExportService {
    constructor(
      private readonly storage: StorageService,
      private readonly data: GradeExportDataService,
      @InjectDataSource() private readonly ds: DataSource,
    ) {}

    /** Bước 1: một id và một chỗ để đặt byte. Chưa có dòng DB nào — chỉ ghi lúc xuất. */
    async requestTemplateUpload(
      sessionId: string,
      dto: TemplateUploadDto,
    ): Promise<{ templateId: string; storageKey: string; uploadUrl: string; expiresIn: number }> {
      // `dto.fileName` không dựng gì cả; nó chỉ đã được kiểm đuôi. Khoá dựng từ id do server cấp.
      void dto;
      const templateId = randomUUID();
      const storageKey = buildTemplateKey(sessionId, templateId);
      const { uploadUrl, expiresIn } = await this.storage.generateUploadUrl(storageKey);
      return { templateId, storageKey, uploadUrl, expiresIn };
    }

    /**
     * Tải file mẫu từ storage, đo kích thước THẬT bằng HeadObject trước khi tải (số client khai không đáng tin),
     * rồi mở bằng `yauzl` có giới hạn. Mọi lỗi của lớp `.xlsx` thành 400 tiếng Việt.
     */
    async loadTemplate(sessionId: string, templateId: string): Promise<LoadedTemplate> {
      const key = buildTemplateKey(sessionId, templateId);
      const size = await this.storage.getObjectSize(key);
      if (size === null) throw new BadRequestException(MSG.noFile);
      if (size > MAX_TEMPLATE_BYTES) throw new BadRequestException(MSG.tooLarge);
      const buffer = await this.storage.getObject(key);
      try {
        const entries = await readZipEntries(buffer);
        return { workbook: openWorkbook(entries), entries, size };
      } catch (error) {
        throw toHttpError(error);
      }
    }

    readSheetOrThrow(workbook: Workbook, name: string): SheetRead {
      try {
        return readSheet(workbook, name);
      } catch (error) {
        throw toHttpError(error);
      }
    }

    async inspect(sessionId: string, dto: InspectDto): Promise<InspectResponse> {
      const { workbook, size } = await this.loadTemplate(sessionId, dto.templateId);
      const deliverables = await this.data.deliverables(this.ds.manager, sessionId);
      const sheets = workbook.sheets.map((s) => ({ name: s.name, hidden: s.hidden }));
      // Chỉ khi file có ĐÚNG MỘT trang tính mới không cần hỏi: chọn trang khác đi là đoán thay giảng viên.
      const chosen = dto.sheetName ?? (sheets.length === 1 ? sheets[0]!.name : null);
      let grid: InspectGrid | null = null;
      if (chosen !== null) {
        if (!sheets.some((s) => s.name === chosen)) throw new BadRequestException(MSG.noSheet(chosen));
        grid = buildGrid(this.readSheetOrThrow(workbook, chosen), dto.fromRow ?? 1);
      }
      return { templateId: dto.templateId, fileSizeBytes: size, sheets, deliverables, sheet: grid };
    }
  }
  ```

  `grade-export.controller.ts`:

  ```ts
  import { Body, Controller, HttpCode, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
  import type { Request } from 'express';
  import { JwtAuthGuard } from '../auth/jwt-auth.guard';
  import { Roles } from '../auth/roles.decorator';
  import { RolesGuard } from '../auth/roles.guard';
  import { ExamSessionService } from '../exam-session/exam-session.service';
  import { InspectDto } from './dto/inspect.dto';
  import { TemplateUploadDto } from './dto/template-upload.dto';
  import { GradeExportService } from './grade-export.service';

  /**
   * Ghi điểm vào sổ điểm (spec `2026-09-29-gradebook-export-design.md` §4.5). Quyền sở hữu phiên luôn qua
   * `findEntityForOwner` trước — không route nào nhận `teacherId` từ body.
   */
  @Controller()
  @UseGuards(JwtAuthGuard, RolesGuard)
  export class GradeExportController {
    constructor(
      private readonly exports: GradeExportService,
      private readonly sessions: ExamSessionService,
    ) {}

    @Post('exam-sessions/:id/grade-exports/template-upload')
    @Roles('teacher')
    async templateUpload(@Param('id', ParseUUIDPipe) id: string, @Body() dto: TemplateUploadDto, @Req() req: Request) {
      const session = await this.sessions.findEntityForOwner(id, req.user!.sub);
      return this.exports.requestTemplateUpload(session.id, dto);
    }

    @Post('exam-sessions/:id/grade-exports/inspect')
    @Roles('teacher')
    @HttpCode(200)
    async inspect(@Param('id', ParseUUIDPipe) id: string, @Body() dto: InspectDto, @Req() req: Request) {
      const session = await this.sessions.findEntityForOwner(id, req.user!.sub);
      return this.exports.inspect(session.id, dto);
    }
  }
  ```

  Replace the whole of `grade-export.module.ts` with:

  ```ts
  import { Module } from '@nestjs/common';
  import { ExamSessionModule } from '../exam-session/exam-session.module';
  import { StorageModule } from '../storage/storage.module';
  import { GradeExportController } from './grade-export.controller';
  import { GradeExportDataService } from './grade-export.data';
  import { GradeExportFileStore } from './grade-export-file-store';
  import { GradeExportService } from './grade-export.service';

  /**
   * Ghi điểm vào sổ điểm của giảng viên (spec `2026-09-29-gradebook-export-design.md`). Module RIÊNG để không đụng
   * `grading.controller.ts`.
   */
  @Module({
    imports: [StorageModule, ExamSessionModule],
    controllers: [GradeExportController],
    providers: [GradeExportService, GradeExportDataService, GradeExportFileStore],
    exports: [GradeExportDataService],
  })
  export class GradeExportModule {}
  ```

  ```bash
  pnpm --filter api exec jest src/grade-export
  pnpm --filter api exec jest --config ./test/jest-e2e.json test/grade-export-inspect.e2e-spec.ts test/grade-export-data.e2e-spec.ts
  pnpm --filter api exec tsc --noEmit
  pnpm --filter api exec eslint src/grade-export test/grade-export-inspect.e2e-spec.ts
  pnpm check:cycles
  ```

  Expected: all unit suites of `src/grade-export` green; inspect e2e **11 passed**; data e2e still 8 passed; `tsc` clean (unused `GradeExportFileStore` in the module is fine — Task 10 injects it); eslint 0 errors; `0 vòng lặp`. If the `.xls` case reports `Đây không phải file .xlsx.` instead of the password message, `assertLooksLikeZip` was reached with a buffer shorter than four bytes — the fixture is 208 bytes, so check that `CFB_MAGIC` in `zip-io.ts` is the first four bytes `d0 cf 11 e0`. If the 5 MiB+1 upload is rejected by MinIO/`fetch` itself, raise it to a `Blob`-safe size and record the finding — the assertion being tested is that the **server** measures.

- [ ] **Step 5: `detect_changes` and commit.** Title: `feat(grade-export): xin URL ký cho file mẫu, đọc file từ storage có giới hạn, xem trang tính và lưới cột`.


---

### Task 9: the preview

**Files:** create `apps/api/src/grade-export/grade-export-plan.service.ts`, `apps/api/test/grade-export-preview.e2e-spec.ts`; modify `apps/api/src/grade-export/grade-export.controller.ts`, `apps/api/src/grade-export/grade-export.module.ts`.

**Interfaces**
- Consumes: `GradeExportService.loadTemplate` / `.readSheetOrThrow` (Task 8), `GradeExportDataService` (Task 7), `buildPlan`, `attribute`, `summarizeChanges` (Task 6), `BLANK_LABELS`, `MSG`, `PlanDto` (Task 8), `formatHundredths`.
- Produces:
  - `GradeExportPlanService.computePlan(m, sessionId, dto): Promise<PlanContext>` — shared with Task 10 so **preview and write can never disagree**.
  - `GradeExportPlanService.preview(sessionId, dto): Promise<PlanResponse>`.
  - `interface PlanContext { plan: ExportPlan; changes: ChangesSummary | null; deliverableId: string | null; entries: ZipEntry[]; sheetPath: string }` — `plan.rows` already carry `causes`.
  - `PlanResponse`, `PlanRowView`, `NotInFileView`, `toPlanResponse(ctx, dto)`.
  - `POST /exam-sessions/:id/grade-exports/preview` → 200 `PlanResponse`.

The order of the checks in `computePlan` is part of the contract: **columns → deliverable → template/sheet/size → session gate → plan**. Every failure is a Vietnamese 400 or 409 that names what to do next.

- [ ] **Step 1: RED — the preview e2e.** Create `apps/api/test/grade-export-preview.e2e-spec.ts`:

  ```ts
  import { randomUUID } from 'node:crypto';
  import { INestApplication, ValidationPipe } from '@nestjs/common';
  import { Test } from '@nestjs/testing';
  import request from 'supertest';
  import { DataSource } from 'typeorm';
  import { AppModule } from '../src/app.module';
  import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
  import { buildXlsx } from '../src/grade-export/testing/xlsx-fixture';
  import { loadCurrentScore } from '../src/grading/scoring/score-inputs';
  import {
    GRADEBOOK_SHEET, buildGradebook, everyone, gradebookRows, loginTeacher, planBody, seedFinalizedBase, seedGradebookWorld,
    uploadTemplate, type GradebookWorld, type Teacher,
  } from './helpers/grade-export-seed';
  import { seedSession } from './helpers/grading-seed';

  interface PreviewRow { row: number; studentMssv: string | null; action: string; systemScore: string | null; writtenScore: string | null; blankReason: string | null; blankLabel: string | null; note: string | null; direction: string | null }

  describe('Xem trước ghi điểm vào sổ điểm (e2e)', () => {
    let app: INestApplication;
    let ds: DataSource;
    let w: GradebookWorld;
    let other: Teacher;

    const http = () => request(app.getHttpServer());
    const as = (token: string) => ({ Authorization: `Bearer ${token}` });
    const preview = (body: object, token = w.teacher.token, sessionId = w.ctx.sessionId) =>
      http().post(`/exam-sessions/${sessionId}/grade-exports/preview`).set(as(token)).send(body);
    const upload = async (rows = gradebookRows(everyone(w))) => uploadTemplate(app, w.teacher.token, w.ctx.sessionId, await buildGradebook(rows));
    const rowOf = (body: { rows: PreviewRow[] }, mssv: string) => body.rows.find((r) => r.studentMssv === mssv)!;

    beforeAll(async () => {
      const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
      app = moduleRef.createNestApplication();
      app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
      app.useGlobalFilters(new PostgresExceptionFilter());
      await app.init();
      ds = app.get(DataSource);
      w = await seedGradebookWorld(app, 'prev');
      other = await loginTeacher(app, ds, 'prev-other');
    }, 120_000);
    afterAll(async () => app.close());

    it('ba con số, từng dòng, điểm làm tròn nửa lên ở bước 0,5 — và điểm hệ thống nằm cạnh giá trị sẽ ghi', async () => {
      const res = await preview(planBody(await upload(), { roundingStepHundredths: 50, reasonColumn: 'E' }));
      expect(res.status).toBe(200);
      expect(res.body.summary).toEqual({ write: 3, blank: 6, kept: 0, unmatched: 0, duplicates: 0, skipped: 0, ignoredEmpty: 0, notInFile: 0 });
      expect(res.body).toMatchObject({ canWrite: true, blockers: [], changes: null, overwrite: { score: 0, reason: 0 }, roundingStepHundredths: 50, deliverableId: null, notInFile: [] });
      expect(res.body.digest).toMatch(/^[0-9a-f]{64}$/);
      expect(rowOf(res.body, w.auto.mssv)).toMatchObject({ row: 3, action: 'write', systemScore: '8.50', writtenScore: '8.50', direction: null });
      expect(rowOf(res.body, w.reviewed.mssv)).toMatchObject({ action: 'write', systemScore: '6.50', writtenScore: '6.50' });
      expect(rowOf(res.body, w.manual.mssv)).toMatchObject({ action: 'write', systemScore: '5.25', writtenScore: '5.50' });
    });

    // Review Focus 4: một con số tạm trong file chính thức bị hiểu là điểm cuối.
    it('bài đã có điểm tạm 9,00 nhưng CHƯA CHỐT là ô trống có lý do — không bao giờ một con số', async () => {
      const res = await preview(planBody(await upload(), { reasonColumn: 'E' }));
      expect(rowOf(res.body, w.notFinal.mssv)).toMatchObject({ action: 'blank', systemScore: null, writtenScore: null, blankReason: 'not_finished', blankLabel: 'Chưa chấm xong hoặc chưa chốt điểm' });
    });

    it('bốn nghĩa của ô trống, mỗi nghĩa một nhãn', async () => {
      const res = await preview(planBody(await upload()));
      const at = (s: { mssv: string }) => rowOf(res.body, s.mssv);
      expect([at(w.late), at(w.noResult)].map((r) => r.blankReason)).toEqual(['not_finished', 'not_finished']);
      expect(at(w.ungradable)).toMatchObject({ blankReason: 'ungradable', blankLabel: 'Hệ thống không chấm được bài' });
      expect(at(w.flagged)).toMatchObject({ blankReason: 'flagged', blankLabel: 'Đang chờ giảng viên duyệt' });
      expect(at(w.absent)).toMatchObject({ blankReason: 'absent', blankLabel: 'Vắng — không có bài nộp' });
    });

    // Review Focus 2.
    it('điểm hệ thống của từng bài đã chốt bằng đúng `loadCurrentScore`', async () => {
      const res = await preview(planBody(await upload()));
      for (const s of [w.auto, w.reviewed, w.manual]) {
        const current = await loadCurrentScore(ds.manager, s.resultId!);
        expect(Number(rowOf(res.body, s.mssv).systemScore)).toBe(current.value);
      }
    });

    it('dòng lạ, dòng trống xen kẽ và tiêu đề: không khớp thì báo, dòng trống thì đếm riêng, tiêu đề không bị tính', async () => {
      const rows = gradebookRows(everyone(w));
      rows.push([12, '99999999', 'Người lạ', null, null], [13, '', 'Dòng không có MSSV', null, null]);
      const res = await preview(planBody(await upload(rows)));
      expect(res.body.summary).toMatchObject({ write: 3, blank: 6, unmatched: 1, ignoredEmpty: 1 });
      expect(res.body.rows.find((r: PreviewRow) => r.action === 'unmatched')).toMatchObject({ row: 12, note: 'Không có trong danh sách sinh viên của phiên.' });
    });

    it('sinh viên có trong phiên mà file không có dòng: báo riêng, không thêm vào file', async () => {
      const res = await preview(planBody(await upload(gradebookRows(everyone(w)).slice(0, 4))));
      expect(res.body.summary.notInFile).toBe(7);
      expect(res.body.notInFile.map((s: { mssv: string }) => s.mssv)).toContain(w.absent.mssv);
      expect(res.body.notInFile.find((s: { mssv: string }) => s.mssv === w.manual.mssv)).toMatchObject({ score: '5.25', blankReason: null });
    });

    it('MSSV trùng trong file chặn việc ghi (vẫn xem trước được) và cả hai dòng đều báo trùng', async () => {
      const rows = gradebookRows(everyone(w));
      rows.push([12, w.auto.mssv, 'Trùng', null, null]);
      const res = await preview(planBody(await upload(rows)));
      expect(res.status).toBe(200);
      expect(res.body.canWrite).toBe(false);
      expect(res.body.blockers[0]).toBe(`1 MSSV xuất hiện nhiều lần trong file (${w.auto.mssv}). Hãy sửa file rồi tải lại — hệ thống không đoán ghi vào dòng nào.`);
      expect(res.body.rows.filter((r: PreviewRow) => r.action === 'duplicate').map((r: PreviewRow) => r.row)).toEqual([3, 12]);
    });

    it('ô điểm có công thức thì bỏ qua dòng đó, nói lý do', async () => {
      const rows = gradebookRows(everyone(w));
      rows[2]![3] = { formula: '1+1', value: 2 };
      const res = await preview(planBody(await upload(rows)));
      expect(res.body.summary).toMatchObject({ write: 2, skipped: 1 });
      expect(rowOf(res.body, w.auto.mssv)).toMatchObject({ action: 'skipped_formula', note: 'Ô điểm có công thức — không ghi.' });
    });

    it('đếm số ô sẽ bị ghi đè: ô đã có số KHÁC, ô có chữ; ô đã đúng giá trị sắp ghi thì không tính', async () => {
      const rows = gradebookRows(everyone(w));
      rows[2]![3] = 6.5; // 8,5 sẽ thay 6,5
      rows[3]![3] = 'bỏ thi'; // chữ
      rows[4]![3] = 5.5; // bước 0,5 sẽ ghi đúng 5,5
      const res = await preview(planBody(await upload(rows), { roundingStepHundredths: 50 }));
      expect(res.body.overwrite).toEqual({ score: 2, reason: 0 });
    });

    it('trang tính đang được bảo vệ chặn cả lượt', async () => {
      const bytes = await buildXlsx([{ name: GRADEBOOK_SHEET, rows: gradebookRows(everyone(w)), protect: true }]);
      const res = await preview(planBody(await uploadTemplate(app, w.teacher.token, w.ctx.sessionId, bytes)));
      expect(res.body).toMatchObject({ canWrite: false, blockers: ['Trang tính đang được bảo vệ. Hãy bỏ bảo vệ trong Excel rồi tải lại.'] });
    });

    it('digest ổn định qua hai lần xem, và đổi khi đổi bước làm tròn', async () => {
      const id = await upload();
      const a = await preview(planBody(id));
      const b = await preview(planBody(id));
      const c = await preview(planBody(id, { roundingStepHundredths: 50 }));
      expect(a.body.digest).toBe(b.body.digest);
      expect(c.body.digest).not.toBe(a.body.digest);
    });

    it('phiên chưa chốt điểm → 409, dù file hợp lệ', async () => {
      const empty = (await seedSession(ds, 'gx-prev-empty', { teacherId: w.teacher.id, startHoursAgo: 8 })).sessionId;
      const id = await uploadTemplate(app, w.teacher.token, empty, await buildGradebook(gradebookRows([])));
      const res = await preview(planBody(id), w.teacher.token, empty);
      expect(res.status).toBe(409);
      expect(res.body.message).toBe('Phiên chưa chốt điểm — chốt điểm trước rồi mới ghi vào sổ điểm.');
    });

    it('các đầu vào sai đều là 400 tiếng Việt nói cần sửa gì', async () => {
      const id = await upload();
      const say = async (over: Record<string, unknown>) => (await preview(planBody(id, over))).body.message;
      expect(await say({ scoreColumn: 'B' })).toBe('Cột MSSV, cột điểm và cột lý do phải là ba cột khác nhau.');
      expect(await say({ reasonColumn: 'D' })).toBe('Cột MSSV, cột điểm và cột lý do phải là ba cột khác nhau.');
      expect(await say({ mssvColumn: 'BI' })).toBe('Cột BI nằm ngoài giới hạn (tối đa cột BH).');
      expect(await say({ sheetName: 'Không có' })).toBe('Không thấy trang tính "Không có" trong file.');
      expect(await say({ deliverableId: randomUUID() })).toBe('Yêu cầu nộp này không thuộc phiên thi.');
      expect((await preview(planBody(id, { roundingStepHundredths: 5 }))).status).toBe(400);
      expect((await preview(planBody(id, { mssvColumn: 'b' }))).status).toBe(400);
      expect((await preview(planBody(id, { firstDataRow: 0 }))).status).toBe(400);
    });

    it('quá 2000 dòng dữ liệu → 400', async () => {
      const many = Array.from({ length: 2100 }, (_, i) => ({ mssv: `SV${String(i).padStart(6, '0')}`, name: 'x' }));
      const res = await preview(planBody(await upload(gradebookRows(many))));
      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Quá 2000 dòng dữ liệu — hãy tách file.');
    });

    it('giảng viên khác → 403; không đăng nhập → 401', async () => {
      const id = await upload();
      expect((await preview(planBody(id), other.token)).status).toBe(403);
      expect((await http().post(`/exam-sessions/${w.ctx.sessionId}/grade-exports/preview`).send(planBody(id))).status).toBe(401);
    });

    describe('ô số mất số 0 đầu', () => {
      it('khớp MỘT MSSV của phiên và dòng đó nói rõ đã khớp bằng cách nào', async () => {
        const z = await seedFinalizedBase(app, 'prev-zero');
        await ds.query(
          `INSERT INTO examcollect.session_roster (exam_session_id, student_mssv, student_name, home_class_id, home_teacher_id, source) VALUES ($1, '0012345', 'Có số 0', $2, $3, 'manual')`,
          [z.ctx.sessionId, z.ctx.classId, z.ctx.teacherId],
        );
        const rows = gradebookRows([z.auto, { mssv: '', name: 'Có số 0' }]);
        rows[3]![1] = 12345; // ô SỐ — Excel không giữ được số 0 đầu
        const id = await uploadTemplate(app, z.teacher.token, z.ctx.sessionId, await buildGradebook(rows));
        const res = await preview(planBody(id), z.teacher.token, z.ctx.sessionId);
        expect(res.body.rows.find((r: PreviewRow) => r.row === 4)).toMatchObject({ studentMssv: '0012345', action: 'blank', blankReason: 'absent', note: 'Khớp sau khi bỏ số 0 đầu (ô số).' });
      });
    });

    describe('phiên có nhiều yêu cầu nộp (D7)', () => {
      it('phải chọn yêu cầu nào; điểm không bao giờ được cộng', async () => {
        const m = await seedFinalizedBase(app, 'prev-multi');
        await ds.query(`INSERT INTO examcollect.required_deliverable (exam_session_id, required_filename, deliverable_type) VALUES ($1, 'Cau2.docx', 'document')`, [m.ctx.sessionId]);
        const [second] = await ds.query(`SELECT id FROM examcollect.required_deliverable WHERE exam_session_id = $1 AND required_filename = 'Cau2.docx'`, [m.ctx.sessionId]);
        const id = await uploadTemplate(app, m.teacher.token, m.ctx.sessionId, await buildGradebook(gradebookRows([m.auto, m.reviewed, m.manual])));
        const call = (over: Record<string, unknown>) => preview(planBody(id, over), m.teacher.token, m.ctx.sessionId);

        const none = await call({});
        expect(none.status).toBe(400);
        expect(none.body.message).toBe('Phiên có 2 yêu cầu nộp — hãy chọn ghi điểm của yêu cầu nào.');
        const first = await call({ deliverableId: m.ctx.deliverableId });
        expect(first.status).toBe(200);
        expect(first.body).toMatchObject({ deliverableId: m.ctx.deliverableId, summary: { write: 3 } });
        const empty = await call({ deliverableId: second.id });
        expect(empty.status).toBe(409); // yêu cầu này chưa có bài nào được chốt
      });
    });
  });
  ```

  ```bash
  pnpm --filter api exec jest --config ./test/jest-e2e.json test/grade-export-preview.e2e-spec.ts
  ```

  Expected: **RED** — the preview route answers 404.

- [ ] **Step 2: GREEN — the plan service.** Create `apps/api/src/grade-export/grade-export-plan.service.ts`:

  ```ts
  import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
  import { InjectDataSource } from '@nestjs/typeorm';
  import { DataSource, EntityManager } from 'typeorm';
  import { formatHundredths } from '../grading/scoring/hundredths';
  import { BLANK_LABELS } from './blank-reason';
  import { attribute, summarizeChanges, type Cause, type ChangesSummary } from './diff-rules';
  import type { PlanDto } from './dto/plan.dto';
  import { GradeExportDataService } from './grade-export.data';
  import { MSG } from './grade-export.messages';
  import { GradeExportService } from './grade-export.service';
  import { MAX_COLUMNS, MAX_DATA_ROWS, type BlankReason } from './grade-export.types';
  import { buildPlan, type Direction, type ExportPlan, type FileCell, type FileRowInput, type PreviousWrite, type RowAction } from './plan';
  import { cellAt, isMergedNonMaster, type SheetRead } from './xlsx/workbook-reader';
  import { colToIndex } from './xlsx/xml-text';
  import type { ZipEntry } from './xlsx/zip-io';

  export interface PlanContext {
    /** `plan.rows` đã mang `causes` cho các dòng đổi so với lần ghi trước. */
    plan: ExportPlan;
    changes: ChangesSummary | null;
    deliverableId: string | null;
    entries: ZipEntry[];
    sheetPath: string;
  }

  export interface PlanRowView {
    row: number;
    mssvInFile: string;
    studentMssv: string | null;
    studentName: string | null;
    action: RowAction;
    /** Chuỗi thập phân ("7.25") — web định dạng bằng dấu phẩy; không bao giờ là số thực. */
    systemScore: string | null;
    writtenScore: string | null;
    blankReason: BlankReason | null;
    blankLabel: string | null;
    previousScore: string | null;
    direction: Direction | null;
    causes: Cause[];
    note: string | null;
  }
  export interface NotInFileView {
    mssv: string;
    name: string;
    blankReason: BlankReason | null;
    blankLabel: string | null;
    score: string | null;
  }
  export interface PlanResponse {
    digest: string;
    deliverableId: string | null;
    roundingStepHundredths: number;
    summary: ExportPlan['summary'];
    overwrite: ExportPlan['overwrite'];
    changes: ChangesSummary | null;
    blockers: string[];
    canWrite: boolean;
    rows: PlanRowView[];
    notInFile: NotInFileView[];
  }

  function fileCell(sheet: SheetRead, col: number, row: number): FileCell {
    const cell = cellAt(sheet, col, row);
    return { text: cell.text, kind: cell.kind, hasFormula: cell.hasFormula, mergedNonMaster: isMergedNonMaster(sheet, col, row) };
  }

  export function toPlanResponse(ctx: PlanContext, dto: PlanDto): PlanResponse {
    const { plan } = ctx;
    const score = (hundredths: number | null) => (hundredths === null ? null : formatHundredths(hundredths));
    return {
      digest: plan.digest,
      deliverableId: ctx.deliverableId,
      roundingStepHundredths: dto.roundingStepHundredths,
      summary: plan.summary,
      overwrite: plan.overwrite,
      changes: ctx.changes,
      blockers: plan.blockers,
      canWrite: plan.blockers.length === 0,
      rows: plan.rows.map((r) => ({
        row: r.row,
        mssvInFile: r.mssvInFile,
        studentMssv: r.studentMssv,
        studentName: r.studentName,
        action: r.action,
        systemScore: score(r.systemHundredths),
        writtenScore: score(r.writtenHundredths),
        blankReason: r.blankReason,
        blankLabel: r.blankReason ? BLANK_LABELS[r.blankReason] : null,
        previousScore: score(r.previousHundredths),
        direction: r.direction,
        causes: r.causes,
        note: r.note,
      })),
      notInFile: plan.notInFile.map((s) => {
        const reason = s.outcome.kind === 'blank' ? s.outcome.reason : null;
        return {
          mssv: s.mssv,
          name: s.name,
          blankReason: reason,
          blankLabel: reason ? BLANK_LABELS[reason] : null,
          score: s.outcome.kind === 'scored' ? formatHundredths(s.outcome.hundredths) : null,
        };
      }),
    };
  }

  /**
   * Kế hoạch ghi — MỘT nơi tính, dùng cho cả xem trước lẫn ghi thật (Task 10), nên hai bên không thể bất đồng.
   * Thứ tự kiểm là một phần của hợp đồng: cột → yêu cầu nộp → file/trang tính/cỡ → cổng "đã chốt" → kế hoạch.
   */
  @Injectable()
  export class GradeExportPlanService {
    constructor(
      @InjectDataSource() private readonly ds: DataSource,
      private readonly data: GradeExportDataService,
      private readonly templates: GradeExportService,
    ) {}

    async preview(sessionId: string, dto: PlanDto): Promise<PlanResponse> {
      return toPlanResponse(await this.computePlan(this.ds.manager, sessionId, dto), dto);
    }

    async computePlan(m: EntityManager, sessionId: string, dto: PlanDto): Promise<PlanContext> {
      const columns = [dto.mssvColumn, dto.scoreColumn, ...(dto.reasonColumn ? [dto.reasonColumn] : [])];
      if (new Set(columns).size !== columns.length) throw new BadRequestException(MSG.sameColumns);
      for (const column of columns) {
        if (colToIndex(column) > MAX_COLUMNS) throw new BadRequestException(MSG.columnTooFar(column));
      }

      // Nhiều yêu cầu nộp → giảng viên PHẢI chọn (D7): cộng điểm là quyết định nghiệp vụ, không phải của hệ thống.
      const deliverables = await this.data.deliverables(m, sessionId);
      if (dto.deliverableId && !deliverables.some((d) => d.id === dto.deliverableId)) throw new BadRequestException(MSG.foreignDeliverable);
      if (deliverables.length > 1 && !dto.deliverableId) throw new BadRequestException(MSG.needDeliverable(deliverables.length));
      const deliverableId = deliverables.length > 1 ? (dto.deliverableId ?? null) : null;

      const { workbook, entries } = await this.templates.loadTemplate(sessionId, dto.templateId);
      const info = workbook.sheets.find((s) => s.name === dto.sheetName);
      if (!info) throw new BadRequestException(MSG.noSheet(dto.sheetName));
      const sheet = this.templates.readSheetOrThrow(workbook, dto.sheetName);
      if (sheet.rowCount - dto.firstDataRow + 1 > MAX_DATA_ROWS) throw new BadRequestException(MSG.tooManyRows);

      const mssvCol = colToIndex(dto.mssvColumn);
      const scoreCol = colToIndex(dto.scoreColumn);
      const reasonCol = dto.reasonColumn ? colToIndex(dto.reasonColumn) : null;
      const rows: FileRowInput[] = [];
      for (let row = dto.firstDataRow; row <= sheet.rowCount; row++) {
        rows.push({
          row,
          mssv: fileCell(sheet, mssvCol, row),
          score: fileCell(sheet, scoreCol, row),
          reason: reasonCol === null ? null : fileCell(sheet, reasonCol, row),
        });
      }

      const { students, publishedResults } = await this.data.loadStudents(m, sessionId, deliverableId);
      if (publishedResults === 0) throw new ConflictException(MSG.notFinalized);
      const previous = await this.data.previousWrites(m, sessionId, deliverableId);
      const previousExports = await this.data.previousExportCount(m, sessionId, deliverableId);

      const built = buildPlan({
        firstDataRow: dto.firstDataRow,
        rows,
        students,
        previous,
        roundingStep: dto.roundingStepHundredths,
        hasReasonColumn: reasonCol !== null,
        sheetProtected: sheet.protected,
      });
      const plan = await this.withCauses(m, built, previous);
      return { plan, changes: summarizeChanges(plan.rows, previousExports), deliverableId, entries, sheetPath: info.path };
    }

    /** Điền `causes` cho các dòng đổi so với lần ghi trước — so hai `score_computation.breakdown` theo luật (D15). */
    private async withCauses(m: EntityManager, plan: ExportPlan, previous: ReadonlyMap<string, PreviousWrite>): Promise<ExportPlan> {
      const changed = new Set(plan.rows.filter((r) => r.action === 'write' && (r.direction === 'up' || r.direction === 'down')));
      if (changed.size === 0) return plan;

      const ids = new Set<string>();
      for (const r of changed) {
        if (r.computationId) ids.add(r.computationId);
        const prev = previous.get(r.studentMssv!.toLowerCase());
        if (prev?.computationId) ids.add(prev.computationId);
      }
      const computations = await this.data.computations(m, [...ids]);
      const revisionIds = new Set<string>();
      for (const c of computations.values()) for (const e of c.breakdown.errors) revisionIds.add(e.revisionId);
      const names = await this.data.ruleNames(m, [...revisionIds]);

      const rows = plan.rows.map((r) => {
        if (!changed.has(r)) return r;
        const prev = previous.get(r.studentMssv!.toLowerCase())!;
        const causes = attribute({
          direction: r.direction as 'up' | 'down',
          currentSource: r.source ?? 'none',
          previousWritten: prev.hundredths,
          previousStep: prev.step,
          currentRaw: r.systemHundredths!,
          previousBreakdown: (prev.computationId ? computations.get(prev.computationId)?.breakdown : null) ?? null,
          currentBreakdown: (r.computationId ? computations.get(r.computationId)?.breakdown : null) ?? null,
          ruleNames: names,
        });
        return { ...r, causes };
      });
      return { ...plan, rows };
    }
  }
  ```

  In `grade-export.controller.ts` add these imports after `import { InspectDto } from './dto/inspect.dto';`:

  ```ts
  import { PlanDto } from './dto/plan.dto';
  import { GradeExportPlanService } from './grade-export-plan.service';
  ```

  replace exactly

  ```ts
    constructor(
      private readonly exports: GradeExportService,
      private readonly sessions: ExamSessionService,
    ) {}
  ```

  with

  ```ts
    constructor(
      private readonly exports: GradeExportService,
      private readonly plans: GradeExportPlanService,
      private readonly sessions: ExamSessionService,
    ) {}
  ```

  and add, directly before the final `}` of the class (after the `inspect` method):

  ```ts

    @Post('exam-sessions/:id/grade-exports/preview')
    @Roles('teacher')
    @HttpCode(200)
    async preview(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PlanDto, @Req() req: Request) {
      const session = await this.sessions.findEntityForOwner(id, req.user!.sub);
      return this.plans.preview(session.id, dto);
    }
  ```

  In `grade-export.module.ts` add `import { GradeExportPlanService } from './grade-export-plan.service';` and change the `providers` and `exports` arrays to

  ```ts
    providers: [GradeExportService, GradeExportDataService, GradeExportFileStore, GradeExportPlanService],
    exports: [GradeExportDataService, GradeExportPlanService],
  ```

  ```bash
  pnpm --filter api exec jest --config ./test/jest-e2e.json test/grade-export-preview.e2e-spec.ts test/grade-export-inspect.e2e-spec.ts test/grade-export-data.e2e-spec.ts
  pnpm --filter api exec tsc --noEmit
  pnpm --filter api exec eslint src/grade-export test/grade-export-preview.e2e-spec.ts
  pnpm check:cycles
  ```

  Expected: preview **17 passed**; inspect 11 and data 8 unchanged; `tsc` clean; eslint 0 errors; `0 vòng lặp`. If `tsc` rejects `r.direction as 'up' | 'down'`, the `Direction` type is exported from `plan.ts` — check the import. If the *"3 con số"* case reports `blank: 5` instead of `6`, the seed's `noResult` submission was not counted: look at `RESULTS_SQL`'s `LEFT JOIN` — a submission without a grading result must still yield a row.

- [ ] **Step 3: commit.** Title: `feat(grade-export): xem trước ghi điểm — kế hoạch từng dòng, ô trống có lý do, ghi đè, digest`.

---

### Task 10: writing the file — one transaction, the same plan, cleanup if anything fails

**Files:** create `apps/api/src/grade-export/grade-export.names.ts`, `grade-export.names.spec.ts`, `grade-export-write.service.ts`, `apps/api/test/grade-export.e2e-spec.ts`; modify `grade-export.controller.ts`, `grade-export.module.ts`.

**Interfaces**
- Consumes: `GradeExportPlanService.computePlan` (Task 9), `patchWorkbook`/`PatchError`/`CellEdit` (Task 4), `writeZip` (Task 2), `GradeExportFileStore.put` (Task 8), `AuditLogService.recordUserAction` (`AdminModule`), `StorageService.deleteObject`/`generateDownloadUrl`, `lockTeacherScoring` (`grading/scoring/score-inputs.ts`), `buildOutputKey`, `buildTemplateKey`, `WriteDto` (Task 8), `formatHundredths`, `BLANK_LABELS`.
- Produces:
  - `outputFileName(templateFileName: string): string`.
  - `GradeExportWriteService.write(sessionId, teacherId, dto: WriteDto): Promise<WriteResponse>`.
  - `WriteResponse { exportId; fileName; downloadUrl; summary { written, blank, kept, unmatched, skipped, overwritten, decreased }; blank: { row, mssv, name, reason, label, kept }[] }`.
  - `POST /exam-sessions/:id/grade-exports` → 201.

The transaction runs under `lockTeacherScoring` — the same advisory lock every score recomputation takes — so **no re-pricing can land between reading the scores and recording what was written**. The order of the refusals (spec §4.6) is: blockers → digest → overwrite → decreases; each is a 409 that says what to do.

- [ ] **Step 1: RED — the file-name helper.** Create `grade-export.names.spec.ts`:

  ```ts
  import { outputFileName } from './grade-export.names';

  describe('outputFileName', () => {
    it('adds a suffix before the extension and keeps Vietnamese letters', () => {
      expect(outputFileName('Sổ điểm N01.xlsx')).toBe('Sổ điểm N01-da-ghi-diem.xlsx');
    });
    it('is case-insensitive about the extension and strips only one', () => {
      expect(outputFileName('SO-DIEM.XLSX')).toBe('SO-DIEM-da-ghi-diem.xlsx');
      expect(outputFileName('a.xlsx.xlsx')).toBe('a.xlsx-da-ghi-diem.xlsx');
    });
    it('cannot smuggle a path or a control character into a header', () => {
      expect(outputFileName('..\\..\\etc/passwd.xlsx')).toBe('.._.._etc_passwd-da-ghi-diem.xlsx');
      expect(outputFileName('a\r\nb.xlsx')).toBe('ab-da-ghi-diem.xlsx');
    });
    it('falls back to a name when nothing is left, and caps a very long one', () => {
      expect(outputFileName('.xlsx')).toBe('so-diem-da-ghi-diem.xlsx');
      expect(outputFileName('   ')).toBe('so-diem-da-ghi-diem.xlsx');
      expect(outputFileName('x'.repeat(400) + '.xlsx').length).toBeLessThanOrEqual(255);
    });
  });
  ```

  ```bash
  pnpm --filter api exec jest src/grade-export/grade-export.names.spec.ts
  ```

  Expected: **RED** — `Cannot find module './grade-export.names'`.

  Create `grade-export.names.ts`:

  ```ts
  /**
   * Tên file tải về, từ tên file giảng viên đã chọn. Chỉ để hiển thị (đi vào `Content-Disposition` qua
   * `StorageService`): bỏ dấu phân cách đường dẫn và ký tự điều khiển, cắt độ dài, bỏ MỘT đuôi `.xlsx`.
   */
  export function outputFileName(templateFileName: string): string {
    const base =
      templateFileName
        .replace(/[\\/]/g, '_')
        .replace(/[\u0000-\u001F\u007F]/g, '')
        .replace(/\.xlsx$/i, '')
        .trim()
        .slice(0, 200) || 'so-diem';
    return `${base}-da-ghi-diem.xlsx`;
  }
  ```

  ```bash
  pnpm --filter api exec jest src/grade-export/grade-export.names.spec.ts
  ```

  Expected: 5 passed (the fourth `it` holds three assertions).

- [ ] **Step 2: RED — the write e2e.** Create `apps/api/test/grade-export.e2e-spec.ts`:

  ```ts
  import { writeFileSync } from 'node:fs';
  import { INestApplication, ValidationPipe } from '@nestjs/common';
  import { Test } from '@nestjs/testing';
  import request from 'supertest';
  import { DataSource } from 'typeorm';
  import { AppModule } from '../src/app.module';
  import { AuditLogService } from '../src/admin/audit-log.service';
  import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
  import { GradeExportFileStore } from '../src/grade-export/grade-export-file-store';
  import { buildXlsx } from '../src/grade-export/testing/xlsx-fixture';
  import { openWorkbook, readSheet } from '../src/grade-export/xlsx/workbook-reader';
  import { readZipEntries } from '../src/grade-export/xlsx/zip-io';
  import { ScoreService } from '../src/grading/scoring/score.service';
  import { StorageService } from '../src/storage/storage.service';
  import {
    GRADEBOOK_SHEET, buildGradebook, everyone, gradebookRows, loginTeacher, oneShotReviewed, planBody, seedFinalizedBase, seedGradebookWorld,
    uploadTemplate, type GradebookWorld, type Teacher,
  } from './helpers/grade-export-seed';
  import { forceStatus } from './helpers/grading-seed';
  import { seedPrices } from './helpers/investigator-seed';

  describe('Ghi điểm vào sổ điểm của giảng viên (e2e)', () => {
    let app: INestApplication;
    let ds: DataSource;
    let storage: StorageService;
    let w: GradebookWorld;
    let other: Teacher;

    const http = () => request(app.getHttpServer());
    const as = (token: string) => ({ Authorization: `Bearer ${token}` });
    const preview = (body: object, t: { teacher: Teacher; ctx: { sessionId: string } } = w) =>
      http().post(`/exam-sessions/${t.ctx.sessionId}/grade-exports/preview`).set(as(t.teacher.token)).send(body);
    const write = (body: object, t: { teacher: Teacher; ctx: { sessionId: string } } = w, token = t.teacher.token) =>
      http().post(`/exam-sessions/${t.ctx.sessionId}/grade-exports`).set(as(token)).send(body);
    /** Xem trước rồi ghi với đúng digest vừa thấy — luồng của giảng viên. */
    async function exportOnce(
      templateId: string,
      over: Record<string, unknown> = {},
      extra: Record<string, unknown> = {},
      t: { teacher: Teacher; ctx: { sessionId: string } } = w,
    ) {
      const seen = await preview(planBody(templateId, over), t);
      expect(seen.status).toBe(200);
      return write({ ...planBody(templateId, over), expectedDigest: seen.body.digest, templateFileName: 'Sổ điểm N01.xlsx', ...extra }, t);
    }
    /** Cùng bước 0,5 với lượt xuất đầu: đổi sang bước 0,01 sẽ biến 5,5 thành 5,25 — một điểm GIẢM — và mọi ca sau phải xác nhận nó. */
    const HALF = { roundingStepHundredths: 50 };
    const download = async (url: string) => Buffer.from(await (await fetch(url)).arrayBuffer());
    const sheetOf = async (bytes: Buffer) => readSheet(openWorkbook(await readZipEntries(bytes)), GRADEBOOK_SHEET);
    const exportCount = async (sessionId: string) =>
      (await ds.query(`SELECT count(*)::int AS n FROM examcollect.grade_export WHERE exam_session_id = $1`, [sessionId]))[0].n as number;

    beforeAll(async () => {
      const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
      app = moduleRef.createNestApplication();
      app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
      app.useGlobalFilters(new PostgresExceptionFilter());
      await app.init();
      ds = app.get(DataSource);
      storage = app.get(StorageService);
      w = await seedGradebookWorld(app, 'write');
      other = await loginTeacher(app, ds, 'write-other');
    }, 120_000);
    afterAll(async () => app.close());

    // ------------------------------------------------------------------------------------------------ Review Focus 1, 4
    it('ghi đúng các ô đã chọn; ô trống vẫn trống, có lý do; mọi phần khác của file giống hệt từng byte', async () => {
      const original = await buildGradebook(gradebookRows(everyone(w)));
      const templateId = await uploadTemplate(app, w.teacher.token, w.ctx.sessionId, original);

      const res = await exportOnce(templateId, { roundingStepHundredths: 50, reasonColumn: 'E' });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        fileName: 'Sổ điểm N01-da-ghi-diem.xlsx',
        summary: { written: 3, blank: 6, kept: 0, unmatched: 0, skipped: 0, overwritten: 0, decreased: 0 },
      });
      expect(res.body.blank.map((b: { row: number; reason: string }) => [b.row, b.reason])).toEqual([
        [6, 'not_finished'], [7, 'not_finished'], [8, 'ungradable'], [9, 'flagged'], [10, 'not_finished'], [11, 'absent'],
      ]);

      const out = await download(res.body.downloadUrl);
      if (process.env.GX_DUMP) writeFileSync(process.env.GX_DUMP, out); // để mở thử bằng Excel/LibreOffice (Task 16, bước 5)
      const sheet = await sheetOf(out);
      const cell = (ref: string) => sheet.cells.get(ref);
      // dòng: auto 3 · reviewed 4 · manual 5 · late 6 · notFinal 7 · ungradable 8 · flagged 9 · noResult 10 · absent 11
      expect(cell('D3')).toMatchObject({ text: '8.5', kind: 'number' });
      expect(cell('D4')).toMatchObject({ text: '6.5' });
      expect(cell('D5')).toMatchObject({ text: '5.5' }); // 5,25 nửa lên ở bước 0,5
      for (const ref of ['D6', 'D7', 'D8', 'D9', 'D10', 'D11']) expect(cell(ref)?.kind ?? 'empty').toBe('empty'); // không 0, không điểm tạm
      expect(cell('E6')?.text).toBe('Chưa chấm xong hoặc chưa chốt điểm');
      expect(cell('E7')?.text).toBe('Chưa chấm xong hoặc chưa chốt điểm'); // đã có điểm tạm 9,00 — vẫn KHÔNG ghi số
      expect(cell('E8')?.text).toBe('Hệ thống không chấm được bài');
      expect(cell('E9')?.text).toBe('Đang chờ giảng viên duyệt');
      expect(cell('E10')?.text).toBe('Chưa chấm xong hoặc chưa chốt điểm');
      expect(cell('E11')?.text).toBe('Vắng — không có bài nộp');

      // ---- bảo toàn: mọi entry khác trang tính đích và workbook.xml giống hệt byte
      const before = await readZipEntries(original);
      const after = await readZipEntries(out);
      expect(after.map((e) => e.name)).toEqual(before.map((e) => e.name));
      for (const b of before) {
        if (b.name === 'xl/worksheets/sheet1.xml' || b.name === 'xl/workbook.xml') continue;
        expect({ name: b.name, same: after.find((e) => e.name === b.name)!.data.equals(b.data) }).toEqual({ name: b.name, same: true });
      }
      const wb = (entries: typeof before) => entries.find((e) => e.name === 'xl/workbook.xml')!.data.toString();
      expect(wb(after).replace(' fullCalcOnLoad="1"', '')).toBe(wb(before));
      // ---- ...và mọi ô khác của trang tính, kể cả vùng gộp và style
      const oldSheet = readSheet(openWorkbook(before), GRADEBOOK_SHEET);
      const touched = ['D3', 'D4', 'D5', 'E6', 'E7', 'E8', 'E9', 'E10', 'E11'];
      for (const [ref, c] of oldSheet.cells) if (!touched.includes(ref)) expect({ ref, c: sheet.cells.get(ref) }).toEqual({ ref, c });
      expect(sheet.merges).toEqual(oldSheet.merges);
      expect(after.find((e) => e.name === 'xl/worksheets/sheet1.xml')!.data.toString()).toContain('<c r="D3" s="1"><v>8.5</v></c>');

      // ---- bản ghi của lượt xuất (§13.1 luật 2 và 7)
      const [row] = await ds.query(`SELECT * FROM examcollect.grade_export WHERE id = $1`, [res.body.exportId]);
      expect(row).toMatchObject({
        exam_session_id: w.ctx.sessionId, exported_by: w.teacher.id, sheet_name: GRADEBOOK_SHEET, first_data_row: 3,
        mssv_column: 'B', score_column: 'D', reason_column: 'E', required_deliverable_id: null,
        rounding_step_hundredths: 50, rounding_mode: 'half_up', unmatched_mssv_count: 0,
        written_count: 3, blank_count: 6, overwrite_count: 0, decrease_count: 0, decrease_confirmed_by: null,
        template_file_name: 'Sổ điểm N01.xlsx', output_file_name: 'Sổ điểm N01-da-ghi-diem.xlsx',
        template_storage_key: `grade-exports/${w.ctx.sessionId}/templates/${templateId}`,
        output_storage_key: `grade-exports/${w.ctx.sessionId}/outputs/${res.body.exportId}`,
      });
      expect(row.exported_at).not.toBeNull();
      expect(await storage.objectExists(row.output_storage_key)).toBe(true);

      const [g] = await ds.query(`SELECT finalized_computation_id FROM examcollect.grading_result WHERE id = $1`, [w.auto.resultId]);
      const snapshot = await ds.query(
        `SELECT mssv::text AS mssv, file_row, written_hundredths, blank_reason, score_computation_id FROM examcollect.grade_export_row WHERE grade_export_id = $1 ORDER BY file_row`,
        [res.body.exportId],
      );
      expect(snapshot).toHaveLength(9);
      expect(snapshot[0]).toEqual({ mssv: w.auto.mssv, file_row: 3, written_hundredths: 850, blank_reason: null, score_computation_id: g.finalized_computation_id });
      expect(snapshot[2]).toEqual({ mssv: w.manual.mssv, file_row: 5, written_hundredths: 550, blank_reason: null, score_computation_id: null });
      expect(snapshot.slice(3).map((r: { written_hundredths: number | null; blank_reason: string }) => [r.written_hundredths, r.blank_reason])).toEqual([
        [null, 'not_finished'], [null, 'not_finished'], [null, 'ungradable'], [null, 'flagged'], [null, 'not_finished'], [null, 'absent'],
      ]);
    });

    it('digest của bản xem trước khác → 409, và không có gì được ghi', async () => {
      const templateId = await uploadTemplate(app, w.teacher.token, w.ctx.sessionId, await buildGradebook(gradebookRows(everyone(w))));
      const before = await exportCount(w.ctx.sessionId);
      const res = await write({ ...planBody(templateId), expectedDigest: 'f'.repeat(64), templateFileName: 'x.xlsx' });
      expect(res.status).toBe(409);
      expect(res.body.message).toBe('Kết quả chấm đã đổi kể từ lúc xem trước — hãy xem trước lại.');
      expect(await exportCount(w.ctx.sessionId)).toBe(before);
    });

    it('ghi đè ô đã có giá trị đòi cờ tường minh; có cờ thì ghi', async () => {
      const rows = gradebookRows(everyone(w));
      rows[2]![3] = 6.5;
      rows[3]![3] = 'bỏ thi';
      const templateId = await uploadTemplate(app, w.teacher.token, w.ctx.sessionId, await buildGradebook(rows));
      const seen = await preview(planBody(templateId, HALF));
      expect(seen.body.overwrite).toEqual({ score: 2, reason: 0 });
      const body = { ...planBody(templateId, HALF), expectedDigest: seen.body.digest, templateFileName: 'x.xlsx' };

      const refused = await write(body);
      expect(refused.status).toBe(409);
      expect(refused.body.message).toBe('2 ô đã có giá trị và sẽ bị ghi đè — hãy xác nhận ghi đè.');

      const ok = await write({ ...body, overwriteExisting: true });
      expect(ok.status).toBe(201);
      expect((await sheetOf(await download(ok.body.downloadUrl))).cells.get('D3')).toMatchObject({ text: '8.5' });
      const [e] = await ds.query(`SELECT overwrite_count FROM examcollect.grade_export WHERE id = $1`, [ok.body.exportId]);
      expect(e.overwrite_count).toBe(2);
    });

    it('ô có công thức được BỎ QUA nguyên vẹn (công thức và giá trị đệm còn nguyên), các dòng khác vẫn ghi', async () => {
      const rows = gradebookRows(everyone(w));
      rows[4]![3] = { formula: '1+1', value: 2 };
      const templateId = await uploadTemplate(app, w.teacher.token, w.ctx.sessionId, await buildGradebook(rows));
      const res = await exportOnce(templateId, HALF);
      expect(res.status).toBe(201);
      expect(res.body.summary).toMatchObject({ written: 2, skipped: 1 });
      const sheet = await sheetOf(await download(res.body.downloadUrl));
      expect(sheet.cells.get('D5')).toMatchObject({ text: '2', hasFormula: true });
      expect(sheet.cells.get('D3')).toMatchObject({ text: '8.5', hasFormula: false });
    });

    it('MSSV trùng và trang tính bảo vệ đều chặn ghi bằng chính câu của chúng — và không tạo lượt xuất', async () => {
      const dup = gradebookRows(everyone(w));
      dup.push([12, w.auto.mssv, 'Trùng', null, null]);
      const dupId = await uploadTemplate(app, w.teacher.token, w.ctx.sessionId, await buildGradebook(dup));
      const protectedId = await uploadTemplate(app, w.teacher.token, w.ctx.sessionId, await buildXlsx([{ name: GRADEBOOK_SHEET, rows: gradebookRows(everyone(w)), protect: true }]));
      const before = await exportCount(w.ctx.sessionId);
      const stub = { expectedDigest: 'a'.repeat(64), templateFileName: 'x.xlsx' };

      const d = await write({ ...planBody(dupId), ...stub });
      expect(d.status).toBe(409);
      expect(d.body.message).toBe(`1 MSSV xuất hiện nhiều lần trong file (${w.auto.mssv}). Hãy sửa file rồi tải lại — hệ thống không đoán ghi vào dòng nào.`);
      const p = await write({ ...planBody(protectedId), ...stub });
      expect(p.status).toBe(409);
      expect(p.body.message).toBe('Trang tính đang được bảo vệ. Hãy bỏ bảo vệ trong Excel rồi tải lại.');
      expect(await exportCount(w.ctx.sessionId)).toBe(before);
    });

    it('giảng viên khác → 403; không đăng nhập → 401; body thiếu digest → 400', async () => {
      const templateId = await uploadTemplate(app, w.teacher.token, w.ctx.sessionId, await buildGradebook(gradebookRows(everyone(w))));
      const body = { ...planBody(templateId), expectedDigest: 'a'.repeat(64), templateFileName: 'x.xlsx' };
      expect((await write(body, w, other.token)).status).toBe(403);
      expect((await http().post(`/exam-sessions/${w.ctx.sessionId}/grade-exports`).send(body)).status).toBe(401);
      expect((await write(planBody(templateId))).status).toBe(400);
    });

    // ------------------------------------------------------------------------------------------------ Review Focus 5
    describe('xuất lại (parent §13.1 luật 3, 4)', () => {
      it('so giá trị đã làm tròn; tách giảm khỏi tăng; nêu LUẬT gây ra; đòi xác nhận điểm giảm; ghi cột + audit_log', async () => {
        const b = await seedFinalizedBase(app, 'write-re');
        const students = [b.auto, b.reviewed, b.manual];
        const upload = async () => uploadTemplate(app, b.teacher.token, b.ctx.sessionId, await buildGradebook(gradebookRows(students)));

        // lượt 1: điểm như lúc chốt
        expect((await exportOnce(await upload(), { reasonColumn: 'E' }, {}, b)).status).toBe(201);

        // sửa giá luật `sai_bien` 1,50 → 2,50 rồi ÁP cho phiên đã chốt: bài `auto` từ 8,50 xuống 7,50
        await seedPrices(ds, b.ctx.teacherId, { [b.bien.ruleId]: '2.50', [b.ten.ruleId]: '0.50' });
        expect(await app.get(ScoreService).reapplyFinalizedSession(b.ctx.sessionId, b.ctx.teacherId)).toEqual({ changed: 1 });

        const second = await upload();
        const seen = await preview(planBody(second, { reasonColumn: 'E' }), b);
        expect(seen.body.changes).toEqual({
          previousExports: 1, up: 0, down: 1, same: 2, new: 0,
          downByCause: [{ kind: 'rule', ruleKey: 'sai_bien', ruleName: 'sai_bien', students: 1 }],
          upByCause: [],
        });
        const autoRow = seen.body.rows.find((r: { studentMssv: string }) => r.studentMssv === b.auto.mssv);
        expect(autoRow).toMatchObject({
          direction: 'down', previousScore: '8.50', writtenScore: '7.50',
          causes: [{ kind: 'rule', ruleKey: 'sai_bien', ruleName: 'sai_bien', delta: 100 }],
        });

        const body = { ...planBody(second, { reasonColumn: 'E' }), expectedDigest: seen.body.digest, templateFileName: 'x.xlsx' };
        const refused = await write(body, b);
        expect(refused.status).toBe(409);
        expect(refused.body.message).toBe('1 bài bị giảm điểm so với lần ghi trước — hãy xem và xác nhận trước khi ghi.');

        const ok = await write({ ...body, confirmDecreases: true }, b);
        expect(ok.status).toBe(201);
        expect(ok.body.summary.decreased).toBe(1);
        const [e] = await ds.query(`SELECT decrease_count, decrease_confirmed_by FROM examcollect.grade_export WHERE id = $1`, [ok.body.exportId]);
        expect(e).toEqual({ decrease_count: 1, decrease_confirmed_by: b.teacher.id });
        const audit = await ds.query(
          `SELECT actor_id, target_type, new_value FROM examcollect.audit_log WHERE action = 'grade_export.score_decreased_confirmed' AND target_id = $1`,
          [ok.body.exportId],
        );
        expect(audit).toHaveLength(1);
        expect(audit[0]).toMatchObject({ actor_id: b.teacher.id, target_type: 'grade_export' });
        expect(audit[0].new_value.decreased).toEqual([
          { mssv: b.auto.mssv, before: '8.50', after: '7.50', causes: [{ kind: 'rule', ruleKey: 'sai_bien', ruleName: 'sai_bien', delta: 100 }] },
        ]);

        // lượt 3: chỉ đổi bước làm tròn — 5,25 → 5,5 là TĂNG, nhưng nguyên nhân là làm tròn, không phải một luật
        const third = await preview(planBody(await upload(), { roundingStepHundredths: 50 }), b);
        expect(third.body.changes).toMatchObject({ previousExports: 2, up: 1, down: 0 });
        expect(third.body.changes.upByCause).toEqual([{ kind: 'rounding', ruleKey: null, ruleName: null, students: 1 }]);
      });

      it('sinh viên đã ghi mà nay chưa xong → GIỮ NGUYÊN ô điểm; nhãn lý do cũ của ta bị xoá khi sinh viên đã có điểm', async () => {
        const k = await seedFinalizedBase(app, 'write-keep');
        const late = { ...(await oneShotReviewed(ds, k.ctx, '4.00')), name: 'Nộp muộn' };
        const [sub] = await ds.query(`SELECT student_mssv AS mssv FROM examcollect.submission WHERE id = $1`, [late.submissionId]);
        const lateStudent = { ...late, mssv: sub.mssv as string };
        const students = [k.auto, k.reviewed, k.manual, lateStudent];

        // lượt 1: `late` chưa chốt → ô điểm trống + nhãn lý do
        const first = await exportOnce(await uploadTemplate(app, k.teacher.token, k.ctx.sessionId, await buildGradebook(gradebookRows(students))), { reasonColumn: 'E' }, {}, k);
        expect(first.status).toBe(201);
        const firstBytes = await download(first.body.downloadUrl);
        expect((await sheetOf(firstBytes)).cells.get('E6')?.text).toBe('Chưa chấm xong hoặc chưa chốt điểm');

        // `late` được chốt; `reviewed` bị đẩy ra NGOÀI máy trạng thái (bỏ qua trigger) về "đang chờ duyệt"
        await forceStatus(ds, late.resultId, 'finalized', { finalized_by: k.teacher.id, finalized_at: new Date() });
        await forceStatus(ds, k.reviewed.resultId!, 'flagged_for_review');

        // lượt 2 lên CHÍNH file lượt 1 — nên ô E6 đang mang nhãn cũ và ô D4 mang 6,5
        const secondId = await uploadTemplate(app, k.teacher.token, k.ctx.sessionId, firstBytes);
        const seen = await preview(planBody(secondId, { reasonColumn: 'E' }), k);
        expect(seen.body.summary).toMatchObject({ write: 3, kept: 1, blank: 0 });
        const kept = seen.body.rows.find((r: { studentMssv: string }) => r.studentMssv === k.reviewed.mssv);
        expect(kept).toMatchObject({ action: 'kept', writtenScore: null, previousScore: '6.50', blankReason: 'flagged' });
        expect(kept.note).toBe('Lần trước đã ghi 6,5; lần này bài đang chờ giảng viên duyệt — giữ nguyên ô điểm.');
        expect(seen.body.overwrite).toEqual({ score: 0, reason: 0 }); // nhãn của chính ta không phải "giá trị"

        const second = await write({ ...planBody(secondId, { reasonColumn: 'E' }), expectedDigest: seen.body.digest, templateFileName: 'x.xlsx' }, k);
        expect(second.status).toBe(201);
        const sheet = await sheetOf(await download(second.body.downloadUrl));
        expect(sheet.cells.get('D6')).toMatchObject({ text: '4', kind: 'number' }); // `late` giờ có điểm
        expect(sheet.cells.get('E6')?.kind ?? 'empty').toBe('empty'); // nhãn cũ của ta đã bị xoá
        expect(sheet.cells.get('D4')).toMatchObject({ text: '6.5' }); // `reviewed` GIỮ NGUYÊN, không bị xoá
        expect(sheet.cells.get('E4')?.text).toBe('Đang chờ giảng viên duyệt');
        const rows = await ds.query(
          `SELECT mssv::text AS mssv, written_hundredths, blank_reason FROM examcollect.grade_export_row WHERE grade_export_id = $1 AND mssv = $2`,
          [second.body.exportId, k.reviewed.mssv],
        );
        expect(rows).toEqual([{ mssv: k.reviewed.mssv, written_hundredths: null, blank_reason: 'flagged' }]);
      });
    });

    // ------------------------------------------------------------------------------------------------ D19
    it('upload xong mà ghi DB hỏng → xoá object vừa đưa lên và không có dòng nào của lượt đó', async () => {
      const c = await seedFinalizedBase(app, 'write-clean');
      const upload = async () => uploadTemplate(app, c.teacher.token, c.ctx.sessionId, await buildGradebook(gradebookRows([c.auto, c.reviewed, c.manual])));
      expect((await exportOnce(await upload(), {}, {}, c)).status).toBe(201);
      await seedPrices(ds, c.ctx.teacherId, { [c.bien.ruleId]: '2.50', [c.ten.ruleId]: '0.50' });
      await app.get(ScoreService).reapplyFinalizedSession(c.ctx.sessionId, c.ctx.teacherId);

      const second = await upload();
      const seen = await preview(planBody(second), c);
      const put = jest.spyOn(app.get(GradeExportFileStore), 'put');
      const audit = jest.spyOn(app.get(AuditLogService), 'recordUserAction').mockRejectedValueOnce(new Error('audit down'));
      try {
        const res = await write({ ...planBody(second), expectedDigest: seen.body.digest, templateFileName: 'x.xlsx', confirmDecreases: true }, c);
        expect(res.status).toBe(500);
        const key = put.mock.calls[0]![0];
        expect(key).toContain(`grade-exports/${c.ctx.sessionId}/outputs/`);
        expect(await storage.objectExists(key)).toBe(false);
        expect(await exportCount(c.ctx.sessionId)).toBe(1); // chỉ lượt 1
      } finally {
        put.mockRestore();
        audit.mockRestore();
      }
    });
  });
  ```

  ```bash
  pnpm --filter api exec jest --config ./test/jest-e2e.json test/grade-export.e2e-spec.ts
  ```

  Expected: **RED** — `POST /exam-sessions/:id/grade-exports` answers 404.

- [ ] **Step 3: GREEN — the write service.** Create `grade-export-write.service.ts`:

  ```ts
  import { randomUUID } from 'node:crypto';
  import { BadRequestException, ConflictException, Injectable, Logger } from '@nestjs/common';
  import { InjectDataSource } from '@nestjs/typeorm';
  import { DataSource } from 'typeorm';
  import { AuditLogService } from '../admin/audit-log.service';
  import { formatHundredths } from '../grading/scoring/hundredths';
  import { lockTeacherScoring } from '../grading/scoring/score-inputs';
  import { StorageService } from '../storage/storage.service';
  import { BLANK_LABELS } from './blank-reason';
  import type { WriteDto } from './dto/write.dto';
  import { GradeExportFileStore } from './grade-export-file-store';
  import { GradeExportPlanService } from './grade-export-plan.service';
  import { buildOutputKey, buildTemplateKey } from './grade-export.keys';
  import { MSG } from './grade-export.messages';
  import { outputFileName } from './grade-export.names';
  import type { BlankReason } from './grade-export.types';
  import { PatchError, patchWorkbook, type CellEdit } from './xlsx/sheet-patch';
  import { writeZip } from './xlsx/zip-io';

  export interface WriteResponse {
    exportId: string;
    fileName: string;
    downloadUrl: string;
    summary: { written: number; blank: number; kept: number; unmatched: number; skipped: number; overwritten: number; decreased: number };
    blank: { row: number; mssv: string; name: string; reason: BlankReason; label: string; kept: boolean }[];
  }

  /**
   * Ghi điểm vào file CỦA GIẢNG VIÊN (spec `2026-09-29-gradebook-export-design.md` §4.5-4.6). Một transaction dưới
   * `lockTeacherScoring` — cùng khoá mọi lượt tính lại điểm — nên không có lần sửa giá nào chen giữa lúc đọc điểm và
   * lúc ghi lại điều đã ghi. Kế hoạch là CHÍNH `computePlan` của xem trước.
   */
  @Injectable()
  export class GradeExportWriteService {
    private readonly logger = new Logger(GradeExportWriteService.name);

    constructor(
      @InjectDataSource() private readonly ds: DataSource,
      private readonly plans: GradeExportPlanService,
      private readonly files: GradeExportFileStore,
      private readonly storage: StorageService,
      private readonly audit: AuditLogService,
    ) {}

    async write(sessionId: string, teacherId: string, dto: WriteDto): Promise<WriteResponse> {
      return this.ds.transaction(async (m) => {
        await lockTeacherScoring(m, teacherId);
        const { plan, deliverableId, entries, sheetPath } = await this.plans.computePlan(m, sessionId, dto);

        // Thứ tự từ chối (spec §4.6): chặn cứng → digest → ghi đè → điểm giảm.
        if (plan.blockers.length > 0) throw new ConflictException(plan.blockers[0]);
        if (dto.expectedDigest !== plan.digest) throw new ConflictException(MSG.digestChanged);
        const overwritten = plan.overwrite.score + plan.overwrite.reason;
        if (overwritten > 0 && dto.overwriteExisting !== true) throw new ConflictException(MSG.overwrite(overwritten));
        const decreased = plan.rows.filter((r) => r.action === 'write' && r.direction === 'down');
        if (decreased.length > 0 && dto.confirmDecreases !== true) throw new ConflictException(MSG.decreases(decreased.length));

        const edits: CellEdit[] = [];
        for (const r of plan.rows) {
          if (r.action === 'write') {
            edits.push({ ref: `${dto.scoreColumn}${r.row}`, kind: 'number', hundredths: r.writtenHundredths! });
            if (r.clearsReason && dto.reasonColumn) edits.push({ ref: `${dto.reasonColumn}${r.row}`, kind: 'clear' });
          } else if ((r.action === 'blank' || r.action === 'kept') && r.writesReason && dto.reasonColumn) {
            edits.push({ ref: `${dto.reasonColumn}${r.row}`, kind: 'text', text: BLANK_LABELS[r.blankReason!] });
          }
        }
        let bytes: Buffer;
        try {
          bytes = await writeZip(patchWorkbook(entries, sheetPath, edits));
        } catch (error) {
          if (error instanceof PatchError) throw new BadRequestException(MSG.unsupported(error.message));
          throw error;
        }

        const exportId = randomUUID();
        const outputKey = buildOutputKey(sessionId, exportId);
        const fileName = outputFileName(dto.templateFileName);
        await this.files.put(outputKey, bytes);
        try {
          await m.query(
            `INSERT INTO examcollect.grade_export
               (id, exam_session_id, exported_by, template_storage_key, output_storage_key, mssv_column, score_column, reason_column,
                sheet_name, first_data_row, required_deliverable_id, rounding_step_hundredths, rounding_mode, unmatched_mssv_count,
                written_count, blank_count, overwrite_count, decrease_count, decrease_confirmed_by, template_file_name, output_file_name, exported_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'half_up', $13, $14, $15, $16, $17, $18, $19, $20, now())`,
            [
              exportId, sessionId, teacherId, buildTemplateKey(sessionId, dto.templateId), outputKey, dto.mssvColumn, dto.scoreColumn,
              dto.reasonColumn ?? null, dto.sheetName, dto.firstDataRow, deliverableId, dto.roundingStepHundredths, plan.summary.unmatched,
              plan.summary.write, plan.summary.blank + plan.summary.kept, overwritten, decreased.length,
              decreased.length > 0 ? teacherId : null, dto.templateFileName.slice(0, 255), fileName,
            ],
          );

          // Bản chụp từng sinh viên — hoặc đã ghi điểm, hoặc để trống kèm lý do (`ck_grade_export_row_one_of`).
          const snapshot = plan.rows.filter((r) => r.action === 'write' || r.action === 'blank' || r.action === 'kept');
          if (snapshot.length > 0) {
            const written = (r: (typeof snapshot)[number]) => r.action === 'write';
            await m.query(
              `INSERT INTO examcollect.grade_export_row (grade_export_id, file_row, mssv, written_hundredths, blank_reason, score_computation_id)
               SELECT $1::uuid, t.file_row, t.mssv, t.written, t.reason::examcollect.grade_export_blank_reason, t.computation
                 FROM unnest($2::int[], $3::text[], $4::int[], $5::text[], $6::uuid[]) AS t(file_row, mssv, written, reason, computation)`,
              [
                exportId,
                snapshot.map((r) => r.row),
                snapshot.map((r) => r.studentMssv),
                snapshot.map((r) => (written(r) ? r.writtenHundredths : null)),
                snapshot.map((r) => (written(r) ? null : r.blankReason)),
                snapshot.map((r) => (written(r) ? r.computationId : null)),
              ],
            );
          }

          // Điểm giảm sau khi đã công bố nặng hơn điểm tăng: người xác nhận ghi ở cột trên VÀ ở cuốn sổ chung (D16).
          if (decreased.length > 0) {
            await this.audit.recordUserAction(
              {
                actorId: teacherId,
                action: 'grade_export.score_decreased_confirmed',
                targetType: 'grade_export',
                targetId: exportId,
                oldValue: {},
                newValue: {
                  decreased: decreased.map((r) => ({
                    mssv: r.studentMssv,
                    before: formatHundredths(r.previousHundredths!),
                    after: formatHundredths(r.writtenHundredths!),
                    causes: r.causes,
                  })),
                },
              },
              m,
            );
          }
        } catch (error) {
          // Không có dòng nào trỏ vào object không tồn tại, và không có object mồ côi (D19).
          await this.storage.deleteObject(outputKey).catch((cleanup: unknown) => {
            this.logger.error(`Không xoá được object ${outputKey} sau khi ghi DB hỏng`, cleanup instanceof Error ? cleanup.stack : String(cleanup));
          });
          throw error;
        }

        const { downloadUrl } = await this.storage.generateDownloadUrl(outputKey, { filename: fileName });
        const blanks = plan.rows.filter((r) => r.action === 'blank' || r.action === 'kept');
        return {
          exportId,
          fileName,
          downloadUrl,
          summary: {
            written: plan.summary.write, blank: plan.summary.blank, kept: plan.summary.kept, unmatched: plan.summary.unmatched,
            skipped: plan.summary.skipped, overwritten, decreased: decreased.length,
          },
          blank: blanks.map((r) => ({
            row: r.row, mssv: r.studentMssv!, name: r.studentName!, reason: r.blankReason!, label: BLANK_LABELS[r.blankReason!], kept: r.action === 'kept',
          })),
        };
      });
    }
  }
  ```

  In `grade-export.controller.ts` add the imports after `import { PlanDto } from './dto/plan.dto';`:

  ```ts
  import { WriteDto } from './dto/write.dto';
  import { GradeExportWriteService } from './grade-export-write.service';
  ```

  replace exactly

  ```ts
      private readonly plans: GradeExportPlanService,
      private readonly sessions: ExamSessionService,
    ) {}
  ```

  with

  ```ts
      private readonly plans: GradeExportPlanService,
      private readonly writes: GradeExportWriteService,
      private readonly sessions: ExamSessionService,
    ) {}
  ```

  and add before the final `}` of the class:

  ```ts

    @Post('exam-sessions/:id/grade-exports')
    @Roles('teacher')
    @HttpCode(201)
    async write(@Param('id', ParseUUIDPipe) id: string, @Body() dto: WriteDto, @Req() req: Request) {
      const session = await this.sessions.findEntityForOwner(id, req.user!.sub);
      return this.writes.write(session.id, req.user!.sub, dto);
    }
  ```

  In `grade-export.module.ts` add `import { AdminModule } from '../admin/admin.module';` and `import { GradeExportWriteService } from './grade-export-write.service';`, and set

  ```ts
    imports: [StorageModule, ExamSessionModule, AdminModule],
    providers: [GradeExportService, GradeExportDataService, GradeExportFileStore, GradeExportPlanService, GradeExportWriteService],
  ```

  ```bash
  pnpm --filter api exec jest src/grade-export
  pnpm --filter api exec jest --config ./test/jest-e2e.json test/grade-export.e2e-spec.ts
  pnpm --filter api exec jest --config ./test/jest-e2e.json test/grade-export-preview.e2e-spec.ts test/grade-export-inspect.e2e-spec.ts test/grade-export-data.e2e-spec.ts test/grade-export-schema.e2e-spec.ts
  pnpm --filter api exec tsc --noEmit
  pnpm --filter api exec eslint src/grade-export test/grade-export.e2e-spec.ts
  pnpm check:cycles
  ```

  Expected: every unit suite of `src/grade-export` green; write e2e **9 passed**; the four earlier grade-export e2e suites unchanged (7 + 8 + 11 + 17); `tsc` clean; eslint 0 errors; `0 vòng lặp`. Things most likely to need a second look, in order: (1) `reapplyFinalizedSession` answering `Phiên chưa chốt` — that means a non-final result exists in `seedFinalizedBase`'s session (it must have exactly three, all finalized); (2) `unnest(... $4::int[] ...)` with `NULL` elements — if `pg` rejects it, cast each array element explicitly `t.written::int`; (3) the `'2'` text of the formula cell `D5` — the fixture writes `<v>2</v>`, so the reader must give `'2'`.

- [ ] **Step 4: mutation check — prove the digest guard bites.** Temporarily delete the line `if (dto.expectedDigest !== plan.digest) throw new ConflictException(MSG.digestChanged);` and run:

  ```bash
  pnpm --filter api exec jest --config ./test/jest-e2e.json test/grade-export.e2e-spec.ts -t "digest của bản xem trước khác"
  ```

  Expected: the case fails (`201` instead of `409`, and `exportCount` grew). Restore the line, re-run green, record the failure in the ledger. Repeat once for the decrease guard (delete the `if (decreased.length > 0 && …)` line; the *xuất lại* case fails at `refused.status`).

- [ ] **Step 5: `detect_changes` and commit.** Title: `feat(grade-export): ghi điểm vào file của giảng viên — một transaction, cùng kế hoạch với xem trước, dọn object khi hỏng`.

---

### Task 11: list the exports, download one, and regenerate the API client

**Files:** create `apps/api/src/grade-export/grade-export-query.service.ts`, `apps/api/test/grade-export-list.e2e-spec.ts`; modify `grade-export.controller.ts`, `grade-export.module.ts`; regenerate `packages/shared/src/api/schema.d.ts`.

**Interfaces**
- Consumes: `ExamSessionService.findEntityForOwner`, `StorageService.generateDownloadUrl`, `MSG`.
- Produces:
  - `GradeExportQueryService.list(sessionId): Promise<ExportListItem[]>`, `.download(exportId, teacherId): Promise<{ downloadUrl: string; fileName: string }>`.
  - `GET /exam-sessions/:id/grade-exports` → 200 `ExportListItem[]` (newest first).
  - `GET /grade-exports/:id/download` → 200 `{ downloadUrl, fileName }`.
  - `ExportListItem { id; exportedAt; sheetName; firstDataRow; mssvColumn; scoreColumn; reasonColumn; deliverableName; roundingStepHundredths; written; blank; unmatched; overwritten; decreased; decreaseConfirmedBy; exportedByName; templateFileName; outputFileName }`.
  - The regenerated `schema.d.ts` with all six routes (the web tasks type-check against it).

- [ ] **Step 1: RED — the list/download e2e.** Create `apps/api/test/grade-export-list.e2e-spec.ts`:

  ```ts
  import { randomUUID } from 'node:crypto';
  import { INestApplication, ValidationPipe } from '@nestjs/common';
  import { Test } from '@nestjs/testing';
  import request from 'supertest';
  import { DataSource } from 'typeorm';
  import { AppModule } from '../src/app.module';
  import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
  import { ScoreService } from '../src/grading/scoring/score.service';
  import { StorageService } from '../src/storage/storage.service';
  import { buildGradebook, gradebookRows, loginTeacher, planBody, seedFinalizedBase, uploadTemplate, type FinalizedBase, type Teacher } from './helpers/grade-export-seed';
  import { seedPrices } from './helpers/investigator-seed';
  import { seedSession } from './helpers/grading-seed';

  describe('Danh sách lượt xuất và tải file (e2e)', () => {
    let app: INestApplication;
    let ds: DataSource;
    let b: FinalizedBase;
    let other: Teacher;
    let first: { exportId: string; fileName: string };
    let second: { exportId: string; fileName: string };

    const http = () => request(app.getHttpServer());
    const as = (token: string) => ({ Authorization: `Bearer ${token}` });
    const list = (token = b.teacher.token, sessionId = b.ctx.sessionId) => http().get(`/exam-sessions/${sessionId}/grade-exports`).set(as(token));
    const download = (id: string, token = b.teacher.token) => http().get(`/grade-exports/${id}/download`).set(as(token));

    async function exportOnce(over: Record<string, unknown>, extra: Record<string, unknown>, fileName: string) {
      const templateId = await uploadTemplate(app, b.teacher.token, b.ctx.sessionId, await buildGradebook(gradebookRows([b.auto, b.reviewed, b.manual])));
      const seen = await http().post(`/exam-sessions/${b.ctx.sessionId}/grade-exports/preview`).set(as(b.teacher.token)).send(planBody(templateId, over));
      const res = await http()
        .post(`/exam-sessions/${b.ctx.sessionId}/grade-exports`)
        .set(as(b.teacher.token))
        .send({ ...planBody(templateId, over), expectedDigest: seen.body.digest, templateFileName: fileName, ...extra });
      expect(res.status).toBe(201);
      return res.body as { exportId: string; fileName: string };
    }

    beforeAll(async () => {
      const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
      app = moduleRef.createNestApplication();
      app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
      app.useGlobalFilters(new PostgresExceptionFilter());
      await app.init();
      ds = app.get(DataSource);
      b = await seedFinalizedBase(app, 'list');
      other = await loginTeacher(app, ds, 'list-other');
      first = await exportOnce({ reasonColumn: 'E' }, {}, 'Sổ điểm N01.xlsx');
      await seedPrices(ds, b.ctx.teacherId, { [b.bien.ruleId]: '2.50', [b.ten.ruleId]: '0.50' });
      await app.get(ScoreService).reapplyFinalizedSession(b.ctx.sessionId, b.ctx.teacherId);
      second = await exportOnce({ roundingStepHundredths: 50, reasonColumn: 'E' }, { confirmDecreases: true }, 'Sổ điểm N01 (lại).xlsx');
    }, 120_000);
    afterAll(async () => app.close());

    it('liệt kê các lượt của phiên, mới nhất trước, với đủ thứ giảng viên cần để nhận ra lượt nào là lượt nào', async () => {
      const res = await list();
      expect(res.status).toBe(200);
      expect(res.body.map((e: { id: string }) => e.id)).toEqual([second.exportId, first.exportId]);
      expect(res.body[1]).toEqual({
        id: first.exportId, exportedAt: expect.any(String), sheetName: 'Bảng điểm', firstDataRow: 3, mssvColumn: 'B', scoreColumn: 'D', reasonColumn: 'E',
        deliverableName: null, roundingStepHundredths: 1, written: 3, blank: 0, unmatched: 0, overwritten: 0, decreased: 0, decreaseConfirmedBy: null,
        exportedByName: 'Test Account', templateFileName: 'Sổ điểm N01.xlsx', outputFileName: 'Sổ điểm N01-da-ghi-diem.xlsx',
      });
    });

    it('lượt có điểm giảm ghi tên người đã xác nhận, và bước làm tròn đã dùng', async () => {
      const [latest] = (await list()).body;
      expect(latest).toMatchObject({ roundingStepHundredths: 50, decreased: 1, decreaseConfirmedBy: 'Test Account' });
    });

    it('một phiên khác của cùng giảng viên không thấy lượt của phiên này', async () => {
      const empty = (await seedSession(ds, 'gx-list-empty', { teacherId: b.teacher.id, startHoursAgo: 8 })).sessionId;
      const res = await list(b.teacher.token, empty);
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('tải: URL ký cho ĐÚNG file đã ghi, kèm tên file', async () => {
      const res = await download(first.exportId);
      expect(res.status).toBe(200);
      expect(res.body.fileName).toBe('Sổ điểm N01-da-ghi-diem.xlsx');
      const [row] = await ds.query(`SELECT output_storage_key FROM examcollect.grade_export WHERE id = $1`, [first.exportId]);
      const served = Buffer.from(await (await fetch(res.body.downloadUrl)).arrayBuffer());
      expect(served.equals(await app.get(StorageService).getObject(row.output_storage_key))).toBe(true);
    });

    it('lượt không tồn tại → 404 tiếng Việt; id không phải uuid → 400', async () => {
      const missing = await download(randomUUID());
      expect(missing.status).toBe(404);
      expect(missing.body.message).toBe('Không tìm thấy lượt xuất này.');
      expect((await download('abc')).status).toBe(400);
    });

    it('giảng viên khác không liệt kê và không tải được → 403; không đăng nhập → 401', async () => {
      expect((await list(other.token)).status).toBe(403);
      expect((await download(first.exportId, other.token)).status).toBe(403);
      expect((await http().get(`/exam-sessions/${b.ctx.sessionId}/grade-exports`)).status).toBe(401);
      expect((await http().get(`/grade-exports/${first.exportId}/download`)).status).toBe(401);
    });
  });
  ```

  ```bash
  pnpm --filter api exec jest --config ./test/jest-e2e.json test/grade-export-list.e2e-spec.ts
  ```

  Expected: **RED** — both routes answer 404.

- [ ] **Step 2: GREEN.** Create `grade-export-query.service.ts`:

  ```ts
  import { Injectable, NotFoundException } from '@nestjs/common';
  import { InjectDataSource } from '@nestjs/typeorm';
  import { DataSource } from 'typeorm';
  import { ExamSessionService } from '../exam-session/exam-session.service';
  import { StorageService } from '../storage/storage.service';
  import { MSG } from './grade-export.messages';

  export interface ExportListItem {
    id: string;
    exportedAt: string | null;
    sheetName: string | null;
    firstDataRow: number | null;
    mssvColumn: string;
    scoreColumn: string;
    reasonColumn: string | null;
    deliverableName: string | null;
    roundingStepHundredths: number;
    written: number;
    /** Ô trống + ô giữ nguyên. */
    blank: number;
    unmatched: number;
    overwritten: number;
    decreased: number;
    decreaseConfirmedBy: string | null;
    exportedByName: string;
    templateFileName: string | null;
    outputFileName: string | null;
  }

  /** Đọc lại các lượt xuất của một phiên và ký URL tải file của chúng. Quyền sở hữu phiên do người gọi kiểm trước. */
  @Injectable()
  export class GradeExportQueryService {
    constructor(
      @InjectDataSource() private readonly ds: DataSource,
      private readonly storage: StorageService,
      private readonly sessions: ExamSessionService,
    ) {}

    async list(sessionId: string): Promise<ExportListItem[]> {
      const rows: Record<string, unknown>[] = await this.ds.query(
        `SELECT e.id, e.exported_at, e.sheet_name, e.first_data_row, e.mssv_column, e.score_column, e.reason_column,
                d.required_filename AS deliverable_name, e.rounding_step_hundredths, e.written_count, e.blank_count,
                e.unmatched_mssv_count, e.overwrite_count, e.decrease_count, c.name AS confirmed_by_name,
                a.name AS exported_by_name, e.template_file_name, e.output_file_name
           FROM examcollect.grade_export e
           JOIN examcollect.account a ON a.id = e.exported_by
           LEFT JOIN examcollect.account c ON c.id = e.decrease_confirmed_by
           LEFT JOIN examcollect.required_deliverable d ON d.id = e.required_deliverable_id
          WHERE e.exam_session_id = $1
          ORDER BY e.exported_at DESC NULLS LAST, e.id DESC`,
        [sessionId],
      );
      return rows.map((r) => ({
        id: r.id as string,
        exportedAt: r.exported_at ? (r.exported_at as Date).toISOString() : null,
        sheetName: r.sheet_name as string | null,
        firstDataRow: r.first_data_row as number | null,
        mssvColumn: r.mssv_column as string,
        scoreColumn: r.score_column as string,
        reasonColumn: r.reason_column as string | null,
        deliverableName: r.deliverable_name as string | null,
        roundingStepHundredths: r.rounding_step_hundredths as number,
        written: r.written_count as number,
        blank: r.blank_count as number,
        unmatched: r.unmatched_mssv_count as number,
        overwritten: r.overwrite_count as number,
        decreased: r.decrease_count as number,
        decreaseConfirmedBy: r.confirmed_by_name as string | null,
        exportedByName: r.exported_by_name as string,
        templateFileName: r.template_file_name as string | null,
        outputFileName: r.output_file_name as string | null,
      }));
    }

    /** 404 khi không có lượt; 403 khi không phải chủ phiên (qua `findEntityForOwner`). */
    async download(exportId: string, teacherId: string): Promise<{ downloadUrl: string; fileName: string }> {
      const [row]: { exam_session_id: string; output_storage_key: string | null; output_file_name: string | null }[] = await this.ds.query(
        `SELECT exam_session_id, output_storage_key, output_file_name FROM examcollect.grade_export WHERE id = $1`,
        [exportId],
      );
      if (!row) throw new NotFoundException(MSG.exportNotFound);
      await this.sessions.findEntityForOwner(row.exam_session_id, teacherId);
      if (!row.output_storage_key) throw new NotFoundException(MSG.noOutput);
      const fileName = row.output_file_name ?? 'so-diem.xlsx';
      const { downloadUrl } = await this.storage.generateDownloadUrl(row.output_storage_key, { filename: fileName });
      return { downloadUrl, fileName };
    }
  }
  ```

  In `grade-export.controller.ts` add `Get` to the `@nestjs/common` import (`import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';`), add `import { GradeExportQueryService } from './grade-export-query.service';` after the write-service import, replace exactly

  ```ts
      private readonly writes: GradeExportWriteService,
      private readonly sessions: ExamSessionService,
    ) {}
  ```

  with

  ```ts
      private readonly writes: GradeExportWriteService,
      private readonly queries: GradeExportQueryService,
      private readonly sessions: ExamSessionService,
    ) {}
  ```

  and add before the final `}` of the class:

  ```ts

    @Get('exam-sessions/:id/grade-exports')
    @Roles('teacher')
    async list(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
      const session = await this.sessions.findEntityForOwner(id, req.user!.sub);
      return this.queries.list(session.id);
    }

    @Get('grade-exports/:id/download')
    @Roles('teacher')
    async download(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
      return this.queries.download(id, req.user!.sub);
    }
  ```

  In `grade-export.module.ts` add `import { GradeExportQueryService } from './grade-export-query.service';` and append `GradeExportQueryService` to `providers`.

  ```bash
  pnpm --filter api exec jest --config ./test/jest-e2e.json test/grade-export-list.e2e-spec.ts
  pnpm --filter api exec tsc --noEmit
  pnpm --filter api exec eslint src/grade-export test/grade-export-list.e2e-spec.ts
  ```

  Expected: **6 passed**; `tsc` clean; eslint 0 errors. If the `exportedAt` ordering is unstable between the two lượt (same second), the `id DESC` tiebreak decides — but `exported_at` is `now()` inside two different transactions, so the second is strictly later; if the test ever flakes, the ledger gets a `Ruling:` line and the assertion is **not** loosened.

- [ ] **Step 3: Regenerate the OpenAPI client — only now, with all six routes present.** The generator fetches from a **running** API (`packages/shared/scripts/generate-api-client.mjs`, default port 4000). Start this package's own server on 4005 from `.env.test` — **never** a bare `node -r dotenv/config …`, which would load `apps/api/.env` and connect to the remote Supabase database:

  ```bash
  cd "C:/Users/Admin/Main/Desktop/HKI 2026-2027/KLTN/CINE/.claude/worktrees/grading-g5-gradebook/apps/api"
  pnpm build
  PORT=4005 DOTENV_CONFIG_PATH=.env.test node -r dotenv/config dist/src/main.js   # run in the background
  until [ "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:4005/api-docs-json)" = "200" ]; do sleep 2; done
  cd ../../packages/shared && API_URL=http://localhost:4005/api-docs-json pnpm generate:api-client
  ```

  Expected: `Wrote packages/shared/src/api/schema.d.ts`. Stop the server (`TaskStop`). Then:

  ```bash
  grep -c "grade-exports" packages/shared/src/api/schema.d.ts
  pnpm --filter web exec tsc --noEmit
  ```

  Expected: the count is at least 6 paths (`template-upload`, `inspect`, `preview`, the bare `POST`/`GET`, `download`); `tsc` shows only the 7 known `read-workbook.test.ts` lines. The startup command is the one recorded and tried in `docs/superpowers/plans/2026-09-29-g2-g5-parallel-execution.md` §2.

- [ ] **Step 4: commit.** Title: `feat(grade-export): liệt kê các lượt xuất, tải file đã ghi; sinh lại schema`. Commit the regenerated `schema.d.ts` **in this commit** — later web tasks import types from it.


---

### Task 12: the web API layer, the hooks, and the pure view helpers

**Files:** create `apps/web/src/lib/api/grade-export.ts`, `apps/web/src/hooks/useGradeExport.ts`, `apps/web/src/lib/grade-export-view.ts`, `apps/web/src/lib/grade-export-view.test.ts`; modify `apps/web/src/lib/grading-export.ts`.

**Interfaces**
- Consumes: the regenerated `packages/shared/src/api/schema.d.ts` (Task 11), `apiClient`, `csvField` (made exported here), `gradingCsvFilename`, `formatVnHundredths`.
- Produces:
  - `lib/api/grade-export.ts`: the types mirroring the server (`InspectResponse`, `InspectGrid`, `PlanRequest`, `WriteRequest`, `PlanResponse`, `PlanRowView`, `NotInFileView`, `WriteResponse`, `ExportListItem`, `Cause`, `CauseTally`, `BlankReason`, `RowAction`, `Direction`), and `uploadTemplate`, `inspectTemplate`, `previewExport`, `writeExport`, `listExports`, `getExportDownload`.
  - `hooks/useGradeExport.ts`: `gradeExportsKey`, `useGradeExports`, `useUploadTemplate`, `useInspectTemplate`, `usePreviewExport`, `useWriteExport`, `useExportDownload`.
  - `lib/grade-export-view.ts`: `MAX_TEMPLATE_BYTES`, `GRID_ROWS` (kept here so a pure test never loads the API client), `scoreText`, `ROUNDING_OPTIONS`, `ACTION_LABEL`, `causeText`, `causesText`, `directionText`, `ROW_FILTER_LABEL`, `matchesFilter`, `countFilters`, `blankReportCsv`, `blankReportFilename`, `validateUpload`, `ColumnChoice`, `EMPTY_CHOICE`, `columnsReady`, `toPlanBase`, `sampledOverwriteCount`, `canWriteNow`.
  - `csvField` exported from `lib/grading-export.ts` (spec D24).

- [ ] **Step 1: The one-word change.** In `apps/web/src/lib/grading-export.ts` replace exactly

  ```ts
  function csvField(value: string): string {
  ```

  with

  ```ts
  export function csvField(value: string): string {
  ```

  (The formula-neutralising guard `FORMULA_LEADING` stays in one place — a security function must not have two copies.)

- [ ] **Step 2: The API module.** Create `apps/web/src/lib/api/grade-export.ts`:

  ```ts
  import { apiClient } from '@/lib/api-client';

  /** Mirrors `apps/api/src/grade-export/` — spec `2026-09-29-gradebook-export-design.md` §4.5-4.6. */
  export type BlankReason = 'absent' | 'not_finished' | 'ungradable' | 'flagged';
  export type RowAction = 'write' | 'blank' | 'kept' | 'unmatched' | 'duplicate' | 'skipped_formula' | 'skipped_merged';
  export type Direction = 'up' | 'down' | 'same' | 'new';
  export type Cause =
    | { kind: 'rule'; ruleKey: string; ruleName: string | null; delta: number }
    | { kind: 'manual_score' }
    | { kind: 'review' }
    | { kind: 'rounding' }
    | { kind: 'unknown' };

  export interface GridCell {
    text: string;
    kind: 'empty' | 'text' | 'number';
    formula: boolean;
  }
  export interface InspectGrid {
    name: string;
    rowCount: number;
    columnCount: number;
    protected: boolean;
    fromRow: number;
    columns: string[];
    rows: { row: number; cells: GridCell[] }[];
    hasMore: boolean;
  }
  export interface InspectResponse {
    templateId: string;
    fileSizeBytes: number;
    sheets: { name: string; hidden: boolean }[];
    deliverables: { id: string; requiredFilename: string }[];
    sheet: InspectGrid | null;
  }
  export interface InspectRequest {
    templateId: string;
    sheetName?: string;
    fromRow?: number;
  }

  export interface PlanRequest {
    templateId: string;
    sheetName: string;
    firstDataRow: number;
    mssvColumn: string;
    scoreColumn: string;
    reasonColumn?: string;
    deliverableId?: string;
    roundingStepHundredths: number;
  }
  export interface WriteRequest extends PlanRequest {
    expectedDigest: string;
    templateFileName: string;
    overwriteExisting?: boolean;
    confirmDecreases?: boolean;
  }

  export interface PlanRowView {
    row: number;
    mssvInFile: string;
    studentMssv: string | null;
    studentName: string | null;
    action: RowAction;
    /** Chuỗi thập phân ("7.25"); định dạng dấu phẩy ở `scoreText`. */
    systemScore: string | null;
    writtenScore: string | null;
    blankReason: BlankReason | null;
    blankLabel: string | null;
    previousScore: string | null;
    direction: Direction | null;
    causes: Cause[];
    note: string | null;
  }
  export interface NotInFileView {
    mssv: string;
    name: string;
    blankReason: BlankReason | null;
    blankLabel: string | null;
    score: string | null;
  }
  export interface CauseTally {
    kind: Cause['kind'];
    ruleKey: string | null;
    ruleName: string | null;
    students: number;
  }
  export interface ChangesSummary {
    previousExports: number;
    up: number;
    down: number;
    same: number;
    new: number;
    downByCause: CauseTally[];
    upByCause: CauseTally[];
  }
  export interface PlanResponse {
    digest: string;
    deliverableId: string | null;
    roundingStepHundredths: number;
    summary: { write: number; blank: number; kept: number; unmatched: number; duplicates: number; skipped: number; ignoredEmpty: number; notInFile: number };
    overwrite: { score: number; reason: number };
    changes: ChangesSummary | null;
    blockers: string[];
    canWrite: boolean;
    rows: PlanRowView[];
    notInFile: NotInFileView[];
  }
  export interface WriteResponse {
    exportId: string;
    fileName: string;
    downloadUrl: string;
    summary: { written: number; blank: number; kept: number; unmatched: number; skipped: number; overwritten: number; decreased: number };
    blank: { row: number; mssv: string; name: string; reason: BlankReason; label: string; kept: boolean }[];
  }
  export interface ExportListItem {
    id: string;
    exportedAt: string | null;
    sheetName: string | null;
    firstDataRow: number | null;
    mssvColumn: string;
    scoreColumn: string;
    reasonColumn: string | null;
    deliverableName: string | null;
    roundingStepHundredths: number;
    written: number;
    blank: number;
    unmatched: number;
    overwritten: number;
    decreased: number;
    decreaseConfirmedBy: string | null;
    exportedByName: string;
    templateFileName: string | null;
    outputFileName: string | null;
  }

  function fail(error: unknown, response: Response): Error {
    const body = error as { message?: string | string[] } | undefined;
    const message = Array.isArray(body?.message) ? body!.message.join('; ') : body?.message;
    return new Error(message ?? `Yêu cầu thất bại (HTTP ${response.status})`);
  }

  /**
   * Xin URL ký, `PUT` byte THẲNG lên storage rồi trả `templateId` — file không đi qua NestJS (CLAUDE.md Security rule 5;
   * cùng đường `uploadExamMaterial` đi). Chưa có dòng DB nào cho tới khi xuất.
   */
  export async function uploadTemplate(sessionId: string, file: File): Promise<string> {
    const minted = await apiClient.POST('/exam-sessions/{id}/grade-exports/template-upload', {
      params: { path: { id: sessionId } },
      body: { fileName: file.name, fileSize: file.size },
    });
    if (minted.error || !minted.response.ok) throw fail(minted.error, minted.response);
    const { templateId, uploadUrl } = minted.data as unknown as { templateId: string; uploadUrl: string };
    const put = await fetch(uploadUrl, {
      method: 'PUT',
      body: file,
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
    });
    if (!put.ok) throw new Error(`Không tải được file lên kho lưu trữ (HTTP ${put.status}).`);
    return templateId;
  }

  export async function inspectTemplate(sessionId: string, body: InspectRequest): Promise<InspectResponse> {
    const { data, error, response } = await apiClient.POST('/exam-sessions/{id}/grade-exports/inspect', {
      params: { path: { id: sessionId } },
      body,
    });
    if (error || !response.ok) throw fail(error, response);
    return data as unknown as InspectResponse;
  }

  export async function previewExport(sessionId: string, body: PlanRequest): Promise<PlanResponse> {
    const { data, error, response } = await apiClient.POST('/exam-sessions/{id}/grade-exports/preview', {
      params: { path: { id: sessionId } },
      body,
    });
    if (error || !response.ok) throw fail(error, response);
    return data as unknown as PlanResponse;
  }

  export async function writeExport(sessionId: string, body: WriteRequest): Promise<WriteResponse> {
    const { data, error, response } = await apiClient.POST('/exam-sessions/{id}/grade-exports', {
      params: { path: { id: sessionId } },
      body,
    });
    if (error || !response.ok) throw fail(error, response);
    return data as unknown as WriteResponse;
  }

  export async function listExports(sessionId: string): Promise<ExportListItem[]> {
    const { data, error, response } = await apiClient.GET('/exam-sessions/{id}/grade-exports', {
      params: { path: { id: sessionId } },
    });
    if (error || !response.ok) throw fail(error, response);
    return data as unknown as ExportListItem[];
  }

  export async function getExportDownload(exportId: string): Promise<{ downloadUrl: string; fileName: string }> {
    const { data, error, response } = await apiClient.GET('/grade-exports/{id}/download', {
      params: { path: { id: exportId } },
    });
    if (error || !response.ok) throw fail(error, response);
    return data as unknown as { downloadUrl: string; fileName: string };
  }
  ```

  If `tsc` rejects a request `body`, the regenerated schema disagrees with a DTO — redo Task 11 Step 3 **before** adding a cast. Cast only the *response* (`as unknown as …`), as the sibling API modules do.

- [ ] **Step 3: The hooks.** Create `apps/web/src/hooks/useGradeExport.ts`:

  ```ts
  'use client';

  import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
  import {
    getExportDownload,
    inspectTemplate,
    listExports,
    previewExport,
    uploadTemplate,
    writeExport,
    type InspectRequest,
    type PlanRequest,
    type WriteRequest,
  } from '@/lib/api/grade-export';

  export const gradeExportsKey = (sessionId: string | undefined) => ['exam-sessions', sessionId, 'grade-exports'] as const;

  export function useGradeExports(sessionId: string | undefined) {
    return useQuery({
      queryKey: gradeExportsKey(sessionId),
      queryFn: () => listExports(sessionId!),
      enabled: Boolean(sessionId),
    });
  }

  export function useUploadTemplate(sessionId: string) {
    return useMutation({ mutationFn: (file: File) => uploadTemplate(sessionId, file) });
  }

  /** Mutation, không phải query: đối số đổi theo từng thao tác (trang tính, trang lưới) và không nên được nhớ. */
  export function useInspectTemplate(sessionId: string) {
    return useMutation({ mutationFn: (body: InspectRequest) => inspectTemplate(sessionId, body) });
  }

  export function usePreviewExport(sessionId: string) {
    return useMutation({ mutationFn: (body: PlanRequest) => previewExport(sessionId, body) });
  }

  export function useWriteExport(sessionId: string) {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (body: WriteRequest) => writeExport(sessionId, body),
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: gradeExportsKey(sessionId) });
      },
    });
  }

  export function useExportDownload() {
    return useMutation({ mutationFn: (exportId: string) => getExportDownload(exportId) });
  }
  ```

- [ ] **Step 4: RED — the view helpers.** Create `apps/web/src/lib/grade-export-view.test.ts`:

  ```ts
  import { describe, expect, it } from 'vitest';
  import type { GridCell, InspectGrid, PlanResponse, PlanRowView } from './api/grade-export';
  import {
    ACTION_LABEL, EMPTY_CHOICE, ROUNDING_OPTIONS, blankReportCsv, blankReportFilename, canWriteNow, causeText, causeTallyText, causesText, columnsReady,
    countFilters, directionText, matchesFilter, roundingText, sampledOverwriteCount, scoreText, toPlanBase, validateUpload, type ColumnChoice,
  } from './grade-export-view';

  const row = (over: Partial<PlanRowView> = {}): PlanRowView => ({
    row: 3, mssvInFile: '20120001', studentMssv: '20120001', studentName: 'Nguyễn Văn An', action: 'write', systemScore: '7.25', writtenScore: '7.50',
    blankReason: null, blankLabel: null, previousScore: null, direction: null, causes: [], note: null, ...over,
  });
  const plan = (over: Partial<PlanResponse> = {}): PlanResponse => ({
    digest: 'd'.repeat(64), deliverableId: null, roundingStepHundredths: 50,
    summary: { write: 1, blank: 0, kept: 0, unmatched: 0, duplicates: 0, skipped: 0, ignoredEmpty: 0, notInFile: 0 },
    overwrite: { score: 0, reason: 0 }, changes: null, blockers: [], canWrite: true, rows: [row()], notInFile: [], ...over,
  });

  describe('scoreText — a decimal STRING becomes a Vietnamese number, without a float', () => {
    it.each([['7.25', '7,25'], ['8.50', '8,5'], ['7.00', '7,0'], ['0.05', '0,05'], ['10', '10,0'], ['7.5', '7,5']])('%s → %s', (input, out) => {
      expect(scoreText(input)).toBe(out);
    });
    it('null is a dash, never 0; something that is not a score is shown as it came', () => {
      expect(scoreText(null)).toBe('—');
      expect(scoreText('abc')).toBe('abc');
    });
  });

  describe('rounding options (spec D9)', () => {
    it('offers exact / 0,1 / 0,25 / 0,5 and preselects none', () => {
      expect(ROUNDING_OPTIONS.map((o) => [o.value, o.label])).toEqual([[1, 'Không làm tròn (giữ 2 chữ số lẻ)'], [10, '0,1'], [25, '0,25'], [50, '0,5']]);
    });
  });

  describe('roundingText — how a step is said in a list of past exports', () => {
    it('exact is "Không làm tròn", the others "Làm tròn <step>"', () => {
      expect(roundingText(1)).toBe('Không làm tròn');
      expect(roundingText(10)).toBe('Làm tròn 0,1');
      expect(roundingText(25)).toBe('Làm tròn 0,25');
      expect(roundingText(50)).toBe('Làm tròn 0,5');
    });
  });

  describe('words for what happens to a row — every state has words, not just a colour', () => {
    it('labels every action', () => {
      expect(ACTION_LABEL).toEqual({
        write: 'Sẽ ghi', blank: 'Để trống', kept: 'Giữ nguyên ô', unmatched: 'Không khớp', duplicate: 'MSSV trùng',
        skipped_formula: 'Ô có công thức', skipped_merged: 'Ô gộp',
      });
    });
    it('names a cause in Vietnamese', () => {
      expect(causeText({ kind: 'rule', ruleKey: 'sai_bien', ruleName: 'Sai biên', delta: 100 })).toBe('luật Sai biên');
      expect(causeText({ kind: 'rule', ruleKey: 'sai_bien', ruleName: null, delta: 100 })).toBe('luật sai_bien');
      expect(causeText({ kind: 'manual_score' })).toBe('chấm tay');
      expect(causeText({ kind: 'review' })).toBe('duyệt lại bài tự luận');
      expect(causeText({ kind: 'rounding' })).toBe('chỉ do đổi bước làm tròn');
      expect(causeText({ kind: 'unknown' })).toBe('chưa rõ nguyên nhân');
      expect(causesText([{ kind: 'manual_score' }, { kind: 'rounding' }])).toBe('chấm tay, chỉ do đổi bước làm tròn');
    });
    it('a tally of causes reads "cause (N bài)"', () => {
      expect(causeTallyText({ kind: 'rule', ruleKey: 'sai_bien', ruleName: 'Sai biên', students: 2 })).toBe('luật Sai biên (2 bài)');
      expect(causeTallyText({ kind: 'rule', ruleKey: 'sai_bien', ruleName: null, students: 1 })).toBe('luật sai_bien (1 bài)');
      expect(causeTallyText({ kind: 'manual_score', ruleKey: null, ruleName: null, students: 1 })).toBe('chấm tay (1 bài)');
      expect(causeTallyText({ kind: 'rounding', ruleKey: null, ruleName: null, students: 3 })).toBe('chỉ do đổi bước làm tròn (3 bài)');
    });
    it('says the direction with an arrow AND words, what was there before, and why (spec §3.6)', () => {
      expect(directionText(row({ direction: 'down', previousScore: '7.50', causes: [{ kind: 'rule', ruleKey: 'a', ruleName: 'Sai biên', delta: 50 }] })))
        .toBe('↓ Giảm — trước đã ghi 7,5, do luật Sai biên');
      expect(directionText(row({ direction: 'up', previousScore: '7.00' }))).toBe('↑ Tăng — trước đã ghi 7,0');
      expect(directionText(row({ direction: 'same' }))).toBe('Không đổi so với lần ghi trước');
      expect(directionText(row({ direction: 'new' }))).toBe('Mới — chưa từng ghi');
      expect(directionText(row({ direction: null }))).toBe('');
    });
  });

  describe('row filters', () => {
    const rows = [
      row({ row: 3 }),
      row({ row: 4, action: 'write', direction: 'down' }),
      row({ row: 5, action: 'blank', blankReason: 'absent' }),
      row({ row: 6, action: 'kept', blankReason: 'flagged' }),
      row({ row: 7, action: 'unmatched' }),
      row({ row: 8, action: 'duplicate' }),
      row({ row: 9, action: 'skipped_formula' }),
    ];
    it('write / blank / problem / changed / all', () => {
      const pick = (f: Parameters<typeof matchesFilter>[1]) => rows.filter((r) => matchesFilter(r, f)).map((r) => r.row);
      expect(pick('all')).toEqual([3, 4, 5, 6, 7, 8, 9]);
      expect(pick('write')).toEqual([3, 4]);
      expect(pick('blank')).toEqual([5, 6]);
      expect(pick('problem')).toEqual([7, 8, 9]);
      expect(pick('changed')).toEqual([4]);
    });
    it('counts them for the chips', () => {
      expect(countFilters(rows)).toEqual({ all: 7, write: 2, blank: 2, problem: 3, changed: 1 });
    });
  });

  describe('the blank report (spec D14) — CSV, grouped by reason, safe against formulas', () => {
    const p = plan({
      rows: [
        row({ row: 9, action: 'blank', studentMssv: 'SV000009', studentName: 'Vũ Thị Hà', blankReason: 'flagged', blankLabel: 'Đang chờ giảng viên duyệt' }),
        row({ row: 5, action: 'blank', studentMssv: 'SV000005', studentName: '=HYPERLINK("http://x")', blankReason: 'absent', blankLabel: 'Vắng — không có bài nộp' }),
        row({ row: 6, action: 'kept', studentMssv: 'SV000006', studentName: 'Trần, Văn B', blankReason: 'flagged', blankLabel: 'Đang chờ giảng viên duyệt' }),
        row({ row: 3 }),
      ],
      notInFile: [
        { mssv: 'SV000001', name: 'Có điểm', blankReason: null, blankLabel: null, score: '8.00' },
        { mssv: 'SV000002', name: 'Không dòng', blankReason: 'absent', blankLabel: 'Vắng — không có bài nộp', score: null },
      ],
    });
    const lines = () => blankReportCsv(p).replace(/^﻿/, '').trimEnd().split('\r\n');

    it('starts with a BOM (Excel reads UTF-8 names right) and a header', () => {
      expect(blankReportCsv(p).startsWith('﻿')).toBe(true);
      expect(lines()[0]).toBe('Dòng,MSSV,Họ tên,Lý do ô trống,Ghi chú');
    });
    it('lists blank and kept rows plus students with no row in the file — not the ones that have a score', () => {
      const body = lines().slice(1).join('\n');
      expect(body).toContain('SV000005');
      expect(body).toContain('SV000006');
      expect(body).toContain('SV000009');
      expect(body).toContain('SV000002,');
      expect(body).not.toContain('SV000001');
      expect(body).not.toContain('20120001');
    });
    it('groups by reason (absent first) and then by MSSV', () => {
      expect(lines().slice(1).map((l) => l.split(',')[1])).toEqual(['SV000002', 'SV000005', 'SV000006', 'SV000009']);
    });
    it('says why each row is there', () => {
      expect(lines().join('\n')).toContain('Giữ nguyên ô điểm đã ghi lần trước');
      expect(lines().join('\n')).toContain('Không có dòng trong file');
    });
    it('neutralises a leading formula character and quotes a comma (CWE-1236)', () => {
      const text = lines().join('\n');
      expect(text).toContain(`"'=HYPERLINK(""http://x"")"`);
      expect(text).toContain('"Trần, Văn B"');
    });
    it('the file name is built like the existing CSV export, with its own prefix', () => {
      expect(blankReportFilename('Giữa kỳ N01', 'GK-N01', new Date(2026, 8, 29))).toBe('o-trong-giua-ky-n01-2026-09-29.csv');
    });
  });

  describe('validateUpload — the same rules the server enforces, reported early', () => {
    it('accepts a small .xlsx', () => {
      expect(validateUpload({ name: 'So-diem.XLSX', size: 1000 })).toBeNull();
    });
    it('refuses .csv / .xls with the sentence that says what to do', () => {
      const message = 'Chỉ nhận file .xlsx. Nếu sổ điểm của bạn là .csv hoặc .xls, hãy mở bằng Excel rồi lưu lại thành .xlsx.';
      expect(validateUpload({ name: 'a.csv', size: 10 })).toBe(message);
      expect(validateUpload({ name: 'a.xls', size: 10 })).toBe(message);
    });
    it('refuses over 5 MB and empty', () => {
      expect(validateUpload({ name: 'a.xlsx', size: 5 * 1024 * 1024 + 1 })).toBe('File quá lớn (giới hạn 5 MB).');
      expect(validateUpload({ name: 'a.xlsx', size: 0 })).toBe('File rỗng.');
    });
  });

  describe('column choice — nothing is preselected (spec D5, rule 9)', () => {
    const ready: ColumnChoice = { sheetName: 'S', firstDataRow: 3, mssvColumn: 'B', scoreColumn: 'D', reasonColumn: '', deliverableId: '' };
    it('the empty choice has no column and no row', () => {
      expect(EMPTY_CHOICE).toEqual({ sheetName: '', firstDataRow: null, mssvColumn: '', scoreColumn: '', reasonColumn: '', deliverableId: '' });
    });
    it('says what is still missing, in words', () => {
      expect(columnsReady(EMPTY_CHOICE, false)).toEqual({ ok: false, hints: ['trang tính', 'cột MSSV', 'cột điểm', 'dòng bắt đầu dữ liệu'] });
      expect(columnsReady({ ...ready, deliverableId: '' }, true).hints).toEqual(['yêu cầu nộp']);
    });
    it('is ready when the essentials are chosen; the reason column and the deliverable are optional', () => {
      expect(columnsReady(ready, false)).toEqual({ ok: true, hints: [] });
    });
    it('refuses the same column twice', () => {
      expect(columnsReady({ ...ready, scoreColumn: 'B' }, false)).toEqual({ ok: false, hints: ['ba cột phải khác nhau'] });
      expect(columnsReady({ ...ready, reasonColumn: 'D' }, false).ok).toBe(false);
    });
    it('builds the request base without the empty optionals', () => {
      expect(toPlanBase('t1', ready)).toEqual({ templateId: 't1', sheetName: 'S', firstDataRow: 3, mssvColumn: 'B', scoreColumn: 'D' });
      expect(toPlanBase('t1', { ...ready, reasonColumn: 'E', deliverableId: 'd1' })).toEqual({
        templateId: 't1', sheetName: 'S', firstDataRow: 3, mssvColumn: 'B', scoreColumn: 'D', reasonColumn: 'E', deliverableId: 'd1',
      });
    });
  });

  describe('sampledOverwriteCount — only what the grid on screen shows', () => {
    const cell = (kind: GridCell['kind'], text = ''): GridCell => ({ kind, text, formula: false });
    const grid: InspectGrid = {
      name: 'S', rowCount: 5, columnCount: 3, protected: false, fromRow: 1, hasMore: false, columns: ['A', 'B', 'C'],
      rows: [
        { row: 1, cells: [cell('text', 'tựa đề'), cell('empty'), cell('empty')] },
        { row: 2, cells: [cell('text', 'STT'), cell('text', 'MSSV'), cell('text', 'Điểm')] },
        { row: 3, cells: [cell('number', '1'), cell('text', '20120001'), cell('number', '7')] },
        { row: 4, cells: [cell('number', '2'), cell('text', '20120002'), cell('empty')] },
      ],
    };
    it('counts valued cells of the column from the first data row down', () => {
      expect(sampledOverwriteCount(grid, 'C', 3)).toBe(1);
      expect(sampledOverwriteCount(grid, 'C', 2)).toBe(2); // the header cell is a value too when the start row is set above it
      expect(sampledOverwriteCount(grid, 'B', 3)).toBe(2);
    });
    it('is zero for an unknown column or an empty one', () => {
      expect(sampledOverwriteCount(grid, 'Z', 3)).toBe(0);
      expect(sampledOverwriteCount(grid, '', 3)).toBe(0);
    });
  });

  describe('canWriteNow — every reason the button is off is written down', () => {
    it('needs a rounding choice and a plan', () => {
      expect(canWriteNow({ plan: null, roundingStep: null, overwriteAck: false, decreaseAck: false })).toEqual({ enabled: false, reasons: ['Chọn cách làm tròn.'] });
      expect(canWriteNow({ plan: null, roundingStep: 10, overwriteAck: false, decreaseAck: false })).toEqual({ enabled: false, reasons: ['Đang xem trước…'] });
    });
    it('a blocker switches it off and is quoted verbatim', () => {
      const out = canWriteNow({ plan: plan({ blockers: ['Trang tính đang được bảo vệ.'], canWrite: false }), roundingStep: 10, overwriteAck: true, decreaseAck: true });
      expect(out).toEqual({ enabled: false, reasons: ['Trang tính đang được bảo vệ.'] });
    });
    it('an overwrite and a decrease each need their own tick', () => {
      const p = plan({ overwrite: { score: 2, reason: 1 }, changes: { previousExports: 1, up: 0, down: 2, same: 0, new: 0, downByCause: [], upByCause: [] } });
      expect(canWriteNow({ plan: p, roundingStep: 10, overwriteAck: false, decreaseAck: false }).reasons).toEqual([
        'Cần đồng ý ghi đè 3 ô đã có giá trị.',
        'Cần xác nhận 2 bài bị giảm điểm.',
      ]);
      expect(canWriteNow({ plan: p, roundingStep: 10, overwriteAck: true, decreaseAck: false }).enabled).toBe(false);
      expect(canWriteNow({ plan: p, roundingStep: 10, overwriteAck: true, decreaseAck: true })).toEqual({ enabled: true, reasons: [] });
    });
    it('a clean plan can be written', () => {
      expect(canWriteNow({ plan: plan(), roundingStep: 50, overwriteAck: false, decreaseAck: false })).toEqual({ enabled: true, reasons: [] });
    });
  });
  ```

  ```bash
  pnpm --filter web exec vitest run src/lib/grade-export-view.test.ts
  ```

  Expected: **RED** — `Failed to resolve import "./grade-export-view"`.

- [ ] **Step 5: GREEN.** Create `apps/web/src/lib/grade-export-view.ts`:

  ```ts
  import { formatVnHundredths } from '@/lib/format';
  import type { BlankReason, Cause, CauseTally, InspectGrid, PlanRequest, PlanResponse, PlanRowView, RowAction } from '@/lib/api/grade-export';
  import { csvField, gradingCsvFilename } from '@/lib/grading-export';

  /**
   * Cùng con số với server (`MAX_TEMPLATE_BYTES` và `GRID_ROWS` ở `apps/api/src/grade-export/grade-export.types.ts`). Đặt ở
   * đây, không ở `lib/api/grade-export.ts`, để một test thuần không phải nạp `api-client`.
   */
  export const MAX_TEMPLATE_BYTES = 5 * 1024 * 1024;
  /** Số dòng của một trang lưới xem trước. */
  export const GRID_ROWS = 40;

  const SCORE = /^(\d{1,4})(?:\.(\d{1,2}))?$/;

  /** "7.25" → "7,25", "8.50" → "8,5": chuỗi thập phân của API → chữ hiển thị, không qua số thực để LÀM TOÁN. */
  export function scoreText(score: string | null): string {
    if (score === null) return '—';
    const match = SCORE.exec(score);
    if (!match) return score;
    return formatVnHundredths(Number(match[1]) * 100 + (match[2] ? Number(match[2].padEnd(2, '0')) : 0));
  }

  /** Bốn bước làm tròn (spec D9), nửa lên. Không cái nào được chọn sẵn. */
  export const ROUNDING_OPTIONS = [
    { value: 1, label: 'Không làm tròn (giữ 2 chữ số lẻ)' },
    { value: 10, label: '0,1' },
    { value: 25, label: '0,25' },
    { value: 50, label: '0,5' },
  ] as const;

  export const ACTION_LABEL: Record<RowAction, string> = {
    write: 'Sẽ ghi',
    blank: 'Để trống',
    kept: 'Giữ nguyên ô',
    unmatched: 'Không khớp',
    duplicate: 'MSSV trùng',
    skipped_formula: 'Ô có công thức',
    skipped_merged: 'Ô gộp',
  };

  export function causeText(cause: Cause): string {
    switch (cause.kind) {
      case 'rule':
        return `luật ${cause.ruleName ?? cause.ruleKey}`;
      case 'manual_score':
        return 'chấm tay';
      case 'review':
        return 'duyệt lại bài tự luận';
      case 'rounding':
        return 'chỉ do đổi bước làm tròn';
      case 'unknown':
        return 'chưa rõ nguyên nhân';
    }
  }

  export const causesText = (causes: Cause[]): string => causes.map(causeText).join(', ');

  /** Một dòng của dải "Giảm do / Tăng do": nguyên nhân kèm số bài. */
  export function causeTallyText(c: CauseTally): string {
    const label = c.kind === 'rule' ? `luật ${c.ruleName ?? c.ruleKey}` : causeText({ kind: c.kind } as Cause);
    return `${label} (${c.students} bài)`;
  }

  /** "Không làm tròn" / "Làm tròn 0,5" — cho danh sách lượt xuất trước. */
  export function roundingText(step: number): string {
    const option = ROUNDING_OPTIONS.find((o) => o.value === step);
    return step === 1 || !option ? 'Không làm tròn' : `Làm tròn ${option.label}`;
  }

  /** "↓ Giảm — trước đã ghi 7,5, do luật …": chiều bằng mũi tên VÀ chữ (spec §3.6). */
  export function directionText(row: Pick<PlanRowView, 'direction' | 'previousScore' | 'causes'>): string {
    const because = row.causes.length > 0 ? `, do ${causesText(row.causes)}` : '';
    switch (row.direction) {
      case 'down':
        return `↓ Giảm — trước đã ghi ${scoreText(row.previousScore)}${because}`;
      case 'up':
        return `↑ Tăng — trước đã ghi ${scoreText(row.previousScore)}${because}`;
      case 'same':
        return 'Không đổi so với lần ghi trước';
      case 'new':
        return 'Mới — chưa từng ghi';
      default:
        return '';
    }
  }

  export type RowFilter = 'all' | 'write' | 'blank' | 'problem' | 'changed';
  export const ROW_FILTER_LABEL: Record<RowFilter, string> = {
    all: 'Tất cả',
    write: 'Sẽ ghi',
    blank: 'Để trống',
    problem: 'Cần chú ý',
    changed: 'Có thay đổi',
  };

  export function matchesFilter(row: PlanRowView, filter: RowFilter): boolean {
    switch (filter) {
      case 'all':
        return true;
      case 'write':
        return row.action === 'write';
      case 'blank':
        return row.action === 'blank' || row.action === 'kept';
      case 'problem':
        return row.action === 'unmatched' || row.action === 'duplicate' || row.action === 'skipped_formula' || row.action === 'skipped_merged';
      case 'changed':
        return row.direction === 'up' || row.direction === 'down';
    }
  }

  export function countFilters(rows: PlanRowView[]): Record<RowFilter, number> {
    const filters = Object.keys(ROW_FILTER_LABEL) as RowFilter[];
    return Object.fromEntries(filters.map((f) => [f, rows.filter((r) => matchesFilter(r, f)).length])) as Record<RowFilter, number>;
  }

  // ---------------------------------------------------------------------------------------------- bảng kê ô trống
  const BLANK_ORDER: BlankReason[] = ['absent', 'not_finished', 'ungradable', 'flagged'];
  const REPORT_HEADER = ['Dòng', 'MSSV', 'Họ tên', 'Lý do ô trống', 'Ghi chú'];

  /**
   * Bảng kê ô trống theo lý do (§13.1 luật 5): dòng để trống hoặc giữ nguyên ô, cộng sinh viên KHÔNG có dòng trong file
   * mà cũng không có điểm. `﻿` ở đầu để Excel đọc tên tiếng Việt đúng; `csvField` chặn công thức (CWE-1236) —
   * họ tên là chữ người dùng nhập, không phải hằng của hệ thống.
   */
  export function blankReportCsv(plan: Pick<PlanResponse, 'rows' | 'notInFile'>): string {
    const entries: { order: number; mssv: string; cols: string[] }[] = [];
    for (const r of plan.rows) {
      if (r.action !== 'blank' && r.action !== 'kept') continue;
      entries.push({
        order: BLANK_ORDER.indexOf(r.blankReason!),
        mssv: r.studentMssv ?? '',
        cols: [String(r.row), r.studentMssv ?? '', r.studentName ?? '', r.blankLabel ?? '', r.action === 'kept' ? 'Giữ nguyên ô điểm đã ghi lần trước' : ''],
      });
    }
    for (const s of plan.notInFile) {
      if (s.blankReason === null) continue;
      entries.push({ order: BLANK_ORDER.indexOf(s.blankReason), mssv: s.mssv, cols: ['', s.mssv, s.name, s.blankLabel ?? '', 'Không có dòng trong file'] });
    }
    entries.sort((a, b) => a.order - b.order || (a.mssv < b.mssv ? -1 : a.mssv > b.mssv ? 1 : 0));
    const lines = [REPORT_HEADER, ...entries.map((e) => e.cols)].map((cols) => cols.map(csvField).join(','));
    return `﻿${lines.join('\r\n')}\r\n`;
  }

  export const hasBlankReport = (plan: Pick<PlanResponse, 'rows' | 'notInFile'>): boolean =>
    plan.rows.some((r) => r.action === 'blank' || r.action === 'kept') || plan.notInFile.some((s) => s.blankReason !== null);

  export const blankReportFilename = (sessionName: string, sessionCode: string, now = new Date()): string =>
    gradingCsvFilename(sessionName, sessionCode, now).replace(/^diem-/, 'o-trong-');

  // ---------------------------------------------------------------------------------------------- tải lên và chọn cột
  /** Cùng luật với server, báo sớm để giảng viên không phải đợi một vòng mạng. Server vẫn kiểm lại. */
  export function validateUpload(file: { name: string; size: number }): string | null {
    if (!/\.xlsx$/i.test(file.name)) {
      return 'Chỉ nhận file .xlsx. Nếu sổ điểm của bạn là .csv hoặc .xls, hãy mở bằng Excel rồi lưu lại thành .xlsx.';
    }
    if (file.size === 0) return 'File rỗng.';
    if (file.size > MAX_TEMPLATE_BYTES) return 'File quá lớn (giới hạn 5 MB).';
    return null;
  }

  export interface ColumnChoice {
    sheetName: string;
    firstDataRow: number | null;
    mssvColumn: string;
    scoreColumn: string;
    reasonColumn: string;
    deliverableId: string;
  }

  /** Không cột nào, không dòng nào được chọn sẵn — kể cả khi tiêu đề ghi "MSSV" (rule 9). */
  export const EMPTY_CHOICE: ColumnChoice = { sheetName: '', firstDataRow: null, mssvColumn: '', scoreColumn: '', reasonColumn: '', deliverableId: '' };

  export function columnsReady(choice: ColumnChoice, needsDeliverable: boolean): { ok: boolean; hints: string[] } {
    const hints: string[] = [];
    if (!choice.sheetName) hints.push('trang tính');
    if (!choice.mssvColumn) hints.push('cột MSSV');
    if (!choice.scoreColumn) hints.push('cột điểm');
    if (choice.firstDataRow === null || choice.firstDataRow < 1) hints.push('dòng bắt đầu dữ liệu');
    if (needsDeliverable && !choice.deliverableId) hints.push('yêu cầu nộp');
    const chosen = [choice.mssvColumn, choice.scoreColumn, choice.reasonColumn].filter(Boolean);
    if (new Set(chosen).size !== chosen.length) hints.push('ba cột phải khác nhau');
    return { ok: hints.length === 0, hints };
  }

  export type PlanBase = Omit<PlanRequest, 'roundingStepHundredths'>;

  export function toPlanBase(templateId: string, choice: ColumnChoice): PlanBase {
    return {
      templateId,
      sheetName: choice.sheetName,
      firstDataRow: choice.firstDataRow!,
      mssvColumn: choice.mssvColumn,
      scoreColumn: choice.scoreColumn,
      ...(choice.reasonColumn ? { reasonColumn: choice.reasonColumn } : {}),
      ...(choice.deliverableId ? { deliverableId: choice.deliverableId } : {}),
    };
  }

  /** Số ô của cột đã có giá trị TRONG PHẦN LƯỚI ĐANG HIỆN — con số thật do server đếm ở bước sau. */
  export function sampledOverwriteCount(grid: InspectGrid, column: string, firstDataRow: number): number {
    const index = grid.columns.indexOf(column);
    if (index < 0) return 0;
    return grid.rows.filter((r) => r.row >= firstDataRow && r.cells[index]?.kind !== 'empty').length;
  }

  // ---------------------------------------------------------------------------------------------- nút "Ghi vào file"
  export function canWriteNow(input: {
    plan: PlanResponse | null;
    roundingStep: number | null;
    overwriteAck: boolean;
    decreaseAck: boolean;
  }): { enabled: boolean; reasons: string[] } {
    if (input.roundingStep === null) return { enabled: false, reasons: ['Chọn cách làm tròn.'] };
    if (input.plan === null) return { enabled: false, reasons: ['Đang xem trước…'] };
    const reasons: string[] = [...input.plan.blockers];
    const overwrites = input.plan.overwrite.score + input.plan.overwrite.reason;
    if (overwrites > 0 && !input.overwriteAck) reasons.push(`Cần đồng ý ghi đè ${overwrites} ô đã có giá trị.`);
    const down = input.plan.changes?.down ?? 0;
    if (down > 0 && !input.decreaseAck) reasons.push(`Cần xác nhận ${down} bài bị giảm điểm.`);
    return { enabled: reasons.length === 0, reasons };
  }
  ```

  ```bash
  pnpm --filter web exec vitest run src/lib/grade-export-view.test.ts src/lib/grading-export.test.ts
  pnpm --filter web exec tsc --noEmit
  pnpm --filter web exec eslint src/lib/api/grade-export.ts src/hooks/useGradeExport.ts src/lib/grade-export-view.ts src/lib/grade-export-view.test.ts src/lib/grading-export.ts
  ```

  Expected: `grade-export-view` **35 passed**, `grading-export.test.ts` unchanged and green; `tsc` shows only the 7 known `read-workbook.test.ts` lines; eslint 0 errors. If `blankReportFilename` comes out with a different date, remember `gradingCsvFilename` formats **local** time — the test passes `new Date(2026, 8, 29)` (local) on purpose.

- [ ] **Step 6: commit.** Title: `feat(web): lớp API, hook và hàm hiển thị cho ghi điểm vào sổ điểm; xuất csvField`.

---

### Task 13: the two first steps — upload the file, choose the columns

**Files:** create `apps/web/src/app/teacher/grading/export/_components/StepUpload.tsx`, `StepUpload.test.tsx`, `StepColumns.tsx`, `StepColumns.test.tsx`.

**Interfaces**
- Consumes: `useUploadTemplate`, `useInspectTemplate` (Task 12), `validateUpload`, `columnsReady`, `sampledOverwriteCount`, `ColumnChoice` (Task 12), `InspectResponse`, `GRID_ROWS`, `FormField`, `Alert`, `Button`, `Badge`.
- Produces:
  - `StepUpload({ sessionId, onInspected })`, `onInspected({ templateId, fileName, inspect })`.
  - `StepColumns({ inspect, choice, busy, onChange, onSelectSheet, onLoadRows, onNext })` — controlled; the wizard (Task 15) owns the state.

Two rules are pinned by the tests: **nothing is preselected** (every picker starts on its placeholder, the start row is empty), and **a chosen column is marked by colour AND by a word** in the grid header (spec §3.6).

- [ ] **Step 1: RED — `StepUpload.test.tsx`.**

  ```tsx
  import { beforeEach, describe, expect, it, vi } from 'vitest';
  import { fireEvent, render, screen, waitFor } from '@testing-library/react';
  import '@testing-library/jest-dom/vitest';
  import { StepUpload } from './StepUpload';
  import type { InspectResponse } from '@/lib/api/grade-export';

  const uploadAsync = vi.fn();
  const inspectAsync = vi.fn();
  let uploadState: { isPending: boolean; error: Error | null };
  let inspectState: { isPending: boolean; error: Error | null };
  vi.mock('@/hooks/useGradeExport', () => ({
    useUploadTemplate: () => ({ mutateAsync: uploadAsync, ...uploadState }),
    useInspectTemplate: () => ({ mutateAsync: inspectAsync, ...inspectState }),
  }));

  const inspected: InspectResponse = { templateId: 't1', fileSizeBytes: 10, sheets: [{ name: 'S', hidden: false }], deliverables: [], sheet: null };
  const file = (name: string, size = 1000) => new File([new Uint8Array(size)], name);
  const input = () => screen.getByLabelText(/File sổ điểm/);
  const pick = (f: File) => fireEvent.change(input(), { target: { files: [f] } });

  beforeEach(() => {
    uploadAsync.mockReset().mockResolvedValue('t1');
    inspectAsync.mockReset().mockResolvedValue(inspected);
    uploadState = { isPending: false, error: null };
    inspectState = { isPending: false, error: null };
  });

  describe('StepUpload', () => {
    it('says what to bring and that only the chosen cells will be touched', () => {
      render(<StepUpload sessionId="s1" onInspected={vi.fn()} />);
      expect(screen.getByText(/mọi ô khác giữ nguyên/)).toBeInTheDocument();
      expect(input()).toHaveAttribute('accept', expect.stringContaining('.xlsx'));
    });

    it('uploads, then inspects, then hands the result over — in that order', async () => {
      const onInspected = vi.fn();
      render(<StepUpload sessionId="s1" onInspected={onInspected} />);
      const f = file('So-diem N01.xlsx');
      pick(f);
      await waitFor(() => expect(onInspected).toHaveBeenCalledTimes(1));
      expect(uploadAsync).toHaveBeenCalledWith(f);
      expect(inspectAsync).toHaveBeenCalledWith({ templateId: 't1' });
      expect(uploadAsync.mock.invocationCallOrder[0]).toBeLessThan(inspectAsync.mock.invocationCallOrder[0]!);
      expect(onInspected).toHaveBeenCalledWith({ templateId: 't1', fileName: 'So-diem N01.xlsx', inspect: inspected });
    });

    it('a .csv is refused before any request, with the sentence that says how to convert it', () => {
      render(<StepUpload sessionId="s1" onInspected={vi.fn()} />);
      pick(file('so-diem.csv'));
      expect(screen.getByRole('alert')).toHaveTextContent('Chỉ nhận file .xlsx. Nếu sổ điểm của bạn là .csv hoặc .xls, hãy mở bằng Excel rồi lưu lại thành .xlsx.');
      expect(uploadAsync).not.toHaveBeenCalled();
    });

    it('a file over 5 MB is refused before any request', () => {
      render(<StepUpload sessionId="s1" onInspected={vi.fn()} />);
      pick(file('a.xlsx', 5 * 1024 * 1024 + 1));
      expect(screen.getByRole('alert')).toHaveTextContent('File quá lớn (giới hạn 5 MB).');
      expect(uploadAsync).not.toHaveBeenCalled();
    });

    it('does not move on when the upload fails, and shows the server sentence verbatim', async () => {
      uploadAsync.mockRejectedValue(new Error('Không tải được file lên kho lưu trữ (HTTP 403).'));
      uploadState = { isPending: false, error: new Error('Không tải được file lên kho lưu trữ (HTTP 403).') };
      const onInspected = vi.fn();
      render(<StepUpload sessionId="s1" onInspected={onInspected} />);
      pick(file('a.xlsx'));
      await waitFor(() => expect(uploadAsync).toHaveBeenCalled());
      expect(onInspected).not.toHaveBeenCalled();
      expect(screen.getByRole('alert')).toHaveTextContent('Không tải được file lên kho lưu trữ (HTTP 403).');
    });

    it('shows the inspect failure verbatim too (a password-protected file, for instance)', async () => {
      inspectAsync.mockRejectedValue(new Error('File có mật khẩu hoặc là định dạng .xls cũ. Hãy bỏ mật khẩu, mở bằng Excel và lưu lại thành .xlsx.'));
      inspectState = { isPending: false, error: new Error('File có mật khẩu hoặc là định dạng .xls cũ. Hãy bỏ mật khẩu, mở bằng Excel và lưu lại thành .xlsx.') };
      render(<StepUpload sessionId="s1" onInspected={vi.fn()} />);
      pick(file('a.xlsx'));
      await waitFor(() => expect(inspectAsync).toHaveBeenCalled());
      expect(screen.getByRole('alert')).toHaveTextContent('File có mật khẩu');
    });

    it('locks the input while the file is on its way', () => {
      uploadState = { isPending: true, error: null };
      render(<StepUpload sessionId="s1" onInspected={vi.fn()} />);
      expect(input()).toBeDisabled();
      expect(screen.getByText('Đang tải file lên…')).toBeInTheDocument();
    });

    it('choosing nothing (cancelling the dialog) does nothing', () => {
      render(<StepUpload sessionId="s1" onInspected={vi.fn()} />);
      fireEvent.change(input(), { target: { files: [] } });
      expect(uploadAsync).not.toHaveBeenCalled();
    });
  });
  ```

  Create `StepColumns.test.tsx`:

  ```tsx
  import { describe, expect, it, vi } from 'vitest';
  import { fireEvent, render, screen, within } from '@testing-library/react';
  import '@testing-library/jest-dom/vitest';
  import { StepColumns } from './StepColumns';
  import type { GridCell, InspectGrid, InspectResponse } from '@/lib/api/grade-export';
  import { EMPTY_CHOICE, type ColumnChoice } from '@/lib/grade-export-view';

  const cell = (kind: GridCell['kind'], text = '', formula = false): GridCell => ({ kind, text, formula });
  const grid = (over: Partial<InspectGrid> = {}): InspectGrid => ({
    name: 'Bảng điểm', rowCount: 5, columnCount: 5, protected: false, fromRow: 1, hasMore: false, columns: ['A', 'B', 'C', 'D', 'E'],
    rows: [
      { row: 1, cells: [cell('text', 'BẢNG ĐIỂM LỚP N01'), cell('empty'), cell('empty'), cell('empty'), cell('empty')] },
      { row: 2, cells: [cell('text', 'STT'), cell('text', 'MSSV'), cell('text', 'Họ tên'), cell('text', 'Điểm'), cell('text', 'Ghi chú')] },
      { row: 3, cells: [cell('number', '1'), cell('text', '20120001'), cell('text', 'Nguyễn Văn An'), cell('number', '7'), cell('empty')] },
      { row: 4, cells: [cell('number', '2'), cell('text', '20120002'), cell('text', 'Trần Thị Bình'), cell('empty'), cell('empty')] },
      { row: 5, cells: [cell('number', '3'), cell('text', '20120003'), cell('text', 'Lê Văn Cường'), cell('number', '3', true), cell('empty')] },
    ],
    ...over,
  });
  const inspect = (over: Partial<InspectResponse> = {}): InspectResponse => ({
    templateId: 't1', fileSizeBytes: 1, sheets: [{ name: 'Bảng điểm', hidden: false }], deliverables: [], sheet: grid(), ...over,
  });
  const READY: ColumnChoice = { sheetName: 'Bảng điểm', firstDataRow: 3, mssvColumn: 'B', scoreColumn: 'D', reasonColumn: 'E', deliverableId: '' };

  const setup = (props: { inspect?: InspectResponse; choice?: ColumnChoice; busy?: boolean } = {}) => {
    const handlers = { onChange: vi.fn(), onSelectSheet: vi.fn(), onLoadRows: vi.fn(), onNext: vi.fn() };
    render(<StepColumns inspect={props.inspect ?? inspect()} choice={props.choice ?? EMPTY_CHOICE} busy={props.busy ?? false} {...handlers} />);
    return handlers;
  };
  const next = () => screen.getByRole('button', { name: 'Xem trước điểm sẽ ghi' });

  describe('StepColumns — nothing is chosen for the teacher (rule 9)', () => {
    it('every picker starts on its placeholder and the start row is empty, even though row 2 says "MSSV" and "Điểm"', () => {
      setup({ choice: { ...EMPTY_CHOICE, sheetName: 'Bảng điểm' } });
      expect(screen.getByLabelText('Cột MSSV')).toHaveValue('');
      expect(screen.getByLabelText('Cột điểm')).toHaveValue('');
      expect(screen.getByLabelText('Cột lý do ô trống (tuỳ chọn)')).toHaveValue('');
      expect(screen.getByLabelText('Dữ liệu bắt đầu từ dòng số')).toHaveValue(null);
      expect(next()).toBeDisabled();
    });

    it('says what is still missing next to the disabled button', () => {
      setup({ choice: { ...EMPTY_CHOICE, sheetName: 'Bảng điểm' } });
      expect(screen.getByText('Còn thiếu: cột MSSV, cột điểm, dòng bắt đầu dữ liệu.')).toBeInTheDocument();
    });

    it('reports each choice through onChange and nothing else', () => {
      const h = setup({ choice: { ...EMPTY_CHOICE, sheetName: 'Bảng điểm' } });
      fireEvent.change(screen.getByLabelText('Cột MSSV'), { target: { value: 'B' } });
      fireEvent.change(screen.getByLabelText('Cột điểm'), { target: { value: 'D' } });
      fireEvent.change(screen.getByLabelText('Cột lý do ô trống (tuỳ chọn)'), { target: { value: 'E' } });
      fireEvent.change(screen.getByLabelText('Dữ liệu bắt đầu từ dòng số'), { target: { value: '3' } });
      expect(h.onChange.mock.calls).toEqual([[{ mssvColumn: 'B' }], [{ scoreColumn: 'D' }], [{ reasonColumn: 'E' }], [{ firstDataRow: 3 }]]);
    });

    it('a row button sets the start row too', () => {
      const h = setup({ choice: { ...EMPTY_CHOICE, sheetName: 'Bảng điểm' } });
      fireEvent.click(screen.getByRole('button', { name: 'Dữ liệu bắt đầu từ dòng 3' }));
      expect(h.onChange).toHaveBeenCalledWith({ firstDataRow: 3 });
    });
  });

  describe('StepColumns — a chosen column is marked by colour AND by a word (spec §3.6)', () => {
    it('tags the header of each chosen column and marks every cell of it', () => {
      setup({ choice: READY });
      const table = screen.getByRole('table', { name: 'Xem trước file' });
      expect(within(table).getByRole('columnheader', { name: 'B MSSV' })).toHaveAttribute('data-role', 'mssv');
      expect(within(table).getByRole('columnheader', { name: 'D Điểm' })).toHaveAttribute('data-role', 'score');
      expect(within(table).getByRole('columnheader', { name: 'E Lý do' })).toHaveAttribute('data-role', 'reason');
      expect(within(table).getByRole('columnheader', { name: 'A' })).not.toHaveAttribute('data-role');
      expect(within(table).getByText('20120001').closest('td')).toHaveAttribute('data-role', 'mssv');
      expect(within(table).getByText('Nguyễn Văn An').closest('td')).not.toHaveAttribute('data-role');
    });

    it('rows above the start row are dimmed, and the start row is marked', () => {
      setup({ choice: READY });
      const table = screen.getByRole('table', { name: 'Xem trước file' });
      expect(within(table).getByText('BẢNG ĐIỂM LỚP N01').closest('tr')).toHaveAttribute('data-before-data', 'true');
      expect(within(table).getByText('20120001').closest('tr')).toHaveAttribute('data-first-data', 'true');
    });

    it('marks a formula cell so the teacher can see why it will be skipped', () => {
      setup({ choice: READY });
      expect(screen.getByLabelText('ô có công thức')).toBeInTheDocument();
    });
  });

  describe('StepColumns — overwriting is warned about before the last step', () => {
    it('counts the valued cells of the score column in the rows on screen — and says it is only those rows', () => {
      setup({ choice: READY });
      expect(screen.getByText(/Trong phần xem trước, 2 ô của cột D đã có giá trị/)).toBeInTheDocument();
      expect(screen.getByText(/Số ô thật hiện ở bước sau/)).toBeInTheDocument();
    });
    it('says nothing when the chosen column is empty in the rows on screen', () => {
      setup({ choice: { ...READY, scoreColumn: 'E', reasonColumn: '' } });
      expect(screen.queryByText(/đã có giá trị/)).not.toBeInTheDocument();
    });
  });

  describe('StepColumns — protected sheet, next step, paging, sheets, deliverables', () => {
    it('a protected sheet is refused with the server sentence and next stays off', () => {
      setup({ choice: READY, inspect: inspect({ sheet: grid({ protected: true }) }) });
      // `Alert` luôn có role="alert" — cảnh báo ghi đè cũng đang hiện — nên tìm theo chữ, không theo role.
      expect(screen.getByText('Trang tính đang được bảo vệ. Hãy bỏ bảo vệ trong Excel rồi tải lại.')).toBeInTheDocument();
      expect(next()).toBeDisabled();
    });

    it('is ready when the essentials are chosen, and Next hands over', () => {
      const h = setup({ choice: READY });
      expect(next()).toBeEnabled();
      fireEvent.click(next());
      expect(h.onNext).toHaveBeenCalledTimes(1);
    });

    it('the same column twice is refused in words', () => {
      setup({ choice: { ...READY, scoreColumn: 'B' } });
      expect(next()).toBeDisabled();
      expect(screen.getByText('Còn thiếu: ba cột phải khác nhau.')).toBeInTheDocument();
    });

    it('pages the grid: earlier and later rows', () => {
      const h = setup({ choice: READY, inspect: inspect({ sheet: grid({ fromRow: 41, hasMore: true, rowCount: 200 }) }) });
      fireEvent.click(screen.getByRole('button', { name: 'Xem các dòng trước' }));
      fireEvent.click(screen.getByRole('button', { name: 'Xem các dòng tiếp' }));
      expect(h.onLoadRows.mock.calls).toEqual([[1], [46]]); // 41 − 40 → 1 ; 41 + the 5 rows on screen → 46
    });

    it('offers no paging when there is nowhere to go', () => {
      setup({ choice: READY });
      expect(screen.queryByRole('button', { name: 'Xem các dòng trước' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Xem các dòng tiếp' })).not.toBeInTheDocument();
    });

    it('with several sheets the teacher chooses one and no grid is shown until then', () => {
      const h = setup({
        choice: EMPTY_CHOICE,
        inspect: inspect({ sheets: [{ name: 'Bảng điểm', hidden: false }, { name: 'Ghi chú', hidden: true }], sheet: null }),
      });
      expect(screen.getByText('Chọn trang tính để xem nội dung của nó.')).toBeInTheDocument();
      expect(screen.queryByRole('table', { name: 'Xem trước file' })).not.toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Ghi chú (ẩn)' })).toBeInTheDocument();
      fireEvent.change(screen.getByLabelText('Trang tính'), { target: { value: 'Ghi chú' } });
      expect(h.onSelectSheet).toHaveBeenCalledWith('Ghi chú');
    });

    it('asks which deliverable only when the session has more than one — and requires it', () => {
      const one = setup({ choice: READY });
      expect(screen.queryByLabelText('Ghi điểm của yêu cầu nộp')).not.toBeInTheDocument();
      expect(one.onChange).not.toHaveBeenCalled();
    });

    it('with two deliverables the choice is required and each option is a file name', () => {
      const h = setup({
        choice: READY,
        inspect: inspect({ deliverables: [{ id: 'd1', requiredFilename: 'Cau1.docx' }, { id: 'd2', requiredFilename: 'Cau2.docx' }] }),
      });
      expect(screen.getByLabelText('Ghi điểm của yêu cầu nộp')).toHaveValue('');
      expect(next()).toBeDisabled();
      expect(screen.getByText('Còn thiếu: yêu cầu nộp.')).toBeInTheDocument();
      fireEvent.change(screen.getByLabelText('Ghi điểm của yêu cầu nộp'), { target: { value: 'd2' } });
      expect(h.onChange).toHaveBeenCalledWith({ deliverableId: 'd2' });
    });

    it('is locked while the wizard is loading another page', () => {
      setup({ choice: READY, busy: true });
      expect(next()).toBeDisabled();
    });
  });
  ```

  ```bash
  pnpm --filter web exec vitest run src/app/teacher/grading/export/_components/StepUpload.test.tsx src/app/teacher/grading/export/_components/StepColumns.test.tsx
  ```

  Expected: **RED** — `Failed to resolve import "./StepUpload"` / `"./StepColumns"`.

- [ ] **Step 2: GREEN — `StepUpload.tsx`.**

  ```tsx
  'use client';

  import { useState } from 'react';
  import { Alert, AlertDescription } from '@/components/ui/alert';
  import { Label } from '@/components/ui/label';
  import { useInspectTemplate, useUploadTemplate } from '@/hooks/useGradeExport';
  import type { InspectResponse } from '@/lib/api/grade-export';
  import { validateUpload } from '@/lib/grade-export-view';

  /**
   * Bước 1 (spec §3.6): tải file sổ điểm của trường. File đi THẲNG lên storage bằng URL ký (rule 5), rồi server đọc
   * nó để hiện trang tính. Lỗi của server hiện NGUYÊN VĂN — mỗi loại file xấu (mật khẩu, hỏng, macro…) có câu riêng.
   */
  export function StepUpload({
    sessionId,
    onInspected,
  }: {
    sessionId: string;
    onInspected: (result: { templateId: string; fileName: string; inspect: InspectResponse }) => void;
  }) {
    const upload = useUploadTemplate(sessionId);
    const inspect = useInspectTemplate(sessionId);
    const [clientError, setClientError] = useState<string | null>(null);
    const busy = upload.isPending || inspect.isPending;
    const error = clientError ?? upload.error?.message ?? inspect.error?.message ?? null;

    async function pick(file: File | undefined) {
      setClientError(null);
      if (!file) return;
      const problem = validateUpload(file);
      if (problem) {
        setClientError(problem);
        return;
      }
      try {
        const templateId = await upload.mutateAsync(file);
        const result = await inspect.mutateAsync({ templateId });
        onInspected({ templateId, fileName: file.name, inspect: result });
      } catch {
        // Lỗi đã nằm ở `upload.error` / `inspect.error` và hiện ở khung bên dưới.
      }
    }

    return (
      <div className="flex flex-col gap-4">
        <p className="text-small text-muted-foreground">
          Tải file sổ điểm mà trường phát (.xlsx, tối đa 5 MB). Bạn sẽ chọn cột ở bước sau; hệ thống chỉ điền các ô bạn chọn —
          mọi ô khác giữ nguyên.
        </p>
        <div className="flex flex-col gap-2">
          <Label htmlFor="gx-template-file">File sổ điểm của trường (.xlsx)</Label>
          <input
            id="gx-template-file"
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            disabled={busy}
            onChange={(event) => void pick(event.target.files?.[0])}
            className="block w-full max-w-md text-small file:mr-3 file:rounded-md file:border file:border-border file:bg-surface-2 file:px-3 file:py-2 file:text-small"
          />
          {busy && <p className="text-caption text-muted-foreground">{upload.isPending ? 'Đang tải file lên…' : 'Đang đọc file…'}</p>}
        </div>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </div>
    );
  }
  ```

- [ ] **Step 3: GREEN — `StepColumns.tsx`.**

  ```tsx
  'use client';

  import { Alert, AlertDescription } from '@/components/ui/alert';
  import { Button } from '@/components/ui/button';
  import { FormField } from '@/components/ui/form-field';
  import type { InspectResponse } from '@/lib/api/grade-export';
  import { GRID_ROWS, columnsReady, sampledOverwriteCount, type ColumnChoice } from '@/lib/grade-export-view';

  type Role = 'mssv' | 'score' | 'reason';
  const ROLE_TAG: Record<Role, string> = { mssv: 'MSSV', score: 'Điểm', reason: 'Lý do' };
  /** Màu VÀ chữ: màu một mình không nói gì với người mù màu (spec §3.6). */
  const ROLE_CELL: Record<Role, string> = { mssv: 'bg-info-subtle', score: 'bg-accent-subtle', reason: 'bg-warning-subtle' };
  const SELECT_CLASS = 'h-10 w-full rounded-md border border-input bg-surface px-3 text-body disabled:opacity-60';

  /**
   * Bước 2 (spec §3.6): chọn trang tính, dòng bắt đầu dữ liệu và ba cột. KHÔNG cái nào được chọn sẵn — kể cả khi tiêu
   * đề ghi "MSSV" (Security rule 9). Cột đã chọn được tô màu VÀ gắn nhãn chữ ở tiêu đề cột. Component chỉ hiện; trạng
   * thái do `ExportWizard` giữ.
   */
  export function StepColumns({
    inspect,
    choice,
    busy,
    onChange,
    onSelectSheet,
    onLoadRows,
    onNext,
  }: {
    inspect: InspectResponse;
    choice: ColumnChoice;
    busy: boolean;
    onChange: (patch: Partial<ColumnChoice>) => void;
    onSelectSheet: (name: string) => void;
    onLoadRows: (fromRow: number) => void;
    onNext: () => void;
  }) {
    const grid = inspect.sheet;
    const needsDeliverable = inspect.deliverables.length > 1;
    const ready = columnsReady(choice, needsDeliverable);
    const roleOf = (column: string): Role | null =>
      column === choice.mssvColumn ? 'mssv' : column === choice.scoreColumn ? 'score' : column === choice.reasonColumn ? 'reason' : null;
    const overwriteInView = grid && choice.scoreColumn && choice.firstDataRow ? sampledOverwriteCount(grid, choice.scoreColumn, choice.firstDataRow) : 0;

    return (
      <div className="flex flex-col gap-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <FormField id="gx-sheet" label="Trang tính">
            <select id="gx-sheet" value={choice.sheetName} onChange={(e) => onSelectSheet(e.target.value)} disabled={busy} className={SELECT_CLASS}>
              <option value="">Chọn trang tính…</option>
              {inspect.sheets.map((s) => (
                <option key={s.name} value={s.name}>
                  {s.hidden ? `${s.name} (ẩn)` : s.name}
                </option>
              ))}
            </select>
          </FormField>

          <FormField id="gx-mssv" label="Cột MSSV">
            <select id="gx-mssv" value={choice.mssvColumn} onChange={(e) => onChange({ mssvColumn: e.target.value })} disabled={!grid} className={SELECT_CLASS}>
              <option value="">Chọn cột…</option>
              {grid?.columns.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </FormField>

          <FormField id="gx-score" label="Cột điểm">
            <select id="gx-score" value={choice.scoreColumn} onChange={(e) => onChange({ scoreColumn: e.target.value })} disabled={!grid} className={SELECT_CLASS}>
              <option value="">Chọn cột…</option>
              {grid?.columns.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </FormField>

          <FormField id="gx-reason" label="Cột lý do ô trống (tuỳ chọn)" hint="Chữ lý do được ghi vào đây cho sinh viên chưa có điểm. Bỏ trống nếu không cần.">
            <select id="gx-reason" value={choice.reasonColumn} onChange={(e) => onChange({ reasonColumn: e.target.value })} disabled={!grid} className={SELECT_CLASS}>
              <option value="">Không dùng</option>
              {grid?.columns.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </FormField>

          <FormField id="gx-first-row" label="Dữ liệu bắt đầu từ dòng số" hint="Dòng của sinh viên đầu tiên — tựa đề và dòng tiêu đề nằm phía trên.">
            <input
              id="gx-first-row"
              type="number"
              min={1}
              value={choice.firstDataRow ?? ''}
              onChange={(e) => onChange({ firstDataRow: e.target.value === '' ? null : Number(e.target.value) })}
              disabled={!grid}
              className={SELECT_CLASS}
            />
          </FormField>

          {needsDeliverable && (
            <FormField id="gx-deliverable" label="Ghi điểm của yêu cầu nộp" hint="Phiên có nhiều yêu cầu nộp; điểm không bao giờ được cộng lại.">
              <select id="gx-deliverable" value={choice.deliverableId} onChange={(e) => onChange({ deliverableId: e.target.value })} className={SELECT_CLASS}>
                <option value="">Chọn yêu cầu nộp…</option>
                {inspect.deliverables.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.requiredFilename}
                  </option>
                ))}
              </select>
            </FormField>
          )}
        </div>

        {grid?.protected && (
          <Alert variant="destructive">
            <AlertDescription>Trang tính đang được bảo vệ. Hãy bỏ bảo vệ trong Excel rồi tải lại.</AlertDescription>
          </Alert>
        )}
        {overwriteInView > 0 && (
          <Alert variant="warning">
            <AlertDescription>
              Trong phần xem trước, {overwriteInView} ô của cột {choice.scoreColumn} đã có giá trị và sẽ bị ghi đè nếu bạn ghi điểm vào
              cột này. Số ô thật hiện ở bước sau.
            </AlertDescription>
          </Alert>
        )}

        {grid ? (
          <div className="flex flex-col gap-2">
            <div className="overflow-x-auto rounded-lg border border-border bg-surface">
              <table aria-label="Xem trước file" className="w-full border-collapse text-small">
                <thead>
                  <tr>
                    <th scope="col" className="w-24 border-b border-border bg-surface-2 p-2 text-left text-caption text-muted-foreground">
                      Dòng
                    </th>
                    {grid.columns.map((letter) => {
                      const role = roleOf(letter);
                      return (
                        <th
                          key={letter}
                          scope="col"
                          data-role={role ?? undefined}
                          className={`border-b border-border p-2 text-left ${role ? ROLE_CELL[role] : 'bg-surface-2'}`}
                        >
                          <span>{letter}</span>
                          {role && (
                            <>
                              {' '}
                              <span className="rounded-full border border-border bg-surface px-1.5 py-px text-caption font-semibold">{ROLE_TAG[role]}</span>
                            </>
                          )}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {grid.rows.map((r) => (
                    <tr
                      key={r.row}
                      data-before-data={choice.firstDataRow !== null && r.row < choice.firstDataRow ? 'true' : undefined}
                      data-first-data={r.row === choice.firstDataRow ? 'true' : undefined}
                      className={`${choice.firstDataRow !== null && r.row < choice.firstDataRow ? 'opacity-50' : ''} ${r.row === choice.firstDataRow ? 'outline outline-1 outline-accent' : ''}`}
                    >
                      <th scope="row" className="border-b border-border p-2 text-left font-normal text-muted-foreground">
                        <span className="tabular-nums">{r.row}</span>{' '}
                        <button
                          type="button"
                          aria-label={`Dữ liệu bắt đầu từ dòng ${r.row}`}
                          onClick={() => onChange({ firstDataRow: r.row })}
                          className="rounded border border-border px-1 text-caption hover:bg-surface-2"
                        >
                          từ đây
                        </button>
                      </th>
                      {r.cells.map((c, i) => {
                        const role = roleOf(grid.columns[i]!);
                        return (
                          <td key={i} data-role={role ?? undefined} className={`max-w-[220px] truncate border-b border-border p-2 ${role ? ROLE_CELL[role] : ''}`}>
                            {c.formula && (
                              <span aria-label="ô có công thức" title="Ô có công thức — hệ thống sẽ bỏ qua dòng này" className="mr-1 font-mono text-caption text-muted-foreground">
                                ƒ
                              </span>
                            )}
                            {c.text}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap gap-2">
              {grid.fromRow > 1 && (
                <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => onLoadRows(Math.max(1, grid.fromRow - GRID_ROWS))}>
                  Xem các dòng trước
                </Button>
              )}
              {grid.hasMore && (
                <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => onLoadRows(grid.fromRow + grid.rows.length)}>
                  Xem các dòng tiếp
                </Button>
              )}
            </div>
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-border px-4 py-6 text-small text-muted-foreground">Chọn trang tính để xem nội dung của nó.</p>
        )}

        <div className="flex flex-col gap-2">
          <Button type="button" className="self-start" disabled={busy || !ready.ok || Boolean(grid?.protected)} onClick={onNext}>
            Xem trước điểm sẽ ghi
          </Button>
          {!ready.ok && <p className="text-caption text-muted-foreground">Còn thiếu: {ready.hints.join(', ')}.</p>}
        </div>
      </div>
    );
  }
  ```

  ```bash
  pnpm --filter web exec vitest run src/app/teacher/grading/export/_components/StepUpload.test.tsx src/app/teacher/grading/export/_components/StepColumns.test.tsx
  pnpm --filter web exec tsc --noEmit
  pnpm --filter web exec eslint src/app/teacher/grading/export/_components
  ```

  Expected: `StepUpload` 8 passed, `StepColumns` 18 passed; `tsc` shows only the 7 known lines; eslint 0 errors. Two assertions that depend on markup: (a) `columnheader` names — the header `th` holds the letter, a real space character, and the tag, so its accessible name is `B MSSV` (CSS margin is not a space, which is why the implementation writes `{' '}`); (b) `getByLabelText('ô có công thức')` finds the `aria-label` of the ƒ span — there is exactly one formula cell in the fixture (row 5, column D). Remember `Alert` always renders `role="alert"`: a test that expects exactly one alert must make sure no second `Alert` is on screen.

- [ ] **Step 4: commit.** Title: `feat(web): bước tải file và bước chọn cột — không cột nào chọn sẵn, cột đã chọn có màu và chữ`.

---

### Task 14: step 3 — the preview and the write, and the list of earlier exports

**Files:** create `apps/web/src/app/teacher/grading/export/_components/StepPreview.tsx`, `StepPreview.test.tsx`, `PreviousExports.tsx`, `PreviousExports.test.tsx`.

**Interfaces**
- Consumes: `usePreviewExport`, `useWriteExport`, `useGradeExports`, `useExportDownload` (Task 12); `canWriteNow`, `ROUNDING_OPTIONS`, `ACTION_LABEL`, `directionText`, `causesText`, `matchesFilter`, `countFilters`, `ROW_FILTER_LABEL`, `blankReportCsv`, `hasBlankReport`, `blankReportFilename`, `scoreText`, `PlanBase` (Task 12); `Table`, `Alert`, `Button`, `Badge`.
- Produces:
  - `StepPreview({ sessionId, sessionName, sessionCode, templateFileName, request, onBack })` where `request: PlanBase`.
  - `PreviousExports({ sessionId })`.

What the tests pin (Review Focus 3, 5): **no preview is requested until a rounding step is chosen**; the write button is off with a written reason for every unmet condition; an overwrite and a decrease **each** need their own tick and the tick text says the number; a server refusal is quoted verbatim; the blank report exists and is a file download, not a network call.

- [ ] **Step 1: RED — `StepPreview.test.tsx`.**

  ```tsx
  import { beforeEach, describe, expect, it, vi } from 'vitest';
  import { fireEvent, render, screen, within } from '@testing-library/react';
  import '@testing-library/jest-dom/vitest';
  import { StepPreview } from './StepPreview';
  import type { PlanResponse, PlanRowView, WriteResponse } from '@/lib/api/grade-export';

  const previewMutate = vi.fn();
  const writeMutate = vi.fn();
  const writeReset = vi.fn();
  let previewState: { data?: PlanResponse; isPending: boolean; error: Error | null };
  let writeState: { data?: WriteResponse; isPending: boolean; error: Error | null };
  vi.mock('@/hooks/useGradeExport', () => ({
    usePreviewExport: () => ({ mutate: previewMutate, ...previewState }),
    useWriteExport: () => ({ mutate: writeMutate, reset: writeReset, ...writeState }),
  }));

  const row = (over: Partial<PlanRowView> = {}): PlanRowView => ({
    row: 3, mssvInFile: '20120001', studentMssv: '20120001', studentName: 'Nguyễn Văn An', action: 'write', systemScore: '7.25', writtenScore: '7.50',
    blankReason: null, blankLabel: null, previousScore: null, direction: null, causes: [], note: null, ...over,
  });
  const plan = (over: Partial<PlanResponse> = {}): PlanResponse => ({
    digest: 'd'.repeat(64), deliverableId: null, roundingStepHundredths: 50,
    summary: { write: 1, blank: 1, kept: 0, unmatched: 1, duplicates: 0, skipped: 0, ignoredEmpty: 0, notInFile: 0 },
    overwrite: { score: 0, reason: 0 }, changes: null, blockers: [], canWrite: true,
    rows: [
      row(),
      row({ row: 4, studentMssv: '20120002', studentName: 'Trần Thị Bình', action: 'blank', systemScore: null, writtenScore: null, blankReason: 'absent', blankLabel: 'Vắng — không có bài nộp' }),
      row({ row: 5, mssvInFile: '99999999', studentMssv: null, studentName: null, action: 'unmatched', systemScore: null, writtenScore: null, note: 'Không có trong danh sách sinh viên của phiên.' }),
    ],
    notInFile: [], ...over,
  });
  const REQUEST = { templateId: 't1', sheetName: 'Bảng điểm', firstDataRow: 3, mssvColumn: 'B', scoreColumn: 'D', reasonColumn: 'E' };

  const setup = () => render(<StepPreview sessionId="s1" sessionName="Giữa kỳ N01" sessionCode="GK-N01" templateFileName="Sổ điểm N01.xlsx" request={REQUEST} onBack={vi.fn()} />);
  const rounding = (label: string) => screen.getByRole('radio', { name: label });
  const writeButton = () => screen.getByRole('button', { name: 'Ghi vào file' });

  beforeEach(() => {
    previewMutate.mockReset();
    writeMutate.mockReset();
    writeReset.mockReset();
    previewState = { isPending: false, error: null };
    writeState = { isPending: false, error: null };
    Object.defineProperty(URL, 'createObjectURL', { value: vi.fn(() => 'blob:x'), configurable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true });
  });

  describe('StepPreview — rounding first (spec D9, §13.1 rule 7)', () => {
    it('offers four choices, preselects none, and asks for no preview until one is chosen', () => {
      setup();
      const radios = screen.getAllByRole('radio');
      expect(radios.map((r) => (r as HTMLInputElement).checked)).toEqual([false, false, false, false]);
      expect(radios.map((r) => r.getAttribute('aria-label') ?? r.closest('label')?.textContent)).toEqual([
        expect.stringContaining('Không làm tròn'), expect.stringContaining('0,1'), expect.stringContaining('0,25'), expect.stringContaining('0,5'),
      ]);
      expect(previewMutate).not.toHaveBeenCalled();
      expect(writeButton()).toBeDisabled();
      expect(screen.getByText('Chọn cách làm tròn.')).toBeInTheDocument();
    });

    it('says the rule and that it is recorded', () => {
      setup();
      expect(screen.getByText(/nửa lên/i)).toBeInTheDocument();
      expect(screen.getByText(/được ghi vào bản ghi lượt xuất/)).toBeInTheDocument();
    });

    it('choosing a step asks for the preview with exactly that step', () => {
      setup();
      fireEvent.click(rounding('0,5'));
      expect(previewMutate).toHaveBeenCalledWith({ ...REQUEST, roundingStepHundredths: 50 });
      fireEvent.click(rounding('0,1'));
      expect(previewMutate).toHaveBeenLastCalledWith({ ...REQUEST, roundingStepHundredths: 10 });
      expect(writeReset).toHaveBeenCalled();
    });
  });

  describe('StepPreview — the three numbers and the table (spec §3.6)', () => {
    it('shows will-write · left-blank · unmatched', () => {
      previewState = { data: plan(), isPending: false, error: null };
      setup();
      const numbers = screen.getByRole('list', { name: 'Ba con số' });
      expect(within(numbers).getByText('Sẽ ghi').closest('li')).toHaveTextContent('1');
      expect(within(numbers).getByText('Để trống').closest('li')).toHaveTextContent('1');
      expect(within(numbers).getByText('Không khớp').closest('li')).toHaveTextContent('1');
    });

    it('counts "kept" cells with the blank ones and mentions the rest only when they exist', () => {
      previewState = { data: plan({ summary: { write: 2, blank: 1, kept: 2, unmatched: 0, duplicates: 0, skipped: 1, ignoredEmpty: 3, notInFile: 4 } }), isPending: false, error: null };
      setup();
      expect(within(screen.getByRole('list', { name: 'Ba con số' })).getByText('Để trống').closest('li')).toHaveTextContent('3');
      expect(screen.getByText(/2 ô giữ nguyên/)).toBeInTheDocument();
      expect(screen.getByText(/1 dòng bị bỏ qua/)).toBeInTheDocument();
      expect(screen.getByText(/4 sinh viên chưa có dòng trong file/)).toBeInTheDocument();
    });

    it('each row: file row, MSSV, name, the system score, the value to write — with a decimal comma — and a note', () => {
      previewState = { data: plan(), isPending: false, error: null };
      setup();
      const table = screen.getByRole('table', { name: 'Từng dòng của file' });
      const first = within(table).getByText('20120001').closest('tr')!;
      expect(within(first).getByText('7,25')).toBeInTheDocument();
      expect(within(first).getByText('7,5')).toBeInTheDocument();
      const blank = within(table).getByText('20120002').closest('tr')!;
      expect(within(blank).getByText('Để trống')).toBeInTheDocument();
      expect(within(blank).getByText('Vắng — không có bài nộp')).toBeInTheDocument();
      const unmatched = within(table).getByText('99999999').closest('tr')!;
      expect(within(unmatched).getByText('Không khớp')).toBeInTheDocument();
      expect(within(unmatched).getByText('Không có trong danh sách sinh viên của phiên.')).toBeInTheDocument();
    });

    it('the chips filter the rows', () => {
      previewState = { data: plan(), isPending: false, error: null };
      setup();
      fireEvent.click(screen.getByRole('button', { name: /^Để trống · 1$/ }));
      const table = screen.getByRole('table', { name: 'Từng dòng của file' });
      expect(within(table).queryByText('20120001')).not.toBeInTheDocument();
      expect(within(table).getByText('20120002')).toBeInTheDocument();
    });

    it('a student who is in the session but not in the file is listed, with a score or a reason', () => {
      previewState = {
        data: plan({ notInFile: [{ mssv: 'SV000001', name: 'Có điểm', blankReason: null, blankLabel: null, score: '8.00' }, { mssv: 'SV000002', name: 'Vắng', blankReason: 'absent', blankLabel: 'Vắng — không có bài nộp', score: null }] }),
        isPending: false, error: null,
      };
      setup();
      const details = screen.getByRole('group', { name: /Sinh viên có trong phiên nhưng chưa có dòng trong file/ });
      expect(within(details).getByText('SV000001').closest('li')).toHaveTextContent('8,0');
      expect(within(details).getByText('SV000002').closest('li')).toHaveTextContent('Vắng — không có bài nộp');
    });

    it('shows what is happening while the preview loads, and a failure verbatim', () => {
      previewState = { isPending: true, error: null };
      setup();
      expect(screen.getByText('Đang tính bản xem trước…')).toBeInTheDocument();
    });
    it('shows a preview failure verbatim', () => {
      previewState = { isPending: false, error: new Error('Phiên chưa chốt điểm — chốt điểm trước rồi mới ghi vào sổ điểm.') };
      setup();
      expect(screen.getByRole('alert')).toHaveTextContent('Phiên chưa chốt điểm — chốt điểm trước rồi mới ghi vào sổ điểm.');
    });
  });

  describe('StepPreview — writing (spec D13, D16, D20)', () => {
    const chooseAnd = (data: PlanResponse) => {
      previewState = { data, isPending: false, error: null };
      setup();
      fireEvent.click(rounding('0,5'));
    };

    it('a clean plan writes once, sending the digest it saw and the file name the teacher chose', () => {
      chooseAnd(plan());
      expect(writeButton()).toBeEnabled();
      fireEvent.click(writeButton());
      expect(writeMutate).toHaveBeenCalledTimes(1);
      expect(writeMutate).toHaveBeenCalledWith({
        ...REQUEST, roundingStepHundredths: 50, expectedDigest: 'd'.repeat(64), templateFileName: 'Sổ điểm N01.xlsx',
      });
    });

    it('overwriting needs its own tick, and the tick says how many cells', () => {
      chooseAnd(plan({ overwrite: { score: 2, reason: 1 } }));
      expect(writeButton()).toBeDisabled();
      expect(screen.getByText('Cần đồng ý ghi đè 3 ô đã có giá trị.')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('checkbox', { name: 'Tôi đồng ý ghi đè 3 ô đã có giá trị' }));
      expect(writeButton()).toBeEnabled();
      fireEvent.click(writeButton());
      expect(writeMutate).toHaveBeenCalledWith(expect.objectContaining({ overwriteExisting: true }));
      expect(writeMutate.mock.calls[0]![0]).not.toHaveProperty('confirmDecreases');
    });

    it('a decrease needs ITS OWN tick — the overwrite tick does not stand in for it', () => {
      chooseAnd(plan({
        overwrite: { score: 1, reason: 0 },
        changes: { previousExports: 1, up: 0, down: 2, same: 0, new: 0, downByCause: [], upByCause: [] },
      }));
      fireEvent.click(screen.getByRole('checkbox', { name: 'Tôi đồng ý ghi đè 1 ô đã có giá trị' }));
      expect(writeButton()).toBeDisabled();
      expect(screen.getByText('Cần xác nhận 2 bài bị giảm điểm.')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('checkbox', { name: 'Tôi đã xem 2 bài bị giảm điểm và đồng ý ghi' }));
      fireEvent.click(writeButton());
      expect(writeMutate).toHaveBeenCalledWith(expect.objectContaining({ overwriteExisting: true, confirmDecreases: true }));
    });

    it('the ticks are not offered when there is nothing to confirm', () => {
      chooseAnd(plan());
      expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    });

    it('a blocker switches writing off, whatever is ticked, and is quoted', () => {
      chooseAnd(plan({ blockers: ['Trang tính đang được bảo vệ. Hãy bỏ bảo vệ trong Excel rồi tải lại.'], canWrite: false }));
      expect(writeButton()).toBeDisabled();
      expect(screen.getAllByText('Trang tính đang được bảo vệ. Hãy bỏ bảo vệ trong Excel rồi tải lại.').length).toBeGreaterThan(0);
    });

    it('changing the rounding clears the ticks — they were given for another plan', () => {
      chooseAnd(plan({ overwrite: { score: 2, reason: 0 } }));
      fireEvent.click(screen.getByRole('checkbox', { name: 'Tôi đồng ý ghi đè 2 ô đã có giá trị' }));
      fireEvent.click(rounding('0,1'));
      expect(screen.getByRole('checkbox', { name: 'Tôi đồng ý ghi đè 2 ô đã có giá trị' })).not.toBeChecked();
    });

    it('a server refusal is quoted verbatim and offers a fresh preview', () => {
      previewState = { data: plan(), isPending: false, error: null };
      writeState = { isPending: false, error: new Error('Kết quả chấm đã đổi kể từ lúc xem trước — hãy xem trước lại.') };
      setup();
      fireEvent.click(rounding('0,5'));
      expect(screen.getByRole('alert')).toHaveTextContent('Kết quả chấm đã đổi kể từ lúc xem trước — hãy xem trước lại.');
      previewMutate.mockClear();
      fireEvent.click(screen.getByRole('button', { name: 'Xem trước lại' }));
      expect(previewMutate).toHaveBeenCalledWith({ ...REQUEST, roundingStepHundredths: 50 });
    });

    it('after a write it offers the file, says what was written, and does not offer to write twice', () => {
      previewState = { data: plan(), isPending: false, error: null };
      writeState = {
        isPending: false, error: null,
        data: { exportId: 'e1', fileName: 'Sổ điểm N01-da-ghi-diem.xlsx', downloadUrl: 'https://storage.local/out', summary: { written: 1, blank: 1, kept: 0, unmatched: 1, skipped: 0, overwritten: 0, decreased: 0 }, blank: [] },
      };
      setup();
      fireEvent.click(rounding('0,5'));
      expect(screen.getByRole('status')).toHaveTextContent('Đã ghi 1 điểm vào file');
      const link = screen.getByRole('link', { name: /Tải file đã ghi/ });
      expect(link).toHaveAttribute('href', 'https://storage.local/out');
      expect(link).toHaveTextContent('Sổ điểm N01-da-ghi-diem.xlsx');
      expect(screen.queryByRole('button', { name: 'Ghi vào file' })).not.toBeInTheDocument();
    });
  });

  describe('StepPreview — re-export (spec §3.6 "Xuất lại")', () => {
    const changes = {
      previousExports: 1, up: 1, down: 2, same: 5, new: 0,
      downByCause: [{ kind: 'rule' as const, ruleKey: 'sai_bien', ruleName: 'Sai biên', students: 2 }],
      upByCause: [{ kind: 'manual_score' as const, ruleKey: null, ruleName: null, students: 1 }],
    };

    it('a band says how many went down and up — each with an arrow AND words — and what caused each', () => {
      previewState = { data: plan({ changes }), isPending: false, error: null };
      setup();
      fireEvent.click(rounding('0,5'));
      const band = screen.getByRole('region', { name: 'So với lần ghi trước' });
      expect(band).toHaveTextContent('↓ 2 bài giảm');
      expect(band).toHaveTextContent('↑ 1 bài tăng');
      expect(band).toHaveTextContent('5 bài không đổi');
      expect(band).toHaveTextContent('Giảm do: luật Sai biên (2 bài)');
      expect(band).toHaveTextContent('Tăng do: chấm tay (1 bài)');
    });

    it('a changed row says the direction in words, what was there, and why', () => {
      previewState = {
        data: plan({ changes, rows: [row({ direction: 'down', previousScore: '8.50', writtenScore: '7.50', causes: [{ kind: 'rule', ruleKey: 'sai_bien', ruleName: 'Sai biên', delta: 100 }] })] }),
        isPending: false, error: null,
      };
      setup();
      fireEvent.click(rounding('0,5'));
      expect(screen.getByText('↓ Giảm — trước đã ghi 8,5, do luật Sai biên')).toBeInTheDocument();
    });

    it('a first export shows no such band', () => {
      previewState = { data: plan(), isPending: false, error: null };
      setup();
      expect(screen.queryByRole('region', { name: 'So với lần ghi trước' })).not.toBeInTheDocument();
    });
  });

  describe('StepPreview — the blank report is a file, not a request', () => {
    it('downloads a CSV built from what is on screen', () => {
      previewState = { data: plan(), isPending: false, error: null };
      setup();
      const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
      fireEvent.click(screen.getByRole('button', { name: 'Tải bảng kê ô trống (CSV)' }));
      expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
      expect(click).toHaveBeenCalledTimes(1);
      expect(writeMutate).not.toHaveBeenCalled();
      click.mockRestore();
    });

    it('is not offered when nothing is blank', () => {
      previewState = { data: plan({ rows: [row()] }), isPending: false, error: null };
      setup();
      expect(screen.queryByRole('button', { name: 'Tải bảng kê ô trống (CSV)' })).not.toBeInTheDocument();
    });
  });
  ```

  Create `PreviousExports.test.tsx`:

  ```tsx
  import { beforeEach, describe, expect, it, vi } from 'vitest';
  import { fireEvent, render, screen, within } from '@testing-library/react';
  import '@testing-library/jest-dom/vitest';
  import { PreviousExports } from './PreviousExports';
  import type { ExportListItem } from '@/lib/api/grade-export';

  const download = vi.fn();
  let listState: { data?: ExportListItem[]; isLoading: boolean; error: Error | null };
  let downloadState: { isPending: boolean; error: Error | null };
  vi.mock('@/hooks/useGradeExport', () => ({
    useGradeExports: () => listState,
    useExportDownload: () => ({ mutate: download, ...downloadState }),
  }));

  const item = (over: Partial<ExportListItem> = {}): ExportListItem => ({
    id: 'e1', exportedAt: '2026-09-29T09:30:00.000Z', sheetName: 'Bảng điểm', firstDataRow: 3, mssvColumn: 'B', scoreColumn: 'D', reasonColumn: 'E',
    deliverableName: null, roundingStepHundredths: 50, written: 38, blank: 2, unmatched: 1, overwritten: 0, decreased: 0, decreaseConfirmedBy: null,
    exportedByName: 'Nguyễn Văn Giảng', templateFileName: 'Sổ điểm N01.xlsx', outputFileName: 'Sổ điểm N01-da-ghi-diem.xlsx', ...over,
  });

  beforeEach(() => {
    download.mockReset();
    listState = { data: [], isLoading: false, error: null };
    downloadState = { isPending: false, error: null };
  });

  describe('PreviousExports', () => {
    it('says so when nothing was exported yet', () => {
      render(<PreviousExports sessionId="s1" />);
      expect(screen.getByText('Chưa có lượt xuất nào cho phiên này.')).toBeInTheDocument();
    });

    it('describes each export: who, which sheet and columns, the rounding, and the counts', () => {
      listState = { data: [item()], isLoading: false, error: null };
      render(<PreviousExports sessionId="s1" />);
      const li = screen.getByRole('list', { name: 'Các lượt xuất trước' }).querySelector('li')!;
      expect(li).toHaveTextContent('Sổ điểm N01.xlsx');
      expect(li).toHaveTextContent('Nguyễn Văn Giảng');
      expect(li).toHaveTextContent('Trang tính Bảng điểm');
      expect(li).toHaveTextContent('MSSV cột B · điểm cột D · lý do cột E');
      expect(li).toHaveTextContent('Làm tròn 0,5');
      expect(li).toHaveTextContent('38 điểm đã ghi');
      expect(li).toHaveTextContent('2 ô để trống');
      expect(li).toHaveTextContent('1 không khớp');
    });

    it('names the person who confirmed a decrease, and the deliverable when there is one', () => {
      listState = { data: [item({ decreased: 2, decreaseConfirmedBy: 'Nguyễn Văn Giảng', deliverableName: 'Cau2.docx', roundingStepHundredths: 1 })], isLoading: false, error: null };
      render(<PreviousExports sessionId="s1" />);
      const li = screen.getByRole('list', { name: 'Các lượt xuất trước' }).querySelector('li')!;
      expect(li).toHaveTextContent('↓ 2 bài giảm điểm — Nguyễn Văn Giảng đã xác nhận');
      expect(li).toHaveTextContent('Yêu cầu nộp Cau2.docx');
      expect(li).toHaveTextContent('Không làm tròn');
      expect(li).not.toHaveTextContent('Làm tròn Không');
    });

    it('a download asks for the signed URL of THAT export and opens it', () => {
      listState = { data: [item({ id: 'e1' }), item({ id: 'e2' })], isLoading: false, error: null };
      const open = vi.spyOn(window, 'open').mockImplementation(() => null);
      render(<PreviousExports sessionId="s1" />);
      fireEvent.click(within(screen.getAllByRole('listitem')[1]!).getByRole('button', { name: 'Tải file' }));
      expect(download).toHaveBeenCalledWith('e2', expect.objectContaining({ onSuccess: expect.any(Function) }));
      const onSuccess = download.mock.calls[0]![1].onSuccess as (d: { downloadUrl: string }) => void;
      onSuccess({ downloadUrl: 'https://storage.local/out' });
      expect(open).toHaveBeenCalledWith('https://storage.local/out', '_blank', 'noopener');
      open.mockRestore();
    });

    it('shows a list failure and a download failure verbatim', () => {
      listState = { data: undefined, isLoading: false, error: new Error('Không tải được danh sách.') };
      render(<PreviousExports sessionId="s1" />);
      expect(screen.getByRole('alert')).toHaveTextContent('Không tải được danh sách.');
    });
    it('shows a download failure verbatim', () => {
      listState = { data: [item()], isLoading: false, error: null };
      downloadState = { isPending: false, error: new Error('Không tìm thấy lượt xuất này.') };
      render(<PreviousExports sessionId="s1" />);
      expect(screen.getByRole('alert')).toHaveTextContent('Không tìm thấy lượt xuất này.');
    });
  });
  ```

  ```bash
  pnpm --filter web exec vitest run src/app/teacher/grading/export/_components/StepPreview.test.tsx src/app/teacher/grading/export/_components/PreviousExports.test.tsx
  ```

  Expected: **RED** — `Failed to resolve import "./StepPreview"` / `"./PreviousExports"`.

- [ ] **Step 2: GREEN — `StepPreview.tsx`.**

  ```tsx
  'use client';

  import { useState } from 'react';
  import { ArrowDown, ArrowUp, Ban, Check, CircleAlert, CircleDashed, Copy, Download, Lock } from 'lucide-react';
  import { Alert, AlertDescription } from '@/components/ui/alert';
  import { Button } from '@/components/ui/button';
  import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
  import { usePreviewExport, useWriteExport } from '@/hooks/useGradeExport';
  import type { PlanResponse, PlanRowView, RowAction } from '@/lib/api/grade-export';
  import {
    ACTION_LABEL, ROUNDING_OPTIONS, ROW_FILTER_LABEL, blankReportCsv, blankReportFilename, canWriteNow, causeTallyText, countFilters,
    directionText, hasBlankReport, matchesFilter, scoreText, type PlanBase, type RowFilter,
  } from '@/lib/grade-export-view';

  const SHOWN_ROWS = 300;
  const ACTION_ICON: Record<RowAction, typeof Check> = {
    write: Check, blank: CircleDashed, kept: Lock, unmatched: CircleAlert, duplicate: Copy, skipped_formula: Ban, skipped_merged: Ban,
  };

  function downloadCsv(csv: string, filename: string) {
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  /**
   * Bước 3 (spec §3.6): chọn làm tròn (KHÔNG chọn sẵn; được ghi vào bản ghi lượt xuất), xem ba con số và từng dòng, rồi
   * ghi. Không có bản xem trước nào được yêu cầu cho tới khi chọn làm tròn — bản xem trước phụ thuộc vào nó. Nút ghi tắt
   * và GHI RA lý do; ghi đè và điểm giảm mỗi cái cần một dấu tick riêng nói rõ con số.
   */
  export function StepPreview({
    sessionId,
    sessionName,
    sessionCode,
    templateFileName,
    request,
    onBack,
  }: {
    sessionId: string;
    sessionName: string;
    sessionCode: string;
    templateFileName: string;
    request: PlanBase;
    onBack: () => void;
  }) {
    const preview = usePreviewExport(sessionId);
    const write = useWriteExport(sessionId);
    const [step, setStep] = useState<number | null>(null);
    const [overwriteAck, setOverwriteAck] = useState(false);
    const [decreaseAck, setDecreaseAck] = useState(false);
    const [filter, setFilter] = useState<RowFilter>('all');
    const plan: PlanResponse | null = preview.data ?? null;

    const overwriteCount = plan ? plan.overwrite.score + plan.overwrite.reason : 0;
    const overwriteNeeded = overwriteCount > 0;
    const down = plan?.changes?.down ?? 0;
    const gate = canWriteNow({ plan, roundingStep: step, overwriteAck, decreaseAck });
    const counts = plan ? countFilters(plan.rows) : null;
    const visible = plan ? plan.rows.filter((r) => matchesFilter(r, filter)) : [];

    function loadPreview(value: number) {
      setOverwriteAck(false);
      setDecreaseAck(false);
      write.reset();
      preview.mutate({ ...request, roundingStepHundredths: value });
    }
    function choose(value: number) {
      setStep(value);
      loadPreview(value);
    }
    function submit() {
      if (!plan || step === null) return;
      write.mutate({
        ...request,
        roundingStepHundredths: step,
        expectedDigest: plan.digest,
        templateFileName,
        ...(overwriteNeeded ? { overwriteExisting: true } : {}),
        ...(down > 0 ? { confirmDecreases: true } : {}),
      });
    }

    return (
      <div className="flex flex-col gap-5">
        <fieldset className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4">
          <legend className="px-1 text-small font-semibold">Làm tròn điểm khi ghi</legend>
          <div role="radiogroup" aria-label="Làm tròn điểm khi ghi" className="flex flex-wrap gap-4">
            {ROUNDING_OPTIONS.map((option) => (
              <label key={option.value} className="flex cursor-pointer items-center gap-2 text-small">
                <input type="radio" name="gx-rounding" checked={step === option.value} onChange={() => choose(option.value)} disabled={write.isPending} />
                {option.label}
              </label>
            ))}
          </div>
          <p className="text-caption text-muted-foreground">
            Làm tròn nửa lên (ví dụ 7,25 → 7,3 ở bước 0,1). Chỉ làm tròn lúc ghi ra file; cách làm tròn được ghi vào bản ghi lượt xuất.
          </p>
        </fieldset>

        {preview.isPending && <p className="text-small text-muted-foreground">Đang tính bản xem trước…</p>}
        {preview.error && !write.error && (
          <Alert variant="destructive">
            <AlertDescription>{preview.error.message}</AlertDescription>
          </Alert>
        )}

        {plan && (
          <>
            {plan.blockers.length > 0 && (
              <Alert variant="destructive">
                <AlertDescription>
                  <ul className="list-disc pl-5">
                    {plan.blockers.map((b) => (
                      <li key={b}>{b}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            <ul aria-label="Ba con số" className="grid gap-3 sm:grid-cols-3">
              {[
                { label: 'Sẽ ghi', value: plan.summary.write },
                { label: 'Để trống', value: plan.summary.blank + plan.summary.kept },
                { label: 'Không khớp', value: plan.summary.unmatched },
              ].map((n) => (
                <li key={n.label} className="rounded-lg border border-border bg-surface p-4">
                  <p className="text-caption text-muted-foreground">{n.label}</p>
                  <p className="text-h1 tabular-nums">{n.value}</p>
                </li>
              ))}
            </ul>
            <p className="text-caption text-muted-foreground">
              {[
                plan.summary.kept > 0 && `${plan.summary.kept} ô giữ nguyên (đã ghi lần trước, nay bài chưa xong)`,
                plan.summary.duplicates > 0 && `${plan.summary.duplicates} dòng MSSV trùng`,
                plan.summary.skipped > 0 && `${plan.summary.skipped} dòng bị bỏ qua (ô có công thức hoặc ô gộp)`,
                plan.summary.ignoredEmpty > 0 && `${plan.summary.ignoredEmpty} dòng không có MSSV`,
                plan.summary.notInFile > 0 && `${plan.summary.notInFile} sinh viên chưa có dòng trong file`,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>

            {plan.notInFile.length > 0 && (
              <details role="group" aria-label={`Sinh viên có trong phiên nhưng chưa có dòng trong file (${plan.notInFile.length})`} className="rounded-lg border border-border bg-surface p-3 text-small">
                <summary className="cursor-pointer font-semibold">Sinh viên có trong phiên nhưng chưa có dòng trong file ({plan.notInFile.length})</summary>
                <ul className="mt-2 flex flex-col gap-1">
                  {plan.notInFile.map((s) => (
                    <li key={s.mssv}>
                      <span className="font-mono">{s.mssv}</span> {s.name} — {s.score !== null ? scoreText(s.score) : s.blankLabel}
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-caption text-muted-foreground">Hệ thống không thêm dòng vào file của bạn. Nếu cần, thêm dòng trong Excel rồi xuất lại.</p>
              </details>
            )}

            {plan.changes && (
              <section aria-label="So với lần ghi trước" className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4 text-small">
                <p className="flex flex-wrap items-center gap-x-4 gap-y-1 font-semibold">
                  <span className="flex items-center gap-1"><ArrowDown className="h-4 w-4" aria-hidden="true" />↓ {plan.changes.down} bài giảm</span>
                  <span className="flex items-center gap-1"><ArrowUp className="h-4 w-4" aria-hidden="true" />↑ {plan.changes.up} bài tăng</span>
                  <span className="font-normal text-muted-foreground">{plan.changes.same} bài không đổi</span>
                  {plan.changes.new > 0 && <span className="font-normal text-muted-foreground">{plan.changes.new} bài mới</span>}
                </p>
                <p className="text-caption text-muted-foreground">So theo giá trị đã làm tròn, với lần ghi trước của cùng phiên.</p>
                {plan.changes.downByCause.length > 0 && (
                  <p>Giảm do: {plan.changes.downByCause.map(causeTallyText).join(', ')}</p>
                )}
                {plan.changes.upByCause.length > 0 && (
                  <p>Tăng do: {plan.changes.upByCause.map(causeTallyText).join(', ')}</p>
                )}
              </section>
            )}

            <div className="flex flex-wrap gap-2">
              {(Object.keys(ROW_FILTER_LABEL) as RowFilter[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  aria-pressed={filter === f}
                  onClick={() => setFilter(f)}
                  className={`rounded-full border px-3 py-1.5 text-small ${filter === f ? 'border-accent bg-accent-subtle font-semibold text-accent-strong' : 'border-border bg-surface hover:bg-surface-2'}`}
                >
                  {ROW_FILTER_LABEL[f]} · {counts![f]}
                </button>
              ))}
            </div>

            <div className="overflow-x-auto rounded-lg border border-border bg-surface">
              <Table aria-label="Từng dòng của file">
                <TableHeader>
                  <TableRow>
                    <TableHead>Dòng</TableHead>
                    <TableHead>MSSV</TableHead>
                    <TableHead>Họ tên</TableHead>
                    <TableHead className="text-right">Điểm hệ thống</TableHead>
                    <TableHead>Giá trị sẽ ghi</TableHead>
                    <TableHead>Ghi chú</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.slice(0, SHOWN_ROWS).map((r) => (
                    <PlanRowLine key={r.row} r={r} />
                  ))}
                </TableBody>
              </Table>
            </div>
            {visible.length > SHOWN_ROWS && <p className="text-caption text-muted-foreground">Đang hiện {SHOWN_ROWS}/{visible.length} dòng — dùng bộ lọc để xem phần còn lại.</p>}

            {overwriteNeeded && (
              <label className="flex cursor-pointer items-start gap-2 text-small">
                <input type="checkbox" className="mt-0.5 h-4 w-4" checked={overwriteAck} onChange={(e) => setOverwriteAck(e.target.checked)} />
                <span>Tôi đồng ý ghi đè {overwriteCount} ô đã có giá trị</span>
              </label>
            )}
            {down > 0 && (
              <label className="flex cursor-pointer items-start gap-2 text-small">
                <input type="checkbox" className="mt-0.5 h-4 w-4" checked={decreaseAck} onChange={(e) => setDecreaseAck(e.target.checked)} />
                <span>Tôi đã xem {down} bài bị giảm điểm và đồng ý ghi</span>
              </label>
            )}
          </>
        )}

        {write.error && (
          <Alert variant="destructive">
            <AlertDescription>{write.error.message}</AlertDescription>
          </Alert>
        )}

        {write.data ? (
          <div className="flex flex-col gap-3">
            <Alert variant="success" role="status">
              <AlertDescription>
                Đã ghi {write.data.summary.written} điểm vào file. {write.data.summary.blank + write.data.summary.kept} ô để trống
                {write.data.summary.kept > 0 ? ` (${write.data.summary.kept} ô giữ nguyên)` : ''}, {write.data.summary.unmatched} dòng không khớp
                {write.data.summary.decreased > 0 ? `; ${write.data.summary.decreased} bài giảm điểm đã được bạn xác nhận` : ''}.
              </AlertDescription>
            </Alert>
            <Button asChild className="self-start">
              <a href={write.data.downloadUrl} rel="noopener">
                <Download className="h-4 w-4" aria-hidden="true" />
                Tải file đã ghi ({write.data.fileName})
              </a>
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" variant="outline" onClick={onBack} disabled={write.isPending}>
                Quay lại chọn cột
              </Button>
              {plan && hasBlankReport(plan) && (
                <Button type="button" variant="outline" onClick={() => downloadCsv(blankReportCsv(plan), blankReportFilename(sessionName, sessionCode))}>
                  <Download className="h-4 w-4" aria-hidden="true" />
                  Tải bảng kê ô trống (CSV)
                </Button>
              )}
              {write.error && step !== null && (
                <Button type="button" variant="outline" onClick={() => loadPreview(step)}>
                  Xem trước lại
                </Button>
              )}
              <Button type="button" loading={write.isPending} disabled={!gate.enabled} onClick={submit}>
                Ghi vào file
              </Button>
            </div>
            {!gate.enabled && (
              <ul className="flex flex-col gap-0.5 text-caption text-muted-foreground">
                {gate.reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    );
  }

  function PlanRowLine({ r }: { r: PlanRowView }) {
    const Icon = ACTION_ICON[r.action];
    const change = directionText(r);
    return (
      <TableRow>
        <TableCell className="tabular-nums">{r.row}</TableCell>
        <TableCell className="font-mono">{r.studentMssv ?? r.mssvInFile}</TableCell>
        <TableCell>{r.studentName ?? '—'}</TableCell>
        <TableCell className="text-right tabular-nums">{scoreText(r.systemScore)}</TableCell>
        <TableCell>
          {r.action === 'write' ? (
            <span className="flex items-center gap-1.5 font-semibold tabular-nums">
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              {scoreText(r.writtenScore)}
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              {ACTION_LABEL[r.action]}
            </span>
          )}
        </TableCell>
        <TableCell className="max-w-[360px] text-small text-muted-foreground">
          {r.blankLabel && <span className="block">{r.blankLabel}</span>}
          {change && <span className="block">{change}</span>}
          {r.note && <span className="block">{r.note}</span>}
        </TableCell>
      </TableRow>
    );
  }
  ```

  `PreviousExports.tsx`:

  ```tsx
  'use client';

  import { Alert, AlertDescription } from '@/components/ui/alert';
  import { Button } from '@/components/ui/button';
  import { Skeleton } from '@/components/ui/skeleton';
  import { useExportDownload, useGradeExports } from '@/hooks/useGradeExport';
  import { roundingText } from '@/lib/grade-export-view';

  const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('vi-VN') : '—');

  /** Các lượt xuất trước của phiên (§13.1 luật 2): mỗi lượt là một hồ sơ chỉ-thêm — ai, cột nào, làm tròn ra sao, bao nhiêu điểm. */
  export function PreviousExports({ sessionId }: { sessionId: string }) {
    const list = useGradeExports(sessionId);
    const download = useExportDownload();

    return (
      <section aria-label="Các lượt xuất trước" className="flex flex-col gap-3">
        <h2 className="text-small font-semibold">Các lượt xuất trước</h2>
        {list.isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : list.error ? (
          <Alert variant="destructive">
            <AlertDescription>{list.error.message}</AlertDescription>
          </Alert>
        ) : (list.data ?? []).length === 0 ? (
          <p className="text-small text-muted-foreground">Chưa có lượt xuất nào cho phiên này.</p>
        ) : (
          <ul aria-label="Các lượt xuất trước" className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface">
            {list.data!.map((e) => (
              <li key={e.id} className="flex flex-wrap items-start justify-between gap-3 p-3 text-small">
                <div className="flex flex-col gap-0.5">
                  <span className="font-medium">{e.templateFileName ?? e.outputFileName ?? 'Sổ điểm'}</span>
                  <span className="text-caption text-muted-foreground">
                    {when(e.exportedAt)} · {e.exportedByName} · Trang tính {e.sheetName ?? '—'}
                    {e.deliverableName ? ` · Yêu cầu nộp ${e.deliverableName}` : ''}
                  </span>
                  <span className="text-caption text-muted-foreground">
                    MSSV cột {e.mssvColumn} · điểm cột {e.scoreColumn}
                    {e.reasonColumn ? ` · lý do cột ${e.reasonColumn}` : ''} · {roundingText(e.roundingStepHundredths)}
                  </span>
                  <span className="text-caption text-muted-foreground">
                    {e.written} điểm đã ghi · {e.blank} ô để trống · {e.unmatched} không khớp
                    {e.overwritten > 0 ? ` · ${e.overwritten} ô ghi đè` : ''}
                  </span>
                  {e.decreased > 0 && (
                    <span className="text-caption font-semibold">
                      ↓ {e.decreased} bài giảm điểm — {e.decreaseConfirmedBy ?? 'người dùng'} đã xác nhận
                    </span>
                  )}
                </div>
                <Button type="button" variant="outline" size="sm" disabled={download.isPending} onClick={() => download.mutate(e.id, { onSuccess: (d) => window.open(d.downloadUrl, '_blank', 'noopener') })}>
                  Tải file
                </Button>
              </li>
            ))}
          </ul>
        )}
        {download.error && (
          <Alert variant="destructive">
            <AlertDescription>{download.error.message}</AlertDescription>
          </Alert>
        )}
      </section>
    );
  }
  ```

  ```bash
  pnpm --filter web exec vitest run src/app/teacher/grading/export/_components
  pnpm --filter web exec tsc --noEmit
  pnpm --filter web exec eslint src/app/teacher/grading/export/_components
  ```

  Expected: `StepPreview` **23 passed**, `PreviousExports` **6 passed**, the two earlier components unchanged; `tsc` shows only the 7 known lines; eslint 0 errors. Things most likely to need a second look: (a) the `radio` accessible names — each `<label>` wraps the input, so `getByRole('radio', { name: '0,5' })` works; the test that maps `aria-label ?? closest('label').textContent` relies on that; (b) `getByRole('group', { name: /Sinh viên có trong phiên…/ })` — a `<details role="group" aria-label=…>` is exposed as a group with that name; (c) the write button is inside `write.data ? … : …`, so after a successful write it is gone (asserted).

- [ ] **Step 3: commit.** Title: `feat(web): bước xem trước và ghi — làm tròn không chọn sẵn, ghi đè và điểm giảm mỗi cái một dấu tick, bảng kê ô trống; danh sách lượt xuất trước`.


---

### Task 15: the wizard, the page, and the real entry point in the finalize panel

**Files:** create `apps/web/src/app/teacher/grading/export/_components/ExportWizard.tsx`, `ExportWizard.test.tsx`, `apps/web/src/app/teacher/grading/export/page.tsx`, `page.test.tsx`; modify `apps/web/src/app/teacher/grading/_components/FinalizePanel.tsx`, `FinalizePanel.test.tsx`.

**Interfaces**
- Consumes: `StepUpload`, `StepColumns`, `StepPreview`, `PreviousExports` (Tasks 13–14), `useInspectTemplate` (Task 12), `EMPTY_CHOICE`, `toPlanBase`, `ColumnChoice`, `useGradingResults`, `useSessionOverview`, `stateOf`.
- Produces:
  - `ExportWizard({ sessionId, sessionName, sessionCode })`.
  - The route `/teacher/grading/export?sessionId=…` (a `default export` page).
  - A real *Mở màn ghi điểm* link in `FinalizePanel` in place of the dashed *"tính năng dự kiến"* block.

**Existing tests that encode the old behaviour (read before editing; never weaken):**

| Test | Today | After |
|---|---|---|
| `FinalizePanel.test.tsx:149-155` — *"offers the CSV export only now, and the score-book writing as a 'cần backend' placeholder that sends nothing"* | asserts the block is a placeholder with no button | **replaced**: the block is a real region with a link to the export route and **no** *cần backend* |
| `FinalizePanel.test.tsx:128-132` — *"does not offer the score export or the reapply panel before the session is finalised"* | asserts two things absent | **kept**, plus one assertion that the gradebook region is absent too (spec §3.10: the entry opens only after finalizing) |

- [ ] **Step 1: RED — `ExportWizard.test.tsx`.**

  ```tsx
  import { beforeEach, describe, expect, it, vi } from 'vitest';
  import { fireEvent, render, screen } from '@testing-library/react';
  import '@testing-library/jest-dom/vitest';
  import { ExportWizard } from './ExportWizard';
  import type { InspectResponse } from '@/lib/api/grade-export';

  const reinspect = vi.fn();
  let reinspectState: { isPending: boolean; error: Error | null };
  vi.mock('@/hooks/useGradeExport', () => ({ useInspectTemplate: () => ({ mutate: reinspect, ...reinspectState }) }));

  const oneSheet: InspectResponse = {
    templateId: 't1', fileSizeBytes: 1, sheets: [{ name: 'Bảng điểm', hidden: false }], deliverables: [],
    sheet: { name: 'Bảng điểm', rowCount: 3, columnCount: 3, protected: false, fromRow: 1, hasMore: false, columns: ['A', 'B', 'C'], rows: [] },
  };
  const manySheets: InspectResponse = { ...oneSheet, sheets: [{ name: 'Bảng điểm', hidden: false }, { name: 'Sheet2', hidden: false }], sheet: null };
  let uploaded: InspectResponse;

  // Bốn bước con được thay bằng cái vỏ chỉ để lái luồng; từng bước có test riêng ở Task 13–14.
  vi.mock('./StepUpload', () => ({
    StepUpload: (p: { onInspected: (r: { templateId: string; fileName: string; inspect: InspectResponse }) => void }) => (
      <button onClick={() => p.onInspected({ templateId: 't1', fileName: 'Sổ điểm N01.xlsx', inspect: uploaded })}>stub-upload</button>
    ),
  }));
  vi.mock('./StepColumns', () => ({
    StepColumns: (p: {
      choice: unknown;
      busy: boolean;
      onChange: (patch: object) => void;
      onSelectSheet: (name: string) => void;
      onLoadRows: (row: number) => void;
      onNext: () => void;
    }) => (
      <div>
        <span data-testid="choice">{JSON.stringify(p.choice)}</span>
        <span data-testid="busy">{String(p.busy)}</span>
        <button onClick={() => p.onChange({ mssvColumn: 'B', scoreColumn: 'C', firstDataRow: 3 })}>stub-choose</button>
        <button onClick={() => p.onSelectSheet('Sheet2')}>stub-sheet</button>
        <button onClick={() => p.onLoadRows(41)}>stub-page</button>
        <button onClick={p.onNext}>stub-next</button>
      </div>
    ),
  }));
  vi.mock('./StepPreview', () => ({
    StepPreview: (p: { request: unknown; templateFileName: string; sessionName: string; onBack: () => void }) => (
      <div>
        <span data-testid="request">{JSON.stringify(p.request)}</span>
        <span data-testid="file">{p.templateFileName}</span>
        <span data-testid="session">{p.sessionName}</span>
        <button onClick={p.onBack}>stub-back</button>
      </div>
    ),
  }));
  vi.mock('./PreviousExports', () => ({ PreviousExports: () => <div data-testid="previous" /> }));

  const setup = () => render(<ExportWizard sessionId="s1" sessionName="Giữa kỳ N01" sessionCode="GK-N01" />);
  const current = () => screen.getByRole('listitem', { current: 'step' });

  beforeEach(() => {
    reinspect.mockReset();
    reinspectState = { isPending: false, error: null };
    uploaded = oneSheet;
  });

  describe('ExportWizard', () => {
    it('starts on step 1, names all three steps, and always shows the earlier exports', () => {
      setup();
      const steps = screen.getByRole('list', { name: 'Các bước' });
      expect(steps).toHaveTextContent('Tải file');
      expect(steps).toHaveTextContent('Chọn cột');
      expect(steps).toHaveTextContent('Xem trước và ghi');
      expect(current()).toHaveTextContent('Tải file');
      expect(screen.getByRole('button', { name: 'stub-upload' })).toBeInTheDocument();
      expect(screen.getByTestId('previous')).toBeInTheDocument();
    });

    it('after the upload it moves to step 2; a single-sheet file has its sheet chosen, nothing else is', () => {
      setup();
      fireEvent.click(screen.getByRole('button', { name: 'stub-upload' }));
      expect(current()).toHaveTextContent('Chọn cột');
      expect(JSON.parse(screen.getByTestId('choice').textContent!)).toEqual({
        sheetName: 'Bảng điểm', firstDataRow: null, mssvColumn: '', scoreColumn: '', reasonColumn: '', deliverableId: '',
      });
    });

    it('a file with several sheets starts with NO sheet chosen', () => {
      uploaded = manySheets;
      setup();
      fireEvent.click(screen.getByRole('button', { name: 'stub-upload' }));
      expect(JSON.parse(screen.getByTestId('choice').textContent!).sheetName).toBe('');
    });

    it('a choice is merged into the state and carried to step 3 as the request base — with the file name', () => {
      setup();
      fireEvent.click(screen.getByRole('button', { name: 'stub-upload' }));
      fireEvent.click(screen.getByRole('button', { name: 'stub-choose' }));
      fireEvent.click(screen.getByRole('button', { name: 'stub-next' }));
      expect(current()).toHaveTextContent('Xem trước và ghi');
      expect(JSON.parse(screen.getByTestId('request').textContent!)).toEqual({
        templateId: 't1', sheetName: 'Bảng điểm', firstDataRow: 3, mssvColumn: 'B', scoreColumn: 'C',
      });
      expect(screen.getByTestId('file')).toHaveTextContent('Sổ điểm N01.xlsx');
      expect(screen.getByTestId('session')).toHaveTextContent('Giữa kỳ N01');
    });

    it('going back from step 3 keeps what was chosen', () => {
      setup();
      fireEvent.click(screen.getByRole('button', { name: 'stub-upload' }));
      fireEvent.click(screen.getByRole('button', { name: 'stub-choose' }));
      fireEvent.click(screen.getByRole('button', { name: 'stub-next' }));
      fireEvent.click(screen.getByRole('button', { name: 'stub-back' }));
      expect(current()).toHaveTextContent('Chọn cột');
      expect(JSON.parse(screen.getByTestId('choice').textContent!)).toMatchObject({ mssvColumn: 'B', scoreColumn: 'C', firstDataRow: 3 });
    });

    it('changing the sheet RESETS the columns (letters mean something else there) and reads that sheet', () => {
      setup();
      fireEvent.click(screen.getByRole('button', { name: 'stub-upload' }));
      fireEvent.click(screen.getByRole('button', { name: 'stub-choose' }));
      fireEvent.click(screen.getByRole('button', { name: 'stub-sheet' }));
      expect(reinspect).toHaveBeenCalledWith({ templateId: 't1', sheetName: 'Sheet2' }, expect.objectContaining({ onSuccess: expect.any(Function) }));
      expect(JSON.parse(screen.getByTestId('choice').textContent!)).toEqual({
        sheetName: 'Sheet2', firstDataRow: null, mssvColumn: '', scoreColumn: '', reasonColumn: '', deliverableId: '',
      });
    });

    it('paging asks the server for rows from that line of the same sheet', () => {
      setup();
      fireEvent.click(screen.getByRole('button', { name: 'stub-upload' }));
      fireEvent.click(screen.getByRole('button', { name: 'stub-page' }));
      expect(reinspect).toHaveBeenCalledWith({ templateId: 't1', sheetName: 'Bảng điểm', fromRow: 41 }, expect.any(Object));
    });

    it('locks step 2 while another page is loading, and shows a failure verbatim', () => {
      reinspectState = { isPending: true, error: new Error('Không thấy trang tính "Sheet9" trong file.') };
      setup();
      fireEvent.click(screen.getByRole('button', { name: 'stub-upload' }));
      expect(screen.getByTestId('busy')).toHaveTextContent('true');
      expect(screen.getByRole('alert')).toHaveTextContent('Không thấy trang tính "Sheet9" trong file.');
    });

    it('"Chọn file khác" goes back to step 1 and forgets the file', () => {
      setup();
      fireEvent.click(screen.getByRole('button', { name: 'stub-upload' }));
      fireEvent.click(screen.getByRole('button', { name: 'Chọn file khác' }));
      expect(current()).toHaveTextContent('Tải file');
      expect(screen.getByRole('button', { name: 'stub-upload' })).toBeInTheDocument();
    });
  });
  ```

  Create `apps/web/src/app/teacher/grading/export/page.test.tsx`:

  ```tsx
  import { beforeEach, describe, expect, it, vi } from 'vitest';
  import { render, screen } from '@testing-library/react';
  import '@testing-library/jest-dom/vitest';
  import ExportPage from './page';
  import type { GradingResult } from '@/lib/api/grading';

  let query = 'sessionId=s1';
  vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(query) }));
  let overview: { data?: { id: string; name: string; code: string }[]; isLoading: boolean };
  let results: { data?: GradingResult[]; isLoading: boolean; isError: boolean; error: Error | null };
  vi.mock('@/hooks/useSubmissionOverview', () => ({ useSessionOverview: () => overview }));
  vi.mock('@/hooks/useGrading', () => ({ useGradingResults: () => results }));
  vi.mock('./_components/ExportWizard', () => ({
    ExportWizard: (p: { sessionId: string; sessionName: string; sessionCode: string }) => (
      <div data-testid="wizard">{`${p.sessionId}|${p.sessionName}|${p.sessionCode}`}</div>
    ),
  }));

  const result = (status: string, id = status): GradingResult => ({
    id, submissionId: id, studentMssv: id, studentName: id, homeClassId: 'c', homeClassName: 'N01', status, modelUsed: null, aiTotalScore: null,
    confidence: null, flagForReview: false, ungradableReason: null, criterionResults: [], advocateOpinion: null, contextUsedQuestion: null,
    contextUsedModelAnswer: null, finalScore: null, reviewedAt: null, reviewedByName: null, editedCriteria: null, pipeline: 'investigator',
    currentScore: 8, currentScoreSource: 'finalized',
  });

  beforeEach(() => {
    query = 'sessionId=s1';
    overview = { data: [{ id: 's1', name: 'Giữa kỳ N01', code: 'GK-N01' }], isLoading: false };
    results = { data: [result('finalized', 'a'), result('exported', 'b')], isLoading: false, isError: false, error: null };
  });

  describe('/teacher/grading/export', () => {
    it('without a session it asks for one', () => {
      query = '';
      render(<ExportPage />);
      expect(screen.getByText(/Chưa chọn phiên thi/)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Chọn phiên' })).toHaveAttribute('href', '/teacher/grading');
    });

    it('an unknown session is an error with a way out', () => {
      overview = { data: [], isLoading: false };
      render(<ExportPage />);
      expect(screen.getByRole('alert')).toHaveTextContent('Không tìm thấy phiên thi này.');
    });

    it('shows a results failure verbatim', () => {
      results = { data: undefined, isLoading: false, isError: true, error: new Error('Không tải được.') };
      render(<ExportPage />);
      expect(screen.getByRole('alert')).toHaveTextContent('Không tải được kết quả chấm — Không tải được.');
    });

    it('a session with nothing graded has nothing to write', () => {
      results = { data: [], isLoading: false, isError: false, error: null };
      render(<ExportPage />);
      expect(screen.getByText(/Chưa chấm bài nào/)).toBeInTheDocument();
      expect(screen.queryByTestId('wizard')).not.toBeInTheDocument();
    });

    // Spec §3.10: ghi file trước khi chốt là đưa ra ngoài một con số chưa công bố.
    it('a session that is not fully finalised is sent to the finalize screen — the wizard is not shown', () => {
      results = { data: [result('finalized', 'a'), result('teacher_reviewed', 'b')], isLoading: false, isError: false, error: null };
      render(<ExportPage />);
      expect(screen.getByText('Phiên chưa chốt điểm — chốt điểm trước rồi mới ghi vào sổ điểm.')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Đi tới màn chốt điểm' })).toHaveAttribute('href', '/teacher/grading/finalize?sessionId=s1');
      expect(screen.queryByTestId('wizard')).not.toBeInTheDocument();
    });

    it('a finalised session (finalized or exported) gets the wizard, with the session name and code', () => {
      render(<ExportPage />);
      expect(screen.getByTestId('wizard')).toHaveTextContent('s1|Giữa kỳ N01|GK-N01');
      expect(screen.getByRole('heading', { name: 'Ghi điểm vào sổ điểm' })).toBeInTheDocument();
    });
  });
  ```

  In `FinalizePanel.test.tsx` **replace** the test at lines 149-155 (`offers the CSV export only now, and the score-book writing as a "cần backend" placeholder that sends nothing`, seven lines) with:

  ```tsx
  it('offers the CSV export and a REAL entry to the gradebook screen — no "cần backend" placeholder', () => {
    renderPanel(finalised());
    expect(screen.getByRole('button', { name: 'Xuất CSV' })).toBeEnabled();
    const block = screen.getByRole('region', { name: 'Ghi điểm vào sổ điểm' });
    expect(within(block).getByRole('link', { name: 'Mở màn ghi điểm' })).toHaveAttribute('href', '/teacher/grading/export?sessionId=s1');
    expect(within(block).queryByText('cần backend')).not.toBeInTheDocument();
  });
  ```

  and in the test at `:128-132` add one line after `expect(screen.queryByTestId('reapply-panel')).not.toBeInTheDocument();`:

  ```tsx
    expect(screen.queryByRole('region', { name: 'Ghi điểm vào sổ điểm' })).not.toBeInTheDocument();
  ```

  ```bash
  pnpm --filter web exec vitest run src/app/teacher/grading/export/_components/ExportWizard.test.tsx src/app/teacher/grading/export/page.test.tsx src/app/teacher/grading/_components/FinalizePanel.test.tsx
  ```

  Expected: **RED** — the two new suites cannot resolve `./ExportWizard` / `./page`; in `FinalizePanel.test.tsx` the replaced case fails on `getByRole('link', { name: 'Mở màn ghi điểm' })` (the block is still the dashed placeholder).

- [ ] **Step 2: GREEN — `ExportWizard.tsx`.**

  ```tsx
  'use client';

  import { useState } from 'react';
  import { Alert, AlertDescription } from '@/components/ui/alert';
  import { Button } from '@/components/ui/button';
  import { useInspectTemplate } from '@/hooks/useGradeExport';
  import type { InspectResponse } from '@/lib/api/grade-export';
  import { EMPTY_CHOICE, toPlanBase, type ColumnChoice } from '@/lib/grade-export-view';
  import { PreviousExports } from './PreviousExports';
  import { StepColumns } from './StepColumns';
  import { StepPreview } from './StepPreview';
  import { StepUpload } from './StepUpload';

  const STEPS = ['Tải file', 'Chọn cột', 'Xem trước và ghi'] as const;

  /**
   * Ba bước ghi điểm vào sổ điểm (spec §3.6) và trạng thái chung của chúng. Đổi trang tính thì XOÁ lựa chọn cột (chữ
   * cột nghĩa khác ở trang khác); quay lại từ bước 3 thì GIỮ nguyên. Các lượt xuất trước luôn hiện ở dưới.
   */
  export function ExportWizard({ sessionId, sessionName, sessionCode }: { sessionId: string; sessionName: string; sessionCode: string }) {
    const [step, setStep] = useState<1 | 2 | 3>(1);
    const [template, setTemplate] = useState<{ templateId: string; fileName: string } | null>(null);
    const [inspect, setInspect] = useState<InspectResponse | null>(null);
    const [choice, setChoice] = useState<ColumnChoice>(EMPTY_CHOICE);
    const reinspect = useInspectTemplate(sessionId);

    const load = (body: { sheetName: string; fromRow?: number }) =>
      reinspect.mutate({ templateId: template!.templateId, ...body }, { onSuccess: (result) => setInspect(result) });

    return (
      <div className="flex flex-col gap-8">
        <ol aria-label="Các bước" className="flex flex-wrap gap-x-6 gap-y-2 text-small">
          {STEPS.map((label, i) => (
            <li key={label} aria-current={step === i + 1 ? 'step' : undefined} className={step === i + 1 ? 'font-semibold' : 'text-muted-foreground'}>
              {i + 1}. {label}
            </li>
          ))}
        </ol>

        {reinspect.error && (
          <Alert variant="destructive">
            <AlertDescription>{reinspect.error.message}</AlertDescription>
          </Alert>
        )}

        {step === 1 && (
          <StepUpload
            sessionId={sessionId}
            onInspected={(r) => {
              setTemplate({ templateId: r.templateId, fileName: r.fileName });
              setInspect(r.inspect);
              // Chỉ khi file có ĐÚNG MỘT trang tính (server đã trả lưới) thì trang đó được chọn; cột thì không bao giờ.
              setChoice({ ...EMPTY_CHOICE, sheetName: r.inspect.sheet?.name ?? '' });
              setStep(2);
            }}
          />
        )}

        {step === 2 && inspect && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-caption text-muted-foreground">File: {template?.fileName}</p>
              <Button type="button" variant="ghost" size="sm" onClick={() => setStep(1)}>
                Chọn file khác
              </Button>
            </div>
            <StepColumns
              inspect={inspect}
              choice={choice}
              busy={reinspect.isPending}
              onChange={(patch) => setChoice((current) => ({ ...current, ...patch }))}
              onSelectSheet={(name) => {
                setChoice({ ...EMPTY_CHOICE, sheetName: name });
                if (name) load({ sheetName: name });
              }}
              onLoadRows={(fromRow) => load({ sheetName: choice.sheetName, fromRow })}
              onNext={() => setStep(3)}
            />
          </div>
        )}

        {step === 3 && template && (
          <StepPreview
            sessionId={sessionId}
            sessionName={sessionName}
            sessionCode={sessionCode}
            templateFileName={template.fileName}
            request={toPlanBase(template.templateId, choice)}
            onBack={() => setStep(2)}
          />
        )}

        <PreviousExports sessionId={sessionId} />
      </div>
    );
  }
  ```

- [ ] **Step 3: GREEN — the page.** Create `apps/web/src/app/teacher/grading/export/page.tsx`:

  ```tsx
  'use client';

  import { Suspense } from 'react';
  import Link from 'next/link';
  import { useSearchParams } from 'next/navigation';
  import { ArrowLeft } from 'lucide-react';
  import { Alert, AlertDescription } from '@/components/ui/alert';
  import { Skeleton } from '@/components/ui/skeleton';
  import { useGradingResults } from '@/hooks/useGrading';
  import { useSessionOverview } from '@/hooks/useSubmissionOverview';
  import { stateOf } from '@/lib/session-triage';
  import { ExportWizard } from './_components/ExportWizard';

  /**
   * Ghi điểm vào sổ điểm (spec §3.6) — trang RIÊNG, và chỉ mở khi phiên đã chốt hết (§3.10: ghi file trước khi chốt là
   * đưa ra ngoài một con số chưa công bố). API lỏng hơn (từng sinh viên chỉ được ghi khi bài của họ đã chốt); trang này
   * theo luật chặt của giao diện. `useSearchParams` đòi ranh giới Suspense khi build tĩnh.
   */
  export default function ExportPage() {
    return (
      <Suspense fallback={<Skeleton className="h-40 w-full" />}>
        <ExportContent />
      </Suspense>
    );
  }

  function ExportContent() {
    const sessionId = useSearchParams().get('sessionId') ?? '';
    const overview = useSessionOverview();
    const results = useGradingResults(sessionId || undefined);
    const session = overview.data?.find((s) => s.id === sessionId);

    if (!sessionId) {
      return (
        <p className="text-small text-muted-foreground">
          Chưa chọn phiên thi.{' '}
          <Link href="/teacher/grading" className="font-semibold underline underline-offset-2">
            Chọn phiên
          </Link>
        </p>
      );
    }
    if (!session) {
      if (overview.isLoading) return <Skeleton className="h-40 w-full" />;
      return (
        <Alert variant="destructive">
          <AlertDescription>
            Không tìm thấy phiên thi này.{' '}
            <Link href="/teacher/grading" className="font-semibold underline underline-offset-2">
              Chọn phiên khác
            </Link>
          </AlertDescription>
        </Alert>
      );
    }

    const list = results.data ?? [];
    const allFinal = list.length > 0 && list.every((r) => stateOf(r) === 'finalised');

    return (
      <div className="flex flex-col gap-6">
        <nav aria-label="Vị trí" className="flex items-center gap-1.5 text-caption text-muted-foreground">
          <Link href={`/teacher/grading?sessionId=${sessionId}`} className="flex items-center gap-1 hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Chấm điểm
          </Link>
          <span aria-hidden="true">›</span>
          <span>{session.name}</span>
        </nav>
        <h1 className="text-h1">Ghi điểm vào sổ điểm</h1>

        {results.isError ? (
          <Alert variant="destructive">
            <AlertDescription>Không tải được kết quả chấm — {results.error?.message}. Thử tải lại trang.</AlertDescription>
          </Alert>
        ) : results.isLoading || !results.data ? (
          <Skeleton className="h-40 w-full" />
        ) : list.length === 0 ? (
          <p className="text-small text-muted-foreground">
            Chưa chấm bài nào — chưa có điểm để ghi.{' '}
            <Link href={`/teacher/grading?sessionId=${sessionId}`} className="font-semibold underline underline-offset-2">
              Về danh sách bài
            </Link>
          </p>
        ) : !allFinal ? (
          <Alert variant="info">
            <AlertDescription>
              Phiên chưa chốt điểm — chốt điểm trước rồi mới ghi vào sổ điểm.{' '}
              <Link href={`/teacher/grading/finalize?sessionId=${sessionId}`} className="font-semibold underline underline-offset-2">
                Đi tới màn chốt điểm
              </Link>
            </AlertDescription>
          </Alert>
        ) : (
          <ExportWizard sessionId={sessionId} sessionName={session.name} sessionCode={session.code} />
        )}
      </div>
    );
  }
  ```

- [ ] **Step 4: GREEN — the entry in `FinalizePanel.tsx`.** Replace exactly

  ```tsx
            <section
              aria-label="Ghi điểm vào sổ điểm"
              className="flex flex-col gap-1 rounded-lg border border-dashed border-border p-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-small font-semibold">Ghi điểm vào sổ điểm — tính năng dự kiến</h2>
                <NeedsBackend />
              </div>
              <p className="text-caption text-muted-foreground">
                Tải file sổ điểm của trường, chọn cột, xem trước rồi ghi. Chỉ mở sau khi chốt. Hôm nay dùng &quot;Xuất
                CSV&quot; ở trên.
              </p>
            </section>
  ```

  with

  ```tsx
            <section aria-label="Ghi điểm vào sổ điểm" className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4">
              <h2 className="text-small font-semibold">Ghi điểm vào sổ điểm</h2>
              <p className="text-caption text-muted-foreground">
                Tải file sổ điểm của bạn (.xlsx), chọn cột, xem trước rồi ghi. Hệ thống chỉ điền các ô bạn chọn — mọi ô khác
                giữ nguyên.
              </p>
              <Button asChild size="sm" className="self-start">
                <Link href={`/teacher/grading/export?sessionId=${sessionId}`}>Mở màn ghi điểm</Link>
              </Button>
            </section>
  ```

  **Keep** `import { NeedsBackend } from '@/components/needs-backend';` — the *blocking groups* list (`{g.needsBackend && <NeedsBackend />}`) still uses it on this branch. G4 removes that usage; **whoever merges the second of G4/G5 removes the then-unused import** (eslint reports it).

  ```bash
  pnpm --filter web exec vitest run src/app/teacher/grading/export src/app/teacher/grading/_components/FinalizePanel.test.tsx
  pnpm --filter web exec tsc --noEmit
  pnpm --filter web exec eslint src/app/teacher/grading/export src/app/teacher/grading/_components/FinalizePanel.tsx src/app/teacher/grading/_components/FinalizePanel.test.tsx
  ```

  Expected: `ExportWizard` **9 passed**, `page` **6 passed**, `FinalizePanel` green with the one replaced test (net 0), the four earlier component suites unchanged; `tsc` shows only the 7 known lines; eslint 0 errors. `getByRole('listitem', { current: 'step' })` relies on `aria-current="step"` on the `li`; if RTL rejects the `current` filter, use `screen.getAllByRole('listitem').find((li) => li.getAttribute('aria-current') === 'step')`.

- [ ] **Step 5: commit.** Title: `feat(web): màn ghi điểm vào sổ điểm ba bước; lối vào thật ở màn chốt điểm thay khối "dự kiến"`.

---

### Task 16: full verification, the ledger, and an honest report

**Files:** `docs/superpowers/ledgers/2026-09-29-gradebook-export.md` (create, committed — this one is a deliverable, unlike the in-progress ledger).

- [ ] **Step 1: Backend unit tests.**

  ```bash
  pnpm --filter api exec jest
  ```

  Expected: the whole suite green. Baseline on `feat/grading-gaps-g1-g5` is 1167 passing, 7 skipped (pre-existing); this package adds the specs of `src/grade-export/` (zip-io 11, xml-text 15, workbook-reader 16, sheet-patch 31, score-string 10, rounding 24, blank-reason 11, mssv-match 10, diff-rules 14, plan 24, names 5, errors 10, inspect-grid 5). A lower total than the baseline is a regression — re-run before concluding.

- [ ] **Step 2: Backend e2e — this package's suites plus the neighbours.** Kill stray workers first (they eat BullMQ jobs from a shared Redis):

  ```bash
  # List jest workers; stop ONLY the ones whose command line shows THIS worktree's path, by PID (Stop-Process -Id <pid>).
  # Never `taskkill /IM node.exe`: it also kills the jest runs and dev servers of every other session on this machine.
  powershell.exe -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -match 'jest' } | Select-Object ProcessId, CommandLine"
  ```

  ```bash
  pnpm --filter api exec jest --config ./test/jest-e2e.json test/grade-export-schema.e2e-spec.ts test/grade-export-data.e2e-spec.ts test/grade-export-inspect.e2e-spec.ts test/grade-export-preview.e2e-spec.ts test/grade-export.e2e-spec.ts test/grade-export-list.e2e-spec.ts
  pnpm --filter api exec jest --config ./test/jest-e2e.json test/grading-lifecycle-v2.e2e-spec.ts test/finalize-investigator.e2e-spec.ts test/score-service.e2e-spec.ts test/error-exception.e2e-spec.ts test/grading-reference.e2e-spec.ts
  pnpm --filter api exec jest --config ./test/jest-e2e.json
  ```

  Expected: this package's six suites **58 passed** (7 + 8 + 11 + 17 + 9 + 6); the neighbours green **unmodified**; the full run green. Compare the full-run totals with the baseline in `.superpowers/sdd/2026-09-29-grading-truth-debts/progress.md` (read it; do not guess) plus this package's six suites. The neighbours matter for two reasons: `grade_export` now has an append-only trigger, and `seedFinalizedBase` calls `finalizeGrades` and `reapplyFinalizedSession` — the very code `finalize-investigator` exercises.

- [ ] **Step 3: Web tests, typecheck, lint, cycles, build.**

  ```bash
  pnpm --filter web exec vitest run
  pnpm --filter web exec tsc --noEmit > tsc-g5.txt
  pnpm --filter web exec eslint src
  pnpm --filter api exec eslint src test
  pnpm check:cycles
  pnpm --filter web run build
  ```

  Expected: vitest green (G1 baseline: 96 files / 1190 tests; this package adds `grade-export-view` (35), `StepUpload` (8), `StepColumns` (18), `StepPreview` (23), `PreviousExports` (6), `ExportWizard` (9), `export/page` (6); `FinalizePanel` net 0); `tsc-g5.txt` is **byte-identical** to the G1 baseline — 7 lines, all in `src/lib/read-workbook.test.ts`, any other line is a regression from this package; eslint 0 errors; `0 vòng lặp`; **one** `next build`, and it must list the route `/teacher/grading/export`. Delete `tsc-g5.txt` afterwards.

- [ ] **Step 4: Four mechanical guards.**

  ```bash
  cd "C:/Users/Admin/Main/Desktop/HKI 2026-2027/KLTN/CINE/.claude/worktrees/grading-g5-gradebook"
  # 1. No float near a score. Every hit must be a row / column / index, never a score string.
  grep -rnE "parseFloat|Number\(" apps/api/src/grade-export --include=*.ts --exclude=*.spec.ts --exclude-dir=testing
  # 2. exceljs is never imported by the API.
  grep -rn "exceljs" apps/api/src apps/api/package.json
  # 3. yauzl / jszip are imported by exactly one production file.
  grep -rlE "from 'jszip'|from 'yauzl'|import \* as yauzl" apps/api/src/grade-export --include=*.ts --exclude=*.spec.ts --exclude-dir=testing
  # 4. The dependency change is one line in one importer.
  git diff --stat main -- pnpm-lock.yaml apps/api/package.json
  ```

  Expected: (1) hits **only** of the form `Number(rAttr)`, `Number(rowMatch…)`, `Number(v)` (a shared-string *index*), `Number(match[2])` (a *row number* inside `parseRef`) — write each one into the ledger with why it is not a score; a hit on a score string is a bug. (2) no output. (3) exactly `apps/api/src/grade-export/xlsx/zip-io.ts`. (4) the two files, a handful of lines.

- [ ] **Step 5: Open a real output file — the one check no test can make.** Dump the first e2e case's output and open it in the programs a teacher uses:

  ```bash
  GX_DUMP="C:/tmp/g5-sample-output.xlsx" pnpm --filter api exec jest --config ./test/jest-e2e.json test/grade-export.e2e-spec.ts -t "ghi đúng các ô đã chọn"
  ```

  Open `C:\tmp\g5-sample-output.xlsx` in **Excel** and in **LibreOffice Calc**. Look for: no *"repair"* prompt; the merged title still merged; column D holds `8,5 / 6,5 / 5,5` and is formatted as a number; column E holds the reason labels for the six blank rows; column D of those rows is empty. Then do the same with **a real gradebook from the school** (a copy!): choose its columns by hand and compare the output with the original for anything that moved. **Write in the ledger what you saw and which version of each program.** If you could not open it, say so — do not write "verified".

- [ ] **Step 6: What this package does not prove — write it down, do not imply otherwise.**
  - **No file was opened by Excel or LibreOffice** unless Step 5 was done; the byte-for-byte checks prove the *package* is preserved, not that a given program accepts the *result*. Formula recalculation on open (`fullCalcOnLoad`, D25) is untested in both.
  - **No browser pass.** The UI is proven by React Testing Library against mocked hooks; the API by real HTTP against real Postgres and MinIO. **The join between them is Task 11's generated client**, which `tsc` checks and no test exercises. One pass over `/teacher/grading/export` in a browser on a seeded finalized session is the first thing the common review should do.
  - **`.csv`, `.xls`, `.xlsm` are refused** (D2); a school gradebook that is only a CSV needs one manual conversion.
  - **Rounding can exceed the rubric maximum** when the maximum is not a multiple of the step (spec §9).
  - **The *keep the old cell* branch (D17) is exercised only by forcing a status outside the state machine.**
  - **A prefixed-namespace `.xlsx`, a row or cell without an address, a sheet past column BH or row 5000** are refused, not handled (D22).

- [ ] **Step 7: `detect_changes`.** Run `mcp__gitnexus__detect_changes` with `repo` = the absolute path `C:\Users\Admin\Main\Desktop\HKI 2026-2027\KLTN\CINE` and `scope: "all"`. The affected flows must be the new `grade-export` module, `FinalizePanel`, `app.module`/`data-source`/`verify-schema` and the two entity files — anything else is unexpected and gets explained in the ledger.

- [ ] **Step 8: Write the ledger.** Create `docs/superpowers/ledgers/2026-09-29-gradebook-export.md` with, per task: the commit hash, the exact test command and its result, every `Ruling:` line from the in-progress ledger with its reason, the two mutation checks (Task 4 Step 3, Task 10 Step 4) with the failures observed, the four guard outputs of Step 4 (the `Number(` allowlist with reasons), and what Step 5 actually found.

  ```bash
  git add docs/superpowers/ledgers/2026-09-29-gradebook-export.md && git commit -F <message-file>
  ```

  Title: `docs: ledger thực thi G5 (ghi điểm vào sổ điểm)`.

- [ ] **Step 9: Report — and say this plainly.**

  > **Chưa có VERDICT của `code-reviewer`.** Người dùng đã hoãn phần review tới **một lượt review chung cho G1→G5**, nên gói này bàn giao ở trạng thái "đã qua test, chưa qua review độc lập".

  And it must list: the files changed; the test totals against the baselines; the **one dependency change** (`jszip` to `dependencies`) and the lockfile diff; the migration `1789530000000`; the `Ruling:` lines; Step 5's outcome; Step 6's *not proven* list verbatim; and the shared-file touch points G2/G4 will need to reconcile (`schema.d.ts`, `data-source.ts`, `verify-schema.ts`, `app.module.ts`, `FinalizePanel.tsx` — both G4 and G5 keep the `NeedsBackend` import, and the second to merge removes it).

  Do **not** run `finishing-a-development-branch`. Do not push, do not open a PR, do not merge. The branch and the ledger stay in place for the common review.
