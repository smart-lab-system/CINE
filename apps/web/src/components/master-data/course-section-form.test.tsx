import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CourseSectionForm } from './course-section-form';

const SUBJECT_ID = '11111111-1111-1111-1111-111111111111';
const TERM_ID = '22222222-2222-2222-2222-222222222222';

const get = vi.fn();
vi.mock('@/lib/api-client', () => ({
  apiClient: { GET: (...args: unknown[]) => get(...args) },
}));

function renderForm(onSubmit = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <CourseSectionForm onSubmit={onSubmit} />
    </QueryClientProvider>,
  );
  return onSubmit;
}

beforeEach(() => {
  get.mockReset();
  get.mockImplementation((path: string) => {
    if (path === '/subjects') {
      return Promise.resolve({
        data: { items: [{ id: SUBJECT_ID, code: 'CS101', name: 'Nhập môn CNTT' }] },
        response: new Response(null, { status: 200 }),
      });
    }
    if (path === '/academic-terms') {
      return Promise.resolve({
        data: { items: [{ id: TERM_ID, code: 'HK1_2026', name: 'Học kỳ 1' }] },
        response: new Response(null, { status: 200 }),
      });
    }
    return Promise.resolve({
      data: { items: [] },
      response: new Response(null, { status: 200 }),
    });
  });
});

describe('CourseSectionForm', () => {
  it('submits parsed values once subject/term options load', async () => {
    const onSubmit = renderForm();

    await waitFor(() => expect(screen.getByText(/CS101/)).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/môn học/i), { target: { value: SUBJECT_ID } });
    fireEvent.change(screen.getByLabelText(/học kỳ/i), { target: { value: TERM_ID } });
    fireEvent.change(screen.getByLabelText(/mã lớp học phần/i), { target: { value: 'SEC01' } });
    fireEvent.click(screen.getByRole('button', { name: /lưu/i }));

    // handleSubmit() calls onSubmit(values, event) — asserting on the
    // first recorded argument avoids an exact-arg-count mismatch.
    await waitFor(() =>
      expect(onSubmit.mock.calls[0]?.[0]).toEqual(
        expect.objectContaining({
          subjectId: SUBJECT_ID,
          academicTermId: TERM_ID,
          sectionCode: 'SEC01',
        }),
      ),
    );
  });

  it('rejects submitting without choosing a subject', async () => {
    const onSubmit = renderForm();
    await waitFor(() => expect(screen.getByText(/CS101/)).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/học kỳ/i), { target: { value: TERM_ID } });
    fireEvent.change(screen.getByLabelText(/mã lớp học phần/i), { target: { value: 'SEC01' } });
    fireEvent.click(screen.getByRole('button', { name: /lưu/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
