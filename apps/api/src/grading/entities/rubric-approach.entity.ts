import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../shared/base.entity';
import { RubricEntity } from './rubric.entity';

@Entity({ name: 'rubric_approach' })
@Index('uq_rubric_approach_key', ['rubricId', 'key'], { unique: true })
export class RubricApproachEntity extends BaseEntity {
  @Index('idx_rubric_approach_rubric')
  @Column({ name: 'rubric_id', type: 'uuid' })
  rubricId!: string;

  @ManyToOne(() => RubricEntity, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'rubric_id' })
  rubric!: RubricEntity;

  @Column({ type: 'text' })
  key!: string;

  @Column({ type: 'text' })
  name!: string;

  @Column({ name: 'sort_order', type: 'smallint', default: 0 })
  sortOrder!: number;
}
