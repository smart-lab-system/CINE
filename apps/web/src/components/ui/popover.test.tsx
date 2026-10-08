import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { Popover } from './popover';

const mount = (open: boolean, onOpenChange = vi.fn()) =>
  render(
    <div>
      <button type="button">ngoài</button>
      <Popover open={open} onOpenChange={onOpenChange} label="Sửa điểm trừ" anchor={<button type="button">mở</button>}>
        <input aria-label="trong" />
      </Popover>
    </div>,
  );

describe('Popover', () => {
  it('đóng thì không có nội dung', () => {
    mount(false);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'mở' })).toBeInTheDocument();
  });

  it('mở thì có hộp thoại mang nhãn', () => {
    mount(true);
    expect(screen.getByRole('dialog', { name: 'Sửa điểm trừ' })).toBeInTheDocument();
  });

  it('bấm ra ngoài thì đóng; bấm bên trong thì không', () => {
    const onOpenChange = vi.fn();
    mount(true, onOpenChange);
    fireEvent.mouseDown(screen.getByLabelText('trong'));
    expect(onOpenChange).not.toHaveBeenCalled();
    fireEvent.mouseDown(screen.getByRole('button', { name: 'ngoài' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('Esc đóng và trả tiêu điểm về nút neo', () => {
    const onOpenChange = vi.fn();
    mount(true, onOpenChange);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(screen.getByRole('button', { name: 'mở' })).toHaveFocus();
  });

  it('không lắng nghe gì khi đang đóng (không đóng nhầm cái khác)', () => {
    const onOpenChange = vi.fn();
    mount(false, onOpenChange);
    fireEvent.mouseDown(document.body);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
