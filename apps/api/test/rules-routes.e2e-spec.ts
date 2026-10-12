import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { createTestAccount } from './helpers/create-account';
import { seedResult, seedSession } from './helpers/grading-seed';

/** Route cho 3f: bảng lỗi, bảng giá, ngoại lệ, chấm tay, áp giá cho phiên đã chốt. */
describe('Route bảng lỗi và bảng giá (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  const stamp = Date.now();
  let idA: string;
  let tokenA: string;
  let tokenB: string;

  async function login(label: string): Promise<{ id: string; token: string }> {
    const email = `rules_${label}_${stamp}@example.com`;
    const id = await createTestAccount(ds, { email, password: 'correct-horse-battery', role: 'teacher' });
    const res = await request(app.getHttpServer()).post('/auth/login').send({ email, password: 'correct-horse-battery' });
    return { id, token: res.body.accessToken as string };
  }
  const as = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();
    ds = app.get(DataSource);
    const a = await login('a');
    idA = a.id;
    tokenA = a.token;
    tokenB = (await login('b')).token;
  }, 60_000);
  afterAll(async () => app.close());

  // POST /rules, /rules/preview, PATCH/state qua route cũ: xoá ở A5; phủ lại ở Task A9.

  it('chấm tay "7.555" hay số → 400; hướng ngoại lệ lạ → 400; áp giá cho phiên chưa chốt → 409', async () => {
    const ctx = await seedSession(ds, 'routes', { teacherId: idA, startHoursAgo: 30 });
    const { resultId } = await seedResult(ds, ctx);
    const manual = (score: unknown) =>
      request(app.getHttpServer()).post(`/grading-results/${resultId}/manual-score`).set(as(tokenA)).send({ score });
    expect((await manual('7.555')).status).toBe(400);
    expect((await manual(7.5)).status).toBe(400);
    const exception = await request(app.getHttpServer())
      .post(`/grading-results/${resultId}/error-exceptions`)
      .set(as(tokenA))
      .send({ ruleId: '00000000-0000-4000-8000-000000000000', direction: 'maybe' });
    expect(exception.status).toBe(400);
    const reapply = await request(app.getHttpServer()).post(`/exam-sessions/${ctx.sessionId}/reapply-prices`).set(as(tokenA));
    expect(reapply.status).toBe(409);
    const preview = await request(app.getHttpServer())
      .post(`/exam-sessions/${ctx.sessionId}/reapply-prices/preview`)
      .set(as(tokenA));
    expect(preview.status).toBe(409);
    // Cùng quy ước với mọi route phiên thi khác (`findEntityForOwner`): phiên của người khác → 403.
    expect((await request(app.getHttpServer()).post(`/exam-sessions/${ctx.sessionId}/reapply-prices`).set(as(tokenB))).status).toBe(403);
  });

  it('đánh dấu tiêu chí qua route: rubric của mình → 201, của người khác → 404', async () => {
    const ctx = await seedSession(ds, 'routes-wv', { teacherId: idA, startHoursAgo: 40 });
    await ds.query(`INSERT INTO examcollect.rubric_criterion (rubric_id, description, max_points, key) VALUES ($1, 'x', 1, 'hieu_nang')`, [
      ctx.rubricId,
    ]);
    const set = await request(app.getHttpServer())
      .post(`/rubrics/${ctx.rubricId}/criterion-waivers`)
      .set(as(tokenA))
      .send({ criterionKey: 'hieu_nang' });
    expect(set.status).toBe(201);
    const list = await request(app.getHttpServer()).get(`/rubrics/${ctx.rubricId}/criterion-waivers`).set(as(tokenA));
    expect(list.body.map((w: { criterionKey: string }) => w.criterionKey)).toEqual(['hieu_nang']);
    expect(
      (await request(app.getHttpServer()).post(`/rubrics/${ctx.rubricId}/criterion-waivers`).set(as(tokenB)).send({ criterionKey: 'hieu_nang' }))
        .status,
    ).toBe(404);
    const revoke = await request(app.getHttpServer()).post(`/criterion-waivers/${set.body.waiverId}/revoke`).set(as(tokenA));
    expect(revoke.status).toBe(200);
  });
});
