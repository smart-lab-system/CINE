import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { BACKFILL_ASSIGNMENTS_SQL, BACKFILL_PRICES_SQL } from '../src/database/rubric-errors-backfill';
import { seedCriterion, seedSession, seedTeacher } from './helpers/grading-seed';
import {
  assignmentId,
  rubricNameOf,
  seedAssignment,
  seedAssignmentPrices,
  seedRuleOnly,
} from './helpers/investigator-seed';

/** Mô hình cũ: luật mang `criterion_key` ở bản sửa, giá ở `rule_price` — dựng bằng SQL thô cho test backfill. */
async function legacyRule(
  ds: DataSource,
  teacherId: string,
  ruleKey: string,
  criterionKey: string,
  state = 'active',
): Promise<string> {
  const [r] = await ds.query(
    `INSERT INTO examcollect.error_rule (teacher_id, rule_key, origin, state) VALUES ($1, $2, 'teacher', $3) RETURNING id`,
    [teacherId, ruleKey, state],
  );
  const [v] = await ds.query(
    `INSERT INTO examcollect.error_rule_revision (error_rule_id, revision, name, description, criterion_key, created_by)
     VALUES ($1, 1, $2, $2, $3, $4) RETURNING id`,
    [r.id, ruleKey, criterionKey, teacherId],
  );
  await ds.query(`UPDATE examcollect.error_rule SET current_revision_id = $2 WHERE id = $1`, [r.id, v.id]);
  return r.id as string;
}

async function legacyPriceVersion(
  ds: DataSource,
  teacherId: string,
  prices: Record<string, string | null>,
): Promise<string> {
  const [{ next }] = await ds.query(
    `SELECT COALESCE(MAX(version), 0) + 1 AS next FROM examcollect.price_table_version WHERE teacher_id = $1`,
    [teacherId],
  );
  const [v] = await ds.query(
    `INSERT INTO examcollect.price_table_version (teacher_id, version, created_by) VALUES ($1, $2, $1) RETURNING id`,
    [teacherId, next],
  );
  for (const [ruleId, deduction] of Object.entries(prices)) {
    await ds.query(
      `INSERT INTO examcollect.rule_price (price_table_version_id, error_rule_id, teacher_id, deduction) VALUES ($1, $2, $3, $4)`,
      [v.id, ruleId, teacherId, deduction],
    );
  }
  return v.id as string;
}

/** Thêm một bản của rubric `name` (đã có hoặc mới) với đúng các tiêu chí `keys`. */
async function addRubricVersion(
  ds: DataSource,
  teacherId: string,
  name: string,
  version: number,
  keys: string[],
): Promise<string> {
  const [r] = await ds.query(
    `INSERT INTO examcollect.rubric (version, teacher_id, name) VALUES ($1, $2, $3) RETURNING id`,
    [version, teacherId, name],
  );
  for (const k of keys) await seedCriterion(ds, r.id, k, 5);
  return r.id as string;
}

