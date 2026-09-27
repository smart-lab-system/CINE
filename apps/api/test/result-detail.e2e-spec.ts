import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { createTestAccount } from './helpers/create-account';
import { seedSession } from './helpers/grading-seed';
import { seedInvestigatorResult, seedInvestigatorSession, seedPrices, seedRule, storedWith } from './helpers/investigator-seed';
import { ScoreService } from '../src/grading/scoring/score.service';

/** Chi tiết một lượt tính điểm — Hồ sơ một bài (§5, plan grading-knowledge-and-result-ui). */
describe('GET /grading-results/:id/investigation (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let scores: ScoreService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();
    ds = app.get(DataSource);
    scores = app.get(ScoreService);
  });
  afterAll(async () => app.close());

  async function login(label: string) {
    const email = `detail_${label}_${Date.now()}@example.com`;
    const id = await createTestAccount(ds, { email, password: 'correct-horse-battery', role: 'teacher' });
    const res = await request(app.getHttpServer()).post('/auth/login').send({ email, password: 'correct-horse-battery' });
    return { id, token: res.body.accessToken as string };
  }

  it('trả breakdown + đường điều tra của bài đã có điểm', async () => {
    const owner = await login('d1');
    const ctx = await seedSession(ds, 'detail-d1', { teacherId: owner.id, deliverableType: 'code_project', language: 'cpp' });
    await seedInvestigatorSession(ds, ctx);
    const bien = await seedRule(ds, owner.id, 'sai_bien', 'tinh_dung', { kind: 'test_group_failed', group: 'bien' });
    await seedPrices(ds, owner.id, { [bien.ruleId]: '1.50' });
    const { resultId } = await seedInvestigatorResult(ds, ctx, storedWith([{ ruleKey: 'sai_bien', checkedBy: 'machine' }]));
    await scores.computeInitial(resultId);

    const res = await request(app.getHttpServer())
      .get(`/grading-results/${resultId}/investigation`)
      .set('Authorization', `Bearer ${owner.token}`);

    expect(res.status).toBe(200);
    expect(res.body.pipeline).toBe('investigator');
    expect(res.body.breakdown.errors).toEqual([
      expect.objectContaining({ ruleKey: 'sai_bien', source: 'deterministic', counted: 'counted', ruleName: expect.any(String) }),
    ]);
    expect(res.body.investigation.investigation.toolCalls.length).toBeGreaterThan(0);
    expect(res.body.investigation.summary).toEqual(expect.any(String));
  });

  it('bài của giảng viên khác → 403', async () => {
    const owner = await login('d2');
    const stranger = await login('d2-stranger');
    const ctx = await seedSession(ds, 'detail-d2', { teacherId: owner.id, deliverableType: 'code_project', language: 'cpp' });
    await seedInvestigatorSession(ds, ctx);
    const { resultId } = await seedInvestigatorResult(ds, ctx, storedWith([]));
    await scores.computeInitial(resultId);

    const res = await request(app.getHttpServer())
      .get(`/grading-results/${resultId}/investigation`)
      .set('Authorization', `Bearer ${stranger.token}`);
    expect(res.status).toBe(403);
  });
});
