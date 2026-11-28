import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tiết học 1-16 trên phiên thi (UX ngày + tiết). start_time/end_time vẫn là
 * nguồn sự thật cho overlap / finalize / countdown. Nullable cho phiên cũ
 * tạo bằng datetime-local.
 */
export class AddExamSessionPeriods1791000000000 implements MigrationInterface {
  name = 'AddExamSessionPeriods1791000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "examcollect"."exam_session"
        ADD COLUMN "start_period" smallint,
        ADD COLUMN "end_period" smallint
    `);

    await queryRunner.query(`
      ALTER TABLE "examcollect"."exam_session"
        ADD CONSTRAINT "ck_exam_session_start_period"
          CHECK ("start_period" IS NULL OR ("start_period" BETWEEN 1 AND 16)),
        ADD CONSTRAINT "ck_exam_session_end_period"
          CHECK ("end_period" IS NULL OR ("end_period" BETWEEN 1 AND 16)),
        ADD CONSTRAINT "ck_exam_session_period_order"
          CHECK (
            "start_period" IS NULL
            OR "end_period" IS NULL
            OR "end_period" >= "start_period"
          )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "examcollect"."exam_session"
        DROP CONSTRAINT IF EXISTS "ck_exam_session_period_order",
        DROP CONSTRAINT IF EXISTS "ck_exam_session_end_period",
        DROP CONSTRAINT IF EXISTS "ck_exam_session_start_period"
    `);
    await queryRunner.query(`
      ALTER TABLE "examcollect"."exam_session"
        DROP COLUMN IF EXISTS "end_period",
        DROP COLUMN IF EXISTS "start_period"
    `);
  }
}
