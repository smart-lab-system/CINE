import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { In, Repository } from 'typeorm';
import {
  GRADE_JOB_OPTIONS,
  GRADING_QUEUE,
  GradeSubmissionJob,
} from './grading.queue';
import { GradingResultEntity, GradingResultStatus } from './entities/grading-result.entity';
import { RubricCriterionEntity } from './entities/rubric-criterion.entity';
import { SubmissionEntity } from '../submission/entities/submission.entity';
import { ExamSessionEntity } from '../exam-session/entities/exam-session.entity';
import { RequiredDeliverableEntity } from '../exam-session/entities/required-deliverable.entity';
import { StorageService } from '../storage/storage.service';
import { RubricService } from './rubric.service';
import {
  AI_GRADING_PROVIDER,
  AIGradingProvider,
  GradingRequest,
  enforceScoring,
} from './ai-provider/ai-grading-provider';
import { extractText, GradingInputTooLargeError } from './extract-text';
import { AUTO_APPROVE_CONFIDENCE } from './grading.types';

export interface StartGradingResult {
  rubricId: string;
  rubricVersion: number;
  /**
   * ĐÃ XẾP HÀNG, không phải ĐÃ CHẤM — đổi nghĩa từ 2026-09-11 khi chấm
   * điểm chuyển lên BullMQ. Màn hình gọi route này phải đọc tiến độ từ
   * `GET /exam-sessions/:id/grading-progress`, không được coi response
   * này là "xong".
   */
  queued: number;
  alreadyGraded: number;
}

/**
 * Cảnh báo khi một lượt bấm tạo ra quá nhiều job.
 *
 * Không CHẶN — giảng viên có 150 bài thật thì họ có quyền chấm cả 150.
 * Nhưng với model thật mỗi job là một lời gọi có tính phí, nên một lượt
 * lớn bất thường phải để lại dấu vết đọc được, thay vì chỉ hiện ra ở hoá
 * đơn cuối tháng.
 */
const LARGE_BATCH_WARNING = 100;

/**
 * Số bài mỗi lô khi `startGrading` tạo dòng và xếp hàng.
 *
 * Cùng con số với `INSERT_CHUNK` của `SessionRosterService`, và cố ý:
 * hai chỗ đều là "ghi một lô lớn trong một request đồng bộ", nên chúng
 * nên hỏng ở cùng một ngưỡng chứ không phải hai ngưỡng khác nhau.
 */
const START_GRADING_CHUNK = 100;

/** Cắt một mảng thành các lô kích thước `size`. */
function chunk<T>(rows: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < rows.length; i += size) {
    batches.push(rows.slice(i, i + size));
  }
  return batches;
}

/**
 * Tiến độ chấm của một phiên.
 *
 * `total`/`pending`/`done`/`byStatus` đếm `grading_result` — CHÍNH XÁC
 * theo phiên. `queue` đếm TOÀN hàng đợi và chỉ trả lời "có đang kẹt
 * không"; tách riêng vì trộn chúng lại sẽ cho giảng viên A thấy tiến độ
 * của giảng viên B.
 */
export interface GradingProgress {
  total: number;
  pending: number;
  done: number;
  byStatus: Record<string, number>;
  queue: { waiting: number; active: number; failed: number };
}

/**
 * The GRADING half of the system, and the boundary in front of it.
 *
 * CLAUDE.md is unambiguous that collection and grading are two pipelines
 * joined by one explicit teacher action, and that they must never be one
 * continuous job. That is why nothing here is reachable from the collection
 * path: `startGrading` is called by a controller, from a click, and by
 * nothing else. A submission reaching `collected` triggers exactly nothing.
 */
@Injectable()
export class GradingService {
  private readonly logger = new Logger(GradingService.name);

