import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { recordMissingRules } from '../src/grading/rules/missing-rules';
import { ProposalService } from '../src/grading/rules/proposal.service';
import { seedResult, seedSession } from './helpers/grading-seed';
import { rubricNameOf, seedInvestigatorSession, seedRuleOnly } from './helpers/investigator-seed';

describe('Lỗi AI đề xuất kèm ngữ cảnh (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let proposals: ProposalService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    ds = app.get(DataSource);
    proposals = app.get(ProposalService);
  });
  afterAll(async () => app.close());

  async function world(label: string) {
    const a = await seedSession(ds, `${label}-a`);
    await seedInvestigatorSession(ds, a);
    const b = await seedSession(ds, `${label}-b`, { teacherId: a.teacherId, startHoursAgo: 10 });
    await seedInvestigatorSession(ds, b);
    return { a, b, t: a.teacherId, nameA: await rubricNameOf(ds, a.rubricId), nameB: await rubricNameOf(ds, b.rubricId) };
  }
  const report = async (ctx: Awaited<ReturnType<typeof world>>['a'], rubricName: string, description: string) => {
    const { resultId } = await seedResult(ds, ctx, 'investigator');
    await ds.transaction((m) =>
      recordMissingRules(m, ctx.teacherId, [{ description }], { resultId, sessionId: ctx.sessionId, rubricName }),
    );
    return resultId;
  };

  it('T-RBE-API-6: ghi nhận MỘT lần mỗi (luật, bài); chạy lại không nhân đôi; bản sửa không còn "chua_gan"', async () => {
    const w = await world('pr6');
    const r = await report(w.a, w.nameA, 'Dùng biến toàn cục');
    await ds.transaction((m) =>
      recordMissingRules(m, w.t, [{ description: 'Dùng biến toàn cục' }], {
        resultId: r,
        sessionId: w.a.sessionId,
        rubricName: w.nameA,
      }),
    );
    const [{ n }] = await ds.query(`SELECT count(*)::int AS n FROM examcollect.error_rule_sighting WHERE teacher_id = $1`, [w.t]);
    expect(n).toBe(1);
    const [rev] = await ds.query(
      `SELECT v.criterion_key FROM examcollect.error_rule r JOIN examcollect.error_rule_revision v ON v.id = r.current_revision_id WHERE r.teacher_id = $1 AND r.state = 'proposed'`,
      [w.t],
    );
    expect(rev.criterion_key).toBeNull();
  });

  it('T-RBE-API-6b: lỗi đã bị bỏ (dismissed) mà agent báo lại → KHÔNG ghi nhận thêm', async () => {
    const w = await world('pr6b');
    await report(w.a, w.nameA, 'Quên giải phóng bộ nhớ');
    await ds.query(`UPDATE examcollect.error_rule SET state = 'dismissed' WHERE teacher_id = $1`, [w.t]);
    await report(w.a, w.nameA, 'Quên giải phóng bộ nhớ');
    const [{ n }] = await ds.query(`SELECT count(*)::int AS n FROM examcollect.error_rule_sighting WHERE teacher_id = $1`, [w.t]);
    expect(n).toBe(1);
  });

  it('T-RBE-API-5: lọc theo rubric — số bài/phiên CỦA rubric đó; lỗi legacy (chưa từng có sighting) hiện ở mọi rubric', async () => {
    const w = await world('pr5');
    await report(w.a, w.nameA, 'Lỗi chỉ thấy ở A');
    await report(w.a, w.nameA, 'Lỗi chỉ thấy ở A');
    await report(w.b, w.nameB, 'Lỗi thấy ở cả hai');
    await report(w.a, w.nameA, 'Lỗi thấy ở cả hai');
    await seedRuleOnly(ds, w.t, 'cu_chua_ro_noi', null, 'proposed');
    const forA = await proposals.list(w.t, w.nameA);
    expect(forA.map((p) => [p.name, p.sightings.results, p.legacy])).toEqual(
      expect.arrayContaining([
        ['Lỗi chỉ thấy ở A', 2, false],
        ['Lỗi thấy ở cả hai', 1, false],
        ['cu_chua_ro_noi', 0, true],
      ]),
    );
    expect(forA.find((p) => p.name === 'Lỗi chỉ thấy ở A')!.sightings.sessions).toEqual([
      { id: w.a.sessionId, name: expect.any(String) },
    ]);
    const forB = await proposals.list(w.t, w.nameB);
    expect(forB.map((p) => p.name).sort()).toEqual(['Lỗi thấy ở cả hai', 'cu_chua_ro_noi']);
    expect((await proposals.list(w.t)).length).toBe(3);
  });
});
