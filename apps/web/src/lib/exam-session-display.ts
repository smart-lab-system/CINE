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
 * `ExamSessionEntity.status` has no real lifecycle transitions implemented
 * anywhere in the backend yet (see that entity's own comment) — `create()`
 * hardcodes every session to `'active'` and nothing ever flips it to
 * `'completed'` once `endTime` passes. Displaying the raw column as-is
 * would show "Đang diễn ra" forever, even for a session that ended days
 * ago — misleading, not just stale.
 *
 * This derives what to actually show from the session's real time window,
 * for `'active'` rows only — `'draft'`/`'cancelled'` are explicit teacher
 * decisions a clock should never override, so those still render as-is via
 * EXAM_SESSION_STATUS_LABELS/_BADGE_VARIANT above. `'scheduled'`/
 * `'completed'` are included too, on the chance the backend ever starts
 * setting them for real.
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
