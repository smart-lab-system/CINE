import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the composite index behind ExamSessionScheduler's finalize sweep
 * (`status = 'active' AND end_time <= now()`), which runs every 30 seconds
 * for the lifetime of the process. Without it that query is a sequential
 * scan of exam_session on every tick.
 *
 * TRIMMED BY HAND from what `migration:generate` produced, deliberately.
 * The generator also emitted statements that would have dropped and
 * recreated audit_log's primary key as PRIMARY KEY (id), replacing the
 * (id, occurred_at) key the table actually has. That is pre-existing drift
 * between AuditLogEntity and the schema InitialSchema created — audit_log
 * is partitioned by occurred_at, so the partition key must be part of the
 * primary key, and TypeORM's differ has no way to know that. Applying it
 * would break the append-only audit trail CLAUDE.md Security rule 4 relies
 * on. Reconciling the entity with the real schema is its own task; this
 * migration must not silently carry it.
 */
export class AddExamSessionFinalizeIndex1787936451166 implements MigrationInterface {
  name = 'AddExamSessionFinalizeIndex1787936451166';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX "idx_exam_session_status_end_time" ON "examcollect"."exam_session" ("status", "end_time")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "examcollect"."idx_exam_session_status_end_time"`);
  }
}
