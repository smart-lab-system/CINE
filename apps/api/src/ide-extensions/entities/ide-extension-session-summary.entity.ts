import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { LabMgmtSessionEntity } from './lab-mgmt-session.entity';

@Entity({ name: 'ide_extension_session_summary' })
export class IdeExtensionSessionSummaryEntity {
  @PrimaryColumn({ name: 'lab_mgmt_session_id', type: 'uuid' })
  labMgmtSessionId!: string;

  @ManyToOne(() => LabMgmtSessionEntity, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'lab_mgmt_session_id' })
  labMgmtSession!: LabMgmtSessionEntity;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @Column({ name: 'machines_scanned', type: 'int', default: 0 })
  machinesScanned!: number;

  @Column({ name: 'machines_with_violations', type: 'int', default: 0 })
  machinesWithViolations!: number;

  @Column({ name: 'effective_extension_count', type: 'int', default: 0 })
  effectiveExtensionCount!: number;

  @Column({ name: 'last_synced_at', type: 'timestamptz' })
  lastSyncedAt!: Date;
}
