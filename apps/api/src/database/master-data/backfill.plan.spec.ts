import type { LegacyClass, LegacyEnrollment, LegacySession, LegacySnapshot } from './backfill.types';
import { isEmptyPlan, planBackfill, scopeSnapshot } from './backfill.plan';

let counter = 0;
const cls = (name: string | null, over: Partial<LegacyClass> = {}): LegacyClass => ({
  id: `c-${name ?? `x${++counter}`}`, teacherId: 't1', name, semesterId: null, administrativeClassId: null, groupName: '', ...over,
});
const ses = (classId: string, semesterName: string, roomName = 'Phòng máy A1', over: Partial<LegacySession> = {}): LegacySession => ({
  id: `s-${++counter}`, classId, semesterName, roomName, roomId: null, ...over,
});
const enr = (homeClassId: string, studentMssv: string, studentName: string | null = `Tên ${studentMssv}`): LegacyEnrollment => ({
  homeClassId, studentMssv, studentName,
});
const snap = (parts: Partial<LegacySnapshot>): LegacySnapshot => ({
  classes: [], sessions: [], enrollments: [], semesters: [], rooms: [], administrativeClasses: [], students: [], ...parts,
});
const codes = (result: { problems: { code: string }[] }) => result.problems.map((p) => p.code);

describe('planBackfill — dữ liệu thật thu nhỏ (spec §8.1–8.3)', () => {
  const atl = cls('DHKTPM18ATT');
  const ctt = cls('DHKTPM18CTT');
  const mongo = cls('Hệ Quản Trị Dữ Liệu MongoDB');
  const world = snap({
    classes: [atl, ctt, mongo],
    sessions: [
      ses(atl.id, 'HK1 2026-2027', 'Phòng máy A1'),
      ses(atl.id, 'Học kỳ 1 2026-2027', 'Phòng máy B1'),
      ses(mongo.id, 'Học kỳ 1 2026-2027', 'Phòng  H3.03'),
      ses(mongo.id, 'TEST dien tap', 'TEST-KHONG-PHONG'),
    ],
    enrollments: [
      ...['1001', '1002', '1003', '1004'].map((m) => enr(atl.id, m)),
      ...['1001', '1002'].map((m) => enr(mongo.id, m)), // đã ở lớp ATT
      ...['2001', '2002'].map((m) => enr(ctt.id, m)),
    ],
  });
  const options = {
    defaultSemester: { year: 2026, term: 1 as const },
    merges: [{ from: 'Hệ Quản Trị Dữ Liệu MongoDB', into: 'DHKTPM18ATT' }],
    inactiveRooms: ['TEST-KHONG-PHONG'],
  };

  it('không có vấn đề, và kế hoạch đúng như spec §8.2–8.3', () => {
    const { plan, problems } = planBackfill(world, options);
    expect(problems).toEqual([]);
    expect(plan.merges).toEqual([{ fromId: mongo.id, intoId: atl.id, fromName: 'Hệ Quản Trị Dữ Liệu MongoDB', intoName: 'DHKTPM18ATT' }]);
    expect(plan.semesters).toEqual([{ year: 2026, term: 1 }]); // hai cách viết gộp thành MỘT kỳ
    expect(plan.administrativeClasses).toEqual(['DHKTPM18ATT', 'DHKTPM18CTT']);
    // ATT suy kỳ từ phiên của nó; CTT không có phiên nào nên dùng kỳ mặc định; lớp MongoDB đã bị gộp nên không còn là lớp.
    expect(plan.classAssignments).toEqual([
      { classId: atl.id, semester: { year: 2026, term: 1 }, code: 'DHKTPM18ATT' },
      { classId: ctt.id, semester: { year: 2026, term: 1 }, code: 'DHKTPM18CTT' },
    ]);
  });

  it('phòng: tên chuẩn hoá (gộp khoảng trắng), mỗi phòng một lần, TEST-KHONG-PHONG tạo ra NGỪNG hoạt động', () => {
    const { plan } = planBackfill(world, options);
    expect(plan.rooms).toEqual([
      { name: 'Phòng H3.03', isActive: true },
      { name: 'Phòng máy A1', isActive: true },
      { name: 'Phòng máy B1', isActive: true },
      { name: 'TEST-KHONG-PHONG', isActive: false },
    ]);
    expect(plan.roomAssignments.map((r) => r.name)).toEqual(['Phòng H3.03', 'Phòng máy A1', 'Phòng máy B1', 'TEST-KHONG-PHONG']);
  });

  it('chuỗi học kỳ đọc được thì viết lại về dạng chuẩn; chuỗi TEST giữ nguyên; dạng chuẩn rồi thì không đụng', () => {
    const { plan } = planBackfill(world, options);
    const rewritten = plan.semesterNameRewrites.map((r) => r.label);
    expect(rewritten).toEqual(['HK1 2026-2027', 'HK1 2026-2027']); // hai phiên viết "Học kỳ 1 …"; "HK1 …" và "TEST …" không nằm đây
  });

  it('sinh viên: mỗi MSSV một lần (enrollment của lớp bị gộp là bản trùng, không đếm)', () => {
    const { plan } = planBackfill(world, options);
    expect(plan.students.map((s) => s.mssv)).toEqual(['1001', '1002', '1003', '1004', '2001', '2002']);
    expect(plan.students[0]).toEqual({ mssv: '1001', fullName: 'Tên 1001' });
  });
});

