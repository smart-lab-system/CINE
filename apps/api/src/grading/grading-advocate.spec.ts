import { Logger } from '@nestjs/common';
import { AdvocateRun, GradingService } from './grading.service';
import { AdvocateOpinion } from './ai-provider/advocate.types';
import { AdvocateProvider } from './ai-provider/advocate-provider';
import { LoadedGradingReference } from './grading-reference.service';
import { SubmissionEntity } from '../submission/entities/submission.entity';

/**
 * T-ADV-1 — ràng buộc CỐT LÕI của cả thiết kế hai agent (spec §2.2).
 *
 * > Advocate kiến nghị 9/10 trong khi Grader chấm 4/10 → `ai_total_score`
 * > VẪN LÀ CỦA GRADER, bài sang `flagged_for_review`.
 *
 * Ngày nào có ai "cải tiến" bằng cách cho Advocate sửa điểm, test này đỏ.
 * Nó được viết ở tầng unit vì thứ cần khoá là MỘT QUYẾT ĐỊNH TRONG CODE
 * ("ý kiến phản biện không bao giờ chạm vào con số"), không phải một vòng
 * đời DB — và ở tầng unit thì nó chạy trong mili giây và không cần một
 * model thật nào.
 *
 * Ba lớp bảo vệ độc lập cho cùng một ràng buộc, và test này chạm lớp đầu:
 *   1. `runAdvocate` trả về một `AdvocateOpinion`, không trả điểm  ← đây
 *   2. Schema của Advocate không có `points`/`totalScore`/`confidence`
 *   3. `trg_grading_result_guard_ai_immutable` ở tầng DB
 */
