import { planSemesterImport, type ExistingSemester } from './plan-semester-import';

const existing: ExistingSemester[] = [
  { id: 's1', academicYearStart: 2026, term: 1, startDate: '2026-09-01', endDate: '2027-01-31' },
  { id: 's2', academicYearStart: 2026, term: 2, startDate: '2027-02-01', endDate: '2027-05-31' },
];
const row = (line: number, academicYear: string, term: string, startDate: string, endDate: string) => ({
  line,
  academicYear,
  term,
  startDate,
  endDate,
});

describe('planSemesterImport', () => {
  it('học kỳ mới liền sau kỳ cuối: "new", nhãn đọc được, ghi create', () => {
    const plan = planSemesterImport([row(2, '2026', '3', '2027-06-01', '2027-08-31')], existing);
    expect(plan.rows[0]).toMatchObject({ line: 2, status: 'new', label: 'HK3 2026-2027', errors: [] });
    expect(plan.writes).toEqual([
      { kind: 'create', academicYearStart: 2026, term: 3, startDate: '2027-06-01', endDate: '2027-08-31' },
    ]);
  });

  it('nhận ngày dd/mm/yyyy và "HK2" ở cột kỳ; ghi ra yyyy-mm-dd', () => {
    const plan = planSemesterImport([row(2, '2026', 'HK3', '01/06/2027', '31/08/2027')], existing);
    expect(plan.writes).toEqual([
      { kind: 'create', academicYearStart: 2026, term: 3, startDate: '2027-06-01', endDate: '2027-08-31' },
    ]);
  });

  it('cùng khoá, cùng ngày: "unchanged"', () => {
    const plan = planSemesterImport([row(2, '2026', '1', '2026-09-01', '2027-01-31')], existing);
    expect(plan.rows[0].status).toBe('unchanged');
    expect(plan.writes).toEqual([]);
  });

  it('cùng khoá, ngày kết thúc khác: "update" kèm từ → đến (dd/mm/yyyy), chỉ ngày được ghi', () => {
    const plan = planSemesterImport([row(2, '2026', '2', '2027-02-01', '2027-06-15')], existing);
    expect(plan.rows[0]).toMatchObject({
      status: 'update',
      changes: [{ field: 'endDate', label: 'Ngày kết thúc', from: '31/05/2027', to: '15/06/2027' }],
    });
    expect(plan.writes).toEqual([{ kind: 'update', id: 's2', startDate: '2027-02-01', endDate: '2027-06-15' }]);
  });

  it('đổi cả hai ngày cho ra hai thay đổi', () => {
    const plan = planSemesterImport([row(2, '2026', '2', '2027-02-05', '2027-06-15')], existing);
    expect(plan.rows[0].changes.map((c) => c.field)).toEqual(['startDate', 'endDate']);
  });

  it('kỳ có sẵn mà file không nhắc tới không có dòng nào (không xoá)', () => {
    const plan = planSemesterImport([row(2, '2026', '3', '2027-06-01', '2027-08-31')], existing);
    expect(plan.rows).toHaveLength(1);
  });

  describe('chồng ngày', () => {
    it('chồng với kỳ có sẵn: lỗi nêu nhãn và khoảng ngày của kỳ đó', () => {
      const plan = planSemesterImport([row(2, '2026', '3', '2027-05-15', '2027-08-31')], existing);
      expect(plan.rows[0].status).toBe('error');
      expect(plan.rows[0].errors[0]).toMatch(/HK2 2026-2027 \(01\/02\/2027–31\/05\/2027\)/);
      expect(plan.writes).toEqual([]);
    });

    it('khoảng ngày là ĐÓNG ở hai đầu: trùng đúng một ngày cũng là chồng', () => {
      const plan = planSemesterImport([row(2, '2026', '3', '2027-05-31', '2027-08-31')], existing);
      expect(plan.rows[0].status).toBe('error');
    });

    it('hai dòng trong file chồng nhau: cả hai lỗi, nêu số dòng của dòng kia', () => {
      const plan = planSemesterImport(
        [row(2, '2026', '3', '2027-06-01', '2027-08-31'), row(3, '2027', '1', '2027-08-15', '2028-01-31')],
        existing,
      );
      expect(plan.rows.map((r) => r.status)).toEqual(['error', 'error']);
      expect(plan.rows[0].errors[0]).toMatch(/dòng 3/);
      expect(plan.rows[1].errors[0]).toMatch(/dòng 2/);
    });

    it('dời hai kỳ CHÉO vào chỗ của nhau: dòng đi vào chỗ cũ của kỳ kia bị từ chối kèm gợi ý (Review Focus 5)', () => {
      // s1 dời vào đúng khoảng CŨ của s2, còn s2 dời đi chỗ khác. Quy tắc bảo thủ so với ngày HIỆN TẠI của s2 nên dòng 2 bị
      // chặn — nếu không, `UPDATE` s1 chạy trước s2 sẽ chồng NGAY LÚC ĐÓ ở ràng buộc EXCLUDE không hoãn được.
      const plan = planSemesterImport(
        [row(2, '2026', '1', '2027-02-01', '2027-05-31'), row(3, '2026', '2', '2027-06-01', '2027-10-15')],
        existing,
      );
      expect(plan.rows.map((r) => r.status)).toEqual(['error', 'update']);
      expect(plan.rows[0].errors[0]).toMatch(/từng kỳ một/);
      expect(plan.writes).toEqual([{ kind: 'update', id: 's2', startDate: '2027-06-01', endDate: '2027-10-15' }]);
    });

    it('kéo dài một kỳ sang chỗ trống thì được', () => {
      const plan = planSemesterImport([row(2, '2026', '1', '2026-08-15', '2027-01-31')], existing);
      expect(plan.rows[0].status).toBe('update');
    });
  });

  describe('cửa sổ ngày của năm học (quyết định của user 06/10)', () => {
    it('ngày lệch ra ngoài 01/06 → 31/10 năm sau là lỗi dòng, nêu cửa sổ; không ghi gì', () => {
      const plan = planSemesterImport([row(2, '2026', '3', '2028-06-01', '2028-08-31')], existing);
      expect(plan.rows[0].status).toBe('error');
      expect(plan.rows[0].errors.join(' ')).toMatch(/2026-2027.*01\/06\/2026.*31\/10\/2027/);
      expect(plan.writes).toEqual([]);
    });

    it('đúng hai biên thì được', () => {
      const plan = planSemesterImport([row(2, '2026', '3', '2027-06-01', '2027-10-31')], existing);
      expect(plan.rows[0].status).toBe('new');
    });
  });

  describe('lỗi từng dòng', () => {
    it('gom MỌI lỗi đọc ô của một dòng', () => {
      const plan = planSemesterImport([row(2, 'abc', '4', 'x', '')], existing);
      expect(plan.rows[0].status).toBe('error');
      expect(plan.rows[0].errors).toHaveLength(4);
      expect(plan.rows[0].label).toBe('Dòng 2');
    });

    it('chuỗi `Date.toString()` của exceljs bị từ chối kèm hướng dẫn định dạng', () => {
      const plan = planSemesterImport(
        [row(2, '2026', '3', 'Tue Jun 01 2027 07:00:00 GMT+0700 (Indochina Time)', '2027-08-31')],
        existing,
      );
      expect(plan.rows[0].errors[0]).toMatch(/yyyy-mm-dd hoặc dd\/mm\/yyyy/);
    });

    it('ngày kết thúc trước ngày bắt đầu: dùng đúng câu của luật dùng chung', () => {
      const plan = planSemesterImport([row(2, '2026', '3', '2027-08-31', '2027-06-01')], existing);
      expect(plan.rows[0].errors).toEqual([expect.stringMatching(/không được trước/)]);
    });

    it('năm học ngoài 2000–2999: lỗi của luật dùng chung', () => {
      const plan = planSemesterImport([row(2, '1999', '1', '1999-09-01', '2000-01-31')], existing);
      expect(plan.rows[0].errors[0]).toMatch(/2000/);
    });

    it('trùng khoá trong file: dòng sau là lỗi nêu số dòng đầu', () => {
      const plan = planSemesterImport(
        [row(2, '2026', '3', '2027-06-01', '2027-08-31'), row(3, '2026', '3', '2027-06-02', '2027-08-30')],
        existing,
      );
      expect(plan.rows.map((r) => r.status)).toEqual(['new', 'error']);
      expect(plan.rows[1].errors[0]).toMatch(/dòng 2/);
    });
  });
});
