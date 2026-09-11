import { INestApplication } from '@nestjs/common';
import request from 'supertest';

/**
 * "Mở phiên thi" — đóng băng danh sách dự thi (CLAUDE.md §7.1.1).
 *
 * Vì sao gần như mọi bộ e2e có `agent:join` đều phải gọi hàm này từ
 * 2026-09-11: `agent:join` từ chối một phiên chưa đóng băng. Đó là guard
 * TẠM THỜI thay cho việc chưa có khoảnh khắc "buổi thi bắt đầu" trong
 * vòng đời (§7.1.1b) — khi `scheduled` thành trạng thái thật, việc mở
 * phiên gộp vào chính transition đó và các lời gọi ở đây biến mất.
 *
 * Ném khi không mở được thay vì trả status: một bộ test tưởng đã mở
 * phiên mà thật ra chưa sẽ đỏ ở một khẳng định cách đó mười dòng, nói về
 * một thứ hoàn toàn khác. Lỗi phải nổ ngay tại đây.
 *
 * Yêu cầu: lớp của phiên đã có `enrollment`. Không có sinh viên nào thì
 * route trả 400 — cũng là hành vi đúng, xem `SessionRosterService.freeze`.
 */
export async function openSession(
  app: INestApplication,
  teacherToken: string,
  sessionId: string,
): Promise<void> {
  const response = await request(app.getHttpServer())
    .post(`/exam-sessions/${sessionId}/open`)
    .set('Authorization', `Bearer ${teacherToken}`);

  if (response.status !== 200) {
    throw new Error(
      `openSession(${sessionId}) thất bại: ${response.status} ${JSON.stringify(response.body)}`,
    );
  }
}
