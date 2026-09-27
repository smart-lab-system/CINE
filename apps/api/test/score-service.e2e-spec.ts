import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { GradingService } from '../src/grading/grading.service';
import { latestComputationRow } from '../src/grading/scoring/score-inputs';
import { TeacherReviewService } from '../src/grading/teacher-review.service';
import { ScoreService } from '../src/grading/scoring/score.service';
import { forceStatus, seedSession } from './helpers/grading-seed';
import { seedInvestigatorResult, seedInvestigatorSession, seedPrices, seedRule, storedWith } from './helpers/investigator-seed';

const SEEN = [
  { ruleKey: 'sai_bien', checkedBy: 'machine' as const },
  { ruleKey: 'ten_bien', checkedBy: 'model' as const },
];

describe('ScoreService (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let scores: ScoreService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    ds = app.get(DataSource);
    scores = app.get(ScoreService);
  });
  afterAll(async () => app.close());

  /** Phiên, hai luật (mỗi tiêu chí một luật — T-FLOOR-6), bảng giá v1: sai_bien 1,50, ten_bien 0,50. */
  async function world(label: string) {
    const ctx = await seedSession(ds, label);
    await seedInvestigatorSession(ds, ctx);
    const bien = await seedRule(ds, ctx.teacherId, 'sai_bien', 'tinh_dung', { kind: 'test_group_failed', group: 'bien' });
    const ten = await seedRule(ds, ctx.teacherId, 'ten_bien', 'trinh_bay');
    await seedPrices(ds, ctx.teacherId, { [bien.ruleId]: '1.50', [ten.ruleId]: '0.50' });
    return { ctx, bien, ten };
  }
  const recompute = (teacherId: string, reason: Parameters<ScoreService['recomputeForTeacher']>[2], scope = {}) =>
    ds.transaction((m) => scores.recomputeForTeacher(m, teacherId, reason, teacherId, scope));
  const status = async (id: string) =>
    (
      await ds.query(
        `SELECT status, ai_total_score, audit_sampled, criterion_results FROM examcollect.grading_result WHERE id = $1`,
        [id],
      )
    )[0];
  const computations = (id: string) =>
    ds.query(`SELECT reason, score FROM examcollect.score_computation WHERE grading_result_id = $1 ORDER BY created_at`, [id]);

  it('lượt tính đầu: ghi score_computation initial, ai_total_score, criterion_results giữ [], và tự quyết khi thoả công thức', async () => {
    const { ctx } = await world('sc-initial');
    const { resultId } = await seedInvestigatorResult(ds, ctx, storedWith(SEEN));
    const out = await scores.computeInitial(resultId);
    expect(out).toMatchObject({ outcome: 'auto', scoreHundredths: 1000 - 150 });
    expect(await status(resultId)).toMatchObject({ status: 'auto_approved', ai_total_score: '8.50', criterion_results: [] });
    expect(await computations(resultId)).toEqual([{ reason: 'initial', score: '8.50' }]);
  });

  it('lượt tính đầu dưới sàn → ném, không ghi dòng nào, bài vẫn ai_grading', async () => {
    const { ctx } = await world('sc-floor');
    await ds.query(`UPDATE examcollect.exam_session SET test_bundle_id = NULL WHERE id = $1`, [ctx.sessionId]);
    const { resultId } = await seedInvestigatorResult(ds, ctx, storedWith(SEEN));
    await expect(scores.computeInitial(resultId)).rejects.toThrow(/dưới sàn/);
    expect(await computations(resultId)).toEqual([]);
    expect((await status(resultId)).status).toBe('ai_grading');
  });

  it('T-POL-1: đổi giá một luật → mọi bài chưa chốt dính luật đó tính lại ngay; bài không dính thì không', async () => {
    const { ctx, bien, ten } = await world('sc-price');
    const a = await seedInvestigatorResult(ds, ctx, storedWith(SEEN));
    const b = await seedInvestigatorResult(ds, ctx, storedWith(SEEN, [], false));
    await scores.computeInitial(a.resultId);
    await scores.computeInitial(b.resultId);
    await seedPrices(ds, ctx.teacherId, { [bien.ruleId]: '2.00', [ten.ruleId]: '0.50' });
    const sum = await recompute(ctx.teacherId, 'price_change', { ruleId: bien.ruleId });
    expect(sum.recomputed).toBe(1);
    expect((await computations(a.resultId)).map((c: { score: string }) => c.score)).toEqual(['8.50', '8.00']);
    expect(await computations(b.resultId)).toHaveLength(1);
  });

  it('T-DEMOTE-1: luật máy kiểm mới, chưa giá, có lỗi → bài tự quyết về gắn cờ; bài kiểm mẫu bị huỷ khỏi mẫu; teacher_reviewed giữ', async () => {
    const { ctx } = await world('sc-demote');
    const a = await seedInvestigatorResult(ds, ctx, storedWith(SEEN));
    const b = await seedInvestigatorResult(ds, ctx, storedWith(SEEN));
    const c = await seedInvestigatorResult(ds, ctx, storedWith(SEEN));
    for (const r of [a, b, c]) await scores.computeInitial(r.resultId);
    await forceStatus(ds, b.resultId, 'audit_pending', { audit_sampled: true, audit_sampled_at: new Date() });
    await forceStatus(ds, c.resultId, 'teacher_reviewed');
    await seedRule(ds, ctx.teacherId, 'bien_2', 'trinh_bay', { kind: 'test_group_failed', group: 'bien' });
    const sum = await recompute(ctx.teacherId, 'tier2_rule');
    expect(sum).toMatchObject({ recomputed: 3, demoted: 2 });
    expect((await status(a.resultId)).status).toBe('flagged_for_review');
    expect(await status(b.resultId)).toMatchObject({ status: 'flagged_for_review', audit_sampled: false });
    expect((await status(c.resultId)).status).toBe('teacher_reviewed');
  });

  it('đặt giá cho luật đang chặn → bài gắn cờ lên tự quyết (§14.3)', async () => {
    const { ctx, bien, ten } = await world('sc-promote');
    const extra = await seedRule(ds, ctx.teacherId, 'bien_2', 'trinh_bay', { kind: 'test_group_failed', group: 'bien' });
    const a = await seedInvestigatorResult(ds, ctx, storedWith(SEEN));
    expect(await scores.computeInitial(a.resultId)).toMatchObject({ outcome: 'flagged' });
    await seedPrices(ds, ctx.teacherId, { [bien.ruleId]: '1.50', [ten.ruleId]: '0.50', [extra.ruleId]: '0.25' });
    const sum = await recompute(ctx.teacherId, 'price_change', { ruleId: extra.ruleId });
    expect(sum.promoted).toBe(1);
    expect((await status(a.resultId)).status).toBe('auto_approved');
  });

  it('bài đã chốt không bao giờ vào lượt tính lại tầng luật (phần tính lại của T-PIN-1)', async () => {
    const { ctx, bien, ten } = await world('sc-pin');
    const a = await seedInvestigatorResult(ds, ctx, storedWith(SEEN));
    await scores.computeInitial(a.resultId);
    await forceStatus(ds, a.resultId, 'finalized', { finalized_by: ctx.teacherId, finalized_at: new Date() });
    await seedPrices(ds, ctx.teacherId, { [bien.ruleId]: '3.00', [ten.ruleId]: '0.50' });
    expect((await recompute(ctx.teacherId, 'price_change', { ruleId: bien.ruleId })).recomputed).toBe(0);
    expect(await computations(a.resultId)).toHaveLength(1);
  });

  it('T-POL-8: đổi giá của giảng viên A không đụng bài của giảng viên B', async () => {
    const A = await world('sc-a');
    const B = await world('sc-b');
    const ra = await seedInvestigatorResult(ds, A.ctx, storedWith(SEEN));
    const rb = await seedInvestigatorResult(ds, B.ctx, storedWith(SEEN));
    await scores.computeInitial(ra.resultId);
    await scores.computeInitial(rb.resultId);
    await seedPrices(ds, A.ctx.teacherId, { [A.bien.ruleId]: '4.00', [A.ten.ruleId]: '0.50' });
    await recompute(A.ctx.teacherId, 'price_change');
    expect(await computations(ra.resultId)).toHaveLength(2);
    expect(await computations(rb.resultId)).toHaveLength(1);
  });

  it('T-FAIR-1: luật lời thêm giữa lô → bài chấm sau có thấy nó cũng KHÔNG xét, cả phiên không bài nào về gắn cờ', async () => {
    const { ctx } = await world('sc-fair');
    const early = await seedInvestigatorResult(ds, ctx, storedWith(SEEN));
    await scores.computeInitial(early.resultId);
    await seedRule(ds, ctx.teacherId, 'chu_thich_sai', 'trinh_bay');
    const late = await seedInvestigatorResult(
      ds,
      ctx,
      storedWith([...SEEN, { ruleKey: 'chu_thich_sai', checkedBy: 'model' }], ['chu_thich_sai']),
    );
    expect(await scores.computeInitial(late.resultId)).toMatchObject({ outcome: 'auto', scoreHundredths: 850 });
    await recompute(ctx.teacherId, 'rule_revision');
    for (const id of [early.resultId, late.resultId]) {
      expect((await status(id)).status).toBe('auto_approved');
      const [last] = await ds.query(
        `SELECT breakdown FROM examcollect.score_computation WHERE grading_result_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [id],
      );
      expect(last.breakdown.notConsidered.map((r: { ruleKey: string }) => r.ruleKey)).toEqual(['chu_thich_sai']);
    }
  });

  it('review I2: lượt tính lại ra dưới sàn → một dòng KHÔNG điểm; điểm hiện tại "chưa có"; bài teacher_reviewed không chốt được', async () => {
    const { ctx, bien } = await world('sc-floor-re');
    // Cạn ngân sách, phát hiện duy nhất là lỗi máy quyết `sai_bien` (T-FLOOR-1: thu hồi luật đó → 0 phát hiện).
    const stored = storedWith(SEEN);
    stored.result.investigation.budget.stopReason = 'max_tool_calls';
    const a = await seedInvestigatorResult(ds, ctx, stored);
    expect(await scores.computeInitial(a.resultId)).toMatchObject({ scoreHundredths: 850 });
    await forceStatus(ds, a.resultId, 'teacher_reviewed');

    await ds.query(`UPDATE examcollect.error_rule SET state = 'retired' WHERE id = $1`, [bien.ruleId]);
    const sum = await recompute(ctx.teacherId, 'rule_revision');
    expect(sum).toMatchObject({ recomputed: 1, belowFloor: 1 });
    const latest = await latestComputationRow(ds.manager, a.resultId);
    expect(latest).toMatchObject({ score: null });
    expect(latest!.breakdown.ungradable?.reason).toMatch(/cạn ngân sách/);
    const view = await app.get(GradingService).listForSession(ctx.sessionId);
    expect(view.find((v) => v.id === a.resultId)).toMatchObject({ currentScore: null, currentScoreSource: 'none' });
    await expect(app.get(TeacherReviewService).finalizeGrades(ctx.sessionId, ctx.teacherId)).rejects.toThrow(/chấm tay/);
    expect((await status(a.resultId)).status).toBe('teacher_reviewed');
  });

  it('review C1: lượt sửa giá BẮT ĐẦU trước nhưng tính lại SAU lượt tính đầu → lượt tính mới nhất là lượt theo giá mới', async () => {
    const { ctx, bien, ten } = await world('sc-order');
    const a = await seedInvestigatorResult(ds, ctx, storedWith(SEEN));
    const runner = ds.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      // Transaction của lượt sửa giá mở TRƯỚC (now() của nó cũ hơn), nhưng chưa xin khoá.
      await runner.query(`SELECT 1`);
      await new Promise((r) => setTimeout(r, 30));
      expect(await scores.computeInitial(a.resultId)).toMatchObject({ scoreHundredths: 850 });
      const [v] = await runner.query(
        `INSERT INTO examcollect.price_table_version (teacher_id, version, created_by) VALUES ($1, 2, $1) RETURNING id`,
        [ctx.teacherId],
      );
      await runner.query(
        `INSERT INTO examcollect.rule_price (price_table_version_id, error_rule_id, teacher_id, deduction)
         VALUES ($1, $2, $4, '3.00'), ($1, $3, $4, '0.50')`,
        [v.id, bien.ruleId, ten.ruleId, ctx.teacherId],
      );
      await scores.recomputeForTeacher(runner.manager, ctx.teacherId, 'price_change', ctx.teacherId, { ruleId: bien.ruleId });
      await runner.commitTransaction();
      expect(await latestComputationRow(ds.manager, a.resultId)).toMatchObject({ priceTableVersionId: v.id, score: '7.00' });
    } finally {
      if (runner.isTransactionActive) await runner.rollbackTransaction();
      await runner.release();
    }
  });

  it('lượt tính đầu CHỜ một lượt sửa giá đang mở của cùng giảng viên, rồi tính theo giá mới', async () => {
    const { ctx, bien, ten } = await world('sc-lock');
    const a = await seedInvestigatorResult(ds, ctx, storedWith(SEEN));
    const runner = ds.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      await runner.query(`SELECT pg_advisory_xact_lock(hashtextextended('score_computation:' || $1::text, 0))`, [ctx.teacherId]);
      let settled = false;
      const pending = scores.computeInitial(a.resultId).finally(() => {
        settled = true;
      });
      await new Promise((r) => setTimeout(r, 400));
      expect(settled).toBe(false);
      const [v] = await runner.query(
        `INSERT INTO examcollect.price_table_version (teacher_id, version, created_by) VALUES ($1, 2, $1) RETURNING id`,
        [ctx.teacherId],
      );
      await runner.query(
        `INSERT INTO examcollect.rule_price (price_table_version_id, error_rule_id, teacher_id, deduction)
         VALUES ($1, $2, $4, '3.00'), ($1, $3, $4, '0.50')`,
        [v.id, bien.ruleId, ten.ruleId, ctx.teacherId],
      );
      await runner.commitTransaction();
      // Hồ sơ chỉ có lỗi máy quyết `sai_bien`; giá mới 3,00 (không phải 1,50 của v1) → 10 − 3.
      expect(await pending).toMatchObject({ scoreHundredths: 1000 - 300 });
    } finally {
      if (runner.isTransactionActive) await runner.rollbackTransaction();
      await runner.release();
    }
  });
});
