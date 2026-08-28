import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export const SESSION_STATUSES = [
  'draft',
  'scheduled',
  'active',
  'completed',
  'cancelled',
  'aborted',
] as const;

export type SessionStatus = (typeof SESSION_STATUSES)[number];

@Entity({ name: 'lab_sessions' })
export class LabSessionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'exam_event_id', type: 'uuid' })
  examEventId!: string;

  @Column({ type: 'citext' })
  code!: string;

  @Column({ type: 'varchar', length: 250 })
  title!: string;

  @Column({ name: 'lab_id', type: 'uuid' })
  labId!: string;

  @Column({ name: 'layout_id', type: 'uuid' })
  layoutId!: string;

  // Nullable in the TypeORM map so INSERT can omit times; the BEFORE
  // trigger copies the parent event window before NOT NULL is checked.
  @Column({ name: 'scheduled_start_at', type: 'timestamptz', nullable: true })
  scheduledStartAt!: Date | null;

  @Column({ name: 'scheduled_end_at', type: 'timestamptz', nullable: true })
  scheduledEndAt!: Date | null;

  @Column({
    name: 'schedule_window',
    type: 'tstzrange',
    insert: false,
    update: false,
  })
  scheduleWindow!: string;

  @Column({
    type: 'enum',
    enum: SESSION_STATUSES,
    enumName: 'session_status',
    default: 'draft',
  })
  status!: SessionStatus;

  @Column({ name: 'actual_start_at', type: 'timestamptz', nullable: true })
  actualStartAt!: Date | null;

  @Column({ name: 'actual_end_at', type: 'timestamptz', nullable: true })
  actualEndAt!: Date | null;

  @Column({ name: 'row_version', type: 'bigint', default: 0 })
  rowVersion!: number;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}
