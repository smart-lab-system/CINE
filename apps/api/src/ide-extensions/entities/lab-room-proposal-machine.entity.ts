import { Check, Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../shared/base.entity';
import type { ComputerStatus } from '../../master-data/entities/computer.entity';
import { LabRoomProposalEntity } from './lab-room-proposal.entity';

@Entity({ name: 'lab_room_proposal_machine' })
@Check('ck_lab_room_proposal_machine_ram_gb', '"ram_gb" > 0')
export class LabRoomProposalMachineEntity extends BaseEntity {
  @Column({ name: 'proposal_id', type: 'uuid' })
  proposalId!: string;

  @ManyToOne(() => LabRoomProposalEntity, (p) => p.machines, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  @JoinColumn({ name: 'proposal_id' })
  proposal!: LabRoomProposalEntity;

  @Column({ name: 'machine_id', type: 'varchar', length: 100 })
  machineId!: string;

  @Column({ type: 'varchar', length: 200 })
  hostname!: string;

  @Column({ type: 'varchar', length: 200 })
  cpu!: string;

  @Column({ name: 'ram_gb', type: 'int' })
  ramGb!: number;

  @Column({ type: 'varchar', length: 200 })
  storage!: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  gpu!: string | null;

  @Column({ type: 'varchar', length: 100 })
  os!: string;

  @Column({ name: 'local_ip', type: 'varchar', length: 64 })
  localIp!: string;

  @Column({ name: 'mac_address', type: 'varchar', length: 17 })
  macAddress!: string;

  @Column({
    type: 'enum',
    enum: ['active', 'maintenance', 'inactive'],
    enumName: 'computer_status',
  })
  status!: ComputerStatus;

  @Column({ name: 'student_mssv', type: 'citext', nullable: true })
  studentMssv!: string | null;

  @Column({ name: 'student_full_name', type: 'varchar', length: 200, nullable: true })
  studentFullName!: string | null;

  @Column({ type: 'varchar', length: 32 })
  role!: string;

  @Column({ name: 'last_seen_at', type: 'timestamptz', nullable: true })
  lastSeenAt!: Date | null;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder!: number;
}
