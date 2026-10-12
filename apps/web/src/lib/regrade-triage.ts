import type { GradingResult } from '@/lib/api/grading';
import { stateOf } from '@/lib/session-triage';

/**
 * Bài "không chấm được" mà CHẤM LẠI ĐƯỢC: dừng vì lỗi phía hệ thống (§4.4). Lớp `submission` không được tính —
 * chấm lại bài nộp hỏng ra đúng kết quả cũ. Bài mà API không gửi lớp cũng KHÔNG được tính: đếm nó là đoán, và
 * nút sẽ hiện một con số có thể sai.
 */
const isSystemUngradable = (result: GradingResult): boolean =>
  stateOf(result) === 'ungradable' && result.ungradableClass === 'system';

export function countSystemUngradable(results: GradingResult[]): number {
  return results.filter(isSystemUngradable).length;
}

/**
 * Nhóm "cùng lý do" — theo `ungradable_reason` NGUYÊN VĂN. Chuỗi này là văn bản tự do do hệ thống viết, nên gộp
 * theo nó là so chuỗi, không phải hiểu nghĩa: hai câu lỗi cùng nguyên nhân mà khác chữ không gộp (giảng viên
 * bấm hai lần, an toàn), còn gộp nhầm hai lý do khác nhau thì làm mất quyền chọn cái nào chấm lại.
 */
export function groupByUngradableReason(results: GradingResult[]): { reason: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const result of results) {
    if (!isSystemUngradable(result)) continue;
    const reason = result.ungradableReason ?? '';
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);
}
