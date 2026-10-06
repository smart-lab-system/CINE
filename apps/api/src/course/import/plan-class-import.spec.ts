import { planClassImport, type ClassImportContext } from './plan-class-import';

const context: ClassImportContext = {
  semesters: [{ id: 'sem1', academicYearStart: 2026, term: 1 }],
  administrativeClasses: [{ id: 'ac1', code: 'DHKTPM18A' }],
  teachers: [
    { id: 't1', email: 'a@x.vn', name: 'Giảng viên A', role: 'teacher', isActive: true },
    { id: 't2', email: 'b@x.vn', name: 'Giảng viên B', role: 'teacher', isActive: true },
    { id: 't3', email: 'admin@x.vn', name: 'Quản trị', role: 'admin', isActive: true },
    { id: 't4', email: 'nghi@x.vn', name: 'Đã nghỉ', role: 'teacher', isActive: false },
  ],
  classes: [
    { id: 'c1', semesterId: 'sem1', administrativeClassId: 'ac1', groupName: 'Nhóm 1', teacherId: 't1', teacherName: 'Giảng viên A' },
  ],
};
const row = (line: number, semester: string, code: string, groupName: string, teacherEmail: string) => ({
  line,
  semester,
  administrativeClassCode: code,
  groupName,
  teacherEmail,
});

