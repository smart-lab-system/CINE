import { OpenAITierConfig, postChatJson, postChatText } from './openai-chat';
import { classifyProviderFailure } from './provider-failure';

const CONFIG: OpenAITierConfig = { tier: 'tầng 1 (m)', baseUrl: 'https://example.test/v1', model: 'm', apiKey: 'k' };
const fetchMock = jest.fn();
const reply = (content: string | undefined, finish = 'stop') => ({
  ok: true,
  status: 200,
  text: async () =>
    JSON.stringify({
      choices: [{ finish_reason: finish, message: { content } }],
      usage: { prompt_tokens: 11, completion_tokens: 7 },
    }),
});

describe('postChatText', () => {
  beforeAll(() => {
    global.fetch = fetchMock as unknown as typeof fetch;
  });
  beforeEach(() => fetchMock.mockReset());

  const request = {
    system: 'hệ thống',
    messages: [
      { role: 'user' as const, content: 'lượt 1' },
      { role: 'assistant' as const, content: '{"action":"call"}' },
      { role: 'user' as const, content: 'kết quả' },
    ],
    schemaName: 's',
    schema: { type: 'object' },
    maxTokens: 100,
  };

  it('gửi system trước, rồi đúng thứ tự các lượt, kèm json_schema strict', async () => {
    fetchMock.mockResolvedValue(reply('{"a":1}'));
    await postChatText(CONFIG, request);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.messages.map((m: { role: string }) => m.role)).toEqual(['system', 'user', 'assistant', 'user']);
    expect(body.response_format.json_schema.strict).toBe(true);
  });

  it('trả VĂN BẢN THÔ, không parse — bộ đọc của vòng lặp tự cắt suy luận (T-PARSE)', async () => {
    fetchMock.mockResolvedValue(reply('<think>x</think>{"a":1}'));
    const r = await postChatText(CONFIG, request);
    expect(r.content).toBe('<think>x</think>{"a":1}');
    expect(r.usage).toEqual({ inputTokens: 11, outputTokens: 7, cacheReadTokens: 0, cacheCreationTokens: 0 });
  });

  it('cắt cụt (finish_reason=length) → bad_output, như postChatJson', async () => {
    fetchMock.mockResolvedValue(reply('{"a"', 'length'));
    await expect(postChatText(CONFIG, request)).rejects.toMatchObject({ badOutput: true });
  });

  it('HTTP 403 → phân loại tier_dead', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 403, text: async () => '{}' });
    const error = await postChatText(CONFIG, request).catch((e) => e);
    expect(classifyProviderFailure(error)).toBe('tier_dead');
  });

  it('postChatJson không đổi hành vi: vẫn parse JSON và báo "không phải JSON hợp lệ"', async () => {
    fetchMock.mockResolvedValue(reply('không phải json'));
    await expect(
      postChatJson(CONFIG, { system: 's', user: 'u', schemaName: 's', schema: {}, maxTokens: 1 }),
    ).rejects.toThrow(/output không phải JSON hợp lệ/);
  });
});
