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
// stored directly here — no separate Student table. homeClass/homeTeacher
// are resolved from Enrollment before this row is written (hence NOT
// NULL) — by the time a submission can exist, the agent has already
// authenticated the student's Enrollment at connect time.
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

  @Column({ name: 'student_name_input', type: 'varchar', length: 150 })
  studentNameInput!: string;

  @Column({ name: 'home_class_id', type: 'uuid' })
  homeClassId!: string;

  @ManyToOne(() => ClassEntity, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'home_class_id' })
  homeClass!: ClassEntity;

  @Column({ name: 'home_teacher_id', type: 'uuid' })
  homeTeacherId!: string;

  @ManyToOne(() => AccountEntity, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'home_teacher_id' })
  homeTeacher!: AccountEntity;

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
