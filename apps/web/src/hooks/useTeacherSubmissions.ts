'use client';

import { useQuery } from '@tanstack/react-query';
import { listTeacherSubmissions, type SearchSubmissionsParams } from '@/lib/api/submissions';

/** Powers "Quản lý bài thu" — every submission across every session this
 *  teacher owns, filterable. See lib/api/submissions.ts for why this is a
 *  separate module from the single-session useSubmissions in
 *  useExamSession.ts. */
export function useTeacherSubmissions(params: SearchSubmissionsParams) {
  return useQuery({
    queryKey: ['submissions', 'mine', params],
    queryFn: () => listTeacherSubmissions(params),
  });
}
