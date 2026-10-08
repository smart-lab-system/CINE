import { Test } from '@nestjs/testing';
import { BadRequestException, ConflictException, INestApplication, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { currentPriceVersion, latestComputationRow } from '../src/grading/scoring/score-inputs';
import { RubricErrorService } from '../src/grading/rules/rubric-error.service';
import { ScoreService } from '../src/grading/scoring/score.service';
import { seedSession } from './helpers/grading-seed';
import {
  assignmentId,
  rubricNameOf,
  seedInvestigatorResult,
  seedInvestigatorSession,
  seedRule,
  seedRuleOnly,
  storedWith,
} from './helpers/investigator-seed';

const BIEN = { kind: 'test_group_failed' as const, group: 'bien' };

describe('RubricErrorService (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let errors: RubricErrorService;
  let scores: ScoreService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    ds = app.get(DataSource);
    errors = app.get(RubricErrorService);
    scores = app.get(ScoreService);
  });
  afterAll(async () => app.close());

  /** Một giảng viên, hai rubric (hai phiên), mỗi rubric có `tinh_dung` và `trinh_bay`; CHƯA có lỗi nào. */
  async function world(label: string) {
    const a = await seedSession(ds, `${label}-a`);
    await seedInvestigatorSession(ds, a);
    const b = await seedSession(ds, `${label}-b`, { teacherId: a.teacherId, startHoursAgo: 10 });
    await seedInvestigatorSession(ds, b);
    return { a, b, teacherId: a.teacherId, nameA: await rubricNameOf(ds, a.rubricId), nameB: await rubricNameOf(ds, b.rubricId) };
  }
  const priceOf = async (teacherId: string, rubricErrorId: string) => {
    const v = (await currentPriceVersion(ds.manager, teacherId))!;
    const [row] = await ds.query(
      `SELECT deduction FROM examcollect.rubric_error_price WHERE price_table_version_id = $1 AND rubric_error_id = $2`,
      [v.id, rubricErrorId],
    );
    return row?.deduction as string | null | undefined;
  };

  it('T-RBE-API-2a: newRule → luật + bản sửa 1 (criterion NULL) + dòng áp dụng + giá; ruleKey sinh từ tên, trùng thì thêm _2', async () => {
    const w = await world('as-new');
    const out = await errors.assign(w.teacherId, {
      rubricName: w.nameA,
      criterionKey: 'tinh_dung',
      deduction: '1.50',
      newRule: { name: 'Sai ca biên', description: 'Nhóm biên không đạt', predicate: BIEN },
    });
    const [rule] = await ds.query(`SELECT rule_key, state, origin FROM examcollect.error_rule WHERE id = $1`, [out.ruleId]);
    expect(rule).toEqual({ rule_key: 'sai_ca_bien', state: 'active', origin: 'teacher' });
    const [rev] = await ds.query(`SELECT revision, criterion_key FROM examcollect.error_rule_revision WHERE error_rule_id = $1`, [
      out.ruleId,
    ]);
    expect(rev).toEqual({ revision: 1, criterion_key: null });
    expect(await priceOf(w.teacherId, out.rubricErrorId)).toBe('1.50');
    expect(out.recompute).toEqual({ recomputed: 0, promoted: 0, demoted: 0, belowFloor: 0 });
    const second = await errors.assign(w.teacherId, {
      rubricName: w.nameB,
      criterionKey: 'tinh_dung',
      newRule: { name: 'Sai ca biên', description: 'x', predicate: null },
    });
    const [rule2] = await ds.query(`SELECT rule_key FROM examcollect.error_rule WHERE id = $1`, [second.ruleId]);
    expect(rule2.rule_key).toBe('sai_ca_bien_2');
    expect(second.recompute).toBeNull();
  });

  it('T-RBE-API-2b: ruleKey tường minh đã có → 409; chưa có → dùng đúng khoá đó', async () => {
    const w = await world('as-key');
    await errors.assign(w.teacherId, {
      rubricName: w.nameA,
      criterionKey: 'tinh_dung',
      newRule: { name: 'A', description: 'a', predicate: null, ruleKey: 'khoa_co_dinh' },
    });
    await expect(
      errors.assign(w.teacherId, {
        rubricName: w.nameB,
        criterionKey: 'tinh_dung',
        newRule: { name: 'B', description: 'b', predicate: null, ruleKey: 'khoa_co_dinh' },
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('T-RBE-API-2c: ruleId trong thư viện → dòng áp dụng thứ hai ở rubric khác, giá RIÊNG; đã có ở rubric đó → 409', async () => {
    const w = await world('as-lib');
    const first = await errors.assign(w.teacherId, {
      rubricName: w.nameA,
      criterionKey: 'tinh_dung',
      deduction: '1.00',
      newRule: { name: 'Chung', description: 'c', predicate: BIEN },
    });
    const second = await errors.assign(w.teacherId, {
      rubricName: w.nameB,
      criterionKey: 'trinh_bay',
      deduction: '2.00',
      ruleId: first.ruleId,
    });
    expect(second.rubricErrorId).not.toBe(first.rubricErrorId);
    expect(await priceOf(w.teacherId, first.rubricErrorId)).toBe('1.00');
    expect(await priceOf(w.teacherId, second.rubricErrorId)).toBe('2.00');
    await expect(
      errors.assign(w.teacherId, { rubricName: w.nameB, criterionKey: 'tinh_dung', ruleId: first.ruleId }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('T-RBE-API-2d: duyệt lỗi proposed kèm changes → bản sửa 2, state active; changes cho lỗi active → 400', async () => {
    const w = await world('as-adopt');
    const proposed = await seedRuleOnly(ds, w.teacherId, 'de_xuat_1', null, 'proposed');
    const out = await errors.assign(w.teacherId, {
      rubricName: w.nameA,
      criterionKey: 'tinh_dung',
      deduction: '0.50',
      ruleId: proposed.ruleId,
      changes: { name: 'Tên đã sửa' },
    });
    const [rule] = await ds.query(`SELECT state, current_revision_id FROM examcollect.error_rule WHERE id = $1`, [
      proposed.ruleId,
    ]);
    expect(rule.state).toBe('active');
    const [rev] = await ds.query(`SELECT revision, name FROM examcollect.error_rule_revision WHERE id = $1`, [
      rule.current_revision_id,
    ]);
    expect(rev).toEqual({ revision: 2, name: 'Tên đã sửa' });
    expect(out.ruleId).toBe(proposed.ruleId);
    await expect(
      errors.assign(w.teacherId, {
        rubricName: w.nameB,
        criterionKey: 'tinh_dung',
        ruleId: proposed.ruleId,
        changes: { name: 'x' },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('T-RBE-DATA-3: rubric không có (của giảng viên này) → 404; tiêu chí không có ở bản mới nhất → 400; lỗi dismissed → 409', async () => {
    const w = await world('as-guard');
    const input = { criterionKey: 'tinh_dung', newRule: { name: 'x', description: 'x', predicate: null } };
    await expect(errors.assign(w.teacherId, { ...input, rubricName: 'Không có rubric này' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(
      errors.assign(w.teacherId, { ...input, rubricName: w.nameA, criterionKey: 'khong_co' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    const dismissed = await seedRuleOnly(ds, w.teacherId, 'da_bo', null, 'active');
    await ds.query(`UPDATE examcollect.error_rule SET state = 'dismissed' WHERE id = $1`, [dismissed.ruleId]);
    await expect(
      errors.assign(w.teacherId, { rubricName: w.nameA, criterionKey: 'tinh_dung', ruleId: dismissed.ruleId }),
    ).rejects.toBeInstanceOf(ConflictException);
    const other = await seedSession(ds, 'as-other');
    await seedInvestigatorSession(ds, other);
    const stranger = await seedRule(ds, other.teacherId, 'cua_nguoi_khac', 'tinh_dung');
    await expect(
      errors.assign(w.teacherId, { rubricName: w.nameA, criterionKey: 'tinh_dung', ruleId: stranger.ruleId }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('T-RBE-API-2e: gỡ rồi thêm lại → BẬT LẠI cùng dòng (cùng id), tiêu chí mới; dòng cũ của giá còn nguyên', async () => {
    const w = await world('as-readd');
    const first = await errors.assign(w.teacherId, {
      rubricName: w.nameA,
      criterionKey: 'tinh_dung',
      deduction: '1.00',
      newRule: { name: 'Lỗi X', description: 'x', predicate: null },
    });
    await errors.remove(w.teacherId, first.rubricErrorId);
    const again = await errors.assign(w.teacherId, {
      rubricName: w.nameA,
      criterionKey: 'trinh_bay',
      ruleId: first.ruleId,
    });
    expect(again.rubricErrorId).toBe(first.rubricErrorId);
    const [row] = await ds.query(`SELECT criterion_key, removed_at FROM examcollect.rubric_error WHERE id = $1`, [
      first.rubricErrorId,
    ]);
    expect(row).toEqual({ criterion_key: 'trinh_bay', removed_at: null });
    expect(await priceOf(w.teacherId, first.rubricErrorId)).toBe('1.00');
  });

  it('T-RBE-API-3: gỡ / chuyển tiêu chí chỉ tính lại bài của ĐÚNG rubric; rubric khác không có dòng tính lại mới', async () => {
    const w = await world('as-scope');
    const chung = await seedRule(ds, w.teacherId, 'chung', 'tinh_dung', BIEN);
    const ten = await seedRule(ds, w.teacherId, 'ten_bien', 'trinh_bay');
    const SEEN = [
      { ruleKey: 'chung', checkedBy: 'machine' as const },
      { ruleKey: 'ten_bien', checkedBy: 'model' as const },
    ];
    await ds.query(`UPDATE examcollect.rubric_error SET updated_at = now() WHERE teacher_id = $1`, [w.teacherId]);
    const { seedPrices } = await import('./helpers/investigator-seed');
    await seedPrices(ds, w.teacherId, { [chung.ruleId]: '1.00', [ten.ruleId]: '0.50' });
    // `ten_bien` là luật lời — phải nằm trong modelErrors mới bị trừ (không chỉ rulesSeen).
    const ra = (await seedInvestigatorResult(ds, w.a, storedWith(SEEN, ['ten_bien']))).resultId;
    const rb = (await seedInvestigatorResult(ds, w.b, storedWith(SEEN, ['ten_bien']))).resultId;
    await scores.computeInitial(ra);
    await scores.computeInitial(rb);
    const countOf = async (id: string) =>
      (await ds.query(`SELECT count(*)::int AS n FROM examcollect.score_computation WHERE grading_result_id = $1`, [id]))[0]
        .n;
    const aChung = await assignmentId(ds, w.teacherId, w.nameA, chung.ruleId);
    const summary = await errors.remove(w.teacherId, aChung);
    expect(summary.recompute.recomputed).toBe(1);
    expect(await countOf(ra)).toBe(2);
    expect(await countOf(rb)).toBe(1);
    expect((await latestComputationRow(ds.manager, ra))!.score).toBe('9.50');
    const bTen = await assignmentId(ds, w.teacherId, w.nameB, ten.ruleId);
    await errors.move(w.teacherId, bTen, 'tinh_dung');
    expect(await countOf(ra)).toBe(2);
    expect(await countOf(rb)).toBe(2);
  });

  it('list: dòng của rubric, appliedTo đếm bài CỦA RUBRIC ĐÓ, alsoIn nêu rubric khác dùng cùng lỗi, criterionDangling', async () => {
    const w = await world('as-list');
    const chung = await seedRule(ds, w.teacherId, 'chung', 'tinh_dung', BIEN);
    const { seedPrices } = await import('./helpers/investigator-seed');
    await seedPrices(ds, w.teacherId, { [chung.ruleId]: '1.00' });
    const bId = await assignmentId(ds, w.teacherId, w.nameB, chung.ruleId);
    await errors
      .assign(w.teacherId, { rubricName: w.nameB, criterionKey: 'trinh_bay', deduction: '2.00', ruleId: chung.ruleId })
      .catch(() => undefined);
    const r = await seedInvestigatorResult(ds, w.a, storedWith([{ ruleKey: 'chung', checkedBy: 'machine' }]));
    await scores.computeInitial(r.resultId);
    const listA = await errors.list(w.teacherId, w.nameA);
    expect(listA).toHaveLength(1);
    expect(listA[0]).toMatchObject({
      ruleKey: 'chung',
      criterionKey: 'tinh_dung',
      criterionDangling: false,
      deduction: '1.00',
      checkedBy: 'machine',
      appliedTo: { results: 1, sessions: 1 },
      alsoIn: [{ rubricName: w.nameB, criterionKey: 'tinh_dung', deduction: '1.00' }],
    });
    const listB = await errors.list(w.teacherId, w.nameB);
    expect(listB[0].appliedTo).toEqual({ results: 0, sessions: 0 });
    expect(bId).toEqual(expect.any(String));
    await expect(errors.list(w.teacherId, 'Không có rubric này')).rejects.toBeInstanceOf(NotFoundException);
  });
});
