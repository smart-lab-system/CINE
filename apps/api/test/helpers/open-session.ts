import { INestApplication } from '@nestjs/common';
import request from 'supertest';

/**
 * "Mở phiên thi" — freeze roster + `scheduled → active`
 * (spec 2026-10-18-exam-session-setup-edit-flow; CLAUDE.md §7.1.1).
 *
 * Mọi bộ e2e cần `agent:join` hoặc `finalize` phải gọi hàm này sau create:
 * create ghi `scheduled`, join/finalize chỉ ăn `active`.
 *
 * Ném khi không mở được thay vì trả status — lỗi phải nổ ngay tại đây.
 * Yêu cầu: lớp đã có `enrollment` (freeze từ chối lớp rỗng).
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