  constructor(
    @InjectRepository(GradingResultEntity)
    private readonly results: Repository<GradingResultEntity>,
    @InjectRepository(SubmissionEntity)
    private readonly submissions: Repository<SubmissionEntity>,
    @InjectRepository(RubricCriterionEntity)
    private readonly criteria: Repository<RubricCriterionEntity>,
    @InjectRepository(RequiredDeliverableEntity)
    private readonly deliverables: Repository<RequiredDeliverableEntity>,
    private readonly rubrics: RubricService,
    private readonly storage: StorageService,
    @Inject(AI_GRADING_PROVIDER) private readonly provider: AIGradingProvider,
    @InjectQueue(GRADING_QUEUE) private readonly queue: Queue<GradeSubmissionJob>,
  ) {}

  /**
   * The explicit action. Creates one grading result per collected
   * submission and grades them.
   *
   * Only `collected` submissions are eligible: `invalid` means a required
   * file was missing, and grading a submission that is not there produces a
   * zero that reads like a judgement about the work.
   *
   * Idempotent by omission — a submission that already has a result is
   * skipped rather than re-graded. A teacher clicking twice must not
   * produce two AI opinions on one piece of work, and re-grading is a
   * separate decision that would need its own audit trail.
   */
  async startGrading(
    session: ExamSessionEntity,
    teacherId: string,
  ): Promise<StartGradingResult> {
    // The rubric this session is graded against was decided when the paper
    // was written, and is read back here — never resolved now. That is the
    // whole difference from the old findActive(courseId): editing the
    // course's rubric between two exams must not change how the earlier one
    // is graded, and a colleague teaching another class of the same course
    // must not be able to change it from under this session either.
    if (!session.rubricId) {
      throw new BadRequestException(
        'Phiên thi này chưa gắn rubric — hãy gắn rubric trước khi chấm.',
      );
    }
    const rubric = await this.rubrics.findById(session.rubricId);
    if (!rubric) {
      // The FK is ON DELETE RESTRICT, so this is unreachable through any
      // supported path. Reported rather than assumed away: a 400 naming the
      // cause beats a TypeError on the next line.
      throw new BadRequestException(
        'Rubric của phiên thi này không còn tồn tại.',
      );
    }

    const criteria = await this.criteria.find({
      where: { rubricId: rubric.id },
      order: { createdAt: 'ASC' },
    });
    if (criteria.length === 0) {
      throw new BadRequestException('Rubric đang dùng không có tiêu chí nào.');
    }

    const collected = await this.submissions.find({
      where: { examSessionId: session.id, status: 'collected' },
    });
    if (collected.length === 0) {
      return { rubricId: rubric.id, rubricVersion: rubric.version, queued: 0, alreadyGraded: 0 };
    }

    const existing = await this.results.find({
      where: { submissionId: In(collected.map((s) => s.id)) },
      select: { submissionId: true },
    });
    const alreadyGraded = new Set(existing.map((row) => row.submissionId));
    const todo = collected.filter((submission) => !alreadyGraded.has(submission.id));

    // The declared filename is the ONLY place the file's format is
    // recorded. A submission's storage key is
    // `submissions/{session}/{mssv}/{deliverableId}` — deliberately built
    // from ids so nothing user-typed can steer it, which also means it
    // carries no extension and cannot tell an extractor what it is holding.
    const filenames = new Map(
      (await this.deliverables.find({ where: { examSessionId: session.id } })).map(
        (deliverable) => [deliverable.id, deliverable.requiredFilename],
      ),
    );

    // MỌI dòng `grading_result` được tạo NGAY ĐÂY, đồng bộ, trước khi
    // job nào chạy — và đó là phần quan trọng nhất của việc chuyển sang
    // hàng đợi, không phải một chi tiết tối ưu.
    //
    // Nếu để `gradeOne` tạo dòng bên trong worker (như trước khi có hàng
    // đợi, khi nó chạy inline nên không khác gì), thì một job đã xếp
    // hàng mà chưa được nhặt sẽ KHÔNG có dòng nào. `finalizeGrades` truy
    // theo `exam_session_id` và chỉ thấy những bài đã chấm xong — nên nó
    // chốt sạch chúng và 28 bài còn lại trở nên VÔ HÌNH: không bị bỏ
    // qua, không bị chốt 0 điểm, chỉ đơn giản là không có mặt. Worker
    // chấm chúng sau đó và chúng nằm lại ở `auto_approved` vĩnh viễn,
    // trên một phiên mà giảng viên tin là đã đóng.
    //
    // Tạo trước làm `BLOCKS_FINALIZE` (đã có sẵn, gồm `ai_grading`) hoạt
    // động đúng như thiết kế mà không sửa một dòng nào ở
    // TeacherReviewService — guard hỏi DB, nơi sự thật vốn đã ở đó, thay
    // vì phải hỏi Redis.
    //
    // Và nó cho luôn nguồn tiến độ per-session: đếm `grading_result`
    // theo status là chính xác, đầy đủ ngay khi hàm này trả về, và sống
    // sót cả khi Redis bị xoá. `queue.getJobCounts()` KHÔNG dùng được
    // cho việc đó — nó đếm toàn hàng đợi, nên hai giảng viên chấm cùng
    // lúc sẽ thấy tiến độ của nhau.
    // Chia lô — cùng con số và cùng lý do như `SessionRosterService`:
    // việc tạo dòng đồng bộ dời chi phí vào chính request của giảng
    // viên, và một phiên 150 bài là 150 dòng trong MỘT câu lệnh, mỗi
    // dòng kiểm ba khoá ngoại RESTRICT cộng chỉ mục duy nhất mới. Ở quy
    // mô đồ án thì chưa nổ; chia lô loại hẳn class lỗi thay vì để nó
    // chờ tới phiên lớn nhất trong năm.
    for (const batch of chunk(todo, START_GRADING_CHUNK)) {
      await this.results.save(
        batch.map((submission) =>
          this.results.create({
            submissionId: submission.id,
            rubricIdVersion: rubric.id,
            gradingTriggeredBy: teacherId,
            status: 'ai_grading',
          }),
        ),
      );
    }

    // `addBulk` cũng chia lô: nó là MỘT pipeline Redis, nên một lô lớn
    // là một gói lớn và một lần chờ dài.
    for (const batch of chunk(todo, START_GRADING_CHUNK)) {
      await this.queue.addBulk(
        batch.map((submission) => ({
          name: 'grade-submission',
          data: {
            submissionId: submission.id,
            requiredFilename: filenames.get(submission.requiredDeliverableId) ?? '',
            rubricId: rubric.id,
            teacherId,
          } satisfies GradeSubmissionJob,
          opts: {
            ...GRADE_JOB_OPTIONS,
            // jobId theo submission: BullMQ bỏ qua job trùng id, nên bấm
            // "Bắt đầu chấm" hai lần không tạo hai lượt chấm cho một bài —
            // tầng phòng thứ hai sau bộ lọc `alreadyGraded` ở trên.
            // Dấu gạch nối, KHÔNG phải dấu hai chấm: BullMQ 6 từ chối
            // jobId chứa ":" ("Custom Id cannot contain :") — nó dùng ký
            // tự đó cho khoá Redis của chính mình.
            jobId: `grade-${submission.id}`,
          },
        })),
      );
    }

    this.logger.log(
      `session ${session.id}: xếp hàng ${todo.length} bài` +
        (todo.length >= LARGE_BATCH_WARNING
          ? ` — LƯỢT LỚN, mỗi bài là một lời gọi model có tính phí`
          : ''),
    );

    return {
      rubricId: rubric.id,
      rubricVersion: rubric.version,
      // `queued` từ nay nghĩa là ĐÃ XẾP HÀNG, không phải ĐÃ CHẤM. Đây là
      // thay đổi hợp đồng API, và màn hình gọi nó phải đọc tiến độ từ
      // `GET /exam-sessions/:id/grading-progress` thay vì tin rằng
      // response này nghĩa là xong.
      queued: todo.length,
      alreadyGraded: alreadyGraded.size,
    };
  }

