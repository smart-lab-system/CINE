import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../../shared/base.entity';
import { ATTEMPT_OUTCOMES, AttemptOutcome, UNGRADABLE_CLASSES, UngradableClass } from '../grading-model.types';

/**
 * Một lượt chấm (§14.1), cho CẢ HAI đường; với `one_shot` thì `investigation`,
 * `structuredResults`, `challenge` null. Bất biến từ lúc `outcome` khác null
 * (`trg_grading_attempt_immutable`), và không bao giờ bị xoá.
 */
@Entity({ name: 'grading_attempt' })
export class GradingAttemptEntity extends BaseEntity {
  @Column({ name: 'grading_result_id', type: 'uuid' })
  gradingResultId!: string;

  @Column({ name: 'attempt_no', type: 'int' })
  attemptNo!: number;

  @Column({ type: 'enum', enum: ATTEMPT_OUTCOMES, enumName: 'grading_attempt_outcome', nullable: true })
  outcome!: AttemptOutcome | null;

  @Column({ name: 'ungradable_class', type: 'enum', enum: UNGRADABLE_CLASSES, enumName: 'ungradable_class', nullable: true })
  ungradableClass!: UngradableClass | null;

  @Column({ name: 'ungradable_reason', type: 'text', nullable: true })
  ungradableReason!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  investigation!: Record<string, unknown> | null;

  @Column({ name: 'structured_results', type: 'jsonb', nullable: true })
  structuredResults!: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  challenge!: Record<string, unknown> | null;

  @Column({ name: 'model_used', type: 'varchar', length: 200, nullable: true })
  modelUsed!: string | null;

  @Column({ name: 'sandbox_host', type: 'jsonb', nullable: true })
  sandboxHost!: Record<string, unknown> | null;

  @Column({ name: 'tokens_in', type: 'int', nullable: true })
  tokensIn!: number | null;

  @Column({ name: 'tokens_out', type: 'int', nullable: true })
  tokensOut!: number | null;

  @Column({ name: 'cost_usd', type: 'numeric', precision: 10, scale: 4, nullable: true })
  costUsd!: string | null;

  @Column({ name: 'triggered_by', type: 'uuid' })
  triggeredBy!: string;

  @Column({ name: 'started_at', type: 'timestamptz', default: () => 'now()' })
  startedAt!: Date;

  @Column({ name: 'finished_at', type: 'timestamptz', nullable: true })
  finishedAt!: Date | null;
}
