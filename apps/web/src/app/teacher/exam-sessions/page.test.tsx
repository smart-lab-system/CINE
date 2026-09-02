import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import ExamSessionsListPage from './page';

// QA-reported gap: "Tạo filter cho cả trang quản lý kỳ thi và bài thu" —
// this page previously took only page/pageSize. This page had no test
// coverage at all before (no page.test.tsx existed); mocks the hook
// (CLAUDE.md's frontend rule 1) the same way admin/accounts/page.test.tsx
// does. The debounce (useDebouncedValue) is the REAL hook, not mocked —
// asserted with `waitFor`'s real-timer polling rather than faking timers,
// since nothing else in this codebase fakes timers for this hook either.
const useExamSessionsMock = vi.fn();

vi.mock('@/hooks/useExamSession', () => ({
  useExamSessions: (...args: unknown[]) => useExamSessionsMock(...args),
}));

function session(overrides: Record<string, unknown> = {}) {
  return {
    id: 's1',
    name: 'Giữa kỳ Lập trình Web',
    code: 'ABC123',
    courseName: 'Lập trình Web',
    className: 'Nhóm 01',
    roomName: 'Phòng máy 1',
    examType: 'GK',
    startTime: new Date(Date.now() - 60_000).toISOString(),
    endTime: new Date(Date.now() + 3_600_000).toISOString(),
    status: 'active',
    ...overrides,
  };
}

beforeEach(() => {
  useExamSessionsMock.mockReset();
  useExamSessionsMock.mockReturnValue({
    data: { items: [session()], total: 1 },
    error: null,
    isLoading: false,
    refetch: vi.fn(),
  });
});

describe('ExamSessionsListPage — filters', () => {
  it('calls the hook with the debounced search term, resetting to page 1', async () => {
    render(<ExamSessionsListPage />);

    fireEvent.change(screen.getByRole('textbox', { name: 'Tìm kiếm phiên thi' }), {
      target: { value: 'giữa kỳ' },
    });

    await waitFor(() =>
      expect(useExamSessionsMock).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'giữa kỳ', page: 1 }),
      ),
    );
  });

  it('does not send an empty-string search — undefined, so the API sees no filter at all', () => {
    render(<ExamSessionsListPage />);

    expect(useExamSessionsMock).toHaveBeenCalledWith(
      expect.objectContaining({ search: undefined }),
    );
  });

  it('filters by status, resetting to page 1', () => {
    render(<ExamSessionsListPage />);

    fireEvent.click(screen.getByRole('combobox', { name: 'Lọc theo trạng thái' }));
    fireEvent.click(screen.getByRole('option', { name: 'Đã kết thúc' }));

    expect(useExamSessionsMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'completed', page: 1 }),
    );
  });

  it('filters by exam type', () => {
    render(<ExamSessionsListPage />);

    fireEvent.click(screen.getByRole('combobox', { name: 'Lọc theo loại kỳ thi' }));
    fireEvent.click(screen.getByRole('option', { name: 'Cuối kỳ' }));

    expect(useExamSessionsMock).toHaveBeenCalledWith(
      expect.objectContaining({ examType: 'CK', page: 1 }),
    );
  });

  it('shows a distinct empty state, with a clear-filters action, only once a filter is active', () => {
    useExamSessionsMock.mockReturnValue({
      data: { items: [], total: 0 },
      error: null,
      isLoading: false,
      refetch: vi.fn(),
    });

    const { rerender } = render(<ExamSessionsListPage />);

    // No filter active — the true-empty state, with the "create" CTA.
    expect(screen.getByText('Chưa có phiên thi nào')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Xoá bộ lọc' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('combobox', { name: 'Lọc theo loại kỳ thi' }));
    fireEvent.click(screen.getByRole('option', { name: 'Cuối kỳ' }));
    rerender(<ExamSessionsListPage />);

    expect(screen.getByText('Không tìm thấy phiên thi phù hợp')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Xoá bộ lọc' })).toBeInTheDocument();
  });

  it('"Xoá bộ lọc" resets every filter back to its default', () => {
    useExamSessionsMock.mockReturnValue({
      data: { items: [], total: 0 },
      error: null,
      isLoading: false,
      refetch: vi.fn(),
    });
    render(<ExamSessionsListPage />);

    fireEvent.click(screen.getByRole('combobox', { name: 'Lọc theo loại kỳ thi' }));
    fireEvent.click(screen.getByRole('option', { name: 'Cuối kỳ' }));
    fireEvent.click(screen.getByRole('button', { name: 'Xoá bộ lọc' }));

    expect(useExamSessionsMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        search: undefined,
        status: undefined,
        examType: undefined,
        page: 1,
      }),
    );
  });
});
