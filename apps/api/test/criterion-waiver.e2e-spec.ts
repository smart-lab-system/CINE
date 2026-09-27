import { Test } from '@nestjs/testing';
import { BadRequestException, ConflictException, INestApplication, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { CriterionWaiverService } from '../src/grading/rules/criterion-waiver.service';
import { ScoreService } from '../src/grading/scoring/score.service';
import { seedCriterion, seedSession } from './helpers/grading-seed';
import { seedInvestigatorResult, seedInvestigatorSession, seedPrices, seedRule, storedWith } from './helpers/investigator-seed';

const SEEN = [
  { ruleKey: 'sai_bien', checkedBy: 'machine' as const },
  { ruleKey: 'ten_bien', checkedBy: 'model' as const },
];

/** Đánh dấu *"tiêu chí này không có luật trừ"* giữa lô (§4.2, T-FLOOR-6, T-WAIVER-1). */
describe('Đánh dấu tiêu chí không có luật trừ (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let scores: ScoreService;
  let waivers: CriterionWaiverService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    ds = app.get(DataSource);
    scores = app.get(ScoreService);
    waivers = app.get(CriterionWaiverService);
  });
  afterAll(async () => app.close());

  /** Như các world khác, thêm tiêu chí `hieu_nang` (trần 1) mà không luật nào trỏ vào. */
  async function world(label: string) {
    const ctx = await seedSession(ds, label);
    await seedInvestigatorSession(ds, ctx);
    await seedCriterion(ds, ctx.rubricId, 'hieu_nang', 1);
    const bien = await seedRule(ds, ctx.teacherId, 'sai_bien', 'tinh_dung', { kind: 'test_group_failed', group: 'bien' });
    const ten = await seedRule(ds, ctx.teacherId, 'ten_bien', 'trinh_bay');
    await seedPrices(ds, ctx.teacherId, { [bien.ruleId]: '1.50', [ten.ruleId]: '0.50' });
    return ctx;
  }
  const statusOf = async (id: string) =>
    (await ds.query(`SELECT status FROM examcollect.grading_result WHERE id = $1`, [id]))[0].status as string;

  it('T-WAIVER-1: đánh dấu giữa lô → ghi được dù rubric đã có kết quả chấm, tính lại criterion_waiver, bài lên tự quyết; gỡ → về gắn cờ', async () => {
    const ctx = await world('wv-full');
    const { resultId } = await seedInvestigatorResult(ds, ctx, storedWith(SEEN));
    expect(await scores.computeInitial(resultId)).toMatchObject({ outcome: 'flagged' });
    const [first] = await ds.query(
      `SELECT breakdown FROM examcollect.score_computation WHERE grading_result_id = $1`,
      [resultId],
    );
    expect(first.breakdown.caseFlags.map((f: { code: string }) => f.code)).toContain('criterion_without_rules');

    const set = await waivers.set(ctx.teacherId, ctx.rubricId, 'hieu_nang');
    expect(set.recompute).toMatchObject({ recomputed: 1, promoted: 1 });
    expect(await statusOf(resultId)).toBe('auto_approved');
    const reasons = await ds.query(
      `SELECT reason FROM examcollect.score_computation WHERE grading_result_id = $1 ORDER BY created_at`,
      [resultId],
    );
    expect(reasons.map((r: { reason: string }) => r.reason)).toEqual(['initial', 'criterion_waiver']);
    expect(await waivers.list(ctx.teacherId, ctx.rubricId)).toEqual([
      { id: set.waiverId, criterionKey: 'hieu_nang', setAt: expect.any(Date) },
    ]);

    const again = await waivers.set(ctx.teacherId, ctx.rubricId, 'hieu_nang');
    expect(again).toEqual({ waiverId: set.waiverId, recompute: null });

    const revoked = await waivers.revoke(ctx.teacherId, set.waiverId);
    expect(revoked.recompute).toMatchObject({ recomputed: 1, demoted: 1 });
    expect(await statusOf(resultId)).toBe('flagged_for_review');
    expect(await waivers.list(ctx.teacherId, ctx.rubricId)).toEqual([]);
    await expect(waivers.revoke(ctx.teacherId, set.waiverId)).rejects.toBeInstanceOf(ConflictException);
  });

  it('rubric của giảng viên khác → 404; tiêu chí không có trong rubric → 400; đánh dấu của người khác → 404', async () => {
    const A = await world('wv-a');
    const B = await world('wv-b');
    await expect(waivers.set(B.teacherId, A.rubricId, 'hieu_nang')).rejects.toBeInstanceOf(NotFoundException);
    await expect(waivers.set(A.teacherId, A.rubricId, 'khong_co')).rejects.toBeInstanceOf(BadRequestException);
    const { waiverId } = await waivers.set(A.teacherId, A.rubricId, 'hieu_nang');
    await expect(waivers.revoke(B.teacherId, waiverId)).rejects.toBeInstanceOf(NotFoundException);
  });
});
