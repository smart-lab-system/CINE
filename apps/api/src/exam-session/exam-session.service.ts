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
    for (let attempt = 1; attempt <= EXAM_SESSION_CODE_MAX_ATTEMPTS; attempt++) {
      const code = this.generateCode();

      try {
        return await this.dataSource.transaction(async (manager) => {
          const session = await manager.save(
            manager.create(ExamSessionEntity, {
              name: dto.name,
              code,
              teacherId,
              courseId: dto.courseId,
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
    const session = await this.sessions.findOne({ where: { id } });
    if (!session) {
      throw new NotFoundException('Exam session not found');
    }
    if (session.teacherId !== teacherId) {
      throw new ForbiddenException('You do not own this exam session');
    }

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
      item.roomName = session.room.name;
      item.examType = session.examType;
      item.startTime = session.startTime;
      item.endTime = session.endTime;
      item.status = session.status;
      return item;
    });

    return { items, total };
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
