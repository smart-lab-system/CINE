import { InvestigatorRunService } from './investigator-run.service';
import type { InvestigatorDeps } from './investigator-deps';
import type { InvestigationResult } from '../investigator/types';
import { CTX } from '../investigator/testing/context';
import { investigate } from '../investigator/investigate';
import { promptVersionOf } from '../investigator/prompt-version';

// `run()` gọi `investigate()` thật (một cuộc điều tra tốn tiền) và khoá hàng giảng viên qua SQL — cả hai
// được thay ở đây để kiểm đúng phần NỐI DÂY của P0 (meta gửi cho `finishAttempt`).
jest.mock('../investigator/investigate', () => ({ investigate: jest.fn() }));
jest.mock('../scoring/score-inputs', () => ({
  ...jest.requireActual('../scoring/score-inputs'),
  lockTeacherScoring: jest.fn(),
  teacherOfResult: jest.fn(),
}));

function service(challengers: InvestigatorDeps['challengers'], caseLenses: InvestigatorDeps['caseLenses']): InvestigatorRunService {
  const deps: InvestigatorDeps = {
    models: [],
    sandbox: null,
    challengers,
    caseLenses,
    ceilingOf: () => 0.5,
    close: async () => undefined,
  };
  return new InvestigatorRunService({} as never, {} as never, {} as never, deps);
}

function resultWithErrors(errors: { ruleKey: string; toolCallIds: string[]; note: string | null }[]): InvestigationResult {
  return {
    kind: 'verdict',
    verdict: { errors, missingRules: [], injectionAttempt: { detected: false, excerpt: null } },
    rejected: [],
    ungradable: null,
    flags: [],
    confidenceCap: 1,
    replay: null,
    summary: '',
    investigation: {
      toolCalls: [],
      structuredResults: {},
      complexity: null,
      minimalFailingCase: null,
      approach: null,
      peerCluster: null,
      budget: { toolCalls: 0, wallMs: 0, tokens: 0, rounds: 0, forcedFinal: false, stopReason: 'verdict', limits: CTX.budget },
      modelsUsed: [],
      tierRotations: [],
    },
    usage: { inputTokens: 0, outputTokens: 0 },
  };
}

// CTX.rules (testing/context.ts): 'sai_ca_co_ban' checkedBy='machine', 'chu_thich_sai' checkedBy='model'.
const MACHINE_ERROR = { ruleKey: 'sai_ca_co_ban', toolCallIds: [], note: null };
const MODEL_ERROR = { ruleKey: 'chu_thich_sai', toolCallIds: [], note: null };

