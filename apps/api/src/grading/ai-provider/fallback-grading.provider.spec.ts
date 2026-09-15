import { FallbackGradingProvider } from './fallback-grading.provider';
import { AIGradingProvider, GradingOutcome, GradingRequest } from './ai-grading-provider';
import { badOutputError, httpProviderError } from './provider-failure';

const REQUEST: GradingRequest = {
  studentMssv: '2011060001',
  content: 'bài làm',
  deliverableType: 'document',
  criteria: [{ id: 'c1', description: 'Tiêu chí 1', maxPoints: 10 }],
};

function outcome(modelUsed: string, ceiling = 1): GradingOutcome {
  return {
    modelUsed,
    criterionResults: [],
    totalScore: 0,
    confidenceCeiling: ceiling,
    usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheCreationTokens: 0 },
    contextUsed: { question: false, modelAnswer: false },
  };
}

/** Provider giả: trả lần lượt những gì được nạp sẵn (giá trị hoặc lỗi). */
function stub(name: string, script: (GradingOutcome | Error)[]): AIGradingProvider & {
  calls: number;
} {
  let i = 0;
  return {
    name,
    calls: 0,
    async grade(this: { calls: number }): Promise<GradingOutcome> {
      this.calls++;
      const next = script[Math.min(i, script.length - 1)];
      i++;
      if (next instanceof Error) throw next;
      return next;
    },
  } as AIGradingProvider & { calls: number };
}

