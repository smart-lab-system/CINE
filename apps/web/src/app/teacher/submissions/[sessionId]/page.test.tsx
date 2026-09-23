import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import SubmissionSessionDetailPage from './page';

const searchParamsMock = vi.fn(() => new URLSearchParams(''));
vi.mock('next/navigation', () => ({
  useParams: () => ({ sessionId: 'session-123' }),
  useSearchParams: () => searchParamsMock(),
}));

// Same 3 hooks the lobby page composes — mocked directly (not the
// underlying apiClient), same convention as that page's own tests, so
// these run with no QueryClientProvider ancestor.
const useExamSessionDetailMock = vi.fn();
const useAttendanceMock = vi.fn();
const useSubmissionsMock = vi.fn();
const useArchiveRecheckMock = vi.fn();
vi.mock('@/hooks/useExamSession', () => ({
  useExamSessionDetail: (...args: unknown[]) => useExamSessionDetailMock(...args),
  useAttendance: (...args: unknown[]) => useAttendanceMock(...args),
  useSubmissions: (...args: unknown[]) => useSubmissionsMock(...args),
  useArchiveRecheck: (...args: unknown[]) => useArchiveRecheckMock(...args),
}));

// `vi.mock` factories run before any top-level `const` in this file
// (hoisted above every import, including `./page`'s own chain, which pulls
// in 'sonner' immediately) — `toastMock` has to be created through
// `vi.hoisted` so it exists by the time the factory below runs, or this
// throws "Cannot access 'toastMock' before initialization".
const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast: toastMock }));

const useGradingResultsMock = vi.fn();
vi.mock('@/hooks/useGrading', () => ({
  useGradingResults: (...args: unknown[]) => useGradingResultsMock(...args),
}));

// Wraps (rather than stubs) the real component: this file's pre-existing
// tests render actual student rows through it, so a bare stub would blind
// them. The wrapper still captures every prop for the new ?student= tests
// below, it just also forwards them on to the real implementation.
const submissionStatusTableProps: Record<string, unknown> = {};
vi.mock('@/app/(exam-live)/exam-sessions/[id]/_components/SubmissionStatusTable', async () => {
  const actual = await vi.importActual<
    typeof import('@/app/(exam-live)/exam-sessions/[id]/_components/SubmissionStatusTable')
  >('@/app/(exam-live)/exam-sessions/[id]/_components/SubmissionStatusTable');
  return {
    ...actual,
    SubmissionStatusTable: (props: ComponentProps<typeof actual.SubmissionStatusTable>) => {
      Object.assign(submissionStatusTableProps, props as unknown as Record<string, unknown>);
      return <actual.SubmissionStatusTable {...props} />;
    },
  };
});

function attendanceStudent(mssv: string, name: string) {
  return {
    mssv,
    name,
    connected: true,
    joinedLate: false,
    firstSeenAt: null,
    lastEventAt: null,
    afterHeadcount: null,
  };
}

beforeEach(() => {
  useExamSessionDetailMock.mockReset();
  useAttendanceMock.mockReset();
  useSubmissionsMock.mockReset();
  useGradingResultsMock.mockReset();
  useGradingResultsMock.mockReturnValue({ data: undefined });
  useArchiveRecheckMock.mockReset();
  useArchiveRecheckMock.mockReturnValue({ mutate: vi.fn(), isPending: false });
  toastMock.success.mockReset();
  toastMock.error.mockReset();

  useExamSessionDetailMock.mockReturnValue({
    data: {
      id: 'session-123',
      name: 'Giữa kỳ Lập trình Web',
      status: 'completed',
      startTime: '2026-08-29T02:00:00.000Z',
      endTime: '2026-08-29T04:00:00.000Z',
      requiredDeliverables: [{ id: 'd1', requiredFilename: 'Cau1.docx' }],
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  });
  useAttendanceMock.mockReturnValue({
    data: {
      classId: 'class-1',
      className: 'CNM01',
      rosterSize: 1,
      confirmedAt: null,
      confirmedCount: null,
      present: [attendanceStudent('SV20120001', 'Nguyễn Văn A')],
      absent: [],
      makeup: [],
      discrepancy: null,
    },
    isLoading: false,
  });
  useSubmissionsMock.mockReturnValue({
    data: {
      items: [
        {
          studentMssv: 'SV20120001',
          studentNameInput: 'Nguyễn Văn A',
          requiredDeliverableId: 'd1',
          status: 'collected',
          submittedAt: '2026-08-29T03:00:00.000Z',
          fileSize: '2048',
          downloadUrl: 'https://storage.example/signed',
        },
      ],
    },
    isLoading: false,
  });
});

describe('SubmissionSessionDetailPage', () => {
  it('shows a loading skeleton before the session loads, not the header', () => {
    useExamSessionDetailMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      refetch: vi.fn(),
    });

    render(<SubmissionSessionDetailPage />);

    expect(screen.queryByText('Giữa kỳ Lập trình Web')).not.toBeInTheDocument();
  });

  it('shows an error with a retry action when the session fails to load', () => {
    const refetch = vi.fn();
    useExamSessionDetailMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch,
    });

    render(<SubmissionSessionDetailPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));

    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('shows the session name once loaded', () => {
    render(<SubmissionSessionDetailPage />);

    expect(screen.getByText('Giữa kỳ Lập trình Web')).toBeInTheDocument();
  });

  it('shows the rollup line with the correct counts', () => {
    render(<SubmissionSessionDetailPage />);

    expect(screen.getByText('1/1')).toBeInTheDocument();
    expect(
      screen.getByText(/sinh viên đã nộp đủ 1 file bắt buộc/),
    ).toBeInTheDocument();
  });

  it('links to Chấm điểm with this session pre-selected', () => {
    render(<SubmissionSessionDetailPage />);

    const link = screen.getByRole('link', { name: 'Chấm điểm' });
    expect(link).toHaveAttribute('href', '/teacher/grading?sessionId=session-123');
  });

  it('renders the submission status table with this session\'s students', () => {
    render(<SubmissionSessionDetailPage />);

    expect(screen.getByText('Nguyễn Văn A')).toBeInTheDocument();
    expect(screen.getByText('SV20120001')).toBeInTheDocument();
  });
});

