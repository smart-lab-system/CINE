import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MissingRulesPanel } from './MissingRulesPanel';
import { rule } from './fixtures';

const mutate = vi.fn();
let stateError: Error | null;

vi.mock('@/hooks/useRules', () => ({
  useSetRuleState: () => ({
    mutate,
    isPending: false,
    isError: stateError !== null,
    error: stateError,
  }),
}));

const proposed = (id: string, description: string) =>
  rule({
    id,
    ruleKey: `de_xuat_${id}`,
    state: 'proposed',
    origin: 'agent_reported',
    deduction: null,
    revision: { name: description, description, criterionKey: 'chua_gan', predicate: null },
  });

const rules = [
  proposed('p1', 'Trả về mảng mới thay vì sắp xếp tại chỗ'),
  proposed('p2', 'In kết quả trung gian ra màn hình'),
];

beforeEach(() => {
  vi.clearAllMocks();
  stateError = null;
  mutate.mockImplementation((_vars: unknown, opts?: { onSuccess?: (d: unknown) => void }) =>
    opts?.onSuccess?.({ recompute: { recomputed: 3, promoted: 2, demoted: 0, belowFloor: 0 } }),
  );
});

describe('MissingRulesPanel (spec §3.1 "Luật còn thiếu")', () => {
  it('không có luật thiếu → không render gì', () => {
    const { container } = render(<MissingRulesPanel rules={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('nói rõ lỗi này đã bị LOẠI KHỎI ĐIỂM, mỗi luật một thẻ với mô tả của nó', () => {
    render(<MissingRulesPanel rules={rules} />);
    expect(screen.getByRole('heading', { name: 'Luật còn thiếu' })).toBeInTheDocument();
    expect(screen.getByText('loại khỏi điểm')).toBeInTheDocument();
    expect(screen.getByText('Trả về mảng mới thay vì sắp xếp tại chỗ')).toBeInTheDocument();
    expect(screen.getByText('In kết quả trung gian ra màn hình')).toBeInTheDocument();
  });

  it('không lộ thuật ngữ nội bộ "proposed"', () => {
    const { container } = render(<MissingRulesPanel rules={rules} />);
    expect(container.textContent).not.toMatch(/proposed/i);
  });

  it('"Tạo luật từ đây" dẫn sang trang tạo luật kèm id luật đề xuất', () => {
    render(<MissingRulesPanel rules={rules} />);
    const links = screen.getAllByRole('link', { name: 'Tạo luật từ đây' });
    expect(links[0]).toHaveAttribute('href', '/teacher/rules/new?from=p1');
    expect(links[1]).toHaveAttribute('href', '/teacher/rules/new?from=p2');
  });

  it('"Không phải lỗi" hỏi xác nhận trước và chưa gửi gì (Review Focus 5)', () => {
    render(<MissingRulesPanel rules={rules} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Không phải lỗi' })[0]);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/Bài nào đang chờ luật này sẽ được tính lại/)).toBeInTheDocument();
    expect(mutate).not.toHaveBeenCalled();
  });

  it('xác nhận → đánh dấu đúng luật là dismissed rồi đọc kết quả tính lại bằng lời', () => {
    render(<MissingRulesPanel rules={rules} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Không phải lỗi' })[1]);
    fireEvent.click(screen.getByRole('button', { name: 'Đánh dấu không phải lỗi' }));
    expect(mutate).toHaveBeenCalledWith({ ruleId: 'p2', state: 'dismissed' }, expect.anything());
    expect(screen.getByText('Đã tính lại 3 bài: 2 bài đủ điều kiện tự quyết.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('huỷ → không gửi gì và đóng hộp thoại', () => {
    render(<MissingRulesPanel rules={rules} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Không phải lỗi' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Huỷ' }));
    expect(mutate).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('lỗi của server hiện nguyên văn trong hộp thoại', () => {
    stateError = new Error('Không tìm thấy luật');
    render(<MissingRulesPanel rules={rules} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Không phải lỗi' })[0]);
    expect(screen.getByText('Không tìm thấy luật')).toBeInTheDocument();
  });
});
