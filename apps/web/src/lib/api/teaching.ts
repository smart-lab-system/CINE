import { apiClient } from '@/lib/api-client';

/**
 * A class as its own lecturer sees it — mirrors TeachingClassView
 * (apps/api/src/course/course.types.ts).
 *
 * Giảng viên TỰ tạo lớp của mình từ đợt thu hẹp master data; trước đây
 * Trưởng khoa tạo và phân công. Server vẫn giới hạn theo
 * `class.teacher_id`, nên lớp của người khác không bao giờ xuất hiện.
 *
 * `courseId`/`courseCode` đã biến mất cùng bảng `course`: môn học chỉ còn
 * là một chuỗi giảng viên gõ vào.
 */
export interface TeachingClass {
  id: string;
  name: string;
  courseName: string;
  /** 0 means no roster has been imported for this class yet. */
  studentCount: number;
}

/** Chủ sở hữu luôn là người gọi, nên body không mang `teacherId`. */
export interface ClassInput {
  courseName: string;
  name: string;
}

export async function listTeachingClasses(): Promise<TeachingClass[]> {
  const { data, error, response } = await apiClient.GET('/classes/teaching');
  if (error || !response.ok) {
    throw error ?? new Error(`Yêu cầu thất bại (HTTP ${response.status})`);
  }
  return data as unknown as TeachingClass[];
}

/**
 * Lớp mới, luôn thuộc về người gọi.
 *
 * Không có `teacherId` trong body: server lấy chủ sở hữu từ token. Một
 * giảng viên gán lớp cho người khác được là đúng lỗ hổng mà
 * `ClassService.createForTeacher` tồn tại để chặn.
 */
export async function createClass(body: ClassInput): Promise<TeachingClass> {
  const { data, error, response } = await apiClient.POST('/classes', { body });
  if (error || !response.ok) {
    throw error ?? new Error(`Yêu cầu thất bại (HTTP ${response.status})`);
  }
  return data as unknown as TeachingClass;
}

export async function updateClass(
  id: string,
  body: Partial<ClassInput>,
): Promise<TeachingClass> {
  const { data, error, response } = await apiClient.PATCH('/classes/{id}', {
    params: { path: { id } },
    body,
  });
  if (error || !response.ok) {
    throw error ?? new Error(`Yêu cầu thất bại (HTTP ${response.status})`);
  }
  return data as unknown as TeachingClass;
}

/**
 * Xoá lớp. Lớp còn sinh viên thì server trả 409 —
 * `enrollment.home_class_id` là ON DELETE RESTRICT, và một roster mồ côi
 * trong im lặng còn tệ hơn một lỗi nói thẳng.
 */
export async function deleteClass(id: string): Promise<void> {
  const { error, response } = await apiClient.DELETE('/classes/{id}', {
    params: { path: { id } },
  });
  if (error || !response.ok) {
    throw error ?? new Error(`Yêu cầu thất bại (HTTP ${response.status})`);
  }
}
