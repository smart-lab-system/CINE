import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Moves the student's name onto `enrollment`.
 *
 * `class_roster` carried it, keyed by exactly the same natural key
 * `(course_id, student_mssv)` over exactly the same rows from exactly the
 * same Excel file — the two tables were one table wearing two names, and no
 * step ever converted one into the other. `enrollment` is the one Security
 * rule 1 and the documented flow refer to, so it keeps the name and
 * `class_roster` is dropped in a later phase.
 *
 * Added nullable, backfilled, then tightened — NOT the single
 * `ADD COLUMN ... NOT NULL` the generator produced. That version failed on
 * the first DB it met: the design doc claimed `enrollment` was empty, which
 * was true of a freshly reset dev database and false of every real one,
 * because the accounts e2e suite creates an enrollment per run and cannot
 * clean up after itself.
 *
 * Existing rows are backfilled with their own MSSV. Their real names were
 * never recorded anywhere, so there is nothing truthful to write; the MSSV
 * at least identifies the student and is visibly provisional, where an
 * empty string would later read as a real name that happens to be blank.
 */
export class AddEnrollmentStudentName1787994889306 implements MigrationInterface {
  name = 'AddEnrollmentStudentName1787994889306';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "examcollect"."enrollment" ADD "student_name" character varying(150)`,
    );
    await queryRunner.query(
      `UPDATE "examcollect"."enrollment" SET "student_name" = "student_mssv" WHERE "student_name" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "examcollect"."enrollment" ALTER COLUMN "student_name" SET NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "examcollect"."enrollment" DROP COLUMN "student_name"`,
    );
  }
}
