import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';
import {
  EXAM_EVENT_STATUSES,
  type ExamEventStatus,
} from './exam-event.entity';

export const ACTOR_TYPES = ['user', 'system'] as const;

export type ActorType = (typeof ACTOR_TYPES)[number];

@Entity({ name: 'exam_event_status_history' })
export class ExamEventStatusHistoryEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Column({ name: 'exam_event_id', type: 'uuid' })
  examEventId!: string;

  @Column({
    name: 'from_status',
    type: 'enum',
    enum: EXAM_EVENT_STATUSES,
    enumName: 'exam_event_status',
    nullable: true,
  })
  fromStatus!: ExamEventStatus | null;

  @Column({
    name: 'to_status',
    type: 'enum',
    enum: EXAM_EVENT_STATUSES,
    enumName: 'exam_event_status',
  })
  toStatus!: ExamEventStatus;

  @Column({ type: 'text' })
  reason!: string;

  @Column({
    name: 'actor_type',
    type: 'enum',
    enum: ACTOR_TYPES,
    enumName: 'actor_type',
  })
  actorType!: ActorType;

  @Column({ name: 'changed_by', type: 'uuid', nullable: true })
  changedBy!: string | null;

  @Column({ name: 'command_id', type: 'uuid' })
  commandId!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
