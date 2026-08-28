import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export interface LabRoomProposalDeviceRecord {
  role: 'tutor' | 'client';
  machineId: string;
  hostname: string;
  macAddress: string;
  osEdition: string;
  osVersion: string;
  serial: string;
  ipv4?: string;
  username?: string;
}

@Entity({ name: 'lab_room_proposals' })
export class LabRoomProposalEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'room_code', type: 'citext' })
  roomCode!: string;

  @Column({ name: 'room_name', type: 'varchar', length: 150 })
  roomName!: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  building!: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  floor!: string | null;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  devices!: LabRoomProposalDeviceRecord[];

  @Column({ name: 'submitted_by', type: 'uuid', nullable: true })
  submittedBy!: string | null;

  @Column({
    name: 'submitted_by_name',
    type: 'varchar',
    length: 150,
    nullable: true,
  })
  submittedByName!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}
