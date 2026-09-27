import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { SCORE_COMPUTATION_REASONS, ScoreComputationReason } from '../grading-model.types';

/** *Dòng tính lại* của §2.2 — mỗi lần tính là một dòng MỚI, không sửa dòng cũ. Chỉ thêm. */
@Entity({ name: 'score_computation' })
export class ScoreComputationEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ name: 'grading_result_id', type: 'uuid' })
  gradingResultId!: string;

  @Column({ name: 'attempt_id', type: 'uuid' })
  attemptId!: string;

  /** Null = giảng viên chưa có bảng giá nào: mọi luật chưa có giá (§2.1). */
  @Column({ name: 'price_table_version_id', type: 'uuid', nullable: true })
  priceTableVersionId!: string | null;

  @Column({ name: 'rubric_id_version', type: 'uuid' })
  rubricIdVersion!: string;

  @Column({ name: 'test_bundle_id', type: 'uuid', nullable: true })
  testBundleId!: string | null;

  @Column({ type: 'enum', enum: SCORE_COMPUTATION_REASONS, enumName: 'score_computation_reason' })
  reason!: ScoreComputationReason;

  @Column({ type: 'numeric', precision: 6, scale: 2 })
  score!: string;

  /** Từng lỗi: luật và bản sửa, mức trừ, tính / bỏ vì ngoại lệ / bỏ vì `refuted`, chạm trần. */
  @Column({ type: 'jsonb' })
  breakdown!: Record<string, unknown>;

  /** Null = hệ thống tính (lượt đầu, do worker). */
  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy!: string | null;
}
