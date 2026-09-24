import { formatHundredths, parseHundredths } from './hundredths';

describe('parseHundredths', () => {
  it('đọc thẳng chuỗi numeric thành số nguyên, không qua float', () => {
    expect(parseHundredths('7.25')).toBe(725);
    expect(parseHundredths('10')).toBe(1000);
    expect(parseHundredths('0.5')).toBe(50);
    expect(parseHundredths('9.70')).toBe(970);
  });
  it('từ chối chuỗi không phải điểm hợp lệ', () => {
    expect(() => parseHundredths('7.255')).toThrow();
    expect(() => parseHundredths('-1')).toThrow();
    expect(() => parseHundredths('abc')).toThrow();
    expect(() => parseHundredths('')).toThrow();
  });
  it('in ngược lại đúng hai chữ số lẻ', () => {
    expect(formatHundredths(725)).toBe('7.25');
    expect(formatHundredths(1000)).toBe('10.00');
    expect(formatHundredths(5)).toBe('0.05');
  });
});
