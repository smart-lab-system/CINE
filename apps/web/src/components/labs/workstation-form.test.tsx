import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { WorkstationForm } from './workstation-form';

describe('WorkstationForm', () => {
  it('rejects an invalid asset code and hostname', async () => {
    const onSubmit = vi.fn();
    render(<WorkstationForm onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText(/mã tài sản/i), {
      target: { value: '?' },
    });
    fireEvent.change(screen.getByLabelText(/hostname/i), {
      target: { value: '' },
    });
    fireEvent.click(screen.getByRole('button', { name: /lưu/i }));

    await waitFor(() => {
      expect(screen.getByText(/mã tài sản không hợp lệ/i)).toBeInTheDocument();
      expect(screen.getByText(/hostname không hợp lệ/i)).toBeInTheDocument();
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits valid values with master (Instructor PC) type', async () => {
    const onSubmit = vi.fn();
    render(<WorkstationForm onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText(/mã tài sản/i), {
      target: { value: 'WS-01' },
    });
    fireEvent.change(screen.getByLabelText(/hostname/i), {
      target: { value: 'pc-master-01' },
    });
    fireEvent.change(screen.getByLabelText(/loại máy/i), {
      target: { value: 'master' },
    });
    fireEvent.click(screen.getByRole('button', { name: /lưu/i }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          assetCode: 'WS-01',
          hostname: 'pc-master-01',
          type: 'master',
          isEnabled: true,
          status: 'available',
        }),
      );
    });
  });

  it('defaults type to client (Student PC)', async () => {
    const onSubmit = vi.fn();
    render(<WorkstationForm onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText(/mã tài sản/i), {
      target: { value: 'WS-02' },
    });
    fireEvent.change(screen.getByLabelText(/hostname/i), {
      target: { value: 'pc-student-02' },
    });
    fireEvent.click(screen.getByRole('button', { name: /lưu/i }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          assetCode: 'WS-02',
          hostname: 'pc-student-02',
          type: 'client',
        }),
      );
    });
  });
});
