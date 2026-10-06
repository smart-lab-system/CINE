import { semesterProblems } from './semester.rules';

const GOOD = { academicYearStart: 2026, term: 1, startDate: '2026-09-01', endDate: '2027-01-31' };

describe('semesterProblems', () => {
  it('đầu vào hợp lệ không có lỗi', () => {
    expect(semesterProblems(GOOD)).toEqual([]);
  });

  it('kỳ chỉ là 1, 2 hoặc 3 (một năm học có ba kỳ)', () => {
    expect(semesterProblems({ ...GOOD, term: 4 })).toEqual([expect.stringMatching(/kỳ/i)]);
    expect(semesterProblems({ ...GOOD, term: 0 })).toEqual([expect.stringMatching(/kỳ/i)]);
    expect(semesterProblems({ ...GOOD, term: 1.5 })).toEqual([expect.stringMatching(/kỳ/i)]);
  });

  it('năm học trong 2000–2999', () => {
    expect(semesterProblems({ ...GOOD, academicYearStart: 1999 })).toEqual([expect.stringMatching(/năm học/i)]);
    expect(semesterProblems({ ...GOOD, academicYearStart: 3000 })).toEqual([expect.stringMatching(/năm học/i)]);
  });

  it('ngày phải là ngày có thật theo dạng yyyy-mm-dd', () => {
    expect(semesterProblems({ ...GOOD, startDate: '2026-02-30' })).toEqual([expect.stringMatching(/ngày bắt đầu/i)]);
    expect(semesterProblems({ ...GOOD, endDate: '31/01/2027' })).toEqual([expect.stringMatching(/ngày kết thúc/i)]);
    expect(semesterProblems({ ...GOOD, startDate: '' })).toEqual([expect.stringMatching(/ngày bắt đầu/i)]);
  });

  it('ngày kết thúc không được trước ngày bắt đầu, nhưng bằng nhau thì được', () => {
    expect(semesterProblems({ ...GOOD, endDate: '2026-08-31' })).toEqual([expect.stringMatching(/không được trước/i)]);
    expect(semesterProblems({ ...GOOD, endDate: '2026-09-01' })).toEqual([]);
  });

  it('cả hai ngày phải nằm trong cửa sổ của năm học: từ 01/06 năm đầu tới 31/10 năm sau (quyết định của user 06/10)', () => {
    // Biên trong là hợp lệ.
    expect(semesterProblems({ ...GOOD, startDate: '2026-06-01', endDate: '2027-10-31' })).toEqual([]);
    // Lệch ra ngoài một ngày thì không.
    expect(semesterProblems({ ...GOOD, startDate: '2026-05-31' })).toEqual([expect.stringMatching(/ngày bắt đầu.*2026-2027.*01\/06\/2026.*31\/10\/2027/i)]);
    expect(semesterProblems({ ...GOOD, endDate: '2027-11-01' })).toEqual([expect.stringMatching(/ngày kết thúc.*2026-2027/i)]);
  });

  it('gõ lệch năm một đơn vị hoặc nhầm chữ số của năm đều bị bắt', () => {
    // Ngày của năm học SAU: kết thúc 2028-01-31 vượt cửa sổ 2026-2027.
    expect(semesterProblems({ ...GOOD, startDate: '2027-09-01', endDate: '2028-01-31' })).toEqual([expect.stringMatching(/ngày kết thúc/i)]);
    // Ngày của năm học TRƯỚC.
    expect(semesterProblems({ ...GOOD, startDate: '2025-09-01', endDate: '2026-01-31' })).toEqual([
      expect.stringMatching(/ngày bắt đầu/i),
      expect.stringMatching(/ngày kết thúc/i),
    ]);
    // Nhầm chữ số: cả hai ngày ngoài cửa sổ.
    expect(semesterProblems({ ...GOOD, startDate: '2031-09-01', endDate: '2032-01-31' })).toEqual([
      expect.stringMatching(/ngày bắt đầu/i),
      expect.stringMatching(/ngày kết thúc/i),
    ]);
  });

  it('năm học không hợp lệ thì không báo thêm lỗi cửa sổ (chỉ một lỗi, về năm)', () => {
    expect(semesterProblems({ ...GOOD, academicYearStart: 1999 })).toEqual([expect.stringMatching(/năm học/i)]);
  });

  it('gom mọi lỗi thay vì dừng ở lỗi đầu tiên', () => {
    expect(semesterProblems({ academicYearStart: 1, term: 9, startDate: 'x', endDate: 'y' }).length).toBe(4);
  });
});
