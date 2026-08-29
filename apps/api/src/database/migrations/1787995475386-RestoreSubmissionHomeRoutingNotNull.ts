import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Restores the NOT NULL that MakeSubmissionHomeRoutingNullable had to drop.
 *
 * That migration loosened the constraint because nothing could answer "which
 * class and teacher does this submission belong to" — `agent:join` accepted
 * any student ID and no Enrollment lookup existed. Both are now true: a
 * student cannot join without an Enrollment, and the resolved home class and
 * teacher travel with the socket identity into every collected row. A
 * submission nobody can route is a submission nobody grades.
 *
 * Existing rows are backfilled by joining through the session's course, the
 * same route `agent:join` now takes. Anything still unresolved makes the
 * ALTER fail — deliberately. An unroutable submission is a real data problem
 * for an operator to decide about, and a migration that quietly deleted or
 * invented a routing would hide exactly the thing worth seeing.
 */
export class RestoreSubmissionHomeRoutingNotNull1787995475386 implements MigrationInterface {
  name = 'RestoreSubmissionHomeRoutingNotNull1787995475386';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "examcollect"."submission" s
         SET "home_class_id"   = e."home_class_id",
             "home_teacher_id" = e."home_teacher_id"
        FROM "examcollect"."exam_session" es,
             "examcollect"."enrollment" e
       WHERE s."exam_session_id" = es."id"
         AND e."course_id" = es."course_id"
         AND e."student_mssv" = s."student_mssv"
         AND (s."home_class_id" IS NULL OR s."home_teacher_id" IS NULL)
    `);
    await queryRunner.query(
      `ALTER TABLE "examcollect"."submission" ALTER COLUMN "home_class_id" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "examcollect"."submission" ALTER COLUMN "home_teacher_id" SET NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "examcollect"."submission" ALTER COLUMN "home_teacher_id" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "examcollect"."submission" ALTER COLUMN "home_class_id" DROP NOT NULL`,
    );
  }
}
