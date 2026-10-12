'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addSectionStudent,
  assignCourseSection,
  createCourseSection,
  deleteCourseSection,
  getCourseSection,
  importSectionRoster,
  listCourseSections,
  listSectionRoster,
  listTeacherOptions,
  removeSectionStudent,
  type RosterEntry,
} from '@/lib/api/admin-course-sections';

export function useCourseSections(params: {
  page: number;
  pageSize: number;
  academicYearId?: string;
  courseId?: string;
  semesterId?: string;
  unassigned?: boolean;
  q?: string;
}) {
  return useQuery({
    queryKey: ['admin', 'course-sections', params],
    queryFn: () => listCourseSections(params),
  });
}

export function useCourseSection(id: string | undefined) {
  return useQuery({
    queryKey: ['admin', 'course-sections', id],
    queryFn: () => getCourseSection(id!),
    enabled: !!id,
  });
}

export function useSectionRoster(id: string | undefined) {
  return useQuery({
    queryKey: ['admin', 'course-sections', id, 'roster'],
    queryFn: () => listSectionRoster(id!),
    enabled: !!id,
  });
}

export function useTeacherOptions() {
  return useQuery({
    queryKey: ['accounts', 'teachers'],
    queryFn: () => listTeacherOptions(),
  });
}

function useInvalidateSections() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['admin', 'course-sections'] });
    void qc.invalidateQueries({ queryKey: ['classes'] });
  };
}

export function useCreateCourseSection() {
  const invalidate = useInvalidateSections();
  return useMutation({
    mutationFn: createCourseSection,
    onSuccess: invalidate,
  });
}

export function useAssignCourseSection() {
  const invalidate = useInvalidateSections();
  return useMutation({
    mutationFn: (args: { id: string; teacherId: string }) =>
      assignCourseSection(args.id, args.teacherId),
    onSuccess: invalidate,
  });
}

export function useDeleteCourseSection() {
  const invalidate = useInvalidateSections();
  return useMutation({
    mutationFn: deleteCourseSection,
    onSuccess: invalidate,
  });
}

export function useImportSectionRoster(sectionId: string) {
  const invalidate = useInvalidateSections();
  return useMutation({
    mutationFn: (body: { students: RosterEntry[]; removeMissing: boolean }) =>
      importSectionRoster(sectionId, body),
    onSuccess: invalidate,
  });
}

export function useAddSectionStudent(sectionId: string) {
  const invalidate = useInvalidateSections();
  return useMutation({
    mutationFn: (body: RosterEntry | { studentId: string }) =>
      addSectionStudent(sectionId, body),
    onSuccess: invalidate,
  });
}

export function useRemoveSectionStudent(sectionId: string) {
  const invalidate = useInvalidateSections();
  return useMutation({
    mutationFn: (mssv: string) => removeSectionStudent(sectionId, mssv),
    onSuccess: invalidate,
  });
}