describe('FallbackGradingProvider', () => {
  it('bậc đầu chạy được thì không ai gọi bậc sau', () => {
    const top = stub('top', [outcome('top')]);
    const bottom = stub('bottom', [outcome('bottom')]);
    const chain = new FallbackGradingProvider([
      { provider: top, label: 'bậc 1' },
      { provider: bottom, label: 'sàn' },
    ]);

    return chain.grade(REQUEST).then((out) => {
      expect(out.modelUsed).toBe('top');
      expect(bottom.calls).toBe(0);
    });
  });

  it('bậc CHẾT → sang bậc sau, và outcome mang tên bậc ĐÃ TRẢ LỜI', () => {
    // `modelUsed` phải là của bậc thật sự chấm, không phải của chuỗi:
    // một lượt calibration sáu tháng sau hỏi "dòng này do model nào chấm".
    const dead = stub('dead', [httpProviderError(403, 'access_denied', 'hết tiền')]);
    const alive = stub('alive', [outcome('alive', 0.5)]);
    const chain = new FallbackGradingProvider([
      { provider: dead, label: 'bậc 1' },
      { provider: alive, label: 'bậc 2' },
    ]);

    return chain.grade(REQUEST).then((out) => {
      expect(out.modelUsed).toBe('alive');
      // Trần cũng là của bậc đã trả lời — nếu lấy trần của bậc chết thì
      // một bài do model yếu chấm sẽ được quyền tự duyệt.
      expect(out.confidenceCeiling).toBe(0.5);
    });
  });

  it('lỗi TẠM THỜI ném thẳng ra ngoài, KHÔNG rơi bậc', async () => {
    // Ranh giới quan trọng nhất của file này: BullMQ lo retry cùng bậc.
    // Rơi bậc vì một cú 503 thoáng qua là tự hạ chất lượng chấm trong khi
    // bậc trên vẫn khoẻ.
    const flaky = stub('flaky', [httpProviderError(503, undefined, 'tạm nghẽn')]);
    const bottom = stub('bottom', [outcome('bottom')]);
    const chain = new FallbackGradingProvider([
      { provider: flaky, label: 'bậc 1' },
      { provider: bottom, label: 'sàn' },
    ]);

    await expect(chain.grade(REQUEST)).rejects.toMatchObject({ status: 503 });
    expect(bottom.calls).toBe(0);
  });

  it('output hỏng → thử lại CÙNG bậc đúng một lần, rồi mới sang bậc sau', async () => {
    // Cắt cụt phần lớn là ngẫu nhiên nên thử lại hay ăn; nhưng nếu bậc đó
    // không bao giờ trả đúng schema thì retry vô hạn chỉ đốt tiền.
    const broken = stub('broken', [badOutputError('cụt'), badOutputError('cụt')]);
    const bottom = stub('bottom', [outcome('bottom')]);
    const chain = new FallbackGradingProvider([
      { provider: broken, label: 'bậc 1' },
      { provider: bottom, label: 'sàn' },
    ]);

    const out = await chain.grade(REQUEST);

    expect(broken.calls).toBe(2); // gọi đầu + đúng MỘT lần thử lại
    expect(out.modelUsed).toBe('bottom');
  });

  it('output hỏng rồi lần hai ĐƯỢC → không rơi bậc', async () => {
    const flaky = stub('flaky', [badOutputError('cụt'), outcome('flaky')]);
    const bottom = stub('bottom', [outcome('bottom')]);
    const chain = new FallbackGradingProvider([
      { provider: flaky, label: 'bậc 1' },
      { provider: bottom, label: 'sàn' },
    ]);

    const out = await chain.grade(REQUEST);

    expect(out.modelUsed).toBe('flaky');
    expect(bottom.calls).toBe(0);
  });

  it('breaker: bậc đã chết KHÔNG bị gọi lại ở bài sau', async () => {
    // Một lượt 40 bài không được đâm vào một tài khoản hết tiền 40 lần.
    const dead = stub('dead', [httpProviderError(403, 'access_denied', 'hết tiền')]);
    const bottom = stub('bottom', [outcome('bottom')]);
    const chain = new FallbackGradingProvider([
      { provider: dead, label: 'bậc 1' },
      { provider: bottom, label: 'sàn' },
    ]);

    await chain.grade(REQUEST);
    await chain.grade(REQUEST);
    await chain.grade(REQUEST);

    expect(dead.calls).toBe(1);
    expect(bottom.calls).toBe(3);
  });

  it('output hỏng KHÔNG mở breaker — có thể chỉ hỏng với riêng bài đó', async () => {
    // Đóng cả một bậc vì một bài lạ là phản ứng thái quá: bài sau có thể
    // ngắn hơn và đi qua bình thường.
    const broken = stub('broken', [
      badOutputError('cụt'),
      badOutputError('cụt'),
      outcome('broken'),
    ]);
    const bottom = stub('bottom', [outcome('bottom')]);
    const chain = new FallbackGradingProvider([
      { provider: broken, label: 'bậc 1' },
      { provider: bottom, label: 'sàn' },
    ]);

    await chain.grade(REQUEST); // hỏng 2 lần → xuống sàn
    const second = await chain.grade(REQUEST); // vẫn thử lại bậc 1

    expect(second.modelUsed).toBe('broken');
  });

  it('mọi bậc chết → ném lỗi CUỐI, không nuốt', async () => {
    const dead1 = stub('d1', [httpProviderError(403, 'access_denied', 'bậc 1 hết tiền')]);
    const dead2 = stub('d2', [httpProviderError(400, 'insufficient_user_quota', 'sàn hết quota')]);
    const chain = new FallbackGradingProvider([
      { provider: dead1, label: 'bậc 1' },
      { provider: dead2, label: 'bậc 2' },
    ]);

    // Lỗi của bậc CUỐI mang thông tin thật về vì sao ngay cả nó cũng không
    // đỡ được; dựng một lỗi mới sẽ vứt đi đúng thứ cần để điều tra.
    await expect(chain.grade(REQUEST)).rejects.toThrow(/sàn hết quota/);
  });

  it('chuỗi rỗng NỔ ngay lúc dựng, không đợi tới bài đầu tiên', () => {
    // Nổ lúc khởi động còn hơn nổ giữa một buổi thi.
    expect(() => new FallbackGradingProvider([])).toThrow(/ít nhất một bậc/);
  });

  it('name liệt kê đủ chuỗi để đọc log biết cấu hình nào đang chạy', () => {
    const chain = new FallbackGradingProvider([
      { provider: stub('a', [outcome('a')]), label: '1' },
      { provider: stub('b', [outcome('b')]), label: '2' },
    ]);
    expect(chain.name).toBe('fallback(a → b)');
  });
});
