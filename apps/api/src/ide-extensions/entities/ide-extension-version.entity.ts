import { Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { BaseEntity } from '../../shared/base.entity';
import { AccountEntity } from '../../identity/entities/account.entity';
import type { IdeExtensionEntity } from './ide-extension.entity';
import type { IdeExtensionApprovalStatus } from './ide-extension-policy-item.entity';

export type IdeExtensionExtractStatus =
  | 'none'
  | 'pending'
  | 'extracting'
  | 'ready'
  | 'failed';

@Entity({ name: 'ide_extension_version' })
@Unique('uq_ide_extension_version', ['extensionPk', 'version'])
export class IdeExtensionVersionEntity extends BaseEntity {
  @Column({ name: 'extension_pk', type: 'uuid' })
  extensionPk!: string;

  @ManyToOne('IdeExtensionEntity', (ext: IdeExtensionEntity) => ext.versions, {
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

  /** Relative object key in the STORAGE_BUCKET — never an absolute URL. */
  @Column({ name: 'storage_key', type: 'varchar', nullable: true })
  storageKey!: string | null;

  @Column({ name: 'artifact_sha256', type: 'varchar', length: 64, nullable: true })
  artifactSha256!: string | null;

  @Column({ name: 'artifact_size_bytes', type: 'bigint', nullable: true })
  artifactSizeBytes!: string | null;

  @Column({ name: 'artifact_uploaded_at', type: 'timestamptz', nullable: true })
  artifactUploadedAt!: Date | null;

  @Column({
    name: 'extract_status',
    type: 'enum',
    enum: ['none', 'pending', 'extracting', 'ready', 'failed'],
    enumName: 'ide_extension_extract_status',
    default: 'none',
  })
  extractStatus!: IdeExtensionExtractStatus;

  @Column({ name: 'extract_tree_key', type: 'varchar', nullable: true })
  extractTreeKey!: string | null;

  @Column({ name: 'extract_error', type: 'text', nullable: true })
  extractError!: string | null;

  @Column({ name: 'extract_started_at', type: 'timestamptz', nullable: true })
  extractStartedAt!: Date | null;

  @Column({ name: 'extract_finished_at', type: 'timestamptz', nullable: true })
  extractFinishedAt!: Date | null;

  @Column({ name: 'extract_entry_count', type: 'int', nullable: true })
  extractEntryCount!: number | null;

  @Column({ name: 'extract_total_bytes', type: 'bigint', nullable: true })
  extractTotalBytes!: string | null;
}
