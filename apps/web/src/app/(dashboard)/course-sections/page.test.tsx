import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CourseSectionsPage from './page';

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
      <CourseSectionsPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  get.mockReset();
  get.mockResolvedValue({
    data: { items: [] },
    response: new Response(null, { status: 200 }),
  });
});

describe('CourseSectionsPage fetch states', () => {
  it('shows a loading state before the sections arrive', async () => {
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
      expect(screen.getByRole('alert')).toHaveTextContent(
        /không tải được danh sách lớp học phần/i,
      ),
    );
  });

  it('renders the returned sections with joined subject/term display fields', async () => {
    get.mockImplementation((path: string) => {
      if (path === '/course-sections') {
        return Promise.resolve({
          data: {
            items: [
              {
                id: 'cs1',
                sectionCode: 'SEC01',
                nominalClassCode: 'D20CQCE01',
                name: null,
                subject: { id: 'subj1', code: 'CS101', name: 'Nhập môn CNTT' },
                academicTerm: { id: 'term1', code: 'HK1_2026', name: 'Học kỳ 1' },
              },
            ],
            total: 1,
          },
          response: new Response(null, { status: 200 }),
        });
      }
      return Promise.resolve({
        data: { items: [] },
        response: new Response(null, { status: 200 }),
      });
    });

    renderPage();
    await waitFor(() => expect(screen.getByText('SEC01')).toBeInTheDocument());
    expect(screen.getByText(/CS101 — Nhập môn CNTT/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /sinh viên/i })).toHaveAttribute(
      'href',
      '/course-sections/cs1/enrollments',
    );
  });
});
