/**
 * Định dạng thời gian đã chấm từ `gradingTriggeredAt` → "3 phút 12 giây" / "12 giây".
 * Không làm tròn phút: giây luôn hiện để đồng hồ sống mỗi giây có ý nghĩa.
 */
export function formatGradingElapsed(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  if (hours > 0) return `${hours} giờ ${minutes} phút ${seconds} giây`;
  if (minutes > 0) return `${minutes} phút ${seconds} giây`;
  return `${seconds} giây`;
}

/** Quá ngưỡng này ở một bước chấm là lâu hơn bình thường: một lượt chấm thường xong trong vài phút. */
export const LONG_WAIT_MS = 30 * 60_000;

/**
 * Câu alert hồ sơ chưa xong. Hai trạng thái nói hai chuyện khác nhau: `ai_grading` là AI đang chấm; `ai_graded` là AI
 * ĐÃ chấm xong và hệ thống đang xếp loại (chuyển cho giảng viên hay tự chốt), nên không được nói "AI đang chấm".
 * Thiếu mốc thời gian → câu ngắn không đồng hồ. Quá `LONG_WAIT_MS` thì nói thẳng là có thể bị kẹt, thay vì để đồng
 * hồ chạy mãi mà không ai biết bài đã đứng.
 */
export function gradingInProgressMessage(
  gradingTriggeredAt: string | null | undefined,
  nowMs: number,
  status: string = 'ai_grading',
): string {
  const head = status === 'ai_graded' ? 'AI đã chấm xong, hệ thống đang xếp loại bài này' : 'AI đang chấm bài này';
  if (!gradingTriggeredAt) return `${head}.`;
  const started = Date.parse(gradingTriggeredAt);
  if (Number.isNaN(started)) return `${head}.`;
  const waited = nowMs - started;
  const long = waited >= LONG_WAIT_MS ? ' Lâu hơn bình thường: bài này có thể bị kẹt.' : '';
  return `${head} - đã ${formatGradingElapsed(waited)}.${long}`;
}
