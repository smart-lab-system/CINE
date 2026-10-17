# P1a — Mở rộng, không đổi hành vi: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Đưa "câu" (`exam_problem`) vào mô hình dữ liệu và mọi đường đọc cấu hình chấm, với mỗi phiên hiện có đúng MỘT câu mặc định. Hành vi chấm không đổi: phiên một câu chạy y như cũ (R5), và số liệu chấm trước/sau migration không đổi (checksum).

**Architecture:** Hai migration chỉ-thêm: (1) bảng `exam_problem` và các cột `problem_id`, `ruler_trust` cho phép rỗng; (2) backfill câu mặc định cho mọi phiên có sẵn, trong một transaction có cổng checksum. Một hàm đọc duy nhất `resolveProblemConfig()` thay cho các chỗ đọc `exam_session.rubric_id` / `test_bundle_id` (cột bí danh, gỡ ở P2). Ba bẫy im lặng ở §9 và một lỗi `planReapply` được sửa kèm test. `/health` báo lỗi khi còn migration chưa áp, để healthcheck của Railway chặn bản deploy sai schema.

**Tech Stack:** NestJS 10, TypeORM 0.3.31 (`migrationsTransactionMode: 'none'`, chạy `-t all`), PostgreSQL 16 (schema `examcollect`), BullMQ, Jest (unit + e2e tuần tự), pnpm 9.12.0, Node 22.

**Spec:** `docs/superpowers/specs/2026-10-12-multi-problem-grading-design.md` — §10.2 (P1a), §10.1 (migration), §10.3 (điều kiện), §3.1–3.5, §6.3b (`ruler_trust`), §9 (ba bẫy), §11 (nghiệm thu "1 câu chạy như cũ").

## Global Constraints

- Migration **chỉ thêm**: cột mới cho phép rỗng, bảng mới, không `DROP` ở `up()`. Timestamp dải riêng: `1789600000000` (M1), `1789610000000` (M2).
- Railway tự deploy `main` và **không chạy migration**: áp M1, M2 lên Supabase **trước** khi merge; deploy sau.
- `migrationsTransactionMode` là `none`: luôn chạy `migration:run -t all` (một transaction cho mọi migration đang chờ).
- Entity là nguồn sự thật schema; `synchronize` luôn `false`.
- Mọi đường ghi mới phải xin `lockTeacherScoring(m, teacherId)` trước `FOR UPDATE`, đúng thứ tự khoá hiện hành (spec §3.5).
- Bất biến giữ nguyên: trigger đóng băng 8 cột AI, 15 cặp chuyển trạng thái, các bảng chỉ-thêm (`score_computation`, `error_rule_revision`, `price_table_version`).
- `grading/investigator/` và `eval/` không được import typeorm/entity (`no-db.import-scan.spec.ts`). `investigate.ts` không được chứa từ "challenge".
- Python: `python3`, không bao giờ `python`. File trong repo: giữ nguyên kiểu xuống dòng hiện có.
- Không in bí mật (khoá model, `DATABASE_URL`, mật khẩu tài khoản diễn tập) ra log hay file.
- e2e chạy **tuần tự** (`--config ./test/jest-e2e.json`, `maxWorkers: 1`); trước khi tin một lượt e2e phải tắt jest/nest mồ côi.
- Lệnh chạy từ `apps/api/` trừ khi ghi khác.

## Review Focus

Năm trường hợp spec ngụ ý mà test thông thường dễ bỏ sót, theo thứ tự dễ cắn nhất:

1. **Dữ liệu cũ đã có kết quả chấm** — sau backfill, `ai_total_score`, `status`, số dòng `score_computation` và `updated_at` không đổi (checksum gate). → Task 2.
2. **Phiên chưa cấu hình gì** (không rubric, không gói test, không đáp án, không yêu cầu nộp) — vẫn có câu mặc định; resolver trả cấu hình rỗng, không ném lỗi. → Task 3.
3. **Hai bài nộp của cùng sinh viên trong một lần xuất sổ** — không ghi đè âm thầm; báo rõ thay vì chọn một (bẫy 3). → Task 7.
4. **Phiên có hai rubric khác nhau trong cùng lần tính điểm lại** — luật lời và giá lấy theo rubric của từng kết quả, không theo phiên (bẫy 2 và `planReapply`). → Tasks 6, 8.
5. **`/health` khi còn migration chưa áp hoặc DB không nối được** — trả `503` có lý do, không làm sập tiến trình. → Task 9.

## Ghi chú phát hiện khi viết plan (đối chiếu spec với code, 2026-10-14)

- **Bẫy 1 (`gradeOneById`)** chỉ kích hoạt khi `uq_grading_result_submission` bị bỏ (pha 2). Ở P1a vẫn còn unique, nên không tạo được hai kết quả cho một bài nộp để tái hiện. Sửa vẫn làm ở P1a (job mang `resultId`), kiểm bằng test trên job, không bằng test nhiều kết quả.
- **Bẫy 2 và 3** tái hiện được ở P1a bằng cách seed trực tiếp hai câu (`exam_problem`) hoặc hai kết quả cùng sinh viên. Trong luồng thật chúng chỉ hoạt động khi P1b tạo phiên nhiều câu; spec nói "kích hoạt ngay ở pha 1", nhưng luồng hiện tại chưa có phiên nhiều câu. Plan này sửa cả ba ở P1a để P1b không mang lỗi vào.
- **Ruling R-a (bẫy 3):** P1a không tính tổng điểm (tổng là P1b). Thay vì ghi đè, hàm gộp trả `outcome = conflict` kèm lý do "nhiều kết quả — chưa có điểm tổng". P1b thay bằng tổng.
- **Ruling R-b:** `exam_problem_binding` (§3.1, §4.3) **không** nằm trong P1a; nó thuộc nhóm đọc file của câu (P2). `unique(exam_session_id, problem_id)` trên `grading_reference` được **thêm** ở P1a và giữ unique cũ tới P1b.
- **Ruling R-c:** kịch bản `unverified` và cờ `ruler_unverified` (§6.3b) thuộc P1b. P1a chỉ thêm cột `ruler_trust` và backfill.
- **Ruling R-d:** canary đường đọc tổng (§11) thuộc P1b, vì P1a chưa có đường đọc tổng.

## File Structure

**Tạo:**
- `apps/api/src/database/migrations/1789600000000-ExamProblemAdditive.ts` — M1 (chỉ thêm).
- `apps/api/src/database/migrations/1789610000000-ExamProblemBackfill.ts` — M2 (gọi `backfillDefaultProblems`).
- `apps/api/src/exam-session/entities/exam-problem.entity.ts` — entity `exam_problem`.
- `apps/api/src/grading/problem/default-problem-backfill.ts` — hàm backfill dùng chung cho M2 và script sau deploy; có cổng checksum.
- `apps/api/src/grading/problem/resolve-problem-config.ts` — `resolveProblemConfig()`, `ensureDefaultProblem()`.
- `apps/api/src/grading/problem/fold-student-results.ts` — hàm thuần gộp kết quả theo sinh viên (bẫy 3).
- `apps/api/src/grading/problem/alias-read.import-scan.spec.ts` — quét import cấm đọc cột bí danh ngoài resolver.
- `apps/api/test/multi-problem-p1a-schema.e2e-spec.ts`
- `apps/api/test/multi-problem-p1a-backfill.e2e-spec.ts`
- `apps/api/test/multi-problem-p1a-resolver.e2e-spec.ts`
- `apps/api/test/multi-problem-p1a-traps.e2e-spec.ts`
- `apps/api/src/grading/problem/fold-student-results.spec.ts`
- `docs/superpowers/reports/2026-10-14-p1a-test-inventory.md`

