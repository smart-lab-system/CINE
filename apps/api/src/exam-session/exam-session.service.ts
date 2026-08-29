import { randomInt } from 'crypto';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { ExamSessionEntity } from './entities/exam-session.entity';
import { RequiredDeliverableEntity } from './entities/required-deliverable.entity';
import { CreateExamSessionDto } from './dto/create-exam-session.dto';
import { SearchExamSessionsDto } from './dto/search-exam-sessions.dto';
import {
  ExamSessionResponseDto,
  ExamSessionListItemDto,
  RequiredDeliverableResponseDto,
} from './dto/exam-session-response.dto';
import { ClassService } from '../course/class.service';
import { AttendanceService } from '../agent-connection/attendance.service';
import { AttendanceView } from '../agent-connection/attendance.types';
import { ExamFinalizeReason, ExamSessionEvents } from './exam-session.events';
import {
  DEFAULT_DELIVERABLE_TYPE,
  EXAM_SESSION_CODE_ALPHABET,
  EXAM_SESSION_CODE_LENGTH,
  EXAM_SESSION_CODE_MAX_ATTEMPTS,
} from './exam-session.types';

// Name of the unique index from AddExamSessionNameCode1787795324287 — used
// to tell "the code we guessed collided, try another one" apart from any
// other unique/check violation the transaction might raise.
const UNIQUE_CODE_CONSTRAINT = 'uq_exam_session_code';

