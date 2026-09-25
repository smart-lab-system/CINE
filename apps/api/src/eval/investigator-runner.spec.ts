import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_BUDGET } from '../grading/investigator/budget';
import { InvestigationResult } from '../grading/investigator/types';
import { runInvestigator } from './investigator-runner';
import { loadDataset } from './load-dataset';
import { writeMiniDe } from './testing/mini-de';

function result(over: Partial<InvestigationResult>): InvestigationResult {
  return {
    kind: 'verdict', verdict: { errors: [], missingRules: [], injectionAttempt: { detected: false, excerpt: null } },
    rejected: [], ungradable: null, flags: [], confidenceCap: 1, replay: null, summary: 'tóm tắt',
    investigation: {
      toolCalls: [], structuredResults: {}, complexity: null, minimalFailingCase: null, approach: null, peerCluster: null,
      budget: { toolCalls: 3, wallMs: 10, tokens: 500, rounds: 2, forcedFinal: false, stopReason: 'verdict', limits: DEFAULT_BUDGET },
      modelsUsed: ['m-1'], tierRotations: [],
    },
    usage: { inputTokens: 400, outputTokens: 100 },
    ...over,
  };
}

async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'inv-'));
  await writeMiniDe(root);
  const dataset = await loadDataset(root);
  const bundles = new Map([['mini', { id: 'mini@x', cases: [{ name: 'cb1', group: 'co_ban', input: '2\n', expected: '4\n' }] }]]);
  return { dataset, bundles };
}

describe('runInvestigator', () => {
  it('điểm tính từ luật tìm thấy trên bảng ĐÓNG BĂNG; chỉ số precision/recall theo ruleId ở nhóm 1', async () => {
    const { dataset, bundles } = await setup();
    const { records, summary } = await runInvestigator({
      dataset, bundles, tier: 'fast', concurrency: 1, budget: DEFAULT_BUDGET,
      deps: { models: [], sandbox: { exec: async () => { throw new Error('không dùng'); } } },
      investigateFn: async (ctx) =>
        ctx.submission.files[0].content.includes('return x;')
          ? result({ verdict: { errors: [{ ruleKey: 'sai_co_ban', toolCallIds: ['tc-1'], note: null }], missingRules: [], injectionAttempt: { detected: false, excerpt: null } } })
          : result({}),
    });
    const m1 = records.find((r) => r.caseId === 'M1')!;
    expect(m1).toMatchObject({ pipeline: 'investigator', status: 'ok', outcome: 'flagged', scoreHundredths: 600, foundRuleIds: ['sai_co_ban'], toolCalls: 3 });
    expect(records.find((r) => r.caseId === 'A0')!.scoreHundredths).toBe(1000);
    expect(summary.ruleMetrics).toMatchObject({ tp: 1, fp: 0, fn: 0, precision: 1, recall: 1 });
    expect(summary.verdict).toBe('passed_gates');
    // Review I4: investigator không tự quyết (Q4), nên "khớp kết cục" thấp theo cấu trúc; chỉ số
    // so được là "chấm được hay không". Hai ca flagged, mong đợi graded → chấm được cả hai.
    expect(summary.perDe[0].gradableAgreement).toBe(1);
  });

  it('ungradable → không có điểm, không phải vi phạm; mọi bậc model hỏng → lượt lỗi (error)', async () => {
    const { dataset, bundles } = await setup();
    const { records } = await runInvestigator({
      dataset, bundles, tier: 'fast', concurrency: 1, budget: DEFAULT_BUDGET,
      deps: { models: [], sandbox: { exec: async () => { throw new Error('x'); } } },
      investigateFn: async (ctx) =>
        ctx.submission.files[0].content.includes('return x;')
          ? result({ kind: 'ungradable', verdict: null, ungradable: { class: 'system', reason: 'treo' } })
          : result({
              kind: 'ungradable', verdict: null, ungradable: { class: 'system', reason: 'hỏng' },
              investigation: { ...result({}).investigation, budget: { ...result({}).investigation.budget, stopReason: 'models_exhausted' } },
            }),
    });
    expect(records.find((r) => r.caseId === 'M1')).toMatchObject({ status: 'ok', outcome: 'ungradable', scoreHundredths: null, violation: null });
    expect(records.find((r) => r.caseId === 'A0')).toMatchObject({ status: 'error' });
  });

  it('review M2 — tóm tắt gom lượt lỗi THEO LÝ DO: đọc được bậc nào chết, vì sao, mà không mở cases.jsonl', async () => {
    const { dataset, bundles } = await setup();
    const dead = result({
      kind: 'ungradable', verdict: null, ungradable: { class: 'system', reason: 'mọi bậc model đều hỏng — t1: tier_dead: HTTP 403' },
      investigation: { ...result({}).investigation, budget: { ...result({}).investigation.budget, stopReason: 'models_exhausted' } },
    });
    const { summary } = await runInvestigator({
      dataset, bundles, tier: 'fast', concurrency: 1, budget: DEFAULT_BUDGET,
      deps: { models: [], sandbox: { exec: async () => { throw new Error('x'); } } },
      investigateFn: async () => dead,
    });
    const n = dataset.des[0].manifest.cases.length;
    expect(summary.errors).toHaveLength(n);
    expect(summary.errorReasons).toEqual([{ reason: expect.stringMatching(/t1: tier_dead: HTTP 403/), count: n }]);
  });

  it('T-EVAL-6 — lượt của ca nhóm 5 không mang investigation hay tóm tắt', async () => {
    const { dataset, bundles } = await setup();
    dataset.des[0].manifest.cases[0] = { ...dataset.des[0].manifest.cases[0], group: 5, sha256: 'a'.repeat(64) };
    const { records } = await runInvestigator({
      dataset, bundles, tier: 'fast', concurrency: 1, budget: DEFAULT_BUDGET,
      deps: { models: [], sandbox: { exec: async () => { throw new Error('x'); } } },
      investigateFn: async () => result({}),
    });
    const g5 = records.find((r) => r.group === 5)!;
    expect(g5.investigation).toBeNull();
    expect(g5.summaryText).toBeNull();
  });
});
