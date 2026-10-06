import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { createTestAccount } from './helpers/create-account';
import { ensureTestSemester, purgeTestSemesters, randomTag } from './helpers/master-data';
import { seedClass, seedEnrollment, sessionBody } from './helpers/seed';
import { concurrentLiveWindow } from './helpers/session-window';
import { openSession } from './helpers/open-session';
import { seedResult, seedSession } from './helpers/grading-seed';
import { GradingService } from '../src/grading/grading.service';

/**
 * Ba nơi nhúng tên lớp — điểm danh, kết quả chấm, trạng thái bài nộp — đọc nhãn từ view `class_label`, không
 * từ `class.name` (cột cũ). Bằng chứng: lớp được dựng với mã danh nghĩa + nhóm, còn `class.name` bị đặt thành một
 * chuỗi sai; nơi đọc quên chuyển sẽ trả chuỗi sai đó.
 */
describe('Nhãn lớp ở nơi đọc nhúng (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let token: string;
  let teacherId: string;
  let sessionClassId: string;
  let sessionId: string;
  const POISON = 'TÊN LỚP CŨ SAI';
  const tag = randomTag(8);
  let sessionClassLabel: string;
  let homeClassLabel: string;
  const MAKEUP = `LB${tag}1`;
  const IN_CLASS = `LB${tag}2`;

  const get = (path: string) => request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();
    ds = app.get(DataSource);

    const email = `labelreaders_${tag}@example.com`;
    teacherId = await createTestAccount(ds, { email, password: 'correct-horse-battery', role: 'teacher' });
    token = (await request(app.getHttpServer()).post('/auth/login').send({ email, password: 'correct-horse-battery' })).body.accessToken;

    const semesterId = await ensureTestSemester(ds, 1);
    const [adm] = await ds.query(`INSERT INTO examcollect.administrative_class (code) VALUES ($1) RETURNING id`, [`ZZ${randomTag(12)}`]);
    const [adm2] = await ds.query(`INSERT INTO examcollect.administrative_class (code) VALUES ($1) RETURNING id`, [`ZZ${randomTag(12)}`]);

    const sessionClass = await seedClass(ds, { teacherId, semesterId, administrativeClassId: adm.id, groupName: 'Nhóm 1' });
    const homeClass = await seedClass(ds, { teacherId, semesterId, administrativeClassId: adm2.id });
    sessionClassId = sessionClass.id;
    const [{ code: c1 }] = await ds.query(`SELECT code::text AS code FROM examcollect.administrative_class WHERE id = $1`, [adm.id]);
    const [{ code: c2 }] = await ds.query(`SELECT code::text AS code FROM examcollect.administrative_class WHERE id = $1`, [adm2.id]);
    sessionClassLabel = `${c1} – Nhóm 1`;
    homeClassLabel = c2;
    // Đầu độc cột cũ của cả hai lớp. Mỗi lớp một chuỗi KHÁC nhau (thêm id): cùng một chuỗi cho cùng giảng viên vi phạm
    // `uq_class_teacher_course_name` (teacher, môn, tên) còn tồn tại tới plan H.
    await ds.query(`UPDATE examcollect.class SET name = $1 || ' ' || id::text WHERE id = ANY($2)`, [POISON, [sessionClass.id, homeClass.id]]);

    await seedEnrollment(ds, { classId: sessionClass.id, teacherId, mssv: IN_CLASS });
    await seedEnrollment(ds, { classId: homeClass.id, teacherId, mssv: MAKEUP });

    const created = await request(app.getHttpServer())
      .post('/exam-sessions')
      .set('Authorization', `Bearer ${token}`)
      .send(await sessionBody(ds, { classId: sessionClass.id, name: `Nhãn ${tag}`, ...concurrentLiveWindow() }));
    expect(created.status).toBe(201);
    sessionId = created.body.id;
    await openSession(app, token, sessionId);
    // Em thi bù (lớp gốc khác) được đưa vào ảnh chốt và có mặt trong phòng.
    await request(app.getHttpServer())
      .post(`/exam-sessions/${sessionId}/roster/students`)
      .set('Authorization', `Bearer ${token}`)
      .send({ mssv: MAKEUP, name: 'Em Thi Bù' })
      .expect(201);
    await ds.query(
      `INSERT INTO examcollect.agent_connection_event (exam_session_id, student_mssv, event_type, joined_late) VALUES ($1, $2, 'connected', false)`,
      [sessionId, MAKEUP],
    );
  });

  afterAll(async () => {
    await purgeTestSemesters(ds);
    await app.close();
  });

  it('điểm danh: className là nhãn lớp của phiên, homeClassName là nhãn lớp gốc của em thi bù', async () => {
    const response = await get(`/exam-sessions/${sessionId}/attendance`).expect(200);
    expect(response.body.className).toBe(sessionClassLabel);
    expect(response.body.makeup).toHaveLength(1);
    expect(response.body.makeup[0].homeClassName).toBe(homeClassLabel);
    expect(response.body.className).not.toBe(POISON);
  });

  it('trạng thái bài nộp của phiên (GET /exam-sessions/:id/submissions): homeClassName là nhãn lớp gốc của em thi bù', async () => {
    const response = await get(`/exam-sessions/${sessionId}/submissions`).expect(200);
    const rows = response.body.items.filter((r: { studentMssv: string }) => r.studentMssv === MAKEUP);
    // Thêm tay em thi bù gieo sẵn một dòng `not_submitted` cho mỗi file bắt buộc (CLAUDE.md §7.1.2).
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.homeClassName).toBe(homeClassLabel);
      expect(row.homeClassName).not.toBe(POISON);
    }
  });

  it('kết quả chấm (GradingService.listForSession): homeClassName là nhãn lớp của bài', async () => {
    // Đọc thẳng service: `seedSession` dựng một giảng viên có mật khẩu giả, không đăng nhập được để gọi HTTP.
    const ctx = await seedSession(ds, `lbl${tag}`);
    const code = `ZZ${randomTag(12)}`;
    const [adm] = await ds.query(`INSERT INTO examcollect.administrative_class (code) VALUES ($1) RETURNING id`, [code]);
    await ds.query(
      `UPDATE examcollect.class SET administrative_class_id = $1, group_name = 'Nhóm 7', name = $2 WHERE id = $3`,
      [adm.id, POISON, ctx.classId],
    );
    await seedResult(ds, ctx);

    const rows = await app.get(GradingService, { strict: false }).listForSession(ctx.sessionId);

    expect(rows).toHaveLength(1);
    expect(rows[0].homeClassName).toBe(`${code} – Nhóm 7`);
  });
});
