import { Check, Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../shared/base.entity';
import { RubricEntity } from './rubric.entity';

// Graded as a binary/near-binary verdict (met/not met/partially met) at
// grading time, not a direct continuous score — this significantly
// improves AI-vs-human agreement (CLAUDE.md AI Grading Strategy). The
// verdict itself lives in GradingResult.criterionResults, not here — this
// table only defines what's being graded.
@Entity({ name: 'rubric_criterion' })
@Check('ck_rubric_criterion_max_points', 'max_points > 0')
export class RubricCriterionEntity extends BaseEntity {
  @Column({ name: 'rubric_id', type: 'uuid' })
  rubricId!: string;

  @ManyToOne(() => RubricEntity, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'rubric_id' })
  rubric!: RubricEntity;

  @Column({ type: 'text' })
  description!: string;

  @Column({ name: 'max_points', type: 'numeric', precision: 6, scale: 2 })
  maxPoints!: string;

  @Column({ name: 'sort_order', type: 'smallint', default: 0 })
  sortOrder!: number;
}
