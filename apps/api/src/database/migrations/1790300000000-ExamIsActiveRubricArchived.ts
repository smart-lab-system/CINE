import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Soft-deactivate ngân hàng đề (`course_exam.is_active`) và rubric
 * (`rubric.is_archived`). `rubric.is_active` giữ nghĩa version hiện hành.
 */
export class ExamIsActiveRubricArchived1790300000000 implements MigrationInterface {
  name = 'ExamIsActiveRubricArchived1790300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "examcollect"."course_exam"
        ADD COLUMN IF NOT EXISTS "is_active" boolean NOT NULL DEFAULT true
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_course_exam_is_active"
        ON "examcollect"."course_exam" ("is_active")
    `);
    await queryRunner.query(`
      ALTER TABLE "examcollect"."rubric"
        ADD COLUMN IF NOT EXISTS "is_archived" boolean NOT NULL DEFAULT false
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_rubric_is_archived"
        ON "examcollect"."rubric" ("is_archived")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "examcollect"."idx_rubric_is_archived"`,
    );
    await queryRunner.query(
      `ALTER TABLE "examcollect"."rubric" DROP COLUMN IF EXISTS "is_archived"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "examcollect"."idx_course_exam_is_active"`,
    );
    await queryRunner.query(
      `ALTER TABLE "examcollect"."course_exam" DROP COLUMN IF EXISTS "is_active"`,
    );
  }
}
