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

    const outcome = await new ClaudeAuthoringProvider().generate(REQUEST);

    expect(outcome.exam.questions).toHaveLength(1);
    expect(outcome.usage).toEqual({
      modelUsed: 'claude-sonnet-5',
      inputTokens: 752,
      outputTokens: 6196,
    });
  });

  // ĐO THẬT 2026-09-24: Sonnet 5 bật adaptive thinking MẶC ĐỊNH, và token
  // thinking tính vào max_tokens. Lượt 10 câu với trần 16000 tiêu trọn
  // 16000 cho thinking, không còn một token nào cho đề.
  it('xin trần token đủ cho cả phần suy nghĩ lẫn đề 10 câu', async () => {
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
    const error = await new ClaudeAuthoringProvider().generate(REQUEST).catch((e) => e);
    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect(error.message).toMatch(/hết trần token/i);
  });

  it('model từ chối thì báo từ chối, không đọc khối text rỗng thành JSON hỏng', async () => {
    finalMessageMock.mockResolvedValue(
      message({ stop_reason: 'refusal', content: [], stop_details: { type: 'refusal' } }),
    );

    const error = await new ClaudeAuthoringProvider().generate(REQUEST).catch((e) => e);
    expect(error).toBeInstanceOf(UnprocessableEntityException);
    expect(error.message).toMatch(/từ chối/i);
  });

  it('đầu ra không đọc được thì 502 kèm lời báo đọc được, không phải 500 trống', async () => {
    finalMessageMock.mockResolvedValue(
      message({ content: [{ type: 'text', text: 'Xin lỗi, tôi chưa soạn được đề.' }] }),
    );

    const error = await new ClaudeAuthoringProvider().generate(REQUEST).catch((e) => e);
    expect(error).toBeInstanceOf(BadGatewayException);
    expect(error.message).toMatch(/không đọc được/i);
  });
});
