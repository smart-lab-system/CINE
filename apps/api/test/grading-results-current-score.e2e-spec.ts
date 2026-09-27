import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { GradingService } from '../src/grading/grading.service';
import { ScoreService } from '../src/grading/scoring/score.service';
import { scoreResult, seedResult, seedSession } from './helpers/grading-seed';
import { seedInvestigatorResult, seedInvestigatorSession, seedPrices, seedRule, storedWith } from './helpers/investigator-seed';

const SEEN = [
  { ruleKey: 'sai_bien', checkedBy: 'machine' as const },
  { ruleKey: 'ten_bien', checkedBy: 'model' as const },
];

/** Danh sách kết quả đọc điểm qua hàm *điểm hiện tại* §14.2 — không đọc thẳng `ai_total_score`. */
describe('Danh sách kết quả — điểm hiện tại (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    ds = app.get(DataSource);
  });
  afterAll(async () => app.close());

  it('đường điều tra: lượt tính mới nhất, chấm tay thắng; một-phát: như hôm nay', async () => {
    const scores = app.get(ScoreService);
    const ctx = await seedSession(ds, 'view');
    await seedInvestigatorSession(ds, ctx);
    const bien = await seedRule(ds, ctx.teacherId, 'sai_bien', 'tinh_dung', { kind: 'test_group_failed', group: 'bien' });
    const ten = await seedRule(ds, ctx.teacherId, 'ten_bien', 'trinh_bay');
    await seedPrices(ds, ctx.teacherId, { [bien.ruleId]: '1.50', [ten.ruleId]: '0.50' });

    const repriced = await seedInvestigatorResult(ds, ctx, storedWith(SEEN));
    const manual = await seedInvestigatorResult(ds, ctx, storedWith(SEEN));
    await scores.computeInitial(repriced.resultId);
    await scores.computeInitial(manual.resultId);
    await seedPrices(ds, ctx.teacherId, { [bien.ruleId]: '2.00', [ten.ruleId]: '0.50' });
    await ds.transaction((m) => scores.recomputeForTeacher(m, ctx.teacherId, 'price_change', ctx.teacherId));
    await ds.query(
      `INSERT INTO examcollect.teacher_review (grading_result_id, teacher_id, final_score, kind) VALUES ($1, $2, 4, 'manual_score')`,
      [manual.resultId, ctx.teacherId],
    );
    const { resultId: oneShot } = await seedResult(ds, ctx);
    await scoreResult(ds, oneShot, '7.00');

    const view = await app.get(GradingService).listForSession(ctx.sessionId);
    const byId = new Map(view.map((v) => [v.id, v]));
    expect(byId.get(repriced.resultId)).toMatchObject({
      pipeline: 'investigator', aiTotalScore: 8.5, currentScore: 8, currentScoreSource: 'computation',
    });
    expect(byId.get(manual.resultId)).toMatchObject({ currentScore: 4, currentScoreSource: 'manual' });
    expect(byId.get(oneShot)).toMatchObject({ pipeline: 'one_shot', currentScore: 7, currentScoreSource: 'ai' });
  });
});
