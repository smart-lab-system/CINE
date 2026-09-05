import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { createTestAccount } from './helpers/create-account';

/**
 * Archive và attention-close: hai trạng thái độc lập, cùng một chủ sở hữu,
 * cùng một luật 404/403 như mọi route phiên thi khác.
 */
describe('Session lifecycle (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let schema: string;

  const stamp = Date.now();
  let token: string;
  let otherToken: string;
  let sessionId: string;

  async function readColumns(id: string) {
    const [row] = await dataSource.query(
      `SELECT archived_at, attention_closed_at FROM ${schema}.exam_session WHERE id = $1`,
      [id],
    );
    return row as { archived_at: Date | null; attention_closed_at: Date | null };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();
    dataSource = app.get(DataSource);
    schema = (dataSource.options as { schema?: string }).schema ?? 'examcollect';

    const email = `lifecycle_${stamp}@example.com`;
    const teacherId = await createTestAccount(dataSource, {
      email, password: 'correct-horse-battery', role: 'teacher',
    });
    token = (await request(app.getHttpServer()).post('/auth/login')
      .send({ email, password: 'correct-horse-battery' })).body.accessToken;

    const otherEmail = `lifecycle_other_${stamp}@example.com`;
    await createTestAccount(dataSource, {
      email: otherEmail, password: 'correct-horse-battery', role: 'teacher',
    });
    otherToken = (await request(app.getHttpServer()).post('/auth/login')
      .send({ email: otherEmail, password: 'correct-horse-battery' })).body.accessToken;

    const [semester] = await dataSource.query(
      `INSERT INTO ${schema}.semester (name, start_date, end_date)
       VALUES ($1, '2026-01-01', '2026-06-01') RETURNING id`,
      [`Lifecycle Semester ${stamp}`],
    );
    const [course] = await dataSource.query(
      `INSERT INTO ${schema}.course (code, name, semester_id)
       VALUES ($1, 'Lifecycle Course', $2) RETURNING id`,
      [`LC${stamp}`.slice(0, 20), semester.id],
    );
    const [room] = await dataSource.query(
      `INSERT INTO ${schema}.room (name, capacity) VALUES ($1, 30) RETURNING id`,
      [`Lifecycle Room ${stamp}`],
    );
    const [klass] = await dataSource.query(
      `INSERT INTO ${schema}.class (course_id, name, teacher_id) VALUES ($1, 'N01', $2) RETURNING id`,
      [course.id, teacherId],
    );

    const created = await request(app.getHttpServer())
      .post('/exam-sessions')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: `Lifecycle ${stamp}`,
        classId: klass.id,
        roomId: room.id,
        examType: 'TK',
        // CreateExamSessionDto từ chối startTime lùi quá MAX_BACKDATE_MINUTES (30).
        // Cửa sổ thời gian không liên quan gì tới archive/attention-close, nên chỉ
        // cần một cửa sổ hợp lệ: bắt đầu sau 5 phút, dài 60 phút (>= 15 phút tối thiểu).
        startTime: new Date(Date.now() + 300_000).toISOString(),
        endTime: new Date(Date.now() + 3_900_000).toISOString(),
        requiredFilenames: ['Cau1.docx'],
      });
    expect(created.status).toBe(201);
    sessionId = created.body.id;
  }, 60_000);

  afterAll(async () => { await app.close(); });

  it('archive đặt archived_at, unarchive xoá về NULL', async () => {
    const on = await request(app.getHttpServer())
      .post(`/exam-sessions/${sessionId}/archive`).set('Authorization', `Bearer ${token}`);
    expect(on.status).toBe(200);
    expect((await readColumns(sessionId)).archived_at).not.toBeNull();

    const off = await request(app.getHttpServer())
      .delete(`/exam-sessions/${sessionId}/archive`).set('Authorization', `Bearer ${token}`);
    expect(off.status).toBe(200);
    expect((await readColumns(sessionId)).archived_at).toBeNull();
  }, 30_000);

  it('attention-close đặt attention_closed_at, reopen xoá về NULL', async () => {
    await request(app.getHttpServer())
      .post(`/exam-sessions/${sessionId}/attention-close`).set('Authorization', `Bearer ${token}`);
    expect((await readColumns(sessionId)).attention_closed_at).not.toBeNull();

    await request(app.getHttpServer())
      .delete(`/exam-sessions/${sessionId}/attention-close`).set('Authorization', `Bearer ${token}`);
    expect((await readColumns(sessionId)).attention_closed_at).toBeNull();
  }, 30_000);

  it('hai trạng thái độc lập — khép không đụng tới archived và ngược lại', async () => {
    await request(app.getHttpServer())
      .post(`/exam-sessions/${sessionId}/archive`).set('Authorization', `Bearer ${token}`);
    await request(app.getHttpServer())
      .post(`/exam-sessions/${sessionId}/attention-close`).set('Authorization', `Bearer ${token}`);

    let cols = await readColumns(sessionId);
    expect(cols.archived_at).not.toBeNull();
    expect(cols.attention_closed_at).not.toBeNull();

    await request(app.getHttpServer())
      .delete(`/exam-sessions/${sessionId}/archive`).set('Authorization', `Bearer ${token}`);
    cols = await readColumns(sessionId);
    expect(cols.archived_at).toBeNull();
    expect(cols.attention_closed_at).not.toBeNull();

    await request(app.getHttpServer())
      .delete(`/exam-sessions/${sessionId}/attention-close`).set('Authorization', `Bearer ${token}`);
  }, 30_000);

  it('idempotent — archive hai lần vẫn 200 và vẫn chỉ một mốc', async () => {
    await request(app.getHttpServer())
      .post(`/exam-sessions/${sessionId}/archive`).set('Authorization', `Bearer ${token}`);
    const first = (await readColumns(sessionId)).archived_at;

    const again = await request(app.getHttpServer())
      .post(`/exam-sessions/${sessionId}/archive`).set('Authorization', `Bearer ${token}`);
    expect(again.status).toBe(200);
    // Mốc bị ghi đè bởi lần gọi thứ hai là chấp nhận được; điều phải đúng là
    // route không lỗi và cột vẫn không NULL.
    expect((await readColumns(sessionId)).archived_at).not.toBeNull();
    expect(first).not.toBeNull();

    await request(app.getHttpServer())
      .delete(`/exam-sessions/${sessionId}/archive`).set('Authorization', `Bearer ${token}`);
  }, 30_000);

  // Luật sở hữu của codebase nằm ở đúng một chỗ (ExamSessionService.findOwnedBy):
  // 404 khi phiên không tồn tại, 403 khi phiên có thật nhưng không phải của mình.
  // Phiên ở đây có thật, nên 403 mới là đúng — và SessionLifecycleService thừa
  // hưởng luật đó vì nó gọi findEntityForOwner trước mọi phép ghi.
  it('giảng viên khác không đụng được — 403 và không ghi gì', async () => {
    const res = await request(app.getHttpServer())
      .post(`/exam-sessions/${sessionId}/archive`).set('Authorization', `Bearer ${otherToken}`);
    expect(res.status).toBe(403);
    expect((await readColumns(sessionId)).archived_at).toBeNull();
  }, 30_000);

  it('phiên không tồn tại — 404', async () => {
    const res = await request(app.getHttpServer())
      .post('/exam-sessions/00000000-0000-4000-8000-000000000000/attention-close')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  }, 30_000);
});
