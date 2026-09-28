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

  it('unverified GIỮ lý do (thông điệp lỗi của lăng kính) để hồ sơ nói được vì sao; kết luận có được thì không có reason', async () => {
    const broken: Challenger = { name: 'hỏng', async review() { throw new Error('hết 4 lượt mà chưa kết luận'); } };
    const ok: Challenger = { name: 'ok', async review() { return { status: 'confirmed', toolCallIds: [] }; } };
    expect((await challenge(PLANTED, CTX, [EVIDENCE], broken)).perError[0].reason).toBe('hết 4 lượt mà chưa kết luận');
    expect((await challenge(PLANTED, CTX, [EVIDENCE], ok)).perError[0].reason).toBeUndefined();
  });

  it('lý do rất dài → cắt về tối đa 300 ký tự (hồ sơ lưu JSONB, không phình vô hạn)', async () => {
    const broken: Challenger = { name: 'hỏng', async review() { throw new Error('r'.repeat(2000)); } };
    const r = await challenge(PLANTED, CTX, [EVIDENCE], broken);
    expect(r.perError[0].reason!.length).toBeLessThanOrEqual(300);
  });

  it('C1 — nhiều lỗi được xét SONG SONG, không tuần tự (thời gian tổng không nhân theo số lỗi)', async () => {
    const DELAY_MS = 80;
    const many: Verdict = {
      errors: [
        { ruleKey: 'a', toolCallIds: [], note: null },
        { ruleKey: 'b', toolCallIds: [], note: null },
        { ruleKey: 'c', toolCallIds: [], note: null },
      ],
      missingRules: [],
      injectionAttempt: { detected: false, excerpt: null },
    };
    const slow: Challenger = {
      name: 'slow',
      async review() {
        await new Promise((r) => setTimeout(r, DELAY_MS));
        return { status: 'confirmed', toolCallIds: [] };
      },
    };
    const started = Date.now();
    const r = await challenge(many, CTX, [], slow);
    const elapsed = Date.now() - started;
    // Tuần tự sẽ mất ~3×DELAY_MS; song song mất ~1×DELAY_MS. Ngưỡng 2.5× chừa dư cho nhiễu máy
    // (nhiều test suite chạy song song cùng lúc) mà vẫn cách xa hẳn mốc tuần tự (3×).
    expect(elapsed).toBeLessThan(DELAY_MS * 2.5);
    expect(r.perError.map((e) => e.ruleKey)).toEqual(['a', 'b', 'c']); // giữ đúng thứ tự dù chạy song song
  });
});
