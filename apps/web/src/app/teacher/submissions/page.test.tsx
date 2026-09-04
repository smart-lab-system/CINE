import { describe, expect, it, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
// fireEvent/waitFor dùng ở Task 5 (search) — import sẵn để Task 5 chỉ thêm
// describe block, không phải sửa dòng import.
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { SessionOverviewItem } from '@/lib/api/submissions';

const useSessionOverviewMock = vi.fn();
const useTeacherSubmissionsMock = vi.fn();

vi.mock('@/hooks/useSubmissionOverview', () => ({
  useSessionOverview: () => useSessionOverviewMock(),
  useTeacherSubmissions: (...args: unknown[]) => useTeacherSubmissionsMock(...args),
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
    notSubmittedCount: 0,
    invalidFileCount: 0,
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

describe('SubmissionsPage — dải cần chú ý', () => {
  it('không render dải khi mọi phiên đều ổn', () => {
    render(<SubmissionsPage />);
    expect(screen.queryByRole('region', { name: 'Cần chú ý' })).not.toBeInTheDocument();
  });

  it('phiên cần chú ý xuất hiện ở CẢ dải ghim VÀ nhóm Môn/Lớp của nó', () => {
    useSessionOverviewMock.mockReturnValue({
      data: [make({ id: 's1', name: 'Giữa kỳ #2', invalidFileCount: 2, fullySubmittedCount: 38 })],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<SubmissionsPage />);

    const strip = screen.getByRole('region', { name: 'Cần chú ý' });
    expect(within(strip).getByText('Giữa kỳ #2')).toBeInTheDocument();

    // Spec §4.4: KHÔNG được lọc nó khỏi nhóm gốc — nhóm phải đầy đủ.
    const group = screen.getByRole('region', { name: /Nhập môn CSDL/ });
    expect(within(group).getByText('Giữa kỳ #2')).toBeInTheDocument();
    expect(within(group).getByText(/1 cần chú ý/)).toBeInTheDocument();
  });

  it('sắp lý do theo ưu tiên và hiện đủ mọi lý do', () => {
    useSessionOverviewMock.mockReturnValue({
      data: [
        make({
          id: 's1',
          invalidFileCount: 2,
          partialCount: 3,
          notSubmittedCount: 5,
          fullySubmittedCount: 32,
        }),
      ],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<SubmissionsPage />);

    const strip = screen.getByRole('region', { name: 'Cần chú ý' });
    expect(within(strip).getByText('2 file không hợp lệ')).toBeInTheDocument();
    expect(within(strip).getByText('3 sinh viên nộp thiếu file')).toBeInTheDocument();
    expect(within(strip).getByText('5 sinh viên chưa nộp')).toBeInTheDocument();
  });

  it('phiên trong grace period không lên dải', () => {
    useSessionOverviewMock.mockReturnValue({
      data: [
        make({
          endTime: new Date(Date.now() - 60_000).toISOString(),
          notSubmittedCount: 5,
          fullySubmittedCount: 35,
        }),
      ],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<SubmissionsPage />);

    expect(screen.queryByRole('region', { name: 'Cần chú ý' })).not.toBeInTheDocument();
    // Spec §4.4: nhóm không có phiên cần chú ý mặc định thu gọn — phiên này
    // không cần chú ý (còn trong grace), nên phải mở nhóm ra mới thấy badge.
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('Đang thu bài')).toBeInTheDocument();
  });
});

describe('SubmissionsPage — tỉ lệ', () => {
  it('hiện X/Y khi biết roster và có file bắt buộc', () => {
    useSessionOverviewMock.mockReturnValue({
      data: [make({ fullySubmittedCount: 38, notSubmittedCount: 2 })],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<SubmissionsPage />);
    // notSubmittedCount: 2 (> 0) cũng là một lý do cần chú ý (§4.1), nên
    // phiên này hợp lệ nằm ở CẢ dải ghim VÀ nhóm (§4.4, khoá ở describe
    // "dải cần chú ý") — soi đúng nhóm để không đụng bản sao trên dải ghim.
    const group = screen.getByRole('region', { name: /Nhập môn CSDL/ });
    expect(within(group).getByText('38/40 đã nộp đủ')).toBeInTheDocument();
  });

  it('phiên không gắn lớp: không hiện mẫu số', () => {
    useSessionOverviewMock.mockReturnValue({
      data: [
        make({
          classId: null,
          className: null,
          rosterKnown: false,
          expectedCount: 5,
          fullySubmittedCount: 5,
          notSubmittedCount: 0,
        }),
      ],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<SubmissionsPage />);
    // Spec §4.4: nhóm không có phiên cần chú ý mặc định thu gọn.
    fireEvent.click(screen.getByRole('button'));

    expect(screen.getByText('đã thu bài của 5 sinh viên')).toBeInTheDocument();
    expect(screen.getByText('phiên không gắn lớp')).toBeInTheDocument();
    expect(screen.queryByText(/\/5 đã nộp đủ/)).not.toBeInTheDocument();
  });

  it('chưa khai file bắt buộc: không hiện tỉ lệ', () => {
    useSessionOverviewMock.mockReturnValue({
      data: [make({ requiredDeliverableCount: 0, fullySubmittedCount: 0 })],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<SubmissionsPage />);
    // Spec §4.4: nhóm không có phiên cần chú ý mặc định thu gọn.
    fireEvent.click(screen.getByRole('button'));

    expect(screen.getByText('phiên chưa khai file bắt buộc')).toBeInTheDocument();
    expect(screen.queryByText(/đã nộp đủ/)).not.toBeInTheDocument();
    // Không có gì trung thực để đếm ở đây (expectedCount là sĩ số lớp, không
    // phải số đã nộp) — khoá lại để con số sai không lặng lẽ quay lại. Soi
    // trong nhóm (không phải toàn `screen`): mô tả tĩnh của PageHeader cũng
    // chứa cụm "đã thu" ("...đã thu đủ bài, phiên nào còn thiếu...") nên một
    // query không giới hạn sẽ khớp nhầm câu đó.
    const group = screen.getByRole('region', { name: /Nhập môn CSDL/ });
    expect(within(group).queryByText(/đã thu/)).not.toBeInTheDocument();
  });
});

describe('SubmissionsPage — điều hướng', () => {
  it('mỗi phiên link tới trang chi tiết, không kèm ?student=', () => {
    render(<SubmissionsPage />);
    // Spec §4.4: nhóm không có phiên cần chú ý mặc định thu gọn — phiên
    // mặc định của `make()` không cần chú ý, nên phải mở nhóm ra mới có link.
    fireEvent.click(screen.getByRole('button'));
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

    await waitFor(() => {
      expect(screen.getByText('Cuối kỳ')).toBeInTheDocument();
    });
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
