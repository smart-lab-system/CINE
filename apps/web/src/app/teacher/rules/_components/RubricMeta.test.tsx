import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { RubricMeta } from './RubricMeta';
import { overview, session } from './fixtures';

describe('RubricMeta', () => {
  it('điểm tổng, số tiêu chí và nút sửa tiêu chí — không có chữ "phiên bản"', () => {
    const onEdit = vi.fn();
    render(<RubricMeta overview={overview()} onEdit={onEdit} />);
    expect(screen.getByText(/10,0/)).toBeInTheDocument();
    expect(screen.getByText(/3 tiêu chí/)).toBeInTheDocument();
    expect(screen.queryByText(/phiên bản/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Sửa tiêu chí & điểm tối đa/ }));
    expect(onEdit).toHaveBeenCalled();
  });

  it('chưa gắn phiên nào thì nói vậy', () => {
    render(<RubricMeta overview={overview({ sessions: [] })} onEdit={vi.fn()} />);
    expect(screen.getByText(/chưa gắn phiên thi nào/)).toBeInTheDocument();
  });

  it('liệt kê phiên kèm trạng thái, chặn trần ở 3 phiên', () => {
    const sessions = [
      session({ id: 'a', name: 'Ca sáng', state: 'grading' }),
      session({ id: 'b', name: 'Ca chiều', state: 'finalized' }),
      session({ id: 'c', name: 'Ca tối', state: 'not_started' }),
      session({ id: 'd', name: 'Ca khuya', state: 'grading' }),
      session({ id: 'e', name: 'Ca nữa', state: 'grading' }),
    ];
    render(<RubricMeta overview={overview({ sessions })} onEdit={vi.fn()} />);
    expect(screen.getByText('Ca sáng')).toBeInTheDocument();
    expect(screen.getByText('đang chấm', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByText('đã chốt')).toBeInTheDocument();
    expect(screen.queryByText('Ca khuya')).not.toBeInTheDocument();
    expect(screen.getByText(/và 2 phiên khác/)).toBeInTheDocument();
  });
});
