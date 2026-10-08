import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { toast } from 'sonner';
import { MoveErrorDialog, RemoveErrorDialog } from './ErrorDialogs';
import { criterion, errorItem, mutation } from './fixtures';

const h = vi.hoisted(() => ({ move: undefined as unknown, remove: undefined as unknown }));
vi.mock('@/hooks/useRubricErrors', () => ({ useMoveError: () => h.move, useRemoveError: () => h.remove }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const RECOMPUTE = { recomputed: 2, promoted: 0, demoted: 1, belowFloor: 0 };
const criteria = [
  criterion({ key: 'tinh_dung', description: 'Tính đúng đắn' }),
  criterion({ key: 'bo_nho', description: 'Quản lý bộ nhớ', maxPoints: 2 }),
  criterion({ key: 'trinh_bay', description: 'Trình bày', maxPoints: 2 }),
];

beforeEach(() => {
  vi.clearAllMocks();
  h.move = mutation();
  h.remove = mutation();
});

describe('MoveErrorDialog', () => {
  it('chỉ mời chọn tiêu chí KHÁC; chưa chọn thì chưa xác nhận được', () => {
    render(<MoveErrorDialog item={errorItem({ criterionKey: 'tinh_dung' })} criteria={criteria} onClose={vi.fn()} />);
    const options = screen.getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual(['Chọn tiêu chí…', 'Quản lý bộ nhớ · tối đa 2,0', 'Trình bày · tối đa 2,0']);
    expect(screen.getByRole('button', { name: 'Chuyển' })).toBeDisabled();
  });

  it('lỗi mồ côi (tiêu chí không còn): mọi tiêu chí hiện hành đều là lựa chọn', () => {
    render(<MoveErrorDialog item={errorItem({ criterionKey: 'da_xoa', criterionDangling: true })} criteria={criteria} onClose={vi.fn()} />);
    expect(screen.getAllByRole('option')).toHaveLength(4);
  });

  it('xác nhận gửi đúng dòng + tiêu chí, báo bằng lời, rồi đóng', () => {
    const onClose = vi.fn();
    render(<MoveErrorDialog item={errorItem({ id: 'e9' })} criteria={criteria} onClose={onClose} />);
    fireEvent.change(screen.getByLabelText('Tiêu chí mới'), { target: { value: 'bo_nho' } });
    fireEvent.click(screen.getByRole('button', { name: 'Chuyển' }));
    const m = (h.move as ReturnType<typeof mutation>).mutate;
    expect(m).toHaveBeenCalledWith({ rubricErrorId: 'e9', criterionKey: 'bo_nho' }, expect.anything());
    m.mock.calls[0][1].onSuccess({ recompute: RECOMPUTE });
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('Đã chuyển “Sai ca biên” sang “Quản lý bộ nhớ”.'));
    expect(onClose).toHaveBeenCalled();
  });

  it('lỗi của máy chủ hiện nguyên văn và không đóng', () => {
    (h.move as ReturnType<typeof mutation>).isError = true;
    (h.move as ReturnType<typeof mutation>).error = new Error('Tiêu chí "x" không có trong rubric');
    const onClose = vi.fn();
    render(<MoveErrorDialog item={errorItem()} criteria={criteria} onClose={onClose} />);
    expect(screen.getByText('Tiêu chí "x" không có trong rubric')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('item = null thì không hiện gì', () => {
    render(<MoveErrorDialog item={null} criteria={criteria} onClose={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('RemoveErrorDialog', () => {
  it('nói hậu quả: lỗi còn ở thư viện, rubric khác không đổi, bài chưa chốt của rubric này tính lại', () => {
    render(<RemoveErrorDialog item={errorItem()} rubricName="Giữa kỳ CTDL" onClose={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Gỡ “Sai ca biên” khỏi rubric “Giữa kỳ CTDL”?' })).toBeInTheDocument();
    expect(screen.getByText(/Lỗi vẫn còn trong Thư viện lỗi, các rubric khác không đổi/)).toBeInTheDocument();
    expect(screen.getByText(/bài chưa chốt của rubric này được tính lại/)).toBeInTheDocument();
  });

  it('xác nhận gửi id dòng áp dụng, báo kết quả, đóng', () => {
    const onClose = vi.fn();
    render(<RemoveErrorDialog item={errorItem({ id: 'e5' })} rubricName="A" onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Gỡ khỏi rubric này' }));
    const m = (h.remove as ReturnType<typeof mutation>).mutate;
    expect(m).toHaveBeenCalledWith('e5', expect.anything());
    m.mock.calls[0][1].onSuccess({ recompute: RECOMPUTE });
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('Đã gỡ “Sai ca biên” khỏi “A”.'));
    expect(onClose).toHaveBeenCalled();
  });

  it('Huỷ không gửi gì', () => {
    const onClose = vi.fn();
    render(<RemoveErrorDialog item={errorItem()} rubricName="A" onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Huỷ' }));
    expect(onClose).toHaveBeenCalled();
    expect((h.remove as ReturnType<typeof mutation>).mutate).not.toHaveBeenCalled();
  });
});
