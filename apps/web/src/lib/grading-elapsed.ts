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

/** Câu alert hồ sơ đang chấm. Thiếu mốc thời gian → câu ngắn không đồng hồ. */
export function gradingInProgressMessage(gradingTriggeredAt: string | null | undefined, nowMs: number): string {
  if (!gradingTriggeredAt) return 'AI đang chấm bài này.';
  const started = Date.parse(gradingTriggeredAt);
  if (Number.isNaN(started)) return 'AI đang chấm bài này.';
  return `AI đang chấm bài này - đã ${formatGradingElapsed(nowMs - started)}.`;
}
