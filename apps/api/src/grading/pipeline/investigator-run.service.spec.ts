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

const VERDICT_RESULT: InvestigationResult = {
  kind: 'verdict',
  verdict: { errors: [{ ruleKey: 'sai_ca_co_ban', toolCallIds: [], note: null }], missingRules: [], injectionAttempt: { detected: false, excerpt: null } },
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

describe('InvestigatorRunService.runChallenge (bước 6)', () => {
  it('verdict có lỗi → gọi đủ 2 Challenger + 2 CaseLens, ghi vào stored.challenge', async () => {
    const challengerA = { name: 'a', review: jest.fn().mockResolvedValue({ status: 'confirmed', toolCallIds: [] }) };
    const challengerB = { name: 'b', review: jest.fn().mockResolvedValue({ status: 'refuted', toolCallIds: [] }) };
    const lensA = { name: 'x', review: jest.fn().mockResolvedValue({ lens: 'x', suspected: false, note: 'ok' }) };
    const lensB = { name: 'y', review: jest.fn().mockResolvedValue({ lens: 'y', suspected: true, note: 'nghi' }) };
    const svc = service([challengerA, challengerB], [lensA, lensB]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out = await (svc as any).runChallenge(VERDICT_RESULT, CTX);

    expect(challengerA.review).toHaveBeenCalledTimes(1);
    expect(challengerB.review).toHaveBeenCalledTimes(1);
    expect(lensA.review).toHaveBeenCalledTimes(1);
    expect(lensB.review).toHaveBeenCalledTimes(1);
    expect(out.perError).toHaveLength(2);
    expect(out.caseNotes).toHaveLength(2);
    expect(out.caseNotes.some((n: { suspected: boolean }) => n.suspected)).toBe(true);
  });

  it('result.kind = ungradable (không có verdict) → không chạy lăng kính nào, trả null', async () => {
    const challengerA = { name: 'a', review: jest.fn() };
    const svc = service([challengerA], []);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out = await (svc as any).runChallenge({ ...VERDICT_RESULT, kind: 'ungradable', verdict: null }, CTX);
    expect(out).toBeNull();
    expect(challengerA.review).not.toHaveBeenCalled();
  });

  it('deps.challengers rỗng (chưa cấu hình sandbox) → trả null, không lỗi', async () => {
    const svc = service([], []);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out = await (svc as any).runChallenge(VERDICT_RESULT, CTX);
    expect(out).toBeNull();
  });
});
