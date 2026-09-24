const finalMessageMock = jest.fn();
const streamMock = jest.fn(() => ({ finalMessage: finalMessageMock }));

jest.mock('@anthropic-ai/sdk', () => {
  const Anthropic = jest.fn().mockImplementation(() => ({
    messages: { stream: streamMock },
  }));
  return { __esModule: true, default: Anthropic };
});

import { BadGatewayException, UnprocessableEntityException } from '@nestjs/common';
import { ClaudeAuthoringProvider } from './claude-authoring.provider';
import { AuthoringRequest } from './exam-authoring-provider';

/** Lượt LẺ — `questionCount: 1`, một lời gọi model duy nhất, ném lỗi thẳng
 *  khi hỏng. Dùng cho cả lượt sinh 1 câu đầu tiên lẫn "Sinh lại riêng câu
 *  này" — cả hai đều không có gì để fan-out với N=1. */
const SINGLE_REQUEST: AuthoringRequest = {
  prompt: 'Đề giữa kỳ về danh sách liên kết',
  knowledge: [],
  questionCount: 1,
  language: 'python',
};

/** Lượt NHIỀU CÂU — `questionCount > 1` đi qua `generateFanOut`, N lời gọi
 *  song song. Test 'xin trần token đủ...' cố ý dùng fixture này để chứng
 *  minh trần token áp cho TỪNG lời gọi trong fan-out, không chỉ lượt lẻ. */
const REQUEST: AuthoringRequest = {
  prompt: 'Đề giữa kỳ về danh sách liên kết',
  knowledge: [],
  questionCount: 10,
  language: 'python',
};

const EXAM_JSON = JSON.stringify({
  title: 'Giữa kỳ',
  language: 'python',
  questions: [
    {
      statement: 'Đảo ngược danh sách liên kết',
      points: 10,
      topic: 'linked-list',
      requiredComplexity: 'O(n)',
      modelAnswer: 'def solve(head):\n    return head\n',
      testBundle: [],
      resemblesKnownProblem: null,
    },
  ],
});

function message(overrides: Record<string, unknown> = {}) {
  return {
    model: 'claude-sonnet-5',
    stop_reason: 'end_turn',
    content: [
      { type: 'thinking', thinking: '', signature: 'sig' },
      { type: 'text', text: '```json\n' + EXAM_JSON + '\n```' },
    ],
    usage: {
      input_tokens: 752,
      output_tokens: 6196,
      output_tokens_details: { thinking_tokens: 3118 },
    },
    ...overrides,
  };
}

