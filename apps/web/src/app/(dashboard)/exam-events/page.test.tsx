import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    GET: vi.fn(),
    POST: vi.fn(),
    PATCH: vi.fn(),
    DELETE: vi.fn(),
  },
}));

import { apiClient } from '@/lib/api-client';
import ExamEventsPage from './page';

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ExamEventsPage />
    </QueryClientProvider>,
  );
}

const emptySubjects = {
  data: { items: [], total: 0 },
  error: undefined,
  response: { ok: true, status: 200 },
};

beforeEach(() => {
  vi.mocked(apiClient.GET).mockReset();
});

describe('ExamEventsPage', () => {
  it('shows a loading state before events arrive', () => {
    vi.mocked(apiClient.GET).mockImplementation((path) => {
      if (path === '/subjects') return Promise.resolve(emptySubjects as never);
      return new Promise(() => {});
    });

    renderPage();

    expect(screen.getByText(/đang tải/i)).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('shows an error instead of an empty table when the request fails', async () => {
    vi.mocked(apiClient.GET).mockImplementation((path) => {
      if (path === '/subjects') return Promise.resolve(emptySubjects as never);
      return Promise.resolve({
        data: undefined,
        error: { message: 'unauthorized' },
        response: { ok: false, status: 401 },
      } as never);
    });

    renderPage();

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        /không tải được danh sách kỳ thi/i,
      ),
    );
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('renders returned events with status badges and a create link', async () => {
    vi.mocked(apiClient.GET).mockImplementation((path) => {
      if (path === '/subjects') return Promise.resolve(emptySubjects as never);
      return Promise.resolve({
        data: {
          items: [
            {
              id: 'e1',
              code: 'GK-OS-01',
              title: 'Giữa kỳ OS',
              subjectId: 'sub-1',
              sessionType: 'exam',
              scheduledStartAt: '2026-08-27T08:00:00.000Z',
              scheduledEndAt: '2026-08-27T11:00:00.000Z',
              durationMinutes: 90,
              status: 'draft',
              rowVersion: 1,
            },
          ],
          total: 1,
        },
        error: undefined,
        response: { ok: true, status: 200 },
      } as never);
    });

    renderPage();

    await waitFor(() =>
      expect(screen.getByText('GK-OS-01')).toBeInTheDocument(),
    );
    expect(screen.getAllByText('Nháp').length).toBeGreaterThan(0);
    expect(screen.getByText('Thi')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /thêm mới/i }),
    ).toHaveAttribute('href', '/exam-events/new');
  });
});
