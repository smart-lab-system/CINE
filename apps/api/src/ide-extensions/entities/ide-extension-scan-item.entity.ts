import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../shared/base.entity';
import { IdeExtensionScanEntity } from './ide-extension-scan.entity';

export type IdeExtensionVerdict = 'allowed' | 'blocked';
export type IdeExtensionMatchedScope = 'global' | 'course';

@Entity({ name: 'ide_extension_scan_item' })
export class IdeExtensionScanItemEntity extends BaseEntity {
  @Column({ name: 'scan_id', type: 'uuid' })
  scanId!: string;

  @ManyToOne(() => IdeExtensionScanEntity, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'scan_id' })
  scan!: IdeExtensionScanEntity;

  @Column({ name: 'extension_id', type: 'varchar', length: 200 })
  extensionId!: string;

  @Column({ name: 'display_name', type: 'varchar', length: 200, nullable: true })
  displayName!: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  version!: string | null;

  @Column({
    type: 'enum',
    enum: ['allowed', 'blocked'],
    enumName: 'ide_extension_verdict',
  })
  verdict!: IdeExtensionVerdict;

  @Column({
    name: 'matched_scope',
    type: 'enum',
    enum: ['global', 'course'],
    enumName: 'ide_extension_matched_scope',
    nullable: true,
  })
  matchedScope!: IdeExtensionMatchedScope | null;

  @Column({ name: 'is_builtin', type: 'boolean', default: false })
  isBuiltin!: boolean;
}
