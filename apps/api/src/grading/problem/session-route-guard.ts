import { ConflictException, NotFoundException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { lockTeacherScoring } from '../scoring/teacher-lock';

/**
 * Chặn route cấp phiên (sửa tài liệu chấm, gói test, rubric) khi phiên đã có nhiều câu hoặc đã xác
 * nhận đề cương (P1b, §3.4, §6.3b). Các route này chỉ ghi vào câu mặc định của phiên; với phiên nhiều
 * câu, sửa phải đi theo từng câu, và với phiên đã xác nhận thì đề cương đã khoá.
 *
 * Gọi TRONG transaction của lượt ghi, trước mọi lệnh ghi. Hàm tự xin khoá giảng viên rồi khoá hàng phiên
 * `FOR UPDATE`, đúng thứ tự khoá của mọi đường ghi (khoá giảng viên trước, hàng phiên sau — xem
 * `teacher-lock.ts`), nên một lượt thêm câu đồng thời không lọt vào giữa lúc kiểm và lúc ghi. Xin khoá
 * giảng viên lần thứ hai trong cùng transaction là an toàn: advisory lock của PostgreSQL có tính đệ quy
 * trong cùng một phiên kết nối.
 */
export async function assertSessionRouteAllowed(m: EntityManager, sessionId: string): Promise<void> {
  const [owner] = await m.query(`SELECT teacher_id FROM examcollect.exam_session WHERE id = $1`, [sessionId]);
  if (!owner) {
    throw new NotFoundException('Không tìm thấy phiên thi.');
  }
  await lockTeacherScoring(m, owner.teacher_id as string);

  const [row] = await m.query(
    `SELECT s.blueprint_confirmed_at,
            (SELECT COUNT(*)::int FROM examcollect.exam_problem p WHERE p.exam_session_id = s.id) AS problem_count
       FROM examcollect.exam_session s
      WHERE s.id = $1
        FOR UPDATE`,
    [sessionId],
  );
  const problemCount = row.problem_count as number;
  if (problemCount > 1) {
    throw new ConflictException(`phiên này có ${problemCount} câu — sửa tài liệu chấm theo từng câu`);
  }
  if (row.blueprint_confirmed_at) {
    throw new ConflictException('phiên đã xác nhận đề cương — sửa tài liệu chấm theo từng câu');
  }
}
