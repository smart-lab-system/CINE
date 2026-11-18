import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/hooks/useGrading', () => ({
  useRubrics: () => ({
    isLoading: false,
    isError: false,
    data: [
      {
        id: 'r1',
        teacherId: 't1',
        courseId: 'c1',
        name: '01_largest_product',
        version: 1,
        isActive: true,
        kind: 'qs',
        totalPoints: 7,
        createdAt: '2026-03-01T10:00:00.000Z',
        criteria: [],
        approaches: [
          { key: 'a', name: 'A', maxPoints: 5, steps: [] },
          { key: 'b', name: 'B', maxPoints: 7, steps: [] },
        ],
      },
    ],
  }),
}));

vi.mock('@/hooks/useTeaching', () => ({
  useTeachingClasses: () => ({
    isLoading: false,
    isError: false,
    data: [
      {
        id: 'k1',
        name: 'CTDL001',
        courseId: 'c1',
        courseName: 'Cấu trúc dữ liệu',
        semesterId: 's1',
        semesterName: 'HK1 2025-2026',
        nominalClassId: null,
        nominalClassName: null,
        studentCount: 10,
      },
    ],
  }),
}));

vi.mock('@/hooks/useMasterData', () => ({
  useAcademicYears: () => ({
    data: { items: [{ id: 'y1', name: 'Năm học 2026 - 2027' }] },
  }),
  useSemesters: () => ({
    data: {
      items: [
        {
          id: 's1',
          name: 'Học kỳ 1 năm học 2026 - 2027',
          academicYearId: 'y1',
          startDate: '2026-01-01',
          endDate: '2026-05-31',
          status: 'active',
        },
      ],
    },
  }),
}));

vi.mock('@/hooks/useCurrentAccount', () => ({
  useCurrentAccount: () => ({ name: 'GV Demo', email: 'gv@example.com', role: 'teacher' }),
}));

import QsRubricsPage from './page';

describe('/teacher/rubrics - Question Specific', () => {
  it('hiện danh sách QS với môn, số cách giải, người tạo', () => {
    render(<QsRubricsPage />);
    expect(screen.getByRole('heading', { name: 'Question Specific' })).toBeInTheDocument();
    expect(screen.getByText('01_largest_product')).toBeInTheDocument();
    expect(screen.getByText('Cấu trúc dữ liệu')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('GV Demo')).toBeInTheDocument();
    expect(screen.getByText('Học kỳ 1 năm học 2026 - 2027')).toBeInTheDocument();
    expect(screen.queryByText(/Năm học 2026 - 2027$/)).not.toBeInTheDocument();
  });
});