  /**
   * Tiến độ chấm của MỘT phiên.
   *
   * Đếm `grading_result`, không đếm job: mọi dòng đã tồn tại từ lúc
   * `startGrading` trả về (xem lý do ở đó), nên con số này đầy đủ ngay
   * lập tức và không phụ thuộc Redis còn giữ job hay đã dọn.
   *
   * `queueStuck` là câu hỏi KHÁC, và cố ý tách riêng: nó đọc
   * `getJobCounts()`, vốn đếm TOÀN hàng đợi chứ không theo phiên. Trộn
   * hai con số đó vào một chỗ sẽ cho giảng viên A thấy tiến độ của giảng
   * viên B.
   */
  /**
   * Điểm vào của hàng đợi — worker gọi hàm này, không gọi `gradeOne`.
   *
   * Tra lại submission theo id: job payload chỉ chứa id vì một entity
   * serialize vào Redis là bản chụp có thể đã cũ khi job được nhặt.
   *
   * IDEMPOTENT Ở ĐÂY, không chỉ ở `startGrading`: một job retry sau khi
   * model đã trả lời nhưng trước khi transition cuối kịp ghi sẽ chạy lại
   * hàm này. `ai_total_score` là bất biến ở tầng DB (Security rule 6,
   * `trg_grading_result_guard_ai_immutable`), nên ghi lần hai KHÔNG âm
   * thầm sai — nó NỔ. Thoát sớm là cách đúng để tránh cái nổ đó, và đây
   * là chỗ dùng ràng buộc DB làm cơ chế phát hiện chứ không chỉ làm cơ
   * chế chặn.
   */
  async gradeOneById(job: GradeSubmissionJob): Promise<void> {
    const result = await this.results.findOne({
      where: { submissionId: job.submissionId },
    });
    if (!result) {
      // Dòng được tạo đồng bộ ở `startGrading`, nên không có nó nghĩa là
      // ai đó đã xoá. Không throw: retry mãi một thứ không quay lại
      // không giúp gì. Ghi lại rồi coi job là xong.
      this.logger.warn(`submission ${job.submissionId} không còn dòng chấm — bỏ job`);
      return;
    }
    if (result.aiTotalScore !== null && result.aiTotalScore !== undefined) {
      this.logger.log(`submission ${job.submissionId} đã có điểm AI — bỏ qua job lặp`);
      return;
    }

    const submission = await this.submissions.findOne({ where: { id: job.submissionId } });
    if (!submission) {
      this.logger.warn(`submission ${job.submissionId} không còn tồn tại — bỏ job`);
      return;
    }

    const criteria = await this.criteria.find({
      where: { rubricId: job.rubricId },
      order: { createdAt: 'ASC' },
    });

    await this.gradeOne(submission, job.requiredFilename, job.rubricId, criteria, result);
  }

