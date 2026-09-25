import { Logger } from '@nestjs/common';
import { OpenAICompatibleAdvocateProvider } from './openai-compatible-advocate.provider';

describe('OpenAICompatibleAdvocateProvider — log', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
    jest.restoreAllMocks();
  });

  it('phiên có PDF đề bài: ghi ĐÚNG MỘT dòng đọc được — không có dòng NaN (khối log trùng bị `+` đơn biến thành số)', async () => {
    const lines: unknown[] = [];
    jest.spyOn(Logger.prototype, 'log').mockImplementation((message: unknown) => void lines.push(message));
    global.fetch = (async () => {
      throw new Error('không gọi mạng trong test');
    }) as unknown as typeof fetch;
    const provider = new OpenAICompatibleAdvocateProvider({ tier: 'tầng 1 (m)', baseUrl: 'https://x.test/v1', model: 'm', apiKey: 'k' } as never);
    await provider.advocate({ studentMssv: 'sv1', content: 'bài', questionPdf: Buffer.from('%PDF') }).catch(() => undefined);
    expect(lines).toHaveLength(1);
    expect(String(lines[0])).toMatch(/sv1: có PDF đề bài\/đáp án nhưng tầng 1 \(m\) không gửi được document/);
    expect(lines.some((l) => typeof l === 'number' || String(l) === 'NaN')).toBe(false);
  });
});
