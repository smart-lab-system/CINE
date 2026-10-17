import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { GradeExportDataService } from '../src/grade-export/grade-export.data';
import { ensureDefaultProblem } from '../src/grading/problem/resolve-problem-config';
import { loadStudentTotals } from '../src/grading/problem/student-total.query';
import { createTestAccount } from './helpers/create-account';
import { forceStatus, seedSession, SeedSession } from './helpers/grading-seed';

/**
 * P1b Task 6 — canary đường đọc TỔNG: sinh viên hai câu, câu 2 đang `audit_pending` với điểm 7,00. Không đường
 * đọc nào được lộ `7.00` / `700` của câu đó, và tổng của sinh viên phải là `dash` ("—"). Mẫu từ
 * `audit-blind.e2e-spec.ts`; khác ở chỗ có hai câu, nên đường tổng mới (`loadStudentTotals`) đứng trong lưới.
 *
 * Ghi sổ điểm và tải CSV không chạy được khi còn bài `audit_pending` (preview trả 409), nên canary đứng ở lớp nạp
 * dữ liệu mà preview lẫn ghi đều dùng — cùng cách audit-blind làm.
 */
describe('P1b — canary đường đọc tổng không lộ câu chờ kiểm mẫu (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  const stamp = Date.now();
  const PASSWORD = 'correct-horse-battery';
  const MSSV = 'CANARY01';
  const SECRET = /\b7\.00\b|\b700\b/;

  async function login(label: string): Promise<{ id: string; token: string }> {
    const email = `p1b_canary_${label}_${stamp}@example.com`;
    const id = await createTestAccount(ds, { email, password: PASSWORD, role: 'teacher' });
    const res = await request(app.getHttpServer()).post('/auth/login').send({ email, password: PASSWORD });
    return { id, token: res.body.accessToken as string };
  }
  const as = (token: string) => ({ Authorization: `Bearer ${token}` });
  const get = (token: string, url: string) => request(app.getHttpServer()).get(url).set(as(token));

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();
    ds = app.get(DataSource);
  }, 60_000);
  afterAll(async () => app.close());

  /** Một bài của MSSV cho một câu; trả id kết quả. */
  async function resultFor(ctx: SeedSession, problemId: string, deliverableId: string): Promise<string> {
    const [sub] = await ds.query(
      `INSERT INTO examcollect.submission
         (exam_session_id, required_deliverable_id, student_mssv, student_name_input,
          home_class_id, home_teacher_id, status, storage_key)
       VALUES ($1, $2, $3, 'Sinh viên canary', $4, $5, 'received', NULL) RETURNING id`,
      [ctx.sessionId, deliverableId, MSSV, ctx.classId, ctx.teacherId],
    );
    for (const next of ['validated', 'collected']) {
      await ds.query(`UPDATE examcollect.submission SET status = $1 WHERE id = $2`, [next, sub.id]);
    }
    const [res] = await ds.query(
      `INSERT INTO examcollect.grading_result
         (submission_id, rubric_id_version, grading_triggered_by, status, pipeline, problem_id)
       VALUES ($1, $2, $3, 'ai_grading', 'one_shot', $4) RETURNING id`,
      [sub.id, ctx.rubricId, ctx.teacherId, problemId],
    );
    return res.id as string;
  }

  async function twoQuestionWorld(label: string) {
    const owner = await login(label);
    const ctx = await seedSession(ds, `canary-${label}`, { teacherId: owner.id, deliverableType: 'code_project', language: 'cpp' });
    const firstProblem = await ensureDefaultProblem(ds.manager, ctx.sessionId);
    // Mỗi câu nộp một file (uq_submission_identity: một bài cho một sinh viên trên một yêu cầu nộp).
    const [deliverable2] = await ds.query(
      `INSERT INTO examcollect.required_deliverable (exam_session_id, required_filename, deliverable_type, language)
       VALUES ($1, 'Cau2.docx', 'code_project', 'cpp') RETURNING id`,
      [ctx.sessionId],
    );
    const [second] = await ds.query(
      `INSERT INTO examcollect.exam_problem (exam_session_id, ordinal, title, points_hundredths, required_deliverable_id)
       VALUES ($1, 2, 'Câu 2', 500, $2) RETURNING id`,
      [ctx.sessionId, deliverable2.id],
    );
    await ds.query(
      `INSERT INTO examcollect.session_roster (exam_session_id, student_mssv, student_name, home_class_id, home_teacher_id, source)
       VALUES ($1, $2, 'Sinh viên canary', $3, $4, 'manual')`,
      [ctx.sessionId, MSSV, ctx.classId, ctx.teacherId],
    );
    await resultFor(ctx, firstProblem, ctx.deliverableId);
    const secondResult = await resultFor(ctx, second.id as string, deliverable2.id as string);
    // Câu 2 chờ kiểm mẫu với điểm 7,00: đây là thứ không được lộ.
    await forceStatus(ds, secondResult, 'audit_pending', {
      ai_total_score: '7.00',
      audit_sampled: true,
      audit_sampled_at: new Date(),
    });
    return { owner, ctx, secondResult };
  }

  it('danh sách bài chấm: không lộ 7.00 của câu chờ kiểm mẫu', async () => {
    const w = await twoQuestionWorld('list');
    // Đối chứng dương: điểm 7,00 thật sự nằm trong DB, nên việc không lộ ra không đứng trên dữ liệu rỗng.
    const [stored] = await ds.query(`SELECT ai_total_score FROM examcollect.grading_result WHERE id = $1`, [w.secondResult]);
    expect(stored.ai_total_score).toBe('7.00');
    const res = await get(w.owner.token, `/exam-sessions/${w.ctx.sessionId}/grading-results`);
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toMatch(SECRET);
  });

  it('hồ sơ câu 2: không điểm, không breakdown của câu chờ kiểm mẫu', async () => {
    const w = await twoQuestionWorld('detail');
    const res = await get(w.owner.token, `/grading-results/${w.secondResult}/investigation`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'audit_pending', currentScore: null });
    expect(JSON.stringify(res.body)).not.toMatch(SECRET);
  });

  it('tiến độ và văn bản bài nộp: không lộ điểm', async () => {
    const w = await twoQuestionWorld('progress');
    const progress = await get(w.owner.token, `/exam-sessions/${w.ctx.sessionId}/grading-progress`);
    expect(progress.status).toBe(200);
    expect(JSON.stringify(progress.body)).not.toMatch(SECRET);
    const text = await get(w.owner.token, `/grading-results/${w.secondResult}/submission-text`);
    expect(text.status).toBe(200);
    expect(JSON.stringify(text.body)).not.toMatch(SECRET);
  });

  it('lớp nạp sổ điểm: câu chờ kiểm mẫu là ô trống "chờ duyệt", không mang điểm', async () => {
    const w = await twoQuestionWorld('export');
    const { students } = await ds.transaction((m) =>
      app.get(GradeExportDataService).loadStudents(m, w.ctx.sessionId, null),
    );
    expect(students.some((s) => s.outcome.kind === 'scored')).toBe(false);
    expect(JSON.stringify(students)).not.toMatch(SECRET);
  });

  it('bảng một dòng mỗi sinh viên (Task 9): không lộ 7.00, tổng của sinh viên là dash', async () => {
    const w = await twoQuestionWorld('board');
    const res = await get(w.owner.token, `/exam-sessions/${w.ctx.sessionId}/grading-students`);
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toMatch(SECRET);
    const row = (res.body as { mssv: string; total: { kind: string } }[]).find((r) => r.mssv === MSSV);
    expect(row?.total).toEqual({ kind: 'dash' });
  });

  it('tổng của sinh viên là dash (—): có câu chờ kiểm mẫu thì không lộ số', async () => {
    const w = await twoQuestionWorld('total');
    const totals = await loadStudentTotals(ds.manager, w.ctx.sessionId);
    expect(totals.get(MSSV.toLowerCase())).toEqual({ kind: 'dash' });
  });
});
