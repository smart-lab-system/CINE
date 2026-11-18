import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Kho đề: loại TK|GK|CK (như phiên thi); language = playground stack (bắt buộc).
 * Tiêu đề do app dựng từ loại + tên môn.
 */
export class CourseExamTypeAndLanguage1789880000000 implements MigrationInterface {
  name = 'CourseExamTypeAndLanguage1789880000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE "examcollect"."course_exam"
        ADD COLUMN "exam_type" varchar(8)
    `);
    await q.query(`
      UPDATE "examcollect"."course_exam" SET "exam_type" = 'TK' WHERE "exam_type" IS NULL
    `);
    await q.query(`
      ALTER TABLE "examcollect"."course_exam"
        ALTER COLUMN "exam_type" SET NOT NULL
    `);
    await q.query(`
      ALTER TABLE "examcollect"."course_exam"
        ADD CONSTRAINT "ck_course_exam_type" CHECK ("exam_type" IN ('TK', 'GK', 'CK'))
    `);

    await q.query(`
      UPDATE "examcollect"."course_exam"
         SET "language" = 'cpp'
       WHERE "language" IS NULL OR btrim("language") = ''
    `);
    await q.query(`
      ALTER TABLE "examcollect"."course_exam"
        ALTER COLUMN "language" TYPE varchar(32)
    `);
    await q.query(`
      ALTER TABLE "examcollect"."course_exam"
        ALTER COLUMN "language" SET NOT NULL
    `);
    await q.query(`
      ALTER TABLE "examcollect"."course_exam"
        ADD CONSTRAINT "ck_course_exam_language" CHECK (
          "language" IN (
            'c', 'cpp', 'java', 'python',
            'static', 'spring-boot', 'vite-react', 'express'
          )
        )
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE "examcollect"."course_exam" DROP CONSTRAINT IF EXISTS "ck_course_exam_language"`,
    );
    await q.query(
      `ALTER TABLE "examcollect"."course_exam" DROP CONSTRAINT IF EXISTS "ck_course_exam_type"`,
    );
    await q.query(`ALTER TABLE "examcollect"."course_exam" ALTER COLUMN "language" DROP NOT NULL`);
    await q.query(`ALTER TABLE "examcollect"."course_exam" DROP COLUMN IF EXISTS "exam_type"`);
  }
}
