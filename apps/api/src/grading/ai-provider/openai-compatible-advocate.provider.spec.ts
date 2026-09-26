import { Logger } from '@nestjs/common';
import { OpenAICompatibleAdvocateProvider } from './openai-compatible-advocate.provider';
import { ADVOCATE_JSON_SCHEMA, ADVOCATE_OUTPUT_EXAMPLE, ADVOCATE_PLACEHOLDERS } from './advocate-schema';
import { classifyProviderFailure } from './provider-failure';

/** Mọi tên trường của một JSON schema, đi qua properties / items. */
function propertyNames(schema: unknown): string[] {
  const out = new Set<string>();
  const walk = (s: unknown) => {
    if (!s || typeof s !== 'object') return;
    const o = s as { properties?: Record<string, unknown>; items?: unknown };
    for (const [k, v] of Object.entries(o.properties ?? {})) {
      out.add(k);
      walk(v);
    }
    walk(o.items);
  };
  walk(schema);
  return [...out];
}

/** Chỗ vi phạm strict mode: object phải `additionalProperties: false` và `required` = mọi khoá. */
function strictViolations(schema: unknown, path = '$'): string[] {
  if (!schema || typeof schema !== 'object') return [];
  const o = schema as { type?: string; properties?: Record<string, unknown>; required?: string[]; additionalProperties?: unknown; items?: unknown };
  const out: string[] = [];
  if (o.type === 'object') {
    const keys = Object.keys(o.properties ?? {}).sort();
    const required = [...(o.required ?? [])].sort();
    if (o.additionalProperties !== false) out.push(`${path}: thiếu additionalProperties: false`);
    if (JSON.stringify(keys) !== JSON.stringify(required)) out.push(`${path}: required ${JSON.stringify(required)} ≠ ${JSON.stringify(keys)}`);
  }
  for (const [k, v] of Object.entries(o.properties ?? {})) out.push(...strictViolations(v, `${path}.${k}`));
  out.push(...strictViolations(o.items, `${path}[]`));
  return out;
}

const CONFIG = { tier: 'tầng 1 (m)', baseUrl: 'https://x.test/v1', model: 'm', apiKey: 'k', ceiling: 0.5 };
const REQUEST = { studentMssv: 'sv1', content: 'Em dùng cây phân đoạn thay vì mảng cộng dồn.' };

function reply(content: string) {
  return { ok: true, status: 200, text: async () => JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content } }], usage: {} }) };
}

const VALID = {
  isCorrect: 'yes',
  reasoning: 'Em chọn cấu trúc khác nhưng giải đúng.',
  evidence: ['Em dùng cây phân đoạn'],
  suggestedVerdicts: [],
  injectionAttempt: { detected: false, quote: '' },
};

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

describe('OpenAICompatibleAdvocateProvider — khuôn output trên route không ép json_schema', () => {
  const realFetch = global.fetch;
  const fetchMock = jest.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });
  afterEach(() => jest.restoreAllMocks());
  afterAll(() => {
    global.fetch = realFetch;
  });

  it('khuôn JSON nằm NGAY trong system prompt, khớp schema — route cnb/, spd/ bỏ qua response_format (đo 2026-09-25)', async () => {
    fetchMock.mockResolvedValue(reply(JSON.stringify(VALID)));
    await new OpenAICompatibleAdvocateProvider(CONFIG).advocate(REQUEST);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    const system: string = body.messages[0].content;
    for (const name of propertyNames(body.response_format.json_schema.schema)) expect(system).toContain(`"${name}"`);
    for (const v of ['yes', 'partially', 'no', 'met', 'partially_met', 'not_met']) expect(system).toContain(v);
    expect(system).toContain(ADVOCATE_OUTPUT_EXAMPLE);
    expect(system).toMatch(/"evidence": MẢNG/);
  });

  it('schema hợp lệ với strict mode — mọi object liệt kê ĐỦ khoá trong required (thiếu `quote` là 400 ở route ép strict)', () => {
    expect(strictViolations(ADVOCATE_JSON_SCHEMA)).toEqual([]);
  });

  it('mẫu là JSON đúng khung: điền chỗ giữ chỗ bằng giá trị thật thì qua được provider', async () => {
    const filled = ADVOCATE_OUTPUT_EXAMPLE.split(ADVOCATE_PLACEHOLDERS[0]).join('partially')
      .split(ADVOCATE_PLACEHOLDERS[1]).join('Đúng một phần.')
      .split(ADVOCATE_PLACEHOLDERS[2]).join('Em dùng cây phân đoạn');
    fetchMock.mockResolvedValue(reply(filled));
    const out = await new OpenAICompatibleAdvocateProvider(CONFIG).advocate(REQUEST);
    expect(out.isCorrect).toBe('partially');
    expect(out.evidence).toEqual(['Em dùng cây phân đoạn']);
    expect(out.suggestedVerdicts).toEqual([]);
  });

  it('route không ép schema bỏ `quote` khi không có gì đáng ngờ → vẫn là một ý kiến, không phải output hỏng', async () => {
    fetchMock.mockResolvedValue(reply(JSON.stringify({ ...VALID, injectionAttempt: { detected: false } })));
    const out = await new OpenAICompatibleAdvocateProvider(CONFIG).advocate(REQUEST);
    expect(out.isCorrect).toBe('yes');
  });

  it('chép nguyên chỗ giữ chỗ của mẫu → output hỏng (thử lại / sang bậc), KHÔNG thành một ý kiến kèm dẫn chứng giả', async () => {
    for (const content of [
      ADVOCATE_OUTPUT_EXAMPLE,
      JSON.stringify({ ...VALID, reasoning: ADVOCATE_PLACEHOLDERS[1] }),
      JSON.stringify({ ...VALID, evidence: ['Em dùng cây phân đoạn', ADVOCATE_PLACEHOLDERS[2]] }),
    ]) {
      fetchMock.mockResolvedValue(reply(content));
      const error = await new OpenAICompatibleAdvocateProvider(CONFIG).advocate(REQUEST).catch((e: unknown) => e);
      expect(classifyProviderFailure(error)).toBe('bad_output');
    }
  });

  it('`evidence` là một chuỗi thay vì mảng → output hỏng, KHÔNG nêu nội dung trả về', async () => {
    fetchMock.mockResolvedValue(reply(JSON.stringify({ ...VALID, evidence: 'bài làm bí mật của em' })));
    const error = (await new OpenAICompatibleAdvocateProvider(CONFIG).advocate(REQUEST).catch((e: unknown) => e)) as Error;
    expect(classifyProviderFailure(error)).toBe('bad_output');
    expect(error.message).toMatch(/evidence/);
    expect(error.message).not.toContain('bài làm bí mật');
  });
});