  async progress(examSessionId: string): Promise<GradingProgress> {
    const rows = await this.results
      .createQueryBuilder('g')
      .innerJoin('submission', 's', 's.id = g.submission_id')
      .select('g.status', 'status')
      .addSelect('COUNT(*)::int', 'count')
      // Quyền sở hữu đã được controller kiểm bằng `findEntityForOwner`,
      // đúng khuôn mà `finalizeGrades` và `listResults` dùng — không
      // dựng bản sao thứ hai của luật đó ở đây.
      .where('s.exam_session_id = :id', { id: examSessionId })
      .groupBy('g.status')
      .getRawMany<{ status: GradingResultStatus; count: number }>();

    const byStatus = Object.fromEntries(rows.map((row) => [row.status, row.count])) as Record<
      GradingResultStatus,
      number | undefined
    >;
    const total = rows.reduce((sum, row) => sum + row.count, 0);
    const pending = byStatus.ai_grading ?? 0;

    const counts = await this.queue.getJobCounts('waiting', 'active', 'failed');

    return {
      total,
      pending,
      done: total - pending,
      byStatus: Object.fromEntries(rows.map((row) => [row.status, row.count])),
      // TOÀN hàng đợi, không theo phiên — chỉ để trả lời "hàng đợi có
      // đang kẹt không", không bao giờ để vẽ thanh tiến độ.
      queue: {
        waiting: counts.waiting ?? 0,
        active: counts.active ?? 0,
        failed: counts.failed ?? 0,
      },
    };
  }

