import { describe, expect, it } from 'vitest';
import type { Rubric } from '@/lib/api/grading';
import type { TeachingClass } from '@/lib/api/teaching';
import {
  activeQsRubrics,
  buildQsRubricRows,
  courseIdsForTerm,
  filterQsRubricRows,
  formatCreatedTermLabel,
  type QsRubricListRow,
} from './filter-qs-rubrics';

function rubric(partial: Partial<Rubric> & Pick<Rubric, 'id' | 'name'>): Rubric {
  return {
    teacherId: 't1',
    version: 1,
    isActive: true,
    kind: 'qs',
    totalPoints: 5,
    criteria: [],
    approaches: [{ key: 'a', name: 'A', maxPoints: 5, steps: [] }],
    ...partial,
  };
}

function klass(
  partial: Partial<TeachingClass> & Pick<TeachingClass, 'id' | 'name' | 'courseName'>,
): TeachingClass {
  return {
    courseId: null,
    semesterId: null,
    semesterName: null,
    nominalClassId: null,
    nominalClassName: null,
    studentCount: 0,
    ...partial,
  };
}

describe('activeQsRubrics', () => {
  it('chỉ QS đang active', () => {
    const rows = [
      rubric({ id: '1', name: 'A', kind: 'qs', isActive: true }),
      rubric({ id: '2', name: 'B', kind: 'qa', isActive: true }),
      rubric({ id: '3', name: 'C', kind: 'qs', isActive: false }),
    ];
    expect(activeQsRubrics(rows).map((r) => r.id)).toEqual(['1']);
  });
});

describe('courseIdsForTerm', () => {
  const classes = [
    klass({
      id: 'c1',
      name: 'CTDL001',
      courseName: 'CTDL',
      courseId: 'course-ctdl',
      semesterId: 'sem-hk1',
    }),
    klass({
      id: 'c2',
      name: 'LTNC001',
      courseName: 'LTNC',
      courseId: 'course-ltnc',
      semesterId: 'sem-hk2',
    }),
  ];
  const yearMap = new Map([
    ['sem-hk1', 'year-2526'],
    ['sem-hk2', 'year-2526'],
  ]);

  it('null khi không lọc năm/kỳ', () => {
    expect(
      courseIdsForTerm(classes, {
        academicYearId: null,
        semesterId: null,
        semesterYearById: yearMap,
      }),
    ).toBeNull();
  });

  it('lọc theo học kỳ', () => {
    const ids = courseIdsForTerm(classes, {
      academicYearId: null,
      semesterId: 'sem-hk1',
      semesterYearById: yearMap,
    });
    expect([...ids!]).toEqual(['course-ctdl']);
  });

  it('lọc theo năm học', () => {
    const ids = courseIdsForTerm(classes, {
      academicYearId: 'year-2526',
      semesterId: null,
      semesterYearById: yearMap,
    });
    expect(new Set(ids)).toEqual(new Set(['course-ctdl', 'course-ltnc']));
  });
});

describe('filterQsRubricRows', () => {
  const rows: QsRubricListRow[] = [
    {
      id: '1',
      name: '01_largest_product',
      courseId: 'course-ctdl',
      courseLabel: 'CTDL',
      approachCount: 2,
      createdByName: 'GV',
      createdTermLabel: 'HK1 · 2025-2026',
    },
    {
      id: '2',
      name: '02_shortest_path',
      courseId: 'course-ltnc',
      courseLabel: 'LTNC',
      approachCount: 1,
      createdByName: 'GV',
      createdTermLabel: 'HK2 · 2025-2026',
    },
  ];

  it('tìm theo tên', () => {
    expect(
      filterQsRubricRows(rows, {
        search: 'largest',
        courseId: null,
        allowedCourseIds: null,
      }).map((r) => r.id),
    ).toEqual(['1']);
  });

  it('lọc môn', () => {
    expect(
      filterQsRubricRows(rows, {
        search: '',
        courseId: 'course-ltnc',
        allowedCourseIds: null,
      }).map((r) => r.id),
    ).toEqual(['2']);
  });

  it('lọc theo tập course được phép', () => {
    expect(
      filterQsRubricRows(rows, {
        search: '',
        courseId: null,
        allowedCourseIds: new Set(['course-ctdl']),
      }).map((r) => r.id),
    ).toEqual(['1']);
  });
});

describe('formatCreatedTermLabel', () => {
  const semesters = [
    {
      id: 's1',
      name: 'Học kỳ 1 năm học 2026 - 2027',
      academicYearId: 'y1',
      startDate: '2026-08-01',
      endDate: '2026-12-31',
      status: 'active',
    },
  ];

  it('chỉ lấy tên học kỳ catalog, không nối thêm năm học', () => {
    expect(
      formatCreatedTermLabel('2026-09-15T08:00:00.000Z', undefined, semesters),
    ).toBe('Học kỳ 1 năm học 2026 - 2027');
  });

  it('trả - khi thiếu dữ liệu', () => {
    expect(formatCreatedTermLabel(undefined, undefined, semesters)).toBe('-');
    expect(formatCreatedTermLabel('2026-09-15T08:00:00.000Z', undefined, [])).toBe('-');
  });
});

describe('buildQsRubricRows', () => {
  it('map môn, số cách giải và học kỳ tạo', () => {
    const built = buildQsRubricRows(
      [
        rubric({
          id: '1',
          name: 'R1',
          courseId: 'c1',
          createdAt: '2026-09-15T08:00:00.000Z',
          approaches: [
            { key: 'a', name: 'A', maxPoints: 3, steps: [] },
            { key: 'b', name: 'B', maxPoints: 5, steps: [] },
          ],
        }),
      ],
      new Map([['c1', 'CTDL']]),
      'Nguyễn A',
      [
        {
          id: 's1',
          name: 'Học kỳ 1 năm học 2026 - 2027',
          academicYearId: 'y1',
          startDate: '2026-08-01',
          endDate: '2026-12-31',
        },
      ],
    );
    expect(built).toEqual([
      {
        id: '1',
        name: 'R1',
        courseId: 'c1',
        courseLabel: 'CTDL',
        approachCount: 2,
        createdByName: 'Nguyễn A',
        createdTermLabel: 'Học kỳ 1 năm học 2026 - 2027',
      },
    ]);
  });
});
