import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../shared/base.entity';
import { AccountEntity } from '../../identity/entities/account.entity';
import { SubmissionEntity } from '../../submission/entities/submission.entity';
import { RubricEntity } from './rubric.entity';

export type GradingResultStatus =
  | 'ai_grading'
  | 'ai_graded'
  | 'auto_approved'
  | 'flagged_for_review'
  | 'teacher_reviewed'
  | 'finalized'
  | 'exported';

// Grading result — GRADING lifecycle. A new row is only created when the
// teacher clicks "Start Grading" — never auto-chained right after
// collection. aiTotalScore/criterionResults/modelUsed/confidence are
// immutable once first set (guard trigger added in the hand-written
// migration — not expressible as an entity decorator, CLAUDE.md Security
// rule 6) — a teacher edit always goes through TeacherReview instead of
// overwriting the AI output.
//
// `confidence` is numeric (0-1), not the free-text label the DBML draft
// sketched — it's compared directly against
// GradingPipelineConfig.confidenceThreshold to decide whether to escalate
// to a stronger model, so both sides need to be the same comparable type.
@Entity({ name: 'grading_result' })
@Check('ck_grading_result_confidence', 'confidence IS NULL OR confidence BETWEEN 0 AND 1')
// Một bài = MỘT dòng chấm. Trước 2026-09-12 đây chỉ là quy ước, và
// grading.service.ts viện dẫn một ràng buộc chưa từng tồn tại. Xem
// migration AddGradingResultSubmissionIndex để biết nó bịt TOCTOU nào,
// và vì sao cột này còn cần một chỉ mục cho `progress()`.
@Index('uq_grading_result_submission', ['submissionId'], { unique: true })
export class GradingResultEntity extends BaseEntity {
  @Column({ name: 'submission_id', type: 'uuid' })
  submissionId!: string;

  @ManyToOne(() => SubmissionEntity, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'submission_id' })
  submission!: SubmissionEntity;

  // Named to match CLAUDE.md's schema sketch verbatim — it's a reference to
  // the exact rubric VERSION row used at grading time (rubrics are
  // versioned, never edited in place once graded against).
  @Column({ name: 'rubric_id_version', type: 'uuid' })
  rubricIdVersion!: string;

  @ManyToOne(() => RubricEntity, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'rubric_id_version' })
  rubric!: RubricEntity;

  @Column({ name: 'model_used', type: 'varchar', length: 100, nullable: true })
  modelUsed!: string | null;

  @Column({ name: 'criterion_results', type: 'jsonb', default: [] })
  criterionResults!: unknown[];

  @Column({
    name: 'ai_total_score',
    type: 'numeric',
    precision: 6,
    scale: 2,
    nullable: true,
  })
  aiTotalScore!: string | null;

  @Column({ type: 'numeric', precision: 4, scale: 3, nullable: true })
  confidence!: string | null;

  @Column({ name: 'flag_for_review', type: 'boolean', default: false })
  flagForReview!: boolean;

  @Column({ name: 'grading_triggered_by', type: 'uuid' })
  gradingTriggeredBy!: string;

  @ManyToOne(() => AccountEntity, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'grading_triggered_by' })
  gradingTriggeredByAccount!: AccountEntity;

  @Column({
    name: 'grading_triggered_at',
    type: 'timestamptz',
    default: () => 'now()',
  })
  gradingTriggeredAt!: Date;

  @Column({
    type: 'enum',
    enum: [
      'ai_grading',
      'ai_graded',
      'auto_approved',
      'flagged_for_review',
      'teacher_reviewed',
      'finalized',
      'exported',
    ],
    enumName: 'grading_status',
    default: 'ai_grading',
  })
  status!: GradingResultStatus;
}
