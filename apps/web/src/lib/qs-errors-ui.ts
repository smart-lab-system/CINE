import type { OverviewCriterion, RubricOverview } from './api/rubric-errors';
import { formatVnPoints } from './format';
import { shorten } from './rubric-board';

export function isQsOverview(overview: RubricOverview): boolean {
  return (overview.kind ?? 'qa') === 'qs' && (overview.approaches?.length ?? 0) > 0;
}

/** Nhãn chọn tiêu chí/bước trong drawer / dialog chuyển lỗi. */
export function criterionSelectLabel(overview: RubricOverview, c: OverviewCriterion): string {
  if (isQsOverview(overview)) {
    for (const ap of overview.approaches!) {
      if (ap.steps.some((s) => s.key === c.key)) {
        return `${ap.name} › ${shorten(c.description, 40)} · tối đa ${formatVnPoints(c.maxPoints)}`;
      }
    }
  }
  return `${shorten(c.description, 50)} · tối đa ${formatVnPoints(c.maxPoints)}`;
}

export function approachOfStep(
  overview: RubricOverview,
  stepKey: string,
): { key: string; name: string } | null {
  if (!isQsOverview(overview)) return null;
  for (const ap of overview.approaches!) {
    if (ap.steps.some((s) => s.key === stepKey)) return { key: ap.key, name: ap.name };
  }
  return null;
}
