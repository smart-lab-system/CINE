import { describe, expect, it } from 'vitest';
import { splitStudentName } from './split-name';

describe('splitStudentName', () => {
  it('takes the last token as Ten and the rest as Ho_Dem', () => {
    expect(splitStudentName('Nguyễn Hoàng Minh')).toEqual({
      hoDem: 'Nguyễn Hoàng',
      ten: 'Minh',
    });
  });

  it('duplicates a single token into both fields', () => {
    expect(splitStudentName('Minh')).toEqual({ hoDem: 'Minh', ten: 'Minh' });
  });

  it('trims and collapses internal whitespace', () => {
    expect(splitStudentName('  Trần   Thị  Mai  Anh  ')).toEqual({
      hoDem: 'Trần Thị Mai',
      ten: 'Anh',
    });
  });

  it('returns empty strings for blank input', () => {
    expect(splitStudentName('   ')).toEqual({ hoDem: '', ten: '' });
  });
});
