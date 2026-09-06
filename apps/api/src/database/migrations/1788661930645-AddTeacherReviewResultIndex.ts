import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Postgres does NOT index the referencing side of a foreign key.
 *
 * Without this, looking up "the newest review of this result" is a sequential
 * scan of `teacher_review` — and that lookup runs on EVERY read of the grading
 * page, against a table that only ever grows, because a score edit appends a
 * row rather than replacing one.
 *
 * Column order matches the query it exists for, in
 * `GradingService.listForSession`:
 *
 *   SELECT DISTINCT ON (grading_result_id) ...
 *   ORDER BY grading_result_id, reviewed_at DESC
 *
 * Hand-written rather than generated: TypeORM's `@Index` decorator cannot
 * express DESC, so a later `migration:generate` will see drift here and
 * propose dropping and recreating the index. Trim that by hand — the same
 * treatment `audit_log`'s composite primary key already needs.
 */
export class AddTeacherReviewResultIndex1788661930645 implements MigrationInterface {
    name = 'AddTeacherReviewResultIndex1788661930645'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE INDEX "idx_teacher_review_result_time" ON "examcollect"."teacher_review" ("grading_result_id", "reviewed_at" DESC)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "examcollect"."idx_teacher_review_result_time"`);
    }

}
