import { randomInt } from 'crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  FindOptionsRelations,
  In,
  QueryFailedError,
  Repository,
} from 'typeorm';
import { ExamSessionEntity } from './entities/exam-session.entity';
import { RequiredDeliverableEntity } from './entities/required-deliverable.entity';
import { RequiredDeliverableEntryEntity } from './entities/required-deliverable-entry.entity';
import { RubricEntity } from '../grading/entities/rubric.entity';
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
  isExamOver,
} from './exam-session.types';
import { ScheduleConflictService } from './schedule-conflict.service';
import { SUBMISSION_GRACE_PERIOD_MS } from '../submission/submission.types';

/**
 * Trần độ dài khoảng ngày của chế độ lịch.
 *
 * 45 ngày phủ thoải mái một tháng xem theo lưới cộng phần tràn hai đầu. Trần
 * tồn tại vì khoảng ngày là đường DUY NHẤT bỏ phân trang: không có nó, một
 * `?from=2000-01-01&to=2100-01-01` sẽ kéo toàn bộ phiên của giảng viên về
 * trong một request.
 */
export const MAX_RANGE_DAYS = 45;

/**
 * Chặn cuối cùng, tính bằng SỐ DÒNG chứ không bằng ngày.
 *
 * Trần ngày ở trên giả định mật độ lịch bình thường. Nếu giả định đó sai —
 * một giảng viên có 600 phiên trong sáu tuần — thì trần ngày không cứu được
 * gì. Hai trần đo hai đại lượng khác nhau, nên cần cả hai.
 */
const RANGE_HARD_CAP = 500;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Đọc cặp `from`/`to`, hoặc `null` nếu không phải chế độ lịch.
 *
 * Ném 400 thay vì lặng lẽ bỏ qua khi cặp bị khuyết một nửa. Bỏ qua sẽ trả về
 * TRANG ĐẦU của toàn bộ lịch sử với HTTP 200, và giao diện lịch sẽ vẽ nó ra
 * như thể đó là tuần đang xem — sai mà không có tín hiệu nào.
 */
