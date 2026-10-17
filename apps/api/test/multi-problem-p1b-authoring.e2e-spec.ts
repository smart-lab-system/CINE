import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { createTestAccount } from './helpers/create-account';
import { seedCriterion, seedSession, SeedSession } from './helpers/grading-seed';

/**
 * P1b Task 3 — `POST /exam-authoring/attach` với đề NHIỀU CÂU tạo một câu (exam_problem) cho mỗi câu,
 * mỗi câu một gói test, và ghim gói của câu 1 làm bí danh của phiên (§3.3, §10.3 mục 4).
 *
 * Theo D1 đã duyệt: mọi câu dùng chung rubric của phiên, và điểm mỗi câu PHẢI bằng tổng tiêu chí của
 * rubric đó. Đề một câu giữ hành vi cũ (điểm lấy từ rubric, không kiểm D1).
 */
describe('P1b — gắn đề nhiều câu từ Soạn đề (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  const stamp = Date.now();
  const PASSWORD = 'correct-horse-battery';

  interface Owner {
    id: string;
    token: string;
  }

  async function login(label: string): Promise<Owner> {
    const email = `p1b_author_${label}_${stamp}@example.com`;
    const id = await createTestAccount(ds, { email, password: PASSWORD, role: 'teacher' });
    const res = await request(app.getHttpServer()).post('/auth/login').send({ email, password: PASSWORD });
    return { id, token: res.body.accessToken as string };
  }

  /** Phiên chưa bắt đầu (start ở tương lai) với một rubric tổng `total` điểm; `total = 0` = rubric rỗng. */
  async function sessionWithRubric(
    label: string,
    opts: {
      total: number;
      /** Yêu cầu nộp đã khai sẵn của phiên. Mặc định: phiên chưa khai yêu cầu nộp nào (5.2: câu tự tạo bai{i}). */
      declared?: { type: 'document' | 'code_project'; language: string | null }[];
    },
  ): Promise<{ owner: Owner; session: SeedSession }> {
    const owner = await login(label);
    const session = await seedSession(ds, label, {
      teacherId: owner.id,
      deliverableType: 'code_project',
      language: 'cpp',
      startHoursAgo: -3,
    });
    // Bỏ yêu cầu nộp mặc định của seed (không có bài nào trỏ tới) để phiên bắt đầu như phiên chưa khai gì.
    await ds.query(`DELETE FROM examcollect.required_deliverable WHERE exam_session_id = $1`, [session.sessionId]);
    for (const [i, d] of (opts.declared ?? []).entries()) {
      await ds.query(
        `INSERT INTO examcollect.required_deliverable (exam_session_id, required_filename, deliverable_type, language)
         VALUES ($1, $2, $3, $4)`,
        [session.sessionId, `Khai${i + 1}.docx`, d.type, d.language],
      );
    }
    if (opts.total > 0) {
      await seedCriterion(ds, session.rubricId, 'tieu_chi_1', opts.total);
    }
    return { owner, session };
  }

  /** Đề tuỳ chỉnh: mỗi câu là (điểm, danh sách tên ca). Hình dạng khớp `parseExamJson`. */
  function examJson(questions: { points: number; cases: string[] }[]): string {
    return JSON.stringify({
      title: 'Đề nhiều câu',
      language: 'cpp',
      verification: { status: 'unverified', reason: 'sandbox_unavailable' },
      questions: questions.map((q, i) => ({
        statement: `Đề câu ${i + 1}`,
        modelAnswer: 'int main() { return 0; }',
        topic: 'thử',
        points: q.points,
        testBundle: q.cases.map((name) => ({ name, group: 'co_ban', input: '1', expectedOutput: '1' })),
      })),
    });
  }

  function attach(owner: Owner, sessionId: string, json: string) {
    return request(app.getHttpServer())
      .post('/exam-authoring/attach')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ examSessionId: sessionId, examJson: json });
  }

  async function problemsOf(sessionId: string): Promise<
    {
      id: string;
      ordinal: number;
      title: string;
      points_hundredths: number;
      statement: string | null;
      test_bundle_id: string | null;
    }[]
  > {
    return ds.query(
      `SELECT id, ordinal, title, points_hundredths, statement, test_bundle_id
         FROM examcollect.exam_problem WHERE exam_session_id = $1 ORDER BY ordinal`,
      [sessionId],
    );
  }

  async function bundlesOf(sessionId: string): Promise<{ id: string; problem_id: string }[]> {
    return ds.query(
      `SELECT id, problem_id FROM examcollect.grading_test_bundle WHERE exam_session_id = $1 ORDER BY version`,
      [sessionId],
    );
  }

  async function caseKeysOf(bundleId: string): Promise<string[]> {
    const rows: { case_key: string }[] = await ds.query(
      `SELECT case_key FROM examcollect.grading_test_case WHERE bundle_id = $1 ORDER BY case_key`,
      [bundleId],
    );
    return rows.map((r) => r.case_key);
  }

  async function materialCount(sessionId: string): Promise<number> {
    const [row] = await ds.query(`SELECT COUNT(*)::int AS n FROM examcollect.exam_material WHERE exam_session_id = $1`, [
      sessionId,
    ]);
    return row.n as number;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();
    ds = app.get(DataSource);
  });

  afterAll(async () => app.close());

  it('đề hai câu cùng điểm bằng tổng rubric: hai câu, mỗi câu một gói đúng ca của nó, câu 1 là bí danh của phiên', async () => {
    const { owner, session } = await sessionWithRubric('a1', { total: 5 });

    const res = await attach(
      owner,
      session.sessionId,
      examJson([
        { points: 5, cases: ['ca một', 'ca hai'] },
        { points: 5, cases: ['ca một'] },
      ]),
    );
    expect(res.status).toBe(201);

    const problems = await problemsOf(session.sessionId);
    expect(problems.map((p) => [p.ordinal, p.title, p.points_hundredths, p.statement])).toEqual([
      [1, 'Câu 1', 500, 'Đề câu 1'],
      [2, 'Câu 2', 500, 'Đề câu 2'],
    ]);
    const [b1, b2] = [problems[0].test_bundle_id as string, problems[1].test_bundle_id as string];
    expect(b1).not.toBeNull();
    expect(b2).not.toBeNull();
    expect(b1).not.toEqual(b2);

    // Mỗi gói thuộc đúng câu của nó: problem_id của gói trỏ về id của câu đó.
    const bundles = await bundlesOf(session.sessionId);
    const problemOfBundle = new Map(bundles.map((b) => [b.id, b.problem_id]));
    expect(problemOfBundle.get(b1)).toBe(problems[0].id);
    expect(problemOfBundle.get(b2)).toBe(problems[1].id);

    // Ca của câu 1 mang tiền tố q1-, ca của câu 2 mang tiền tố q2-; trùng tên giữa hai câu không vỡ khoá.
    expect(await caseKeysOf(b1)).toEqual(['q1-ca-hai', 'q1-ca-mot']);
    expect(await caseKeysOf(b2)).toEqual(['q2-ca-mot']);

    const [alias] = await ds.query(`SELECT test_bundle_id FROM examcollect.exam_session WHERE id = $1`, [session.sessionId]);
    expect(alias.test_bundle_id).toBe(b1);
    expect(res.body.testBundle.id).toBe(b1);
  });

  it('điểm câu có hơn hai chữ số thập phân → 400, và không ghi gì', async () => {
    const { owner, session } = await sessionWithRubric('a2', { total: 5 });

    const res = await attach(
      owner,
      session.sessionId,
      examJson([
        { points: 5, cases: ['ca'] },
        { points: 2.555, cases: ['ca'] },
      ]),
    );
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/hai chữ số thập phân/);
    expect(await problemsOf(session.sessionId)).toHaveLength(0);
    expect(await materialCount(session.sessionId)).toBe(0);
  });

  it('điểm câu khác tổng rubric mẫu: mỗi câu nhận rubric riêng co giãn đúng điểm câu (5.1, bỏ D1)', async () => {
    const { owner, session } = await sessionWithRubric('a3', { total: 5 });

    const res = await attach(
      owner,
      session.sessionId,
      examJson([
        { points: 5, cases: ['ca'] },
        { points: 6, cases: ['ca'] },
      ]),
    );
    expect(res.status).toBe(201);

    const problems = await problemsOf(session.sessionId);
    expect(problems.map((p) => p.points_hundredths)).toEqual([500, 600]);
    // Mỗi câu có rubric riêng, khác rubric mẫu của phiên, và tổng tiêu chí bằng đúng điểm câu.
    const rubricOf = async (id: string) =>
      ds.query(
        `SELECT p.rubric_id, ROUND(SUM(rc.max_points) * 100)::int AS total
           FROM examcollect.exam_problem p JOIN examcollect.rubric_criterion rc ON rc.rubric_id = p.rubric_id
          WHERE p.id = $1 GROUP BY p.rubric_id`,
        [id],
      );
    const first = await problemsOf(session.sessionId);
    const [r1] = await rubricOf(first[0].id);
    const [r2] = await rubricOf(first[1].id);
    expect([r1.total, r2.total]).toEqual([500, 600]);
    expect(r1.rubric_id).not.toEqual(r2.rubric_id);
    expect(r1.rubric_id).not.toEqual(session.rubricId);
  });

  it('phiên chưa có rubric và đề nhiều câu → 400 (D1 không có tổng để so)', async () => {
    const { owner, session } = await sessionWithRubric('a4', { total: 0 });

    const res = await attach(
      owner,
      session.sessionId,
      examJson([
        { points: 5, cases: ['ca'] },
        { points: 5, cases: ['ca'] },
      ]),
    );
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/tiêu chí/);
    expect(await problemsOf(session.sessionId)).toHaveLength(0);
  });

  it('đề nhiều câu mà yêu cầu nộp không khai ngôn ngữ (D2) → 400, và không ghi gì', async () => {
    const { owner, session } = await sessionWithRubric('a5', {
      total: 5,
      declared: [
        { type: 'document', language: null },
        { type: 'document', language: null },
      ],
    });

    const res = await attach(
      owner,
      session.sessionId,
      examJson([
        { points: 5, cases: ['ca'] },
        { points: 5, cases: ['ca'] },
      ]),
    );
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/ngôn ngữ/);
    expect(await problemsOf(session.sessionId)).toHaveLength(0);
    expect(await materialCount(session.sessionId)).toBe(0);
  });

  it('hồi quy một câu: điểm không khớp rubric vẫn 201, đúng một câu mặc định (ordinal 1) như trước', async () => {
    const { owner, session } = await sessionWithRubric('a6', { total: 5 });

    const res = await attach(owner, session.sessionId, examJson([{ points: 9, cases: ['ca một', 'ca hai'] }]));
    expect(res.status).toBe(201);

    const problems = await problemsOf(session.sessionId);
    expect(problems.map((p) => p.ordinal)).toEqual([1]);
    expect(problems[0].points_hundredths).toBe(500);
    expect(await bundlesOf(session.sessionId)).toHaveLength(1);
  });
});
