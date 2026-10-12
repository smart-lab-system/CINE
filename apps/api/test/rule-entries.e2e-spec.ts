import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { loadRuleEntries } from '../src/grading/pipeline/rule-entries';
import { seedSession } from './helpers/grading-seed';
import { rubricNameOf, seedInvestigatorSession, seedPrices, seedRule, seedRuleOnly } from './helpers/investigator-seed';

/** Bảng lỗi đang dùng của MỘT rubric → `bang-loi.md` của cuộc điều tra và `ruleTable` của hồ sơ (§2.1, 3c I1). */
describe('loadRuleEntries (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    ds = app.get(DataSource);
  });
  afterAll(async () => app.close());

  it('chỉ luật active của đúng giảng viên VÀ đúng rubric, kèm tên bản sửa, có giá hay chưa, ai kiểm', async () => {
    const a = await seedSession(ds, 're-a');
    await seedInvestigatorSession(ds, a);
    const b = await seedSession(ds, 're-b');
    await seedInvestigatorSession(ds, b);
    const nameA = await rubricNameOf(ds, a.rubricId);
    const bien = await seedRule(ds, a.teacherId, 'sai_bien', 'tinh_dung', { kind: 'test_group_failed', group: 'bien' });
    const ten = await seedRule(ds, a.teacherId, 'ten_bien', 'trinh_bay');
    await seedRuleOnly(ds, a.teacherId, 'de_xuat_x', null, 'proposed');
    const retired = await seedRule(ds, a.teacherId, 'cu', 'trinh_bay');
    await ds.query(`UPDATE examcollect.error_rule SET state = 'retired' WHERE id = $1`, [retired.ruleId]);
    await seedRule(ds, b.teacherId, 'cua_nguoi_khac', 'tinh_dung');
    await seedPrices(ds, a.teacherId, { [bien.ruleId]: '1.50', [ten.ruleId]: null });

    const { entries, ruleTable } = await loadRuleEntries(ds.manager, a.teacherId, nameA);
    expect(entries).toEqual([
      { ruleKey: 'sai_bien', title: 'sai_bien', criterionKey: 'tinh_dung', priced: true, checkedBy: 'machine', machineNote: 'nhóm test bien' },
      { ruleKey: 'ten_bien', title: 'ten_bien', criterionKey: 'trinh_bay', priced: false, checkedBy: 'model', machineNote: null },
    ]);
    expect(ruleTable).toEqual([
      { ruleKey: 'sai_bien', checkedBy: 'machine' },
      { ruleKey: 'ten_bien', checkedBy: 'model' },
    ]);
  });

  it('giảng viên chưa có bảng giá nào → mọi luật chưa có giá', async () => {
    const t = await seedSession(ds, 're-noprice');
    await seedInvestigatorSession(ds, t);
    await seedRule(ds, t.teacherId, 'mot_luat', 'tinh_dung');
    const { entries } = await loadRuleEntries(ds.manager, t.teacherId, await rubricNameOf(ds, t.rubricId));
    expect(entries.map((e) => e.priced)).toEqual([false]);
  });
});
