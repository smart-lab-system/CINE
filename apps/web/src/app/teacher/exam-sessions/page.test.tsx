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

// Bộ lọc học kỳ đọc `useSemesterFilter`. Hook đó không còn gọi API nào —
// học kỳ là một chuỗi trên chính phiên thi từ đợt thu hẹp master data — nên
// mock chỉ cần điều khiển kỳ đang chọn. Danh sách lựa chọn thì trang tự
// dựng từ các phiên đã tải, nên nó đến từ `session()` bên dưới.
const useSemesterFilterMock = vi.fn();
const setSemesterName = vi.fn();

vi.mock('@/hooks/useSemesterFilter', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/useSemesterFilter')>(
    '@/hooks/useSemesterFilter',
  );
  return {
    ...actual,
    useSemesterFilter: (...args: unknown[]) => useSemesterFilterMock(...args),
  };
});

const CURRENT_SEMESTER = 'Học kỳ 1 2026-2027';
const OLD_SEMESTER = 'Học kỳ 2 2025-2026';

function semesterState(semesterName: string | null) {
  return { semesterName, setSemesterName };
}

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
    semesterName: CURRENT_SEMESTER,
    ...overrides,
  };
}

beforeEach(() => {
  setSemesterName.mockReset();
  useSemesterFilterMock.mockReset();
  useSemesterFilterMock.mockReturnValue(semesterState(CURRENT_SEMESTER));
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
    // Học kỳ = "tất cả": tách riêng hai câu chuyện "chưa có phiên nào" và
    // "kỳ này không có phiên nào" — xem test ngay dưới.
    useSemesterFilterMock.mockReturnValue(semesterState(null));
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

  it('sends the selected semester to the API, and omits it for "tất cả học kỳ"', () => {
    render(<ExamSessionsListPage />);
    expect(useExamSessionsMock).toHaveBeenCalledWith(
      expect.objectContaining({ semesterName: CURRENT_SEMESTER }),
    );

    // `null` phải đi ra ngoài thành `undefined`, không phải chuỗi "null":
    // query param rỗng là "không lọc", và một `semesterName=` gửi lên sẽ bị
    // @Length từ chối bằng 400.
    useSemesterFilterMock.mockReturnValue(semesterState(null));
    render(<ExamSessionsListPage />);
    expect(useExamSessionsMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ semesterName: undefined }),
    );
  });

  it('chọn học kỳ khác thì đổi kỳ và quay về trang 1', () => {
    // Danh sách kỳ trong dropdown dựng TỪ các phiên đã tải — không còn bảng
    // `semester` nào để liệt kê — nên kỳ cũ phải có mặt trong dữ liệu.
    useExamSessionsMock.mockReturnValue({
      data: {
        items: [session(), session({ id: 's2', semesterName: OLD_SEMESTER })],
        total: 2,
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<ExamSessionsListPage />);

    fireEvent.click(screen.getByRole('combobox', { name: 'Lọc theo học kỳ' }));
    fireEvent.click(screen.getByRole('option', { name: 'Học kỳ 2 2025-2026' }));

    expect(setSemesterName).toHaveBeenCalledWith(OLD_SEMESTER);
    // Trang phải reset: đang ở trang 3 của kỳ này rồi đổi kỳ sẽ rơi vào
    // một trang 3 không tồn tại của kỳ kia, và bảng hiện ra rỗng.
    expect(useExamSessionsMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 1 }),
    );
  });

  it('kỳ rỗng nói khác "chưa có phiên thi nào", và mở được đường sang tất cả học kỳ', () => {
    // Hai câu chuyện khác nhau, không được nói chung một câu: "bạn chưa
    // tạo phiên nào bao giờ" cần nút Tạo, còn "kỳ này bạn không có phiên"
    // chỉ cần đổi bộ lọc — cùng khuôn với "Lớp của tôi".
    useExamSessionsMock.mockReturnValue({
      data: { items: [], total: 0 },
      error: null,
      isLoading: false,
      refetch: vi.fn(),
    });
    render(<ExamSessionsListPage />);

    expect(screen.getByText('Không có phiên thi nào trong học kỳ này')).toBeInTheDocument();
    expect(screen.queryByText('Chưa có phiên thi nào')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Xem tất cả học kỳ' }));
    expect(setSemesterName).toHaveBeenCalledWith(null);
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
    // Học kỳ là PHẠM VI đang xem, không phải một filter trong phạm vi đó —
    // "Xoá bộ lọc" cố ý không đụng tới nó, giống nút cùng tên ở FilterRail
    // của trang Bài thu. Lối ra khỏi một học kỳ là chính dropdown đó.
    expect(setSemesterName).not.toHaveBeenCalled();
  });
});
