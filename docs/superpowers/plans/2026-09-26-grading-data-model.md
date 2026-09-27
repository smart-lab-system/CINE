# Bước 3b — Mô hình dữ liệu §14, máy trạng thái, luật đóng băng Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Đưa toàn bộ mô hình dữ liệu §14 của spec vào DB — bảng, cột, trigger, máy trạng thái §14.3 — cùng phần schema của nhánh plan-1 (viết lại migration), luật đóng băng mới của §2.3 luật 6, để 3c (bảng lỗi, giá), 3d (nối đường chấm) và 3e (kiểm mẫu) chỉ còn là code service.

**Architecture:** Bảy migration mới, timestamp sau `1789400000000` (mới nhất trên `main`). Mọi luật bất biến nằm ở DB (trigger chỉ-thêm, trigger bất biến của lượt chấm, trigger vòng đời viết lại theo đúng bảng §14.3); code giữ một bản sao của bảng chuyển trạng thái (`grading-transitions.ts`) và một e2e đi qua MỌI cặp trạng thái để hai bản không lệch. Luật đóng băng tách thành một hàm dùng chung (`grading-lock.ts`) cho cả rubric lẫn tài liệu chấm.

**Tech Stack:** NestJS 10 · TypeORM 0.3.31 (`migrationsTransactionMode: 'none'`) · PostgreSQL 16 (docker-compose, cổng 5442, schema `examcollect`) · Jest (unit `src/**/*.spec.ts`, e2e `test/*.e2e-spec.ts` chạy trên DB local đã migrate).

**Spec:** `docs/superpowers/specs/2026-09-20-grading-agent-investigator-design.md` — **bản lần 10 trong worktree `grading-investigator`** (chưa commit; bản trên `main` cũ hơn lần 6). Đọc §14 (toàn bộ), §2.2, §2.3, §9 bước 3, §15.1 dòng bước 3. Báo cáo sandbox: `docs/superpowers/reports/2026-09-24-sandbox-isolation-spike.md` (chưa commit).

## Global Constraints

- Migration mới: timestamp **> 1789400000000**, mỗi migration tự lo transaction (`migrationsTransactionMode: 'none'`); SQL ghi đủ schema `"examcollect"."…"` như mọi migration khác.
- **Không bao giờ chạy migration vào Supabase.** `apps/api/.env` trỏ Supabase từ xa; mọi lệnh DB của plan này đi qua `bash .superpowers/sdd/2026-09-26-grading-data-model/db.sh …`, wrapper đọc `DATABASE_URL` từ `apps/api/.env.test` và dừng nếu host không phải localhost.
- Security rule 6: sửa điểm luôn là **dòng mới**; `ai_total_score` là điểm của lượt tính đầu, dưới trigger.
- §14.3: *"Mọi bước chuyển là UPDATE có điều kiện trên trạng thái hiện tại (khuôn `advance()`). Không đổi dòng nào thì bước chuyển không xảy ra, và người gọi dừng."*
- §14.3: *"Chặn chốt điểm: `ai_grading`, `ai_graded`, `flagged_for_review` (gồm bài không chấm được), `audit_pending`. Một danh sách, ở một chỗ (`BLOCKS_FINALIZE`)."*
- §14.4: `guard_rubric_criteria_immutable` **giữ nguyên**; `key` của tiêu chí cũ điền **một lần**, tạm tắt đúng trigger đó trong cùng transaction.
- §14.4: guard bất biến AI giữ **khuôn danh sách cột động** của `1789310000000`; `T-MERGE-1`: `advocate_outcome` vẫn nằm trong danh sách.
- §2.3 luật 6: *"Luật đóng băng mở lại khi và chỉ khi MỌI kết quả của phiên là bài không chấm được đã dừng hẳn — không bài nào mang điểm, và không bài nào đang chấm (`ai_grading`, `ai_graded`)."*
- CLAUDE.md: không có phụ thuộc vòng giữa hai service cùng module; file đọc bởi decorator `@Column` là file LEAF (không import gì).
- Mã lỗi: trigger vòng đời `23514` (`check_violation`, filter trả 400); trigger bất biến `55000` (`object_not_in_prerequisite_state`) — giữ đúng hai mã đang dùng.
- Comment tiếng Việt theo giọng của repo; commit message tiếng Việt kiểu conventional, dòng cuối `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- Plan này commit được (chủ đồ án cho phép với plan); **spec và báo cáo thì không** — chủ đồ án tự commit.

## Phạm vi — cái gì KHÔNG ở plan này

| Việc | Ở đâu | Vì sao |
|---|---|---|
| Service ghi luật, giá, lượt tính điểm; hàm *điểm hiện tại* §14.2 đầy đủ; `finalized_computation_id` | 3c | Cần `score_computation` có người ghi |
| Ghi `grading_attempt` cho lượt chấm **ra điểm**; nút chấm lại (§2.3); nối `investigate()`+`decide()`; resolver bài code, giải nén, đối chiếu khai báo, form khai ngôn ngữ của plan-1 | 3d | Một chỗ ghi lượt chấm cho cả hai đường; phần code của plan-1 xung đột nặng với `main` và chỉ có nghĩa khi đường chấm code tồn tại |
| Rút mẫu, `audit_pending` có người ghi | 3e | |
| `grade_export_row` (§13), `ruler_warning` (canh thước), `rule_evaluation_run/result` (bậc 3, cần `ast_query` bước 5) | ngoài bước 3 | Có hàng riêng ở §15.1 |
| Web: nhãn `audit_pending`, cờ `gradingLocked` thay cho `results.length > 0` ở `SessionRubricCard` | 3f | Chưa route nào sinh `audit_pending`; API luật đóng băng đổi ở đây, màn hình theo ở 3f |

## Review Focus

1. **DB local đã chạy migration cũ của nhánh plan-1** (`AddCodeGradingSchema1789300000000`: `sandbox_language`, `test_run`, `test_group`, `grading_test_bundle`) → migration viết lại vẫn chạy được, không tạo trùng, và guard bất biến vẫn có `advocate_outcome`. Test: Task 1 chạy trên DB local thật + Task 10 chạy trên một DB sạch.
2. **`ALTER TYPE … ADD VALUE 'audit_pending'` rồi dùng ngay** trong cùng transaction là lỗi *unsafe use of new enum value* → value mới nằm trong migration riêng, trước migration dùng nó. Test: Task 10 chạy toàn chuỗi trên DB sạch.
3. **Rubric đã dùng để chấm** (trigger đóng băng tiêu chí bắn) → điền `key` vẫn qua, và không để trigger tắt sau migration. Test: Task 3 kiểm `tgenabled` + Task 10 revert rồi chạy lại migration trên DB local vốn đầy rubric đã chấm.
4. **Bài không chấm được mà giảng viên đã chấm tay** → phiên phải khoá (bài đã mang điểm), dù `ai_total_score` vẫn null. Test: Task 9.
5. **`markUngradable` chạy đua với `gradeOne` vừa ghi điểm** → một bài đã `ai_graded` không bị đẩy sang không chấm được, không sinh lượt chấm nào; và `gradeOne` không ghi đè một bài `markUngradable` vừa đánh dấu. Test: Task 7.

---

## File Structure

| File | Trách nhiệm |
|---|---|
| `apps/api/src/database/migrations/support/ai-immutable-guard.ts` (mới) | Dựng lại guard bất biến AI từ danh sách cột động — dùng chung cho migration từ nay |
| `apps/api/src/database/migrations/1789410000000-CodeGradingSchema.ts` (mới) | Phần schema của plan-1, viết lại (`T-MERGE-1`) |
| `…/1789420000000-AddAuditPendingStatus.ts` (mới) | Giá trị enum `audit_pending`, một mình |
| `…/1789430000000-GradingResultReviewSessionColumns.ts` (mới) | Cột mới của `grading_result`, `teacher_review`, `exam_session`; điền lớp lý do cho dữ liệu cũ |
| `…/1789435000000-CriterionKeyAndAnswerOrigin.ts` (mới) | `rubric_criterion.key` (điền một lần), `grading_reference.model_answer_origin` |
| `…/1789440000000-ErrorRulesAndPrices.ts` (mới) | `error_rule`, `error_rule_revision`, `price_table_version`, `rule_price`; guard chỉ-thêm, cấm xoá |
| `…/1789450000000-AttemptsBundlesScores.ts` (mới) | `grading_test_bundle`, `grading_test_case`, `grading_attempt`, `score_computation`, `criterion_waiver`, `audit_sample_review`; guard lượt chấm; lượt số 1 cho dữ liệu cũ |
| `…/1789460000000-GradingLifecycleV2.ts` (mới) | Trigger vòng đời theo §14.3 |
| `apps/api/src/grading/grading-model.types.ts` (mới, LEAF) | Enum TS của mô hình: đường chấm, lớp lý do, kind review, … |
| `apps/api/src/exam-session/declared-language.ts` (mới, LEAF) | `DECLARED_LANGUAGES` |
| `apps/api/src/grading/entities/*.entity.ts` (10 mới, 4 sửa) | Entity cho bảng mới; cột mới trên entity cũ |
| `apps/api/src/grading/lifecycle/grading-transitions.ts` (mới) | Bảng §14.3 bằng code, `canTransition`, `BLOCKS_FINALIZE` |
| `apps/api/src/grading/criterion-key.ts` (mới) | Sinh `key` tiêu chí từ mô tả, hàm thuần |
| `apps/api/src/grading/pipeline.ts` (mới) | `pipelineFor()` — luật gán đường chấm §14.1 |
| `apps/api/src/grading/grading-lock.ts` (mới) | `isGradingLocked()` — luật đóng băng §2.3 luật 6, một chỗ |
| `apps/api/test/helpers/grading-seed.ts` (mới) | Dựng dữ liệu chấm bằng SQL cho e2e tầng DB |
| `apps/api/test/code-grading-schema.e2e-spec.ts`, `grading-data-model.e2e-spec.ts`, `grading-lifecycle-v2.e2e-spec.ts`, `grading-freeze.e2e-spec.ts`, `entity-schema.e2e-spec.ts` (mới) | e2e của plan |

---

### Task 0: Nhánh, hạ tầng local, đường gốc

**Files:**
- Create: `.superpowers/sdd/2026-09-26-grading-data-model/db.sh` (thư mục bị git bỏ qua)
- Create: `.superpowers/sdd/2026-09-26-grading-data-model/ledger.md`

- [ ] **Step 1: Nhánh.** Đang ở `feature/grading-data-model`, tách từ `origin/main` (`8477830`). Kiểm: `git log --oneline -1` ra `8477830`; `git status --short` chỉ có spec (M) và `docs/superpowers/reports/` (??) — không commit hai thứ đó.

- [ ] **Step 2: Docker.** Docker Desktop hay tự tắt; bật lại bằng PowerShell `Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"`. Rồi:

```bash
docker ps -a --format '{{.Names}}\t{{.Status}}' | grep -Ei 'postgres|minio|redis'
docker start cine-postgres-1 cine-minio-1 cine-redis-1
```

Nếu tên container khác, dùng tên thật và ghi vào ledger. **Không** chạy `docker compose up` từ worktree mà không có `-p cine` — tên project suy từ tên thư mục sẽ tạo bộ container và volume mới.

- [ ] **Step 3: Wrapper DB local.**

```bash
#!/usr/bin/env bash
# Chạy một lệnh với DB LOCAL của e2e (apps/api/.env.test) — không bao giờ Supabase.
# `-r dotenv/config` của migration:run KHÔNG ghi đè biến đã có, nên đặt biến ở đây là đủ.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../../.." && pwd)"
url="$(grep -E '^DATABASE_URL=' "$root/apps/api/.env.test" | head -1 | cut -d= -f2-)"
if [ -n "${DB_NAME_OVERRIDE:-}" ]; then url="${url%/*}/${DB_NAME_OVERRIDE}"; fi
case "$url" in
  *@localhost:*|*@127.0.0.1:*) ;;
  *) echo "db.sh: DATABASE_URL không trỏ localhost — dừng" >&2; exit 2 ;;
esac
export DATABASE_URL="$url" DATABASE_SSL=false DATABASE_SCHEMA=examcollect
exec "$@"
```

- [ ] **Step 4: Đưa DB local về đầu `main` và ghi trạng thái plan-1.**

```bash
bash .superpowers/sdd/2026-09-26-grading-data-model/db.sh pnpm --filter api migration:run
docker exec cine-postgres-1 psql -U examcollect_admin -d examcollect -Atc "SELECT name FROM examcollect.migrations ORDER BY id DESC LIMIT 3"
docker exec cine-postgres-1 psql -U examcollect_admin -d examcollect -Atc "SELECT to_regclass('examcollect.grading_test_bundle'), EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='examcollect' AND table_name='grading_result' AND column_name='test_run'), to_regtype('examcollect.sandbox_language')"
```

Expected: dòng đầu là `AddArchiveContentCheck1789400000000`. Ghi vào ledger ba giá trị của lệnh cuối — đó là dữ kiện cho Review Focus 1.

- [ ] **Step 5: e2e gốc của vùng sẽ đụng.** MinIO cần bucket `examcollect-submissions` (tạo tay nếu chưa có). Kill mọi tiến trình `node` jest/nest mồ côi trước (memory: worker mồ côi ăn job BullMQ).

```bash
pnpm --filter api test:e2e -- grading-lifecycle teacher-review bulk-review grading-reference session-rubric grading-results-view
```

Expected: xanh. Ca nào đỏ sẵn thì ghi vào ledger kèm lý do — không sửa trong plan này.

---

### Task 1: Schema của plan-1, viết lại (`T-MERGE-1`)

**Files:**
- Create: `apps/api/src/database/migrations/support/ai-immutable-guard.ts`
- Create: `apps/api/src/database/migrations/1789410000000-CodeGradingSchema.ts`
- Create: `apps/api/src/exam-session/declared-language.ts`
- Modify: `apps/api/src/exam-session/entities/required-deliverable.entity.ts`
- Create: `apps/api/test/helpers/grading-seed.ts`
- Test: `apps/api/test/code-grading-schema.e2e-spec.ts`

**Interfaces:**
- Produces: `rebuildAiImmutableGuardSql(columns)`, `AI_OUTPUT_COLUMNS`; `DECLARED_LANGUAGES`, `DeclaredLanguage`; `RequiredDeliverableEntity.language`; e2e helpers `seedTeacher`, `seedSession`, `seedResult`, `scoreResult`, `forceStatus` (dùng ở mọi task sau).

- [ ] **Step 1: Helper e2e.**

```ts
// apps/api/test/helpers/grading-seed.ts
import { DataSource } from 'typeorm';

/**
 * Dựng dữ liệu chấm bằng SQL thô cho e2e tầng DB (trigger, ràng buộc).
 *
 * Cùng khuôn với `grading-lifecycle.e2e-spec.ts`: submission đi đúng vòng đời
 * received → validated → collected, mỗi kết quả một bài nộp mới
 * (`uq_grading_result_submission`), và mỗi phiên một giảng viên, một lớp, một phòng mới —
 * ba ràng buộc chồng lịch của `exam_session` không bao giờ bắn giữa hai lần gọi.
 * Không dọn: mọi tên mang dấu thời gian.
 */
export interface SeedSession {
  teacherId: string;
  classId: string;
  sessionId: string;
  deliverableId: string;
  rubricId: string;
}

let cursor = 0;
const stamp = (): string => `${Date.now().toString(36)}${(cursor++).toString(36)}`;

export async function seedTeacher(ds: DataSource, label: string): Promise<string> {
  const [row] = await ds.query(
    `INSERT INTO examcollect.account (email, password_hash, name, role)
     VALUES ($1, $2, $3, 'teacher') RETURNING id`,
    [`${label}_${stamp()}@example.com`, 'a'.repeat(60), `GV ${label}`],
  );
  return row.id;
}

export async function seedSession(
  ds: DataSource,
  label: string,
  opts: { deliverableType?: 'document' | 'code_project'; language?: string | null } = {},
): Promise<SeedSession> {
  const s = stamp();
  const teacherId = await seedTeacher(ds, label);
  const [klass] = await ds.query(
    `INSERT INTO examcollect.class (course_name, name, teacher_id) VALUES ($1, 'N01', $2) RETURNING id`,
    [`Môn ${label}`, teacherId],
  );
  const [session] = await ds.query(
    `INSERT INTO examcollect.exam_session
       (name, code, class_id, teacher_id, exam_type, start_time, end_time, status,
        semester_name, course_name, room_name)
     VALUES ($1, $2, $3, $4, 'CK', now() - interval '1 hour', now() + interval '1 hour', 'active',
             $5, $6, $7)
     RETURNING id`,
    [`Phiên ${label}`, `S${s}`.slice(0, 20), klass.id, teacherId, `HK ${label} ${s}`, `Môn ${label}`, `P ${label} ${s}`],
  );
  const [deliverable] = await ds.query(
    `INSERT INTO examcollect.required_deliverable (exam_session_id, required_filename, deliverable_type, language)
     VALUES ($1, 'Cau1.docx', $2, $3) RETURNING id`,
    [session.id, opts.deliverableType ?? 'document', opts.language ?? null],
  );
  const [rubric] = await ds.query(
    `INSERT INTO examcollect.rubric (version, teacher_id, name) VALUES (1, $1, $2) RETURNING id`,
    [teacherId, `Rubric ${label} ${s}`],
  );
  return { teacherId, classId: klass.id, sessionId: session.id, deliverableId: deliverable.id, rubricId: rubric.id };
}

export async function seedResult(
  ds: DataSource,
  ctx: SeedSession,
): Promise<{ resultId: string; submissionId: string }> {
  const [sub] = await ds.query(
    `INSERT INTO examcollect.submission
       (exam_session_id, required_deliverable_id, student_mssv, student_name_input,
        home_class_id, home_teacher_id, status)
     VALUES ($1, $2, $3, 'Sinh viên seed', $4, $5, 'received') RETURNING id`,
    [ctx.sessionId, ctx.deliverableId, `M${stamp()}`.slice(0, 20), ctx.classId, ctx.teacherId],
  );
  for (const next of ['validated', 'collected']) {
    await ds.query(`UPDATE examcollect.submission SET status = $1 WHERE id = $2`, [next, sub.id]);
  }
  const [res] = await ds.query(
    `INSERT INTO examcollect.grading_result (submission_id, rubric_id_version, grading_triggered_by, status)
     VALUES ($1, $2, $3, 'ai_grading') RETURNING id`,
    [sub.id, ctx.rubricId, ctx.teacherId],
  );
  return { resultId: res.id, submissionId: sub.id };
}

/** Ghi output AI và sang `ai_graded` trong MỘT UPDATE — như `gradeOne`. */
export async function scoreResult(ds: DataSource, resultId: string, score = '7.00'): Promise<void> {
  await ds.query(
    `UPDATE examcollect.grading_result
        SET status = 'ai_graded', ai_total_score = $2, confidence = 0.9, model_used = 'seed',
            criterion_results = '[]'
      WHERE id = $1`,
    [resultId, score],
  );
}

/**
 * Đặt thẳng trạng thái NGUỒN, bỏ qua mọi trigger (`session_replication_role = replica`) — chỉ để
 * dựng trạng thái bắt đầu cho test bảng chuyển trạng thái. Cần superuser: Postgres local của
 * docker-compose chạy bằng POSTGRES_USER nên có. Tên cột trong `extra` là của test, không phải
 * dữ liệu ngoài.
 */
export async function forceStatus(
  ds: DataSource,
  resultId: string,
  status: string,
  extra: Record<string, unknown> = {},
): Promise<void> {
  const runner = ds.createQueryRunner();
  await runner.connect();
  try {
    await runner.startTransaction();
    await runner.query(`SET LOCAL session_replication_role = replica`);
    const cols = Object.keys(extra);
    const sets = ['status = $2', ...cols.map((c, i) => `${c} = $${i + 3}`)].join(', ');
    await runner.query(`UPDATE examcollect.grading_result SET ${sets} WHERE id = $1`, [
      resultId,
      status,
      ...cols.map((c) => extra[c]),
    ]);
    await runner.commitTransaction();
  } catch (error) {
    await runner.rollbackTransaction();
    throw error;
  } finally {
    await runner.release();
  }
}
```

- [ ] **Step 2: Test đỏ.**

```ts
// apps/api/test/code-grading-schema.e2e-spec.ts
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { scoreResult, seedResult, seedSession } from './helpers/grading-seed';

/**
 * Phần schema của nhánh `feature/code-autograder-plan-1`, viết lại ở `1789410000000` (§9 bước 3).
 * Migration gốc `1789300000000` ghi đè guard bất biến bằng danh sách cột VIẾT CỨNG, thiếu
 * `advocate_outcome`; TypeORM chạy migration cũ hơn đó SAU `1789310000000` trên mọi DB đã có
 * migration mới — và gỡ `advocate_outcome` khỏi danh sách bất biến trong im lặng.
 */
describe('Schema bài code sau lượt merge plan-1 (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    ds = app.get(DataSource);
  });
  afterAll(async () => app.close());

  it('T-MERGE-1: advocate_outcome VẪN nằm trong danh sách bất biến; test_run thì không', async () => {
    const [{ def }] = await ds.query(
      `SELECT pg_get_functiondef('examcollect.guard_grading_result_ai_immutable'::regproc) AS def`,
    );
    expect(def).toContain('advocate_outcome');
    expect(def).not.toContain('test_run');

    const ctx = await seedSession(ds, 'merge1');
    const { resultId } = await seedResult(ds, ctx);
    await scoreResult(ds, resultId);
    await expect(
      ds.query(`UPDATE examcollect.grading_result SET advocate_outcome = 'completed' WHERE id = $1`, [resultId]),
    ).rejects.toThrow(/immutable/i);
  });

  it('không còn dấu vết của plan-1 cũ: test_run, test_group', async () => {
    const rows = await ds.query(
      `SELECT table_name, column_name FROM information_schema.columns
        WHERE table_schema = 'examcollect'
          AND ((table_name = 'grading_result' AND column_name = 'test_run')
            OR (table_name = 'rubric_criterion' AND column_name = 'test_group'))`,
    );
    expect(rows).toEqual([]);
  });

  it('bài không phải code KHÔNG mang ngôn ngữ', async () => {
    const ctx = await seedSession(ds, 'lang-doc');
    await expect(
      ds.query(
        `INSERT INTO examcollect.required_deliverable (exam_session_id, required_filename, deliverable_type, language)
         VALUES ($1, 'Cau2.docx', 'document', 'cpp')`,
        [ctx.sessionId],
      ),
    ).rejects.toThrow(/ck_required_deliverable_language/);
  });

  it('bài code CHƯA khai ngôn ngữ vẫn tạo được — nửa bị nới của ràng buộc plan-1 (§14.1)', async () => {
    const ctx = await seedSession(ds, 'lang-none', { deliverableType: 'code_project', language: null });
    const [row] = await ds.query(`SELECT language FROM examcollect.required_deliverable WHERE id = $1`, [ctx.deliverableId]);
    expect(row.language).toBeNull();
  });

  it('bài code khai cpp tạo được', async () => {
    const ctx = await seedSession(ds, 'lang-cpp', { deliverableType: 'code_project', language: 'cpp' });
    const [row] = await ds.query(`SELECT language FROM examcollect.required_deliverable WHERE id = $1`, [ctx.deliverableId]);
    expect(row.language).toBe('cpp');
  });
});
```

Run: `pnpm --filter api test:e2e -- code-grading-schema`
Expected: FAIL — `column "language" of relation "required_deliverable" does not exist` (hoặc, trên DB local đã có plan-1, ca `test_run` đỏ).

- [ ] **Step 3: Helper guard.**

```ts
// apps/api/src/database/migrations/support/ai-immutable-guard.ts
/**
 * Dựng lại `guard_grading_result_ai_immutable` từ danh sách cột ĐỘNG — khuôn của
 * `AddAdvocateOutcome1789310000000`, chép sang đây vì migration đã chạy thì không được sửa.
 * Hàm chỉ giữ những cột ĐANG có trong bảng, nên gọi được ở mọi trạng thái schema; migration nào
 * từ nay đụng tới guard thì gọi hàm này, KHÔNG viết cứng danh sách.
 *
 * Thư mục `support/` nằm ngoài glob `migrations/*.{js,ts}` của data source: TypeORM không coi
 * file này là một migration.
 */
