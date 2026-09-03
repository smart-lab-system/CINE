import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import SubmissionsPage from './page';

// QA-reported gap (points 5 + 6): "Tạo ra trang quản lý bài thu" + "Tạo
// filter cho cả trang quản lý kỳ thi và bài thu" — this page was a bare
// PlaceholderPage before ("Sắp có"), so it had no test coverage at all.
// Mocks both hooks it depends on (CLAUDE.md's frontend rule 1) — the
// sessions dropdown reuses useExamSessions, already mocked the same way
// in teacher/exam-sessions/page.test.tsx.
const useTeacherSubmissionsMock = vi.fn();
const useExamSessionsMock = vi.fn();

vi.mock('@/hooks/useTeacherSubmissions', () => ({
  useTeacherSubmissions: (...args: unknown[]) => useTeacherSubmissionsMock(...args),
}));
vi.mock('@/hooks/useExamSession', () => ({
  useExamSessions: (...args: unknown[]) => useExamSessionsMock(...args),
}));

function submission(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sub-1',
    examSessionId: 'session-1',
    examSessionName: 'Giữa kỳ Lập trình Web',
    requiredFilename: 'Cau1.docx',
    studentMssv: 'SV20120001',
    studentNameInput: 'Nguyễn Văn A',
    status: 'collected',
    submittedAt: '2026-08-29T04:00:00.000Z',
    fileSize: '2048',
    downloadUrl: 'https://storage.example/signed',
    ...overrides,
  };
}

beforeEach(() => {
  useTeacherSubmissionsMock.mockReset();
  useExamSessionsMock.mockReset();
  useTeacherSubmissionsMock.mockReturnValue({
    data: { items: [submission()], total: 1 },
    error: null,
    isLoading: false,
    refetch: vi.fn(),
  });
  useExamSessionsMock.mockReturnValue({
    data: { items: [{ id: 'session-1', name: 'Giữa kỳ Lập trình Web' }], total: 1 },
    error: null,
    isLoading: false,
    refetch: vi.fn(),
  });
});

describe('SubmissionsPage', () => {
  it('renders a submission row with student, session, file, status, and a named download link', () => {
    render(<SubmissionsPage />);

    expect(screen.getByText('Nguyễn Văn A')).toBeInTheDocument();
    expect(screen.getByText('SV20120001')).toBeInTheDocument();
    expect(screen.getByText('Giữa kỳ Lập trình Web')).toBeInTheDocument();
    expect(screen.getByText('Cau1.docx')).toBeInTheDocument();
    expect(screen.getByText('Đã thu')).toBeInTheDocument();

    const link = screen.getByRole('link', { name: 'Mở file' });
    expect(link).toHaveAttribute('href', 'https://storage.example/signed');
    expect(link).toHaveAttribute('download', 'Cau1.docx');
  });

  it('shows a loading skeleton before the list arrives', () => {
    useTeacherSubmissionsMock.mockReturnValue({ data: undefined, error: null, isLoading: true, refetch: vi.fn() });

    render(<SubmissionsPage />);

    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('shows an error with a retry action instead of an empty table', () => {
    const refetch = vi.fn();
    useTeacherSubmissionsMock.mockReturnValue({
      data: undefined,
      error: new Error('Yêu cầu thất bại (HTTP 500)'),
      isLoading: false,
      refetch,
    });

    render(<SubmissionsPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));

    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('distinguishes the true-empty state from a filtered-empty one', () => {
    useTeacherSubmissionsMock.mockReturnValue({
      data: { items: [], total: 0 },
      error: null,
      isLoading: false,
      refetch: vi.fn(),
    });
    const { rerender } = render(<SubmissionsPage />);

    expect(screen.getByText('Chưa có bài nộp nào')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Xoá bộ lọc' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('combobox', { name: 'Lọc theo trạng thái' }));
    fireEvent.click(screen.getByRole('option', { name: 'Không hợp lệ' }));
    rerender(<SubmissionsPage />);

    expect(screen.getByText('Không tìm thấy bài nộp phù hợp')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Xoá bộ lọc' })).toBeInTheDocument();
  });

  it('calls the hook with the debounced search term, resetting to page 1', async () => {
    render(<SubmissionsPage />);

    fireEvent.change(screen.getByRole('textbox', { name: 'Tìm kiếm bài nộp' }), {
      target: { value: 'Nguyễn' },
    });

    await waitFor(() =>
      expect(useTeacherSubmissionsMock).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'Nguyễn', page: 1 }),
      ),
    );
  });

  it('filters by status, resetting to page 1', () => {
    render(<SubmissionsPage />);

    fireEvent.click(screen.getByRole('combobox', { name: 'Lọc theo trạng thái' }));
    fireEvent.click(screen.getByRole('option', { name: 'Đã kiểm tra' }));

    expect(useTeacherSubmissionsMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'validated', page: 1 }),
    );
  });

  it('filters by exam session, built from the same picker useExamSessions already powers', () => {
    useExamSessionsMock.mockReturnValue({
      data: {
        items: [
          { id: 'session-1', name: 'Giữa kỳ Lập trình Web' },
          { id: 'session-2', name: 'Cuối kỳ Cấu trúc dữ liệu' },
        ],
        total: 2,
      },
      error: null,
      isLoading: false,
      refetch: vi.fn(),
    });
    render(<SubmissionsPage />);

    fireEvent.click(screen.getByRole('combobox', { name: 'Lọc theo phiên thi' }));
    fireEvent.click(screen.getByRole('option', { name: 'Cuối kỳ Cấu trúc dữ liệu' }));

    expect(useTeacherSubmissionsMock).toHaveBeenCalledWith(
      expect.objectContaining({ examSessionId: 'session-2', page: 1 }),
    );
  });

  it('does not show a link to the session detail page while viewing all sessions', () => {
    render(<SubmissionsPage />);

    expect(screen.queryByRole('link', { name: /Xem chi tiết phiên/ })).not.toBeInTheDocument();
  });

  it('shows a link to that session\'s detail page once the exam-session filter narrows to one session', () => {
    useExamSessionsMock.mockReturnValue({
      data: {
        items: [
          { id: 'session-1', name: 'Giữa kỳ Lập trình Web' },
          { id: 'session-2', name: 'Cuối kỳ Cấu trúc dữ liệu' },
        ],
        total: 2,
      },
      error: null,
      isLoading: false,
      refetch: vi.fn(),
    });
    render(<SubmissionsPage />);

    fireEvent.click(screen.getByRole('combobox', { name: 'Lọc theo phiên thi' }));
    fireEvent.click(screen.getByRole('option', { name: 'Cuối kỳ Cấu trúc dữ liệu' }));

    const link = screen.getByRole('link', { name: /Xem chi tiết phiên/ });
    expect(link).toHaveAttribute('href', '/teacher/submissions/session-2');
  });

  it('"Xoá bộ lọc" resets every filter back to its default', () => {
    useTeacherSubmissionsMock.mockReturnValue({
      data: { items: [], total: 0 },
      error: null,
      isLoading: false,
      refetch: vi.fn(),
    });
    render(<SubmissionsPage />);

    fireEvent.click(screen.getByRole('combobox', { name: 'Lọc theo trạng thái' }));
    fireEvent.click(screen.getByRole('option', { name: 'Không hợp lệ' }));
    fireEvent.click(screen.getByRole('button', { name: 'Xoá bộ lọc' }));

    expect(useTeacherSubmissionsMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        search: undefined,
        status: undefined,
        examSessionId: undefined,
        page: 1,
      }),
    );
  });
});
