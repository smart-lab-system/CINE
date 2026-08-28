import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Lets a submission exist before its home class/teacher are known.
 *
 * InitialSchema made submission.home_class_id / home_teacher_id NOT NULL on
 * the assumption that `agent:join` would have authenticated the student's
 * Enrollment first (CLAUDE.md Security rule 1, Phase 4 step 12). That
 * authentication does not exist yet — `agent:join` accepts any studentId
 * with a valid session code, and no Enrollment rows exist for real
 * sessions — so with the constraint in place not a single submission row
 * could ever be inserted. The alternatives were blocking the entire
 * collection pipeline on the Enrollment module, or filling the columns with
 * a placeholder class/teacher; the latter is exactly the kind of guessing
 * the project forbids, because a wrong home class silently routes a
 * submission to the wrong teacher with nothing to detect it.
 *
 * NULL therefore means "not yet routed", not "no home class". When the
 * Enrollment module lands, the follow-up is: backfill from Enrollment by
 * (course_id, student_mssv), then restore NOT NULL — `down()` here is that
 * second step, and it will fail loudly on any row still unrouted, which is
 * the correct behaviour.
 *
 * TRIMMED BY HAND from `migration:generate` output for the same reason as
 * AddExamSessionFinalizeIndex: the generator again wanted to rewrite
 * audit_log's primary key from (id, occurred_at) to (id), which would break
 * that partitioned append-only table (Security rule 4). It also wanted to
 * drop and recreate both foreign keys, which DROP NOT NULL does not require
 * — a FK constraint permits NULL on its own.
 */
export class MakeSubmissionHomeRoutingNullable1787937554012 implements MigrationInterface {
  name = 'MakeSubmissionHomeRoutingNullable1787937554012';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "examcollect"."submission" ALTER COLUMN "home_class_id" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "examcollect"."submission" ALTER COLUMN "home_teacher_id" DROP NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "examcollect"."submission" ALTER COLUMN "home_teacher_id" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "examcollect"."submission" ALTER COLUMN "home_class_id" SET NOT NULL`,
    );
  }
}
