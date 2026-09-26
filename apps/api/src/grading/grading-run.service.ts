import { BadRequestException, Injectable, Logger } from '@nestjs/common';
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
import { RubricService } from './rubric.service';
import { AnchorService } from './anchor.service';
import { GRADING_ANCHORS_ENABLED } from './grading.types';
import { pipelineFor } from './pipeline';

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
 * Một LƯỢT chấm: bắt đầu nó, và theo dõi nó tới khi xong.
 *
 * Tách khỏi `GradingService` vì hai trách nhiệm khác nhau, không phải vì
 * kích thước: file kia trả lời "chấm MỘT bài thế nào", file này trả lời
 * "một LƯỢT chấm đang ở đâu". Chúng thay đổi vì những lý do khác nhau và
 * được gọi từ những chỗ khác nhau — `gradeOneById` do worker gọi, còn
 * `startGrading` do một cú bấm của giảng viên.
 *
 * Ranh giới CLAUDE.md vẫn giữ nguyên: không gì ở đây với tới được từ
 * đường thu bài. `startGrading` chỉ được gọi bởi controller, từ một cú
 * bấm, và bởi không gì khác. Một bài nộp đạt `collected` kích hoạt đúng
 * KHÔNG GÌ CẢ.
 */
@Injectable()
export class GradingRunService {
  private readonly logger = new Logger(GradingRunService.name);

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
    private readonly anchors: AnchorService,
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

