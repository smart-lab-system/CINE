import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const h = vi.hoisted(() => ({ kind: 'qs', error: false }));

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'r1' }),
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/hooks/useGrading', () => ({
  useRubric: () => ({
    isLoading: false,
    isError: h.error,
    error: h.error ? new Error('Không tải được rubric.') : null,
    data: h.error ? undefined : {
      id: 'r1',
      teacherId: 't1',
      courseId: 'c1',
      name: '01_largest_product',
      version: 1,
      isActive: true,
      kind: h.kind,
      totalPoints: 7,
      createdAt: '2026-09-15T08:00:00.000Z',
      criteria: [],
      approaches: [
        {
          key: 'a',
          name: 'Brute force',
          maxPoints: 5,
          steps: [
            { key: 'a_s1', description: 'Vòng lồng', maxPoints: 2 },
            { key: 'a_s2', description: 'Cập nhật max', maxPoints: 3 },
          ],
        },
        {
          key: 'b',
          name: 'Sliding',
          maxPoints: 7,
          steps: [{ key: 'b_s1', description: 'Cửa sổ', maxPoints: 7 }],
        },
      ],
    },
  }),
}));

vi.mock('@/hooks/useTeaching', () => ({
  useTeachingClasses: () => ({
    data: [
      {
        id: 'k1',
        name: 'CTDL001',
        courseId: 'c1',
        courseName: 'Cấu trúc dữ liệu',
        semesterId: 's1',
        semesterName: 'HK1',
        nominalClassId: null,
        nominalClassName: null,
        studentCount: 1,
      },
    ],
  }),
}));

vi.mock('@/hooks/useMasterData', () => ({
  useSemesters: () => ({
    data: {
      items: [
        {
          id: 's1',
          name: 'Học kỳ 1 năm học 2026 - 2027',
          academicYearId: 'y1',
          startDate: '2026-08-01',
          endDate: '2026-12-31',
        },
      ],
    },
  }),
}));

vi.mock('@/hooks/useExamBank', () => ({
  useExamsLinkingRubric: () => ({
    isLoading: false,
    isError: false,
    data: [{ id: 'e1', title: 'Đề thi thường kỳ - CTDL - largest' }],
  }),
}));

vi.mock('@/hooks/useCurrentAccount', () => ({
  useCurrentAccount: () => ({ name: 'GV Demo', email: 'gv@example.com', role: 'teacher' }),
}));

import QsRubricDetailPage from './page';

describe('/teacher/rubrics/[id]', () => {
  beforeEach(() => {
    h.kind = 'qs';
    h.error = false;
  });

  it('hiện thông tin rubric, đề thi và cấu trúc cách giải', () => {
    render(<QsRubricDetailPage />);
    const info = screen.getByRole('region', { name: 'Thông tin rubric' });
    expect(info).toHaveTextContent('Cấu trúc dữ liệu');
    expect(info).toHaveTextContent('Số cách giải');
    expect(info).toHaveTextContent('Tổng số bước');
    expect(info).toHaveTextContent(/7[,.]0 điểm/);
    expect(info).toHaveTextContent('GV Demo');
    expect(info).toHaveTextContent('Học kỳ 1 năm học 2026 - 2027');
    expect(
      screen.getByRole('link', { name: 'Đề thi thường kỳ - CTDL - largest' }),
    ).toHaveAttribute('href', '/teacher/exam-bank/e1');
    expect(screen.getByRole('region', { name: /Cách giải 1/ })).toBeInTheDocument();
    expect(screen.getByText('Vòng lồng')).toBeInTheDocument();
  });

  it('rubric không phải loại theo câu hỏi vẫn có h1 là tên rubric', () => {
    h.kind = 'qa';
    render(<QsRubricDetailPage />);
    expect(screen.getByRole('heading', { level: 1, name: '01_largest_product' })).toBeInTheDocument();
    expect(screen.getByText(/không phải rubric theo câu hỏi/)).toBeInTheDocument();
  });

  it('khi không tải được rubric vẫn có h1 và nói lý do', () => {
    h.error = true;
    render(<QsRubricDetailPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Chi tiết rubric' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Không tải được rubric.');
  });
});
