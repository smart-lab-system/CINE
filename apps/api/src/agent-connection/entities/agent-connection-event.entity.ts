import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { ExamSessionEntity } from '../../exam-session/entities/exam-session.entity';

export type AgentEventType = 'connected' | 'disconnected' | 'reconnected';

// Events only, NOT heartbeat — "online" status lives in Redis, not here.
// Append-only: no update/delete path is exposed, enforced at the DB level
// by a trigger added in the hand-written migration (decorators can't
// express "this table is append-only"). No BaseEntity here on purpose —
// an append-only log has no business ever being soft-deleted or having an
// `updatedAt`.
@Entity({ name: 'agent_connection_event' })
@Index('idx_agent_connection_event_session', ['examSessionId', 'occurredAt'])
@Index('idx_agent_connection_event_student', ['studentMssv', 'examSessionId'])
export class AgentConnectionEventEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'exam_session_id', type: 'uuid' })
  examSessionId!: string;

  @ManyToOne(() => ExamSessionEntity, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'exam_session_id' })
  examSession!: ExamSessionEntity;

  @Column({ name: 'student_mssv', type: 'citext' })
  studentMssv!: string;

  @Column({
    name: 'event_type',
    type: 'enum',
    enum: ['connected', 'disconnected', 'reconnected'],
    enumName: 'agent_event_type',
  })
  eventType!: AgentEventType;

  @Column({ name: 'joined_late', type: 'boolean', default: false })
  joinedLate!: boolean;

  @Column({ name: 'occurred_at', type: 'timestamptz', default: () => 'now()' })
  occurredAt!: Date;
}
