import { InvestigatorRunService } from './investigator-run.service';
import type { InvestigatorDeps } from './investigator-deps';
import type { InvestigationResult } from '../investigator/types';
import { CTX } from '../investigator/testing/context';

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

describe('InvestigatorRunService.runChallenge (bước 6)', () => {
  it('verdict có lỗi (luật MODEL) → gọi đủ 2 Challenger + 2 CaseLens, ghi vào stored.challenge', async () => {
    const challengerA = { name: 'a', review: jest.fn().mockResolvedValue({ status: 'confirmed', toolCallIds: [] }) };
    const challengerB = { name: 'b', review: jest.fn().mockResolvedValue({ status: 'refuted', toolCallIds: [] }) };
    const lensA = { name: 'x', review: jest.fn().mockResolvedValue({ lens: 'x', suspected: false, note: 'ok' }) };
    const lensB = { name: 'y', review: jest.fn().mockResolvedValue({ lens: 'y', suspected: true, note: 'nghi' }) };
    const svc = service([challengerA, challengerB], [lensA, lensB]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out = await (svc as any).runChallenge(resultWithErrors([MODEL_ERROR]), CTX);

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
    const out = await (svc as any).runChallenge(resultWithErrors([MACHINE_ERROR, MODEL_ERROR]), CTX);

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
    const out = await (svc as any).runChallenge(ungradableResult, CTX);
    expect(out).toBeNull();
    expect(challengerA.review).not.toHaveBeenCalled();
  });

  it('deps.challengers rỗng (chưa cấu hình sandbox) → trả null, không lỗi', async () => {
    const svc = service([], []);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out = await (svc as any).runChallenge(resultWithErrors([MODEL_ERROR]), CTX);
    expect(out).toBeNull();
  });

  it('W8 — một Challenger NÉM lỗi qua runChallenge() thật (không chỉ unit test của chính nó) → vẫn ra kết luận unverified, không văng lỗi', async () => {
    const broken = { name: 'hỏng', review: jest.fn().mockRejectedValue(new Error('model chết')) };
    const okOne = { name: 'ok', review: jest.fn().mockResolvedValue({ status: 'confirmed', toolCallIds: [] }) };
    const brokenLens = { name: 'bo_sot', review: jest.fn().mockRejectedValue(new Error('model chết')) };
    const svc = service([broken, okOne], [brokenLens]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out = await (svc as any).runChallenge(resultWithErrors([MODEL_ERROR]), CTX);

    expect(out).not.toBeNull();
    const brokenConclusion = out.perError.find((c: { challenger: string }) => c.challenger === 'hỏng');
    expect(brokenConclusion.perError[0].status).toBe('unverified');
    expect(out.caseNotes[0]).toEqual({ lens: 'bo_sot', suspected: false, note: 'không đọc được ý kiến của lăng kính này' });
  });
});
