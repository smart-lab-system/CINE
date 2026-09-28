import { parseCaseLensReply, parsePerErrorReply } from './lens-protocol';

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
});
