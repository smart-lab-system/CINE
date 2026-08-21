import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SubjectsPage from './page';

const get = vi.fn();
vi.mock('@/lib/api-client', () => ({
  apiClient: {
    GET: (...args: unknown[]) => get(...args),
    POST: vi.fn(),
    PATCH: vi.fn(),
    DELETE: vi.fn(),
  },
}));

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <SubjectsPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  get.mockReset();
});

describe('SubjectsPage fetch states', () => {
  it('shows a loading state before the subjects arrive', async () => {
    get.mockReturnValue(new Promise(() => {}));

    renderPage();

    expect(screen.getByText(/đang tải/i)).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('shows an error message instead of an empty table when the request is rejected', async () => {
    get.mockResolvedValue({
      error: { statusCode: 401, message: 'Unauthorized' },
      response: new Response(null, { status: 401 }),
    });

    renderPage();

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        /không tải được danh sách môn học/i,
      ),
    );
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('renders the returned subjects on success', async () => {
    get.mockResolvedValue({
      data: {
        items: [{ id: 's1', code: 'CS101', name: 'Nhập môn CNTT', credits: 3, description: null }],
        total: 1,
      },
      response: new Response(null, { status: 200 }),
    });

    renderPage();

    await waitFor(() => expect(screen.getByText('CS101')).toBeInTheDocument());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
