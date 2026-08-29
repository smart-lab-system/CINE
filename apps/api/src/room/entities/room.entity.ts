import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../shared/base.entity';

// Pure logistics metadata — which physical computer lab an exam session is
// scheduled in. Deliberately NOT part of the auth/join path: `Enrollment`
// (course-level) is the sole source of truth for who may join a session
// (CLAUDE.md security rule 1) — a room mix-up must never be able to block
// or grant session access. See ExamSessionEntity.roomId's own comment for
// why that FK is required today but is a provisional, lab-scope
// constraint, not an architectural invariant.
@Entity({ name: 'room' })
export class RoomEntity extends BaseEntity {
  // Same shared-namespace reason as semester.name: rooms are university-wide
  // and writable by any Trưởng khoa.
  @Index('uq_room_name', { unique: true })
  @Column({ type: 'varchar', length: 100 })
  name!: string;

  // Nullable: some rooms may not have a known machine count yet — that
  // must not block creating the room record itself. When set, powers a
  // soft, non-blocking capacity-vs-enrollment warning on the
  // create-exam-session form (never a hard validation error — teachers may
  // have valid reasons for a mismatch, e.g. partial class attendance).
  @Column({ type: 'int', nullable: true })
  capacity!: number | null;
}
