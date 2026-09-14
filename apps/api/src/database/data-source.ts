import 'dotenv/config';
import { DataSource, DataSourceOptions } from 'typeorm';
import { AccountEntity } from '../identity/entities/account.entity';
import { SemesterEntity } from '../course/entities/semester.entity';
import { CourseEntity } from '../course/entities/course.entity';
import { ClassEntity } from '../course/entities/class.entity';
import { EnrollmentEntity } from '../course/entities/enrollment.entity';
import { ExamSessionEntity } from '../exam-session/entities/exam-session.entity';
import { SessionRosterEntity } from '../exam-session/entities/session-roster.entity';
import { GradingReferenceEntity } from '../grading/entities/grading-reference.entity';
import { RequiredDeliverableEntity } from '../exam-session/entities/required-deliverable.entity';
import { ExamMaterialEntity } from '../exam-session/entities/exam-material.entity';
import { RoomEntity } from '../room/entities/room.entity';
import { AgentConnectionEventEntity } from '../agent-connection/entities/agent-connection-event.entity';
import { SubmissionEntity } from '../submission/entities/submission.entity';
import { RubricEntity } from '../grading/entities/rubric.entity';
import { RubricCriterionEntity } from '../grading/entities/rubric-criterion.entity';
import { GradingResultEntity } from '../grading/entities/grading-result.entity';
import { TeacherReviewEntity } from '../grading/entities/teacher-review.entity';
import { GradeExportEntity } from '../grading/entities/grade-export.entity';
import { CalibrationRunEntity } from '../calibration/entities/calibration-run.entity';
import { AuditLogEntity } from '../admin/entities/audit-log.entity';
import { RubricTemplateEntity } from '../admin/entities/rubric-template.entity';
import { CostBudgetEntity } from '../admin/entities/cost-budget.entity';
import { GradingPipelineConfigEntity } from '../admin/entities/grading-pipeline-config.entity';

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
  entities: [
    AccountEntity,
    SemesterEntity,
    CourseEntity,
    ClassEntity,
    EnrollmentEntity,
    RoomEntity,
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
    TeacherReviewEntity,
    GradeExportEntity,
    CalibrationRunEntity,
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
