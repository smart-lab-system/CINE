const SETUP_LEAD_MS = 30 * 60_000;

/**
 * Bấm một dòng danh sách kỳ thi.
 * Còn hơn 30 phút trước giờ bắt đầu → thiết lập. Đã vào khoảng đó, hoặc đã qua giờ bắt đầu → vận hành.
 */
export function examSessionRowHref(sessionId: string, startTime: string, now = Date.now()): string {
  const start = Date.parse(startTime);
  if (Number.isFinite(start) && now < start - SETUP_LEAD_MS) {
    return `/teacher/exam-sessions/${sessionId}`;
  }
  return `/exam-sessions/${sessionId}`;
}
