import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { recordMissingRules } from '../src/grading/rules/missing-rules';
import { RubricOverviewService } from '../src/grading/rules/rubric-overview.service';
import { ScoreService } from '../src/grading/scoring/score.service';
import { TeacherReviewService } from '../src/grading/teacher-review.service';
import { seedCriterion, seedResult, seedSession } from './helpers/grading-seed';
import {
  rubricNameOf,
  seedAssignment,
  seedAssignmentPrices,
  seedInvestigatorResult,
  seedInvestigatorSession,
  seedRule,
  seedRuleOnly,
  storedWith,
} from './helpers/investigator-seed';

describe('Tổng quan rubric (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let overview: RubricOverviewService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    ds = app.get(DataSource);
    overview = app.get(RubricOverviewService);
  });
  afterAll(async () => app.close());

  it('T-RBE-API-1: đếm tiêu chí rỗng / chưa có điểm trừ / mồ côi / đề xuất; học kỳ suy từ phiên; trạng thái phiên đúng ba giá trị; sắp theo bản lưu mới nhất', async () => {
    const a = await seedSession(ds, 'ov-a');
    await seedInvestigatorSession(ds, a);
    await seedCriterion(ds, a.rubricId, 'hieu_nang', 2);
    const t = a.teacherId;
    const nameA = await rubricNameOf(ds, a.rubricId);
    const b = await seedSession(ds, 'ov-b', { teacherId: t, startHoursAgo: 10 });
    await seedInvestigatorSession(ds, b);
    const nameB = await rubricNameOf(ds, b.rubricId);
    await ds.query(`UPDATE examcollect.rubric SET created_at = now() + interval '1 minute' WHERE id = $1`, [b.rubricId]);

    const x = await seedRuleOnly(ds, t, 'x');
    const y = await seedRuleOnly(ds, t, 'y');
    const ax = await seedAssignment(ds, t, nameA, x.ruleId, 'tinh_dung');
    const ay = await seedAssignment(ds, t, nameA, y.ruleId, 'trinh_bay');
    await seedAssignmentPrices(ds, t, { [ax]: '1.00', [ay]: null });
    const z = await seedRuleOnly(ds, t, 'z');
    await seedAssignment(ds, t, nameA, z.ruleId, 'hieu_nang');
    const [v2] = await ds.query(`INSERT INTO examcollect.rubric (version, teacher_id, name) VALUES (2, $1, $2) RETURNING id`, [
      t,
      nameA,
    ]);
    await seedCriterion(ds, v2.id, 'tinh_dung', 6);
    await seedCriterion(ds, v2.id, 'trinh_bay', 4);
    await seedCriterion(ds, v2.id, 'rong', 1);
    const { resultId } = await seedResult(ds, a, 'investigator');
    await ds.transaction((m) =>
      recordMissingRules(m, t, [{ description: 'Đề xuất mới' }], { resultId, sessionId: a.sessionId, rubricName: nameA }),
    );
    await ds.query(`UPDATE examcollect.exam_session SET semester_name = 'HK1 2026-2027' WHERE id = ANY($1)`, [
      [a.sessionId, b.sessionId],
    ]);

    const list = await overview.overview(t);
    expect(list.map((o) => o.rubricName)).toEqual([nameB, nameA]);
    const ovA = list.find((o) => o.rubricName === nameA)!;
    expect(ovA.rubricId).toBe(v2.id);
    expect(ovA.errorCount).toBe(3);
    expect(ovA.unpricedCount).toBe(2);
    expect(ovA.danglingCount).toBe(1);
    expect(ovA.proposalCount).toBe(1);
    expect(ovA.criteria.map((c) => [c.key, c.errorCount])).toEqual(
      expect.arrayContaining([
        ['tinh_dung', 1],
        ['trinh_bay', 1],
        ['rong', 0],
      ]),
    );
    expect(ovA.sessions).toEqual([
      { id: a.sessionId, name: expect.any(String), semesterName: 'HK1 2026-2027', state: 'grading', resultCount: 1 },
    ]);
    expect(ovA.semesters).toEqual(['HK1 2026-2027']);
    const ovB = list.find((o) => o.rubricName === nameB)!;
    expect(ovB.sessions).toEqual([
      { id: b.sessionId, name: expect.any(String), semesterName: 'HK1 2026-2027', state: 'not_started', resultCount: 0 },
    ]);
  });

  it('phiên đã chốt hết → finalized; rubric chưa có phiên → semesters rỗng', async () => {
    const a = await seedSession(ds, 'ov-fin');
    await seedInvestigatorSession(ds, a);
    const nameA = await rubricNameOf(ds, a.rubricId);
    const bien = await seedRule(ds, a.teacherId, 'sai_bien', 'tinh_dung', { kind: 'test_group_failed', group: 'bien' });
    const ten = await seedRule(ds, a.teacherId, 'ten_bien', 'trinh_bay');
    const { seedPrices } = await import('./helpers/investigator-seed');
    await seedPrices(ds, a.teacherId, { [bien.ruleId]: '1.50', [ten.ruleId]: '0.50' });
    const { resultId } = await seedInvestigatorResult(
      ds,
      a,
      storedWith([
        { ruleKey: 'sai_bien', checkedBy: 'machine' },
        { ruleKey: 'ten_bien', checkedBy: 'model' },
      ]),
    );
    await app.get(ScoreService).computeInitial(resultId);
    await app.get(TeacherReviewService).finalizeGrades(a.sessionId, a.teacherId);
    const ov = (await overview.overview(a.teacherId)).find((o) => o.rubricName === nameA)!;
    expect(ov.sessions[0]).toMatchObject({ state: 'finalized', resultCount: 1 });
    const lone = await seedSession(ds, 'ov-lone');
    await ds.query(`UPDATE examcollect.exam_session SET rubric_id = NULL WHERE id = $1`, [lone.sessionId]);
    const loneName = await rubricNameOf(ds, lone.rubricId);
    const loneOv = (await overview.overview(lone.teacherId)).find((o) => o.rubricName === loneName)!;
    expect(loneOv.sessions).toEqual([]);
    expect(loneOv.semesters).toEqual([]);
  });

  it('đánh dấu "không trừ điểm" hiện ở criteria[].waiverId', async () => {
    const a = await seedSession(ds, 'ov-waiver');
    await seedInvestigatorSession(ds, a);
    const [w] = await ds.query(
      `INSERT INTO examcollect.criterion_waiver (rubric_id, criterion_key, set_by) VALUES ($1, 'trinh_bay', $2) RETURNING id`,
      [a.rubricId, a.teacherId],
    );
    const ov = (await overview.overview(a.teacherId)).find((o) => o.rubricId === a.rubricId)!;
    expect(ov.criteria.find((c) => c.key === 'trinh_bay')!.waiverId).toBe(w.id);
    expect(ov.criteria.find((c) => c.key === 'tinh_dung')!.waiverId).toBeNull();
  });
});
