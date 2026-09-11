import { Check, Column, Entity, Exclusion, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../shared/base.entity';
import { AccountEntity } from '../../identity/entities/account.entity';
import { CourseEntity } from '../../course/entities/course.entity';
import { ClassEntity } from '../../course/entities/class.entity';
import { RoomEntity } from '../../room/entities/room.entity';
import { RubricEntity } from '../../grading/entities/rubric.entity';

// draft (being set up) -> scheduled (waiting for start_time) -> active
// (start_time has passed, agents may connect) -> collecting (time is up,
// files are coming in) -> completed (a teacher signed off, or the backup
// sweep closed it) / cancelled (aborted before it started).
//
// No longer "inferred, confirm before relying on it": the lifecycle is
// specified and tested as of 2026-09-11 — see
// docs/superpowers/specs/2026-09-11-exam-collection-phase-design.md.
export type ExamSessionStatus =
  | 'draft'
  | 'scheduled'
  | 'active'
  // Hết giờ làm bài, đang gom bài về, giảng viên CHƯA xác nhận. Xem
  // docs/superpowers/specs/2026-09-11-exam-collection-phase-design.md.
  // `completed` từ nay nghĩa là "đã có người chốt", không phải "hết giờ".
  | 'collecting'
  | 'completed'
  | 'cancelled';

// TK = Thường kỳ, GK = Giữa kỳ, CK = Cuối kỳ.
export type ExamType = 'TK' | 'GK' | 'CK';

// Authenticates joining at the COURSE level (via Enrollment), NOT hard-tied
// to a single class/room.
@Entity({ name: 'exam_session' })
@Check('ck_exam_session_time', 'end_time > start_time')
// Two exams cannot share a room, and one class cannot sit two exams at
// once. See AddExamSessionOverlapConstraints for why these are EXCLUDE
// constraints rather than a check in ExamSessionService (short version: a
// pre-INSERT check cannot see a row another request is inserting right
// now, and the service is not the only thing that can write this table).
//
// `'[)'` makes the range half-open, so back-to-back exams do not collide.
// The predicate is what lets a session that finished early release its
// room for the rest of its declared window — rooms are scarce, and holding
// one against a finished exam would be a worse bug than the one these
// constraints prevent. `class_id` is nullable and NULL never satisfies
// `WITH =`, so a session with no class holds no class slot.
//
// It must list `collecting` as well as `completed`, and that is not
// cosmetic: since 2026-09-11 "Chốt bài ngay" lands in `collecting`, so a
// predicate naming only `completed` holds the lab until the hour the exam
// was scheduled to end at. Once collection starts the exam is over —
// files still arrive over the network, but the room itself is free.
// `exam-schedule-conflict.e2e-spec.ts` pins this.
@Exclusion(
  'ex_exam_session_room_overlap',
  `USING gist ("room_id" WITH =, tstzrange("start_time", "end_time", '[)') WITH &&) WHERE ("status" <> 'collecting' AND "status" <> 'completed' AND "status" <> 'cancelled')`,
)
@Exclusion(
  'ex_exam_session_class_overlap',
  `USING gist ("class_id" WITH =, tstzrange("start_time", "end_time", '[)') WITH &&) WHERE ("status" <> 'collecting' AND "status" <> 'completed' AND "status" <> 'cancelled')`,
)
// Backs ExamSessionScheduler's sweep query (status = 'active' AND
// end_time <= now()), which runs every 30 seconds forever. Leading with
// `status` is what makes it useful: the overwhelming majority of rows
// settle at 'completed', so the equality predicate eliminates them first
// and the range scan on end_time only walks the handful still open.
// Without it, every tick is a sequential scan of the whole table for a
// query that almost always returns nothing.
@Index('idx_exam_session_status_end_time', ['status', 'endTime'])
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

  // WHICH CLASS WAS EXPECTED — never who is allowed in. Authentication
  // stays at course level via Enrollment (Security rule 1), which is what
  // makes a make-up exam work: a student enrolled in the course may sit
  // this session even though their home class is a different one. This
  // column only answers 'who should have been here', so the lobby can tell
  // an expected student from a make-up one and count 45 against 46.
  //
  // Nullable for the sessions created before this column existed: they
  // have no expected roster, and the lobby degrades to what it showed
  // then — connected students, no headcount. Every session created through
  // the form carries one.
  @Column({ name: 'class_id', type: 'uuid', nullable: true })
  classId!: string | null;

  @ManyToOne(() => ClassEntity, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'class_id' })
  class!: ClassEntity | null;

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

  /**
   * Tên học kỳ, chụp MỘT LẦN lúc tạo phiên (CLAUDE.md §7.1.5).
   *
   * Vì sao không join qua `course.semester.name` mỗi lần cần: bảng điểm
   * và bài nộp phải tự khai được chúng thuộc kỳ nào, độc lập với mọi
   * thay đổi sau đó ở `Course`/`Semester` — môn đổi tên, lớp bị xoá, kỳ
   * bị sửa ngày. Export lọc thẳng `WHERE semester_name = ?` và đúng
   * vĩnh viễn.
   *
   * Đây là snapshot CÓ CHỦ ĐÍCH, không phải denormalize để tối ưu. Đừng
   * "sửa" nó thành một quan hệ.
   *
   * `update: false` chứ không chỉ là lời hứa trong doc comment. Cùng lập
   * luận mà `trg_grading_result_guard_ai_immutable` dùng cho
   * `ai_total_score`: một bất biến chỉ được ghi trong chú thích thì
   * không phải bất biến. Và khi cột này bị ghi đè, triệu chứng duy nhất
   * là bảng điểm ghi sai kỳ — không lỗi, không cảnh báo, không ai phát
   * hiện.
   *
   * TÊN CỘT là `semester_name`, không phải `semester_code`: bảng
   * `semester` không có cột `code` nào cả — chỉ `name`, `start_date`,
   * `end_date`. Một cột bất biến thì tên phải đúng ngay lần đầu.
   */
  @Column({ name: 'semester_name', type: 'varchar', length: 150, update: false })
  semesterName!: string;

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
    enum: ['draft', 'scheduled', 'active', 'collecting', 'completed', 'cancelled'],
    enumName: 'exam_session_status',
    default: 'draft',
  })
  status!: ExamSessionStatus;

  /**
   * Thời điểm phiên rời `collecting`. KHÔNG dùng `updated_at` thay: cột
   * đó đổi theo mọi UPDATE (gắn rubric, archive, đóng attention), nên
   * dòng cảnh báo "có bài về sau khi bạn xác nhận" sẽ sai ngẫu nhiên.
   */
  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  /**
   * Ai chốt phiên. `NULL` mang nghĩa CỤ THỂ và phải giữ đúng nghĩa đó:
   * **không người nào xác nhận** — lượt quét dự phòng đã đóng nó.
   *
   * Plan C Task 3 đọc chính cột này để biết có được kết luận "vắng thi"
   * hay không: một `@Interval` 30 giây không phải thứ được phép tuyên bố
   * một sinh viên vắng thi (spec §8.1).
   */
  @Column({ name: 'completed_by', type: 'uuid', nullable: true })
  completedBy!: string | null;

  /**
   * The headcount an invigilator took before the exam, and when.
   *
   * An OBSERVATION, not a lock. Confirming does not close the session to
   * new joins: a crashed machine must be able to rejoin, and refusing that
   * harms a real student to protect a number. Joins after this timestamp are
   * marked and visible, never blocked.
   *
   * WHICH students were present is not stored — it is derived from
   * agent_connection_event (latest event per MSSV before this timestamp), so
   * the same fact never lives in two places and cannot disagree with itself.
   * Without the count, "45 present, 46 submissions" is not detectable at all.
   */
  @Column({ name: 'attendance_confirmed_at', type: 'timestamptz', nullable: true })
  attendanceConfirmedAt!: Date | null;

  @Column({ name: 'attendance_confirmed_count', type: 'int', nullable: true })
  attendanceConfirmedCount!: number | null;

  /** Xem AddSessionLifecycleColumns migration cho lý do tách hai cột. */
  @Column({ name: 'archived_at', type: 'timestamptz', nullable: true })
  archivedAt!: Date | null;

  @Column({ name: 'attention_closed_at', type: 'timestamptz', nullable: true })
  attentionClosedAt!: Date | null;

  @Column({ name: 'rubric_id', type: 'uuid', nullable: true })
  rubricId!: string | null;

  @ManyToOne(() => RubricEntity, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'rubric_id' })
  rubric!: RubricEntity | null;
}
