import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../shared/base.entity';
import { AccountEntity } from '../../identity/entities/account.entity';
import { CourseEntity } from '../../course/entities/course.entity';
import { DeliverableType } from '../../exam-session/entities/required-deliverable.entity';

export type GradingPipelineScope = 'global' | 'course';

// Operationalizes CLAUDE.md's "model cascade" (cheap model first, escalate
// only the low-confidence remainder to a stronger model) as admin-editable
// config instead of a hardcoded constant. `scopeId` is nullable and only
// ever points at a course (unlike CostBudget/RubricTemplate's scope
// columns, this one has a single possible target, so a real FK is safe).
@Entity({ name: 'grading_pipeline_config' })
@Index(
  'uq_grading_pipeline_config_scope_deliverable',
  ['scopeType', 'scopeId', 'deliverableType'],
  { unique: true },
)
@Check(
  'ck_grading_pipeline_config_scope',
  "(scope_type = 'global' AND scope_id IS NULL) OR (scope_type = 'course' AND scope_id IS NOT NULL)",
)
export class GradingPipelineConfigEntity extends BaseEntity {
  @Column({
    name: 'scope_type',
    type: 'enum',
    enum: ['global', 'course'],
    enumName: 'grading_pipeline_scope',
  })
  scopeType!: GradingPipelineScope;

  @Column({ name: 'scope_id', type: 'uuid', nullable: true })
  scopeId!: string | null;

  @ManyToOne(() => CourseEntity, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'scope_id' })
  scope!: CourseEntity | null;

  // Reuses required_deliverable's `deliverable_type` Postgres enum — same
  // set of values, one config row per deliverable type per scope.
  @Column({
    name: 'deliverable_type',
    type: 'enum',
    enum: ['document', 'code_project', 'image'],
    enumName: 'deliverable_type',
  })
  deliverableType!: DeliverableType;

  @Column({ name: 'primary_model', type: 'varchar', length: 100 })
  primaryModel!: string;

  @Column({ name: 'escalation_model', type: 'varchar', length: 100, nullable: true })
  escalationModel!: string | null;

  @Column({
    name: 'confidence_threshold',
    type: 'numeric',
    precision: 4,
    scale: 3,
    nullable: true,
  })
  confidenceThreshold!: string | null;

  @Column({ name: 'updated_by', type: 'uuid' })
  updatedBy!: string;

  @ManyToOne(() => AccountEntity, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'updated_by' })
  updatedByAccount!: AccountEntity;
}
