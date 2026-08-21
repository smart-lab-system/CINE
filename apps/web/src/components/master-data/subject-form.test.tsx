import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { SubjectForm } from './subject-form';
import { EditSubjectForm } from './edit-subject-form';

describe('SubjectForm', () => {
  it('submits parsed values on valid input', async () => {
    const onSubmit = vi.fn();
    render(<SubjectForm onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText(/mã môn học/i), { target: { value: 'CS101' } });
    fireEvent.change(screen.getByLabelText(/tên môn học/i), {
      target: { value: 'Nhập môn CNTT' },
    });
    fireEvent.click(screen.getByRole('button', { name: /lưu/i }));

    // handleSubmit() calls onSubmit(values, event) — two arguments — so
    // toHaveBeenCalledWith(matcher) alone would require an exact 1-arg call
    // and fail; asserting on the first recorded argument directly avoids
    // that.
    await waitFor(() =>
      expect(onSubmit.mock.calls[0]?.[0]).toEqual(
        expect.objectContaining({ code: 'CS101', name: 'Nhập môn CNTT' }),
      ),
    );
  });

  it('rejects a code that fails the pattern', async () => {
    const onSubmit = vi.fn();
    render(<SubjectForm onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText(/mã môn học/i), { target: { value: '!!' } });
    fireEvent.change(screen.getByLabelText(/tên môn học/i), { target: { value: 'Something' } });
    fireEvent.click(screen.getByRole('button', { name: /lưu/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('EditSubjectForm', () => {
  it('has no code field and submits edited values', async () => {
    const onSubmit = vi.fn();
    render(
      <EditSubjectForm
        defaultValues={{ name: 'Old Name', credits: 3, description: undefined }}
        onSubmit={onSubmit}
        onCancel={() => {}}
      />,
    );

    expect(screen.queryByLabelText(/mã môn học/i)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/tên môn học/i), { target: { value: 'New Name' } });
    fireEvent.click(screen.getByRole('button', { name: /lưu/i }));

    await waitFor(() =>
      expect(onSubmit.mock.calls[0]?.[0]).toEqual(
        expect.objectContaining({ name: 'New Name' }),
      ),
    );
  });
});
