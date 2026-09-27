import { Repository } from 'typeorm';
import { GradingService } from './grading.service';
import { GradingResultEntity } from './entities/grading-result.entity';
import { GradingAttemptEntity } from './entities/grading-attempt.entity';
import { RubricCriterionEntity } from './entities/rubric-criterion.entity';
import { SubmissionEntity } from '../submission/entities/submission.entity';
import { StorageService } from '../storage/storage.service';
import { ContentResolverRegistry } from './content-resolver/content-resolver.registry';
import { GradingReferenceService } from './grading-reference.service';
import { AnchorService } from './anchor.service';
import { GradeSubmissionJob } from './grading.queue';
import {
  AIGradingProvider,
  CriterionResult,
  CriterionVerdict,
  GradingOutcome,
} from './ai-provider/ai-grading-provider';

/**
 * T-G2-1b, VẾ SAU — "chấm lại ĐÚNG một lần rồi dừng" (spec §6.4).
 *
 * Ca T-G2-1b có hai nửa, và trước 2026-09-16 chỉ nửa đầu có test:
 *
 *   1. PHÁT HIỆN: ≥50% tiêu chí `unverified` → lượt chấm không tin được.
 *      Nằm ở `applyGuards`, một hàm thuần → `grading-guards.spec.ts` gọi
 *      thẳng nó là xong.
 *   2. XỬ LÝ: chấm lại một lần, vẫn vậy thì thôi. Nằm ở `gradeOne`, và
 *      KHÔNG có hàm thuần nào mang tính chất này — thứ cần khẳng định là
 *      SỐ LẦN `provider.grade` được gọi.
 *
 * Vì sao nửa sau đáng một file riêng: nó là vòng lặp duy nhất trong hệ
 * thống có thể nhân đôi hoá đơn AI. Một lần "cải tiến" thành `while` sẽ
 * không làm đỏ test nào trước đây, không đổi một dòng log nào, và chỉ lộ
 * ra ở hoá đơn cuối tháng — hoặc không lộ ra, vì bài khó thì ít.
 *
 * Vì sao unit chứ không e2e: `gradeOne` là `private`, đường vào là
 * `gradeOneById`, và chạy nó "thật" cần Postgres + MinIO + một model thật.
 * Model thật thì không tất định — mà tính chất đang kiểm LÀ số lần gọi
 * model. Thay 9 phụ thuộc bằng bản giả cho ra cùng khẳng định trong mili
 * giây, miễn phí, và không phụ thuộc mạng.
 */

/**
 * Bài làm đóng vai văn bản gốc mà guard đối chiếu dẫn chứng.
 *
 * Mọi `evidence` "thật" dưới đây là một mẩu NGUYÊN VĂN cắt từ chuỗi này —
 * đó là toàn bộ cơ chế của `verifyEvidence`.
 */
const BAI =
  'Em dùng cây phân đoạn thay vì mảng cộng dồn, vì truy vấn có cập nhật xen kẽ. ' +
  'Độ phức tạp mỗi truy vấn là O(log n) thay vì O(n).';

const CRITERIA = [
  { id: 'c1', description: 'Chọn đúng cấu trúc dữ liệu', maxPoints: '10' },
  { id: 'c2', description: 'Phân tích được độ phức tạp', maxPoints: '10' },
] as unknown as RubricCriterionEntity[];

const JOB: GradeSubmissionJob = {
  deliverableType: 'document',
  submissionId: 's1',
  requiredFilename: 'Cau1.docx',
  rubricId: 'r1',
  teacherId: 't1',
};

/** Dẫn chứng CÓ THẬT trong bài — guard trả `ok`. */
function real(criterionId: string, verdict: CriterionVerdict = 'met'): CriterionResult {
  const evidence =
    criterionId === 'c1' ? 'Em dùng cây phân đoạn' : 'Độ phức tạp mỗi truy vấn là O(log n)';
  return { criterionId, verdict, points: 0, evidence };
}

/** Dẫn chứng BỊA — guard trả `unverified`. */
function fabricated(criterionId: string, verdict: CriterionVerdict = 'met'): CriterionResult {
  return {
    criterionId,
    verdict,
    points: 0,
    evidence: `HOÀN TOÀN BỊA RA, KHÔNG CÓ TRONG BÀI (${criterionId})`,
  };
}

function outcome(rows: CriterionResult[]): GradingOutcome {
  return {
    modelUsed: 'stub-model',
    criterionResults: rows,
    // Con số của provider bị server tính lại (T-B2) — để 999 ở đây chính
    // là để nó không bao giờ khớp với thứ được lưu.
    totalScore: 999,
    confidenceCeiling: 1,
    usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheCreationTokens: 0 },
    contextUsed: { question: false, modelAnswer: false },
  };
}

