import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const useTeachingClassesMock = vi.fn();

vi.mock('@/hooks/useTeaching', () => ({
  useTeachingClasses: (...args: unknown[]) => useTeachingClassesMock(...args),
}));

// useSemesterFilter gọi useSemesters() — một TanStack query THẬT, và test này
// render không có QueryClientProvider. Mock ở tầng hook.
vi.mock('@/hooks/useDepartment', () => ({
  useSemesters: () => ({
    data: [
      {
        id: 'sem-1',
        name: 'Học kỳ 1 2026-2027',
        startDate: '2026-09-01',
        endDate: '2027-01-15',
        isCurrent: false,
      },
      {
        id: 'sem-2',
        name: 'Học kỳ 2 2026-2027',
        startDate: '2027-02-01',
        endDate: '2027-06-30',
        isCurrent: true,
      },
    ],
    isLoading: false,
  }),
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

import TeacherClassesPage from './page';

function klass(overrides: Record<string, unknown> = {}) {
  return {
    id: 'k1',
    name: 'N01',
    courseId: 'c1',
    courseCode: 'CS101',
    courseName: 'Nhập môn CSDL',
    semesterId: 'sem-2',
    semesterName: 'Học kỳ 2 2026-2027',
    studentCount: 42,
    ...overrides,
  };
}

beforeEach(() => {
  useTeachingClassesMock.mockReset();
  useTeachingClassesMock.mockReturnValue({
    data: [klass()],
    isLoading: false,
    isError: false,
    error: null,
  });
});

describe('TeacherClassesPage — bộ lọc học kỳ', () => {
  // Đây là lỗi ban đầu của trang: nó trả MỌI lớp giảng viên từng được gán, từ
  // mọi kỳ, chồng chất mãi.
  it('gọi API với kỳ đang hiện hành, không phải mọi kỳ', async () => {
    render(<TeacherClassesPage />);
    await waitFor(() => expect(useTeachingClassesMock).toHaveBeenCalledWith('sem-2'));
  });

  // Khi đã lọc một kỳ, cột học kỳ là một hằng số lặp trên từng dòng.
  it('KHÔNG hiện cột học kỳ khi đang lọc một kỳ cụ thể', async () => {
    render(<TeacherClassesPage />);
    await waitFor(() => expect(useTeachingClassesMock).toHaveBeenCalledWith('sem-2'));
    expect(screen.queryByRole('columnheader', { name: 'Học kỳ' })).not.toBeInTheDocument();
  });

  // Ở "Tất cả", nó là thứ duy nhất phân biệt N01 của HK1 với N01 của HK2 —
  // uq_class_course_name chỉ unique trên (course_id, name).
  it('hiện cột học kỳ khi chuyển sang "Tất cả học kỳ"', async () => {
    render(<TeacherClassesPage />);
    await waitFor(() => expect(useTeachingClassesMock).toHaveBeenCalledWith('sem-2'));

    fireEvent.click(screen.getByLabelText('Lọc theo học kỳ'));
    fireEvent.click(await screen.findByText('Tất cả học kỳ'));

    await waitFor(() =>
      expect(screen.getByRole('columnheader', { name: 'Học kỳ' })).toBeInTheDocument(),
    );
    expect(useTeachingClassesMock).toHaveBeenCalledWith(null);
  });

  it('empty state nói rõ là rỗng THEO KỲ, không phải chưa được giao lớp nào', async () => {
    useTeachingClassesMock.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
    });

    render(<TeacherClassesPage />);
    await waitFor(() =>
      expect(screen.getByText('Học kỳ này bạn chưa được giao lớp nào')).toBeInTheDocument(),
    );
  });
});
