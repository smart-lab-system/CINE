import { getAccessToken } from '@/lib/auth-token';

/**
 * Admin lớp học phần — path chưa chắc trong schema.d.ts; fetch + Bearer
 * giống master-data.ts.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export class CourseSectionHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'CourseSectionHttpError';
  }
}

async function csFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getAccessToken();
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (res.status === 204) return undefined as T;
  if (!res.ok) {
    let message =
      res.status === 409
        ? 'Xung đột dữ liệu (trùng mã lớp hoặc còn roster/phiên).'
        : `Yêu cầu thất bại (HTTP ${res.status})`;
    try {
      const body = (await res.json()) as { message?: string | string[] };
      const fromServer = Array.isArray(body.message)
        ? body.message.join('; ')
        : body.message;
      if (fromServer) message = fromServer;
    } catch {
      /* keep fallback */
    }
    throw new CourseSectionHttpError(message, res.status);
  }
  if (res.headers.get('content-type')?.includes('json')) {
    return (await res.json()) as T;
  }
  return undefined as T;
}

function qs(params: Record<string, string | number | boolean | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export interface CourseSection {
  id: string;
  /** Mã lớp = course.code + 001/002/… */
  name: string;
  courseId: string | null;
  courseName: string;
  semesterId: string | null;
  semesterName: string | null;
  nominalClassId: string | null;
  /** Nhãn: `code` hoặc `code — name`. */
  nominalClassName: string | null;
  teacherId: string | null;
  teacherName: string | null;
  studentCount: number;
  /** Số phiên thi gắn lớp — khóa sửa meta khi > 0. */
  examSessionCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface RosterEntry {
  mssv: string;
  name: string;
}

export interface TeacherOption {
  id: string;
  name: string;
}

export async function listCourseSections(params: {
  page?: number;
  pageSize?: number;
  academicYearId?: string;
  semesterId?: string;
  courseId?: string;
  teacherId?: string;
  unassigned?: boolean;
  q?: string;
}): Promise<{ items: CourseSection[]; total: number }> {
  return csFetch(`/admin/course-sections${qs(params)}`);
}

export async function getCourseSection(id: string): Promise<CourseSection> {
  return csFetch(`/admin/course-sections/${id}`);
}

export async function createCourseSection(body: {
  courseId: string;
  semesterId: string;
  teacherId?: string;
  nominalClassId?: string;
}): Promise<CourseSection> {
  return csFetch('/admin/course-sections', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function assignCourseSection(
  id: string,
  teacherId: string,
): Promise<CourseSection> {
  return csFetch(`/admin/course-sections/${id}/assign`, {
    method: 'POST',
    body: JSON.stringify({ teacherId }),
  });
}

export async function unassignCourseSection(id: string): Promise<CourseSection> {
  return csFetch(`/admin/course-sections/${id}/unassign`, { method: 'POST' });
}

export async function updateCourseSection(
  id: string,
  body: {
    courseId?: string;
    semesterId?: string;
    nominalClassId?: string | null;
  },
): Promise<CourseSection> {
  return csFetch(`/admin/course-sections/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export async function deleteCourseSection(id: string): Promise<void> {
  await csFetch(`/admin/course-sections/${id}`, { method: 'DELETE' });
}

export interface RosterImportResult {
  added: number;
  updated: number;
  unchanged: number;
  removed: number;
  missing: RosterEntry[];
}

export async function listSectionRoster(id: string): Promise<RosterEntry[]> {
  return csFetch(`/admin/course-sections/${id}/roster`);
}

export async function importSectionRoster(
  id: string,
  body: { students: RosterEntry[]; removeMissing: boolean },
): Promise<RosterImportResult> {
  return csFetch(`/admin/course-sections/${id}/roster`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function addSectionStudent(
  id: string,
  body: { studentId: string } | { mssv: string; name: string },
): Promise<RosterEntry> {
  return csFetch(`/admin/course-sections/${id}/roster/students`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function removeSectionStudent(id: string, mssv: string): Promise<void> {
  await csFetch(
    `/admin/course-sections/${id}/roster/students/${encodeURIComponent(mssv)}`,
    { method: 'DELETE' },
  );
}

export async function updateSectionStudentName(
  id: string,
  mssv: string,
  name: string,
): Promise<RosterEntry> {
  return csFetch(
    `/admin/course-sections/${id}/roster/students/${encodeURIComponent(mssv)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    },
  );
}

export async function listTeacherOptions(): Promise<TeacherOption[]> {
  return csFetch('/accounts/teachers');
}
