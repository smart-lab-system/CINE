import { MigrationInterface, QueryRunner } from 'typeorm';
import { APPROVE_ONCE_GUARD_ORIGINAL, backfillDefaultProblems } from '../../grading/problem/default-problem-backfill';

/**
 * P1a — M2: backfill câu mặc định với cổng checksum (§10.1). Chạy trong transaction `-t all`: nếu checksum
 * lệch thì ném và toàn bộ transaction rollback, DB không đổi. Gồm cả trigger bất biến problem_id và ngoại lệ
 * hẹp của guard duyệt-một-lần gói test (ruling trong ledger).
 */
export class ExamProblemBackfill1789610000000 implements MigrationInterface {
  name = 'ExamProblemBackfill1789610000000';

  public async up(q: QueryRunner): Promise<void> {
    await backfillDefaultProblems(q);
  }

  public async down(q: QueryRunner): Promise<void> {
    // Gỡ liên kết, trigger, và khôi phục guard duyệt-một-lần về bản gốc. Không đụng dữ liệu chấm.
    for (const table of ['grading_result', 'grading_test_bundle', 'grading_reference']) {
      await q.query(`DROP TRIGGER IF EXISTS trg_${table}_problem_immutable ON examcollect.${table}`);
    }
    await q.query(`DROP FUNCTION IF EXISTS examcollect.guard_problem_id_immutable()`);
    await q.query(`CREATE OR REPLACE FUNCTION examcollect.guard_test_bundle_approve_once() RETURNS trigger
      LANGUAGE plpgsql SET search_path TO 'examcollect', 'public' AS $function$${APPROVE_ONCE_GUARD_ORIGINAL}$function$`);
    await q.query(`ALTER TABLE examcollect.grading_result DISABLE TRIGGER trg_grading_result_updated_at`);
    await q.query(`UPDATE examcollect.grading_result SET problem_id = NULL`);
    await q.query(`ALTER TABLE examcollect.grading_result ENABLE TRIGGER trg_grading_result_updated_at`);
    await q.query(`ALTER TABLE examcollect.grading_test_bundle DISABLE TRIGGER trg_grading_test_bundle_approve_once`);
    await q.query(`UPDATE examcollect.grading_test_bundle SET problem_id = NULL`);
    await q.query(`ALTER TABLE examcollect.grading_test_bundle ENABLE TRIGGER trg_grading_test_bundle_approve_once`);
    await q.query(`UPDATE examcollect.grading_reference SET problem_id = NULL, ruler_trust = NULL`);
    await q.query(`DELETE FROM examcollect.exam_problem`);
  }
}
