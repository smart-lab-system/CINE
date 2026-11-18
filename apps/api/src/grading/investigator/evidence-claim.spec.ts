import { parseEvidenceClaims, verifyEvidence, EVIDENCE_MAX_ITEMS, EVIDENCE_QUOTE_MAX } from './evidence';
import { parseReply, INVESTIGATOR_SYSTEM_PROMPT } from './protocol';
import { parsePerErrorReply, CASE_NOTE_MAX } from './lens-protocol';
import { challenge, Challenger } from './challenge';
import type { InvestigationContext, Verdict } from './types';

const claim = (over: Record<string, unknown> = {}) => ({ file: 'bai-nop/main.cpp', startLine: 3, endLine: 3, quote: 'int f();', ...over });

/** Một lượt kết luận có một lỗi; `evidence` được gắn vào lỗi đó khi có. */
const finalWith = (evidence?: unknown) => {
  const error: Record<string, unknown> = { ruleKey: 'ro_ri_bo_nho', toolCallIds: ['tc-1'], note: null };
  if (evidence !== undefined) error.evidence = evidence;
  return JSON.stringify({ action: 'final', calls: [], verdict: { errors: [error], missingRules: [], injectionAttempt: { detected: false, excerpt: null } } });
};

describe('E2 — đoạn mã làm bằng chứng trong verdict (§5.9)', () => {
  it('lỗi có evidence → parse ra đủ các trường của đoạn trích', () => {
    const r = parseReply(finalWith([claim()]));
    expect(r).toMatchObject({ action: 'final' });
    const evidence = (r as { verdict: Verdict }).verdict.errors[0].evidence;
    expect(evidence).toEqual([{ file: 'bai-nop/main.cpp', startLine: 3, endLine: 3, quote: 'int f();' }]);
  });

  it('thiếu evidence → vẫn là lượt hợp lệ, evidence là mảng rỗng (không bad_output)', () => {
    const r = parseReply(finalWith());
    expect(r).toMatchObject({ action: 'final' });
    expect((r as { verdict: Verdict }).verdict.errors[0].evidence).toEqual([]);
  });

  it('nhiều hơn 3 đoạn → chỉ giữ 3 đầu, không từ chối cả lượt', () => {
    const items = Array.from({ length: EVIDENCE_MAX_ITEMS + 2 }, (_, i) => claim({ startLine: i + 1, endLine: i + 1 }));
    const r = parseReply(finalWith(items));
    expect((r as { verdict: Verdict }).verdict.errors[0].evidence).toHaveLength(EVIDENCE_MAX_ITEMS);
  });

  it('quote dài hơn 300 ký tự → cắt, không từ chối', () => {
    const r = parseReply(finalWith([claim({ quote: 'x'.repeat(EVIDENCE_QUOTE_MAX + 50) })]));
    expect((r as { verdict: Verdict }).verdict.errors[0].evidence?.[0].quote).toHaveLength(EVIDENCE_QUOTE_MAX);
  });

  it('một đoạn hỏng không làm mất cả lượt: đoạn hỏng bị bỏ, đoạn đúng còn lại', () => {
    const r = parseReply(finalWith([{ startLine: 'không phải số' }, claim()]));
    expect(r).toMatchObject({ action: 'final' });
    expect((r as { verdict: Verdict }).verdict.errors[0].evidence).toHaveLength(1);
  });

  it('parseEvidenceClaims: đầu vào không phải mảng → rỗng', () => {
    expect(parseEvidenceClaims('chuỗi')).toEqual([]);
    expect(parseEvidenceClaims(undefined)).toEqual([]);
  });

  // Wave 1 (E, 2026-10-22): gỡ hướng dẫn trích bằng chứng khỏi prompt — mô hình gần như không làm theo (0% verified).
  // Phần đọc khoan dung ở trên vẫn giữ nguyên, nên nếu mô hình tự gửi `evidence` thì vẫn không làm hỏng lượt.
  it('prompt không còn yêu cầu trích bằng chứng (wave 1, E)', () => {
    expect(INVESTIGATOR_SYSTEM_PROMPT).not.toContain('"evidence"');
  });
});

describe('verifyEvidence — harness đặt verified, không tin lời model', () => {
  const files = [{ path: 'bai-nop/main.cpp', content: 'int main() {\n  int f();\n}\n' }];

  it('đoạn có nguyên văn trong file → verified = true', () => {
    const [out] = verifyEvidence([claim({ quote: 'int f();' })], files);
    expect(out.verified).toBe(true);
  });

  it('đoạn không có trong file → verified = false, nhưng VẪN được giữ lại', () => {
    const out = verifyEvidence([claim({ quote: 'return 0;' })], files);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ quote: 'return 0;', verified: false });
  });

  it('file không tồn tại → verified = false', () => {
    const [out] = verifyEvidence([claim({ file: 'khong-co.cpp' })], files);
    expect(out.verified).toBe(false);
  });

  it('quote rỗng → verified = false', () => {
    const [out] = verifyEvidence([claim({ quote: '   ' })], files);
    expect(out.verified).toBe(false);
  });
});

describe('lý do của góc kiểm theo từng lỗi (E2, §5.9)', () => {
  const withReason = (reason?: string) => ({
    action: 'final',
    calls: [],
    conclusion: { status: 'refuted', toolCallIds: ['tinh_dung-tc-1'], ...(reason === undefined ? {} : { reason }) },
  });

  it('có reason → giữ nguyên', () => {
    const r = parsePerErrorReply(JSON.stringify(withReason('Trừ 150 là sai, ca biên đã đúng.')));
    expect(r).toMatchObject({ action: 'final', conclusion: { status: 'refuted', reason: 'Trừ 150 là sai, ca biên đã đúng.' } });
  });

  it('không có reason → vẫn hợp lệ, reason là undefined', () => {
    const r = parsePerErrorReply(JSON.stringify(withReason()));
    expect(r).toMatchObject({ action: 'final', conclusion: { status: 'refuted' } });
    expect((r as { conclusion: { reason?: string } }).conclusion.reason).toBeUndefined();
  });

  it('reason quá dài → cắt ở CASE_NOTE_MAX', () => {
    const r = parsePerErrorReply(JSON.stringify(withReason('a'.repeat(CASE_NOTE_MAX + 100))));
    expect((r as { conclusion: { reason?: string } }).conclusion.reason).toHaveLength(CASE_NOTE_MAX);
  });

  it('phản biện cho lý do của lượt "confirmed" và "refuted" đều đi qua challenge()', async () => {
    const challenger: Challenger = {
      name: 'tinh_dung',
      review: async () => ({ status: 'confirmed', toolCallIds: ['tc-1'], reason: 'Đọc code: đúng là có lỗi.' }),
    };
    const verdict: Verdict = {
      errors: [{ ruleKey: 'sai_ca_bien', toolCallIds: ['tc-1'], note: null }],
      missingRules: [],
      injectionAttempt: { detected: false, excerpt: null },
    };
    const out = await challenge(verdict, {} as InvestigationContext, [], challenger);
    expect(out.perError[0]).toMatchObject({ ruleKey: 'sai_ca_bien', status: 'confirmed', reason: 'Đọc code: đúng là có lỗi.' });
  });
});
