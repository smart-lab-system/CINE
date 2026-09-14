import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GradeSubmissionJob } from './grading.queue';
import { GradingResultEntity, GradingResultStatus } from './entities/grading-result.entity';
import { RubricCriterionEntity } from './entities/rubric-criterion.entity';
import { SubmissionEntity } from '../submission/entities/submission.entity';
import { StorageService } from '../storage/storage.service';
import {
  AI_GRADING_PROVIDER,
  AIGradingProvider,
  GradingRequest,
  enforceScoring,
} from './ai-provider/ai-grading-provider';
import { GradingInputTooLargeError } from './extract-text';
import { applyGuards } from './harness/grading-guards';
import { ContentResolverRegistry } from './content-resolver/content-resolver.registry';
import { GradingReferenceService } from './grading-reference.service';
import { DeliverableType } from '../exam-session/entities/required-deliverable.entity';
import { AUTO_APPROVE_CONFIDENCE } from './grading.types';

/**
 * Chấm MỘT bài: đọc file, gọi model, ghi kết quả.
 *
 * CLAUDE.md is unambiguous that collection and grading are two pipelines
 * joined by one explicit teacher action, and that they must never be one
 * continuous job. Đường vào duy nhất của file này là `gradeOneById`, và nó
 * chỉ tới được qua hàng đợi BullMQ — mà hàng đợi ấy do
 * `GradingRunService.startGrading` nạp, vốn chỉ được gọi bởi một controller,
 * từ một cú bấm, và bởi không gì khác. A submission reaching `collected`
 * triggers exactly nothing.
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
    private readonly storage: StorageService,
    @Inject(AI_GRADING_PROVIDER) private readonly provider: AIGradingProvider,
    private readonly resolvers: ContentResolverRegistry,
    private readonly references: GradingReferenceService,
  ) {}

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

    await this.gradeOne(
      submission,
      job.requiredFilename,
      job.rubricId,
      criteria,
      result,
      job.deliverableType,
    );
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
    /** Loại ĐÃ KHAI ở `required_deliverable` — bộ định tuyến đọc nó. */
    deliverableType: DeliverableType,
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
      // Bộ định tuyến TẤT ĐỊNH: loại bài nộp là thứ giảng viên đã khai,
      // không phải thứ đoán từ tên file. 0 token, ~0ms.
      const resolved = await this.resolvers.for(deliverableType).resolve(bytes, requiredFilename);
      content = resolved.text;
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

    // Một bản duy nhất: prompt và phép ép điểm PHẢI nhìn thấy cùng một tập
    // tiêu chí. Hai bản sao là cách chúng lệch nhau.
    const rubricCriteria = criteria.map((criterion) => ({
      id: criterion.id,
      description: criterion.description,
      maxPoints: Number(criterion.maxPoints),
    }));

    const request: GradingRequest = {
      studentMssv: submission.studentMssv,
      content,
      deliverableType,
      criteria: rubricCriteria,
    };

    const extractMs = Date.now() - extractStarted;
    const modelStarted = Date.now();

    // Nạp đề bài + đáp án mẫu và đưa vào provider.
    //
    // Đây là chỗ toàn bộ thiết kế này quy tụ: không có bước này thì model
    // vẫn chấm mà chưa bao giờ nhìn thấy đề, và câu hỏi "bài này lệch
    // rubric nhưng có đúng không" vẫn bất khả.
    //
    // `withReference` chỉ tồn tại trên provider Claude, nên kiểm kiểu ở
    // đây thay vì bắt mọi implementation của seam phải nhận hai Buffer —
    // provider cục bộ không cần PDF nào, và đổi hợp đồng của seam vì nhu
    // cầu của đúng một implementation là ngược.
    const reference = await this.references.loadForGrading(submission.examSessionId);
    const provider = this.provider as AIGradingProvider & {
      withReference?: (ref: {
        questionPdf?: Buffer;
        modelAnswerPdf?: Buffer;
        modelAnswerNote?: string;
      }) => AIGradingProvider;
    };
    if (provider.withReference) {
      provider.withReference({
        questionPdf: reference.questionPdf,
        modelAnswerPdf: reference.modelAnswer,
        modelAnswerNote: reference.note,
      });
    }

    // Chấm, kiểm bằng guard, và CHẤM LẠI ĐÚNG MỘT LẦN nếu lượt đầu không
    // tin được (spec §6.4).
    //
    // Vì sao đúng một lần: chấm lại vô hạn thì tốn tiền và có thể trượt
    // tiếp; đẩy thẳng cho giảng viên thì trung thực nhưng nếu model hay
    // trượt thì họ ngập bài flag. Một lần là điểm cân bằng, và số lần
    // trượt được ghi log để có dữ liệu THẬT về tần suất — con số đó là
    // thứ nói cho ta biết guard có đang báo động giả hay không, và nó đi
    // thẳng vào báo cáo calibration.
    let outcome = await this.provider.grade(request);
    let guards = applyGuards({
      studentText: content,
      criteria: rubricCriteria,
      criterionResults: outcome.criterionResults,
    });

    if (guards.runUntrustworthy) {
      this.logger.warn(
        `submission ${submission.id}: lượt chấm không tin được (${guards.reason}) — ` +
          'chấm lại một lần',
      );
      outcome = await this.provider.grade(request);
      guards = applyGuards({
        studentText: content,
        criteria: rubricCriteria,
        criterionResults: outcome.criterionResults,
      });
      if (guards.runUntrustworthy) {
        this.logger.error(
          `submission ${submission.id}: chấm lại vẫn không tin được — chuyển giảng viên`,
        );
      }
    }
    // Kích thước nội dung, không phải nội dung. `chars` là thứ dự đoán
    // chi phí token, nên nó thuộc về dòng này.
    // Token đi vào log Ở ĐÂY, ngay cạnh thời gian. Module admin sẽ quyết
    // định lưu chúng vào đâu, nhưng nếu chúng không ra khỏi hàm này thì
    // không ai lấy lại được — `CalibrationRun.cost_usd` và dashboard chi
    // phí AI đều đã nằm trong schema chờ dữ liệu này.
    //
    // `cacheRead` là con số đáng nhìn nhất: nó là BẰNG CHỨNG DUY NHẤT rằng
    // prompt caching có tác dụng thật. Bài đầu của một phiên sẽ có
    // `cacheCreate > 0, cacheRead = 0`; 39 bài sau phải ngược lại. Nếu
    // không, một thứ gì đó đang phá tiền tố cache.
    const { usage } = outcome;
    this.logger.log(
      `submission ${submission.id}: extract ${extractMs}ms (CPU) / ` +
        `model ${Date.now() - modelStarted}ms (I/O), ${content.length} ký tự — ` +
        `token in=${usage.inputTokens} out=${usage.outputTokens} ` +
        `cacheRead=${usage.cacheReadTokens} cacheCreate=${usage.cacheCreationTokens}`,
    );

    // Guard chỉ được HẠ tin cậy, không được NÂNG quá trần mà cơ chế của
    // provider biện minh nổi. Mọi phép đo cơ học sạch cũng không biến
    // việc đếm từ thành việc hiểu bài.
    const finalConfidence = Math.min(guards.confidence, outcome.confidenceCeiling);

    // ĐIỂM DO SERVER TÍNH. Provider chỉ được phép phán đoán (`verdict` +
    // `evidence`); mọi con số đều tính lại ở đây. Xem `enforceScoring` để
    // biết vì sao tin provider tự giác là không đủ.
    const scored = enforceScoring(outcome.criterionResults, rubricCriteria);
    if (scored.unknownCriterionIds.length > 0) {
      // Cho 0 điểm là hướng an toàn, nhưng an-toàn-và-im-lặng vẫn là lỗi.
      // Guard coverage (G3) sẽ xử lý chính thức; tới lúc đó ít nhất nó
      // phải nhìn thấy được trong log.
      // Cắt danh sách: một model hỏng có thể trả về hàng chục id bịa, và
      // một dòng log dài vô hạn là thứ làm người ta bỏ qua cả dòng.
      const shown = scored.unknownCriterionIds.slice(0, 5).join(', ');
      const extra = scored.unknownCriterionIds.length - 5;
      this.logger.warn(
        `submission ${submission.id}: model trả về tiêu chí không có trong rubric ` +
          `(${shown}${extra > 0 ? ` và ${extra} id khác` : ''}) — chấm 0 cho chúng`,
      );
    }

    // The AI's own output, written once. A teacher's later edit creates a
    // TeacherReview row instead of touching any of this — Security rule 6,
    // enforced by trg_grading_result_guard_ai_immutable as well as here.
    await this.results.update(result.id, {
      status: 'ai_graded',
      modelUsed: outcome.modelUsed,
      criterionResults: scored.criterionResults,
      aiTotalScore: String(scored.totalScore),
      // confidence từ GUARD, không phải từ provider. Model tự chấm độ
      // tin cậy của chính nó là tín hiệu hiệu chỉnh kém nhất có thể — và
      // đặt ngưỡng auto-approve lên con số đó là cho model quyền tự kết
      // thúc việc chấm một sinh viên dựa trên cảm giác của nó.
      confidence: String(finalConfidence),
    });

    // Trạng thái cuối cũng do guard quyết. `AUTO_APPROVE_CONFIDENCE` vẫn
    // là lớp chặn thứ hai: guard có thể trả `auto_approved` với một
    // confidence dưới ngưỡng nếu ai đó chỉnh số ở `grading-guards.ts` mà
    // quên chỗ này.
    const confident =
      guards.status === 'auto_approved' && finalConfidence >= AUTO_APPROVE_CONFIDENCE;
    await this.results.update(result.id, {
      status: confident ? 'auto_approved' : 'flagged_for_review',
      flagForReview: !confident,
    });
    if (!confident && guards.reason) {
      this.logger.log(`submission ${submission.id}: chuyển giảng viên — ${guards.reason}`);
    }
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
