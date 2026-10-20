import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ApproveBundleDialog } from './ApproveBundleDialog';

const h = vi.hoisted(() => ({
  detail: { data: undefined as unknown, isLoading: false, isError: false, error: null as Error | null },
  lastArgs: [] as unknown[],
}));
vi.mock('@/hooks/useTestBundleDetail', () => ({
  useTestBundleDetail: (...args: unknown[]) => {
    h.lastArgs = args;
    return h.detail;
  },
}));

const detail = () => ({
  data: {
    id: 'b1',
    version: 2,
    approvedAt: null,
    cases: [
      { caseKey: 'ca1', group: 'co_ban', input: '5\n1 2 3 4 5', expectedOutput: '15', constraintQuote: 'Dòng đầu là n (1 ≤ n ≤ 100)', autoDroppedReason: null },
      { caseKey: 'ca2', group: 'co_ban', input: '1\n7', expectedOutput: '7', constraintQuote: null, autoDroppedReason: null },
      { caseKey: 'ca3', group: 'bien', input: '1\n-3', expectedOutput: '-3', constraintQuote: 'các số có thể âm', autoDroppedReason: null },
      { caseKey: 'ca4', group: 'bien', input: '0', expectedOutput: '', constraintQuote: null, autoDroppedReason: 'không trích được câu nào trong đề' },
    ],
  },
  isLoading: false,
  isError: false,
  error: null,
});

beforeEach(() => {
  h.detail = detail();
});

function setup(over: { open?: boolean } = {}) {
  const onConfirm = vi.fn();
  const onOpenChange = vi.fn();
  render(<ApproveBundleDialog sessionId="s1" bundle={{ id: 'b1', version: 2 }} open={over.open ?? true} onOpenChange={onOpenChange} onConfirm={onConfirm} />);
  return { onConfirm, onOpenChange };
}

const confirmButton = () => screen.getByRole('button', { name: 'Duyệt và ghim phiên bản 2' });

describe('ApproveBundleDialog — duyệt và ghim gộp (mock-up v2, spec G2b §5)', () => {
  it('nêu số ca dùng để chấm (không đếm ca hệ thống đã bỏ) và nói duyệt xong thì bài chấm dùng gói này', () => {
    setup();
    expect(screen.getByRole('dialog')).toHaveTextContent('3 ca dùng để chấm');
    expect(screen.getByRole('dialog')).toHaveTextContent('bài chấm dùng gói này');
  });

  it('luôn nói "khớp nội bộ, chưa chứng tỏ đúng" và không tự nâng độ tin cậy của thước', () => {
    setup();
    expect(screen.getByRole('dialog')).toHaveTextContent('Khớp nội bộ, chưa chứng tỏ đúng');
  });

  it('liệt kê đúng các ca dùng để chấm kèm trích đề; ca bị bỏ không có mặt', () => {
    setup();
    const dialog = within(screen.getByRole('dialog'));
    expect(dialog.getByText('ca1')).toBeInTheDocument();
    expect(dialog.getByText('“Dòng đầu là n (1 ≤ n ≤ 100)”')).toBeInTheDocument();
    expect(dialog.getAllByText('Chưa có trích đề')).toHaveLength(1);
    expect(dialog.queryByText('ca4')).not.toBeInTheDocument();
  });

  it('đánh dấu "Đọc kỹ" ca co_ban đầu tiên và mọi ca bien; ca co_ban thứ hai thì không', () => {
    setup();
    const rowOf = (key: string) => screen.getByText(key).closest('tr') as HTMLElement;
    expect(within(rowOf('ca1')).getByText('Đọc kỹ')).toBeInTheDocument();
    expect(within(rowOf('ca3')).getByText('Đọc kỹ')).toBeInTheDocument();
    expect(within(rowOf('ca2')).queryByText('Đọc kỹ')).not.toBeInTheDocument();
  });

  it('nút xác nhận khoá cho tới khi tích "đã đọc"; tích rồi bấm gọi onConfirm đúng một lần', () => {
    const { onConfirm } = setup();
    expect(confirmButton()).toBeDisabled();

    fireEvent.click(screen.getByRole('checkbox', { name: /Tôi đã đọc các ca cần đọc kỹ/ }));
    expect(confirmButton()).toBeEnabled();
    fireEvent.click(confirmButton());

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('"Để sau" đóng hộp thoại mà không duyệt', () => {
    const { onConfirm, onOpenChange } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Để sau' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('chỉ tải chi tiết gói khi hộp thoại đang mở', () => {
    setup({ open: false });
    expect(h.lastArgs).toEqual(['s1', null]);
  });

  it('đang tải hay tải lỗi: không cho xác nhận, hiện lý do', () => {
    h.detail = { data: undefined, isLoading: true, isError: false, error: null };
    const { unmount } = render(<div />);
    unmount();
    setup();
    expect(screen.getByText(/Đang tải bộ ca/)).toBeInTheDocument();
    expect(confirmButton()).toBeDisabled();
  });

  it('gói không còn ca nào dùng được: không cho duyệt', () => {
    h.detail = {
      data: { id: 'b1', version: 2, approvedAt: null, cases: [{ caseKey: 'x', group: 'bien', input: '', expectedOutput: '', constraintQuote: null, autoDroppedReason: 'bỏ' }] },
      isLoading: false, isError: false, error: null,
    };
    setup();
    fireEvent.click(screen.getByRole('checkbox', { name: /Tôi đã đọc/ }));
    expect(confirmButton()).toBeDisabled();
    expect(screen.getByRole('dialog')).toHaveTextContent('không còn ca nào');
  });
});
