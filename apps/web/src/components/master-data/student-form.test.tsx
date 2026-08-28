import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { StudentForm } from './student-form';

describe('StudentForm', () => {
  it('rejects an invalid student code', async () => {
    const onSubmit = vi.fn();
    render(<StudentForm onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText(/mã sinh viên/i), {
      target: { value: 'ab' },
    });
    fireEvent.change(screen.getByLabelText(/họ tên/i), {
      target: { value: 'Nguyen Van A' },
    });
    fireEvent.click(screen.getByRole('button', { name: /lưu/i }));

    await waitFor(() => {
      expect(screen.getByText(/mã sinh viên không hợp lệ/i)).toBeInTheDocument();
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits with valid data', async () => {
    const onSubmit = vi.fn();
    render(<StudentForm onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText(/mã sinh viên/i), {
      target: { value: 'SV001' },
    });
    fireEvent.change(screen.getByLabelText(/họ tên/i), {
      target: { value: 'Nguyen Van A' },
    });
    fireEvent.click(screen.getByRole('button', { name: /lưu/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      studentCode: 'SV001',
      fullName: 'Nguyen Van A',
      status: 'active',
    });
  });
});
