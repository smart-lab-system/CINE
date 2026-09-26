import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_BUDGET } from '../grading/investigator/budget';
import { InvestigationContext, InvestigationResult } from '../grading/investigator/types';
import { runInvestigator } from './investigator-runner';
import { loadDataset } from './load-dataset';
import { writeMiniDe } from './testing/mini-de';
import { resultWith, runTestsCall } from '../grading/decision/testing/result';

const runsCb1 = (status: 'pass' | 'fail') => resultWith({ calls: [runTestsCall('tc-1', null, [{ name: 'cb1', group: 'co_ban', status }])] });
const opts3a = { theta: 0.85, ceilings: new Map([['m', 0.5]]) };

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
  it('3a — kết cục và điểm là của decide(): luật máy kiểm do code quyết từ run_tests, model không cần nhắc tới', async () => {
    const { dataset, bundles } = await setup();
    const { records, summary } = await runInvestigator({
      dataset, bundles, tier: 'fast', concurrency: 1, budget: DEFAULT_BUDGET, ...opts3a,
      deps: { models: [], sandbox: { exec: async () => { throw new Error('không dùng'); } } },
      investigateFn: async (ctx) => runsCb1(ctx.submission.files[0].content.includes('return x;') ? 'fail' : 'pass'),
    });
    // Gói test của mini-de có MỘT ca: M1 fail ca đó là `passed === 0` → §4.3 gắn cờ (điểm vẫn do
    // code tính, không tự cho 0). A0 pass → tự quyết.
    const m1 = records.find((r) => r.caseId === 'M1')!;
    expect(m1).toMatchObject({
      outcome: 'flagged', scoreHundredths: 600, foundRuleIds: ['sai_co_ban'],
      deductionBySource: { deterministic: 400, llm_with_tools: 0, llm_only: 0 },
    });
    expect(m1.flags).toContain('nothing_passed');
    const a0 = records.find((r) => r.caseId === 'A0')!;
    expect(a0).toMatchObject({ outcome: 'graded', scoreHundredths: 1000, foundRuleIds: [] });
    expect((a0.investigation as { decision: { outcome: string } }).decision.outcome).toBe('auto');
    // §15.2 — một lượt tự quyết, khớp luật lẫn kết cục; §4.2 — mọi mức trừ do máy quyết.
    expect(summary.autoDecision).toEqual({ count: 1, rate: 0.5, precision: 1 });
    expect(summary.machineDeductionShare).toBe(1);
  });

  it('§15.2 — precision nhóm tự quyết đếm cả lượt tự quyết SAI: M1 chạy qua hết (bài chạy đúng ca duy nhất) → tự quyết mà thiếu luật', async () => {
    const { dataset, bundles } = await setup();
    const { summary } = await runInvestigator({
      dataset, bundles, tier: 'fast', concurrency: 1, budget: DEFAULT_BUDGET, ...opts3a,
      deps: { models: [], sandbox: { exec: async () => { throw new Error('không dùng'); } } },
      investigateFn: async () => runsCb1('pass'),
    });
    expect(summary.autoDecision).toEqual({ count: 2, rate: 1, precision: 0.5 });
    // Không lỗi nào → không mức trừ nào → tỉ lệ máy quyết không định nghĩa được, không phải 0.
    expect(summary.machineDeductionShare).toBeNull();
  });

  it('ungradable → không có điểm, không phải vi phạm; mọi bậc model hỏng → lượt lỗi (error)', async () => {
    const { dataset, bundles } = await setup();
    const { records } = await runInvestigator({
      dataset, bundles, tier: 'fast', concurrency: 1, budget: DEFAULT_BUDGET, ...opts3a,
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
      dataset, bundles, tier: 'fast', concurrency: 1, budget: DEFAULT_BUDGET, ...opts3a,
      deps: { models: [], sandbox: { exec: async () => { throw new Error('x'); } } },
      investigateFn: async () => dead,
    });
    const n = dataset.des[0].manifest.cases.length;
    expect(summary.errors).toHaveLength(n);
    expect(summary.errorReasons).toEqual([{ reason: expect.stringMatching(/t1: tier_dead: HTTP 403/), count: n }]);
  });

  it('review — hồ sơ ghi lỗi bị loại (luật, lý do): đo được evidence_rejected vô hại hay làm điểm cao oan', async () => {
    const { dataset, bundles } = await setup();
    let rules: InvestigationContext['rules'] = [];
    const { records } = await runInvestigator({
      dataset, bundles, tier: 'fast', concurrency: 1, budget: DEFAULT_BUDGET, ...opts3a,
      deps: { models: [], sandbox: { exec: async () => { throw new Error('x'); } } },
      investigateFn: async (ctx) => {
        rules = ctx.rules;
        return result({ rejected: [{ ruleKey: 'sai_co_ban', reason: 'fabricated_tool_call' }], flags: ['evidence_rejected'] });
      },
    });
    const r = records.find((x) => x.group !== 5)!;
    expect(r.flags).toContain('evidence_rejected');
    expect((r.investigation as { rejected: unknown }).rejected).toEqual([{ ruleKey: 'sai_co_ban', reason: 'fabricated_tool_call' }]);
    // Review 4d5b60b: bảng lỗi model đã xem đi kèm hồ sơ — quyết lại (T-TIER) không được dựng lại nó
    // từ bảng lỗi hiện tại (review I3).
    expect(rules.length).toBeGreaterThan(0);
    expect((r.investigation as { rulesSeen: unknown }).rulesSeen).toEqual(rules.map((x) => ({ ruleKey: x.ruleKey, checkedBy: x.checkedBy })));
  });

  it('T-EVAL-6 — lượt của ca nhóm 5 không mang investigation hay tóm tắt', async () => {
    const { dataset, bundles } = await setup();
    dataset.des[0].manifest.cases[0] = { ...dataset.des[0].manifest.cases[0], group: 5, sha256: 'a'.repeat(64) };
    const { records } = await runInvestigator({
      dataset, bundles, tier: 'fast', concurrency: 1, budget: DEFAULT_BUDGET, ...opts3a,
      deps: { models: [], sandbox: { exec: async () => { throw new Error('x'); } } },
      investigateFn: async () => result({}),
    });
    const g5 = records.find((r) => r.group === 5)!;
    expect(g5.investigation).toBeNull();
    expect(g5.summaryText).toBeNull();
  });
});
