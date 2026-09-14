const createMock = jest.fn();

jest.mock('@anthropic-ai/sdk', () => {
  const Anthropic = jest.fn().mockImplementation(() => ({
    messages: { create: createMock },
  }));
  return { __esModule: true, default: Anthropic };
});

import { ClaudeGradingProvider } from './claude-grading.provider';
import { GradingRequest } from './ai-grading-provider';

const REQUEST: GradingRequest = {
  studentMssv: '2011060001',
  content: 'Thuật toán sắp xếp nổi bọt so sánh từng cặp phần tử kề nhau.',
  deliverableType: 'document',
  criteria: [{ id: 'c1', description: 'Trình bày thuật toán', maxPoints: 10 }],
};

function okResponse(overrides: Record<string, unknown> = {}) {
  return {
    stop_reason: 'end_turn',
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          criterionResults: [
            { criterionId: 'c1', verdict: 'met', evidence: 'so sánh từng cặp phần tử' },
          ],
          uncoveredContent: [],
          injectionAttempt: { detected: false },
        }),
      },
    ],
    usage: {
      input_tokens: 9300,
      output_tokens: 1200,
      cache_read_input_tokens: 6300,
      cache_creation_input_tokens: 0,
    },
    ...overrides,
  };
}

describe('ClaudeGradingProvider', () => {
  beforeEach(() => createMock.mockReset());

  it('gọi đúng model, adaptive thinking, KHÔNG budget_tokens', async () => {
    // `budget_tokens` bị Opus 5 trả 400 — nó là tham số của thế hệ trước.
    // Và prefill assistant cũng bị 400, nên `messages` chỉ có vai user.
    createMock.mockResolvedValue(okResponse());

    await new ClaudeGradingProvider().grade(REQUEST);

    const params = createMock.mock.calls[0][0];
    expect(params.model).toBe('claude-opus-5');
    expect(params.thinking).toEqual({ type: 'adaptive' });
    expect(params.thinking.budget_tokens).toBeUndefined();
    expect(params.messages.every((m: { role: string }) => m.role === 'user')).toBe(true);
  });

  it('dùng structured output, KHÔNG phải output_format đã deprecated', async () => {
    createMock.mockResolvedValue(okResponse());

    await new ClaudeGradingProvider().grade(REQUEST);

    const params = createMock.mock.calls[0][0];
    expect(params.output_config.format.type).toBe('json_schema');
    expect(params.output_format).toBeUndefined();
  });

  it('schema KHÔNG cho model trả về bất kỳ con số nào', async () => {
    // Guard mạnh nhất trong cả thiết kế, và nó mạnh vì XOÁ CƠ HỘI SAI:
    // model không thể trả về một con số lệch với verdict nếu nó không
    // được phép trả về con số nào.
    createMock.mockResolvedValue(okResponse());

    await new ClaudeGradingProvider().grade(REQUEST);

    const schema = JSON.stringify(createMock.mock.calls[0][0].output_config.format.schema);
    expect(schema).not.toContain('points');
    expect(schema).not.toContain('totalScore');
    expect(schema).not.toContain('confidence');
  });

  it('map usage sang GradingOutcome, gồm cả token đọc từ cache', async () => {
    // `cacheReadTokens > 0` là bằng chứng DUY NHẤT rằng caching có tác
    // dụng thật. Nuốt mất nó là mất luôn nguồn cho cost_usd và dashboard.
    createMock.mockResolvedValue(okResponse());

    const outcome = await new ClaudeGradingProvider().grade(REQUEST);

    expect(outcome.usage).toEqual({
      inputTokens: 9300,
      outputTokens: 1200,
      cacheReadTokens: 6300,
      cacheCreationTokens: 0,
    });
  });

  it('KHÔNG tự khai confidence — chỉ khai TRẦN mà cơ chế biện minh nổi', async () => {
    // Trần 1 không phải "tôi tự tin 100% về bài này". Nó nói rằng cơ chế
    // (model mạnh đọc hiểu + trích dẫn nguyên văn) có thể biện minh cho
    // một điểm tự duyệt NẾU các phép đo cơ học đồng ý. Con số cuối vẫn do
    // `applyGuards` quyết, và bị kẹp dưới trần này.
    createMock.mockResolvedValue(okResponse());

    const outcome = await new ClaudeGradingProvider().grade(REQUEST);

    expect(outcome.confidenceCeiling).toBe(1);
    expect(outcome.criterionResults[0].points).toBe(0);
    expect(outcome.totalScore).toBe(0);
    // Phán đoán thì GIỮ NGUYÊN — đó là phần model được quyết.
    expect(outcome.criterionResults[0].verdict).toBe('met');
    expect(outcome.criterionResults[0].evidence).toBe('so sánh từng cặp phần tử');
  });

  it('stop_reason refusal → ném lỗi có status, KHÔNG trả bài chấm rỗng', async () => {
    // Từ chối là HTTP 200. Không kiểm thì nó đọc ra như một bài chấm
    // không có tiêu chí nào, và sinh viên nhận 0 điểm vì model không chịu
    // trả lời.
    createMock.mockResolvedValue({
      stop_reason: 'refusal',
      stop_details: { type: 'refusal', category: 'cyber' },
      content: [],
      usage: { input_tokens: 10, output_tokens: 0 },
    });

    const caught = (await new ClaudeGradingProvider()
      .grade(REQUEST)
      .catch((e: unknown) => e)) as Error & { status?: number };

    expect(caught).toBeInstanceOf(Error);
    expect(caught.status).toBe(422);
    expect(caught.message).toMatch(/từ chối/i);
  });

  it('output sai schema → ném, và KHÔNG nêu nội dung trả về', async () => {
    // Message này đi vào `failedReason` trong Redis. Nội dung model trả
    // về chứa dẫn chứng trích từ bài làm của sinh viên.
    const essay = 'bài làm bí mật của em MSSV 2011060123';
    createMock.mockResolvedValue(
      okResponse({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              criterionResults: [{ criterionId: 'c1', verdict: 'KHÔNG_HỢP_LỆ', evidence: essay }],
              uncoveredContent: [],
              injectionAttempt: { detected: false },
            }),
          },
        ],
      }),
    );

    const caught = (await new ClaudeGradingProvider()
      .grade(REQUEST)
      .catch((e: unknown) => e)) as Error & { status?: number };

    expect(caught.status).toBe(422);
    expect(caught.message).not.toContain(essay);
    // Vẫn phải nói được SAI Ở ĐÂU.
    expect(caught.message).toMatch(/criterionResults/);
  });

  it('tài liệu tham chiếu đi vào prompt qua withReference', async () => {
    createMock.mockResolvedValue(okResponse());

    await new ClaudeGradingProvider()
      .withReference({ questionPdf: Buffer.from('%PDF-1.4 de thi') })
      .grade(REQUEST);

    const content = createMock.mock.calls[0][0].messages[0].content;
    expect(content.some((b: { type: string }) => b.type === 'document')).toBe(true);
  });
});
