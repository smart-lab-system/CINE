import { describe, expect, it } from 'vitest';
import type { CourseExamSummary } from '@/lib/api/exam-bank';
import {
  buildExamBankRows,
  filterExamBankRows,
  resolveExamTerm,
  type SemesterForExamFilter,
} from './filter-exam-bank';

function exam(
  partial: Partial<CourseExamSummary> & Pick<CourseExamSummary, 'id' | 'title'>,
): CourseExamSummary {
  return {
    courseId: 'course-1',
    courseCode: 'CTDL',
    courseName: 'Cấu trúc dữ liệu',
    examType: 'GK',
    status: 'draft',
    language: 'cpp',
    questionCount: 1,
    totalPoints: 10,
    allocatedPoints: 10,
    createdAt: '2025-10-15T08:00:00.000Z',
    updatedAt: '2025-10-16T08:00:00.000Z',
    ...partial,
  };
}

const semesters: SemesterForExamFilter[] = [
  {
    id: 'sem-hk1',
    name: 'HK1 2025-2026',
    academicYearId: 'year-2526',
    startDate: '2025-09-01',
    endDate: '2026-01-15',
    status: 'active',
  },
  {
    id: 'sem-hk2',
    name: 'HK2 2025-2026',
    academicYearId: 'year-2526',
    startDate: '2026-01-16',
    endDate: '2026-06-30',
    status: 'planned',
  },
  {
    id: 'sem-hk1-prev',
    name: 'HK1 2024-2025',
    academicYearId: 'year-2425',
    startDate: '2024-09-01',
    endDate: '2025-01-15',
    status: 'closed',
  },
];

describe('resolveExamTerm', () => {
  it('suy học kỳ từ createdAt', () => {
    expect(
      resolveExamTerm(
        {
          createdAt: '2025-10-15T08:00:00.000Z',
          updatedAt: '2025-10-16T08:00:00.000Z',
        },
        semesters,
      ),
    ).toEqual({
      termSemesterId: 'sem-hk1',
      termAcademicYearId: 'year-2526',
      termLabel: 'HK1 (2025-2026)',
    });
  });

  it('trả - khi không có catalog', () => {
    expect(
      resolveExamTerm(
        {
          createdAt: '2025-10-15T08:00:00.000Z',
          updatedAt: '2025-10-16T08:00:00.000Z',
        },
        [],
      ),
    ).toEqual({
      termSemesterId: null,
      termAcademicYearId: null,
      termLabel: '-',
    });
  });
});

describe('buildExamBankRows', () => {
  it('sắp xếp mới cập nhật trước', () => {
    const rows = buildExamBankRows(
      [
        exam({ id: 'a', title: 'A', updatedAt: '2025-10-10T00:00:00.000Z' }),
        exam({ id: 'b', title: 'B', updatedAt: '2025-10-20T00:00:00.000Z' }),
      ],
      semesters,
    );
    expect(rows.map((r) => r.id)).toEqual(['b', 'a']);
  });
});

describe('filterExamBankRows', () => {
  const rows = buildExamBankRows(
    [
      exam({
        id: '1',
        title: 'Đề thi giữa kỳ - Cấu trúc dữ liệu',
        courseId: 'course-ctdl',
        examType: 'GK',
        createdAt: '2025-10-15T08:00:00.000Z',
        updatedAt: '2025-10-15T08:00:00.000Z',
      }),
      exam({
        id: '2',
        title: 'Đề thi cuối kỳ - Lập trình nâng cao',
        courseId: 'course-ltnc',
        courseCode: 'LTNC',
        courseName: 'Lập trình nâng cao',
        examType: 'CK',
        createdAt: '2026-03-01T08:00:00.000Z',
        updatedAt: '2026-03-01T08:00:00.000Z',
      }),
      exam({
        id: '3',
        title: 'Đề thi thường kỳ - Cấu trúc dữ liệu',
        courseId: 'course-ctdl',
        examType: 'TK',
        createdAt: '2024-10-01T08:00:00.000Z',
        updatedAt: '2024-10-01T08:00:00.000Z',
      }),
    ],
    semesters,
  );

  it('tìm tiêu đề không dấu', () => {
    const hit = filterExamBankRows(rows, {
      search: 'giua ky',
      courseId: null,
      examType: null,
      academicYearId: null,
      semesterId: null,
    });
    expect(hit.map((r) => r.id)).toEqual(['1']);
  });

  it('lọc môn + loại', () => {
    const hit = filterExamBankRows(rows, {
      search: '',
      courseId: 'course-ctdl',
      examType: 'TK',
      academicYearId: null,
      semesterId: null,
    });
    expect(hit.map((r) => r.id)).toEqual(['3']);
  });

  it('lọc năm học', () => {
    const hit = filterExamBankRows(rows, {
      search: '',
      courseId: null,
      examType: null,
      academicYearId: 'year-2526',
      semesterId: null,
    });
    expect(hit.map((r) => r.id).sort()).toEqual(['1', '2']);
  });

  it('lọc học kỳ', () => {
    const hit = filterExamBankRows(rows, {
      search: '',
      courseId: null,
      examType: null,
      academicYearId: 'year-2526',
      semesterId: 'sem-hk2',
    });
    expect(hit.map((r) => r.id)).toEqual(['2']);
  });
});
