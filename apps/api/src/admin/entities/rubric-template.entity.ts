import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../shared/base.entity';
import { AccountEntity } from '../../identity/entities/account.entity';

// `departmentId` is intentionally a plain column, not a foreign key:
// tiered Department/Super-Admin is explicitly out of scope for this MVP
// (CLAUDE.md), so there is no department table to reference yet.
@Entity({ name: 'rubric_template' })
export class RubricTemplateEntity extends BaseEntity {
  @Column({ name: 'department_id', type: 'uuid', nullable: true })
  departmentId!: string | null;

  @Column({ type: 'varchar', length: 200 })
  name!: string;

  @Column({ type: 'jsonb', default: [] })
  criteria!: unknown[];

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy!: string;

  @ManyToOne(() => AccountEntity, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'created_by' })
  createdByAccount!: AccountEntity;
}
