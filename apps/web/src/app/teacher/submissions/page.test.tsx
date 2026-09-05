import { describe, expect, it, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { SessionOverviewItem } from '@/lib/api/submissions';

const useSessionOverviewMock = vi.fn();
const useTeacherSubmissionsMock = vi.fn();

const archiveMutate = vi.fn();
const closeMutate = vi.fn();

vi.mock('@/hooks/useSubmissionOverview', () => ({
  useSessionOverview: () => useSessionOverviewMock(),
  useTeacherSubmissions: (...args: unknown[]) => useTeacherSubmissionsMock(...args),
  useArchiveSession: () => ({ mutate: archiveMutate }),
  useCloseAttention: () => ({ mutate: closeMutate }),
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

import SubmissionsPage from './page';

const HOUR = 3_600_000;

function make(overrides: Partial<SessionOverviewItem> = {}): SessionOverviewItem {
  return {
    id: 'session-1',
    name: 'Thường kỳ #1',
    code: 'TK1',
    courseId: 'course-1',
    courseName: 'Nhập môn CSDL',
    classId: 'class-1',
    className: 'N01',
    roomName: 'A3-01',
    examType: 'TK',
    startTime: new Date(Date.now() - 4 * HOUR).toISOString(),
    endTime: new Date(Date.now() - 2 * HOUR).toISOString(),
    status: 'completed',
    requiredDeliverableCount: 3,
    expectedCount: 40,
    rosterKnown: true,
    fullySubmittedCount: 40,
    partialCount: 0,
    attendedNoSubmissionCount: 0,
    neverAttendedCount: 0,
    invalidFileCount: 0,
    semesterId: 'sem-1',
    semesterName: 'Học kỳ 1 2026-2027',
    archivedAt: null,
    attentionClosedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  useSessionOverviewMock.mockReset();
  useTeacherSubmissionsMock.mockReset();
  useTeacherSubmissionsMock.mockReturnValue({ data: undefined, isLoading: false, error: null });
  useSessionOverviewMock.mockReturnValue({
    data: [make()],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  });
});

describe('SubmissionsPage — trạng thái tải', () => {
  it('hiện skeleton khi đang tải', () => {
    useSessionOverviewMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
      refetch: vi.fn(),
    });
    render(<SubmissionsPage />);
    expect(screen.getByLabelText('Đang tải danh sách phiên thi')).toBeInTheDocument();
  });

  it('hiện lỗi kèm nút thử lại', () => {
    const refetch = vi.fn();
    useSessionOverviewMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('boom'),
      refetch,
    });
    render(<SubmissionsPage />);
    screen.getByRole('button', { name: 'Thử lại' }).click();
    expect(refetch).toHaveBeenCalled();
  });

  it('hiện empty state khi giảng viên chưa có phiên nào', () => {
    useSessionOverviewMock.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<SubmissionsPage />);
    expect(screen.getByText('Chưa có phiên thi nào')).toBeInTheDocument();
  });
});

describe('SubmissionsPage — bố cục mới', () => {
  it('KHÔNG còn dải "Cần chú ý" là danh sách riêng', () => {
    useSessionOverviewMock.mockReturnValue({
      data: [make({ id: 's1', name: 'Giữa kỳ #2', neverAttendedCount: 2, fullySubmittedCount: 38 })],
      isLoading: false, error: null, refetch: vi.fn(),
    });
    render(<SubmissionsPage />);
    // Tên phiên xuất hiện đúng MỘT lần trên cả trang — đây là thứ chữa phàn
    // nàn "thấy cùng một phiên hai lần".
    expect(screen.getAllByText('Giữa kỳ #2')).toHaveLength(1);
    expect(screen.queryByRole('region', { name: 'Cần chú ý' })).not.toBeInTheDocument();
  });

  it('hiện dải cảnh báo phòng khi mọi phiên đỏ cùng một phòng, khác môn', () => {
    useSessionOverviewMock.mockReturnValue({
      data: [
        make({ id: 'a', courseId: 'c1', roomName: 'A3-01',
               attendedNoSubmissionCount: 2, fullySubmittedCount: 38 }),
        make({ id: 'b', courseId: 'c2', courseName: 'CTDL', classId: 'k2', className: 'N05',
               roomName: 'A3-01', attendedNoSubmissionCount: 3, fullySubmittedCount: 37 }),
      ],
      isLoading: false, error: null, refetch: vi.fn(),
    });
    render(<SubmissionsPage />);
    expect(screen.getByText(/đều ở phòng/)).toBeInTheDocument();
  });

  it('KHÔNG hiện dải cảnh báo khi chỉ một phiên đỏ', () => {
    useSessionOverviewMock.mockReturnValue({
      data: [make({ id: 'a', attendedNoSubmissionCount: 2, fullySubmittedCount: 38 })],
      isLoading: false, error: null, refetch: vi.fn(),
    });
    render(<SubmissionsPage />);
    expect(screen.queryByText(/đều ở phòng/)).not.toBeInTheDocument();
  });

  it('sĩ số nằm ở tiêu đề nhóm, và không dòng nào hiện tỉ lệ x/y', () => {
    render(<SubmissionsPage />);
    expect(screen.getByText(/40 sinh viên/)).toBeInTheDocument();
    expect(screen.queryByText(/đã nộp đủ/)).not.toBeInTheDocument();
  });
});

