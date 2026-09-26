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
