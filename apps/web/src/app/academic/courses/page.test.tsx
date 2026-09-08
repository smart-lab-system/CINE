import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import CatalogPage from './page';

vi.mock('@/hooks/useDepartment', () => ({
  useCourseCatalog: () => ({
    data: [
      {
        id: 'c1',
        code: 'CS101',
        name: 'Nhập môn',
        semesterId: 's1',
        departmentHeadId: null,
        departmentHeadName: null,
        enrollmentCount: 0,
      },
      {
        id: 'c2',
        code: 'CS201',
        name: 'Cấu trúc dữ liệu',
        semesterId: 's1',
        departmentHeadId: 'h1',
        departmentHeadName: 'Trần Văn A',
        enrollmentCount: 42,
      },
    ],
    isLoading: false,
    isError: false,
    error: null,
  }),
  useCreateCatalogCourse: () => ({ mutateAsync: vi.fn(), isPending: false, error: null }),
  useUpdateCatalogCourse: () => ({ mutateAsync: vi.fn(), isPending: false, error: null }),
  useDeleteCatalogCourse: () => ({ mutateAsync: vi.fn(), isPending: false, error: null }),
  useAssignCourseOwner: () => ({ mutate: vi.fn(), isPending: false, error: null }),
  useSemesters: () => ({ data: [], isLoading: false }),
}));

vi.mock('@/hooks/useAccounts', () => ({
  useAccounts: () => ({
    data: { items: [{ id: 'h1', name: 'Trần Văn A' }] },
    isLoading: false,
  }),
}));

vi.mock('@/hooks/useSemesterFilter', () => ({
  useSemesterFilter: () => ({
    semesterId: 's1',
    setSemesterId: vi.fn(),
    semesters: [],
    current: null,
    isLoading: false,
    isStale: false,
    staleDays: 0,
  }),
}));

describe('trang danh mục môn của Phòng Đào tạo', () => {
  it('nói rõ môn nào chưa có chủ, và tên chủ khi đã có', () => {
    render(<CatalogPage />);
    // "Chưa có chủ" là một TRẠNG THÁI cần đọc ra được, không phải một ô trống:
    // một môn chưa có chủ không hiện trong màn hình của bất kỳ Trưởng khoa nào,
    // nên nó là việc cần làm chứ không phải thiếu dữ liệu.
    expect(screen.getByText('Chưa có chủ')).toBeInTheDocument();
    expect(screen.getAllByText('Trần Văn A').length).toBeGreaterThan(0);
  });

  it('có công tắc lọc riêng môn chưa có chủ', () => {
    render(<CatalogPage />);
    expect(screen.getByLabelText(/chỉ môn chưa có chủ/i)).toBeInTheDocument();
  });
});
