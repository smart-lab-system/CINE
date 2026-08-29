import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../shared/base.entity';
import { AccountEntity } from '../../identity/entities/account.entity';
import { ClassEntity } from '../../course/entities/class.entity';
import { ExamSessionEntity } from '../../exam-session/entities/exam-session.entity';
import { RequiredDeliverableEntity } from '../../exam-session/entities/required-deliverable.entity';

export type SubmissionVia = 'normal' | 'backup' | 'manual_pull';
export type SubmissionStatus = 'received' | 'validated' | 'collected' | 'invalid';

// Submission — COLLECTION lifecycle. Stops at collected/invalid; does NOT
// auto-transition into grading (see GradingResult and the state-machine
// boundary CLAUDE.md calls out explicitly). Student-entered name/ID are
// stored directly here — no separate Student table.
//
// homeClass/homeTeacher were originally NOT NULL, on the assumption that
// `agent:join` would have authenticated the student's Enrollment before a
// submission could exist (CLAUDE.md Security rule 1 / Phase 4 step 12).
// That authentication is not built yet: `agent:join` currently accepts any
// studentId with a valid session code, and no Enrollment rows exist for
// real sessions. Keeping the columns NOT NULL would have meant either
// blocking the whole collection pipeline on the Enrollment module or
// inventing a placeholder class/teacher to satisfy the constraint — and
// fabricating a routing value is exactly what "don't guess" forbids,
// since a wrong home class silently routes a submission to the wrong
// teacher with nothing to detect it.
//
// So they are nullable FOR NOW, meaning "not yet routed", and
// MakeSubmissionHomeRoutingNullable documents the same. When Enrollment
// lands: backfill from Enrollment, then restore NOT NULL. Nothing should
// read these as if they were populated before that happens.
@Entity({ name: 'submission' })
@Index(
  'uq_submission_identity',
  ['examSessionId', 'requiredDeliverableId', 'studentMssv'],
  { unique: true },
)
@Check('ck_submission_mssv', "student_mssv ~ '^[A-Za-z0-9]{4,20}$'")
@Check('ck_submission_checksum', "checksum IS NULL OR checksum ~ '^[0-9a-f]{64}$'")
export class SubmissionEntity extends BaseEntity {
  @Column({ name: 'exam_session_id', type: 'uuid' })
  examSessionId!: string;

  @ManyToOne(() => ExamSessionEntity, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'exam_session_id' })
  examSession!: ExamSessionEntity;

  @Column({ name: 'required_deliverable_id', type: 'uuid' })
  requiredDeliverableId!: string;

  @ManyToOne(() => RequiredDeliverableEntity, {
    onDelete: 'RESTRICT',
    nullable: false,
  })
  @JoinColumn({ name: 'required_deliverable_id' })
  requiredDeliverable!: RequiredDeliverableEntity;

  @Column({ name: 'student_mssv', type: 'citext' })
  studentMssv!: string;

  // Whatever the student typed into the agent, kept verbatim. Populated
  // from the fullName captured at `agent:join` rather than re-sent on
  // every submission event — the agent must not get to claim a different
  // name per file.
  @Column({ name: 'student_name_input', type: 'varchar', length: 150 })
  studentNameInput!: string;

  @Column({ name: 'home_class_id', type: 'uuid', nullable: true })
  homeClassId!: string | null;

  @ManyToOne(() => ClassEntity, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'home_class_id' })
  homeClass!: ClassEntity | null;

  @Column({ name: 'home_teacher_id', type: 'uuid', nullable: true })
  homeTeacherId!: string | null;

  @ManyToOne(() => AccountEntity, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'home_teacher_id' })
  homeTeacher!: AccountEntity | null;

  @Column({ name: 'storage_key', type: 'text', nullable: true })
  storageKey!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  checksum!: string | null;

  @Column({ name: 'file_size', type: 'bigint', nullable: true })
  fileSize!: string | null;

  @Column({
    name: 'submitted_via',
    type: 'enum',
    enum: ['normal', 'backup', 'manual_pull'],
    enumName: 'submission_via',
    default: 'normal',
  })
  submittedVia!: SubmissionVia;

  @Column({ name: 'submitted_at', type: 'timestamptz', default: () => 'now()' })
  submittedAt!: Date;

  @Column({
    type: 'enum',
    enum: ['received', 'validated', 'collected', 'invalid'],
    enumName: 'submission_status',
    default: 'received',
  })
  status!: SubmissionStatus;
}
