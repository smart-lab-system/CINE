'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from '@/lib/api/master-data';
import type { ListParams } from '@/lib/api/master-data';

const K = {
  years: 'md-academic-years',
  semesters: 'md-semesters',
  courses: 'md-courses',
  classes: 'md-nominal-classes',
  students: 'md-students',
  rooms: 'md-rooms',
  computers: 'md-computers',
} as const;

export function useAcademicYears(params: ListParams = {}) {
  return useQuery({
    queryKey: [K.years, params],
    queryFn: () => api.listAcademicYears(params),
  });
}

export function useAcademicYear(id: string | undefined) {
  return useQuery({
    queryKey: [K.years, 'one', id],
    queryFn: () => api.getAcademicYear(id!),
    enabled: Boolean(id),
  });
}

export function useSemesters(params: ListParams = {}) {
  return useQuery({
    queryKey: [K.semesters, params],
    queryFn: () => api.listSemesters(params),
  });
}

export function useCourses(params: ListParams = {}) {
  return useQuery({
    queryKey: [K.courses, params],
    queryFn: () => api.listCourses(params),
  });
}

export function useCourse(id: string | undefined) {
  return useQuery({
    queryKey: [K.courses, 'one', id],
    queryFn: () => api.getCourse(id!),
    enabled: Boolean(id),
  });
}

export function useCourseHubExams(
  courseId: string | undefined,
  params: { academicYearId?: string; semesterId?: string } = {},
) {
  return useQuery({
    queryKey: [K.courses, 'hub-exams', courseId, params],
    queryFn: () => api.listCourseHubExams(courseId!, params),
    enabled: Boolean(courseId),
  });
}

export function useCourseHubExam(
  courseId: string | undefined,
  examId: string | undefined,
) {
  return useQuery({
    queryKey: [K.courses, 'hub-exam', courseId, examId],
    queryFn: () => api.getCourseHubExam(courseId!, examId!),
    enabled: Boolean(courseId && examId),
  });
}

export function useCourseHubRubrics(
  courseId: string | undefined,
  params: { academicYearId?: string; semesterId?: string } = {},
) {
  return useQuery({
    queryKey: [K.courses, 'hub-rubrics', courseId, params],
    queryFn: () => api.listCourseHubRubrics(courseId!, params),
    enabled: Boolean(courseId),
  });
}

export function useCourseHubRubric(
  courseId: string | undefined,
  rubricId: string | undefined,
) {
  return useQuery({
    queryKey: [K.courses, 'hub-rubric', courseId, rubricId],
    queryFn: () => api.getCourseHubRubric(courseId!, rubricId!),
    enabled: Boolean(courseId && rubricId),
  });
}

function useInvalidateCourseHub(courseId: string) {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: [K.courses, 'hub-exams', courseId] });
    void qc.invalidateQueries({ queryKey: [K.courses, 'hub-rubrics', courseId] });
    void qc.invalidateQueries({ queryKey: [K.courses, 'hub-exam', courseId] });
    void qc.invalidateQueries({ queryKey: [K.courses, 'hub-rubric', courseId] });
  };
}

export function useCourseHubExamMutations(courseId: string) {
  const inv = useInvalidateCourseHub(courseId);
  return {
    deactivate: useMutation({
      mutationFn: (examId: string) => api.deactivateCourseHubExam(courseId, examId),
      onSuccess: inv,
    }),
    reactivate: useMutation({
      mutationFn: (examId: string) => api.reactivateCourseHubExam(courseId, examId),
      onSuccess: inv,
    }),
    remove: useMutation({
      mutationFn: (examId: string) => api.deleteCourseHubExam(courseId, examId),
      onSuccess: inv,
    }),
  };
}

export function useCourseHubRubricMutations(courseId: string) {
  const inv = useInvalidateCourseHub(courseId);
  return {
    deactivate: useMutation({
      mutationFn: (rubricId: string) =>
        api.deactivateCourseHubRubric(courseId, rubricId),
      onSuccess: inv,
    }),
    reactivate: useMutation({
      mutationFn: (rubricId: string) =>
        api.reactivateCourseHubRubric(courseId, rubricId),
      onSuccess: inv,
    }),
    remove: useMutation({
      mutationFn: (rubricId: string) => api.deleteCourseHubRubric(courseId, rubricId),
      onSuccess: inv,
    }),
  };
}

