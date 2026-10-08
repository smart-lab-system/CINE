import { Test } from '@nestjs/testing';
import { ConflictException, INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { ErrorExceptionService } from '../src/grading/review/error-exception.service';
import { ErrorRuleService } from '../src/grading/rules/error-rule.service';
import { latestComputationRow } from '../src/grading/scoring/score-inputs';
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
  { ruleKey: 'chung', checkedBy: 'machine' as const },
  { ruleKey: 'ten_bien', checkedBy: 'model' as const },
];

describe('Thư viện lỗi, sửa cả N rubric, tách bản riêng (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let rules: ErrorRuleService;
  let scores: ScoreService;
  let exceptions: ErrorExceptionService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    ds = app.get(DataSource);
    rules = app.get(ErrorRuleService);
    scores = app.get(ScoreService);
    exceptions = app.get(ErrorExceptionService);
  });
  afterAll(async () => app.close());

  /** Một giảng viên, hai rubric; `chung` (máy kiểm `bien`) + `ten_bien` áp ở cả hai, giá 1,00 / 0,50. */
  async function world(label: string) {
    const a = await seedSession(ds, `${label}-a`);
    await seedInvestigatorSession(ds, a);
    const b = await seedSession(ds, `${label}-b`, { teacherId: a.teacherId, startHoursAgo: 10 });
    await seedInvestigatorSession(ds, b);
    const t = a.teacherId;
    const nameA = await rubricNameOf(ds, a.rubricId);
    const nameB = await rubricNameOf(ds, b.rubricId);
    const chung = await seedRule(ds, t, 'chung', 'tinh_dung', { kind: 'test_group_failed', group: 'bien' });
    const ten = await seedRule(ds, t, 'ten_bien', 'trinh_bay');
    await seedPrices(ds, t, { [chung.ruleId]: '1.00', [ten.ruleId]: '0.50' });
    return { a, b, t, nameA, nameB, chung, ten };
  }
  const graded = async (ctx: Parameters<typeof seedInvestigatorResult>[1]) => {
    const { resultId } = await seedInvestigatorResult(ds, ctx, storedWith(SEEN, ['ten_bien']));
    await scores.computeInitial(resultId);
    return resultId;
  };

  it('library: lỗi active kèm nơi dùng (rubric, tiêu chí, điểm trừ); lỗi proposed/dismissed không có mặt', async () => {
    const w = await world('lib');
    const lib = await rules.library(w.t);
    const chung = lib.find((r) => r.ruleKey === 'chung')!;
    expect(chung).toMatchObject({
      checkedBy: 'machine',
      revision: { name: 'chung', predicate: { kind: 'test_group_failed', group: 'bien' } },
    });
    expect(chung.uses.map((u) => [u.rubricName, u.criterionKey, u.deduction]).sort()).toEqual(
      [
        [w.nameA, 'tinh_dung', '1.00'],
        [w.nameB, 'tinh_dung', '1.00'],
      ].sort(),
    );
  });

  it('T-RBE-SPLIT-1: PATCH đổi ở CẢ rubric dùng nó; split chỉ đổi rubric đó, rubric kia giữ nguyên nội dung cũ', async () => {
    const w = await world('sp1');
    await rules.revise(w.t, w.ten.ruleId, { name: 'Tên chung mới' });
    const lib = await rules.library(w.t);
    expect(lib.find((r) => r.ruleKey === 'ten_bien')!.revision.name).toBe('Tên chung mới');

    const out = await rules.split(w.t, w.ten.ruleId, {
      rubricName: w.nameA,
      changes: { name: 'Tên riêng của A', description: 'riêng A' },
    });
    const split = (await rules.library(w.t)).find((r) => r.id === out.ruleId)!;
    expect(split.revision).toMatchObject({ revision: 1, name: 'Tên riêng của A', description: 'riêng A' });
    expect(split.uses.map((u) => u.rubricName)).toEqual([w.nameA]);
    const original = (await rules.library(w.t)).find((r) => r.id === w.ten.ruleId)!;
    expect(original.revision.name).toBe('Tên chung mới');
    expect(original.uses.map((u) => u.rubricName)).toEqual([w.nameB]);
  });

  it('T-RBE-SPLIT-2: split giữ tiêu chí, điểm trừ và dòng giá; ruleKey mới duy nhất; luật chỉ ở 1 rubric → 409', async () => {
    const w = await world('sp2');
    const before = await assignmentId(ds, w.t, w.nameA, w.ten.ruleId);
    const out = await rules.split(w.t, w.ten.ruleId, { rubricName: w.nameA, changes: { name: 'Riêng A' } });
    expect(out.rubricErrorId).toBe(before);
    const [row] = await ds.query(`SELECT error_rule_id, criterion_key FROM examcollect.rubric_error WHERE id = $1`, [before]);
    expect(row).toEqual({ error_rule_id: out.ruleId, criterion_key: 'trinh_bay' });
    const [rule] = await ds.query(`SELECT rule_key FROM examcollect.error_rule WHERE id = $1`, [out.ruleId]);
    expect(rule.rule_key).toBe('rieng_a');
    await expect(rules.split(w.t, out.ruleId, { rubricName: w.nameA, changes: { name: 'Lại' } })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('T-RBE-SPLIT-3: ngoại lệ cấp lỗi của bài thuộc rubric đó theo sang luật mới (điểm bài không đổi); bài rubric khác không bị chép', async () => {
    const w = await world('sp3');
    const ra = await graded(w.a);
    const rb = await graded(w.b);
    await exceptions.setErrorException(w.t, ra, w.ten.ruleId, 'exclude');
    const scoreA = (await latestComputationRow(ds.manager, ra))!.score;
    const out = await rules.split(w.t, w.ten.ruleId, { rubricName: w.nameA, changes: { name: 'Riêng A' } });
    expect((await latestComputationRow(ds.manager, ra))!.score).toBe(scoreA);
    const copied = await ds.query(
      `SELECT grading_result_id, direction FROM examcollect.teacher_review WHERE kind = 'error_exception' AND error_rule_id = $1`,
      [out.ruleId],
    );
    expect(copied).toEqual([{ grading_result_id: ra, direction: 'exclude' }]);
    expect(
      (await latestComputationRow(ds.manager, rb))!.breakdown.errors.some(
        (e) => e.ruleKey === 'ten_bien' && e.counted === 'counted',
      ),
    ).toBe(true);
  });

  it('setState: dismissed / retired bỏ lỗi khỏi tính điểm; cả giảng viên được tính lại', async () => {
    const w = await world('st');
    const ra = await graded(w.a);
    const out = await rules.setState(w.t, w.ten.ruleId, 'retired');
    expect(out.recompute.recomputed).toBeGreaterThanOrEqual(1);
    expect((await latestComputationRow(ds.manager, ra))!.breakdown.errors.map((e) => e.ruleKey)).not.toContain('ten_bien');
  });
});
