import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const h = vi.hoisted(() => ({
  push: vi.fn(),
  toastSuccess: vi.fn(),
  detail: { data: undefined as unknown, isLoading: false, isError: false, error: null as unknown },
  mutate: vi.fn(),
  update: { isPending: false, isError: false, error: null as unknown },
  classes: { data: [] as unknown, isLoading: false, isError: false },
  rooms: { data: [] as unknown, isLoading: false, isError: false, refetch: vi.fn() },
}));

vi.mock('next/navigation', () => ({ useParams: () => ({ id: 's1' }), useRouter: () => ({ push: h.push }) }));
vi.mock('sonner', () => ({ toast: { success: h.toastSuccess, error: vi.fn() } }));
vi.mock('@/hooks/useExamSession', () => ({
  useExamSessionDetail: () => h.detail,
  useUpdateExamSession: () => ({ ...h.update, mutate: h.mutate }),
}));
vi.mock('@/hooks/useTeaching', () => ({ useTeachingClasses: () => h.classes }));
vi.mock('@/hooks/useRooms', () => ({ useRooms: () => h.rooms }));

import { EDIT_STARTED_MESSAGE } from '@/lib/exam-session-actions';
import { toDatetimeLocal } from '@/lib/exam-session-form';
import EditExamSessionPage from './page';

const HOUR = 3_600_000;
const iso = (offsetHours: number) => new Date(Date.now() + offsetHours * HOUR).toISOString();

// uuid thật: schema sửa chỉ nhận `roomId` rỗng hoặc uuid (như server), nên id kiểu 'r1' sẽ bị chặn ở bước kiểm trước khi nộp.
const R1 = '22222222-2222-4222-8222-222222222221';
const R2 = '22222222-2222-4222-8222-222222222222';

function session(over: Record<string, unknown> = {}) {
  return {
    id: 's1', name: 'Giữa kỳ N01', code: 'ABC123', teacherId: 't1', classId: 'k1', classLabel: 'DHKTPM18A – Nhóm 1',
    courseName: 'CTDL&GT', roomName: 'Phòng máy A1', roomId: R1, examType: 'GK',
    startTime: iso(2), endTime: iso(4), status: 'active', completedAt: null, completedBy: null, testBundleId: null,
    requiredDeliverables: [
      { id: 'd1', requiredFilename: 'Cau1.docx', deliverableType: 'document', entries: [] },
      { id: 'd2', requiredFilename: 'BaiThi_{MSSV}.zip', deliverableType: 'document', entries: ['main.cpp'] },
    ],
    ...over,
  };
}
const ROOMS = [
  { id: R1, name: 'Phòng máy A1', capacity: null, isActive: true },
  { id: R2, name: 'Phòng máy B1', capacity: 40, isActive: true },
];
const KLASS = {
  id: 'k1', label: 'DHKTPM18A – Nhóm 1', labelWithSemester: 'DHKTPM18A – Nhóm 1 · HK1 2026-2027', courseName: 'CTDL&GT',
  semesterId: 's1', academicYear: 2026, term: 1, studentCount: 30,
};

const loaded = (over: Record<string, unknown> = {}) => {
  h.detail = { data: session(over), isLoading: false, isError: false, error: null };
};
const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
const changeName = (value: string) => fireEvent.change(screen.getByLabelText('Tên phiên thi'), { target: { value } });

beforeEach(() => {
  h.push.mockReset();
  h.toastSuccess.mockReset();
  h.mutate.mockReset();
  h.update = { isPending: false, isError: false, error: null };
  h.classes = { data: [KLASS], isLoading: false, isError: false };
  h.rooms = { data: ROOMS, isLoading: false, isError: false, refetch: vi.fn() };
  loaded();
});

