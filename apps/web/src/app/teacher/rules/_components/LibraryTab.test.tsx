import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { LibraryTab } from './LibraryTab';
import { criterion, libraryRule, overview } from './fixtures';

const boards = [
  overview({ rubricName: 'Giữa kỳ CTDL', criteria: [criterion({ key: 'tinh_dung', description: 'Tính đúng đắn' })] }),
  overview({ rubricName: 'Cuối kỳ CTDL', criteria: [criterion({ key: 'tinh_dung', description: 'Tính đúng đắn' })] }),
];
const used = (n: number) => Array.from({ length: n }, (_, i) => ({ rubricName: i === 0 ? 'Giữa kỳ CTDL' : i === 1 ? 'Cuối kỳ CTDL' : `Rubric ${i + 1}`, criterionKey: 'tinh_dung', deduction: i === 2 ? null : '1.50' }));

function mount(over: Partial<React.ComponentProps<typeof LibraryTab>> = {}) {
  const h = { onEdit: vi.fn(), onOpenRubric: vi.fn() };
  render(<LibraryTab rules={[libraryRule({ uses: used(2) })]} loading={false} error={null} overviews={boards} {...h} {...over} />);
  return h;
}

describe('LibraryTab (T-RBE-UI-8)', () => {
  it('nói đây là lỗi dùng chung: sửa ở đây đổi cả các rubric; điểm trừ mỗi rubric một khác', () => {
    mount();
    expect(screen.getByText(/Sửa ở đây là đổi cho tất cả rubric đang dùng lỗi đó/)).toBeInTheDocument();
    expect(screen.getByText(/mỗi rubric một khác/)).toBeInTheDocument();
  });

  it('mỗi lỗi: tên, mô tả, cách phát hiện, và nơi dùng (rubric · tiêu chí · điểm trừ)', () => {
    mount();
    const row = screen.getByText('Sai ca biên').closest('[data-testid="library-row"]') as HTMLElement;
    expect(within(row).getByText('Tự động')).toBeInTheDocument();
    expect(within(row).getByText('Giữa kỳ CTDL · Tính đúng đắn')).toBeInTheDocument();
    expect(within(row).getAllByText('−1,5')).toHaveLength(2);
  });

  it('chưa dùng ở rubric nào thì nói vậy', () => {
    mount({ rules: [libraryRule({ uses: [] })] });
    expect(screen.getByText('Chưa dùng ở rubric nào')).toBeInTheDocument();
  });

  it('chặn trần ba nơi dùng; "và N nơi dùng khác" mở đủ danh sách, bấm một dòng chuyển rubric', () => {
    const h = mount({ rules: [libraryRule({ uses: used(5) })] });
    const row = screen.getByText('Sai ca biên').closest('[data-testid="library-row"]') as HTMLElement;
    expect(within(row).queryByText('Rubric 5 · tiêu chí đã xoá')).not.toBeInTheDocument();
    fireEvent.click(within(row).getByRole('button', { name: 'và 2 nơi dùng khác' }));
    const list = screen.getByRole('dialog', { name: 'Sai ca biên — đang dùng ở 5 nơi' });
    expect(within(list).getByText('Rubric 5')).toBeInTheDocument();
    expect(within(list).getAllByRole('listitem')).toHaveLength(5);
    fireEvent.click(within(list).getByRole('button', { name: /Rubric 5/ }));
    expect(h.onOpenRubric).toHaveBeenCalledWith('Rubric 5');
  });

  it('"Sửa lỗi" gửi đúng lỗi cho ngăn kéo', () => {
    const rule = libraryRule({ id: 'r7' });
    const h = mount({ rules: [rule] });
    fireEvent.click(screen.getByRole('button', { name: 'Sửa lỗi Sai ca biên' }));
    expect(h.onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 'r7' }));
  });

  it('thư viện rỗng, đang tải, lỗi tải', () => {
    const { unmount } = render(<LibraryTab rules={[]} loading={false} error={null} overviews={boards} onEdit={vi.fn()} onOpenRubric={vi.fn()} />);
    expect(screen.getByText(/Thư viện chưa có lỗi nào/)).toBeInTheDocument();
    unmount();
    const second = render(<LibraryTab rules={undefined} loading error={null} overviews={boards} onEdit={vi.fn()} onOpenRubric={vi.fn()} />);
    expect(screen.getByText('Đang tải…')).toBeInTheDocument();
    second.unmount();
    render(<LibraryTab rules={undefined} loading={false} error={new Error('Máy chủ không trả lời')} overviews={boards} onEdit={vi.fn()} onOpenRubric={vi.fn()} />);
    expect(screen.getByText(/Không tải được thư viện lỗi — Máy chủ không trả lời/)).toBeInTheDocument();
  });
});
