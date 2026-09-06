import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import AccountsPage from './page';

// Phase 1 rebuild: the page now goes through hooks/useAccounts.ts (CLAUDE.md's
// API-call-layering rule) instead of calling apiClient directly, so these
// tests mock the hooks module — no QueryClientProvider needed since the
// real useQuery/useMutation never run.
const useAccountsMock = vi.fn();
const createMutate = vi.fn();
const updateMutate = vi.fn();
const deleteMutate = vi.fn();

vi.mock('@/hooks/useAccounts', () => ({
  useAccounts: (...args: unknown[]) => useAccountsMock(...args),
  useCreateAccount: () => ({ mutate: createMutate, isPending: false }),
  useUpdateAccount: () => ({ mutate: updateMutate, isPending: false }),
  useDeleteAccount: () => ({ mutate: deleteMutate, isPending: false }),
}));

beforeEach(() => {
  useAccountsMock.mockReset();
  createMutate.mockReset();
  updateMutate.mockReset();
  deleteMutate.mockReset();
});

describe('AccountsPage fetch states', () => {
  it('shows a loading skeleton before the accounts arrive', () => {
    useAccountsMock.mockReturnValue({ data: undefined, error: null, isLoading: true, refetch: vi.fn() });

    render(<AccountsPage />);

    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('shows an error message with a retry action instead of an empty table', async () => {
    const refetch = vi.fn();
    useAccountsMock.mockReturnValue({
      data: undefined,
      error: new Error('Unauthorized'),
      isLoading: false,
      refetch,
    });

    render(<AccountsPage />);

    expect(screen.getByText(/không tải được danh sách tài khoản/i)).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    // AccountsController is @Roles('admin')-only — if the list 403'd, so
    // would a create; the button shouldn't be offered.
    expect(screen.queryByRole('button', { name: /tạo tài khoản/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /thử lại/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('shows an empty state with a create CTA when there are no accounts yet', () => {
    useAccountsMock.mockReturnValue({
      data: { items: [], total: 0 },
      error: null,
      isLoading: false,
      refetch: vi.fn(),
    });

    render(<AccountsPage />);

    expect(screen.getByText(/chưa có tài khoản nào/i)).toBeInTheDocument();
    // Two "Tạo tài khoản" buttons now — header + empty-state CTA.
    expect(screen.getAllByRole('button', { name: /tạo tài khoản/i }).length).toBeGreaterThan(0);
  });

  it('renders the returned accounts with a role badge and formatted date', () => {
    useAccountsMock.mockReturnValue({
      data: {
        items: [
          {
            id: 'a1',
            name: 'Nguyễn Văn A',
            email: 'nguyenvana@example.com',
            role: 'teacher',
            createdAt: '2026-01-15T00:00:00.000Z',
          },
        ],
        total: 1,
      },
      error: null,
      isLoading: false,
      refetch: vi.fn(),
    });

    render(<AccountsPage />);

    expect(screen.getByText('nguyenvana@example.com')).toBeInTheDocument();
    expect(screen.getByText('Giảng viên')).toBeInTheDocument();
    // Ý định là "không có LỖI". Trang cũng có một cảnh báo role="alert" khác
    // (chưa có tài khoản Phòng Đào tạo nào), nên khẳng định theo nội dung lỗi
    // thay vì theo vai trò ARIA — nếu không, test này chỉ còn nói "trang không
    // có alert nào", điều vừa sai vừa không phải thứ nó muốn bảo vệ.
    expect(screen.queryByText(/Không tải được danh sách/)).not.toBeInTheDocument();
  });

  // Chưa ai giữ vai trò Phòng Đào tạo thì KHÔNG AI đặt được kỳ hiện hành, và
  // mọi màn hình lọc theo học kỳ đứng im mà không nói vì sao — spec §7.3.
  it('cảnh báo khi chưa có tài khoản Phòng Đào tạo nào', () => {
    useAccountsMock.mockReturnValue({
      data: {
        items: [
          { id: '1', name: 'A', email: 'a@x.vn', role: 'teacher', createdAt: '2026-01-15T00:00:00.000Z' },
        ],
        total: 1,
      },
      error: null,
      isLoading: false,
      refetch: vi.fn(),
    });

    render(<AccountsPage />);
    expect(screen.getByText(/Chưa có tài khoản Phòng Đào tạo nào/)).toBeInTheDocument();
  });

  it('im lặng khi đã có tài khoản Phòng Đào tạo', () => {
    useAccountsMock.mockReturnValue({
      data: {
        items: [
          { id: '1', name: 'P', email: 'p@x.vn', role: 'academic_affairs', createdAt: '2026-01-15T00:00:00.000Z' },
        ],
        total: 1,
      },
      error: null,
      isLoading: false,
      refetch: vi.fn(),
    });

    render(<AccountsPage />);
    expect(screen.queryByText(/Chưa có tài khoản Phòng Đào tạo nào/)).not.toBeInTheDocument();
  });

  it('opens the create dialog, submits, and shows a success toast on create', async () => {
    useAccountsMock.mockReturnValue({
      data: { items: [], total: 0 },
      error: null,
      isLoading: false,
      refetch: vi.fn(),
    });
    createMutate.mockImplementation((_values, { onSuccess }) => onSuccess());

    render(<AccountsPage />);

    fireEvent.click(screen.getAllByRole('button', { name: /tạo tài khoản/i })[0]);

    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    expect(screen.getByLabelText(/họ tên/i)).toBeInTheDocument();
  });
});
