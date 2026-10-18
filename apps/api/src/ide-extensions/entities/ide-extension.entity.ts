import { Column, Entity, OneToMany } from 'typeorm';
import { BaseEntity } from '../../shared/base.entity';
import { IdeExtensionVersionEntity } from './ide-extension-version.entity';

@Entity({ name: 'ide_extension' })
export class IdeExtensionEntity extends BaseEntity {
  @Column({ type: 'varchar', length: 200, unique: true })
  identifier!: string;

  @Column({ name: 'display_name', type: 'varchar', length: 200 })
  displayName!: string;

  @Column({ type: 'varchar', length: 200 })
  publisher!: string;

  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt!: Date | null;

  @Column({ name: 'last_released_at', type: 'timestamptz', nullable: true })
  lastReleasedAt!: Date | null;

  @Column({ name: 'marketplace_synced_at', type: 'timestamptz', nullable: true })
  marketplaceSyncedAt!: Date | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @OneToMany(() => IdeExtensionVersionEntity, (v) => v.extension)
  versions!: IdeExtensionVersionEntity[];
}
