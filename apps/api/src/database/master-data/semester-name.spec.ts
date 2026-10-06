import { defaultSemesterDates, parseSemesterName } from './semester-name';

describe('parseSemesterName', () => {
  it.each([
    ['HK1 2026-2027', { year: 2026, term: 1 }],
    ['Học kỳ 1 2026-2027', { year: 2026, term: 1 }],
    ['học kỳ 2 2025-2026', { year: 2025, term: 2 }],
    ['HK3 2026–2027', { year: 2026, term: 3 }], // gạch ngang dài
    ['  HK1   2026 - 2027 ', { year: 2026, term: 1 }], // khoảng trắng thừa
    ['hk1 2026-2027', { year: 2026, term: 1 }],
  ])('đọc "%s"', (text, expected) => {
    expect(parseSemesterName(text)).toEqual(expected);
  });

  it('đọc được chữ tiếng Việt viết ở dạng tổ hợp (NFD) như dạng dựng sẵn (NFC)', () => {
    expect(parseSemesterName('Học kỳ 1 2026-2027'.normalize('NFD'))).toEqual({ year: 2026, term: 1 });
  });

  it.each([
    'TEST dien tap', // chuỗi diễn tập: KHÔNG phải học kỳ, giữ nguyên để còn nhận ra
    'HK1 2026-2028', // năm sau không bằng năm + 1
    'HK4 2026-2027', // chỉ có kỳ 1–3
    'HK1 1999-2000', // ngoài khoảng 2000–2999 của DB
    'HK1 2026', // thiếu năm sau
    'Học kỳ một 2026-2027',
    '',
  ])('KHÔNG đọc "%s" — trả null, không đoán', (text) => {
    expect(parseSemesterName(text)).toBeNull();
  });
});

describe('defaultSemesterDates', () => {
  it('kỳ 1 của 2026 là 01/09/2026 → 31/01/2027 (số tạm của spec §8.2)', () => {
    expect(defaultSemesterDates(2026, 1)).toEqual({ startDate: '2026-09-01', endDate: '2027-01-31' });
  });

  it('ba kỳ của một năm và kỳ 1 năm sau nối nhau, không chồng ngày (ràng buộc EXCLUDE của DB)', () => {
    const order = [defaultSemesterDates(2026, 1), defaultSemesterDates(2026, 2), defaultSemesterDates(2026, 3), defaultSemesterDates(2027, 1)];
    for (let i = 1; i < order.length; i += 1) {
      expect(order[i].startDate > order[i - 1].endDate).toBe(true);
    }
  });
});
