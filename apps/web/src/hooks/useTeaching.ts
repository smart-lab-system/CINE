'use client';

import { useQuery } from '@tanstack/react-query';
import { listTeachingClasses } from '@/lib/api/teaching';

/**
 * The lecturer's own classes — the create-session form's source of truth.
 *
 * `semesterId` nằm trong khoá query, nên đổi kỳ là một ô cache khác chứ không
 * phải tải lại cùng một ô: quay lại kỳ vừa xem không phải chờ mạng.
 */
export function useTeachingClasses(semesterId?: string | null) {
  return useQuery({
    queryKey: ['classes', 'teaching', semesterId ?? null],
    queryFn: () => listTeachingClasses(semesterId ?? undefined),
  });
}
