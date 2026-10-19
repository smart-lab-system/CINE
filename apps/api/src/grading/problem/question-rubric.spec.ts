import { scaleCriteriaHundredths } from './question-rubric';

describe('scaleCriteriaHundredths — co giãn tiêu chí của rubric mẫu theo điểm câu (5.1)', () => {
  it('tỉ lệ chia hết: 200/300/500 (tổng 1000) → 600 cho ra 120/180/300', () => {
    expect(scaleCriteriaHundredths([200, 300, 500], 600)).toEqual([120, 180, 300]);
  });

  it('tổng luôn bằng điểm câu, kể cả khi không chia hết: phần dư dồn vào mục cuối', () => {
    const out = scaleCriteriaHundredths([200, 300, 500], 333);
    expect(out.reduce((s, h) => s + h, 0)).toBe(333);
    expect(out.slice(0, 2)).toEqual([66, 99]); // floor(200·333/1000), floor(300·333/1000)
    expect(out[2]).toBe(168); // 333 − 66 − 99
  });

  it('không mục nào âm, kể cả khi điểm câu rất nhỏ', () => {
    const out = scaleCriteriaHundredths([1, 1, 998], 1);
    expect(out.every((h) => h >= 0)).toBe(true);
    expect(out.reduce((s, h) => s + h, 0)).toBe(1);
  });

  it('rubric mẫu không có tiêu chí có điểm → lỗi rõ ràng, không chia cho 0', () => {
    expect(() => scaleCriteriaHundredths([], 500)).toThrow(/tiêu chí/);
    expect(() => scaleCriteriaHundredths([0, 0], 500)).toThrow(/tiêu chí/);
  });
});
