import { Check, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { AccountEntity } from '../../identity/entities/account.entity';

export type AuditActorType = 'user' | 'system';

// Mandatory: any score edit after GradingResult.status = finalized must be
// recorded here (CLAUDE.md Security rule 4) — enforced at the application
// layer (the service performing the edit), not by a DB trigger, since
// "was this specific edit logged" isn't expressible as a table constraint.
//
// `actorId` is nullable (with `actorType` distinguishing 'user' from
// 'system') rather than the DBML draft's NOT NULL `actor_id` — CLAUDE.md's
// flow has real system-triggered events with no human actor (the server
// auto-broadcasting "finalize" at the scheduled time, auto-flagging low
// AI confidence) that still need an audit trail.
//
// Append-only and partitioned by `occurredAt` — enforced/created in the
// hand-written migration, not expressible as entity decorators. No
// BaseEntity: an append-only log has no `updatedAt`.
@Entity({ name: 'audit_log' })
@Index('idx_audit_log_actor_time', ['actorId', 'occurredAt'])
@Index('idx_audit_log_target_time', ['targetType', 'targetId', 'occurredAt'])
@Index('idx_audit_log_action_time', ['action', 'occurredAt'])
@Check(
  'ck_audit_log_actor',
  "(actor_type = 'user' AND actor_id IS NOT NULL) OR (actor_type = 'system' AND actor_id IS NULL)",
)
export class AuditLogEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'occurred_at', type: 'timestamptz', default: () => 'now()' })
  occurredAt!: Date;

  @Column({
    name: 'actor_type',
    type: 'enum',
    enum: ['user', 'system'],
    enumName: 'audit_actor_type',
    default: 'system',
  })
  actorType!: AuditActorType;

  @Column({ name: 'actor_id', type: 'uuid', nullable: true })
  actorId!: string | null;

  @ManyToOne(() => AccountEntity, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'actor_id' })
  actor!: AccountEntity | null;

  @Column({ type: 'varchar', length: 80 })
  action!: string;

  @Column({ name: 'target_type', type: 'varchar', length: 80 })
  targetType!: string;

  @Column({ name: 'target_id', type: 'uuid' })
  targetId!: string;

  @Column({ name: 'old_value', type: 'jsonb', default: {} })
  oldValue!: Record<string, unknown>;

  @Column({ name: 'new_value', type: 'jsonb', default: {} })
  newValue!: Record<string, unknown>;
}
