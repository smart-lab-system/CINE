import { Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { BaseEntity } from '../../shared/base.entity';
import { AccountEntity } from '../../identity/entities/account.entity';
import { IdeExtensionEntity } from './ide-extension.entity';
import type { IdeExtensionApprovalStatus } from './ide-extension-policy-item.entity';

@Entity({ name: 'ide_extension_version' })
@Unique('uq_ide_extension_version', ['extensionPk', 'version'])
export class IdeExtensionVersionEntity extends BaseEntity {
  @Column({ name: 'extension_pk', type: 'uuid' })
  extensionPk!: string;

  @ManyToOne(() => IdeExtensionEntity, (ext) => ext.versions, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  @JoinColumn({ name: 'extension_pk' })
  extension!: IdeExtensionEntity;

  @Column({ type: 'varchar', length: 50 })
  version!: string;

  @Column({ name: 'added_at', type: 'timestamptz' })
  addedAt!: Date;

  @Column({
    name: 'approval_status',
    type: 'enum',
    enum: ['approved', 'pending', 'rejected'],
    enumName: 'ide_extension_approval_status',
  })
  approvalStatus!: IdeExtensionApprovalStatus;

  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true })
  approvedAt!: Date | null;

  @Column({ name: 'approved_by', type: 'uuid', nullable: true })
  approvedBy!: string | null;

  @ManyToOne(() => AccountEntity, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'approved_by' })
  approvedByAccount!: AccountEntity | null;

  @Column({ type: 'text', nullable: true })
  note!: string | null;
}
