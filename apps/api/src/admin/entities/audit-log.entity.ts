import {
  BeforeInsert,
  Check,
  Column,
  Entity,
  Generated,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
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
  // COMPOSITE primary key (occurred_at, id), declared in that order to match
  // the table exactly — Postgres requires a partitioned table's partition key
  // to be part of every unique/primary key, so `id` alone cannot be the PK
  // here.
  //
  // This used to be `@PrimaryGeneratedColumn('uuid') id` alone, which is what
  // the DBML draft says and what a non-partitioned table would use. The
  // decorators are the source of truth `migration:generate` diffs against, so
  // that mismatch made EVERY generated migration — regardless of what it was
  // actually for — carry statements dropping this key and recreating it as
  // PRIMARY KEY (id). Applying one would have broken the partitioning and, with
  // it, the append-only audit trail Security rule 4 depends on. Two migrations
  // on the submission branch had to be trimmed by hand for exactly this.
  //
  // `occurredAt` is declared first because TypeORM orders primary columns by
  // property declaration order, and the live key is (occurred_at, id).
  @PrimaryColumn({ name: 'occurred_at', type: 'timestamptz', default: () => 'now()' })
  occurredAt!: Date;

  @PrimaryColumn({ type: 'uuid' })
  @Generated('uuid')
  id!: string;

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

  /**
   * Supplies `occurredAt` from the application when the caller did not,
   * instead of letting the column's `now()` default do it.
   *
   * The column is `timestamptz`, which Postgres stores at MICROSECOND
   * precision, while a JS `Date` only carries milliseconds. Leaving it to
   * the DB default meant `save()` returned an entity whose `occurredAt`
   * was the stored value truncated — `.246` against a stored `.246458` —
   * so the row could never be found again by its own primary key. Verified
   * against Postgres: `findOne({ id, occurredAt })` returned null for a row
   * that had just been written.
   *
   * A value supplied here is already millisecond-precision, so what is
   * stored and what comes back are the same instant, and the composite key
   * round-trips. The column default stays for raw-SQL inserts.
   */
  @BeforeInsert()
  stampOccurredAt(): void {
    this.occurredAt ??= new Date();
  }
}
