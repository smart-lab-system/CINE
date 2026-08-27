import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../shared/base.entity';
import { AccountEntity } from '../../identity/entities/account.entity';
import { CourseEntity } from '../../course/entities/course.entity';
import { RoomEntity } from '../../room/entities/room.entity';
import { RubricEntity } from '../../grading/entities/rubric.entity';

// CLAUDE.md doesn't enumerate ExamSession.status values explicitly (only
// exam_session/exam_session in the Main Business Flow phases) — this list
// is inferred: draft (being set up) -> scheduled (waiting for start_time)
// -> active (start_time has passed, agents may connect) -> completed
// (finalize processed) / cancelled (aborted before it started). Confirm/
// adjust before relying on it in application code.
export type ExamSessionStatus =
  | 'draft'
  | 'scheduled'
  | 'active'
  | 'completed'
  | 'cancelled';

// TK = Thường kỳ, GK = Giữa kỳ, CK = Cuối kỳ.
export type ExamType = 'TK' | 'GK' | 'CK';

// Authenticates joining at the COURSE level (via Enrollment), NOT hard-tied
// to a single class/room.
@Entity({ name: 'exam_session' })
@Check('ck_exam_session_time', 'end_time > start_time')
export class ExamSessionEntity extends BaseEntity {
  @Column({ type: 'varchar', length: 200 })
  name!: string;

  // Short join code an Agent enters to connect via WebSocket (see
  // agent-connection module). Queried on every `agent:join` — indexed
  // unique so lookups stay fast and no two sessions can collide.
  @Index('uq_exam_session_code', { unique: true })
  @Column({ type: 'varchar', length: 20 })
  code!: string;

  // Required as of the frontend rebuild's Phase 2 (Course is now a real,
  // populated module — the earlier "Course module doesn't exist yet"
  // nullable exception no longer applies). The migration that added this
  // constraint backfilled every pre-existing NULL row to a seeded course
  // before altering the column, since e2e-test-created sessions already
  // existed with no course_id — see AddCourseRoomExamType's `up()`.
  @Column({ name: 'course_id', type: 'uuid' })
  courseId!: string;

  @ManyToOne(() => CourseEntity, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'course_id' })
  course!: CourseEntity;

  // Which physical computer lab this session happens in — pure logistics
  // metadata, NEVER part of the join/auth path (see RoomEntity's comment).
  // Required + RESTRICT is a PROVISIONAL constraint scoped to this
  // capstone's actual deployment (a physical lab) — not an architectural
  // invariant the way course-level auth independence is. A future
  // direction supporting exams with no fixed physical room would need to
  // revisit this nullability, not the auth design.
  @Column({ name: 'room_id', type: 'uuid' })
  roomId!: string;

  @ManyToOne(() => RoomEntity, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'room_id' })
  room!: RoomEntity;

  @Column({
    name: 'exam_type',
    type: 'enum',
    enum: ['TK', 'GK', 'CK'],
    enumName: 'exam_type',
  })
  examType!: ExamType;

  @Column({ name: 'teacher_id', type: 'uuid' })
  teacherId!: string;

  @ManyToOne(() => AccountEntity, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'teacher_id' })
  teacher!: AccountEntity;

  @Column({ name: 'start_time', type: 'timestamptz' })
  startTime!: Date;

  @Column({ name: 'end_time', type: 'timestamptz' })
  endTime!: Date;

  @Column({ name: 'submission_rule', type: 'jsonb', default: {} })
  submissionRule!: Record<string, unknown>;

  @Column({
    type: 'enum',
    enum: ['draft', 'scheduled', 'active', 'completed', 'cancelled'],
    enumName: 'exam_session_status',
    default: 'draft',
  })
  status!: ExamSessionStatus;

  @Column({ name: 'rubric_id', type: 'uuid', nullable: true })
  rubricId!: string | null;

  @ManyToOne(() => RubricEntity, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'rubric_id' })
  rubric!: RubricEntity | null;
}