export const AI_OUTPUT_COLUMNS = [
  'ai_total_score',
  'criterion_results',
  'model_used',
  'confidence',
  'advocate_opinion',
  'advocate_outcome',
  'context_used_question',
  'context_used_model_answer',
] as const;

export function rebuildAiImmutableGuardSql(columns: readonly string[]): string {
  const list = columns.map((c) => `'${c}'`).join(', ');
  return `
    DO $do$
    DECLARE
      superset text[] := ARRAY[${list}];
      present  text[];
      predicate text;
    BEGIN
      SELECT array_agg(t.c ORDER BY t.ord)
        INTO present
        FROM unnest(superset) WITH ORDINALITY AS t(c, ord)
       WHERE EXISTS (
         SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'examcollect' AND table_name = 'grading_result' AND column_name = t.c
       );

      SELECT string_agg(format('NEW.%I IS DISTINCT FROM OLD.%I', c, c), E'\\n OR ')
        INTO predicate
        FROM unnest(present) c;

      EXECUTE
        $f$
        CREATE OR REPLACE FUNCTION examcollect.guard_grading_result_ai_immutable()
        RETURNS trigger
        LANGUAGE plpgsql
        SET search_path TO 'examcollect', 'public'
        AS $body$
            BEGIN
                IF OLD.ai_total_score IS NOT NULL
                   AND (
        $f$
        || predicate ||
        $f$
                   ) THEN
                    RAISE EXCEPTION
                        'GradingResult %''s AI output is immutable once set; edit via TeacherReview instead',
                        OLD.id
                        USING ERRCODE = 'object_not_in_prerequisite_state';
                END IF;
                RETURN NEW;
            END;
        $body$
        $f$;
    END
    $do$;
  `;
}
```

- [ ] **Step 4: Migration.**

```ts
// apps/api/src/database/migrations/1789410000000-CodeGradingSchema.ts
import { MigrationInterface, QueryRunner } from 'typeorm';
import { AI_OUTPUT_COLUMNS, rebuildAiImmutableGuardSql } from './support/ai-immutable-guard';

/**
 * Phần schema của nhánh plan-1 (`AddCodeGradingSchema1789300000000`), VIẾT LẠI theo §14.1 và
 * §9 bước 3 — không merge nguyên văn:
 *
 * - `required_deliverable.language` giữ, nhưng ràng buộc bị NỚI: nửa *"`code_project` ⇒
 *   language NOT NULL"* chặn chính các bài code đã có trên `main`, vốn chưa khai ngôn ngữ; giữ
 *   nửa *"không phải code ⇒ NULL"*.
 * - KHÔNG có `grading_result.test_run` — `grading_attempt.structured_results` thay nó.
 * - KHÔNG có `rubric_criterion.test_group` — luật trỏ nhóm test qua `predicate.group` (§4.1).
 * - `grading_test_bundle` dựng lại ở `1789450000000` với phiên bản (bỏ
 *   `uq_grading_test_bundle_session`).
 * - Guard bất biến AI dựng từ danh sách cột ĐỘNG (`T-MERGE-1`).
 *
 * Chạy được trên cả DB sạch lẫn DB đã chạy migration cũ của nhánh (DB dev local): mọi bước
 * `IF [NOT] EXISTS`, và dấu vết cũ chỉ bị xoá khi RỖNG — có dữ liệu thì dừng cho người xem.
 */
export class CodeGradingSchema1789410000000 implements MigrationInterface {
  name = 'CodeGradingSchema1789410000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      DO $$ BEGIN
        CREATE TYPE "examcollect"."sandbox_language" AS ENUM ('python', 'cpp', 'java', 'node');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);
    await q.query(`
      ALTER TABLE "examcollect"."required_deliverable"
        ADD COLUMN IF NOT EXISTS "language" "examcollect"."sandbox_language"
    `);
    await q.query(`
      ALTER TABLE "examcollect"."required_deliverable"
        DROP CONSTRAINT IF EXISTS "ck_required_deliverable_language"
    `);
    await q.query(`
      ALTER TABLE "examcollect"."required_deliverable"
        ADD CONSTRAINT "ck_required_deliverable_language"
        CHECK (deliverable_type = 'code_project' OR language IS NULL)
    `);

    await q.query(`
      DO $$ BEGIN
        IF to_regclass('examcollect.grading_test_bundle') IS NOT NULL THEN
          IF EXISTS (SELECT 1 FROM examcollect.grading_test_bundle) THEN
            RAISE EXCEPTION 'grading_test_bundle của nhánh plan-1 còn dữ liệu — không tự xoá, cần người xem';
          END IF;
          DROP TABLE examcollect.grading_test_bundle;
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'examcollect' AND table_name = 'grading_result'
                      AND column_name = 'test_run') THEN
          IF EXISTS (SELECT 1 FROM examcollect.grading_result WHERE test_run IS NOT NULL) THEN
            RAISE EXCEPTION 'grading_result.test_run của nhánh plan-1 còn dữ liệu — không tự xoá, cần người xem';
          END IF;
        END IF;
      END $$
    `);

    // Guard dựng lại TRƯỚC khi bỏ cột: bản của plan-1 nhắc tới NEW.test_run, và một hàm trigger
    // trỏ tới cột đã mất nổ ở UPDATE đầu tiên.
    await q.query(rebuildAiImmutableGuardSql(AI_OUTPUT_COLUMNS));
    await q.query(`ALTER TABLE "examcollect"."grading_result" DROP COLUMN IF EXISTS "test_run"`);
    await q.query(`ALTER TABLE "examcollect"."rubric_criterion" DROP COLUMN IF EXISTS "test_group"`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "examcollect"."required_deliverable" DROP CONSTRAINT IF EXISTS "ck_required_deliverable_language"`);
    await q.query(`ALTER TABLE "examcollect"."required_deliverable" DROP COLUMN IF EXISTS "language"`);
    await q.query(`DROP TYPE IF EXISTS "examcollect"."sandbox_language"`);
    // Guard: danh sách động đã là trạng thái đúng của `main` — không có gì để hoàn.
  }
}
```

- [ ] **Step 5: Ngôn ngữ khai và entity.**

```ts
// apps/api/src/exam-session/declared-language.ts
/**
 * Ngôn ngữ giảng viên khai cho bài `code_project` (§14.1). File LEAF — đọc bởi decorator
 * `@Column` (xem ghi chú ở `advocate.types.ts`).
 *
 * Bốn giá trị, dù sandbox chỉ chạy `cpp`, `python` (§3.5): `java`, `node` là ngôn ngữ phần soạn
 * đề đã dùng (`AUTHORING_LANGUAGES`), và bài khai hai ngôn ngữ đó đi đường `one_shot`.
 */
export const DECLARED_LANGUAGES = ['python', 'cpp', 'java', 'node'] as const;
export type DeclaredLanguage = (typeof DECLARED_LANGUAGES)[number];
```

Trong `required-deliverable.entity.ts`, thêm import `import { DECLARED_LANGUAGES, DeclaredLanguage } from '../declared-language';` và cột ngay sau `deliverableType`:

```ts
  /**
   * Null = chưa khai → bài đi đường `one_shot` (§14.1). Hệ thống không đoán ngôn ngữ từ đuôi
   * file. Ràng buộc `ck_required_deliverable_language`: chỉ bài `code_project` mang ngôn ngữ.
   */
  @Column({ type: 'enum', enum: DECLARED_LANGUAGES, enumName: 'sandbox_language', nullable: true })
  language!: DeclaredLanguage | null;
```

- [ ] **Step 6: Chạy migration, test xanh.**

```bash
bash .superpowers/sdd/2026-09-26-grading-data-model/db.sh pnpm --filter api migration:run
pnpm --filter api test:e2e -- code-grading-schema grading-lifecycle
pnpm --filter api exec tsc --noEmit -p tsconfig.json
```

Expected: PASS (5 ca mới; `grading-lifecycle` vẫn xanh — ca T-ADVO-5/5b của guard).

- [ ] **Step 7: Commit.**

```bash
git add apps/api/src/database/migrations/support/ai-immutable-guard.ts apps/api/src/database/migrations/1789410000000-CodeGradingSchema.ts apps/api/src/exam-session/declared-language.ts apps/api/src/exam-session/entities/required-deliverable.entity.ts apps/api/test/helpers/grading-seed.ts apps/api/test/code-grading-schema.e2e-spec.ts
git commit -m "feat(db): schema bài code của plan-1 viết lại — ngôn ngữ khai, bỏ test_run, guard bất biến từ danh sách động (T-MERGE-1)"
```

---

### Task 2: `audit_pending`; cột mới của `grading_result`, `teacher_review`, `exam_session`

**Files:**
- Create: `apps/api/src/database/migrations/1789420000000-AddAuditPendingStatus.ts`
- Create: `apps/api/src/database/migrations/1789430000000-GradingResultReviewSessionColumns.ts`
- Create: `apps/api/src/grading/grading-model.types.ts`
- Modify: `apps/api/src/grading/entities/grading-result.entity.ts` (union trạng thái :8-15, mảng enum của cột `status` :172-186, cột mới)
- Modify: `apps/api/src/grading/entities/teacher-review.entity.ts`
- Modify: `apps/api/src/exam-session/entities/exam-session.entity.ts`
- Modify: `apps/api/src/grading/teacher-review.service.ts` (`reviewWithin`, `finalizeGrades`, `currentFinalScore`)
- Modify: `apps/api/src/grading/grading.service.ts` (truy vấn review mới nhất ở danh sách kết quả, ~:611)
- Test: `apps/api/test/grading-data-model.e2e-spec.ts`

**Interfaces:**
- Produces (từ `grading-model.types.ts`): `GRADING_PIPELINES`/`GradingPipeline` (`'one_shot' | 'investigator'`), `UNGRADABLE_CLASSES`/`UngradableClass` (`'system' | 'submission'`), `TEACHER_REVIEW_KINDS`/`TeacherReviewKind`, `EXCEPTION_DIRECTIONS`/`ExceptionDirection`.
- Produces (entity): `GradingResultEntity.{pipeline, currentAttemptId, ungradableClass, auditSampled, auditSampledAt, finalizedComputationId, finalizedBy, finalizedAt}`; `GradingResultStatus` có thêm `'audit_pending'`; `TeacherReviewEntity.{kind, errorRuleId, direction}`, `finalScore: string | null`; `ExamSessionEntity.{gradingSeed, testBundleId, pinnedPriceVersionId}`.

- [ ] **Step 1: Test đỏ.**

```ts
// apps/api/test/grading-data-model.e2e-spec.ts
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { scoreResult, seedResult, seedSession } from './helpers/grading-seed';

/** Mô hình dữ liệu §14.1 ở tầng DB: cột, ràng buộc, dữ liệu cũ. Bảng mới thêm ở task sau. */
describe('Mô hình dữ liệu §14 (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    ds = app.get(DataSource);
  });
  afterAll(async () => app.close());

  describe('grading_result', () => {
    it('kết quả mới mặc định đi đường one_shot, chưa có lớp lý do, chưa rút mẫu', async () => {
      const ctx = await seedSession(ds, 'dm-default');
      const { resultId } = await seedResult(ds, ctx);
      const [row] = await ds.query(
        `SELECT pipeline, ungradable_class, audit_sampled, current_attempt_id, finalized_by
           FROM examcollect.grading_result WHERE id = $1`,
        [resultId],
      );
      expect(row).toEqual({ pipeline: 'one_shot', ungradable_class: null, audit_sampled: false, current_attempt_id: null, finalized_by: null });
    });

    it('bài đã mang điểm AI thì không mang lớp lý do không chấm được', async () => {
      const ctx = await seedSession(ds, 'dm-class');
      const { resultId } = await seedResult(ds, ctx);
      await scoreResult(ds, resultId);
      await expect(
        ds.query(`UPDATE examcollect.grading_result SET ungradable_class = 'system', ungradable_reason = 'x' WHERE id = $1`, [resultId]),
      ).rejects.toThrow(/ck_grading_result_ungradable/);
    });

    it('lớp lý do đi kèm lời kể', async () => {
      const ctx = await seedSession(ds, 'dm-reason');
      const { resultId } = await seedResult(ds, ctx);
      await expect(
        ds.query(`UPDATE examcollect.grading_result SET ungradable_class = 'system' WHERE id = $1`, [resultId]),
      ).rejects.toThrow(/ck_grading_result_ungradable/);
    });

    it('rút mẫu và thời điểm rút đi cùng nhau', async () => {
      const ctx = await seedSession(ds, 'dm-audit');
      const { resultId } = await seedResult(ds, ctx);
      await expect(
        ds.query(`UPDATE examcollect.grading_result SET audit_sampled = true WHERE id = $1`, [resultId]),
      ).rejects.toThrow(/ck_grading_result_audit_sampled_at/);
    });

    it('T-REGRADE-5 (phần dữ liệu): không còn dòng không chấm được cũ nào thiếu lớp lý do', async () => {
      const [row] = await ds.query(
        `SELECT count(*)::int AS n FROM examcollect.grading_result
          WHERE status = 'flagged_for_review' AND ai_total_score IS NULL
            AND ungradable_reason IS NOT NULL AND ungradable_class IS NULL`,
      );
      expect(row.n).toBe(0);
    });
  });

  describe('teacher_review', () => {
    it('mọi kind trừ error_exception phải mang điểm', async () => {
      const ctx = await seedSession(ds, 'dm-review');
      const { resultId } = await seedResult(ds, ctx);
      await expect(
        ds.query(
          `INSERT INTO examcollect.teacher_review (grading_result_id, teacher_id, final_score, kind)
           VALUES ($1, $2, NULL, 'manual_score')`,
          [resultId, ctx.teacherId],
        ),
      ).rejects.toThrow(/ck_teacher_review_score_by_kind/);
    });

    it('error_exception phải trỏ một luật và một chiều', async () => {
      const ctx = await seedSession(ds, 'dm-exc');
      const { resultId } = await seedResult(ds, ctx);
      await expect(
        ds.query(
          `INSERT INTO examcollect.teacher_review (grading_result_id, teacher_id, final_score, kind)
           VALUES ($1, $2, NULL, 'error_exception')`,
          [resultId, ctx.teacherId],
        ),
      ).rejects.toThrow(/ck_teacher_review_exception_target/);
    });

    it('dòng review cũ không khai kind là review', async () => {
      const ctx = await seedSession(ds, 'dm-kind');
      const { resultId } = await seedResult(ds, ctx);
      const [row] = await ds.query(
        `INSERT INTO examcollect.teacher_review (grading_result_id, teacher_id, final_score)
         VALUES ($1, $2, 5) RETURNING kind`,
        [resultId, ctx.teacherId],
      );
      expect(row.kind).toBe('review');
    });
  });

  it('exam_session: mỗi phiên có grading_seed riêng từ lúc tạo (§8.1)', async () => {
    const a = await seedSession(ds, 'dm-seed-a');
    const b = await seedSession(ds, 'dm-seed-b');
    const rows = await ds.query(
      `SELECT grading_seed FROM examcollect.exam_session WHERE id = ANY($1)`,
      [[a.sessionId, b.sessionId]],
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].grading_seed).not.toBe(rows[1].grading_seed);
  });
});
```

Run: `pnpm --filter api test:e2e -- grading-data-model`
Expected: FAIL — `column "pipeline" does not exist`.

- [ ] **Step 2: `audit_pending`, một mình.**

```ts
// apps/api/src/database/migrations/1789420000000-AddAuditPendingStatus.ts
import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Trạng thái `audit_pending` (§14.3, §8.1) — MỘT MÌNH một migration.
 *
 * Postgres không cho dùng một giá trị enum vừa thêm trong cùng transaction (*unsafe use of new
 * value*). Trigger vòng đời mới (`1789460000000`) nhắc tới giá trị này; tách riêng để giá trị
 * đã commit trước khi ai dùng nó.
 */
export class AddAuditPendingStatus1789420000000 implements MigrationInterface {
  name = 'AddAuditPendingStatus1789420000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TYPE "examcollect"."grading_status" ADD VALUE IF NOT EXISTS 'audit_pending' AFTER 'auto_approved'`);
  }

  public async down(): Promise<void> {
    // Postgres không bỏ được một giá trị enum. Hoàn lại là dựng lại type và mọi cột dùng nó —
    // việc đó không đáng làm ngầm trong một `down()`.
    throw new Error('AddAuditPendingStatus1789420000000: không hoàn được — Postgres không bỏ được giá trị enum');
  }
}
```

- [ ] **Step 3: Cột mới.**

```ts
// apps/api/src/database/migrations/1789430000000-GradingResultReviewSessionColumns.ts
import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Cột mới của `grading_result`, `teacher_review`, `exam_session` — spec §14.1. Khoá ngoại tới
 * bảng chưa có (`grading_attempt`, `score_computation`, `error_rule`, `grading_test_bundle`,
 * `price_table_version`) thêm ở migration tạo bảng đó.
 */
export class GradingResultReviewSessionColumns1789430000000 implements MigrationInterface {
  name = 'GradingResultReviewSessionColumns1789430000000';

  public async up(q: QueryRunner): Promise<void> {
    // ---------------------------------------------------------------- grading_result
    await q.query(`CREATE TYPE "examcollect"."grading_pipeline" AS ENUM ('one_shot', 'investigator')`);
    await q.query(`CREATE TYPE "examcollect"."ungradable_class" AS ENUM ('system', 'submission')`);
    await q.query(`
      ALTER TABLE "examcollect"."grading_result"
        ADD COLUMN "pipeline" "examcollect"."grading_pipeline" NOT NULL DEFAULT 'one_shot',
        ADD COLUMN "current_attempt_id" uuid,
        ADD COLUMN "ungradable_class" "examcollect"."ungradable_class",
        ADD COLUMN "audit_sampled" boolean NOT NULL DEFAULT false,
        ADD COLUMN "audit_sampled_at" timestamptz,
        ADD COLUMN "finalized_computation_id" uuid,
        ADD COLUMN "finalized_by" uuid REFERENCES "examcollect"."account"("id") ON DELETE RESTRICT,
        ADD COLUMN "finalized_at" timestamptz
    `);

    // §2.3 luật 7 — dữ liệu cũ. Hôm nay chỉ `markUngradable` sinh ra dòng như vậy, và nó chỉ chạy
    // khi job hết lượt thử: lỗi phía hệ thống. Không điền thì chính các phiên đang kẹt vẫn kẹt,
    // vì chấm lại đòi `ungradable_class` khác null. Lượt số 1 chép lý do cũ thêm ở `1789450000000`.
    await q.query(`
      UPDATE "examcollect"."grading_result"
         SET ungradable_class = 'system'
       WHERE status = 'flagged_for_review' AND ai_total_score IS NULL
         AND ungradable_reason IS NOT NULL AND ungradable_class IS NULL
    `);

    await q.query(`
      ALTER TABLE "examcollect"."grading_result"
        ADD CONSTRAINT "ck_grading_result_ungradable"
          CHECK (ungradable_class IS NULL OR (ai_total_score IS NULL AND ungradable_reason IS NOT NULL)),
        ADD CONSTRAINT "ck_grading_result_audit_sampled_at"
          CHECK (audit_sampled = (audit_sampled_at IS NOT NULL)),
        ADD CONSTRAINT "ck_grading_result_finalized_pair"
          CHECK ((finalized_by IS NULL) = (finalized_at IS NULL))
    `);
    // Dòng đã chốt TRƯỚC migration này giữ `finalized_by` null: người ký tên của chúng nằm ở
    // dòng `teacher_review` mà `finalizeGrades` đã ghi, như trước. Điền ngược là bịa một thời
    // điểm chốt không ai ghi lại.

    // ---------------------------------------------------------------- teacher_review
    await q.query(`CREATE TYPE "examcollect"."teacher_review_kind" AS ENUM ('review', 'error_exception', 'manual_score', 'bulk_accept')`);
    await q.query(`CREATE TYPE "examcollect"."error_exception_direction" AS ENUM ('exclude', 'include')`);
    await q.query(`
      ALTER TABLE "examcollect"."teacher_review"
        ADD COLUMN "kind" "examcollect"."teacher_review_kind" NOT NULL DEFAULT 'review',
        ADD COLUMN "error_rule_id" uuid,
        ADD COLUMN "direction" "examcollect"."error_exception_direction",
        ALTER COLUMN "final_score" DROP NOT NULL
    `);
    // Dòng của duyệt hàng loạt là dòng duy nhất mang `applied_rule`.
    await q.query(`UPDATE "examcollect"."teacher_review" SET kind = 'bulk_accept' WHERE applied_rule IS NOT NULL`);
    await q.query(`
      ALTER TABLE "examcollect"."teacher_review"
        ADD CONSTRAINT "ck_teacher_review_score_by_kind"
          CHECK (kind = 'error_exception' OR final_score IS NOT NULL),
        ADD CONSTRAINT "ck_teacher_review_exception_target"
          CHECK ((kind = 'error_exception' AND error_rule_id IS NOT NULL AND direction IS NOT NULL)
              OR (kind <> 'error_exception' AND error_rule_id IS NULL AND direction IS NULL))
    `);

    // ---------------------------------------------------------------- exam_session
    await q.query(`
      ALTER TABLE "examcollect"."exam_session"
        ADD COLUMN "grading_seed" uuid NOT NULL DEFAULT uuid_generate_v4(),
        ADD COLUMN "test_bundle_id" uuid,
        ADD COLUMN "pinned_price_version_id" uuid
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "examcollect"."exam_session" DROP COLUMN "pinned_price_version_id", DROP COLUMN "test_bundle_id", DROP COLUMN "grading_seed"`);
    await q.query(`ALTER TABLE "examcollect"."teacher_review" DROP CONSTRAINT "ck_teacher_review_exception_target", DROP CONSTRAINT "ck_teacher_review_score_by_kind"`);
    // Không khôi phục NOT NULL của final_score nếu đã có dòng ngoại lệ: `down()` phải nổ thay vì
    // xoá dòng của giảng viên.
    await q.query(`ALTER TABLE "examcollect"."teacher_review" ALTER COLUMN "final_score" SET NOT NULL`);
    await q.query(`ALTER TABLE "examcollect"."teacher_review" DROP COLUMN "direction", DROP COLUMN "error_rule_id", DROP COLUMN "kind"`);
    await q.query(`DROP TYPE "examcollect"."error_exception_direction"`);
    await q.query(`DROP TYPE "examcollect"."teacher_review_kind"`);
    await q.query(`
      ALTER TABLE "examcollect"."grading_result"
        DROP CONSTRAINT "ck_grading_result_finalized_pair",
        DROP CONSTRAINT "ck_grading_result_audit_sampled_at",
        DROP CONSTRAINT "ck_grading_result_ungradable",
        DROP COLUMN "finalized_at", DROP COLUMN "finalized_by", DROP COLUMN "finalized_computation_id",
        DROP COLUMN "audit_sampled_at", DROP COLUMN "audit_sampled", DROP COLUMN "ungradable_class",
        DROP COLUMN "current_attempt_id", DROP COLUMN "pipeline"
    `);
    await q.query(`DROP TYPE "examcollect"."ungradable_class"`);
    await q.query(`DROP TYPE "examcollect"."grading_pipeline"`);
  }
}
```

- [ ] **Step 4: Kiểu TS (LEAF) và entity.**

```ts
// apps/api/src/grading/grading-model.types.ts
/**
 * Enum của mô hình dữ liệu §14.1. File LEAF — đọc bởi decorator `@Column`; import bất cứ thứ gì
 * ở đây là mở cửa cho `undefined` lọt vào decorator dưới CommonJS (xem `advocate.types.ts`).
 */
