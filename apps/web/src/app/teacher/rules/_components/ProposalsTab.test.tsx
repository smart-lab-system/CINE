import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { toast } from 'sonner';
import { ProposalsTab } from './ProposalsTab';
import { mutation, overview, proposal } from './fixtures';

const h = vi.hoisted(() => ({ dismiss: undefined as unknown }));
vi.mock('@/hooks/useRules', () => ({ useDismissRule: () => h.dismiss }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const board = overview({ rubricName: 'Giữa kỳ CTDL', proposalCount: 2 });
const items = [
  proposal({ id: 'p1', name: 'Hàm pop không kiểm tra ngăn xếp rỗng', sightings: { sessions: [{ id: 's1', name: 'Ca sáng' }], results: 4 } }),
  proposal({ id: 'p2', name: 'Con trỏ top không được cập nhật', sightings: { sessions: [{ id: 's1', name: 'Ca sáng' }, { id: 's2', name: 'Ca chiều' }, { id: 's3', name: 'Ca tối' }], results: 2 } }),
];

const mount = (over: Partial<React.ComponentProps<typeof ProposalsTab>> = {}) => {
  const onAdd = vi.fn();
  render(<ProposalsTab overview={board} proposals={items} loading={false} error={null} onAdd={onAdd} {...over} />);
  return onAdd;
};

beforeEach(() => {
  vi.clearAllMocks();
  h.dismiss = mutation();
});

describe('ProposalsTab (T-RBE-UI-7)', () => {
  it('nói đây là lỗi AI thấy mà chưa tính điểm, kèm số lượng', () => {
    mount();
    expect(screen.getByText(/2 lỗi AI thấy khi chấm nhưng chưa có trong bảng/)).toBeInTheDocument();
    expect(screen.getByText(/bị bỏ ra khỏi điểm/)).toBeInTheDocument();
  });

  it('mỗi thẻ có ngữ cảnh: số bài, phiên (chặn trần), rubric', () => {
    mount();
    const card = screen.getByRole('heading', { name: 'Con trỏ top không được cập nhật' }).closest('li') as HTMLElement;
    expect(within(card).getByText('Thấy ở 2 bài')).toBeInTheDocument();
    expect(within(card).getByText('Ca sáng, Ca chiều và 1 phiên khác')).toBeInTheDocument();
    expect(within(card).getByText('Rubric: Giữa kỳ CTDL')).toBeInTheDocument();
  });

  it('lỗi cũ chưa từng ghi nhận nơi thấy: nói thẳng là chưa rõ, không bịa số bài', () => {
    mount({ proposals: [proposal({ id: 'p9', name: 'Lỗi cũ', legacy: true, sightings: { sessions: [], results: 0 } })] });
    expect(screen.getByText('Chưa rõ thấy ở đâu')).toBeInTheDocument();
    expect(screen.queryByText(/Thấy ở/)).not.toBeInTheDocument();
  });

  it('"Thêm vào rubric này" chuyển đúng lỗi đề xuất cho ngăn kéo', () => {
    const onAdd = mount();
    fireEvent.click(within(screen.getByRole('heading', { name: 'Hàm pop không kiểm tra ngăn xếp rỗng' }).closest('li') as HTMLElement).getByRole('button', { name: 'Thêm vào rubric này' }));
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1' }));
  });

  it('"Không phải lỗi" hỏi xác nhận nêu hệ quả; xác nhận rồi mới gửi', () => {
    mount();
    fireEvent.click(within(screen.getByRole('heading', { name: 'Hàm pop không kiểm tra ngăn xếp rỗng' }).closest('li') as HTMLElement).getByRole('button', { name: 'Không phải lỗi' }));
    expect(screen.getByRole('heading', { name: 'Đánh dấu “không phải lỗi”?' })).toBeInTheDocument();
    expect(screen.getByText(/các bài đang chờ nó được tính lại/)).toBeInTheDocument();
    const m = (h.dismiss as ReturnType<typeof mutation>).mutate;
    expect(m).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Đánh dấu không phải lỗi' }));
    expect(m).toHaveBeenCalledWith({ ruleId: 'p1' }, expect.anything());
  });

  it('sau khi đánh dấu: đọc kết quả tính lại bằng lời và đóng hộp thoại', async () => {
    mount();
    fireEvent.click(within(screen.getByRole('heading', { name: 'Hàm pop không kiểm tra ngăn xếp rỗng' }).closest('li') as HTMLElement).getByRole('button', { name: 'Không phải lỗi' }));
    fireEvent.click(screen.getByRole('button', { name: 'Đánh dấu không phải lỗi' }));
    await act(async () => {
      (h.dismiss as ReturnType<typeof mutation>).mutate.mock.calls[0][1].onSuccess({ recompute: { recomputed: 3, promoted: 2, demoted: 0, belowFloor: 0 } });
    });
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('Đã tính lại 3 bài: 2 bài đủ điều kiện tự quyết.'));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Đánh dấu “không phải lỗi”?' })).not.toBeInTheDocument());
  });

  it('lỗi của máy chủ khi đánh dấu hiện nguyên văn trong hộp thoại', () => {
    (h.dismiss as ReturnType<typeof mutation>).isError = true;
    (h.dismiss as ReturnType<typeof mutation>).error = new Error('Không tìm thấy luật');
    mount();
    fireEvent.click(within(screen.getByRole('heading', { name: 'Hàm pop không kiểm tra ngăn xếp rỗng' }).closest('li') as HTMLElement).getByRole('button', { name: 'Không phải lỗi' }));
    expect(screen.getByText('Không tìm thấy luật')).toBeInTheDocument();
  });

  it('không có lỗi đề xuất: nói vậy, không để trang trống', () => {
    mount({ proposals: [] });
    expect(screen.getByText('AI chưa báo lỗi nào ngoài bảng ở rubric này.')).toBeInTheDocument();
  });

  it('đang tải / lỗi tải', () => {
    const { unmount } = render(<ProposalsTab overview={board} proposals={undefined} loading error={null} onAdd={vi.fn()} />);
    expect(screen.getByText('Đang tải…')).toBeInTheDocument();
    unmount();
    render(<ProposalsTab overview={board} proposals={undefined} loading={false} error={new Error('Máy chủ không trả lời')} onAdd={vi.fn()} />);
    expect(screen.getByText(/Không tải được lỗi AI đề xuất — Máy chủ không trả lời/)).toBeInTheDocument();
  });
});
