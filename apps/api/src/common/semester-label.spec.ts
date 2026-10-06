import { formatDmy, semesterLabel } from './semester-label';

describe('semesterLabel', () => {
  it('ghép HK{kỳ} {năm}-{năm+1}', () => {
    expect(semesterLabel(2026, 1)).toBe('HK1 2026-2027');
    expect(semesterLabel(2026, 3)).toBe('HK3 2026-2027');
    expect(semesterLabel(2099, 2)).toBe('HK2 2099-2100');
  });
});

describe('formatDmy', () => {
  it('đổi yyyy-mm-dd thành dd/mm/yyyy', () => {
    expect(formatDmy('2026-09-01')).toBe('01/09/2026');
    expect(formatDmy('2027-01-31')).toBe('31/01/2027');
  });
});
