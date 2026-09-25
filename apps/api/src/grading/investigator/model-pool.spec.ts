import { ChatTextRequest } from '../ai-provider/openai-chat';
import { badOutputError, httpProviderError } from '../ai-provider/provider-failure';
import { buildInvestigatorTiers, DeadlineExceededError, ModelPool, ModelsExhaustedError, ModelTier } from './model-pool';

const REQ: ChatTextRequest = { system: 's', messages: [{ role: 'user', content: 'u' }], schemaName: 'x', schema: {}, maxTokens: 1 };
const USAGE = { inputTokens: 5, outputTokens: 3, cacheReadTokens: 0, cacheCreationTokens: 0 };
const parse = (c: string) => (c.startsWith('OK') ? c : null);

function tier(label: string, script: (string | Error)[]): ModelTier & { calls: number } {
  return {
    label,
    model: `${label}-model`,
    calls: 0,
    async call() {
      const next = script[Math.min(this.calls++, script.length - 1)];
      if (next instanceof Error) throw next;
      return { content: next, usage: USAGE };
    },
  };
}
const noSleep = async () => undefined;

describe('ModelPool — xoay bậc ở tầng vòng lặp (§7.3)', () => {
  it('bậc chết (tier_dead) → loại ngay, sang bậc sau, ghi lượt xoay', async () => {
    const a = tier('A', [httpProviderError(403, undefined, 'hết tiền')]);
    const b = tier('B', ['OK b']);
    const r = await new ModelPool([a, b], { sleep: noSleep }).ask(REQ, parse);
    expect(r.value).toBe('OK b');
    expect(r.model).toBe('B-model');
    expect(r.rotations).toEqual([{ from: 'A', reason: expect.stringMatching(/tier_dead/) }]);
    expect(a.calls).toBe(1);
  });

  it('bậc đã loại KHÔNG được gọi lại ở lượt sau của cùng cuộc điều tra', async () => {
    const a = tier('A', [httpProviderError(403, undefined, 'x')]);
    const b = tier('B', ['OK 1', 'OK 2']);
    const pool = new ModelPool([a, b], { sleep: noSleep });
    await pool.ask(REQ, parse);
    const second = await pool.ask(REQ, parse);
    expect(second.value).toBe('OK 2');
    expect(second.rotations).toEqual([]);
    expect(a.calls).toBe(1);
  });

  it('phản hồi không đọc được (bad_output) → thử lại MỘT lần cùng bậc, rồi loại', async () => {
    const a = tier('A', ['rác', 'rác']);
    const b = tier('B', ['OK b']);
    const r = await new ModelPool([a, b], { sleep: noSleep }).ask(REQ, parse);
    expect(a.calls).toBe(2);
    expect(r.value).toBe('OK b');
  });

  it('bad_output ném từ provider cũng tính như trên', async () => {
    const a = tier('A', [badOutputError('cắt cụt'), 'OK a']);
    const r = await new ModelPool([a], { sleep: noSleep }).ask(REQ, parse);
    expect(r.value).toBe('OK a');
  });

  it('transient → thử lại cùng bậc (không ném cho BullMQ chạy lại cả job)', async () => {
    const a = tier('A', [httpProviderError(503, undefined, 'nghẽn'), 'OK a']);
    const r = await new ModelPool([a], { sleep: noSleep }).ask(REQ, parse);
    expect(r.value).toBe('OK a');
    expect(a.calls).toBe(2);
  });

  it('mọi bậc đều hỏng → ModelsExhaustedError, kèm lý do từng bậc', async () => {
    const pool = new ModelPool([tier('A', [httpProviderError(401, undefined, 'x')])], { sleep: noSleep });
    await expect(pool.ask(REQ, parse)).rejects.toBeInstanceOf(ModelsExhaustedError);
  });

  it('usage của phản hồi rác vẫn được cộng — token đã tiêu là đã tiêu', async () => {
    const a = tier('A', ['rác', 'OK a']);
    const r = await new ModelPool([a], { sleep: noSleep }).ask(REQ, parse);
    expect(r.usage.inputTokens).toBe(10);
  });

  it('review M1 — usage gắn trên lỗi bad_output được cộng; hết bậc thì lỗi mang tổng usage', async () => {
    const withUsage = () => Object.assign(badOutputError('cắt cụt'), { usage: USAGE });
    const a = tier('A', [withUsage(), withUsage()]);
    const r = await new ModelPool([a, tier('B', ['OK b'])], { sleep: noSleep }).ask(REQ, parse);
    expect(r.usage.inputTokens).toBe(15); // 2 lượt hỏng của A + 1 lượt của B
    const error = await new ModelPool([tier('C', [withUsage(), withUsage()])], { sleep: noSleep })
      .ask(REQ, parse)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ModelsExhaustedError);
    expect((error as ModelsExhaustedError).usage.inputTokens).toBe(10);
  });

  it('review I1 — hạn chót là CỨNG: thử lại và xoay bậc không kéo quá deadline; mỗi lần thử ≤ phần còn lại', async () => {
    let t = 0;
    const timeouts: number[] = [];
    const hang = (label: string): ModelTier => ({
      label,
      model: label,
      async call(req) {
        timeouts.push(req.timeoutMs!);
        t += req.timeoutMs!;
        throw httpProviderError(504, undefined, 'treo');
      },
    });
    const pool = new ModelPool([hang('A'), hang('B')], { sleep: async (ms) => void (t += ms) });
    const error = await pool
      .ask({ ...REQ, timeoutMs: 90_000 }, parse, { deadline: 20_000, now: () => t })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DeadlineExceededError);
    expect(t).toBeLessThanOrEqual(20_000);
    expect(timeouts.every((ms) => ms <= 20_000)).toBe(true);
  });

  it('NODE_ENV=test → không có bậc nào (test không bao giờ gọi API tính tiền)', () => {
    expect(process.env.NODE_ENV).toBe('test');
    expect(buildInvestigatorTiers()).toEqual([]);
  });
});
