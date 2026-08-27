import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { AccountForm } from './account-form';

function fillCommonFields() {
  fireEvent.change(screen.getByLabelText(/họ tên/i), {
    target: { value: 'New User' },
  });
  fireEvent.change(screen.getByLabelText(/email/i), {
    target: { value: 'new-user@example.com' },
  });
  fireEvent.change(screen.getByLabelText(/mật khẩu/i), {
    target: { value: 'correct-horse-battery' },
  });
}

// Role is now a shadcn/Radix Select (was raw radio inputs) — open it via
// its trigger (role="combobox", labelled by the "Vai trò" <Label>) and
// pick the option by its rendered text.
function selectRole(name: RegExp) {
  fireEvent.click(screen.getByRole('combobox', { name: /vai trò/i }));
  fireEvent.click(screen.getByRole('option', { name }));
}

describe('AccountForm', () => {
  it('rejects submission with an invalid email', async () => {
    const onSubmit = vi.fn();
    render(<AccountForm onSubmit={onSubmit} />);

    fillCommonFields();
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'not-an-email' },
    });
    fireEvent.click(screen.getByRole('button', { name: /lưu/i }));

    await waitFor(() => expect(onSubmit).not.toHaveBeenCalled());
  });

  it('submits with valid data, defaulting to the teacher role', async () => {
    const onSubmit = vi.fn();
    render(<AccountForm onSubmit={onSubmit} />);

    fillCommonFields();
    fireEvent.click(screen.getByRole('button', { name: /lưu/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      name: 'New User',
      email: 'new-user@example.com',
      password: 'correct-horse-battery',
      role: 'teacher',
    });
  });

  it('submits the admin role when selected', async () => {
    const onSubmit = vi.fn();
    render(<AccountForm onSubmit={onSubmit} />);

    fillCommonFields();
    selectRole(/quản trị/i);
    fireEvent.click(screen.getByRole('button', { name: /lưu/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ role: 'admin' });
  });
});
