'use client';

import { useQuery } from '@tanstack/react-query';
import { listCourses } from '@/lib/api/courses';

export function useCourses() {
  return useQuery({
    queryKey: ['courses'],
    queryFn: listCourses,
    // Courses barely change within a session (unlike accounts/exam
    // sessions) — avoid a refetch on every window refocus while a teacher
    // is mid-way through filling out the create-session form.
    staleTime: 5 * 60 * 1000,
  });
}
