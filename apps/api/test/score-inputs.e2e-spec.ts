import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { loadScoreContext, loadSessionModelRules } from '../src/grading/scoring/score-inputs';
import { seedResult, seedSession } from './helpers/grading-seed';
import { seedInvestigatorResult, seedInvestigatorSession, seedRule, storedWith } from './helpers/investigator-seed';

/** Đầu vào của lượt tính đọc từ DB (§2.2, §14.1) — hai chỗ SQL dễ sai nhất. */
describe('Đầu vào lượt tính (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    ds = app.get(DataSource);
  });
  afterAll(async () => app.close());

  it('luật lời của phiên = giao của mọi lượt chấm hiện hành, chỉ dạng model, bỏ qua bài một-phát (§2.2 tất cả hoặc không)', async () => {
    const ctx = await seedSession(ds, 'si-session');
    await seedInvestigatorSession(ds, ctx);
    await seedInvestigatorResult(ds, ctx, storedWith([
      { ruleKey: 'ten_bien', checkedBy: 'model' },
      { ruleKey: 'sai_bien', checkedBy: 'machine' },
    ]));
    await seedInvestigatorResult(ds, ctx, storedWith([
      { ruleKey: 'ten_bien', checkedBy: 'model' },
      { ruleKey: 'chu_thich_sai', checkedBy: 'model' },
    ]));
    await seedResult(ds, ctx);
    expect([...(await loadSessionModelRules(ds.manager, ctx.sessionId))]).toEqual(['ten_bien']);
  });

  it('ngữ cảnh: rubric theo thứ tự, ca của gói ghim, ngoại lệ MỚI NHẤT của từng luật thắng, có chấm tay hay chưa', async () => {
    const ctx = await seedSession(ds, 'si-ctx');
    const { bundleId } = await seedInvestigatorSession(ds, ctx);
    const rule = await seedRule(ds, ctx.teacherId, 'sai_bien', 'tinh_dung', { kind: 'test_group_failed', group: 'bien' });
    const { resultId, attemptId } = await seedInvestigatorResult(ds, ctx, storedWith([]));
    for (const [direction, at] of [['exclude', '2026-09-01T00:00:00Z'], ['include', '2026-09-02T00:00:00Z']]) {
      await ds.query(
        `INSERT INTO examcollect.teacher_review (grading_result_id, teacher_id, final_score, kind, error_rule_id, direction, reviewed_at)
         VALUES ($1, $2, NULL, 'error_exception', $3, $4, $5)`,
        [resultId, ctx.teacherId, rule.ruleId, direction, at],
      );
    }
    const c = await loadScoreContext(ds.manager, resultId);
    expect(c).toMatchObject({
      teacherId: ctx.teacherId,
      sessionId: ctx.sessionId,
      pipeline: 'investigator',
      status: 'ai_grading',
      attemptId,
      bundleId,
      bundleCases: [{ name: 'c1', group: 'co_ban' }, { name: 'c2', group: 'bien' }],
      rubric: [{ key: 'tinh_dung', maxHundredths: 600 }, { key: 'trinh_bay', maxHundredths: 400 }],
      waivedCriteria: [],
      hasManualScore: false,
    });
    expect(c.stored?.version).toBe(1);
    expect([...c.exceptions]).toEqual([[rule.ruleId, 'include']]);
  });
});
