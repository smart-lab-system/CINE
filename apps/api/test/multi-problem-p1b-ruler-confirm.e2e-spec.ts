import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { createTestAccount } from './helpers/create-account';
import { seedSession, SeedSession } from './helpers/grading-seed';

/**
 * P1b 5.3 — đáp án Soạn đề mặc định chưa kiểm chứng (§6.3b). Chỉ giảng viên xác nhận mới nâng thước, và phải ghi
 * ai và khi nào. Đổi đáp án thì xác nhận cũ bị xoá. Kèm M1: `approve` trả đủ id và approvedAt.
 */
describe('P1b 5.3 — giảng viên xác nhận thước; approve trả đủ trường (e2e)', () => {
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
    const email = `p1b_ruler_confirm_${label}_${stamp}@example.com`;
    const id = await createTestAccount(ds, { email, password: PASSWORD, role: 'teacher' });
    const res = await request(app.getHttpServer()).post('/auth/login').send({ email, password: PASSWORD });
    return { id, token: res.body.accessToken as string };
  }

  /** Gắn đề một câu qua route thật: đáp án Soạn đề được ghi vào tham chiếu. */
  async function attachedOneQuestion(label: string): Promise<{ owner: { id: string; token: string }; ctx: SeedSession }> {
    const owner = await login(label);
    const ctx = await seedSession(ds, `ruler-confirm-${label}`, {
      teacherId: owner.id,
      deliverableType: 'code_project',
      language: 'cpp',
      startHoursAgo: -3,
    });
    const exam = JSON.stringify({
      title: 'Đề một câu',
      language: 'cpp',
      // Sandbox đã chạy qua: vẫn phải là chưa kiểm chứng (5.3).
      verification: { status: 'passed', ranAt: new Date().toISOString(), complexityMeasured: null },
      questions: [
        {
          statement: 'Đề',
          modelAnswer: 'int main() { return 0; }',
          topic: 'thử',
          points: 1,
          testBundle: [{ name: 'ca', group: 'co_ban', input: '1', expectedOutput: '1' }],
        },
      ],
    });
    const res = await request(app.getHttpServer())
      .post('/exam-authoring/attach')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ examSessionId: ctx.sessionId, examJson: exam });
    expect(res.status).toBe(201);
    return { owner, ctx };
  }

  it('đề Soạn đề đã gắn: đáp án mặc định chưa kiểm chứng, kể cả khi sandbox đã chạy qua', async () => {
    const { ctx } = await attachedOneQuestion('default');
    const [ref] = await ds.query(
      `SELECT model_answer_unverified, ruler_trust, ruler_confirmed_at FROM examcollect.grading_reference WHERE exam_session_id = $1`,
      [ctx.sessionId],
    );
    expect(ref).toMatchObject({ model_answer_unverified: true, ruler_trust: 'unverified', ruler_confirmed_at: null });
  });

  it('giảng viên xác nhận: thước thành teacher, ghi ai và khi nào; xác nhận lại giữ nguyên mốc đầu', async () => {
    const { owner, ctx } = await attachedOneQuestion('confirm');
    const first = await request(app.getHttpServer())
      .post(`/exam-sessions/${ctx.sessionId}/ruler/confirm`)
      .set('Authorization', `Bearer ${owner.token}`);
    expect(first.status).toBe(200);

    const [row1] = await ds.query(
      `SELECT model_answer_unverified, ruler_trust, ruler_confirmed_by, ruler_confirmed_at
         FROM examcollect.grading_reference WHERE exam_session_id = $1`,
      [ctx.sessionId],
    );
    expect(row1).toMatchObject({ model_answer_unverified: false, ruler_trust: 'teacher', ruler_confirmed_by: owner.id });
    expect(row1.ruler_confirmed_at).not.toBeNull();

    const again = await request(app.getHttpServer())
      .post(`/exam-sessions/${ctx.sessionId}/ruler/confirm`)
      .set('Authorization', `Bearer ${owner.token}`);
    expect(again.status).toBe(200);
    expect(new Date(again.body.confirmedAt).getTime()).toBe(new Date(row1.ruler_confirmed_at).getTime());
  });

  it('phiên chưa có đáp án mẫu: xác nhận → 400, không có gì để xác nhận', async () => {
    const owner = await login('noanswer');
    const ctx = await seedSession(ds, 'ruler-confirm-noanswer', { teacherId: owner.id, deliverableType: 'code_project', language: 'cpp' });
    const res = await request(app.getHttpServer())
      .post(`/exam-sessions/${ctx.sessionId}/ruler/confirm`)
      .set('Authorization', `Bearer ${owner.token}`);
    expect(res.status).toBe(400);
  });

  it('approve (M1): phản hồi có đủ id và approvedAt của gói vừa duyệt', async () => {
    const { owner, ctx } = await attachedOneQuestion('approve');
    const created = await request(app.getHttpServer())
      .post(`/exam-sessions/${ctx.sessionId}/test-bundles`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ cases: [{ caseKey: 'ca_moi', group: 'co_ban', input: '1', expectedOutput: '1' }] });
    expect(created.status).toBe(201);

    const approved = await request(app.getHttpServer())
      .post(`/exam-sessions/${ctx.sessionId}/test-bundles/${created.body.id}/approve`)
      .set('Authorization', `Bearer ${owner.token}`);
    expect(approved.status).toBe(201);
    expect(approved.body.id).toBe(created.body.id);
    expect(typeof approved.body.approvedAt).toBe('string');
    expect(Number.isNaN(new Date(approved.body.approvedAt).getTime())).toBe(false);
  });
});