describe('planBackfill — T-MIG-1: dừng thay vì đoán', () => {
  it('lớp có phiên mà không chuỗi nào đọc được, và không có kỳ mặc định → CLASS_SEMESTER_UNKNOWN', () => {
    const a = cls('DHKTPM18ATT');
    expect(codes(planBackfill(snap({ classes: [a], sessions: [ses(a.id, 'TEST dien tap')] })))).toEqual(['CLASS_SEMESTER_UNKNOWN']);
  });

  it('lớp KHÔNG có phiên nào và không có kỳ mặc định → CLASS_SEMESTER_UNKNOWN (không tự lấy "kỳ hiện tại")', () => {
    expect(codes(planBackfill(snap({ classes: [cls('DHKTPM18CTT')] })))).toEqual(['CLASS_SEMESTER_UNKNOWN']);
  });

  it('một lớp có phiên ở hai kỳ → CLASS_SEMESTER_CONFLICT (một lớp chỉ thuộc một kỳ)', () => {
    const a = cls('DHKTPM18ATT');
    const result = planBackfill(snap({ classes: [a], sessions: [ses(a.id, 'HK1 2026-2027'), ses(a.id, 'HK2 2026-2027')] }));
    expect(codes(result)).toEqual(['CLASS_SEMESTER_CONFLICT']);
  });

  it('tên lớp không thành mã danh nghĩa và không có lệnh gộp → CLASS_CODE_UNMAPPABLE, nêu tên lớp', () => {
    const odd = cls('Hệ Quản Trị Dữ Liệu MongoDB');
    const result = planBackfill(snap({ classes: [odd], sessions: [ses(odd.id, 'HK1 2026-2027')] }));
    expect(codes(result)).toEqual(['CLASS_CODE_UNMAPPABLE']);
    expect(result.problems[0].message).toContain('Hệ Quản Trị Dữ Liệu MongoDB');
  });

  it('tên lớp viết thường được chuẩn hoá thành mã HOA (dhktpm18att → DHKTPM18ATT)', () => {
    const a = cls(' dhktpm18att ');
    const { plan, problems } = planBackfill(snap({ classes: [a], sessions: [ses(a.id, 'HK1 2026-2027')] }));
    expect(problems).toEqual([]);
    expect(plan.classAssignments[0].code).toBe('DHKTPM18ATT');
  });

  it('tên phòng rỗng hoặc quá 100 ký tự → ROOM_NAME_INVALID', () => {
    const a = cls('DHKTPM18ATT');
    const result = planBackfill(snap({ classes: [a], sessions: [ses(a.id, 'HK1 2026-2027', '   '), ses(a.id, 'HK1 2026-2027', 'P'.repeat(101))] }));
    expect(codes(result)).toEqual(['ROOM_NAME_INVALID', 'ROOM_NAME_INVALID']);
  });

  it('một MSSV có hai tên → STUDENT_NAME_CONFLICT; MSSV sai khuôn → STUDENT_MSSV_INVALID; tên trống → STUDENT_NAME_BLANK', () => {
    const a = cls('DHKTPM18ATT');
    const b = cls('DHKTPM18BTT');
    const result = planBackfill(
      snap({
        classes: [a, b],
        sessions: [ses(a.id, 'HK1 2026-2027'), ses(b.id, 'HK1 2026-2027')],
        enrollments: [enr(a.id, '1001', 'Nguyễn An'), enr(b.id, '1001', 'Nguyễn Anh'), enr(a.id, 'a-b', 'X'), enr(a.id, '1003', '  ')],
      }),
    );
    expect(codes(result).sort()).toEqual(['STUDENT_MSSV_INVALID', 'STUDENT_NAME_BLANK', 'STUDENT_NAME_CONFLICT']);
  });

  it('hai lớp trùng (kỳ, mã, nhóm) — cùng tên ở hai giảng viên — → CLASS_KEY_COLLISION', () => {
    const a = cls('DHKTPM18ATT', { id: 'c-1' });
    const b = cls('DHKTPM18ATT', { id: 'c-2', teacherId: 't2' });
    const result = planBackfill(snap({ classes: [a, b], sessions: [ses(a.id, 'HK1 2026-2027'), ses(b.id, 'HK1 2026-2027')] }));
    expect(codes(result)).toEqual(['CLASS_KEY_COLLISION']);
  });

  describe('gộp lớp', () => {
    const into = cls('DHKTPM18ATT');
    const from = cls('Lớp MongoDB');
    const base = { classes: [into, from], sessions: [ses(into.id, 'HK1 2026-2027')], enrollments: [enr(into.id, '1001'), enr(from.id, '1001')] };
    const merge = { merges: [{ from: 'Lớp MongoDB', into: 'DHKTPM18ATT' }] };

    it('lớp đích không tồn tại → MERGE_CLASS_MISSING', () => {
      expect(codes(planBackfill(snap(base), { merges: [{ from: 'Lớp MongoDB', into: 'KHONG-CO' }] }))).toContain('MERGE_CLASS_MISSING');
    });

    it('khác giảng viên → MERGE_TEACHER_MISMATCH', () => {
      const other = cls('Lớp MongoDB', { teacherId: 't2' });
      expect(codes(planBackfill(snap({ ...base, classes: [into, other] }), merge))).toContain('MERGE_TEACHER_MISMATCH');
    });

    it('lớp nguồn có sinh viên chưa ở lớp đích → MERGE_STUDENT_NOT_IN_TARGET (gộp sẽ làm mất họ)', () => {
      const result = planBackfill(snap({ ...base, enrollments: [enr(into.id, '1001'), enr(from.id, '1001'), enr(from.id, '9999')] }), merge);
      expect(codes(result)).toContain('MERGE_STUDENT_NOT_IN_TARGET');
      expect(result.problems.find((p) => p.code === 'MERGE_STUDENT_NOT_IN_TARGET')?.message).toContain('9999');
    });

    it('hai lớp cùng tên (hai giảng viên) làm tên không chỉ ra MỘT lớp → MERGE_CLASS_AMBIGUOUS', () => {
      const twin = cls('DHKTPM18ATT', { id: 'c-twin', teacherId: 't2' });
      expect(codes(planBackfill(snap({ ...base, classes: [into, from, twin] }), merge))).toContain('MERGE_CLASS_AMBIGUOUS');
    });

    it('chuỗi gộp A→B, B→C → MERGE_CHAIN (không hỗ trợ)', () => {
      const c = cls('LOP-C');
      // Lớp C có đủ sinh viên của B, để lệnh gộp thứ hai qua được kiểm tra sinh viên và chỉ còn lại vấn đề chuỗi.
      const result = planBackfill(snap({ ...base, classes: [into, from, c], enrollments: [...base.enrollments, enr(c.id, '1001')] }), {
        merges: [{ from: 'Lớp MongoDB', into: 'DHKTPM18ATT' }, { from: 'DHKTPM18ATT', into: 'LOP-C' }],
      });
      expect(codes(result)).toContain('MERGE_CHAIN');
    });

    it('tên KHÁC của cùng một MSSV ở lớp BỊ GỘP không gây STUDENT_NAME_CONFLICT — lớp đó sắp bị xoá, tên ở lớp đích mới là tên được giữ', () => {
      // Nếu enrollment của lớp nguồn vẫn được đếm, hai cách viết tên một sinh viên làm backfill dừng vì một lớp mà chính lệnh gộp sắp xoá.
      const result = planBackfill(snap({ ...base, enrollments: [enr(into.id, '1001', 'Nguyễn An'), enr(from.id, '1001', 'Nguyen An')] }), merge);
      expect(result.problems).toEqual([]);
      expect(result.plan.students).toEqual([{ mssv: '1001', fullName: 'Nguyễn An' }]);
    });

    it('Review Focus 2: lớp nguồn đã mất (đã gộp ở lần chạy trước) → bỏ qua lặng lẽ, không phải vấn đề', () => {
      const done = planBackfill(snap({ classes: [into], sessions: base.sessions, enrollments: [enr(into.id, '1001')] }), merge);
      expect(done.problems.filter((p) => p.code.startsWith('MERGE'))).toEqual([]);
      expect(done.plan.merges).toEqual([]);
    });
  });
});

