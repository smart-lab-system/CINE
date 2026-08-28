import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export const PARTICIPANT_STATUSES = [
  'registered',
  'checked_in',
  'absent',
  'submitted',
  'disqualified',
] as const;

export type ParticipantStatus = (typeof PARTICIPANT_STATUSES)[number];

@Entity({ name: 'session_participants' })
export class SessionParticipantEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'session_id', type: 'uuid' })
  sessionId!: string;

  @Column({ name: 'layout_id', type: 'uuid' })
  layoutId!: string;

  @Column({ name: 'course_section_id', type: 'uuid' })
  courseSectionId!: string;

  @Column({ name: 'student_id', type: 'uuid' })
  studentId!: string;

  @Column({ name: 'seat_id', type: 'uuid', nullable: true })
  seatId!: string | null;

  @Column({
    type: 'enum',
    enum: PARTICIPANT_STATUSES,
    enumName: 'participant_status',
    default: 'registered',
  })
  status!: ParticipantStatus;

  @Column({ name: 'checked_in_at', type: 'timestamptz', nullable: true })
  checkedInAt!: Date | null;

  @Column({ name: 'checked_out_at', type: 'timestamptz', nullable: true })
  checkedOutAt!: Date | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