describe('GradingService — chấm lại đúng một lần (T-G2-1b, vế sau)', () => {
  let grade: jest.Mock<Promise<GradingOutcome>, [unknown]>;
  let sets: Record<string, unknown>[];
  let service: GradingService;

  beforeEach(() => {
    grade = jest.fn();
    // Hai bước chuyển của `gradeOne` là UPDATE CÓ ĐIỀU KIỆN qua query builder (§14.3): mock
    // ghi lại từng `.set()` theo thứ tự — ai_graded (kèm output AI), rồi trạng thái cuối.
    sets = [];
    const qb = {
      update: () => qb,
      set: (values: Record<string, unknown>) => {
        sets.push(values);
        return qb;
      },
      where: () => qb,
      andWhere: () => qb,
      execute: async () => ({ affected: 1 }),
    };

    const results = {
      // `aiTotalScore: null` là điều kiện để job KHÔNG bị coi là lặp và
      // bỏ qua ngay ở đầu `gradeOneById`.
      findOne: jest.fn().mockResolvedValue({ id: 'g1', aiTotalScore: null, pipeline: 'one_shot' }),
      createQueryBuilder: jest.fn(() => qb),
    } as unknown as Repository<GradingResultEntity>;

    const submissions = {
      findOne: jest.fn().mockResolvedValue({
        id: 's1',
        studentMssv: '2011060001',
        storageKey: 'bai/s1.docx',
        examSessionId: 'e1',
      }),
    } as unknown as Repository<SubmissionEntity>;

    const criteria = {
      find: jest.fn().mockResolvedValue(CRITERIA),
    } as unknown as Repository<RubricCriterionEntity>;

    const storage = {
      getObject: jest.fn().mockResolvedValue(Buffer.from('docx giả')),
    } as unknown as StorageService;

    const provider: AIGradingProvider = { name: 'stub', grade };

    // Resolver trả thẳng `BAI`: file thật không liên quan tới thứ đang
    // kiểm, và đi qua mammoth chỉ thêm một nguồn hỏng không liên quan.
    const resolvers = {
      for: () => ({ handles: 'document', resolve: async () => ({ text: BAI }) }),
    } as unknown as ContentResolverRegistry;

    const references = {
      loadForGrading: jest.fn().mockResolvedValue({ loadedLevel: 'rubric_only' }),
    } as unknown as GradingReferenceService;

    const anchors = {
      loadFor: jest.fn(),
    } as unknown as AnchorService;

    // Constructor THẬT, không `Object.create`: thêm một phụ thuộc thứ 10
    // vào service sẽ làm dòng này đỏ ở `tsc`, chứ không lặng lẽ đưa
    // `undefined` vào một nhánh chỉ chạy trong production.
    //
    // `advocate: null` là trạng thái HỢP LỆ (không có bậc model nào cho
    // lượt phản biện), không phải một lỗ hổng của harness.
    service = new GradingService(
      results,
      submissions,
      criteria,
      storage,
      provider,
      resolvers,
      references,
      null,
      anchors,
      {} as Repository<GradingAttemptEntity>,
    );
  });

  it('cả hai lượt đều bịa dẫn chứng → gọi model ĐÚNG hai lần, không phải ba', async () => {
    // Đây là khẳng định mà cả ca T-G2-1b xoay quanh. Trần cứng ở hai:
    // chấm lại vô hạn thì tốn tiền và có thể trượt tiếp, còn đẩy thẳng
    // cho giảng viên ngay lượt đầu thì họ ngập bài flag.
    grade.mockResolvedValue(outcome([fabricated('c1'), fabricated('c2')]));

    await service.gradeOneById(JOB);

    expect(grade).toHaveBeenCalledTimes(2);

    // Và lượt chấm lại hỏng KHÔNG được âm thầm trở thành điểm: confidence
    // về 0 và bài sang tay người.
    const saved = sets[0];
    expect(saved.confidence).toBe('0');

    const final = sets[1];
    expect(final.status).toBe('flagged_for_review');
    expect(final.flagForReview).toBe(true);
  });

  it('lượt đầu sạch → KHÔNG chấm lại (đây là vế tốn tiền)', async () => {
    // Nửa còn lại của cùng một ràng buộc, và là nửa đắt hơn: một lỗi làm
    // guard luôn báo động sẽ nhân đôi chi phí AI của MỌI bài, không chỉ
    // bài khó. Không có khẳng định này thì chẳng gì phát hiện ra.
    grade.mockResolvedValue(outcome([real('c1'), real('c2')]));

    await service.gradeOneById(JOB);

    expect(grade).toHaveBeenCalledTimes(1);
  });

  it('lượt chấm lại là lượt được LƯU, không phải lượt đầu', async () => {
    // Chấm lại mà vẫn ghi kết quả lượt đầu thì vòng lặp kia chỉ là một
    // lời gọi API tốn tiền không đổi lấy gì — và triệu chứng duy nhất là
    // điểm sai, không lỗi, không log.
    grade
      .mockResolvedValueOnce(outcome([fabricated('c1', 'not_met'), fabricated('c2', 'not_met')]))
      .mockResolvedValueOnce(outcome([real('c1', 'met'), real('c2', 'met')]));

    await service.gradeOneById(JOB);

    expect(grade).toHaveBeenCalledTimes(2);

    // 10 + 10 từ lượt THỨ HAI. Lượt đầu (`not_met` cả hai) cho 0.
    const saved = sets[0];
    expect(saved.aiTotalScore).toBe('20');
  });

  it('bài đã gán đường điều tra → KHÔNG chấm một-phát, đánh dấu không chấm được (T-PIPE-1)', async () => {
    const results = (service as unknown as { results: { findOne: jest.Mock } }).results;
    results.findOne.mockResolvedValue({ id: 'g1', aiTotalScore: null, pipeline: 'investigator' });
    const mark = jest.spyOn(service, 'markUngradable').mockResolvedValue(undefined);

    await service.gradeOneById(JOB);

    expect(mark).toHaveBeenCalledTimes(1);
    expect(mark.mock.calls[0][0]).toBe(JOB.submissionId);
    expect(grade).not.toHaveBeenCalled();
  });
});
