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
  completed: 'accent',
  cancelled: 'destructive',
};
