import { splitParagraphs, toParagraphSpans } from './submission-text.service';

/**
 * Hai hàm thuần đứng giữa "dẫn chứng nằm ở ký tự thứ mấy của cả bài" và
 * "dẫn chứng nằm ở ký tự thứ mấy của đoạn nào".
 *
 * Chúng là hàm thuần vì đó là chỗ duy nhất phép quy đổi toạ độ có thể sai,
 * và một phép toạ độ sai không làm đỏ test nào khác — nó chỉ làm highlight
 * lệch vài ký tự, thứ đọc ra như "gần đúng".
 */
describe('splitParagraphs', () => {
  it('giữ offset gốc của từng đoạn', () => {
    const got = splitParagraphs('Đoạn một.\n\nĐoạn hai.');
    expect(got).toEqual([
      { text: 'Đoạn một.', start: 0, end: 9 },
      { text: 'Đoạn hai.', start: 11, end: 20 },
    ]);
  });

  it('một đoạn duy nhất khi không có dòng trống', () => {
    // Xuống dòng MỀM không phải ranh giới đoạn — mammoth chỉ sinh dòng
    // trống giữa hai paragraph thật của Word.
    const got = splitParagraphs('Một dòng\nxuống dòng mềm');
    expect(got).toHaveLength(1);
    expect(got[0].text).toBe('Một dòng\nxuống dòng mềm');
  });

  it('ba dòng trống trở lên vẫn là MỘT ranh giới', () => {
    const got = splitParagraphs('A\n\n\n\nB');
    expect(got).toHaveLength(2);
    expect(got[1]).toEqual({ text: 'B', start: 5, end: 6 });
  });

  it('chuỗi rỗng ra đúng một đoạn rỗng, không ra mảng rỗng', () => {
    // Mảng rỗng sẽ khiến màn hình vẽ một khung trắng không lời giải thích.
    expect(splitParagraphs('')).toEqual([{ text: '', start: 0, end: 0 }]);
  });
});

describe('toParagraphSpans', () => {
  const paras = splitParagraphs('Đoạn một.\n\nĐoạn hai.');

  it('quy span toàn cục về offset trong đoạn', () => {
    expect(toParagraphSpans(paras, 'c1', [{ start: 5, end: 8 }])).toEqual([
      { criterionId: 'c1', paragraph: 0, start: 5, end: 8 },
    ]);
  });

  it('CHẺ ĐÔI span vắt qua hai đoạn, giữ nguyên criterionId', () => {
    // Ca thường, không phải ca biên: chuẩn hoá gộp dòng trống thành một dấu
    // cách, nên model trích một câu qua hai đoạn là hoàn toàn hợp lệ.
    const got = toParagraphSpans(paras, 'c2', [{ start: 5, end: 15 }]);
    expect(got).toEqual([
      { criterionId: 'c2', paragraph: 0, start: 5, end: 9 },
      { criterionId: 'c2', paragraph: 1, start: 0, end: 4 },
    ]);
  });

  it('bỏ qua phần span rơi vào chính dòng trống', () => {
    // Offset 9..11 là '\n\n' — không thuộc đoạn nào, nên không sinh span.
    expect(toParagraphSpans(paras, 'c3', [{ start: 9, end: 11 }])).toEqual([]);
  });

  it('nhiều mẩu elision ra nhiều span, theo thứ tự', () => {
    const got = toParagraphSpans(paras, 'c4', [
      { start: 0, end: 4 },
      { start: 11, end: 15 },
    ]);
    expect(got).toEqual([
      { criterionId: 'c4', paragraph: 0, start: 0, end: 4 },
      { criterionId: 'c4', paragraph: 1, start: 0, end: 4 },
    ]);
  });
});
