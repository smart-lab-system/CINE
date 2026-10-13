import { CaseLens } from './case-lens';
import { Challenger } from './challenge';
import { runChallengePhase } from './challenge-phase';
import { CTX } from './testing/context';
import { InvestigationResult, Verdict } from './types';
import { UNATTRIBUTED } from './usage-sink';
import { resultWith } from '../decision/testing/result';

const verdictOf = (ruleKeys: string[]): Verdict => ({
  errors: ruleKeys.map((ruleKey) => ({ ruleKey, toolCallIds: ['tc-1'], note: null })),
  missingRules: [],
  injectionAttempt: { detected: false, excerpt: null },
});

function investigated(ruleKeys: string[]): InvestigationResult {
  return { ...resultWith({}), verdict: verdictOf(ruleKeys) } as InvestigationResult;
}

const spend = (model: string, i: number, o: number): Challenger => ({
  name: `lens-${model}`,
  async review(input) {
    input.usage?.add(model, { inputTokens: i, outputTokens: o });
    return { status: 'confirmed', toolCallIds: [] };
  },
});
const caseSpend = (model: string, i: number, o: number): CaseLens => ({
  name: `case-${model}`,
  async review(_ctx, _verdict, _calls, usage) {
    usage?.add(model, { inputTokens: i, outputTokens: o });
    return { lens: `case-${model}`, suspected: false, note: 'ok' };
  },
});

describe('runChallengePhase()', () => {
  it('không có verdict → không phản biện, không token', async () => {
    const r = await runChallengePhase({ ...resultWith({}), verdict: null } as InvestigationResult, CTX, { challengers: [spend('M', 1, 1)], caseLenses: [] });
    expect(r).toEqual({ challenge: null, usageByModel: {} });
  });

  it('không có lăng kính per-error nào (sandbox null) → null, như hành vi cũ', async () => {
    const r = await runChallengePhase(investigated(['chu_thich_sai']), CTX, { challengers: [], caseLenses: [caseSpend('M', 1, 1)] });
    expect(r).toEqual({ challenge: null, usageByModel: {} });
  });

  it('gom token của cả lăng kính per-error lẫn cấp bài theo model', async () => {
    const r = await runChallengePhase(investigated(['chu_thich_sai']), CTX, {
      challengers: [spend('A', 10, 2), spend('A', 5, 1)],
      caseLenses: [caseSpend('B', 7, 3)],
    });
    expect(r.challenge?.perError).toHaveLength(2);
    expect(r.challenge?.caseNotes).toHaveLength(1);
    expect(r.usageByModel).toEqual({ A: { inputTokens: 15, outputTokens: 3 }, B: { inputTokens: 7, outputTokens: 3 } });
  });

  it('lỗi luật MÁY QUYẾT không gửi cho lăng kính per-error (giữ nguyên hành vi cũ), lăng kính cấp bài vẫn thấy đủ verdict', async () => {
    const seenErrors: string[][] = [];
    const per: Challenger = {
      name: 'dò',
      async review(input) { seenErrors.push([input.error.ruleKey]); return { status: 'confirmed', toolCallIds: [] }; },
    };
    let caseSaw: string[] = [];
    const cl: CaseLens = {
      name: 'c',
      async review(_ctx, verdict) { caseSaw = verdict.errors.map((e) => e.ruleKey); return { lens: 'c', suspected: false, note: '' }; },
    };
    // CTX: sai_ca_co_ban là luật máy quyết (checkedBy: 'machine'), chu_thich_sai là luật model.
    await runChallengePhase(investigated(['sai_ca_co_ban', 'chu_thich_sai']), CTX, { challengers: [per], caseLenses: [cl] });
    expect(seenErrors).toEqual([['chu_thich_sai']]);
    expect(caseSaw).toEqual(['sai_ca_co_ban', 'chu_thich_sai']);
  });

  it('Review Focus 1 — lăng kính hỏng nhưng đã tiêu token: token vẫn vào sổ', async () => {
    const broken: Challenger = {
      name: 'hỏng',
      async review(input) { input.usage?.add(UNATTRIBUTED, { inputTokens: 9, outputTokens: 1 }); throw new Error('bad_output'); },
    };
    const r = await runChallengePhase(investigated(['chu_thich_sai']), CTX, { challengers: [broken], caseLenses: [] });
    expect(r.challenge?.perError[0].perError[0].status).toBe('unverified');
    expect(r.usageByModel).toEqual({ [UNATTRIBUTED]: { inputTokens: 9, outputTokens: 1 } });
  });

  it('Review Focus 2 — hai lượt chấm đồng thời dùng CHUNG lăng kính: token không lẫn nhau', async () => {
    const shared = spend('A', 10, 1); // MỘT lăng kính singleton cho cả hai lượt
    const [r1, r2] = await Promise.all([
      runChallengePhase(investigated(['chu_thich_sai']), CTX, { challengers: [shared], caseLenses: [] }),
      runChallengePhase(investigated(['chu_thich_sai']), CTX, { challengers: [shared, shared], caseLenses: [] }),
    ]);
    expect(r1.usageByModel).toEqual({ A: { inputTokens: 10, outputTokens: 1 } });
    expect(r2.usageByModel).toEqual({ A: { inputTokens: 20, outputTokens: 2 } });
  });
});
