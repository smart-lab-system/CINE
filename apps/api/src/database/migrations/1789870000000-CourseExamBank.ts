import { MigrationInterface, QueryRunner } from 'typeorm';

/** Kho đề thuộc môn — spec 2026-11-18-course-exam-bank. */
export class CourseExamBank1789870000000 implements MigrationInterface {
  name = 'CourseExamBank1789870000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE "examcollect"."course_exam" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "course_id" uuid NOT NULL,
        "title" varchar(200) NOT NULL,
        "status" varchar(16) NOT NULL DEFAULT 'draft',
        "language" varchar(20),
        "created_by" uuid NOT NULL,
        "updated_by" uuid,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_course_exam" PRIMARY KEY ("id"),
        CONSTRAINT "ck_course_exam_status" CHECK ("status" IN ('draft', 'ready')),
        CONSTRAINT "fk_course_exam_course" FOREIGN KEY ("course_id")
          REFERENCES "examcollect"."course"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_course_exam_created_by" FOREIGN KEY ("created_by")
          REFERENCES "examcollect"."account"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_course_exam_updated_by" FOREIGN KEY ("updated_by")
          REFERENCES "examcollect"."account"("id") ON DELETE SET NULL
      )
    `);
    await q.query(
      `CREATE INDEX "idx_course_exam_course" ON "examcollect"."course_exam" ("course_id")`,
    );

    await q.query(`
      CREATE TABLE "examcollect"."course_exam_question" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "course_exam_id" uuid NOT NULL,
        "ordinal" integer NOT NULL,
        "title" text,
        "statement" text NOT NULL,
        "points_hundredths" integer NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_course_exam_question" PRIMARY KEY ("id"),
        CONSTRAINT "ck_course_exam_question_ordinal" CHECK ("ordinal" >= 1),
        CONSTRAINT "ck_course_exam_question_points" CHECK ("points_hundredths" >= 0),
        CONSTRAINT "uq_course_exam_question_ordinal" UNIQUE ("course_exam_id", "ordinal"),
        CONSTRAINT "fk_course_exam_question_exam" FOREIGN KEY ("course_exam_id")
          REFERENCES "examcollect"."course_exam"("id") ON DELETE CASCADE
      )
    `);
    await q.query(
      `CREATE INDEX "idx_course_exam_question_exam" ON "examcollect"."course_exam_question" ("course_exam_id")`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "examcollect"."course_exam_question"`);
    await q.query(`DROP TABLE IF EXISTS "examcollect"."course_exam"`);
  }
}
