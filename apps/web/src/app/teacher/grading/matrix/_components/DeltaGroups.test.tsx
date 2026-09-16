import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { DeltaGroups } from './DeltaGroups';
import { agreed, noAdvocate, rubric, withAdvocate } from './fixtures';

const mixed = [withAdvocate, noAdvocate, agreed];

describe('DeltaGroups', () => {
  it('đếm đúng bốn nhóm', () => {
    render(<DeltaGroups results={mixed} rubric={rubric} active="large" onChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: /Lệch trên 1,5 điểm/ })).toHaveTextContent('1');
    expect(screen.getByRole('button', { name: /Chưa có ý kiến phản biện/ })).toHaveTextContent('1');
    expect(screen.getByRole('button', { name: /Không lệch/ })).toHaveTextContent('1');
  });

  it('nhóm không lệch nói rõ vì sao bài vẫn bị giữ lại', () => {
    render(<DeltaGroups results={mixed} rubric={rubric} active="zero" onChange={vi.fn()} />);
    expect(
      screen.getByText(/lý do kỹ thuật, không phải vì hai bên bất đồng/i),
    ).toBeInTheDocument();
  });

  it('bấm một nhóm thì báo ra ngoài', () => {
    const onChange = vi.fn();
    render(<DeltaGroups results={mixed} rubric={rubric} active="large" onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: /Không lệch/ }));
    expect(onChange).toHaveBeenCalledWith('zero');
  });
});
