import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ChangePasswordForm } from './change-password-form';

describe('ChangePasswordForm', () => {
  it('submits when password and confirm match', async () => {
    const onSubmit = vi.fn();
    render(<ChangePasswordForm onSubmit={onSubmit} onCancel={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/mật khẩu mới/i), {
      target: { value: 'new-secret-password' },
    });
    fireEvent.change(screen.getByLabelText(/nhập lại mật khẩu/i), {
      target: { value: 'new-secret-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: /đổi mật khẩu/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      password: 'new-secret-password',
      confirmPassword: 'new-secret-password',
    });
  });

  it('rejects when confirm password does not match', async () => {
    const onSubmit = vi.fn();
    render(<ChangePasswordForm onSubmit={onSubmit} onCancel={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/mật khẩu mới/i), {
      target: { value: 'new-secret-password' },
    });
    fireEvent.change(screen.getByLabelText(/nhập lại mật khẩu/i), {
      target: { value: 'different-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: /đổi mật khẩu/i }));

    await waitFor(() =>
      expect(screen.getByText(/mật khẩu nhập lại không khớp/i)).toBeInTheDocument(),
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('calls onCancel when Hủy is clicked', () => {
    const onCancel = vi.fn();
    render(<ChangePasswordForm onSubmit={vi.fn()} onCancel={onCancel} />);

    fireEvent.click(screen.getByRole('button', { name: /hủy/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
