import type { BadgeProps } from '@/components/ui/badge';

export const EXAM_TYPE_LABELS: Record<string, string> = {
  TK: 'Thường kỳ',
  GK: 'Giữa kỳ',
  CK: 'Cuối kỳ',
};

/**
 * Nhãn status DB → UI. Map thẳng, không suy từ đồng hồ
 * (spec 2026-10-18-exam-session-setup-edit-flow §8).
 */
export const EXAM_SESSION_STATUS_LABELS: Record<string, string> = {
  draft: 'Nháp',
  scheduled: 'Sắp diễn ra',
  not_ready: 'Chưa đủ điều kiện',
  missed: 'Không diễn ra',
  active: 'Đang thi',
  collecting: 'Đang thu bài',
  completed: 'Đã kết thúc',
  cancelled: 'Đã huỷ',
};

/**
 * Mọi badge trạng thái phiên cùng một bề rộng.
 * "Chưa đủ điều kiện" là nhãn dài nhất — các nhãn ngắn hơn căn giữa,
 * không co theo số chữ.
 */
export const EXAM_SESSION_STATUS_BADGE_CLASS =
  'box-border inline-flex w-[12.5rem] shrink-0 items-center justify-center overflow-hidden text-ellipsis whitespace-nowrap';

export const EXAM_SESSION_STATUS_BADGE_VARIANT: Record<
  string,
  NonNullable<BadgeProps['variant']>
> = {
  draft: 'default',
  scheduled: 'info',
  not_ready: 'warning',
  missed: 'destructive',
  active: 'success',
  // `info`, không phải `success`: giai đoạn này còn việc phải làm — hai
  // nút "Thu lại"/"Xác nhận kết thúc" đang chờ ai đó bấm — nên nó không
  // được trông giống một trạng thái đã yên.
  collecting: 'info',
  completed: 'default',
  cancelled: 'destructive',
};

/**
 * Nhãn + màu badge theo status DB.
 *
 * `scheduled` là chưa mở. `active` là đã mở — tự động hoặc thủ công.
 * Đồng hồ chỉ tách `active`: chưa tới `startTime` thì "Đang diễn ra",
 * từ `startTime` trở đi thì "Đang thi". Status khác không bị đồng hồ ghi đè.
 */
export function getDisplaySessionStatus(
  status: string,
  startTime: string,
  _endTime: string,
  now: number = Date.now(),
): { label: string; variant: NonNullable<BadgeProps['variant']> } {
  if (status === 'active') {
    const start = Date.parse(startTime);
    if (Number.isFinite(start) && now < start) {
      return { label: 'Đang diễn ra', variant: 'info' };
    }
    return { label: 'Đang thi', variant: 'success' };
  }
  return {
    label: EXAM_SESSION_STATUS_LABELS[status] ?? status,
    variant: EXAM_SESSION_STATUS_BADGE_VARIANT[status] ?? 'default',
  };
}
