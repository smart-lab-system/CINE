import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { LabForm } from './lab-form';

describe('LabForm', () => {
  it('rejects an invalid lab code', async () => {
    const onSubmit = vi.fn();
    render(<LabForm onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText(/mã phòng/i), {
      target: { value: 'x' },
    });
    fireEvent.change(screen.getByLabelText(/tên phòng/i), {
      target: { value: 'Lab 1' },
    });
    fireEvent.change(screen.getByLabelText(/sức chứa/i), {
      target: { value: '20' },
    });
    fireEvent.click(screen.getByRole('button', { name: /lưu/i }));

    await waitFor(() => {
      expect(screen.getByText(/mã phòng không hợp lệ/i)).toBeInTheDocument();
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits valid values', async () => {
    const onSubmit = vi.fn();
    render(<LabForm onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText(/mã phòng/i), {
      target: { value: 'LAB-01' },
    });
    fireEvent.change(screen.getByLabelText(/tên phòng/i), {
      target: { value: 'Phòng A' },
    });
    fireEvent.change(screen.getByLabelText(/sức chứa/i), {
      target: { value: '40' },
    });
    fireEvent.click(screen.getByRole('button', { name: /lưu/i }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'LAB-01',
          name: 'Phòng A',
          capacity: 40,
        }),
      );
    });
  });
});
