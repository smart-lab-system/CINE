import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import AuditLogPage from './page';

const useAuditLogMock = vi.fn();
const useAccountsMock = vi.fn();

vi.mock('@/hooks/useAuditLog', () => ({
  useAuditLog: (...args: unknown[]) => useAuditLogMock(...args),
}));
vi.mock('@/hooks/useAccounts', () => ({
  useAccounts: (...args: unknown[]) => useAccountsMock(...args),
}));

const ENTRY = {
  id: 'e1',
  occurredAt: '2026-10-05T03:15:00.000Z',
  actor: { id: 'u1', name: 'Admin A', email: 'a@x.vn' },
  action: 'exam_session.reassign_teacher',
  targetType: 'exam_session',
  targetId: '12345678-aaaa-bbbb-cccc-1234567890ab',
  oldValue: { teacherId: 'aaaaaaaa-1111-2222-3333-444444444444' },
  oldValueTruncated: false,
  newValue: { teacherId: 'bbbbbbbb-1111-2222-3333-444444444444' },
  newValueTruncated: false,
};

function page(items: unknown[], total = items.length) {
  return { data: { items, total, page: 1, pageSize: 50 }, error: null, isLoading: false, isFetching: false, refetch: vi.fn() };
}

beforeEach(() => {
  useAuditLogMock.mockReset();
  useAccountsMock.mockReset();
  useAccountsMock.mockReturnValue({
    data: {
      items: [
        { id: 'u1', name: 'Admin A', email: 'a@x.vn', role: 'admin' },
        { id: 'u2', name: 'GV B', email: 'b@x.vn', role: 'teacher' },
      ],
      total: 2,
    },
  });
});

describe('AuditLogPage trạng thái tải', () => {
  it('hiện khung xương khi đang tải, chưa có bảng', () => {
    useAuditLogMock.mockReturnValue({ data: undefined, error: null, isLoading: true, refetch: vi.fn() });
    render(<AuditLogPage />);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('hiện lỗi kèm nút thử lại thay vì một bảng rỗng', () => {
    const refetch = vi.fn();
    useAuditLogMock.mockReturnValue({ data: undefined, error: new Error('403'), isLoading: false, refetch });
    render(<AuditLogPage />);
    expect(screen.getByText(/không tải được nhật ký/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /thử lại/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('hiện trạng thái rỗng khi không có dòng nào', () => {
    useAuditLogMock.mockReturnValue(page([]));
    render(<AuditLogPage />);
    expect(screen.getByText('Không có bản ghi nào khớp bộ lọc')).toBeInTheDocument();
  });
});

describe('AuditLogPage hiển thị', () => {
  it('đọc mỗi dòng bằng một câu tiếng Việt kèm tên người thực hiện', () => {
    useAuditLogMock.mockReturnValue(page([ENTRY]));
    render(<AuditLogPage />);
    const row = screen.getByRole('row', { name: /Admin A/ });
    expect(within(row).getByText(/Chuyển phiên thi sang giảng viên khác/)).toBeInTheDocument();
  });

  it('dòng không có người thực hiện ghi "Hệ thống"', () => {
    useAuditLogMock.mockReturnValue(page([{ ...ENTRY, id: 'e2', actor: null }]));
    render(<AuditLogPage />);
    expect(screen.getByText('Hệ thống')).toBeInTheDocument();
  });

  it('mở rộng một dòng để xem giá trị cũ và mới', () => {
    useAuditLogMock.mockReturnValue(page([ENTRY]));
    render(<AuditLogPage />);
    expect(screen.queryByText(/"teacherId"/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /xem chi tiết/i }));
    expect(screen.getAllByText(/"teacherId"/).length).toBe(2);
  });

  it('giá trị bị cắt thì nói rõ thay vì hiện null', () => {
    useAuditLogMock.mockReturnValue(
      page([{ ...ENTRY, newValue: null, newValueTruncated: true }]),
    );
    render(<AuditLogPage />);
    fireEvent.click(screen.getByRole('button', { name: /xem chi tiết/i }));
    expect(screen.getByText(/quá lớn/i)).toBeInTheDocument();
  });
});

describe('AuditLogPage bộ lọc', () => {
  it('lần gọi đầu không lọc gì, trang 1', () => {
    useAuditLogMock.mockReturnValue(page([ENTRY]));
    render(<AuditLogPage />);
    expect(useAuditLogMock).toHaveBeenCalledWith({ page: 1, pageSize: 50 });
  });

  it('chọn nhóm "Dữ liệu nền" gửi bốn tiền tố và về trang 1', () => {
    useAuditLogMock.mockReturnValue(page([ENTRY], 120));
    render(<AuditLogPage />);
    fireEvent.click(screen.getByRole('button', { name: /trang sau/i }));
    fireEvent.click(screen.getByRole('combobox', { name: 'Lọc theo nhóm hành động' }));
    fireEvent.click(screen.getByRole('option', { name: 'Dữ liệu nền' }));
    expect(useAuditLogMock).toHaveBeenLastCalledWith({
      action: ['semester.', 'room.', 'class.', 'administrative_class.'],
      page: 1,
      pageSize: 50,
    });
  });

  it('chọn một người thực hiện gửi actorId', () => {
    useAuditLogMock.mockReturnValue(page([ENTRY]));
    render(<AuditLogPage />);
    fireEvent.click(screen.getByRole('combobox', { name: 'Lọc theo người thực hiện' }));
    fireEvent.click(screen.getByRole('option', { name: /GV B/ }));
    expect(useAuditLogMock).toHaveBeenLastCalledWith(expect.objectContaining({ actorId: 'u2', page: 1 }));
  });

  it('đặt khoảng ngày gửi from/to', () => {
    useAuditLogMock.mockReturnValue(page([ENTRY]));
    render(<AuditLogPage />);
    fireEvent.change(screen.getByLabelText('Từ ngày'), { target: { value: '2026-10-01' } });
    fireEvent.change(screen.getByLabelText('Đến ngày'), { target: { value: '2026-10-03' } });
    const last = useAuditLogMock.mock.calls.at(-1)![0];
    expect(new Date(last.from).getTime()).toBe(new Date(2026, 9, 1).getTime());
    expect(new Date(last.to).getTime()).toBe(new Date(2026, 9, 4).getTime());
  });

  it('"Xoá bộ lọc" chỉ hiện khi có bộ lọc và đưa mọi thứ về mặc định', () => {
    useAuditLogMock.mockReturnValue(page([ENTRY]));
    render(<AuditLogPage />);
    expect(screen.queryByRole('button', { name: 'Xoá bộ lọc' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Từ ngày'), { target: { value: '2026-10-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Xoá bộ lọc' }));
    expect(useAuditLogMock).toHaveBeenLastCalledWith({ page: 1, pageSize: 50 });
  });
});

describe('AuditLogPage phân trang', () => {
  it('"Trang sau" bị khoá ở trang cuối và "Trang trước" ở trang đầu', () => {
    useAuditLogMock.mockReturnValue(page([ENTRY], 1));
    render(<AuditLogPage />);
    expect(screen.getByRole('button', { name: /trang trước/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /trang sau/i })).toBeDisabled();
  });

  it('có nhiều trang thì "Trang sau" tăng page', () => {
    useAuditLogMock.mockReturnValue(page([ENTRY], 120));
    render(<AuditLogPage />);
    fireEvent.click(screen.getByRole('button', { name: /trang sau/i }));
    expect(useAuditLogMock).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }));
  });
});
