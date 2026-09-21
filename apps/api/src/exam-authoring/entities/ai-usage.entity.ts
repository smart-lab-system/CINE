import { Check, Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { AccountEntity } from '../../identity/entities/account.entity';

/**
 * Một lượt gọi model tốn tiền. KHÔNG chứa nội dung.
 *
 * "Không lưu" của chủ đồ án (spec soạn đề §9) áp cho NỘI DUNG ĐỀ, không áp
 * cho dấu vết vận hành. Thiếu bảng này thì: dashboard chi phí của Admin mù
 * với cả một tính năng, `cost_budget.current_spend_usd` đếm thiếu nên trần
 * chi phí sai, và câu "soạn một đề tốn bao nhiêu" — một con số phải có trong
 * báo cáo, đứng cạnh chi phí mỗi bài chấm — không ai trả lời được.
 *
 * Trước bảng này, token chỉ được GHI LOG rồi thôi (`grading.service.ts` quanh
 * dòng 424). Log xoay vòng; con số đi theo.
 *
 * Bản ghi một lần, không sửa: không `updated_at`, không kế thừa `BaseEntity`
 * — cùng khuôn với `CalibrationRunEntity`.
 */
@Entity({ name: 'ai_usage' })
@Check('ck_ai_usage_tokens', 'input_tokens >= 0 AND output_tokens >= 0')
@Check('ck_ai_usage_cost', 'cost_usd IS NULL OR cost_usd >= 0')
export class AiUsageEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt!: Date;

  @Column({ name: 'teacher_id', type: 'uuid' })
  teacherId!: string;

  @ManyToOne(() => AccountEntity, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'teacher_id' })
  teacher?: AccountEntity;

  /**
   * Tính năng nào tiêu tiền. `'exam_authoring'` là giá trị đầu tiên; nhánh
   * chấm thêm giá trị của nó sau mà không phải đụng schema.
   *
   * Là VARCHAR chứ không enum, cố ý: một enum ở Postgres phải migration mới
   * thêm được giá trị, và đây là chỗ sẽ có thêm giá trị nhiều lần.
   */
  @Column({ type: 'varchar', length: 50 })
  feature!: string;

  @Column({ name: 'model_used', type: 'varchar', length: 100 })
  modelUsed!: string;

  @Column({ name: 'input_tokens', type: 'int' })
  inputTokens!: number;

  @Column({ name: 'output_tokens', type: 'int' })
  outputTokens!: number;

  /**
   * `null` khi chưa có bảng giá cho model đó — KHÔNG phải 0.
   *
   * Ghi 0 làm tổng chi phí nói dối theo hướng an toàn giả: một cột toàn số 0
   * cộng lại vẫn ra 0, và không ai phân biệt được "miễn phí" với "chưa biết".
   */
  @Column({ name: 'cost_usd', type: 'numeric', precision: 10, scale: 6, nullable: true })
  costUsd!: string | null;

  /** Số câu lượt này sinh ra. Lượt sinh lại MỘT câu ghi dòng riêng với `1`. */
  @Column({ name: 'question_count', type: 'int' })
  questionCount!: number;

  @Column({ name: 'verification_status', type: 'varchar', length: 20 })
  verificationStatus!: string;
}
