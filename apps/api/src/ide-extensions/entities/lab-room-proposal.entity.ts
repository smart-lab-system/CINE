import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { BaseEntity } from '../../shared/base.entity';
import { AccountEntity } from '../../identity/entities/account.entity';
import { RoomEntity } from '../../master-data/entities/room.entity';
import { LabRoomProposalMachineEntity } from './lab-room-proposal-machine.entity';

export type LabRoomProposalStatus = 'pending' | 'accepted' | 'rejected' | 'withdrawn';

@Entity({ name: 'lab_room_proposal' })
export class LabRoomProposalEntity extends BaseEntity {
  @Column({
    type: 'enum',
    enum: ['pending', 'accepted', 'rejected', 'withdrawn'],
    enumName: 'lab_room_proposal_status',
    default: 'pending',
  })
  status!: LabRoomProposalStatus;

  @Column({ type: 'varchar', length: 50 })
  code!: string;

  @Column({ type: 'varchar', length: 150 })
  name!: string;

  @Column({ type: 'int' })
  capacity!: number;

  @Column({ type: 'varchar', length: 100, nullable: true })
  building!: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  floor!: string | null;

  @Column({ name: 'proposed_by_account_id', type: 'uuid' })
  proposedByAccountId!: string;

  @ManyToOne(() => AccountEntity, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'proposed_by_account_id' })
  proposedByAccount!: AccountEntity;

  @Column({ name: 'proposed_by_email', type: 'varchar', length: 255 })
  proposedByEmail!: string;

  @Column({ name: 'proposed_by_display_name', type: 'varchar', length: 200, nullable: true })
  proposedByDisplayName!: string | null;

  @Column({ name: 'lab_mgmt_session_id', type: 'uuid', nullable: true })
  labMgmtSessionId!: string | null;

  @Column({ name: 'machine_count', type: 'int' })
  machineCount!: number;

  @Column({ type: 'text', nullable: true })
  note!: string | null;

  @Column({ name: 'reviewed_by', type: 'uuid', nullable: true })
  reviewedBy!: string | null;

  @ManyToOne(() => AccountEntity, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'reviewed_by' })
  reviewedByAccount!: AccountEntity | null;

  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
  reviewedAt!: Date | null;

  @Column({ name: 'created_room_id', type: 'uuid', nullable: true })
  createdRoomId!: string | null;

  @ManyToOne(() => RoomEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'created_room_id' })
  createdRoom!: RoomEntity | null;

  @OneToMany(() => LabRoomProposalMachineEntity, (m) => m.proposal)
  machines!: LabRoomProposalMachineEntity[];
}
