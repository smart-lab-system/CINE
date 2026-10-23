import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { toast } from 'sonner';
import ExamSessionSetupPage from './page';
import { writeSetupDraft } from './_components/setup-draft';

const { nav } = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  const nav = {
    query: '',
    subscribe(cb: () => void) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    get() {
      return nav.query;
    },
    set(query: string) {
      nav.query = query;
      listeners.forEach((cb) => cb());
    },
  };
  return { nav };
});

vi.mock('next/navigation', async () => {
  const React = await import('react');
  return {
    useParams: () => ({ id: 'session-1' }),
    useRouter: () => ({
      replace: (url: string) => {
        const q = url.includes('?') ? url.slice(url.indexOf('?') + 1) : '';
        nav.set(q);
      },
      push: () => undefined,
    }),
    usePathname: () => '/teacher/exam-sessions/session-1',
    useSearchParams: () => {
      const query = React.useSyncExternalStore(nav.subscribe, nav.get, nav.get);
      return new URLSearchParams(query);
    },
  };
});

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

const useExamSessionDetailMock = vi.fn();
const saveInfo = vi.fn();
const saveFolder = vi.fn();
const openMutate = vi.fn();

vi.mock('@/hooks/useExamSession', () => ({
  useExamSessionDetail: (...args: unknown[]) => useExamSessionDetailMock(...args),
  useExamMaterials: () => ({ data: [], isLoading: false }),
  useUploadExamMaterial: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteExamMaterial: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateExamSessionSchedule: () => ({ mutateAsync: saveInfo, isPending: false }),
  useReplaceRequiredDeliverables: () => ({ mutateAsync: saveFolder, isPending: false }),
  useOpenSession: () => ({ mutate: openMutate, isPending: false }),
  useCancelExamSession: () => ({ mutate: vi.fn(), isPending: false }),
  useSessionRoster: () => ({
    data: { customized: false, students: [{ mssv: 'SV001', name: 'An', source: 'class' }] },
    isLoading: false,
    isError: false,
  }),
}));

