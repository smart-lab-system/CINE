import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { AccountForm } from './account-form';

describe('AccountForm', () => {
  it('rejects submission when no role is selected', async () => {
    const onSubmit = vi.fn();
    render(<AccountForm onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText(/tên đăng nhập/i), {
      target: { value: 'new_user' },
    });
    fireEvent.change(screen.getByLabelText(/họ tên/i), {
      target: { value: 'New User' },
    });
    fireEvent.change(screen.getByLabelText(/mật khẩu/i), {
      target: { value: 'correct-horse-battery' },
    });
    fireEvent.click(screen.getByRole('button', { name: /lưu/i }));

    await waitFor(() => {
      expect(screen.getByText(/chọn ít nhất một vai trò/i)).toBeInTheDocument();
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits with valid data', async () => {
    const onSubmit = vi.fn();
    render(<AccountForm onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText(/tên đăng nhập/i), {
      target: { value: 'new_user' },
    });
    fireEvent.change(screen.getByLabelText(/họ tên/i), {
      target: { value: 'New User' },
    });
    fireEvent.change(screen.getByLabelText(/mật khẩu/i), {
      target: { value: 'correct-horse-battery' },
    });
    fireEvent.click(screen.getByLabelText(/giảng viên/i));
    fireEvent.click(screen.getByRole('button', { name: /lưu/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      username: 'new_user',
      displayName: 'New User',
      password: 'correct-horse-battery',
      roleCodes: ['lecturer'],
    });
  });
});
