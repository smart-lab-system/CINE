import {
  OpenAICompatibleProvider,
  OpenAICompatibleConfig,
  maxTokensFor,
} from './openai-compatible.provider';
import { GradingRequest } from './ai-grading-provider';
import { classifyProviderFailure } from './provider-failure';

const CONFIG: OpenAICompatibleConfig = {
  tier: 'tầng 1 (qwen3.8-flash)',
  baseUrl: 'https://example.test/v1',
  model: 'qwen3.8-flash',
  apiKey: 'sk-giả-định',
  ceiling: 0.5,
};

const REQUEST: GradingRequest = {
  studentMssv: '2011060001',
  content: 'Thuật toán sắp xếp nổi bọt so sánh từng cặp phần tử kề nhau.',
  deliverableType: 'document',
  criteria: [{ id: 'c1', description: 'Trình bày thuật toán', maxPoints: 10 }],
};

const fetchMock = jest.fn();

function ok(body: Record<string, unknown>) {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify(body),
  };
}

function okGrading(overrides: Record<string, unknown> = {}) {
  return ok({
    choices: [
      {
        finish_reason: 'stop',
        message: {
          content: JSON.stringify({
            criterionResults: [
              { criterionId: 'c1', verdict: 'met', evidence: 'so sánh từng cặp phần tử' },
            ],
          }),
        },
      },
    ],
    usage: {
      prompt_tokens: 900,
      completion_tokens: 200,
      prompt_tokens_details: { cached_tokens: 0 },
    },
    ...overrides,
  });
}