  /**
   * One submission, through the whole lifecycle.
   *
   * Three separate writes, because the database enforces the transitions
   * one at a time (`trg_grading_result_lifecycle`): a row is created in
   * `ai_grading`, moves to `ai_graded` when the model answers, and only
   * then to `auto_approved` or `flagged_for_review`. Writing the end state
   * directly would be rejected — correctly, because a row that is
   * `auto_approved` without ever having been `ai_grading` never had a model
   * look at it.
   *
   * Chạy như MỘT JOB BullMQ cho mỗi bài — xem `grading.processor.ts`.
   * `startGrading` không còn gọi thẳng hàm này; nó tạo dòng, xếp hàng, và
   * worker gọi `gradeOneById` bên dưới.
   *
   * `existingResult` bắt buộc, không còn tuỳ chọn: dòng đã được tạo đồng
   * bộ ở `startGrading` (xem lý do dài ở đó). Tạo lại ở đây sẽ đụng
   * `uq_grading_result_submission`, và quan trọng hơn là phá đúng tính
   * chất khiến việc tạo trước có giá trị.
   */
  private async gradeOne(
    submission: SubmissionEntity,
    /**
     * The declared name, e.g. `Cau1.docx` or the pattern `{MSSV}_bai.docx`.
     * Only its extension is used, and a pattern's extension is still at the
     * end of it.
     */
    requiredFilename: string,
    rubricId: string,
    criteria: RubricCriterionEntity[],
    result: GradingResultEntity,
  ): Promise<void> {

    let content = '';
    // Hai con số, không phải một. `extractText` là CPU-BOUND — parse
    // docx nghĩa là giải nén zip rồi đi cây XML, và nó chạy trên chính
    // event loop của API. Với `concurrency: 5` thì năm bài cùng extract
    // là năm lần chặn event loop, và mọi request HTTP khác — kể cả
    // `progress()` đang bị poll 2 giây một lần — xếp hàng sau chúng.
    //
    // Lời gọi model thì ngược lại, gần như toàn bộ là chờ mạng, nên nó
    // KHÔNG chặn gì cả. Trộn hai con số vào một dòng log sẽ giấu mất
    // đúng thứ cần biết trước khi bật model thật: nếu extract chiếm
    // phần đáng kể, câu trả lời là `worker_threads` hoặc hạ
    // `concurrency`, chứ không phải mua thêm quota.
    const extractStarted = Date.now();
    try {
      if (!submission.storageKey) {
        // A collected submission with no object behind it should not exist —
        // the lifecycle trigger will not let one through. Treated as
        // unreadable rather than thrown, so one impossible row cannot stop
        // the other thirty-nine from being graded.
        throw new Error('collected submission has no storage key');
      }
      const bytes = await this.storage.getObject(submission.storageKey);
      content = await extractText(bytes, requiredFilename);
    } catch (error) {
      // Not fatal, and not scored zero either: an unreadable file is a fact
      // about the extraction, never a judgement about the work. It reaches
      // the provider as empty content, which is what sends it to a human.
      //
      // Hai ca dẫn tới cùng kết cục nhưng cần hai cách xử lý khác nhau từ
      // phía con người: "quá lớn" nghĩa là em nộp nhầm thứ gì đó (thường
      // là cả thư mục dự án), còn "không đọc được" nghĩa là định dạng
      // này chưa được hỗ trợ. Một dòng log chung sẽ xoá mất khác biệt đó.
      //
      // Nêu id bài nộp, KHÔNG bao giờ nêu nội dung — đây là bài làm của
      // sinh viên.
      this.logger.warn(
        error instanceof GradingInputTooLargeError
          ? `submission ${submission.id} bị bỏ qua chấm tự động: ${error.message}`
          : `could not read ${submission.storageKey} for grading: ${
              error instanceof Error ? error.message : String(error)
            }`,
      );
    }

    const request: GradingRequest = {
      studentMssv: submission.studentMssv,
      content,
      deliverableType: 'document',
      criteria: criteria.map((criterion) => ({
        id: criterion.id,
        description: criterion.description,
        maxPoints: Number(criterion.maxPoints),
      })),
    };

    const extractMs = Date.now() - extractStarted;
    const modelStarted = Date.now();
    const outcome = await this.provider.grade(request);
    // Kích thước nội dung, không phải nội dung. `chars` là thứ dự đoán
    // chi phí token, nên nó thuộc về dòng này.
    this.logger.log(
      `submission ${submission.id}: extract ${extractMs}ms (CPU) / ` +
        `model ${Date.now() - modelStarted}ms (I/O), ${content.length} ký tự`,
    );

    // ĐIỂM DO SERVER TÍNH. Provider chỉ được phép phán đoán (`verdict` +
    // `evidence`); mọi con số đều tính lại ở đây. Xem `enforceScoring` để
    // biết vì sao tin provider tự giác là không đủ.
    const scored = enforceScoring(
      outcome.criterionResults,
      criteria.map((criterion) => ({
        id: criterion.id,
        description: criterion.description,
        maxPoints: Number(criterion.maxPoints),
      })),
    );

    // The AI's own output, written once. A teacher's later edit creates a
    // TeacherReview row instead of touching any of this — Security rule 6,
    // enforced by trg_grading_result_guard_ai_immutable as well as here.
    await this.results.update(result.id, {
      status: 'ai_graded',
      modelUsed: outcome.modelUsed,
      criterionResults: scored.criterionResults,
      aiTotalScore: String(scored.totalScore),
      confidence: String(outcome.confidence),
    });

    const confident = outcome.confidence >= AUTO_APPROVE_CONFIDENCE;
    await this.results.update(result.id, {
      status: confident ? 'auto_approved' : 'flagged_for_review',
      flagForReview: !confident,
    });
  }

