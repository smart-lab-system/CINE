import { apiClient } from '@/lib/api-client';

/**
 * A class as its own lecturer sees it — mirrors TeachingClassView
 * (apps/api/src/course/course.types.ts).
 *
 * The lecturer does not create classes; a Trưởng khoa assigns them. This is
 * the pick list the create-session form is built from, and the server scopes
 * it by `class.teacher_id`, so a class that is not theirs never appears.
 */
export interface TeachingClass {
  id: string;
  name: string;
  courseId: string;
  courseCode: string;
  courseName: string;
  /** 0 means no roster has been imported for this class yet. */
  studentCount: number;
}

/**
 * `semesterId` bỏ trống = tất cả học kỳ. Server AND nó vào owner-scope,
 * nên bộ lọc chỉ hẹp tầm nhìn, không bao giờ mở rộng ra lớp của người
 * khác (CLAUDE.md §7.2.3).
 */
export async function listTeachingClasses(): Promise<TeachingClass[]> {
  const { data, error, response } = await apiClient.GET('/classes/teaching');
  if (error || !response.ok) {
    throw error ?? new Error(`Yêu cầu thất bại (HTTP ${response.status})`);
  }
  return data as unknown as TeachingClass[];
}
