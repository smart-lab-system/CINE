import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { CurrentSemesterBadge } from './current-semester-badge';

const semesters = [
  { id: 's1', name: 'HK1 2025-2026', startDate: '2025-09-01', endDate: '2026-01-15' },
  { id: 's2', name: 'HK2 2025-2026', startDate: '2026-02-01', endDate: '2026-06-15' },
  { id: 's3', name: 'HK1 2026-2027', startDate: '2026-09-01', endDate: '2027-01-15' },
];

const useSemestersMock = vi.fn();
vi.mock('@/hooks/useDepartment', () => ({
  useSemesters: () => useSemestersMock(),
}));

beforeEach(() => {
  vi.useFakeTimers();
  useSemestersMock.mockReturnValue({ data: semesters, isLoading: false });
});

afterEach(() => {
  vi.useRealTimers();
});

/**
 * Banner "Học kỳ hiện tại" trên topbar.
 *
 * CLAUDE.md §1.2 từng cấm hẳn banner học kỳ vì bản trước đã biến nó thành
 * trạng thái hệ thống (`is_current` + luật chặn), rồi bị revert. Banner
 * này được cho phép trở lại với ranh giới hẹp, và những test dưới đây
 * chính là ranh giới đó ở dạng chạy được: giá trị suy từ NGÀY, và không
 * có gì ở đây chặn thao tác nào.
 */
describe('CurrentSemesterBadge', () => {
  it('hiện kỳ đã bắt đầu gần hôm nay nhất', () => {
    vi.setSystemTime(new Date('2026-10-15T09:00:00'));
    render(<CurrentSemesterBadge />);

    expect(screen.getByText('HK1 2026-2027')).toBeInTheDocument();
    expect(screen.getByText('Học kỳ hiện tại')).toBeInTheDocument();
  });

  it('KHÔNG nhảy sang kỳ tương lai admin đã tạo sẵn', () => {
    // 2026-08-15: HK1 2026-2027 đã có trong DB nhưng chưa bắt đầu. Nếu
    // banner lấy MAX(start_date), nó sẽ tuyên bố sai kỳ cho cả hệ thống.
    vi.setSystemTime(new Date('2026-08-15T09:00:00'));
    render(<CurrentSemesterBadge />);

    expect(screen.getByText('HK2 2025-2026')).toBeInTheDocument();
  });

  it('cảnh báo khi kỳ đã kết thúc mà chưa có kỳ mới', () => {
    vi.setSystemTime(new Date('2027-01-20T09:00:00'));
    render(<CurrentSemesterBadge />);

    expect(screen.getByText('HK1 2026-2027')).toBeInTheDocument();
    expect(screen.getByText(/đã kết thúc 5 ngày/)).toBeInTheDocument();
  });

  it('không hiện gì khi hệ thống chưa có học kỳ nào', () => {
    useSemestersMock.mockReturnValue({ data: [], isLoading: false });
    vi.setSystemTime(new Date('2026-10-15T09:00:00'));
    const { container } = render(<CurrentSemesterBadge />);

    // Dashboard từng role đã nói ca này kèm hướng xử lý; nhắc lại trên
    // MỌI trang chỉ là tiếng ồn không hành động được.
    expect(container).toBeEmptyDOMElement();
  });

  it('không hiện gì khi đang tải — topbar không được nhấp nháy', () => {
    useSemestersMock.mockReturnValue({ data: undefined, isLoading: true });
    const { container } = render(<CurrentSemesterBadge />);

    expect(container).toBeEmptyDOMElement();
  });

  it('nói rõ đây là suy luận theo ngày và không chặn gì', () => {
    vi.setSystemTime(new Date('2026-10-15T09:00:00'));
    render(<CurrentSemesterBadge />);

    // Đây là thứ giữ banner không bị đọc thành "hệ thống đang khoá ở kỳ
    // này" — cách đọc sai đã dẫn tới epic bị revert.
    const badge = screen.getByTitle(/không thao tác nào bị chặn/i);
    expect(badge).toBeInTheDocument();
  });

  it('không render nút hay control nào — chỉ là chữ', () => {
    vi.setSystemTime(new Date('2026-10-15T09:00:00'));
    render(<CurrentSemesterBadge />);

    // Không có cách nào "đặt" kỳ hiện tại từ đây. Ngày nào xuất hiện một
    // control trong banner này, nó đã thành API set-current mà §1.2 cấm.
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });
});
