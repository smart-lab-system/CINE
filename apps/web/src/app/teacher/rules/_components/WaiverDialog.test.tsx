import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { toast } from 'sonner';
import { WaiverDialog } from './WaiverDialog';
import { criterion, mutation } from './fixtures';

const h = vi.hoisted(() => ({ set: undefined as unknown, revoke: undefined as unknown, rubricId: undefined as string | undefined }));
vi.mock('@/hooks/useRules', () => ({
  useSetWaiver: (rubricId: string | undefined) => {
    h.rubricId = rubricId;
    return h.set;
  },
  useRevokeWaiver: () => h.revoke,
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const empty = criterion({ key: 'bo_nho', description: 'Quản lý bộ nhớ', maxPoints: 2, errorCount: 0 });
const waived = criterion({ key: 'bo_nho', description: 'Quản lý bộ nhớ', maxPoints: 2, errorCount: 0, waiverId: 'w1' });

beforeEach(() => {
  vi.clearAllMocks();
  h.set = mutation();
  h.revoke = mutation();
});

describe('WaiverDialog', () => {
  it('đánh dấu: nói hậu quả (trọn điểm, tính lại phiên chưa chốt) rồi gửi đúng khoá tiêu chí cho đúng rubric', () => {
    const onClose = vi.fn();
    render(<WaiverDialog target={{ criterion: empty, rubricId: 'ru-9' }} onClose={onClose} />);
    expect(h.rubricId).toBe('ru-9');
    expect(screen.getByRole('heading', { name: 'Đánh dấu tiêu chí không trừ điểm?' })).toBeInTheDocument();
    expect(screen.getByText(/“Quản lý bộ nhớ” luôn trọn điểm cho mọi bài chấm theo rubric này/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Đánh dấu không trừ điểm' }));
    const m = (h.set as ReturnType<typeof mutation>).mutate;
    expect(m).toHaveBeenCalledWith('bo_nho', expect.anything());
    m.mock.calls[0][1].onSuccess({ waiverId: 'w9', recompute: { recomputed: 4, promoted: 4, demoted: 0, belowFloor: 0 } });
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('Đã tính lại 4 bài: 4 bài đủ điều kiện tự quyết.'));
    expect(onClose).toHaveBeenCalled();
  });

  it('đánh dấu đã có từ trước (recompute null): nói không tính lại bài nào', () => {
    render(<WaiverDialog target={{ criterion: empty, rubricId: 'ru-9' }} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Đánh dấu không trừ điểm' }));
    (h.set as ReturnType<typeof mutation>).mutate.mock.calls[0][1].onSuccess({ waiverId: 'w9', recompute: null });
    expect(toast.success).toHaveBeenCalledWith('Đánh dấu này đã có từ trước, không tính lại bài nào.');
  });

  it('bỏ đánh dấu: nói bài chưa có lỗi cho tiêu chí này sẽ không tự quyết được, rồi gửi id đánh dấu', () => {
    render(<WaiverDialog target={{ criterion: waived, rubricId: 'ru-9' }} onClose={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Bỏ đánh dấu "không trừ điểm"?' })).toBeInTheDocument();
    expect(screen.getByText(/không tự quyết được \("Cần bạn xem"\)/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Bỏ đánh dấu' }));
    expect((h.revoke as ReturnType<typeof mutation>).mutate).toHaveBeenCalledWith('w1', expect.anything());
  });

  it('lỗi của máy chủ hiện nguyên văn', () => {
    (h.set as ReturnType<typeof mutation>).isError = true;
    (h.set as ReturnType<typeof mutation>).error = new Error('Tiêu chí đã có lỗi');
    render(<WaiverDialog target={{ criterion: empty, rubricId: 'ru-9' }} onClose={vi.fn()} />);
    expect(screen.getByText('Tiêu chí đã có lỗi')).toBeInTheDocument();
  });

  it('target = null thì không hiện gì; Huỷ không gửi gì', () => {
    const { unmount } = render(<WaiverDialog target={null} onClose={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    unmount();
    const onClose = vi.fn();
    render(<WaiverDialog target={{ criterion: empty, rubricId: 'ru-9' }} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Huỷ' }));
    expect(onClose).toHaveBeenCalled();
    expect((h.set as ReturnType<typeof mutation>).mutate).not.toHaveBeenCalled();
  });
});
