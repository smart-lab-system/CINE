import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Thời gian thi (phút) - UX 45/60/75/90. Nullable cho phiên cũ.
 * start_time/end_time vẫn là nguồn sự thật cho finalize / countdown.
 */
export class AddExamSessionDurationMinutes1791100000000
  implements MigrationInterface
{
  name = 'AddExamSessionDurationMinutes1791100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "examcollect"."exam_session"
        ADD COLUMN "duration_minutes" smallint
    `);
    await queryRunner.query(`
      ALTER TABLE "examcollect"."exam_session"
        ADD CONSTRAINT "ck_exam_session_duration_minutes"
          CHECK (
            "duration_minutes" IS NULL
            OR "duration_minutes" IN (45, 60, 75, 90)
          )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "examcollect"."exam_session"
        DROP CONSTRAINT IF EXISTS "ck_exam_session_duration_minutes"
    `);
    await queryRunner.query(`
      ALTER TABLE "examcollect"."exam_session"
        DROP COLUMN IF EXISTS "duration_minutes"
    `);
  }
}
