import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Postgres does NOT index the referencing side of a foreign key — the same
 * gap `AddTeacherReviewResultIndex` closed for `teacher_review`.
 *
 * `rubric_criterion` is read by `WHERE rubric_id = ?` and nothing else, from
 * three places: `RubricService.toView`, `GradingService` before it grades, and
 * `TeacherReviewService.validateAndTotal` on EVERY review a teacher submits.
 * Without an index each of those scans the whole table.
 *
 * Not urgent today — measured at 403 rows the scan is 0.07ms, roughly 0.2% of a
 * review request. It is here because the cost grows with the table forever: the
 * table gains a row per criterion per rubric VERSION, and rubric versions are
 * never deleted (Security rule 7), so it only ever grows while every read stays
 * a full scan of it.
 *
 * Deliberately single-column. Two of the three call sites add
 * `ORDER BY created_at`, so `(rubric_id, created_at)` was considered — but a
 * rubric holds a handful of criteria, sorting those in memory is free, and the
 * wider index would cost every entry a column for no measurable gain.
 */
export class AddRubricCriterionRubricIndex1788678311394 implements MigrationInterface {
    name = 'AddRubricCriterionRubricIndex1788678311394'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE INDEX "idx_rubric_criterion_rubric" ON "examcollect"."rubric_criterion" ("rubric_id")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "examcollect"."idx_rubric_criterion_rubric"`);
    }

}
