'use client';

import { useQuery } from '@tanstack/react-query';
import {
  listSessionOverview,
  listTeacherSubmissions,
  type SearchSubmissionsParams,
} from '@/lib/api/submissions';

/** Mọi phiên của GV này kèm số liệu roll-up. Không phân trang — spec §1.2. */
export function useSessionOverview() {
  return useQuery({
    queryKey: ['submissions', 'overview'],
    queryFn: listSessionOverview,
  });
}

/**
 * Chỉ chạy khi có từ khoá — luồng search (§4.5). `enabled` để trang không
 * gọi endpoint này lúc ô search còn rỗng.
 */
export function useTeacherSubmissions(params: SearchSubmissionsParams, enabled: boolean) {
  return useQuery({
    queryKey: ['submissions', 'search', params],
    queryFn: () => listTeacherSubmissions(params),
    enabled,
  });
}
