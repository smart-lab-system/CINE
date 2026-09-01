import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import DepartmentTeachersPage from './page';

// QA-reported gap (point 7): "ở trưởng khoa, ko có quản lý giảng viên hiện
// tại có trong khoa" — this page had no test coverage before because it
// did not exist. Mocks the hooks module (CLAUDE.md's frontend rule 1 means
// the page only ever goes through hooks/useDepartment.ts), same pattern as
// admin/accounts/page.test.tsx.
const useDepartmentTeachersMock = vi.fn();

vi.mock('@/hooks/useDepartment', () => ({
  useDepartmentTeachers: () => useDepartmentTeachersMock(),
}));

beforeEach(() => {
  useDepartmentTeachersMock.mockReset();
});

describe('DepartmentTeachersPage', () => {
  it('shows a loading skeleton before the list arrives', () => {
    useDepartmentTeachersMock.mockReturnValue({ data: undefined, error: null, isLoading: true });

    render(<DepartmentTeachersPage />);

    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('shows an empty state when nobody has been assigned a class yet', () => {
    useDepartmentTeachersMock.mockReturnValue({ data: [], error: null, isLoading: false });

    render(<DepartmentTeachersPage />);

    expect(screen.getByText('Chưa có giảng viên nào')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('shows an error message instead of an empty table when the request fails', () => {
    useDepartmentTeachersMock.mockReturnValue({
      data: undefined,
      error: new Error('Yêu cầu thất bại (HTTP 500)'),
      isLoading: false,
    });

    render(<DepartmentTeachersPage />);

    expect(screen.getByText('Yêu cầu thất bại (HTTP 500)')).toBeInTheDocument();
  });

  it('lists each teacher once, with email and how many classes they teach', () => {
    useDepartmentTeachersMock.mockReturnValue({
      data: [
        { id: 't1', name: 'Nguyễn Văn A', email: 'a@example.com', classCount: 2 },
        { id: 't2', name: 'Trần Thị B', email: 'b@example.com', classCount: 1 },
      ],
      error: null,
      isLoading: false,
    });

    render(<DepartmentTeachersPage />);

    expect(screen.getByText('Nguyễn Văn A')).toBeInTheDocument();
    expect(screen.getByText('a@example.com')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('Trần Thị B')).toBeInTheDocument();
    expect(screen.getByText('b@example.com')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });
});
