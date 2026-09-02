import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import SubmissionSessionDetailPage from './page';

vi.mock('next/navigation', () => ({
  useParams: () => ({ sessionId: 'session-123' }),
}));

// Same 3 hooks the lobby page composes — mocked directly (not the
// underlying apiClient), same convention as that page's own tests, so
// these run with no QueryClientProvider ancestor.
const useExamSessionDetailMock = vi.fn();
const useAttendanceMock = vi.fn();
const useSubmissionsMock = vi.fn();
vi.mock('@/hooks/useExamSession', () => ({
  useExamSessionDetail: (...args: unknown[]) => useExamSessionDetailMock(...args),
  useAttendance: (...args: unknown[]) => useAttendanceMock(...args),
  useSubmissions: (...args: unknown[]) => useSubmissionsMock(...args),
}));

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
