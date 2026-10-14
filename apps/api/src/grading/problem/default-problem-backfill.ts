import { QueryRunner } from 'typeorm';

/** Số liệu chấm đổi giữa trước và sau backfill: dừng, để transaction rollback. */
export class ChecksumMismatchError extends Error {
  constructor(
    readonly before: string,
    readonly after: string,
  ) {
    super(`backfill câu mặc định dừng: số liệu chấm đổi (trước ${before} · sau ${after})`);
    this.name = 'ChecksumMismatchError';
  }
}

export interface BackfillCounts {
  problems: number;
  results: number;
  bundles: number;
  references: number;
}

/**
 * TypeORM trả `UPDATE … RETURNING` dưới dạng `[rows, số dòng]` (driver pg), còn INSERT trả mảng dòng. Đếm
 * `.length` trực tiếp sẽ luôn ra 2 — đây là lỗi đã bắt được ở test idempotent. Hàm này đọc đúng mảng dòng.
 */
function rowsOf(result: unknown): unknown[] {
  if (Array.isArray(result) && result.length === 2 && Array.isArray(result[0]) && typeof result[1] === 'number') {
    return result[0] as unknown[];
  }
  return result as unknown[];
}

/**
 * Chữ ký số liệu chấm (§10.1): tổng điểm AI, số kết quả, số dòng score_computation, mốc updated_at.
 * Không đọc được thì để lỗi nổi lên, không bỏ qua.
 */
async function checksum(q: QueryRunner): Promise<string> {
  const [row] = await q.query(`
    SELECT
      (SELECT coalesce(sum(ai_total_score), 0)::text FROM examcollect.grading_result) AS ai_sum,
      (SELECT count(*)::text FROM examcollect.grading_result WHERE status IS NOT NULL) AS status_n,
      (SELECT count(*)::text FROM examcollect.score_computation) AS sc_n,
      (SELECT coalesce(max(updated_at)::text, '') FROM examcollect.grading_result) AS upd_max`);
  return JSON.stringify(row);
}

/**
 * Tạo câu mặc định cho mọi phiên chưa có, rồi điền problem_id và ruler_trust. Chạy trong transaction của
 * người gọi (migration chạy với `-t all`). Tắt trigger updated_at của grading_result trong lúc điền để
 * dấu thời gian không làm lệch checksum (tiền lệ migration 1789430000000). Luôn bật lại trigger.
 *
 * Idempotent: chỉ điền dòng còn NULL, chỉ tạo câu cho phiên chưa có câu 1.
 */
export async function backfillDefaultProblems(q: QueryRunner): Promise<BackfillCounts> {
  await installProblemIdGuards(q);
  const before = await checksum(q);
  await q.query(`ALTER TABLE examcollect.grading_result DISABLE TRIGGER trg_grading_result_updated_at`);
  try {
    const problems = await q.query(`
      INSERT INTO examcollect.exam_problem
        (exam_session_id, ordinal, title, points_hundredths, required_deliverable_id, language, rubric_id, test_bundle_id)
      SELECT es.id, 1, 'Câu 1',
             coalesce((SELECT round(sum(rc.max_points) * 100)::int
                         FROM examcollect.rubric_criterion rc WHERE rc.rubric_id = es.rubric_id), 0),
             (SELECT rd.id FROM examcollect.required_deliverable rd WHERE rd.exam_session_id = es.id ORDER BY rd.id LIMIT 1),
             (SELECT rd.language::text FROM examcollect.required_deliverable rd WHERE rd.exam_session_id = es.id ORDER BY rd.id LIMIT 1),
             es.rubric_id,
             es.test_bundle_id
        FROM examcollect.exam_session es
       WHERE NOT EXISTS (SELECT 1 FROM examcollect.exam_problem p WHERE p.exam_session_id = es.id AND p.ordinal = 1)
      RETURNING id`);
    const results = await q.query(`
      UPDATE examcollect.grading_result g SET problem_id = p.id
        FROM examcollect.submission s, examcollect.exam_problem p
       WHERE g.problem_id IS NULL AND s.id = g.submission_id
         AND p.exam_session_id = s.exam_session_id AND p.ordinal = 1
      RETURNING g.id`);
    const bundles = await q.query(`
      UPDATE examcollect.grading_test_bundle b SET problem_id = p.id
        FROM examcollect.exam_problem p
       WHERE b.problem_id IS NULL AND p.exam_session_id = b.exam_session_id AND p.ordinal = 1
      RETURNING b.id`);
    const references = await q.query(`
      UPDATE examcollect.grading_reference r
         SET problem_id = p.id,
             ruler_trust = CASE WHEN r.model_answer_unverified THEN 'unverified' ELSE 'teacher' END
        FROM examcollect.exam_problem p
       WHERE r.problem_id IS NULL AND p.exam_session_id = r.exam_session_id AND p.ordinal = 1
      RETURNING r.id`);
    const after = await checksum(q);
    if (after !== before) throw new ChecksumMismatchError(before, after);
    return {
      problems: rowsOf(problems).length,
      results: rowsOf(results).length,
      bundles: rowsOf(bundles).length,
      references: rowsOf(references).length,
    };
  } finally {
    await q.query(`ALTER TABLE examcollect.grading_result ENABLE TRIGGER trg_grading_result_updated_at`);
  }
}

