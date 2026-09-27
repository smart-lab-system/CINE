import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { ErrorRuleService } from '../src/grading/rules/error-rule.service';
import { PriceService } from '../src/grading/rules/price.service';
import { ScoreService } from '../src/grading/scoring/score.service';
import { seedSession } from './helpers/grading-seed';
import { seedInvestigatorResult, seedInvestigatorSession, seedPrices, seedRule, storedWith } from './helpers/investigator-seed';

const SEEN = [
  { ruleKey: 'sai_bien', checkedBy: 'machine' as const },
  { ruleKey: 'ten_bien', checkedBy: 'model' as const },
];

/** Bảng lỗi có bản sửa, bảng giá có phiên bản, xem trước tác động (§2.1, §2.2, §14.1). */
describe('Luật và giá (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let scores: ScoreService;
  let rules: ErrorRuleService;
  let prices: PriceService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    ds = app.get(DataSource);
    scores = app.get(ScoreService);
    rules = app.get(ErrorRuleService);
    prices = app.get(PriceService);
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

  it('T-RULEREV-1: đổi tiêu chí → bản sửa 2, luật trỏ bản 2, lượt tính cũ vẫn mang bản 1', async () => {
    const { ctx, ten } = await world('rr-rev');
    const a = await seedInvestigatorResult(ds, ctx, storedWith(SEEN, ['ten_bien']));
    await scores.computeInitial(a.resultId);
    const { revisionId } = await rules.revise(ctx.teacherId, ten.ruleId, { criterionKey: 'tinh_dung' });
    const revs = await ds.query(
      `SELECT revision FROM examcollect.error_rule_revision WHERE error_rule_id = $1 ORDER BY revision`,
      [ten.ruleId],
    );
    expect(revs.map((r: { revision: number }) => r.revision)).toEqual([1, 2]);
    const [rule] = await ds.query(`SELECT current_revision_id FROM examcollect.error_rule WHERE id = $1`, [ten.ruleId]);
    expect(rule.current_revision_id).toBe(revisionId);
    const rows = await ds.query(
      `SELECT reason, breakdown FROM examcollect.score_computation WHERE grading_result_id = $1 ORDER BY created_at`,
      [a.resultId],
    );
    expect(rows.map((r: { reason: string }) => r.reason)).toEqual(['initial', 'rule_revision']);
    const revOf = (b: { errors: { ruleKey: string; revisionId: string }[] }) =>
      b.errors.find((e) => e.ruleKey === 'ten_bien')!.revisionId;
    expect(revOf(rows[0].breakdown)).toBe(ten.revisionId);
    expect(revOf(rows[1].breakdown)).toBe(revisionId);
  });

  it('sửa chữ của luật (tên, mô tả) → bản sửa mới, KHÔNG tính lại', async () => {
    const { ctx, ten } = await world('rr-text');
    const a = await seedInvestigatorResult(ds, ctx, storedWith(SEEN));
    await scores.computeInitial(a.resultId);
    await rules.revise(ctx.teacherId, ten.ruleId, { name: 'Tên biến khó đọc' });
    expect(await ds.query(`SELECT 1 FROM examcollect.score_computation WHERE grading_result_id = $1`, [a.resultId])).toHaveLength(1);
  });

  it('T-VER-1: sửa giá hai lần → hai phiên bản mới, mỗi bản chép đủ bảng; dòng cũ không đổi', async () => {
    const { ctx, bien, ten } = await world('rr-ver');
    await prices.setPrice(ctx.teacherId, bien.ruleId, '2.00', ctx.teacherId);
    await prices.setPrice(ctx.teacherId, ten.ruleId, '0.75', ctx.teacherId);
    const rows = await ds.query(
      `SELECT v.version, p.deduction FROM examcollect.price_table_version v
         JOIN examcollect.rule_price p ON p.price_table_version_id = v.id
        WHERE v.teacher_id = $1 ORDER BY v.version, p.deduction`,
      [ctx.teacherId],
    );
    expect(rows.map((r: { version: number; deduction: string }) => [r.version, r.deduction])).toEqual([
      [1, '0.50'], [1, '1.50'], [2, '0.50'], [2, '2.00'], [3, '0.75'], [3, '2.00'],
    ]);
  });

  it('T-POL-5: xem trước một giá trả đúng số bài theo phiên chưa chốt, và không ghi gì', async () => {
    const { ctx } = await world('rr-preview');
    const extra = await seedRule(ds, ctx.teacherId, 'bien_2', 'trinh_bay', { kind: 'test_group_failed', group: 'bien' });
    for (let i = 0; i < 2; i++) await scores.computeInitial((await seedInvestigatorResult(ds, ctx, storedWith(SEEN))).resultId);
    const [{ n: before }] = await ds.query(`SELECT count(*)::int AS n FROM examcollect.score_computation`);
    const p = await prices.preview(ctx.teacherId, extra.ruleId, '0.25');
    expect(p.openSessions).toEqual([
      { sessionId: ctx.sessionId, name: expect.any(String), affected: 2, autoAfter: 2, blockedByOtherUnpriced: 0 },
    ]);
    expect(p.finalizedSessions).toEqual([]);
    const [{ n: after }] = await ds.query(`SELECT count(*)::int AS n FROM examcollect.score_computation`);
    expect(after).toBe(before);
    expect(
      await ds.query(`SELECT 1 FROM examcollect.price_table_version WHERE teacher_id = $1 AND version > 1`, [ctx.teacherId]),
    ).toHaveLength(0);
  });

  it('T-POL-8: giá và bản sửa trên luật của giảng viên khác → 404', async () => {
    const A = await world('rr-a');
    const B = await world('rr-b');
    await expect(prices.setPrice(B.ctx.teacherId, A.bien.ruleId, '1.00', B.ctx.teacherId)).rejects.toThrow(/Không tìm thấy luật/);
    await expect(rules.revise(B.ctx.teacherId, A.bien.ruleId, { name: 'x' })).rejects.toThrow(/Không tìm thấy luật/);
    await expect(prices.preview(B.ctx.teacherId, A.bien.ruleId, '1.00')).rejects.toThrow(/Không tìm thấy luật/);
  });

  it('list: appliedTo đếm bài của lượt tính mới nhất; trùng ruleKey → 409', async () => {
    const { ctx } = await world('rr-list');
    for (let i = 0; i < 2; i++) await scores.computeInitial((await seedInvestigatorResult(ds, ctx, storedWith(SEEN))).resultId);
    const list = await rules.list(ctx.teacherId);
    expect(list.find((r) => r.ruleKey === 'sai_bien')).toMatchObject({
      deduction: '1.50',
      checkedBy: 'machine',
      appliedTo: { results: 2, sessions: 1 },
      mismatchedIn: 0,
    });
    expect(list.find((r) => r.ruleKey === 'ten_bien')).toMatchObject({ checkedBy: 'model', appliedTo: { results: 0, sessions: 0 } });
    await expect(
      rules.create(ctx.teacherId, { ruleKey: 'sai_bien', name: 'x', description: 'x', criterionKey: 'tinh_dung', predicate: null }),
    ).rejects.toThrow(/đã có/);
  });

  it('tạo luật máy kiểm → tính lại bậc 2 ngay; tạo luật lời → không tính lại (T-FAIR-1)', async () => {
    const { ctx } = await world('rr-create');
    const a = await seedInvestigatorResult(ds, ctx, storedWith(SEEN));
    await scores.computeInitial(a.resultId);
    const machine = await rules.create(ctx.teacherId, {
      ruleKey: 'bien_3', name: 'x', description: 'x', criterionKey: 'trinh_bay', predicate: { kind: 'test_group_failed', group: 'bien' },
    });
    expect(machine.recompute).toMatchObject({ recomputed: 1, demoted: 1 });
    const verbal = await rules.create(ctx.teacherId, { ruleKey: 'loi_moi', name: 'x', description: 'x', criterionKey: 'trinh_bay', predicate: null });
    expect(verbal.recompute).toBeNull();
  });

  it('preview luật: máy kiểm → bậc 2 kèm điểm trước/sau; bằng lời → bậc 4, phiên đã chấm "không xét"', async () => {
    const { ctx } = await world('rr-tier');
    const a = await seedInvestigatorResult(ds, ctx, storedWith(SEEN, ['ten_bien']));
    await scores.computeInitial(a.resultId);
    const t2 = await rules.preview(ctx.teacherId, {
      ruleKey: 'bien_3', name: 'x', description: 'x', criterionKey: 'trinh_bay',
      predicate: { kind: 'test_group_failed', group: 'bien' }, deduction: '0.40',
    });
    expect(t2).toEqual({ tier: 2, results: [{ resultId: a.resultId, sessionId: ctx.sessionId, before: '8.00', after: 760, capped: false }] });
    const t3 = await rules.preview(ctx.teacherId, {
      ruleKey: 'goi_sort', name: 'x', description: 'x', criterionKey: 'trinh_bay', predicate: { kind: 'calls_function', name: 'sort' },
    });
    expect(t3).toMatchObject({ tier: 3, reason: expect.stringMatching(/ast_query/) });
    const t4 = await rules.preview(ctx.teacherId, { ruleKey: 'loi_moi', name: 'x', description: 'x', criterionKey: 'trinh_bay', predicate: null });
    expect(t4).toEqual({ tier: 4, sessions: [{ sessionId: ctx.sessionId, name: expect.any(String), graded: true }] });
    expect(await ds.query(`SELECT 1 FROM examcollect.error_rule WHERE teacher_id = $1 AND rule_key IN ('bien_3', 'goi_sort', 'loi_moi')`, [ctx.teacherId])).toHaveLength(0);
  });
});