  /**
   * Has anything in this session been graded yet.
   *
   * Deliberately NOT `RubricService.hasResults(rubricId)` — that counts
   * results for a rubric VERSION across the whole system, and the question
   * here is about one SESSION. A rubric shared by two sessions would make
   * the wrong one answer true.
   *
   * This is what closes the window on changing a session's rubric: once a
   * result cites a version, swapping the rubric rewrites grading history.
   */
  async hasResultsForSession(examSessionId: string): Promise<boolean> {
    const count = await this.results
      .createQueryBuilder('g')
      .innerJoin('submission', 's', 's.id = g.submission_id')
      .where('s.exam_session_id = :id', { id: examSessionId })
      .limit(1)
      .getCount();
    return count > 0;
  }

  /**
   * One grading result, with ownership already proved.
   *
   * `:id` on the review route is a GradingResult, not an exam session, so the
   * path to the owner is three hops:
   *
   *   grading_result.submission_id → submission.exam_session_id
   *                                → exam_session.teacher_id
   *
   * The rule lives in a method with a NAME rather than inline in a controller.
   * That is the only thing that stops the next route forgetting it.
   *
   * Anchored on `exam_session.teacher_id` — whoever CREATED the session —
   * consistent with `start-grading`. See spec §4.3 for the known tension with
   * `submission.home_teacher_id`, which routes a make-up exam's paper to a
   * different teacher entirely. That is a task of its own, not a decision to
   * make quietly here.
   */
  async findResultForOwner(
    gradingResultId: string,
    teacherId: string,
  ): Promise<GradingResultEntity> {
    const rows = await this.results
      .createQueryBuilder('g')
      .innerJoin('submission', 's', 's.id = g.submission_id')
      .innerJoin('exam_session', 'e', 'e.id = s.exam_session_id')
      .addSelect('e.teacher_id', 'ownerTeacherId')
      .where('g.id = :id', { id: gradingResultId })
      .getRawAndEntities<{ ownerTeacherId: string }>();

    const result = rows.entities[0];
    if (!result) {
      throw new NotFoundException('Grading result not found');
    }
    if (rows.raw[0].ownerTeacherId !== teacherId) {
      throw new ForbiddenException('You do not own the exam session of this result');
    }
    return result;
  }

