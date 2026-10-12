import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Admin lớp học phần: FK catalog + teacher_id / home_teacher_id nullable.
 * Spec: 2026-10-07-admin-course-section-design.md
 */
export class ExpandClassForAdminCourseSection1789530000000
  implements MigrationInterface
{
  name = 'ExpandClassForAdminCourseSection1789530000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "examcollect"."class"
        ADD COLUMN "course_id" uuid,
        ADD COLUMN "semester_id" uuid
    `);

    await queryRunner.query(`
      ALTER TABLE "examcollect"."class"
        ADD CONSTRAINT "fk_class_course"
          FOREIGN KEY ("course_id")
          REFERENCES "examcollect"."course"("id")
          ON DELETE RESTRICT ON UPDATE NO ACTION,
        ADD CONSTRAINT "fk_class_semester"
          FOREIGN KEY ("semester_id")
          REFERENCES "examcollect"."semester"("id")
          ON DELETE RESTRICT ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "examcollect"."class"
        ALTER COLUMN "teacher_id" DROP NOT NULL
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "examcollect"."uq_class_teacher_course_name"
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_class_semester_course_name"
        ON "examcollect"."class" ("semester_id", "course_id", "name")
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_class_legacy_teacher_name"
        ON "examcollect"."class" ("teacher_id", "name")
        WHERE "course_id" IS NULL AND "teacher_id" IS NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "examcollect"."enrollment"
        ALTER COLUMN "home_teacher_id" DROP NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "examcollect"."enrollment"
        ADD COLUMN "student_id" uuid
    `);

    await queryRunner.query(`
      ALTER TABLE "examcollect"."enrollment"
        ADD CONSTRAINT "fk_enrollment_student"
          FOREIGN KEY ("student_id")
          REFERENCES "examcollect"."student"("id")
          ON DELETE SET NULL ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "examcollect"."enrollment"
        DROP CONSTRAINT IF EXISTS "fk_enrollment_student"
    `);
    await queryRunner.query(`
      ALTER TABLE "examcollect"."enrollment"
        DROP COLUMN IF EXISTS "student_id"
    `);

    // Restore NOT NULL only when no nulls remain — otherwise down stops.
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM "examcollect"."enrollment" WHERE "home_teacher_id" IS NULL
        ) THEN
          RAISE EXCEPTION
            'Cannot restore enrollment.home_teacher_id NOT NULL: null rows exist';
        END IF;
      END $$
    `);
    await queryRunner.query(`
      ALTER TABLE "examcollect"."enrollment"
        ALTER COLUMN "home_teacher_id" SET NOT NULL
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "examcollect"."uq_class_legacy_teacher_name"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "examcollect"."uq_class_semester_course_name"
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_class_teacher_course_name"
        ON "examcollect"."class" ("teacher_id", "course_name", "name")
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM "examcollect"."class" WHERE "teacher_id" IS NULL
        ) THEN
          RAISE EXCEPTION
            'Cannot restore class.teacher_id NOT NULL: null rows exist';
        END IF;
      END $$
    `);
    await queryRunner.query(`
      ALTER TABLE "examcollect"."class"
        ALTER COLUMN "teacher_id" SET NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "examcollect"."class"
        DROP CONSTRAINT IF EXISTS "fk_class_semester",
        DROP CONSTRAINT IF EXISTS "fk_class_course"
    `);
    await queryRunner.query(`
      ALTER TABLE "examcollect"."class"
        DROP COLUMN IF EXISTS "semester_id",
        DROP COLUMN IF EXISTS "course_id"
    `);
  }
}
