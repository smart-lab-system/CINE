import type { EntityManager } from 'typeorm';
import type { BreakdownError } from '../scoring/score-core';
import { groupResults } from './review-group';
import type { ReviewGroup } from './review-group.types';

export type StoredError = Pick<BreakdownError, 'ruleId' | 'ruleKey' | 'source'>;

/** Một bài được gom và các lỗi của lượt tính mới nhất của nó, như câu đọc trả về (`errors` null đã quy về rỗng). */
export interface GroupedRow {
  resultId: string;
  rubricVersionId: string;
  errors: StoredError[];
}

/** `DataSource` và `EntityManager` đều có `query`: danh sách đọc ngoài giao dịch, xác nhận đọc TRONG giao dịch của nó. */
type Queryable = Pick<EntityManager, 'query'>;

/**
 * Bài gom được của MỘT phiên — câu đọc DUY NHẤT mà cả danh sách nhóm (`ReviewGroupService`) lẫn xác nhận hàng loạt
 * (`ReviewGroupConfirmService`) dùng, để khoá nhóm mà giảng viên thấy và khoá mà lần xác nhận phân giải là cùng một
 * phép tính. Người gọi đã kiểm sở hữu phiên.
 *
 * Bài được gom: `flagged_for_review`, pipeline `investigator`, và lượt tính MỚI NHẤT (`created_at DESC, id DESC`, cùng
 * luật với `latestComputationRow`) có điểm. Bài chưa có lượt tính và bài dưới sàn (`ungradable_class` khác null, hoặc
 * lượt tính mới nhất có điểm null) bị để ngoài: nhóm `none` nghĩa là "hệ thống không tìm thấy lỗi", không phải "hệ
 * thống không chấm được".
 */
export async function loadGroupedRows(q: Queryable, sessionId: string): Promise<GroupedRow[]> {
  // Phiên bản rubric lấy từ `grading_result.rubric_id_version`, cột mà các đường tính lại dùng để khoanh phạm vi theo
  // rubric (`recomputeForTeacher`, `loadScoreContext`); mỗi dòng `score_computation` được ghi với đúng giá trị này.
  // `errors` có thể null nếu breakdown thiếu mảng: coi như rỗng thay vì để `.map` ném 500.
  const rows: { resultId: string; rubricVersionId: string; errors: StoredError[] | null }[] = await q.query(
    `SELECT g.id AS "resultId", g.rubric_id_version AS "rubricVersionId", last.breakdown -> 'errors' AS errors
       FROM examcollect.grading_result g
       JOIN examcollect.submission s ON s.id = g.submission_id
      CROSS JOIN LATERAL (
            SELECT c.score, c.breakdown
              FROM examcollect.score_computation c
             WHERE c.grading_result_id = g.id
             ORDER BY c.created_at DESC, c.id DESC
             LIMIT 1) last
      WHERE s.exam_session_id = $1
        AND g.status = 'flagged_for_review'
        AND g.pipeline = 'investigator'
        AND g.ungradable_class IS NULL
        AND last.score IS NOT NULL
      ORDER BY g.id`,
    [sessionId],
  );
  return rows.map((r) => ({ resultId: r.resultId, rubricVersionId: r.rubricVersionId, errors: r.errors ?? [] }));
}

/** Nhóm của các dòng trên, bằng hàm thuần `groupResults` — chưa có tên và mô tả luật. */
export function groupRows(rows: readonly GroupedRow[]): ReviewGroup[] {
  return groupResults(
    rows.map((r) => ({
      resultId: r.resultId,
      rubricVersionId: r.rubricVersionId,
      errors: r.errors.map((e) => ({ ruleId: e.ruleId, source: e.source })),
    })),
  );
}
