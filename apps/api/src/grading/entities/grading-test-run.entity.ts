import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../../shared/base.entity';

export type TestRunKind = 'generate_statement' | 'generate_answer' | 'test_run';
export type TestRunStatus = 'running' | 'pass' | 'fail' | 'compile_error' | 'unavailable' | 'aborted' | 'dropped_all';

/** Một ca trong kết quả lượt chạy. KHÔNG có stdout; `diff` đã cắt còn 200 ký tự. */
export interface TestRunCaseResult {
  name: string;
  status: string;
  ms: number;
  diff: string | null;
}

/**
 * Một lượt chạy đáp án mẫu trên gói test (G2b-R). Dòng `running` được INSERT trước khi gọi sandbox và chỉ được
 * UPDATE đúng một lần sang trạng thái kết thúc (`trg_grading_test_run_finish_once`); không bao giờ bị xoá.
 * Ghi bằng SQL thô trong `TestRunService` (cùng lý do với `TestBundleService`: trigger là lưới cuối, service kiểm trước).
 */
@Entity({ name: 'grading_test_run' })
export class GradingTestRunEntity extends BaseEntity {
  @Column({ name: 'exam_session_id', type: 'uuid' })
  examSessionId!: string;

  @Column({ name: 'problem_id', type: 'uuid', nullable: true })
  problemId!: string | null;

  /** Null ở lượt sinh đang chạy (gói chưa có). */
  @Column({ name: 'test_bundle_id', type: 'uuid', nullable: true })
  testBundleId!: string | null;

  @Column({ type: 'varchar', length: 20 })
  kind!: TestRunKind;

  /** Có khi chạy MỘT ca; null khi chạy mọi ca đang dùng của gói. */
  @Column({ name: 'case_key', type: 'text', nullable: true })
  caseKey!: string | null;

  /** Băm của mã nguồn đã chạy — đối chiếu với `grading_reference.model_answer_source_sha256`. */
  @Column({ name: 'source_sha256', type: 'varchar', length: 64, nullable: true })
  sourceSha256!: string | null;

  @Column({ name: 'requested_by', type: 'uuid' })
  requestedBy!: string;

  @Column({ name: 'requested_at', type: 'timestamptz', default: () => 'now()' })
  requestedAt!: Date;

  @Column({ name: 'finished_at', type: 'timestamptz', nullable: true })
  finishedAt!: Date | null;

  @Column({ type: 'varchar', length: 20 })
  status!: TestRunStatus;

  /** Dấu vân tay máy sandbox (contract §4). */
  @Column({ type: 'jsonb', nullable: true })
  host!: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  cases!: TestRunCaseResult[] | null;

  /** Chỉ lượt SINH (G2b-R Task 3): phiên bản khuôn prompt, model đã chạy, token và chi phí. Chạy thử không dùng model nên để null. */
  @Column({ name: 'prompt_version', type: 'varchar', length: 40, nullable: true })
  promptVersion!: string | null;

  @Column({ name: 'model_used', type: 'varchar', length: 100, nullable: true })
  modelUsed!: string | null;

  @Column({ name: 'tokens_in', type: 'int', nullable: true })
  tokensIn!: number | null;

  @Column({ name: 'tokens_out', type: 'int', nullable: true })
  tokensOut!: number | null;

  /** NULL khi chưa khai giá model (`GRADING_TIER<n>_PRICE_*`) — KHÔNG phải 0. */
  @Column({ name: 'cost_usd', type: 'numeric', precision: 10, scale: 6, nullable: true })
  costUsd!: string | null;
}
