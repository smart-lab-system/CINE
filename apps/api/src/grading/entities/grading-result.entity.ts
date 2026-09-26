import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../shared/base.entity';
import { AccountEntity } from '../../identity/entities/account.entity';
import { SubmissionEntity } from '../../submission/entities/submission.entity';
import { RubricEntity } from './rubric.entity';
import type { AdvocateOpinion } from '../ai-provider/advocate.types';
import { GRADING_PIPELINES, GradingPipeline, UNGRADABLE_CLASSES, UngradableClass } from '../grading-model.types';

export type GradingResultStatus =
  | 'ai_grading'
  | 'ai_graded'
  | 'auto_approved'
  | 'audit_pending'
  | 'flagged_for_review'
  | 'teacher_reviewed'
  | 'finalized'
  | 'exported';

/**
 * Bốn kết cục của lượt phản biện. Xem docblock của cột `advocateOutcome`
 * để biết vì sao một `advocate_opinion` rỗng là chưa đủ.
 */
export type AdvocateOutcome = 'not_needed' | 'skipped' | 'failed' | 'completed';

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

  /**
   * Ý kiến của Advocate — lượt hỏi thứ hai, mù rubric. CHỈ KIẾN NGHỊ:
   * không bao giờ đổi `aiTotalScore` (spec §2.2).
   *
   * `null` = Advocate KHÔNG chạy cho bài này (cổng ở `applyGuards` không
   * mở), khác hẳn `{}` = chạy và không kiến nghị gì. Khoảng 80% số bài ở
   * `null`, và chính sự phân biệt đó đo được tỉ lệ kích hoạt cổng cho
   * calibration mà không cần thêm cột đếm nào.
   *
   * Bất biến cùng luật với output của Grader — `advocate_opinion` đã được
   * thêm vào `guard_grading_result_ai_immutable` ở migration
   * 1789240000000, nên đây không phải một lời hứa trong comment.
   */
  @Column({ name: 'advocate_opinion', type: 'jsonb', nullable: true })
  advocateOpinion!: AdvocateOpinion | null;

  /**
   * Lượt phản biện đã xảy ra chuyện gì.
   *
   * Tồn tại vì `advocate_opinion = null` mang BA nghĩa — không cần phản
   * biện, cố ý bỏ qua vì phiên thiếu đề bài, và ĐÃ CHẠY VÀ HỎNG — còn
   * `scripts/calibration/export.py` thì đọc cột kia để suy nhánh A/B/C/D.
   * Một lượt phản biện crash vì thế bị xếp vào nhánh B như thể chưa từng
   * được bật, làm bẩn đúng tập dữ liệu dùng để so sánh các nhánh.
   *
   * Cùng nguyên tắc đã ghi ở `ungradableReason` ngay dưới: không suy ra
   * được một ý từ một trường rỗng nếu trường đó cũng mang ý khác. Cột này
   * chỉ mang MỘT ý.
   *
   * `NULL` = chấm trước 2026-09-20, khi hệ thống chưa biết ghi lại điều
   * này. Cố ý không backfill — đó là nhánh `?` của calibration, không phải
   * một giá trị suy ra được.
   */
  @Column({
    name: 'advocate_outcome',
    type: 'enum',
    enum: ['not_needed', 'skipped', 'failed', 'completed'],
    enumName: 'advocate_outcome',
    nullable: true,
  })
  advocateOutcome!: AdvocateOutcome | null;

  /**
   * Ngữ cảnh lượt chấm này THỰC SỰ đọc được — không phải ngữ cảnh đã cấu
   * hình cho phiên.
   *
   * Hai thứ đó lệch nhau từ khi có chuỗi dự phòng: endpoint tương thích
   * OpenAI không gửi được PDF, nên bài do bậc dự phòng chấm chạy ở mức
   * "chỉ có rubric" dù phiên có đủ tài liệu. `grading-readiness` báo theo
   * cấu hình, còn hai cột này là thứ nói ra sự thật.
   *
   * `null` = chấm trước khi hệ thống biết ghi lại điều này, KHÁC `false`
   * = đã đo và không có. Calibration §11.2 cần phân biệt "không biết" với
   * "không có" để không gộp nhầm nhánh A vào nhánh B.
   */
  @Column({ name: 'context_used_question', type: 'boolean', nullable: true })
  contextUsedQuestion!: boolean | null;

  @Column({ name: 'context_used_model_answer', type: 'boolean', nullable: true })
  contextUsedModelAnswer!: boolean | null;

  @Column({ name: 'flag_for_review', type: 'boolean', default: false })
  flagForReview!: boolean;

  /**
   * Vì sao AI KHÔNG chấm được bài này — chỉ khác `null` khi
   * `GradingService.markUngradable` chạy.
   *
   * `NULL` với MỌI dòng khác, kể cả dòng chấm bình thường: không suy ra
   * được "không có lỗi" từ một trường rỗng nếu trường đó cũng có thể có
   * nghĩa "chưa từng chạy tới nhánh này" — hai ý khác nhau, và cột này
   * chỉ mang MỘT ý.
   *
   * Nội dung đã qua `describeError()` ở `grading.processor.ts` trước
   * khi tới đây — KHÔNG bao giờ chứa bài làm của sinh viên hay khoá API
   * gốc, an toàn hiển thị thẳng cho giảng viên.
   */
  @Column({ name: 'ungradable_reason', type: 'text', nullable: true })
  ungradableReason!: string | null;

  /** Gán lúc `startGrading` tạo dòng, từ bài nộp, và không bao giờ đổi — trigger vòng đời chặn đổi (§14.1). */
  @Column({ type: 'enum', enum: GRADING_PIPELINES, enumName: 'grading_pipeline', default: 'one_shot' })
  pipeline!: GradingPipeline;

  /** Null khi kết quả chưa có lượt chấm nào ghi lại — dòng `one_shot` chấm xong trước bước 3d. */
  @Column({ name: 'current_attempt_id', type: 'uuid', nullable: true })
  currentAttemptId!: string | null;

  /** Null khi có điểm. `ungradableReason` giữ làm lời kể cho người đọc (§4.4). */
  @Column({ name: 'ungradable_class', type: 'enum', enum: UNGRADABLE_CLASSES, enumName: 'ungradable_class', nullable: true })
  ungradableClass!: UngradableClass | null;

  @Column({ name: 'audit_sampled', type: 'boolean', default: false })
  auditSampled!: boolean;

  @Column({ name: 'audit_sampled_at', type: 'timestamptz', nullable: true })
  auditSampledAt!: Date | null;

  /** Điểm đã công bố của đường `investigator` — bước 3c ghi. */
  @Column({ name: 'finalized_computation_id', type: 'uuid', nullable: true })
  finalizedComputationId!: string | null;

  /** Người ký tên lên điểm đã công bố; trigger vòng đời đòi nó khi sang `finalized` (§14.4). */
  @Column({ name: 'finalized_by', type: 'uuid', nullable: true })
  finalizedBy!: string | null;

  @Column({ name: 'finalized_at', type: 'timestamptz', nullable: true })
  finalizedAt!: Date | null;

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
      'audit_pending',
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