export const GRADING_PIPELINES = ['one_shot', 'investigator'] as const;
export type GradingPipeline = (typeof GRADING_PIPELINES)[number];

/** Đúng hai lớp lý do không chấm được (§4.4). */
export const UNGRADABLE_CLASSES = ['system', 'submission'] as const;
export type UngradableClass = (typeof UNGRADABLE_CLASSES)[number];

/** `error_exception` là dòng DUY NHẤT được không mang điểm (§14.1). */
export const TEACHER_REVIEW_KINDS = ['review', 'error_exception', 'manual_score', 'bulk_accept'] as const;
export type TeacherReviewKind = (typeof TEACHER_REVIEW_KINDS)[number];

/** `exclude` = bỏ lỗi này cho riêng bài này (cũng dùng cho *đồng ý bác bỏ*); `include` = giữ lỗi này. */
export const EXCEPTION_DIRECTIONS = ['exclude', 'include'] as const;
export type ExceptionDirection = (typeof EXCEPTION_DIRECTIONS)[number];
```

`grading-result.entity.ts`:
- Union `GradingResultStatus` (:8-15) thêm `| 'audit_pending'` ngay sau `'auto_approved'`; mảng `enum` của cột `status` (:172-186) thêm `'audit_pending'` cùng vị trí.
- Import `import { GRADING_PIPELINES, GradingPipeline, UNGRADABLE_CLASSES, UngradableClass } from '../grading-model.types';` và thêm cột (sau `ungradableReason`):

```ts
  /** Gán lúc `startGrading` tạo dòng, từ bài nộp, và không bao giờ đổi — trigger vòng đời chặn đổi (§14.1). */
  @Column({ type: 'enum', enum: GRADING_PIPELINES, enumName: 'grading_pipeline', default: 'one_shot' })
  pipeline!: GradingPipeline;

  /** Null khi kết quả chưa có lượt chấm nào ghi lại — dòng `one_shot` chấm xong trước bước 3d. */
  @Column({ name: 'current_attempt_id', type: 'uuid', nullable: true })
  currentAttemptId!: string | null;

  /** Null khi có điểm. `ungradableReason` giữ làm lời kể cho người đọc (§4.4). */
  @Column({ name: 'ungradable_class', type: 'enum', enum: UNGRADABLE_CLASSES, enumName: 'ungradable_class', nullable: true })
  ungradableClass!: UngradableClass | null;

  @Column({ name: 'audit_sampled', type: 'boolean', default: false })
  auditSampled!: boolean;

  @Column({ name: 'audit_sampled_at', type: 'timestamptz', nullable: true })
  auditSampledAt!: Date | null;

  /** Điểm đã công bố của đường `investigator` — bước 3c ghi. */
  @Column({ name: 'finalized_computation_id', type: 'uuid', nullable: true })
  finalizedComputationId!: string | null;

  /** Người ký tên lên điểm đã công bố; trigger vòng đời đòi nó khi sang `finalized` (§14.4). */
  @Column({ name: 'finalized_by', type: 'uuid', nullable: true })
  finalizedBy!: string | null;

  @Column({ name: 'finalized_at', type: 'timestamptz', nullable: true })
  finalizedAt!: Date | null;
```

`teacher-review.entity.ts`: `finalScore` thành `@Column({ name: 'final_score', type: 'numeric', precision: 6, scale: 2, nullable: true }) finalScore!: string | null;` (giữ nguyên các option khác đang có), và thêm:

```ts
  @Column({ type: 'enum', enum: TEACHER_REVIEW_KINDS, enumName: 'teacher_review_kind', default: 'review' })
  kind!: TeacherReviewKind;

  /** Chỉ dòng `error_exception` mang luật và chiều (`ck_teacher_review_exception_target`). */
  @Column({ name: 'error_rule_id', type: 'uuid', nullable: true })
  errorRuleId!: string | null;

  @Column({ type: 'enum', enum: EXCEPTION_DIRECTIONS, enumName: 'error_exception_direction', nullable: true })
  direction!: ExceptionDirection | null;
```

`exam-session.entity.ts`, sau `rubricId`:

```ts
  /** Hạt giống rút mẫu kiểm tra (§8.1) — cố định từ lúc tạo phiên, không phụ thuộc điểm. */
  @Column({ name: 'grading_seed', type: 'uuid', default: () => 'uuid_generate_v4()' })
  gradingSeed!: string;

  /** Gói test ghim lúc bắt đầu chấm (§14.1). */
  @Column({ name: 'test_bundle_id', type: 'uuid', nullable: true })
  testBundleId!: string | null;

  /** Bảng giá ghim LÚC CHỐT (§2.2). */
  @Column({ name: 'pinned_price_version_id', type: 'uuid', nullable: true })
  pinnedPriceVersionId!: string | null;
```

- [ ] **Step 5: `final_score` nullable ở chỗ đọc điểm.** Từ nay chỉ dòng review MANG điểm là điểm hiện tại của đường `one_shot` (§14.2).

`teacher-review.service.ts` — `currentFinalScore`:

```ts
  /**
   * A result's current score on the `one_shot` path: the newest review row that CARRIES a score,
   * or the AI's own. `error_exception` rows carry none (§14.1); skipping them here is the
   * `one_shot` half of §14.2 — the `investigator` half reads `score_computation` (step 3c).
   */
  async currentFinalScore(
    result: GradingResultEntity,
    manager: EntityManager = this.reviews.manager,
  ): Promise<number | null> {
    const latest = await manager
      .getRepository(TeacherReviewEntity)
      .createQueryBuilder('r')
      .where('r.grading_result_id = :id', { id: result.id })
      .andWhere('r.final_score IS NOT NULL')
      .orderBy('r.reviewed_at', 'DESC')
      .getOne();
    if (latest?.finalScore != null) {
      return Number(latest.finalScore);
    }
    return result.aiTotalScore === null ? null : Number(result.aiTotalScore);
  }
```

`reviewWithin`: trong `reviews.create({...})` thêm `kind: appliedRule ? 'bulk_accept' : 'review',`. `finalizeGrades`: dòng review ghi cho bài `auto_approved` thêm `kind: 'bulk_accept',` (chấp nhận nguyên đề xuất, hàng loạt, bởi người bấm chốt).

`grading.service.ts` ~:611 — truy vấn `DISTINCT ON (tr.grading_result_id)`: thêm `AND tr.final_score IS NOT NULL` vào `WHERE`, ngay sau `tr.grading_result_id = ANY($1)`.

- [ ] **Step 6: Chạy.**

```bash
bash .superpowers/sdd/2026-09-26-grading-data-model/db.sh pnpm --filter api migration:run
pnpm --filter api exec tsc --noEmit -p tsconfig.json
pnpm --filter api test -- teacher-review grading
pnpm --filter api test:e2e -- grading-data-model teacher-review bulk-review grading-results-view
```

Expected: PASS. `tsc` đỏ ở đâu vì `finalScore: string | null` thì sửa chỗ đó bằng cách xử lý null thật (không `!`), ghi vào ledger.

- [ ] **Step 7: Commit.**

```bash
git add apps/api/src/database/migrations/1789420000000-AddAuditPendingStatus.ts apps/api/src/database/migrations/1789430000000-GradingResultReviewSessionColumns.ts apps/api/src/grading/grading-model.types.ts apps/api/src/grading/entities/grading-result.entity.ts apps/api/src/grading/entities/teacher-review.entity.ts apps/api/src/exam-session/entities/exam-session.entity.ts apps/api/src/grading/teacher-review.service.ts apps/api/src/grading/grading.service.ts apps/api/test/grading-data-model.e2e-spec.ts
git commit -m "feat(db): cột §14.1 của grading_result, teacher_review, exam_session; audit_pending; lớp lý do cho bài không chấm được cũ (§2.3 luật 7)"
```

---

### Task 3: `rubric_criterion.key` và nguồn gốc đáp án mẫu

**Files:**
- Create: `apps/api/src/database/migrations/1789435000000-CriterionKeyAndAnswerOrigin.ts`
- Create: `apps/api/src/grading/criterion-key.ts`, test `apps/api/src/grading/criterion-key.spec.ts`
- Modify: `apps/api/src/grading/entities/rubric-criterion.entity.ts`, `apps/api/src/grading/entities/grading-reference.entity.ts`
- Modify: `apps/api/src/grading/dto/rubric.dto.ts` (`RubricCriterionDto`), `apps/api/src/grading/rubric.service.ts` (`saveNewVersion`, `toView`)
- Modify: `apps/api/src/grading/grading-reference.service.ts` (`upsert`), `apps/api/src/exam-authoring/attach-exam.service.ts` (lời gọi `upsert`)
- Modify: e2e seed duy nhất chèn `rubric_criterion` bằng SQL thô (tìm bằng `grep -rln "INSERT INTO examcollect.rubric_criterion" apps/api/test`)
- Modify: `apps/api/test/helpers/grading-seed.ts` (thêm `seedCriterion`)
- Test: `apps/api/test/grading-data-model.e2e-spec.ts`

**Interfaces:**
- Produces: `assignCriterionKeys(criteria: { description: string; key?: string }[]): string[]` (ném `DuplicateCriterionKeyError`); `RubricCriterionEntity.key`; `GradingReferenceEntity.modelAnswerOrigin: ModelAnswerOrigin | null`; `GradingReferenceService.upsert(session, dto, teacherId, origin: ModelAnswerOrigin = 'teacher')`; helper e2e `seedCriterion(ds, rubricId, key, maxPoints = 10)`.

- [ ] **Step 1: Test đỏ — hàm thuần.**

```ts
// apps/api/src/grading/criterion-key.spec.ts
import { assignCriterionKeys, DuplicateCriterionKeyError } from './criterion-key';

describe('assignCriterionKeys', () => {
  it('sinh key từ mô tả: bỏ dấu, đ → d, chữ thường, ký tự lạ thành _', () => {
    expect(assignCriterionKeys([{ description: 'Tính đúng đắn (C++)' }, { description: 'Hiệu năng — độ phức tạp' }]))
      .toEqual(['tinh_dung_dan_c', 'hieu_nang_do_phuc_tap']);
  });

  it('key khai sẵn được giữ nguyên', () => {
    expect(assignCriterionKeys([{ description: 'Gì cũng được', key: 'tinh_dung' }])).toEqual(['tinh_dung']);
  });

  it('mô tả trùng → thêm hậu tố _2, _3; không đụng key khai sẵn', () => {
    expect(assignCriterionKeys([
      { description: 'Trình bày' },
      { description: 'Trình bày' },
      { description: 'x', key: 'trinh_bay_3' },
      { description: 'Trình bày' },
    ])).toEqual(['trinh_bay', 'trinh_bay_2', 'trinh_bay_3', 'trinh_bay_4']);
  });

  it('mô tả không còn ký tự nào dùng được → tieu_chi_{vị trí}', () => {
    expect(assignCriterionKeys([{ description: '—' }, { description: '!!!' }])).toEqual(['tieu_chi_1', 'tieu_chi_2']);
  });

  it('cắt ở 48 ký tự và không để _ ở cuối', () => {
    const [key] = assignCriterionKeys([{ description: 'a'.repeat(47) + ' bcd' }]);
    expect(key.length).toBeLessThanOrEqual(48);
    expect(key.endsWith('_')).toBe(false);
  });

  it('hai key KHAI SẴN trùng nhau → lỗi, không tự đổi tên key của giảng viên', () => {
    expect(() => assignCriterionKeys([{ description: 'a', key: 'k' }, { description: 'b', key: 'k' }]))
      .toThrow(DuplicateCriterionKeyError);
  });
});
```

Run: `pnpm --filter api test -- criterion-key` — Expected: FAIL (module không có).

- [ ] **Step 2: Hàm.**

```ts
// apps/api/src/grading/criterion-key.ts
/**
 * `rubric_criterion.key` (§14.1): đặt lúc tạo tiêu chí, không bao giờ sửa. Luật lỗi trỏ tiêu chí
 * bằng key chứ không bằng id của một dòng tiêu chí, vì luật dùng lại qua nhiều đề và nhiều phiên
 * bản rubric. Nên key phải ỔN ĐỊNH: cùng mô tả qua hai lần lưu rubric thì ra cùng key.
 */
export const CRITERION_KEY = /^[a-z0-9_]{1,64}$/;
const MAX_DERIVED = 48;

export class DuplicateCriterionKeyError extends Error {
  constructor(readonly key: string) {
    super(`Hai tiêu chí cùng khai key "${key}"`);
  }
}

function slug(description: string): string {
  return description
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, MAX_DERIVED)
    .replace(/_+$/g, '');
}

export function assignCriterionKeys(criteria: { description: string; key?: string }[]): string[] {
  const explicit = criteria.map((c) => c.key).filter((k): k is string => Boolean(k));
  const taken = new Set<string>();
  for (const key of explicit) {
    if (taken.has(key)) throw new DuplicateCriterionKeyError(key);
    taken.add(key);
  }
  return criteria.map((c, index) => {
    if (c.key) return c.key;
    const base = slug(c.description) || `tieu_chi_${index + 1}`;
    let key = base;
    for (let n = 2; taken.has(key); n++) key = `${base}_${n}`;
    taken.add(key);
    return key;
  });
}
```

Run: `pnpm --filter api test -- criterion-key` — Expected: PASS.

- [ ] **Step 3: Test đỏ — DB.** Thêm vào `grading-data-model.e2e-spec.ts` (import thêm `seedCriterion`):

```ts
  describe('rubric_criterion.key', () => {
    it('mọi tiêu chí đều có key, duy nhất trong rubric', async () => {
      const [row] = await ds.query(
        `SELECT count(*) FILTER (WHERE key IS NULL)::int AS missing,
                count(*)::int - count(DISTINCT (rubric_id, key))::int AS dup
           FROM examcollect.rubric_criterion`,
      );
      expect(row).toEqual({ missing: 0, dup: 0 });
    });

    it('trigger đóng băng tiêu chí vẫn BẬT sau khi điền key (§14.4)', async () => {
      const [row] = await ds.query(
        `SELECT tgenabled FROM pg_trigger WHERE tgname = 'trg_rubric_criterion_guard_immutable'`,
      );
      expect(row.tgenabled).toBe('O');
    });

    it('key trùng trong một rubric bị từ chối', async () => {
      const ctx = await seedSession(ds, 'dm-key');
      await seedCriterion(ds, ctx.rubricId, 'tinh_dung');
      await expect(seedCriterion(ds, ctx.rubricId, 'tinh_dung')).rejects.toThrow(/uq_rubric_criterion_key/);
    });
  });
```

Helper, thêm vào `grading-seed.ts`:

```ts
export async function seedCriterion(ds: DataSource, rubricId: string, key: string, maxPoints = 10): Promise<string> {
  const [row] = await ds.query(
    `INSERT INTO examcollect.rubric_criterion (rubric_id, description, max_points, key)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [rubricId, `Tiêu chí ${key}`, maxPoints, key],
  );
  return row.id;
}
```

Run: `pnpm --filter api test:e2e -- grading-data-model` — Expected: FAIL (`column "key" does not exist`).

- [ ] **Step 4: Migration.**

```ts
// apps/api/src/database/migrations/1789435000000-CriterionKeyAndAnswerOrigin.ts
import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `rubric_criterion.key` và `grading_reference.model_answer_origin` — spec §14.1, §14.4.
 *
 * Điền key cho tiêu chí cũ đụng `guard_rubric_criteria_immutable`: trigger bắn với mọi rubric đã
 * có kết quả chấm. §14.4 chốt cách làm: tắt ĐÚNG trigger đó, trong CÙNG transaction, chỉ đụng
 * cột mới, rồi bật lại. Lỗi giữa chừng → rollback → trigger không bao giờ nằm tắt.
 */
export class CriterionKeyAndAnswerOrigin1789435000000 implements MigrationInterface {
  name = 'CriterionKeyAndAnswerOrigin1789435000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "examcollect"."rubric_criterion" ADD COLUMN "key" text`);

    await q.startTransaction();
    try {
      await q.query(`ALTER TABLE "examcollect"."rubric_criterion" DISABLE TRIGGER "trg_rubric_criterion_guard_immutable"`);
      // Thứ tự của tiêu chí: `sort_order`, rồi thời điểm tạo, rồi id — cùng thứ tự rubric hiện ra.
      await q.query(`
        UPDATE "examcollect"."rubric_criterion" rc
           SET key = k.key
          FROM (SELECT id, 'tieu_chi_' || row_number() OVER (PARTITION BY rubric_id ORDER BY sort_order, created_at, id) AS key
                  FROM "examcollect"."rubric_criterion") k
         WHERE rc.id = k.id AND rc.key IS NULL
      `);
      await q.query(`ALTER TABLE "examcollect"."rubric_criterion" ENABLE TRIGGER "trg_rubric_criterion_guard_immutable"`);
      await q.commitTransaction();
    } catch (error) {
      await q.rollbackTransaction();
      throw error;
    }

    await q.query(`ALTER TABLE "examcollect"."rubric_criterion" ALTER COLUMN "key" SET NOT NULL`);
    await q.query(`ALTER TABLE "examcollect"."rubric_criterion" ADD CONSTRAINT "ck_rubric_criterion_key" CHECK (key ~ '^[a-z0-9_]{1,64}$')`);
    await q.query(`CREATE UNIQUE INDEX "uq_rubric_criterion_key" ON "examcollect"."rubric_criterion" ("rubric_id", "key")`);

    // ------------------------------------------------------------ nguồn gốc đáp án mẫu
    await q.query(`CREATE TYPE "examcollect"."model_answer_origin" AS ENUM ('teacher', 'authoring', 'generated')`);
    await q.query(`ALTER TABLE "examcollect"."grading_reference" ADD COLUMN "model_answer_origin" "examcollect"."model_answer_origin"`);
    // Phần soạn đề gắn đáp án bằng một tên file CỐ ĐỊNH (`ANSWER_KEY_FILENAME`); mọi đáp án khác
    // do giảng viên đưa. Không có đáp án thì không có nguồn gốc.
    await q.query(`
      UPDATE "examcollect"."grading_reference"
         SET model_answer_origin = CASE WHEN model_answer_filename = 'dap-an-va-test.docx' THEN 'authoring'::examcollect.model_answer_origin
                                        ELSE 'teacher'::examcollect.model_answer_origin END
       WHERE model_answer_storage_key IS NOT NULL OR model_answer_note IS NOT NULL
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "examcollect"."grading_reference" DROP COLUMN "model_answer_origin"`);
    await q.query(`DROP TYPE "examcollect"."model_answer_origin"`);
    await q.query(`DROP INDEX "examcollect"."uq_rubric_criterion_key"`);
    await q.query(`ALTER TABLE "examcollect"."rubric_criterion" DROP CONSTRAINT "ck_rubric_criterion_key"`);
    await q.query(`ALTER TABLE "examcollect"."rubric_criterion" DROP COLUMN "key"`);
  }
}
```

- [ ] **Step 5: Entity, DTO, service.**

`rubric-criterion.entity.ts`, sau `sortOrder`:

```ts
  /**
   * Đặt lúc tạo tiêu chí, không bao giờ sửa (§14.1). Luật lỗi trỏ tiêu chí bằng key, vì luật dùng
   * lại qua nhiều đề còn tiêu chí thuộc một phiên bản rubric bất biến.
   */
  @Index('uq_rubric_criterion_key', ['rubricId', 'key'], { unique: true })
  @Column({ type: 'text' })
  key!: string;
```

(Nếu entity khai `@Index` ở mức class thì đặt `@Index('uq_rubric_criterion_key', ['rubricId', 'key'], { unique: true })` lên class, cạnh index `idx_rubric_criterion_rubric`, thay vì lên cột.)

`grading-reference.entity.ts`: thêm vào `grading-model.types.ts`

```ts
export const MODEL_ANSWER_ORIGINS = ['teacher', 'authoring', 'generated'] as const;
export type ModelAnswerOrigin = (typeof MODEL_ANSWER_ORIGINS)[number];
```

và cột:

```ts
  /** Ai đưa đáp án mẫu (§14.1). Null khi phiên chưa có đáp án. */
  @Column({ name: 'model_answer_origin', type: 'enum', enum: MODEL_ANSWER_ORIGINS, enumName: 'model_answer_origin', nullable: true })
  modelAnswerOrigin!: ModelAnswerOrigin | null;
```

`rubric.dto.ts`, trong `RubricCriterionDto`:

```ts
  /** Tuỳ chọn: không khai thì server sinh từ mô tả (`assignCriterionKeys`). */
  @IsOptional()
  @Matches(/^[a-z0-9_]{1,64}$/, { message: 'key chỉ gồm chữ thường không dấu, số, "_" và tối đa 64 ký tự' })
  key?: string;
```

`rubric.service.ts` — `saveNewVersion`, trước `manager.save(RubricCriterionEntity, …)`:

```ts
      let keys: string[];
      try {
        keys = assignCriterionKeys(dto.criteria);
      } catch (error) {
        if (error instanceof DuplicateCriterionKeyError) {
          throw new BadRequestException(`Hai tiêu chí cùng khai key "${error.key}".`);
        }
        throw error;
      }