function parseRange(query: SearchExamSessionsDto): { from: Date; to: Date } | null {
  if (!query.from && !query.to) {
    return null;
  }
  if (!query.from || !query.to) {
    throw new BadRequestException('Khoảng ngày phải có đủ cả `from` lẫn `to`.');
  }
  const from = new Date(query.from);
  const to = new Date(query.to);
  if (!(to > from)) {
    throw new BadRequestException('`to` phải sau `from`.');
  }
  if (to.getTime() - from.getTime() > MAX_RANGE_DAYS * MS_PER_DAY) {
    throw new BadRequestException(
      `Khoảng ngày tối đa là ${MAX_RANGE_DAYS} ngày.`,
    );
  }
  return { from, to };
}

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
    @InjectRepository(RequiredDeliverableEntryEntity)
    private readonly deliverableEntries: Repository<RequiredDeliverableEntryEntity>,
    // The repository, not RubricService. GradingModule already imports
    // ExamSessionModule; depending on RubricService here would invert that
    // and force forwardRef. One `findOne` is not worth bending the module
    // graph for.
    @InjectRepository(RubricEntity)
    private readonly rubrics: Repository<RubricEntity>,
    private readonly events: ExamSessionEvents,
    private readonly classes: ClassService,
    private readonly attendance: AttendanceService,
    private readonly scheduleConflicts: ScheduleConflictService,
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

    // The rubric this session will be graded against, decided here rather
    // than resolved at grading time. Editing the rubric after this point
    // must not change how this session is graded.
    //
    // RUBRIC GIỜ CÓ CHỦ, và chủ là một giảng viên. Trước đợt thu hẹp master
    // data, kiểm tra ở đây là "rubric có cùng môn với lớp không", vì rubric
    // thuộc về môn và hai giảng viên cùng môn cố ý dùng chung. Sau đợt này
    // môn không còn là một hàng trong bảng, nên phép so sánh duy nhất còn
    // ý nghĩa là chủ sở hữu — và nó chặt hơn hẳn: không ai ghim được rubric
    // của đồng nghiệp vào phiên của mình.
    //
    // Before assertNone: this is bad input (400), a clashing booking is a
    // conflict with existing state (409), and the input error is the one
    // worth reporting first. Before the code-generation loop too, so a
    // code collision does not re-run it.
    let rubric: RubricEntity | null = null;
    if (dto.rubricId) {
      rubric = await this.rubrics.findOne({ where: { id: dto.rubricId } });
      if (!rubric || rubric.teacherId !== teacherId) {
        throw new BadRequestException(
          'Rubric này không thuộc về bạn — hãy chọn một rubric bạn đã soạn.',
        );
      }
    }

    // Advisory, and deliberately outside the retry loop below: the
    // authority on this rule is the pair of EXCLUDE constraints on the
    // table (see AddExamSessionOverlapConstraints), which is what holds
    // when two lecturers submit at the same instant. What this adds is the
    // only thing a constraint cannot: a message that names the room, the
    // session already holding it, and when — so the lecturer knows what to
    // change. Without it they get "This request conflicts with an existing
    // record" from PostgresExceptionFilter and no way to act on it.
    await this.scheduleConflicts.assertNone(
      dto.roomName,
      klass.id,
      teacherId,
      new Date(dto.startTime),
      new Date(dto.endTime),
    );

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
              // Môn LẤY TỪ LỚP, không lấy từ body: một phiên khai một môn
              // khác với lớp của nó sẽ làm mọi phép đối chiếu phía sau nói
              // về nhầm môn. Phòng và học kỳ thì đến thẳng từ biểu mẫu —
              // không còn bảng nào để tra chúng.
              courseName: klass.courseName,
              roomName: dto.roomName,
              // Chụp MỘT LẦN, tại đây (§7.1.5). Cột mang `update: false`
              // nên một `save()` về sau không ghi đè được.
              semesterName: dto.semesterName,
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
              rubricId: rubric?.id ?? null,
            }),
          );

          const savedDeliverables = await manager.save(
            RequiredDeliverableEntity,
            dto.requiredFilenames.map((item) =>
              manager.create(RequiredDeliverableEntity, {
                examSessionId: session.id,
                requiredFilename: item.filename,
                deliverableType: DEFAULT_DELIVERABLE_TYPE,
              }),
            ),
          );

          // Cùng giao dịch với deliverable: một deliverable có mặt mà danh
          // sách bên trong của nó chưa có là một phiên thi kiểm sai. Dựa
          // trên INDEX chứ không trên tên: `savedDeliverables` giữ đúng thứ
          // tự của mảng đưa vào `manager.save` ở trên, và `dto.requiredFilenames`
          // là mảng nguồn của chính lệnh save đó.
          const entryRows = savedDeliverables.flatMap((deliverable, index) =>
            (dto.requiredFilenames[index].entries ?? []).map((entryName) =>
              manager.create(RequiredDeliverableEntryEntity, {
                requiredDeliverableId: deliverable.id,
                entryName,
              }),
            ),
          );
          if (entryRows.length > 0) {
            await manager.save(RequiredDeliverableEntryEntity, entryRows);
          }

          const entriesByDeliverable = await this.loadEntriesByDeliverable(
            savedDeliverables.map((d) => d.id),
            manager,
          );
          return this.toResponseDto(
            session,
            savedDeliverables,
            rubric?.version ?? null,
            entriesByDeliverable,
          );
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
   * Writes a rubric onto an already-created session.
   *
   * The caller has already proved two things this method does not re-check:
   * that they own the session (findEntityForOwner) and that grading has not
   * locked it (GradingService.isGradingLocked, spec §2.3 luật 6). Both live in the
   * controller because the second one belongs to the grading module, and
   * pulling it in here would invert the module dependency.
   *
   * Same single check as create(): the rubric must belong to the lecturer
   * who owns this session.
   */
  async setRubric(
    session: ExamSessionEntity,
    rubricId: string | null,
  ): Promise<ExamSessionResponseDto> {
    let rubric: RubricEntity | null = null;
    if (rubricId) {
      rubric = await this.rubrics.findOne({ where: { id: rubricId } });
      if (!rubric || rubric.teacherId !== session.teacherId) {
        throw new BadRequestException(
          'Rubric này không thuộc về chủ phiên thi.',
        );
      }
    }

    await this.sessions.update(session.id, { rubricId: rubric?.id ?? null });
    const deliverables = await this.listRequiredDeliverables(session.id);
    const entriesByDeliverable = await this.loadEntriesByDeliverable(
      deliverables.map((d) => d.id),
    );
    return this.toResponseDto(
      { ...session, rubricId: rubric?.id ?? null },
      deliverables,
      rubric?.version ?? null,
      entriesByDeliverable,
    );
  }

  /**
   * Reused by the WebSocket gateway (Task 3) on `agent:join` — looks up a
   * session by its join code. The gateway is responsible for upper-casing
   * whatever code it receives before calling this, matching how codes are
   * always stored (see EXAM_SESSION_CODE_ALPHABET).
   */
  async findByCode(code: string): Promise<ExamSessionEntity | null> {
    // Không còn quan hệ nào phải nạp kèm: mẫu tên file có thể chứa {PHONG},
    // và tên phòng nằm ngay trên chính hàng này từ đợt thu hẹp master data.
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
   * `listRequiredDeliverables` cộng `entryName` bên trong từng deliverable
   * dạng nén — ghép hai hàm đã có (`listRequiredDeliverables` +
   * `loadEntriesByDeliverable`, cái sau vốn `private`, đã dùng ở
   * `findByIdForOwner`), KHÔNG viết truy vấn mới.
   *
   * Người gọi cho `agent:join:ack` (`exam-session.gateway.ts`) — nơi
   * `entryName` (một MẪU, xem `RequiredDeliverableEntryEntity`) được RENDER
   * bằng `filenameContext` của đúng sinh viên đó trước khi gửi xuống agent.
   * Hàm này KHÔNG render — nó không có ngữ cảnh của một sinh viên cụ thể,
   * và render sai chỗ là cách một mẫu `{MSSV}` lọt ra ngoài thành chữ.
   */
  async listRequiredDeliverablesWithEntries(
    examSessionId: string,
  ): Promise<{ deliverable: RequiredDeliverableEntity; entries: string[] }[]> {
    const deliverables = await this.listRequiredDeliverables(examSessionId);
    const entriesByDeliverable = await this.loadEntriesByDeliverable(
      deliverables.map((d) => d.id),
    );
    return deliverables.map((deliverable) => ({
      deliverable,
      entries: entriesByDeliverable.get(deliverable.id) ?? [],
    }));
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
    const session = await this.findOwnedBy(id, teacherId, { rubric: true });
    const deliverables = await this.listRequiredDeliverables(session.id);
    const entriesByDeliverable = await this.loadEntriesByDeliverable(
      deliverables.map((d) => d.id),
    );
    return this.toResponseDto(
      session,
      deliverables,
      session.rubric?.version ?? null,
      entriesByDeliverable,
    );
  }

  /**
   * Powers the "Quản lý kỳ thi" list page — owner-scoped (only sessions
   * this teacher created), newest first, paginated. Một truy vấn, một JOIN
   * (lớp) — tên môn, phòng và học kỳ nằm ngay trên hàng.
   */
  async findAllForOwner(
    teacherId: string,
    query: SearchExamSessionsDto,
  ): Promise<{
    items: ExamSessionListItemDto[];
    total: number;
    semesterNames: string[];
  }> {
    const qb = this.sessions
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.class', 'class')
      .where('s.teacherId = :teacherId', { teacherId });

    if (query.search) {
      qb.andWhere('(s.name ILIKE :search OR s.code ILIKE :search)', {
        search: `%${query.search}%`,
      });
    }
    if (query.status) {
      qb.andWhere('s.status = :status', { status: query.status });
    }
    if (query.examType) {
      qb.andWhere('s.examType = :examType', { examType: query.examType });
    }
    // AND vào owner-scope, KHÔNG thay thế nó: bộ lọc kỳ chỉ hẹp tầm nhìn
    // của giảng viên trong phạm vi họ vốn đã được phép thấy. Một `orWhere`
    // ở đây sẽ kéo phiên của giảng viên khác cùng kỳ vào, và kết quả vẫn
    // trông "có dữ liệu" nên không ai nghi ngờ — e2e ghim đúng ca đó.
    //
    // Lọc trên `s.semesterName`, bản chụp lúc tạo phiên. Trước đây đọc
    // `course.semesterId` vì dropdown gửi lên id của bảng `semester`; cả
    // bảng lẫn dropdown đã biến mất. /submissions/overview lọc trên CÙNG
    // cột này, nên hai trang vẫn trả lời giống nhau câu "phiên này thuộc
    // kỳ nào".
    if (query.semesterName) {
      qb.andWhere('s.semesterName = :semesterName', { semesterName: query.semesterName });
    }
    // Lớp: khoá ngoại, nên so bằng id chứ không so chuỗi. Cùng lý do AND
    // như bộ lọc kỳ ngay trên — nó chỉ hẹp tầm nhìn trong phạm vi giảng
    // viên vốn đã được phép thấy.
    if (query.classId) {
      qb.andWhere('s.classId = :classId', { classId: query.classId });
    }

    // Chế độ LỊCH: một khoảng ngày, không phân trang. Xem doc của `from`/`to`
    // trong SearchExamSessionsDto để biết vì sao phân trang phải biến mất ở
    // đây chứ không phải chỉ đặt pageSize thật to.
    const range = parseRange(query);
    if (range) {
      qb.andWhere('s.startTime >= :from AND s.startTime < :to', range);
      // Tăng dần cho lịch: mắt đọc lưới từ sớm tới muộn trong một ô ngày.
      // Danh sách thì ngược lại (phiên mới nhất trước), nên hai chế độ cố ý
      // sắp khác nhau.
      qb.orderBy('s.startTime', 'ASC').take(RANGE_HARD_CAP);
    } else {
      qb.orderBy('s.startTime', 'DESC')
        .skip((query.page - 1) * query.pageSize)
        .take(query.pageSize);
    }

    const [rows, total] = await qb.getManyAndCount();

    const items = rows.map((session) => {
      const item = new ExamSessionListItemDto();
      item.id = session.id;
      item.name = session.name;
      item.code = session.code;
      item.courseName = session.courseName;
      item.className = session.class.name;
      item.roomName = session.roomName;
      item.semesterName = session.semesterName;
      item.examType = session.examType;
      item.startTime = session.startTime;
      item.endTime = session.endTime;
      item.status = session.status;
      return item;
    });

    // Danh sách kỳ để dựng dropdown — tính TỪ TOÀN BỘ phiên của giảng
    // viên, cố ý không chịu ảnh hưởng của các bộ lọc đang bật.
    //
    // Trước đây giao diện tự gom danh sách này từ những trang nó đã tải,
    // nên một kỳ chỉ xuất hiện ở trang 3 thì không chọn được cho tới khi
    // người dùng lật tới trang 3 — mà chính bộ lọc lại chạy trên toàn bộ
    // dữ liệu. Dropdown hẹp hơn thứ nó điều khiển là một lời nói dối.
    const semesterRows: Array<{ semesterName: string }> = await this.sessions
      .createQueryBuilder('s')
      .select('s.semesterName', 'semesterName')
      .distinct(true)
      .where('s.teacherId = :teacherId', { teacherId })
      .getRawMany();

    // Giảm dần: với cách đặt tên thông thường ("HK1 2026-2027") thì sắp
    // chuỗi giảm dần cũng là sắp theo thời gian. Không phải lúc nào cũng
    // đúng, và đó là cái giá của việc bỏ cột ngày cùng bảng `semester`.
    const semesterNames = semesterRows
      .map((row) => row.semesterName)
      .filter((name): name is string => Boolean(name))
      .sort((a, b) => b.localeCompare(a));

    return { items, total, semesterNames };
  }

  /**
   * Hết giờ làm bài: `active → collecting`. Cả lượt quét theo lịch
   * (ExamSessionScheduler) lẫn "Chốt bài ngay" thủ công đều đi qua đây,
   * nên chuyển trạng thái và broadcast không bao giờ lệch nhau.
   *
   * ĐÍCH LÀ `collecting`, KHÔNG phải `completed` — từ 2026-09-11
   * `completed` nghĩa là "đã có người chốt" (spec §3). Nhưng sự kiện
   * phát ra vẫn là `exam:finalize` và vẫn phát Ở ĐÂY: agent nộp bài khi
   * nhận nó, nên dời nó xuống bước xác nhận sẽ khiến agent chỉ nộp sau
   * khi giảng viên bấm — ngược hẳn ý đồ. Tên sự kiện vì thế giờ hơi
   * lệch nghĩa; đổi tên là phá agent đã triển khai, nên giữ (spec §2).
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
   * the session had already left `active` — not an error: finalizing an
   * already-finalized session is a no-op by design.
   */
  async finalizeExamSession(
    examSessionId: string,
    reason: ExamFinalizeReason,
  ): Promise<boolean> {
    const result = await this.sessions
      .createQueryBuilder()
      .update(ExamSessionEntity)
      .set({ status: 'collecting' })
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
   * Phiên còn kẹt ở `collecting` sau khi cửa sổ nhận bài đã đóng — danh
   * sách việc của lượt quét dự phòng. Không có nó thì một phiên giảng
   * viên quên bấm sẽ treo ở `collecting` vĩnh viễn.
   *
   * Mốc là `end_time + grace` THEO LỊCH, không tính từ lúc vào
   * `collecting`: `isAcceptingUploads` dùng đúng công thức đó, và lệch
   * hai bên sẽ tạo ra quãng phiên đã `completed` mà vẫn nhận bài (spec
   * §9.5). Hệ quả có chủ đích: chốt bài sớm thì `collecting` kéo dài
   * tới hết grace của giờ thi theo lịch.
   *
   * Dùng chung idx_exam_session_status_end_time với findFinalizableIds.
   */
  async findCollectionExpiredIds(now: Date): Promise<string[]> {
    const rows = await this.sessions
      .createQueryBuilder('s')
      .select('s.id', 'id')
      .where('s.status = :collecting', { collecting: 'collecting' })
      .andWhere('s.endTime + make_interval(secs => :graceSecs) <= :now', {
        graceSecs: SUBMISSION_GRACE_PERIOD_MS / 1000,
        now,
      })
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
    // `isExamOver`, không phải `=== 'completed'`: chốt lại sĩ số sau khi
    // hết giờ sẽ viết lại chính con số mà báo cáo lệch đang đo dựa vào —
    // và điều đó đúng từ lúc vào `collecting`, không phải chỉ sau khi
    // giảng viên xác nhận. Đây là guard thứ TƯ cùng loại; ba cái kia ở
    // `isAcceptingUploads`, `buildDiscrepancy` và xoá đề thi.
    if (isExamOver(session.status)) {
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
  async findEntityForOwner(id: string, teacherId: string): Promise<ExamSessionEntity> {
    return this.findOwnedBy(id, teacherId);
  }

  private async findOwnedBy(
    id: string,
    teacherId: string,
    relations?: FindOptionsRelations<ExamSessionEntity>,
  ): Promise<ExamSessionEntity> {
    const session = await this.sessions.findOne({ where: { id }, relations });
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

  /**
   * Một dòng cho mỗi `required_deliverable_id`, tên đã render theo thứ tự
   * khai. Không dùng quan hệ `OneToMany` trên `RequiredDeliverableEntity` —
   * mọi entity khác trong module này đều được nạp bằng truy vấn tường
   * minh, không qua relation TypeORM (`listRequiredDeliverables` chính là
   * ví dụ), nên đây giữ đúng khuôn đã có thay vì thêm một cách nạp mới.
   *
   * `manager` tuỳ chọn: truyền vào khi đang ở TRONG một giao dịch (create())
   * để đọc thấy chính những dòng vừa insert — dùng repo đã inject ở đó sẽ
   * đọc qua một kết nối khác, không thấy dữ liệu chưa commit.
   */
  private async loadEntriesByDeliverable(
    deliverableIds: string[],
    manager?: EntityManager,
  ): Promise<Map<string, string[]>> {
    const map = new Map<string, string[]>();
    if (deliverableIds.length === 0) {
      return map;
    }
    const repo = manager
      ? manager.getRepository(RequiredDeliverableEntryEntity)
      : this.deliverableEntries;
    const rows = await repo.find({
      where: { requiredDeliverableId: In(deliverableIds) },
      order: { createdAt: 'ASC' },
    });
    for (const row of rows) {
      const list = map.get(row.requiredDeliverableId) ?? [];
      list.push(row.entryName);
      map.set(row.requiredDeliverableId, list);
    }
    return map;
  }

  /**
   * @param rubricVersion phiên bản của rubric đã ghim. Truyền vào thay vì tra
   * ở đây: cả hai người gọi đều đã cầm sẵn entity rubric (create vừa kiểm nó,
   * findByIdForOwner nạp kèm quan hệ), nên tra lại là một truy vấn thừa.
   * @param entriesByDeliverable danh sách file bên trong của từng
   * deliverable, đã nạp trước bởi người gọi (xem `loadEntriesByDeliverable`).
   * Deliverable không có trong map (hoặc map rỗng) = không khai file bên
   * trong, hiện mảng rỗng.
   */
  private toResponseDto(
    session: ExamSessionEntity,
    deliverables: RequiredDeliverableEntity[],
    rubricVersion: number | null = null,
    entriesByDeliverable: Map<string, string[]> = new Map(),
  ): ExamSessionResponseDto {
    const dto = new ExamSessionResponseDto();
    dto.id = session.id;
    dto.name = session.name;
    dto.code = session.code;
    dto.teacherId = session.teacherId;
    dto.classId = session.classId;
    dto.courseName = session.courseName;
    dto.roomName = session.roomName;
    dto.examType = session.examType;
    dto.semesterName = session.semesterName;
    dto.startTime = session.startTime;
    dto.endTime = session.endTime;
    dto.status = session.status;
    dto.completedAt = session.completedAt ?? null;
    dto.completedBy = session.completedBy ?? null;
    dto.rubricId = session.rubricId;
    dto.rubricVersion = rubricVersion;
    dto.requiredDeliverables = deliverables.map((deliverable) => {
      const view = new RequiredDeliverableResponseDto();
      view.id = deliverable.id;
      view.requiredFilename = deliverable.requiredFilename;
      view.deliverableType = deliverable.deliverableType;
      view.entries = entriesByDeliverable.get(deliverable.id) ?? [];
      return view;
    });
    return dto;
  }
}
