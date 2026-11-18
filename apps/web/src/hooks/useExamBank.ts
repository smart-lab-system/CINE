'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createCourseExam,
  deleteCourseExam,
  getCourseExam,
  listCourseExams,
  listTeachingCoursesForBank,
  updateCourseExam,
  type CourseExamLanguage,
  type CourseExamStatus,
  type CourseExamType,
} from '@/lib/api/exam-bank';

export function useExamBankCourses() {
  return useQuery({
    queryKey: ['exam-bank', 'courses'],
    queryFn: listTeachingCoursesForBank,
  });
}

export function useCourseExams(courseId: string | null) {
  return useQuery({
    queryKey: ['exam-bank', 'list', courseId],
    queryFn: () => listCourseExams(courseId!),
    enabled: Boolean(courseId),
  });
}

export function useCourseExam(examId: string | null) {
  return useQuery({
    queryKey: ['exam-bank', 'detail', examId],
    queryFn: () => getCourseExam(examId!),
    enabled: Boolean(examId),
  });
}

export function useExamBankMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['exam-bank'] });
  };

  const create = useMutation({
    mutationFn: createCourseExam,
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      examType?: CourseExamType;
      language?: CourseExamLanguage;
      totalPoints?: number;
      description?: string;
      status?: CourseExamStatus;
      questions?: { title?: string; statement: string; points: number }[];
    }) => updateCourseExam(id, body),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: deleteCourseExam,
    onSuccess: invalidate,
  });

  return { create, update, remove };
}