```

và trong `manager.create(RubricCriterionEntity, {...})` thêm `key: keys[index],` (đổi `dto.criteria.map((criterion) =>` thành `dto.criteria.map((criterion, index) =>`), cùng `sortOrder: index,` — hôm nay mọi tiêu chí đều `sort_order = 0`, nên thứ tự chỉ còn do thời điểm tạo. `toView`: thêm `key: c.key` vào mỗi tiêu chí của view.

`grading-reference.service.ts` — `upsert` thêm tham số cuối `origin: ModelAnswerOrigin = 'teacher'`, và ngay trước `return this.references.save(row);`:

```ts
    // Nguồn gốc đi theo LƯỢT GHI ĐÁP ÁN, cùng lý do với `modelAnswerUnverified` ở trên: lượt
    // này gửi đáp án thì nguồn là người gửi; không gửi thì giữ nguồn cũ; không còn đáp án thì null.
    const answerSent = dto.modelAnswerStorageKey !== undefined || dto.modelAnswerNote !== undefined;
    const hasAnswer = Boolean(row.modelAnswerStorageKey || row.modelAnswerNote);
    row.modelAnswerOrigin = !hasAnswer ? null : answerSent ? origin : (existing?.modelAnswerOrigin ?? origin);
```

`attach-exam.service.ts` (:151): `this.references.upsert(session, {...}, teacherId, 'authoring')`.

Seed e2e duy nhất chèn `rubric_criterion` bằng SQL thô là `anchor-freeze.e2e-spec.ts:72`: đổi thành
`INSERT INTO examcollect.rubric_criterion (rubric_id, description, max_points, key) VALUES ($1, 'Trình bày thuật toán', 10, 'trinh_bay_thuat_toan') RETURNING id`.

- [ ] **Step 6: Chạy.**

```bash
bash .superpowers/sdd/2026-09-26-grading-data-model/db.sh pnpm --filter api migration:run
pnpm --filter api exec tsc --noEmit -p tsconfig.json
pnpm --filter api test -- criterion-key rubric grading-reference attach-exam
pnpm --filter api test:e2e -- grading-data-model session-rubric grading-reference exam-authoring-attach
```

Expected: PASS.

- [ ] **Step 7: Commit.**

```bash
git add apps/api/src/database/migrations/1789435000000-CriterionKeyAndAnswerOrigin.ts apps/api/src/grading/criterion-key.ts apps/api/src/grading/criterion-key.spec.ts apps/api/src/grading/grading-model.types.ts apps/api/src/grading/entities/rubric-criterion.entity.ts apps/api/src/grading/entities/grading-reference.entity.ts apps/api/src/grading/dto/rubric.dto.ts apps/api/src/grading/rubric.service.ts apps/api/src/grading/grading-reference.service.ts apps/api/src/exam-authoring/attach-exam.service.ts apps/api/test
git commit -m "feat(db): key của tiêu chí — điền một lần dưới trigger đóng băng, sinh từ mô tả khi tạo; nguồn gốc đáp án mẫu (§14.1, §14.4)"
```

---

### Task 4: Bảng lỗi và bảng giá

**Files:**
- Create: `apps/api/src/database/migrations/1789440000000-ErrorRulesAndPrices.ts`
- Create: `apps/api/src/grading/entities/error-rule.entity.ts`, `error-rule-revision.entity.ts`, `price-table-version.entity.ts`, `rule-price.entity.ts`
- Modify: `apps/api/src/grading/grading-model.types.ts`, `apps/api/src/database/data-source.ts` (danh sách `entities`)
- Test: `apps/api/test/grading-data-model.e2e-spec.ts`

**Interfaces:**
- Produces: bảng `error_rule`, `error_rule_revision`, `price_table_version`, `rule_price`; hàm `examcollect.guard_append_only()`, `examcollect.guard_no_delete()`; entity `ErrorRuleEntity`, `ErrorRuleRevisionEntity`, `PriceTableVersionEntity`, `RulePriceEntity`; `ERROR_RULE_STATES`, `ERROR_RULE_ORIGINS`.
- Consumes: `teacher_review.error_rule_id`, `exam_session.pinned_price_version_id` (Task 2) — thêm khoá ngoại ở đây.

- [ ] **Step 1: Test đỏ.** Thêm vào `grading-data-model.e2e-spec.ts` (import thêm `seedTeacher`):

```ts
  describe('bảng lỗi và bảng giá', () => {
    async function rule(teacherId: string, key = `r_${Date.now().toString(36)}`) {
      const [r] = await ds.query(
        `INSERT INTO examcollect.error_rule (teacher_id, rule_key, origin, state) VALUES ($1, $2, 'teacher', 'active') RETURNING id`,
        [teacherId, key],
      );
      const [rev] = await ds.query(
        `INSERT INTO examcollect.error_rule_revision (error_rule_id, revision, name, description, criterion_key, created_by)
         VALUES ($1, 1, 'Sai ca biên', 'mô tả', 'tinh_dung', $2) RETURNING id`,
        [r.id, teacherId],
      );
      await ds.query(`UPDATE examcollect.error_rule SET current_revision_id = $2 WHERE id = $1`, [r.id, rev.id]);
      return { ruleId: r.id as string, revisionId: rev.id as string };
    }

    it('một giảng viên không có hai luật cùng rule_key; hai giảng viên thì được (T-POL-8)', async () => {
      const a = await seedTeacher(ds, 'rule-a');
      const b = await seedTeacher(ds, 'rule-b');
      await rule(a, 'sai_ca_bien');
      await rule(b, 'sai_ca_bien');
      await expect(rule(a, 'sai_ca_bien')).rejects.toThrow(/uq_error_rule_teacher_key/);
    });

    it('bản sửa luật là chỉ-thêm: sửa hay xoá đều bị từ chối', async () => {
      const t = await seedTeacher(ds, 'rev');
      const { revisionId } = await rule(t);
      await expect(ds.query(`UPDATE examcollect.error_rule_revision SET name = 'khác' WHERE id = $1`, [revisionId])).rejects.toThrow(/chỉ thêm/);
      await expect(ds.query(`DELETE FROM examcollect.error_rule_revision WHERE id = $1`, [revisionId])).rejects.toThrow(/chỉ thêm/);
    });

    it('bản sửa hiện hành phải thuộc chính luật đó', async () => {
      const t = await seedTeacher(ds, 'rev-own');
      const x = await rule(t);
      const y = await rule(t);
      await expect(ds.query(`UPDATE examcollect.error_rule SET current_revision_id = $2 WHERE id = $1`, [x.ruleId, y.revisionId]))
        .rejects.toThrow(/fk_error_rule_current_revision/);
    });

    it('luật không bao giờ bị xoá — hồ sơ trỏ vào nó vĩnh viễn', async () => {
      const t = await seedTeacher(ds, 'rule-del');
      const { ruleId } = await rule(t);
      await expect(ds.query(`DELETE FROM examcollect.error_rule WHERE id = $1`, [ruleId])).rejects.toThrow(/không xoá/);
    });

    it('giá: chỉ-thêm, và không trỏ được luật của giảng viên khác', async () => {
      const a = await seedTeacher(ds, 'price-a');
      const b = await seedTeacher(ds, 'price-b');
      const { ruleId } = await rule(b);
      const [v] = await ds.query(
        `INSERT INTO examcollect.price_table_version (teacher_id, version, created_by) VALUES ($1, 1, $1) RETURNING id`,
        [a],
      );
      await expect(ds.query(
        `INSERT INTO examcollect.rule_price (price_table_version_id, error_rule_id, teacher_id, deduction) VALUES ($1, $2, $3, 1.5)`,
        [v.id, ruleId, a],
      )).rejects.toThrow(/fk_rule_price_rule_teacher/);

      const own = await rule(a);
      await ds.query(
        `INSERT INTO examcollect.rule_price (price_table_version_id, error_rule_id, teacher_id, deduction) VALUES ($1, $2, $3, 1.5)`,
        [v.id, own.ruleId, a],
      );
      await expect(ds.query(`UPDATE examcollect.rule_price SET deduction = 2 WHERE price_table_version_id = $1`, [v.id])).rejects.toThrow(/chỉ thêm/);
      await expect(ds.query(`UPDATE examcollect.price_table_version SET version = 9 WHERE id = $1`, [v.id])).rejects.toThrow(/chỉ thêm/);
    });

    it('luật chưa có giá là giá null, không phải 0 (§2.1)', async () => {
      const a = await seedTeacher(ds, 'price-null');
      const { ruleId } = await rule(a);
      const [v] = await ds.query(`INSERT INTO examcollect.price_table_version (teacher_id, version, created_by) VALUES ($1, 1, $1) RETURNING id`, [a]);
      const [p] = await ds.query(
        `INSERT INTO examcollect.rule_price (price_table_version_id, error_rule_id, teacher_id, deduction) VALUES ($1, $2, $3, NULL) RETURNING deduction`,
        [v.id, ruleId, a],
      );
      expect(p.deduction).toBeNull();
    });

    it('phiên ghim bảng giá của chính giảng viên phiên đó', async () => {
      const ctx = await seedSession(ds, 'pin');
      const other = await seedTeacher(ds, 'pin-other');
      const [v] = await ds.query(`INSERT INTO examcollect.price_table_version (teacher_id, version, created_by) VALUES ($1, 1, $1) RETURNING id`, [other]);
      await expect(ds.query(`UPDATE examcollect.exam_session SET pinned_price_version_id = $2 WHERE id = $1`, [ctx.sessionId, v.id]))
        .rejects.toThrow(/fk_exam_session_pinned_price/);
    });
  });
```

Run: `pnpm --filter api test:e2e -- grading-data-model` — Expected: FAIL (`relation "examcollect.error_rule" does not exist`).

- [ ] **Step 2: Migration.**

```ts
// apps/api/src/database/migrations/1789440000000-ErrorRulesAndPrices.ts
import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Bảng lỗi có uuid và bảng giá có phiên bản — spec §14.1, §2.1, §2.2. Service ghi chúng là bước
 * 3c; ở đây là luật bất biến của chúng ở tầng DB.
 *
 * Ngoài §14.1, `rule_price` mang thêm `teacher_id`: hai khoá ngoại ghép `(…, teacher_id)` làm cho
 * một giá KHÔNG THỂ trỏ luật của giảng viên khác (T-POL-8) — luật đó ở tầng DB, không trông vào
 * service nhớ lọc.
 */
export class ErrorRulesAndPrices1789440000000 implements MigrationInterface {
  name = 'ErrorRulesAndPrices1789440000000';

  public async up(q: QueryRunner): Promise<void> {
    // ------------------------------------------------------------ guard dùng chung
    await q.query(`
      CREATE FUNCTION examcollect.guard_append_only() RETURNS trigger
      LANGUAGE plpgsql SET search_path TO 'examcollect', 'public' AS $$
      BEGIN
        RAISE EXCEPTION 'Bảng % chỉ thêm — % bị từ chối', TG_TABLE_NAME, TG_OP
          USING ERRCODE = 'object_not_in_prerequisite_state';
      END $$
    `);
    await q.query(`
      CREATE FUNCTION examcollect.guard_no_delete() RETURNS trigger
      LANGUAGE plpgsql SET search_path TO 'examcollect', 'public' AS $$
      BEGIN
        RAISE EXCEPTION 'Dòng của bảng % không xoá được — hồ sơ trỏ vào nó vĩnh viễn', TG_TABLE_NAME
          USING ERRCODE = 'object_not_in_prerequisite_state';
      END $$
    `);

    // ------------------------------------------------------------ luật
    await q.query(`CREATE TYPE "examcollect"."error_rule_state" AS ENUM ('proposed', 'active', 'dismissed', 'retired')`);
    await q.query(`CREATE TYPE "examcollect"."error_rule_origin" AS ENUM ('teacher', 'seed', 'agent_reported')`);
    await q.query(`
      CREATE TABLE "examcollect"."error_rule" (
        "id"                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at"          timestamptz NOT NULL DEFAULT now(),
        "updated_at"          timestamptz NOT NULL DEFAULT now(),
        "teacher_id"          uuid NOT NULL REFERENCES "examcollect"."account"("id") ON DELETE RESTRICT,
        "rule_key"            text NOT NULL CONSTRAINT "ck_error_rule_key" CHECK (rule_key ~ '^[a-z0-9_]{1,64}$'),
        "state"               "examcollect"."error_rule_state" NOT NULL DEFAULT 'proposed',
        "origin"              "examcollect"."error_rule_origin" NOT NULL,
        "current_revision_id" uuid,
        CONSTRAINT "uq_error_rule_teacher_key" UNIQUE ("teacher_id", "rule_key"),
        CONSTRAINT "uq_error_rule_id_teacher" UNIQUE ("id", "teacher_id")
      )
    `);
    await q.query(`
      CREATE TABLE "examcollect"."error_rule_revision" (
        "id"            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at"    timestamptz NOT NULL DEFAULT now(),
        "error_rule_id" uuid NOT NULL REFERENCES "examcollect"."error_rule"("id") ON DELETE RESTRICT,
        "revision"      int NOT NULL CHECK (revision >= 1),
        "name"          text NOT NULL,
        "description"   text NOT NULL,
        "criterion_key" text NOT NULL CHECK (criterion_key ~ '^[a-z0-9_]{1,64}$'),
        "predicate"     jsonb CHECK (predicate IS NULL OR jsonb_typeof(predicate) = 'object'),
        "created_by"    uuid NOT NULL REFERENCES "examcollect"."account"("id") ON DELETE RESTRICT,
        CONSTRAINT "uq_error_rule_revision" UNIQUE ("error_rule_id", "revision"),
        CONSTRAINT "uq_error_rule_revision_id_rule" UNIQUE ("id", "error_rule_id")
      )
    `);
    // Bản sửa hiện hành phải là bản sửa CỦA luật đó: khoá ghép (current_revision_id, id).
    await q.query(`
      ALTER TABLE "examcollect"."error_rule"
        ADD CONSTRAINT "fk_error_rule_current_revision"
        FOREIGN KEY ("current_revision_id", "id") REFERENCES "examcollect"."error_rule_revision"("id", "error_rule_id")
    `);
    await q.query(`CREATE TRIGGER "set_updated_at_error_rule" BEFORE UPDATE ON "examcollect"."error_rule" FOR EACH ROW EXECUTE FUNCTION examcollect.set_updated_at()`);
    await q.query(`CREATE TRIGGER "trg_error_rule_no_delete" BEFORE DELETE ON "examcollect"."error_rule" FOR EACH ROW EXECUTE FUNCTION examcollect.guard_no_delete()`);
    await q.query(`CREATE TRIGGER "trg_error_rule_revision_append_only" BEFORE UPDATE OR DELETE ON "examcollect"."error_rule_revision" FOR EACH ROW EXECUTE FUNCTION examcollect.guard_append_only()`);

    // ------------------------------------------------------------ giá
    await q.query(`
      CREATE TABLE "examcollect"."price_table_version" (
        "id"         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "teacher_id" uuid NOT NULL REFERENCES "examcollect"."account"("id") ON DELETE RESTRICT,
        "version"    int NOT NULL CHECK (version >= 1),
        "created_by" uuid NOT NULL REFERENCES "examcollect"."account"("id") ON DELETE RESTRICT,
        CONSTRAINT "uq_price_table_version" UNIQUE ("teacher_id", "version"),
        CONSTRAINT "uq_price_table_version_id_teacher" UNIQUE ("id", "teacher_id")
      )
    `);
    await q.query(`
      CREATE TABLE "examcollect"."rule_price" (
        "price_table_version_id" uuid NOT NULL,
        "error_rule_id"          uuid NOT NULL,
        "teacher_id"             uuid NOT NULL,
        "deduction"              numeric(6,2) CHECK (deduction IS NULL OR deduction >= 0),
        "created_at"             timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_rule_price" PRIMARY KEY ("price_table_version_id", "error_rule_id"),
        CONSTRAINT "fk_rule_price_version_teacher" FOREIGN KEY ("price_table_version_id", "teacher_id")
          REFERENCES "examcollect"."price_table_version"("id", "teacher_id") ON DELETE RESTRICT,
        CONSTRAINT "fk_rule_price_rule_teacher" FOREIGN KEY ("error_rule_id", "teacher_id")
          REFERENCES "examcollect"."error_rule"("id", "teacher_id") ON DELETE RESTRICT
      )
    `);
    for (const table of ['price_table_version', 'rule_price']) {
      await q.query(`CREATE TRIGGER "trg_${table}_append_only" BEFORE UPDATE OR DELETE ON "examcollect"."${table}" FOR EACH ROW EXECUTE FUNCTION examcollect.guard_append_only()`);
    }

    // ------------------------------------------------------------ khoá ngoại chờ từ Task 2
    await q.query(`
      ALTER TABLE "examcollect"."teacher_review"
        ADD CONSTRAINT "fk_teacher_review_error_rule" FOREIGN KEY ("error_rule_id")
        REFERENCES "examcollect"."error_rule"("id") ON DELETE RESTRICT
    `);
    await q.query(`
      ALTER TABLE "examcollect"."exam_session"
        ADD CONSTRAINT "fk_exam_session_pinned_price" FOREIGN KEY ("pinned_price_version_id", "teacher_id")
        REFERENCES "examcollect"."price_table_version"("id", "teacher_id") ON DELETE RESTRICT
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "examcollect"."exam_session" DROP CONSTRAINT "fk_exam_session_pinned_price"`);
    await q.query(`ALTER TABLE "examcollect"."teacher_review" DROP CONSTRAINT "fk_teacher_review_error_rule"`);
    await q.query(`DROP TABLE "examcollect"."rule_price"`);
    await q.query(`DROP TABLE "examcollect"."price_table_version"`);
    await q.query(`ALTER TABLE "examcollect"."error_rule" DROP CONSTRAINT "fk_error_rule_current_revision"`);
    await q.query(`DROP TABLE "examcollect"."error_rule_revision"`);
    await q.query(`DROP TABLE "examcollect"."error_rule"`);
    await q.query(`DROP TYPE "examcollect"."error_rule_origin"`);
    await q.query(`DROP TYPE "examcollect"."error_rule_state"`);
    await q.query(`DROP FUNCTION examcollect.guard_no_delete()`);
    await q.query(`DROP FUNCTION examcollect.guard_append_only()`);
  }
}
```

Ghi chú cho `down()`: `DROP TABLE` trên bảng có trigger chỉ-thêm vẫn chạy — trigger hàng không bắn ở DDL.

- [ ] **Step 3: Entity.** Thêm vào `grading-model.types.ts`:

```ts
export const ERROR_RULE_STATES = ['proposed', 'active', 'dismissed', 'retired'] as const;
export type ErrorRuleState = (typeof ERROR_RULE_STATES)[number];
export const ERROR_RULE_ORIGINS = ['teacher', 'seed', 'agent_reported'] as const;
export type ErrorRuleOrigin = (typeof ERROR_RULE_ORIGINS)[number];
```

```ts
// apps/api/src/grading/entities/error-rule.entity.ts
import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../shared/base.entity';
import { ERROR_RULE_ORIGINS, ERROR_RULE_STATES, ErrorRuleOrigin, ErrorRuleState } from '../grading-model.types';

/**
 * Một luật lỗi của MỘT giảng viên (§14.1). `proposed` = *luật còn thiếu* agent báo; `dismissed` =
 * *"không phải lỗi"*. Không xoá dòng nào (`trg_error_rule_no_delete`): hồ sơ trỏ vào nó vĩnh viễn.
 * Tên, mô tả, tiêu chí, điều kiện sống ở bản sửa (`error_rule_revision`), không ở đây.
 */
@Entity({ name: 'error_rule' })
@Index('uq_error_rule_teacher_key', ['teacherId', 'ruleKey'], { unique: true })
export class ErrorRuleEntity extends BaseEntity {
  @Column({ name: 'teacher_id', type: 'uuid' })
  teacherId!: string;

  @Column({ name: 'rule_key', type: 'text' })
  ruleKey!: string;

  @Column({ type: 'enum', enum: ERROR_RULE_STATES, enumName: 'error_rule_state', default: 'proposed' })
  state!: ErrorRuleState;

  @Column({ type: 'enum', enum: ERROR_RULE_ORIGINS, enumName: 'error_rule_origin' })
  origin!: ErrorRuleOrigin;

  @Column({ name: 'current_revision_id', type: 'uuid', nullable: true })
  currentRevisionId!: string | null;
}
```

```ts
// apps/api/src/grading/entities/error-rule-revision.entity.ts
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import type { RulePredicate } from '../decision/types';

/** Chỉ thêm (`trg_error_rule_revision_append_only`) — không extends `BaseEntity`: không có `updated_at`. */
@Entity({ name: 'error_rule_revision' })
export class ErrorRuleRevisionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ name: 'error_rule_id', type: 'uuid' })
  errorRuleId!: string;

  @Column({ type: 'int' })
  revision!: number;

  @Column({ type: 'text' })
  name!: string;

  @Column({ type: 'text' })
  description!: string;

  @Column({ name: 'criterion_key', type: 'text' })
  criterionKey!: string;

  /** Một trong bốn mẫu điều kiện của §4.1; null = luật bằng lời. */
  @Column({ type: 'jsonb', nullable: true })
  predicate!: RulePredicate | null;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy!: string;
}
```

(`import type` không sinh `require` lúc chạy, nên không phá luật LEAF của decorator.)

```ts
// apps/api/src/grading/entities/price-table-version.entity.ts
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** Mỗi lần sửa giá là một phiên bản mới của bảng giá của giảng viên đó (§2.2). Chỉ thêm. */
@Entity({ name: 'price_table_version' })
export class PriceTableVersionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ name: 'teacher_id', type: 'uuid' })
  teacherId!: string;

  @Column({ type: 'int' })
  version!: number;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy!: string;
}
```

```ts
// apps/api/src/grading/entities/rule-price.entity.ts
import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

/** Một giá trong một phiên bản bảng giá. Null = chưa có giá (§2.1). Chỉ thêm. */
@Entity({ name: 'rule_price' })
export class RulePriceEntity {
  @PrimaryColumn({ name: 'price_table_version_id', type: 'uuid' })
  priceTableVersionId!: string;

  @PrimaryColumn({ name: 'error_rule_id', type: 'uuid' })
  errorRuleId!: string;

  /** Chỉ để hai khoá ngoại ghép chặn giá trỏ luật của người khác. */
  @Column({ name: 'teacher_id', type: 'uuid' })
  teacherId!: string;

