import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AccountsPage from './page';

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
  // The real provider lives in (dashboard)/layout.tsx; retries off so a
  // failing query settles on the first attempt.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AccountsPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  get.mockReset();
});

describe('AccountsPage fetch states', () => {
  it('shows a loading state before the accounts arrive', async () => {
    get.mockReturnValue(new Promise(() => {})); // never settles

    renderPage();

    expect(screen.getByText(/đang tải/i)).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('shows an error message instead of an empty table when the request is rejected', async () => {
    // What a stale/forged access_token actually produces: the middleware's
    // existence-only cookie check lets the page render, then the API 401s.
    get.mockResolvedValue({
      error: { statusCode: 401, message: 'Unauthorized' },
      response: new Response(null, { status: 401 }),
    });

    renderPage();

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        /không tải được danh sách tài khoản/i,
      ),
    );
    // The table — which would otherwise look exactly like "no accounts yet" —
    // must not be on screen.
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('shows an error message when the response body is empty but the status is not ok', async () => {
    // openapi-fetch leaves `error` undefined for a body-less failure, so the
    // status check is the only thing standing between this and a silently
    // empty table.
    get.mockResolvedValue({
      response: new Response(null, { status: 500 }),
    });

    renderPage();

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  });

  it('hides the create-account form when the request fails (login-redirect fix)', async () => {
    // AccountsController is @Roles('admin')-only, so a non-admin gets
    // exactly this 403 shape. Before this fix the "Tạo tài khoản mới" form
    // rendered anyway, unconditionally, right below the error card.
    get.mockResolvedValue({
      error: { statusCode: 403, message: 'Forbidden' },
      response: new Response(null, { status: 403 }),
    });

    renderPage();

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.queryByText(/tạo tài khoản mới/i)).not.toBeInTheDocument();
  });

  it('renders the returned accounts on success', async () => {
    get.mockResolvedValue({
      data: {
        items: [
          {
            id: 'a1',
            name: 'Nguyễn Văn A',
            email: 'nguyenvana@example.com',
            role: 'teacher',
          },
        ],
        total: 1,
      },
      response: new Response(null, { status: 200 }),
    });

    renderPage();

    await waitFor(() =>
      expect(screen.getByText('nguyenvana@example.com')).toBeInTheDocument(),
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
