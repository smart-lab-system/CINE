import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const h = vi.hoisted(() => ({
  mutate: vi.fn(),
  create: { isPending: false, isError: false, error: null as unknown, reset: vi.fn() },
  classes: { data: [] as unknown, isLoading: false, isError: false, refetch: vi.fn() },
  rooms: { data: [] as unknown, isLoading: false, isError: false, refetch: vi.fn() },
  roomsArgs: [] as unknown[],
  rubrics: { data: [] as unknown, isLoading: false },
}));

vi.mock('@/hooks/useExamSession', () => ({ useCreateExamSession: () => ({ ...h.create, mutate: h.mutate }) }));
vi.mock('@/hooks/useTeaching', () => ({ useTeachingClasses: () => h.classes }));
vi.mock('@/hooks/useRooms', () => ({
  useRooms: (options: unknown) => {
    h.roomsArgs.push(options);
    return h.rooms;
  },
}));
vi.mock('@/hooks/useGrading', () => ({ useRubrics: () => h.rubrics }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { toDatetimeLocal } from '@/lib/exam-session-form';
import NewExamSessionPage from './page';

// uuid thật: schema đòi `classId`/`roomId` là uuid (như server), nên id kiểu 'k1'/'r1' sẽ bị chặn ở bước kiểm trước khi nộp.
const K1 = '11111111-1111-4111-8111-111111111111';
const K2 = '11111111-1111-4111-8111-111111111112';
const R1 = '22222222-2222-4222-8222-222222222221';
const R2 = '22222222-2222-4222-8222-222222222222';

const CLASSES = [
  {
    id: K1, label: 'DHKTPM18A – Nhóm 1', labelWithSemester: 'DHKTPM18A – Nhóm 1 · HK1 2026-2027', courseName: 'CTDL&GT',
    semesterId: 's1', academicYear: 2026, term: 1, studentCount: 30,
  },
  { id: K2, label: 'DHKTPM17B', labelWithSemester: 'DHKTPM17B', courseName: 'CTDL&GT', semesterId: null, academicYear: null, term: null, studentCount: 0 },
];
const ROOMS = [
  { id: R1, name: 'Phòng máy A1', capacity: null, isActive: true },
  { id: R2, name: 'Phòng máy B1', capacity: 40, isActive: true },
];

const choose = (name: string, option: string) => {
  fireEvent.click(screen.getByRole('combobox', { name }));
  fireEvent.click(screen.getByRole('option', { name: option }));
};
const inOneDay = (extraHours = 0) => toDatetimeLocal(new Date(Date.now() + (24 + extraHours) * 3_600_000).toISOString());

beforeEach(() => {
  h.mutate.mockReset();
  h.create = { isPending: false, isError: false, error: null, reset: vi.fn() };
  h.classes = { data: CLASSES, isLoading: false, isError: false, refetch: vi.fn() };
  h.rooms = { data: ROOMS, isLoading: false, isError: false, refetch: vi.fn() };
  h.roomsArgs.length = 0;
  h.rubrics = { data: [], isLoading: false };
});

describe('NewExamSessionPage', () => {
  it('Review Focus 1: phòng là ô CHỌN từ phòng đang hoạt động, học kỳ chỉ đọc — không còn ô gõ chữ cho hai thứ đó', () => {
    render(<NewExamSessionPage />);
    expect(h.roomsArgs.at(-1)).toEqual({ activeOnly: true });
    expect(screen.getByRole('combobox', { name: 'Phòng thi' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Phòng thi' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Học kỳ')).toHaveAttribute('readonly');
  });

  it('lớp hiện bằng nhãn gộp có học kỳ, kèm số sinh viên', () => {
    render(<NewExamSessionPage />);
    fireEvent.click(screen.getByRole('combobox', { name: 'Lớp thi' }));
    expect(screen.getByRole('option', { name: 'DHKTPM18A – Nhóm 1 · HK1 2026-2027 (30 SV)' })).toBeInTheDocument();
  });

  it('chọn lớp thì học kỳ (chỉ đọc) theo lớp; lớp chưa có học kỳ hiện "Chưa gán học kỳ"', () => {
    render(<NewExamSessionPage />);
    expect(screen.getByLabelText('Học kỳ')).toHaveValue('Chọn lớp để xem học kỳ');
    choose('Lớp thi', 'DHKTPM18A – Nhóm 1 · HK1 2026-2027 (30 SV)');
    expect(screen.getByLabelText('Học kỳ')).toHaveValue('HK1 2026-2027');
    choose('Lớp thi', 'DHKTPM17B (0 SV)');
    expect(screen.getByLabelText('Học kỳ')).toHaveValue('Chưa gán học kỳ');
  });

  it('chưa được giao lớp nào: chữ nguyên văn spec §5.2, KHÔNG mời tạo lớp', () => {
    h.classes = { data: [], isLoading: false, isError: false, refetch: vi.fn() };
    render(<NewExamSessionPage />);
    expect(screen.getByText('Bạn chưa có lớp nào được giao nên chưa tạo được phiên thi.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Tạo lớp/ })).not.toBeInTheDocument();
  });

  it('lớp chưa có danh sách sinh viên → cảnh báo (vẫn tạo được), gọi lớp bằng nhãn', () => {
    render(<NewExamSessionPage />);
    choose('Lớp thi', 'DHKTPM17B (0 SV)');
    expect(screen.getByText(/Lớp DHKTPM17B chưa có danh sách sinh viên/)).toBeInTheDocument();
  });

  it('Review Focus 1: thân gửi lên có roomId và KHÔNG có roomName/semesterName; giờ là ISO', async () => {
    render(<NewExamSessionPage />);
    fireEvent.change(screen.getByLabelText('Tên phiên thi'), { target: { value: 'Giữa kỳ N01' } });
    choose('Lớp thi', 'DHKTPM18A – Nhóm 1 · HK1 2026-2027 (30 SV)');
    choose('Phòng thi', 'Phòng máy A1');
    choose('Loại kỳ thi', 'Giữa kỳ');
    fireEvent.change(screen.getByLabelText('Thời gian bắt đầu'), { target: { value: inOneDay() } });
    fireEvent.change(screen.getByLabelText('Thời gian kết thúc'), { target: { value: inOneDay(2) } });
    fireEvent.change(screen.getByPlaceholderText(/bai_lam\.docx/i), { target: { value: 'Cau1.docx' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo phiên thi' }));

    await waitFor(() => expect(h.mutate).toHaveBeenCalledTimes(1));
    const body = h.mutate.mock.calls[0][0];
    expect(body).toMatchObject({ name: 'Giữa kỳ N01', classId: K1, roomId: R1, examType: 'GK', requiredFilenames: [{ filename: 'Cau1.docx' }] });
    expect(body).not.toHaveProperty('roomName');
    expect(body).not.toHaveProperty('semesterName');
    expect(body.startTime).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('thiếu phòng thì không gửi và báo ở ô phòng', async () => {
    render(<NewExamSessionPage />);
    fireEvent.change(screen.getByLabelText('Tên phiên thi'), { target: { value: 'Giữa kỳ N01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo phiên thi' }));
    expect(await screen.findByText('Vui lòng chọn phòng thi')).toBeInTheDocument();
    expect(h.mutate).not.toHaveBeenCalled();
  });

  it('lỗi của server (va chạm phòng) hiện nguyên văn', () => {
    h.create = { isPending: false, isError: true, error: { message: 'Phòng Phòng máy A1 đã có phiên thi "Ca sáng" lúc 08:00–10:00.' }, reset: vi.fn() };
    render(<NewExamSessionPage />);
    expect(screen.getByText('Phòng Phòng máy A1 đã có phiên thi "Ca sáng" lúc 08:00–10:00.')).toBeInTheDocument();
  });

  it('tạo xong → màn mã phiên, có "Vào phòng chờ"', () => {
    h.mutate.mockImplementation((_body: unknown, options?: { onSuccess?: (s: { id: string; code: string }) => void }) =>
      options?.onSuccess?.({ id: 'new1', code: 'ABC123' }),
    );
    render(<NewExamSessionPage />);
    // Gọi thẳng qua form hợp lệ là dài; ở đây chỉ kiểm màn thành công khi mutate báo xong.
    fireEvent.change(screen.getByLabelText('Tên phiên thi'), { target: { value: 'Giữa kỳ N01' } });
    choose('Lớp thi', 'DHKTPM18A – Nhóm 1 · HK1 2026-2027 (30 SV)');
    choose('Phòng thi', 'Phòng máy A1');
    choose('Loại kỳ thi', 'Giữa kỳ');
    fireEvent.change(screen.getByLabelText('Thời gian bắt đầu'), { target: { value: inOneDay() } });
    fireEvent.change(screen.getByLabelText('Thời gian kết thúc'), { target: { value: inOneDay(2) } });
    fireEvent.change(screen.getByPlaceholderText(/bai_lam\.docx/i), { target: { value: 'Cau1.docx' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo phiên thi' }));
    return waitFor(() => {
      expect(screen.getByText('Đã tạo phiên thi')).toBeInTheDocument();
      expect(screen.getByText('ABC123')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Vào phòng chờ' })).toHaveAttribute('href', '/exam-sessions/new1');
    });
  });
});
