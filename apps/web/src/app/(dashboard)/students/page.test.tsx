import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import StudentsPage from './page';

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
      <StudentsPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  get.mockReset();
});

describe('StudentsPage fetch states', () => {
  it('shows a loading state before the students arrive', async () => {
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
      expect(screen.getByRole('alert')).toHaveTextContent(/không tải được danh sách sinh viên/i),
    );
  });

  it('renders the returned students on success', async () => {
    get.mockResolvedValue({
      data: {
        items: [
          {
            id: 'st1',
            studentCode: 'SV001',
            fullName: 'Trần Thị B',
            dateOfBirth: null,
            classCode: 'D20CQCE01',
            cohortYear: 2020,
          },
        ],
        total: 1,
      },
      response: new Response(null, { status: 200 }),
    });
    renderPage();
    await waitFor(() => expect(screen.getByText('SV001')).toBeInTheDocument());
  });
});
