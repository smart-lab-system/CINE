import { randomUUID } from 'node:crypto';
import { getQueueToken } from '@nestjs/bullmq';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Queue } from 'bullmq';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { GRADING_QUEUE } from '../src/grading/grading.queue';
import { createTestAccount } from './helpers/create-account';
import { forceStatus, scoreResult, seedResult, seedSession, type SeedSession } from './helpers/grading-seed';

/**
 * G3 — chấm lại bài không chấm được. Hàng đợi THẬT có worker thật, nên `add`/`getJob` được `spyOn`:
 * không job nào tới tay worker, và trạng thái DB sau lời gọi đúng là thứ route vừa ghi.
 */
describe('Chấm lại bài không chấm được (e2e, hàng đợi bị spy)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let queue: Queue;
  let add: jest.SpyInstance;
  let getJob: jest.SpyInstance;
  const stamp = Date.now();

  async function login(label: string): Promise<{ id: string; token: string }> {
    const email = `regrade_${label}_${stamp}@example.com`;
    const id = await createTestAccount(ds, { email, password: 'correct-horse-battery', role: 'teacher' });
    const res = await request(app.getHttpServer()).post('/auth/login').send({ email, password: 'correct-horse-battery' });
    return { id, token: res.body.accessToken as string };
  }
  const as = (token: string) => ({ Authorization: `Bearer ${token}` });

  /** Một bài tự luận đã dừng: lớp và lý do do test chọn. */
  async function ungradable(ctx: SeedSession, kind: 'system' | 'submission', reason = 'Dịch vụ AI không phản hồi.') {
    const made = await seedResult(ds, ctx, 'one_shot');
    await forceStatus(ds, made.resultId, 'flagged_for_review', {
      ungradable_class: kind, ungradable_reason: reason, confidence: 0,
    });
    return made;
  }
  const rowOf = async (resultId: string) =>
    (await ds.query(
      `SELECT status, ungradable_class, ungradable_reason, ai_total_score FROM examcollect.grading_result WHERE id = $1`,
      [resultId],
    ))[0];
  const regrade = (token: string, resultId: string) =>
    request(app.getHttpServer()).post(`/grading-results/${resultId}/regrade`).set(as(token));

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();
    ds = app.get(DataSource);
    queue = app.get<Queue>(getQueueToken(GRADING_QUEUE));
  }, 60_000);
  afterAll(async () => app.close());

  beforeEach(() => {
    add = jest.spyOn(queue, 'add').mockResolvedValue({ id: 'gia' } as never);
    getJob = jest.spyOn(queue, 'getJob').mockResolvedValue(undefined as never);
  });
  afterEach(() => jest.restoreAllMocks());

  it('bài lớp system → về ai_grading, lớp và lý do đã xoá, job xếp đúng jobId', async () => {
    const owner = await login('a1');
    const ctx = await seedSession(ds, 'regrade-a1', { teacherId: owner.id });
    const made = await ungradable(ctx, 'system');

    const res = await regrade(owner.token, made.resultId);

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ requeued: 1, skipped: [] });
    expect(await rowOf(made.resultId)).toMatchObject({
      status: 'ai_grading', ungradable_class: null, ungradable_reason: null, ai_total_score: null,
    });
    expect(add).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledWith(
      'grade-submission',
      expect.objectContaining({
        submissionId: made.submissionId,
        requiredFilename: 'Cau1.docx',
        deliverableType: 'document',
        rubricId: ctx.rubricId,
        teacherId: owner.id,
      }),
      expect.objectContaining({ jobId: `grade-${made.submissionId}` }),
    );
  });

  // Review Focus #1 — kiểm chứng đột biến. `gradeOneShot` ghi điểm mà KHÔNG đặt lớp/lý do. Nếu route quên
  // xoá hai cột đó, `ck_grading_result_ungradable` (class IS NULL OR score IS NULL) nổ ngay ở lần ghi điểm
  // đầu — `scoreResult` mô phỏng đúng cú UPDATE ấy. Bỏ hai cột khỏi UPDATE của service thì ca này đỏ (23514).
  it('sau khi chấm lại, ghi điểm lần đầu KHÔNG vi phạm ràng buộc lớp lý do', async () => {
    const owner = await login('a2');
    const ctx = await seedSession(ds, 'regrade-a2', { teacherId: owner.id });
    const made = await ungradable(ctx, 'system');
    await regrade(owner.token, made.resultId).expect(201);

    await expect(scoreResult(ds, made.resultId, '7.00')).resolves.toBeUndefined();
    expect((await rowOf(made.resultId)).ai_total_score).toBe('7.00');
  });

  it('bài lớp submission → 400 nói lối duy nhất là chấm tay, và không đổi gì', async () => {
    const owner = await login('a3');
    const ctx = await seedSession(ds, 'regrade-a3', { teacherId: owner.id });
    const made = await ungradable(ctx, 'submission', 'Bài nộp là file rỗng.');

    const res = await regrade(owner.token, made.resultId);

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('lối duy nhất là chấm tay');
    expect(await rowOf(made.resultId)).toMatchObject({ status: 'flagged_for_review', ungradable_class: 'submission' });
    expect(add).not.toHaveBeenCalled();
  });

  it('bài đã có điểm (flagged nhưng có ai_total_score) → 400, không đổi gì', async () => {
    const owner = await login('a4');
    const ctx = await seedSession(ds, 'regrade-a4', { teacherId: owner.id });
    const made = await seedResult(ds, ctx, 'one_shot');
    await forceStatus(ds, made.resultId, 'flagged_for_review', { ai_total_score: '7.00', confidence: 0.4 });

    const res = await regrade(owner.token, made.resultId);

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('đã có kết quả');
    expect((await rowOf(made.resultId)).ai_total_score).toBe('7.00');
    expect(add).not.toHaveBeenCalled();
  });

  it('bài đang chấm → 409', async () => {
    const owner = await login('a5');
    const ctx = await seedSession(ds, 'regrade-a5', { teacherId: owner.id });
    const made = await seedResult(ds, ctx, 'one_shot'); // seedResult để bài ở ai_grading

    const res = await regrade(owner.token, made.resultId);

    expect(res.status).toBe(409);
    expect(res.body.message).toContain('đang được chấm');
  });

  // Review Focus #2 đầu-cuối: lần hai bài đã ở ai_grading với lớp NULL.
  it('bấm hai lần → lần hai nói "đang được chấm", không phải "bài làm không đọc được"; job chỉ xếp một lần', async () => {
    const owner = await login('a6');
    const ctx = await seedSession(ds, 'regrade-a6', { teacherId: owner.id });
    const made = await ungradable(ctx, 'system');

    await regrade(owner.token, made.resultId).expect(201);
    const second = await regrade(owner.token, made.resultId);

    expect(second.status).toBe(409);
    expect(second.body.message).toContain('đang được chấm');
    expect(second.body.message).not.toContain('không đọc được');
    expect(add).toHaveBeenCalledTimes(1);
  });

  it('giảng viên khác → 403, không đổi gì', async () => {
    const owner = await login('a7');
    const stranger = await login('a7-khac');
    const ctx = await seedSession(ds, 'regrade-a7', { teacherId: owner.id });
    const made = await ungradable(ctx, 'system');

    const res = await regrade(stranger.token, made.resultId);

    expect(res.status).toBe(403);
    expect((await rowOf(made.resultId)).status).toBe('flagged_for_review');
  });

  it('id không tồn tại → 404', async () => {
    const owner = await login('a8');
    expect((await regrade(owner.token, randomUUID())).status).toBe(404);
  });

  // Không có cách dựng "bài đi tiếp giữa lúc kiểm và ghi" bằng HTTP một cách tất định, nên đưa vào một dòng
  // kiểm CŨ: câu SQL nạp dòng của service trả về trạng thái đã hết hạn, trong khi DB thật đã có điểm.
  it('bài đã đi tiếp giữa lúc kiểm và lúc ghi → requeued 0 và nói vì sao', async () => {
    const owner = await login('a9');
    const ctx = await seedSession(ds, 'regrade-a9', { teacherId: owner.id });
    const made = await seedResult(ds, ctx, 'one_shot');
    await scoreResult(ds, made.resultId, '7.00'); // thật ra đã có điểm
    const [real] = await ds.query(
      `SELECT g.id, g.status, g.ai_total_score, g.ungradable_class, g.ungradable_reason, g.submission_id,
              g.rubric_id_version, rd.required_filename, rd.deliverable_type
         FROM examcollect.grading_result g
         JOIN examcollect.submission s ON s.id = g.submission_id
         JOIN examcollect.required_deliverable rd ON rd.id = s.required_deliverable_id
        WHERE g.id = $1`,
      [made.resultId],
    );
    // Chặn theo NỘI DUNG câu SQL chứ không theo thứ tự lời gọi: một guard hay bộ lọc khác cũng có thể gọi
    // `ds.query` trước service, và `mockImplementationOnce` sẽ bị nó tiêu mất.
    const original = ds.query.bind(ds);
    jest.spyOn(ds, 'query').mockImplementation(((sql: string, params?: unknown[]) =>
      sql.includes('examcollect.required_deliverable rd')
        ? Promise.resolve([
            { ...real, status: 'flagged_for_review', ai_total_score: null, ungradable_class: 'system', ungradable_reason: 'cũ' },
          ])
        : original(sql, params)) as never);

    const res = await regrade(owner.token, made.resultId);

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      requeued: 0,
      skipped: [{ resultId: made.resultId, reason: 'Bài đã đi tiếp — có lượt khác vừa xử lý nó.' }],
    });
    expect(add).not.toHaveBeenCalled();
    expect((await rowOf(made.resultId)).ai_total_score).toBe('7.00');
  });

  const fakeJob = (state: string) => ({
    getState: jest.fn().mockResolvedValue(state),
    remove: jest.fn().mockResolvedValue(undefined),
  });

  // Review Focus #3 — job hoàn tất nằm lại trong Redis 24 giờ (`removeOnComplete.age`). `queue.add` cùng
  // jobId với nó bị BullMQ bỏ qua im lặng: DB đã sang ai_grading, không job nào chạy, bài kẹt.
  it.each(['completed', 'failed'])('job %s cùng jobId còn trong Redis → bị xoá TRƯỚC khi thêm lại', async (state) => {
    const owner = await login(`b-${state}`);
    const ctx = await seedSession(ds, `regrade-b-${state}`, { teacherId: owner.id });
    const made = await ungradable(ctx, 'system');
    const ghost = fakeJob(state);
    getJob.mockResolvedValue(ghost as never);

    const res = await regrade(owner.token, made.resultId);

    expect(res.body).toEqual({ requeued: 1, skipped: [] });
    expect(getJob).toHaveBeenCalledWith(`grade-${made.submissionId}`);
    expect(ghost.remove).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledTimes(1);
    expect(ghost.remove.mock.invocationCallOrder[0]).toBeLessThan(add.mock.invocationCallOrder[0]);
  });

  // Một job đang sống sẽ đọc DB MỚI (đọc `result.pipeline`) và chấm bài này; thêm hay xoá nó là làm hỏng.
  it.each(['active', 'waiting', 'delayed', 'prioritized', 'waiting-children'])(
    'job %s → không xoá, không thêm, vẫn tính là đã xếp lại',
    async (state) => {
      const owner = await login(`c-${state}`);
      const ctx = await seedSession(ds, `regrade-c-${state}`, { teacherId: owner.id });
      const made = await ungradable(ctx, 'system');
      const live = fakeJob(state);
      getJob.mockResolvedValue(live as never);

      const res = await regrade(owner.token, made.resultId);

      expect(res.body).toEqual({ requeued: 1, skipped: [] });
      expect(live.remove).not.toHaveBeenCalled();
      expect(add).not.toHaveBeenCalled();
    },
  );

  it('job biến mất giữa hai lời gọi (state unknown) → thêm như chưa có', async () => {
    const owner = await login('d-unknown');
    const ctx = await seedSession(ds, 'regrade-d-unknown', { teacherId: owner.id });
    const made = await ungradable(ctx, 'system');
    const gone = fakeJob('unknown');
    getJob.mockResolvedValue(gone as never);

    await regrade(owner.token, made.resultId).expect(201);

    expect(gone.remove).not.toHaveBeenCalled();
    expect(add).toHaveBeenCalledTimes(1);
  });
});
