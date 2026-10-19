import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { StorageService } from '../src/storage/storage.service';
import { createTestAccount } from './helpers/create-account';
import { seedCriterion, seedSession, SeedSession } from './helpers/grading-seed';

/**
 * P1b 5.4 — gắn lại đề. Chưa có bài chấm, chưa xác nhận đề cương, số câu giữ nguyên (và điểm từng câu với đề nhiều
 * câu): đề mới thay đề cũ tại chỗ, gói test mới được ghim, gói cũ giữ làm lịch sử. Vi phạm bất kỳ điều kiện nào thì
 * 409 kèm lý do, và không ghi gì (không có lời gọi lưu trữ nào).
 */
describe('P1b 5.4 — gắn lại đề (e2e)', () => {
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
    const email = `p1b_reattach_${label}_${stamp}@example.com`;
    const id = await createTestAccount(ds, { email, password: PASSWORD, role: 'teacher' });
    const res = await request(app.getHttpServer()).post('/auth/login').send({ email, password: PASSWORD });
    return { id, token: res.body.accessToken as string };
  }

  /** Đề với các câu (điểm, đề) cho trước. */
  function examOf(questions: { points: number; statement: string }[]): string {
    return JSON.stringify({
      title: 'Đề gắn lại',
      language: 'cpp',
      verification: { status: 'unverified', reason: 'sandbox_unavailable' },
      questions: questions.map((q, i) => ({
        statement: q.statement,
        modelAnswer: 'int main() { return 0; }',
        topic: 'thử',
        points: q.points,
        testBundle: [{ name: `ca ${i + 1}`, group: 'co_ban', input: '1', expectedOutput: '1' }],
      })),
    });
  }

  async function attach(owner: { token: string }, sessionId: string, questions: { points: number; statement: string }[]) {
    return request(app.getHttpServer())
      .post('/exam-authoring/attach')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ examSessionId: sessionId, examJson: examOf(questions) });
  }

  /** Phiên có rubric mẫu 5 điểm, chưa khai yêu cầu nộp nào (để câu tự tạo bai{i}). */
  async function freshSession(label: string): Promise<{ owner: { id: string; token: string }; ctx: SeedSession }> {
    const owner = await login(label);
    const ctx = await seedSession(ds, `reattach-${label}`, {
      teacherId: owner.id,
      deliverableType: 'code_project',
      language: 'cpp',
      startHoursAgo: -3,
    });
    await ds.query(`DELETE FROM examcollect.required_deliverable WHERE exam_session_id = $1`, [ctx.sessionId]);
    await seedCriterion(ds, ctx.rubricId, 'tieu_chi_1', 5);
    return { owner, ctx };
  }

  async function bundleCount(sessionId: string): Promise<number> {
    const [{ n }] = await ds.query(`SELECT COUNT(*)::int AS n FROM examcollect.grading_test_bundle WHERE exam_session_id = $1`, [
      sessionId,
    ]);
    return n as number;
  }

  it('một câu, chưa chấm: gắn lại → gói mới được ghim, gói cũ còn làm lịch sử', async () => {
    const { owner, ctx } = await freshSession('single');
    expect((await attach(owner, ctx.sessionId, [{ points: 5, statement: 'Đề cũ' }])).status).toBe(201);
    const [first] = await ds.query(`SELECT test_bundle_id FROM examcollect.exam_session WHERE id = $1`, [ctx.sessionId]);
    expect((await attach(owner, ctx.sessionId, [{ points: 5, statement: 'Đề mới' }])).status).toBe(201);

    const [second] = await ds.query(`SELECT test_bundle_id FROM examcollect.exam_session WHERE id = $1`, [ctx.sessionId]);
    expect(second.test_bundle_id).not.toEqual(first.test_bundle_id);
    expect(await bundleCount(ctx.sessionId)).toBe(2);
  });

  it('nhiều câu, chưa chấm, cùng số câu và điểm: gắn lại tại chỗ, mỗi câu được ghim gói mới', async () => {
    const { owner, ctx } = await freshSession('multi');
    const questions = [
      { points: 2, statement: 'Câu một' },
      { points: 3, statement: 'Câu hai' },
    ];
    expect((await attach(owner, ctx.sessionId, questions)).status).toBe(201);
    const before = await ds.query(
      `SELECT ordinal, test_bundle_id FROM examcollect.exam_problem WHERE exam_session_id = $1 ORDER BY ordinal`,
      [ctx.sessionId],
    );

    const res = await attach(owner, ctx.sessionId, [
      { points: 2, statement: 'Câu một, bản sửa' },
      { points: 3, statement: 'Câu hai, bản sửa' },
    ]);
    expect(res.status).toBe(201);

    const after = await ds.query(
      `SELECT ordinal, statement, test_bundle_id FROM examcollect.exam_problem WHERE exam_session_id = $1 ORDER BY ordinal`,
      [ctx.sessionId],
    );
    expect(after.map((p: { ordinal: number }) => p.ordinal)).toEqual([1, 2]); // không thêm, không bớt câu
    expect(after[0].statement).toBe('Câu một, bản sửa');
    expect(after[1].statement).toBe('Câu hai, bản sửa');
    expect(after[0].test_bundle_id).not.toEqual(before[0].test_bundle_id);
    expect(after[1].test_bundle_id).not.toEqual(before[1].test_bundle_id);
  });

  it('đổi số câu khi gắn lại → 409 kèm lý do, không ghi gì (không gọi lưu trữ, không thêm gói)', async () => {
    const { owner, ctx } = await freshSession('count');
    expect((await attach(owner, ctx.sessionId, [
      { points: 2, statement: 'A' },
      { points: 3, statement: 'B' },
    ])).status).toBe(201);
    const bundlesBefore = await bundleCount(ctx.sessionId);

    const storage = app.get(StorageService);
    const put = jest.spyOn(storage, 'putObject');
    try {
      const res = await attach(owner, ctx.sessionId, [
        { points: 2, statement: 'A' },
        { points: 3, statement: 'B' },
        { points: 0.5, statement: 'C' },
      ]);
      expect(res.status).toBe(409);
      expect(res.body.message).toMatch(/số câu phải giữ nguyên/);
      expect(put).not.toHaveBeenCalled();
    } finally {
      put.mockRestore();
    }
    expect(await bundleCount(ctx.sessionId)).toBe(bundlesBefore);
  });

  it('đổi điểm một câu khi gắn lại (đa câu) → 409 nêu đúng câu', async () => {
    const { owner, ctx } = await freshSession('points');
    expect((await attach(owner, ctx.sessionId, [
      { points: 2, statement: 'A' },
      { points: 3, statement: 'B' },
    ])).status).toBe(201);
    const res = await attach(owner, ctx.sessionId, [
      { points: 2, statement: 'A' },
      { points: 2.5, statement: 'B' },
    ]);
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/Điểm câu 2 đã đổi/);
  });

  it('đã có bài chấm → gắn lại 409 "phiên đã có bài chấm", không ghi gì', async () => {
    const { owner, ctx } = await freshSession('graded');
    expect((await attach(owner, ctx.sessionId, [{ points: 5, statement: 'A' }])).status).toBe(201);
    // Tạo một bài đã thu để phiên có kết quả chấm.
    const [deliverable] = await ds.query(
      `INSERT INTO examcollect.required_deliverable (exam_session_id, required_filename, deliverable_type, language)
       VALUES ($1, 'bai.cpp', 'code_project', 'cpp') RETURNING id`,
      [ctx.sessionId],
    );
    const [sub] = await ds.query(
      `INSERT INTO examcollect.submission (exam_session_id, required_deliverable_id, student_mssv, student_name_input,
                                           home_class_id, home_teacher_id, status, storage_key)
       VALUES ($1, $2, 'GRADED01', 'Sinh viên', $3, $4, 'received', NULL) RETURNING id`,
      [ctx.sessionId, deliverable.id, ctx.classId, ctx.teacherId],
    );
    for (const next of ['validated', 'collected']) {
      await ds.query(`UPDATE examcollect.submission SET status = $1 WHERE id = $2`, [next, sub.id]);
    }
    await ds.query(
      `INSERT INTO examcollect.grading_result (submission_id, rubric_id_version, grading_triggered_by, status, pipeline)
       VALUES ($1, $2, $3, 'ai_grading', 'one_shot')`,
      [sub.id, ctx.rubricId, ctx.teacherId],
    );

    const res = await attach(owner, ctx.sessionId, [{ points: 5, statement: 'B' }]);
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/đã có bài chấm/);
  });

  it('đề đã xác nhận → gắn lại 409 "đề cương đã xác nhận"', async () => {
    const { owner, ctx } = await freshSession('confirmed');
    expect((await attach(owner, ctx.sessionId, [{ points: 5, statement: 'A' }])).status).toBe(201);
    await ds.query(
      `UPDATE examcollect.exam_session SET blueprint_confirmed_at = now(), blueprint_confirmed_by = $2 WHERE id = $1`,
      [ctx.sessionId, owner.id],
    );
    const res = await attach(owner, ctx.sessionId, [{ points: 5, statement: 'B' }]);
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/Đề cương đã xác nhận/);
  });
});
