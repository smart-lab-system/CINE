import { Test } from '@nestjs/testing';
import { BadRequestException, ConflictException, INestApplication, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { SubmitReviewDto } from '../src/grading/dto/submit-review.dto';
import { GradingService } from '../src/grading/grading.service';
import { ErrorExceptionService } from '../src/grading/review/error-exception.service';
import { PriceService } from '../src/grading/rules/price.service';
import { ScoreService } from '../src/grading/scoring/score.service';
import { TeacherReviewService } from '../src/grading/teacher-review.service';
import { forceStatus, seedSession } from './helpers/grading-seed';
import { seedInvestigatorResult, seedInvestigatorSession, seedPrices, seedRule, storedWith } from './helpers/investigator-seed';

const SEEN = [
  { ruleKey: 'sai_bien', checkedBy: 'machine' as const },
  { ruleKey: 'ten_bien', checkedBy: 'model' as const },
];

/** Ngoại lệ hai cấp của §2.2: bỏ / giữ một lỗi cho riêng một bài, và chấm tay cả bài. */
describe('Ngoại lệ cấp lỗi và chấm tay (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let scores: ScoreService;
  let exceptions: ErrorExceptionService;
  let prices: PriceService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    ds = app.get(DataSource);
    scores = app.get(ScoreService);
    exceptions = app.get(ErrorExceptionService);
    prices = app.get(PriceService);
  });
  afterAll(async () => app.close());

  async function world(label: string) {
    const ctx = await seedSession(ds, label);
    await seedInvestigatorSession(ds, ctx);
    const bien = await seedRule(ds, ctx.teacherId, 'sai_bien', 'tinh_dung', { kind: 'test_group_failed', group: 'bien' });
    const ten = await seedRule(ds, ctx.teacherId, 'ten_bien', 'trinh_bay');
    await seedPrices(ds, ctx.teacherId, { [bien.ruleId]: '1.50', [ten.ruleId]: '0.50' });
    return { ctx, bien, ten };
  }
  async function graded(ctx: Awaited<ReturnType<typeof world>>['ctx'], modelErrors: string[] = []) {
    const { resultId } = await seedInvestigatorResult(ds, ctx, storedWith(SEEN, modelErrors));
    await scores.computeInitial(resultId);
    return resultId;
  }
  const statusOf = async (id: string) =>
    (await ds.query(`SELECT status FROM examcollect.grading_result WHERE id = $1`, [id]))[0].status as string;
  const scoresOf = async (id: string) =>
    (
      await ds.query(`SELECT score FROM examcollect.score_computation WHERE grading_result_id = $1 ORDER BY created_at`, [id])
    ).map((r: { score: string }) => r.score) as string[];

  it('T-POL-6 + T-REVIEW-1: bỏ một lỗi trên bài gắn cờ → một dòng error_exception không điểm, không sinh luật, bài sang teacher_reviewed', async () => {
    const { ctx, bien } = await world('ex-flagged');
    await seedRule(ds, ctx.teacherId, 'bien_2', 'trinh_bay', { kind: 'test_group_failed', group: 'bien' });
    const id = await graded(ctx);
    expect(await statusOf(id)).toBe('flagged_for_review');
    const [{ n: rulesBefore }] = await ds.query(`SELECT count(*)::int AS n FROM examcollect.error_rule WHERE teacher_id = $1`, [ctx.teacherId]);

    const out = await exceptions.setErrorException(ctx.teacherId, id, bien.ruleId, 'exclude');
    expect(out).toEqual({ scoreHundredths: 1000, status: 'teacher_reviewed' });
    expect(await scoresOf(id)).toEqual(['8.50', '10.00']);
    const rows = await ds.query(
      `SELECT kind, final_score, error_rule_id, direction FROM examcollect.teacher_review WHERE grading_result_id = $1`,
      [id],
    );
    expect(rows).toEqual([{ kind: 'error_exception', final_score: null, error_rule_id: bien.ruleId, direction: 'exclude' }]);
    const [{ n: rulesAfter }] = await ds.query(`SELECT count(*)::int AS n FROM examcollect.error_rule WHERE teacher_id = $1`, [ctx.teacherId]);
    expect(rulesAfter).toBe(rulesBefore);
  });

  it('T-REVIEW-1: bài tự quyết bỏ một lỗi, lượt tính thoả công thức → vẫn teacher_reviewed, không auto_approved', async () => {
    const { ctx, ten } = await world('ex-auto');
    const id = await graded(ctx, ['ten_bien']);
    expect(await statusOf(id)).toBe('auto_approved');
    await exceptions.setErrorException(ctx.teacherId, id, ten.ruleId, 'exclude');
    expect(await statusOf(id)).toBe('teacher_reviewed');
  });

  it('T-EXC-1: lỗi đã bỏ → đổi giá CHÍNH luật đó không đổi điểm bài; đổi giá luật khác vẫn áp', async () => {
    const { ctx, bien, ten } = await world('ex-reprice');
    const id = await graded(ctx, ['ten_bien']);
    await exceptions.setErrorException(ctx.teacherId, id, ten.ruleId, 'exclude');
    expect(await scoresOf(id)).toEqual(['8.00', '8.50']);
    await prices.setPrice(ctx.teacherId, ten.ruleId, '1.00', ctx.teacherId);
    expect(await scoresOf(id)).toEqual(['8.00', '8.50', '8.50']);
    await prices.setPrice(ctx.teacherId, bien.ruleId, '2.00', ctx.teacherId);
    expect(await scoresOf(id)).toEqual(['8.00', '8.50', '8.50', '8.00']);
    expect(await statusOf(id)).toBe('teacher_reviewed');
  });

  it('T-EXC-2: "giữ lỗi này" sau "bỏ lỗi này" → lỗi tính lại vào điểm', async () => {
    const { ctx, bien } = await world('ex-include');
    const id = await graded(ctx);
    await exceptions.setErrorException(ctx.teacherId, id, bien.ruleId, 'exclude');
    const back = await exceptions.setErrorException(ctx.teacherId, id, bien.ruleId, 'include');
    expect(back.scoreHundredths).toBe(850);
    expect(await scoresOf(id)).toEqual(['8.50', '10.00', '8.50']);
  });

  it('chấm tay → điểm hiện tại là điểm tay; sửa giá sau đó không sinh lượt tính nào cho bài đó', async () => {
    const { ctx, bien } = await world('ex-manual');
    const id = await graded(ctx);
    expect(await exceptions.setManualScore(ctx.teacherId, id, '4.00')).toEqual({ score: '4.00', status: 'teacher_reviewed' });
    const view = await app.get(GradingService).listForSession(ctx.sessionId);
    expect(view.find((v) => v.id === id)).toMatchObject({ currentScore: 4, currentScoreSource: 'manual' });
    await prices.setPrice(ctx.teacherId, bien.ruleId, '3.00', ctx.teacherId);
    expect(await scoresOf(id)).toEqual(['8.50']);
  });

  it('bài đã chốt hay đang kiểm mẫu → 409', async () => {
    const { ctx, bien } = await world('ex-state');
    const done = await graded(ctx);
    await forceStatus(ds, done, 'finalized', { finalized_by: ctx.teacherId, finalized_at: new Date() });
    await expect(exceptions.setErrorException(ctx.teacherId, done, bien.ruleId, 'exclude')).rejects.toBeInstanceOf(ConflictException);
    await expect(exceptions.setManualScore(ctx.teacherId, done, '5.00')).rejects.toBeInstanceOf(ConflictException);
    const sampled = await graded(ctx);
    await forceStatus(ds, sampled, 'audit_pending', { audit_sampled: true, audit_sampled_at: new Date() });
    await expect(exceptions.setErrorException(ctx.teacherId, sampled, bien.ruleId, 'exclude')).rejects.toBeInstanceOf(ConflictException);
  });

  it('luật của giảng viên khác → 404; luật không có trong lượt tính mới nhất → 400; chấm tay vượt trần rubric → 400', async () => {
    const A = await world('ex-a');
    const B = await world('ex-b');
    const id = await graded(A.ctx);
    await expect(exceptions.setErrorException(A.ctx.teacherId, id, B.bien.ruleId, 'exclude')).rejects.toBeInstanceOf(NotFoundException);
    await expect(exceptions.setErrorException(A.ctx.teacherId, id, A.ten.ruleId, 'exclude')).rejects.toBeInstanceOf(BadRequestException);
    await expect(exceptions.setManualScore(A.ctx.teacherId, id, '10.01')).rejects.toBeInstanceOf(BadRequestException);
    await expect(exceptions.setManualScore(A.ctx.teacherId, id, 'bảy')).rejects.toBeInstanceOf(BadRequestException);
    expect(await ds.query(`SELECT 1 FROM examcollect.teacher_review WHERE grading_result_id = $1`, [id])).toHaveLength(0);
  });

  it('đường duyệt một-phát từ chối bài đường điều tra; duyệt hàng loạt bỏ qua nó', async () => {
    const { ctx } = await world('ex-oneshot-path');
    const id = await graded(ctx);
    const reviews = app.get(TeacherReviewService);
    const result = await app.get(GradingService).findResultForOwner(id, ctx.teacherId);
    expect(reviews.isReviewable(result)).toBe(false);
    await expect(reviews.review(result, ctx.teacherId, { criteria: [] } as unknown as SubmitReviewDto)).rejects.toThrow(/bảng lỗi/);
  });
});
