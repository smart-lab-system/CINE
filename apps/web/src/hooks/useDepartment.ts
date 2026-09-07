'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  assignCourseOwner,
  createClass,
  createCourse,
  createRoom,
  createSemester,
  deleteClass,
  deleteCourse,
  deleteRoom,
  deleteSemester,
  listDepartmentTeachers,
  listMyClasses,
  listMyCourses,
  listRooms,
  listSemesters,
  listTeacherOptions,
  listUnownedCourses,
  updateClass,
  updateCourse,
  updateRoom,
  setCurrentSemester,
  updateSemester,
} from '@/lib/api/department';
import {
  addRosterStudent,
  importRoster,
  listRoster,
  removeRosterStudent,
  type RosterEntry,
} from '@/lib/api/roster';

/**
 * TanStack wrappers for the academic resources. Pages call these, never the
 * `lib/api` functions directly (CLAUDE.md's frontend rule 1).
 *
 * Each resource gets one query key and one invalidation target, so a
 * create/edit/delete anywhere refreshes exactly the list it changed.
 */

export const DEPARTMENT_KEYS = {
  semesters: ['semesters'] as const,
  rooms: ['rooms'] as const,
  courses: ['courses', 'mine'] as const,
  classes: ['classes', 'mine'] as const,
  unowned: ['courses', 'unowned'] as const,
};

function useInvalidating<TArgs, TResult>(
  key: readonly unknown[],
  fn: (args: TArgs) => Promise<TResult>,
  alsoInvalidate: readonly (readonly unknown[])[] = [],
) {
  const queryClient = useQueryClient();
  return useMutation<TResult, Error, TArgs>({
    mutationFn: fn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: key });
      for (const extra of alsoInvalidate) {
        void queryClient.invalidateQueries({ queryKey: extra });
      }
    },
  });
}

/* ---------------------------------------------------------------- semesters */

export function useSemesters() {
  return useQuery({ queryKey: DEPARTMENT_KEYS.semesters, queryFn: listSemesters });
}

export function useCreateSemester() {
  return useInvalidating(DEPARTMENT_KEYS.semesters, createSemester);
}

export function useUpdateSemester() {
  return useInvalidating(
    DEPARTMENT_KEYS.semesters,
    (args: { id: string; body: Parameters<typeof updateSemester>[1] }) =>
      updateSemester(args.id, args.body),
  );
}

export function useDeleteSemester() {
  return useInvalidating(DEPARTMENT_KEYS.semesters, deleteSemester);
}

export function useSetCurrentSemester() {
  return useInvalidating(DEPARTMENT_KEYS.semesters, setCurrentSemester);
}

/* -------------------------------------------------------------------- rooms */

export function useRooms() {
  return useQuery({ queryKey: DEPARTMENT_KEYS.rooms, queryFn: listRooms });
}

export function useCreateRoom() {
  return useInvalidating(DEPARTMENT_KEYS.rooms, createRoom);
}

export function useUpdateRoom() {
  return useInvalidating(
    DEPARTMENT_KEYS.rooms,
    (args: { id: string; body: Parameters<typeof updateRoom>[1] }) =>
      updateRoom(args.id, args.body),
  );
}

export function useDeleteRoom() {
  return useInvalidating(DEPARTMENT_KEYS.rooms, deleteRoom);
}

/* ------------------------------------------------------------------ courses */

export function useMyCourses(semesterId?: string | null) {
  return useQuery({
    queryKey: [...DEPARTMENT_KEYS.courses, semesterId ?? null],
    queryFn: () => listMyCourses(semesterId ?? undefined),
  });
}

export function useCreateCourse() {
  return useInvalidating(DEPARTMENT_KEYS.courses, createCourse);
}

export function useUpdateCourse() {
  return useInvalidating(
    DEPARTMENT_KEYS.courses,
    (args: { id: string; body: Parameters<typeof updateCourse>[1] }) =>
      updateCourse(args.id, args.body),
  );
}

export function useDeleteCourse() {
  // Deleting a course also changes what classes exist under it.
  return useInvalidating(DEPARTMENT_KEYS.courses, deleteCourse, [DEPARTMENT_KEYS.classes]);
}

/* ------------------------------------------------------------------ classes */

export function useMyClasses(semesterId?: string | null) {
  return useQuery({
    queryKey: [...DEPARTMENT_KEYS.classes, semesterId ?? null],
    queryFn: () => listMyClasses(semesterId ?? undefined),
  });
}

export function useCreateClass() {
  return useInvalidating(DEPARTMENT_KEYS.classes, createClass);
}

export function useUpdateClass() {
  return useInvalidating(
    DEPARTMENT_KEYS.classes,
    (args: { id: string; body: Parameters<typeof updateClass>[1] }) =>
      updateClass(args.id, args.body),
  );
}

export function useDeleteClass() {
  return useInvalidating(DEPARTMENT_KEYS.classes, deleteClass);
}

/* ------------------------------------------------------------------ unowned */

export function useUnownedCourses() {
  return useQuery({ queryKey: DEPARTMENT_KEYS.unowned, queryFn: listUnownedCourses });
}

export function useAssignCourseOwner() {
  return useInvalidating(
    DEPARTMENT_KEYS.unowned,
    (args: { id: string; departmentHeadId: string }) =>
      assignCourseOwner(args.id, args.departmentHeadId),
  );
}

/* ------------------------------------------------------- teacher options -- */

export function useTeacherOptions() {
  return useQuery({ queryKey: ['accounts', 'teachers'], queryFn: listTeacherOptions });
}

/* ---------------------------------------------------- department teachers */

/** Who is currently teaching for this head — QA-reported gap (point 7). */
export function useDepartmentTeachers() {
  return useQuery({ queryKey: ['classes', 'teachers'], queryFn: listDepartmentTeachers });
}

/* ------------------------------------------------------------------- roster */

/**
 * The class list. Keyed by class id so two classes never share a cache
 * entry — the importer computes its diff against whatever this returns, and
 * a stale entry from another class would show the user a diff that deletes
 * everyone.
 */
export function useRoster(classId: string) {
  return useQuery({
    queryKey: ['roster', classId],
    queryFn: () => listRoster(classId),
  });
}

export function useImportRoster(classId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { students: RosterEntry[]; removeMissing: boolean }) =>
      importRoster(classId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['roster', classId] });
      // The lecturer's class picker shows a student count per class, and an
      // import is the only thing that changes it.
      void queryClient.invalidateQueries({ queryKey: ['classes'] });
    },
  });
}

export function useAddRosterStudent(classId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (student: RosterEntry) => addRosterStudent(classId, student),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['roster', classId] });
      void queryClient.invalidateQueries({ queryKey: ['classes'] });
    },
  });
}

export function useRemoveRosterStudent(classId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (studentMssv: string) => removeRosterStudent(classId, studentMssv),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['roster', classId] });
      void queryClient.invalidateQueries({ queryKey: ['classes'] });
    },
  });
}
