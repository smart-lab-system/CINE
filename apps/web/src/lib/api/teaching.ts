import { apiClient } from '@/lib/api-client';

/**
 * A class as its own lecturer sees it — mirrors TeachingClassView
 * (apps/api/src/course/course.types.ts).
 *
 * Giảng viên TỰ tạo lớp của mình từ đợt thu hẹp master data; trước đây
 * Trưởng khoa tạo và phân công. Server vẫn giới hạn theo
 * `class.teacher_id`, nên lớp của người khác không bao giờ xuất hiện.
 *
 * `courseName` vẫn được API trả về, nhưng hệ thống phục vụ đúng MỘT môn
 * nên nó mang cùng một chuỗi ở mọi dòng. Không màn hình nào còn hiển thị nó
 * như một cột — làm thế chỉ là lặp lại một hằng số khắp giao diện. Trang
 * `/teacher/rubrics` là chỗ đọc cuối cùng, và nó chờ spec agent điều tra.
 */
export interface TeachingClass {
  id: string;
  name: string;
  courseName: string;
  /** 0 means no roster has been imported for this class yet. */
  studentCount: number;
}

/**
 * Body tạo/sửa lớp.
 *
 * Không mang `teacherId` (server lấy từ token) và không mang `courseName`
 * (một môn duy nhất, server điền hằng số). Cả hai đều bị
 * `ValidationPipe({ whitelist: true })` cắt nếu client cũ còn gửi kèm.
 */
export interface ClassInput {
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
