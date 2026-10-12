import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { Onboarding } from './Onboarding';

describe('Onboarding (chưa có rubric nào)', () => {
  it('dạy cây Rubric → Tiêu chí → Lỗi và thứ tự việc, thay cho ngõ cụt', () => {
    render(<Onboarding onCreate={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Bắt đầu với một rubric' })).toBeInTheDocument();
    expect(screen.getByText('Tạo rubric')).toBeInTheDocument();
    expect(screen.getByText('Thêm lỗi cho từng tiêu chí')).toBeInTheDocument();
    expect(screen.getByText('Gắn rubric vào phiên thi')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Cách các phần ghép lại' })).toBeInTheDocument();
    expect(screen.getByText(/Một lỗi có thể dùng ở nhiều rubric, mỗi rubric có điểm trừ riêng/)).toBeInTheDocument();
  });

  it('"Tạo rubric đầu tiên" mở hộp thoại tạo', () => {
    const onCreate = vi.fn();
    render(<Onboarding onCreate={onCreate} />);
    fireEvent.click(screen.getByRole('button', { name: 'Tạo rubric đầu tiên' }));
    expect(onCreate).toHaveBeenCalled();
  });
});