**Sửa:**
- `apps/api/src/grading/entities/grading-result.entity.ts` (thêm `problemId`)
- `apps/api/src/grading/entities/grading-test-bundle.entity.ts` (thêm `problemId`)
- `apps/api/src/grading/entities/grading-reference.entity.ts` (thêm `problemId`, `rulerTrust`)
- `apps/api/src/database/data-source.ts` (đăng ký `ExamProblemEntity` trong danh sách `entities`, dòng ~102)
- `apps/api/src/grading/grading.service.ts:296-298` (bẫy 1), `:433` (đọc tham chiếu)
- `apps/api/src/grading/grading.queue.ts:8` (thêm `resultId`)
- `apps/api/src/grading/grading-run.service.ts:133-138, 212, 395` (đọc cấu hình, enqueue)
- `apps/api/src/grading/regrade.service.ts:214` (enqueue)
- `apps/api/src/grading/scoring/score-inputs.ts:102-150, 214` (bẫy 2, đọc bộ test)
- `apps/api/src/grading/scoring/score.service.ts:155-156, 297-298, 434-462, 535` (luật theo câu; `planReapply` theo rubric của kết quả)
- `apps/api/src/grading/pipeline/investigation-context.service.ts:37, 53`
- `apps/api/src/grading/grading-reference.service.ts:269` (`loadForGrading`)
- `apps/api/src/grading/rules/rubric-overview.service.ts:76`
- `apps/api/src/grading/test-bundle/test-bundle.service.ts:54`
- `apps/api/src/exam-session/exam-session.service.ts:161-162, 222, 297-312, 852-854` (tạo câu mặc định; ghi kép)
- `apps/api/src/grade-export/grade-export.data.ts:96-112` (bẫy 3)
- `apps/api/src/health/health.controller.ts`, `apps/api/src/health/health.module.ts` (cổng schema)
- `apps/api/test/health.e2e-spec.ts` (kiểm `/health` mới)

**Quy ước đường dẫn:** `apps/api/…` tính từ gốc repo; các lệnh `pnpm`, `npx` chạy từ `apps/api/`.

---

### Task 0: Đường nền và danh sách test bị ảnh hưởng

**Files:**
- Create: `docs/superpowers/reports/2026-10-14-p1a-test-inventory.md`

**Interfaces:**
- Consumes: không có.
- Produces: danh sách file test cụ thể mà các task sau phải cập nhật (đầu vào của Task 4 và Task 11).

- [ ] **Step 1: Kiểm DB thật khớp repo (chỉ đọc)**

Run (từ `apps/api/`, dùng `.env` của repo chính):
```bash
DOTENV_CONFIG_PATH="C:/Users/Admin/Main/Desktop/HKI 2026-2027/KLTN/CINE/apps/api/.env" node -r ts-node/register -r dotenv/config -r tsconfig-paths/register ./node_modules/typeorm/cli.js migration:show -d src/database/data-source.ts | grep -E "^\[" | tail -4
```
Expected: mọi dòng đều `[X]` (kể cả `AddClassNominalClass1789560000000`, `AttemptUsageAndPrompt1789570000000`). Nếu có `[ ]` thì dừng và báo người dùng.

- [ ] **Step 2: Chuẩn bị DB e2e**

Run: `docker start cine-postgres-e2e-1` (nếu chưa chạy), rồi `pnpm migration:run:e2e`.
Expected: không có migration đang chờ, hoặc chạy xong không lỗi.

- [ ] **Step 3: Lập danh sách test bị ảnh hưởng**

Run:
```bash
grep -rl "grading_result\|GradingResultEntity\|grading_reference\|grading_test_bundle\|rubric_id\|test_bundle_id" src test --include=*.spec.ts --include=*.e2e-spec.ts | sort > /tmp/p1a-tests.txt; wc -l < /tmp/p1a-tests.txt
```
Ghi danh sách vào `docs/superpowers/reports/2026-10-14-p1a-test-inventory.md`, mỗi file một dòng, kèm cột "cần sửa ở task nào". Spec yêu cầu danh sách cụ thể (§11: 43/90 e2e, 12/147 unit); số trong báo cáo phải khớp đếm này.

- [ ] **Step 4: Chạy nền**

Run: `npx jest -c ../../.superpowers/jest.unit.config.js src 2>&1 | grep -E "^Tests:|^Test Suites:"`
Expected: xanh (1504 test theo mốc P0).

- [ ] **Step 5: Commit**

```bash
git add ../../docs/superpowers/reports/2026-10-14-p1a-test-inventory.md
git commit -m "docs(p1a): danh sách test bị ảnh hưởng và đường nền trước P1a"
```

---

### Task 1: Migration chỉ thêm M1 và entity

**Files:**
- Create: `src/database/migrations/1789600000000-ExamProblemAdditive.ts`
- Create: `src/exam-session/entities/exam-problem.entity.ts`
- Modify: `src/grading/entities/grading-result.entity.ts`, `src/grading/entities/grading-test-bundle.entity.ts`, `src/grading/entities/grading-reference.entity.ts`, `src/database/data-source.ts`
- Test: `test/multi-problem-p1a-schema.e2e-spec.ts`

**Interfaces:**
- Consumes: bảng `exam_session`, `rubric`, `required_deliverable`, `grading_test_bundle`, `grading_result`, `grading_reference` đã có.
- Produces: `ExamProblemEntity` với các trường camelCase: `id`, `examSessionId`, `ordinal`, `title`, `pointsHundredths`, `requiredDeliverableId | null`, `entryName | null`, `language | null`, `statement | null`, `statementQuote | null`, `rubricId | null`, `testBundleId | null`. Cột mới: `GradingResultEntity.problemId`, `GradingTestBundleEntity.problemId`, `GradingReferenceEntity.problemId`, `GradingReferenceEntity.rulerTrust` (`'teacher' | 'verified' | 'unverified' | null`).

- [ ] **Step 1: Viết test schema thất bại**

```ts
// test/multi-problem-p1a-schema.e2e-spec.ts
import { DataSource } from 'typeorm';
import { createTestApp } from './helpers/create-test-app'; // dùng đúng helper mà finish-attempt.e2e-spec.ts dùng; kiểm tên trước khi viết

describe('P1a — schema chỉ thêm (M1)', () => {
  let ds: DataSource;
  beforeAll(async () => { ({ ds } = await createTestApp()); });

  it('bảng exam_problem có đủ cột, khoá duy nhất theo (phiên, thứ tự) và FK tới phiên', async () => {
    const cols = await ds.query(
      `SELECT column_name, is_nullable FROM information_schema.columns
        WHERE table_schema='examcollect' AND table_name='exam_problem' ORDER BY column_name`,
    );
    const names = cols.map((c: { column_name: string }) => c.column_name);
    expect(names).toEqual(expect.arrayContaining([
      'id', 'exam_session_id', 'ordinal', 'title', 'points_hundredths', 'required_deliverable_id',
      'entry_name', 'language', 'statement', 'statement_quote', 'rubric_id', 'test_bundle_id',
    ]));
    const uq = await ds.query(
      `SELECT indexdef FROM pg_indexes WHERE schemaname='examcollect' AND tablename='exam_problem' AND indexdef ILIKE '%UNIQUE%'`,
    );
    expect(uq.some((r: { indexdef: string }) => /exam_session_id.*ordinal/.test(r.indexdef))).toBe(true);
  });

  it('cột problem_id có ở grading_result, grading_test_bundle, grading_reference và đều cho phép rỗng', async () => {
    for (const t of ['grading_result', 'grading_test_bundle', 'grading_reference']) {
      const [c] = await ds.query(
        `SELECT is_nullable FROM information_schema.columns WHERE table_schema='examcollect' AND table_name=$1 AND column_name='problem_id'`,
        [t],
      );
      expect(c?.is_nullable).toBe('YES');
    }
  });

  it('grading_reference có ruler_trust với ràng buộc ba giá trị, và unique (phiên, câu) mới', async () => {
    const [c] = await ds.query(
      `SELECT is_nullable FROM information_schema.columns WHERE table_schema='examcollect' AND table_name='grading_reference' AND column_name='ruler_trust'`,
    );
    expect(c?.is_nullable).toBe('YES');
    const idx = await ds.query(
      `SELECT indexdef FROM pg_indexes WHERE schemaname='examcollect' AND tablename='grading_reference' AND indexname='uq_grading_reference_session_problem'`,
    );
    expect(idx.length).toBe(1);
  });
});
```

Ghi chú: trước khi viết, mở `test/finish-attempt.e2e-spec.ts` và sao chép đúng cách khởi tạo app/DataSource mà file đó dùng (tên helper có thể khác `createTestApp`). Đừng đoán tên.

- [ ] **Step 2: Chạy, thấy đỏ**

Run: `npx jest --config ./test/jest-e2e.json test/multi-problem-p1a-schema.e2e-spec.ts`
Expected: FAIL — `exam_problem` không tồn tại.

- [ ] **Step 3: Viết migration M1**

