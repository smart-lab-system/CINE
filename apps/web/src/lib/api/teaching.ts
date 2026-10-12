import { apiClient } from '@/lib/api-client';

/**
 * Lớp giảng viên được admin phân công — mirrors TeachingClassView.
 */
export interface TeachingClass {
  id: string;
  /** Mã lớp = `{course.code}{001|002|…}` trong học kỳ. */
  name: string;
  courseName: string;
  /** null với lớp legacy chưa gắn catalog kỳ. */
  semesterId: string | null;
  /** null với lớp legacy chưa gắn catalog kỳ. */
  semesterName: string | null;
  /** null khi chưa gắn lớp danh nghĩa. */
  nominalClassId: string | null;
  /** Nhãn: `code` hoặc `code — name`. */
  nominalClassName: string | null;
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
