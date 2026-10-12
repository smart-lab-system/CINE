import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import TeacherClassesPage from './page';

const useTeachingClassesMock = vi.fn();

vi.mock('@/hooks/useTeaching', () => ({
  useTeachingClasses: () => useTeachingClassesMock(),
}));

const CLASS = {
  id: 'k1',
  name: 'N01',
  courseName: 'CTDL&GT',
  studentCount: 40,
};

/**
 * Lớp do admin phân công — teacher không tạo/xoá lớp trên trang này.
 */
describe('TeacherClassesPage', () => {
  beforeEach(() => {
    useTeachingClassesMock.mockReturnValue({
      data: [CLASS],
      isLoading: false,
      isError: false,
    });
  });

  it('không còn nút tạo lớp', () => {
    render(<TeacherClassesPage />);
    expect(screen.queryByRole('button', { name: /tạo lớp/i })).not.toBeInTheDocument();
  });

  it('liệt kê lớp đã phân công và link roster', () => {
    render(<TeacherClassesPage />);
    expect(screen.getByText('N01')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /danh sách sv/i })).toHaveAttribute(
      'href',
      '/teacher/classes/k1/roster',
    );
  });

  it('empty state khi chưa được phân công', () => {
    useTeachingClassesMock.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    });
    render(<TeacherClassesPage />);
    expect(screen.getByText(/chưa được phân công lớp nào/i)).toBeInTheDocument();
  });
});
