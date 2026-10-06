import { apiClient } from '@/lib/api-client';
import { throwIfFailed } from './http-error';

/**
 * Một lớp như CHÍNH giảng viên dạy nó thấy — phản chiếu TeachingClassView (apps/api/src/course/course.types.ts, plan D2).
 *
 * Lớp do ADMIN tạo và giao (spec §2.3): giảng viên chỉ đọc, nên file này không còn hàm tạo/sửa/xoá. Server vẫn giới hạn theo
 * `class.teacher_id`, nên lớp của người khác không bao giờ xuất hiện.
 *
 * `label` là nhãn gộp `DHKTPM18A – Nhóm 1`; `labelWithSemester` thêm ` · HK1 2026-2027` — dùng ở nơi lớp của NHIỀU kỳ có thể lẫn trong
 * một danh sách (ô chọn lớp gốc khi duyệt thi bù). Mọi nơi hiện tên lớp đọc hai trường này, không nối chuỗi mã + nhóm ở chỗ khác.
 *
 * `courseName` vẫn được API trả về nhưng hệ thống phục vụ đúng MỘT môn nên nó là một hằng số; không màn hình nào hiện nó.
 */
export interface TeachingClass {
  id: string;
  label: string;
  labelWithSemester: string;
  courseName: string;
  /** `null` chỉ với lớp cũ chưa backfill. */
  semesterId: string | null;
  academicYear: number | null;
  term: number | null;
  /** 0 nghĩa là chưa nhập danh sách sinh viên cho lớp này. */
  studentCount: number;
}

export interface TeachingClassFilters {
  semesterId?: string;
  academicYear?: number;
}

/** Bộ lọc chỉ HẸP tầm nhìn (CLAUDE.md §1.2): vắng mặt nghĩa là tất cả lớp của giảng viên. */
export async function listTeachingClasses(filters: TeachingClassFilters = {}): Promise<TeachingClass[]> {
  const query = Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== undefined));
  const { data, error, response } = await apiClient.GET('/classes/teaching', { params: { query } });
  await throwIfFailed(error, response);
  return data as unknown as TeachingClass[];
}
