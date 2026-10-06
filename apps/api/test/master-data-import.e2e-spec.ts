import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { createTestAccount } from './helpers/create-account';
import { semesterLabel } from '../src/common/semester-label';
import { ensureTestSemester, freshTestYear, purgeTestSemesters, randomTag, semesterDates } from './helpers/master-data';
import { seedClass, seedEnrollment, seedExamSession } from './helpers/seed';

/**
 * Import dữ liệu nền (plan E1): học kỳ, phòng, Danh mục lớp danh nghĩa. Phần lớp ở Task 6 (cùng file).
 *
 * Mọi ca dùng hậu tố ngẫu nhiên riêng và các TỪ KHÁC NHAU trong tên, vì luật "gần giống" so với cả bảng chung: hai tên
 * `… A` và `… AB` của hai test khác nhau sẽ cảnh báo nhau ở những ca không hề nói về điều đó.
 */
describe('Import dữ liệu nền (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let adminToken: string;
  let adminId: string;
  let teacherToken: string;
  // Dùng cho nhóm lớp (Task 6).
  const teacherIds: string[] = [];
  const mssvs: string[] = [];

  const RUN = `IMPT${randomTag(6)}`;
  const PASSWORD = 'correct-horse-battery';
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function login(email: string): Promise<string> {
    const response = await request(app.getHttpServer()).post('/auth/login').send({ email, password: PASSWORD });
    return response.body.accessToken as string;
  }

  function importTo(
    path: string,
    rows: object[],
    options: { dryRun: boolean; confirmSimilar?: boolean },
    token = adminToken,
  ) {
    return request(app.getHttpServer()).post(path).set(auth(token)).send({ rows, ...options });
  }

  async function auditCount(action: string): Promise<number> {
    const [row] = await ds.query(
      `SELECT count(*)::int AS n FROM examcollect.audit_log WHERE action = $1 AND actor_id = $2`,
      [action, adminId],
    );
    return row.n as number;
  }

  async function lastAudit(action: string) {
    const [row] = await ds.query(
      `SELECT target_type, target_id, old_value, new_value FROM examcollect.audit_log
        WHERE action = $1 AND actor_id = $2 ORDER BY occurred_at DESC LIMIT 1`,
      [action, adminId],
    );
    return row;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();
    ds = app.get(DataSource);

    const adminEmail = `imp_admin_${RUN}@example.com`;
    adminId = await createTestAccount(ds, { email: adminEmail, password: PASSWORD, role: 'admin' });
    adminToken = await login(adminEmail);
    const teacherEmail = `imp_teacher_${RUN}@example.com`;
    await createTestAccount(ds, { email: teacherEmail, password: PASSWORD, role: 'teacher' });
    teacherToken = await login(teacherEmail);
  });

  afterAll(async () => {
    try {
      if (teacherIds.length) {
        await ds.query(`DELETE FROM examcollect.exam_session WHERE teacher_id = ANY($1::uuid[])`, [teacherIds]).catch(() => undefined);
        await ds.query(`DELETE FROM examcollect.enrollment WHERE home_teacher_id = ANY($1::uuid[])`, [teacherIds]).catch(() => undefined);
        await ds.query(`DELETE FROM examcollect.class WHERE teacher_id = ANY($1::uuid[])`, [teacherIds]).catch(() => undefined);
      }
      if (mssvs.length) {
        await ds.query(`DELETE FROM examcollect.student WHERE mssv = ANY($1::text[])`, [mssvs]).catch(() => undefined);
      }
      await ds.query(`DELETE FROM examcollect.room WHERE name::text LIKE $1`, [`${RUN}%`]).catch(() => undefined);
      await ds
        .query(`DELETE FROM examcollect.administrative_class WHERE code::text LIKE $1`, [`${RUN}%`])
        .catch(() => undefined);
      await purgeTestSemesters(ds).catch(() => undefined);
    } finally {
      await app.close();
    }
  });

  describe('chung cho cả bốn route', () => {
    const ROUTES = ['/semesters/import', '/rooms/import', '/administrative-classes/import', '/classes/import'];

    it.each(ROUTES)('%s: không token là 401, giảng viên là 403', async (path) => {
      await request(app.getHttpServer()).post(path).send({ rows: [], dryRun: true }).expect(401);
      await importTo(path, [{ line: 2 }], { dryRun: true }, teacherToken).expect(403);
    });

    it.each(ROUTES)('%s: thiếu dryRun là 400 — một client lỗi không được ghi vì quên cờ (Review Focus)', async (path) => {
      await request(app.getHttpServer())
        .post(path)
        .set(auth(adminToken))
        .send({ rows: [{ line: 2 }] })
        .expect(400);
    });

    it.each(ROUTES)('%s: danh sách rỗng là 400', async (path) => {
      await importTo(path, [], { dryRun: true }).expect(400);
    });

    // Mỗi dòng ở đây HỢP LỆ về hình dạng: nếu không, 400 đến từ việc dòng sai chứ không phải từ trần dòng và ca này xanh
    // vì sai lý do. Ca "đúng bằng trần" là 200 chứng minh điều đó.
    const SHAPE_OK: Record<string, (line: number) => object> = {
      '/semesters/import': (line) => ({ line, academicYear: '2026', term: '1', startDate: '2026-09-01', endDate: '2027-01-31' }),
      '/rooms/import': (line) => ({ line, name: 'x', capacity: '' }),
      '/administrative-classes/import': (line) => ({ line, code: 'ABC' }),
      '/classes/import': (line) => ({ line, semester: '', administrativeClassCode: '', groupName: '', teacherEmail: '' }),
    };
    it.each([
      ['/semesters/import', 20],
      ['/rooms/import', 500],
      ['/administrative-classes/import', 500],
      ['/classes/import', 200],
    ])('%s: đúng trần %d dòng là 200, thêm một dòng là 400', async (path, limit) => {
      const make = (count: number) => Array.from({ length: count }, (_, i) => SHAPE_OK[path](i + 2));
      await importTo(path, make(limit), { dryRun: true }).expect(200);
      await importTo(path, make(limit + 1), { dryRun: true }).expect(400);
    });
  });

  describe('POST /rooms/import', () => {
    const room = (line: number, name: string, capacity = '') => ({ line, name, capacity });
    const roomCount = async () =>
      ((await ds.query(`SELECT count(*)::int AS n FROM examcollect.room WHERE name::text LIKE $1`, [`${RUN}%`]))[0].n as number);
    const find = async (name: string) =>
      (await ds.query(`SELECT id, name::text AS name, capacity, is_active FROM examcollect.room WHERE name = $1`, [name]))[0];

    it('dryRun không ghi gì, kể cả audit', async () => {
      const before = await roomCount();
      const auditBefore = await auditCount('room.import');

      const response = await importTo('/rooms/import', [room(2, `${RUN} Cam`, '40'), room(3, `${RUN} Tim`)], {
        dryRun: true,
      }).expect(200);

      expect(response.body).toMatchObject({
        dryRun: true,
        applied: false,
        counts: { added: 2, updated: 0, unchanged: 0, errors: 0 },
        needsSimilarConfirmation: false,
      });
      expect(response.body.rows.map((r: { status: string }) => r.status)).toEqual(['new', 'new']);
      expect(await roomCount()).toBe(before);
      expect(await auditCount('room.import')).toBe(auditBefore);
    });

    it('T-IMP-3: xem trước và ghi thật cho CÙNG rows và counts; ghi một dòng audit cho cả lô (T-AUD-1)', async () => {
      const rows = [room(2, `${RUN} Vang`, '35'), room(3, `${RUN} Nau`)];
      const auditBefore = await auditCount('room.import');

      const preview = await importTo('/rooms/import', rows, { dryRun: true }).expect(200);
      const real = await importTo('/rooms/import', rows, { dryRun: false }).expect(200);

      expect(real.body.dryRun).toBe(false);
      expect(real.body.applied).toBe(true);
      expect(real.body.rows).toEqual(preview.body.rows);
      expect(real.body.counts).toEqual(preview.body.counts);

      expect(await find(`${RUN} Vang`)).toMatchObject({ capacity: 35, is_active: true });
      expect(await find(`${RUN} Nau`)).toMatchObject({ capacity: null, is_active: true });

      expect(await auditCount('room.import')).toBe(auditBefore + 1);
      const audit = await lastAudit('room.import');
      expect(audit.target_type).toBe('room');
      expect(audit.target_id).toMatch(/^[0-9a-f-]{36}$/);
      expect(audit.new_value).toMatchObject({ added: 2, updated: 0, unchanged: 0 });
      expect(typeof audit.new_value.targetLabel).toBe('string');
    });

    it('một dòng lỗi giữa các dòng tốt: dryRun trả 200 kèm số dòng lỗi; ghi thật là 400 và KHÔNG ghi dòng nào (Review Focus 2)', async () => {
      const rows = [room(2, `${RUN} Xanh`), room(3, `${RUN} Do`, 'abc'), room(4, `${RUN} Luc`)];
      const before = await roomCount();
      const auditBefore = await auditCount('room.import');

      const preview = await importTo('/rooms/import', rows, { dryRun: true }).expect(200);
      expect(preview.body.counts).toMatchObject({ added: 2, errors: 1 });
      expect(preview.body.rows[1]).toMatchObject({ line: 3, status: 'error' });

      const real = await importTo('/rooms/import', rows, { dryRun: false }).expect(400);
      expect(real.body.error).toBe('IMPORT_HAS_ERRORS');
      expect(real.body.preview.rows[1].line).toBe(3);

      expect(await roomCount()).toBe(before);
      expect(await auditCount('room.import')).toBe(auditBefore);
    });

    it('gửi lại cùng một file: toàn "unchanged", applied=false, KHÔNG thêm dòng audit (Review Focus 6)', async () => {
      const rows = [room(2, `${RUN} Hong`, '20')];
      await importTo('/rooms/import', rows, { dryRun: false }).expect(200);
      const auditBefore = await auditCount('room.import');

      const again = await importTo('/rooms/import', rows, { dryRun: false }).expect(200);

      expect(again.body).toMatchObject({ applied: false, counts: { added: 0, updated: 0, unchanged: 1 } });
      expect(await auditCount('room.import')).toBe(auditBefore);
    });

    it('chỉ sửa sức chứa, ô trống không xoá sức chứa, phòng vắng khỏi file còn nguyên (Review Focus 3)', async () => {
      await importTo('/rooms/import', [room(2, `${RUN} Bac`, '40'), room(3, `${RUN} Dong`, '30')], { dryRun: false }).expect(200);

      const update = await importTo('/rooms/import', [room(2, `${RUN} Bac`, '45')], { dryRun: true }).expect(200);
      expect(update.body.rows[0]).toMatchObject({
        status: 'update',
        changes: [{ field: 'capacity', from: '40', to: '45' }],
      });
      await importTo('/rooms/import', [room(2, `${RUN} Bac`, '45')], { dryRun: false }).expect(200);
      expect((await find(`${RUN} Bac`)).capacity).toBe(45);

      // Ô trống: không xoá.
      await importTo('/rooms/import', [room(2, `${RUN} Bac`, '')], { dryRun: false }).expect(200);
      expect((await find(`${RUN} Bac`)).capacity).toBe(45);
      // Phòng không có trong file: còn nguyên, nguyên vẹn sức chứa.
      expect((await find(`${RUN} Dong`)).capacity).toBe(30);
      // Tên khác hoa-thường khớp cùng phòng, không đổi tên.
      await importTo('/rooms/import', [room(2, `${RUN} BAC`.toLowerCase(), '46')], { dryRun: false }).expect(200);
      expect((await find(`${RUN} Bac`)).name).toBe(`${RUN} Bac`);
    });

    it('T-IMP-8: tên gần giống phòng có sẵn — xem trước cảnh báo, ghi thật cần xác nhận, và tạo phòng MỚI (không sửa phòng cũ)', async () => {
      await importTo('/rooms/import', [room(2, `${RUN} Sanh H3.03`, '50')], { dryRun: false }).expect(200);
      const rows = [room(2, `${RUN} Sanh H303`, '99')];

      const preview = await importTo('/rooms/import', rows, { dryRun: true }).expect(200);
      expect(preview.body.needsSimilarConfirmation).toBe(true);
      expect(preview.body.rows[0].similar).toEqual([
        expect.objectContaining({ name: `${RUN} Sanh H3.03`, reason: 'normalized', source: 'existing' }),
      ]);

      const before = await roomCount();
      const refused = await importTo('/rooms/import', rows, { dryRun: false }).expect(409);
      expect(refused.body.error).toBe('NEAR_DUPLICATE');
      expect(refused.body.preview.rows[0].similar).toHaveLength(1);
      expect(await roomCount()).toBe(before);

      await importTo('/rooms/import', rows, { dryRun: false, confirmSimilar: true }).expect(200);
      expect(await roomCount()).toBe(before + 1);
      // Phòng cũ không bị đụng: đổi tên bằng file là một phòng mới, không phải sửa phòng cũ.
      expect(await find(`${RUN} Sanh H3.03`)).toMatchObject({ capacity: 50 });
      expect(await find(`${RUN} Sanh H303`)).toMatchObject({ capacity: 99 });
    });

    it('hai dòng mới giống nhau trong cùng file được cảnh báo; hai phòng thật khác nhau (A1/B1) thì không', async () => {
      const similar = await importTo(
        '/rooms/import',
        [room(2, `${RUN} Kho P.A101`), room(3, `${RUN} Kho P A101`)],
        { dryRun: true },
      ).expect(200);
      expect(similar.body.needsSimilarConfirmation).toBe(true);
      expect(similar.body.rows[0].similar[0]).toMatchObject({ source: 'file', line: 3 });

      const distinct = await importTo(
        '/rooms/import',
        [room(2, `${RUN} May A1`), room(3, `${RUN} May B1`)],
        { dryRun: false },
      ).expect(200);
      expect(distinct.body).toMatchObject({ applied: true, needsSimilarConfirmation: false });
    });

    it('tên chuẩn hoá khi ghi: khoảng trắng thừa được gộp', async () => {
      await importTo('/rooms/import', [room(2, `  ${RUN}   Kem   `)], { dryRun: false }).expect(200);
      expect(await find(`${RUN} Kem`)).toBeDefined();
    });
  });

  describe('POST /administrative-classes/import', () => {
    const code = (line: number, value: string) => ({ line, code: value });
    const codeCount = async () =>
      ((await ds.query(`SELECT count(*)::int AS n FROM examcollect.administrative_class WHERE code::text LIKE $1`, [`${RUN}%`]))[0].n as number);

    it('thêm mã mới (viết hoa), xem trước = ghi, một dòng audit, gửi lại là no-op', async () => {
      const rows = [code(2, `${RUN}ALFA`.toLowerCase()), code(3, `${RUN}BRAVO`)];
      const auditBefore = await auditCount('administrative_class.import');

      const preview = await importTo('/administrative-classes/import', rows, { dryRun: true }).expect(200);
      expect(await codeCount()).toBe(0);
      const real = await importTo('/administrative-classes/import', rows, { dryRun: false }).expect(200);
      expect(real.body.rows).toEqual(preview.body.rows);
      expect(await codeCount()).toBe(2);
      expect(real.body.rows[0].label).toBe(`${RUN}ALFA`);

      expect(await auditCount('administrative_class.import')).toBe(auditBefore + 1);
      expect((await lastAudit('administrative_class.import')).new_value).toMatchObject({ added: 2, unchanged: 0 });

      const again = await importTo('/administrative-classes/import', rows, { dryRun: false }).expect(200);
      expect(again.body).toMatchObject({ applied: false, counts: { added: 0, unchanged: 2 } });
      expect(await auditCount('administrative_class.import')).toBe(auditBefore + 1);
    });

    it('anh em ATT/CTT thật không bị cảnh báo; mã thừa một ký tự bị cảnh báo và cần xác nhận', async () => {
      await importTo('/administrative-classes/import', [code(2, `${RUN}XATT`)], { dryRun: false }).expect(200);

      const sibling = await importTo('/administrative-classes/import', [code(2, `${RUN}XCTT`)], { dryRun: true }).expect(200);
      expect(sibling.body.needsSimilarConfirmation).toBe(false);

      const extra = [code(2, `${RUN}XATTT`)];
      const preview = await importTo('/administrative-classes/import', extra, { dryRun: true }).expect(200);
      expect(preview.body.rows[0].similar).toEqual([
        expect.objectContaining({ name: `${RUN}XATT`, reason: 'insert_delete', source: 'existing' }),
      ]);
      await importTo('/administrative-classes/import', extra, { dryRun: false }).expect(409);
      await importTo('/administrative-classes/import', extra, { dryRun: false, confirmSimilar: true }).expect(200);
    });

    it('một mã sai giữa các mã tốt: không mã nào được ghi', async () => {
      const before = await codeCount();
      const rows = [code(2, `${RUN}OKONE`), code(3, 'DHK-TPM'), code(4, `${RUN}OKTWO`)];
      const response = await importTo('/administrative-classes/import', rows, { dryRun: false }).expect(400);
      expect(response.body.preview.rows[1]).toMatchObject({ line: 3, status: 'error' });
      expect(await codeCount()).toBe(before);
    });
  });

  describe('POST /semesters/import', () => {
    const sem = (line: number, year: number, term: number, startDate: string, endDate: string) => ({
      line,
      academicYear: String(year),
      term: String(term),
      startDate,
      endDate,
    });
    const findSemester = async (year: number, term: number) =>
      (
        await ds.query(
          `SELECT id, to_char(start_date,'YYYY-MM-DD') AS "startDate", to_char(end_date,'YYYY-MM-DD') AS "endDate"
             FROM examcollect.semester WHERE academic_year_start = $1 AND term = $2`,
          [year, term],
        )
      )[0];

    it('thêm hai kỳ: xem trước = ghi, ngày dd/mm/yyyy được hiểu, một dòng audit', async () => {
      const year = await freshTestYear(ds);
      const t1 = semesterDates(year, 1);
      const t2 = semesterDates(year, 2);
      const [y2, m2, d2] = t2.startDate.split('-');
      const rows = [
        sem(2, year, 1, t1.startDate, t1.endDate),
        sem(3, year, 2, `${d2}/${m2}/${y2}`, t2.endDate), // dd/mm/yyyy
      ];
      const auditBefore = await auditCount('semester.import');

      const preview = await importTo('/semesters/import', rows, { dryRun: true }).expect(200);
      expect(await findSemester(year, 1)).toBeUndefined();
      const real = await importTo('/semesters/import', rows, { dryRun: false }).expect(200);

      expect(real.body.rows).toEqual(preview.body.rows);
      expect(real.body.rows[0].label).toBe(`HK1 ${year}-${year + 1}`);
      expect(await findSemester(year, 2)).toMatchObject({ startDate: t2.startDate, endDate: t2.endDate });
      expect(await auditCount('semester.import')).toBe(auditBefore + 1);
      expect((await lastAudit('semester.import')).new_value).toMatchObject({ added: 2, updated: 0, unchanged: 0 });
    });

    it('sửa ngày kỳ có sẵn: hiện từ → đến, chỉ ngày đổi; gửi lại là no-op', async () => {
      const year = await freshTestYear(ds);
      const t1 = semesterDates(year, 1);
      await importTo('/semesters/import', [sem(2, year, 1, t1.startDate, t1.endDate)], { dryRun: false }).expect(200);

      const shorter = `${year + 1}-01-15`;
      const rows = [sem(2, year, 1, t1.startDate, shorter)];
      const preview = await importTo('/semesters/import', rows, { dryRun: true }).expect(200);
      expect(preview.body.rows[0]).toMatchObject({
        status: 'update',
        changes: [expect.objectContaining({ field: 'endDate', to: `15/01/${year + 1}` })],
      });
      await importTo('/semesters/import', rows, { dryRun: false }).expect(200);
      expect((await findSemester(year, 1)).endDate).toBe(shorter);

      const again = await importTo('/semesters/import', rows, { dryRun: false }).expect(200);
      expect(again.body.applied).toBe(false);
    });

    it('chồng ngày với kỳ có sẵn: lỗi nêu nhãn kỳ đó; ghi thật là 400 và không ghi gì', async () => {
      const year = await freshTestYear(ds);
      const t1 = semesterDates(year, 1);
      await importTo('/semesters/import', [sem(2, year, 1, t1.startDate, t1.endDate)], { dryRun: false }).expect(200);

      const t2 = semesterDates(year, 2);
      const rows = [sem(2, year, 2, `${year}-12-01`, t2.endDate)]; // bắt đầu giữa kỳ 1
      const preview = await importTo('/semesters/import', rows, { dryRun: true }).expect(200);
      expect(preview.body.rows[0].errors[0]).toContain(`HK1 ${year}-${year + 1}`);

      await importTo('/semesters/import', rows, { dryRun: false }).expect(400);
      expect(await findSemester(year, 2)).toBeUndefined();
    });

    it('hai kỳ trong cùng file chồng nhau: cả hai lỗi, không kỳ nào được ghi', async () => {
      const year = await freshTestYear(ds);
      const t1 = semesterDates(year, 1);
      const rows = [
        sem(2, year, 1, t1.startDate, t1.endDate),
        sem(3, year, 2, `${year}-12-01`, `${year + 1}-05-31`),
      ];
      const response = await importTo('/semesters/import', rows, { dryRun: false }).expect(400);
      expect(response.body.preview.rows.map((r: { status: string }) => r.status)).toEqual(['error', 'error']);
      expect(await findSemester(year, 1)).toBeUndefined();
    });

    it('dời hai kỳ chéo vào chỗ của nhau: bị từ chối kèm gợi ý, KHÔNG có lỗi DB nào lọt ra (Review Focus 5)', async () => {
      const year = await freshTestYear(ds);
      const t1 = semesterDates(year, 1);
      const t2 = semesterDates(year, 2);
      await importTo(
        '/semesters/import',
        [sem(2, year, 1, t1.startDate, t1.endDate), sem(3, year, 2, t2.startDate, t2.endDate)],
        { dryRun: false },
      ).expect(200);

      // Kỳ 1 dời vào đúng chỗ cũ của kỳ 2.
      const rows = [sem(2, year, 1, t2.startDate, t2.endDate)];
      const preview = await importTo('/semesters/import', rows, { dryRun: true }).expect(200);
      expect(preview.body.rows[0].status).toBe('error');
      await importTo('/semesters/import', rows, { dryRun: false }).expect(400);
      expect((await findSemester(year, 1)).startDate).toBe(t1.startDate);
    });

    it('ô ngày kiểu `Date.toString()` bị từ chối kèm hướng dẫn định dạng', async () => {
      const year = await freshTestYear(ds);
      const t1 = semesterDates(year, 1);
      const response = await importTo(
        '/semesters/import',
        [sem(2, year, 1, 'Tue Sep 01 2026 07:00:00 GMT+0700 (Indochina Time)', t1.endDate)],
        { dryRun: true },
      ).expect(200);
      expect(response.body.rows[0].errors[0]).toMatch(/yyyy-mm-dd hoặc dd\/mm\/yyyy/);
    });
  });

  describe('POST /classes/import', () => {
    let semesterId: string;
    let semesterText: string;
    let teacherA: { id: string; email: string; name: string };
    let teacherB: { id: string; email: string; name: string };
    let codeOne: string;
    let codeTwo: string;

    const cls = (line: number, semester: string, code: string, groupName: string, teacherEmail: string) => ({
      line,
      semester,
      administrativeClassCode: code,
      groupName,
      teacherEmail,
    });
    const count = async (table: string) =>
      ((await ds.query(`SELECT count(*)::int AS n FROM examcollect.${table}`))[0].n as number);
    const classesOf = async (teacherId: string) =>
      ds.query(`SELECT id, group_name, semester_id, administrative_class_id FROM examcollect.class WHERE teacher_id = $1`, [
        teacherId,
      ]);

    async function teacher(label: string, active = true) {
      const email = `imp_${label}_${RUN}@example.com`.toLowerCase();
      const id = await createTestAccount(ds, { email, password: PASSWORD, role: 'teacher', name: `GV ${label} ${RUN}` });
      if (!active) await ds.query(`UPDATE examcollect.account SET is_active = false WHERE id = $1`, [id]);
      teacherIds.push(id);
      return { id, email, name: `GV ${label} ${RUN}` };
    }

    beforeAll(async () => {
      semesterId = await ensureTestSemester(ds, 1);
      const [row] = await ds.query(`SELECT academic_year_start AS year, term FROM examcollect.semester WHERE id = $1`, [semesterId]);
      semesterText = semesterLabel(row.year, row.term);
      teacherA = await teacher('a');
      teacherB = await teacher('b');
      codeOne = `${RUN}KLONE`;
      codeTwo = `${RUN}KLTWO`;
      await importTo('/administrative-classes/import', [{ line: 2, code: codeOne }, { line: 3, code: codeTwo }], { dryRun: false }).expect(200);
    });

    it('T-ADM-2: một dòng mã chưa có → ghi thật là 400, không lớp nào được ghi, không tạo mã, lỗi nêu mã và số dòng', async () => {
      const rows = [
        cls(2, semesterText, codeOne, 'Nhóm 1', teacherA.email),
        cls(3, semesterText, `${RUN}ZZNONE`, 'Nhóm 1', teacherA.email),
      ];
      const classesBefore = await count('class');
      const codesBefore = await count('administrative_class');
      const semestersBefore = await count('semester');
      const auditBefore = await auditCount('class.import');

      const preview = await importTo('/classes/import', rows, { dryRun: true }).expect(200);
      expect(preview.body.rows[1]).toMatchObject({ line: 3, status: 'error' });
      expect(preview.body.rows[1].errors[0]).toContain(`${RUN}ZZNONE`);
      expect(preview.body.rows[1].errors[0]).toMatch(/Danh mục lớp danh nghĩa/);

      await importTo('/classes/import', rows, { dryRun: false }).expect(400);

      expect(await count('class')).toBe(classesBefore);
      expect(await count('administrative_class')).toBe(codesBefore); // KHÔNG tạo mã "tiện tay"
      expect(await count('semester')).toBe(semestersBefore);
      expect(await auditCount('class.import')).toBe(auditBefore);
    });

    it('học kỳ chưa có, nhãn học kỳ sai, giảng viên không có / là admin / bị vô hiệu hoá: lỗi theo dòng, không ghi gì (Review Focus 7)', async () => {
      const inactive = await teacher('nghi', false);
      const rows = [
        cls(2, 'HK1 2299-2300', codeOne, 'Nhóm 1', teacherA.email),
        cls(3, 'học kỳ một', codeOne, 'Nhóm 1', teacherA.email),
        cls(4, semesterText, codeOne, 'Nhóm 1', `khongco_${RUN}@example.com`.toLowerCase()),
        cls(5, semesterText, codeOne, 'Nhóm 1', `imp_admin_${RUN}@example.com`.toLowerCase()),
        cls(6, semesterText, codeOne, 'Nhóm 1', inactive.email),
      ];
      const before = await count('class');

      const preview = await importTo('/classes/import', rows, { dryRun: true }).expect(200);

      expect(preview.body.counts.errors).toBe(5);
      expect(preview.body.rows[0].errors[0]).toMatch(/Chưa có học kỳ HK1 2299-2300/);
      expect(preview.body.rows[1].errors[0]).toMatch(/HK1 2026-2027/);
      expect(preview.body.rows[2].errors[0]).toMatch(/Không có tài khoản/);
      expect(preview.body.rows[3].errors[0]).toMatch(/không phải tài khoản giảng viên/);
      expect(preview.body.rows[4].errors[0]).toMatch(/vô hiệu hoá/);
      await importTo('/classes/import', rows, { dryRun: false }).expect(400);
      expect(await count('class')).toBe(before);
    });

    it('thêm lớp: xem trước = ghi, lớp có học kỳ + lớp danh nghĩa + nhóm + giảng viên, một dòng audit; gửi lại là no-op', async () => {
      const rows = [
        cls(2, semesterText, codeOne, 'Nhóm 1', teacherA.email),
        cls(3, semesterText, codeTwo, '', teacherB.email.toUpperCase()),
      ];
      const codesBefore = await count('administrative_class');
      const auditBefore = await auditCount('class.import');

      const preview = await importTo('/classes/import', rows, { dryRun: true }).expect(200);
      expect(await classesOf(teacherA.id)).toHaveLength(0);
      const real = await importTo('/classes/import', rows, { dryRun: false }).expect(200);

      expect(real.body.applied).toBe(true);
      expect(real.body.rows).toEqual(preview.body.rows);
      expect(real.body.rows[0].label).toBe(`${codeOne} – Nhóm 1 · ${semesterText}`);
      expect(real.body.rows[1].label).toBe(`${codeTwo} · ${semesterText}`);

      const [created] = await classesOf(teacherA.id);
      expect(created).toMatchObject({ group_name: 'Nhóm 1', semester_id: semesterId });
      expect(await classesOf(teacherB.id)).toHaveLength(1);
      expect(await count('administrative_class')).toBe(codesBefore);

      expect(await auditCount('class.import')).toBe(auditBefore + 1);
      expect((await lastAudit('class.import')).new_value).toMatchObject({ added: 2, updated: 0, unchanged: 0 });

      const again = await importTo('/classes/import', rows, { dryRun: false }).expect(200);
      expect(again.body).toMatchObject({ applied: false, counts: { added: 0, updated: 0, unchanged: 2 } });
      expect(await auditCount('class.import')).toBe(auditBefore + 1);
    });

    it('T-IMP-6: đổi giảng viên qua file hiện "A → B"; ghi thật đổi enrollment, GIỮ giảng viên cũ trên phiên; một dòng audit nêu ai bị đổi', async () => {
      const mine = await teacher('chu');
      const heir = await teacher('ke');
      const code = `${RUN}KLREASSIGN`;
      await importTo('/administrative-classes/import', [{ line: 2, code }], { dryRun: false }).expect(200);
      const klass = await seedClass(ds, { teacherId: mine.id, semesterId, administrativeClassId: (await ds.query(
        `SELECT id FROM examcollect.administrative_class WHERE code = $1`, [code]))[0].id, groupName: 'Nhóm 7' });
      const mssv = `IMP${randomTag(8)}`;
      mssvs.push(mssv);
      await seedEnrollment(ds, { classId: klass.id, teacherId: mine.id, mssv, name: 'Sinh vien doi chu' });
      const session = await seedExamSession(ds, {
        teacherId: mine.id,
        classId: klass.id,
        startTime: new Date(Date.now() + 40 * 86_400_000),
        endTime: new Date(Date.now() + 40 * 86_400_000 + 3_600_000),
      });
      const rows = [cls(2, semesterText, code, 'Nhóm 7', heir.email)];
      const auditBefore = await auditCount('class.import');
      const reassignAuditBefore = await auditCount('class.reassign_teacher');

      const preview = await importTo('/classes/import', rows, { dryRun: true }).expect(200);
      expect(preview.body.rows[0]).toMatchObject({
        status: 'update',
        changes: [{ field: 'teacher', label: 'Giảng viên', from: mine.name, to: heir.name }],
      });

      await importTo('/classes/import', rows, { dryRun: false }).expect(200);

      const [after] = await ds.query(`SELECT teacher_id FROM examcollect.class WHERE id = $1`, [klass.id]);
      expect(after.teacher_id).toBe(heir.id);
      const [enrollment] = await ds.query(`SELECT home_teacher_id FROM examcollect.enrollment WHERE home_class_id = $1`, [klass.id]);
      expect(enrollment.home_teacher_id).toBe(heir.id);
      // Phiên đã có giữ giảng viên cũ: không ai sửa được điểm của phiên người khác đã chấm.
      const [sessionRow] = await ds.query(`SELECT teacher_id FROM examcollect.exam_session WHERE id = $1`, [session.id]);
      expect(sessionRow.teacher_id).toBe(mine.id);

      expect(await auditCount('class.import')).toBe(auditBefore + 1);
      expect(await auditCount('class.reassign_teacher')).toBe(reassignAuditBefore); // một dòng cho cả lô, không thêm dòng lẻ
      const audit = await lastAudit('class.import');
      expect(audit.new_value).toMatchObject({ added: 0, updated: 1, reassignedTotal: 1 });
      expect(audit.new_value.reassigned).toEqual([
        { label: `${code} – Nhóm 7 · ${semesterText}`, from: mine.name, to: heir.name },
      ]);
    });

    it('một dòng lỗi giữa các lớp tốt: không lớp nào được ghi (Review Focus 2)', async () => {
      const lone = await teacher('le');
      const rows = [
        cls(2, semesterText, codeOne, 'Nhóm 31', lone.email),
        cls(3, semesterText, codeOne, 'Nhóm 32', 'khong-co@example.com'),
        cls(4, semesterText, codeTwo, 'Nhóm 33', lone.email),
      ];
      await importTo('/classes/import', rows, { dryRun: false }).expect(400);
      expect(await classesOf(lone.id)).toHaveLength(0);
    });

    it('trùng khoá trong file là lỗi; cùng mã khác nhóm là hai lớp khác nhau', async () => {
      const dup = await teacher('trung');
      const rows = [
        cls(2, semesterText, codeOne, 'Nhóm 41', dup.email),
        cls(3, semesterText, codeOne, 'Nhóm 41', dup.email),
        cls(4, semesterText, codeOne, 'Nhóm 42', dup.email),
      ];
      const preview = await importTo('/classes/import', rows, { dryRun: true }).expect(200);
      expect(preview.body.rows.map((r: { status: string }) => r.status)).toEqual(['new', 'error', 'new']);
      expect(preview.body.rows[1].errors[0]).toMatch(/dòng 2/);
    });

    // Bổ sung (Ruling Task 4): khoá lớp ở DB là lower(nhóm), nên "NHÓM 1" so với lớp "Nhóm 1" có sẵn là CÙNG lớp.
    it('nhóm khác hoa-thường với lớp có sẵn: xem trước nói đúng "có sẵn" và ghi thật không vỡ ở khoá duy nhất', async () => {
      const rows = [cls(2, semesterText, codeOne, 'NHÓM 1', teacherA.email)];
      const preview = await importTo('/classes/import', rows, { dryRun: true }).expect(200);
      expect(preview.body.rows[0]).toMatchObject({ status: 'unchanged', label: `${codeOne} – Nhóm 1 · ${semesterText}` });
      const real = await importTo('/classes/import', rows, { dryRun: false }).expect(200);
      expect(real.body.applied).toBe(false);
    });
  });
});
