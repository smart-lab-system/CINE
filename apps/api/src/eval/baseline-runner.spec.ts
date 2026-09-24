import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import { AIGradingProvider, GradingOutcome, GradingRequest } from '../grading/ai-provider/ai-grading-provider';
import { runBaseline } from './baseline-runner';
import { loadDataset } from './load-dataset';
import { writeMiniDe } from './testing/mini-de';

/** Provider giả: cho điểm tối đa, trừ khi mã nguồn chứa "return x;". */
function fakeProvider(opts: { failOn?: string } = {}): AIGradingProvider & { calls: GradingRequest[] } {
  return {
    name: 'fake',
    calls: [],
    async grade(request: GradingRequest): Promise<GradingOutcome> {
      this.calls.push(request);
      if (opts.failOn && request.content.includes(opts.failOn)) throw new Error('503 giả');
      const good = !request.content.includes('return x;');
      return {
        modelUsed: 'fake-1',
        criterionResults: [
          { criterionId: 'tinh_dung', verdict: good ? 'met' : 'partially_met', points: 0,
            evidence: request.content.split('\n')[0] },
        ],
        totalScore: 0,
        confidenceCeiling: 1,
        usage: { inputTokens: 100, outputTokens: 20, cacheReadTokens: 0, cacheCreationTokens: 0 },
        contextUsed: { question: false, modelAnswer: true },
      };
    },
  };
}

async function dataset() {
  const root = await mkdtemp(join(tmpdir(), 'run-'));
  await writeMiniDe(root);
  return loadDataset(root);
}

describe('runBaseline', () => {
  it('chấm mỗi ca k lần, điểm ra số nguyên phần trăm, và nhét đề + đáp án vào ghi chú', async () => {
    const provider = fakeProvider();
    const { records, summary } = await runBaseline({ dataset: await dataset(), provider, tier: 'full', concurrency: 2 });
    expect(records).toHaveLength(2 * 3);
    const a0 = records.find((r) => r.caseId === 'A0')!;
    expect(a0.scoreHundredths).toBe(1000);
    expect(provider.calls[0].reference?.modelAnswerNote).toMatch(/Nhân đôi x\./);
    expect(provider.calls[0].reference?.modelAnswerNote).toMatch(/return 2 \* x/);
    expect(summary.verdict).toBe('passed_gates');
    expect(summary.group5).toMatch(/0 ca/);
  });

  it('T-EVAL-5 — chạy trọn khi không có DATABASE_URL, và không đụng TypeORM', async () => {
    const saved = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    const spy = jest.spyOn(DataSource.prototype, 'initialize');
    try {
      await runBaseline({ dataset: await dataset(), provider: fakeProvider(), tier: 'fast', concurrency: 1 });
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
      if (saved !== undefined) process.env.DATABASE_URL = saved;
    }
  });

  it('Review Focus 4 — provider lỗi ở một ca → ghi error, không vi phạm, lượt chạy vẫn xong', async () => {
    const { records, summary } = await runBaseline({
      dataset: await dataset(),
      provider: fakeProvider({ failOn: 'return x;' }),
      tier: 'fast',
      concurrency: 1,
    });
    const m1 = records.filter((r) => r.caseId === 'M1');
    expect(m1.every((r) => r.status === 'error' && r.violation === null && r.scoreHundredths === null)).toBe(true);
    expect(summary.errors.length).toBeGreaterThan(0);
  });

  it('review I1 — sàn đếm từ khoá trả lời giữa chừng → lượt đó là error, không vào điểm hay cổng', async () => {
    // Chuỗi thật (TierChain) rơi xuống sàn khi các bậc trên chết (tier_dead / bad_output):
    // provider vẫn "trả lời", nhưng không phải model nào chấm cả.
    const floor: AIGradingProvider = {
      name: 'fallback(model-that → keyword-match@1)',
      async grade(request: GradingRequest): Promise<GradingOutcome> {
        return {
          modelUsed: 'keyword-match@1',
          criterionResults: [
            { criterionId: 'tinh_dung', verdict: 'partially_met', points: 0, evidence: request.content.split('\n')[0] },
          ],
          totalScore: 0,
          confidenceCeiling: 0.2,
          usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 },
          contextUsed: { question: false, modelAnswer: false },
        };
      },
    };
    const { records, summary } = await runBaseline({
      dataset: await dataset(),
      provider: floor,
      tier: 'fast',
      concurrency: 1,
      stubModels: ['keyword-match@1'],
    });
    expect(records.every((r) => r.status === 'error' && r.scoreHundredths === null && r.violation === null)).toBe(true);
    expect(records[0].error).toMatch(/sàn/);
    expect(summary.errors).toHaveLength(records.length);
  });

  it('review I2 — không đo được ca nào của cổng cứng → inconclusive, không bao giờ passed_gates', async () => {
    const { summary } = await runBaseline({
      dataset: await dataset(),
      provider: fakeProvider({ failOn: 'int f' }),
      tier: 'fast',
      concurrency: 1,
    });
    expect(summary.verdict).toBe('inconclusive');
    expect(summary.unmeasured).toContain('mini/A0');
  });

  it('bậc nhanh: ca nhóm 2 bị trừ oan ở lượt 1 được chạy bù tới 3 lượt rồi mới xác nhận', async () => {
    const ds = await dataset();
    // làm A0 bị "trừ oan": provider giả thấy "return x;" — chèn nó vào mã A0
    ds.des[0].sources.set('A0', 'int f(int x) { return x; }\n');
    const { records, summary } = await runBaseline({ dataset: ds, provider: fakeProvider(), tier: 'fast', concurrency: 1 });
    expect(records.filter((r) => r.caseId === 'A0')).toHaveLength(3);
    expect(summary.gates.tru_oan.confirmed).toContain('mini/A0');
    expect(summary.verdict).toBe('failed_gate');
  });
});
