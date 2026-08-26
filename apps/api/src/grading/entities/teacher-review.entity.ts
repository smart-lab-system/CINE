import { Check, Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../shared/base.entity';
import { AccountEntity } from '../../identity/entities/account.entity';
import { GradingResultEntity } from './grading-result.entity';

// Edits always create a new row here — the original AI output in
// GradingResult is never overwritten (see the guard trigger there).
@Entity({ name: 'teacher_review' })
@Check('ck_teacher_review_final_score', 'final_score >= 0')
export class TeacherReviewEntity extends BaseEntity {
  @Column({ name: 'grading_result_id', type: 'uuid' })
  gradingResultId!: string;

  @ManyToOne(() => GradingResultEntity, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'grading_result_id' })
  gradingResult!: GradingResultEntity;

  @Column({ name: 'teacher_id', type: 'uuid' })
  teacherId!: string;

  @ManyToOne(() => AccountEntity, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'teacher_id' })
  teacher!: AccountEntity;

  @Column({ name: 'final_score', type: 'numeric', precision: 6, scale: 2 })
  finalScore!: string;

  @Column({ name: 'edited_criteria', type: 'jsonb', default: {} })
  editedCriteria!: Record<string, unknown>;

  @Column({ name: 'reviewed_at', type: 'timestamptz', default: () => 'now()' })
  reviewedAt!: Date;
}