describe('ClaudeAuthoringProvider', () => {
  beforeEach(() => {
    streamMock.mockClear();
    finalMessageMock.mockReset();
  });

  it('đọc được đề từ khối text, bỏ qua khối thinking', async () => {
    finalMessageMock.mockResolvedValue(message());

    const outcome = await new ClaudeAuthoringProvider().generate(SINGLE_REQUEST);

    expect(outcome.exam.questions).toHaveLength(1);
    expect(outcome.usage).toEqual({
      modelUsed: 'claude-sonnet-5',
      inputTokens: 752,
      outputTokens: 6196,
    });
  });

  // ĐO THẬT 2026-09-24: Sonnet 5 bật adaptive thinking MẶC ĐỊNH, và token
  // thinking tính vào max_tokens. Lượt 10 câu (fan-out, mỗi lời gọi vẫn xin
  // ĐÚNG 1 câu) cũng phải xin đủ trần cho lời gọi ĐẦU TIÊN — trần áp cho
  // TỪNG lời gọi, không phải chia đều cho cả lô.
  it('xin trần token đủ cho cả phần suy nghĩ lẫn một câu trong fan-out', async () => {
    finalMessageMock.mockResolvedValue(message());

    await new ClaudeAuthoringProvider().generate(REQUEST);

    const params = (streamMock.mock.calls[0] as unknown[])[0] as { max_tokens: number };
    expect(params.max_tokens).toBeGreaterThanOrEqual(32000);
  });

  it('hết trần token thì nói ĐÚNG là hết token, không đổ cho "JSON hỏng"', async () => {
    finalMessageMock.mockResolvedValue(
      message({
        stop_reason: 'max_tokens',
        content: [{ type: 'thinking', thinking: '', signature: 'sig' }],
        usage: {
          input_tokens: 752,
          output_tokens: 16000,
          output_tokens_details: { thinking_tokens: 16000 },
        },
      }),
    );

    // 422 chứ không 500: 500 tới trình duyệt chỉ còn "Internal server error",
    // và lời khuyên "giảm số câu" — thứ giảng viên cần — bị nuốt mất.
    const error = await new ClaudeAuthoringProvider().generate(SINGLE_REQUEST).catch((e) => e);
    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect(error.message).toMatch(/hết trần token/i);
  });

  it('model từ chối thì báo từ chối, không đọc khối text rỗng thành JSON hỏng', async () => {
    finalMessageMock.mockResolvedValue(
      message({ stop_reason: 'refusal', content: [], stop_details: { type: 'refusal' } }),
    );

    const error = await new ClaudeAuthoringProvider().generate(SINGLE_REQUEST).catch((e) => e);
    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect(error.message).toMatch(/từ chối/i);
  });

  it('đầu ra không đọc được thì 502 kèm lời báo đọc được, không phải 500 trống', async () => {
    finalMessageMock.mockResolvedValue(
      message({ content: [{ type: 'text', text: 'Xin lỗi, tôi chưa soạn được đề.' }] }),
    );

    const error = await new ClaudeAuthoringProvider().generate(SINGLE_REQUEST).catch((e) => e);
    expect(error).toBeInstanceOf(BadGatewayException);
    expect(error.message).toMatch(/không đọc được/i);
  });

  describe('fan-out (questionCount > 1)', () => {
    it('sinh N câu thì gọi model N lần, mỗi lần xin ĐÚNG 1 câu', async () => {
      finalMessageMock.mockResolvedValue(message());

      const outcome = await new ClaudeAuthoringProvider().generate({ ...REQUEST, questionCount: 4 });

      expect(streamMock).toHaveBeenCalledTimes(4);
      expect(outcome.exam.questions).toHaveLength(4);
      for (const call of streamMock.mock.calls as unknown as { messages: { content: string }[] }[][]) {
        expect(call[0].messages[0].content).toMatch(/"questions":\s*\[\{/);
      }
    });

    it('chạy SONG SONG — N lời gọi bắn ra cùng lúc, không đợi lời gọi trước xong', async () => {
      const n = 3;
      const deferreds = Array.from({ length: n }, () => {
        let resolve!: (v: unknown) => void;
        const promise = new Promise((res) => {
          resolve = res;
        });
        return { promise, resolve };
      });
      deferreds.forEach((d) => finalMessageMock.mockImplementationOnce(() => d.promise));

      const pending = new ClaudeAuthoringProvider().generate({ ...REQUEST, questionCount: n });

      // Nhường vòng lặp sự kiện vài lượt để phần ĐỒNG BỘ của cả 3 lời gọi
      // (stream() + finalMessage()) kịp chạy — nhưng CHƯA lời gọi nào được
      // resolve. Nếu code chạy tuần tự, lượt thứ hai/ba sẽ chưa gọi tới.
      await Promise.resolve();
      await Promise.resolve();
      expect(finalMessageMock).toHaveBeenCalledTimes(n);

      deferreds.forEach((d) => d.resolve(message()));
      await pending;
    });

    it('K trong N câu hỏng thì vẫn trả về (N-K) câu kèm failedCount=K, KHÔNG ném lỗi', async () => {
      finalMessageMock
        .mockResolvedValueOnce(message()) // 1: OK
        .mockResolvedValueOnce(
          message({ stop_reason: 'refusal', content: [] }), // 2: từ chối
        )
        .mockResolvedValueOnce(message()) // 3: OK
        .mockResolvedValueOnce(
          message({
            stop_reason: 'max_tokens',
            content: [],
            usage: { input_tokens: 100, output_tokens: 16000 },
          }), // 4: hết trần
        )
        .mockRejectedValueOnce(new Error('ECONNRESET')); // 5: mất mạng

      const outcome = await new ClaudeAuthoringProvider().generate({ ...REQUEST, questionCount: 5 });

      expect(outcome.exam.questions).toHaveLength(2);
      expect(outcome.exam.failedCount).toBe(3);
    });

    it('cả N câu đều hỏng thì ném lỗi của worker ĐẦU TIÊN, không tự bịa lỗi chung', async () => {
      finalMessageMock
        .mockResolvedValueOnce(message({ stop_reason: 'refusal', content: [] }))
        .mockResolvedValueOnce(
          message({
            stop_reason: 'max_tokens',
            content: [],
            usage: { input_tokens: 100, output_tokens: 16000 },
          }),
        );

      const error = await new ClaudeAuthoringProvider()
        .generate({ ...REQUEST, questionCount: 2 })
        .catch((e) => e);

      expect(error).toBeInstanceOf(UnprocessableEntityException);
      expect(error.message).toMatch(/từ chối/i);
    });

    it('usage được CỘNG DỒN qua các lượt thành công', async () => {
      finalMessageMock
        .mockResolvedValueOnce(message({ usage: { input_tokens: 100, output_tokens: 200 } }))
        .mockResolvedValueOnce(message({ usage: { input_tokens: 150, output_tokens: 300 } }));

      const outcome = await new ClaudeAuthoringProvider().generate({ ...REQUEST, questionCount: 2 });

      expect(outcome.usage.inputTokens).toBe(250);
      expect(outcome.usage.outputTokens).toBe(500);
    });

    it('lỗi refusal/max_tokens (ĐÃ có response) vẫn cộng usage — tiền đã tốn thật', async () => {
      finalMessageMock
        .mockResolvedValueOnce(message({ usage: { input_tokens: 100, output_tokens: 200 } }))
        .mockResolvedValueOnce(
          message({
            stop_reason: 'refusal',
            content: [],
            usage: { input_tokens: 50, output_tokens: 10 },
          }),
        );

      const outcome = await new ClaudeAuthoringProvider().generate({ ...REQUEST, questionCount: 2 });

      expect(outcome.usage.inputTokens).toBe(150);
      expect(outcome.usage.outputTokens).toBe(210);
      expect(outcome.exam.failedCount).toBe(1);
    });

    it('lỗi vì mất mạng (chưa có response) KHÔNG cộng usage — chưa tốn token', async () => {
      finalMessageMock
        .mockResolvedValueOnce(message({ usage: { input_tokens: 100, output_tokens: 200 } }))
        .mockRejectedValueOnce(new Error('network down'));

      const outcome = await new ClaudeAuthoringProvider().generate({ ...REQUEST, questionCount: 2 });

      expect(outcome.usage.inputTokens).toBe(100);
      expect(outcome.usage.outputTokens).toBe(200);
      expect(outcome.exam.failedCount).toBe(1);
    });

    it('mỗi worker mang đúng batchIndex/batchSize của chính nó vào prompt', async () => {
      finalMessageMock.mockResolvedValue(message());

      await new ClaudeAuthoringProvider().generate({ ...REQUEST, questionCount: 3 });

      const calls = streamMock.mock.calls as unknown as { messages: { content: string }[] }[][];
      expect(calls[0][0].messages[0].content).toContain('1/3');
      expect(calls[1][0].messages[0].content).toContain('2/3');
      expect(calls[2][0].messages[0].content).toContain('3/3');
    });

    it('mỗi lời gọi fan-out mang timeout riêng, để một worker treo không kéo dài cả lô', async () => {
      finalMessageMock.mockResolvedValue(message());

      await new ClaudeAuthoringProvider().generate({ ...REQUEST, questionCount: 2 });

      const calls = streamMock.mock.calls as unknown as [unknown, { timeout?: number }][];
      for (const call of calls) {
        expect(typeof call[1]?.timeout).toBe('number');
      }
    });

    it('không phải mọi câu đều hỏng thì đề đủ N câu KHÔNG mang failedCount (vắng, không phải 0)', async () => {
      finalMessageMock.mockResolvedValue(message());

      const outcome = await new ClaudeAuthoringProvider().generate({ ...REQUEST, questionCount: 2 });

      expect(outcome.exam.failedCount).toBeUndefined();
    });
  });
});
