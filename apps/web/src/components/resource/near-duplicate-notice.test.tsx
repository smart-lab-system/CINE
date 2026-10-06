import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { NearDuplicateError } from '@/lib/api/http-error';
import { NearDuplicateNotice } from './near-duplicate-notice';

const error = new NearDuplicateError('Phòng "H303" gần giống "Phòng H3.03".', [
  { id: 'r1', name: 'Phòng H3.03' },
  { id: 'r2', name: 'Phòng H3-03' },
]);

describe('NearDuplicateNotice', () => {
  it('nêu từng mục gần giống và câu của server', () => {
    render(<NearDuplicateNotice error={error} noun="phòng" onConfirm={vi.fn()} confirming={false} />);

    expect(screen.getByText(/gần giống/i)).toBeInTheDocument();
    expect(screen.getByText('Phòng H3.03')).toBeInTheDocument();
    expect(screen.getByText('Phòng H3-03')).toBeInTheDocument();
  });

  it('nút xác nhận nêu đúng loại và gọi onConfirm', () => {
    const onConfirm = vi.fn();
    render(<NearDuplicateNotice error={error} noun="phòng" onConfirm={onConfirm} confirming={false} />);

    fireEvent.click(screen.getByRole('button', { name: /vẫn thêm phòng này/i }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('đang gửi lại: nút bị khoá để không bấm hai lần', () => {
    render(<NearDuplicateNotice error={error} noun="mã lớp danh nghĩa" onConfirm={vi.fn()} confirming />);
    expect(screen.getByRole('button', { name: /vẫn thêm mã lớp danh nghĩa này/i })).toBeDisabled();
  });

  it('không có mục nào trong danh sách (server không gửi) thì vẫn hiện câu và nút', () => {
    render(
      <NearDuplicateNotice
        error={new NearDuplicateError('Có mục gần giống.', [])}
        noun="phòng"
        onConfirm={vi.fn()}
        confirming={false}
      />,
    );
    expect(screen.getByText('Có mục gần giống.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /vẫn thêm/i })).toBeInTheDocument();
  });
});
