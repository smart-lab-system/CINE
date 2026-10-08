'use client';

import { rulesHref } from '@/lib/rules-links';
import { useRubrics } from './useGrading';

/** Liên kết tới Bảng lỗi mở đúng rubric của một phiên (theo id rubric đã ghim); chưa biết thì về trang gốc. */
export function useRulesLink(rubricId: string | null | undefined): string {
  const rubrics = useRubrics();
  const name = rubricId ? rubrics.data?.find((r) => r.id === rubricId)?.name : undefined;
  return rulesHref(name);
}
