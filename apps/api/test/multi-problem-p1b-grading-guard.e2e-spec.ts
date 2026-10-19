import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { createTestAccount } from './helpers/create-account';
import { seedCriterion, seedSession, SeedSession } from './helpers/grading-seed';

/**
 * Review C1 (P1b, sửa sau nghiệm thu). Đường chấm chưa định tuyến bài theo câu: mọi kết quả mới gắn câu mặc định
 * và chạy gói test của câu 1. Cho đến khi có định tuyến theo câu, phiên nhiều câu phải TỪ CHỐI bắt đầu chấm, để
 * không có bài nào bị chấm sai thước âm thầm.
 */
describe('P1b — phiên nhiều câu không bắt đầu chấm khi chưa định tuyến theo câu (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  const stamp = Date.now();
  const PASSWORD = 'correct-horse-battery';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();
    ds = app.get(DataSource);
  }, 60_000);
  afterAll(async () => app.close());

  async function login(label: string): Promise<{ id: string; token: string }> {
    const email = `p1b_gguard_${label}_${stamp}@example.com`;
    const id = await createTestAccount(ds, { email, password: PASSWORD, role: 'teacher' });
    const res = await request(app.getHttpServer()).post('/auth/login').send({ email, password: PASSWORD });
    return { id, token: res.body.accessToken as string };
  }

  async function twoProblemSession(label: string): Promise<{ owner: { id: string; token: string }; ctx: SeedSession }> {
    const owner = await login(label);
    const ctx = await seedSession(ds, `gguard-${label}`, { teacherId: owner.id, deliverableType: 'code_project', language: 'cpp' });
    await seedCriterion(ds, ctx.rubricId, 'tieu_chi_1', 5);
    await ds.query(
      `INSERT INTO examcollect.exam_problem (exam_session_id, ordinal, title, points_hundredths, rubric_id, required_deliverable_id)
       VALUES ($1, 1, 'Câu 1', 500, $2, $3)`,
      [ctx.sessionId, ctx.rubricId, ctx.deliverableId],
    );
    await ds.query(
      `INSERT INTO examcollect.exam_problem (exam_session_id, ordinal, title, points_hundredths)
       VALUES ($1, 2, 'Câu 2', 500)`,
      [ctx.sessionId],
    );
    return { owner, ctx };
  }

  it('phiên hai câu: bắt đầu chấm → 409 nêu lý do, và không tạo kết quả chấm nào', async () => {
    const { owner, ctx } = await twoProblemSession('two');

    const res = await request(app.getHttpServer())
      .post(`/exam-sessions/${ctx.sessionId}/start-grading`)
      .set('Authorization', `Bearer ${owner.token}`);

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/Cần đề cương nhiều câu đã xác nhận/);
    const [{ n }] = await ds.query(
      `SELECT COUNT(*)::int AS n FROM examcollect.grading_result g
         JOIN examcollect.submission s ON s.id = g.submission_id WHERE s.exam_session_id = $1`,
      [ctx.sessionId],
    );
    expect(n).toBe(0);
  });

  // Review M5: thêm câu vào phiên đã có bài chấm sẽ đổi đường xuất sổ điểm (từ gộp theo file sang tổng theo câu)
  // và làm lệch các điểm đã có. Từ chối trước khi tạo câu.
  it('phiên một câu đã có bài chấm: thêm câu → 409, và không có câu nào được tạo', async () => {
    const owner = await login('late-add');
    const ctx = await seedSession(ds, 'gguard-late-add', { teacherId: owner.id, deliverableType: 'code_project', language: 'cpp' });
    await seedCriterion(ds, ctx.rubricId, 'tieu_chi_1', 5);
    await ds.query(
      `INSERT INTO examcollect.exam_problem (exam_session_id, ordinal, title, points_hundredths, rubric_id, required_deliverable_id)
       VALUES ($1, 1, 'Câu 1', 500, $2, $3)`,
      [ctx.sessionId, ctx.rubricId, ctx.deliverableId],
    );
    const [sub] = await ds.query(
      `INSERT INTO examcollect.submission
         (exam_session_id, required_deliverable_id, student_mssv, student_name_input, home_class_id, home_teacher_id, status, storage_key)
       VALUES ($1, $2, 'LATEADD01', 'Sinh viên', $3, $4, 'received', NULL) RETURNING id`,
      [ctx.sessionId, ctx.deliverableId, ctx.classId, ctx.teacherId],
    );
    for (const next of ['validated', 'collected']) {
      await ds.query(`UPDATE examcollect.submission SET status = $1 WHERE id = $2`, [next, sub.id]);
    }
    await ds.query(
      `INSERT INTO examcollect.grading_result (submission_id, rubric_id_version, grading_triggered_by, status, pipeline)
       VALUES ($1, $2, $3, 'ai_grading', 'one_shot')`,
      [sub.id, ctx.rubricId, ctx.teacherId],
    );

    const res = await request(app.getHttpServer())
      .post(`/exam-sessions/${ctx.sessionId}/problems`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        title: 'Câu thêm muộn',
        pointsHundredths: 500,
        requiredDeliverableId: ctx.deliverableId,
        rubricId: ctx.rubricId,
        language: 'cpp',
      });

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/bài chấm/);
    const [{ n }] = await ds.query(`SELECT COUNT(*)::int AS n FROM examcollect.exam_problem WHERE exam_session_id = $1`, [
      ctx.sessionId,
    ]);
    expect(n).toBe(1);
  });
});
