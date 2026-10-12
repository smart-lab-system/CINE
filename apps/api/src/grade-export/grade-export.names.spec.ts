import { outputFileName } from './grade-export.names';

describe('outputFileName', () => {
  it('adds a suffix before the extension and keeps Vietnamese letters', () => {
    expect(outputFileName('Sổ điểm N01.xlsx')).toBe('Sổ điểm N01-da-ghi-diem.xlsx');
  });
  it('is case-insensitive about the extension and strips only one', () => {
    expect(outputFileName('SO-DIEM.XLSX')).toBe('SO-DIEM-da-ghi-diem.xlsx');
    expect(outputFileName('a.xlsx.xlsx')).toBe('a.xlsx-da-ghi-diem.xlsx');
  });
  it('cannot smuggle a path or a control character into a header', () => {
    expect(outputFileName('..\\..\\etc/passwd.xlsx')).toBe('.._.._etc_passwd-da-ghi-diem.xlsx');
    expect(outputFileName('a\r\nb.xlsx')).toBe('ab-da-ghi-diem.xlsx');
  });
  it('falls back to a name when nothing is left, and caps a very long one', () => {
    expect(outputFileName('.xlsx')).toBe('so-diem-da-ghi-diem.xlsx');
    expect(outputFileName('   ')).toBe('so-diem-da-ghi-diem.xlsx');
    expect(outputFileName('x'.repeat(400) + '.xlsx').length).toBeLessThanOrEqual(255);
  });
});