  /** Results for one session, newest submission first. */
  async listForSession(examSessionId: string): Promise<GradingResultView[]> {
    const rows = await this.results
      .createQueryBuilder('g')
      .innerJoin('submission', 's', 's.id = g.submission_id')
      .addSelect(['s.student_mssv AS "studentMssv"', 's.student_name_input AS "studentName"'])
      .where('s.exam_session_id = :id', { id: examSessionId })
      .orderBy('s.student_mssv', 'ASC')
      .getRawAndEntities<{ studentMssv: string; studentName: string }>();

    // The newest review of each result, in ONE query for the whole list.
    //
    // DISTINCT ON is Postgres's idiom for "latest row per group", and it uses
    // idx_teacher_review_result_time exactly as that index was shaped. The
    // alternative, LEFT JOIN LATERAL, gives the same answer but has to be
    // written as raw SQL spliced into a query-builder chain, which reads worse
    // for no gain.
    const ids = rows.entities.map((entity) => entity.id);
    const latest: LatestReviewRow[] =
      ids.length === 0
        ? []
        : await this.results.manager.query(
            `SELECT DISTINCT ON (tr.grading_result_id)
                    tr.grading_result_id AS "resultId",
                    tr.final_score       AS "finalScore",
                    tr.reviewed_at       AS "reviewedAt",
                    tr.edited_criteria   AS "editedCriteria",
                    a.name               AS "reviewedByName"
             FROM examcollect.teacher_review tr
             JOIN examcollect.account a ON a.id = tr.teacher_id
             WHERE tr.grading_result_id = ANY($1)
             ORDER BY tr.grading_result_id, tr.reviewed_at DESC`,
            [ids],
          );
    const reviewByResult = new Map(latest.map((row) => [row.resultId, row]));

    return rows.entities.map((entity, index) => {
      const review = reviewByResult.get(entity.id);
      return {
        id: entity.id,
        submissionId: entity.submissionId,
        studentMssv: rows.raw[index].studentMssv,
        studentName: rows.raw[index].studentName,
        status: entity.status,
        modelUsed: entity.modelUsed,
        aiTotalScore: entity.aiTotalScore === null ? null : Number(entity.aiTotalScore),
        confidence: entity.confidence === null ? null : Number(entity.confidence),
        flagForReview: entity.flagForReview,
        criterionResults: entity.criterionResults,
        // null means "the AI graded it, nobody has reviewed it" — NOT
        // "the score is zero".
        finalScore: review ? Number(review.finalScore) : null,
        reviewedAt: review ? new Date(review.reviewedAt).toISOString() : null,
        reviewedByName: review ? review.reviewedByName : null,
        editedCriteria: review ? review.editedCriteria : null,
      };
    });
  }
}

/** One row of the DISTINCT ON lookup above. */
interface LatestReviewRow {
  resultId: string;
  /** numeric(6,2) — the driver hands this back as a string. */
  finalScore: string;
  reviewedAt: Date;
  editedCriteria: unknown[];
  reviewedByName: string;
}

export interface GradingResultView {
  id: string;
  submissionId: string;
  studentMssv: string;
  studentName: string;
  status: string;
  modelUsed: string | null;
  aiTotalScore: number | null;
  confidence: number | null;
  flagForReview: boolean;
  criterionResults: unknown[];
  /** numeric(6,2) ở DB; null nghĩa là chưa ai duyệt, KHÔNG phải điểm 0. */
  finalScore: number | null;
  reviewedAt: string | null;
  /** TÊN giảng viên. Không trả id: trang này không dùng tới, và dấu vết
   *  ai-làm-gì thuộc về audit_log chứ không phải payload hiển thị. */
  reviewedByName: string | null;
  editedCriteria: unknown[] | null;
}
