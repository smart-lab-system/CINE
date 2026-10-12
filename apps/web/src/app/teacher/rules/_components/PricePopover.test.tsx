import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { toast } from 'sonner';
import { PricePopover } from './PricePopover';
import { criterion, errorItem } from './fixtures';
import type { PricePreview } from '@/lib/api/rules';

const previewMutate = vi.fn();
const previewReset = vi.fn();
const saveMutate = vi.fn();
let previewData: PricePreview | undefined;
let previewError: Error | null;
let saveError: Error | null;

vi.mock('@/hooks/useRubricErrors', () => ({
  usePreviewErrorPrice: () => ({
    mutate: previewMutate,
    reset: previewReset,
    get data() {
      return previewData;
    },
    isPending: false,
    isError: previewError !== null,
    error: previewError,
  }),
  useSetErrorPrice: () => ({ mutate: saveMutate, isPending: false, isError: saveError !== null, error: saveError }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const RECOMPUTE = { recomputed: 9, promoted: 3, demoted: 0, belowFloor: 0 };
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
  // Giả lập máy chủ trả lời ngay: xem trước thành công → cập nhật dữ liệu rồi gọi onSuccess.
  previewMutate.mockImplementation((_vars: unknown, opts?: { onSuccess?: () => void }) => {
    previewData = IMPACT;
    opts?.onSuccess?.();
  });
  saveMutate.mockImplementation((_vars: unknown, opts?: { onSuccess?: (r: unknown) => void }) =>
    opts?.onSuccess?.({ versionId: 'v2', recompute: RECOMPUTE }),
  );
});

const input = () => screen.getByLabelText('Điểm trừ') as HTMLInputElement;

function show(over: Partial<React.ComponentProps<typeof PricePopover>> = {}) {
  const onClose = vi.fn();
  const utils = render(<PricePopover item={errorItem({ id: 'e1' })} rubricName="Giữa kỳ CTDL" onClose={onClose} {...over} />);
  return { onClose, ...utils };
}

describe('PricePopover (T-RBE-UI-4)', () => {
  it('ô nhập điền sẵn điểm trừ hiện tại (dấu phẩy) và có tiêu điểm', () => {
    show();
    expect(input().value).toBe('1,5');
    expect(input()).toHaveFocus();
  });

  it('lỗi chưa có điểm trừ: tiêu đề "Đặt điểm trừ", ô trống, nói hệ quả của việc để trống', () => {
    show({ item: errorItem({ deduction: null }) });
    expect(screen.getByText('Đặt điểm trừ — Sai ca biên')).toBeInTheDocument();
    expect(input().value).toBe('');
    expect(screen.getByText(/Để trống = chưa có điểm trừ/)).toBeInTheDocument();
  });

  it('lỗi đã có điểm trừ: tiêu đề "Sửa điểm trừ" kèm tên lỗi', () => {
    show();
    expect(screen.getByText('Sửa điểm trừ — Sai ca biên')).toBeInTheDocument();
  });

  it('nói rõ chỉ áp cho rubric này và các rubric khác giữ điểm trừ riêng (bị chặn trần)', () => {
    show({
      item: errorItem({
        alsoIn: [
          { rubricName: 'Cuối kỳ CTDL', criterionKey: 'x', deduction: '2.00' },
          { rubricName: 'Diễn tập', criterionKey: 'x', deduction: null },
          { rubricName: 'Thi lại', criterionKey: 'x', deduction: null },
        ],
      }),
    });
    expect(screen.getByText(/Chỉ áp cho rubric “Giữa kỳ CTDL”/)).toBeInTheDocument();
    expect(screen.getByText(/Ở Cuối kỳ CTDL, Diễn tập và 1 rubric khác lỗi này giữ điểm trừ riêng/)).toBeInTheDocument();
  });

  it('rời ô với "1,5" → xem trước với CHUỖI "1.5" (máy chủ từ chối số JSON)', () => {
    show({ item: errorItem({ deduction: null }) });
    fireEvent.change(input(), { target: { value: '1,5' } });
    fireEvent.blur(input());
    expect(previewMutate).toHaveBeenCalledWith({ rubricErrorId: 'e1', deduction: '1.5' }, expect.anything());
  });

  it('không hợp lệ ("abc") → thông báo cạnh ô, KHÔNG gọi xem trước', () => {
    show({ item: errorItem({ deduction: null }) });
    fireEvent.change(input(), { target: { value: 'abc' } });
    fireEvent.blur(input());
    expect(screen.getByText('Điểm trừ: số không âm, tối đa hai chữ số lẻ.')).toBeInTheDocument();
    expect(previewMutate).not.toHaveBeenCalled();
  });

  it('chưa xem trước thì chưa lưu được (T-UI-2)', () => {
    show();
    expect(screen.getByRole('button', { name: 'Lưu' })).toBeDisabled();
  });

  it('sau khi xem trước: nút lưu nói đúng số bài bị tính lại và bật lên', () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Xem tác động' }));
    expect(screen.getByRole('button', { name: 'Lưu và tính lại 9 bài' })).toBeEnabled();
  });

  it('bảng tác động: từng phiên chưa chốt, bài tự quyết được, bài còn chờ lỗi khác', () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Xem tác động' }));
    expect(screen.getByText('Giữa kỳ N01')).toBeInTheDocument();
    expect(screen.getByText('Kiểm tra tuần 6')).toBeInTheDocument();
    expect(screen.getByText(/3 bài đủ điều kiện tự quyết/)).toBeInTheDocument();
    expect(screen.getByText(/1 bài vẫn chờ vì còn dính lỗi khác chưa có điểm trừ/)).toBeInTheDocument();
  });

  it('phiên đã chốt: nói giữ nguyên điểm và vì sao (bảng điểm trừ ghim lúc chốt)', () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Xem tác động' }));
    expect(screen.getByText(/3 bài thuộc phiên đã chốt: giữ nguyên điểm/)).toBeInTheDocument();
  });

  it('chưa áp vào bài nào thì nói vậy', () => {
    previewMutate.mockImplementation((_v: unknown, opts?: { onSuccess?: () => void }) => {
      previewData = { openSessions: [], finalizedSessions: [] };
      opts?.onSuccess?.();
    });
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Xem tác động' }));
    expect(screen.getByText('Điểm trừ này chưa áp vào bài nào.')).toBeInTheDocument();
  });

  it('đổi số sau khi xem trước → xoá xem trước cũ và khoá nút lưu (không lưu theo tác động của số cũ)', () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Xem tác động' }));
    expect(screen.getByRole('button', { name: /Lưu và tính lại/ })).toBeEnabled();
    fireEvent.change(input(), { target: { value: '2' } });
    expect(previewReset).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Lưu' })).toBeDisabled();
  });

  it('lưu gửi đúng dòng + chuỗi điểm trừ, báo bằng lời kết quả tính lại, rồi đóng', () => {
    const { onClose } = show();
    fireEvent.change(input(), { target: { value: '2,25' } });
    fireEvent.click(screen.getByRole('button', { name: 'Xem tác động' }));
    fireEvent.click(screen.getByRole('button', { name: /Lưu và tính lại/ }));
    expect(saveMutate).toHaveBeenCalledWith({ rubricErrorId: 'e1', deduction: '2.25' }, expect.anything());
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('Đã lưu điểm trừ −2,25. Đã tính lại 9 bài: 3 bài đủ điều kiện tự quyết.'));
    expect(onClose).toHaveBeenCalled();
  });

  it('để trống ô = gửi null tường minh (chưa có điểm trừ), không phải bỏ qua', () => {
    show({ item: errorItem({ deduction: null }) });
    fireEvent.click(screen.getByRole('button', { name: 'Xem tác động' }));
    expect(previewMutate).toHaveBeenCalledWith({ rubricErrorId: 'e1', deduction: null }, expect.anything());
    fireEvent.click(screen.getByRole('button', { name: /Lưu và tính lại/ }));
    expect(saveMutate).toHaveBeenCalledWith({ rubricErrorId: 'e1', deduction: null }, expect.anything());
  });

  it('lỗi từ máy chủ khi lưu / khi xem trước hiện nguyên văn', () => {
    saveError = new Error('Không tìm thấy lỗi trong rubric');
    previewError = new Error('mức trừ: chuỗi thập phân tối đa hai chữ số lẻ, không âm');
    show();
    expect(screen.getByText('Không tìm thấy lỗi trong rubric')).toBeInTheDocument();
    expect(screen.getByText('mức trừ: chuỗi thập phân tối đa hai chữ số lẻ, không âm')).toBeInTheDocument();
  });

  it('có tiêu chí → nói điểm tối đa và rằng điểm trừ cao hơn vẫn lưu được; không có tiêu chí thì không bịa', () => {
    const { unmount } = show({ criterion: criterion({ key: 'tinh_dung', description: 'Tính đúng đắn', maxPoints: 4 }) });
    expect(screen.getByText(/“Tính đúng đắn” tối đa 4,0 điểm/)).toBeInTheDocument();
    expect(screen.getByText(/Điểm trừ cao hơn mức tối đa vẫn lưu được/)).toBeInTheDocument();
    unmount();
    show();
    expect(screen.queryByText(/tối đa 4,0/)).not.toBeInTheDocument();
  });

  it('"Huỷ" đóng mà không lưu', () => {
    const { onClose } = show();
    fireEvent.click(screen.getByRole('button', { name: 'Huỷ' }));
    expect(onClose).toHaveBeenCalled();
    expect(saveMutate).not.toHaveBeenCalled();
  });
});
