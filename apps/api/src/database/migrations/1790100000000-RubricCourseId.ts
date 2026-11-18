import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Spec 2026-11-18 course hub: neo rubric vào môn (`course_id`) để admin
 * ngân hàng tiêu chí theo môn. Ownership vẫn `teacher_id`.
 *
 * Nullable cho legacy; create mới bắt buộc ở tầng API.
 */
export class RubricCourseId1790100000000 implements MigrationInterface {
  name = 'RubricCourseId1790100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "examcollect"."rubric"
        ADD COLUMN IF NOT EXISTS "course_id" uuid
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'fk_rubric_course'
        ) THEN
          ALTER TABLE "examcollect"."rubric"
            ADD CONSTRAINT "fk_rubric_course"
            FOREIGN KEY ("course_id") REFERENCES "examcollect"."course"("id")
            ON DELETE RESTRICT;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_rubric_course"
        ON "examcollect"."rubric" ("course_id")
    `);

    // Backfill từ câu đề kho.
    await queryRunner.query(`
      UPDATE "examcollect"."rubric" r
         SET "course_id" = sub.course_id
        FROM (
          SELECT DISTINCT ON (q.rubric_id) q.rubric_id, e.course_id
            FROM "examcollect"."course_exam_question" q
            JOIN "examcollect"."course_exam" e ON e.id = q.course_exam_id
           WHERE q.rubric_id IS NOT NULL
           ORDER BY q.rubric_id, e.updated_at DESC
        ) sub
       WHERE r.id = sub.rubric_id
         AND r.course_id IS NULL
    `);

    // Backfill từ phiên thi + lớp.
    await queryRunner.query(`
      UPDATE "examcollect"."rubric" r
         SET "course_id" = c.course_id
        FROM "examcollect"."exam_session" s
        JOIN "examcollect"."class" c ON c.id = s.class_id
       WHERE s.rubric_id = r.id
         AND r.course_id IS NULL
         AND c.course_id IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "examcollect"."rubric" DROP CONSTRAINT IF EXISTS "fk_rubric_course"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "examcollect"."idx_rubric_course"`,
    );
    await queryRunner.query(
      `ALTER TABLE "examcollect"."rubric" DROP COLUMN IF EXISTS "course_id"`,
    );
  }
}
