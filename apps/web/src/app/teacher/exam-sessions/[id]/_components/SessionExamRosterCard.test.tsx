import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { SessionExamRosterCard } from './SessionExamRosterCard';

const useSessionRosterMock = vi.fn();
const useAddMock = vi.fn();
const useRemoveMock = vi.fn();
const useImportMock = vi.fn();

vi.mock('@/hooks/useExamSession', () => ({
  useSessionRoster: (...args: unknown[]) => useSessionRosterMock(...args),
  useAddSessionRosterStudent: (...args: unknown[]) => useAddMock(...args),
  useRemoveSessionRosterStudent: (...args: unknown[]) => useRemoveMock(...args),
  useImportSessionRoster: (...args: unknown[]) => useImportMock(...args),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe('SessionExamRosterCard', () => {
  beforeEach(() => {
    useAddMock.mockReturnValue({ mutate: vi.fn(), isPending: false, isError: false });
    useRemoveMock.mockReturnValue({ mutate: vi.fn(), isPending: false });
    useImportMock.mockReturnValue({ mutate: vi.fn(), isPending: false });
  });

  it('hiện Theo lớp và danh sách enrollment ảo', () => {
    useSessionRosterMock.mockReturnValue({
      data: {
        customized: false,
        students: [
          { mssv: 'SV01', name: 'An', source: 'class' },
          { mssv: 'SV02', name: 'Bình', source: 'class' },
        ],
      },
      isLoading: false,
      isError: false,
    });

    render(<SessionExamRosterCard sessionId="s1" canEdit />);

    expect(screen.getByText('Danh sách thi')).toBeInTheDocument();
    expect(screen.getByText('Theo lớp')).toBeInTheDocument();
    expect(screen.getByText('An')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Thêm sinh viên/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Tải file danh sách/i })).toBeInTheDocument();
  });

  it('ẩn nút chỉnh khi không canEdit', () => {
    useSessionRosterMock.mockReturnValue({
      data: {
        customized: true,
        students: [{ mssv: 'SV01', name: 'An', source: 'frozen' }],
      },
      isLoading: false,
      isError: false,
    });

    render(<SessionExamRosterCard sessionId="s1" canEdit={false} />);

    expect(screen.getByText('Đã tùy chỉnh cho phiên')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Thêm sinh viên/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Tải file danh sách/i })).not.toBeInTheDocument();
  });

  it('dialog tải file rộng, có cuộn và footer cố định', () => {
    useSessionRosterMock.mockReturnValue({
      data: {
        customized: false,
        students: [{ mssv: 'SV01', name: 'An', source: 'class' }],
      },
      isLoading: false,
      isError: false,
    });

    render(<SessionExamRosterCard sessionId="s1" canEdit />);
    fireEvent.click(screen.getByRole('button', { name: /Tải file danh sách/i }));

    expect(
      screen.getByRole('heading', { name: /Tải file danh sách thi/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/không đổi danh sách lớp học phần/i),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/File Excel/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Huỷ/i })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Xác nhận nhập/i }),
    ).toBeDisabled();

    const dialog = screen.getByRole('dialog');
    expect(dialog.className).toMatch(/max-w-3xl/);
    expect(dialog.className).toMatch(/max-h-\[90vh\]/);
    expect(dialog.className).toMatch(/flex-col/);
  });
});
