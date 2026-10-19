import { splitTotalHundredths } from './points-split';

describe('splitTotalHundredths — chia điểm bằng số nguyên phần trăm (review I3)', () => {
  it('10 điểm cho ba câu là 3,33 + 3,33 + 3,34 (phần dư về câu cuối)', () => {
    expect(splitTotalHundredths(1000, 3)).toEqual([333, 333, 334]);
  });

  it('chia đều khi chia hết', () => {
    expect(splitTotalHundredths(1000, 4)).toEqual([250, 250, 250, 250]);
    expect(splitTotalHundredths(1000, 1)).toEqual([1000]);
  });

  it('tổng luôn đúng, và mỗi phần là số nguyên phần trăm', () => {
    for (let n = 1; n <= 12; n += 1) {
      const parts = splitTotalHundredths(1000, n);
      expect(parts).toHaveLength(n);
      expect(parts.reduce((s, h) => s + h, 0)).toBe(1000);
      expect(parts.every((h) => Number.isInteger(h))).toBe(true);
    }
  });
});