describe('EditExamSessionPage — form', () => {
  it('nạp đúng giá trị hiện có của phiên (giờ theo giờ máy)', () => {
    render(<EditExamSessionPage />);
    const current = session();
    expect(screen.getByLabelText('Tên phiên thi')).toHaveValue('Giữa kỳ N01');
    expect(screen.getByLabelText('Thời gian bắt đầu')).toHaveValue(toDatetimeLocal(current.startTime));
    expect(screen.getByLabelText('Thời gian kết thúc')).toHaveValue(toDatetimeLocal(current.endTime));
    fireEvent.click(screen.getByRole('combobox', { name: 'Phòng thi' }));
    expect(screen.getByRole('option', { name: 'Phòng máy A1' })).toHaveAttribute('data-state', 'checked');
  });

  it('lớp và file bắt buộc bị KHOÁ: chỉ đọc, không có ô chọn lớp hay ô nhập file', () => {
    render(<EditExamSessionPage />);
    expect(screen.getByLabelText('Lớp thi')).toHaveAttribute('readonly');
    expect(screen.getByLabelText('Lớp thi')).toHaveValue('DHKTPM18A – Nhóm 1 · HK1 2026-2027');
    expect(screen.queryByRole('combobox', { name: 'Lớp thi' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Học kỳ')).toHaveValue('HK1 2026-2027');
    expect(screen.getByText('Cau1.docx')).toBeInTheDocument();
    expect(screen.getByText(/BaiThi_\{MSSV\}\.zip/)).toBeInTheDocument();
    expect(screen.getByText(/main\.cpp/)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/bai_lam\.docx/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Sai lớp thì huỷ phiên và tạo lại/)).toBeInTheDocument();
  });

  it('Review Focus 2: chỉ đổi tên → thân chỉ có name (giờ lẻ giây của phiên không bị coi là đã đổi)', async () => {
    render(<EditExamSessionPage />);
    changeName('Giữa kỳ N02');
    submit();
    await waitFor(() => expect(h.mutate).toHaveBeenCalledTimes(1));
    expect(h.mutate.mock.calls[0][0]).toEqual({ id: 's1', body: { name: 'Giữa kỳ N02' } });
  });

  it('đổi phòng sang phòng khác → thân có roomId', async () => {
    render(<EditExamSessionPage />);
    fireEvent.click(screen.getByRole('combobox', { name: 'Phòng thi' }));
    fireEvent.click(screen.getByRole('option', { name: 'Phòng máy B1 (40 chỗ)' }));
    submit();
    await waitFor(() => expect(h.mutate).toHaveBeenCalledTimes(1));
    expect(h.mutate.mock.calls[0][0]).toEqual({ id: 's1', body: { roomId: R2 } });
  });

  it('không đổi gì → KHÔNG gọi API, và nói rõ', async () => {
    render(<EditExamSessionPage />);
    submit();
    expect(await screen.findByText('Không có thay đổi nào.')).toBeInTheDocument();
    expect(h.mutate).not.toHaveBeenCalled();
  });

  it('giờ kết thúc không sau giờ bắt đầu → báo ở ô, không gọi API', async () => {
    render(<EditExamSessionPage />);
    fireEvent.change(screen.getByLabelText('Thời gian kết thúc'), { target: { value: toDatetimeLocal(session().startTime) } });
    submit();
    expect(await screen.findByText('Thời gian kết thúc phải sau thời gian bắt đầu')).toBeInTheDocument();
    expect(h.mutate).not.toHaveBeenCalled();
  });

  it('Review Focus 3: phòng hiện tại đã ngừng hoạt động — vẫn là một lựa chọn, gắn rõ và đang được chọn', () => {
    h.rooms = { data: [ROOMS[1]], isLoading: false, isError: false, refetch: vi.fn() }; // R1 không còn trong danh sách đang hoạt động
    render(<EditExamSessionPage />);
    fireEvent.click(screen.getByRole('combobox', { name: 'Phòng thi' }));
    expect(screen.getByRole('option', { name: 'Phòng máy A1 (đã ngừng hoạt động)' })).toHaveAttribute('data-state', 'checked');
  });

  // Hai ca riêng: một menu Select đang mở làm phần còn lại của trang không truy cập được (Radix ẩn các phần tử khác).
  it('Review Focus 3: phòng đã ngừng hoạt động — sửa tên KHÔNG gửi roomId (không bị đổi sang phòng khác)', async () => {
    h.rooms = { data: [ROOMS[1]], isLoading: false, isError: false, refetch: vi.fn() };
    render(<EditExamSessionPage />);
    changeName('Giữa kỳ N02');
    submit();
    await waitFor(() => expect(h.mutate).toHaveBeenCalledTimes(1));
    expect(h.mutate.mock.calls[0][0]).toEqual({ id: 's1', body: { name: 'Giữa kỳ N02' } });
  });

  it('Review Focus 4: phiên cũ chưa có phòng — có ghi chú, sửa tên vẫn lưu được, thân không có roomId', async () => {
    loaded({ roomId: null });
    render(<EditExamSessionPage />);
    expect(screen.getByText(/chưa gắn phòng trong danh sách/)).toBeInTheDocument();
    changeName('Giữa kỳ N02');
    submit();
    await waitFor(() => expect(h.mutate).toHaveBeenCalledTimes(1));
    expect(h.mutate.mock.calls[0][0]).toEqual({ id: 's1', body: { name: 'Giữa kỳ N02' } });
  });

  it('lỗi của server (cửa sổ đã đóng, va chạm phòng) hiện nguyên văn, form giữ nguyên', () => {
    h.update = { isPending: false, isError: true, error: { message: 'Phòng Phòng máy B1 đã có phiên thi "Ca sáng" lúc 08:00–10:00.' } };
    render(<EditExamSessionPage />);
    expect(screen.getByText('Phòng Phòng máy B1 đã có phiên thi "Ca sáng" lúc 08:00–10:00.')).toBeInTheDocument();
    expect(screen.getByLabelText('Tên phiên thi')).toHaveValue('Giữa kỳ N01');
  });

  it('lưu xong → thông báo và về danh sách', async () => {
    h.mutate.mockImplementation((_vars: unknown, options?: { onSuccess?: () => void }) => options?.onSuccess?.());
    render(<EditExamSessionPage />);
    changeName('Giữa kỳ N02');
    submit();
    await waitFor(() => expect(h.push).toHaveBeenCalledWith('/teacher/exam-sessions'));
    expect(h.toastSuccess).toHaveBeenCalledWith('Đã lưu thay đổi.');
  });
});

describe('EditExamSessionPage — không dựng form khi không sửa được', () => {
  it('Review Focus 7: phiên đã bắt đầu → nêu lý do (câu của server), không có form', () => {
    loaded({ startTime: iso(-1), endTime: iso(1) });
    render(<EditExamSessionPage />);
    expect(screen.getByText(EDIT_STARTED_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Lưu thay đổi' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Tên phiên thi')).not.toBeInTheDocument();
  });

  it('Review Focus 7: phiên đã huỷ → lý do theo trạng thái', () => {
    loaded({ status: 'cancelled' });
    render(<EditExamSessionPage />);
    expect(screen.getByText('Phiên đã huỷ, không sửa được.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Lưu thay đổi' })).not.toBeInTheDocument();
  });

  it('Review Focus 7: không tải được (404 / của người khác) → thông báo, không form', () => {
    h.detail = { data: undefined, isLoading: false, isError: true, error: { statusCode: 403, message: 'Forbidden' } };
    render(<EditExamSessionPage />);
    expect(screen.getByRole('alert')).toHaveTextContent('Không tải được phiên thi');
    expect(screen.queryByLabelText('Tên phiên thi')).not.toBeInTheDocument();
  });

  it('Ruling: một lần tải lại thất bại khi ĐÃ có dữ liệu thì giữ nguyên form — không vứt phần giảng viên đang gõ dở', () => {
    // TanStack tải lại khi quay về tab; lỗi mạng chập chờn lúc đó để lại `isError` cùng dữ liệu cũ. Chỉ khi CHƯA có dữ liệu (404/403 ở lần tải đầu) mới chặn.
    h.detail = { data: session(), isLoading: false, isError: true, error: { message: 'Network request failed' } };
    render(<EditExamSessionPage />);
    expect(screen.getByLabelText('Tên phiên thi')).toHaveValue('Giữa kỳ N01');
    expect(screen.queryByText(/Không tải được phiên thi/)).not.toBeInTheDocument();
  });

  it('đang tải → khung chờ, không form', () => {
    h.detail = { data: undefined, isLoading: true, isError: false, error: null };
    render(<EditExamSessionPage />);
    expect(screen.queryByLabelText('Tên phiên thi')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
