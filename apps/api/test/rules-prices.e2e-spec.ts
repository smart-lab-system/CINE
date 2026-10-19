import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { ErrorRuleService } from '../src/grading/rules/error-rule.service';
import { PriceService } from '../src/grading/rules/price.service';
import { ScoreService } from '../src/grading/scoring/score.service';
import { seedSession } from './helpers/grading-seed';
import {
  assignmentId,
  rubricNameOf,
  seedInvestigatorResult,
  seedInvestigatorSession,
  seedPrices,
  seedRule,
  storedWith,
} from './helpers/investigator-seed';

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

  it('T-RULEREV-1: đổi điều kiện → bản sửa 2, luật trỏ bản 2, lượt tính cũ vẫn mang bản 1', async () => {
    const { ctx, ten } = await world('rr-rev');
    const a = await seedInvestigatorResult(ds, ctx, storedWith(SEEN, ['ten_bien']));
    await scores.computeInitial(a.resultId);
    // Đổi sang máy kiểm nhóm `bien` (vẫn fail trên hồ sơ) để lỗi còn trong breakdown sau tính lại.
    const { revisionId } = await rules.revise(ctx.teacherId, ten.ruleId, {
      predicate: { kind: 'test_group_failed', group: 'bien' },
    });
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

  it('T-VER-1: sửa giá hai lần (theo dòng áp dụng) → hai phiên bản mới, mỗi bản chép đủ bảng; dòng cũ không đổi', async () => {
    const { ctx, bien, ten } = await world('rr-ver');
    const name = await rubricNameOf(ds, ctx.rubricId);
    await prices.setPrice(ctx.teacherId, await assignmentId(ds, ctx.teacherId, name, bien.ruleId), '2.00', ctx.teacherId);
    await prices.setPrice(ctx.teacherId, await assignmentId(ds, ctx.teacherId, name, ten.ruleId), '0.75', ctx.teacherId);
    const rows = await ds.query(
      `SELECT v.version, p.deduction FROM examcollect.price_table_version v
         JOIN examcollect.rubric_error_price p ON p.price_table_version_id = v.id
        WHERE v.teacher_id = $1 ORDER BY v.version, p.deduction`,
      [ctx.teacherId],
    );
    expect(rows.map((r: { version: number; deduction: string }) => [r.version, r.deduction])).toEqual([
      [1, '0.50'],
      [1, '1.50'],
      [2, '0.50'],
      [2, '2.00'],
      [3, '0.75'],
      [3, '2.00'],
    ]);
  });

  it('T-POL-5: xem trước một giá trả đúng số bài theo phiên chưa chốt, và không ghi gì', async () => {
    const { ctx } = await world('rr-preview');
    const extra = await seedRule(ds, ctx.teacherId, 'bien_2', 'trinh_bay', { kind: 'test_group_failed', group: 'bien' });
    for (let i = 0; i < 2; i++) await scores.computeInitial((await seedInvestigatorResult(ds, ctx, storedWith(SEEN))).resultId);
    // Đếm chỉ các kết quả của phiên này (bảng score_computation dùng chung giữa các suite; xem rubric-scoped-pricing).
    const countMine = async () =>
      (await ds.query(
        `SELECT count(*)::int AS n FROM examcollect.score_computation sc
           JOIN examcollect.grading_result gr ON gr.id = sc.grading_result_id
           JOIN examcollect.submission s ON s.id = gr.submission_id
          WHERE s.exam_session_id = $1`,
        [ctx.sessionId],
      ))[0].n as number;
    const before = await countMine();
    const p = await prices.preview(
      ctx.teacherId,
      await assignmentId(ds, ctx.teacherId, await rubricNameOf(ds, ctx.rubricId), extra.ruleId),
      '0.25',
    );
    expect(p.openSessions).toEqual([
      { sessionId: ctx.sessionId, name: expect.any(String), affected: 2, autoAfter: 2, blockedByOtherUnpriced: 0 },
    ]);
    expect(p.finalizedSessions).toEqual([]);
    const after = await countMine();
    expect(after).toBe(before);
    expect(
      await ds.query(`SELECT 1 FROM examcollect.price_table_version WHERE teacher_id = $1 AND version > 1`, [ctx.teacherId]),
    ).toHaveLength(0);
  });

  it('T-POL-8: giá và bản sửa trên luật của giảng viên khác → 404', async () => {
    const A = await world('rr-a');
    const B = await world('rr-b');
    const aBien = await assignmentId(ds, A.ctx.teacherId, await rubricNameOf(ds, A.ctx.rubricId), A.bien.ruleId);
    await expect(prices.setPrice(B.ctx.teacherId, aBien, '1.00', B.ctx.teacherId)).rejects.toThrow(
      /Không tìm thấy lỗi trong rubric/,
    );
    await expect(rules.revise(B.ctx.teacherId, A.bien.ruleId, { name: 'x' })).rejects.toThrow(/Không tìm thấy luật/);
    await expect(prices.preview(B.ctx.teacherId, aBien, '1.00')).rejects.toThrow(/Không tìm thấy lỗi trong rubric/);
  });
});
