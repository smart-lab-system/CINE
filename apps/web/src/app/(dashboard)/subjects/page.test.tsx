import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../../../lib/api-client', () => ({
  apiClient: {
    GET: vi.fn(),
    POST: vi.fn(),
    PATCH: vi.fn(),
    DELETE: vi.fn(),
  },
}));

import { apiClient } from '../../../lib/api-client';
import SubjectsPage from './page';

describe('SubjectsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows an error state when the list request fails', async () => {
    vi.mocked(apiClient.GET).mockResolvedValue({
      data: undefined,
      error: { message: 'unauthorized' },
      response: { ok: false, status: 401 } as Response,
    } as never);

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={client}>
        <SubjectsPage />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(
        screen.getByText(/không tải được danh sách môn học/i),
      ).toBeInTheDocument();
    });
  });

  it('shows a link to create a new subject instead of an inline form', async () => {
    vi.mocked(apiClient.GET).mockResolvedValue({
      data: { items: [], total: 0 },
      error: undefined,
      response: { ok: true, status: 200 } as Response,
    } as never);

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={client}>
        <SubjectsPage />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(
        screen.getByRole('link', { name: /thêm mới/i }),
      ).toHaveAttribute('href', '/subjects/new');
    });
    expect(screen.queryByText(/thêm môn học/i)).not.toBeInTheDocument();
  });
});
