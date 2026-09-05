import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import RubricsPage from './page';

const useTeachingClassesMock = vi.fn();
vi.mock('@/hooks/useTeaching', () => ({
  useTeachingClasses: (...args: unknown[]) => useTeachingClassesMock(...args),
}));

const useRubricsMock = vi.fn();
const useSaveRubricMock = vi.fn();
vi.mock('@/hooks/useGrading', () => ({
  useRubrics: (...args: unknown[]) => useRubricsMock(...args),
  useSaveRubric: (...args: unknown[]) => useSaveRubricMock(...args),
}));

describe('RubricsPage', () => {
  beforeEach(() => {
    useRubricsMock.mockReturnValue({ data: [], isLoading: false });
    useSaveRubricMock.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isError: false,
      error: null,
    });
  });

  it('gộp hai lớp cùng môn thành MỘT môn', () => {
    // Rubric thuộc MÔN, không thuộc lớp — hai lớp cùng môn dùng chung một
    // rubric. Hiện hai dòng nghĩa là nói dối: sửa ở dòng này thì dòng kia
    // đổi theo, và giảng viên không có cách nào biết.
    useTeachingClassesMock.mockReturnValue({
      data: [
        { id: 'c1', courseId: 'course-1', courseName: 'Lập trình Web', name: 'N01' },
        { id: 'c2', courseId: 'course-1', courseName: 'Lập trình Web', name: 'N02' },
        { id: 'c3', courseId: 'course-2', courseName: 'Cơ sở dữ liệu', name: 'N01' },
      ],
      isLoading: false,
    });

    render(<RubricsPage />);

    expect(screen.getAllByText('Lập trình Web')).toHaveLength(1);
    expect(screen.getByText('Cơ sở dữ liệu')).toBeInTheDocument();
  });

  it('nói rõ khi giảng viên chưa dạy lớp nào', () => {
    useTeachingClassesMock.mockReturnValue({ data: [], isLoading: false });

    render(<RubricsPage />);

    expect(screen.getByText(/chưa dạy lớp nào/i)).toBeInTheDocument();
  });
});
