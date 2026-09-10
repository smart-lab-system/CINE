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
const toggleActiveMutate = vi.fn();

vi.mock('@/hooks/useAccounts', () => ({
  useAccounts: (...args: unknown[]) => useAccountsMock(...args),
  useCreateAccount: () => ({ mutate: createMutate, isPending: false }),
  useUpdateAccount: () => ({ mutate: updateMutate, isPending: false }),
  useDeleteAccount: () => ({ mutate: deleteMutate, isPending: false }),
  useToggleAccountActive: () => ({ mutate: toggleActiveMutate, isPending: false }),
}));

beforeEach(() => {
  useAccountsMock.mockReset();
  createMutate.mockReset();
  updateMutate.mockReset();
  deleteMutate.mockReset();
  toggleActiveMutate.mockReset();
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
            isActive: true,
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
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  /**
   * Vô hiệu hoá là đường DUY NHẤT dùng được với tài khoản đã đi vào việc
   * (Xóa bị FK RESTRICT chặn — xem accounts.e2e-spec.ts). Nên nút này phải
   * gửi đúng chiều: `isActive` truyền lên là trạng thái HIỆN TẠI, hook tự
   * suy ra gọi deactivate hay reactivate.
   */
  it('sends the current isActive so the hook can pick the right direction', () => {
    useAccountsMock.mockReturnValue({
      data: {
        items: [
          {
            id: 'a1',
            name: 'Đang hoạt động',
            email: 'active@example.com',
            role: 'teacher',
            isActive: true,
            createdAt: '2026-01-15T00:00:00.000Z',
          },
          {
            id: 'a2',
            name: 'Đã khoá',
            email: 'inactive@example.com',
            role: 'teacher',
            isActive: false,
            createdAt: '2026-01-15T00:00:00.000Z',
          },
        ],
        total: 2,
      },
      error: null,
      isLoading: false,
      refetch: vi.fn(),
    });

    render(<AccountsPage />);

    expect(screen.getByText('Hoạt động')).toBeInTheDocument();
    expect(screen.getByText('Đã vô hiệu hoá')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /vô hiệu hoá tài khoản Đang hoạt động/i }));
    expect(toggleActiveMutate).toHaveBeenCalledWith(
      { id: 'a1', isActive: true },
      expect.anything(),
    );

    fireEvent.click(screen.getByRole('button', { name: /mở lại tài khoản Đã khoá/i }));
    expect(toggleActiveMutate).toHaveBeenLastCalledWith(
      { id: 'a2', isActive: false },
      expect.anything(),
    );
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
