import { apiClient } from '@/lib/api-client';

/**
 * The academic resources a Trưởng khoa maintains.
 *
 * Written by hand rather than taken from the generated OpenAPI types, the
 * same way lib/api/exam-session.ts does: the entities use custom string
 * unions with no `@ApiProperty({ enum })`, so the generator emits
 * `Record<string, never>` for them. The `as unknown as` casts below are that
 * gap, not a real shape mismatch.
 */

export interface Semester {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  /** Kỳ đang hiện hành, do Phòng Đào tạo gạt. Tối đa một kỳ trong toàn hệ thống. */
  isCurrent: boolean;
}

export interface Course {
  id: string;
  code: string;
  name: string;
  semesterId: string;
  departmentHeadId: string | null;
}

export interface Klass {
  id: string;
  courseId: string;
  name: string;
  teacherId: string;
}

export interface Room {
  id: string;
  name: string;
  capacity: number | null;
}

async function throwIfFailed(error: unknown, response: Response) {
  if (error || !response.ok) {
    // openapi-fetch only fills `error` from the response body, which some
    // failures leave empty — key off the status too.
    throw error ?? new Error(`Yêu cầu thất bại (HTTP ${response.status})`);
  }
}

/* ---------------------------------------------------------------- semesters */

/**
 * Gạt cờ kỳ hiện hành. PUT: nó đặt một trạng thái tuyệt đối ("kỳ này là kỳ
 * hiện hành"), không sửa lẻ một phần bản ghi. Chỉ Phòng Đào tạo gọi được.
 */
export async function setCurrentSemester(id: string): Promise<Semester> {
  const { data, error, response } = await apiClient.PUT('/semesters/{id}/current', {
    params: { path: { id } },
  });
  await throwIfFailed(error, response);
  return data as unknown as Semester;
}

export async function listSemesters(): Promise<Semester[]> {
  const { data, error, response } = await apiClient.GET('/semesters');
  await throwIfFailed(error, response);
  return data as unknown as Semester[];
}

/**
 * Những gì người dùng NHẬP cho một học kỳ.
 *
 * Không phải `Omit<Semester, 'id'>`: `isCurrent` không bao giờ là thứ nhập lúc
 * tạo hay sửa — nó chỉ đổi qua setCurrentSemester, và để nó lọt vào form là mở
 * đường cho hai kỳ cùng gạt cờ qua một request tạo.
 */
export type SemesterInput = Pick<Semester, 'name' | 'startDate' | 'endDate'>;

export async function createSemester(body: SemesterInput): Promise<Semester> {
  const { data, error, response } = await apiClient.POST('/semesters', { body });
  await throwIfFailed(error, response);
  return data as unknown as Semester;
}

export async function updateSemester(
  id: string,
  body: Partial<SemesterInput>,
): Promise<Semester> {
  const { data, error, response } = await apiClient.PATCH('/semesters/{id}', {
    params: { path: { id } },
    body,
  });
  await throwIfFailed(error, response);
  return data as unknown as Semester;
}

export async function deleteSemester(id: string): Promise<void> {
  const { error, response } = await apiClient.DELETE('/semesters/{id}', {
    params: { path: { id } },
  });
  await throwIfFailed(error, response);
}

/* -------------------------------------------------------------------- rooms */

export async function listRooms(): Promise<Room[]> {
  const { data, error, response } = await apiClient.GET('/rooms');
  await throwIfFailed(error, response);
  return data as unknown as Room[];
}

export async function createRoom(body: { name: string; capacity?: number }): Promise<Room> {
  const { data, error, response } = await apiClient.POST('/rooms', { body });
  await throwIfFailed(error, response);
  return data as unknown as Room;
}

export async function updateRoom(
  id: string,
  body: { name?: string; capacity?: number },
): Promise<Room> {
  const { data, error, response } = await apiClient.PATCH('/rooms/{id}', {
    params: { path: { id } },
    body,
  });
  await throwIfFailed(error, response);
  return data as unknown as Room;
}

export async function deleteRoom(id: string): Promise<void> {
  const { error, response } = await apiClient.DELETE('/rooms/{id}', {
    params: { path: { id } },
  });
  await throwIfFailed(error, response);
}

/* ------------------------------------------------------------------ courses */

