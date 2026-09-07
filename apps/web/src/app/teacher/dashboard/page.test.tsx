import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { SessionOverviewItem } from '@/lib/api/submissions';

const useExamSessionsMock = vi.fn();
const useSessionOverviewMock = vi.fn();

vi.mock('@/hooks/useExamSession', () => ({
  useExamSessions: (...args: unknown[]) => useExamSessionsMock(...args),
}));

vi.mock('@/hooks/useSubmissionOverview', () => ({
  useSessionOverview: (...args: unknown[]) => useSessionOverviewMock(...args),
}));

vi.mock('@/hooks/useDepartment', () => ({
  useSemesters: () => ({
    data: [
      {
        id: 'sem-1',
        name: 'HK1 2026-2027',
        startDate: '2026-09-01',
        endDate: '2027-01-15',
        isCurrent: false,
      },
      {
        id: 'sem-2',
        name: 'HK2 2026-2027',
        startDate: '2027-02-01',
        endDate: '2027-06-30',
        isCurrent: true,
      },
    ],
    isLoading: false,
  }),
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

import TeacherDashboardPage from './page';

const HOUR = 3_600_000;

function item(overrides: Partial<SessionOverviewItem> = {}): SessionOverviewItem {
  const now = Date.now();
  return {
    id: 's1',
    name: 'Giữa kỳ',
    code: 'GK1',
    courseId: 'c1',
    courseName: 'CSDL',
    classId: 'k1',
    className: 'N01',
    roomName: 'A3-01',
    examType: 'GK',
    // Đã kết thúc từ lâu, ngoài grace — nếu không, getAttentionReasons im lặng.
    startTime: new Date(now - 6 * HOUR).toISOString(),
    endTime: new Date(now - 4 * HOUR).toISOString(),
    status: 'completed',
    rubricId: null,
    rubricVersion: null,
    requiredDeliverableCount: 2,
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
    semesterName: 'HK1 2026-2027',
    archivedAt: null,
    attentionClosedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  useExamSessionsMock.mockReturnValue({ data: { total: 3 }, isLoading: false, isError: false });
  useSessionOverviewMock.mockReturnValue({ data: [], isLoading: false });
});

describe('TeacherDashboardPage — nhắc tồn đọng kỳ trước', () => {
  /**
   * Đây là cái giá của cách A: đúng ngày chuyển cờ, bài chưa xử lý của kỳ cũ
   * rời khỏi tầm nhìn mặc định, và không có bước nào bắt người ta nhìn vào nó.
   */
  it('nhắc khi kỳ TRƯỚC còn phiên cần chú ý', async () => {
    useSessionOverviewMock.mockReturnValue({
      data: [
        item({ id: 'a', attendedNoSubmissionCount: 2, fullySubmittedCount: 38 }),
        item({ id: 'b', neverAttendedCount: 1, fullySubmittedCount: 39 }),
        item({ id: 'c', partialCount: 1, fullySubmittedCount: 39 }),
      ],
      isLoading: false,
    });

    render(<TeacherDashboardPage />);
    await waitFor(() =>
      expect(screen.getByText(/HK1 2026-2027 còn 3 phiên cần chú ý/)).toBeInTheDocument(),
    );
    expect(screen.getByRole('link', { name: /HK1 2026-2027/ })).toHaveAttribute(
      'href',
      '/teacher/submissions?semesterId=sem-1',
    );
  });

  it('im lặng khi kỳ trước đã sạch', async () => {
    useSessionOverviewMock.mockReturnValue({
      data: [item({ id: 'a' })],
      isLoading: false,
    });

    render(<TeacherDashboardPage />);
    await waitFor(() => expect(screen.getByText('Phiên thi đã tạo')).toBeInTheDocument());
    expect(screen.queryByText(/còn .* phiên cần chú ý/)).not.toBeInTheDocument();
  });

  // Phiên cần chú ý của CHÍNH kỳ hiện hành không phải "tồn đọng" — nó đang là
  // việc của tuần này, và trang Quản lý bài thu đã hiện nó ở chế độ mặc định.
  it('KHÔNG nhắc về phiên của chính kỳ hiện hành', async () => {
    useSessionOverviewMock.mockReturnValue({
      data: [
        item({
          id: 'a',
          semesterId: 'sem-2',
          semesterName: 'HK2 2026-2027',
          attendedNoSubmissionCount: 2,
          fullySubmittedCount: 38,
        }),
      ],
      isLoading: false,
    });

    render(<TeacherDashboardPage />);
    await waitFor(() => expect(screen.getByText('Phiên thi đã tạo')).toBeInTheDocument());
    expect(screen.queryByText(/còn .* phiên cần chú ý/)).not.toBeInTheDocument();
  });
});
