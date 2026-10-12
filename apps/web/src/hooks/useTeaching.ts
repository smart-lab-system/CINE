'use client';

import { useQuery } from '@tanstack/react-query';
import { listTeachingClasses } from '@/lib/api/teaching';

/**
 * Lớp mà giảng viên này được phân công dạy.
 */
export function useTeachingClasses() {
  return useQuery({
    queryKey: ['classes', 'teaching'],
    queryFn: () => listTeachingClasses(),
  });
}
