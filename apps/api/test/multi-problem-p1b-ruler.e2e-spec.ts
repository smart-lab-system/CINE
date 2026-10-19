import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { ScoreService } from '../src/grading/scoring/score.service';
import { createTestAccount } from './helpers/create-account';
import { seedSession, SeedSession } from './helpers/grading-seed';
import { seedInvestigatorResult, seedInvestigatorSession, seedPrices, seedRule, storedWith } from './helpers/investigator-seed';

/**
 * P1b Task 8 — cờ `ruler_unverified` (§6.3b, D5). Bài đủ bằng chứng của phiên có đáp án từ Soạn đề CHƯA kiểm
 * chứng không được tự quyết. Phiên `teacher` (đáp án giảng viên viết) vẫn tự quyết như cũ.
 */
describe('P1b — thước chưa kiểm chứng không tự quyết (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  const stamp = Date.now();
  const PASSWORD = 'correct-horse-battery';
  // Cùng bộ bằng chứng mà fixture tự quyết của grade-export dùng: đủ để bài tự quyết khi thước đáng tin.
  const SEEN = [
    { ruleKey: 'sai_bien', checkedBy: 'machine' as const },
    { ruleKey: 'ten_bien', checkedBy: 'model' as const },
  ];

  async function login(label: string): Promise<{ id: string; token: string }> {
    const email = `p1b_ruler_${label}_${stamp}@example.com`;
    const id = await createTestAccount(ds, { email, password: PASSWORD, role: 'teacher' });
    const res = await request(app.getHttpServer()).post('/auth/login').send({ email, password: PASSWORD });
    return { id, token: res.body.accessToken as string };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();
    ds = app.get(DataSource);
  }, 60_000);
  afterAll(async () => app.close());

  /** Phiên có bài đủ bằng chứng; thước của phiên được đặt thành `rulerTrust` qua route thật rồi cập nhật cột. */
  async function autoCandidate(label: string, rulerTrust: 'teacher' | 'unverified'): Promise<{ resultId: string; ctx: SeedSession }> {
    const owner = await login(label);
    const ctx = await seedSession(ds, `ruler-${label}`, { teacherId: owner.id, deliverableType: 'code_project', language: 'cpp' });
    await seedInvestigatorSession(ds, ctx);
    const bien = await seedRule(ds, ctx.teacherId, 'sai_bien', 'tinh_dung', { kind: 'test_group_failed', group: 'bien' });
    const ten = await seedRule(ds, ctx.teacherId, 'ten_bien', 'trinh_bay');
    await seedPrices(ds, ctx.teacherId, { [bien.ruleId]: '1.50', [ten.ruleId]: '0.50' });

    const put = await request(app.getHttpServer())
      .put(`/exam-sessions/${ctx.sessionId}/grading-reference`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ modelAnswerNote: 'đáp án mẫu của thử nghiệm' });
    expect(put.status).toBe(200);
    await ds.query(`UPDATE examcollect.grading_reference SET ruler_trust = $2 WHERE exam_session_id = $1`, [
      ctx.sessionId,
      rulerTrust,
    ]);

    const seeded = await seedInvestigatorResult(ds, ctx, storedWith(SEEN));
    return { resultId: seeded.resultId, ctx };
  }

  it('thước unverified: bài đủ bằng chứng KHÔNG tự quyết — về flagged_for_review', async () => {
    const { resultId } = await autoCandidate('unverified', 'unverified');
    await app.get(ScoreService).computeInitial(resultId);
    const [row] = await ds.query(`SELECT status FROM examcollect.grading_result WHERE id = $1`, [resultId]);
    expect(row.status).toBe('flagged_for_review');
  });

  it('thước teacher: cùng bằng chứng vẫn tự quyết như cũ — auto_approved', async () => {
    const { resultId } = await autoCandidate('teacher', 'teacher');
    await app.get(ScoreService).computeInitial(resultId);
    const [row] = await ds.query(`SELECT status FROM examcollect.grading_result WHERE id = $1`, [resultId]);
    expect(row.status).toBe('auto_approved');
  });
});
