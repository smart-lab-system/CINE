import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import type { TeacherReviewKind } from '../grading/grading-model.types';
import type { CurrentScoreInput } from '../grading/scoring/current-score';
import { parseHundredths } from '../grading/scoring/hundredths';
import type { ScoreBreakdown } from '../grading/scoring/score-core';
import type { StudentTotal } from '../grading/problem/student-total';
import { loadStudentTotals } from '../grading/problem/student-total.query';
import { blankReasonOf } from './blank-reason';
import type { PlanStudent, PreviousWrite, StudentOutcome } from './plan';
import { foldStudentResults } from './fold-student-results';
import { pickScore } from './score-string';

export interface DeliverableInfo {
  id: string;
  requiredFilename: string;
}

interface ResultRow {
  mssv: string;
  name: string;
  status: string | null;
  pipeline: 'one_shot' | 'investigator' | null;
  ungradable_class: string | null;
  ai_total_score: string | null;
  finalized_computation_id: string | null;
  review_kind: string | null;
  review_score: string | null;
  manual_score: string | null;
  finalized_score: string | null;
  latest_computation_id: string | null;
  latest_score: string | null;
}

/**
 * Cùng các cột mà `loadCurrentScore` (`scoring/score-inputs.ts:147`) nạp — nhưng cho CẢ PHIÊN và kèm mssv. Chỉ SQL
 * được lặp; thứ tự ưu tiên nguồn vẫn ở `currentScore()` (qua `pickScore`), và một e2e đòi hai bên ra cùng điểm.
 */
const RESULTS_SQL = `
  SELECT s.student_mssv AS mssv, s.student_name_input AS name,
         g.status, g.pipeline, g.ungradable_class, g.ai_total_score, g.finalized_computation_id,
         rv.kind AS review_kind, rv.final_score AS review_score,
         (SELECT t.final_score FROM examcollect.teacher_review t
           WHERE t.grading_result_id = g.id AND t.kind = 'manual_score'
           ORDER BY t.reviewed_at DESC, t.id DESC LIMIT 1) AS manual_score,
         fc.score AS finalized_score,
         (SELECT c.id FROM examcollect.score_computation c
           WHERE c.grading_result_id = g.id ORDER BY c.created_at DESC, c.id DESC LIMIT 1) AS latest_computation_id,
         (SELECT c.score FROM examcollect.score_computation c
           WHERE c.grading_result_id = g.id ORDER BY c.created_at DESC, c.id DESC LIMIT 1) AS latest_score
    FROM examcollect.submission s
    LEFT JOIN examcollect.grading_result g ON g.submission_id = s.id
    LEFT JOIN examcollect.score_computation fc ON fc.id = g.finalized_computation_id
    LEFT JOIN LATERAL (
      SELECT t.kind, t.final_score FROM examcollect.teacher_review t
       WHERE t.grading_result_id = g.id AND t.final_score IS NOT NULL
       ORDER BY t.reviewed_at DESC, t.id DESC LIMIT 1) rv ON true
   WHERE s.exam_session_id = $1 AND ($2::uuid IS NULL OR s.required_deliverable_id = $2::uuid)`;

/**
 * Ô điểm của sinh viên khi xuất tổng (P1b §8). Không có bài nào thì vắng. Tổng `final` là điểm. Còn câu chưa chốt
 * thì ô trống "chưa chốt" — không ghi điểm tạm. Có câu chờ kiểm mẫu thì ô trống "chờ duyệt", đúng nhãn mà đường một
 * câu đã dùng cho kiểm mẫu. Nhãn đều là nhãn sẵn có: không thêm nhãn mới.
 */
function totalOutcome(total: StudentTotal | undefined, hasSubmission: boolean): StudentOutcome {
  if (!hasSubmission || total === undefined) {
    return { kind: 'blank', reason: 'absent' };
  }
  if (total.kind === 'final') {
    return { kind: 'scored', hundredths: total.hundredths, computationId: null, source: 'total' };
  }
  if (total.kind === 'tạm') {
    return { kind: 'blank', reason: 'not_finished' };
  }
  return { kind: 'blank', reason: 'flagged' };
}

function outcomeOf(r: ResultRow): StudentOutcome {
  const reason = blankReasonOf({ hasSubmission: true, status: r.status, ungradableClass: r.ungradable_class });
  if (reason !== null) return { kind: 'blank', reason };
  const input: CurrentScoreInput = {
    pipeline: r.pipeline ?? 'one_shot',
    aiTotalScore: r.ai_total_score,
    latestScoredReview: r.review_kind ? { kind: r.review_kind as TeacherReviewKind, finalScore: r.review_score! } : null,
    latestManualScore: r.manual_score,
    finalized: true, // blankReasonOf đã loại mọi bài chưa chốt
    finalizedComputationScore: r.finalized_score,
    latestComputationScore: r.latest_score,
  };
  const picked = pickScore(input);
  if (picked === null) return { kind: 'blank', reason: 'not_finished' };
  const computationId =
    picked.source === 'finalized' ? r.finalized_computation_id : picked.source === 'computation' ? r.latest_computation_id : null;
  return { kind: 'scored', hundredths: picked.hundredths, computationId, source: picked.source };
}

