import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { createTestAccount } from './helpers/create-account';
import { freshTestYear, purgeTestSemesters, randomTag, semesterDates } from './helpers/master-data';
import { seedClass } from './helpers/seed';

describe('Semesters (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let adminToken: string;
  let teacherToken: string;
  let adminId: string;
  let teacherId: string;
  const createdAdminClasses: string[] = [];

  async function login(email: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'correct-horse-battery' });
    return response.body.accessToken;
  }

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const post = (body: object, token = adminToken) =>
    request(app.getHttpServer()).post('/semesters').set(auth(token)).send(body);

  async function auditRows(targetId: string) {
    return ds.query(
      `SELECT action, actor_id, old_value, new_value FROM examcollect.audit_log WHERE target_id = $1 ORDER BY occurred_at`,
      [targetId],
    );
  }

  async function auditCount(action: string) {
    const [row] = await ds.query(`SELECT count(*)::int AS n FROM examcollect.audit_log WHERE action = $1 AND actor_id = $2`, [action, adminId]);
    return row.n as number;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();
    ds = app.get(DataSource);

    const tag = randomTag();
    const adminEmail = `sem_admin_${tag}@example.com`;
    adminId = await createTestAccount(ds, { email: adminEmail, password: 'correct-horse-battery', role: 'admin' });
    adminToken = await login(adminEmail);
    const teacherEmail = `sem_teacher_${tag}@example.com`;
    teacherId = await createTestAccount(ds, { email: teacherEmail, password: 'correct-horse-battery', role: 'teacher' });
    teacherToken = await login(teacherEmail);
  });

  afterAll(async () => {
    try {
      await ds.query(`DELETE FROM examcollect.exam_session WHERE class_id IN (SELECT id FROM examcollect.class WHERE teacher_id = $1)`, [teacherId]).catch(() => undefined);
      await ds.query(`DELETE FROM examcollect.class WHERE teacher_id = $1`, [teacherId]).catch(() => undefined);
      if (createdAdminClasses.length) {
        await ds.query(`DELETE FROM examcollect.administrative_class WHERE id = ANY($1)`, [createdAdminClasses]).catch(() => undefined);
      }
      await purgeTestSemesters(ds);
    } finally {
      await app.close();
    }
  });

  describe('phân quyền', () => {
    it('không token là 401', async () => {
      await request(app.getHttpServer()).get('/semesters').expect(401);
    });

    it('giảng viên đọc được danh sách nhưng KHÔNG nhận classCount (Review Focus 6)', async () => {
      const year = await freshTestYear(ds);
      const created = await post({ academicYearStart: year, term: 1, ...semesterDates(year, 1) }).expect(201);
      const response = await request(app.getHttpServer()).get('/semesters').set(auth(teacherToken)).expect(200);
      const row = response.body.find((s: { id: string }) => s.id === created.body.id);
      expect(row).toBeDefined();
      expect(row).not.toHaveProperty('classCount');
    });

    it('giảng viên không ghi được (POST/PATCH/DELETE đều 403)', async () => {
      const year = await freshTestYear(ds);
      const dates = semesterDates(year, 1);
      await post({ academicYearStart: year, term: 1, ...dates }, teacherToken).expect(403);
      const created = await post({ academicYearStart: year, term: 1, ...dates }).expect(201);
      await request(app.getHttpServer()).patch(`/semesters/${created.body.id}`).set(auth(teacherToken)).send({ endDate: dates.endDate }).expect(403);
      await request(app.getHttpServer()).delete(`/semesters/${created.body.id}`).set(auth(teacherToken)).expect(403);
    });
  });

  describe('tạo', () => {
    it('trả nhãn suy ra, ngày dạng yyyy-mm-dd, classCount = 0, và ghi ĐÚNG MỘT dòng audit (T-AUD-1)', async () => {
      const year = await freshTestYear(ds);
      const dates = semesterDates(year, 1);
      const before = await auditCount('semester.create');

      const response = await post({ academicYearStart: year, term: 1, ...dates }).expect(201);

      expect(response.body).toMatchObject({
        academicYearStart: year,
        term: 1,
        label: `HK1 ${year}-${year + 1}`,
        startDate: dates.startDate,
        endDate: dates.endDate,
        classCount: 0,
      });
      expect(await auditCount('semester.create')).toBe(before + 1);
      const rows = await auditRows(response.body.id);
      expect(rows).toHaveLength(1);
      expect(rows[0].actor_id).toBe(adminId);
      expect(rows[0].new_value).toMatchObject({ targetLabel: `HK1 ${year}-${year + 1}`, term: 1, academicYearStart: year });
    });

    it('danh sách sắp theo năm giảm dần, kỳ giảm dần', async () => {
      const year = await freshTestYear(ds);
      await post({ academicYearStart: year, term: 1, ...semesterDates(year, 1) }).expect(201);
      await post({ academicYearStart: year, term: 2, ...semesterDates(year, 2) }).expect(201);
      const list = await request(app.getHttpServer()).get('/semesters').set(auth(adminToken)).expect(200);
      const mine = list.body.filter((s: { academicYearStart: number }) => s.academicYearStart === year);
      expect(mine.map((s: { term: number }) => s.term)).toEqual([2, 1]);
      const all = list.body.map((s: { academicYearStart: number; term: number }) => [s.academicYearStart, s.term]);
      const sorted = [...all].sort((a, b) => b[0] - a[0] || b[1] - a[1]);
      expect(all).toEqual(sorted);
    });

    it('trùng (năm, kỳ) là 409 nêu nhãn học kỳ', async () => {
      const year = await freshTestYear(ds);
      await post({ academicYearStart: year, term: 1, ...semesterDates(year, 1) }).expect(201);
      // Ngày của kỳ 2: TRONG cửa sổ năm học và không chồng kỳ 1, để chỉ còn khoá (năm, kỳ) bị vi phạm
      // (ngày ngoài cửa sổ sẽ ra 400 trước khi tới bước kiểm trùng).
      const dup = await post({ academicYearStart: year, term: 1, ...semesterDates(year, 2) }).expect(409);
      expect(dup.body.message).toContain(`HK1 ${year}-${year + 1}`);
    });

    it('T-MD-7: trùng ngày với học kỳ khác là 409 nêu học kỳ đang giữ khoảng ngày', async () => {
      const year = await freshTestYear(ds);
      const first = await post({ academicYearStart: year, term: 1, ...semesterDates(year, 1) }).expect(201);
      const clash = await post({ academicYearStart: year, term: 2, ...semesterDates(year, 1) }).expect(409);
      expect(clash.body.message).toContain(first.body.label);
      expect(clash.body.message).toMatch(/\d{2}\/\d{2}\/\d{4}/);
    });

    it('lỗi đầu vào là 400 và KHÔNG để lại dòng audit (Review Focus 5)', async () => {
      const year = await freshTestYear(ds);
      const before = await auditCount('semester.create');
      await post({ academicYearStart: year, term: 4, ...semesterDates(year, 1) }).expect(400);
      await post({ academicYearStart: year, term: 1, startDate: '2026-02-30', endDate: '2026-03-01' }).expect(400);
      await post({ academicYearStart: year, term: 1, startDate: '2026-09-01', endDate: '2026-08-01' }).expect(400);
      await post({ academicYearStart: 1999, term: 1, ...semesterDates(year, 1) }).expect(400);
      await post({ term: 1 }).expect(400);
      expect(await auditCount('semester.create')).toBe(before);
    });

    it('xung đột (409) cũng không để lại dòng audit', async () => {
      const year = await freshTestYear(ds);
      const dates = semesterDates(year, 1);
      await post({ academicYearStart: year, term: 1, ...dates }).expect(201);
      const afterCreate = await auditCount('semester.create');
      await post({ academicYearStart: year, term: 1, ...dates }).expect(409);
      expect(await auditCount('semester.create')).toBe(afterCreate);
    });
  });

  describe('sửa', () => {
    it('sửa ngày thì được, audit chỉ ghi các trường đổi', async () => {
      const year = await freshTestYear(ds);
      const dates = semesterDates(year, 1);
      const created = await post({ academicYearStart: year, term: 1, ...dates }).expect(201);

      const newEnd = `${year + 1}-02-15`;
      const response = await request(app.getHttpServer())
        .patch(`/semesters/${created.body.id}`)
        .set(auth(adminToken))
        .send({ endDate: newEnd })
        .expect(200);
      expect(response.body.endDate).toBe(newEnd);

      const rows = await auditRows(created.body.id);
      const update = rows.find((r: { action: string }) => r.action === 'semester.update');
      expect(update.old_value).toEqual({ endDate: dates.endDate });
      expect(update.new_value).toMatchObject({ endDate: newEnd, targetLabel: created.body.label });
      expect(Object.keys(update.new_value).sort()).toEqual(['endDate', 'targetLabel']);
    });

    it('gửi lại đúng giá trị hiện có là không đổi gì và không ghi audit', async () => {
      const year = await freshTestYear(ds);
      const dates = semesterDates(year, 1);
      const created = await post({ academicYearStart: year, term: 1, ...dates }).expect(201);
      await request(app.getHttpServer()).patch(`/semesters/${created.body.id}`).set(auth(adminToken)).send({ endDate: dates.endDate }).expect(200);
      const rows = await auditRows(created.body.id);
      expect(rows.filter((r: { action: string }) => r.action === 'semester.update')).toHaveLength(0);
    });

    it('sửa ngày thành chồng với học kỳ khác là 409; một học kỳ không tự va chạm với chính nó', async () => {
      const year = await freshTestYear(ds);
      const a = await post({ academicYearStart: year, term: 1, ...semesterDates(year, 1) }).expect(201);
      const b = await post({ academicYearStart: year, term: 2, ...semesterDates(year, 2) }).expect(201);
      // Co kỳ 1 lại vẫn nằm trong chính nó: không được coi là chồng với chính nó.
      await request(app.getHttpServer()).patch(`/semesters/${a.body.id}`).set(auth(adminToken)).send({ endDate: `${year + 1}-01-15` }).expect(200);
      // Kéo kỳ 2 lùi về trước ngày bắt đầu của kỳ 1: chồng.
      await request(app.getHttpServer()).patch(`/semesters/${b.body.id}`).set(auth(adminToken)).send({ startDate: `${year}-12-01` }).expect(409);
    });

    it('T-MD-6: không đổi được năm học/kỳ khi đã có lớp (409, nói rõ số lớp); đổi ngày vẫn được', async () => {
      const year = await freshTestYear(ds);
      const created = await post({ academicYearStart: year, term: 1, ...semesterDates(year, 1) }).expect(201);
      const [adm] = await ds.query(`INSERT INTO examcollect.administrative_class (code) VALUES ($1) RETURNING id`, [`ZZ${randomTag()}`]);
      createdAdminClasses.push(adm.id);
      await seedClass(ds, { teacherId, semesterId: created.body.id, administrativeClassId: adm.id });

      const blocked = await request(app.getHttpServer()).patch(`/semesters/${created.body.id}`).set(auth(adminToken)).send({ term: 2 }).expect(409);
      expect(blocked.body.message).toMatch(/1 lớp/);
      await request(app.getHttpServer()).patch(`/semesters/${created.body.id}`).set(auth(adminToken)).send({ endDate: `${year + 1}-01-20` }).expect(200);
    });

    it('404 cho học kỳ không tồn tại', async () => {
      await request(app.getHttpServer()).patch('/semesters/00000000-0000-4000-8000-000000000000').set(auth(adminToken)).send({ endDate: '2900-01-01' }).expect(404);
    });
  });

  describe('xoá', () => {
    it('xoá được học kỳ chưa có lớp và ghi audit mang nhãn trong oldValue', async () => {
      const year = await freshTestYear(ds);
      const created = await post({ academicYearStart: year, term: 1, ...semesterDates(year, 1) }).expect(201);
      await request(app.getHttpServer()).delete(`/semesters/${created.body.id}`).set(auth(adminToken)).expect(204);
      const rows = await auditRows(created.body.id);
      const del = rows.find((r: { action: string }) => r.action === 'semester.delete');
      expect(del.old_value).toMatchObject({ targetLabel: created.body.label });
    });

    it('T-MD-8: học kỳ còn lớp không xoá được; báo lý do cụ thể kèm số lớp', async () => {
      const year = await freshTestYear(ds);
      const created = await post({ academicYearStart: year, term: 1, ...semesterDates(year, 1) }).expect(201);
      const [adm] = await ds.query(`INSERT INTO examcollect.administrative_class (code) VALUES ($1) RETURNING id`, [`ZZ${randomTag()}`]);
      createdAdminClasses.push(adm.id);
      await seedClass(ds, { teacherId, semesterId: created.body.id, administrativeClassId: adm.id });

      const blocked = await request(app.getHttpServer()).delete(`/semesters/${created.body.id}`).set(auth(adminToken)).expect(409);
      expect(blocked.body.message).toContain(created.body.label);
      expect(blocked.body.message).toMatch(/1 lớp/);
    });

    it('classCount của admin đếm đúng số lớp', async () => {
      const year = await freshTestYear(ds);
      const created = await post({ academicYearStart: year, term: 1, ...semesterDates(year, 1) }).expect(201);
      const [adm] = await ds.query(`INSERT INTO examcollect.administrative_class (code) VALUES ($1) RETURNING id`, [`ZZ${randomTag()}`]);
      createdAdminClasses.push(adm.id);
      await seedClass(ds, { teacherId, semesterId: created.body.id, administrativeClassId: adm.id, groupName: 'Nhóm 1' });
      await seedClass(ds, { teacherId, semesterId: created.body.id, administrativeClassId: adm.id, groupName: 'Nhóm 2' });
      const list = await request(app.getHttpServer()).get('/semesters').set(auth(adminToken)).expect(200);
      expect(list.body.find((s: { id: string }) => s.id === created.body.id).classCount).toBe(2);
    });
  });
});
