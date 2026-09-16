import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { NotBuiltYetPanel } from './NotBuiltYetPanel';

describe('NotBuiltYetPanel', () => {
  it('nút bên trong luôn bị tắt', () => {
    render(
      <NotBuiltYetPanel title="Điều khiển hàng đợi" missing="Chưa có đường gọi từ đây.">
        <button type="button">Tạm dừng</button>
      </NotBuiltYetPanel>,
    );
    expect(screen.getByRole('button', { name: 'Tạm dừng' })).toBeDisabled();
  });

  it('tắt cả control THÊM VÀO SAU, không chỉ control có sẵn', () => {
    // `<fieldset disabled>` là lý do: gắn `disabled` từng nút sẽ để lọt cái
    // nào đó, và cái lọt sẽ gọi một route không tồn tại.
    render(
      <NotBuiltYetPanel title="Hàng đợi" missing="x">
        <button type="button">A</button>
        <button type="button">B</button>
        <input aria-label="ô nhập" />
      </NotBuiltYetPanel>,
    );
    expect(screen.getByRole('button', { name: 'A' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'B' })).toBeDisabled();
    expect(screen.getByLabelText('ô nhập')).toBeDisabled();
  });

  it('nói rõ còn thiếu gì, không im lặng', () => {
    render(
      <NotBuiltYetPanel
        title="Chấm thử trước"
        missing="Hiện chỉ chấm được cả phiên một lượt."
      />,
    );
    expect(screen.getByText(/chưa có/i)).toBeInTheDocument();
    expect(screen.getByText('Hiện chỉ chấm được cả phiên một lượt.')).toBeInTheDocument();
  });
});
