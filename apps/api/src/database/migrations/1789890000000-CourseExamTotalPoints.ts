import { MigrationInterface, QueryRunner } from 'typeorm';

/** Tổng điểm đề (trần) — độc lập với tổng điểm các câu đã phân bổ. */
export class CourseExamTotalPoints1789890000000 implements MigrationInterface {
  name = 'CourseExamTotalPoints1789890000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE "examcollect"."course_exam"
        ADD COLUMN "total_points_hundredths" integer
    `);
    await q.query(`
      UPDATE "examcollect"."course_exam" e
         SET "total_points_hundredths" = COALESCE((
           SELECT SUM(q.points_hundredths)::int
             FROM "examcollect"."course_exam_question" q
            WHERE q.course_exam_id = e.id
         ), 0)
    `);
    await q.query(`
      ALTER TABLE "examcollect"."course_exam"
        ALTER COLUMN "total_points_hundredths" SET NOT NULL
    `);
    await q.query(`
      ALTER TABLE "examcollect"."course_exam"
        ADD CONSTRAINT "ck_course_exam_total_points"
        CHECK ("total_points_hundredths" >= 0)
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE "examcollect"."course_exam" DROP CONSTRAINT IF EXISTS "ck_course_exam_total_points"`,
    );
    await q.query(
      `ALTER TABLE "examcollect"."course_exam" DROP COLUMN IF EXISTS "total_points_hundredths"`,
    );
  }
}
