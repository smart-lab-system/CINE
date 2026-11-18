import type { Rubric } from './api/grading';
import { formatVnPoints } from './format';

function qsCounts(rubric: Pick<Rubric, 'approaches' | 'criteria'>) {
  const approaches = rubric.approaches ?? [];
  const steps =
    approaches.length > 0
      ? approaches.reduce((n, a) => n + a.steps.length, 0)
      : rubric.criteria.length;
  return { approaches: approaches.length, steps };
}

/** Phụ đề ngắn dưới tên (đã hiện name/version riêng). */
export function qsRubricCaption(rubric: Pick<Rubric, 'totalPoints' | 'approaches' | 'criteria'>): string {
  const { approaches, steps } = qsCounts(rubric);
  return `${formatVnPoints(rubric.totalPoints)} điểm (max một cách giải), ${approaches} cách giải, ${steps} bước`;
}

/** Tóm tắt một dòng cho cột preflight. */
export function qsRubricSummary(
  rubric: Pick<Rubric, 'name' | 'version' | 'totalPoints' | 'approaches' | 'criteria'>,
): string {
  return `${rubric.name} - phiên bản ${rubric.version}, ${qsRubricCaption(rubric)}`;
}

export function isQsRubric(rubric: { kind?: 'qa' | 'qs' } | undefined): boolean {
  return (rubric?.kind ?? 'qa') === 'qs';
}
