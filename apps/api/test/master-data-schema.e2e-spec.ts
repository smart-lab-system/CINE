import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { createTestAccount } from './helpers/create-account';
import { freshTestYear, purgeTestSemesters, randomTag, semesterDates } from './helpers/master-data';
import { seedClass, seedExamSession } from './helpers/seed';

/**
 * Bất biến của dữ liệu nền phải đúng KỂ CẢ khi ai đó ghi thẳng SQL — đó là lý do
 * chúng là ràng buộc/trigger chứ không phải kiểm tra trong service (spec §2.1,
 * §2.3, §2.4). Mọi ca ở đây bỏ qua service hoàn toàn.
 */
describe('Master data schema (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let teacherA: string;
  let teacherB: string;

  const createdSessions: string[] = [];
  const createdClasses: string[] = [];
  const createdRooms: string[] = [];
  const createdAdminClasses: string[] = [];

  async function expectDbError(promise: Promise<unknown>, code: string) {
    await expect(promise).rejects.toMatchObject({ code });
  }

  async function newSemester(term: 1 | 2 | 3 = 1, year?: number): Promise<{ id: string; year: number }> {
    const y = year ?? (await freshTestYear(ds));
    const { startDate, endDate } = semesterDates(y, term);
    const [row] = await ds.query(
      `INSERT INTO examcollect.semester (academic_year_start, term, start_date, end_date)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [y, term, startDate, endDate],
    );
    return { id: row.id, year: y };
  }

  async function newAdminClass(code = `ZZ${randomTag()}`): Promise<string> {
    const [row] = await ds.query(
      `INSERT INTO examcollect.administrative_class (code) VALUES ($1) RETURNING id`,
      [code],
    );
    createdAdminClasses.push(row.id);
    return row.id;
  }

  async function newRoom(name = `Phong ZZ${randomTag()}`): Promise<string> {
    const [row] = await ds.query(`INSERT INTO examcollect.room (name) VALUES ($1) RETURNING id`, [name]);
    createdRooms.push(row.id);
    return row.id;
  }

  async function newClass(teacherId: string, extra: { semesterId?: string; administrativeClassId?: string; groupName?: string } = {}) {
    const klass = await seedClass(ds, { teacherId, ...extra });
    createdClasses.push(klass.id);
    return klass;
  }

  async function newSession(opts: {
    teacherId: string;
    classId: string;
    start: Date;
    end: Date;
    roomId?: string;
    roomName?: string;
    status?: 'active' | 'collecting' | 'completed' | 'cancelled';
  }) {
    const session = await seedExamSession(ds, {
      teacherId: opts.teacherId,
      classId: opts.classId,
      startTime: opts.start,
      endTime: opts.end,
      roomId: opts.roomId,
      roomName: opts.roomName,
      status: opts.status ?? 'active',
    });
    createdSessions.push(session.id);
    return session;
  }

  const hour = 3_600_000;
  const day = 24 * hour;
  /** Một khung giờ trong tương lai xa, riêng cho từng ca, để các ca không đụng nhau. */
  let windowCursor = 0;
  function window(hours = 2) {
    windowCursor += 1;
    const start = new Date(Date.now() + (400 + windowCursor * 3) * day);
    return { start, end: new Date(start.getTime() + hours * hour) };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    ds = app.get(DataSource);
    teacherA = await createTestAccount(ds, { email: `mdschema_a_${randomTag()}@example.com`, password: 'correct-horse-battery', role: 'teacher' });
    teacherB = await createTestAccount(ds, { email: `mdschema_b_${randomTag()}@example.com`, password: 'correct-horse-battery', role: 'teacher' });
  });

  afterAll(async () => {
    // Dọn theo thứ tự FK; lỗi dọn không được làm đỏ một test đã xanh.
    const tryDelete = async (sql: string, ids: string[]) => {
      if (ids.length === 0) return;
      try {
        await ds.query(sql, [ids]);
      } catch {
        /* giữ lại: có thể còn tham chiếu từ test khác */
      }
    };
    await tryDelete(`DELETE FROM examcollect.exam_session WHERE id = ANY($1)`, createdSessions);
    await tryDelete(`DELETE FROM examcollect.class WHERE id = ANY($1)`, createdClasses);
    await tryDelete(`DELETE FROM examcollect.administrative_class WHERE id = ANY($1)`, createdAdminClasses);
    await tryDelete(`DELETE FROM examcollect.room WHERE id = ANY($1)`, createdRooms);
    try {
      await purgeTestSemesters(ds);
    } finally {
      // Phải đóng app dù dọn lỗi: nếu không Redis/BullMQ giữ tiến trình jest sống mãi
      // (lần RED đầu tiên, khi bảng `semester` chưa tồn tại, treo 5 phút vì chính lỗi này).
      await app.close();
    }
  });

  describe('semester', () => {
    it('T-MD-7: hai học kỳ chồng ngày bị DB từ chối (23P01); hai kỳ liền kề thì được', async () => {
      const year = await freshTestYear(ds);
      await newSemester(1, year);
      // Cùng khoảng ngày với kỳ 1 nhưng ghi là kỳ 2 của cùng năm.
      const { startDate, endDate } = semesterDates(year, 1);
      await expectDbError(
        ds.query(
          `INSERT INTO examcollect.semester (academic_year_start, term, start_date, end_date) VALUES ($1, 2, $2, $3)`,
          [year, startDate, endDate],
        ),
        '23P01',
      );
      // Kỳ 2 thật sự bắt đầu ngay sau khi kỳ 1 kết thúc: liền kề, không chồng.
      await newSemester(2, year);
    });

    it('một (năm học, kỳ) chỉ có một dòng (23505)', async () => {
      const year = await freshTestYear(ds);
      await newSemester(1, year);
      // Ngày TRONG cửa sổ của năm học và KHÔNG chồng kỳ 1 (khoảng của kỳ 2), để chỉ còn khoá duy nhất (năm, kỳ) bị vi phạm.
      const other = semesterDates(year, 2);
      await expectDbError(
        ds.query(
          `INSERT INTO examcollect.semester (academic_year_start, term, start_date, end_date)
           VALUES ($1, 1, $2, $3)`,
          [year, other.startDate, other.endDate],
        ),
        '23505',
      );
    });

    it('kỳ chỉ 1–3, ngày kết thúc không trước ngày bắt đầu, năm 2000–2999 (23514)', async () => {
      const year = await freshTestYear(ds);
      await expectDbError(
        ds.query(`INSERT INTO examcollect.semester (academic_year_start, term, start_date, end_date) VALUES ($1, 4, '2901-01-01', '2901-02-01')`, [year]),
        '23514',
      );
      await expectDbError(
        ds.query(`INSERT INTO examcollect.semester (academic_year_start, term, start_date, end_date) VALUES ($1, 1, '2902-02-01', '2902-01-01')`, [year]),
        '23514',
      );
      await expectDbError(
        ds.query(`INSERT INTO examcollect.semester (academic_year_start, term, start_date, end_date) VALUES (3000, 1, '2903-01-01', '2903-02-01')`),
        '23514',
      );
    });

    it('ngày của học kỳ phải nằm trong cửa sổ của năm học 01/06 → 31/10 năm sau: biên trong được, lệch năm hoặc nhầm chữ số thì 23514', async () => {
      const year = await freshTestYear(ds);
      const insert = (term: number, start: string, end: string) =>
        ds.query(
          `INSERT INTO examcollect.semester (academic_year_start, term, start_date, end_date) VALUES ($1, $2, $3, $4) RETURNING id`,
          [year, term, start, end],
        );
      await expectDbError(insert(1, `${year + 5}-09-01`, `${year + 6}-01-31`), '23514'); // nhầm chữ số của năm
      await expectDbError(insert(1, `${year - 1}-09-01`, `${year}-01-31`), '23514'); // ngày của năm học trước
      await expectDbError(insert(1, `${year + 1}-09-01`, `${year + 2}-01-31`), '23514'); // lệch một năm: kết thúc ngoài cửa sổ
      await expectDbError(insert(1, `${year}-05-31`, `${year}-12-31`), '23514'); // bắt đầu trước 01/06
      await expectDbError(insert(1, `${year}-09-01`, `${year + 1}-11-01`), '23514'); // kết thúc sau 31/10
      // Đúng hai biên. Xoá ngay: một học kỳ trải dài 17 tháng như thế chồng ngày với kỳ 1–2 của năm học KẾ TIẾP,
      // và `freshTestYear` cấp đúng năm đó cho ca sau (23P01 ở một ca không liên quan).
      const [edge] = await insert(3, `${year}-06-01`, `${year + 1}-10-31`);
      await ds.query(`DELETE FROM examcollect.semester WHERE id = $1`, [edge.id]);
    });

    it('T-MD-6: không đổi được năm học hay kỳ khi đã có lớp; đổi ngày thì được', async () => {
      const sem = await newSemester(1);
      const adm = await newAdminClass();
      await newClass(teacherA, { semesterId: sem.id, administrativeClassId: adm });

      await expectDbError(ds.query(`UPDATE examcollect.semester SET term = 2 WHERE id = $1`, [sem.id]), '23503');
      await expectDbError(
        ds.query(`UPDATE examcollect.semester SET academic_year_start = academic_year_start + 1 WHERE id = $1`, [sem.id]),
        '23503',
      );
      // Ngày là thứ sửa được.
      await ds.query(`UPDATE examcollect.semester SET end_date = end_date - 1 WHERE id = $1`, [sem.id]);
    });

    it('học kỳ chưa có lớp thì đổi kỳ thoải mái', async () => {
      const sem = await newSemester(1);
      await ds.query(`UPDATE examcollect.semester SET term = 2 WHERE id = $1`, [sem.id]);
    });

    it('hàm SQL semester_label cho đúng nhãn mà code TypeScript dùng', async () => {
      const [row] = await ds.query(`SELECT examcollect.semester_label(2026, 1::smallint) AS label`);
      expect(row.label).toBe('HK1 2026-2027');
    });
  });

  describe('administrative_class', () => {
    it('T-MD-3 (tầng DB): mã phải là chữ HOA và số, 3–30 ký tự (23514)', async () => {
      await expectDbError(ds.query(`INSERT INTO examcollect.administrative_class (code) VALUES ('dhktpm18a')`), '23514');
      await expectDbError(ds.query(`INSERT INTO examcollect.administrative_class (code) VALUES ('DHK TPM')`), '23514');
      await expectDbError(ds.query(`INSERT INTO examcollect.administrative_class (code) VALUES ('AB')`), '23514');
      await expectDbError(ds.query(`INSERT INTO examcollect.administrative_class (code) VALUES ('${'A'.repeat(31)}')`), '23514');
    });

    it('mã trùng bị chặn (23505)', async () => {
      const code = `ZZ${randomTag()}`;
      await newAdminClass(code);
      await expectDbError(ds.query(`INSERT INTO examcollect.administrative_class (code) VALUES ($1)`, [code]), '23505');
    });
  });

  describe('room', () => {
    it('tên không có khoảng trắng đầu/cuối hay hai khoảng trắng liền nhau (23514)', async () => {
      await expectDbError(ds.query(`INSERT INTO examcollect.room (name) VALUES (' Phong A')`), '23514');
      await expectDbError(ds.query(`INSERT INTO examcollect.room (name) VALUES ('Phong  A')`), '23514');
      await expectDbError(ds.query(`INSERT INTO examcollect.room (name) VALUES ('')`), '23514');
    });

    it('tên trùng không phân biệt hoa-thường là một phòng (23505)', async () => {
      const tag = randomTag();
      await newRoom(`Phong zz${tag}`);
      await expectDbError(ds.query(`INSERT INTO examcollect.room (name) VALUES ($1)`, [`PHONG ZZ${tag}`]), '23505');
    });

    it('sức chứa 1–1000 hoặc trống (23514)', async () => {
      await expectDbError(ds.query(`INSERT INTO examcollect.room (name, capacity) VALUES ($1, 0)`, [`Phong ZZ${randomTag()}`]), '23514');
      await expectDbError(ds.query(`INSERT INTO examcollect.room (name, capacity) VALUES ($1, 1001)`, [`Phong ZZ${randomTag()}`]), '23514');
      await ds.query(`INSERT INTO examcollect.room (name, capacity) VALUES ($1, 1) RETURNING id`, [`Phong ZZ${randomTag()}`]).then((r) => createdRooms.push(r[0].id));
    });

    it('mặc định đang hoạt động', async () => {
      const id = await newRoom();
      const [row] = await ds.query(`SELECT is_active FROM examcollect.room WHERE id = $1`, [id]);
      expect(row.is_active).toBe(true);
    });
  });

  describe('student', () => {
    it('MSSV 4–20 ký tự chữ/số, duy nhất không phân biệt hoa-thường', async () => {
      const mssv = `SV${randomTag(8)}`;
      await ds.query(`INSERT INTO examcollect.student (mssv, full_name) VALUES ($1, 'Nguyễn Văn A')`, [mssv]);
      await expectDbError(ds.query(`INSERT INTO examcollect.student (mssv, full_name) VALUES ($1, 'B')`, [mssv.toLowerCase()]), '23505');
      await expectDbError(ds.query(`INSERT INTO examcollect.student (mssv, full_name) VALUES ('AB', 'B')`), '23514');
      await expectDbError(ds.query(`INSERT INTO examcollect.student (mssv, full_name) VALUES ($1, '   ')`, [`SV${randomTag(8)}`]), '23514');
      await ds.query(`DELETE FROM examcollect.student WHERE mssv = $1`, [mssv]);
    });
  });

  describe('class', () => {
    it('T-MD-1: tham chiếu học kỳ hoặc mã lớp danh nghĩa không tồn tại bị DB từ chối (23503)', async () => {
      const ghost = '00000000-0000-4000-8000-0000000000aa';
      // Qua helper seed (không phải SQL thô — guard của plan A cấm SQL thô dựng lớp): helper
      // chuyển nguyên id ma xuống DB, và DB là bên từ chối.
      await expectDbError(seedClass(ds, { teacherId: teacherA, semesterId: ghost }), '23503');
      await expectDbError(seedClass(ds, { teacherId: teacherA, administrativeClassId: ghost }), '23503');
    });

    it('T-MD-2: hai lớp cùng (kỳ, mã, nhóm) bị chặn; khác nhóm thì được; nhóm mặc định là chuỗi rỗng, không phải NULL', async () => {
      const sem = await newSemester(1);
      const adm = await newAdminClass();
      const first = await newClass(teacherA, { semesterId: sem.id, administrativeClassId: adm });

      const [row] = await ds.query(`SELECT group_name FROM examcollect.class WHERE id = $1`, [first.id]);
      expect(row.group_name).toBe('');

      // Lớp thứ hai cùng (kỳ, mã, nhóm ''): giảng viên khác để không dính khoá cũ (teacher, môn, tên).
      await expectDbError(
        seedClass(ds, { teacherId: teacherB, semesterId: sem.id, administrativeClassId: adm, groupName: '' }),
        '23505',
      );
      await newClass(teacherB, { semesterId: sem.id, administrativeClassId: adm, groupName: 'Nhóm 1' });
    });

    it('T-MD-2b (reviewer cụm 1, I3): hoa-thường của tên nhóm không lách được khoá duy nhất; tên nhóm không có khoảng trắng thừa hay ký tự điều khiển', async () => {
      const sem = await newSemester(1);
      const adm = await newAdminClass();
      await newClass(teacherA, { semesterId: sem.id, administrativeClassId: adm, groupName: 'Nhóm 1' });

      // "Nhóm 1" và "nhóm 1" hiện ra như CÙNG MỘT nhóm: cùng (kỳ, mã) thì chỉ được một.
      await expectDbError(
        seedClass(ds, { teacherId: teacherB, semesterId: sem.id, administrativeClassId: adm, groupName: 'nhóm 1' }),
        '23505',
      );
      const other = await newAdminClass();
      for (const bad of ['Nhóm  1', 'Nhóm 1\t', 'Nhóm\n1', ' Nhóm 1']) {
        await expectDbError(
          seedClass(ds, { teacherId: teacherB, semesterId: sem.id, administrativeClassId: other, groupName: bad }),
          '23514',
        );
      }
    });

    it('T-MD-5: không đổi được học kỳ của lớp đã có phiên; lớp chưa có phiên thì đổi được', async () => {
      const s1 = await newSemester(1);
      const s2 = await newSemester(1);
      const adm = await newAdminClass();
      const withSession = await newClass(teacherA, { semesterId: s1.id, administrativeClassId: adm });
      const { start, end } = window();
      await newSession({ teacherId: teacherA, classId: withSession.id, start, end });

      await expectDbError(
        ds.query(`UPDATE examcollect.class SET semester_id = $1 WHERE id = $2`, [s2.id, withSession.id]),
        '23503',
      );

      const free = await newClass(teacherA, { semesterId: s1.id, administrativeClassId: await newAdminClass() });
      await ds.query(`UPDATE examcollect.class SET semester_id = $1 WHERE id = $2`, [s2.id, free.id]);
    });

    it('gán học kỳ LẦN ĐẦU cho lớp đã có phiên (NULL -> giá trị) không phải là "đổi" (Review Focus 2)', async () => {
      const sem = await newSemester(1);
      const legacy = await newClass(teacherA); // chưa có học kỳ, như dữ liệu cũ
      const { start, end } = window();
      await newSession({ teacherId: teacherA, classId: legacy.id, start, end });

      await ds.query(`UPDATE examcollect.class SET semester_id = $1 WHERE id = $2`, [sem.id, legacy.id]);
      const [row] = await ds.query(`SELECT semester_id FROM examcollect.class WHERE id = $1`, [legacy.id]);
      expect(row.semester_id).toBe(sem.id);
    });
  });

  describe('exam_session: chống trùng phòng', () => {
    /** Hai giảng viên và hai lớp khác nhau, để chỉ còn ràng buộc phòng có thể phản đối. */
    async function twoSides() {
      const a = await newClass(teacherA);
      const b = await newClass(teacherB);
      return { a, b };
    }

    it('T-ROOM-1: hai phiên chưa kết thúc cùng room_id, giờ chồng nhau -> 23P01', async () => {
      const room = await newRoom();
      const { a, b } = await twoSides();
      const { start, end } = window();
      await newSession({ teacherId: teacherA, classId: a.id, start, end, roomId: room });
      await expectDbError(
        newSession({ teacherId: teacherB, classId: b.id, start: new Date(start.getTime() + hour), end: new Date(end.getTime() + hour), roomId: room }),
        '23P01',
      );
    });

    it('khác phòng cùng giờ thì được', async () => {
      const r1 = await newRoom();
      const r2 = await newRoom();
      const { a, b } = await twoSides();
      const { start, end } = window();
      await newSession({ teacherId: teacherA, classId: a.id, start, end, roomId: r1 });
      await newSession({ teacherId: teacherB, classId: b.id, start, end, roomId: r2 });
    });

    it('cùng phòng, phiên sau bắt đầu đúng lúc phiên trước kết thúc thì được (khoảng nửa mở "[)")', async () => {
      const room = await newRoom();
      // Hai GIẢNG VIÊN khác nhau: cùng một giảng viên còn bị luật giãn cách 30 phút chặn,
      // và ca này chỉ nói về phòng.
      const { a, b } = await twoSides();
      const { start, end } = window();
      await newSession({ teacherId: teacherA, classId: a.id, start, end, roomId: room });
      await newSession({ teacherId: teacherB, classId: b.id, start: end, end: new Date(end.getTime() + 2 * hour), roomId: room });
    });

    it('phiên đã collecting/completed/cancelled không giữ phòng', async () => {
      const room = await newRoom();
      const b = await newClass(teacherB);
      const { start, end } = window();
      for (const status of ['collecting', 'completed', 'cancelled'] as const) {
        const done = await newClass(teacherA);
        await newSession({ teacherId: teacherA, classId: done.id, start, end, roomId: room, status });
      }
      // Ba phiên đã "xong" cùng phòng, cùng giờ không cản phiên đang hoạt động này.
      await newSession({ teacherId: teacherB, classId: b.id, start, end, roomId: room });
    });

    it('ràng buộc cũ theo TÊN vẫn bảo vệ dòng chưa có room_id (code cũ còn chạy giữa các bước cutover)', async () => {
      const { a, b } = await twoSides();
      const { start, end } = window();
      const roomName = `PHONG CU ${randomTag()}`;
      await newSession({ teacherId: teacherA, classId: a.id, start, end, roomName });
      await expectDbError(
        newSession({ teacherId: teacherB, classId: b.id, start, end, roomName }),
        '23P01',
      );
    });

    it('ràng buộc cũ theo tên CHỈ áp cho dòng chưa có room_id: cùng chuỗi tên nhưng đã có room_id thì không bị nó chặn', async () => {
      const room = await newRoom();
      const other = await newRoom();
      const { a, b } = await twoSides();
      const { start, end } = window();
      const sameSnapshot = `Ban chup ${randomTag()}`;
      // Hai phòng THẬT KHÁC NHAU cùng mang một bản chụp tên (một phòng từng đổi tên): không được coi là đặt trùng.
      await newSession({ teacherId: teacherA, classId: a.id, start, end, roomId: room, roomName: sameSnapshot });
      await newSession({ teacherId: teacherB, classId: b.id, start, end, roomId: other, roomName: sameSnapshot });
    });

    it('phòng đã có phiên không xoá được (FK RESTRICT)', async () => {
      const room = await newRoom();
      const { a } = await twoSides();
      const { start, end } = window();
      await newSession({ teacherId: teacherA, classId: a.id, start, end, roomId: room });
      await expectDbError(ds.query(`DELETE FROM examcollect.room WHERE id = $1`, [room]), '23503');
    });

    it('ràng buộc chống trùng lớp và giãn cách giảng viên không bị mất', async () => {
      const room1 = await newRoom();
      const room2 = await newRoom();
      const a = await newClass(teacherA);
      const { start, end } = window();
      await newSession({ teacherId: teacherA, classId: a.id, start, end, roomId: room1 });
      // Cùng lớp, cùng giờ, phòng khác -> ex_exam_session_class_overlap.
      await expectDbError(
        newSession({ teacherId: teacherB, classId: a.id, start, end, roomId: room2 }),
        '23P01',
      );
      // Cùng giảng viên cách nhau 10 phút -> ex_exam_session_teacher_gap.
      const c = await newClass(teacherA);
      await expectDbError(
        newSession({ teacherId: teacherA, classId: c.id, start: new Date(end.getTime() + 10 * 60_000), end: new Date(end.getTime() + 70 * 60_000), roomId: room2 }),
        '23P01',
      );
    });
  });

  describe('class_label (view)', () => {
    it('nhãn = mã, hoặc "mã – nhóm"; kèm kỳ khi cần phân biệt', async () => {
      const sem = await newSemester(1);
      const code = `ZZ${randomTag()}`;
      const adm = await newAdminClass(code);
      const plain = await newClass(teacherA, { semesterId: sem.id, administrativeClassId: adm });
      const grouped = await newClass(teacherA, { semesterId: sem.id, administrativeClassId: adm, groupName: 'Nhóm 1' });

      const rows = await ds.query(
        `SELECT class_id, label, label_with_semester FROM examcollect.class_label WHERE class_id = ANY($1)`,
        [[plain.id, grouped.id]],
      );
      const byId = new Map(rows.map((r: { class_id: string }) => [r.class_id, r]));
      const semLabel = `HK1 ${sem.year}-${sem.year + 1}`;
      expect(byId.get(plain.id)).toMatchObject({ label: code, label_with_semester: `${code} · ${semLabel}` });
      expect(byId.get(grouped.id)).toMatchObject({
        label: `${code} – Nhóm 1`,
        label_with_semester: `${code} – Nhóm 1 · ${semLabel}`,
      });
    });

    it('lớp cũ chưa gán mã danh nghĩa rơi về tên cũ, không ra NULL', async () => {
      const legacy = await newClass(teacherA, { groupName: 'Lớp cũ chưa gán' });
      const [row] = await ds.query(`SELECT label, label_with_semester FROM examcollect.class_label WHERE class_id = $1`, [legacy.id]);
      expect(row.label).toBe(legacy.label);
      expect(row.label_with_semester).toBe(legacy.label);
    });
  });

  describe('nới lỏng cho code cũ', () => {
    it('class.name và enrollment.student_name cho phép NULL (code mới không ghi chúng)', async () => {
      const [cls] = await ds.query(
        `SELECT is_nullable FROM information_schema.columns WHERE table_schema = 'examcollect' AND table_name = 'class' AND column_name = 'name'`,
      );
      const [enr] = await ds.query(
        `SELECT is_nullable FROM information_schema.columns WHERE table_schema = 'examcollect' AND table_name = 'enrollment' AND column_name = 'student_name'`,
      );
      expect(cls.is_nullable).toBe('YES');
      expect(enr.is_nullable).toBe('YES');
    });
  });
});
