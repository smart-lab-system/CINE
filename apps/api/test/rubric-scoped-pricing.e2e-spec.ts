import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { BACKFILL_ASSIGNMENTS_SQL, BACKFILL_PRICES_SQL } from '../src/database/rubric-errors-backfill';
import { loadRuleEntries } from '../src/grading/pipeline/rule-entries';
import { PriceService } from '../src/grading/rules/price.service';
import { computeScore } from '../src/grading/scoring/score-core';
import { currentPriceVersion, latestComputationRow, loadRuleSnapshots } from '../src/grading/scoring/score-inputs';
import { ScoreService } from '../src/grading/scoring/score.service';
import { TeacherReviewService } from '../src/grading/teacher-review.service';
import { seedCriterion, seedSession, SeedSession } from './helpers/grading-seed';
import {
  assignmentId,
  rubricNameOf,
  seedAssignment,
  seedAssignmentPrices,
  seedInvestigatorResult,
  seedInvestigatorSession,
  seedPrices,
  seedRule,
  seedRuleOnly,
  storedWith,
} from './helpers/investigator-seed';

const SEEN = [
  { ruleKey: 'chung', checkedBy: 'machine' as const },
  { ruleKey: 'ten_bien', checkedBy: 'model' as const },
];

describe('Nạp luật và giá theo rubric (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let scores: ScoreService;
  let prices: PriceService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    ds = app.get(DataSource);
    scores = app.get(ScoreService);
    prices = app.get(PriceService);
  });
  afterAll(async () => app.close());

  /**
   * Một giảng viên, hai rubric (hai phiên, tên rubric khác nhau, cùng khoá tiêu chí `tinh_dung`/`trinh_bay`).
   * `chung` (máy kiểm nhóm `bien`) và `ten_bien` (bằng lời) áp cho CẢ HAI rubric, giá 1,00 / 0,50 ở cả hai.
   */
  async function twoRubrics(label: string) {
    const a = await seedSession(ds, `${label}-a`);
    await seedInvestigatorSession(ds, a);
    const b = await seedSession(ds, `${label}-b`, { teacherId: a.teacherId, startHoursAgo: 10 });
    await seedInvestigatorSession(ds, b);
    const teacherId = a.teacherId;
    const nameA = await rubricNameOf(ds, a.rubricId);
    const nameB = await rubricNameOf(ds, b.rubricId);
    const chung = await seedRule(ds, teacherId, 'chung', 'tinh_dung', { kind: 'test_group_failed', group: 'bien' });
    const ten = await seedRule(ds, teacherId, 'ten_bien', 'trinh_bay');
    await seedPrices(ds, teacherId, { [chung.ruleId]: '1.00', [ten.ruleId]: '0.50' });
    return {
      a, b, teacherId, nameA, nameB, chung, ten,
      chungA: await assignmentId(ds, teacherId, nameA, chung.ruleId),
      chungB: await assignmentId(ds, teacherId, nameB, chung.ruleId),
      tenA: await assignmentId(ds, teacherId, nameA, ten.ruleId),
      tenB: await assignmentId(ds, teacherId, nameB, ten.ruleId),
    };
  }
  const graded = async (ctx: SeedSession) => {
    const { resultId } = await seedInvestigatorResult(ds, ctx, storedWith(SEEN));
    await scores.computeInitial(resultId);
    return resultId;
  };
  const scoreOf = async (resultId: string) => (await latestComputationRow(ds.manager, resultId))!.score;

  it('T-RBE-SCORE-1: bài của rubric A không thấy luật chỉ có ở rubric B', async () => {
    const a = await seedSession(ds, 'sc1a');
    await seedInvestigatorSession(ds, a);
    const b = await seedSession(ds, 'sc1b', { teacherId: a.teacherId, startHoursAgo: 10 });
    await seedInvestigatorSession(ds, b);
    const nameA = await rubricNameOf(ds, a.rubricId);
    const nameB = await rubricNameOf(ds, b.rubricId);
    const onlyA = await seedRuleOnly(ds, a.teacherId, 'chi_a');
    const onlyB = await seedRuleOnly(ds, a.teacherId, 'chi_b');
    const idA = await seedAssignment(ds, a.teacherId, nameA, onlyA.ruleId, 'tinh_dung');
    const idB = await seedAssignment(ds, a.teacherId, nameB, onlyB.ruleId, 'tinh_dung');
    await seedAssignmentPrices(ds, a.teacherId, { [idA]: '1.00', [idB]: '2.00' });
    const price = (await currentPriceVersion(ds.manager, a.teacherId))!;
    expect((await loadRuleSnapshots(ds.manager, a.teacherId, nameA, price.id)).map((r) => r.ruleKey)).toEqual(['chi_a']);
    expect((await loadRuleSnapshots(ds.manager, a.teacherId, nameB, price.id)).map((r) => r.ruleKey)).toEqual(['chi_b']);
  });

  it('T-RBE-SCORE-2: cùng một lỗi trừ 1,00 ở A và 2,00 ở B → hai bài cùng vi phạm cho hai điểm khác nhau', async () => {
    const w = await twoRubrics('sc2');
    await seedAssignmentPrices(ds, w.teacherId, { [w.chungA]: '1.00', [w.chungB]: '2.00', [w.tenA]: '0.50', [w.tenB]: '0.50' });
    const ra = await graded(w.a);
    const rb = await graded(w.b);
    expect(await scoreOf(ra)).toBe('9.00');
    expect(await scoreOf(rb)).toBe('8.00');
  });

  it('T-RBE-SCORE-3: tiêu chí bị xoá khỏi bản rubric mới → bài theo bản mới có mismatchedRules, bài ghim bản cũ thì không', async () => {
    const w = await twoRubrics('sc3');
    // Bản 2 của rubric A chỉ còn `trinh_bay`: dòng áp dụng của `chung` (tinh_dung) trở thành mồ côi ở bản mới.
    const [v2] = await ds.query(`INSERT INTO examcollect.rubric (version, teacher_id, name) VALUES (2, $1, $2) RETURNING id`, [w.teacherId, w.nameA]);
    await seedCriterion(ds, v2.id, 'trinh_bay', 4);
    const onV1 = await graded(w.a);
    const onV2 = await graded({ ...w.a, rubricId: v2.id });
    const mismatched = async (id: string) => (await latestComputationRow(ds.manager, id))!.breakdown.mismatchedRules.map((m) => m.ruleKey);
    expect(await mismatched(onV1)).toEqual([]);
    expect(await mismatched(onV2)).toEqual(['chung']);
  });

  it('T-RBE-SCORE-4: loadRuleEntries chỉ trả lỗi của rubric của bài; cờ priced theo giá của DÒNG ÁP DỤNG đó', async () => {
    const w = await twoRubrics('sc4');
    await seedAssignmentPrices(ds, w.teacherId, { [w.chungA]: '1.00', [w.tenA]: null, [w.chungB]: '2.00', [w.tenB]: '0.50' });
    const forA = await loadRuleEntries(ds.manager, w.teacherId, w.nameA);
    expect(forA.entries.map((e) => [e.ruleKey, e.priced])).toEqual([['chung', true], ['ten_bien', false]]);
    const forB = await loadRuleEntries(ds.manager, w.teacherId, w.nameB);
    expect(forB.entries.map((e) => [e.ruleKey, e.priced])).toEqual([['chung', true], ['ten_bien', true]]);
    const only = await seedRuleOnly(ds, w.teacherId, 'chi_o_b');
    await seedAssignment(ds, w.teacherId, w.nameB, only.ruleId, 'tinh_dung');
    expect((await loadRuleEntries(ds.manager, w.teacherId, w.nameA)).entries.map((e) => e.ruleKey)).not.toContain('chi_o_b');
  });

  it('T-RBE-MIG-2: sau backfill, loader mới = loader cũ (lọc theo tiêu chí của phiên bản) trên mọi phiên bản rubric, và cùng điểm', async () => {
    const a = await seedSession(ds, 'mig2');
    await seedInvestigatorSession(ds, a);
    const nameA = await rubricNameOf(ds, a.rubricId);
    const [v2] = await ds.query(`INSERT INTO examcollect.rubric (version, teacher_id, name) VALUES (2, $1, $2) RETURNING id`, [a.teacherId, nameA]);
    await seedCriterion(ds, v2.id, 'tinh_dung', 6);
    await seedCriterion(ds, v2.id, 'hieu_nang', 4);
    // Mô hình CŨ bằng SQL thô: hai luật có giá, một luật ở tiêu chí chỉ có ở bản 2, một luật không khớp rubric nào.
    const legacy: Record<string, string> = {};
    for (const [key, crit, dedu] of [['x', 'tinh_dung', '1.00'], ['y', 'trinh_bay', '2.00'], ['z', 'hieu_nang', '0.25'], ['w', 'khong_co', '9.00']]) {
      const [r] = await ds.query(`INSERT INTO examcollect.error_rule (teacher_id, rule_key, origin, state) VALUES ($1, $2, 'teacher', 'active') RETURNING id`, [a.teacherId, key]);
      const [v] = await ds.query(
        `INSERT INTO examcollect.error_rule_revision (error_rule_id, revision, name, description, criterion_key, created_by) VALUES ($1, 1, $2, $2, $3, $4) RETURNING id`,
        [r.id, key, crit, a.teacherId],
      );
      await ds.query(`UPDATE examcollect.error_rule SET current_revision_id = $2 WHERE id = $1`, [r.id, v.id]);
      legacy[r.id] = dedu;
    }
    const [pv] = await ds.query(`INSERT INTO examcollect.price_table_version (teacher_id, version, created_by) VALUES ($1, 1, $1) RETURNING id`, [a.teacherId]);
    for (const [ruleId, dedu] of Object.entries(legacy)) {
      await ds.query(`INSERT INTO examcollect.rule_price (price_table_version_id, error_rule_id, teacher_id, deduction) VALUES ($1, $2, $3, $4)`, [pv.id, ruleId, a.teacherId, dedu]);
    }
    await ds.query(BACKFILL_ASSIGNMENTS_SQL, [a.teacherId]);
    await ds.query(BACKFILL_PRICES_SQL, [a.teacherId]);

    for (const rubricId of [a.rubricId, v2.id as string]) {
      const keys = new Set((await ds.query(`SELECT key FROM examcollect.rubric_criterion WHERE rubric_id = $1`, [rubricId])).map((r: { key: string }) => r.key));
      const oldRows = await ds.query(
        `SELECT r.rule_key, v.criterion_key, p.deduction FROM examcollect.error_rule r
           JOIN examcollect.error_rule_revision v ON v.id = r.current_revision_id
           LEFT JOIN examcollect.rule_price p ON p.error_rule_id = r.id AND p.price_table_version_id = $2
          WHERE r.teacher_id = $1 AND r.state = 'active' ORDER BY r.rule_key`,
        [a.teacherId, pv.id],
      );
      const oldView = oldRows
        .filter((r: { criterion_key: string }) => keys.has(r.criterion_key))
        .map((r: { rule_key: string; criterion_key: string; deduction: string | null }) => [r.rule_key, r.criterion_key, r.deduction === null ? null : Number(r.deduction) * 100]);
      const fresh = await loadRuleSnapshots(ds.manager, a.teacherId, nameA, pv.id);
      const newView = fresh.filter((r) => keys.has(r.criterionKey)).map((r) => [r.ruleKey, r.criterionKey, r.deductionHundredths]);
      expect(newView).toEqual(oldView);
    }
    // Cùng điểm trên cùng hồ sơ (lõi không biết luật đến từ đâu).
    // `bundleCases` khớp `storedWith` — `decide()` coi gói rỗng là dưới sàn (§4.4).
    const fresh = await loadRuleSnapshots(ds.manager, a.teacherId, nameA, pv.id);
    const out = computeScore({
      stored: storedWith([{ ruleKey: 'x', checkedBy: 'model' }], ['x']),
      bundleCases: [{ name: 'c1', group: 'co_ban' }, { name: 'c2', group: 'bien' }],
      rubric: [{ key: 'tinh_dung', maxHundredths: 600 }, { key: 'trinh_bay', maxHundredths: 400 }],
      rules: fresh, waivedCriteria: [], exceptions: new Map(), theta: 0.85,
    });
    expect(out.scoreHundredths).toBe(1000 - 100);
  });

  it('T-RBE-PRICE-1: đổi điểm trừ ở rubric A không đổi điểm trừ ở B; chỉ bài của A được tính lại', async () => {
    const w = await twoRubrics('pr1');
    const ra = await graded(w.a);
    const rb = await graded(w.b);
    await prices.setPrice(w.teacherId, w.chungA, '3.00', w.teacherId);
    expect(await scoreOf(ra)).toBe('7.00');
    expect(await scoreOf(rb)).toBe('9.00');
    const reasons = (await ds.query(`SELECT reason FROM examcollect.score_computation WHERE grading_result_id = $1 ORDER BY created_at`, [rb])).map((r: { reason: string }) => r.reason);
    expect(reasons).toEqual(['initial']); // B không bị tính lại
    const price = (await currentPriceVersion(ds.manager, w.teacherId))!;
    const rows = await ds.query(`SELECT rubric_error_id, deduction FROM examcollect.rubric_error_price WHERE price_table_version_id = $1`, [price.id]);
    expect(Object.fromEntries(rows.map((r: { rubric_error_id: string; deduction: string }) => [r.rubric_error_id, r.deduction]))).toEqual({
      [w.chungA]: '3.00', [w.chungB]: '1.00', [w.tenA]: '0.50', [w.tenB]: '0.50',
    });
  });

  it('T-RBE-PRICE-2: phiên bản giá mới chép đủ mọi dòng, kể cả dòng NULL tường minh; đặt null hợp lệ', async () => {
    const w = await twoRubrics('pr2');
    await seedAssignmentPrices(ds, w.teacherId, { [w.chungA]: '1.00', [w.chungB]: '1.00', [w.tenA]: '0.50', [w.tenB]: null });
    await prices.setPrice(w.teacherId, w.chungA, null, w.teacherId);
    const price = (await currentPriceVersion(ds.manager, w.teacherId))!;
    const rows = await ds.query(`SELECT rubric_error_id, deduction FROM examcollect.rubric_error_price WHERE price_table_version_id = $1`, [price.id]);
    expect(rows).toHaveLength(4);
    expect(Object.fromEntries(rows.map((r: { rubric_error_id: string; deduction: string | null }) => [r.rubric_error_id, r.deduction]))).toEqual({
      [w.chungA]: null, [w.chungB]: '1.00', [w.tenA]: '0.50', [w.tenB]: null,
    });
  });

  it('T-RBE-PRICE-3: xem trước đếm đúng phiên đang chấm / đã chốt CỦA RUBRIC ĐÓ', async () => {
    const w = await twoRubrics('pr3');
    for (const ctx of [w.a, w.a, w.b]) await graded(ctx);
    const [{ n: before }] = await ds.query(`SELECT count(*)::int AS n FROM examcollect.score_computation`);
    const p = await prices.preview(w.teacherId, w.chungA, '2.00');
    expect(p.openSessions).toEqual([{ sessionId: w.a.sessionId, name: expect.any(String), affected: 2, autoAfter: 2, blockedByOtherUnpriced: 0 }]);
    expect(p.finalizedSessions).toEqual([]);
    const [{ n: after }] = await ds.query(`SELECT count(*)::int AS n FROM examcollect.score_computation`);
    expect(after).toBe(before);
  });

  it('T-RBE-PRICE-4: phiên đã chốt của A giữ giá đã ghim; giá đổi ở B không đụng "áp giá mới" của A', async () => {
    const w = await twoRubrics('pr4');
    const ra = await graded(w.a);
    await app.get(TeacherReviewService).finalizeGrades(w.a.sessionId, w.teacherId);
    await prices.setPrice(w.teacherId, w.chungB, '5.00', w.teacherId);
    expect(await scoreOf(ra)).toBe('9.00');
    expect(await scores.previewReapply(w.a.sessionId, w.teacherId)).toEqual({ changes: [], skipped: [] });
    await prices.setPrice(w.teacherId, w.chungA, '2.00', w.teacherId);
    const plan = await scores.previewReapply(w.a.sessionId, w.teacherId);
    expect(plan.changes.map((c) => [c.oldScore, c.newScore])).toEqual([['9.00', '8.00']]);
  });

  it('T-RBE-PRICE-5: giảng viên khác không ghi/xem được dòng áp dụng của người khác (404)', async () => {
    const w = await twoRubrics('pr5');
    const other = await seedSession(ds, 'pr5-other');
    await expect(prices.setPrice(other.teacherId, w.chungA, '1.00', other.teacherId)).rejects.toThrow(/Không tìm thấy lỗi trong rubric/);
    await expect(prices.preview(other.teacherId, w.chungA, '1.00')).rejects.toThrow(/Không tìm thấy lỗi trong rubric/);
  });
});