```ts
// src/database/migrations/1789600000000-ExamProblemAdditive.ts
import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * P1a — M1: CHỈ THÊM. Bảng câu, cột problem_id và ruler_trust cho phép rỗng. Không đổi dòng nào.
 * Khoá unique cũ của grading_reference được GIỮ; unique (phiên, câu) mới được thêm bên cạnh (R-b).
 */
export class ExamProblemAdditive1789600000000 implements MigrationInterface {
  name = 'ExamProblemAdditive1789600000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE "examcollect"."exam_problem" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "exam_session_id" uuid NOT NULL,
        "ordinal" integer NOT NULL,
        "title" varchar(200) NOT NULL,
        "points_hundredths" integer NOT NULL,
        "required_deliverable_id" uuid,
        "entry_name" text,
        "language" varchar(20),
        "statement" text,
        "statement_quote" text,
        "rubric_id" uuid,
        "test_bundle_id" uuid,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_exam_problem" PRIMARY KEY ("id"),
        CONSTRAINT "ck_exam_problem_ordinal" CHECK ("ordinal" >= 1),
        CONSTRAINT "ck_exam_problem_points" CHECK ("points_hundredths" >= 0),
        CONSTRAINT "fk_exam_problem_session" FOREIGN KEY ("exam_session_id")
          REFERENCES "examcollect"."exam_session"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_exam_problem_deliverable" FOREIGN KEY ("required_deliverable_id")
          REFERENCES "examcollect"."required_deliverable"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_exam_problem_rubric" FOREIGN KEY ("rubric_id")
          REFERENCES "examcollect"."rubric"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_exam_problem_test_bundle" FOREIGN KEY ("test_bundle_id")
          REFERENCES "examcollect"."grading_test_bundle"("id") ON DELETE RESTRICT
      )`);
    await q.query(`CREATE UNIQUE INDEX "uq_exam_problem_session_ordinal" ON "examcollect"."exam_problem" ("exam_session_id", "ordinal")`);

    await q.query(`ALTER TABLE "examcollect"."grading_result" ADD COLUMN "problem_id" uuid`);
    await q.query(`ALTER TABLE "examcollect"."grading_result" ADD CONSTRAINT "fk_grading_result_problem"
      FOREIGN KEY ("problem_id") REFERENCES "examcollect"."exam_problem"("id") ON DELETE RESTRICT`);
    await q.query(`CREATE INDEX "idx_grading_result_problem" ON "examcollect"."grading_result" ("problem_id")`);

    await q.query(`ALTER TABLE "examcollect"."grading_test_bundle" ADD COLUMN "problem_id" uuid`);
    await q.query(`ALTER TABLE "examcollect"."grading_test_bundle" ADD CONSTRAINT "fk_grading_test_bundle_problem"
      FOREIGN KEY ("problem_id") REFERENCES "examcollect"."exam_problem"("id") ON DELETE RESTRICT`);

    await q.query(`ALTER TABLE "examcollect"."grading_reference" ADD COLUMN "problem_id" uuid`);
    await q.query(`ALTER TABLE "examcollect"."grading_reference" ADD CONSTRAINT "fk_grading_reference_problem"
      FOREIGN KEY ("problem_id") REFERENCES "examcollect"."exam_problem"("id") ON DELETE RESTRICT`);
    await q.query(`ALTER TABLE "examcollect"."grading_reference" ADD COLUMN "ruler_trust" varchar(12)`);
    await q.query(`ALTER TABLE "examcollect"."grading_reference" ADD CONSTRAINT "ck_grading_reference_ruler_trust"
      CHECK ("ruler_trust" IN ('teacher', 'verified', 'unverified'))`);
    await q.query(`CREATE UNIQUE INDEX "uq_grading_reference_session_problem"
      ON "examcollect"."grading_reference" ("exam_session_id", "problem_id")`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS "examcollect"."uq_grading_reference_session_problem"`);
    await q.query(`ALTER TABLE "examcollect"."grading_reference" DROP CONSTRAINT IF EXISTS "ck_grading_reference_ruler_trust"`);
    await q.query(`ALTER TABLE "examcollect"."grading_reference" DROP COLUMN IF EXISTS "ruler_trust"`);
    await q.query(`ALTER TABLE "examcollect"."grading_reference" DROP CONSTRAINT IF EXISTS "fk_grading_reference_problem"`);
    await q.query(`ALTER TABLE "examcollect"."grading_reference" DROP COLUMN IF EXISTS "problem_id"`);
    await q.query(`ALTER TABLE "examcollect"."grading_test_bundle" DROP CONSTRAINT IF EXISTS "fk_grading_test_bundle_problem"`);
    await q.query(`ALTER TABLE "examcollect"."grading_test_bundle" DROP COLUMN IF EXISTS "problem_id"`);
    await q.query(`DROP INDEX IF EXISTS "examcollect"."idx_grading_result_problem"`);
    await q.query(`ALTER TABLE "examcollect"."grading_result" DROP CONSTRAINT IF EXISTS "fk_grading_result_problem"`);
    await q.query(`ALTER TABLE "examcollect"."grading_result" DROP COLUMN IF EXISTS "problem_id"`);
    await q.query(`DROP TABLE IF EXISTS "examcollect"."exam_problem"`);
  }
}
```

Ghi chú: `down()` có `DROP` là đúng (chỉ chạy khi hoàn tác). `up()` không có `DROP`. Kiểm bằng `grep -n DROP` trong khoảng `async up` tới `async down` trước khi áp lên Supabase.

- [ ] **Step 4: Entity**

```ts
// src/exam-session/entities/exam-problem.entity.ts
import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { ExamSessionEntity } from './exam-session.entity';

@Entity({ name: 'exam_problem' })
@Index('uq_exam_problem_session_ordinal', ['examSessionId', 'ordinal'], { unique: true })
export class ExamProblemEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'exam_session_id', type: 'uuid' })
  examSessionId!: string;

  @ManyToOne(() => ExamSessionEntity, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'exam_session_id' })
  session?: ExamSessionEntity;

  @Column({ type: 'int' })
  ordinal!: number;

  @Column({ type: 'varchar', length: 200 })
  title!: string;

  @Column({ name: 'points_hundredths', type: 'int' })
  pointsHundredths!: number;

  @Column({ name: 'required_deliverable_id', type: 'uuid', nullable: true })
  requiredDeliverableId!: string | null;

  @Column({ name: 'entry_name', type: 'text', nullable: true })
  entryName!: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  language!: string | null;

  @Column({ type: 'text', nullable: true })
  statement!: string | null;

  @Column({ name: 'statement_quote', type: 'text', nullable: true })
  statementQuote!: string | null;

  @Column({ name: 'rubric_id', type: 'uuid', nullable: true })
  rubricId!: string | null;

  @Column({ name: 'test_bundle_id', type: 'uuid', nullable: true })
  testBundleId!: string | null;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt!: Date;

  @Column({ name: 'updated_at', type: 'timestamptz', default: () => 'now()' })
  updatedAt!: Date;
}
```

Thêm vào các entity hiện có (không đổi cột khác):
- `GradingResultEntity`: `@Column({ name: 'problem_id', type: 'uuid', nullable: true }) problemId!: string | null;`
- `GradingTestBundleEntity`: cùng kiểu cho `problemId`.
- `GradingReferenceEntity`: `problemId!: string | null;` và `@Column({ name: 'ruler_trust', type: 'varchar', length: 12, nullable: true }) rulerTrust!: 'teacher' | 'verified' | 'unverified' | null;`

Đăng ký `ExamProblemEntity` trong mảng `entities` của `src/database/data-source.ts` (khoảng dòng 102) và trong mọi nơi test khai danh sách entity riêng (tìm bằng `grep -rn "GradingReferenceEntity," test src --include=*.ts`).

- [ ] **Step 5: Chạy test, thấy xanh**

Run: `pnpm migration:run:e2e` rồi `npx jest --config ./test/jest-e2e.json test/multi-problem-p1a-schema.e2e-spec.ts`
Expected: PASS (3 test).

- [ ] **Step 6: Commit**

```bash
git add src/database/migrations/1789600000000-ExamProblemAdditive.ts src/exam-session/entities/exam-problem.entity.ts src/grading/entities src/database/data-source.ts test/multi-problem-p1a-schema.e2e-spec.ts
git commit -m "feat(p1a): M1 chỉ thêm — bảng exam_problem, problem_id và ruler_trust cho phép rỗng"
```

---

### Task 2: Backfill câu mặc định (M2) với cổng checksum

**Files:**
- Create: `src/grading/problem/default-problem-backfill.ts`, `src/database/migrations/1789610000000-ExamProblemBackfill.ts`, `test/multi-problem-p1a-backfill.e2e-spec.ts`

**Interfaces:**
- Consumes: M1 (Task 1).
- Produces: `backfillDefaultProblems(q: QueryRunner): Promise<{ problems: number; results: number; bundles: number; references: number }>` — idempotent (chạy lại chỉ điền dòng còn `problem_id IS NULL`); `class ChecksumMismatchError extends Error`.

- [ ] **Step 1: Viết test thất bại**

```ts
// test/multi-problem-p1a-backfill.e2e-spec.ts
// Seed: một phiên có rubric (hai tiêu chí, 6 và 4 điểm), một yêu cầu nộp (language 'cpp'),
// một gói test đã duyệt, một bài nộp đã chấm có ai_total_score = 7.00 và hai dòng score_computation,
// một grading_reference có model_answer_unverified = true; và một phiên không có gì (chỉ exam_session).
// Dùng đúng helper seed của test/helpers/grading-seed.ts (seedSession, seedResult, seedCriterion, scoreResult).
describe('P1a — backfill câu mặc định (M2)', () => {
  it('mỗi phiên có đúng một câu ordinal = 1, điểm = tổng tiêu chí × 100, rubric và gói test lấy từ phiên', async () => {
    // expect: exam_problem có 1 dòng/phiên; points_hundredths = 1000 cho phiên có rubric 6+4; 0 cho phiên không có rubric
  });
  it('điền problem_id cho grading_result, grading_test_bundle, grading_reference', async () => {
    // expect: không còn dòng nào có problem_id IS NULL sau backfill
  });
  it('ruler_trust: model_answer_unverified = true → unverified; còn lại → teacher', async () => {
    // expect: reference đã seed có ruler_trust = 'unverified'; reference khác = 'teacher'
  });
  it('checksum: ai_total_score, status, số dòng score_computation và updated_at của kết quả KHÔNG đổi', async () => {
    // lấy snapshot trước, chạy backfillDefaultProblems, so sánh từng bài: bằng nhau
  });
  it('chạy lại lần hai không đổi gì (idempotent)', async () => {
    // expect: số dòng exam_problem không tăng; kết quả lần hai có problems=0, results=0
  });
  it('cổng checksum: nếu một giá trị đổi giữa trước và sau thì ném ChecksumMismatchError và rollback', async () => {
    // giả lập: sau khi backfill, UPDATE một ai_total_score bằng SQL trong cùng transaction trước khi kiểm tra
    // → expect rejects ChecksumMismatchError; không có exam_problem nào được commit
  });
  it('trigger trg_grading_result_updated_at được bật lại sau backfill (kể cả khi lỗi)', async () => {
    // expect: pg_trigger.tgenabled cho trg_grading_result_updated_at = 'O'
  });
});
```

Viết đầy đủ thân các test trước khi chạy (thay các comment bằng `expect` thật, dùng helper seed đã có). Đây là test nhìn thấy đỏ: hàm `backfillDefaultProblems` chưa tồn tại.

- [ ] **Step 2: Chạy, thấy đỏ**

Run: `npx jest --config ./test/jest-e2e.json test/multi-problem-p1a-backfill.e2e-spec.ts`
Expected: FAIL — `Cannot find module '../src/grading/problem/default-problem-backfill'`.

- [ ] **Step 3: Viết hàm backfill**

```ts
// src/grading/problem/default-problem-backfill.ts
import { QueryRunner } from 'typeorm';

export class ChecksumMismatchError extends Error {
  constructor(readonly before: string, readonly after: string) {
    super(`backfill câu mặc định dừng: số liệu chấm đổi (trước ${before} · sau ${after})`);
    this.name = 'ChecksumMismatchError';
  }
}

export interface BackfillCounts { problems: number; results: number; bundles: number; references: number }

/** Số liệu chấm phải nguyên vẹn qua backfill. Không đọc được → ném, không bỏ qua. */
async function checksum(q: QueryRunner): Promise<string> {
  const [row] = await q.query(`
    SELECT
      (SELECT coalesce(sum(ai_total_score), 0)::text FROM examcollect.grading_result) AS ai_sum,
      (SELECT count(*)::text FROM examcollect.grading_result WHERE status IS NOT NULL) AS status_n,
      (SELECT count(*)::text FROM examcollect.score_computation) AS sc_n,
      (SELECT coalesce(max(updated_at)::text, '') FROM examcollect.grading_result) AS upd_max`);
  return JSON.stringify(row);
}

/**
 * Tạo câu mặc định cho mọi phiên chưa có, rồi điền problem_id và ruler_trust. Chạy trong transaction của
 * người gọi (migration chạy với -t all). Tắt trigger updated_at của grading_result trong lúc điền để
 * checksum không bị lệch do dấu thời gian (theo tiền lệ migration 1789430000000).
 */
export async function backfillDefaultProblems(q: QueryRunner): Promise<BackfillCounts> {
  const before = await checksum(q);
  await q.query(`ALTER TABLE examcollect.grading_result DISABLE TRIGGER trg_grading_result_updated_at`);
  try {
    const problems = await q.query(`
      INSERT INTO examcollect.exam_problem
        (exam_session_id, ordinal, title, points_hundredths, required_deliverable_id, language, rubric_id, test_bundle_id)
      SELECT es.id, 1, 'Câu 1',
             coalesce((SELECT round(sum(rc.max_points) * 100)::int FROM examcollect.rubric_criterion rc WHERE rc.rubric_id = es.rubric_id), 0),
             (SELECT rd.id FROM examcollect.required_deliverable rd WHERE rd.exam_session_id = es.id ORDER BY rd.id LIMIT 1),
             (SELECT rd.language::text FROM examcollect.required_deliverable rd WHERE rd.exam_session_id = es.id ORDER BY rd.id LIMIT 1),
             es.rubric_id, es.test_bundle_id
        FROM examcollect.exam_session es
       WHERE NOT EXISTS (SELECT 1 FROM examcollect.exam_problem p WHERE p.exam_session_id = es.id AND p.ordinal = 1)
      RETURNING id`);
    const results = await q.query(`
      UPDATE examcollect.grading_result g SET problem_id = p.id
        FROM examcollect.submission s, examcollect.exam_problem p
       WHERE g.problem_id IS NULL AND s.id = g.submission_id
         AND p.exam_session_id = s.exam_session_id AND p.ordinal = 1
      RETURNING g.id`);
    const bundles = await q.query(`
      UPDATE examcollect.grading_test_bundle b SET problem_id = p.id
        FROM examcollect.exam_problem p
       WHERE b.problem_id IS NULL AND p.exam_session_id = b.exam_session_id AND p.ordinal = 1
      RETURNING b.id`);
    const references = await q.query(`
      UPDATE examcollect.grading_reference r SET problem_id = p.id,
             ruler_trust = CASE WHEN r.model_answer_unverified THEN 'unverified' ELSE 'teacher' END
        FROM examcollect.exam_problem p
       WHERE r.problem_id IS NULL AND p.exam_session_id = r.exam_session_id AND p.ordinal = 1
      RETURNING r.id`);
    const after = await checksum(q);
    if (after !== before) throw new ChecksumMismatchError(before, after);
    return { problems: problems.length, results: results.length, bundles: bundles.length, references: references.length };
  } finally {
    await q.query(`ALTER TABLE examcollect.grading_result ENABLE TRIGGER trg_grading_result_updated_at`);
  }
}
```

Lưu ý khi chạy: (a) `rubric_criterion.max_points` là `numeric(6,2)`, phép `round(sum(...)*100)::int` cho số nguyên phần trăm điểm; (b) kiểu cột `required_deliverable.language` là enum `sandbox_language`, ép sang text ở đây; nếu `language` của `exam_problem` là `varchar(20)` thì ép đúng; (c) trước khi viết, chạy `\d examcollect.grading_result` để xác nhận tên trigger `trg_grading_result_updated_at` tồn tại. Nếu tên khác thì sửa đúng tên đó trong hàm và trong test.

- [ ] **Step 4: Migration M2 gọi hàm**

```ts
// src/database/migrations/1789610000000-ExamProblemBackfill.ts
import { MigrationInterface, QueryRunner } from 'typeorm';
import { backfillDefaultProblems } from '../../grading/problem/default-problem-backfill';

/**
 * P1a — M2: backfill câu mặc định. Chạy trong transaction `-t all`. Nếu checksum lệch thì ném và
 * toàn bộ transaction rollback — DB không đổi.
 */
export class ExamProblemBackfill1789610000000 implements MigrationInterface {
  name = 'ExamProblemBackfill1789610000000';

  public async up(q: QueryRunner): Promise<void> {
    await backfillDefaultProblems(q);
  }

  public async down(q: QueryRunner): Promise<void> {
    // Hoàn tác backfill: gỡ liên kết rồi xoá câu mặc định do M2 tạo. Không đụng dữ liệu chấm.
    await q.query(`UPDATE examcollect.grading_reference SET problem_id = NULL, ruler_trust = NULL`);
    await q.query(`UPDATE examcollect.grading_test_bundle SET problem_id = NULL`);
    await q.query(`ALTER TABLE examcollect.grading_result DISABLE TRIGGER trg_grading_result_updated_at`);
    await q.query(`UPDATE examcollect.grading_result SET problem_id = NULL`);
    await q.query(`ALTER TABLE examcollect.grading_result ENABLE TRIGGER trg_grading_result_updated_at`);
    await q.query(`DELETE FROM examcollect.exam_problem`);
  }
}
```

Thêm trigger bất biến `problem_id` vào M2 (một lệnh `CREATE TRIGGER` trong `up()` sau backfill, đặt trong cùng file): cho phép NULL → giá trị, cấm đổi giá trị đã có (§3.2):
```sql
CREATE OR REPLACE FUNCTION examcollect.guard_problem_id_immutable() RETURNS trigger LANGUAGE plpgsql
SET search_path = examcollect, public AS $$
BEGIN
  IF OLD.problem_id IS NOT NULL AND NEW.problem_id IS DISTINCT FROM OLD.problem_id THEN
    RAISE EXCEPTION 'problem_id của % không được đổi sau khi tạo', TG_TABLE_NAME USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_grading_result_problem_immutable BEFORE UPDATE ON examcollect.grading_result
  FOR EACH ROW EXECUTE FUNCTION examcollect.guard_problem_id_immutable();
```
Tạo tương tự cho `grading_test_bundle` (`trg_grading_test_bundle_problem_immutable`) và `grading_reference`. Bổ sung `DROP TRIGGER IF EXISTS` và `DROP FUNCTION IF EXISTS` trong `down()` (đặt trước các lệnh `UPDATE ... SET problem_id = NULL` ở `down()` — nếu không, trigger chặn việc gỡ liên kết). Thứ tự trong `down()`: tắt trigger immutable → gỡ liên kết → xoá câu.

- [ ] **Step 5: Chạy test, thấy xanh**

Run: `pnpm migration:run:e2e` (đã có M2 nếu test dùng DB đã migrate; nếu không, chạy lại từ đầu bằng `pnpm migration:run:e2e`). Sau đó `npx jest --config ./test/jest-e2e.json test/multi-problem-p1a-backfill.e2e-spec.ts`
Expected: PASS (7 test).

- [ ] **Step 6: Commit**

```bash
git add src/grading/problem/default-problem-backfill.ts src/database/migrations/1789610000000-ExamProblemBackfill.ts test/multi-problem-p1a-backfill.e2e-spec.ts
git commit -m "feat(p1a): M2 backfill câu mặc định với cổng checksum và bất biến problem_id"
```

---

### Task 3: `resolveProblemConfig()`, câu mặc định khi tạo phiên, và ghi kép

**Files:**
- Create: `src/grading/problem/resolve-problem-config.ts`, `test/multi-problem-p1a-resolver.e2e-spec.ts`
- Modify: `src/exam-session/exam-session.service.ts:161-162, 222, 297-312, 852-854`; mọi nơi ghi `exam_session.test_bundle_id` (tìm bằng `grep -rn "test_bundle_id\|testBundleId:" src --include=*.ts | grep -v spec`)

**Interfaces:**
- Consumes: `ExamProblemEntity`, bảng `exam_session`.
- Produces:
```ts
export interface ProblemConfig {
  problemId: string;
  ordinal: number;
  teacherId: string;
  rubricId: string | null;
  testBundleId: string | null;
  pointsHundredths: number;
  requiredDeliverableId: string | null;
  language: string | null;
}
/** Câu mặc định (ordinal = 1) của phiên. Không có → null. Không ném vì thiếu cấu hình. */
export async function resolveProblemConfig(m: EntityManager, sessionId: string): Promise<ProblemConfig | null>;
/** Đảm bảo phiên có câu mặc định; trả id. Gọi trong cùng transaction với việc tạo phiên. */
export async function ensureDefaultProblem(m: EntityManager, sessionId: string): Promise<string>;
/** Ghi kép: đặt rubric/gói test lên phiên (bí danh) VÀ lên câu mặc định trong cùng transaction. */
export async function setSessionRubricAndProblem(m: EntityManager, sessionId: string, rubricId: string | null): Promise<void>;
export async function setSessionTestBundleAndProblem(m: EntityManager, sessionId: string, bundleId: string | null): Promise<void>;
```

- [ ] **Step 1: Test thất bại** (`test/multi-problem-p1a-resolver.e2e-spec.ts`)

Các ca bắt buộc:
- `resolveProblemConfig` trả đúng `rubricId`, `testBundleId`, `teacherId` của phiên có cấu hình.
- Phiên không có rubric, không có gói test, không có yêu cầu nộp → trả config với các trường đó là `null`/`0`, không ném.
- Phiên không tồn tại → trả `null`.
- `ensureDefaultProblem` trên phiên chưa có câu → tạo đúng một dòng `ordinal = 1`; gọi lần hai không tạo thêm (idempotent).
- Ghi kép: `setSessionRubricAndProblem(m, s, r)` → cả `exam_session.rubric_id` và `exam_problem.rubric_id` của câu 1 đều bằng `r` (kiểm bằng hai câu SELECT).
- Ghi kép gói test tương tự với `setSessionTestBundleAndProblem`.

- [ ] **Step 2: Chạy, thấy đỏ** — `Cannot find module '../src/grading/problem/resolve-problem-config'`.

- [ ] **Step 3: Cài đặt**

```ts
// src/grading/problem/resolve-problem-config.ts
import { EntityManager } from 'typeorm';

export interface ProblemConfig {
  problemId: string;
  ordinal: number;
  teacherId: string;
  rubricId: string | null;
  testBundleId: string | null;
  pointsHundredths: number;
  requiredDeliverableId: string | null;
  language: string | null;
}

export async function resolveProblemConfig(m: EntityManager, sessionId: string): Promise<ProblemConfig | null> {
  const [row] = await m.query(
    `SELECT p.id, p.ordinal, es.teacher_id, p.rubric_id, p.test_bundle_id, p.points_hundredths,
            p.required_deliverable_id, p.language
       FROM examcollect.exam_session es
       JOIN examcollect.exam_problem p ON p.exam_session_id = es.id AND p.ordinal = 1
      WHERE es.id = $1`,
    [sessionId],
  );
  if (!row) return null;
  return {
    problemId: row.id,
    ordinal: row.ordinal,
    teacherId: row.teacher_id,
    rubricId: row.rubric_id,
    testBundleId: row.test_bundle_id,
    pointsHundredths: row.points_hundredths,
    requiredDeliverableId: row.required_deliverable_id,
    language: row.language,
  };
}

export async function ensureDefaultProblem(m: EntityManager, sessionId: string): Promise<string> {
  const [existing] = await m.query(
    `SELECT id FROM examcollect.exam_problem WHERE exam_session_id = $1 AND ordinal = 1`,
    [sessionId],
  );
  if (existing) return existing.id as string;
  const [created] = await m.query(
    `INSERT INTO examcollect.exam_problem (exam_session_id, ordinal, title, points_hundredths)
     VALUES ($1, 1, 'Câu 1', 0) RETURNING id`,
    [sessionId],
  );
  return created.id as string;
}

export async function setSessionRubricAndProblem(m: EntityManager, sessionId: string, rubricId: string | null): Promise<void> {
  await m.query(`UPDATE examcollect.exam_session SET rubric_id = $2 WHERE id = $1`, [sessionId, rubricId]);
  const problemId = await ensureDefaultProblem(m, sessionId);
  await m.query(`UPDATE examcollect.exam_problem SET rubric_id = $2 WHERE id = $1`, [problemId, rubricId]);
}

export async function setSessionTestBundleAndProblem(m: EntityManager, sessionId: string, bundleId: string | null): Promise<void> {
  await m.query(`UPDATE examcollect.exam_session SET test_bundle_id = $2 WHERE id = $1`, [sessionId, bundleId]);
  const problemId = await ensureDefaultProblem(m, sessionId);
  await m.query(`UPDATE examcollect.exam_problem SET test_bundle_id = $2 WHERE id = $1`, [problemId, bundleId]);
}
```

Ghi chú: `points_hundredths` của câu mặc định tạo khi tạo phiên là 0 và được điền khi gắn rubric (`setSessionRubricAndProblem` nên cập nhật thêm `points_hundredths = round(sum(max_points)*100)` của rubric). Thêm dòng đó vào `setSessionRubricAndProblem` và kiểm bằng test.

Tạo câu mặc định khi tạo phiên: trong `exam-session.service.ts` (quanh dòng 222, bên trong transaction tạo phiên) gọi `ensureDefaultProblem(m, session.id)` ngay sau khi phiên được ghi. Thêm test: tạo phiên mới → `exam_problem` có đúng một dòng ordinal 1.

Thay mọi chỗ ghi cột bí danh bằng hàm ghi kép: tìm các `sessions.update(… rubricId …)` và `UPDATE examcollect.exam_session SET test_bundle_id` (dòng 306 của `setRubric` là một ví dụ). Mỗi chỗ thay bằng `setSessionRubricAndProblem` hoặc `setSessionTestBundleAndProblem` trong cùng transaction.

- [ ] **Step 4: Chạy test, thấy xanh** — `npx jest --config ./test/jest-e2e.json test/multi-problem-p1a-resolver.e2e-spec.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/grading/problem/resolve-problem-config.ts src/exam-session/exam-session.service.ts test/multi-problem-p1a-resolver.e2e-spec.ts
git commit -m "feat(p1a): resolveProblemConfig và ghi kép bí danh-câu mặc định"
```

---

### Task 4: Chuyển mọi chỗ đọc cấu hình sang resolver

**Files:** (mỗi chỗ là một thay đổi nhỏ; test hiện có phải vẫn xanh)
- Modify: `src/grading/pipeline/investigation-context.service.ts:37, 53`
- Modify: `src/grading/scoring/score-inputs.ts:214`
- Modify: `src/grading/rules/rubric-overview.service.ts:76`
- Modify: `src/grading/grading-run.service.ts:133-138, 212`
- Modify: `src/grading/test-bundle/test-bundle.service.ts:54`
- Modify: `src/grading/grading-reference.service.ts:269` (`loadForGrading` đọc tham chiếu của câu mặc định), `src/grading/grading.service.ts:433`

**Interfaces:**
- Consumes: `resolveProblemConfig`, `ProblemConfig` (Task 3).
- Produces: không có API mới; hành vi giữ nguyên.

- [ ] **Step 1: Test hồi quy trước khi sửa** — chạy các test hiện có liên quan rồi ghi kết quả:
Run: `npx jest --config ./test/jest-e2e.json test/grading.e2e-spec.ts test/grading-reference.e2e-spec.ts test/investigator-end-to-end.e2e-spec.ts 2>&1 | grep -E "^Tests:"`
Expected: xanh. Ghi số vào báo cáo Task 0.

- [ ] **Step 2: Sửa từng chỗ, mỗi chỗ một commit nhỏ**

Mẫu thay thế cho một câu SQL:
```ts
// TRƯỚC (investigation-context.service.ts:37)
//   SELECT ..., es.teacher_id, es.test_bundle_id, ... FROM ... JOIN exam_session es ...
// SAU
const cfg = await resolveProblemConfig(m, row.exam_session_id);
const testBundleId = cfg?.testBundleId ?? null;
```
Với câu SQL nhiều cột (ví dụ `score-inputs.ts:214`), tách `es.test_bundle_id` ra khỏi câu SQL và lấy từ `resolveProblemConfig`. Đừng để lại tham chiếu tới `es.test_bundle_id` hoặc `es.rubric_id` trong SQL ngoài file resolver.

`loadForGrading(examSessionId)` (grading-reference.service.ts:269): thay `findOne({ where: { examSessionId } })` bằng `findOne({ where: { examSessionId, problemId: cfg.problemId } })` với `cfg = await resolveProblemConfig(...)`; nếu `cfg` là null hoặc không có tham chiếu cho câu đó, trả `{ loadedLevel: 'rubric_only' }` như hiện tại.

- [ ] **Step 3: Chạy lại test hồi quy** — cùng lệnh ở Step 1, Expected: cùng số test xanh như trước.

- [ ] **Step 4: Commit** — mỗi file một commit: `refactor(p1a): <file> đọc cấu hình chấm qua resolveProblemConfig`.

---

### Task 5: Bẫy 1 — `gradeOneById` theo `resultId`

**Files:**
- Modify: `src/grading/grading.queue.ts:8` (thêm `resultId: string` vào `GradeSubmissionJob`), `src/grading/grading-run.service.ts:395`, `src/grading/regrade.service.ts:214` (truyền `resultId` khi enqueue), `src/grading/grading.service.ts:296-298`
- Test: `test/multi-problem-p1a-traps.e2e-spec.ts` (phần bẫy 1)

**Interfaces:**
- Consumes: `GradeSubmissionJob` hiện có.
- Produces: `GradeSubmissionJob.resultId: string` (bắt buộc từ P1a); `gradeOneById` tìm kết quả theo `job.resultId`.

- [ ] **Step 1: Test thất bại** — kiểm rằng job enqueue từ `grading-run.service` mang `resultId` khớp `grading_result.id`, và `gradeOneById` không dùng `submissionId` để tìm kết quả. Vì unique(submission_id) còn ở P1a, test dùng job giả với `resultId` của kết quả đúng và kiểm rằng `findOne` được gọi với `{ where: { id: job.resultId } }` (dùng spy trên repository).

- [ ] **Step 2: Chạy, thấy đỏ.**

- [ ] **Step 3: Sửa**
```ts
// grading.queue.ts — thêm vào interface
/** Kết quả chấm của câu (P1a). Bài nộp có thể còn nhiều kết quả khi P2 bỏ unique(submission_id). */
resultId: string;

// grading.service.ts:296-298 — TRƯỚC: where: { submissionId: job.submissionId }
const result = await this.results.findOne({ where: { id: job.resultId } });
```
Các chỗ enqueue (`grading-run.service.ts:395`, `regrade.service.ts:214`) truyền `resultId: result.id` (lấy từ bản ghi kết quả đã có trong phạm vi hàm).

- [ ] **Step 4: Chạy test, thấy xanh**; chạy thêm `npx jest --config ./test/jest-e2e.json test/grading-queue.e2e-spec.ts` để kiểm hàng đợi.

- [ ] **Step 5: Commit** — `fix(p1a): gradeOneById tìm kết quả theo resultId (bẫy 1 §9)`.

---

### Task 6: Bẫy 2 — luật lời theo từng câu

**Files:**
- Modify: `src/grading/scoring/score-inputs.ts:102-150` (`loadSessionModelRules`, `sessionModelRulesWith`), `src/grading/scoring/score.service.ts:155-156, 297-298, 535`
- Test: `test/multi-problem-p1a-traps.e2e-spec.ts` (phần bẫy 2)

**Interfaces:**
- Consumes: `grading_result.problem_id` (Task 1–2).
- Produces:
```ts
export async function loadSessionModelRules(m: EntityManager, sessionId: string, problemId: string, exceptResultId?: string | null): Promise<Set<string>>;
export async function sessionModelRulesWith(m: EntityManager, sessionId: string, problemId: string, resultId: string, ruleTable: StoredInvestigation['ruleTable']): Promise<Set<string>>;
```
Tham số `problemId` là bắt buộc (không còn chế độ toàn phiên).

- [ ] **Step 1: Test thất bại** — seed một phiên có hai câu (hai `exam_problem`, mỗi câu một rubric khác nhau), mỗi câu một bài nộp đã chấm với `ruleTable` có một luật lời khác nhau. Kỳ vọng: `loadSessionModelRules(m, s, problemA)` chỉ trả luật lời của câu A, không giao với câu B (hiện tại giao → rỗng).

- [ ] **Step 2: Chạy, thấy đỏ.**

- [ ] **Step 3: Sửa** — thêm điều kiện `AND g.problem_id = $3` vào CTE `att` trong `loadSessionModelRules` (và `$3` là `problemId`); cập nhật đếm trong `sessionModelRulesWith` cùng điều kiện. Cập nhật mọi nơi gọi (`score.service.ts:156, 297-298, 535`) để truyền câu của kết quả (`cfg.problemId` hoặc `g.problem_id`).

- [ ] **Step 4: Chạy test, thấy xanh**; chạy thêm `test/grading-results-current-score.e2e-spec.ts` và `test/grading-lifecycle.e2e-spec.ts`.

- [ ] **Step 5: Commit** — `fix(p1a): luật lời của bài tính theo từng câu, không giao toàn phiên (bẫy 2 §9)`.

---

### Task 7: Bẫy 3 — gộp kết quả theo sinh viên không ghi đè

**Files:**
- Create: `src/grading/problem/fold-student-results.ts`, `src/grading/problem/fold-student-results.spec.ts`
- Modify: `src/grade-export/grade-export.data.ts:96-112`
- Test: `test/multi-problem-p1a-traps.e2e-spec.ts` (phần bẫy 3)

**Interfaces:**
- Produces:
```ts
export interface StudentRow { mssv: string; name: string; outcome: { kind: 'blank'; reason: string } | { kind: 'conflict'; reason: string } | unknown }
/** Gộp danh sách lớp và các kết quả. Một sinh viên có nhiều kết quả → outcome 'conflict' (R-a), không chọn một. */
export function foldStudentResults(roster: { mssv: string; name: string }[], results: { mssv: string; status: string; outcomeOf: unknown }[]): StudentRow[];
```
(Hình dạng `outcome` lấy đúng từ `outcomeOf(r)` đang dùng trong `grade-export.data.ts`; kiểm tên trước khi viết.)

- [ ] **Step 1: Test thuần thất bại** (`src/grading/problem/fold-student-results.spec.ts`):

```ts
import { foldStudentResults } from './fold-student-results';

const roster = [{ mssv: 'HS001', name: 'An' }, { mssv: 'HS002', name: 'Bình' }];
const ok = (mssv: string, status = 'graded') => ({ mssv, status, outcomeOf: { kind: 'graded', score: '7.00' } });

describe('foldStudentResults()', () => {
  it('sinh viên không có kết quả → blank/absent như trước', () => {
    const out = foldStudentResults(roster, []);
    expect(out.find((s) => s.mssv === 'HS001')!.outcome).toEqual({ kind: 'blank', reason: 'absent' });
  });

  it('một kết quả → outcome của chính kết quả đó', () => {
    const out = foldStudentResults(roster, [ok('HS001')]);
    expect(out.find((s) => s.mssv === 'HS001')!.outcome).toEqual({ kind: 'graded', score: '7.00' });
  });

  it('hai kết quả cùng sinh viên → conflict, KHÔNG lấy kết quả cuối (bẫy 3)', () => {
    const out = foldStudentResults(roster, [ok('HS001'), ok('HS001')]);
    const hs1 = out.find((s) => s.mssv === 'HS001')!;
    expect(hs1.outcome.kind).toBe('conflict');
    expect(hs1.outcome.reason).toMatch(/nhiều kết quả/);
  });

  it('MSSV khác hoa thường gộp về một sinh viên', () => {
    const out = foldStudentResults(roster, [ok('hs001'), ok('HS001')]);
    expect(out.filter((s) => s.mssv === 'HS001')).toHaveLength(1);
    expect(out.find((s) => s.mssv === 'HS001')!.outcome.kind).toBe('conflict');
  });
});
```

Hình dạng `outcomeOf` trong ví dụ là giả định; trước khi viết code, mở `grade-export.data.ts` và đúng hình dạng mà `outcomeOf(r)` trả về, rồi sửa ví dụ cho khớp.

- [ ] **Step 2: Chạy, thấy đỏ** — `npx jest -c ../../.superpowers/jest.unit.config.js src/grading/problem/fold-student-results.spec.ts`.

- [ ] **Step 3: Cài đặt** — trích vòng lặp `map.set` (dòng 104-110) thành `foldStudentResults`; trong `grade-export.data.ts` thay vòng lặp bằng lời gọi hàm. Giữ nguyên đếm `publishedResults`.

- [ ] **Step 4: Chạy unit test thấy xanh; chạy `test/grade-export-data.e2e-spec.ts` và `test/grade-export.e2e-spec.ts` để chắc không hồi quy.**

- [ ] **Step 5: Commit** — `fix(p1a): gộp sổ điểm theo sinh viên không ghi đè, báo xung đột (bẫy 3 §9)`.

---

### Task 8: `planReapply` theo rubric của chính kết quả

**Files:**
- Modify: `src/grading/scoring/score.service.ts:434-462` (đọc `JOIN examcollect.rubric rb ON rb.id = es.rubric_id`)
- Test: `test/multi-problem-p1a-traps.e2e-spec.ts` (phần planReapply)

**Interfaces:**
- Consumes: `grading_result.rubric_id_version` (đã có).
- Produces: `planReapply` lấy tên rubric và luật theo `g.rubric_id_version` của từng kết quả.

- [ ] **Step 1: Test thất bại** — phiên có hai kết quả với hai `rubric_id_version` khác nhau (hai rubric khác tên); đổi giá một luật của rubric B; kỳ vọng chỉ kết quả của B được tính lại, kết quả của A không đổi. Hiện tại `es.rubric_id` áp cùng một rubric cho cả hai.

- [ ] **Step 2: Chạy, thấy đỏ.**

- [ ] **Step 3: Sửa** — thay `JOIN examcollect.rubric rb ON rb.id = es.rubric_id` bằng `JOIN examcollect.rubric rb ON rb.id = g.rubric_id_version` trong câu SQL (đã có `g` là kết quả trong ngữ cảnh đó; nếu câu SQL chưa join `grading_result g`, thêm join và đưa `g.id` vào điều kiện lọc).

- [ ] **Step 4: Chạy test thấy xanh; chạy `test/criterion-waiver.e2e-spec.ts`, `test/grading-summary.e2e-spec.ts`.**

- [ ] **Step 5: Commit** — `fix(p1a): planReapply tính giá theo rubric của kết quả, không theo phiên`.

---

### Task 9: Cổng schema trên `/health`

**Files:**
- Modify: `src/health/health.controller.ts`, `src/health/health.module.ts`
- Test: `test/health.e2e-spec.ts`

**Interfaces:**
- Consumes: `DataSource.showMigrations()` (TypeORM trả `true` khi còn migration chưa áp).
- Produces: `GET /health` → `200 {status:'ok'}` khi không có migration chờ; `503 {status:'error', reason:'migration_pending'}` khi còn chờ; `503 {status:'error', reason:'db_unreachable'}` khi không đọc được trạng thái migration.

- [ ] **Step 1: Test thất bại** — thêm vào `test/health.e2e-spec.ts`: (a) DB bình thường → 200; (b) spy `showMigrations` trả `true` → 503 với `reason: 'migration_pending'`; (c) spy ném lỗi → 503 với `reason: 'db_unreachable'`, tiến trình không thoát.

- [ ] **Step 2: Chạy, thấy đỏ.**

- [ ] **Step 3: Cài đặt**
```ts
// src/health/health.controller.ts
import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Controller('health')
export class HealthController {
  constructor(private readonly ds: DataSource) {}

  @Get()
  async check(): Promise<{ status: 'ok' }> {
    let pending: boolean;
    try {
      pending = await this.ds.showMigrations();
    } catch {
      throw new ServiceUnavailableException({ status: 'error', reason: 'db_unreachable' });
    }
    if (pending) throw new ServiceUnavailableException({ status: 'error', reason: 'migration_pending' });
    return { status: 'ok' };
  }
}
```
Không đưa thông điệp lỗi gốc của DB ra response (có thể lộ chuỗi kết nối).

- [ ] **Step 4: Chạy test thấy xanh.** Kiểm `railway.toml` có `healthcheckPath = "/health"`; nếu không, ghi nhận và không tự thêm (cần chủ đồ án xác nhận cách Railway dùng healthcheck, §10.1).

- [ ] **Step 5: Commit** — `feat(p1a): /health báo lỗi khi còn migration chưa áp (cổng schema §10.1)`.

---

### Task 10: Quét import — cấm đọc cột bí danh ngoài resolver

**Files:**
- Create: `src/grading/problem/alias-read.import-scan.spec.ts`

**Interfaces:**
- Produces: test quét mã nguồn (không phải import) — thất bại nếu file nào ngoài `resolve-problem-config.ts`, migrations, và file entity đọc `exam_session.rubric_id` hoặc `exam_session.test_bundle_id` trong SQL.

- [ ] **Step 1: Viết test**
```ts
// src/grading/problem/alias-read.import-scan.spec.ts
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * §10.1: từ P1 một file ngoài resolveProblemConfig() không được ĐỌC hai cột bí danh của phiên.
 * Quét chuỗi SQL: `es.rubric_id`, `es.test_bundle_id`, `exam_session.rubric_id`, `exam_session.test_bundle_id`.
 * Ghi (UPDATE) được phép ở exam-session.service.ts (ghi kép, Task 3).
 */
const ROOT = join(__dirname, '..', '..'); // apps/api/src
const READ = /\b(es|exam_session)\.(rubric_id|test_bundle_id)\b/;
const ALLOWED = new Set([
  'grading/problem/resolve-problem-config.ts',
  'exam-session/exam-session.service.ts', // ghi kép và tạo phiên
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (name !== 'migrations') walk(p, out); }
    else if (name.endsWith('.ts') && !name.endsWith('.spec.ts')) out.push(p);
  }
  return out;
}

describe('P1a — không đọc cột bí danh ngoài resolver', () => {
  it('không file nào ngoài danh sách cho phép đọc es.rubric_id / es.test_bundle_id', () => {
    const offenders: string[] = [];
    for (const file of walk(ROOT)) {
      const rel = file.slice(ROOT.length + 1).replace(/\\/g, '/');
      if (ALLOWED.has(rel)) continue;
      if (READ.test(readFileSync(file, 'utf8'))) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });
});
```

- [ ] **Step 2: Chạy** — `npx jest -c ../../.superpowers/jest.unit.config.js src/grading/problem/alias-read.import-scan.spec.ts`. Nếu còn file đọc cột bí danh (ví dụ `rubric-overview.service.ts` chưa sửa đủ), test đỏ và liệt kê file: quay lại Task 4 cho đúng file đó. Expected cuối: PASS.

- [ ] **Step 3: Commit** — `test(p1a): quét import chặn đọc cột bí danh ngoài resolveProblemConfig`.

---

### Task 11: Kiểm chứng toàn bộ và nghiệm thu "1 câu chạy như cũ"

**Files:**
- Modify: `docs/superpowers/reports/2026-10-14-p1a-test-inventory.md` (ghi kết quả cuối)
- Create: bản ghi lượt diễn tập `apps/api/eval/rehearsals/<runId>/` (do harness tạo)

- [ ] **Step 1: Kiểm chứng tĩnh**
```bash
npx tsc --noEmit -p tsconfig.json          # 0 lỗi
pnpm check:cycles                           # 0 vòng lặp (chạy từ gốc repo)
npx eslint src test --ext .ts               # không lỗi mới so với nhánh gốc
```

- [ ] **Step 2: Kiểm chứng đơn vị**: `npx jest -c ../../.superpowers/jest.unit.config.js src 2>&1 | grep -E "^Tests:|^Test Suites:"` — không test nào đỏ so với mốc Task 0.

- [ ] **Step 3: Kiểm chứng e2e tuần tự** — trước khi chạy, tắt jest/nest mồ côi (`tasklist` / `taskkill`), rồi chạy các file trong danh sách Task 0 theo thứ tự `--runInBand`:
`npx jest --config ./test/jest-e2e.json --runInBand <các file trong danh sách>`
Expected: không test nào đỏ so với mốc Task 0. Test nào đỏ vì đổi hành vi có chủ ý thì dừng và báo người dùng, không tự sửa kỳ vọng.

- [ ] **Step 4: Nghiệm thu "1 câu chạy như cũ" (§11)** — điều kiện: M1 và M2 đã áp lên Supabase (xem Task 12, bước 2). Chạy API local từ nhánh này trỏ tới Supabase, rồi chạy lượt diễn tập `ngan-xep-v1` 5 bài:
```bash
pnpm build && node dist/src/main.js &        # API local, đọc apps/api/.env
export REHEARSAL_BASE_URL=http://localhost:4000 REHEARSAL_EMAIL=... REHEARSAL_PASSWORD=... REHEARSAL_CLASS_ID=822c2414-9e78-4ea3-b6b3-7f0109cf1188
pnpm rehearsal -- --scenario ngan-xep-v1 --deploy "$(git rev-parse --short HEAD)" --note "P1a: nghiệm thu 1 câu chạy như cũ"
```
Mật khẩu chỉ đưa qua biến môi trường của lệnh, không ghi vào file.
Kỳ vọng so với lượt nền `20261014T034132Z-0199dd3`: điểm 5/5, lỗi 8/8, lỗi thừa 0, cờ oan 0, bỏ lỡ cờ 0, lăng kính hỏng 0, tự duyệt 2/3 (HS2410022 lệch đã biết như mọi lượt). Mọi chỉ số không được tụt. Ghi bản ghi và dòng so sánh vào `apps/api/eval/rehearsals/`.

- [ ] **Step 5: Kiểm ruler_trust của kịch bản** — kịch bản `ngan-xep-v1` thuộc loại `teacher` (§6.3b). Truy vấn chỉ đọc: `SELECT ruler_trust FROM examcollect.grading_reference WHERE exam_session_id = <phiên mới>` → `teacher`. Nếu ra khác thì dừng và báo.

- [ ] **Step 6: Commit báo cáo** — `docs(p1a): kết quả kiểm chứng và nghiệm thu 1 câu chạy như cũ`.

---

### Task 12: Triển khai theo thứ tự (cổng cần chủ đồ án duyệt)

Không tự thực hiện các bước có **(duyệt)** — chờ người dùng xác nhận bằng lời trong phiên.

- [ ] **Step 1 (duyệt): Áp M1 và M2 lên Supabase** — `DOTENV_CONFIG_PATH=<.env của repo chính> node -r ts-node/register -r dotenv/config -r tsconfig-paths/register ./node_modules/typeorm/cli.js migration:run -t all -d src/database/data-source.ts`. Trước đó chạy `migration:show` để xác nhận chỉ còn hai migration mới chờ, và đã diễn tập trên bản sao của e2e DB (`pnpm migration:run:e2e` từ đầu).
- [ ] **Step 2: Kiểm sau khi áp** — `migration:show` đều `[X]`; truy vấn chỉ đọc: `SELECT count(*) FROM examcollect.grading_result WHERE problem_id IS NULL` → `0`.
- [ ] **Step 3 (duyệt): Merge vào `main`** — chỉ sau Step 2. Railway deploy; theo dõi `/health` trả `200`.
- [ ] **Step 4: Chạy lại backfill một lần** sau deploy (§10.1 mục 3) bằng `backfillDefaultProblems` qua script, để quét dòng do code cũ tạo trong khoảng giữa; kết quả phải `problems = 0, results = 0, bundles = 0, references = 0`.

---

## Self-Review

**1. Phủ spec (§10.2 P1a):**
- Bảng `exam_problem` → Task 1. `problem_id` cho phép rỗng ở `grading_result`/`grading_test_bundle`/`grading_reference` → Task 1.
- Câu mặc định → Task 2 (backfill) và Task 3 (tạo phiên).
- `resolveProblemConfig()` → Task 3; thay các chỗ đọc → Task 4; quét import → Task 10.
- Ba bẫy §9 → Tasks 5, 6, 7. `planReapply` → Task 8.
- Cột `ruler_trust` và backfill (§6.3b) → Task 1 (cột) và Task 2 (backfill).
- Cổng phiên bản schema (§10.1) → Task 9.
- Test chống tái đọc cột bí danh → Task 10.
- Bước đầu tiên "danh sách test bị ảnh hưởng" (§11) → Task 0.
- "1 câu chạy như cũ" (§11) → Task 11.
- Không có trong P1a, có chủ ý: kịch bản `unverified`, cờ `ruler_unverified`, canary đường đọc tổng, tổng điểm, `exam_problem_binding` (xem Ruling R-b, R-c, R-d).

**2. Quét placeholder:** Task 3 Step 1 và Task 6 Step 1 để nhiều chỗ là mô tả kỳ vọng thay vì thân test đầy đủ. Đó là chỗ người thực thi phải hoàn thiện theo helper seed hiện có; trước khi đánh dấu xong, phải có thân test đầy đủ. Task 2 Step 1 cũng vậy (các `it` có comment mô tả `expect`). Đây là khoảng trống có chủ đích được ghi lại, không phải TBD.

**3. Nhất quán kiểu và tên:** `ProblemConfig` (Task 3) được dùng ở Task 4. `resolveProblemConfig`, `ensureDefaultProblem`, `setSessionRubricAndProblem`, `setSessionTestBundleAndProblem` khớp giữa Task 3 và các task dùng. `backfillDefaultProblems` và `ChecksumMismatchError` (Task 2) khớp với Task 12. `foldStudentResults` (Task 7) khớp với cách gọi ở `grade-export.data.ts`. `loadSessionModelRules(m, sessionId, problemId, exceptResultId?)` (Task 6) khớp với mọi nơi gọi đã liệt kê.

**4. Review Focus ↔ test:** (1) checksum → Task 2 "checksum"; (2) phiên trống → Task 2 & Task 3 ("không cấu hình gì"); (3) bẫy 3 → Task 7 "hai kết quả → conflict"; (4) bẫy 2 & planReapply → Task 6 và Task 8; (5) `/health` → Task 9.

**Điểm cần người dùng xác nhận trước khi thực thi:**
- R-a: bẫy 3 ở P1a báo `conflict` thay vì gộp tổng.
- Thứ tự áp migration (Task 12) cần duyệt bằng lời.
- Cách Railway dùng healthcheck (`railway.toml`) — Task 9 Step 4.
