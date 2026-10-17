import { EntityManager } from 'typeorm';
import { blankReasonOf } from '../../grade-export/blank-reason';
import { pickScore } from '../../grade-export/score-string';
import type { TeacherReviewKind } from '../grading-model.types';
import { aggregateStudentTotal, ProblemState, StudentTotal } from './student-total';

/**
 * Một dòng = (sinh viên trong roster, câu, bài của sinh viên đó cho câu). `result_id` NULL là sinh viên không có
 * bài cho câu này. Các cột điểm đi cùng nguồn với sổ điểm (`grade-export.data.ts`), để điểm tổng và sổ điểm
 * không bao giờ lệch nhau.
 */
interface RosterProblemRow {
  mssv: string;
  problem_id: string;
  ordinal: number;
  points_hundredths: number;
  result_id: string | null;
  status: string | null;
  pipeline: 'one_shot' | 'investigator' | null;
  ungradable_class: string | null;
  ai_total_score: string | null;
  finalized_computation_id: string | null;
  review_kind: string | null;
  review_score: string | null;
  manual_score: string | null;
  finalized_score: string | null;
  latest_score: string | null;
}

/**
 * Bài của sinh viên cho câu: `grading_result.problem_id` trỏ đúng câu; bài cũ chưa có `problem_id` thì thuộc câu 1
 * (như backfill M2). Roster là tập sinh viên — vắng vẫn có dòng, và dòng đó thành `blank`.
 */
const ROSTER_PROBLEM_SQL = `
  SELECT r.student_mssv AS mssv, p.id AS problem_id, p.ordinal, p.points_hundredths,
         g.id AS result_id, g.status, g.pipeline, g.ungradable_class, g.ai_total_score, g.finalized_computation_id,
         rv.kind AS review_kind, rv.final_score AS review_score,
         (SELECT t.final_score FROM examcollect.teacher_review t
           WHERE t.grading_result_id = g.id AND t.kind = 'manual_score'
           ORDER BY t.reviewed_at DESC, t.id DESC LIMIT 1) AS manual_score,
         fc.score AS finalized_score,
         (SELECT c.score FROM examcollect.score_computation c
           WHERE c.grading_result_id = g.id ORDER BY c.created_at DESC, c.id DESC LIMIT 1) AS latest_score
    FROM examcollect.session_roster r
    JOIN examcollect.exam_problem p ON p.exam_session_id = r.exam_session_id
    LEFT JOIN examcollect.submission s
           ON s.exam_session_id = r.exam_session_id AND lower(s.student_mssv) = lower(r.student_mssv)
    LEFT JOIN examcollect.grading_result g
           ON g.submission_id = s.id AND (g.problem_id = p.id OR (g.problem_id IS NULL AND p.ordinal = 1))
    LEFT JOIN examcollect.score_computation fc ON fc.id = g.finalized_computation_id
    LEFT JOIN LATERAL (
      SELECT t.kind, t.final_score FROM examcollect.teacher_review t
       WHERE t.grading_result_id = g.id AND t.final_score IS NOT NULL
       ORDER BY t.reviewed_at DESC, t.id DESC LIMIT 1) rv ON true
   WHERE r.exam_session_id = $1
   ORDER BY r.student_mssv, p.ordinal`;