  @Column({ type: 'numeric', precision: 6, scale: 2, nullable: true })
  deduction!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
```

`data-source.ts`: thêm bốn entity vào `entities` (sau `GradingPipelineConfigEntity`).

- [ ] **Step 4: Chạy.**

```bash
bash .superpowers/sdd/2026-09-26-grading-data-model/db.sh pnpm --filter api migration:run
pnpm --filter api exec tsc --noEmit -p tsconfig.json
pnpm --filter api test:e2e -- grading-data-model
```

Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add apps/api/src/database/migrations/1789440000000-ErrorRulesAndPrices.ts apps/api/src/grading/entities/error-rule.entity.ts apps/api/src/grading/entities/error-rule-revision.entity.ts apps/api/src/grading/entities/price-table-version.entity.ts apps/api/src/grading/entities/rule-price.entity.ts apps/api/src/grading/grading-model.types.ts apps/api/src/database/data-source.ts apps/api/test/grading-data-model.e2e-spec.ts
git commit -m "feat(db): bảng lỗi có uuid, bản sửa luật và bảng giá chỉ-thêm; giá không trỏ được luật của người khác (§14.1, T-POL-8)"
```

---

### Task 5: Gói test, lượt chấm, lượt tính điểm, đánh dấu tiêu chí, kiểm mẫu

**Files:**
- Create: `apps/api/src/database/migrations/1789450000000-AttemptsBundlesScores.ts`
- Create: `apps/api/src/grading/entities/grading-test-bundle.entity.ts`, `grading-test-case.entity.ts`, `grading-attempt.entity.ts`, `score-computation.entity.ts`, `criterion-waiver.entity.ts`, `audit-sample-review.entity.ts`
- Modify: `apps/api/src/grading/grading-model.types.ts`, `apps/api/src/database/data-source.ts`
- Test: `apps/api/test/grading-data-model.e2e-spec.ts`

**Interfaces:**
- Produces: sáu bảng trên; `examcollect.guard_grading_attempt_immutable()`; entity tương ứng; `ATTEMPT_OUTCOMES`, `TEST_BUNDLE_ORIGINS`, `SCORE_COMPUTATION_REASONS`; lượt số 1 cho mọi dòng không chấm được cũ.
- Consumes: `guard_append_only()`, `guard_no_delete()` (Task 4); `grading_result.current_attempt_id`, `finalized_computation_id`, `exam_session.test_bundle_id` (Task 2).

- [ ] **Step 1: Test đỏ.** Thêm vào `grading-data-model.e2e-spec.ts`:

```ts
  describe('lượt chấm (grading_attempt)', () => {
    async function attempt(resultId: string, teacherId: string, no = 1) {
      const [a] = await ds.query(
        `INSERT INTO examcollect.grading_attempt (grading_result_id, attempt_no, triggered_by, investigation)
         VALUES ($1, $2, $3, '{"toolCalls":[]}') RETURNING id`,
        [resultId, no, teacherId],
      );
      return a.id as string;
    }

    it('lượt đang chạy thì còn ghi được', async () => {
      const ctx = await seedSession(ds, 'att-open');
      const { resultId } = await seedResult(ds, ctx);
      const id = await attempt(resultId, ctx.teacherId);
      await ds.query(`UPDATE examcollect.grading_attempt SET investigation = '{"toolCalls":[1]}' WHERE id = $1`, [id]);
    });

    it('T-IMM-1: lượt đã ghi kết cục → investigation không sửa được, KỂ CẢ khi bài chưa có điểm', async () => {
      const ctx = await seedSession(ds, 'att-imm');
      const { resultId } = await seedResult(ds, ctx);
      const id = await attempt(resultId, ctx.teacherId);
      await ds.query(
        `UPDATE examcollect.grading_attempt
            SET outcome = 'ungradable', ungradable_class = 'system', ungradable_reason = 'sandbox chết', finished_at = now()
          WHERE id = $1`,
        [id],
      );
      await expect(ds.query(`UPDATE examcollect.grading_attempt SET investigation = '{}' WHERE id = $1`, [id])).rejects.toThrow(/bất biến/);
      await expect(ds.query(`DELETE FROM examcollect.grading_attempt WHERE id = $1`, [id])).rejects.toThrow(/không xoá/);
    });

    it('kết cục và thời điểm kết thúc đi cùng nhau; ungradable phải có lớp và lời kể', async () => {
      const ctx = await seedSession(ds, 'att-ck');
      const { resultId } = await seedResult(ds, ctx);
      const id = await attempt(resultId, ctx.teacherId);
      await expect(ds.query(`UPDATE examcollect.grading_attempt SET outcome = 'graded' WHERE id = $1`, [id])).rejects.toThrow(/ck_grading_attempt_outcome_finished/);
      await expect(ds.query(`UPDATE examcollect.grading_attempt SET outcome = 'ungradable', finished_at = now() WHERE id = $1`, [id]))
        .rejects.toThrow(/ck_grading_attempt_ungradable/);
    });

    it('lượt hiện hành của một kết quả phải là lượt CỦA kết quả đó', async () => {
      const ctx = await seedSession(ds, 'att-cur');
      const a = await seedResult(ds, ctx);
      const b = await seedResult(ds, ctx);
      const other = await attempt(b.resultId, ctx.teacherId);
      await expect(ds.query(`UPDATE examcollect.grading_result SET current_attempt_id = $2 WHERE id = $1`, [a.resultId, other]))
        .rejects.toThrow(/fk_grading_result_current_attempt/);
    });

    it('T-REGRADE-5 (phần dữ liệu): mọi dòng không chấm được lớp system có lượt hiện hành chép lý do', async () => {
      const [row] = await ds.query(
        `SELECT count(*)::int AS n FROM examcollect.grading_result g
          LEFT JOIN examcollect.grading_attempt a ON a.id = g.current_attempt_id
          WHERE g.ungradable_class = 'system'
            AND (a.id IS NULL OR a.outcome <> 'ungradable' OR a.ungradable_reason IS DISTINCT FROM g.ungradable_reason)`,
      );
      expect(row.n).toBe(0);
    });
  });

  describe('gói test, lượt tính điểm, đánh dấu tiêu chí, kiểm mẫu', () => {
    async function bundle(ctx: { sessionId: string; teacherId: string }, version = 1) {
      const [b] = await ds.query(
        `INSERT INTO examcollect.grading_test_bundle (exam_session_id, version, origin, created_by)
         VALUES ($1, $2, 'teacher', $3) RETURNING id`,
        [ctx.sessionId, version, ctx.teacherId],
      );
      return b.id as string;
    }

    it('một phiên có nhiều phiên bản gói test, không trùng số phiên bản', async () => {
      const ctx = await seedSession(ds, 'bundle-v');
      await bundle(ctx, 1);
      await bundle(ctx, 2);
      await expect(bundle(ctx, 2)).rejects.toThrow(/uq_grading_test_bundle_version/);
    });

    it('ca test là chỉ-thêm; bỏ ca là phiên bản gói mới', async () => {
      const ctx = await seedSession(ds, 'bundle-case');
      const b = await bundle(ctx);
      const [c] = await ds.query(
        `INSERT INTO examcollect.grading_test_case (bundle_id, case_key, "group", input, expected_output)
         VALUES ($1, 'c1', 'co_ban', '1', '1') RETURNING id`,
        [b],
      );
      await expect(ds.query(`UPDATE examcollect.grading_test_case SET expected_output = '2' WHERE id = $1`, [c.id])).rejects.toThrow(/chỉ thêm/);
    });

    it('duyệt gói: chỉ ghi được MỘT lần, và nội dung gói không đổi sau khi tạo', async () => {
      const ctx = await seedSession(ds, 'bundle-approve');
      const b = await bundle(ctx);
      await ds.query(`UPDATE examcollect.grading_test_bundle SET approved_by = $2, approved_at = now() WHERE id = $1`, [b, ctx.teacherId]);
      await expect(ds.query(`UPDATE examcollect.grading_test_bundle SET approved_at = now() WHERE id = $1`, [b])).rejects.toThrow(/gói test/);
      await expect(ds.query(`UPDATE examcollect.grading_test_bundle SET origin = 'generated' WHERE id = $1`, [b])).rejects.toThrow(/gói test/);
    });

    it('phiên chỉ ghim được gói test của chính nó', async () => {
      const a = await seedSession(ds, 'bundle-pin-a');
      const b = await seedSession(ds, 'bundle-pin-b');
      const foreign = await bundle(b);
      await expect(ds.query(`UPDATE examcollect.exam_session SET test_bundle_id = $2 WHERE id = $1`, [a.sessionId, foreign]))
        .rejects.toThrow(/fk_exam_session_test_bundle/);
    });

    it('lượt tính điểm là chỉ-thêm, và phải trỏ một lượt chấm của CHÍNH kết quả đó', async () => {
      const ctx = await seedSession(ds, 'score');
      const { resultId } = await seedResult(ds, ctx);
      const other = await seedResult(ds, ctx);
      const [att] = await ds.query(
        `INSERT INTO examcollect.grading_attempt (grading_result_id, attempt_no, triggered_by) VALUES ($1, 1, $2) RETURNING id`,
        [other.resultId, ctx.teacherId],
      );
      await expect(ds.query(
        `INSERT INTO examcollect.score_computation (grading_result_id, attempt_id, rubric_id_version, reason, score, breakdown)
         VALUES ($1, $2, $3, 'initial', 7, '{}')`,
        [resultId, att.id, ctx.rubricId],
      )).rejects.toThrow(/fk_score_computation_attempt/);

      const [own] = await ds.query(
        `INSERT INTO examcollect.grading_attempt (grading_result_id, attempt_no, triggered_by) VALUES ($1, 1, $2) RETURNING id`,
        [resultId, ctx.teacherId],
      );
      const [sc] = await ds.query(
        `INSERT INTO examcollect.score_computation (grading_result_id, attempt_id, rubric_id_version, reason, score, breakdown)
         VALUES ($1, $2, $3, 'initial', 7, '{}') RETURNING id`,
        [resultId, own.id, ctx.rubricId],
      );
      await expect(ds.query(`UPDATE examcollect.score_computation SET score = 9 WHERE id = $1`, [sc.id])).rejects.toThrow(/chỉ thêm/);
    });

    it('T-WAIVER-1 (phần DB): đánh dấu "không có luật trừ" khi rubric đã có kết quả chấm — ghi được, không đụng trigger đóng băng tiêu chí', async () => {
      const ctx = await seedSession(ds, 'waiver');
      await seedCriterion(ds, ctx.rubricId, 'hieu_nang');
      await seedResult(ds, ctx); // rubric này giờ đã được một kết quả trỏ tới
      await ds.query(
        `INSERT INTO examcollect.criterion_waiver (rubric_id, criterion_key, set_by) VALUES ($1, 'hieu_nang', $2)`,
        [ctx.rubricId, ctx.teacherId],
      );
      await expect(ds.query(
        `INSERT INTO examcollect.criterion_waiver (rubric_id, criterion_key, set_by) VALUES ($1, 'hieu_nang', $2)`,
        [ctx.rubricId, ctx.teacherId],
      )).rejects.toThrow(/uq_criterion_waiver_active/);
      await expect(ds.query(
        `INSERT INTO examcollect.criterion_waiver (rubric_id, criterion_key, set_by) VALUES ($1, 'khong_co', $2)`,
        [ctx.rubricId, ctx.teacherId],
      )).rejects.toThrow(/fk_criterion_waiver_criterion/);
    });

    it('nhận xét kiểm mẫu ghi rồi thì khoá (§8.1)', async () => {
      const ctx = await seedSession(ds, 'audit');
      const { resultId } = await seedResult(ds, ctx);
      await ds.query(`INSERT INTO examcollect.audit_sample_review (grading_result_id, teacher_id) VALUES ($1, $2)`, [resultId, ctx.teacherId]);
      await expect(ds.query(`UPDATE examcollect.audit_sample_review SET extra_errors = '{x}' WHERE grading_result_id = $1`, [resultId])).rejects.toThrow(/chỉ thêm/);
    });
  });
```

Run: `pnpm --filter api test:e2e -- grading-data-model` — Expected: FAIL (`relation "examcollect.grading_attempt" does not exist`).

- [ ] **Step 2: Migration.**

```ts
// apps/api/src/database/migrations/1789450000000-AttemptsBundlesScores.ts
import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Gói test có phiên bản, lượt chấm, lượt tính điểm, đánh dấu tiêu chí, kiểm mẫu — spec §14.1,
 * §14.4. Mọi khoá ngoại "của chính nó" là khoá GHÉP: một lượt tính điểm không trỏ được lượt chấm
 * của bài khác, một phiên không ghim được gói test của phiên khác.
 */
export class AttemptsBundlesScores1789450000000 implements MigrationInterface {
  name = 'AttemptsBundlesScores1789450000000';

  public async up(q: QueryRunner): Promise<void> {
    // ------------------------------------------------------------ gói test
    await q.query(`CREATE TYPE "examcollect"."test_bundle_origin" AS ENUM ('teacher', 'from_model_answer', 'generated')`);
    await q.query(`
      CREATE TABLE "examcollect"."grading_test_bundle" (
        "id"              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at"      timestamptz NOT NULL DEFAULT now(),
        "updated_at"      timestamptz NOT NULL DEFAULT now(),
        "exam_session_id" uuid NOT NULL REFERENCES "examcollect"."exam_session"("id") ON DELETE RESTRICT,
        "version"         int NOT NULL CHECK (version >= 1),
        "origin"          "examcollect"."test_bundle_origin" NOT NULL,
        "storage_key"     varchar(512),
        "filename"        varchar(255),
        "comparator"      jsonb CHECK (comparator IS NULL OR jsonb_typeof(comparator) = 'object'),
        "created_by"      uuid NOT NULL REFERENCES "examcollect"."account"("id") ON DELETE RESTRICT,
        "approved_by"     uuid REFERENCES "examcollect"."account"("id") ON DELETE RESTRICT,
        "approved_at"     timestamptz,
        CONSTRAINT "uq_grading_test_bundle_version" UNIQUE ("exam_session_id", "version"),
        CONSTRAINT "uq_grading_test_bundle_id_session" UNIQUE ("id", "exam_session_id"),
        CONSTRAINT "ck_grading_test_bundle_approval" CHECK ((approved_by IS NULL) = (approved_at IS NULL)),
        CONSTRAINT "ck_grading_test_bundle_file" CHECK ((storage_key IS NULL) = (filename IS NULL))
      )
    `);
    // Gói chỉ đổi được đúng một lần: lúc giảng viên duyệt. Mọi thay đổi khác là phiên bản mới
    // (§2.1: bỏ ca = phiên bản gói không chép ca đó).
    await q.query(`
      CREATE FUNCTION examcollect.guard_test_bundle_approve_once() RETURNS trigger
      LANGUAGE plpgsql SET search_path TO 'examcollect', 'public' AS $$
      BEGIN
        IF OLD.approved_at IS NOT NULL
           OR (to_jsonb(NEW) - 'approved_by' - 'approved_at' - 'updated_at')
              IS DISTINCT FROM (to_jsonb(OLD) - 'approved_by' - 'approved_at' - 'updated_at') THEN
          RAISE EXCEPTION 'Gói test % chỉ ghi được việc duyệt, và chỉ một lần — đổi nội dung là phiên bản mới', OLD.id
            USING ERRCODE = 'object_not_in_prerequisite_state';
        END IF;
        RETURN NEW;
      END $$
    `);
    await q.query(`CREATE TRIGGER "trg_grading_test_bundle_approve_once" BEFORE UPDATE ON "examcollect"."grading_test_bundle" FOR EACH ROW EXECUTE FUNCTION examcollect.guard_test_bundle_approve_once()`);
    await q.query(`CREATE TRIGGER "set_updated_at_grading_test_bundle" BEFORE UPDATE ON "examcollect"."grading_test_bundle" FOR EACH ROW EXECUTE FUNCTION examcollect.set_updated_at()`);
    await q.query(`CREATE TRIGGER "trg_grading_test_bundle_no_delete" BEFORE DELETE ON "examcollect"."grading_test_bundle" FOR EACH ROW EXECUTE FUNCTION examcollect.guard_no_delete()`);

    await q.query(`
      CREATE TABLE "examcollect"."grading_test_case" (
        "id"                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at"          timestamptz NOT NULL DEFAULT now(),
        "bundle_id"           uuid NOT NULL REFERENCES "examcollect"."grading_test_bundle"("id") ON DELETE RESTRICT,
        "case_key"            text NOT NULL CHECK (case_key ~ '^[A-Za-z0-9_-]{1,64}$'),
        "group"               text NOT NULL CHECK (length("group") BETWEEN 1 AND 100),
        "input"               text NOT NULL,
        "expected_output"     text NOT NULL,
        "constraint_quote"    text,
        "auto_dropped_reason" text,
        CONSTRAINT "uq_grading_test_case_key" UNIQUE ("bundle_id", "case_key")
      )
    `);
    await q.query(`CREATE TRIGGER "trg_grading_test_case_append_only" BEFORE UPDATE OR DELETE ON "examcollect"."grading_test_case" FOR EACH ROW EXECUTE FUNCTION examcollect.guard_append_only()`);
    await q.query(`
      ALTER TABLE "examcollect"."exam_session"
        ADD CONSTRAINT "fk_exam_session_test_bundle" FOREIGN KEY ("test_bundle_id", "id")
        REFERENCES "examcollect"."grading_test_bundle"("id", "exam_session_id") ON DELETE RESTRICT
    `);

    // ------------------------------------------------------------ lượt chấm
    await q.query(`CREATE TYPE "examcollect"."grading_attempt_outcome" AS ENUM ('graded', 'ungradable')`);
    await q.query(`
      CREATE TABLE "examcollect"."grading_attempt" (
        "id"                 uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at"         timestamptz NOT NULL DEFAULT now(),
        "updated_at"         timestamptz NOT NULL DEFAULT now(),
        "grading_result_id"  uuid NOT NULL REFERENCES "examcollect"."grading_result"("id") ON DELETE RESTRICT,
        "attempt_no"         int NOT NULL CHECK (attempt_no >= 1),
        "outcome"            "examcollect"."grading_attempt_outcome",
        "ungradable_class"   "examcollect"."ungradable_class",
        "ungradable_reason"  text,
        "investigation"      jsonb,
        "structured_results" jsonb,
        "challenge"          jsonb,
        "model_used"         varchar(200),
        "sandbox_host"       jsonb,
        "tokens_in"          int CHECK (tokens_in IS NULL OR tokens_in >= 0),
        "tokens_out"         int CHECK (tokens_out IS NULL OR tokens_out >= 0),
        "cost_usd"           numeric(10,4) CHECK (cost_usd IS NULL OR cost_usd >= 0),
        "triggered_by"       uuid NOT NULL REFERENCES "examcollect"."account"("id") ON DELETE RESTRICT,
        "started_at"         timestamptz NOT NULL DEFAULT now(),
        "finished_at"        timestamptz,
        CONSTRAINT "uq_grading_attempt_no" UNIQUE ("grading_result_id", "attempt_no"),
        CONSTRAINT "uq_grading_attempt_id_result" UNIQUE ("id", "grading_result_id"),
        CONSTRAINT "ck_grading_attempt_outcome_finished" CHECK ((outcome IS NULL) = (finished_at IS NULL)),
        CONSTRAINT "ck_grading_attempt_finished_after_start" CHECK (finished_at IS NULL OR finished_at >= started_at),
        CONSTRAINT "ck_grading_attempt_ungradable" CHECK (
          (outcome = 'ungradable' AND ungradable_class IS NOT NULL AND ungradable_reason IS NOT NULL)
          OR (outcome IS DISTINCT FROM 'ungradable' AND ungradable_class IS NULL AND ungradable_reason IS NULL))
      )
    `);
    // Lớp bảo vệ hồ sơ của bài CHƯA có điểm — chỗ `guard_grading_result_ai_immutable` để hở, vì
    // guard đó chỉ bắn khi `OLD.ai_total_score IS NOT NULL` (§14.4).
    await q.query(`
      CREATE FUNCTION examcollect.guard_grading_attempt_immutable() RETURNS trigger
      LANGUAGE plpgsql SET search_path TO 'examcollect', 'public' AS $$
      BEGIN
        IF TG_OP = 'DELETE' THEN
          RAISE EXCEPTION 'Lượt chấm % không xoá được — hồ sơ trỏ vào nó vĩnh viễn', OLD.id
            USING ERRCODE = 'object_not_in_prerequisite_state';
        END IF;
        IF OLD.outcome IS NOT NULL THEN
          RAISE EXCEPTION 'Lượt chấm % đã có kết cục — hồ sơ bất biến', OLD.id
            USING ERRCODE = 'object_not_in_prerequisite_state';
        END IF;
        RETURN NEW;
      END $$
    `);
    await q.query(`CREATE TRIGGER "trg_grading_attempt_immutable" BEFORE UPDATE OR DELETE ON "examcollect"."grading_attempt" FOR EACH ROW EXECUTE FUNCTION examcollect.guard_grading_attempt_immutable()`);
    await q.query(`CREATE TRIGGER "set_updated_at_grading_attempt" BEFORE UPDATE ON "examcollect"."grading_attempt" FOR EACH ROW EXECUTE FUNCTION examcollect.set_updated_at()`);
    await q.query(`
      ALTER TABLE "examcollect"."grading_result"
        ADD CONSTRAINT "fk_grading_result_current_attempt" FOREIGN KEY ("current_attempt_id", "id")
        REFERENCES "examcollect"."grading_attempt"("id", "grading_result_id") ON DELETE RESTRICT
    `);

    // ------------------------------------------------------------ lượt tính điểm
    await q.query(`
      CREATE TYPE "examcollect"."score_computation_reason" AS ENUM (
        'initial', 'price_change', 'rule_revision', 'tier2_rule', 'tier3_rule',
        'case_dropped', 'error_exception', 'finalized_reapply')
    `);
    await q.query(`
      CREATE TABLE "examcollect"."score_computation" (
        "id"                     uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at"             timestamptz NOT NULL DEFAULT now(),
        "grading_result_id"      uuid NOT NULL REFERENCES "examcollect"."grading_result"("id") ON DELETE RESTRICT,
        "attempt_id"             uuid NOT NULL,
        "price_table_version_id" uuid REFERENCES "examcollect"."price_table_version"("id") ON DELETE RESTRICT,
        "rubric_id_version"      uuid NOT NULL REFERENCES "examcollect"."rubric"("id") ON DELETE RESTRICT,
        "test_bundle_id"         uuid REFERENCES "examcollect"."grading_test_bundle"("id") ON DELETE RESTRICT,
        "reason"                 "examcollect"."score_computation_reason" NOT NULL,
        "score"                  numeric(6,2) NOT NULL CHECK (score >= 0),
        "breakdown"              jsonb NOT NULL,
        "created_by"             uuid REFERENCES "examcollect"."account"("id") ON DELETE RESTRICT,
        CONSTRAINT "uq_score_computation_id_result" UNIQUE ("id", "grading_result_id"),
        CONSTRAINT "fk_score_computation_attempt" FOREIGN KEY ("attempt_id", "grading_result_id")
          REFERENCES "examcollect"."grading_attempt"("id", "grading_result_id") ON DELETE RESTRICT
      )
    `);
    await q.query(`CREATE INDEX "idx_score_computation_result_time" ON "examcollect"."score_computation" ("grading_result_id", "created_at" DESC)`);
    await q.query(`CREATE TRIGGER "trg_score_computation_append_only" BEFORE UPDATE OR DELETE ON "examcollect"."score_computation" FOR EACH ROW EXECUTE FUNCTION examcollect.guard_append_only()`);
    await q.query(`
      ALTER TABLE "examcollect"."grading_result"
        ADD CONSTRAINT "fk_grading_result_finalized_computation" FOREIGN KEY ("finalized_computation_id", "id")
        REFERENCES "examcollect"."score_computation"("id", "grading_result_id") ON DELETE RESTRICT
    `);

    // ------------------------------------------------------------ "tiêu chí này không có luật trừ"
    await q.query(`
      CREATE TABLE "examcollect"."criterion_waiver" (
        "id"            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at"    timestamptz NOT NULL DEFAULT now(),
        "updated_at"    timestamptz NOT NULL DEFAULT now(),
        "rubric_id"     uuid NOT NULL,
        "criterion_key" text NOT NULL,
        "set_by"        uuid NOT NULL REFERENCES "examcollect"."account"("id") ON DELETE RESTRICT,
        "set_at"        timestamptz NOT NULL DEFAULT now(),
        "revoked_by"    uuid REFERENCES "examcollect"."account"("id") ON DELETE RESTRICT,
        "revoked_at"    timestamptz,
        CONSTRAINT "fk_criterion_waiver_criterion" FOREIGN KEY ("rubric_id", "criterion_key")
          REFERENCES "examcollect"."rubric_criterion"("rubric_id", "key") ON DELETE RESTRICT,
        CONSTRAINT "ck_criterion_waiver_revoke_pair" CHECK ((revoked_by IS NULL) = (revoked_at IS NULL)),
        CONSTRAINT "ck_criterion_waiver_revoke_after_set" CHECK (revoked_at IS NULL OR revoked_at >= set_at)
      )
    `);
    await q.query(`CREATE UNIQUE INDEX "uq_criterion_waiver_active" ON "examcollect"."criterion_waiver" ("rubric_id", "criterion_key") WHERE revoked_at IS NULL`);
    await q.query(`
      CREATE FUNCTION examcollect.guard_criterion_waiver_revoke_once() RETURNS trigger
      LANGUAGE plpgsql SET search_path TO 'examcollect', 'public' AS $$
      BEGIN
        IF OLD.revoked_at IS NOT NULL
           OR (to_jsonb(NEW) - 'revoked_by' - 'revoked_at' - 'updated_at')
              IS DISTINCT FROM (to_jsonb(OLD) - 'revoked_by' - 'revoked_at' - 'updated_at') THEN
          RAISE EXCEPTION 'Đánh dấu % chỉ gỡ được, và chỉ một lần', OLD.id
            USING ERRCODE = 'object_not_in_prerequisite_state';
        END IF;
        RETURN NEW;
      END $$
    `);
    await q.query(`CREATE TRIGGER "trg_criterion_waiver_revoke_once" BEFORE UPDATE ON "examcollect"."criterion_waiver" FOR EACH ROW EXECUTE FUNCTION examcollect.guard_criterion_waiver_revoke_once()`);
    await q.query(`CREATE TRIGGER "set_updated_at_criterion_waiver" BEFORE UPDATE ON "examcollect"."criterion_waiver" FOR EACH ROW EXECUTE FUNCTION examcollect.set_updated_at()`);
    await q.query(`CREATE TRIGGER "trg_criterion_waiver_no_delete" BEFORE DELETE ON "examcollect"."criterion_waiver" FOR EACH ROW EXECUTE FUNCTION examcollect.guard_no_delete()`);

    // ------------------------------------------------------------ kiểm mẫu
    await q.query(`
      CREATE TABLE "examcollect"."audit_sample_review" (
        "grading_result_id" uuid PRIMARY KEY REFERENCES "examcollect"."grading_result"("id") ON DELETE RESTRICT,
        "teacher_id"        uuid NOT NULL REFERENCES "examcollect"."account"("id") ON DELETE RESTRICT,
        "picked_rule_ids"   uuid[] NOT NULL DEFAULT '{}',
        "extra_errors"      text[] NOT NULL DEFAULT '{}',
        "recorded_at"       timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query(`CREATE TRIGGER "trg_audit_sample_review_append_only" BEFORE UPDATE OR DELETE ON "examcollect"."audit_sample_review" FOR EACH ROW EXECUTE FUNCTION examcollect.guard_append_only()`);

    // ------------------------------------------------------------ §2.3 luật 7 — lượt số 1 của dữ liệu cũ
    // Lý do lần trước không chấm được là DỮ LIỆU: chép nó thành lượt số 1, để lượt chấm lại là
    // lượt 2 và lý do cũ không mất. `started_at` = lúc xếp hàng (không ai ghi lúc job bắt đầu),
    // `finished_at` = lần ghi cuối của dòng — lúc `markUngradable` chạy.
    await q.query(`
      INSERT INTO "examcollect"."grading_attempt"
        (grading_result_id, attempt_no, outcome, ungradable_class, ungradable_reason,
         triggered_by, started_at, finished_at)
      SELECT g.id, 1, 'ungradable', 'system', g.ungradable_reason, g.grading_triggered_by,
             g.grading_triggered_at, GREATEST(g.updated_at, g.grading_triggered_at)
        FROM "examcollect"."grading_result" g
       WHERE g.ungradable_class = 'system' AND g.current_attempt_id IS NULL
    `);
    await q.query(`
      UPDATE "examcollect"."grading_result" g
         SET current_attempt_id = a.id
        FROM "examcollect"."grading_attempt" a
       WHERE a.grading_result_id = g.id AND a.attempt_no = 1 AND g.current_attempt_id IS NULL
         AND g.ungradable_class = 'system'
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`UPDATE "examcollect"."grading_result" SET current_attempt_id = NULL, finalized_computation_id = NULL WHERE current_attempt_id IS NOT NULL OR finalized_computation_id IS NOT NULL`);
    await q.query(`ALTER TABLE "examcollect"."grading_result" DROP CONSTRAINT "fk_grading_result_finalized_computation", DROP CONSTRAINT "fk_grading_result_current_attempt"`);
    await q.query(`ALTER TABLE "examcollect"."exam_session" DROP CONSTRAINT "fk_exam_session_test_bundle"`);
    await q.query(`UPDATE "examcollect"."exam_session" SET test_bundle_id = NULL WHERE test_bundle_id IS NOT NULL`);
    for (const table of ['audit_sample_review', 'criterion_waiver', 'score_computation', 'grading_attempt', 'grading_test_case', 'grading_test_bundle']) {
      await q.query(`DROP TABLE "examcollect"."${table}"`);
    }
    await q.query(`DROP FUNCTION examcollect.guard_criterion_waiver_revoke_once()`);
    await q.query(`DROP FUNCTION examcollect.guard_grading_attempt_immutable()`);
    await q.query(`DROP FUNCTION examcollect.guard_test_bundle_approve_once()`);
    await q.query(`DROP TYPE "examcollect"."score_computation_reason"`);
    await q.query(`DROP TYPE "examcollect"."grading_attempt_outcome"`);
    await q.query(`DROP TYPE "examcollect"."test_bundle_origin"`);
  }
}
```

Ghi chú: `UPDATE grading_result SET current_attempt_id = …` bắn trigger vòng đời (trạng thái không đổi → qua), guard bất biến AI (cột không nằm trong danh sách → qua), và `updated_at` — chấp nhận.

- [ ] **Step 3: Entity.** Thêm vào `grading-model.types.ts`:

```ts
export const ATTEMPT_OUTCOMES = ['graded', 'ungradable'] as const;
export type AttemptOutcome = (typeof ATTEMPT_OUTCOMES)[number];
export const TEST_BUNDLE_ORIGINS = ['teacher', 'from_model_answer', 'generated'] as const;
export type TestBundleOrigin = (typeof TEST_BUNDLE_ORIGINS)[number];
export const SCORE_COMPUTATION_REASONS = [
  'initial', 'price_change', 'rule_revision', 'tier2_rule', 'tier3_rule',
  'case_dropped', 'error_exception', 'finalized_reapply',
] as const;
export type ScoreComputationReason = (typeof SCORE_COMPUTATION_REASONS)[number];
```

```ts
// apps/api/src/grading/entities/grading-test-bundle.entity.ts
import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../../shared/base.entity';
import { TEST_BUNDLE_ORIGINS, TestBundleOrigin } from '../grading-model.types';

/**
 * Một PHIÊN BẢN gói test của một phiên (§14.1). Chỉ việc duyệt ghi lên dòng được, một lần
 * (`trg_grading_test_bundle_approve_once`); bỏ ca = phiên bản mới. Ca nằm ở `grading_test_case`.
 */
@Entity({ name: 'grading_test_bundle' })
export class GradingTestBundleEntity extends BaseEntity {
  @Column({ name: 'exam_session_id', type: 'uuid' })
  examSessionId!: string;

  @Column({ type: 'int' })
  version!: number;

  @Column({ type: 'enum', enum: TEST_BUNDLE_ORIGINS, enumName: 'test_bundle_origin' })
  origin!: TestBundleOrigin;

  /** File giảng viên tải lên, nếu gói đến từ một file. Gói sinh ra không có. */
  @Column({ name: 'storage_key', type: 'varchar', length: 512, nullable: true })
  storageKey!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  filename!: string | null;

  /** `{kind:'exact'} | {kind:'unordered_lines'} | {kind:'float_tolerance',eps} | {kind:'checker',name}` (§14.1). */
  @Column({ type: 'jsonb', nullable: true })
  comparator!: Record<string, unknown> | null;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy!: string;

  @Column({ name: 'approved_by', type: 'uuid', nullable: true })
  approvedBy!: string | null;

  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true })
  approvedAt!: Date | null;
}
```

```ts
// apps/api/src/grading/entities/grading-test-case.entity.ts
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** Một ca của một phiên bản gói test. Chỉ thêm. */
@Entity({ name: 'grading_test_case' })
export class GradingTestCaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ name: 'bundle_id', type: 'uuid' })
  bundleId!: string;

  /** Tên ca của hợp đồng sandbox: chữ, số, "_", "-", tối đa 64 ký tự. */
  @Column({ name: 'case_key', type: 'text' })
  caseKey!: string;

  @Column({ name: 'group', type: 'text' })
  group!: string;

  @Column({ type: 'text' })
  input!: string;

  @Column({ name: 'expected_output', type: 'text' })
  expectedOutput!: string;

  /** Câu trong đề mà ca này dựa vào (§2.1) — null với ca giảng viên tự viết. */
  @Column({ name: 'constraint_quote', type: 'text', nullable: true })
  constraintQuote!: string | null;

  @Column({ name: 'auto_dropped_reason', type: 'text', nullable: true })
  autoDroppedReason!: string | null;
}
```

```ts
// apps/api/src/grading/entities/grading-attempt.entity.ts
import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../../shared/base.entity';
import { ATTEMPT_OUTCOMES, AttemptOutcome, UNGRADABLE_CLASSES, UngradableClass } from '../grading-model.types';

/**
 * Một lượt chấm (§14.1), cho CẢ HAI đường; với `one_shot` thì `investigation`,
 * `structuredResults`, `challenge` null. Bất biến từ lúc `outcome` khác null
 * (`trg_grading_attempt_immutable`), và không bao giờ bị xoá.
 */
@Entity({ name: 'grading_attempt' })
export class GradingAttemptEntity extends BaseEntity {
  @Column({ name: 'grading_result_id', type: 'uuid' })
  gradingResultId!: string;

  @Column({ name: 'attempt_no', type: 'int' })
  attemptNo!: number;

  @Column({ type: 'enum', enum: ATTEMPT_OUTCOMES, enumName: 'grading_attempt_outcome', nullable: true })
  outcome!: AttemptOutcome | null;

  @Column({ name: 'ungradable_class', type: 'enum', enum: UNGRADABLE_CLASSES, enumName: 'ungradable_class', nullable: true })
  ungradableClass!: UngradableClass | null;

  @Column({ name: 'ungradable_reason', type: 'text', nullable: true })
  ungradableReason!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  investigation!: Record<string, unknown> | null;

  @Column({ name: 'structured_results', type: 'jsonb', nullable: true })
  structuredResults!: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  challenge!: Record<string, unknown> | null;

  @Column({ name: 'model_used', type: 'varchar', length: 200, nullable: true })
  modelUsed!: string | null;

  @Column({ name: 'sandbox_host', type: 'jsonb', nullable: true })
  sandboxHost!: Record<string, unknown> | null;

  @Column({ name: 'tokens_in', type: 'int', nullable: true })
  tokensIn!: number | null;

  @Column({ name: 'tokens_out', type: 'int', nullable: true })
  tokensOut!: number | null;

  @Column({ name: 'cost_usd', type: 'numeric', precision: 10, scale: 4, nullable: true })
  costUsd!: string | null;

  @Column({ name: 'triggered_by', type: 'uuid' })
  triggeredBy!: string;

  @Column({ name: 'started_at', type: 'timestamptz', default: () => 'now()' })
  startedAt!: Date;

  @Column({ name: 'finished_at', type: 'timestamptz', nullable: true })
  finishedAt!: Date | null;
}
```

```ts
// apps/api/src/grading/entities/score-computation.entity.ts
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { SCORE_COMPUTATION_REASONS, ScoreComputationReason } from '../grading-model.types';

/** *Dòng tính lại* của §2.2 — mỗi lần tính là một dòng MỚI, không sửa dòng cũ. Chỉ thêm. */
@Entity({ name: 'score_computation' })
export class ScoreComputationEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ name: 'grading_result_id', type: 'uuid' })
  gradingResultId!: string;

  @Column({ name: 'attempt_id', type: 'uuid' })
  attemptId!: string;

  /** Null = giảng viên chưa có bảng giá nào: mọi luật chưa có giá (§2.1). */
  @Column({ name: 'price_table_version_id', type: 'uuid', nullable: true })
  priceTableVersionId!: string | null;

  @Column({ name: 'rubric_id_version', type: 'uuid' })
  rubricIdVersion!: string;

  @Column({ name: 'test_bundle_id', type: 'uuid', nullable: true })
  testBundleId!: string | null;

  @Column({ type: 'enum', enum: SCORE_COMPUTATION_REASONS, enumName: 'score_computation_reason' })
  reason!: ScoreComputationReason;

  @Column({ type: 'numeric', precision: 6, scale: 2 })
  score!: string;

  /** Từng lỗi: luật và bản sửa, mức trừ, tính / bỏ vì ngoại lệ / bỏ vì `refuted`, chạm trần. */
  @Column({ type: 'jsonb' })
  breakdown!: Record<string, unknown>;

  /** Null = hệ thống tính (lượt đầu, do worker). */
  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy!: string | null;
}
```

```ts
// apps/api/src/grading/entities/criterion-waiver.entity.ts
import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../../shared/base.entity';

/**
 * *"Tiêu chí này không có luật trừ"* (§4.2, T-FLOOR-6). Bảng riêng, vì `rubric_criterion` bị khoá
 * ngay khi rubric có kết quả chấm — đúng lúc giảng viên cần đánh dấu. Chỉ gỡ được, một lần.
 */
@Entity({ name: 'criterion_waiver' })
export class CriterionWaiverEntity extends BaseEntity {
  @Column({ name: 'rubric_id', type: 'uuid' })
  rubricId!: string;

  @Column({ name: 'criterion_key', type: 'text' })
  criterionKey!: string;

  @Column({ name: 'set_by', type: 'uuid' })
  setBy!: string;

  @Column({ name: 'set_at', type: 'timestamptz', default: () => 'now()' })
  setAt!: Date;

  @Column({ name: 'revoked_by', type: 'uuid', nullable: true })
  revokedBy!: string | null;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;
}
```

```ts
// apps/api/src/grading/entities/audit-sample-review.entity.ts
import { Column, Entity, PrimaryColumn } from 'typeorm';

/** Nhận xét kiểm mẫu (§8.1): ghi rồi thì khoá. Chỉ thêm. */
@Entity({ name: 'audit_sample_review' })
export class AuditSampleReviewEntity {
  @PrimaryColumn({ name: 'grading_result_id', type: 'uuid' })
  gradingResultId!: string;

  @Column({ name: 'teacher_id', type: 'uuid' })
  teacherId!: string;

  @Column({ name: 'picked_rule_ids', type: 'uuid', array: true, default: () => "'{}'" })
  pickedRuleIds!: string[];

  @Column({ name: 'extra_errors', type: 'text', array: true, default: () => "'{}'" })
  extraErrors!: string[];

  @Column({ name: 'recorded_at', type: 'timestamptz', default: () => 'now()' })
  recordedAt!: Date;
}
```

`data-source.ts`: thêm sáu entity vào `entities`.

- [ ] **Step 4: Chạy.**

```bash
bash .superpowers/sdd/2026-09-26-grading-data-model/db.sh pnpm --filter api migration:run
pnpm --filter api exec tsc --noEmit -p tsconfig.json
pnpm --filter api test:e2e -- grading-data-model grading-lifecycle
```

Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add apps/api/src/database/migrations/1789450000000-AttemptsBundlesScores.ts apps/api/src/grading/entities apps/api/src/grading/grading-model.types.ts apps/api/src/database/data-source.ts apps/api/test/grading-data-model.e2e-spec.ts
git commit -m "feat(db): gói test có phiên bản, lượt chấm bất biến sau kết cục, lượt tính điểm chỉ-thêm, đánh dấu tiêu chí, kiểm mẫu; lượt số 1 cho bài không chấm được cũ (§14.1, §14.4, T-IMM-1)"
```

---

### Task 6: Máy trạng thái §14.3 — trigger vòng đời, bảng trong code, người ký tên khi chốt

**Files:**
- Create: `apps/api/src/database/migrations/1789460000000-GradingLifecycleV2.ts`
- Create: `apps/api/src/grading/lifecycle/grading-transitions.ts`, test `grading-transitions.spec.ts`
- Modify: `apps/api/src/grading/teacher-review.service.ts` (`BLOCKS_FINALIZE`, `advance`, `finalizeGrades`)
- Modify: `apps/api/test/bulk-review.e2e-spec.ts` (:181, seed đưa thẳng sang `finalized`)
- Modify: `apps/api/test/teacher-review.e2e-spec.ts` (comment :141 nói `flagged_for_review -> ai_grading` luôn bị từ chối — không còn đúng)
- Test: `apps/api/test/grading-lifecycle-v2.e2e-spec.ts`

**Interfaces:**
- Produces: `GRADING_STATUSES`, `GRADING_TRANSITIONS`, `canTransition(from, to)`, `BLOCKS_FINALIZE: ReadonlySet<GradingResultStatus>` (từ `grading-transitions.ts`); `TeacherReviewService.advance(resultId, from, to, manager?, extra?: FinalizeStamp)` với `FinalizeStamp = { finalizedBy: string; finalizedAt: Date }`.

- [ ] **Step 1: Test đỏ — bảng trong code.**

```ts
// apps/api/src/grading/lifecycle/grading-transitions.spec.ts
import { BLOCKS_FINALIZE, canTransition, GRADING_STATUSES, GRADING_TRANSITIONS } from './grading-transitions';

describe('bảng chuyển trạng thái §14.3', () => {
  it('đúng 15 cặp: 8 có từ trước + 7 cặp mới của §14.3 (sáu dòng Thêm, một dòng hai nguồn)', () => {
    expect(GRADING_TRANSITIONS).toHaveLength(15);
    expect(new Set(GRADING_TRANSITIONS.map(([f, t]) => `${f}>${t}`)).size).toBe(15);
  });

  it('không cặp nào tự trỏ về chính nó, và mọi trạng thái đều có trong enum', () => {
    for (const [from, to] of GRADING_TRANSITIONS) {
      expect(from).not.toBe(to);
      expect(GRADING_STATUSES).toContain(from);
      expect(GRADING_STATUSES).toContain(to);
    }
  });

  it('finalized chỉ đến từ teacher_reviewed và auto_approved', () => {
    const into = GRADING_TRANSITIONS.filter(([, t]) => t === 'finalized').map(([f]) => f).sort();
    expect(into).toEqual(['auto_approved', 'teacher_reviewed']);
  });

  it('audit_pending chặn chốt, và không đi thẳng sang finalized', () => {
    expect(BLOCKS_FINALIZE.has('audit_pending')).toBe(true);
    expect(canTransition('audit_pending', 'finalized')).toBe(false);
  });

  it('BLOCKS_FINALIZE đúng danh sách của §14.3', () => {
    expect([...BLOCKS_FINALIZE].sort()).toEqual(['ai_graded', 'ai_grading', 'audit_pending', 'flagged_for_review']);
  });
});
```

Run: `pnpm --filter api test -- grading-transitions` — Expected: FAIL (module không có).

- [ ] **Step 2: Bảng.**

```ts
// apps/api/src/grading/lifecycle/grading-transitions.ts
import type { GradingResultStatus } from '../entities/grading-result.entity';

/**
 * Máy trạng thái §14.3 — bản CODE. Bản DB là `validate_grading_result_lifecycle`
 * (`1789460000000`); `grading-lifecycle-v2.e2e-spec.ts` đi qua MỌI cặp trạng thái và đòi hai bản
 * trả lời giống nhau, nên sửa một bản mà quên bản kia là test đỏ.
 *
 * Hai luật DB ép thêm mà bảng này không tả: sang `finalized` phải có `finalized_by`; và
 * `flagged_for_review → ai_grading` chỉ cho bài không chấm được lớp `system`, chưa có điểm (§2.3).
 */
export const GRADING_STATUSES: readonly GradingResultStatus[] = [
  'ai_grading', 'ai_graded', 'auto_approved', 'audit_pending',
  'flagged_for_review', 'teacher_reviewed', 'finalized', 'exported',
];

export const GRADING_TRANSITIONS: ReadonlyArray<readonly [GradingResultStatus, GradingResultStatus]> = [
  ['ai_grading', 'ai_graded'],
  ['ai_grading', 'flagged_for_review'],
  ['ai_graded', 'auto_approved'],
  ['ai_graded', 'flagged_for_review'],
  ['auto_approved', 'audit_pending'],
  ['audit_pending', 'teacher_reviewed'],
  ['auto_approved', 'flagged_for_review'],
  ['audit_pending', 'flagged_for_review'],
  ['flagged_for_review', 'auto_approved'],
  ['flagged_for_review', 'ai_grading'],
  ['auto_approved', 'teacher_reviewed'],
  ['flagged_for_review', 'teacher_reviewed'],
  ['auto_approved', 'finalized'],
  ['teacher_reviewed', 'finalized'],
  ['finalized', 'exported'],
];

const ALLOWED = new Set(GRADING_TRANSITIONS.map(([from, to]) => `${from}>${to}`));

export function canTransition(from: GradingResultStatus, to: GradingResultStatus): boolean {
  return ALLOWED.has(`${from}>${to}`);
}

/** §14.3: *"Một danh sách, ở một chỗ."* Bài không chấm được nằm ở `flagged_for_review`. */
export const BLOCKS_FINALIZE: ReadonlySet<GradingResultStatus> = new Set<GradingResultStatus>([
  'ai_grading', 'ai_graded', 'flagged_for_review', 'audit_pending',
]);
```

Run: `pnpm --filter api test -- grading-transitions` — Expected: PASS.

- [ ] **Step 3: Test đỏ — DB.**

```ts
// apps/api/test/grading-lifecycle-v2.e2e-spec.ts
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { canTransition, GRADING_STATUSES } from '../src/grading/lifecycle/grading-transitions';
import { TeacherReviewService } from '../src/grading/teacher-review.service';
import { forceStatus, scoreResult, seedResult, seedSession, SeedSession } from './helpers/grading-seed';

describe('Máy trạng thái §14.3 ở tầng DB (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let ctx: SeedSession;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    ds = app.get(DataSource);
    ctx = await seedSession(ds, 'life2');
  });
  afterAll(async () => app.close());

  /** Trạng thái nguồn đặt thẳng; bài ở `flagged_for_review` là bài không chấm được lớp system, để ca chấm lại hợp lệ. */
  async function resultAt(status: string): Promise<string> {
    const { resultId } = await seedResult(ds, ctx);
    const extra: Record<string, unknown> =
      status === 'flagged_for_review'
        ? { ungradable_class: 'system', ungradable_reason: 'seed', confidence: 0 }
        : status === 'finalized' || status === 'exported'
          ? { finalized_by: ctx.teacherId, finalized_at: new Date() }
          : {};
    if (status !== 'ai_grading') await forceStatus(ds, resultId, status, extra);
    return resultId;
  }

  it('T-LIFE-1: mọi cặp trạng thái — trigger chấp nhận ĐÚNG những cặp của bảng §14.3', async () => {
    const mismatches: string[] = [];
    for (const from of GRADING_STATUSES) {
      for (const to of GRADING_STATUSES) {
        if (from === to) continue;
        const id = await resultAt(from);
        const stamp = to === 'finalized' ? `, finalized_by = '${ctx.teacherId}', finalized_at = now()` : '';
        const accepted = await ds
          .query(`UPDATE examcollect.grading_result SET status = $2${stamp} WHERE id = $1`, [id, to])
          .then(() => true, () => false);
        if (accepted !== canTransition(from, to)) mismatches.push(`${from} → ${to}: DB ${accepted ? 'cho' : 'chặn'}`);
      }
    }
    expect(mismatches).toEqual([]);
  });

  it('T-FIN-2 (phần DB): sang finalized thiếu finalized_by bị từ chối', async () => {
    const id = await resultAt('teacher_reviewed');
    await expect(ds.query(`UPDATE examcollect.grading_result SET status = 'finalized' WHERE id = $1`, [id]))
      .rejects.toThrow(/finalized_by/);
  });

  it('chấm lại (flagged → ai_grading) chỉ cho bài không chấm được lớp system, chưa có điểm (§2.3 luật 1, 4)', async () => {
    const { resultId } = await seedResult(ds, ctx);
    await scoreResult(ds, resultId);
    await ds.query(`UPDATE examcollect.grading_result SET status = 'flagged_for_review' WHERE id = $1`, [resultId]);
    await expect(ds.query(`UPDATE examcollect.grading_result SET status = 'ai_grading' WHERE id = $1`, [resultId]))
      .rejects.toThrow(/Chỉ chấm lại/);

    const sub = await resultAt('ai_grading');
    await forceStatus(ds, sub, 'flagged_for_review', { ungradable_class: 'submission', ungradable_reason: 'file hỏng' });
    await expect(ds.query(`UPDATE examcollect.grading_result SET status = 'ai_grading' WHERE id = $1`, [sub]))
      .rejects.toThrow(/Chỉ chấm lại/);
  });

  it('pipeline không bao giờ đổi (§14.1, §2.3 luật 8)', async () => {
    const { resultId } = await seedResult(ds, ctx);
    await expect(ds.query(`UPDATE examcollect.grading_result SET pipeline = 'investigator' WHERE id = $1`, [resultId]))
      .rejects.toThrow(/pipeline/);
  });

  it('T-FIN-2: chốt phiên → mọi bài finalized mang finalized_by là người bấm', async () => {
    const own = await seedSession(ds, 'life2-fin');
    const a = await seedResult(ds, own);
    const b = await seedResult(ds, own);
    for (const r of [a, b]) await scoreResult(ds, r.resultId);
    await ds.query(`UPDATE examcollect.grading_result SET status = 'auto_approved' WHERE id = $1`, [a.resultId]);
    await ds.query(`UPDATE examcollect.grading_result SET status = 'flagged_for_review' WHERE id = $1`, [b.resultId]);
    await ds.query(
      `INSERT INTO examcollect.teacher_review (grading_result_id, teacher_id, final_score) VALUES ($1, $2, 6)`,
      [b.resultId, own.teacherId],
    );
    await ds.query(`UPDATE examcollect.grading_result SET status = 'teacher_reviewed' WHERE id = $1`, [b.resultId]);

    await app.get(TeacherReviewService).finalizeGrades(own.sessionId, own.teacherId);

    const rows = await ds.query(
      `SELECT status, finalized_by, finalized_at IS NOT NULL AS stamped FROM examcollect.grading_result WHERE id = ANY($1)`,
      [[a.resultId, b.resultId]],
    );
    expect(rows).toEqual([
      { status: 'finalized', finalized_by: own.teacherId, stamped: true },
      { status: 'finalized', finalized_by: own.teacherId, stamped: true },
    ]);
  });

  it('bài đang kiểm mẫu chặn chốt điểm', async () => {
    const own = await seedSession(ds, 'life2-audit');
    const r = await seedResult(ds, own);
    await forceStatus(ds, r.resultId, 'audit_pending');
    await expect(app.get(TeacherReviewService).finalizeGrades(own.sessionId, own.teacherId)).rejects.toThrow(/chưa duyệt xong/);
  });
});
```

Run: `pnpm --filter api test:e2e -- grading-lifecycle-v2` — Expected: FAIL (ví dụ `auto_approved → finalized: DB chặn`).

- [ ] **Step 4: Migration.**

```ts
// apps/api/src/database/migrations/1789460000000-GradingLifecycleV2.ts
import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `validate_grading_result_lifecycle` viết lại theo ĐÚNG bảng §14.3 (§14.4): thêm sáu dòng *Thêm*
 * — bảy cặp trạng thái — cùng ba luật mà bảng một chiều không tả được:
 *   1. sang `finalized` phải mang `finalized_by` (người ký tên, §14.2);
 *   2. `flagged_for_review → ai_grading` chỉ cho bài không chấm được lớp `system`, chưa có điểm
 *      (§2.3 luật 1, 4);
 *   3. `pipeline` không bao giờ đổi (§14.1, §2.3 luật 8).
 * Bản trong code: `grading/lifecycle/grading-transitions.ts`; T-LIFE-1 giữ hai bản khớp nhau.
 */
