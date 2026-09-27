import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { loadRuleEntries } from '../src/grading/pipeline/rule-entries';
import { seedTeacher } from './helpers/grading-seed';
import { seedPrices, seedRule } from './helpers/investigator-seed';

/** Bảng lỗi đang dùng → `bang-loi.md` của cuộc điều tra và `ruleTable` của hồ sơ (§2.1, 3c I1). */
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

  it('chỉ luật active của đúng giảng viên, kèm tên bản sửa, có giá hay chưa, ai kiểm', async () => {
    const a = await seedTeacher(ds, 're-a');
    const b = await seedTeacher(ds, 're-b');
    const bien = await seedRule(ds, a, 'sai_bien', 'tinh_dung', { kind: 'test_group_failed', group: 'bien' });
    const ten = await seedRule(ds, a, 'ten_bien', 'trinh_bay');
    const proposed = await seedRule(ds, a, 'de_xuat_x', 'chua_gan');
    const retired = await seedRule(ds, a, 'cu', 'trinh_bay');
    await ds.query(`UPDATE examcollect.error_rule SET state = 'proposed' WHERE id = $1`, [proposed.ruleId]);
    await ds.query(`UPDATE examcollect.error_rule SET state = 'retired' WHERE id = $1`, [retired.ruleId]);
    await seedRule(ds, b, 'cua_nguoi_khac', 'tinh_dung');
    await seedPrices(ds, a, { [bien.ruleId]: '1.50', [ten.ruleId]: null });

    const { entries, ruleTable } = await loadRuleEntries(ds.manager, a);
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
    const t = await seedTeacher(ds, 're-noprice');
    await seedRule(ds, t, 'mot_luat', 'tinh_dung');
    const { entries } = await loadRuleEntries(ds.manager, t);
    expect(entries.map((e) => e.priced)).toEqual([false]);
  });
});
