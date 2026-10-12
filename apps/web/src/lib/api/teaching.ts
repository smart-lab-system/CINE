import { apiClient } from '@/lib/api-client';

/**
 * Lớp giảng viên được admin phân công — mirrors TeachingClassView.
 */
export interface TeachingClass {
  id: string;
  name: string;
  courseName: string;
  /** 0 means no roster has been imported for this class yet. */
  studentCount: number;
}

export async function listTeachingClasses(): Promise<TeachingClass[]> {
  const { data, error, response } = await apiClient.GET('/classes/teaching');
  if (error || !response.ok) {
    throw error ?? new Error(`Yêu cầu thất bại (HTTP ${response.status})`);
  }
  return data as unknown as TeachingClass[];
}
