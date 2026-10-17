import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * P1b — M3: xác nhận đề cương (§3.1, §6.4) và FK ghép gói test theo phiên (D3).
 * Chỉ thêm: hai cột rỗng được trên exam_session, và thay FK đơn cột của P1a bằng FK ghép (test_bundle_id,
 * exam_session_id) → grading_test_bundle(id, exam_session_id). Không đổi dữ liệu.
 */
export class ProblemBlueprint1789620000000 implements MigrationInterface {
  name = 'ProblemBlueprint1789620000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "examcollect"."exam_session" ADD COLUMN "blueprint_confirmed_at" timestamptz`);
    await q.query(`ALTER TABLE "examcollect"."exam_session" ADD COLUMN "blueprint_confirmed_by" uuid`);
    await q.query(`ALTER TABLE "examcollect"."exam_session" ADD CONSTRAINT "fk_exam_session_blueprint_confirmed_by"
      FOREIGN KEY ("blueprint_confirmed_by") REFERENCES "examcollect"."account"("id") ON DELETE SET NULL`);
    await q.query(`ALTER TABLE "examcollect"."exam_problem" DROP CONSTRAINT "fk_exam_problem_test_bundle"`);
    await q.query(`ALTER TABLE "examcollect"."exam_problem" ADD CONSTRAINT "fk_exam_problem_test_bundle_session"
      FOREIGN KEY ("test_bundle_id", "exam_session_id")
      REFERENCES "examcollect"."grading_test_bundle"("id", "exam_session_id") ON DELETE RESTRICT`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "examcollect"."exam_problem" DROP CONSTRAINT IF EXISTS "fk_exam_problem_test_bundle_session"`);
    await q.query(`ALTER TABLE "examcollect"."exam_problem" ADD CONSTRAINT "fk_exam_problem_test_bundle"
      FOREIGN KEY ("test_bundle_id") REFERENCES "examcollect"."grading_test_bundle"("id") ON DELETE RESTRICT`);
    await q.query(`ALTER TABLE "examcollect"."exam_session" DROP CONSTRAINT IF EXISTS "fk_exam_session_blueprint_confirmed_by"`);
    await q.query(`ALTER TABLE "examcollect"."exam_session" DROP COLUMN IF EXISTS "blueprint_confirmed_by"`);
    await q.query(`ALTER TABLE "examcollect"."exam_session" DROP COLUMN IF EXISTS "blueprint_confirmed_at"`);
  }
}
