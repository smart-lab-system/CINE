import type { BadgeProps } from '@/components/ui/badge';

export const EXAM_TYPE_LABELS: Record<string, string> = {
  TK: 'Thường kỳ',
  GK: 'Giữa kỳ',
  CK: 'Cuối kỳ',
};

export const EXAM_SESSION_STATUS_LABELS: Record<string, string> = {
  draft: 'Nháp',
  scheduled: 'Đã lên lịch',
  active: 'Đang diễn ra',
  completed: 'Đã hoàn thành',
  cancelled: 'Đã huỷ',
};

export const EXAM_SESSION_STATUS_BADGE_VARIANT: Record<
  string,
  NonNullable<BadgeProps['variant']>
> = {
  draft: 'default',
  scheduled: 'info',
  active: 'success',
  // Neutral, not a brand colour: a finished session needs no attention,
  // and teal sits close enough to the green used for "Đang diễn ra"
  // (174° vs 152°) that two coloured pills in the same column would be
  // easy to confuse at a glance.
  completed: 'default',
  cancelled: 'destructive',
};

/**
 * Suy trạng thái hiển thị từ khung giờ thật của phiên, cho các dòng `'active'`.
 *
 * `ExamSessionScheduler` (apps/api/src/exam-session/exam-session.scheduler.ts)
 * có sweep chuyển `active -> completed` khi `end_time` đã qua, và
 * "Chốt bài ngay" cũng chuyển ngay lập tức — nên `'completed'` là thật, không
 * còn là "trên lý thuyết" như bản ghi chú trước của hàm này nói. Cái vẫn cần
 * suy ở đây là quãng giữa hai lần sweep. `'draft'`/`'cancelled'` là quyết định
 * có chủ ý của giảng viên, đồng hồ không được ghi đè.
 *
 * Trang "Quản lý bài thu" cần thêm một phase nữa (`'collecting'`, trong grace
 * period) — xem lib/submission-attention.ts, không nhân bản luật đó vào đây.
 */
export function getDisplaySessionStatus(
  status: string,
  startTime: string,
  endTime: string,
): { label: string; variant: NonNullable<BadgeProps['variant']> } {
  if (status === 'active') {
    const now = Date.now();
    const start = new Date(startTime).getTime();
    const end = new Date(endTime).getTime();
    if (now < start) return { label: 'Sắp diễn ra', variant: 'info' };
    if (now > end) return { label: 'Đã kết thúc', variant: 'default' };
    return { label: 'Đang diễn ra', variant: 'success' };
  }
  return {
    label: EXAM_SESSION_STATUS_LABELS[status] ?? status,
    variant: EXAM_SESSION_STATUS_BADGE_VARIANT[status] ?? 'default',
  };
}