describe('OpenAICompatibleProvider', () => {
  beforeAll(() => {
    global.fetch = fetchMock as unknown as typeof fetch;
  });
  beforeEach(() => fetchMock.mockReset());

  it('gửi response_format json_schema strict — thứ ĐÃ ĐO là có hiệu lực', async () => {
    // Đây là lý do file này tồn tại thay vì dùng lại ClaudeGradingProvider
    // qua shim Anthropic của cùng gateway: shim đó NHẬN `output_config`
    // rồi BỎ QUA (đo 2026-09-15, prompt thù địch trả về văn xuôi), còn
    // đường này thì ép thật.
    fetchMock.mockResolvedValue(okGrading());

    await new OpenAICompatibleProvider(CONFIG).grade(REQUEST);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.response_format.type).toBe('json_schema');
    expect(body.response_format.json_schema.strict).toBe(true);
  });

  it('schema KHÔNG cho model trả về bất kỳ con số nào', async () => {
    fetchMock.mockResolvedValue(okGrading());

    await new OpenAICompatibleProvider(CONFIG).grade(REQUEST);

    const schema = JSON.stringify(
      JSON.parse(fetchMock.mock.calls[0][1].body).response_format.json_schema.schema,
    );
    expect(schema).not.toContain('points');
    expect(schema).not.toContain('totalScore');
    expect(schema).not.toContain('confidence');
  });

  it('điểm luôn 0 ở tầng provider — server tính lại từ verdict', async () => {
    fetchMock.mockResolvedValue(okGrading());

    const out = await new OpenAICompatibleProvider(CONFIG).grade(REQUEST);

    expect(out.criterionResults[0].points).toBe(0);
    expect(out.totalScore).toBe(0);
    // Phán đoán thì GIỮ NGUYÊN — đó là phần model được quyết.
    expect(out.criterionResults[0].verdict).toBe('met');
  });

  it('finish_reason=length → lỗi ĐƯỢC ĐÁNH DẤU là output hỏng', async () => {
    // Phải phân biệt "bị cắt cụt" với "trả JSON hỏng": cắt cụt thường là
    // ngẫu nhiên nên thử lại hay ăn, còn hỏng schema thì nghi ngờ cả bậc.
    // Gộp hai thứ này lại là mất khả năng chọn đúng cách xử lý.
    fetchMock.mockResolvedValue(
      ok({ choices: [{ finish_reason: 'length', message: { content: '{"criterionRes' } }] }),
    );

    const caught = await new OpenAICompatibleProvider(CONFIG)
      .grade(REQUEST)
      .catch((e: unknown) => e);

    expect(classifyProviderFailure(caught)).toBe('bad_output');
    expect((caught as Error).message).toMatch(/cắt cụt/);
  });

  it('JSON hỏng → output hỏng, và KHÔNG nêu nội dung trả về', async () => {
    // Message này đi vào `failedReason` trong Redis; nội dung model trả về
    // chứa dẫn chứng trích từ bài làm của sinh viên.
    const essay = 'bài làm bí mật của em MSSV 2011060123';
    fetchMock.mockResolvedValue(
      ok({ choices: [{ finish_reason: 'stop', message: { content: essay } }] }),
    );

    const caught = (await new OpenAICompatibleProvider(CONFIG)
      .grade(REQUEST)
      .catch((e: unknown) => e)) as Error;

    expect(classifyProviderFailure(caught)).toBe('bad_output');
    expect(caught.message).not.toContain(essay);
  });

  it('HTTP lỗi giữ nguyên status VÀ code để phân loại được', async () => {
    // Không có `code` thì `insufficient_user_quota` (400) đọc y hệt một
    // lỗi tham số của chính ta, và bậc chết sẽ không bao giờ được nhận ra.
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      text: async () =>
        JSON.stringify({ error: { code: 'insufficient_user_quota', message: 'hết quota' } }),
    });

    const caught = await new OpenAICompatibleProvider(CONFIG)
      .grade(REQUEST)
      .catch((e: unknown) => e);

    expect(classifyProviderFailure(caught)).toBe('tier_dead');
    expect((caught as { status?: number }).status).toBe(400);
  });

  it('body lỗi KHÔNG phải JSON thì không ghép vào message', async () => {
    // Với 4xx, body có thể là request của chính ta dội lại — tức chứa bài
    // làm của sinh viên.
    const essay = 'bài làm bí mật của em';
    fetchMock.mockResolvedValue({ ok: false, status: 413, text: async () => essay });

    const caught = (await new OpenAICompatibleProvider(CONFIG)
      .grade(REQUEST)
      .catch((e: unknown) => e)) as Error;

    expect(caught.message).not.toContain(essay);
    expect(caught.message).toMatch(/413/);
  });

  it('contextUsed nói SỰ THẬT: giao thức này không gửi được PDF', async () => {
    // Lỗ suy giảm âm thầm: giảng viên đã upload đề bài, `grading-readiness`
    // báo "mức 3", nhưng bậc này không đọc được PDF nên bài thực tế chấm ở
    // mức "chỉ có rubric". Không khai ra thì cả giảng viên lẫn calibration
    // đều bị nói dối.
    fetchMock.mockResolvedValue(okGrading());

    const out = await new OpenAICompatibleProvider(CONFIG).grade({
      ...REQUEST,
      reference: { questionPdf: Buffer.from('%PDF-1.4'), modelAnswerPdf: Buffer.from('%PDF-1.4') },
    });

    expect(out.contextUsed).toEqual({ question: false, modelAnswer: false });
  });

  it('ghi chú của giảng viên LÀ văn bản nên vẫn đi qua được', async () => {
    // Phân biệt quan trọng: chỉ PDF là không gửi được, không phải toàn bộ
    // tài liệu tham chiếu.
    fetchMock.mockResolvedValue(okGrading());

    const out = await new OpenAICompatibleProvider(CONFIG).grade({
      ...REQUEST,
      reference: { modelAnswerNote: 'đáp án: dùng cây phân đoạn' },
    });

    expect(out.contextUsed).toEqual({ question: false, modelAnswer: true });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(JSON.stringify(body.messages)).toContain('dùng cây phân đoạn');
  });

  it('bài làm được bọc vỏ chống injection như mọi provider khác', async () => {
    fetchMock.mockResolvedValue(okGrading());

    await new OpenAICompatibleProvider(CONFIG).grade(REQUEST);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(JSON.stringify(body.messages)).toContain('BEGIN SUBMISSION');
  });

  it('usage đọc cached_tokens từ prompt_tokens_details', async () => {
    // Đo được hiện tại là 0 (không có caching), nhưng đọc nó vẫn đúng hơn
    // là ghi cứng 0 rồi không bao giờ biết khi nào nhà cung cấp bật.
    fetchMock.mockResolvedValue(
      okGrading({
        usage: {
          prompt_tokens: 900,
          completion_tokens: 200,
          prompt_tokens_details: { cached_tokens: 700 },
        },
      }),
    );

    const out = await new OpenAICompatibleProvider(CONFIG).grade(REQUEST);

    expect(out.usage).toEqual({
      inputTokens: 900,
      outputTokens: 200,
      cacheReadTokens: 700,
      cacheCreationTokens: 0,
    });
  });

  it('trần tin cậy lấy từ cấu hình, không ghi cứng', async () => {
    fetchMock.mockResolvedValue(okGrading());

    const out = await new OpenAICompatibleProvider({ ...CONFIG, ceiling: 0.3 }).grade(REQUEST);

    expect(out.confidenceCeiling).toBe(0.3);
  });
});

describe('maxTokensFor', () => {
  it('tăng theo SỐ TIÊU CHÍ, không theo độ dài bài làm', () => {
    // Output là một mảng một phần tử mỗi tiêu chí, nên đó mới là thứ
    // quyết định ngân sách. Một con số cứng sẽ hoặc phí với rubric 3 tiêu
    // chí, hoặc cụt với rubric 20.
    const three = maxTokensFor(Array(3).fill({ id: 'c', description: 'd', maxPoints: 1 }));
    const twenty = maxTokensFor(Array(20).fill({ id: 'c', description: 'd', maxPoints: 1 }));
    expect(twenty).toBeGreaterThan(three);
  });

  it('có trần trên — không gửi một con số vô hạn', () => {
    const huge = maxTokensFor(Array(500).fill({ id: 'c', description: 'd', maxPoints: 1 }));
    expect(huge).toBeLessThanOrEqual(16000);
  });

  it('rubric rỗng vẫn có ngân sách dùng được', () => {
    expect(maxTokensFor([])).toBeGreaterThan(0);
  });
});
