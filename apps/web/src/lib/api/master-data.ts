import { getAccessToken } from '@/lib/auth-token';

/**
 * Catalog master-data — path chưa nằm trong schema.d.ts cho tới khi regenerate
 * OpenAPI. Gọi fetch + Bearer giống exam-authoring (không qua openapi-fetch).
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export class MasterDataHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'MasterDataHttpError';
  }
}

async function masterDataFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token = await getAccessToken();
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (res.status === 204) return undefined as T;
  if (!res.ok) {
    throw new MasterDataHttpError(
      res.status === 409
        ? 'Xung đột dữ liệu (trùng mã hoặc còn bản ghi con).'
        : `Yêu cầu thất bại (HTTP ${res.status})`,
      res.status,
    );
  }
  if (res.status === 201 || res.headers.get('content-type')?.includes('json')) {
    return (await res.json()) as T;
  }
  return undefined as T;
}

function qs(params: Record<string, string | number | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export type AcademicYearStatus = 'planned' | 'active' | 'closed';
export type SemesterStatus = AcademicYearStatus;
export type CourseStatus = 'active' | 'inactive';
export type NominalClassStatus = CourseStatus;
export type StudentStatus = 'active' | 'inactive' | 'graduated' | 'withdrawn';
export type RoomStatus = 'active' | 'maintenance' | 'inactive';
export type ComputerStatus = RoomStatus;

export interface AcademicYear {
  id: string;
  code: string;
  name: string;
  startDate: string;
  endDate: string;
  status: AcademicYearStatus;
}

export interface Semester {
  id: string;
  academicYearId: string;
  code: string;
  name: string;
  startDate: string;
  endDate: string;
  status: SemesterStatus;
}

export interface Course {
  id: string;
  code: string;
  name: string;
  status: CourseStatus;
}

export interface NominalClass {
  id: string;
  code: string;
  name: string | null;
  cohortYear: number | null;
  status: NominalClassStatus;
}

export interface Student {
  id: string;
  mssv: string;
  fullName: string;
  nominalClassId: string;
  status: StudentStatus;
}

export interface Room {
  id: string;
  code: string;
  name: string;
  capacity: number;
  building: string | null;
  floor: string | null;
  status: RoomStatus;
}

export interface Computer {
  id: string;
  roomId: string;
  hostname: string;
  location: string;
  cpu: string;
  ramGb: number;
  storage: string;
  gpu: string | null;
  os: string;
  ipAddress: string | null;
  macAddress: string | null;
  status: ComputerStatus;
}

export interface PageResult<T> {
  items: T[];
  total: number;
}

export interface ListParams {
  page?: number;
  pageSize?: number;
  status?: string;
  search?: string;
  academicYearId?: string;
  nominalClassId?: string;
  roomId?: string;
  cohortYear?: number;
}

// --- academic years ---
export const listAcademicYears = (p: ListParams = {}) =>
  masterDataFetch<PageResult<AcademicYear>>(
    `/master-data/academic-years${qs({ page: p.page ?? 1, pageSize: p.pageSize ?? 20, status: p.status, search: p.search })}`,
  );
export const createAcademicYear = (body: Omit<AcademicYear, 'id'>) =>
  masterDataFetch<{ id: string }>('/master-data/academic-years', {
    method: 'POST',
    body: JSON.stringify(body),
  });
export const getAcademicYear = (id: string) =>
  masterDataFetch<AcademicYear>(`/master-data/academic-years/${id}`);
export const updateAcademicYear = (id: string, body: Partial<Omit<AcademicYear, 'id'>>) =>
  masterDataFetch<AcademicYear>(`/master-data/academic-years/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
export const deleteAcademicYear = (id: string) =>
  masterDataFetch<void>(`/master-data/academic-years/${id}`, { method: 'DELETE' });

// --- semesters ---
export const listSemesters = (p: ListParams = {}) =>
  masterDataFetch<PageResult<Semester>>(
    `/master-data/semesters${qs({ page: p.page ?? 1, pageSize: p.pageSize ?? 20, status: p.status, academicYearId: p.academicYearId, search: p.search })}`,
  );
export const createSemester = (body: Omit<Semester, 'id'>) =>
  masterDataFetch<{ id: string }>('/master-data/semesters', {
    method: 'POST',
    body: JSON.stringify(body),
  });
export const updateSemester = (id: string, body: Partial<Omit<Semester, 'id'>>) =>
  masterDataFetch<Semester>(`/master-data/semesters/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
export const deleteSemester = (id: string) =>
  masterDataFetch<void>(`/master-data/semesters/${id}`, { method: 'DELETE' });

// --- courses ---
export const listCourses = (p: ListParams = {}) =>
  masterDataFetch<PageResult<Course>>(
    `/master-data/courses${qs({ page: p.page ?? 1, pageSize: p.pageSize ?? 20, status: p.status, search: p.search })}`,
  );
export const createCourse = (body: Omit<Course, 'id'>) =>
  masterDataFetch<{ id: string }>('/master-data/courses', {
    method: 'POST',
    body: JSON.stringify(body),
  });
export const updateCourse = (id: string, body: Partial<Omit<Course, 'id'>>) =>
  masterDataFetch<Course>(`/master-data/courses/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
export const deleteCourse = (id: string) =>
  masterDataFetch<void>(`/master-data/courses/${id}`, { method: 'DELETE' });

// --- nominal classes ---
export const listNominalClasses = (p: ListParams = {}) =>
  masterDataFetch<PageResult<NominalClass>>(
    `/master-data/nominal-classes${qs({
      page: p.page ?? 1,
      pageSize: p.pageSize ?? 20,
      status: p.status,
      search: p.search,
      cohortYear: p.cohortYear,
    })}`,
  );
export const createNominalClass = (body: {
  code: string;
  name?: string | null;
  cohortYear?: number | null;
  status: NominalClassStatus;
}) =>
  masterDataFetch<{ id: string }>('/master-data/nominal-classes', {
    method: 'POST',
    body: JSON.stringify(body),
  });
export const updateNominalClass = (
  id: string,
  body: Partial<{
    code: string;
    name: string | null;
    cohortYear: number | null;
    status: NominalClassStatus;
  }>,
) =>
  masterDataFetch<NominalClass>(`/master-data/nominal-classes/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
export const deleteNominalClass = (id: string) =>
  masterDataFetch<void>(`/master-data/nominal-classes/${id}`, { method: 'DELETE' });

// --- students ---
export const listStudents = (p: ListParams = {}) =>
  masterDataFetch<PageResult<Student>>(
    `/master-data/students${qs({ page: p.page ?? 1, pageSize: p.pageSize ?? 20, status: p.status, search: p.search, nominalClassId: p.nominalClassId })}`,
  );
export const createStudent = (body: Omit<Student, 'id'>) =>
  masterDataFetch<{ id: string }>('/master-data/students', {
    method: 'POST',
    body: JSON.stringify(body),
  });
export const updateStudent = (id: string, body: Partial<Omit<Student, 'id'>>) =>
  masterDataFetch<Student>(`/master-data/students/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
export const deleteStudent = (id: string) =>
  masterDataFetch<void>(`/master-data/students/${id}`, { method: 'DELETE' });

// --- rooms ---
export const listRooms = (p: ListParams = {}) =>
  masterDataFetch<PageResult<Room>>(
    `/master-data/rooms${qs({ page: p.page ?? 1, pageSize: p.pageSize ?? 20, status: p.status, search: p.search })}`,
  );
export const createRoom = (body: {
  code: string;
  name: string;
  capacity: number;
  building?: string | null;
  floor?: string | null;
  status: RoomStatus;
}) =>
  masterDataFetch<{ id: string }>('/master-data/rooms', {
    method: 'POST',
    body: JSON.stringify(body),
  });
export const updateRoom = (
  id: string,
  body: Partial<{
    name: string;
    capacity: number;
    building: string | null;
    floor: string | null;
    status: RoomStatus;
  }>,
) =>
  masterDataFetch<Room>(`/master-data/rooms/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
export const deleteRoom = (id: string) =>
  masterDataFetch<void>(`/master-data/rooms/${id}`, { method: 'DELETE' });

// --- computers ---
export const listComputers = (p: ListParams = {}) =>
  masterDataFetch<PageResult<Computer>>(
    `/master-data/computers${qs({ page: p.page ?? 1, pageSize: p.pageSize ?? 20, status: p.status, search: p.search, roomId: p.roomId })}`,
  );
export const createComputer = (body: Omit<Computer, 'id'>) =>
  masterDataFetch<{ id: string }>('/master-data/computers', {
    method: 'POST',
    body: JSON.stringify(body),
  });
export const updateComputer = (id: string, body: Partial<Omit<Computer, 'id'>>) =>
  masterDataFetch<Computer>(`/master-data/computers/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
export const deleteComputer = (id: string) =>
  masterDataFetch<void>(`/master-data/computers/${id}`, { method: 'DELETE' });