/** Định nghĩa gốc của guard duyệt-một-lần của gói test (migration 1789xxx). M2.down() khôi phục bằng đúng chuỗi này. */
export const APPROVE_ONCE_GUARD_ORIGINAL = `
      BEGIN
        IF OLD.approved_at IS NOT NULL
           OR (to_jsonb(NEW) - 'approved_by' - 'approved_at' - 'updated_at')
              IS DISTINCT FROM (to_jsonb(OLD) - 'approved_by' - 'approved_at' - 'updated_at') THEN
          RAISE EXCEPTION 'Gói test % chỉ ghi được việc duyệt, và chỉ một lần — đổi nội dung là phiên bản mới', OLD.id
            USING ERRCODE = 'object_not_in_prerequisite_state';
        END IF;
        RETURN NEW;
      END `;

/**
 * Ngoại lệ hẹp cho guard duyệt-một-lần (ruling trong ledger): ghi `problem_id` từ NULL khi mọi cột khác
 * không đổi thì được phép, kể cả với gói đã duyệt. Guard bảo vệ NỘI DUNG gói test; liên kết câu là cột cấu trúc.
 */
async function relaxApproveOnceGuardForLink(q: QueryRunner): Promise<void> {
  await q.query(`
    CREATE OR REPLACE FUNCTION examcollect.guard_test_bundle_approve_once() RETURNS trigger
    LANGUAGE plpgsql SET search_path TO 'examcollect', 'public' AS $function$
      BEGIN
        IF OLD.problem_id IS NULL AND NEW.problem_id IS NOT NULL
           AND (to_jsonb(NEW) - 'problem_id' - 'updated_at') IS NOT DISTINCT FROM (to_jsonb(OLD) - 'problem_id' - 'updated_at') THEN
          RETURN NEW;
        END IF;
        IF OLD.approved_at IS NOT NULL
           OR (to_jsonb(NEW) - 'approved_by' - 'approved_at' - 'updated_at')
              IS DISTINCT FROM (to_jsonb(OLD) - 'approved_by' - 'approved_at' - 'updated_at') THEN
          RAISE EXCEPTION 'Gói test % chỉ ghi được việc duyệt, và chỉ một lần — đổi nội dung là phiên bản mới', OLD.id
            USING ERRCODE = 'object_not_in_prerequisite_state';
        END IF;
        RETURN NEW;
      END $function$`);
}

/**
 * Chặn đổi `problem_id` đã có giá trị (§3.2). NULL → giá trị vẫn được (backfill, và kết quả cũ). Idempotent:
 * chạy lại an toàn (CREATE OR REPLACE + DROP TRIGGER IF EXISTS).
 */
export async function installProblemIdGuards(q: QueryRunner): Promise<void> {
  await relaxApproveOnceGuardForLink(q);
  await q.query(`
    CREATE OR REPLACE FUNCTION examcollect.guard_problem_id_immutable() RETURNS trigger
    LANGUAGE plpgsql SET search_path = examcollect, public AS $$
    BEGIN
      IF OLD.problem_id IS NOT NULL AND NEW.problem_id IS DISTINCT FROM OLD.problem_id THEN
        RAISE EXCEPTION 'problem_id của % không được đổi sau khi tạo', TG_TABLE_NAME
          USING ERRCODE = 'check_violation';
      END IF;
      RETURN NEW;
    END $$`);
  for (const table of ['grading_result', 'grading_test_bundle', 'grading_reference']) {
    await q.query(`DROP TRIGGER IF EXISTS trg_${table}_problem_immutable ON examcollect.${table}`);
    await q.query(`
      CREATE TRIGGER trg_${table}_problem_immutable
        BEFORE UPDATE OF problem_id ON examcollect.${table}
        FOR EACH ROW EXECUTE FUNCTION examcollect.guard_problem_id_immutable()`);
  }
}
