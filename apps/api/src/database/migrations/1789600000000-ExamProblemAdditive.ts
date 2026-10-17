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
          REFERENCES "examcollect"."exam_session"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_exam_problem_deliverable" FOREIGN KEY ("required_deliverable_id")
          REFERENCES "examcollect"."required_deliverable"("id") ON DELETE SET NULL,
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
