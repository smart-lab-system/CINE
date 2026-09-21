import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GradeSubmissionJob } from './grading.queue';
import { GradingResultEntity } from './entities/grading-result.entity';
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
import { verifyEvidence } from './harness/evidence-check';
import { AdvocateOpinion } from './ai-provider/advocate.types';
import { ADVOCATE_PROVIDER, AdvocateProvider } from './ai-provider/advocate-provider';
import { ContentResolverRegistry } from './content-resolver/content-resolver.registry';
import { GradingReferenceService, LoadedGradingReference } from './grading-reference.service';
import { DeliverableType } from '../exam-session/entities/required-deliverable.entity';
import { AUTO_APPROVE_CONFIDENCE, GRADING_ANCHORS_ENABLED } from './grading.types';
import { AnchorService } from './anchor.service';
import type { AdvocateOutcome } from './entities/grading-result.entity';

/**
 * Kết quả một lượt phản biện: chuyện gì đã xảy ra, và ý kiến nếu có.
 *
 * Hai trường tách rời vì chúng trả lời hai câu hỏi khác nhau, và trước
 * 2026-09-20 chỉ có câu thứ hai được lưu — khiến "chưa bật", "cố ý bỏ qua"
 * và "đã chạy và hỏng" cùng đọc ra một `null` duy nhất.
 */