describe('planClassImport', () => {
  it('lớp mới: "new", nhãn gộp kèm học kỳ, ghi create với id đã tra (không tạo gì khác)', () => {
    const plan = planClassImport([row(2, 'HK1 2026-2027', 'DHKTPM18A', 'Nhóm 2', 'b@x.vn')], context);
    expect(plan.rows[0]).toMatchObject({
      line: 2,
      status: 'new',
      label: 'DHKTPM18A – Nhóm 2 · HK1 2026-2027',
      errors: [],
      similar: [],
    });
    expect(plan.writes).toEqual([
      {
        kind: 'create',
        semesterId: 'sem1',
        administrativeClassId: 'ac1',
        groupName: 'Nhóm 2',
        teacherId: 't2',
        teacherName: 'Giảng viên B',
        label: 'DHKTPM18A – Nhóm 2 · HK1 2026-2027',
      },
    ]);
  });

  it('Review cụm E (I1): dòng MỚI hiện giảng viên đã TRA (tên + email) — một email gõ nhầm trúng người khác phải lộ ở bản xem trước', () => {
    const plan = planClassImport([row(2, 'HK1 2026-2027', 'DHKTPM18A', 'Nhóm 2', 'b@x.vn')], context);
    expect(plan.rows[0].changes).toEqual([
      { field: 'teacher', label: 'Giảng viên', from: null, to: 'Giảng viên B (b@x.vn)' },
    ]);
  });

  it('không có nhóm thì nhãn không có gạch ngang', () => {
    const plan = planClassImport([row(2, 'HK1 2026-2027', 'DHKTPM18A', '', 'a@x.vn')], context);
    expect(plan.rows[0].label).toBe('DHKTPM18A · HK1 2026-2027');
  });

  it('cùng khoá, cùng giảng viên: "unchanged"', () => {
    const plan = planClassImport([row(2, 'HK1 2026-2027', 'DHKTPM18A', 'Nhóm 1', 'a@x.vn')], context);
    expect(plan.rows[0].status).toBe('unchanged');
    expect(plan.writes).toEqual([]);
  });

  it('cùng khoá, giảng viên khác: "update" nêu "A → B" (T-IMP-6) và ghi reassign', () => {
    const plan = planClassImport([row(2, 'HK1 2026-2027', 'DHKTPM18A', 'Nhóm 1', 'b@x.vn')], context);
    expect(plan.rows[0]).toMatchObject({
      status: 'update',
      changes: [{ field: 'teacher', label: 'Giảng viên', from: 'Giảng viên A', to: 'Giảng viên B' }],
    });
    expect(plan.writes).toEqual([
      {
        kind: 'reassign',
        classId: 'c1',
        label: 'DHKTPM18A – Nhóm 1 · HK1 2026-2027',
        fromTeacherName: 'Giảng viên A',
        toTeacherId: 't2',
        toTeacherName: 'Giảng viên B',
      },
    ]);
  });

  it('email không phân biệt hoa-thường; nhóm được gộp khoảng trắng; mã được viết hoa', () => {
    const plan = planClassImport([row(2, 'hk1 2026-2027', 'dhktpm18a', '  Nhóm   1 ', 'B@X.VN')], context);
    expect(plan.rows[0].status).toBe('update');
    expect(plan.rows[0].label).toBe('DHKTPM18A – Nhóm 1 · HK1 2026-2027');
  });

  // Ràng buộc duy nhất ở DB là (học kỳ, mã, lower(nhóm)): "nhóm 1" và "Nhóm 1" là CÙNG một lớp. Planner so phân biệt
  // hoa-thường thì dòng này thành lớp "mới" rồi cả lô vỡ ở khoá duy nhất với một câu 409 chung — đúng chỗ bản xem trước
  // phải báo trước.
  it('nhóm khác hoa-thường với lớp có sẵn là CÙNG lớp: không "new", và nhãn dùng tên nhóm đang lưu', () => {
    const plan = planClassImport([row(2, 'HK1 2026-2027', 'DHKTPM18A', 'nhóm 1', 'b@x.vn')], context);
    expect(plan.rows[0]).toMatchObject({ status: 'update', label: 'DHKTPM18A – Nhóm 1 · HK1 2026-2027' });
    expect(plan.writes).toEqual([expect.objectContaining({ kind: 'reassign', classId: 'c1' })]);
  });

  it('Review cụm E (I2): tên nhóm ở dạng tổ hợp (NFD) khớp lớp có sẵn ở dạng dựng sẵn — không thành lớp "mới" trùng', () => {
    const plan = planClassImport(
      [row(2, 'HK1 2026-2027', 'DHKTPM18A', 'Nhóm 1'.normalize('NFD'), 'a@x.vn')],
      context,
    );
    expect(plan.rows[0]).toMatchObject({ status: 'unchanged', label: 'DHKTPM18A – Nhóm 1 · HK1 2026-2027' });
    expect(plan.writes).toEqual([]);
  });

  it('hai dòng chỉ khác hoa-thường của tên nhóm là trùng khoá trong file', () => {
    const plan = planClassImport(
      [
        row(2, 'HK1 2026-2027', 'DHKTPM18A', 'Nhóm 2', 'a@x.vn'),
        row(3, 'HK1 2026-2027', 'DHKTPM18A', 'NHÓM 2', 'b@x.vn'),
      ],
      context,
    );
    expect(plan.rows.map((r) => r.status)).toEqual(['new', 'error']);
    expect(plan.rows[1].errors[0]).toMatch(/dòng 2/);
  });

  it('lớp có sẵn mà file không nhắc tới không có dòng nào (không xoá)', () => {
    const plan = planClassImport([row(2, 'HK1 2026-2027', 'DHKTPM18A', 'Nhóm 9', 'a@x.vn')], context);
    expect(plan.rows).toHaveLength(1);
    expect(plan.writes).toHaveLength(1); // chỉ lớp mới Nhóm 9; c1 không bị đụng
  });

  describe('chỉ CHỌN, không tạo (T-ADM-2)', () => {
    it('học kỳ chưa có: lỗi nêu nhãn và bảo tạo học kỳ trước', () => {
      const plan = planClassImport([row(2, 'HK2 2026-2027', 'DHKTPM18A', 'Nhóm 1', 'a@x.vn')], context);
      expect(plan.rows[0].status).toBe('error');
      expect(plan.rows[0].errors[0]).toMatch(/Chưa có học kỳ HK2 2026-2027.*tạo học kỳ trước/);
      expect(plan.writes).toEqual([]);
    });

    it('nhãn học kỳ không hiểu được: lỗi nêu dạng đúng', () => {
      const plan = planClassImport([row(2, 'học kỳ một', 'DHKTPM18A', 'Nhóm 1', 'a@x.vn')], context);
      expect(plan.rows[0].errors[0]).toMatch(/HK1 2026-2027/);
    });

    it('mã lớp danh nghĩa chưa có trong Danh mục: lỗi nêu mã và chỉ tới Danh mục', () => {
      const plan = planClassImport([row(7, 'HK1 2026-2027', 'DHKTPM18Z', 'Nhóm 1', 'a@x.vn')], context);
      expect(plan.rows[0].line).toBe(7);
      expect(plan.rows[0].errors[0]).toMatch(/Mã DHKTPM18Z chưa có trong Danh mục lớp danh nghĩa/);
    });

    it('mã sai định dạng: dùng câu của luật dùng chung', () => {
      const plan = planClassImport([row(2, 'HK1 2026-2027', 'DHK-TPM', 'Nhóm 1', 'a@x.vn')], context);
      expect(plan.rows[0].errors[0]).toMatch(/chữ và số/);
    });
  });

  describe('giảng viên (Review Focus 7)', () => {
    it.each([
      ['', /thiếu email/i],
      ['khongco@x.vn', /không có tài khoản/i],
      ['admin@x.vn', /không phải tài khoản giảng viên/i],
      ['nghi@x.vn', /vô hiệu hoá/i],
    ])('email %j', (email, pattern) => {
      const plan = planClassImport([row(2, 'HK1 2026-2027', 'DHKTPM18A', 'Nhóm 2', email)], context);
      expect(plan.rows[0].status).toBe('error');
      expect(plan.rows[0].errors.join(' ')).toMatch(pattern);
      expect(plan.writes).toEqual([]);
    });
  });

  it('một dòng gom MỌI lỗi của nó', () => {
    const plan = planClassImport([row(2, 'HK9 2026-2027', 'ZZZ', 'x'.repeat(51), '')], context);
    expect(plan.rows[0].errors.length).toBeGreaterThanOrEqual(4);
  });

  it('trùng khoá trong file: dòng sau là lỗi nêu số dòng đầu', () => {
    const plan = planClassImport(
      [
        row(2, 'HK1 2026-2027', 'DHKTPM18A', 'Nhóm 2', 'a@x.vn'),
        row(3, 'HK1 2026-2027', 'dhktpm18a', 'Nhóm  2', 'b@x.vn'),
      ],
      context,
    );
    expect(plan.rows.map((r) => r.status)).toEqual(['new', 'error']);
    expect(plan.rows[1].errors[0]).toMatch(/dòng 2/);
  });

  it('cùng mã khác nhóm là hai lớp khác nhau, không phải trùng', () => {
    const plan = planClassImport(
      [
        row(2, 'HK1 2026-2027', 'DHKTPM18A', 'Nhóm 2', 'a@x.vn'),
        row(3, 'HK1 2026-2027', 'DHKTPM18A', 'Nhóm 3', 'a@x.vn'),
      ],
      context,
    );
    expect(plan.rows.map((r) => r.status)).toEqual(['new', 'new']);
  });
});
