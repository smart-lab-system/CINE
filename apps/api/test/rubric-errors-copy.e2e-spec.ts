import { Test } from '@nestjs/testing';
import { BadRequestException, INestApplication, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { RubricErrorService } from '../src/grading/rules/rubric-error.service';
import { currentPriceVersion } from '../src/grading/scoring/score-inputs';
import { seedCriterion, seedSession } from './helpers/grading-seed';
import {
  assignmentId,
  rubricNameOf,
  seedAssignment,
  seedAssignmentPrices,
  seedInvestigatorSession,
  seedRuleOnly,
} from './helpers/investigator-seed';

describe('Sao chép lỗi giữa rubric (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let errors: RubricErrorService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    ds = app.get(DataSource);
    errors = app.get(RubricErrorService);
  });
  afterAll(async () => app.close());

  /** Nguồn S có `tinh_dung`, `trinh_bay`, `rieng` và 3 lỗi (giá 1,00 / 2,00 / 0,50); đích D chỉ có `tinh_dung`, `trinh_bay`. */
  async function world(label: string) {
    const s = await seedSession(ds, `${label}-s`);
    await seedInvestigatorSession(ds, s);
    await seedCriterion(ds, s.rubricId, 'rieng', 3);
    const d = await seedSession(ds, `${label}-d`, { teacherId: s.teacherId, startHoursAgo: 10 });
    await seedInvestigatorSession(ds, d);
    const t = s.teacherId;
    const nameS = await rubricNameOf(ds, s.rubricId);
    const nameD = await rubricNameOf(ds, d.rubricId);
    const x = await seedRuleOnly(ds, t, 'x');
    const y = await seedRuleOnly(ds, t, 'y');
    const z = await seedRuleOnly(ds, t, 'z');
    const ax = await seedAssignment(ds, t, nameS, x.ruleId, 'tinh_dung');
    const ay = await seedAssignment(ds, t, nameS, y.ruleId, 'trinh_bay');
    const az = await seedAssignment(ds, t, nameS, z.ruleId, 'rieng');
    await seedAssignmentPrices(ds, t, { [ax]: '1.00', [ay]: '2.00', [az]: '0.50' });
    return { t, nameS, nameD, x, y, z };
  }

  it('T-RBE-API-4: ghép theo khoá tiêu chí; bỏ qua tiêu chí không có ở đích; đếm đúng; MỘT phiên bản giá mới; nguồn không đổi', async () => {
    const w = await world('cp1');
    const before = (await currentPriceVersion(ds.manager, w.t))!;
    const out = await errors.copy(w.t, w.nameS, w.nameD);
    expect(out).toMatchObject({ copied: 2, skippedNoCriterion: 1, skippedExisting: 0 });
    const price = (await currentPriceVersion(ds.manager, w.t))!;
    expect(price.version).toBe(before.version + 1);
    const rows = await ds.query(
      `SELECT r.rule_key, re.criterion_key, p.deduction FROM examcollect.rubric_error re
         JOIN examcollect.error_rule r ON r.id = re.error_rule_id
         LEFT JOIN examcollect.rubric_error_price p ON p.rubric_error_id = re.id AND p.price_table_version_id = $3
        WHERE re.teacher_id = $1 AND re.rubric_name = $2 AND re.removed_at IS NULL ORDER BY r.rule_key`,
      [w.t, w.nameD, price.id],
    );
    expect(rows).toEqual([
      { rule_key: 'x', criterion_key: 'tinh_dung', deduction: '1.00' },
      { rule_key: 'y', criterion_key: 'trinh_bay', deduction: '2.00' },
    ]);
    const src = await ds.query(
      `SELECT count(*)::int AS n FROM examcollect.rubric_error WHERE teacher_id = $1 AND rubric_name = $2 AND removed_at IS NULL`,
      [w.t, w.nameS],
    );
    expect(src[0].n).toBe(3);
  });

  it('chạy lại: dòng đã có ở đích bị bỏ qua (skippedExisting), không tạo thêm phiên bản giá', async () => {
    const w = await world('cp2');
    await errors.copy(w.t, w.nameS, w.nameD);
    const v = (await currentPriceVersion(ds.manager, w.t))!;
    const again = await errors.copy(w.t, w.nameS, w.nameD);
    expect(again).toMatchObject({ copied: 0, skippedNoCriterion: 1, skippedExisting: 2 });
    expect((await currentPriceVersion(ds.manager, w.t))!.version).toBe(v.version);
  });

  it('dòng đã gỡ ở đích được bật lại khi sao chép; điểm trừ độc lập sau đó (sửa ở đích không đổi nguồn)', async () => {
    const w = await world('cp3');
    await errors.copy(w.t, w.nameS, w.nameD);
    const dx = await assignmentId(ds, w.t, w.nameD, w.x.ruleId);
    await errors.remove(w.t, dx);
    const out = await errors.copy(w.t, w.nameS, w.nameD);
    expect(out.copied).toBe(1);
    expect(await assignmentId(ds, w.t, w.nameD, w.x.ruleId)).toBe(dx);
  });

  it('nguồn = đích → 400; rubric không có → 404', async () => {
    const w = await world('cp4');
    await expect(errors.copy(w.t, w.nameS, w.nameS)).rejects.toBeInstanceOf(BadRequestException);
    await expect(errors.copy(w.t, 'Không có', w.nameD)).rejects.toBeInstanceOf(NotFoundException);
    await expect(errors.copy(w.t, w.nameS, 'Không có')).rejects.toBeInstanceOf(NotFoundException);
  });
});