/** SQL nạp dữ liệu cho việc ghi điểm vào sổ điểm — mọi hàm nhận `EntityManager` để chạy trong transaction của người gọi. */
@Injectable()
export class GradeExportDataService {
  async deliverables(m: EntityManager, sessionId: string): Promise<DeliverableInfo[]> {
    const rows: { id: string; required_filename: string }[] = await m.query(
      `SELECT id, required_filename FROM examcollect.required_deliverable WHERE exam_session_id = $1 ORDER BY required_filename, id`,
      [sessionId],
    );
    return rows.map((r) => ({ id: r.id, requiredFilename: r.required_filename }));
  }

  /**
   * Sinh viên của phiên = `session_roster` (chụp cứng lúc mở phiên; chính comment của nó nói có để xuất bảng điểm)
   * HỢP với người đã nộp. Roster cho ra "vắng"; bài nộp cho ra mọi thứ còn lại. `publishedResults` = số bài
   * `finalized`/`exported` trong phạm vi — cổng D6.
   */
  async loadStudents(
    m: EntityManager,
    sessionId: string,
    deliverableId: string | null,
  ): Promise<{ students: PlanStudent[]; publishedResults: number }> {
    const roster: { mssv: string; name: string }[] = await m.query(
      `SELECT student_mssv AS mssv, student_name AS name FROM examcollect.session_roster WHERE exam_session_id = $1`,
      [sessionId],
    );
    const results: ResultRow[] = await m.query(RESULTS_SQL, [sessionId, deliverableId]);

    let publishedResults = 0;
    for (const r of results) if (r.status === 'finalized' || r.status === 'exported') publishedResults += 1;

    // Phiên nhiều câu xuất cả phiên (không chọn file): ô điểm là TỔNG của sinh viên, không gộp bài theo câu (P1b §8).
    // Gộp như cũ sẽ coi hai bài của hai câu là xung đột, nên ô nào cũng trống.
    const [count] = await m.query(`SELECT COUNT(*)::int AS n FROM examcollect.exam_problem WHERE exam_session_id = $1`, [
      sessionId,
    ]);
    if (deliverableId === null && (count.n as number) > 1) {
      const totals = await loadStudentTotals(m, sessionId);
      const withSubmission = new Set(results.map((r) => r.mssv.toLowerCase()));
      const students: PlanStudent[] = roster.map(({ mssv, name }) => ({
        mssv,
        name,
        outcome: totalOutcome(totals.get(mssv.toLowerCase()), withSubmission.has(mssv.toLowerCase())),
      }));
      return { students, publishedResults };
    }

    const students = foldStudentResults(roster, results.map((r) => ({ mssv: r.mssv, name: r.name, outcome: outcomeOf(r) })));
    return { students, publishedResults };
  }

  /**
   * Giá trị ĐÃ GHI cuối cùng cho từng sinh viên trong các lượt trước của phiên, cùng yêu cầu nộp (D15). Dòng trống
   * (`written_hundredths IS NULL`) không tính: chúng không nói gì về điều đã nói ra bên ngoài. Khoá: MSSV chữ thường.
   */
  async previousWrites(m: EntityManager, sessionId: string, deliverableId: string | null): Promise<Map<string, PreviousWrite>> {
    const rows: { key: string; hundredths: number; computation_id: string | null; step: number }[] = await m.query(
      `SELECT DISTINCT ON (lower(r.mssv::text)) lower(r.mssv::text) AS key,
              r.written_hundredths AS hundredths, r.score_computation_id AS computation_id,
              e.rounding_step_hundredths AS step
         FROM examcollect.grade_export_row r
         JOIN examcollect.grade_export e ON e.id = r.grade_export_id
        WHERE e.exam_session_id = $1
          AND e.required_deliverable_id IS NOT DISTINCT FROM $2::uuid
          AND r.written_hundredths IS NOT NULL
        ORDER BY lower(r.mssv::text), e.exported_at DESC, e.id DESC`,
      [sessionId, deliverableId],
    );
    return new Map(rows.map((r) => [r.key, { hundredths: r.hundredths, computationId: r.computation_id, step: r.step }]));
  }

  async previousExportCount(m: EntityManager, sessionId: string, deliverableId: string | null): Promise<number> {
    const [row]: { n: number }[] = await m.query(
      `SELECT count(*)::int AS n FROM examcollect.grade_export WHERE exam_session_id = $1 AND required_deliverable_id IS NOT DISTINCT FROM $2::uuid`,
      [sessionId, deliverableId],
    );
    return row?.n ?? 0;
  }

  /** Điểm thô (phần trăm) và breakdown của các lượt tính — để nói VÌ SAO một điểm đổi (D15). */
  async computations(m: EntityManager, ids: string[]): Promise<Map<string, { raw: number | null; breakdown: ScoreBreakdown }>> {
    if (ids.length === 0) return new Map();
    const rows: { id: string; score: string | null; breakdown: ScoreBreakdown }[] = await m.query(
      `SELECT id, score, breakdown FROM examcollect.score_computation WHERE id = ANY($1::uuid[])`,
      [ids],
    );
    return new Map(rows.map((r) => [r.id, { raw: r.score === null ? null : parseHundredths(r.score), breakdown: r.breakdown }]));
  }

  async ruleNames(m: EntityManager, revisionIds: string[]): Promise<Map<string, string>> {
    if (revisionIds.length === 0) return new Map();
    const rows: { id: string; name: string }[] = await m.query(
      `SELECT id, name FROM examcollect.error_rule_revision WHERE id = ANY($1::uuid[])`,
      [revisionIds],
    );
    return new Map(rows.map((r) => [r.id, r.name]));
  }
}
