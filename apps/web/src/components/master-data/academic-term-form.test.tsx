import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { AcademicTermForm } from './academic-term-form';

describe('AcademicTermForm', () => {
  it('submits parsed values on valid input', async () => {
    const onSubmit = vi.fn();
    render(<AcademicTermForm onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText(/mã học kỳ/i), { target: { value: 'HK1_2026' } });
    fireEvent.change(screen.getByLabelText(/tên học kỳ/i), { target: { value: 'Học kỳ 1' } });
    fireEvent.change(screen.getByLabelText(/ngày bắt đầu/i), { target: { value: '2026-09-01' } });
    fireEvent.change(screen.getByLabelText(/ngày kết thúc/i), { target: { value: '2027-01-15' } });
    fireEvent.click(screen.getByRole('button', { name: /lưu/i }));

    // handleSubmit() calls onSubmit(values, event) — asserting on the
    // first recorded argument avoids an exact-arg-count mismatch.
    await waitFor(() =>
      expect(onSubmit.mock.calls[0]?.[0]).toEqual(
        expect.objectContaining({ code: 'HK1_2026', startsOn: '2026-09-01', endsOn: '2027-01-15' }),
      ),
    );
  });

  it('rejects an end date before the start date', async () => {
    const onSubmit = vi.fn();
    render(<AcademicTermForm onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText(/mã học kỳ/i), { target: { value: 'HK1_2026' } });
    fireEvent.change(screen.getByLabelText(/tên học kỳ/i), { target: { value: 'Học kỳ 1' } });
    fireEvent.change(screen.getByLabelText(/ngày bắt đầu/i), { target: { value: '2027-01-15' } });
    fireEvent.change(screen.getByLabelText(/ngày kết thúc/i), { target: { value: '2026-09-01' } });
    fireEvent.click(screen.getByRole('button', { name: /lưu/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
