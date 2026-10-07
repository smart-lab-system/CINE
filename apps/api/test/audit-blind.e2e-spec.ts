import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { ErrorRuleService } from '../src/grading/rules/error-rule.service';
import { PriceService } from '../src/grading/rules/price.service';
import { GradeExportDataService } from '../src/grade-export/grade-export.data';
import { ScoreService } from '../src/grading/scoring/score.service';
import { createTestAccount } from './helpers/create-account';
import { forceStatus, seedSession } from './helpers/grading-seed';
import { seedInvestigatorResult, seedInvestigatorSession, seedPrices, seedRule, storedWith } from './helpers/investigator-seed';

const SECRET_SCORE = '8.63'; // 10 − 1,37
const SECRET_RULE = 'sai_bien_bi_mat';

/**
 * T-SAMP-1 (parent spec): bài kiểm mẫu chưa kiểm — không đường ĐỌC nào lộ điểm hay lỗi của hệ thống. Bài này là
 * lưới an toàn cuối: một endpoint đọc mới mà quên giấu sẽ làm nó đỏ.
 */
describe('Bài kiểm mẫu chưa kiểm: mọi đường đọc đều mù (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  const stamp = Date.now();

  async function login(label: string): Promise<{ id: string; token: string }> {
    const email = `blind_${label}_${stamp}@example.com`;
    const id = await createTestAccount(ds, { email, password: 'correct-horse-battery', role: 'teacher' });
    const res = await request(app.getHttpServer()).post('/auth/login').send({ email, password: 'correct-horse-battery' });
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

  async function world(label: string) {
    const owner = await login(label);
    const ctx = await seedSession(ds, `blind-${label}`, { teacherId: owner.id, deliverableType: 'code_project', language: 'cpp' });
    await seedInvestigatorSession(ds, ctx);
    const secret = await seedRule(ds, ctx.teacherId, SECRET_RULE, 'tinh_dung', { kind: 'test_group_failed', group: 'bien' });
    await seedPrices(ds, ctx.teacherId, { [secret.ruleId]: '1.37' });
    const { resultId } = await seedInvestigatorResult(ds, ctx, storedWith([{ ruleKey: SECRET_RULE, checkedBy: 'machine' }]));
    await app.get(ScoreService).computeInitial(resultId); // → 8,63
    await forceStatus(ds, resultId, 'audit_pending', { audit_sampled: true, audit_sampled_at: new Date() });
    return { owner, ctx, secret, resultId };
  }
  const ruleCount = async (token: string) => {
    const rules: { ruleKey: string; appliedTo: { results: number } }[] = (await get(token, '/rules')).body;
    return rules.find((r) => r.ruleKey === SECRET_RULE)!.appliedTo.results;
  };

  it('danh sách: không điểm, không triage, không độ tin cậy', async () => {
    const w = await world('list');
    const res = await get(w.owner.token, `/exam-sessions/${w.ctx.sessionId}/grading-results`);
    expect(res.status).toBe(200);
    const row = (res.body as { id: string }[]).find((r) => r.id === w.resultId)!;
    expect(row).toMatchObject({
      status: 'audit_pending', aiTotalScore: null, confidence: null, currentScore: null, currentScoreSource: 'none', triage: null,
    });
    expect(JSON.stringify(res.body)).not.toContain(SECRET_SCORE);
    expect(JSON.stringify(res.body)).not.toContain(SECRET_RULE);
  });

  it('hồ sơ: không breakdown, không điều tra, không điểm', async () => {
    const w = await world('detail');
    const res = await get(w.owner.token, `/grading-results/${w.resultId}/investigation`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'audit_pending', breakdown: null, investigation: null, currentScore: null });
    expect(JSON.stringify(res.body)).not.toContain(SECRET_SCORE);
    expect(JSON.stringify(res.body)).not.toContain(SECRET_RULE);
  });

  it('văn bản bài nộp: không điểm, không luật của hệ thống', async () => {
    const w = await world('text');
    const res = await get(w.owner.token, `/grading-results/${w.resultId}/submission-text`);
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain(SECRET_SCORE);
    expect(JSON.stringify(res.body)).not.toContain(SECRET_RULE);
  });

  // Review chung G1→G5: đường đọc của G5 thêm SAU khi canary này viết. Không có route nào ghi sổ điểm khi phiên còn bài
  // `audit_pending` (phiên chưa chốt thì `preview` trả 409), nên canary đứng ở lớp nạp dữ liệu mà cả `preview` lẫn `write` dùng.
  it('xuất sổ điểm: lớp nạp dữ liệu coi bài kiểm mẫu là ô trống "chờ duyệt", không mang điểm', async () => {
    const w = await world('export');
    const { students, publishedResults } = await ds.transaction((m) =>
      app.get(GradeExportDataService).loadStudents(m, w.ctx.sessionId, null),
    );
    expect(publishedResults).toBe(0);
    const row = students.find((s) => s.outcome.kind === 'blank' && s.outcome.reason === 'flagged');
    expect(row).toBeDefined();
    expect(students.some((s) => s.outcome.kind === 'scored')).toBe(false);
    expect(JSON.stringify(students)).not.toContain(SECRET_SCORE);
    expect(JSON.stringify(students)).not.toContain('863');
  });

  it('tiến độ: chỉ số bài theo trạng thái, không lộ gì', async () => {
    const w = await world('progress');
    const res = await get(w.owner.token, `/exam-sessions/${w.ctx.sessionId}/grading-progress`);
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain(SECRET_SCORE);
  });

  // Review Focus #1 — phía luật. Hai đường trả TỪNG BÀI, hai đường rò bằng phép trừ.
  it('xem trước luật (tier 2) không trả bài kiểm mẫu và điểm `before` của nó', async () => {
    const w = await world('rprev');
    const preview = await app.get(ErrorRuleService).preview(w.ctx.teacherId, {
      ruleId: w.secret.ruleId, ruleKey: SECRET_RULE, name: SECRET_RULE, description: SECRET_RULE,
      criterionKey: 'tinh_dung', predicate: { kind: 'test_group_failed', group: 'bien' },
    });
    expect(preview.tier).toBe(2);
    expect(JSON.stringify(preview)).not.toContain(w.resultId);
    expect(JSON.stringify(preview)).not.toContain(SECRET_SCORE);
  });

  it('xem trước giá không đếm bài kiểm mẫu', async () => {
    const w = await world('pprev');
    const preview = await app.get(PriceService).preview(w.ctx.teacherId, w.secret.ruleId, '2.00');
    expect(preview.openSessions).toEqual([]);
  });

  it('số đếm của luật không tính bài kiểm mẫu — và tính lại ngay khi bài được nhận xét (loại theo TRẠNG THÁI)', async () => {
    const w = await world('rcount');
    expect(await ruleCount(w.owner.token)).toBe(0);
    expect(JSON.stringify((await get(w.owner.token, '/rules/missing')).body)).not.toContain(SECRET_SCORE);

    await forceStatus(ds, w.resultId, 'teacher_reviewed'); // đã nhận xét → hết mù
    expect(await ruleCount(w.owner.token)).toBe(1);
    const detail = await get(w.owner.token, `/grading-results/${w.resultId}/investigation`);
    expect(detail.body.breakdown).not.toBeNull();
    expect(detail.body.currentScore).toBe(8.63);
  });
});
