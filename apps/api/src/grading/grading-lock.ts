import { EntityManager } from 'typeorm';

/**
 * Luật đóng băng — spec §2.3 luật 6, §14.3 *"danh sách duy nhất"*. Đề, đáp án mẫu, gói test và
 * rubric của phiên khoá khi phiên có ít nhất một kết quả MANG ĐIỂM hoặc ĐANG CHẤM; mở lại khi
 * mọi kết quả là bài không chấm được đã dừng hẳn — lúc đó chưa bài nào bị đo bằng thước cũ, nên
 * sửa thước không đẻ ra hai kỳ thi.
 *
 * "Mang điểm" gồm ba nguồn: điểm AI, một dòng review có điểm (bài không chấm được mà giảng viên
 * chấm tay), và một lượt tính điểm (đường `investigator`). "Đang chấm" đếm cả `ai_graded`: lô
 * đang chạy mà chưa bài nào ra điểm vẫn là hai thước trong một phiên.
 *
 * Một hàm tự do nhận `EntityManager`, không phải method của service: `GradingService` và
 * `GradingReferenceService` cùng module và một chiều đã phụ thuộc nhau — gọi qua service là vòng.
 */
export const GRADING_LOCKED_SQL = `
  SELECT EXISTS (
    SELECT 1
      FROM examcollect.grading_result g
      JOIN examcollect.submission s ON s.id = g.submission_id
     WHERE s.exam_session_id = $1
       AND (g.status IN ('ai_grading', 'ai_graded')
            OR g.ai_total_score IS NOT NULL
            OR EXISTS (SELECT 1 FROM examcollect.teacher_review t
                        WHERE t.grading_result_id = g.id AND t.final_score IS NOT NULL)
            OR EXISTS (SELECT 1 FROM examcollect.score_computation c
                        WHERE c.grading_result_id = g.id))
  ) AS locked`;

export async function isGradingLocked(manager: EntityManager, examSessionId: string): Promise<boolean> {
  const [row] = await manager.query(GRADING_LOCKED_SQL, [examSessionId]);
  return row.locked === true;
}

export const GRADING_LOCKED_MESSAGE = 'Phiên thi này đã có bài mang điểm hoặc đang chấm';
