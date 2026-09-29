import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { PriceSheet } from './PriceSheet';
import { rule } from './fixtures';
import type { PricePreview } from '@/lib/api/rules';

const previewMutate = vi.fn();
const previewReset = vi.fn();
const saveMutate = vi.fn();
let previewData: PricePreview | undefined;
let previewError: Error | null;
let saveError: Error | null;

vi.mock('@/hooks/useRules', () => ({
  usePreviewPrice: () => ({
    mutate: previewMutate,
    reset: previewReset,
    get data() {
      return previewData;
    },
    isPending: false,
    isError: previewError !== null,
    error: previewError,
  }),
  useSetPrice: () => ({
    mutate: saveMutate,
    isPending: false,
    isError: saveError !== null,
    error: saveError,
  }),
}));

const IMPACT: PricePreview = {
  openSessions: [
    { sessionId: 's1', name: 'Giữa kỳ N01', affected: 4, autoAfter: 3, blockedByOtherUnpriced: 1 },
    { sessionId: 's2', name: 'Kiểm tra tuần 6', affected: 5, autoAfter: 5, blockedByOtherUnpriced: 0 },
  ],
  finalizedSessions: [{ sessionId: 's3', name: 'Cuối kỳ cũ', affected: 3 }],
};

beforeEach(() => {
  vi.clearAllMocks();
  previewData = undefined;
  previewError = null;
  saveError = null;
  // Giả lập server trả về ngay: preview thành công → cập nhật dữ liệu rồi gọi onSuccess.
  previewMutate.mockImplementation((_vars: unknown, opts?: { onSuccess?: () => void }) => {
    previewData = IMPACT;
    opts?.onSuccess?.();
  });
  saveMutate.mockImplementation((_vars: unknown, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.());
});

const input = () => screen.getByLabelText('Mức trừ (điểm)') as HTMLInputElement;

function show(over: Partial<React.ComponentProps<typeof PriceSheet>> = {}) {
  const onClose = vi.fn();
  const utils = render(<PriceSheet rule={rule({ id: 'r1' })} onClose={onClose} {...over} />);
  return { onClose, ...utils };
}

describe('PriceSheet', () => {
  it('ô nhập được điền sẵn giá hiện tại (dấu phẩy); luật chưa giá thì để trống', () => {
    show();
    expect(input().value).toBe('1,5');
  });

  it('luật chưa có giá: tiêu đề "Đặt giá lần đầu", ô trống, nói rõ hệ quả của việc để trống', () => {
    show({ rule: rule({ deduction: null }) });
    expect(screen.getByText('Đặt giá lần đầu')).toBeInTheDocument();
    expect(input().value).toBe('');
    expect(screen.getByText(/Để trống = chưa có giá/)).toBeInTheDocument();
  });

  it('luật đã có giá: tiêu đề "Sửa giá" kèm tên luật và khoá', () => {
    show();
    expect(screen.getByText('Sửa giá')).toBeInTheDocument();
    expect(screen.getByText('Sai ca biên')).toBeInTheDocument();
    expect(screen.getByText('sai_bien')).toBeInTheDocument();
  });

  it('rời ô với "1,5" → xem trước với CHUỖI "1.5" (server từ chối số JSON)', () => {
    show({ rule: rule({ deduction: null }) });
    fireEvent.change(input(), { target: { value: '1,5' } });
    fireEvent.blur(input());
    expect(previewMutate).toHaveBeenCalledWith({ ruleId: 'r1', deduction: '1.5' }, expect.anything());
  });

  it('giá không hợp lệ ("abc") → thông báo cạnh ô, KHÔNG gọi xem trước', () => {
    show({ rule: rule({ deduction: null }) });
    fireEvent.change(input(), { target: { value: 'abc' } });
    fireEvent.blur(input());
    expect(screen.getByText('Mức trừ: số không âm, tối đa hai chữ số lẻ.')).toBeInTheDocument();
    expect(previewMutate).not.toHaveBeenCalled();
  });

  it('chưa xem trước thì chưa lưu được (T-UI-2)', () => {
    show();
    expect(screen.getByRole('button', { name: 'Lưu giá' })).toBeDisabled();
  });

  it('sau khi xem trước: nút lưu nói đúng số bài bị tính lại và bật lên', () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Xem tác động' }));
    expect(screen.getByRole('button', { name: 'Lưu và tính lại 9 bài' })).toBeEnabled();
  });

  it('bảng tác động: từng phiên chưa chốt, bài tự quyết được, bài còn chờ luật khác', () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Xem tác động' }));
    expect(screen.getByText('Giữa kỳ N01')).toBeInTheDocument();
    expect(screen.getByText('Kiểm tra tuần 6')).toBeInTheDocument();
    expect(screen.getByText(/3 bài đủ điều kiện tự quyết/)).toBeInTheDocument();
    expect(screen.getByText(/1 bài vẫn chờ vì còn dính luật khác chưa có giá/)).toBeInTheDocument();
  });

  it('phiên đã chốt: nói giữ nguyên điểm và vì sao (bảng giá ghim lúc chốt)', () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Xem tác động' }));
    expect(screen.getByText(/3 bài thuộc phiên đã chốt: giữ nguyên điểm/)).toBeInTheDocument();
  });

  it('đổi số sau khi xem trước → xoá xem trước cũ và khoá nút lưu lại (không lưu theo tác động của số cũ)', () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Xem tác động' }));
    expect(screen.getByRole('button', { name: /Lưu và tính lại/ })).toBeEnabled();
    fireEvent.change(input(), { target: { value: '2' } });
    expect(previewReset).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Lưu giá' })).toBeDisabled();
  });

  it('lưu gửi đúng luật + chuỗi giá, rồi đóng', () => {
    const { onClose } = show();
    fireEvent.change(input(), { target: { value: '2,25' } });
    fireEvent.click(screen.getByRole('button', { name: 'Xem tác động' }));
    fireEvent.click(screen.getByRole('button', { name: /Lưu và tính lại/ }));
    expect(saveMutate).toHaveBeenCalledWith({ ruleId: 'r1', deduction: '2.25' }, expect.anything());
    expect(onClose).toHaveBeenCalled();
  });

  it('để trống ô = gửi null tường minh (chưa có giá), không phải bỏ qua', () => {
    show({ rule: rule({ deduction: null }) });
    fireEvent.click(screen.getByRole('button', { name: 'Xem tác động' }));
    expect(previewMutate).toHaveBeenCalledWith({ ruleId: 'r1', deduction: null }, expect.anything());
    fireEvent.click(screen.getByRole('button', { name: /Lưu và tính lại/ }));
    expect(saveMutate).toHaveBeenCalledWith({ ruleId: 'r1', deduction: null }, expect.anything());
  });

  it('lỗi từ server khi lưu hiện nguyên văn (dialog cũ không hiện gì)', () => {
    saveError = new Error('Không tìm thấy luật');
    show();
    expect(screen.getByText('Không tìm thấy luật')).toBeInTheDocument();
  });

  it('lỗi từ server khi xem trước hiện nguyên văn', () => {
    previewError = new Error('mức trừ: chuỗi thập phân tối đa hai chữ số lẻ, không âm');
    show();
    expect(screen.getByText('mức trừ: chuỗi thập phân tối đa hai chữ số lẻ, không âm')).toBeInTheDocument();
  });

  it('có trần tiêu chí → nói giá cao hơn trần vẫn lưu được', () => {
    show({ ceiling: { label: 'tinh_dung', max: 4 } });
    expect(screen.getByText(/Trần tiêu chí tinh_dung: 4,0 điểm/)).toBeInTheDocument();
    expect(screen.getByText(/Giá cao hơn trần vẫn lưu được/)).toBeInTheDocument();
  });

  it('đổi sang luật khác thì trạng thái không rò rỉ: ô nhập theo luật mới, xem trước cũ mất', () => {
    const { rerender, onClose } = show({ rule: rule({ id: 'r1', deduction: '1.50' }) });
    fireEvent.click(screen.getByRole('button', { name: 'Xem tác động' }));
    previewData = undefined;
    rerender(<PriceSheet rule={rule({ id: 'r2', ruleKey: 'khac', deduction: '0.50' })} onClose={onClose} />);
    expect(input().value).toBe('0,5');
    expect(screen.getByRole('button', { name: 'Lưu giá' })).toBeDisabled();
  });

  it('"Huỷ" đóng mà không lưu', () => {
    const { onClose } = show();
    fireEvent.click(screen.getByRole('button', { name: 'Huỷ' }));
    expect(onClose).toHaveBeenCalled();
    expect(saveMutate).not.toHaveBeenCalled();
  });

  it('không có luật nào được chọn → không render gì', () => {
    const { container } = render(<PriceSheet rule={null} onClose={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
