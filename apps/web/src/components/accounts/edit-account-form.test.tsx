import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { EditAccountForm } from './edit-account-form';

describe('EditAccountForm', () => {
  const defaultValues = {
    name: 'Existing User',
    role: 'teacher' as const,
  };

  it("pre-fills the form with the account's current values", () => {
    render(
      <EditAccountForm defaultValues={defaultValues} onSubmit={vi.fn()} onCancel={vi.fn()} />,
    );

    expect(screen.getByLabelText(/họ tên/i)).toHaveValue('Existing User');
    expect(screen.getByLabelText(/giảng viên/i)).toBeChecked();
  });

  it('submits the edited values', async () => {
    const onSubmit = vi.fn();
    render(
      <EditAccountForm defaultValues={defaultValues} onSubmit={onSubmit} onCancel={vi.fn()} />,
    );

    fireEvent.change(screen.getByLabelText(/họ tên/i), {
      target: { value: 'Updated Name' },
    });
    fireEvent.click(screen.getByLabelText(/quản trị/i));
    fireEvent.click(screen.getByRole('button', { name: /lưu/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      name: 'Updated Name',
      role: 'admin',
    });
  });

  it('calls onCancel when Hủy is clicked', () => {
    const onCancel = vi.fn();
    render(
      <EditAccountForm defaultValues={defaultValues} onSubmit={vi.fn()} onCancel={onCancel} />,
    );

    fireEvent.click(screen.getByRole('button', { name: /hủy/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
