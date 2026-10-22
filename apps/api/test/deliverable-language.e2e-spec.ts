import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { createTestAccount } from './helpers/create-account';
import { forceStatus, seedResult, seedSession } from './helpers/grading-seed';
import { ensureDefaultProblem } from '../src/grading/problem/resolve-problem-config';

const PASSWORD = 'correct-horse-battery';

/** G1 §3: khai ngôn ngữ bài code sau khi phiên đã tạo; bị từ chối khi đường chấm đã cố định. */
describe('Khai ngôn ngữ bài code (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  const stamp = Date.now();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();
    ds = app.get(DataSource);
  }, 60_000);
  afterAll(async () => app.close());

  async function teacher(label: string) {
    const email = `${label}_${stamp}@example.com`;
    const id = await createTestAccount(ds, { email, password: PASSWORD, role: 'teacher' });
    const login = await request(app.getHttpServer()).post('/auth/login').send({ email, password: PASSWORD });
    return { id, token: login.body.accessToken as string };
  }
  const patch = (token: string, sessionId: string, deliverableId: string, body: object) =>
    request(app.getHttpServer())
      .patch(`/exam-sessions/${sessionId}/deliverables/${deliverableId}`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);
  const detail = (token: string, sessionId: string) =>
    request(app.getHttpServer()).get(`/exam-sessions/${sessionId}`).set('Authorization', `Bearer ${token}`);
  const codeSession = async (label: string) => {
    const t = await teacher(label);
    const ctx = await seedSession(ds, label, { teacherId: t.id, deliverableType: 'code_project' });
    return { t, ctx };
  };
  const languageInDb = async (deliverableId: string) =>
    (await ds.query(`SELECT language FROM examcollect.required_deliverable WHERE id = $1`, [deliverableId]))[0].language;

  it('khai python cho bài code → 200, đường chấm là investigator, và chi tiết phiên phản ánh', async () => {
    const { t, ctx } = await codeSession('dl-python');
    const before = await detail(t.token, ctx.sessionId);
    expect(before.body.requiredDeliverables[0]).toMatchObject({ language: null, pipeline: 'one_shot' });

    const res = await patch(t.token, ctx.sessionId, ctx.deliverableId, { language: 'python' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: ctx.deliverableId, language: 'python', pipeline: 'investigator' });

    const after = await detail(t.token, ctx.sessionId);
    expect(after.body.requiredDeliverables[0]).toMatchObject({ language: 'python', pipeline: 'investigator' });
  });

  it('khai cpp cho bài code ghi luôn ngôn ngữ lên câu 1 đang trống', async () => {
    const { t, ctx } = await codeSession('dl-problem-cpp');
    await ds.transaction((m) => ensureDefaultProblem(m, ctx.sessionId));
    await ds.query(`UPDATE examcollect.exam_problem SET language = NULL WHERE exam_session_id = $1`, [ctx.sessionId]);

    const res = await patch(t.token, ctx.sessionId, ctx.deliverableId, { language: 'cpp' });
    expect(res.status).toBe(200);

    const [problem] = await ds.query(
      `SELECT language FROM examcollect.exam_problem WHERE exam_session_id = $1 AND ordinal = 1`,
      [ctx.sessionId],
    );
    expect(problem.language).toBe('cpp');
  });

  it('đổi ngôn ngữ trước khi chấm được: python → java đưa đường chấm về one_shot', async () => {
    const { t, ctx } = await codeSession('dl-switch');
    expect((await patch(t.token, ctx.sessionId, ctx.deliverableId, { language: 'python' })).status).toBe(200);
    const res = await patch(t.token, ctx.sessionId, ctx.deliverableId, { language: 'java' });
    expect(res.body).toEqual({ id: ctx.deliverableId, language: 'java', pipeline: 'one_shot' });
    expect(await languageInDb(ctx.deliverableId)).toBe('java');
  });

  it('bài không phải code → 400, không đổi gì', async () => {
    const t = await teacher('dl-doc');
    const ctx = await seedSession(ds, 'dl-doc', { teacherId: t.id, deliverableType: 'document' });
    const res = await patch(t.token, ctx.sessionId, ctx.deliverableId, { language: 'python' });
    expect(res.status).toBe(400);
    expect(await languageInDb(ctx.deliverableId)).toBeNull();
  });

  it('yêu cầu nộp của phiên KHÁC → 404', async () => {
    const t = await teacher('dl-other-session');
    const a = await seedSession(ds, 'dl-a', { teacherId: t.id, deliverableType: 'code_project' });
    const b = await seedSession(ds, 'dl-b', { teacherId: t.id, deliverableType: 'code_project', startHoursAgo: 6 });
    const res = await patch(t.token, a.sessionId, b.deliverableId, { language: 'cpp' });
    expect(res.status).toBe(404);
    expect(await languageInDb(b.deliverableId)).toBeNull();
  });

  it('giảng viên khác → 403', async () => {
    const { ctx } = await codeSession('dl-owner');
    const stranger = await teacher('dl-stranger');
    expect((await patch(stranger.token, ctx.sessionId, ctx.deliverableId, { language: 'cpp' })).status).toBe(403);
  });

  it('ngôn ngữ ngoài danh sách hoặc thiếu → 400', async () => {
    const { t, ctx } = await codeSession('dl-invalid');
    expect((await patch(t.token, ctx.sessionId, ctx.deliverableId, { language: 'rust' })).status).toBe(400);
    expect((await patch(t.token, ctx.sessionId, ctx.deliverableId, { language: null })).status).toBe(400);
    expect((await patch(t.token, ctx.sessionId, ctx.deliverableId, {})).status).toBe(400);
  });

  it('phiên đã khoá chấm (có bài đang chấm) → 409 nói khoá cùng tài liệu chấm, ngôn ngữ không đổi', async () => {
    const { t, ctx } = await codeSession('dl-locked');
    await seedResult(ds, ctx, 'one_shot'); // status ai_grading → phiên khoá
    const res = await patch(t.token, ctx.sessionId, ctx.deliverableId, { language: 'python' });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/khoá/);
    expect(await languageInDb(ctx.deliverableId)).toBeNull();
  });

  // Review Focus 2: phiên KHÔNG khoá (mọi bài là không chấm được lớp system, đã dừng — spec §2.3 luật 6) nhưng bài
  // đã có dòng kết quả, mà `pipeline` của dòng đó không đổi được nữa. Kiểm khoá một mình không bắt được ca này.
  it('phiên không khoá nhưng bài đã có dòng kết quả → 409 "đường chấm đã cố định", ngôn ngữ không đổi', async () => {
    const { t, ctx } = await codeSession('dl-has-result');
    const { resultId } = await seedResult(ds, ctx, 'one_shot');
    await forceStatus(ds, resultId, 'flagged_for_review', { ungradable_class: 'system', ungradable_reason: 'hết giờ' });
    const res = await patch(t.token, ctx.sessionId, ctx.deliverableId, { language: 'python' });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/đường chấm đã cố định/);
    expect(await languageInDb(ctx.deliverableId)).toBeNull();
  });

  it('chi tiết phiên: bài tài liệu có pipeline one_shot và language null', async () => {
    const t = await teacher('dl-detail-doc');
    const ctx = await seedSession(ds, 'dl-detail-doc', { teacherId: t.id, deliverableType: 'document' });
    const res = await detail(t.token, ctx.sessionId);
    expect(res.body.requiredDeliverables[0]).toMatchObject({ deliverableType: 'document', language: null, pipeline: 'one_shot' });
  });
});
