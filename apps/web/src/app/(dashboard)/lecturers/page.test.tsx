import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import LecturersPage from './page';

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
      <LecturersPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  get.mockReset();
});

describe('LecturersPage fetch states', () => {
  it('shows a loading state before the lecturers arrive', async () => {
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
      expect(screen.getByRole('alert')).toHaveTextContent(/không tải được danh sách giảng viên/i),
    );
  });

  it('renders the returned lecturers on success', async () => {
    get.mockResolvedValue({
      data: {
        items: [
          {
            id: 'l1',
            employeeCode: 'GV001',
            fullName: 'Nguyễn Văn A',
            department: 'CNTT',
            academicTitle: 'Tiến sĩ',
          },
        ],
        total: 1,
      },
      response: new Response(null, { status: 200 }),
    });
    renderPage();
    await waitFor(() => expect(screen.getByText('GV001')).toBeInTheDocument());
  });
});
