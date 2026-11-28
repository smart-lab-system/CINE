import type { CourseExamSummary, CourseExamType } from '@/lib/api/exam-bank';
import { formatShortSemesterLabel } from '@/lib/master-data-defaults';
import { foldText } from '@/lib/session-list';
import { resolveSemester } from '@/lib/resolve-semester';

export interface SemesterForExamFilter {
  id: string;
  name: string;
  academicYearId: string;
  startDate: string;
  endDate: string;
  status?: string;
}

export interface ExamBankListRow extends CourseExamSummary {
  /** Học kỳ suy từ createdAt (catalog). */
  termSemesterId: string | null;
  termAcademicYearId: string | null;
  termLabel: string;
}

export function resolveExamTerm(
  exam: Pick<CourseExamSummary, 'createdAt' | 'updatedAt'>,
  semesters: readonly SemesterForExamFilter[],
): Pick<ExamBankListRow, 'termSemesterId' | 'termAcademicYearId' | 'termLabel'> {
  if (semesters.length === 0) {
    return { termSemesterId: null, termAcademicYearId: null, termLabel: '-' };
  }
  const hit = resolveSemester(exam.createdAt, exam.updatedAt, semesters);
  if (!hit) {
    return { termSemesterId: null, termAcademicYearId: null, termLabel: '-' };
  }
  const sem = semesters.find((s) => s.id === hit.id);
  return {
    termSemesterId: hit.id,
    termAcademicYearId: sem?.academicYearId ?? null,
    termLabel: formatShortSemesterLabel(sem?.name),
  };
}

export function buildExamBankRows(
  exams: CourseExamSummary[],
  semesters: readonly SemesterForExamFilter[],
): ExamBankListRow[] {
  return exams
    .map((exam) => ({
      ...exam,
      ...resolveExamTerm(exam, semesters),
    }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function filterExamBankRows(
  rows: ExamBankListRow[],
  opts: {
    search: string;
    courseId: string | null;
    examType: CourseExamType | null;
    academicYearId: string | null;
    semesterId: string | null;
  },
): ExamBankListRow[] {
  const q = foldText(opts.search.trim());
  return rows.filter((row) => {
    if (opts.courseId && row.courseId !== opts.courseId) return false;
    if (opts.examType && row.examType !== opts.examType) return false;
    if (opts.semesterId) {
      if (row.termSemesterId !== opts.semesterId) return false;
    } else if (opts.academicYearId) {
      if (row.termAcademicYearId !== opts.academicYearId) return false;
    }
    if (!q) return true;
    return foldText(row.title).includes(q);
  });
}