export interface AdvocateRun {
  outcome: AdvocateOutcome;
  opinion: AdvocateOpinion | null;
}

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
    // `null` là một trạng thái HỢP LỆ, không phải thiếu sót: không có bậc
    // model nào thì lượt phản biện không chạy, và bài vẫn được chấm bình
    // thường. Kiểu dữ liệu nói ra điều đó để không ai phải đoán.
    @Inject(ADVOCATE_PROVIDER) private readonly advocate: AdvocateProvider | null,
    private readonly anchors: AnchorService,
  ) {}

  /**
   * Lượt phản biện, và ba lý do nó có thể KHÔNG chạy.
   *
   * `opinion = null` ở cả ba, vì `advocate_opinion = NULL` mang đúng nghĩa
   * "không có ý kiến thứ hai cho bài này" — khác `{}` là "đã chạy và
   * không kiến nghị gì".
   *
   * Nhưng `outcome` thì PHÂN BIỆT cả ba, và đó là lý do hàm này trả về một
   * cặp chứ không trả về một `AdvocateOpinion | null`:
   * `scripts/calibration/export.py` suy nhánh A/B/C/D từ chỗ này, nên gộp
   * "chưa bật" với "đã chạy và hỏng" làm một sẽ xếp mọi lượt phản biện
   * crash vào nhánh B và làm bẩn đúng tập dữ liệu so sánh các nhánh.
   *
   * 1. Cổng `needsAdvocate` không mở. Cổng này cố ý RỘNG (spec §7.1): nó
   *    đọc `verdict`, một trường BẮT BUỘC, chứ không đọc `uncoveredContent`
   *    vốn tuỳ tâm. Bất đối xứng chi phí quyết định hướng nghiêng — kích
   *    hoạt thừa tốn ~$0,05, bỏ sót là một sinh viên âm thầm mất điểm.
   *
   * 2. Phiên không có tài liệu tham chiếu nào. Advocate MÙ RUBRIC, nên
   *    không có đề bài thì nó chẳng còn gì để đối chiếu và sẽ chỉ đọc lại
   *    bài làm rồi đoán. Đây chính là T-DEGRADE-1 từ Plan 1 — tới giờ mới
   *    có thứ để nó điều khiển.
   *
   * 3. Chuỗi Advocate hỏng hết bậc. Bài VẪN có điểm của Grader và VẪN
   *    sang giảng viên; chỉ thiếu ý kiến thứ hai. Một lượt phản biện hỏng
   *    không được phép làm hỏng lượt chấm.
   */
  // LƯU Ý KHI SỬA: `grading-advocate.spec.ts` dựng một instance MỘT PHẦN
  // bằng `Object.create` và chỉ gán `advocate` + `logger`. Thêm một phụ
  // thuộc mới (`this.references`, `this.results`...) vào hàm này mà quên
  // cập nhật test sẽ cho test XANH trong khi production nhận `undefined`.
  private async runAdvocate(
    submission: SubmissionEntity,
    studentText: string,
    needsAdvocate: boolean,
    reference: LoadedGradingReference,
  ): Promise<AdvocateRun> {
    if (!needsAdvocate || !this.advocate) {
      return { outcome: 'not_needed', opinion: null };
    }
    if (reference.loadedLevel === 'rubric_only') {
      this.logger.log(
        `submission ${submission.id}: bỏ qua lượt phản biện — phiên không có đề bài ` +
          'để đối chiếu (mức suy giảm 1)',
      );
      return { outcome: 'skipped', opinion: null };
    }

    try {
      const opinion = await this.advocate.advocate({
        studentMssv: submission.studentMssv,
        content: studentText,
        questionPdf: reference.questionPdf,
        modelAnswerPdf: reference.modelAnswer,
        modelAnswerNote: reference.note,
      });

      // DẪN CHỨNG CỦA ADVOCATE CŨNG BỊ KIỂM NGUYÊN VĂN.
      //
      // Bịa ở đây nguy hiểm HƠN Grader bịa: Advocate đang lập luận để NÂNG
      // điểm, và một giảng viên đang chấm bài thứ 35 sẽ có xu hướng đồng ý.
      //
      // Nhưng chỉ BÁO, không tự loại kiến nghị — loại bỏ là thay giảng
      // viên quyết, và §2.2 nói rõ Advocate chỉ kiến nghị còn người quyết
      // là giảng viên. Việc của hệ thống là đặt cạnh kiến nghị một dòng
      // "mẩu này không tìm thấy trong bài".
      const unverified = opinion.evidence.filter(
        (quote) => verifyEvidence(studentText, quote) === 'unverified',
      );
      if (unverified.length > 0) {
        this.logger.warn(
          `submission ${submission.id}: Advocate trích ${unverified.length}/` +
            `${opinion.evidence.length} dẫn chứng KHÔNG định vị được trong bài`,
        );
      }
      return {
        outcome: 'completed',
        opinion: { ...opinion, unverifiedEvidence: unverified },
      };
    } catch (error) {
      // Nuốt có chủ ý, và đây là một trong rất ít chỗ được phép nuốt: giá
      // trị của Advocate là phụ trợ, còn giá trị của lượt chấm là chính.
      this.logger.warn(
        `submission ${submission.id}: lượt phản biện hỏng, bài vẫn được chấm — ` +
          (error instanceof Error ? error.message : String(error)),
      );
      return { outcome: 'failed', opinion: null };
    }
  }

  /**
   * Kết thúc một bài mà AI không chấm được: `ai_grading → flagged_for_review`.
   *
   * Không có hàm này thì migration `AllowAiGradingToFlagged` mở một cánh
   * cửa mà không ai đi qua: một job hết retry chỉ ghi được một dòng log,
   * còn dòng `grading_result` nằm lại ở `ai_grading` VĨNH VIỄN — đúng cái
   * thanh tiến độ đứng ở 38/40 mà cả Task 1 sinh ra để sửa.
   *
   * `confidence = 0`, `flagForReview = true`: không có điểm nào, và bài
   * này cần người xem. KHÔNG chấm 0 — không chấm được là sự thật về hệ
   * thống, không phải phán xét về bài làm.
   */
  async markUngradable(submissionId: string, reason: string): Promise<void> {
    const result = await this.results.findOne({ where: { submissionId } });
    if (!result || result.status !== 'ai_grading') {
      // Đã đi tiếp rồi (chấm xong, hoặc một lần gọi trước đã đánh dấu).
      // Im lặng bỏ qua: hàm này được gọi từ một event handler có thể bắn
      // nhiều lần.
      return;
    }
    await this.results.update(result.id, {
      status: 'flagged_for_review',
      flagForReview: true,
      confidence: '0',
      ungradableReason: reason,
    });
    this.logger.error(`submission ${submissionId}: AI không chấm được — ${reason}`);
  }

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

    // Nạp đề bài + đáp án mẫu và đưa vào provider.
    //
    // Đây là chỗ toàn bộ thiết kế này quy tụ: không có bước này thì model
    // vẫn chấm mà chưa bao giờ nhìn thấy đề, và câu hỏi "bài này lệch
    // rubric nhưng có đúng không" vẫn bất khả.
    //
    // Tài liệu đi THEO REQUEST. Provider là singleton và worker chạy
    // `concurrency: 5`, nên đặt nó làm trạng thái trên provider sẽ bị bài
    // của phiên khác ghi đè giữa hai lần `await` — và đường retry bên dưới
    // là chỗ chắc chắn dính, vì giữa hai lượt chấm có một lời gọi mạng
    // 15-30 giây.
    const reference = await this.references.loadForGrading(submission.examSessionId);
    // Một bản duy nhất: prompt và phép ép điểm PHẢI nhìn thấy cùng một tập
    // tiêu chí. Hai bản sao là cách chúng lệch nhau.
    const rubricCriteria = criteria.map((criterion) => ({
      id: criterion.id,
      description: criterion.description,
      maxPoints: Number(criterion.maxPoints),
    }));

    // Anchor đọc từ ẢNH CHỤP của phiên, không dựng lại ở đây (A3).
    //
    // Dựng lại mỗi bài sẽ để một lần duyệt giữa chừng lọt vào tập anchor,
    // và bài 6-40 được chấm theo chuẩn khác bài 1-5 — trong cùng một lượt
    // chấm. Đó là lý do `GradingRunService.startGrading` chụp một lần.
    //
    // `null` (phiên chấm trước khi tính năng tồn tại, hoặc anchor đang tắt
    // lúc bấm chấm) → `undefined` → prompt không có khối anchor nào.
    const anchors = GRADING_ANCHORS_ENABLED
      ? await this.anchors.loadFor(submission.examSessionId)
      : null;

    const request: GradingRequest = {
      studentMssv: submission.studentMssv,
      content,
      deliverableType,
      criteria: rubricCriteria,
      reference: {
        questionPdf: reference.questionPdf,
        modelAnswerPdf: reference.modelAnswer,
        modelAnswerNote: reference.note,
      },
      anchors: anchors ?? undefined,
    };

    const extractMs = Date.now() - extractStarted;
    const modelStarted = Date.now();


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

    // LƯỢT HỎI THỨ HAI — "bỏ qua rubric, em ấy có đúng không?"
    //
    // `applyGuards` trả `needsAdvocate` từ Plan 1 và tới giờ CHƯA AI ĐỌC
    // nó — giống hệt ca `markUngradable` ở Task 1: một cánh cửa mở mà
    // không ai đi qua. Đây là chỗ đi qua nó.
    const advocateRun = await this.runAdvocate(
      submission,
      content,
      guards.needsAdvocate,
      reference,
    );

    // Guard chỉ được HẠ tin cậy, không được NÂNG quá trần mà cơ chế của
    // provider biện minh nổi. Mọi phép đo cơ học sạch cũng không biến
    // việc đếm từ thành việc hiểu bài.
    const finalConfidence = Math.min(guards.confidence, outcome.confidenceCeiling);

    // ĐIỂM DO SERVER TÍNH. Provider chỉ được phép phán đoán (`verdict` +
    // `evidence`); mọi con số đều tính lại ở đây. Xem `enforceScoring` để
    // biết vì sao tin provider tự giác là không đủ.
    // Tra cứu theo id chứ không ghép theo chỉ số mảng: `enforceScoring` và
    // `applyGuards` đọc cùng một nguồn nhưng không hứa giữ nguyên thứ tự,
    // và ghép lệch một ô sẽ gán kết quả kiểm của tiêu chí này cho tiêu chí
    // khác — một sai lệch không bao giờ lộ ra trong log.
    const checkByCriterion = new Map(guards.perCriterion.map((r) => [r.criterionId, r.check]));

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
      // GHÉP KẾT QUẢ KIỂM DẪN CHỨNG vào từng tiêu chí trước khi lưu.
      //
      // `applyGuards` tính `check` ('ok' | 'empty' | 'unverified') cho mọi
      // tiêu chí của MỌI bài, miễn phí, rồi trước 2026-09-15 vứt đi — chỉ
      // `confidence` tổng hợp sống sót. Spec §11.5 lại tuyên bố hai chỉ số
      // "tỉ lệ unverified" và "tỉ lệ phủ tiêu chí" đã chạy sẵn trên 100%
      // số bài; điều đó chỉ đúng nếu con số được GHI LẠI.
      //
      // Tính lại offline là bất khả trên thực tế: `verifyEvidence` cần bài
      // làm nguyên văn (nằm ở object storage, không ở DB) và một bản
      // `TYPOGRAPHIC_FOLD` + tách elision viết lại bằng Python — hai bản
      // cài đặt cho cùng một phép đo, chắc chắn lệch nhau theo thời gian.
      //
      // `jsonb` nên thêm trường không cần migration. Ghi CÙNG lượt update
      // này vì trigger bất biến đóng băng cột ngay sau đó.
      criterionResults: scored.criterionResults.map((row) => ({
        ...row,
        check: checkByCriterion.get(row.criterionId) ?? null,
      })),
      aiTotalScore: String(scored.totalScore),
      // confidence từ GUARD, không phải từ provider. Model tự chấm độ
      // tin cậy của chính nó là tín hiệu hiệu chỉnh kém nhất có thể — và
      // đặt ngưỡng auto-approve lên con số đó là cho model quyền tự kết
      // thúc việc chấm một sinh viên dựa trên cảm giác của nó.
      confidence: String(finalConfidence),
      // Ngữ cảnh THẬT SỰ đã dùng, lấy từ bậc đã trả lời trong chuỗi dự
      // phòng — không phải từ cấu hình của phiên. Ghi CÙNG lượt update
      // này vì trigger bất biến đóng băng chúng ngay khi `ai_total_score`
      // được ghi.
      contextUsedQuestion: outcome.contextUsed.question,
      contextUsedModelAnswer: outcome.contextUsed.modelAnswer,
      // CÙNG một `update` với `aiTotalScore`, bắt buộc:
      // `trg_grading_result_guard_ai_immutable` đóng băng cột này ngay khi
      // `ai_total_score` được ghi, nên ghi thành hai lần sẽ bị DB từ chối.
      // Ba test ở `grading-lifecycle.e2e-spec.ts` khoá đúng ràng buộc đó.
      advocateOpinion: advocateRun.opinion,
      advocateOutcome: advocateRun.outcome,
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
      // Lớp gốc của bài, kèm tên: khác lớp của phiên nghĩa là THI BÙ.
      .leftJoin('class', 'hc', 'hc.id = s.home_class_id')
      .addSelect([
        's.student_mssv AS "studentMssv"',
        's.student_name_input AS "studentName"',
        's.home_class_id AS "homeClassId"',
        'hc.name AS "homeClassName"',
      ])
      .where('s.exam_session_id = :id', { id: examSessionId })
      .orderBy('s.student_mssv', 'ASC')
      .getRawAndEntities<{
        studentMssv: string;
        studentName: string;
        homeClassId: string;
        homeClassName: string | null;
      }>();

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
        homeClassId: rows.raw[index].homeClassId,
        homeClassName: rows.raw[index].homeClassName ?? null,
        status: entity.status,
        modelUsed: entity.modelUsed,
        aiTotalScore: entity.aiTotalScore === null ? null : Number(entity.aiTotalScore),
        confidence: entity.confidence === null ? null : Number(entity.confidence),
        flagForReview: entity.flagForReview,
        ungradableReason: entity.ungradableReason,
        criterionResults: entity.criterionResults,
        // Đầu ra của lượt phản biện. Backend đã ghi ba cột này từ Plan 2;
        // cho tới đây không đường nào đọc chúng ra, nên tính năng hoàn
        // chỉnh ở tầng ghi mà vô hình ở tầng đọc.
        advocateOpinion: entity.advocateOpinion,
        contextUsedQuestion: entity.contextUsedQuestion,
        contextUsedModelAnswer: entity.contextUsedModelAnswer,
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
  /** Lớp GỐC của bài. Khác `exam_session.class_id` nghĩa là thi bù. */
  homeClassId: string;
  homeClassName: string | null;
  status: string;
  modelUsed: string | null;
  aiTotalScore: number | null;
  confidence: number | null;
  flagForReview: boolean;
  /**
   * Vì sao AI KHÔNG chấm được — `null` với mọi dòng chấm bình thường.
   * Xem docblock của cột cùng tên ở `grading-result.entity.ts`.
   */
  ungradableReason: string | null;
  criterionResults: unknown[];
  /**
   * Ý kiến lượt phản biện.
   *
   * `null` nghĩa là cổng KHÔNG kích hoạt — không có tiêu chí `not_met`, hoặc
   * phiên chưa có đề bài — khác hẳn "đã chạy và không bênh được gì". Màn
   * hình phải nói ra khác biệt đó, nên payload phải giữ được nó.
   */
  advocateOpinion: AdvocateOpinion | null;
  /**
   * Ngữ cảnh lượt chấm THỰC SỰ đọc được. `null` = chấm trước khi hệ thống
   * ghi lại điều này, KHÁC `false` (= đã đo và không có).
   */
  contextUsedQuestion: boolean | null;
  contextUsedModelAnswer: boolean | null;
  /** numeric(6,2) ở DB; null nghĩa là chưa ai duyệt, KHÔNG phải điểm 0. */
  finalScore: number | null;
  reviewedAt: string | null;
  /** TÊN giảng viên. Không trả id: trang này không dùng tới, và dấu vết
   *  ai-làm-gì thuộc về audit_log chứ không phải payload hiển thị. */
  reviewedByName: string | null;
  editedCriteria: unknown[] | null;
}
