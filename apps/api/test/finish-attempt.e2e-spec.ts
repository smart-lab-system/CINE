import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { resultWith } from '../src/grading/decision/testing/result';
import { ErrorRuleService } from '../src/grading/rules/error-rule.service';
import { ScoreService } from '../src/grading/scoring/score.service';
import type { StoredInvestigation } from '../src/grading/scoring/stored-investigation';
import { forceStatus, seedResult, seedSession, SeedSession } from './helpers/grading-seed';
import { seedInvestigatorSession, seedPrices, seedRule, storedWith } from './helpers/investigator-seed';

const SEEN = [
  { ruleKey: 'sai_bien', checkedBy: 'machine' as const },
  { ruleKey: 'ten_bien', checkedBy: 'model' as const },
];
const META = { modelUsed: 'm', tokensIn: 100, tokensOut: 20, sandboxHost: null };

/** Kết thúc một lượt chấm điều tra: quyết kết cục TRƯỚC khi ghi (§14.4), đúng lớp (§4.4), luật còn thiếu (§2.1). */
describe('ScoreService.finishAttempt (e2e)', () => {
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

  async function world(label: string) {
    const ctx = await seedSession(ds, label);
    await seedInvestigatorSession(ds, ctx);
    const bien = await seedRule(ds, ctx.teacherId, 'sai_bien', 'tinh_dung', { kind: 'test_group_failed', group: 'bien' });
    const ten = await seedRule(ds, ctx.teacherId, 'ten_bien', 'trinh_bay');
    await seedPrices(ds, ctx.teacherId, { [bien.ruleId]: '1.50', [ten.ruleId]: '0.50' });
    return ctx;
  }
  /** Bài `investigator` ở `ai_grading` với MỘT lượt chấm đang chạy (`outcome` NULL) là lượt hiện hành. */
  async function running(ctx: SeedSession): Promise<{ resultId: string; attemptId: string }> {
    const { resultId } = await seedResult(ds, ctx, 'investigator');
    const [a] = await ds.query(
      `INSERT INTO examcollect.grading_attempt (grading_result_id, attempt_no, triggered_by) VALUES ($1, 1, $2) RETURNING id`,
      [resultId, ctx.teacherId],
    );
    await ds.query(`UPDATE examcollect.grading_result SET current_attempt_id = $2 WHERE id = $1`, [resultId, a.id]);
    return { resultId, attemptId: a.id };
  }
  const attempt = async (id: string) =>
    (
      await ds.query(
        `SELECT outcome, ungradable_class, ungradable_reason, investigation, model_used, tokens_in, finished_at IS NOT NULL AS finished
           FROM examcollect.grading_attempt WHERE id = $1`,
        [id],
      )
    )[0];
  const result = async (id: string) =>
    (await ds.query(`SELECT status, ai_total_score, ungradable_class FROM examcollect.grading_result WHERE id = $1`, [id]))[0];
  const computations = (id: string) => ds.query(`SELECT reason, score FROM examcollect.score_computation WHERE grading_result_id = $1`, [id]);

  it('ra điểm: lượt chấm graded mang đủ hồ sơ, lượt tính initial, bài tự quyết', async () => {
    const ctx = await world('fa-scored');
    const r = await running(ctx);
    const out = await scores.finishAttempt(r.resultId, r.attemptId, storedWith(SEEN), META);
    expect(out).toMatchObject({ kind: 'scored', outcome: 'auto', scoreHundredths: 850 });
    const a = await attempt(r.attemptId);
    expect(a).toMatchObject({ outcome: 'graded', ungradable_class: null, model_used: 'm', tokens_in: 100, finished: true });
    expect(a.investigation).toMatchObject({ version: 1, ruleTable: SEEN, rulesSeen: SEEN });
    expect(await computations(r.resultId)).toEqual([{ reason: 'initial', score: '8.50' }]);
    expect(await result(r.resultId)).toMatchObject({ status: 'auto_approved', ai_total_score: '8.50' });
  });

  it('cuộc điều tra tự kết luận không chấm được (bài rỗng) → lượt ungradable/submission, bài gắn cờ đúng lớp, không lượt tính', async () => {
    const ctx = await world('fa-empty');
    const r = await running(ctx);
    const stored: StoredInvestigation = {
      ...storedWith(SEEN),
      result: resultWith({ kind: 'ungradable', ungradable: { class: 'submission', reason: 'bài nộp không có dòng mã nào (T-EMPTY-1)' } }),
    };
    expect(await scores.finishAttempt(r.resultId, r.attemptId, stored, META)).toEqual({
      kind: 'ungradable',
      class: 'submission',
      reason: 'bài nộp không có dòng mã nào (T-EMPTY-1)',
    });
    expect(await attempt(r.attemptId)).toMatchObject({ outcome: 'ungradable', ungradable_class: 'submission', finished: true });
    expect(await result(r.resultId)).toMatchObject({ status: 'flagged_for_review', ai_total_score: null, ungradable_class: 'submission' });
    expect(await computations(r.resultId)).toEqual([]);
  });

  it('dưới sàn theo lõi tính điểm (gói test rỗng) → system', async () => {
    const ctx = await world('fa-floor');
    await ds.query(`UPDATE examcollect.exam_session SET test_bundle_id = NULL WHERE id = $1`, [ctx.sessionId]);
    const r = await running(ctx);
    expect(await scores.finishAttempt(r.resultId, r.attemptId, storedWith(SEEN), META)).toMatchObject({ kind: 'ungradable', class: 'system' });
    expect(await result(r.resultId)).toMatchObject({ status: 'flagged_for_review', ungradable_class: 'system' });
  });

  it('hai bài báo cùng một luật còn thiếu (khác hoa thường, khoảng trắng) → MỘT dòng proposed, bài thứ hai không nổ', async () => {
    const ctx = await world('fa-missing');
    for (const description of ['Dùng biến toàn cục thay tham số', '  dùng  BIẾN toàn cục   thay tham số ']) {
      const r = await running(ctx);
      const stored = storedWith(SEEN);
      stored.result.verdict!.missingRules = [{ description, toolCallIds: [] }];
      await scores.finishAttempt(r.resultId, r.attemptId, stored, META);
    }
    const missing = await app.get(ErrorRuleService).missing(ctx.teacherId);
    expect(missing).toHaveLength(1);
    expect(missing[0]).toMatchObject({ state: 'proposed', origin: 'agent_reported', revision: { name: 'Dùng biến toàn cục thay tham số', criterionKey: 'chua_gan' } });
  });

  it('lượt không phải lượt hiện hành, hay đã có kết cục → ném, không ghi gì', async () => {
    const ctx = await world('fa-stale');
    const r = await running(ctx);
    await scores.finishAttempt(r.resultId, r.attemptId, storedWith(SEEN), META);
    await expect(scores.finishAttempt(r.resultId, r.attemptId, storedWith(SEEN), META)).rejects.toThrow();
    expect(await computations(r.resultId)).toHaveLength(1);
  });

  it('bài từng không chấm được lớp system (lượt chấm lại) → ra điểm được, lớp lý do xoá', async () => {
    const ctx = await world('fa-regrade');
    const r = await running(ctx);
    await forceStatus(ds, r.resultId, 'ai_grading', { ungradable_class: 'system', ungradable_reason: 'sandbox chết' });
    expect(await scores.finishAttempt(r.resultId, r.attemptId, storedWith(SEEN), META)).toMatchObject({ kind: 'scored' });
    expect(await result(r.resultId)).toMatchObject({ ungradable_class: null, ai_total_score: '8.50' });
  });

  it('hỏng trước khi điều tra → finishUngradable đóng lượt đang chạy, không cần hồ sơ', async () => {
    const ctx = await world('fa-pre');
    const r = await running(ctx);
    await scores.finishUngradable(r.resultId, r.attemptId, { class: 'system', reason: 'phiên chưa ghim gói test' });
    expect(await attempt(r.attemptId)).toMatchObject({ outcome: 'ungradable', ungradable_class: 'system', investigation: null, finished: true });
    expect(await result(r.resultId)).toMatchObject({ status: 'flagged_for_review', ungradable_class: 'system' });
  });
});
