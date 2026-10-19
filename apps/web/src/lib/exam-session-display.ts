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
  active: 'Đang thi',
  collecting: 'Đang thu bài',
  completed: 'Đã kết thúc',
  cancelled: 'Đã huỷ',
};

export const EXAM_SESSION_STATUS_BADGE_VARIANT: Record<
  string,
  NonNullable<BadgeProps['variant']>
> = {
  draft: 'default',
  scheduled: 'info',
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
 * Đồng hồ không còn ghi đè `active` — `scheduled` / `active` đã mang đúng
 * nghĩa "chưa mở" / "đã mở". Phụ đề thời gian (nếu cần) do từng trang tự vẽ.
 */
export function getDisplaySessionStatus(
  status: string,
  _startTime: string,
  _endTime: string,
): { label: string; variant: NonNullable<BadgeProps['variant']> } {
  return {
    label: EXAM_SESSION_STATUS_LABELS[status] ?? status,
    variant: EXAM_SESSION_STATUS_BADGE_VARIANT[status] ?? 'default',
  };
}
