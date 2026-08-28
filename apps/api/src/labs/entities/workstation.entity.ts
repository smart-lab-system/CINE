import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type WorkstationStatus =
  | 'available'
  | 'maintenance'
  | 'broken'
  | 'retired';

export type WorkstationType = 'master' | 'client';

@Entity({ name: 'workstations' })
export class WorkstationEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'lab_id', type: 'uuid' })
  labId!: string;

  @Column({
    name: 'agent_id',
    type: 'uuid',
    insert: false,
    update: false,
  })
  agentId!: string;

  @Column({ name: 'asset_code', type: 'citext' })
  assetCode!: string;

  @Column({ type: 'citext' })
  hostname!: string;

  @Column({ name: 'mac_address', type: 'macaddr', nullable: true })
  macAddress!: string | null;

  @Column({ name: 'static_ip_address', type: 'inet', nullable: true })
  staticIpAddress!: string | null;

  @Column({ name: 'serial_number', type: 'varchar', length: 100, nullable: true })
  serialNumber!: string | null;

  @Column({
    name: 'operating_system',
    type: 'varchar',
    length: 120,
    nullable: true,
  })
  operatingSystem!: string | null;

  @Column({ name: 'is_enabled', type: 'boolean', default: true })
  isEnabled!: boolean;

  @Column({
    type: 'enum',
    enum: ['master', 'client'],
    enumName: 'workstation_type',
    default: 'client',
  })
  type!: WorkstationType;

  @Column({
    type: 'enum',
    enum: ['available', 'maintenance', 'broken', 'retired'],
    enumName: 'workstation_status',
    default: 'available',
  })
  status!: WorkstationStatus;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}