describe('GradingService.runAdvocate (T-ADV-1)', () => {
  const SUBMISSION = { id: 'sub-1', studentMssv: '2011060001' } as SubmissionEntity;
  const STUDENT_TEXT =
    'Em dùng cây phân đoạn thay vì mảng cộng dồn, vì truy vấn có cập nhật xen kẽ.';

  const WITH_QUESTION: LoadedGradingReference = {
    questionPdf: Buffer.from('%PDF-1.4'),
    loadedLevel: 'with_question',
  };

  function opinion(overrides: Partial<AdvocateOpinion> = {}): AdvocateOpinion {
    return {
      isCorrect: 'yes',
      reasoning: 'Em chọn cấu trúc khác rubric nhưng giải đúng bài toán.',
      evidence: ['Em dùng cây phân đoạn thay vì mảng cộng dồn'],
      suggestedVerdicts: [
        { criterionId: 'c1', suggestedVerdict: 'met', why: 'đúng theo hướng khác' },
      ],
      unverifiedEvidence: null,
      usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheCreationTokens: 0 },
      ...overrides,
    };
  }

  /**
   * Dựng service với đúng phần phụ thuộc mà `runAdvocate` chạm tới.
   *
   * `Object.create(prototype)` thay vì `new GradingService(...)`: hàm đang
   * test chỉ đọc `this.advocate` và `this.logger`, còn constructor thật
   * đòi năm repository và ba service khác. Dựng đủ chúng chỉ để gọi một
   * hàm không chạm tới cái nào là kiểm cái mock, không kiểm cái hàm.
   */
  function serviceWith(advocate: AdvocateProvider | null): GradingService {
    const service = Object.create(GradingService.prototype) as Record<string, unknown>;
    service.advocate = advocate;
    service.logger = new Logger('test');
    return service as unknown as GradingService;
  }

  function runAdvocate(
    service: GradingService,
    needsAdvocate: boolean,
    reference: LoadedGradingReference,
    criterionIds: ReadonlySet<string> = new Set(['c1']),
  ): Promise<AdvocateRun> {
    return (
      service as unknown as {
        runAdvocate(
          s: SubmissionEntity,
          text: string,
          needs: boolean,
          ref: LoadedGradingReference,
          ids: ReadonlySet<string>,
        ): Promise<AdvocateRun>;
      }
    ).runAdvocate(SUBMISSION, STUDENT_TEXT, needsAdvocate, reference, criterionIds);
  }

  it('T-ADV-1: kiến nghị của Advocate KHÔNG mang theo con số nào', async () => {
    // Kiểu dữ liệu đã xoá cơ hội sai — `AdvocateOpinion` không có trường
    // điểm nào để mà ghi đè. Test này khoá lại điều đó ở dạng chạy được,
    // vì "không có trường" là thứ một lần sửa interface có thể phá.
    const stub: AdvocateProvider = { name: 'x', advocate: async () => opinion() };

    const run = await runAdvocate(serviceWith(stub), true, WITH_QUESTION);
    const out = run.opinion!;

    // T-ADVO-4: chay va co y kien -> completed
    expect(run.outcome).toBe('completed');
    expect(out.suggestedVerdicts[0].suggestedVerdict).toBe('met');
    expect(Object.keys(out)).not.toContain('points');
    expect(Object.keys(out)).not.toContain('totalScore');
    expect(Object.keys(out)).not.toContain('aiTotalScore');
  });

  it('dẫn chứng BỊA bị đánh dấu, nhưng kiến nghị KHÔNG bị loại', async () => {
    // Advocate bịa nguy hiểm hơn Grader bịa: nó đang lập luận để NÂNG
    // điểm, và giảng viên đang chấm bài thứ 35 sẽ có xu hướng đồng ý.
    //
    // Nhưng loại bỏ kiến nghị là THAY GIẢNG VIÊN QUYẾT, mà §2.2 nói rõ
    // người quyết là giảng viên. Việc của hệ thống là đặt cạnh kiến nghị
    // một dòng "mẩu này không tìm thấy trong bài".
    const stub: AdvocateProvider = {
      name: 'x',
      advocate: async () =>
        opinion({
          evidence: ['Em dùng cây phân đoạn', 'em đã chứng minh bằng quy nạp toán học'],
        }),
    };

    const out = (await runAdvocate(serviceWith(stub), true, WITH_QUESTION)).opinion!;

    expect(out.unverifiedEvidence).toEqual(['em đã chứng minh bằng quy nạp toán học']);
    // Kiến nghị VẪN còn nguyên.
    expect(out.suggestedVerdicts).toHaveLength(1);
  });

  it('dẫn chứng có thật → mảng rỗng, KHÁC null', async () => {
    // `[]` = đã kiểm và sạch; `null` = chưa kiểm. Phân biệt được hai thứ
    // đó là lý do trường này không phải `string[]` thuần.
    const stub: AdvocateProvider = { name: 'x', advocate: async () => opinion() };

    const out = (await runAdvocate(serviceWith(stub), true, WITH_QUESTION)).opinion!;

    expect(out.unverifiedEvidence).toEqual([]);
  });

  it('cổng đóng → KHÔNG gọi model', async () => {
    // ~80% số bài không cần lượt hai. Gọi cho đủ là nhân đôi hoá đơn.
    let called = false;
    const stub: AdvocateProvider = {
      name: 'x',
      advocate: async () => {
        called = true;
        return opinion();
      },
    };

    const run = await runAdvocate(serviceWith(stub), false, WITH_QUESTION);

    // T-ADVO-1: khong can phan bien -> not_needed, KHAC 'failed'
    expect(run.outcome).toBe('not_needed');
    expect(run.opinion).toBeNull();
    expect(called).toBe(false);
  });

  it('T-DEGRADE-1: phiên không có đề bài → Advocate KHÔNG chạy', async () => {
    // Advocate mù rubric, nên không có đề bài thì nó chẳng còn gì để đối
    // chiếu và sẽ chỉ đọc lại bài làm rồi đoán — một ý kiến thứ hai không
    // độc lập, tốn tiền, và giảng viên vẫn phải đọc.
    let called = false;
    const stub: AdvocateProvider = {
      name: 'x',
      advocate: async () => {
        called = true;
        return opinion();
      },
    };

    const run = await runAdvocate(serviceWith(stub), true, { loadedLevel: 'rubric_only' });

    // T-ADVO-2: co y bo qua -> skipped, KHAC 'not_needed' va KHAC 'failed'
    expect(run.outcome).toBe('skipped');
    expect(run.opinion).toBeNull();
    expect(called).toBe(false);
  });

  it('không cấu hình bậc nào → null, không nổ', async () => {
    const run = await runAdvocate(serviceWith(null), true, WITH_QUESTION);

    expect(run.outcome).toBe('not_needed');
    expect(run.opinion).toBeNull();
  });

  it('kiến nghị có mã tiêu chí KHÔNG thuộc rubric bị bỏ, và nói ra — Advocate mù rubric nên mã đó không trỏ vào đâu', async () => {
    // Màn hình và nút "áp ý kiến phản biện" khớp kiến nghị theo `criterionId`. Mã lạ lưu vào
    // `advocate_opinion` thì lặng lẽ không khớp gì: giảng viên không biết ý kiến đã từng có.
    const warns: unknown[] = [];
    const service = serviceWith({
      name: 'x',
      advocate: async () =>
        opinion({
          suggestedVerdicts: [
            { criterionId: 'c1', suggestedVerdict: 'met', why: 'đúng theo hướng khác' },
            { criterionId: 'Độ phức tạp', suggestedVerdict: 'met', why: 'bịa mã' },
          ],
        }),
    });
    jest.spyOn((service as unknown as { logger: Logger }).logger, 'warn').mockImplementation((m: unknown) => void warns.push(m));

    const out = (await runAdvocate(service, true, WITH_QUESTION, new Set(['c1', 'c2']))).opinion!;

    expect(out.suggestedVerdicts.map((s) => s.criterionId)).toEqual(['c1']);
    expect(warns.map(String).join(' | ')).toMatch(/sub-1: bỏ 1\/2 kiến nghị của Advocate có mã tiêu chí không thuộc rubric/);
    // Lý lẽ và phán đoán thì còn nguyên — chỉ phần không trỏ được vào tiêu chí nào bị bỏ.
    expect(out.isCorrect).toBe('yes');
    expect(out.reasoning).toMatch(/giải đúng/);
  });

  it('chuỗi Advocate hỏng HẾT bậc → bài vẫn đi tiếp, không ném', async () => {
    // Ràng buộc quan trọng: một lượt phản biện hỏng KHÔNG được phép làm
    // hỏng lượt chấm. Bài vẫn có điểm của Grader và vẫn sang giảng viên;
    // chỉ thiếu ý kiến thứ hai.
    const stub: AdvocateProvider = {
      name: 'x',
      advocate: async () => {
        throw new Error('mọi bậc đều chết');
      },
    };

    const run = await runAdvocate(serviceWith(stub), true, WITH_QUESTION);

    // T-ADVO-3, VE QUAN TRONG NHAT: trang thai ghi dung, VA loi van bi nuot.
    // Khong co `rejects` o day la co y — mot luot phan bien hong khong duoc
    // phep lam hong luot cham. Chi khoa ve dau thi mot lan refactor bien loi
    // phan bien thanh loi cham bai se van xanh.
    expect(run.outcome).toBe('failed');
    expect(run.opinion).toBeNull();
  });
});
