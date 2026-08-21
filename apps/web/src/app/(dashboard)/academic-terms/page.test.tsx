import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AcademicTermsPage from './page';

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
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AcademicTermsPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  get.mockReset();
});

describe('AcademicTermsPage fetch states', () => {
  it('shows a loading state before the terms arrive', async () => {
    get.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByText(/đang tải/i)).toBeInTheDocument();
  });

  it('shows an error message instead of an empty table when the request is rejected', async () => {
    get.mockResolvedValue({
      error: { statusCode: 401, message: 'Unauthorized' },
      response: new Response(null, { status: 401 }),
    });
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/không tải được danh sách học kỳ/i),
    );
  });

  it('renders the returned terms on success', async () => {
    get.mockResolvedValue({
      data: {
        items: [
          {
            id: 't1',
            code: 'HK1_2026',
            name: 'Học kỳ 1',
            startsOn: '2026-09-01',
            endsOn: '2027-01-15',
            isActive: true,
          },
        ],
        total: 1,
      },
      response: new Response(null, { status: 200 }),
    });
    renderPage();
    await waitFor(() => expect(screen.getByText('HK1_2026')).toBeInTheDocument());
    expect(screen.getByText('Đang mở')).toBeInTheDocument();
  });
});