describe('planBackfill — chạy lại và không ghi đè (Review Focus 2)', () => {
  const a = cls('DHKTPM18ATT');
  const post = snap({
    classes: [{ ...a, semesterId: 'sem-1', administrativeClassId: 'ac-1' }],
    sessions: [ses(a.id, 'HK1 2026-2027', 'Phòng máy A1', { roomId: 'room-1' })],
    enrollments: [enr(a.id, '1001')],
    semesters: [{ id: 'sem-1', academicYearStart: 2026, term: 1 }],
    rooms: [{ id: 'room-1', name: 'Phòng máy A1' }],
    administrativeClasses: [{ id: 'ac-1', code: 'DHKTPM18ATT' }],
    students: [{ mssv: '1001' }],
  });

  it('dữ liệu đã ở hình dạng đích → kế hoạch RỖNG', () => {
    const { plan, problems } = planBackfill(post);
    expect(problems).toEqual([]);
    expect(isEmptyPlan(plan)).toBe(true);
  });

  it('lớp đã có học kỳ/mã (admin đã sửa) KHÔNG bị gán lại, dù tên lớp và chuỗi phiên nói điều khác', () => {
    const edited = snap({ ...post, classes: [{ ...post.classes[0], semesterId: 'sem-2' }], semesters: [{ id: 'sem-2', academicYearStart: 2027, term: 2 }, ...post.semesters] });
    const { plan } = planBackfill(edited);
    expect(plan.classAssignments).toEqual([]);
  });

  it('sinh viên đã có trong `student` không bị ghi đè tên, dù enrollment mang tên khác', () => {
    const { plan } = planBackfill(snap({ ...post, enrollments: [enr(a.id, '1001', 'TÊN KHÁC')] }));
    expect(plan.students).toEqual([]);
  });

  it('phòng đã có (khác hoa-thường) không tạo lại, nhưng phiên chưa có room_id vẫn được gắn', () => {
    const { plan } = planBackfill(snap({ ...post, sessions: [ses(a.id, 'HK1 2026-2027', 'PHÒNG MÁY A1')] }));
    expect(plan.rooms).toEqual([]);
    expect(plan.roomAssignments).toHaveLength(1);
  });

  it('một kế hoạch lập trên dữ liệu MỚI CHEN VÀO (phiên tạo bởi code cũ trong khoảng chờ) chỉ chứa phần mới', () => {
    const late = ses(a.id, 'HK1 2026-2027', 'Phòng mới trong lúc chờ');
    const { plan } = planBackfill(snap({ ...post, sessions: [...post.sessions, late] }));
    expect(plan.rooms).toEqual([{ name: 'Phòng mới trong lúc chờ', isActive: true }]);
    expect(plan.roomAssignments).toEqual([{ name: 'Phòng mới trong lúc chờ', sessionIds: [late.id] }]);
    expect(plan.classAssignments).toEqual([]);
  });
});

describe('scopeSnapshot (cho test/diễn tập có phạm vi)', () => {
  it('chỉ giữ lớp được liệt kê cùng phiên và enrollment của chúng', () => {
    const a = cls('AAAA1');
    const b = cls('BBBB1');
    const scoped = scopeSnapshot(
      snap({ classes: [a, b], sessions: [ses(a.id, 'x'), ses(b.id, 'x')], enrollments: [enr(a.id, '1001'), enr(b.id, '1002')] }),
      [a.id],
    );
    expect(scoped.classes.map((c) => c.id)).toEqual([a.id]);
    expect(scoped.sessions).toHaveLength(1);
    expect(scoped.enrollments).toHaveLength(1);
  });

  it('không có phạm vi → nguyên ảnh chụp', () => {
    const all = snap({ classes: [cls('AAAA1')] });
    expect(scopeSnapshot(all, undefined)).toBe(all);
  });
});
