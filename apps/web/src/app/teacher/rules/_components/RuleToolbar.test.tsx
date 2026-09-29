import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { RuleToolbar } from './RuleToolbar';

const counts = { all: 8, unpriced: 3, machine: 6, words: 2 };

function show(over: Partial<React.ComponentProps<typeof RuleToolbar>> = {}) {
  const props = { filter: 'all' as const, onFilter: vi.fn(), counts, query: '', onQuery: vi.fn(), ...over };
  render(<RuleToolbar {...props} />);
  return props;
}

describe('RuleToolbar', () => {
  it('bốn chip, mỗi chip "nhãn · số", nằm trong nhóm có tên', () => {
    show();
    const group = screen.getByRole('group', { name: 'Lọc luật' });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tất cả · 8' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Chưa có giá · 3' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Máy kiểm được · 6' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mô tả bằng lời · 2' })).toBeInTheDocument();
  });

  it('chip đang chọn có aria-pressed=true, các chip khác false — không chỉ truyền tin bằng màu', () => {
    show({ filter: 'unpriced' });
    expect(screen.getByRole('button', { name: 'Chưa có giá · 3' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Tất cả · 8' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('bấm chip gọi onFilter với đúng bộ lọc', () => {
    const { onFilter } = show();
    fireEvent.click(screen.getByRole('button', { name: 'Máy kiểm được · 6' }));
    expect(onFilter).toHaveBeenCalledWith('machine');
  });

  it('ô tìm có nhãn cho trình đọc màn hình và gọi onQuery khi gõ', () => {
    const { onQuery } = show();
    fireEvent.change(screen.getByLabelText('Tìm luật'), { target: { value: 'biên' } });
    expect(onQuery).toHaveBeenCalledWith('biên');
  });
});
