'use client';

import { useQuery } from '@tanstack/react-query';
import { listTeachingClasses } from '@/lib/api/teaching';

/** The lecturer's own classes — the create-session form's source of truth. */
export function useTeachingClasses() {
  return useQuery({ queryKey: ['classes', 'teaching'], queryFn: listTeachingClasses });
}