export class GradingLifecycleV21789460000000 implements MigrationInterface {
  name = 'GradingLifecycleV21789460000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE OR REPLACE FUNCTION examcollect.validate_grading_result_lifecycle()
      RETURNS TRIGGER
      LANGUAGE plpgsql
      SET search_path = examcollect, public
      AS $$
      BEGIN
          IF TG_OP = 'INSERT' THEN
              IF NEW.status <> 'ai_grading' THEN
                  RAISE EXCEPTION 'A grading result must be created in ai_grading status'
                      USING ERRCODE = 'check_violation';
              END IF;
              RETURN NEW;
          END IF;

          IF NEW.pipeline IS DISTINCT FROM OLD.pipeline THEN
              RAISE EXCEPTION 'pipeline của một kết quả chấm không bao giờ đổi: % -> %', OLD.pipeline, NEW.pipeline
                  USING ERRCODE = 'check_violation';
          END IF;

          IF NEW.status IS DISTINCT FROM OLD.status THEN
              IF NOT (
                    (OLD.status = 'ai_grading'
                        AND NEW.status IN ('ai_graded', 'flagged_for_review'))
                 OR (OLD.status = 'ai_graded'
                        AND NEW.status IN ('auto_approved', 'flagged_for_review'))
                 OR (OLD.status = 'auto_approved'
                        AND NEW.status IN ('audit_pending', 'flagged_for_review', 'teacher_reviewed', 'finalized'))
                 OR (OLD.status = 'audit_pending'
                        AND NEW.status IN ('teacher_reviewed', 'flagged_for_review'))
                 OR (OLD.status = 'flagged_for_review'
                        AND NEW.status IN ('auto_approved', 'ai_grading', 'teacher_reviewed'))
                 OR (OLD.status = 'teacher_reviewed' AND NEW.status = 'finalized')
                 OR (OLD.status = 'finalized' AND NEW.status = 'exported')
              ) THEN
                  RAISE EXCEPTION 'Invalid grading result status transition: % -> %', OLD.status, NEW.status
                      USING ERRCODE = 'check_violation';
              END IF;

