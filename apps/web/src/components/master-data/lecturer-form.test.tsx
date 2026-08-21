import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { LecturerForm } from './lecturer-form';

describe('LecturerForm', () => {
  it('submits parsed values on valid input', async () => {
    const onSubmit = vi.fn();
    render(<LecturerForm onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText(/mã giảng viên/i), { target: { value: 'GV001' } });
    fireEvent.change(screen.getByLabelText(/họ tên/i), { target: { value: 'Nguyễn Văn A' } });
    fireEvent.click(screen.getByRole('button', { name: /lưu/i }));

    // handleSubmit() calls onSubmit(values, event) — asserting on the
    // first recorded argument avoids an exact-arg-count mismatch.
    await waitFor(() =>
      expect(onSubmit.mock.calls[0]?.[0]).toEqual(
        expect.objectContaining({ employeeCode: 'GV001', fullName: 'Nguyễn Văn A' }),
      ),
    );
  });

  it('rejects a missing full name', async () => {
    const onSubmit = vi.fn();
    render(<LecturerForm onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText(/mã giảng viên/i), { target: { value: 'GV001' } });
    fireEvent.click(screen.getByRole('button', { name: /lưu/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
