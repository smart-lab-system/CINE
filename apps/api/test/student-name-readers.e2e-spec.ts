import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { createTestAccount } from './helpers/create-account';
import { randomTag } from './helpers/master-data';
import { seedClass, seedEnrollment, sessionBody } from './helpers/seed';
import { concurrentLiveWindow } from './helpers/session-window';
import { openSession } from './helpers/open-session';

/**
 * Mọi nơi hiện tên sinh viên đọc từ `student` (spec §2.6, T-RW-1, T-RW-2). Cột cũ `enrollment.student_name` đã bị bỏ ở migration thu hẹp, nên một nơi đọc
 * còn nhắc tới nó sẽ nổ ở câu SQL thay vì lặng lẽ trả tên cũ; ở đây kiểm tên thật đi ra đúng ở từng nơi đọc.
 */
describe('Nơi đọc tên sinh viên (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let token: string;
  let teacherId: string;
  let classId: string;
  let sessionId: string;
  const tag = randomTag(8);
  const PRESENT = `NR${tag}1`;
  const ABSENT = `NR${tag}2`;
  const NAMES = new Map([
    [PRESENT, 'Nguyễn Văn Có Mặt'],
    [ABSENT, 'Trần Thị Vắng Mặt'],
  ]);

  const get = (path: string) =>
    request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();
    ds = app.get(DataSource);

    const email = `namereaders_${tag}@example.com`;
    teacherId = await createTestAccount(ds, { email, password: 'correct-horse-battery', role: 'teacher' });
    const login = await request(app.getHttpServer()).post('/auth/login').send({ email, password: 'correct-horse-battery' });
    token = login.body.accessToken;

    const klass = await seedClass(ds, { teacherId });
    classId = klass.id;
    for (const [mssv, name] of NAMES) {
      await seedEnrollment(ds, { classId, teacherId, mssv, name });
    }

    const created = await request(app.getHttpServer())
      .post('/exam-sessions')
      .set('Authorization', `Bearer ${token}`)
      .send(await sessionBody(ds, { classId, name: `Đọc tên ${tag}`, ...concurrentLiveWindow() }));
    expect(created.status).toBe(201);
    sessionId = created.body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('T-RW (đóng băng): ảnh chốt chụp tên từ `student`', async () => {
    await openSession(app, token, sessionId);
    const rows = await ds.query(
      `SELECT student_mssv::text AS mssv, student_name FROM examcollect.session_roster WHERE exam_session_id = $1`,
      [sessionId],
    );
    const byMssv = new Map(rows.map((r: { mssv: string; student_name: string }) => [r.mssv, r.student_name]));
    expect(byMssv.get(PRESENT)).toBe(NAMES.get(PRESENT));
    expect(byMssv.get(ABSENT)).toBe(NAMES.get(ABSENT));
    // Dòng submission được gieo cũng mang tên từ `student`.
    const subs = await ds.query(
      `SELECT DISTINCT student_mssv::text AS mssv, student_name_input FROM examcollect.submission WHERE exam_session_id = $1`,
      [sessionId],
    );
    for (const row of subs) expect(row.student_name_input).toBe(NAMES.get(row.mssv));
  });

  it('điểm danh: nhóm có mặt và vắng mặt hiện tên từ `student`', async () => {
    await ds.query(
      `INSERT INTO examcollect.agent_connection_event (exam_session_id, student_mssv, event_type, joined_late)
       VALUES ($1, $2, 'connected', false)`,
      [sessionId, PRESENT],
    );
    const response = await get(`/exam-sessions/${sessionId}/attendance`).expect(200);
    expect(response.body.present.map((s: { name: string }) => s.name)).toEqual([NAMES.get(PRESENT)]);
    expect(response.body.absent.map((s: { name: string }) => s.name)).toEqual([NAMES.get(ABSENT)]);
  });

  it('T-RW-2 (thu lại, SQL thô): danh sách em chưa nộp kèm tên từ `student`', async () => {
    await request(app.getHttpServer())
      .post(`/exam-sessions/${sessionId}/finalize`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const response = await request(app.getHttpServer())
      .post(`/exam-sessions/${sessionId}/recollect`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    // Không có agent nào đang kết nối, nên em có mặt (đã có event) mà chưa nộp là "unreachable" — và tên của em hiện ra.
    expect(response.body.missing).toBe(1);
    expect(response.body.unreachableNames).toEqual([NAMES.get(PRESENT)]);
  });

  it('T-RW-1 (bài thu, SQL thô): từ khoá tìm theo TÊN trong `student`, và danh sách khớp mang tên từ `student`', async () => {
    const response = await get(`/submissions/overview?student=${encodeURIComponent('Có Mặt')}`).expect(200);
    const item = response.body.items.find((s: { id: string }) => s.id === sessionId);
    expect(item).toBeDefined();
    expect(item.matchedStudents).toEqual([{ mssv: PRESENT, name: NAMES.get(PRESENT) }]);
  });

  it('danh sách lớp (roster API) hiện tên từ `student`', async () => {
    const roster = await get(`/classes/${classId}/roster`).expect(200);
    const present = roster.body.find((r: { mssv: string }) => r.mssv === PRESENT);
    expect(present.name).toBe(NAMES.get(PRESENT));
  });
});
