import { describe, expect, it, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { SessionOverviewItem } from '@/lib/api/submissions';

const useSessionOverviewMock = vi.fn();

const archiveMutate = vi.fn();
const closeMutate = vi.fn();

// useSemesterFilter gọi useSemesters() — một TanStack query THẬT, và các test
// này render không có QueryClientProvider. Mock ở tầng hook, cùng khuôn với
// các mock sẵn có trong file, thay vì dựng provider chỉ để bộ lọc có dữ liệu.
vi.mock('@/hooks/useDepartment', () => ({
  useSemesters: () => ({
    data: [
      {
        id: 'sem-1',
        name: 'Học kỳ 1 2026-2027',
        startDate: '2026-09-01',
        endDate: '2027-01-15',
        isCurrent: true,
      },
      {
        id: 'sem-2',
        name: 'Học kỳ 2 2026-2027',
        startDate: '2027-02-01',
        endDate: '2027-06-30',
        isCurrent: false,
      },
    ],
    isLoading: false,
  }),
}));

vi.mock('@/hooks/useSubmissionOverview', () => ({
  useSessionOverview: (...args: unknown[]) => useSessionOverviewMock(...args),
  useArchiveSession: () => ({ mutate: archiveMutate }),
  useCloseAttention: () => ({ mutate: closeMutate }),
}));

// Trang đọc ?semesterId= từ URL (mắt nối cho lời nhắc ở dashboard), nên
// useSearchParams phải trả một đối tượng thật — không mock thì nó là null và
// mọi test đổ ở '.get'.
const searchParamsMock = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useSearchParams: () => searchParamsMock,
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
    rubricId: null,
    rubricVersion: null,
    requiredDeliverableCount: 3,
    expectedCount: 40,
    rosterKnown: true,
    fullySubmittedCount: 40,
    partialCount: 0,
    attendedNoSubmissionCount: 0,
    neverAttendedCount: 0,
    satElsewhereCount: 0,
    matchedStudents: null,
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

/**
 * Search chạy trên CHÍNH endpoint roll-up, chỉ thêm `student`. Bản trước gọi
 * GET /submissions — endpoint đọc bảng submission — nên sinh viên chưa nộp gì
 * là vô hình, đúng nhóm mà giảng viên đi tra. Server giờ tìm trên roster ∪
 * người đã nộp, và trang chỉ vẽ lại thứ nó trả về.
 */
describe('SubmissionsPage — search theo sinh viên', () => {
  it('không bật lượt tìm nào khi ô tìm còn rỗng', () => {
    render(<SubmissionsPage />);
    expect(useSessionOverviewMock).toHaveBeenCalledWith(undefined, false);
  });

  it('gõ từ khoá thì thu hẹp về những phiên có sinh viên đó', async () => {
    useSessionOverviewMock.mockImplementation((student?: string) =>
      student
        ? {
            data: [
              make({
                id: 's2',
                name: 'Cuối kỳ',
                courseName: 'CTDL',
                courseId: 'course-2',
                matchedStudents: [{ mssv: '21520123', name: 'Nguyễn Văn A' }],
              }),
            ],
            isLoading: false,
            error: null,
            refetch: vi.fn(),
          }
        : {
            data: [
              make({ id: 's1', name: 'Giữa kỳ #2' }),
              make({ id: 's2', name: 'Cuối kỳ', courseName: 'CTDL', courseId: 'course-2' }),
            ],
            isLoading: false,
            error: null,
            refetch: vi.fn(),
          },
    );

    render(<SubmissionsPage />);
    // useDebouncedValue là hook THẬT (300ms), không mock — waitFor chờ nó nhả.
    fireEvent.change(screen.getByLabelText('Tìm sinh viên theo MSSV hoặc tên'), {
      target: { value: '21520123' },
    });

    // Chờ một thứ CHỈ chế độ search mới vẽ: bảng duyệt cũng có chữ 'Cuối kỳ',
    // nên chờ nó sẽ qua waitFor vì lý do sai, trước cả khi debounce nhả.
    await waitFor(() => {
      expect(screen.getByText(/21520123 — Nguyễn Văn A/)).toBeInTheDocument();
    });
    expect(screen.queryByText('Giữa kỳ #2')).not.toBeInTheDocument();
    const link = screen
      .getAllByRole('link')
      .find((el) => el.getAttribute('href')?.startsWith('/teacher/submissions/s2'));
    expect(link?.getAttribute('href')).toBe('/teacher/submissions/s2?student=21520123');
  });

  // Gõ nhầm một chữ số MSSV mà vẫn ra kết quả là cách tra nhầm người mà không
  // ai phát hiện. Dòng kết quả phải nói ra nó tìm thấy AI.
  it('nêu tên sinh viên khớp, và nói rõ khi khớp nhiều người', async () => {
    useSessionOverviewMock.mockImplementation((student?: string) =>
      student
        ? {
            data: [
              make({
                id: 's3',
                name: 'Thực hành',
                matchedStudents: [
                  { mssv: '21520123', name: 'Nguyễn Văn A' },
                  { mssv: '21520124', name: 'Nguyễn Văn B' },
                ],
              }),
            ],
            isLoading: false,
            error: null,
            refetch: vi.fn(),
          }
        : { data: [], isLoading: false, error: null, refetch: vi.fn() },
    );

    render(<SubmissionsPage />);
    fireEvent.change(screen.getByLabelText('Tìm sinh viên theo MSSV hoặc tên'), {
      target: { value: 'Nguyễn Văn' },
    });

    await waitFor(() => {
      expect(
        screen.getByText(/21520123 — Nguyễn Văn A và 1 sinh viên khác/),
      ).toBeInTheDocument();
    });
  });

  it('empty state không còn thú nhận điểm mù đã được vá', async () => {
    useSessionOverviewMock.mockImplementation((student?: string) =>
      student
        ? { data: [], isLoading: false, error: null, refetch: vi.fn() }
        : { data: [make({ id: 's1' })], isLoading: false, error: null, refetch: vi.fn() },
    );

    render(<SubmissionsPage />);
    fireEvent.change(screen.getByLabelText('Tìm sinh viên theo MSSV hoặc tên'), {
      target: { value: 'khongton' },
    });

    await waitFor(() => {
      expect(screen.getByText(/Không có phiên nào của bạn chứa sinh viên này/)).toBeInTheDocument();
    });
    // Câu cũ khiến giảng viên tự nghi ngờ một kết quả đã đúng.
    expect(
      screen.queryByText(/Sinh viên chưa nộp gì sẽ không xuất hiện ở đây/),
    ).not.toBeInTheDocument();
  });
});
