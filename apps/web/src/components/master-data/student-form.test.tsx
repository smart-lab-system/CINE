import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { StudentForm } from './student-form';

describe('StudentForm', () => {
  it('submits parsed values on valid input', async () => {
    const onSubmit = vi.fn();
    render(<StudentForm onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText(/mã số sinh viên/i), { target: { value: 'SV001' } });
    fireEvent.change(screen.getByLabelText(/họ tên/i), { target: { value: 'Trần Thị B' } });
    fireEvent.change(screen.getByLabelText(/năm nhập học/i), { target: { value: '2020' } });
    fireEvent.click(screen.getByRole('button', { name: /lưu/i }));

    // handleSubmit() calls onSubmit(values, event) — asserting on the
    // first recorded argument avoids an exact-arg-count mismatch.
    await waitFor(() =>
      expect(onSubmit.mock.calls[0]?.[0]).toEqual(
        expect.objectContaining({ studentCode: 'SV001', fullName: 'Trần Thị B', cohortYear: 2020 }),
      ),
    );
  });

  it('rejects a student code shorter than 3 characters', async () => {
    const onSubmit = vi.fn();
    render(<StudentForm onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText(/mã số sinh viên/i), { target: { value: 'SV' } });
    fireEvent.change(screen.getByLabelText(/họ tên/i), { target: { value: 'Trần Thị B' } });
    fireEvent.click(screen.getByRole('button', { name: /lưu/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
