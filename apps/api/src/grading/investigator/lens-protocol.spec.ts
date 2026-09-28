import { CASE_NOTE_MAX, clampNote, parseCaseLensReply, parseOmissionReply, parsePerErrorReply } from './lens-protocol';

const PER_ERROR_FINAL = { action: 'final', calls: [], conclusion: { status: 'confirmed', toolCallIds: [] } };
const CASE_LENS_FINAL = { action: 'final', calls: [], conclusion: { suspected: false, note: 'ok' } };
const CALL_TURN = { tool: 'list_files', input: null, group: null, path: null, fromLine: null, toLine: null };

describe('parsePerErrorReply() — W2: qua bộ đọc §5.2 thật (readSingleJson), không phải bộ cắt vỏ tự chế', () => {
  it('JSON gọn, không rào → đọc được', () => {
    expect(parsePerErrorReply(JSON.stringify(PER_ERROR_FINAL))).toEqual(PER_ERROR_FINAL);
  });

  it('bọc trong khối ```json … ``` kèm văn xuôi trước/sau → vẫn đọc được (§5.2, cùng hành vi parseReply() của protocol.ts)', () => {
    const wrapped = `Đây là kết luận của tôi:\n\`\`\`json\n${JSON.stringify(PER_ERROR_FINAL)}\n\`\`\`\nHết.`;
    expect(parsePerErrorReply(wrapped)).toEqual(PER_ERROR_FINAL);
  });

  it('có thẻ <think>…</think> suy luận trước JSON → thẻ bị cắt bỏ trước khi đọc (T-PARSE-1)', () => {
    const withThink = `<think>để tôi xem xét bài này thật kỹ</think>${JSON.stringify(PER_ERROR_FINAL)}`;
    expect(parsePerErrorReply(withThink)).toEqual(PER_ERROR_FINAL);
  });

  it('rỗng hay không phải JSON → null, không ném', () => {
    expect(parsePerErrorReply('')).toBeNull();
    expect(parsePerErrorReply('không phải JSON gì cả')).toBeNull();
  });

  it('diễn tập 2026-09-28 (occ/claude-sonnet-5) — lượt "call" THIẾU hẳn khoá "conclusion" → vẫn đọc được (schema không được đòi khoá không dùng tới)', () => {
    const noConclusionKey = { action: 'call', calls: [CALL_TURN] };
    const r = parsePerErrorReply(JSON.stringify(noConclusionKey));
    expect(r).not.toBeNull();
    expect(r!.action).toBe('call');
  });
});

describe('parseCaseLensReply() — cùng bộ đọc §5.2', () => {
  it('bọc trong khối ```json … ``` → vẫn đọc được', () => {
    const wrapped = `\`\`\`json\n${JSON.stringify(CASE_LENS_FINAL)}\n\`\`\``;
    expect(parseCaseLensReply(wrapped)).toEqual(CASE_LENS_FINAL);
  });

  it('note dài hơn 500 ký tự → vẫn đọc được, note bị cắt về 500 (không vứt cả kết luận vì model viết dài)', () => {
    const long = { action: 'final', calls: [], conclusion: { suspected: true, note: 'x'.repeat(700) } };
    const r = parseCaseLensReply(JSON.stringify(long));
    expect(r).not.toBeNull();
    const note = r!.action === 'final' ? r!.conclusion.note : '';
    expect(note.length).toBe(CASE_NOTE_MAX);
    expect(note.endsWith('…')).toBe(true);
  });

  it('lượt "call" thiếu khoá "conclusion" → vẫn đọc được', () => {
    const r = parseCaseLensReply(JSON.stringify({ action: 'call', calls: [CALL_TURN] }));
    expect(r).not.toBeNull();
    expect(r!.action).toBe('call');
  });
});

describe('parseOmissionReply() — cùng bộ đọc §5.2', () => {
  it('lượt "call" thiếu khoá "conclusion" → vẫn đọc được (diễn tập 2026-09-28)', () => {
    const r = parseOmissionReply(JSON.stringify({ action: 'call', calls: [CALL_TURN] }));
    expect(r).not.toBeNull();
    expect(r!.action).toBe('call');
  });

  it('lượt kết luận vẫn đọc đúng như trước', () => {
    const final = { action: 'final', calls: [], conclusion: { rules: [{ ruleKey: 'x', verdict: 'ok' }], note: 'ok' } };
    expect(parseOmissionReply(JSON.stringify(final))).toEqual({ ...final, conclusion: { ...final.conclusion, missedRuleKeys: [] } });
  });
});

describe('clampNote()', () => {
  it('note ngắn giữ nguyên; note dài cắt về đúng CASE_NOTE_MAX, kết thúc bằng "…"', () => {
    expect(clampNote('ngắn')).toBe('ngắn');
    expect(clampNote('y'.repeat(CASE_NOTE_MAX))).toBe('y'.repeat(CASE_NOTE_MAX));
    const cut = clampNote(`(chưa tự kiểm được) ${'z'.repeat(CASE_NOTE_MAX)}`);
    expect(cut.length).toBe(CASE_NOTE_MAX);
    expect(cut.endsWith('…')).toBe(true);
  });
});
