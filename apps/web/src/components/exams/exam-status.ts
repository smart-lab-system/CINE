import type { ExamEventStatus, SessionType } from './exam-types';

export const EXAM_STATUS_LABELS: Record<ExamEventStatus, string> = {
  draft: 'Nháp',
  scheduled: 'Đã công bố',
  active: 'Đang diễn ra',
  completed: 'Hoàn thành',
  cancelled: 'Đã hủy',
  aborted: 'Dừng',
};

export const SESSION_TYPE_LABELS: Record<SessionType, string> = {
  exam: 'Thi',
  practice: 'Thực hành',
};

export function examStatusBadgeVariant(
  status: ExamEventStatus,
): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'cancelled' || status === 'aborted') return 'destructive';
  if (status === 'draft') return 'secondary';
  if (status === 'scheduled') return 'outline';
  return 'default';
}
