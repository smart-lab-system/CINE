import { Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { BaseEntity } from '../../shared/base.entity';
import { AccountEntity } from '../../identity/entities/account.entity';
import { IdeExtensionPolicyEntity } from './ide-extension-policy.entity';

export type IdeExtensionApprovalStatus = 'approved' | 'pending' | 'rejected';

@Entity({ name: 'ide_extension_policy_item' })
@Unique('uq_ide_extension_policy_item', ['policyId', 'extensionId'])
export class IdeExtensionPolicyItemEntity extends BaseEntity {
  @Column({ name: 'policy_id', type: 'uuid' })
  policyId!: string;

  @ManyToOne(() => IdeExtensionPolicyEntity, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'policy_id' })
  policy!: IdeExtensionPolicyEntity;

  @Column({ name: 'extension_id', type: 'varchar', length: 200 })
  extensionId!: string;

  @Column({ name: 'display_name', type: 'varchar', length: 200, nullable: true })
  displayName!: string | null;

  @Column({ name: 'min_version', type: 'varchar', length: 50, nullable: true })
  minVersion!: string | null;

  @Column({ name: 'max_version', type: 'varchar', length: 50, nullable: true })
  maxVersion!: string | null;

  @Column({
    name: 'approval_status',
    type: 'enum',
    enum: ['approved', 'pending', 'rejected'],
    enumName: 'ide_extension_approval_status',
  })
  approvalStatus!: IdeExtensionApprovalStatus;

  @Column({ name: 'requested_by', type: 'uuid', nullable: true })
  requestedBy!: string | null;

  @ManyToOne(() => AccountEntity, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'requested_by' })
  requestedByAccount!: AccountEntity | null;

  @Column({ name: 'reviewed_by', type: 'uuid', nullable: true })
  reviewedBy!: string | null;

  @ManyToOne(() => AccountEntity, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'reviewed_by' })
  reviewedByAccount!: AccountEntity | null;

  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
  reviewedAt!: Date | null;

  @Column({ type: 'text', nullable: true })
  note!: string | null;
}