@Injectable()
export class ExamSessionService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(ExamSessionEntity)
    private readonly sessions: Repository<ExamSessionEntity>,
    @InjectRepository(RequiredDeliverableEntity)
    private readonly deliverables: Repository<RequiredDeliverableEntity>,
    private readonly events: ExamSessionEvents,
    private readonly classes: ClassService,
    private readonly attendance: AttendanceService,
  ) {}

  /**
   * Creates an exam session and all of its required-deliverable rows in a
   * single transaction — a deliverable insert failing partway through must
   * never leave an orphan exam_session row behind. `code` is generated
   * server-side (uppercase alphanumeric) and retried on a unique-constraint
   * collision; each retry is a fresh transaction attempt, so a collision
   * never leaves a half-written session either.
   */
  async create(
    teacherId: string,
    dto: CreateExamSessionDto,
  ): Promise<ExamSessionResponseDto> {
    // Before any code is generated: 404 for a class that does not exist, 403
    // for a colleague's. `class.teacher_id` is the whole of a lecturer's
    // scope, and this is the only thing standing between them and running an
    // exam for someone else's class.
    const klass = await this.classes.findTaughtBy(dto.classId, teacherId);

    for (let attempt = 1; attempt <= EXAM_SESSION_CODE_MAX_ATTEMPTS; attempt++) {
      const code = this.generateCode();

      try {
        return await this.dataSource.transaction(async (manager) => {
          const session = await manager.save(
            manager.create(ExamSessionEntity, {
              name: dto.name,
              code,
              teacherId,
              classId: klass.id,
              // Derived, never taken from the body — a session whose course did
              // not match its class would make every enrollment check after
              // it ask about the wrong course.
              courseId: klass.courseId,
              roomId: dto.roomId,
              examType: dto.examType,
              startTime: new Date(dto.startTime),
              endTime: new Date(dto.endTime),
              // The column defaults to 'draft' — this demo's scope has no
              // separate "publish" step between creating a session and an
              // agent being able to join it, so a freshly-created session
              // must be immediately joinable. Without this, agent:join
              // rejects with SESSION_NOT_ACTIVE until someone flips the row
              // by hand.
              status: 'active',
            }),
          );

          const savedDeliverables = await manager.save(
            RequiredDeliverableEntity,
            dto.requiredFilenames.map((requiredFilename) =>
              manager.create(RequiredDeliverableEntity, {
                examSessionId: session.id,
                requiredFilename,
                deliverableType: DEFAULT_DELIVERABLE_TYPE,
              }),
            ),
          );

          return this.toResponseDto(session, savedDeliverables);
        });
      } catch (error) {
        const isLastAttempt = attempt >= EXAM_SESSION_CODE_MAX_ATTEMPTS;
        if (!this.isUniqueCodeViolation(error) || isLastAttempt) {
          throw error;
        }
        // Otherwise: collided on `code`, loop again with a freshly
        // generated one.
      }
    }

    // Unreachable — the loop above always either returns or throws.
    throw new ConflictException('Could not generate a unique exam session code');
  }

  /**
   * Reused by the WebSocket gateway (Task 3) on `agent:join` — looks up a
   * session by its join code. The gateway is responsible for upper-casing
   * whatever code it receives before calling this, matching how codes are
   * always stored (see EXAM_SESSION_CODE_ALPHABET).
   */
  async findByCode(code: string): Promise<ExamSessionEntity | null> {
    return this.sessions.findOne({ where: { code } });
  }

  /**
   * Plain lookup with no ownership check — for callers that have already
   * established who is asking by other means. SubmissionService uses it:
   * an agent is not an account, so there is no teacher_id to compare it
   * against; its authority comes from having completed `agent:join` for
   * this exact session (see AgentSocketIdentity).
   *
   * Anything acting on behalf of a logged-in teacher must keep using
   * findByIdForOwner instead.
   */
  async findById(id: string): Promise<ExamSessionEntity | null> {
    return this.sessions.findOne({ where: { id } });
  }

  /**
   * One deliverable, scoped to its session. The scoping is the point: a
   * caller passing a valid deliverable id from a DIFFERENT session must
   * get null, not that other session's row.
   */
  async findDeliverable(
    examSessionId: string,
    requiredDeliverableId: string,
  ): Promise<RequiredDeliverableEntity | null> {
    return this.deliverables.findOne({
      where: { id: requiredDeliverableId, examSessionId },
    });
  }

  /**
   * Reused by the WebSocket gateway (Task 3) to validate/track submissions
   * against the filenames declared for a session.
   */
  async listRequiredDeliverables(
    examSessionId: string,
  ): Promise<RequiredDeliverableEntity[]> {
    return this.deliverables.find({ where: { examSessionId } });
  }

  /**
   * Owner-checked fetch used by `GET /exam-sessions/:id`: 404 if the
   * session doesn't exist at all, 403 if it exists but `teacherId` isn't
   * the owner (`exam_session.teacher_id`).
   */
  async findByIdForOwner(
    id: string,
    teacherId: string,
  ): Promise<ExamSessionResponseDto> {
    const session = await this.findOwnedBy(id, teacherId);
    const deliverables = await this.listRequiredDeliverables(session.id);
    return this.toResponseDto(session, deliverables);
  }

  /**
   * Powers the "Quản lý kỳ thi" list page — owner-scoped (only sessions
   * this teacher created), newest first, paginated. One query with two
   * JOINs (course, room) for the display names, not a query per row.
   */
  async findAllForOwner(
    teacherId: string,
    query: SearchExamSessionsDto,
  ): Promise<{ items: ExamSessionListItemDto[]; total: number }> {
    const [rows, total] = await this.sessions
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.course', 'course')
      .leftJoinAndSelect('s.class', 'class')
      .leftJoinAndSelect('s.room', 'room')
      .where('s.teacherId = :teacherId', { teacherId })
      .orderBy('s.startTime', 'DESC')
      .skip((query.page - 1) * query.pageSize)
      .take(query.pageSize)
      .getManyAndCount();

    const items = rows.map((session) => {
      const item = new ExamSessionListItemDto();
      item.id = session.id;
      item.name = session.name;
      item.code = session.code;
      item.courseName = session.course.name;
      // Null for sessions that predate class_id — the list says so rather
      // than inventing a class they never had.
      item.className = session.class?.name ?? null;
      item.roomName = session.room.name;
      item.examType = session.examType;
      item.startTime = session.startTime;
      item.endTime = session.endTime;
      item.status = session.status;
      return item;
    });

    return { items, total };
  }

  /**
   * THE ONLY place `exam_session.status` is allowed to become
   * 'completed'. Both callers — the scheduled sweep
   * (ExamSessionScheduler) and the teacher's manual
   * POST /exam-sessions/:id/finalize — go through here, so the
   * transition and the broadcast can never drift apart.
   *
   * The guard is `WHERE status = 'active'` inside the UPDATE itself,
   * not a read-then-write: the job tick and a teacher clicking "Chốt
   * bài ngay" can land at the same instant, and only one of them may
   * come away having changed the row. Postgres serializes the two
   * UPDATEs on the row lock, the loser matches zero rows, and
   * `affected` tells us which we were — so `exam:finalize` is
   * broadcast exactly once, never twice.
   *
   * Returns true if THIS call performed the transition. False means
   * the session was already completed (or cancelled/draft/scheduled) —
   * not an error: finalizing an already-finalized session is a no-op
   * by design.
   */
  async finalizeExamSession(
    examSessionId: string,
    reason: ExamFinalizeReason,
  ): Promise<boolean> {
    const result = await this.sessions
      .createQueryBuilder()
      .update(ExamSessionEntity)
      .set({ status: 'completed' })
      .where('id = :id', { id: examSessionId })
      .andWhere('status = :active', { active: 'active' })
      .execute();

    if ((result.affected ?? 0) === 0) {
      return false;
    }

    this.events.publishFinalized({ examSessionId, reason });
    return true;
  }

  /**
   * Sessions whose window has closed but whose status still says
   * 'active' — the scheduled sweep's work list. Returns ids only: the
   * sweep has no use for the rest of the row, and finalizeExamSession
   * re-checks the status atomically anyway, so a row that stops being
   * eligible between this query and that UPDATE is handled correctly
   * (it simply matches zero rows).
   *
   * Backed by idx_exam_session_status_end_time — see
   * AddExamSessionFinalizeIndex. Without it this is a seq scan on every
   * tick, forever, for a query that almost always returns nothing.
   */
  async findFinalizableIds(now: Date): Promise<string[]> {
    const rows = await this.sessions
      .createQueryBuilder('s')
      .select('s.id', 'id')
      .where('s.status = :active', { active: 'active' })
      .andWhere('s.endTime <= :now', { now })
      .getRawMany<{ id: string }>();
    return rows.map((row) => row.id);
  }

  /**
   * Owner-checked manual finalize behind POST /exam-sessions/:id/finalize.
   * Same 404/403 semantics as findByIdForOwner (reused verbatim rather
   * than re-deriving the ownership rule), then delegates the actual
   * transition to finalizeExamSession.
   */
  async finalizeForOwner(
    id: string,
    teacherId: string,
  ): Promise<ExamSessionResponseDto> {
    await this.findByIdForOwner(id, teacherId);
    await this.finalizeExamSession(id, 'manual');
    // Re-read rather than patching the in-memory copy: if the scheduled
    // sweep won the race, the row is already completed and the teacher
    // must still see the true current state, not a guess.
    return this.findByIdForOwner(id, teacherId);
  }

  /**
   * Who is in the room, for the session's owner. 404/403 first, through the
   * same ownership check every other read uses.
   */
  async findAttendanceForOwner(id: string, teacherId: string): Promise<AttendanceView> {
    const session = await this.findOwnedBy(id, teacherId);
    return this.attendance.buildView(session);
  }

  /**
   * Records the headcount: how many students were in the room, and when.
   *
   * It does NOT close the session — a crashed machine must be able to
   * rejoin, and refusing that harms a real student to protect a number.
   * Joins afterwards are marked and visible instead.
   *
   * Recounting mid-exam is allowed on purpose: an invigilator who finds two
   * more students should be able to say so. Recounting after finalize is
   * not, because that number is what the discrepancy check measures
   * against, and moving it afterwards rewrites the answer rather than
   * recording it. The event log is append-only either way, so the evidence
   * survives regardless of the baseline.
   */
  async confirmAttendanceForOwner(
    id: string,
    teacherId: string,
  ): Promise<{ confirmedAt: string; confirmedCount: number }> {
    const session = await this.findOwnedBy(id, teacherId);
    if (session.status === 'completed') {
      throw new ConflictException(
        'Phiên thi đã kết thúc — không thể chốt lại sĩ số sau khi đã chốt bài.',
      );
    }

    const confirmedCount = await this.attendance.countPresent(session.id);
    const confirmedAt = new Date();
    await this.sessions.update(session.id, {
      attendanceConfirmedAt: confirmedAt,
      attendanceConfirmedCount: confirmedCount,
    });

    return { confirmedAt: confirmedAt.toISOString(), confirmedCount };
  }

  /**
   * The ownership rule, in one place. findByIdForOwner returns the response
   * DTO; the attendance paths need the entity itself, and re-deriving 404
   * then 403 a second time is how the two drift apart.
   */
  private async findOwnedBy(id: string, teacherId: string): Promise<ExamSessionEntity> {
    const session = await this.sessions.findOne({ where: { id } });
    if (!session) {
      throw new NotFoundException('Exam session not found');
    }
    if (session.teacherId !== teacherId) {
      throw new ForbiddenException('You do not own this exam session');
    }
    return session;
  }

  private generateCode(): string {
    let code = '';
    for (let i = 0; i < EXAM_SESSION_CODE_LENGTH; i++) {
      code += EXAM_SESSION_CODE_ALPHABET[randomInt(EXAM_SESSION_CODE_ALPHABET.length)];
    }
    return code;
  }

  private isUniqueCodeViolation(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) {
      return false;
    }
    // TypeORM's QueryFailedError copies the driver error's fields (code,
    // constraint, detail, ...) directly onto itself — same shape
    // PostgresExceptionFilter reads `.code` off of.
    const driverError = error as QueryFailedError & {
      code?: string;
      constraint?: string;
    };
    return (
      driverError.code === '23505' &&
      driverError.constraint === UNIQUE_CODE_CONSTRAINT
    );
  }

  private toResponseDto(
    session: ExamSessionEntity,
    deliverables: RequiredDeliverableEntity[],
  ): ExamSessionResponseDto {
    const dto = new ExamSessionResponseDto();
    dto.id = session.id;
    dto.name = session.name;
    dto.code = session.code;
    dto.teacherId = session.teacherId;
    dto.courseId = session.courseId;
    dto.classId = session.classId;
    dto.roomId = session.roomId;
    dto.examType = session.examType;
    dto.startTime = session.startTime;
    dto.endTime = session.endTime;
    dto.status = session.status;
    dto.requiredDeliverables = deliverables.map((deliverable) => {
      const view = new RequiredDeliverableResponseDto();
      view.id = deliverable.id;
      view.requiredFilename = deliverable.requiredFilename;
      view.deliverableType = deliverable.deliverableType;
      return view;
    });
    return dto;
  }
}