describe('InvestigatorRunService — pha phản biện (bước 6)', () => {
  it('verdict có lỗi (luật MODEL) → gọi đủ 2 Challenger + 2 CaseLens, ghi vào stored.challenge', async () => {
    const challengerA = { name: 'a', review: jest.fn().mockResolvedValue({ status: 'confirmed', toolCallIds: [] }) };
    const challengerB = { name: 'b', review: jest.fn().mockResolvedValue({ status: 'refuted', toolCallIds: [] }) };
    const lensA = { name: 'x', review: jest.fn().mockResolvedValue({ lens: 'x', suspected: false, note: 'ok' }) };
    const lensB = { name: 'y', review: jest.fn().mockResolvedValue({ lens: 'y', suspected: true, note: 'nghi' }) };
    const svc = service([challengerA, challengerB], [lensA, lensB]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out = (await (svc as any).challengePhase(resultWithErrors([MODEL_ERROR]), CTX)).challenge;

    expect(challengerA.review).toHaveBeenCalledTimes(1);
    expect(challengerB.review).toHaveBeenCalledTimes(1);
    expect(lensA.review).toHaveBeenCalledTimes(1);
    expect(lensB.review).toHaveBeenCalledTimes(1);
    expect(out.perError).toHaveLength(2);
    expect(out.perError[0].perError.map((e: { ruleKey: string }) => e.ruleKey)).toEqual(['chu_thich_sai']);
    expect(out.caseNotes).toHaveLength(2);
    expect(out.caseNotes.some((n: { suspected: boolean }) => n.suspected)).toBe(true);
  });

  it('C2 — lỗi luật MÁY QUYẾT không được gửi cho Challenger (§4.1: model không tham gia phán máy quyết); CaseLens vẫn thấy đủ verdict', async () => {
    const challengerA = { name: 'a', review: jest.fn().mockResolvedValue({ status: 'refuted', toolCallIds: [] }) };
    const lensA = { name: 'x', review: jest.fn().mockResolvedValue({ lens: 'x', suspected: false, note: 'ok' }) };
    const svc = service([challengerA], [lensA]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out = (await (svc as any).challengePhase(resultWithErrors([MACHINE_ERROR, MODEL_ERROR]), CTX)).challenge;

    // Challenger CHỈ được hỏi về lỗi luật model — không hề thấy sai_ca_co_ban.
    expect(challengerA.review).toHaveBeenCalledTimes(1);
    expect(out.perError[0].perError.map((e: { ruleKey: string }) => e.ruleKey)).toEqual(['chu_thich_sai']);
    // CaseLens (Bỏ sót/Gian lận) nhận verdict ĐẦY ĐỦ, không lọc — chúng không chạm điểm nên an toàn.
    const lensCall = lensA.review.mock.calls[0];
    expect(lensCall[1].errors.map((e: { ruleKey: string }) => e.ruleKey).sort()).toEqual(['chu_thich_sai', 'sai_ca_co_ban']);
  });

  it('result.kind = ungradable (không có verdict) → không chạy lăng kính nào, trả null', async () => {
    const challengerA = { name: 'a', review: jest.fn() };
    const svc = service([challengerA], []);
    const ungradableResult = { ...resultWithErrors([]), kind: 'ungradable' as const, verdict: null };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out = (await (svc as any).challengePhase(ungradableResult, CTX)).challenge;
    expect(out).toBeNull();
    expect(challengerA.review).not.toHaveBeenCalled();
  });

  it('deps.challengers rỗng (chưa cấu hình sandbox) → trả null, không lỗi', async () => {
    const svc = service([], []);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out = (await (svc as any).challengePhase(resultWithErrors([MODEL_ERROR]), CTX)).challenge;
    expect(out).toBeNull();
  });

  it('W8 — một Challenger NÉM lỗi qua pha phản biện thật (không chỉ unit test của chính nó) → vẫn ra kết luận unverified, không văng lỗi', async () => {
    const broken = { name: 'hỏng', review: jest.fn().mockRejectedValue(new Error('model chết')) };
    const okOne = { name: 'ok', review: jest.fn().mockResolvedValue({ status: 'confirmed', toolCallIds: [] }) };
    const brokenLens = { name: 'bo_sot', review: jest.fn().mockRejectedValue(new Error('model chết')) };
    const svc = service([broken, okOne], [brokenLens]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out = (await (svc as any).challengePhase(resultWithErrors([MODEL_ERROR]), CTX)).challenge;

    expect(out).not.toBeNull();
    const brokenConclusion = out.perError.find((c: { challenger: string }) => c.challenger === 'hỏng');
    expect(brokenConclusion.perError[0].status).toBe('unverified');
    expect(out.caseNotes[0]).toEqual({ lens: 'bo_sot', suspected: false, note: 'không đọc được ý kiến của lăng kính này' });
  });
});


describe('InvestigatorRunService.run() — nối dây đo lường của P0', () => {
  const PRICE = { inPerMTok: 1, outPerMTok: 2 };

  function runnable(opts: { priced: boolean; existing?: { id: string } }) {
    const spender = {
      name: 'tốn',
      review: async (input: { usage?: { add(model: string, u: { inputTokens: number; outputTokens: number }): void } }) => {
        input.usage?.add('m-1', { inputTokens: 200, outputTokens: 20 });
        return { status: 'confirmed' as const, toolCallIds: [] };
      },
    };
    const deps: InvestigatorDeps = {
      models: [{ label: 'A', model: 'm-1', ceiling: 0.5, call: jest.fn() }],
      sandbox: {} as never,
      challengers: [spender],
      caseLenses: [],
      ceilingOf: () => 0.5,
      priceOf: (model) => (opts.priced && model === 'm-1' ? PRICE : undefined),
      close: async () => undefined,
    };
    const row = {
      status: 'ai_grading',
      current_attempt_id: opts.existing?.id ?? null,
      grading_triggered_by: 'u-1',
      current_outcome: null,
    };
    const ds = {
      transaction: async (fn: (m: unknown) => unknown) => fn({
        query: async (sql: string) => (sql.includes('FROM examcollect.grading_result g') ? [row] : sql.includes('INSERT INTO') ? [{ id: 'att-new' }] : []),
      }),
    };
    const scores = { finishAttempt: jest.fn().mockResolvedValue({ kind: 'scored' }), finishUngradable: jest.fn() };
    const contexts = { build: async () => ({ kind: 'ready', ctx: CTX, ruleTable: [] }) };
    (investigate as jest.Mock).mockResolvedValue({
      ...resultWithErrors([MODEL_ERROR]),
      usage: { inputTokens: 700, outputTokens: 100 },
      usageByModel: { 'm-1': { inputTokens: 700, outputTokens: 100 } },
    });
    return { svc: new InvestigatorRunService(ds as never, contexts as never, scores as never, deps), scores };
  }

  it('meta gửi finishAttempt: prompt_version, usage tách điều tra / lăng kính, cost_usd; tokensIn/Out CHỈ là điều tra', async () => {
    const { svc, scores } = runnable({ priced: true });
    await svc.run('res-1');
    expect(scores.finishAttempt).toHaveBeenCalledTimes(1);
    const [resultId, attemptId, , meta] = scores.finishAttempt.mock.calls[0];
    expect(resultId).toBe('res-1');
    expect(attemptId).toBe('att-new');
    // Ý nghĩa cũ giữ nguyên để so được với dữ liệu trước P0: lăng kính (200 vào / 20 ra) KHÔNG cộng vào đây.
    expect(meta).toMatchObject({ tokensIn: 700, tokensOut: 100, promptVersion: promptVersionOf() });
    expect(meta.usageByModel).toEqual({
      investigation: { 'm-1': { inputTokens: 700, outputTokens: 100 } },
      challenge: { 'm-1': { inputTokens: 200, outputTokens: 20 } },
    });
    expect(meta.costUsd).toBe(0.0011); // (900·1 + 120·2) / 1e6 = 0,00114 → làm tròn 4 chữ số
  });

  it('model không có giá → cost_usd là NULL, không phải 0', async () => {
    const { svc, scores } = runnable({ priced: false });
    await svc.run('res-1');
    expect(scores.finishAttempt.mock.calls[0][3].costUsd).toBeNull();
  });

  it('lượt NỐI LẠI sau job chết (đã có attempt chưa kết cục) → nối đúng lượt đó và cost_usd là NULL dù mọi model có giá', async () => {
    const { svc, scores } = runnable({ priced: true, existing: { id: 'att-old' } });
    await svc.run('res-1');
    const call = scores.finishAttempt.mock.calls[0];
    expect(call[1]).toBe('att-old');
    expect(call[3].costUsd).toBeNull();
    expect(call[3].usageByModel).toBeDefined(); // token của lần chạy này vẫn được ghi
  });
});
