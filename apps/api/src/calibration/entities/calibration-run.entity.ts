import { Check, Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { RubricEntity } from '../../grading/entities/rubric.entity';

// Used for the capstone report — compares AI vs. an independent human
// grader (not the system's builder, to avoid bias). A run record, not a
// mutable resource — no BaseEntity/updatedAt needed.
@Entity({ name: 'calibration_run' })
@Check('ck_calibration_run_sample_size', 'sample_size > 0')
@Check(
  'ck_calibration_run_agreement',
  'agreement_score IS NULL OR agreement_score BETWEEN -1 AND 1',
)
export class CalibrationRunEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'rubric_id_version', type: 'uuid' })
  rubricIdVersion!: string;

  @ManyToOne(() => RubricEntity, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'rubric_id_version' })
  rubric!: RubricEntity;

  @Column({ name: 'model_used', type: 'varchar', length: 100, nullable: true })
  modelUsed!: string | null;

  @Column({ name: 'sample_size', type: 'int' })
  sampleSize!: number;

  @Column({
    name: 'agreement_score',
    type: 'numeric',
    precision: 5,
    scale: 4,
    nullable: true,
  })
  agreementScore!: string | null;

  @Column({ name: 'cost_usd', type: 'numeric', precision: 10, scale: 4, nullable: true })
  costUsd!: string | null;

  @Column({ name: 'run_at', type: 'timestamptz', default: () => 'now()' })
  runAt!: Date;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;
}
