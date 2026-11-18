import { MigrationInterface, QueryRunner } from 'typeorm';

/** Gắn rubric QS (theo câu) vào câu trong kho đề. */
export class CourseExamQuestionRubric1789910000000 implements MigrationInterface {
  name = 'CourseExamQuestionRubric1789910000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE "examcollect"."course_exam_question"
        ADD COLUMN "rubric_id" uuid
    `);
    await q.query(`
      CREATE INDEX "idx_course_exam_question_rubric"
        ON "examcollect"."course_exam_question" ("rubric_id")
    `);
    await q.query(`
      ALTER TABLE "examcollect"."course_exam_question"
        ADD CONSTRAINT "fk_course_exam_question_rubric"
        FOREIGN KEY ("rubric_id") REFERENCES "examcollect"."rubric"("id")
        ON DELETE SET NULL
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE "examcollect"."course_exam_question" DROP CONSTRAINT IF EXISTS "fk_course_exam_question_rubric"`,
    );
    await q.query(`DROP INDEX IF EXISTS "examcollect"."idx_course_exam_question_rubric"`);
    await q.query(
      `ALTER TABLE "examcollect"."course_exam_question" DROP COLUMN IF EXISTS "rubric_id"`,
    );
  }
}
