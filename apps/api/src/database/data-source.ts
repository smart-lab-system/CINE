import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { DataSource, DataSourceOptions } from 'typeorm';
import { AccountEntity } from '../identity/entities/account.entity';
import { ClassEntity } from '../course/entities/class.entity';
import { EnrollmentEntity } from '../course/entities/enrollment.entity';
import { ExamSessionEntity } from '../exam-session/entities/exam-session.entity';
import { SessionRosterEntity } from '../exam-session/entities/session-roster.entity';
import { GradingReferenceEntity } from '../grading/entities/grading-reference.entity';
import { GradingAnchorSnapshotEntity } from '../grading/entities/grading-anchor-snapshot.entity';
import { RequiredDeliverableEntity } from '../exam-session/entities/required-deliverable.entity';
import { ExamMaterialEntity } from '../exam-session/entities/exam-material.entity';
import { AgentConnectionEventEntity } from '../agent-connection/entities/agent-connection-event.entity';
import { SubmissionEntity } from '../submission/entities/submission.entity';
import { RubricEntity } from '../grading/entities/rubric.entity';
import { RubricCriterionEntity } from '../grading/entities/rubric-criterion.entity';
import { GradingResultEntity } from '../grading/entities/grading-result.entity';
import { TeacherReviewEntity } from '../grading/entities/teacher-review.entity';
import { GradeExportEntity } from '../grading/entities/grade-export.entity';
import { CalibrationRunEntity } from '../calibration/entities/calibration-run.entity';
import { AiUsageEntity } from '../exam-authoring/entities/ai-usage.entity';
import { AuditLogEntity } from '../admin/entities/audit-log.entity';
import { RubricTemplateEntity } from '../admin/entities/rubric-template.entity';
import { CostBudgetEntity } from '../admin/entities/cost-budget.entity';
import { GradingPipelineConfigEntity } from '../admin/entities/grading-pipeline-config.entity';

/**
 * TLS for the Postgres connection, decided by env so one build runs
 * against both the local Docker Postgres (no TLS offered at all) and a
 * managed provider (Supabase, which refuses plaintext).
 *
 * Three states out of two variables:
 *   DATABASE_SSL unset / not 'true'         -> no TLS        (local Docker)
 *   DATABASE_SSL=true                       -> TLS, server certificate NOT verified
 *   DATABASE_SSL=true + DATABASE_SSL_CA=... -> TLS, server certificate verified
 *
 * The middle state encrypts the wire but does not authenticate the server,
 * so it cannot detect a man-in-the-middle. It is where Supabase's own
 * connection strings land you, and it is a NAMED tradeoff, not an
 * oversight: closing it needs the CA bundle deployed next to the API
 * (Supabase dashboard -> Settings -> Database -> SSL certificate), which
 * a Vercel/CI build does not have by default. Set DATABASE_SSL_CA the
 * moment that file is deployable.
 *
 * Default is OFF rather than ON: a wrong default here fails at connect
 * time on every existing local setup, and silently weakening TLS is worse
 * than making the remote case declare itself.
 */
type PostgresSslOptions = false | { rejectUnauthorized: boolean; ca?: string };

function sslOptions(): PostgresSslOptions {
  if (process.env.DATABASE_SSL !== 'true') {
    return false;
  }

  const caPath = process.env.DATABASE_SSL_CA;
  if (!caPath) {
    return { rejectUnauthorized: false };
  }

  // Read once at module load, not per connection: an unreadable/missing CA
  // has to stop the process HERE, while the path is still the obvious
  // suspect. Deferred, it resurfaces later as a connection failure that
  // reads exactly like the database being down.
  return { rejectUnauthorized: true, ca: readFileSync(caPath, 'utf8') };
}

// Entities are the source of truth for the schema (2026-08-27 decision) —
// each one fully declares its own columns/types/constraints/relations, and
// `pnpm migration:generate` diffs them against the live DB to produce the
// next migration. The generated migration is still hand-augmented for
// anything decorators can't express: trigger functions/triggers,
// audit_log's RANGE partitioning, and CHECK constraints too irregular for
// @Check() — see apps/api/src/database/migrations/sql/0001_initial_schema.sql.
export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  url: process.env.DATABASE_URL,
  schema: process.env.DATABASE_SCHEMA ?? 'examcollect',
  ssl: sslOptions(),
  entities: [
    AccountEntity,
    ClassEntity,
    EnrollmentEntity,
    ExamSessionEntity,
    SessionRosterEntity,
    RequiredDeliverableEntity,
    ExamMaterialEntity,
    AgentConnectionEventEntity,
    SubmissionEntity,
    RubricEntity,
    RubricCriterionEntity,
    GradingResultEntity,
    GradingReferenceEntity,
    GradingAnchorSnapshotEntity,
    TeacherReviewEntity,
    GradeExportEntity,
    CalibrationRunEntity,
    AiUsageEntity,
    AuditLogEntity,
    RubricTemplateEntity,
    CostBudgetEntity,
    GradingPipelineConfigEntity,
  ],
  migrations: [__dirname + '/migrations/*.{js,ts}'],
  // The initial migration's SQL file already wraps itself in BEGIN/COMMIT
  // (hand-augmented after generation with triggers/partitioning). Running
  // TypeORM's own transaction wrapper on top would nest a COMMIT inside
  // TypeORM's transaction and commit it early, so per-migration files own
  // their own transaction boundaries instead.
  migrationsTransactionMode: 'none',
  synchronize: false,
  logging: process.env.NODE_ENV === 'development',
};

export default new DataSource(dataSourceOptions);
