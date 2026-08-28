import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export const EXAM_EVENT_STATUSES = [
  'draft',
  'scheduled',
  'active',
  'completed',
  'cancelled',
  'aborted',
] as const;

export type ExamEventStatus = (typeof EXAM_EVENT_STATUSES)[number];

export const SESSION_TYPES = ['exam', 'practice'] as const;

export type SessionType = (typeof SESSION_TYPES)[number];

@Entity({ name: 'exam_events' })
export class ExamEventEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'citext' })
  code!: string;

  @Column({ type: 'varchar', length: 250 })
  title!: string;

  @Column({ name: 'subject_id', type: 'uuid' })
  subjectId!: string;

  @Column({
    name: 'session_type',
    type: 'enum',
    enum: SESSION_TYPES,
    enumName: 'session_type',
  })
  sessionType!: SessionType;

  @Column({ name: 'scheduled_start_at', type: 'timestamptz' })
  scheduledStartAt!: Date;

  @Column({ name: 'scheduled_end_at', type: 'timestamptz' })
  scheduledEndAt!: Date;

  @Column({
    name: 'schedule_window',
    type: 'tstzrange',
    insert: false,
    update: false,
  })
  scheduleWindow!: string;

  @Column({ name: 'duration_minutes', type: 'smallint' })
  durationMinutes!: number;

  @Column({
    name: 'policy_template_document_id',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  policyTemplateDocumentId!: string | null;

  @Column({
    name: 'policy_snapshot_document_id',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  policySnapshotDocumentId!: string | null;

  @Column({
    type: 'enum',
    enum: EXAM_EVENT_STATUSES,
    enumName: 'exam_event_status',
    default: 'draft',
  })
  status!: ExamEventStatus;

  @Column({ name: 'actual_start_at', type: 'timestamptz', nullable: true })
  actualStartAt!: Date | null;

  @Column({ name: 'actual_end_at', type: 'timestamptz', nullable: true })
  actualEndAt!: Date | null;

  @Column({ name: 'manifest_sha256', type: 'bytea', nullable: true })
  manifestSha256!: Buffer | null;

  @Column({ name: 'manifest_published_at', type: 'timestamptz', nullable: true })
  manifestPublishedAt!: Date | null;

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