describe('SubmissionSessionDetailPage — ?student=', () => {
  it('truyền MSSV từ URL xuống bảng', () => {
    searchParamsMock.mockReturnValue(new URLSearchParams('student=21520123'));
    render(<SubmissionSessionDetailPage />);
    expect(submissionStatusTableProps.focusStudentMssv).toBe('21520123');
  });

  it('không có param thì không truyền gì (bẫy 6)', () => {
    searchParamsMock.mockReturnValue(new URLSearchParams(''));
    render(<SubmissionSessionDetailPage />);
    expect(submissionStatusTableProps.focusStudentMssv).toBeUndefined();
  });
});

describe('SubmissionSessionDetailPage — gradingByMssv', () => {
  it('map kết quả chấm theo MSSV và truyền xuống bảng', () => {
    useGradingResultsMock.mockReturnValue({
      data: [
        { studentMssv: 'A1', aiTotalScore: 8.5, finalScore: null, status: 'ai_graded' },
      ],
    });
    render(<SubmissionSessionDetailPage />);
    expect(submissionStatusTableProps.gradingByMssv).toEqual({
      A1: { score: 8.5, status: 'ai_graded' },
    });
  });

  it('điểm giảng viên đã chốt thắng điểm AI đề xuất', () => {
    // Không có test này thì hai màn hình lặng lẽ nói hai con số khác nhau về
    // cùng một bài: trang Chấm điểm hiện 7.5, trang này hiện 4.0.
    useGradingResultsMock.mockReturnValue({
      data: [
        { studentMssv: 'A1', aiTotalScore: 4, finalScore: 7.5, status: 'finalized' },
      ],
    });
    render(<SubmissionSessionDetailPage />);
    expect(submissionStatusTableProps.gradingByMssv).toEqual({
      A1: { score: 7.5, status: 'finalized' },
    });
  });

  it('điểm 0 do giảng viên chấm KHÔNG bị rơi về điểm AI', () => {
    // `??` chứ không phải `||` — đây là ca duy nhất phân biệt được hai toán tử.
    useGradingResultsMock.mockReturnValue({
      data: [
        { studentMssv: 'A1', aiTotalScore: 6, finalScore: 0, status: 'finalized' },
      ],
    });
    render(<SubmissionSessionDetailPage />);
    expect(submissionStatusTableProps.gradingByMssv).toEqual({
      A1: { score: 0, status: 'finalized' },
    });
  });
});

// Task 10 — nút "Kiểm lại" (POST /exam-sessions/:id/archive-recheck).
// KHÁC "Thu lại" của trang lobby: trang này không đụng gì tới bài nộp,
// chỉ xếp lại các dòng failed/unreadable/pending mồ côi vào hàng đợi kiểm.
describe('SubmissionSessionDetailPage — Kiểm lại', () => {
  it('bấm thì gọi mutate, và thành công thì báo đúng số đã xếp lại', () => {
    const mutate = vi.fn((_arg, opts?: { onSuccess?: (r: { requeued: number }) => void }) => {
      opts?.onSuccess?.({ requeued: 3 });
    });
    useArchiveRecheckMock.mockReturnValue({ mutate, isPending: false });

    render(<SubmissionSessionDetailPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Kiểm lại' }));

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(toastMock.success).toHaveBeenCalledWith(
      expect.stringContaining('3'),
    );
  });

  it('không có gì để kiểm lại thì vẫn báo thành công, không phải lỗi', () => {
    const mutate = vi.fn((_arg, opts?: { onSuccess?: (r: { requeued: number }) => void }) => {
      opts?.onSuccess?.({ requeued: 0 });
    });
    useArchiveRecheckMock.mockReturnValue({ mutate, isPending: false });

    render(<SubmissionSessionDetailPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Kiểm lại' }));

    expect(toastMock.success).toHaveBeenCalled();
    expect(toastMock.error).not.toHaveBeenCalled();
  });

  it('lỗi thì báo lỗi, không im lặng', () => {
    const mutate = vi.fn((_arg, opts?: { onError?: () => void }) => {
      opts?.onError?.();
    });
    useArchiveRecheckMock.mockReturnValue({ mutate, isPending: false });

    render(<SubmissionSessionDetailPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Kiểm lại' }));

    expect(toastMock.error).toHaveBeenCalled();
  });

  it('đang xếp hàng thì nút bị khoá, không cho bấm chồng', () => {
    useArchiveRecheckMock.mockReturnValue({ mutate: vi.fn(), isPending: true });

    render(<SubmissionSessionDetailPage />);

    expect(screen.getByRole('button', { name: 'Kiểm lại' })).toBeDisabled();
  });
});
