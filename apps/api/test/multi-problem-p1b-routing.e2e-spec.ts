import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { createTestAccount } from './helpers/create-account';
import { seedCriterion, seedSession, SeedSession } from './helpers/grading-seed';

/**
 * P1b, 5.2 — định tuyến bài theo câu. Gắn đề hai câu tạo hai yêu cầu nộp (bai1.cpp, bai2.cpp) và ghép mỗi câu với
 * một yêu cầu nộp. Cổng bắt đầu chấm chỉ mở khi đề cương đã xác nhận. Khi mở, mỗi bài vào đúng câu của file nó nộp,
 * với rubric của câu đó.
 */
describe('P1b 5.2 — định tuyến bài theo câu (e2e)', () => {
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
    const email = `p1b_route_${label}_${stamp}@example.com`;
    const id = await createTestAccount(ds, { email, password: PASSWORD, role: 'teacher' });
    const res = await request(app.getHttpServer()).post('/auth/login').send({ email, password: PASSWORD });
    return { id, token: res.body.accessToken as string };
  }

  /** Phiên chưa khai yêu cầu nộp nào, có rubric mẫu 5 điểm, rồi gắn đề hai câu 2 và 3 điểm qua route thật. */
  async function attachedTwoQuestions(label: string): Promise<{ owner: { id: string; token: string }; ctx: SeedSession }> {
    const owner = await login(label);
    const ctx = await seedSession(ds, `route-${label}`, {
      teacherId: owner.id,
      deliverableType: 'code_project',
      language: 'cpp',
      startHoursAgo: -3,
    });
    await ds.query(`DELETE FROM examcollect.required_deliverable WHERE exam_session_id = $1`, [ctx.sessionId]);
    await seedCriterion(ds, ctx.rubricId, 'tieu_chi_1', 5);
    const exam = JSON.stringify({
      title: 'Đề hai câu',
      language: 'cpp',
      verification: { status: 'unverified', reason: 'sandbox_unavailable' },
      questions: [2, 3].map((points, i) => ({
        statement: `Đề câu ${i + 1}`,
        modelAnswer: 'int main() { return 0; }',
        topic: 'thử',
        points,
        testBundle: [{ name: `ca ${i + 1}`, group: 'co_ban', input: '1', expectedOutput: '1' }],
      })),
    });
    const res = await request(app.getHttpServer())
      .post('/exam-authoring/attach')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ examSessionId: ctx.sessionId, examJson: exam });
    expect(res.status).toBe(201);
    return { owner, ctx };
  }

  /** Một bài đã thu của `mssv` trên yêu cầu nộp `deliverableId`. */
  async function collectedSubmission(ctx: SeedSession, mssv: string, deliverableId: string): Promise<void> {
    const [sub] = await ds.query(
      `INSERT INTO examcollect.submission
         (exam_session_id, required_deliverable_id, student_mssv, student_name_input,
          home_class_id, home_teacher_id, status, storage_key)
       VALUES ($1, $2, $3, 'Sinh viên định tuyến', $4, $5, 'received', NULL) RETURNING id`,
      [ctx.sessionId, deliverableId, mssv, ctx.classId, ctx.teacherId],
    );
    for (const next of ['validated', 'collected']) {
      await ds.query(`UPDATE examcollect.submission SET status = $1 WHERE id = $2`, [next, sub.id]);
    }
  }

  it('gắn đề hai câu: tạo bai1.cpp và bai2.cpp, mỗi câu ghép với đúng một yêu cầu nộp', async () => {
    const { ctx } = await attachedTwoQuestions('map');
    const rows: { ordinal: number; required_filename: string }[] = await ds.query(
      `SELECT p.ordinal, rd.required_filename
         FROM examcollect.exam_problem p
         JOIN examcollect.required_deliverable rd ON rd.id = p.required_deliverable_id
        WHERE p.exam_session_id = $1 ORDER BY p.ordinal`,
      [ctx.sessionId],
    );
    expect(rows).toEqual([
      { ordinal: 1, required_filename: 'bai1.cpp' },
      { ordinal: 2, required_filename: 'bai2.cpp' },
    ]);
  });

  it('đề cương chưa xác nhận: bắt đầu chấm → 409, không tạo kết quả nào', async () => {
    const { owner, ctx } = await attachedTwoQuestions('gate');
    const [d1] = await ds.query(`SELECT id FROM examcollect.required_deliverable WHERE exam_session_id = $1 AND required_filename = 'bai1.cpp'`, [ctx.sessionId]);
    await collectedSubmission(ctx, 'RTE0001', d1.id as string);

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

  it('đề cương đã xác nhận: mỗi bài vào đúng câu của file nó nộp, với rubric của câu đó', async () => {
    const { owner, ctx } = await attachedTwoQuestions('route');
    await ds.query(
      `UPDATE examcollect.exam_session SET blueprint_confirmed_at = now(), blueprint_confirmed_by = $2 WHERE id = $1`,
      [ctx.sessionId, owner.id],
    );
    const deliverables: { id: string; required_filename: string }[] = await ds.query(
      `SELECT id, required_filename FROM examcollect.required_deliverable WHERE exam_session_id = $1`,
      [ctx.sessionId],
    );
    for (const d of deliverables) {
      await collectedSubmission(ctx, 'RTE0002', d.id);
    }

    const res = await request(app.getHttpServer())
      .post(`/exam-sessions/${ctx.sessionId}/start-grading`)
      .set('Authorization', `Bearer ${owner.token}`);
    expect(res.status).toBe(200);

    const results: { filename: string; problem_id: string; rubric_id_version: string; ordinal: number; rubric_id: string }[] =
      await ds.query(
        `SELECT rd.required_filename AS filename, g.problem_id, g.rubric_id_version, p.ordinal, p.rubric_id
           FROM examcollect.grading_result g
           JOIN examcollect.submission s ON s.id = g.submission_id
           JOIN examcollect.required_deliverable rd ON rd.id = s.required_deliverable_id
           JOIN examcollect.exam_problem p ON p.id = g.problem_id
          WHERE s.exam_session_id = $1
          ORDER BY rd.required_filename`,
        [ctx.sessionId],
      );
    expect(results.map((r) => [r.filename, r.ordinal])).toEqual([
      ['bai1.cpp', 1],
      ['bai2.cpp', 2],
    ]);
    for (const r of results) {
      expect(r.rubric_id_version).toBe(r.rubric_id);
    }
    expect(results[0].rubric_id).not.toEqual(results[1].rubric_id);
  });
});
