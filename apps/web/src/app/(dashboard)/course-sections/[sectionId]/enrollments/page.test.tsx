import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CourseSectionEnrollmentsPage from './page';

vi.mock('next/navigation', () => ({
  useParams: () => ({ sectionId: 'section-1' }),
}));

const get = vi.fn();
const post = vi.fn();
const del = vi.fn();
vi.mock('@/lib/api-client', () => ({
  apiClient: {
    GET: (...args: unknown[]) => get(...args),
    POST: (...args: unknown[]) => post(...args),
    DELETE: (...args: unknown[]) => del(...args),
  },
}));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <CourseSectionEnrollmentsPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  get.mockReset();
  post.mockReset();
  del.mockReset();
});

describe('CourseSectionEnrollmentsPage', () => {
  it('lists currently enrolled students', async () => {
    get.mockImplementation((path: string) => {
      if (path === '/course-sections/{sectionId}/enrollments') {
        return Promise.resolve({
          data: {
            items: [
              {
                id: 'e1',
                enrolledAt: '2026-08-21T00:00:00.000Z',
                student: { id: 'st1', studentCode: 'SV001', fullName: 'Trần Thị B' },
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

    await waitFor(() => expect(screen.getByText('SV001')).toBeInTheDocument());
  });

  it('searches for a student and enrolls them', async () => {
    get.mockImplementation((path: string) => {
      if (path === '/course-sections/{sectionId}/enrollments') {
        return Promise.resolve({
          data: { items: [], total: 0 },
          response: new Response(null, { status: 200 }),
        });
      }
      if (path === '/students') {
        return Promise.resolve({
          data: { items: [{ id: 'st2', studentCode: 'SV002', fullName: 'Lê Văn C' }] },
          response: new Response(null, { status: 200 }),
        });
      }
      return Promise.resolve({
        data: { items: [] },
        response: new Response(null, { status: 200 }),
      });
    });
    post.mockResolvedValue({ error: undefined });

    renderPage();

    const searchInput = screen.getByPlaceholderText(/tìm theo mã số hoặc họ tên/i);
    fireEvent.change(searchInput, { target: { value: 'Lê Văn C' } });

    await waitFor(() => expect(screen.getByText('SV002')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /thêm/i }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/course-sections/{sectionId}/enrollments', {
        params: { path: { sectionId: 'section-1' } },
        body: { studentId: 'st2' },
      }),
    );
  });
});
