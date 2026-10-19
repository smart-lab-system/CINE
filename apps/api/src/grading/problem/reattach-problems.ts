import { ConflictException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { AuthoredQuestion, lockSessionForWrite } from './problem.service';

/**
 * Gắn lại đề (5.4). Chỉ được làm khi:
 *  - chưa có bài chấm nào (kết quả đã chấm dựa trên đề cũ, đổi đề là đổi thước dưới chân bài đã chấm);
 *  - đề cương chưa xác nhận (đã xác nhận thì danh sách câu và thước đã chốt);
 *  - số câu giữ nguyên (câu có gói test và kết quả không xoá được, nên số câu không đổi được tại chỗ);
 *  - đề nhiều câu: điểm từng câu giữ nguyên (rubric của từng câu đã sinh theo điểm).
 *
 * Mọi điều kiện được kiểm TRƯỚC khi ghi gì; vi phạm thì 409 kèm lý do tiếng Việt, và không để lại thay đổi nào.
 * Trả danh sách câu hiện có theo thứ tự số thứ tự, để người gọi ghép câu mới với câu cũ theo vị trí.
 */
export async function assertReattachable(
  m: EntityManager,
  sessionId: string,
  questions: AuthoredQuestion[],
): Promise<{ problemId: string; ordinal: number; pointsHundredths: number }[]> {
  const [state] = await m.query(
    `SELECT EXISTS (SELECT 1 FROM examcollect.grading_result g
                      JOIN examcollect.submission s ON s.id = g.submission_id
                     WHERE s.exam_session_id = $1) AS graded,
            (SELECT blueprint_confirmed_at FROM examcollect.exam_session WHERE id = $1) AS confirmed`,
    [sessionId],
  );
  if (state.graded as boolean) {
    throw new ConflictException('Phiên đã có bài chấm — không gắn lại đề. Muốn đổi đề, mở một phiên mới.');
  }
  if (state.confirmed !== null) {
    throw new ConflictException('Đề cương đã xác nhận — không gắn lại đề. Muốn đổi đề, mở một phiên mới.');
  }

  const existing: { id: string; ordinal: number; points_hundredths: number }[] = await m.query(
    `SELECT id, ordinal, points_hundredths FROM examcollect.exam_problem WHERE exam_session_id = $1 ORDER BY ordinal`,
    [sessionId],
  );
  if (existing.length !== questions.length) {
    throw new ConflictException(
      `Đề mới có ${questions.length} câu, phiên đang có ${existing.length} câu — số câu phải giữ nguyên khi gắn lại. ` +
        'Muốn đổi số câu, mở một phiên mới.',
    );
  }
  if (questions.length > 1) {
    questions.forEach((q, i) => {
      if (Math.round(q.points * 100) !== existing[i].points_hundredths) {
        throw new ConflictException(
          `Điểm câu ${i + 1} đã đổi — điểm từng câu phải giữ nguyên khi gắn lại. Muốn đổi điểm, mở một phiên mới.`,
        );
      }
    });
  }
  return existing.map((p) => ({
    problemId: p.id,
    ordinal: p.ordinal,
    pointsHundredths: p.points_hundredths,
  }));
}

/**
 * Cập nhật đề của từng câu tại chỗ (5.4): câu i nhận đề mới, còn rubric, yêu cầu nộp và điểm giữ nguyên. Gọi sau
 * `assertReattachable` trong cùng transaction; khoá giảng viên trước hàng phiên, như mọi đường ghi.
 */
export async function reattachProblems(
  m: EntityManager,
  sessionId: string,
  questions: AuthoredQuestion[],
): Promise<{ problemId: string; ordinal: number }[]> {
  await lockSessionForWrite(m, sessionId);
  const existing = await assertReattachable(m, sessionId, questions);
  const out: { problemId: string; ordinal: number }[] = [];
  for (const [i, q] of questions.entries()) {
    await m.query(`UPDATE examcollect.exam_problem SET statement = $2 WHERE id = $1`, [existing[i].problemId, q.statement]);
    out.push({ problemId: existing[i].problemId, ordinal: existing[i].ordinal });
  }
  return out;
}