    // A3 — ĐÓNG BĂNG tập anchor TRƯỚC khi xếp bài nào vào hàng đợi.
    //
    // Thứ tự quan trọng: nếu chụp sau khi job đã chạy thì bài đầu tiên có
    // thể được chấm trước lúc có ảnh chụp, và nó sẽ chấm với tập anchor
    // khác 39 bài còn lại — đúng cái A3 sinh ra để chặn.
    //
    // Chỉ chụp khi anchor BẬT. Ghi một ảnh rỗng lúc đang tắt sẽ bị đọc
    // lại như "lúc đó rubric này chưa có lần sửa nào" vào ngày bật tính
    // năng — một sự thật lịch sử bịa ra, và không ai truy ngược được.
    if (GRADING_ANCHORS_ENABLED) {
      const anchors = await this.anchors.freezeFor(session.id, rubric.id);
      this.logger.log(
        `session ${session.id}: đóng băng ${anchors.length} anchor cho rubric v${rubric.version}`,
      );
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
    // Tên file VÀ loại bài nộp, cùng một lượt đọc: cả hai đều là thứ
    // giảng viên đã khai trước phiên thi, và cả hai đều phải đi theo job
    // để worker không phải hỏi lại DB.
    const deliverables = new Map(
      (await this.deliverables.find({ where: { examSessionId: session.id } })).map(
        (deliverable) => [
          deliverable.id,
          {
            requiredFilename: deliverable.requiredFilename,
            deliverableType: deliverable.deliverableType,
            language: deliverable.language,
          },
        ],
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
            // Gán MỘT lần, từ bài nộp (§14.1). Không có dòng khai báo — không nên xảy ra — thì
            // coi như bài tự luận: đường an toàn là đường không tự quyết.
            pipeline: pipelineFor(
              deliverables.get(submission.requiredDeliverableId) ?? { deliverableType: 'document', language: null },
            ),
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
            requiredFilename:
              deliverables.get(submission.requiredDeliverableId)?.requiredFilename ?? '',
            deliverableType:
              deliverables.get(submission.requiredDeliverableId)?.deliverableType ?? 'document',
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
   * Xếp hàng lại những bài đang treo ở `ai_grading` mà queue không còn job.
   *
   * CÁI CỨU THẬT LÀ DB, KHÔNG PHẢI QUEUE. `grading_result` được tạo đồng
   * bộ TRƯỚC khi xếp hàng (xem `startGrading`), nên sự thật nằm ở Postgres.
   * Redis mất sạch thì các dòng vẫn ở `ai_grading` — chỉ là không còn job
   * nào để chấm chúng, và thanh tiến độ đứng yên mãi mãi.
   *
   * An toàn khi chạy lặp vô hạn, nhờ hai lớp đã có sẵn: `jobId =
   * grade-${submissionId}` khiến BullMQ tự loại trùng, và `gradeOneById`
   * thoát sớm khi `aiTotalScore` đã có.
   *
   * MỘT ROUTE GIẢNG VIÊN BẤM, không phải `@Interval` tự chạy — theo
   * §7.1.3, chấm điểm là hành động chủ động của giảng viên, kể cả khi là
   * chấm lại. Một job nền tự xếp hàng lại sẽ âm thầm tiêu tiền model cho
   * những bài mà có thể không ai còn muốn chấm.
   */
  async regradeStuck(
    session: ExamSessionEntity,
    teacherId: string,
  ): Promise<{ stuck: number; requeued: number }> {
    const stuck = await this.results
      .createQueryBuilder('g')
      .innerJoin('submission', 's', 's.id = g.submission_id')
      .select(['g.id AS id', 'g.submission_id AS submission_id', 'g.rubric_id_version AS rubric_id'])
      .where('s.exam_session_id = :sessionId', { sessionId: session.id })
      .andWhere('g.status = :status', { status: 'ai_grading' })
      .getRawMany<{ id: string; submission_id: string; rubric_id: string }>();

    if (stuck.length === 0) {
      return { stuck: 0, requeued: 0 };
    }

    // Chỉ xếp lại những bài KHÔNG còn job sống. Một bài đang được worker
    // chấm dở cũng ở `ai_grading`, và xếp lại nó là tự tạo ra đúng cái
    // lượt chấm trùng mà `jobId` sinh ra để chặn — chặn được, nhưng lúc
    // đó con số trả về cho giảng viên sẽ nói dối.
    const deliverables = new Map(
      (await this.deliverables.find({ where: { examSessionId: session.id } })).map((d) => [
        d.id,
        { requiredFilename: d.requiredFilename, deliverableType: d.deliverableType },
      ]),
    );
    const submissions = await this.submissions.find({
      where: { id: In(stuck.map((row) => row.submission_id)) },
    });
    const byId = new Map(submissions.map((s) => [s.id, s]));

    let requeued = 0;
    for (const row of stuck) {
      const jobId = `grade-${row.submission_id}`;
      const existing = await this.queue.getJob(jobId);
      if (existing) {
        // `removeOnFail: false` giữ job đã chết hẳn lại trong Redis để
        // điều tra, nên `getJob` trả về chúng y như job đang sống. Bỏ qua
        // theo sự tồn tại thôi thì route này thành vô dụng ĐÚNG LÚC nó
        // cần nhất: bài hết retry là bài chắc chắn treo.
        //
        // Job đã xong thì dòng đã rời `ai_grading`, nên nó không lọt vào
        // truy vấn ở trên — chỉ còn hai ca ở đây: đang chạy (bỏ qua) và
        // đã chết (xoá đi rồi xếp lại, vì `jobId` trùng sẽ bị BullMQ từ
        // chối nếu bản cũ còn nằm đó).
        if (!(await existing.isFailed())) {
          continue;
        }
        await existing.remove();
      }
      const submission = byId.get(row.submission_id);
      if (!submission) {
        continue;
      }
      const deliverable = deliverables.get(submission.requiredDeliverableId);
      await this.queue.add(
        'grade-submission',
        {
          submissionId: row.submission_id,
          requiredFilename: deliverable?.requiredFilename ?? '',
          deliverableType: deliverable?.deliverableType ?? 'document',
          rubricId: row.rubric_id,
          teacherId,
        } satisfies GradeSubmissionJob,
        { ...GRADE_JOB_OPTIONS, jobId },
      );
      requeued += 1;
    }

    this.logger.log(
      `session ${session.id}: ${stuck.length} bài treo ở ai_grading, xếp hàng lại ${requeued}`,
    );
    return { stuck: stuck.length, requeued };
  }

  /**
   * Tiến độ chấm của MỘT phiên.
   *
   * Đếm `grading_result`, KHÔNG đếm job: mọi dòng đã tồn tại từ lúc
   * `startGrading` trả về (xem lý do dài ở đó), nên con số này đầy đủ ngay
   * lập tức và sống sót cả khi Redis bị xoá.
   *
   * `queue` là câu hỏi KHÁC — "hàng đợi có đang kẹt không" — và cố ý tách
   * riêng: `getJobCounts()` đếm TOÀN hàng đợi chứ không theo phiên, nên
   * trộn hai con số sẽ cho giảng viên A thấy tiến độ của giảng viên B.
   */
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
}
