import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { createTestAccount } from './helpers/create-account';
import { forceStatus, seedResult, seedSession } from './helpers/grading-seed';

interface SummaryItem {
  examSessionId: string;
  byStatus: Record<string, number>;
  ungradable: number;
  hasQuestion: boolean;
}

/**
 * `GET /grading/sessions-summary` là nguồn của trạng thái chấm trên trang danh sách phiên.
 * Hai thứ nó không được sai: chỉ phiên CỦA người gọi, và phép chia "cần xem" / "không chấm được".
 */
describe('GET /grading/sessions-summary (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  const stamp = Date.now();
  let token: string;
  let teacherId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();
    ds = app.get(DataSource);

    const email = `summary_${stamp}@example.com`;
    teacherId = await createTestAccount(ds, { email, password: 'correct-horse-battery', role: 'teacher' });
    const login = await request(app.getHttpServer()).post('/auth/login').send({ email, password: 'correct-horse-battery' });
    token = login.body.accessToken as string;
  });

  afterAll(async () => {
    await app.close();
  });

  const summary = () =>
    request(app.getHttpServer()).get('/grading/sessions-summary').set('Authorization', `Bearer ${token}`);
  const find = (items: SummaryItem[], id: string) => items.find((i) => i.examSessionId === id);

  it('counts results by status and separates "không chấm được" from "cần bạn xem"', async () => {
    const ctx = await seedSession(ds, 'sumA', { teacherId, startHoursAgo: 3 });
    await seedResult(ds, ctx); // giữ nguyên ai_grading
    const approved = await seedResult(ds, ctx);
    const needsYou = await seedResult(ds, ctx);
    const ungradable = await seedResult(ds, ctx);
    await forceStatus(ds, approved.resultId, 'auto_approved');
    await forceStatus(ds, needsYou.resultId, 'flagged_for_review');
    await forceStatus(ds, ungradable.resultId, 'flagged_for_review', {
      ungradable_class: 'system',
      ungradable_reason: 'sandbox chết',
      confidence: 0,
    });

    const res = await summary().expect(200);
    const item = find(res.body.items, ctx.sessionId)!;
    expect(item.byStatus).toEqual({ ai_grading: 1, auto_approved: 1, flagged_for_review: 2 });
    expect(item.ungradable).toBe(1);
    expect(item.hasQuestion).toBe(false);
  });

  it('lists a session with no results at all, with empty counts', async () => {
    const ctx = await seedSession(ds, 'sumB', { teacherId, startHoursAgo: 6 });
    const res = await summary().expect(200);
    expect(find(res.body.items, ctx.sessionId)).toEqual({
      examSessionId: ctx.sessionId,
      byStatus: {},
      ungradable: 0,
      hasQuestion: false,
    });
  });

  it('reports hasQuestion once the grading reference names a question material', async () => {
    const ctx = await seedSession(ds, 'sumC', { teacherId, startHoursAgo: 9 });
    const [material] = await ds.query(
      `INSERT INTO examcollect.exam_material (exam_session_id, storage_key, file_name, file_size)
       VALUES ($1, $2, 'DeThi.pdf', 1024) RETURNING id`,
      [ctx.sessionId, `materials/${ctx.sessionId}/de-thi`],
    );
    await ds.query(
      `INSERT INTO examcollect.grading_reference (exam_session_id, question_material_id, created_by)
       VALUES ($1, $2, $3)`,
      [ctx.sessionId, material.id, teacherId],
    );
    const res = await summary().expect(200);
    expect(find(res.body.items, ctx.sessionId)!.hasQuestion).toBe(true);
  });

  it("never returns another teacher's sessions", async () => {
    const other = await seedSession(ds, 'sumOther'); // own teacher
    await seedResult(ds, other);
    const res = await summary().expect(200);
    expect(find(res.body.items, other.sessionId)).toBeUndefined();
  });

  it('requires a login', async () => {
    await request(app.getHttpServer()).get('/grading/sessions-summary').expect(401);
  });
});