describe('Bảng lỗi theo rubric — lược đồ và backfill (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    ds = app.get(DataSource);
  }, 60_000);
  afterAll(async () => {
    await app.close();
  }, 60_000);

  /** Hai giảng viên; mỗi người một phiên (nên một rubric v1 với hai tiêu chí `tinh_dung`, `trinh_bay`). */
  async function twoTeachers(label: string) {
    const a = await seedSession(ds, `${label}-a`);
    const b = await seedSession(ds, `${label}-b`);
    for (const ctx of [a, b]) {
      await seedCriterion(ds, ctx.rubricId, 'tinh_dung', 6);
      await seedCriterion(ds, ctx.rubricId, 'trinh_bay', 4);
    }
    return { a, b, nameA: await rubricNameOf(ds, a.rubricId), nameB: await rubricNameOf(ds, b.rubricId) };
  }

  it('T-RBE-DATA-1: một dòng giá không trỏ được dòng áp dụng của giảng viên khác', async () => {
    const { a, b, nameA } = await twoTeachers('dat1');
    const rule = await seedRuleOnly(ds, a.teacherId, 'sai_bien');
    const assignment = await seedAssignment(ds, a.teacherId, nameA, rule.ruleId, 'tinh_dung');
    const [v] = await ds.query(
      `INSERT INTO examcollect.price_table_version (teacher_id, version, created_by) VALUES ($1, 1, $1) RETURNING id`,
      [b.teacherId],
    );
    await expect(
      ds.query(
        `INSERT INTO examcollect.rubric_error_price (price_table_version_id, rubric_error_id, teacher_id, deduction) VALUES ($1, $2, $3, '1.00')`,
        [v.id, assignment, b.teacherId],
      ),
    ).rejects.toThrow(/fk_rep_error_teacher/);
  });

  it('T-RBE-DATA-2: giá chỉ thêm; dòng áp dụng không xoá được; (giảng viên, rubric, lỗi) duy nhất', async () => {
    const { a, nameA } = await twoTeachers('dat2');
    const rule = await seedRuleOnly(ds, a.teacherId, 'sai_bien');
    const assignment = await seedAssignment(ds, a.teacherId, nameA, rule.ruleId, 'tinh_dung');
    await seedAssignmentPrices(ds, a.teacherId, { [assignment]: '1.00' });
    await expect(
      ds.query(`UPDATE examcollect.rubric_error_price SET deduction = '2.00' WHERE rubric_error_id = $1`, [assignment]),
    ).rejects.toThrow(/chỉ thêm/);
    await expect(ds.query(`DELETE FROM examcollect.rubric_error WHERE id = $1`, [assignment])).rejects.toThrow(
      /không xoá được/,
    );
    await expect(seedAssignment(ds, a.teacherId, nameA, rule.ruleId, 'trinh_bay')).rejects.toThrow(/uq_rubric_error/);
  });

  it('T-RBE-MIG-1: backfill dựng đúng dòng áp dụng và giá của MỌI phiên bản giá, chỉ cho giảng viên được chọn', async () => {
    const { a, b, nameA } = await twoTeachers('mig1');
    // R1 có hai bản: v1 {tinh_dung, trinh_bay} (từ seedSession), v2 {tinh_dung, hieu_nang}; R2 bản 1 {tinh_dung}.
    await addRubricVersion(ds, a.teacherId, nameA, 2, ['tinh_dung', 'hieu_nang']);
    const nameR2 = `R2 ${Date.now()}`;
    await addRubricVersion(ds, a.teacherId, nameR2, 1, ['tinh_dung']);
    const x = await legacyRule(ds, a.teacherId, 'x', 'tinh_dung');
    const y = await legacyRule(ds, a.teacherId, 'y', 'trinh_bay');
    const z = await legacyRule(ds, a.teacherId, 'z', 'hieu_nang');
    await legacyRule(ds, a.teacherId, 'w', 'khong_co_o_dau');
    await legacyRule(ds, a.teacherId, 'p', 'chua_gan', 'proposed');
    const v1 = await legacyPriceVersion(ds, a.teacherId, { [x]: '1.00', [y]: '2.00' });
    const v2 = await legacyPriceVersion(ds, a.teacherId, { [x]: '1.50', [y]: null, [z]: '0.25' });
    // Giảng viên B có một luật khớp rubric của B nhưng KHÔNG được chạm khi backfill chọn A.
    await legacyRule(ds, b.teacherId, 'cua_b', 'tinh_dung');

    await ds.query(BACKFILL_ASSIGNMENTS_SQL, [a.teacherId]);
    await ds.query(BACKFILL_PRICES_SQL, [a.teacherId]);

    const assigned = await ds.query(
      `SELECT re.rubric_name AS rubric, r.rule_key AS rule, re.criterion_key AS criterion
         FROM examcollect.rubric_error re JOIN examcollect.error_rule r ON r.id = re.error_rule_id
        WHERE re.teacher_id = $1`,
      [a.teacherId],
    );
    expect(
      assigned
        .map((r: { rubric: string; rule: string; criterion: string }) => `${r.rubric}|${r.rule}|${r.criterion}`)
        .sort(),
    ).toEqual(
      [`${nameA}|x|tinh_dung`, `${nameR2}|x|tinh_dung`, `${nameA}|y|trinh_bay`, `${nameA}|z|hieu_nang`].sort(),
    );

    const prices = await ds.query(
      `SELECT v.id AS version_id, r.rule_key AS rule, re.rubric_name AS rubric, p.deduction
         FROM examcollect.rubric_error_price p
         JOIN examcollect.price_table_version v ON v.id = p.price_table_version_id
         JOIN examcollect.rubric_error re ON re.id = p.rubric_error_id
         JOIN examcollect.error_rule r ON r.id = re.error_rule_id
        WHERE p.teacher_id = $1`,
      [a.teacherId],
    );
    const key = (r: { version_id: string; rule: string; rubric: string; deduction: string | null }) =>
      `${r.version_id === v1 ? 'v1' : r.version_id === v2 ? 'v2' : '?'}|${r.rule}|${r.rubric === nameA ? 'R1' : 'R2'}|${r.deduction}`;
    expect(prices.map(key).sort()).toEqual(
      ['v1|x|R1|1.00', 'v1|x|R2|1.00', 'v1|y|R1|2.00', 'v2|x|R1|1.50', 'v2|x|R2|1.50', 'v2|y|R1|null', 'v2|z|R1|0.25'].sort(),
    );

    const [{ n }] = await ds.query(`SELECT count(*)::int AS n FROM examcollect.rubric_error WHERE teacher_id = $1`, [
      b.teacherId,
    ]);
    expect(n).toBe(0);
  });

  it('T-RBE-MIG-3: chạy backfill lần hai không đổi gì; luật proposed và luật không khớp rubric nào không sinh dòng', async () => {
    const { a, nameA } = await twoTeachers('mig3');
    const x = await legacyRule(ds, a.teacherId, 'x', 'tinh_dung');
    await legacyRule(ds, a.teacherId, 'p', 'tinh_dung', 'proposed');
    await legacyPriceVersion(ds, a.teacherId, { [x]: '1.00' });
    const counts = async () => ({
      rows: (await ds.query(`SELECT count(*)::int AS n FROM examcollect.rubric_error WHERE teacher_id = $1`, [a.teacherId]))[0]
        .n,
      prices: (
        await ds.query(`SELECT count(*)::int AS n FROM examcollect.rubric_error_price WHERE teacher_id = $1`, [
          a.teacherId,
        ])
      )[0].n,
    });
    await ds.query(BACKFILL_ASSIGNMENTS_SQL, [a.teacherId]);
    await ds.query(BACKFILL_PRICES_SQL, [a.teacherId]);
    const first = await counts();
    await ds.query(BACKFILL_ASSIGNMENTS_SQL, [a.teacherId]);
    await ds.query(BACKFILL_PRICES_SQL, [a.teacherId]);
    expect(await counts()).toEqual(first);
    expect(first).toEqual({ rows: 1, prices: 1 }); // chỉ x@nameA; p (proposed) không có dòng
    expect(await assignmentId(ds, a.teacherId, nameA, x)).toEqual(expect.any(String));
  });

  it('error_rule_revision.criterion_key nhận NULL (bản sửa mới không còn mang tiêu chí)', async () => {
    const t = await seedTeacher(ds, 'null-crit');
    const rule = await seedRuleOnly(ds, t, 'khong_tieu_chi');
    const [v] = await ds.query(`SELECT criterion_key FROM examcollect.error_rule_revision WHERE id = $1`, [
      rule.revisionId,
    ]);
    expect(v.criterion_key).toBeNull();
  });
});
