import { Logger } from '@nestjs/common';
import { GradingService } from './grading.service';
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
  ): Promise<AdvocateOpinion | null> {
    return (
      service as unknown as {
        runAdvocate(
          s: SubmissionEntity,
          text: string,
          needs: boolean,
          ref: LoadedGradingReference,
        ): Promise<AdvocateOpinion | null>;
      }
    ).runAdvocate(SUBMISSION, STUDENT_TEXT, needsAdvocate, reference);
  }

  it('T-ADV-1: kiến nghị của Advocate KHÔNG mang theo con số nào', async () => {
    // Kiểu dữ liệu đã xoá cơ hội sai — `AdvocateOpinion` không có trường
    // điểm nào để mà ghi đè. Test này khoá lại điều đó ở dạng chạy được,
    // vì "không có trường" là thứ một lần sửa interface có thể phá.
    const stub: AdvocateProvider = { name: 'x', advocate: async () => opinion() };

    const out = (await runAdvocate(serviceWith(stub), true, WITH_QUESTION))!;

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

    const out = (await runAdvocate(serviceWith(stub), true, WITH_QUESTION))!;

    expect(out.unverifiedEvidence).toEqual(['em đã chứng minh bằng quy nạp toán học']);
    // Kiến nghị VẪN còn nguyên.
    expect(out.suggestedVerdicts).toHaveLength(1);
  });

  it('dẫn chứng có thật → mảng rỗng, KHÁC null', async () => {
    // `[]` = đã kiểm và sạch; `null` = chưa kiểm. Phân biệt được hai thứ
    // đó là lý do trường này không phải `string[]` thuần.
    const stub: AdvocateProvider = { name: 'x', advocate: async () => opinion() };

    const out = (await runAdvocate(serviceWith(stub), true, WITH_QUESTION))!;

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

    expect(await runAdvocate(serviceWith(stub), false, WITH_QUESTION)).toBeNull();
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

    const out = await runAdvocate(serviceWith(stub), true, { loadedLevel: 'rubric_only' });

    expect(out).toBeNull();
    expect(called).toBe(false);
  });

  it('không cấu hình bậc nào → null, không nổ', async () => {
    expect(await runAdvocate(serviceWith(null), true, WITH_QUESTION)).toBeNull();
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

    await expect(runAdvocate(serviceWith(stub), true, WITH_QUESTION)).resolves.toBeNull();
  });
});