              IF NEW.status = 'finalized' AND NEW.finalized_by IS NULL THEN
                  RAISE EXCEPTION 'Chốt điểm phải mang tên người chốt (finalized_by) — kết quả %', OLD.id
                      USING ERRCODE = 'check_violation';
              END IF;

              IF OLD.status = 'flagged_for_review' AND NEW.status = 'ai_grading'
                 AND (OLD.ai_total_score IS NOT NULL OR OLD.ungradable_class IS DISTINCT FROM 'system') THEN
                  RAISE EXCEPTION 'Chỉ chấm lại bài không chấm được lớp system, chưa có điểm — kết quả %', OLD.id
                      USING ERRCODE = 'check_violation';
              END IF;
          END IF;

          RETURN NEW;
      END;
      $$
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    // Bản của `AllowAiGradingToFlagged1789220000000`.
    await q.query(`
      CREATE OR REPLACE FUNCTION examcollect.validate_grading_result_lifecycle()
      RETURNS TRIGGER
      LANGUAGE plpgsql
      SET search_path = examcollect, public
      AS $$
      BEGIN
          IF TG_OP = 'INSERT' THEN
              IF NEW.status <> 'ai_grading' THEN
                  RAISE EXCEPTION 'A grading result must be created in ai_grading status'
                      USING ERRCODE = 'check_violation';
              END IF;
              RETURN NEW;
          END IF;

          IF NEW.status IS DISTINCT FROM OLD.status
             AND NOT (
                  (OLD.status = 'ai_grading'
                      AND NEW.status IN ('ai_graded', 'flagged_for_review'))
                  OR (OLD.status = 'ai_graded'
                      AND NEW.status IN ('auto_approved', 'flagged_for_review'))
                  OR (OLD.status IN ('auto_approved', 'flagged_for_review')
                      AND NEW.status = 'teacher_reviewed')
                  OR (OLD.status = 'teacher_reviewed' AND NEW.status = 'finalized')
                  OR (OLD.status = 'finalized' AND NEW.status = 'exported')
             ) THEN
              RAISE EXCEPTION 'Invalid grading result status transition: % -> %',
                  OLD.status,
                  NEW.status
                  USING ERRCODE = 'check_violation';
          END IF;

          RETURN NEW;
      END;
      $$
    `);
  }
}
```

- [ ] **Step 5: Service chốt điểm.** Trong `teacher-review.service.ts`:
- Xoá hằng `BLOCKS_FINALIZE` cục bộ (:44-48), import từ `./lifecycle/grading-transitions`; đổi `BLOCKS_FINALIZE.includes(result.status)` thành `BLOCKS_FINALIZE.has(result.status)`.
- `advance` nhận tham số cuối `extra: FinalizeStamp | Record<string, never> = {}` và `.set({ status: to, ...extra })`:

```ts
/** Người ký tên lên điểm đã công bố — ghi CÙNG UPDATE sang `finalized` (§14.2, trigger đòi). */
export interface FinalizeStamp {
  finalizedBy: string;
  finalizedAt: Date;
}
```

- `finalizeGrades`: `const stamp: FinalizeStamp = { finalizedBy: teacherId, finalizedAt: new Date() };` ở đầu transaction, và lời gọi `advance(result.id, ['teacher_reviewed'], 'finalized', manager)` thành `advance(result.id, ['teacher_reviewed'], 'finalized', manager, stamp)`. Đường `one_shot` giữ nguyên hành vi hôm nay (bài `auto_approved` vẫn nhận một dòng review `bulk_accept` rồi qua `teacher_reviewed`); bước thẳng `auto_approved → finalized` là của đường `investigator`, bước 3c.
- Sửa comment của `advance` (*"It deliberately does NOT restate the transition map"*) thành: bảng có bản code ở `grading-transitions.ts`, dùng cho test và cho màn hình; `advance` vẫn không tự kiểm bảng — trigger là chỗ ép.

`bulk-review.e2e-spec.ts` :181 (trong `sessionWithFinalizedResults`, nơi các dòng review ghi `teacherId`): `SET status = 'finalized' WHERE id = $1` thành `SET status = 'finalized', finalized_by = $2, finalized_at = now() WHERE id = $1`, tham số `[id, teacherId]`.

`teacher-review.e2e-spec.ts` :141: comment ví dụ đổi sang một bước còn bị cấm, ví dụ `teacher_reviewed -> ai_graded`.

- [ ] **Step 6: Chạy.**

```bash
bash .superpowers/sdd/2026-09-26-grading-data-model/db.sh pnpm --filter api migration:run
pnpm --filter api exec tsc --noEmit -p tsconfig.json
pnpm --filter api test -- grading-transitions teacher-review
pnpm --filter api test:e2e -- grading-lifecycle-v2 grading-lifecycle teacher-review bulk-review
```

Expected: PASS. T-LIFE-1 chạy 56 cặp — khoảng vài giây.

- [ ] **Step 7: Commit.**

```bash
git add apps/api/src/database/migrations/1789460000000-GradingLifecycleV2.ts apps/api/src/grading/lifecycle apps/api/src/grading/teacher-review.service.ts apps/api/test/grading-lifecycle-v2.e2e-spec.ts apps/api/test/bulk-review.e2e-spec.ts apps/api/test/teacher-review.e2e-spec.ts
git commit -m "feat(grading): máy trạng thái §14.3 — trigger vòng đời theo đúng bảng, bản code và test đi qua mọi cặp; chốt điểm mang tên người chốt (T-LIFE-1, T-FIN-2)"
```

---

### Task 7: Mọi bước chuyển là UPDATE có điều kiện; `markUngradable` ghi lớp lý do và lượt chấm

**Files:**
- Modify: `apps/api/src/grading/grading.service.ts` (`markUngradable` :193-208, hai `results.update` của `gradeOne` :477, :524)
- Modify: `apps/api/src/grading/grading.module.ts` (`TypeOrmModule.forFeature` thêm `GradingAttemptEntity`), constructor `GradingService` (inject repository lượt chấm)
- Test: `apps/api/test/grading-lifecycle.e2e-spec.ts` (thêm ca), unit spec của `GradingService` đang dựng instance bằng `Object.create` (cập nhật nếu đụng)

**Interfaces:**
- Consumes: `GradingAttemptEntity` (Task 5), `ungradable_class` (Task 2).
- Produces: `markUngradable(submissionId, reason)` — cùng chữ ký; từ nay ghi `ungradable_class = 'system'` và một lượt chấm `ungradable`, trong một transaction.

- [ ] **Step 1: Test đỏ.** Thêm vào `grading-lifecycle.e2e-spec.ts` (dùng `seedGradingResultAtAiGrading` có sẵn của file, và `app.get(GradingService)`):

```ts
  it('markUngradable ghi lớp system và một lượt chấm chép lý do (§2.3 luật 1, 2)', async () => {
    const id = await seedGradingResultAtAiGrading();
    const [{ submission_id }] = await dataSource.query(`SELECT submission_id FROM examcollect.grading_result WHERE id = $1`, [id]);
    await app.get(GradingService).markUngradable(submission_id, 'sandbox không phản hồi');

    const [row] = await dataSource.query(
      `SELECT g.status, g.ungradable_class, a.attempt_no, a.outcome, a.ungradable_class AS attempt_class, a.ungradable_reason
         FROM examcollect.grading_result g JOIN examcollect.grading_attempt a ON a.id = g.current_attempt_id
        WHERE g.id = $1`,
      [id],
    );
    expect(row).toEqual({
      status: 'flagged_for_review', ungradable_class: 'system', attempt_no: 1, outcome: 'ungradable',
      attempt_class: 'system', ungradable_reason: 'sandbox không phản hồi',
    });
  });

  it('markUngradable đến SAU khi bài đã có điểm → không đụng gì, không sinh lượt chấm', async () => {
    const id = await seedGradingResultAtAiGrading();
    await dataSource.query(
      `UPDATE examcollect.grading_result SET status = 'ai_graded', ai_total_score = 8, confidence = 0.9, criterion_results = '[]' WHERE id = $1`,
      [id],
    );
    const [{ submission_id }] = await dataSource.query(`SELECT submission_id FROM examcollect.grading_result WHERE id = $1`, [id]);
    await app.get(GradingService).markUngradable(submission_id, 'job hết lượt thử');

    const [row] = await dataSource.query(
      `SELECT status, ungradable_class, (SELECT count(*)::int FROM examcollect.grading_attempt WHERE grading_result_id = $1) AS attempts
         FROM examcollect.grading_result WHERE id = $1`,
      [id],
    );
    expect(row).toEqual({ status: 'ai_graded', ungradable_class: null, attempts: 0 });
  });
```

Run: `pnpm --filter api test:e2e -- grading-lifecycle` — Expected: FAIL (`ungradable_class` null, không có lượt chấm).

- [ ] **Step 2: `markUngradable`.** `GradingService` nhận thêm `@InjectRepository(GradingAttemptEntity) private readonly attempts: Repository<GradingAttemptEntity>` (thêm entity vào `forFeature` của `grading.module.ts`). Thân hàm:

```ts
  async markUngradable(submissionId: string, reason: string): Promise<void> {
    await this.results.manager.transaction(async (manager) => {
      // UPDATE CÓ ĐIỀU KIỆN (§14.3): chỉ bài còn ở `ai_grading`. Không đổi dòng nào nghĩa là bài
      // đã đi tiếp — chấm xong, hoặc một lần gọi trước đã đánh dấu — và hàm này được gọi từ một
      // event handler có thể bắn nhiều lần. Đọc-rồi-ghi như trước để hở đúng khe `gradeOne` vừa
      // ghi điểm giữa hai bước.
      const updated = await manager
        .createQueryBuilder()
        .update(GradingResultEntity)
        .set({ status: 'flagged_for_review', flagForReview: true, confidence: '0', ungradableReason: reason, ungradableClass: 'system' })
        .where('submission_id = :submissionId', { submissionId })
        .andWhere("status = 'ai_grading'")
        .returning(['id', 'gradingTriggeredBy', 'gradingTriggeredAt'])
        .execute();
      const row = (updated.raw as { id: string; grading_triggered_by: string; grading_triggered_at: Date }[])[0];
      if (!row) return;

      // Lượt chấm chép lý do (§2.3 luật 2): chấm lại sẽ là lượt kế tiếp, lý do lần này không mất.
      // `started_at` = lúc xếp hàng — cho tới bước 3d, không ai ghi lúc job bắt đầu.
      const attempts = manager.getRepository(GradingAttemptEntity);
      const last = await attempts
        .createQueryBuilder('a')
        .select('MAX(a.attempt_no)', 'max')
        .where('a.grading_result_id = :id', { id: row.id })
        .getRawOne<{ max: number | null }>();
      const attempt = await attempts.save(
        attempts.create({
          gradingResultId: row.id,
          attemptNo: (last?.max ?? 0) + 1,
          outcome: 'ungradable',
          ungradableClass: 'system',
          ungradableReason: reason,
          triggeredBy: row.grading_triggered_by,
          startedAt: row.grading_triggered_at,
          finishedAt: new Date(),
        }),
      );
      await manager.update(GradingResultEntity, row.id, { currentAttemptId: attempt.id });
    });
    this.logger.error(`submission ${submissionId}: AI không chấm được — ${reason}`);
  }
```

(`.returning([...])` của TypeORM nhận tên thuộc tính và trả `raw` bằng tên CỘT — kiểm lại khi chạy; nếu `raw` ra tên thuộc tính thì đổi kiểu tương ứng. Log chỉ ghi khi thật sự đánh dấu: đưa `this.logger.error` vào trong transaction, ngay trước `return` cuối, nếu muốn giữ đúng nghĩa cũ.)

- [ ] **Step 3: Hai bước chuyển của `gradeOne` có điều kiện.** Thay `await this.results.update(result.id, { status: 'ai_graded', … })` (:477) bằng:

```ts
    const wrote = await this.results
      .createQueryBuilder()
      .update(GradingResultEntity)
      .set({ status: 'ai_graded', /* …giữ NGUYÊN mọi trường đang ghi ở đây… */ })
      .where('id = :id', { id: result.id })
      .andWhere("status = 'ai_grading'")
      .execute();
    if ((wrote.affected ?? 0) === 0) {
      // Bài đã rời `ai_grading` trong lúc model chạy — `markUngradable` của một lần thử trước,
      // hoặc một job trùng. Không ghi đè: người gọi dừng (§14.3).
      this.logger.warn(`submission ${submission.id}: bài đã rời ai_grading trong lúc chấm — bỏ kết quả lượt này`);
      return;
    }
```

(chép nguyên khối trường của `update` cũ vào `.set({...})`, kể cả comment của từng trường), và bước thứ hai (:524):

```ts
    await this.results
      .createQueryBuilder()
      .update(GradingResultEntity)
      .set({ status: confident ? 'auto_approved' : 'flagged_for_review', flagForReview: !confident })
      .where('id = :id', { id: result.id })
      .andWhere("status = 'ai_graded'")
      .execute();
```

- [ ] **Step 4: Unit spec dựng `GradingService` bằng constructor thật.** Repository lượt chấm là tham số CUỐI của constructor (sau `anchors`), để các chỗ dựng hiện có chỉ thêm một đối số. `grading-regrade.spec.ts` mock `results.update` và đọc `update.mock.calls` — hai bước chuyển giờ đi qua query builder, nên đổi mock sang một chuỗi ghi lại từng `.set()`:

```ts
    const sets: Record<string, unknown>[] = [];
    const qb = {
      update: () => qb,
      set: (values: Record<string, unknown>) => { sets.push(values); return qb; },
      where: () => qb,
      andWhere: () => qb,
      execute: async () => ({ affected: 1 }),
    };
    const results = {
      findOne: jest.fn().mockResolvedValue({ id: 'g1', aiTotalScore: null, pipeline: 'one_shot' }),
      createQueryBuilder: jest.fn(() => qb),
    } as unknown as Repository<GradingResultEntity>;
