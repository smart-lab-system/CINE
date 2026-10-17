import { EntityManager } from 'typeorm';

/**
 * Mọi lượt tính của MỘT giảng viên xếp hàng qua khoá này, tới hết transaction. Không có nó, một
 * lượt tính đầu đọc bảng giá cũ trong lúc một lượt sửa giá chưa commit và bị lượt đó bỏ qua (bài
 * còn `ai_grading`) — bài giữ điểm theo giá cũ mãi.
 *
 * THỨ TỰ KHOÁ là luật: khoá này TRƯỚC mọi khoá hàng. Người ghi nào của 3d/3e đụng dòng
 * `grading_result` đường điều tra (ghi lượt chấm, rút mẫu, chấm lại) phải xin khoá này trước khi
 * `FOR UPDATE` một dòng, không thì ôm chết với một lượt tính lại đang giữ khoá này và chờ dòng đó.
 */
export async function lockTeacherScoring(m: EntityManager, teacherId: string): Promise<void> {
  await m.query(`SELECT pg_advisory_xact_lock(hashtextextended('score_computation:' || $1::text, 0))`, [teacherId]);
}
