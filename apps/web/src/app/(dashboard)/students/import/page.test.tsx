import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import StudentsImportPage from './page';

const get = vi.fn();
vi.mock('@/lib/api-client', () => ({
  apiClient: { GET: (...args: unknown[]) => get(...args) },
}));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <StudentsImportPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  get.mockReset();
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ jobId: 'job-1' }),
    }),
  );
});

describe('StudentsImportPage', () => {
  it('shows a validation error when submitting without a file', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: /tải lên/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/chọn một file/i);
  });

  it('uploads a file and renders the completed result', async () => {
    get.mockResolvedValue({
      data: {
        jobId: 'job-1',
        state: 'completed',
        result: { totalRows: 2, created: 1, updated: 1, failed: 0, errors: [] },
        failedReason: null,
      },
      response: new Response(null, { status: 200 }),
    });

    const user = userEvent.setup();
    renderPage();

    const file = new File(['dummy'], 'students.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    await user.upload(screen.getByLabelText(/chọn file excel/i), file);
    await user.click(screen.getByRole('button', { name: /tải lên/i }));

    await waitFor(() => expect(screen.getByText(/tổng số dòng: 2/i)).toBeInTheDocument());
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/students/import'),
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    );
  });

  it('renders per-row errors when the job completes with failures', async () => {
    get.mockResolvedValue({
      data: {
        jobId: 'job-1',
        state: 'completed',
        result: {
          totalRows: 2,
          created: 1,
          updated: 0,
          failed: 1,
          errors: [{ row: 3, studentCode: 'x', message: 'fullName must be a string' }],
        },
        failedReason: null,
      },
      response: new Response(null, { status: 200 }),
    });

    const user = userEvent.setup();
    renderPage();

    const file = new File(['dummy'], 'students.xlsx', { type: 'application/octet-stream' });
    await user.upload(screen.getByLabelText(/chọn file excel/i), file);
    await user.click(screen.getByRole('button', { name: /tải lên/i }));

    await waitFor(() =>
      expect(screen.getByText('fullName must be a string')).toBeInTheDocument(),
    );
  });
});