describe('SubmissionsPage — điều hướng', () => {
  it('mỗi phiên link tới trang chi tiết, không kèm ?student=', () => {
    render(<SubmissionsPage />);
    // Bảng không còn thu gọn nhóm: mọi dòng hiện sẵn, không phải bấm mở.
    const links = screen
      .getAllByRole('link')
      .map((el) => el.getAttribute('href'))
      .filter((href) => href?.startsWith('/teacher/submissions/'));
    expect(links).toContain('/teacher/submissions/session-1');
    expect(links.every((href) => !href!.includes('student='))).toBe(true);
  });
});

describe('SubmissionsPage — search theo MSSV', () => {
  it('không gọi endpoint search khi ô tìm còn rỗng', () => {
    render(<SubmissionsPage />);
    expect(useTeacherSubmissionsMock).toHaveBeenCalledWith(expect.anything(), false);
  });

  it('gõ từ khoá thì bật search và thu hẹp về những phiên có SV đó', async () => {
    useSessionOverviewMock.mockReturnValue({
      data: [
        make({ id: 's1', name: 'Giữa kỳ #2' }),
        make({ id: 's2', name: 'Cuối kỳ', courseName: 'CTDL', courseId: 'course-2' }),
      ],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    useTeacherSubmissionsMock.mockReturnValue({
      data: {
        items: [
          {
            id: 'sub-1',
            examSessionId: 's2',
            examSessionName: 'Cuối kỳ',
            requiredFilename: 'Cau1.docx',
            studentMssv: '21520123',
            studentNameInput: 'Nguyễn Văn A',
            status: 'collected',
            submittedAt: new Date().toISOString(),
            fileSize: '1024',
            downloadUrl: 'https://example.test/f',
          },
        ],
        total: 1,
      },
      isLoading: false,
      error: null,
    });

    render(<SubmissionsPage />);
    // useDebouncedValue là hook THẬT (300ms), không mock — dùng waitFor để
    // chờ nó nhả giá trị. `require()` không tồn tại trong vitest ESM: import
    // fireEvent/waitFor ở đầu file cùng render/screen.
    fireEvent.change(screen.getByLabelText('Tìm sinh viên theo MSSV hoặc tên'), {
      target: { value: '21520123' },
    });

    // Phải chờ một thứ CHỈ chế độ search mới vẽ. Bảng duyệt giờ hiện sẵn mọi
    // dòng (không còn nhóm thu gọn), nên chờ 'Cuối kỳ' sẽ khớp ngay ô trong
    // bảng duyệt — tức là qua waitFor vì lý do sai, trước cả khi debounce nhả.
    await waitFor(() => {
      expect(screen.getByText('Sinh viên 21520123 trong phiên này')).toBeInTheDocument();
    });
    expect(screen.getByText('Cuối kỳ')).toBeInTheDocument();
    expect(screen.queryByText('Giữa kỳ #2')).not.toBeInTheDocument();
    const link = screen
      .getAllByRole('link')
      .find((el) => el.getAttribute('href')?.startsWith('/teacher/submissions/s2'));
    expect(link?.getAttribute('href')).toBe('/teacher/submissions/s2?student=21520123');
  });

  it('empty state của search nói rõ SV chưa nộp gì sẽ không xuất hiện', async () => {
    useTeacherSubmissionsMock.mockReturnValue({
      data: { items: [], total: 0 },
      isLoading: false,
      error: null,
    });
    render(<SubmissionsPage />);
    fireEvent.change(screen.getByLabelText('Tìm sinh viên theo MSSV hoặc tên'), {
      target: { value: 'khongton' },
    });

    await waitFor(() => {
      expect(
        screen.getByText(/Sinh viên chưa nộp gì sẽ không xuất hiện ở đây/),
      ).toBeInTheDocument();
    });
  });
});
