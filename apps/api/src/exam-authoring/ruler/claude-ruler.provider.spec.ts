const finalMessageMock = jest.fn();
const streamMock = jest.fn((..._args: unknown[]) => ({ finalMessage: finalMessageMock }));

jest.mock('@anthropic-ai/sdk', () => {
  const Anthropic = jest.fn().mockImplementation(() => ({
    messages: { stream: streamMock },
  }));
  return { __esModule: true, default: Anthropic };
});

import { BadGatewayException, ServiceUnavailableException, UnprocessableEntityException } from '@nestjs/common';
import { AUTHORING_MODEL } from '../ai-provider/claude-authoring.provider';
import { ClaudeRulerProvider } from './claude-ruler.provider';
import { RulerProviderFailure } from './ruler-provider';
import { RULER_PROMPT_VERSION } from './ruler-prompt';
import { StubRulerProvider } from './stub-ruler.provider';

const STATEMENT = 'Cho n số nguyên. In ra các số theo thứ tự ngược lại.';
const GOOD = {
  modelAnswer: 'int main() {}',
  examples: [],
  cases: [{ name: 'a', group: 'co_ban', input: '1\n', quote: 'Cho n số nguyên', answerIsUnique: true }],
};

function message(overrides: Record<string, unknown> = {}, body: unknown = GOOD) {
  return {
    model: 'claude-sonnet-5',
    stop_reason: 'end_turn',
    content: [
      { type: 'thinking', thinking: '', signature: 'sig' },
      { type: 'text', text: '```json\n' + JSON.stringify(body) + '\n```' },
    ],
    usage: { input_tokens: 900, output_tokens: 2400, output_tokens_details: { thinking_tokens: 1000 } },
    ...overrides,
  };
}

async function failureOf(promise: Promise<unknown>): Promise<RulerProviderFailure> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(RulerProviderFailure);
    return error as RulerProviderFailure;
  }
  throw new Error('kỳ vọng lỗi, nhưng provider trả kết quả');
}

describe('ClaudeRulerProvider', () => {
  const provider = new ClaudeRulerProvider();

  beforeEach(() => {
    streamMock.mockClear();
    finalMessageMock.mockReset();
  });

  it('đọc đề xuất từ khối text (bỏ khối thinking), kèm usage của response và phiên bản prompt', async () => {
    finalMessageMock.mockResolvedValue(message());

    const r = await provider.propose({ statement: STATEMENT, language: 'cpp' });

    expect(r.proposal.modelAnswer).toBe('int main() {}');
    expect(r.proposal.cases).toHaveLength(1);
    expect(r.usage).toEqual({ modelUsed: 'claude-sonnet-5', inputTokens: 900, outputTokens: 2400 });
    expect(r.promptVersion).toBe(RULER_PROMPT_VERSION);
  });

  it('gọi model đã khai cho soạn đề, với trần token và trần thời gian, prompt mang đề nguyên văn', async () => {
    finalMessageMock.mockResolvedValue(message());

    await provider.propose({ statement: STATEMENT, language: 'python' });

    const [body, options] = streamMock.mock.calls[0] as [{ model: string; max_tokens: number; messages: { content: string }[] }, { timeout: number }];
    expect(body.model).toBe(AUTHORING_MODEL);
    expect(body.max_tokens).toBeGreaterThan(0);
    expect(body.messages[0].content).toContain(STATEMENT);
    expect(options.timeout).toBeGreaterThan(0);
  });

  // `timeout` của SDK hết tác dụng khi header đã về (không phủ phần stream) và SDK tự thử lại timeout 2 lần — ba lần 150 giây trước
  // khi có byte nào. Một lượt sinh chạy quá 15 phút bị lượt kế tiếp coi là chết và dọn, còn lượt này vẫn ghi gói.
  it('lời gọi bị chặn TOÀN BỘ bởi một tín hiệu huỷ và không tự thử lại ngầm', async () => {
    finalMessageMock.mockResolvedValue(message());

    await provider.propose({ statement: STATEMENT, language: 'cpp' });

    const [, options] = streamMock.mock.calls[0] as [unknown, { timeout: number; maxRetries: number; signal: AbortSignal }];
    expect(options.maxRetries).toBe(0);
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(options.signal.aborted).toBe(false);
  });

  it('luồng từ đáp án của giảng viên: modelAnswer model trả về bị bỏ — không thay được đáp án của giảng viên', async () => {
    finalMessageMock.mockResolvedValue(message());

    const r = await provider.propose({ statement: STATEMENT, language: 'cpp', teacherAnswer: 'int main() { return 7; }' });

    expect(r.proposal.modelAnswer).toBeNull();
    const [body] = streamMock.mock.calls[0] as [{ messages: { content: string }[] }];
    expect(body.messages[0].content).toContain('int main() { return 7; }');
  });

  it('model từ chối → 422, vẫn mang usage (đã tốn token)', async () => {
    finalMessageMock.mockResolvedValue(message({ stop_reason: 'refusal' }));
    const f = await failureOf(provider.propose({ statement: STATEMENT, language: 'cpp' }));
    expect(f.httpError).toBeInstanceOf(UnprocessableEntityException);
    expect(f.usage).toMatchObject({ inputTokens: 900, outputTokens: 2400 });
  });

  it('hết trần token → 422 nêu số token, mang usage', async () => {
    finalMessageMock.mockResolvedValue(message({ stop_reason: 'max_tokens' }));
    const f = await failureOf(provider.propose({ statement: STATEMENT, language: 'cpp' }));
    expect(f.httpError).toBeInstanceOf(UnprocessableEntityException);
    expect(f.httpError.message).toMatch(/2400/);
    expect(f.usage).not.toBeNull();
  });

  it('JSON hỏng → 502, mang usage, lời báo KHÔNG chứa nội dung phản hồi', async () => {
    finalMessageMock.mockResolvedValue(
      message({ content: [{ type: 'text', text: 'BÍ-MẬT-NỘI-DUNG {"modelAnswer": "x", "cases": [' }] }),
    );
    const f = await failureOf(provider.propose({ statement: STATEMENT, language: 'cpp' }));
    expect(f.httpError).toBeInstanceOf(BadGatewayException);
    expect(f.usage).not.toBeNull();
    expect(f.httpError.message).not.toContain('BÍ-MẬT-NỘI-DUNG');
  });

  it('mất kết nối trước khi có response → 502, usage null (chưa nhận token nào thì chưa tốn tiền)', async () => {
    finalMessageMock.mockRejectedValue(new Error('socket hang up'));
    const f = await failureOf(provider.propose({ statement: STATEMENT, language: 'cpp' }));
    expect(f.httpError).toBeInstanceOf(BadGatewayException);
    expect(f.usage).toBeNull();
  });
});

describe('StubRulerProvider', () => {
  it('không có model thật → 503 nói rõ phải cấu hình, không bịa ra thước', async () => {
    const f = await failureOf(new StubRulerProvider().propose({ statement: STATEMENT, language: 'cpp' }));
    expect(f.httpError).toBeInstanceOf(ServiceUnavailableException);
    expect(f.httpError.message).toMatch(/ANTHROPIC_API_KEY/);
    expect(f.usage).toBeNull();
  });
});