vi.mock('@/hooks/useGrading', () => ({
  useRubrics: () => ({ data: [], isLoading: false }),
  useSetSessionRubric: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('@/hooks/useMasterData', () => ({
  useRooms: () => ({
    data: { items: [{ id: 'room-1', name: 'A1', code: 'A1', building: null, floor: null }] },
    isLoading: false,
  }),
}));

vi.mock('@/hooks/useTeaching', () => ({
  useTeachingClasses: () => ({
    data: [
      {
        id: 'class-1',
        name: 'CTDL001',
        nominalClassName: 'D21CQCN01 — Công nghệ thông tin',
        studentCount: 12,
      },
    ],
  }),
}));

function session(overrides: Record<string, unknown> = {}) {
  const start = new Date(Date.now() + 3_600_000);
  const end = new Date(Date.now() + 7_200_000);
  return {
    id: 'session-1',
    name: 'Giữa kỳ Cấu trúc dữ liệu',
    code: 'ABC123',
    teacherId: 't1',
    classId: 'class-1',
    roomId: 'room-1',
    semesterId: 'sem-1',
    courseName: 'Cấu trúc dữ liệu',
    roomName: 'A1',
    semesterName: 'Học kỳ 1',
    examType: 'TK',
    startTime: start.toISOString(),
    endTime: end.toISOString(),
    status: 'scheduled',
    completedAt: null,
    completedBy: null,
    rubricId: null,
    testBundleId: null,
    requiredDeliverables: [
      {
        id: 'd1',
        requiredFilename: 'Bai.docx',
        deliverableType: 'document',
        language: null,
        pipeline: 'one_shot',
        entries: [],
      },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  nav.set('');
  sessionStorage.clear();
  saveInfo.mockReset();
  saveFolder.mockReset();
  openMutate.mockReset();
  vi.mocked(toast.error).mockReset();
  vi.mocked(toast.success).mockReset();
  useExamSessionDetailMock.mockReset();
  useExamSessionDetailMock.mockReturnValue({
    data: session(),
    isLoading: false,
    isError: false,
    error: null,
  });
});

describe('ExamSessionSetupPage', () => {
  it('đổi bước khi giờ chưa hợp lệ và vẫn hiện tên phiên', () => {
    render(<ExamSessionSetupPage />);

    fireEvent.change(screen.getByLabelText('Kết thúc'), { target: { value: '2000-01-01T00:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Rubric' }));

    expect(screen.getByRole('dialog', { name: 'Xác nhận thiết lập?' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Rubric' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Chưa thiết lập' }));

    expect(screen.getByRole('heading', { name: 'Rubric' })).toBeInTheDocument();
    expect(screen.getByText('Giữa kỳ Cấu trúc dữ liệu')).toBeInTheDocument();
    expect(toast.error).not.toHaveBeenCalled();
    expect(saveInfo).not.toHaveBeenCalled();
  });

  it('phiên đang thi không có nút ghi và khoá loại thi, thời gian, phòng', () => {
    useExamSessionDetailMock.mockReturnValue({
      data: session({ status: 'active' }),
      isLoading: false,
      isError: false,
      error: null,
    });

    render(<ExamSessionSetupPage />);

    expect(screen.queryByRole('button', { name: 'Lưu nháp' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Hoàn tất' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Loại thi')).toBeDisabled();
    expect(screen.getByLabelText('Bắt đầu')).toBeDisabled();
    expect(screen.getByLabelText('Kết thúc')).toBeDisabled();
    const room = screen.getAllByRole('combobox').find((el) => el.tagName === 'BUTTON');
    expect(room).toBeDisabled();
    expect(screen.getByText('Cấu trúc dữ liệu')).toBeInTheDocument();
    expect(screen.getByText('CTDL001 - D21CQCN01')).toBeInTheDocument();
    expect(screen.getByText('Học kỳ 1')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận' }));
    expect(screen.getByText('Đã khoá — phiên đã mở hoặc đã kết thúc.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Hoàn tất' })).not.toBeInTheDocument();
  });

  it('Hoàn tất thiếu file nộp không mở phiên và không ghi thư mục', () => {
    useExamSessionDetailMock.mockReturnValue({
      data: session({ requiredDeliverables: [] }),
      isLoading: false,
      isError: false,
      error: null,
    });

    render(<ExamSessionSetupPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận' }));
    fireEvent.click(screen.getByRole('button', { name: 'Hoàn tất' }));

    expect(screen.getByRole('heading', { name: 'Đề & thư mục' })).toBeInTheDocument();
    expect(
      screen.getByText('Hãy cấu hình thư mục bài thi (ít nhất 1 file nộp) trước khi mở phiên.'),
    ).toBeInTheDocument();
    expect(openMutate).not.toHaveBeenCalled();
    expect(saveFolder).not.toHaveBeenCalled();
  });

  it('Hoàn tất khi chỉ thiếu rubric vẫn không tự mở phiên', async () => {
    render(<ExamSessionSetupPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận' }));
    fireEvent.click(screen.getByRole('button', { name: 'Hoàn tất' }));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Đã lưu thiết lập.'));
    expect(openMutate).not.toHaveBeenCalled();
    expect(saveFolder).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Xác nhận' })).toBeInTheDocument();
  });

  it('đọc lại loại thi đã lưu trong sessionStorage', async () => {
    writeSetupDraft({
      sessionId: 'session-1',
      updatedAt: new Date().toISOString(),
      info: {
        examType: 'GK',
        roomId: 'room-1',
        startLocal: '2099-01-01T08:00',
        endLocal: '2099-01-01T10:00',
      },
    });

    render(<ExamSessionSetupPage />);

    await waitFor(() => expect(screen.getByLabelText('Loại thi')).toHaveValue('GK'));
  });
});
