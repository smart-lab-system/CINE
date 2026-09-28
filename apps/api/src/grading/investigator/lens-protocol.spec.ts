import { CASE_NOTE_MAX, clampNote, parseCaseLensReply, parsePerErrorReply } from './lens-protocol';

const PER_ERROR_FINAL = { action: 'final', calls: [], conclusion: { status: 'confirmed', toolCallIds: [] } };
const CASE_LENS_FINAL = { action: 'final', calls: [], conclusion: { suspected: false, note: 'ok' } };

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
