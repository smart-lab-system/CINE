import { MigrationInterface, QueryRunner } from 'typeorm';

/** Mô tả dùng chung cho toàn đề (áp dụng mọi câu). */
export class CourseExamDescription1789900000000 implements MigrationInterface {
  name = 'CourseExamDescription1789900000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE "examcollect"."course_exam"
        ADD COLUMN "description" text
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE "examcollect"."course_exam" DROP COLUMN IF EXISTS "description"`,
    );
  }
}
