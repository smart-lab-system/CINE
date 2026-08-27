import { apiClient } from '@/lib/api-client';

// Mirrors CourseView (apps/api/src/course/course.types.ts).
export interface CourseView {
  id: string;
  code: string;
  name: string;
  semesterId: string;
  enrollmentCount: number;
}

export async function listCourses(): Promise<CourseView[]> {
  const { data, error, response } = await apiClient.GET('/courses');
  if (error || !response.ok) {
    throw error ?? new Error(`Yêu cầu thất bại (HTTP ${response.status})`);
  }
  return data as unknown as CourseView[];
}
