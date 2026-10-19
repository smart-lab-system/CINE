import { Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { BaseEntity } from '../../shared/base.entity';
import { LabMgmtSessionEntity } from './lab-mgmt-session.entity';

export type LabMgmtMachineRole = 'teacher_hub' | 'student_node';

@Entity({ name: 'lab_mgmt_machine' })
@Unique('uq_lab_mgmt_machine_session_machine', ['labMgmtSessionId', 'machineId'])
export class LabMgmtMachineEntity extends BaseEntity {
  @Column({ name: 'lab_mgmt_session_id', type: 'uuid' })
  labMgmtSessionId!: string;

  @ManyToOne(() => LabMgmtSessionEntity, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'lab_mgmt_session_id' })
  labMgmtSession!: LabMgmtSessionEntity;

  @Column({ name: 'machine_id', type: 'varchar', length: 100 })
  machineId!: string;

  @Column({
    type: 'enum',
    enum: ['teacher_hub', 'student_node'],
    enumName: 'lab_mgmt_machine_role',
  })
  role!: LabMgmtMachineRole;

  @Column({ type: 'varchar', length: 200 })
  hostname!: string;

  @Column({ name: 'local_ip', type: 'varchar', length: 64 })
  localIp!: string;

  @Column({ name: 'student_mssv', type: 'citext', nullable: true })
  studentMssv!: string | null;

  @Column({ name: 'last_seen_at', type: 'timestamptz' })
  lastSeenAt!: Date;
}
