import { challenge, ChallengeInput, Challenger } from './challenge';
import { ToolCall, Verdict } from './types';
import { CTX } from './testing/context';

const EVIDENCE: ToolCall = {
  id: 'tc-1', tool: 'run_tests', args: { group: null }, status: 'ok', output: 'co_ban: 3/3 đạt', structuredRef: null,
  startedAt: '2026-09-24T00:00:00.000Z', wallMs: 1, injectionSuspected: false,
};
/** Verdict TỰ DỰNG, cấy một lỗi giả — kỹ thuật tiêm lỗi của §12.3. */
const PLANTED: Verdict = {
  errors: [{ ruleKey: 'sai_ca_co_ban', toolCallIds: ['tc-1'], note: 'LẬP LUẬN CỦA AGENT CHẤM' }],
  missingRules: [],
  injectionAttempt: { detected: false, excerpt: null },
};

describe('challenge() — ranh giới §12.5', () => {
  it('T-EVAL-12 — chạy trên verdict tự dựng có lỗi giả, không cần investigate() đi trước', async () => {
    const seen: ChallengeInput[] = [];
    const refuter: Challenger = {
      name: 'giả',
      async review(input) {
        seen.push(input);
        return { status: 'refuted', toolCallIds: ['tc-1'] };
      },
    };
    const r = await challenge(PLANTED, CTX, [EVIDENCE], refuter);
    expect(r).toEqual({ challenger: 'giả', perError: [{ ruleKey: 'sai_ca_co_ban', status: 'refuted', toolCallIds: ['tc-1'] }] });
    expect(seen[0].evidence).toEqual([EVIDENCE]);
  });

  it('phản biện KHÔNG thấy lập luận của agent chấm (§6 ràng buộc 1)', async () => {
    let got: ChallengeInput | undefined;
    await challenge(PLANTED, CTX, [EVIDENCE], { name: 'x', async review(i) { got = i; return { status: 'confirmed', toolCallIds: [] }; } });
    expect(JSON.stringify(got)).not.toContain('LẬP LUẬN CỦA AGENT CHẤM');
  });

  it('trả lời không đọc được → unverified, TUYỆT ĐỐI không refuted (§6.2)', async () => {
    const broken: Challenger = { name: 'hỏng', async review() { throw new Error('bad_output'); } };
    const r = await challenge(PLANTED, CTX, [EVIDENCE], broken);
    expect(r.perError[0].status).toBe('unverified');
  });
});
