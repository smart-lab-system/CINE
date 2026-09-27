import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../shared/base.entity';
import { AccountEntity } from '../../identity/entities/account.entity';
import { GradingResultEntity } from './grading-result.entity';
import type { BulkRule } from '../bulk-rules';
import { EXCEPTION_DIRECTIONS, ExceptionDirection, TEACHER_REVIEW_KINDS, TeacherReviewKind } from '../grading-model.types';

// Edits always create a new row here — the original AI output in
// GradingResult is never overwritten (see the guard trigger there).
@Entity({ name: 'teacher_review' })
@Check('ck_teacher_review_final_score', 'final_score >= 0')
// Serves "the newest review of this result", which every read of the grading
// page runs. Postgres does not index a foreign key's referencing side, so
// without this it is a sequential scan of a table that only grows.
//
// The DESC on reviewed_at is NOT expressible here — see
// AddTeacherReviewResultIndex, which creates the real thing. A later
// migration:generate will read this decorator, see an index without the sort
// order, and propose recreating it; trim that by hand.
@Index('idx_teacher_review_result_time', ['gradingResultId', 'reviewedAt'])
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

  /** Null chỉ ở dòng `error_exception` (`ck_teacher_review_score_by_kind`, §14.1). */
  @Column({ name: 'final_score', type: 'numeric', precision: 6, scale: 2, nullable: true })
  finalScore!: string | null;

  @Column({ type: 'enum', enum: TEACHER_REVIEW_KINDS, enumName: 'teacher_review_kind', default: 'review' })
  kind!: TeacherReviewKind;

  /** Chỉ dòng `error_exception` mang luật và chiều (`ck_teacher_review_exception_target`). */
  @Column({ name: 'error_rule_id', type: 'uuid', nullable: true })
  errorRuleId!: string | null;

  @Column({ type: 'enum', enum: EXCEPTION_DIRECTIONS, enumName: 'error_exception_direction', nullable: true })
  direction!: ExceptionDirection | null;

  @Column({ name: 'edited_criteria', type: 'jsonb', default: {} })
  editedCriteria!: Record<string, unknown>;

  /**
   * Ghi chú cho chính giảng viên. KHÔNG bao giờ gửi cho sinh viên.
   *
   * Tách khỏi `studentFeedback` có chủ đích: gộp làm một thì hoặc giảng
   * viên tự kiểm duyệt ghi chú của mình — và mất đi lý do thật của quyết
   * định — hoặc một câu viết cho mình lọt tới sinh viên.
   */
  @Column({ name: 'private_note', type: 'text', nullable: true })
  privateNote!: string | null;

  /** Nhận xét chính thức. Đi vào phiếu phúc khảo gửi sinh viên. */
  @Column({ name: 'student_feedback', type: 'text', nullable: true })
  studentFeedback!: string | null;

  /**
   * Luật hàng loạt đã sinh ra dòng này. `null` = duyệt tay từng bài.
   *
   * Đây là thứ trả lời được "vì sao em được điểm này" cho một dòng bất kỳ,
   * kể cả dòng chưa bao giờ đi qua audit — và audit chỉ bắn sau khi chốt
   * điểm, nên ca thường gặp nhất (duyệt hàng loạt TRƯỚC khi chốt) không có
   * dấu vết nào khác ngoài cột này.
   */
  @Column({ name: 'applied_rule', type: 'jsonb', nullable: true })
  appliedRule!: BulkRule | null;

  @Column({ name: 'reviewed_at', type: 'timestamptz', default: () => 'now()' })
  reviewedAt!: Date;
}
