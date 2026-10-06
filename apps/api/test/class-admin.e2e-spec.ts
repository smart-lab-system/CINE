import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { createTestAccount } from './helpers/create-account';
import { ensurePastSemester, ensureTestSemester, purgeTestSemesters, randomTag } from './helpers/master-data';
import { seedEnrollment, seedExamSession } from './helpers/seed';
import { seedResult, seedSession } from './helpers/grading-seed';

/**
 * Lớp do ADMIN quản lý; giảng viên chỉ đọc (spec §2.3, §4). Đảo lại thay đổi 21/09 cho giảng viên
 * tự tạo lớp: admin thành điểm nghẽn, và đó là lựa chọn có ý thức (spec §12 mục 1).
 */
describe('Lớp do admin quản lý (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let adminToken: string;
  let adminId: string;
  let teacherToken: string;
  let teacherId: string;
  let otherTeacherId: string;
  let otherTeacherToken: string;
  let semesterId: string;
  let otherSemesterId: string;
  const createdAdm: string[] = [];

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const post = (body: object, token = adminToken) => request(app.getHttpServer()).post('/classes').set(auth(token)).send(body);
  const patch = (id: string, body: object, token = adminToken) =>
    request(app.getHttpServer()).patch(`/classes/${id}`).set(auth(token)).send(body);

  async function account(prefix: string, role: 'admin' | 'teacher') {
    const email = `${prefix}_${randomTag()}@example.com`;
    const id = await createTestAccount(ds, { email, password: 'correct-horse-battery', role });
    const login = await request(app.getHttpServer()).post('/auth/login').send({ email, password: 'correct-horse-battery' });
    return { id, token: login.body.accessToken as string };
  }

  async function adminClass(code = `ZZ${randomTag(12)}`): Promise<{ id: string; code: string }> {
    const [row] = await ds.query(`INSERT INTO examcollect.administrative_class (code) VALUES ($1) RETURNING id`, [code]);
    createdAdm.push(row.id);
    return { id: row.id, code };
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

    const admin = await account('cls_admin', 'admin');
    adminId = admin.id;
    adminToken = admin.token;
    const teacher = await account('cls_teacher', 'teacher');
    teacherId = teacher.id;
    teacherToken = teacher.token;
    const other = await account('cls_other', 'teacher');
    otherTeacherId = other.id;
    otherTeacherToken = other.token;
    semesterId = await ensureTestSemester(ds, 1);
    otherSemesterId = await ensureTestSemester(ds, 2);
  });

  afterAll(async () => {
    await ds.query(`DELETE FROM examcollect.class WHERE teacher_id = ANY($1)`, [[teacherId, otherTeacherId]]).catch(() => undefined);
    await ds.query(`DELETE FROM examcollect.administrative_class WHERE id = ANY($1)`, [createdAdm]).catch(() => undefined);
    await purgeTestSemesters(ds);
    await app.close();
  });

  describe('phân quyền (T-OWN-1)', () => {
    it('giảng viên không tạo, sửa, xoá được lớp (403), và không đọc được danh sách của admin', async () => {
      const adm = await adminClass();
      const created = await post({ semesterId, administrativeClassId: adm.id, teacherId }).expect(201);

      await post({ semesterId, administrativeClassId: adm.id, teacherId }, teacherToken).expect(403);
      await patch(created.body.id, { groupName: 'Nhóm X' }, teacherToken).expect(403);
      await request(app.getHttpServer()).delete(`/classes/${created.body.id}`).set(auth(teacherToken)).expect(403);
      await request(app.getHttpServer()).get('/classes').set(auth(teacherToken)).expect(403);
    });

    it('admin không dùng được route "lớp của tôi" (đó là của giảng viên)', async () => {
      await request(app.getHttpServer()).get('/classes/teaching').set(auth(adminToken)).expect(403);
    });

    it('không token là 401', async () => {
      await request(app.getHttpServer()).get('/classes').expect(401);
      await request(app.getHttpServer()).get('/classes/teaching').expect(401);
    });
  });

  describe('tạo', () => {
    it('chọn lớp danh nghĩa bằng id: nhãn là mã, nhóm rỗng, ghi ĐÚNG MỘT dòng audit (T-AUD-1)', async () => {
      const adm = await adminClass();
      const before = await auditCount('class.create');

      const response = await post({ semesterId, administrativeClassId: adm.id, teacherId }).expect(201);

      expect(response.body).toMatchObject({
        label: adm.code,
        groupName: '',
        administrativeClassCode: adm.code,
        teacherId,
        semesterId,
        studentCount: 0,
        sessionCount: 0,
      });
      expect(response.body.labelWithSemester).toMatch(new RegExp(`^${adm.code} · HK1 \\d{4}-\\d{4}$`));
      expect(await auditCount('class.create')).toBe(before + 1);
      const [entry] = await ds.query(`SELECT new_value FROM examcollect.audit_log WHERE target_id = $1`, [response.body.id]);
      expect(entry.new_value).toMatchObject({ targetLabel: response.body.labelWithSemester, groupName: '' });
    });

    it('chọn bằng mã (không phân biệt hoa-thường) và có nhóm: nhãn "mã – nhóm"', async () => {
      const adm = await adminClass();
      const response = await post({
        semesterId,
        administrativeClassCode: adm.code.toLowerCase(),
        groupName: '  Nhóm   2 ',
        teacherId,
      }).expect(201);
      expect(response.body.label).toBe(`${adm.code} – Nhóm 2`);
      expect(response.body.groupName).toBe('Nhóm 2');
    });

    it('T-ADM-1: mã chưa có trong Danh mục là 400 chỉ tới Danh mục, và KHÔNG tạo mã (Review Focus 3)', async () => {
      const missing = `ZZ${randomTag(12)}`;
      const [{ n: before }] = await ds.query(`SELECT count(*)::int AS n FROM examcollect.administrative_class`);

      const response = await post({ semesterId, administrativeClassCode: missing, teacherId }).expect(400);

      expect(response.body.message).toContain(missing);
      expect(response.body.message).toMatch(/Danh mục lớp danh nghĩa/);
      const [{ n: after }] = await ds.query(`SELECT count(*)::int AS n FROM examcollect.administrative_class`);
      expect(after).toBe(before);
    });

    it('lớp danh nghĩa được chỉ bằng id mà không có thật là 400; không chỉ lớp nào cũng 400; chỉ cả hai cũng 400', async () => {
      const adm = await adminClass();
      await post({ semesterId, administrativeClassId: '00000000-0000-4000-8000-0000000000cc', teacherId }).expect(400);
      await post({ semesterId, teacherId }).expect(400);
      await post({ semesterId, administrativeClassId: adm.id, administrativeClassCode: adm.code, teacherId }).expect(400);
    });

    it('học kỳ không có thật là 400', async () => {
      const adm = await adminClass();
      await post({ semesterId: '00000000-0000-4000-8000-0000000000dd', administrativeClassId: adm.id, teacherId }).expect(400);
    });

    it('giảng viên phải là tài khoản `teacher` ĐANG hoạt động (Review Focus 5)', async () => {
      const adm = await adminClass();
      await post({ semesterId, administrativeClassId: adm.id, teacherId: adminId }).expect(400); // một admin
      const inactive = await account('cls_inactive', 'teacher');
      await ds.query(`UPDATE examcollect.account SET is_active = false WHERE id = $1`, [inactive.id]);
      await post({ semesterId, administrativeClassId: adm.id, teacherId: inactive.id }).expect(400);
    });

    it('trùng (học kỳ, lớp danh nghĩa, nhóm) là 409 nêu nhãn; khác nhóm hoặc khác kỳ thì được', async () => {
      const adm = await adminClass();
      await post({ semesterId, administrativeClassId: adm.id, groupName: 'Nhóm 1', teacherId }).expect(201);

      const dup = await post({ semesterId, administrativeClassId: adm.id, groupName: 'Nhóm 1', teacherId: otherTeacherId }).expect(409);
      expect(dup.body.message).toContain(`${adm.code} – Nhóm 1`);

      await post({ semesterId, administrativeClassId: adm.id, groupName: 'Nhóm 2', teacherId }).expect(201);
      await post({ semesterId: otherSemesterId, administrativeClassId: adm.id, groupName: 'Nhóm 1', teacherId }).expect(201);
    });

    it('tên nhóm khác hoa-thường là CÙNG nhóm: 409 đọc được, không phải lỗi khoá DB (review cụm 1, I3)', async () => {
      const adm = await adminClass();
      await post({ semesterId, administrativeClassId: adm.id, groupName: 'Nhóm 1', teacherId }).expect(201);

      const dup = await post({ semesterId, administrativeClassId: adm.id, groupName: 'nhóm 1', teacherId: otherTeacherId }).expect(409);
      expect(dup.body.message).toContain(`${adm.code} – Nhóm 1`);
    });

    it('lỗi không để lại dòng audit', async () => {
      const adm = await adminClass();
      const before = await auditCount('class.create');
      await post({ semesterId, administrativeClassCode: `ZZ${randomTag(12)}`, teacherId }).expect(400);
      await post({ semesterId, administrativeClassId: adm.id, teacherId: adminId }).expect(400);
      expect(await auditCount('class.create')).toBe(before);
    });
  });

  describe('đọc: admin và giảng viên', () => {
    it('admin lọc theo học kỳ, theo năm học, theo giảng viên và theo mã lớp', async () => {
      const adm = await adminClass();
      const mine = await post({ semesterId, administrativeClassId: adm.id, teacherId }).expect(201);
      const theirs = await post({ semesterId: otherSemesterId, administrativeClassId: adm.id, teacherId: otherTeacherId }).expect(201);

      const bySemester = await request(app.getHttpServer()).get(`/classes?semesterId=${semesterId}&q=${adm.code}`).set(auth(adminToken)).expect(200);
      expect(bySemester.body.map((c: { id: string }) => c.id)).toEqual([mine.body.id]);

      const byTeacher = await request(app.getHttpServer()).get(`/classes?teacherId=${otherTeacherId}&q=${adm.code.toLowerCase()}`).set(auth(adminToken)).expect(200);
      expect(byTeacher.body.map((c: { id: string }) => c.id)).toEqual([theirs.body.id]);

      const [{ academic_year_start: year }] = await ds.query(`SELECT academic_year_start FROM examcollect.semester WHERE id = $1`, [semesterId]);
      const byYear = await request(app.getHttpServer()).get(`/classes?academicYear=${year}&q=${adm.code}`).set(auth(adminToken)).expect(200);
      expect(byYear.body.map((c: { id: string }) => c.id)).toContain(mine.body.id);
    });

    it('ô tìm mã không coi % và _ là ký tự đại diện', async () => {
      const response = await request(app.getHttpServer()).get(`/classes?q=${encodeURIComponent('%')}`).set(auth(adminToken)).expect(200);
      expect(response.body).toEqual([]);
    });

    it('giảng viên thấy CHỈ lớp của mình, có thể lọc theo học kỳ, và chỉ thấy MỘT nhãn', async () => {
      const adm = await adminClass();
      const mine = await post({ semesterId, administrativeClassId: adm.id, groupName: 'Nhóm 1', teacherId }).expect(201);
      const theirs = await post({ semesterId, administrativeClassId: adm.id, groupName: 'Nhóm 2', teacherId: otherTeacherId }).expect(201);

      const all = await request(app.getHttpServer()).get('/classes/teaching').set(auth(teacherToken)).expect(200);
      const ids = all.body.map((c: { id: string }) => c.id);
      expect(ids).toContain(mine.body.id);
      expect(ids).not.toContain(theirs.body.id);
      const row = all.body.find((c: { id: string }) => c.id === mine.body.id);
      expect(row).toMatchObject({ label: `${adm.code} – Nhóm 1`, semesterId });
      expect(row).not.toHaveProperty('administrativeClassCode');
      expect(row).not.toHaveProperty('administrativeClassId');

      const other = await request(app.getHttpServer()).get(`/classes/teaching?semesterId=${otherSemesterId}`).set(auth(teacherToken)).expect(200);
      expect(other.body.map((c: { id: string }) => c.id)).not.toContain(mine.body.id);
    });

    it('semesterId không phải uuid là 400, không bị lặng lẽ bỏ qua', async () => {
      await request(app.getHttpServer()).get('/classes/teaching?semesterId=khong-phai-uuid').set(auth(teacherToken)).expect(400);
    });
  });

  describe('sửa', () => {
    it('T-MD-5 (service): đổi học kỳ của lớp CHƯA có phiên được; lớp ĐÃ có phiên bị chặn kèm số phiên', async () => {
      const adm = await adminClass();
      const free = await post({ semesterId, administrativeClassId: adm.id, teacherId }).expect(201);
      const moved = await patch(free.body.id, { semesterId: otherSemesterId }).expect(200);
      expect(moved.body.semesterId).toBe(otherSemesterId);

      const adm2 = await adminClass();
      const withSession = await post({ semesterId, administrativeClassId: adm2.id, teacherId }).expect(201);
      const start = new Date(Date.now() - 30 * 24 * 3_600_000);
      await seedExamSession(ds, { teacherId, classId: withSession.body.id, startTime: start, endTime: new Date(start.getTime() + 3_600_000), status: 'completed' });

      const blocked = await patch(withSession.body.id, { semesterId: otherSemesterId }).expect(409);
      expect(blocked.body.message).toMatch(/1 phiên/);
    });

    it('đổi nhóm và đổi lớp danh nghĩa; audit chỉ ghi các trường đổi bằng khoá đọc được', async () => {
      const a = await adminClass();
      const b = await adminClass();
      const created = await post({ semesterId, administrativeClassId: a.id, groupName: 'Nhóm 1', teacherId }).expect(201);

      const response = await patch(created.body.id, { groupName: 'Nhóm 9', administrativeClassId: b.id }).expect(200);
      expect(response.body.label).toBe(`${b.code} – Nhóm 9`);

      const [entry] = await ds.query(
        `SELECT old_value, new_value FROM examcollect.audit_log WHERE target_id = $1 AND action = 'class.update'`,
        [created.body.id],
      );
      expect(entry.old_value).toEqual({ groupName: 'Nhóm 1', administrativeClass: a.code });
      expect(Object.keys(entry.new_value).sort()).toEqual(['administrativeClass', 'groupName', 'targetLabel']);
      expect(entry.new_value.administrativeClass).toBe(b.code);
    });

    it('đổi sang (kỳ, mã, nhóm) đã có là 409; một lớp không "trùng" với chính nó', async () => {
      const adm = await adminClass();
      const first = await post({ semesterId, administrativeClassId: adm.id, groupName: 'Nhóm 1', teacherId }).expect(201);
      const second = await post({ semesterId, administrativeClassId: adm.id, groupName: 'Nhóm 2', teacherId }).expect(201);
      await patch(first.body.id, { groupName: 'Nhóm 1' }).expect(200);
      await patch(second.body.id, { groupName: 'Nhóm 1' }).expect(409);
    });

    it('gửi lại đúng giá trị hiện có là không đổi gì và không ghi audit', async () => {
      const adm = await adminClass();
      const created = await post({ semesterId, administrativeClassId: adm.id, teacherId }).expect(201);
      await patch(created.body.id, { semesterId, groupName: '' }).expect(200);
      const rows = await ds.query(`SELECT 1 FROM examcollect.audit_log WHERE target_id = $1 AND action IN ('class.update', 'class.reassign_teacher')`, [created.body.id]);
      expect(rows).toHaveLength(0);
    });

    it('404 cho lớp không tồn tại', async () => {
      await patch('00000000-0000-4000-8000-000000000000', { groupName: 'x' }).expect(404);
    });
  });

  describe('T-OWN-3: đổi giảng viên của lớp', () => {
    it('enrollment.home_teacher_id đổi theo; phiên, ảnh chốt và bài nộp đã có KHÔNG đổi (Review Focus 2)', async () => {
      // `seedSession` dựng giảng viên + lớp + phiên + file bắt buộc + rubric; `seedResult` thêm một bài nộp đã chấm.
      const ctx = await seedSession(ds, `own${randomTag(6)}`);
      await seedResult(ds, ctx);
      const mssv = `OW${randomTag(8)}`;
      await seedEnrollment(ds, { classId: ctx.classId, teacherId: ctx.teacherId, mssv });
      await ds.query(
        `INSERT INTO examcollect.session_roster (exam_session_id, student_mssv, student_name, home_class_id, home_teacher_id, source)
         VALUES ($1, $2, 'Sinh viên cũ', $3, $4, 'frozen')`,
        [ctx.sessionId, mssv, ctx.classId, ctx.teacherId],
      );
      const before = await auditCount('class.reassign_teacher');

      await patch(ctx.classId, { teacherId: otherTeacherId }).expect(200);

      const [klass] = await ds.query(`SELECT teacher_id FROM examcollect.class WHERE id = $1`, [ctx.classId]);
      expect(klass.teacher_id).toBe(otherTeacherId);
      const [enr] = await ds.query(`SELECT home_teacher_id FROM examcollect.enrollment WHERE home_class_id = $1 AND student_mssv = $2`, [ctx.classId, mssv]);
      expect(enr.home_teacher_id).toBe(otherTeacherId);

      const [session] = await ds.query(`SELECT teacher_id FROM examcollect.exam_session WHERE id = $1`, [ctx.sessionId]);
      expect(session.teacher_id).toBe(ctx.teacherId);
      const [roster] = await ds.query(`SELECT home_teacher_id FROM examcollect.session_roster WHERE exam_session_id = $1 AND student_mssv = $2`, [ctx.sessionId, mssv]);
      expect(roster.home_teacher_id).toBe(ctx.teacherId);
      const submissions = await ds.query(`SELECT DISTINCT home_teacher_id FROM examcollect.submission WHERE exam_session_id = $1`, [ctx.sessionId]);
      expect(submissions.map((s: { home_teacher_id: string }) => s.home_teacher_id)).toEqual([ctx.teacherId]);

      expect(await auditCount('class.reassign_teacher')).toBe(before + 1);
      const [entry] = await ds.query(`SELECT old_value, new_value FROM examcollect.audit_log WHERE target_id = $1 AND action = 'class.reassign_teacher'`, [ctx.classId]);
      expect(entry.old_value).toHaveProperty('teacherName');
      expect(entry.new_value).toHaveProperty('teacherName');
      expect(entry.new_value).toHaveProperty('targetLabel');
    });

    it('giảng viên mới thấy lớp, giảng viên cũ thì không', async () => {
      const adm = await adminClass();
      const created = await post({ semesterId, administrativeClassId: adm.id, teacherId }).expect(201);
      await patch(created.body.id, { teacherId: otherTeacherId }).expect(200);
      const mine = await request(app.getHttpServer()).get('/classes/teaching').set(auth(teacherToken)).expect(200);
      const theirs = await request(app.getHttpServer()).get('/classes/teaching').set(auth(otherTeacherToken)).expect(200);
      expect(mine.body.map((c: { id: string }) => c.id)).not.toContain(created.body.id);
      expect(theirs.body.map((c: { id: string }) => c.id)).toContain(created.body.id);
    });

    it('giảng viên đích không phải giảng viên đang hoạt động là 400 và không đổi gì', async () => {
      const adm = await adminClass();
      const created = await post({ semesterId, administrativeClassId: adm.id, teacherId }).expect(201);
      await patch(created.body.id, { teacherId: adminId }).expect(400);
      const [row] = await ds.query(`SELECT teacher_id FROM examcollect.class WHERE id = $1`, [created.body.id]);
      expect(row.teacher_id).toBe(teacherId);
    });

    it('PATCH đổi cả giảng viên lẫn nhóm ghi HAI dòng audit (hai hành vi khác nhau)', async () => {
      const adm = await adminClass();
      const created = await post({ semesterId, administrativeClassId: adm.id, groupName: 'Nhóm 1', teacherId }).expect(201);
      await patch(created.body.id, { teacherId: otherTeacherId, groupName: 'Nhóm 2' }).expect(200);
      const rows = await ds.query(`SELECT action FROM examcollect.audit_log WHERE target_id = $1 AND action IN ('class.update','class.reassign_teacher') ORDER BY action`, [created.body.id]);
      expect(rows.map((r: { action: string }) => r.action)).toEqual(['class.reassign_teacher', 'class.update']);
    });
  });

  describe('T-ADM-4: sửa mã lớp danh nghĩa đổi nhãn ở mọi nơi', () => {
    it('danh sách giảng viên và danh sách admin đổi nhãn theo, kể cả lớp của kỳ cũ (Review Focus 4)', async () => {
      const typo = await adminClass();
      const current = await post({ semesterId, administrativeClassId: typo.id, groupName: 'Nhóm 1', teacherId }).expect(201);
      const older = await post({ semesterId: otherSemesterId, administrativeClassId: typo.id, teacherId }).expect(201);

      const fixed = `ZZ${randomTag(12)}`;
      await request(app.getHttpServer()).patch(`/administrative-classes/${typo.id}`).set(auth(adminToken)).send({ code: fixed }).expect(200);

      const teaching = await request(app.getHttpServer()).get('/classes/teaching').set(auth(teacherToken)).expect(200);
      const labels = new Map(teaching.body.map((c: { id: string; label: string }) => [c.id, c.label]));
      expect(labels.get(current.body.id)).toBe(`${fixed} – Nhóm 1`);
      expect(labels.get(older.body.id)).toBe(fixed);

      const admin = await request(app.getHttpServer()).get(`/classes?q=${fixed}`).set(auth(adminToken)).expect(200);
      expect(admin.body.map((c: { label: string }) => c.label).sort()).toEqual([fixed, `${fixed} – Nhóm 1`].sort());
    });
  });

  describe('xoá', () => {
    it('xoá được lớp rỗng; audit mang nhãn trong oldValue', async () => {
      const adm = await adminClass();
      const created = await post({ semesterId, administrativeClassId: adm.id, teacherId }).expect(201);
      await request(app.getHttpServer()).delete(`/classes/${created.body.id}`).set(auth(adminToken)).expect(204);
      const [entry] = await ds.query(`SELECT old_value FROM examcollect.audit_log WHERE target_id = $1 AND action = 'class.delete'`, [created.body.id]);
      expect(entry.old_value).toMatchObject({ targetLabel: created.body.labelWithSemester, administrativeClass: adm.code });
    });

    it('T-MD-8 (lớp): lớp còn sinh viên hoặc còn phiên không xoá được; báo số lượng và không để lại audit (Review Focus 6)', async () => {
      const adm = await adminClass();
      const withStudents = await post({ semesterId, administrativeClassId: adm.id, groupName: 'Có SV', teacherId }).expect(201);
      await seedEnrollment(ds, { classId: withStudents.body.id, teacherId, mssv: `DL${randomTag(8)}` });
      const before = await auditCount('class.delete');

      const blocked = await request(app.getHttpServer()).delete(`/classes/${withStudents.body.id}`).set(auth(adminToken)).expect(409);
      expect(blocked.body.message).toMatch(/1 sinh viên/);

      const withSession = await post({ semesterId, administrativeClassId: adm.id, groupName: 'Có phiên', teacherId }).expect(201);
      const start = new Date(Date.now() - 31 * 24 * 3_600_000);
      await seedExamSession(ds, { teacherId, classId: withSession.body.id, startTime: start, endTime: new Date(start.getTime() + 3_600_000), status: 'completed' });
      const blocked2 = await request(app.getHttpServer()).delete(`/classes/${withSession.body.id}`).set(auth(adminToken)).expect(409);
      expect(blocked2.body.message).toMatch(/1 phiên/);

      expect(await auditCount('class.delete')).toBe(before);
    });
  });

  it('tạo lớp cho kỳ ĐÃ KẾT THÚC vẫn được: học kỳ không bao giờ chặn thao tác (CLAUDE.md §1.2)', async () => {
    // Một kỳ có ngày THẬT trong quá khứ (2001-09-01 → 2002-01-31), không nằm trong vùng tên ≥ 2200 của test.
    const pastSemesterId = await ensurePastSemester(ds);
    const adm = await adminClass();
    await post({ semesterId: pastSemesterId, administrativeClassId: adm.id, teacherId }).expect(201);
  });
});
