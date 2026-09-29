import { describe, expect, it } from 'vitest';
import { formatVnPoints, formatVnDeduction } from './format';

describe('formatVnPoints', () => {
  it('trims a trailing zero: 4 → "4,0", not "4,00"', () => {
    expect(formatVnPoints(4)).toBe('4,0');
  });
  it('keeps a real quarter-point: 7.25 → "7,25"', () => {
    expect(formatVnPoints(7.25)).toBe('7,25');
  });
  it('uses U+2212 for negative values, not ASCII hyphen', () => {
    expect(formatVnPoints(-1.5)).toBe('−1,5');
  });
  it('renders null as an em dash', () => {
    expect(formatVnPoints(null)).toBe('—');
  });
});

describe('formatVnDeduction', () => {
  it('always shows a rule price as a deduction, even given a positive number', () => {
    expect(formatVnDeduction(150)).toBe('−1,5');
  });
});