/** Trạng thái một câu với một sinh viên, từ các bài của sinh viên đó cho câu (thường là đúng một bài). */
function stateOf(ordinal: number, pointsHundredths: number, rows: RosterProblemRow[]): ProblemState {
  const results = rows.filter((r) => r.result_id !== null);
  const pendingState: ProblemState = { ordinal, status: 'pending', pointsHundredths, scoreHundredths: null, auditPending: false };
  if (results.length === 0) {
    return { ...pendingState, status: 'blank' };
  }
  // Nhiều bài cho một câu là xung đột: chưa có điểm, cùng quy tắc với sổ điểm (fold-student-results).
  if (results.length > 1) {
    return pendingState;
  }
  const r = results[0];
  if (r.status === 'audit_pending') {
    return { ...pendingState, auditPending: true };
  }
  const reason = blankReasonOf({ hasSubmission: true, status: r.status, ungradableClass: r.ungradable_class });
  if (reason !== null) {
    return pendingState;
  }
  const picked = pickScore({
    pipeline: r.pipeline ?? 'one_shot',
    aiTotalScore: r.ai_total_score,
    latestScoredReview: r.review_kind ? { kind: r.review_kind as TeacherReviewKind, finalScore: r.review_score! } : null,
    latestManualScore: r.manual_score,
    finalized: true, // blankReasonOf đã loại mọi bài chưa chốt ở trên
    finalizedComputationScore: r.finalized_score,
    latestComputationScore: r.latest_score,
  });
  if (picked === null) {
    return pendingState;
  }
  return {
    ordinal,
    status: r.status === 'exported' ? 'exported' : 'finalized',
    pointsHundredths,
    scoreHundredths: picked.hundredths,
    auditPending: false,
  };
}

/** Một câu của một sinh viên trên bảng: trạng thái đã rút gọn, kèm id câu để giao diện gọi đúng đường. */
export interface StudentBoardProblem extends ProblemState {
  problemId: string;
}

/** Một dòng của bảng sinh viên: tổng (Task 5) và các chip theo câu. */
export interface StudentBoardRow {
  mssv: string;
  name: string;
  total: StudentTotal;
  problems: StudentBoardProblem[];
}

/**
 * Bảng sinh viên của một phiên, MỘT dòng mỗi sinh viên trong roster, theo MSSV. Chỉ đọc. Phiên không có câu nào
 * thì không có dòng nào: không có câu thì không có gì để cộng.
 */
export async function loadStudentBoard(m: EntityManager, sessionId: string): Promise<StudentBoardRow[]> {
  const [count] = await m.query(`SELECT COUNT(*)::int AS n FROM examcollect.exam_problem WHERE exam_session_id = $1`, [
    sessionId,
  ]);
  const expectedCount = count.n as number;
  if (expectedCount === 0) {
    return [];
  }
  const names: { mssv: string; name: string }[] = await m.query(
    `SELECT student_mssv AS mssv, student_name AS name FROM examcollect.session_roster
      WHERE exam_session_id = $1 ORDER BY student_mssv`,
    [sessionId],
  );
  const rows: RosterProblemRow[] = await m.query(ROSTER_PROBLEM_SQL, [sessionId]);

  const byStudent = new Map<string, RosterProblemRow[]>();
  for (const row of rows) {
    const key = row.mssv.toLowerCase();
    const list = byStudent.get(key) ?? [];
    list.push(row);
    byStudent.set(key, list);
  }

  return names.map(({ mssv, name }) => {
    const byOrdinal = new Map<number, RosterProblemRow[]>();
    for (const row of byStudent.get(mssv.toLowerCase()) ?? []) {
      const list = byOrdinal.get(row.ordinal) ?? [];
      list.push(row);
      byOrdinal.set(row.ordinal, list);
    }
    const problems: StudentBoardProblem[] = [...byOrdinal].map(([ordinal, list]) => ({
      ...stateOf(ordinal, list[0].points_hundredths, list),
      problemId: list[0].problem_id,
    }));
    return { mssv, name, total: aggregateStudentTotal(problems, expectedCount), problems };
  });
}

/**
 * Điểm tổng của MỌI sinh viên trong roster của một phiên, khoá theo MSSV chữ thường (khớp cách so MSSV ở
 * `lower(...)` trong SQL). Chỉ đọc; không ghi gì. Dựng trên `loadStudentBoard` để hai đường không bao giờ lệch.
 */
export async function loadStudentTotals(m: EntityManager, sessionId: string): Promise<Map<string, StudentTotal>> {
  const board = await loadStudentBoard(m, sessionId);
  return new Map(board.map((row) => [row.mssv.toLowerCase(), row.total]));
}
