import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ACTOR_TYPES, type ActorType } from './exam-event-status-history.entity';
import { SESSION_STATUSES, type SessionStatus } from './lab-session.entity';

@Entity({ name: 'session_status_history' })
export class SessionStatusHistoryEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Column({ name: 'session_id', type: 'uuid' })
  sessionId!: string;

  @Column({
    name: 'from_status',
    type: 'enum',
    enum: SESSION_STATUSES,
    enumName: 'session_status',
    nullable: true,
  })
  fromStatus!: SessionStatus | null;

  @Column({
    name: 'to_status',
    type: 'enum',
    enum: SESSION_STATUSES,
    enumName: 'session_status',
  })
  toStatus!: SessionStatus;

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
