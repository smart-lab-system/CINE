import { apiClient } from '@/lib/api-client';
import { throwIfFailed } from './http-error';

// Phản chiếu ClassAdminView (apps/api/src/course/course.types.ts, plan D2): lớp như ADMIN thấy. Giảng viên đọc lớp của mình qua
// `lib/api/teaching.ts`, một hình dạng khác (không có sĩ số/phiên của người khác).
export interface AdminClass {
  id: string;
  /** Nhãn gộp `DHKTPM18A – Nhóm 1`. */
  label: string;
  /** Nhãn gộp kèm học kỳ: `DHKTPM18A – Nhóm 1 · HK1 2026-2027`. */
  labelWithSemester: string;
  /** `null` chỉ với lớp cũ chưa backfill. */
  semesterId: string | null;
  academicYear: number | null;
  term: number | null;
  administrativeClassId: string | null;
  administrativeClassCode: string | null;
  groupName: string;
  teacherId: string;
  teacherName: string;
  studentCount: number;
  sessionCount: number;
}

export interface AdminClassFilters {
  semesterId?: string;
  academicYear?: number;
  teacherId?: string;
  /** Tìm theo mã lớp danh nghĩa. */
  q?: string;
}

/**
 * Lớp: CHỌN, không gõ. `administrativeClassId` đến từ ô chọn trong Danh mục lớp danh nghĩa (server vẫn nhận `administrativeClassCode`
 * cho script/import, form không dùng). `courseName` không có: một môn duy nhất, server điền hằng số.
 */
export interface AdminClassInput {
  semesterId: string;
  administrativeClassId: string;
  groupName?: string;
  teacherId: string;
}

export async function listAdminClasses(filters: AdminClassFilters = {}): Promise<AdminClass[]> {
  const query = Object.fromEntries(
    Object.entries(filters).filter(([, value]) => value !== undefined && value !== ''),
  );
  const { data, error, response } = await apiClient.GET('/classes', { params: { query } });
  await throwIfFailed(error, response);
  return data as unknown as AdminClass[];
}

export async function createAdminClass(body: AdminClassInput): Promise<AdminClass> {
  const { data, error, response } = await apiClient.POST('/classes', { body: body as never });
  await throwIfFailed(error, response);
  return data as unknown as AdminClass;
}

/** Đổi giảng viên đi theo cùng một đường với nhập tay (server đổi `enrollment.home_teacher_id`, phiên đã có giữ giảng viên cũ). */
export async function updateAdminClass(id: string, body: Partial<AdminClassInput>): Promise<AdminClass> {
  const { data, error, response } = await apiClient.PATCH('/classes/{id}', {
    params: { path: { id } },
    body: body as never,
  });
  await throwIfFailed(error, response);
  return data as unknown as AdminClass;
}

/** Lớp còn sinh viên hoặc phiên thi thì server từ chối và nêu số lượng. */
export async function deleteAdminClass(id: string): Promise<void> {
  const { error, response } = await apiClient.DELETE('/classes/{id}', { params: { path: { id } } });
  await throwIfFailed(error, response);
}
