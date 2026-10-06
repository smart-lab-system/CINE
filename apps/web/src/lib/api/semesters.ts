import { apiClient } from '@/lib/api-client';
import { throwIfFailed } from './http-error';

// Phản chiếu SemesterView (apps/api/src/course/course.types.ts, plan C). `classCount` chỉ có với admin: giảng viên đọc danh
// sách này để lọc nhưng số lớp là thông tin tổng hợp của người khác.
export interface Semester {
  id: string;
  academicYearStart: number;
  term: number;
  /** `HK1 2026-2027` — server dựng từ (năm học, kỳ); không có cột tên riêng. */
  label: string;
  /** `yyyy-mm-dd`. */
  startDate: string;
  endDate: string;
  classCount?: number;
}

export interface SemesterInput {
  academicYearStart: number;
  term: number;
  startDate: string;
  endDate: string;
}

// `body as never`: chỗ DUY NHẤT kiểu của hàm này gặp kiểu sinh ra. Khoá trường khớp DTO được ghim bằng e2e của server, không bằng
// kiểu — nếu để kiểu sinh ra tự kiểm, một khác biệt vô hại (`null` vs `undefined`) làm đỏ cả trang.
export async function listSemesters(): Promise<Semester[]> {
  const { data, error, response } = await apiClient.GET('/semesters');
  await throwIfFailed(error, response);
  return data as unknown as Semester[];
}

export async function createSemester(body: SemesterInput): Promise<Semester> {
  const { data, error, response } = await apiClient.POST('/semesters', { body: body as never });
  await throwIfFailed(error, response);
  return data as unknown as Semester;
}

export async function updateSemester(id: string, body: Partial<SemesterInput>): Promise<Semester> {
  const { data, error, response } = await apiClient.PATCH('/semesters/{id}', {
    params: { path: { id } },
    body: body as never,
  });
  await throwIfFailed(error, response);
  return data as unknown as Semester;
}

/** Học kỳ còn lớp thì server từ chối (409) kèm số lớp — câu đó tới thẳng người dùng. */
export async function deleteSemester(id: string): Promise<void> {
  const { error, response } = await apiClient.DELETE('/semesters/{id}', { params: { path: { id } } });
  await throwIfFailed(error, response);
}
