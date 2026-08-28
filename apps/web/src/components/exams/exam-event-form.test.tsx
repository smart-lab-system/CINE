import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ExamEventForm } from './exam-event-form';

const SUBJECT_ID = '11111111-1111-4111-8111-111111111111';

const subjects = [
  { id: SUBJECT_ID, code: 'OS', name: 'Hệ điều hành' },
];

function fillValidFields() {
  fireEvent.change(screen.getByLabelText(/môn học/i), {
    target: { value: SUBJECT_ID },
  });
  fireEvent.change(screen.getByLabelText(/mã đề thi/i), {
    target: { value: 'GK-OS-01' },
  });
  fireEvent.change(screen.getByLabelText(/tiêu đề/i), {
    target: { value: 'Giữa kỳ Hệ điều hành' },
  });
  fireEvent.change(screen.getByLabelText(/loại/i), {
    target: { value: 'exam' },
  });
  fireEvent.change(screen.getByLabelText(/bắt đầu/i), {
    target: { value: '2026-08-27T08:00' },
  });
  fireEvent.change(screen.getByLabelText(/kết thúc/i), {
    target: { value: '2026-08-27T11:00' },
  });
  fireEvent.change(screen.getByLabelText(/thời lượng/i), {
    target: { value: '90' },
  });
}

describe('ExamEventForm', () => {
  it('rejects an invalid exam code', async () => {
    const onSubmit = vi.fn();
    render(<ExamEventForm subjects={subjects} onSubmit={onSubmit} />);

    fillValidFields();
    fireEvent.change(screen.getByLabelText(/mã đề thi/i), {
      target: { value: 'x' },
    });
    fireEvent.click(screen.getByRole('button', { name: /lưu/i }));

    await waitFor(() => {
      expect(screen.getByText(/mã đề thi không hợp lệ/i)).toBeInTheDocument();
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits ISO window times and valid values', async () => {
    const onSubmit = vi.fn();
    render(<ExamEventForm subjects={subjects} onSubmit={onSubmit} />);

    fillValidFields();
    fireEvent.click(screen.getByRole('button', { name: /lưu/i }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      code: 'GK-OS-01',
      title: 'Giữa kỳ Hệ điều hành',
      subjectId: SUBJECT_ID,
      sessionType: 'exam',
      durationMinutes: 90,
    });
    expect(onSubmit.mock.calls[0][0].scheduledStartAt).toMatch(
      /^\d{4}-\d{2}-\d{2}T/,
    );
    expect(onSubmit.mock.calls[0][0].scheduledEndAt).toMatch(
      /^\d{4}-\d{2}-\d{2}T/,
    );
  });
});
