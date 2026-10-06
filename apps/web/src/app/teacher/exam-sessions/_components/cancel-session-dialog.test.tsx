import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const h = vi.hoisted(() => ({
  mutate: vi.fn(),
  reset: vi.fn(),
  state: { isPending: false, isError: false, error: null as unknown },
  toastSuccess: vi.fn(),
}));
vi.mock('@/hooks/useExamSession', () => ({ useCancelExamSession: () => ({ ...h.state, mutate: h.mutate, reset: h.reset }) }));
vi.mock('sonner', () => ({ toast: { success: h.toastSuccess, error: vi.fn() } }));

import type { ExamSessionListItem } from '@/lib/api/exam-session';
import { CancelSessionDialog } from './cancel-session-dialog';

const SESSION: ExamSessionListItem = {
  id: 's1', name: 'Giữa kỳ N01', code: 'ABC123', courseName: 'CTDL&GT', classLabel: 'DHKTPM18A – Nhóm 1',
  semesterId: 'sem1', academicYear: 2026, term: 1, roomName: 'Phòng máy A1', semesterName: 'HK1 2026-2027',
  examType: 'GK', startTime: new Date(2026, 9, 6, 8, 0).toISOString(), endTime: new Date(2026, 9, 6, 10, 0).toISOString(), status: 'active',
};

beforeEach(() => {
  h.mutate.mockReset();
  h.reset.mockReset();
  h.toastSuccess.mockReset();
  h.state = { isPending: false, isError: false, error: null };
});

describe('CancelSessionDialog', () => {
  it('không có phiên → không có hộp thoại', () => {
    render(<CancelSessionDialog session={null} onClose={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('nêu phiên nào và hậu quả: không khôi phục được, sinh viên không vào được nữa, phòng/lớp/giãn cách được nhả', () => {
    render(<CancelSessionDialog session={SESSION} onClose={vi.fn()} />);
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Huỷ phiên thi?')).toBeInTheDocument();
    expect(dialog).toHaveTextContent('Giữa kỳ N01');
    expect(dialog).toHaveTextContent('DHKTPM18A – Nhóm 1');
    expect(dialog).toHaveTextContent(/không khôi phục được/i);
    expect(dialog).toHaveTextContent(/sinh viên không vào được nữa/i);
    expect(dialog).toHaveTextContent(/nhả/i);
  });

  it('"Giữ phiên" đóng hộp thoại mà không huỷ gì', () => {
    const onClose = vi.fn();
    render(<CancelSessionDialog session={SESSION} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Giữ phiên' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(h.mutate).not.toHaveBeenCalled();
  });

  it('xác nhận không lý do → gọi với id và reason undefined; có lý do thì cắt khoảng trắng', () => {
    render(<CancelSessionDialog session={SESSION} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Huỷ phiên' }));
    expect(h.mutate).toHaveBeenLastCalledWith({ id: 's1', reason: undefined }, expect.any(Object));
    fireEvent.change(screen.getByLabelText(/Lý do/), { target: { value: '  Nhầm phòng  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Huỷ phiên' }));
    expect(h.mutate).toHaveBeenLastCalledWith({ id: 's1', reason: 'Nhầm phòng' }, expect.any(Object));
  });

  it('ô lý do giới hạn 200 ký tự (cùng giới hạn của server)', () => {
    render(<CancelSessionDialog session={SESSION} onClose={vi.fn()} />);
    expect(screen.getByLabelText(/Lý do/)).toHaveAttribute('maxlength', '200');
  });

  it('thành công → thông báo rồi đóng', () => {
    h.mutate.mockImplementation((_vars: unknown, options?: { onSuccess?: () => void }) => options?.onSuccess?.());
    const onClose = vi.fn();
    render(<CancelSessionDialog session={SESSION} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Huỷ phiên' }));
    expect(h.toastSuccess).toHaveBeenCalledWith('Đã huỷ phiên “Giữa kỳ N01”.');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Review Focus 6: 409 "đã có sinh viên vào phòng" hiện NGUYÊN VĂN trong hộp thoại và hộp thoại GIỮ MỞ', () => {
    h.state = {
      isPending: false,
      isError: true,
      error: { statusCode: 409, message: 'Đã có sinh viên vào phòng, hãy Chốt bài ngay rồi Xác nhận kết thúc' },
    };
    const onClose = vi.fn();
    render(<CancelSessionDialog session={SESSION} onClose={onClose} />);
    expect(within(screen.getByRole('dialog')).getByText('Đã có sinh viên vào phòng, hãy Chốt bài ngay rồi Xác nhận kết thúc')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Giữ phiên' })).toBeEnabled();
  });

  it('đang xử lý: cả hai nút khoá và Esc không đóng hộp thoại giữa chừng', () => {
    h.state = { isPending: true, isError: false, error: null };
    const onClose = vi.fn();
    render(<CancelSessionDialog session={SESSION} onClose={onClose} />);
    expect(screen.getByRole('button', { name: 'Giữ phiên' })).toBeDisabled();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('mở lại cho phiên khác thì lý do và lỗi của lần trước bị xoá', () => {
    const view = render(<CancelSessionDialog session={SESSION} onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/Lý do/), { target: { value: 'Nhầm phòng' } });
    view.rerender(<CancelSessionDialog session={{ ...SESSION, id: 's2', name: 'Cuối kỳ N02' }} onClose={vi.fn()} />);
    expect(screen.getByLabelText(/Lý do/)).toHaveValue('');
    expect(h.reset).toHaveBeenCalled();
  });
});