```

và mọi `update.mock.calls[0]` / `[1]` thành `sets[0]` / `sets[1]` (bỏ destructuring `[, saved]`). Constructor thêm đối số cuối `{} as Repository<GradingAttemptEntity>`. Làm tương tự cho mọi spec khác gọi `new GradingService(` (`grep -rln "new GradingService(" apps/api/src`).

- [ ] **Step 5: Chạy.**

```bash
pnpm --filter api exec tsc --noEmit -p tsconfig.json
pnpm --filter api test -- grading
pnpm --filter api test:e2e -- grading-lifecycle grading grading-queue
```

Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add apps/api/src/grading/grading.service.ts apps/api/src/grading/grading.module.ts apps/api/test/grading-lifecycle.e2e-spec.ts apps/api/src
git commit -m "fix(grading): bước chuyển của gradeOne và markUngradable là UPDATE có điều kiện; bài không chấm được mang lớp system và một lượt chấm chép lý do (§14.3, §2.3)"
```

---

### Task 8: Gán đường chấm lúc bắt đầu chấm (`T-PIPE-1`)

**Files:**
- Create: `apps/api/src/grading/pipeline.ts`, test `apps/api/src/grading/pipeline.spec.ts`
- Modify: `apps/api/src/grading/grading-run.service.ts` (map `deliverables` ~:185 và `results.create` ~:236)
- Modify: `apps/api/src/grading/grading.service.ts` (`gradeOneById`)

**Interfaces:**
- Produces: `pipelineFor(d: { deliverableType: DeliverableType; language: DeclaredLanguage | null }): GradingPipeline`; `INVESTIGATOR_LANGUAGES`.

- [ ] **Step 1: Test đỏ.**

```ts
// apps/api/src/grading/pipeline.spec.ts
import { pipelineFor } from './pipeline';

describe('pipelineFor (§14.1, T-PIPE-1)', () => {
  it('bài code khai cpp hay python → investigator', () => {
    expect(pipelineFor({ deliverableType: 'code_project', language: 'cpp' })).toBe('investigator');
    expect(pipelineFor({ deliverableType: 'code_project', language: 'python' })).toBe('investigator');
  });

  it('bài code CHƯA khai ngôn ngữ → one_shot; hệ thống không đoán từ đuôi file', () => {
    expect(pipelineFor({ deliverableType: 'code_project', language: null })).toBe('one_shot');
  });

  it('bài code khai java hay node → one_shot — sandbox chỉ chạy cpp, python (§3.5)', () => {
    expect(pipelineFor({ deliverableType: 'code_project', language: 'java' })).toBe('one_shot');
    expect(pipelineFor({ deliverableType: 'code_project', language: 'node' })).toBe('one_shot');
  });

  it('bài tự luận, ảnh → one_shot', () => {
    expect(pipelineFor({ deliverableType: 'document', language: null })).toBe('one_shot');
    expect(pipelineFor({ deliverableType: 'image', language: null })).toBe('one_shot');
  });
});
```

Run: `pnpm --filter api test -- pipeline` — Expected: FAIL.

- [ ] **Step 2: Hàm.**

```ts
// apps/api/src/grading/pipeline.ts
import type { DeliverableType } from '../exam-session/entities/required-deliverable.entity';
import type { DeclaredLanguage } from '../exam-session/declared-language';
import type { GradingPipeline } from './grading-model.types';

/** Ngôn ngữ sandbox chạy được (§3.5). */
export const INVESTIGATOR_LANGUAGES: ReadonlySet<DeclaredLanguage> = new Set<DeclaredLanguage>(['cpp', 'python']);

/**
 * Đường chấm của một bài, gán MỘT lần lúc `startGrading` tạo dòng (§14.1): `investigator` khi bài
 * là `code_project` và khai `cpp`/`python`; mọi trường hợp khác là `one_shot`. Chấm lại giữ nguyên
 * đường (§2.3 luật 8) — trigger vòng đời chặn đổi cột.
 */
export function pipelineFor(d: { deliverableType: DeliverableType; language: DeclaredLanguage | null }): GradingPipeline {
  return d.deliverableType === 'code_project' && d.language !== null && INVESTIGATOR_LANGUAGES.has(d.language)
    ? 'investigator'
    : 'one_shot';
}
```

Run: `pnpm --filter api test -- pipeline` — Expected: PASS.

- [ ] **Step 3: `startGrading`.** Trong map `deliverables` thêm `language: deliverable.language,`; trong `this.results.create({...})` thêm `pipeline: pipelineFor(deliverables.get(submission.requiredDeliverableId) ?? { deliverableType: 'document', language: null }),`. (Kiểm tên trường nối submission với deliverable trong `SubmissionEntity` — `requiredDeliverableId`.)

- [ ] **Step 4: `gradeOneById` không chấm một-phát một bài của đường điều tra.** Ngay sau nhánh *"đã có điểm AI — bỏ qua job lặp"*:

```ts
    if (result.pipeline === 'investigator') {
      // Đường điều tra chưa nối vào đường chấm thật — bước 3d. Chấm một-phát một bài đã gán
      // `investigator` là ghi một điểm của đường này dưới nhãn của đường kia. Hôm nay không route
      // nào khai được ngôn ngữ, nên nhánh này chỉ là chốt chặn.
      await this.markUngradable(job.submissionId, 'Bài thuộc đường chấm điều tra, đường này chưa nối vào hệ thống — chưa chấm');
      return;
    }
```

Unit test cho nhánh này, thêm vào `grading-regrade.spec.ts` (dùng lại `service`, `grade` của `beforeEach`; `JOB` là job của file):

```ts
  it('bài đã gán đường điều tra → KHÔNG chấm một-phát, đánh dấu không chấm được (T-PIPE-1)', async () => {
    const results = (service as unknown as { results: { findOne: jest.Mock } }).results;
    results.findOne.mockResolvedValue({ id: 'g1', aiTotalScore: null, pipeline: 'investigator' });
    const mark = jest.spyOn(service, 'markUngradable').mockResolvedValue(undefined);

    await service.gradeOneById(JOB);

    expect(mark).toHaveBeenCalledTimes(1);
    expect(mark.mock.calls[0][0]).toBe(JOB.submissionId);
    expect(grade).not.toHaveBeenCalled();
  });
```

- [ ] **Step 5: Chạy.**

```bash
pnpm --filter api exec tsc --noEmit -p tsconfig.json
pnpm --filter api test -- pipeline grading
pnpm --filter api test:e2e -- grading grading-queue
```

Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add apps/api/src/grading/pipeline.ts apps/api/src/grading/pipeline.spec.ts apps/api/src/grading/grading-run.service.ts apps/api/src/grading/grading.service.ts apps/api/src
git commit -m "feat(grading): gán đường chấm một lần lúc bắt đầu chấm; bài đường điều tra không bị chấm một-phát (§14.1, T-PIPE-1)"
```

---

### Task 9: Luật đóng băng mới — mở lại khi mọi bài đều không chấm được (§2.3 luật 6)

**Files:**
- Create: `apps/api/src/grading/grading-lock.ts`, test `apps/api/src/grading/grading-lock.spec.ts`
- Modify: `apps/api/src/grading/grading.service.ts` (`hasResultsForSession` → `isGradingLocked`), `apps/api/src/grading/grading.controller.ts` (:114-128), `apps/api/src/grading/grading-reference.service.ts` (`assertNotGradedYet`)
- Modify: `apps/api/test/grading-reference.e2e-spec.ts` (T-FREEZE-1, :208-219), `apps/api/test/session-rubric.e2e-spec.ts` (:342-358)
- Test: `apps/api/test/grading-freeze.e2e-spec.ts`

**Interfaces:**
- Produces: `isGradingLocked(manager: EntityManager, examSessionId: string): Promise<boolean>`; `GRADING_LOCKED_SQL` (chuỗi SQL, để unit test đọc được luật); `GradingService.isGradingLocked(examSessionId)`.

- [ ] **Step 1: Test đỏ — e2e.**

```ts
// apps/api/test/grading-freeze.e2e-spec.ts
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { GradingService } from '../src/grading/grading.service';
import { forceStatus, scoreResult, seedResult, seedSession, SeedSession } from './helpers/grading-seed';

/**
 * §2.3 luật 6: phiên khoá khi có ít nhất một bài MANG ĐIỂM hoặc ĐANG CHẤM; mở lại khi mọi kết
 * quả là bài không chấm được đã dừng hẳn. Trước luật này: *"có một dòng kết quả là khoá"*.
 */
describe('Luật đóng băng §2.3 luật 6 (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let grading: GradingService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    ds = app.get(DataSource);
    grading = app.get(GradingService);
  });
  afterAll(async () => app.close());

  async function ungradable(ctx: SeedSession): Promise<string> {
    const { resultId } = await seedResult(ds, ctx);
    await forceStatus(ds, resultId, 'flagged_for_review', { ungradable_class: 'system', ungradable_reason: 'sandbox chết', confidence: 0 });
    return resultId;
  }

  it('T-FREEZE-3: 40 bài đều không chấm được, 0 bài mang điểm → KHÔNG khoá; thêm 1 bài mang điểm → khoá', async () => {
    const ctx = await seedSession(ds, 'freeze3');
    for (let i = 0; i < 40; i++) await ungradable(ctx);
    expect(await grading.isGradingLocked(ctx.sessionId)).toBe(false);

    const { resultId } = await seedResult(ds, ctx);
    await scoreResult(ds, resultId);
    expect(await grading.isGradingLocked(ctx.sessionId)).toBe(true);
  });

  it('bài đang chấm (ai_grading, ai_graded) → khoá, kể cả khi chưa bài nào ra điểm — chặn kẽ chạy đua', async () => {
    const a = await seedSession(ds, 'freeze-running');
    await ungradable(a);
    await seedResult(ds, a); // ai_grading
    expect(await grading.isGradingLocked(a.sessionId)).toBe(true);
  });

  it('bài không chấm được mà giảng viên đã CHẤM TAY → khoá: bài đó đã mang điểm', async () => {
    const ctx = await seedSession(ds, 'freeze-manual');
    const id = await ungradable(ctx);
    await ds.query(
      `INSERT INTO examcollect.teacher_review (grading_result_id, teacher_id, final_score, kind) VALUES ($1, $2, 6, 'manual_score')`,
      [id, ctx.teacherId],
    );
    expect(await grading.isGradingLocked(ctx.sessionId)).toBe(true);
  });

  it('phiên chưa có kết quả nào → không khoá', async () => {
    const ctx = await seedSession(ds, 'freeze-empty');
    expect(await grading.isGradingLocked(ctx.sessionId)).toBe(false);
  });
});
```

Run: `pnpm --filter api test:e2e -- grading-freeze` — Expected: FAIL (`isGradingLocked is not a function`).

- [ ] **Step 2: Hàm, một chỗ.**

```ts
// apps/api/src/grading/grading-lock.ts
import { EntityManager } from 'typeorm';

/**
 * Luật đóng băng — spec §2.3 luật 6, §14.3 *"danh sách duy nhất"*. Đề, đáp án mẫu, gói test và
 * rubric của phiên khoá khi phiên có ít nhất một kết quả MANG ĐIỂM hoặc ĐANG CHẤM; mở lại khi
 * mọi kết quả là bài không chấm được đã dừng hẳn — lúc đó chưa bài nào bị đo bằng thước cũ, nên
 * sửa thước không đẻ ra hai kỳ thi.
 *
 * "Mang điểm" gồm ba nguồn: điểm AI, một dòng review có điểm (bài không chấm được mà giảng viên
 * chấm tay), và một lượt tính điểm (đường `investigator`). "Đang chấm" đếm cả `ai_graded`: lô
 * đang chạy mà chưa bài nào ra điểm vẫn là hai thước trong một phiên.
 *
 * Một hàm tự do nhận `EntityManager`, không phải method của service: `GradingService` và
 * `GradingReferenceService` cùng module và một chiều đã phụ thuộc nhau — gọi qua service là vòng.
 */
export const GRADING_LOCKED_SQL = `
  SELECT EXISTS (
    SELECT 1
      FROM examcollect.grading_result g
      JOIN examcollect.submission s ON s.id = g.submission_id
     WHERE s.exam_session_id = $1
       AND (g.status IN ('ai_grading', 'ai_graded')
            OR g.ai_total_score IS NOT NULL
            OR EXISTS (SELECT 1 FROM examcollect.teacher_review t
                        WHERE t.grading_result_id = g.id AND t.final_score IS NOT NULL)
            OR EXISTS (SELECT 1 FROM examcollect.score_computation c
                        WHERE c.grading_result_id = g.id))
  ) AS locked`;

export async function isGradingLocked(manager: EntityManager, examSessionId: string): Promise<boolean> {
  const [row] = await manager.query(GRADING_LOCKED_SQL, [examSessionId]);
  return row.locked === true;
}

export const GRADING_LOCKED_MESSAGE = 'Phiên thi này đã có bài mang điểm hoặc đang chấm';
```

Unit test ngắn cho câu chữ của luật — ba nguồn "mang điểm" và hai trạng thái "đang chấm" phải có mặt, để một lần "dọn dẹp" không lặng lẽ bỏ một vế:

```ts
// apps/api/src/grading/grading-lock.spec.ts
import { GRADING_LOCKED_SQL } from './grading-lock';

describe('luật đóng băng — câu chữ (§2.3 luật 6)', () => {
  it.each([
    ["'ai_grading', 'ai_graded'", 'đang chấm'],
    ['ai_total_score IS NOT NULL', 'điểm AI'],
    ['t.final_score IS NOT NULL', 'chấm tay'],
    ['score_computation', 'lượt tính điểm'],
  ])('có vế %s (%s)', (fragment) => {
    expect(GRADING_LOCKED_SQL).toContain(fragment);
  });
});
```

- [ ] **Step 3: Nối vào hai chỗ khoá.**

`grading.service.ts`: thay `hasResultsForSession` bằng

```ts
  /** Luật đóng băng của phiên (§2.3 luật 6) — `grading-lock.ts`. */
  async isGradingLocked(examSessionId: string): Promise<boolean> {
    return isGradingLocked(this.results.manager, examSessionId);
  }
```

(giữ docblock cũ phần *"Deliberately NOT `RubricService.hasResults`"* — vẫn đúng). `grading.controller.ts` :114-128: `hasResultsForSession` → `isGradingLocked`, message thành `` `${GRADING_LOCKED_MESSAGE} — không đổi được rubric nữa.` ``. `grading-reference.service.ts` `assertNotGradedYet`: thay truy vấn đếm bằng `if (await isGradingLocked(this.results.manager, session.id))`, message `` `${GRADING_LOCKED_MESSAGE} — không đổi được tài liệu tham chiếu nữa.` ``; sửa docblock: luật mới là §2.3 luật 6, không còn *"có một dòng là khoá"*. `grep -rn hasResultsForSession apps/` phải ra rỗng.

- [ ] **Step 4: Sửa ba test của luật cũ (§2.3 luật 6, §15.1 dòng bước 3).**
- `grading-reference.e2e-spec.ts` T-FREEZE-1: đổi tên thành `'T-FREEZE-1: phiên có bài đang chấm → sửa tài liệu trả 409 (§2.3 luật 6)'`; seed `ai_grading` giữ nguyên (vẫn khoá theo luật mới); regex message thành `/mang điểm hoặc đang chấm/i`. Thêm ca ngay sau:

`seedGradingResult` (:106-133) đổi sang TRẢ id kết quả — `const [result] = await dataSource.query(\`INSERT … VALUES ($1, $2, $3, 'ai_grading') RETURNING id\`, …); return result.id;`, kiểu trả `Promise<string>` — rồi thêm (import `forceStatus` từ `./helpers/grading-seed`):

```ts
  it('T-FREEZE-3 (qua route): phiên chỉ có bài không chấm được → sửa tài liệu ĐƯỢC', async () => {
    const session = await seedSession();
    await setReference(session.id, { modelAnswerNote: 'ghi chú ban đầu' }).expect(200);

    const resultId = await seedGradingResult(session);
    await forceStatus(dataSource, resultId, 'flagged_for_review', {
      ungradable_class: 'system', ungradable_reason: 'sandbox chết', confidence: 0,
    });

    await setReference(session.id, { modelAnswerNote: 'sửa thước sau lượt hỏng' }).expect(200);
  });
```

- `session-rubric.e2e-spec.ts` :342-358: đổi tên ca thành `'từ chối với 409 khi phiên có bài đang chấm (§2.3 luật 6)'`. `attachOneGradingResult` đổi sang trả id kết quả (`RETURNING id`, `Promise<string>`), và thêm ngay sau ca 409 (import `forceStatus`):

```ts
    it('đổi được rubric khi mọi kết quả của phiên đều là bài không chấm được (§2.3 luật 6)', async () => {
      const rubric = await saveRubric(tokenA, 'Chỉ có bài hỏng');
      const created = await createSession(tokenA, { classId: classAId, rubricId: rubric.id });
      const resultId = await attachOneGradingResult(created.body.id, created.body.requiredDeliverables[0].id, rubric.id);
      await forceStatus(dataSource, resultId, 'flagged_for_review', {
        ungradable_class: 'system', ungradable_reason: 'sandbox chết', confidence: 0,
      });

      const other = await saveRubric(tokenA, 'Sửa thước sau lượt hỏng');
      const patched = await setRubric(tokenA, created.body.id, other.id);

      expect(patched.status).toBe(200);
    });
```

(`stamp` trong MSSV của `attachOneGradingResult` là hằng của file: hai lần gọi trong một lượt chạy trùng MSSV. Đổi thành `` `SVL${stamp}${Math.random().toString(36).slice(2, 6)}`.slice(0, 20) ``.)
- **T-ATT-2** không tồn tại dưới dạng test (chỉ có trong spec soạn đề §… dòng 518). Đường `attach()` đi qua `assertNotGradedYet`, nên luật mới áp tự động; ghi vào ledger và báo ở cuối plan, không viết test mới (`attach` đòi phiên chưa tới giờ thi, nên một phiên có kết quả chấm không đi tới được bước này).

- [ ] **Step 5: Chạy.**

```bash
pnpm --filter api exec tsc --noEmit -p tsconfig.json
pnpm --filter api test -- grading-lock grading grading-reference
pnpm --filter api test:e2e -- grading-freeze grading-reference session-rubric exam-authoring-attach
```

Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add apps/api/src/grading/grading-lock.ts apps/api/src/grading/grading-lock.spec.ts apps/api/src/grading/grading.service.ts apps/api/src/grading/grading.controller.ts apps/api/src/grading/grading-reference.service.ts apps/api/test/grading-freeze.e2e-spec.ts apps/api/test/grading-reference.e2e-spec.ts apps/api/test/session-rubric.e2e-spec.ts
git commit -m "feat(grading): luật đóng băng mở lại khi mọi bài đều không chấm được — một hàm cho rubric và tài liệu chấm; sửa hai test mã hoá luật cũ (§2.3 luật 6, T-FREEZE-3)"
```

---

### Task 10: Entity khớp DB, DB sạch, chạy lại migration, cả bộ

**Files:**
- Test: `apps/api/test/entity-schema.e2e-spec.ts`
- Modify: `apps/api/src/database/verify-schema.ts` (`EXPECTED_TABLES`)

- [ ] **Step 1: Test — mọi cột của mọi entity có thật trong DB, đúng nullable.**

```ts
// apps/api/test/entity-schema.e2e-spec.ts
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';

/**
 * Entity lệch migration không nổ lúc khởi động — nó nổ ở truy vấn đầu tiên chạm cột đó
 * (`column … does not exist`), thường là trong worker, lúc đang chấm. Test này hỏi DB cho MỌI
 * cột của MỌI entity đã đăng ký.
 */
describe('Entity khớp schema (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    ds = app.get(DataSource);
  });
  afterAll(async () => app.close());

  it('mọi cột khai trong entity đều có trong DB, và nullable khớp', async () => {
    const rows: { table_name: string; column_name: string; is_nullable: 'YES' | 'NO' }[] = await ds.query(
      `SELECT table_name, column_name, is_nullable FROM information_schema.columns WHERE table_schema = 'examcollect'`,
    );
    const db = new Map(rows.map((r) => [`${r.table_name}.${r.column_name}`, r.is_nullable === 'YES']));
    const problems: string[] = [];
    for (const meta of ds.entityMetadatas) {
      for (const col of meta.columns) {
        const key = `${meta.tableName}.${col.databaseName}`;
        if (!db.has(key)) problems.push(`${key}: không có trong DB`);
        else if (db.get(key) !== col.isNullable) problems.push(`${key}: entity nullable=${col.isNullable}, DB nullable=${db.get(key)}`);
      }
    }
    expect(problems).toEqual([]);
  });
});
```

Run: `pnpm --filter api test:e2e -- entity-schema`. Expected: PASS. Ca nào đỏ ở entity CŨ (không do plan này) thì ghi vào ledger và loại đích danh bằng một danh sách `KNOWN_DRIFT` kèm lý do, không sửa entity cũ trong plan này.

`verify-schema.ts`: thêm `error_rule`, `error_rule_revision`, `price_table_version`, `rule_price`, `grading_test_bundle`, `grading_test_case`, `grading_attempt`, `score_computation`, `criterion_waiver`, `audit_sample_review` vào `EXPECTED_TABLES`.

- [ ] **Step 2: DB sạch — toàn chuỗi migration từ đầu (Review Focus 1, 2).**

```bash
docker exec cine-postgres-1 psql -U examcollect_admin -d postgres -c "DROP DATABASE IF EXISTS examcollect_fresh" -c "CREATE DATABASE examcollect_fresh"
docker exec -i cine-postgres-1 psql -U examcollect_admin -d examcollect_fresh < docker/postgres-init/001-create-schema.sql
DB_NAME_OVERRIDE=examcollect_fresh bash .superpowers/sdd/2026-09-26-grading-data-model/db.sh pnpm --filter api migration:run
DB_NAME_OVERRIDE=examcollect_fresh bash .superpowers/sdd/2026-09-26-grading-data-model/db.sh pnpm --filter api exec node -r ts-node/register src/database/verify-schema.ts
```

Expected: mọi migration chạy xong; `verify-schema` không báo thiếu bảng. Rồi xoá DB đó: `docker exec cine-postgres-1 psql -U examcollect_admin -d postgres -c "DROP DATABASE examcollect_fresh"`.

- [ ] **Step 3: Revert rồi chạy lại trên DB local đầy dữ liệu (Review Focus 3).** DB local có rubric đã chấm từ mọi lượt e2e trước.

```bash
for i in 1 2 3 4 5; do bash .superpowers/sdd/2026-09-26-grading-data-model/db.sh pnpm --filter api migration:revert; done
bash .superpowers/sdd/2026-09-26-grading-data-model/db.sh pnpm --filter api migration:run
docker exec cine-postgres-1 psql -U examcollect_admin -d examcollect -Atc "SELECT count(*) FILTER (WHERE key IS NULL) FROM examcollect.rubric_criterion; SELECT tgenabled FROM pg_trigger WHERE tgname = 'trg_rubric_criterion_guard_immutable'"
```

Năm lần revert hoàn `1789460000000` → `1789435000000` (dừng trước `1789420000000`, vốn không hoàn được). Expected: `0` và `O`. Nếu `down()` của `1789430000000` nổ vì đã có dòng `teacher_review` không điểm (không nên có — chưa route nào ghi `error_exception`), ghi vào ledger.

- [ ] **Step 4: Cả bộ.**

```bash
pnpm --filter api test
pnpm --filter api test:e2e
pnpm --filter api build
pnpm --filter api exec eslint "src/**/*.ts" "test/**/*.ts"
pnpm --filter web build
```

Expected: xanh (trừ ca đỏ sẵn đã ghi ở Task 0). `web build` chỉ để chắc không kiểu chung nào vỡ — plan này không đụng web.

- [ ] **Step 5: Commit.**

```bash
git add apps/api/test/entity-schema.e2e-spec.ts apps/api/src/database/verify-schema.ts
git commit -m "test(db): mọi cột của mọi entity có trong DB; verify-schema biết các bảng §14"
```

---

## Sau plan

- **Supabase chưa đụng.** Chạy chuỗi migration này lên DB production là việc của chủ đồ án, sau khi PR được duyệt — kiểm trước bằng câu lệnh ở Task 0 Step 4 xem DB đó có dấu vết plan-1 không.
- **Web** (3f): nhãn `audit_pending`; `SessionRubricCard` đang khoá khi `results.length > 0` — lệch luật mới cho phiên chỉ có bài không chấm được.
- **T-ATT-2** chỉ có trong spec soạn đề; hành vi của nó theo `assertNotGradedYet`.