export function useNominalClasses(params: ListParams = {}) {
  return useQuery({
    queryKey: [K.classes, params],
    queryFn: () => api.listNominalClasses(params),
  });
}

export function useStudents(params: ListParams = {}) {
  return useQuery({
    queryKey: [K.students, params],
    queryFn: () => api.listStudents(params),
  });
}

export function useStudent(id: string | undefined) {
  return useQuery({
    queryKey: [K.students, 'one', id],
    queryFn: () => api.getStudent(id!),
    enabled: Boolean(id),
  });
}

export function useRooms(params: ListParams = {}) {
  return useQuery({
    queryKey: [K.rooms, params],
    queryFn: () => api.listRooms(params),
  });
}

export function useComputers(params: ListParams = {}) {
  return useQuery({
    queryKey: [K.computers, params],
    queryFn: () => api.listComputers(params),
  });
}

function useInvalidate(...keys: string[]) {
  const qc = useQueryClient();
  return () => keys.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
}

export function useAcademicYearMutations() {
  const inv = useInvalidate(K.years, K.semesters);
  return {
    create: useMutation({ mutationFn: api.createAcademicYear, onSuccess: inv }),
    update: useMutation({
      mutationFn: ({ id, body }: { id: string; body: Parameters<typeof api.updateAcademicYear>[1] }) =>
        api.updateAcademicYear(id, body),
      onSuccess: inv,
    }),
    remove: useMutation({ mutationFn: api.deleteAcademicYear, onSuccess: inv }),
  };
}

export function useSemesterMutations() {
  const inv = useInvalidate(K.semesters);
  return {
    create: useMutation({ mutationFn: api.createSemester, onSuccess: inv }),
    update: useMutation({
      mutationFn: ({ id, body }: { id: string; body: Parameters<typeof api.updateSemester>[1] }) =>
        api.updateSemester(id, body),
      onSuccess: inv,
    }),
    remove: useMutation({ mutationFn: api.deleteSemester, onSuccess: inv }),
  };
}

export function useCourseMutations() {
  const inv = useInvalidate(K.courses);
  return {
    create: useMutation({ mutationFn: api.createCourse, onSuccess: inv }),
    update: useMutation({
      mutationFn: ({ id, body }: { id: string; body: Parameters<typeof api.updateCourse>[1] }) =>
        api.updateCourse(id, body),
      onSuccess: inv,
    }),
    remove: useMutation({ mutationFn: api.deleteCourse, onSuccess: inv }),
  };
}

export function useNominalClassMutations() {
  const inv = useInvalidate(K.classes, K.students);
  return {
    create: useMutation({ mutationFn: api.createNominalClass, onSuccess: inv }),
    update: useMutation({
      mutationFn: ({ id, body }: { id: string; body: Parameters<typeof api.updateNominalClass>[1] }) =>
        api.updateNominalClass(id, body),
      onSuccess: inv,
    }),
    remove: useMutation({ mutationFn: api.deleteNominalClass, onSuccess: inv }),
  };
}

export function useStudentMutations() {
  const inv = useInvalidate(K.students);
  return {
    create: useMutation({ mutationFn: api.createStudent, onSuccess: inv }),
    update: useMutation({
      mutationFn: ({ id, body }: { id: string; body: Parameters<typeof api.updateStudent>[1] }) =>
        api.updateStudent(id, body),
      onSuccess: inv,
    }),
    remove: useMutation({ mutationFn: api.deleteStudent, onSuccess: inv }),
  };
}

export function useRoomMutations() {
  const inv = useInvalidate(K.rooms, K.computers);
  return {
    create: useMutation({ mutationFn: api.createRoom, onSuccess: inv }),
    update: useMutation({
      mutationFn: ({ id, body }: { id: string; body: Parameters<typeof api.updateRoom>[1] }) =>
        api.updateRoom(id, body),
      onSuccess: inv,
    }),
    remove: useMutation({ mutationFn: api.deleteRoom, onSuccess: inv }),
  };
}

export function useComputerMutations() {
  const inv = useInvalidate(K.computers);
  return {
    create: useMutation({ mutationFn: api.createComputer, onSuccess: inv }),
    update: useMutation({
      mutationFn: ({ id, body }: { id: string; body: Parameters<typeof api.updateComputer>[1] }) =>
        api.updateComputer(id, body),
      onSuccess: inv,
    }),
    remove: useMutation({ mutationFn: api.deleteComputer, onSuccess: inv }),
  };
}