/** Only the courses this head owns — the scope is server-side. */
export async function listMyCourses(semesterId?: string): Promise<Course[]> {
  const { data, error, response } = await apiClient.GET('/courses/mine', {
    params: { query: semesterId ? { semesterId } : {} },
  });
  await throwIfFailed(error, response);
  return data as unknown as Course[];
}

export async function createCourse(body: {
  code: string;
  name: string;
  semesterId: string;
}): Promise<Course> {
  // No departmentHeadId: ownership comes from the authenticated caller, and
  // sending it would be ignored anyway.
  const { data, error, response } = await apiClient.POST('/courses', { body });
  await throwIfFailed(error, response);
  return data as unknown as Course;
}

export async function updateCourse(
  id: string,
  body: Partial<{ code: string; name: string; semesterId: string }>,
): Promise<Course> {
  const { data, error, response } = await apiClient.PATCH('/courses/{id}', {
    params: { path: { id } },
    body,
  });
  await throwIfFailed(error, response);
  return data as unknown as Course;
}

export async function deleteCourse(id: string): Promise<void> {
  const { error, response } = await apiClient.DELETE('/courses/{id}', {
    params: { path: { id } },
  });
  await throwIfFailed(error, response);
}

/* ------------------------------------------------------------------ classes */

export async function listMyClasses(semesterId?: string): Promise<Klass[]> {
  const { data, error, response } = await apiClient.GET('/classes/mine', {
    params: { query: semesterId ? { semesterId } : {} },
  });
  await throwIfFailed(error, response);
  return data as unknown as Klass[];
}

export async function createClass(body: {
  courseId: string;
  name: string;
  teacherId: string;
}): Promise<Klass> {
  const { data, error, response } = await apiClient.POST('/classes', { body });
  await throwIfFailed(error, response);
  return data as unknown as Klass;
}

export async function updateClass(
  id: string,
  body: Partial<{ name: string; teacherId: string }>,
): Promise<Klass> {
  const { data, error, response } = await apiClient.PATCH('/classes/{id}', {
    params: { path: { id } },
    body,
  });
  await throwIfFailed(error, response);
  return data as unknown as Klass;
}

export async function deleteClass(id: string): Promise<void> {
  const { error, response } = await apiClient.DELETE('/classes/{id}', {
    params: { path: { id } },
  });
  await throwIfFailed(error, response);
}

/* ------------------------------------------------------- unowned (admin) --- */

export async function listUnownedCourses(): Promise<Course[]> {
  const { data, error, response } = await apiClient.GET('/courses/unowned');
  await throwIfFailed(error, response);
  return data as unknown as Course[];
}

export async function assignCourseOwner(
  id: string,
  departmentHeadId: string,
): Promise<Course> {
  const { data, error, response } = await apiClient.PATCH('/courses/{id}/owner', {
    params: { path: { id } },
    body: { departmentHeadId },
  });
  await throwIfFailed(error, response);
  return data as unknown as Course;
}

/* --------------------------------------------------- teacher pick list --- */

export interface TeacherOption {
  id: string;
  name: string;
}

/**
 * Id and name only — a Trưởng khoa names a lecturer, they do not audit
 * accounts. The full /accounts list stays admin-only.
 */
export async function listTeacherOptions(): Promise<TeacherOption[]> {
  const { data, error, response } = await apiClient.GET('/accounts/teachers');
  await throwIfFailed(error, response);
  return data as unknown as TeacherOption[];
}

/* --------------------------------------------------- department teachers -- */

/**
 * A teacher as this head sees them — mirrors DepartmentTeacherView
 * (apps/api/src/course/course.types.ts). Distinct from TeacherOption above:
 * that one is the global id+name picker used when assigning a class; this
 * is scoped to classes under a course this head owns, and carries enough
 * (email, class count) to actually be a "who's teaching for me" view, not
 * just a picker.
 */
export interface DepartmentTeacher {
  id: string;
  name: string;
  email: string;
  classCount: number;
}

export async function listDepartmentTeachers(): Promise<DepartmentTeacher[]> {
  const { data, error, response } = await apiClient.GET('/classes/teachers');
  await throwIfFailed(error, response);
  return data as unknown as DepartmentTeacher[];
}
