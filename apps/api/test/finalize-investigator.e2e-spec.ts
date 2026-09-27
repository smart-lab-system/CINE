import { Test } from '@nestjs/testing';
import { ConflictException, INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PriceService } from '../src/grading/rules/price.service';
import { ScoreService } from '../src/grading/scoring/score.service';
import { TeacherReviewService } from '../src/grading/teacher-review.service';
import { seedSession, SeedSession } from './helpers/grading-seed';
import { seedInvestigatorResult, seedInvestigatorSession, seedPrices, seedRule, storedWith } from './helpers/investigator-seed';

const SEEN = [
  { ruleKey: 'sai_bien', checkedBy: 'machine' as const },
  { ruleKey: 'ten_bien', checkedBy: 'model' as const },
];
const REAPPLY = 'grading_result.score_reapplied_after_finalize';

/**
 * Chốt điểm đường điều tra (§14.2), bảng giá ghim lúc chốt, và *"áp giá mới cho phiên đã chốt"*
 * (§2.2) — T-FIN-1, T-FIN-2, T-PIN-1, T-VER-2.
 */
describe('Chốt điểm đường điều tra và ghim giá (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let scores: ScoreService;
  let prices: PriceService;
  let reviews: TeacherReviewService;

  let teacherId: string;
  let A: SeedSession;
  let B: SeedSession;
  let bien: { ruleId: string };
  let v1: string;
  const resultsOf: Record<'A' | 'B', string[]> = { A: [], B: [] };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    ds = app.get(DataSource);
    scores = app.get(ScoreService);
    prices = app.get(PriceService);
    reviews = app.get(TeacherReviewService);

    // MỘT giảng viên, hai phiên dùng chung bảng lỗi và bảng giá của người đó.
    A = await seedSession(ds, 'fin-a');
    teacherId = A.teacherId;
    B = await seedSession(ds, 'fin-b', { teacherId, startHoursAgo: 10 });
    await seedInvestigatorSession(ds, A);
    await seedInvestigatorSession(ds, B);
    bien = await seedRule(ds, teacherId, 'sai_bien', 'tinh_dung', { kind: 'test_group_failed', group: 'bien' });
    const ten = await seedRule(ds, teacherId, 'ten_bien', 'trinh_bay');
    v1 = await seedPrices(ds, teacherId, { [bien.ruleId]: '1.50', [ten.ruleId]: '0.50' });
    for (const [label, ctx] of [['A', A], ['B', B]] as const) {
      for (let i = 0; i < 2; i++) {
        const { resultId } = await seedInvestigatorResult(ds, ctx, storedWith(SEEN));
        await scores.computeInitial(resultId);
        resultsOf[label].push(resultId);
      }
    }
  }, 60_000);
  afterAll(async () => app.close());

  const reapplyLogs = (ids: string[]) =>
    ds.query(
      `SELECT actor_id, old_value, new_value FROM examcollect.audit_log WHERE action = $1 AND target_id = ANY($2) ORDER BY target_id`,
      [REAPPLY, ids],
    );
  const latestComputationId = async (id: string) =>
    (
      await ds.query(
        `SELECT id FROM examcollect.score_computation WHERE grading_result_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [id],
      )
    )[0].id as string;

  it('T-FIN-2 + T-VER-2: bài tự quyết chốt thẳng, mang tên người chốt và lượt tính đã chốt, không dòng teacher_review; phiên ghim bảng giá', async () => {
    const out = await reviews.finalizeGrades(A.sessionId, teacherId);
    expect(out).toMatchObject({ finalizedDirectly: 2, acceptedAsProposed: 0, reviewedByHand: 0 });
    for (const id of resultsOf.A) {
      const [row] = await ds.query(
        `SELECT g.status, g.finalized_by, g.finalized_computation_id, c.price_table_version_id
           FROM examcollect.grading_result g
           JOIN examcollect.score_computation c ON c.id = g.finalized_computation_id
          WHERE g.id = $1`,
        [id],
      );
      expect(row).toEqual({
        status: 'finalized',
        finalized_by: teacherId,
        finalized_computation_id: await latestComputationId(id),
        price_table_version_id: v1,
      });
      expect(await ds.query(`SELECT 1 FROM examcollect.teacher_review WHERE grading_result_id = $1`, [id])).toHaveLength(0);
    }
    const [session] = await ds.query(`SELECT pinned_price_version_id FROM examcollect.exam_session WHERE id = $1`, [A.sessionId]);
    expect(session.pinned_price_version_id).toBe(v1);
  });

  it('T-PIN-1: sửa giá luật chung → phiên chưa chốt tính lại, phiên đã chốt KHÔNG đổi, không dòng audit nào; xem trước tách hai loại phiên', async () => {
    const before = await Promise.all(resultsOf.A.map(latestComputationId));
    await prices.setPrice(teacherId, bien.ruleId, '2.00', teacherId);
    expect(await Promise.all(resultsOf.A.map(latestComputationId))).toEqual(before);
    for (const id of resultsOf.B) {
      const [last] = await ds.query(
        `SELECT reason, score FROM examcollect.score_computation WHERE grading_result_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [id],
      );
      expect(last).toEqual({ reason: 'price_change', score: '8.00' });
    }
    expect(await reapplyLogs([...resultsOf.A, ...resultsOf.B])).toHaveLength(0);
    const p = await prices.preview(teacherId, bien.ruleId, '2.50');
    expect(p.finalizedSessions).toEqual([{ sessionId: A.sessionId, name: expect.any(String), affected: 2 }]);
    expect(p.openSessions.map((s) => [s.sessionId, s.affected])).toEqual([[B.sessionId, 2]]);
  });

  it('T-FIN-1: áp giá mới cho phiên đã chốt → đúng N dòng audit_log mang tên người bấm, phiên ghim bản mới; bấm lại không đổi gì', async () => {
    expect(await scores.reapplyFinalizedSession(A.sessionId, teacherId)).toEqual({ changed: 2 });
    const logs = await reapplyLogs(resultsOf.A);
    expect(logs).toHaveLength(2);
    for (const log of logs) {
      expect(log.actor_id).toBe(teacherId);
      expect(log.old_value).toMatchObject({ score: '8.50', priceTableVersionId: v1 });
      expect(log.new_value).toMatchObject({
        score: '8.00',
        changedRules: [{ ruleId: bien.ruleId, ruleKey: 'sai_bien', oldDeduction: '1.50', newDeduction: '2.00' }],
      });
    }
    for (const id of resultsOf.A) {
      const [row] = await ds.query(
        `SELECT c.reason, c.score FROM examcollect.grading_result g
           JOIN examcollect.score_computation c ON c.id = g.finalized_computation_id WHERE g.id = $1`,
        [id],
      );
      expect(row).toEqual({ reason: 'finalized_reapply', score: '8.00' });
    }
    const [session] = await ds.query(`SELECT pinned_price_version_id FROM examcollect.exam_session WHERE id = $1`, [A.sessionId]);
    expect(session.pinned_price_version_id).not.toBe(v1);

    expect(await scores.reapplyFinalizedSession(A.sessionId, teacherId)).toEqual({ changed: 0 });
    expect(await reapplyLogs(resultsOf.A)).toHaveLength(2);
  });

  it('phiên chưa chốt → 409', async () => {
    await expect(scores.reapplyFinalizedSession(B.sessionId, teacherId)).rejects.toBeInstanceOf(ConflictException);
  });
});
