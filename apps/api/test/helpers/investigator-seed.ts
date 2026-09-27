import { DataSource } from 'typeorm';
import { readFileCall, resultWith, runTestsCall } from '../../src/grading/decision/testing/result';
import type { StoredInvestigation } from '../../src/grading/scoring/stored-investigation';
import { seedCriterion, seedResult, SeedSession } from './grading-seed';

/**
 * Phiên đường điều tra: rubric hai tiêu chí (`tinh_dung` 6, `trinh_bay` 4), gói test hai ca
 * (`c1` nhóm `co_ban`, `c2` nhóm `bien`) ghim vào phiên.
 */
export async function seedInvestigatorSession(ds: DataSource, ctx: SeedSession): Promise<{ bundleId: string }> {
  await seedCriterion(ds, ctx.rubricId, 'tinh_dung', 6);
  await seedCriterion(ds, ctx.rubricId, 'trinh_bay', 4);
  const [b] = await ds.query(
    `INSERT INTO examcollect.grading_test_bundle (exam_session_id, version, origin, created_by, approved_by, approved_at)
     VALUES ($1, 1, 'teacher', $2, $2, now()) RETURNING id`,
    [ctx.sessionId, ctx.teacherId],
  );
  await ds.query(
    `INSERT INTO examcollect.grading_test_case (bundle_id, case_key, "group", input, expected_output)
     VALUES ($1, 'c1', 'co_ban', '1', '1'), ($1, 'c2', 'bien', '2', '2')`,
    [b.id],
  );
  await ds.query(`UPDATE examcollect.exam_session SET test_bundle_id = $2 WHERE id = $1`, [ctx.sessionId, b.id]);
  return { bundleId: b.id };
}

export async function seedRule(
  ds: DataSource,
  teacherId: string,
  ruleKey: string,
  criterionKey: string,
  predicate: object | null = null,
): Promise<{ ruleId: string; revisionId: string }> {
  const [r] = await ds.query(
    `INSERT INTO examcollect.error_rule (teacher_id, rule_key, origin, state) VALUES ($1, $2, 'teacher', 'active') RETURNING id`,
    [teacherId, ruleKey],
  );
  const [v] = await ds.query(
    `INSERT INTO examcollect.error_rule_revision (error_rule_id, revision, name, description, criterion_key, predicate, created_by)
     VALUES ($1, 1, $2, $2, $3, $4, $5) RETURNING id`,
    [r.id, ruleKey, criterionKey, predicate === null ? null : JSON.stringify(predicate), teacherId],
  );
  await ds.query(`UPDATE examcollect.error_rule SET current_revision_id = $2 WHERE id = $1`, [r.id, v.id]);
  return { ruleId: r.id, revisionId: v.id };
}

/** Phiên bản bảng giá mới của giảng viên với ĐÚNG các giá đã cho (luật không có dòng = chưa giá). */
export async function seedPrices(ds: DataSource, teacherId: string, prices: Record<string, string | null>): Promise<string> {
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
  return v.id;
}

/** Hồ sơ: nhóm `bien` fail (hay pass), model báo các lỗi `modelErrors`, đã đọc file bài nộp. */
export function storedWith(
  rulesSeen: StoredInvestigation['rulesSeen'],
  modelErrors: string[] = [],
  bienFails = true,
): StoredInvestigation {
  return {
    version: 1,
    result: resultWith({
      calls: [
        runTestsCall('t1', null, [
          { name: 'c1', group: 'co_ban', status: 'pass' },
          { name: 'c2', group: 'bien', status: bienFails ? 'fail' : 'pass' },
        ]),
        readFileCall('r1', 'bai-nop/main.cpp'),
      ],
      errors: modelErrors.map((ruleKey) => ({ ruleKey, toolCallIds: ['r1'] })),
    }),
    rulesSeen,
    modelCeiling: 1,
  };
}

/** Kết quả đường điều tra ở `ai_grading`, có lượt chấm `graded` mang hồ sơ đã cho. */
export async function seedInvestigatorResult(
  ds: DataSource,
  ctx: SeedSession,
  stored: StoredInvestigation,
): Promise<{ resultId: string; attemptId: string }> {
  const { resultId } = await seedResult(ds, ctx, 'investigator');
  const [a] = await ds.query(
    `INSERT INTO examcollect.grading_attempt (grading_result_id, attempt_no, outcome, investigation, triggered_by, finished_at)
     VALUES ($1, 1, 'graded', $2, $3, now()) RETURNING id`,
    [resultId, JSON.stringify(stored), ctx.teacherId],
  );
  await ds.query(`UPDATE examcollect.grading_result SET current_attempt_id = $2 WHERE id = $1`, [resultId, a.id]);
  return { resultId, attemptId: a.id };
}
