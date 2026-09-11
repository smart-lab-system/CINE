import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSemesterFilter } from './useSemesterFilter';

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
 * Kỳ mặc định được TÍNH TỪ NGÀY, không đọc cờ nào (CLAUDE.md §5.4/§7.2.3).
 *
 * Đây không phải `is_current` quay lại: không lưu ở đâu, không API
 * set-current, không banner, và quan trọng nhất — không chặn thao tác nào.
 * Nó chỉ quyết định dropdown mở ra ở giá trị gì.
 */
describe('useSemesterFilter — kỳ mặc định', () => {
  it('chọn kỳ ĐÃ BẮT ĐẦU gần hôm nay nhất', () => {
    vi.setSystemTime(new Date('2026-10-15'));
    const { result } = renderHook(() => useSemesterFilter('test-page'));
    expect(result.current.current?.id).toBe('s3');
  });

  it('KHÔNG nhảy sang kỳ tương lai chỉ vì start_date của nó lớn hơn', () => {
    // 2026-08-15: HK1 2026-2027 đã có trong DB (trưởng khoa tạo sẵn) nhưng
    // chưa bắt đầu. MAX(start_date) đơn giản sẽ nhảy sang một kỳ chưa ai
    // có lớp — đúng cái bẫy công thức này tồn tại để tránh.
    vi.setSystemTime(new Date('2026-08-15'));
    const { result } = renderHook(() => useSemesterFilter('test-page'));
    expect(result.current.current?.id).toBe('s2');
  });

  it('rơi về kỳ SẮP TỚI gần nhất khi chưa kỳ nào bắt đầu', () => {
    vi.setSystemTime(new Date('2025-01-01'));
    const { result } = renderHook(() => useSemesterFilter('test-page'));
    expect(result.current.current?.id).toBe('s1');
  });

  it('trả về null khi chưa có học kỳ nào trong hệ thống', () => {
    useSemestersMock.mockReturnValue({ data: [], isLoading: false });
    vi.setSystemTime(new Date('2026-10-15'));
    const { result } = renderHook(() => useSemesterFilter('test-page'));
    expect(result.current.current).toBeNull();
    expect(result.current.semesterId).toBeNull();
  });

  it('gieo semesterId bằng kỳ mặc định ngay khi danh sách về', () => {
    vi.setSystemTime(new Date('2026-10-15'));
    const { result } = renderHook(() => useSemesterFilter('test-page'));
    expect(result.current.semesterId).toBe('s3');
  });

  it('không ghi đè lựa chọn thủ công khi query refetch', () => {
    vi.setSystemTime(new Date('2026-10-15'));
    const { result, rerender } = renderHook(() => useSemesterFilter('test-page'));

    act(() => result.current.setSemesterId('s1'));
    expect(result.current.semesterId).toBe('s1');

    // Refetch trả về CÙNG dữ liệu — nếu mặc định được tính lại mỗi render
    // và ghi đè state, lựa chọn của người dùng biến mất ngay lần
    // invalidate đầu tiên, và họ sẽ không hiểu tại sao.
    rerender();
    expect(result.current.semesterId).toBe('s1');
  });

  it('chọn "Tất cả học kỳ" (null) cũng không bị gieo đè', () => {
    vi.setSystemTime(new Date('2026-10-15'));
    const { result, rerender } = renderHook(() => useSemesterFilter('test-page'));

    act(() => result.current.setSemesterId(null));
    rerender();
    expect(result.current.semesterId).toBeNull();
  });
});

/**
 * Mốc thời gian ở đây viết KHÔNG có `Z` là có chủ ý: `end_date` là cột
 * DATE (ngày hành chính của trường), nên phép đếm là đếm ngày lịch theo
 * giờ địa phương. Gắn `Z` vào sẽ làm test phụ thuộc timezone của máy chạy
 * nó — cùng một dòng chữ ra 4 hay 5 ngày tuỳ chỗ ngồi.
 */
describe('useSemesterFilter — cảnh báo kỳ đã hết hạn', () => {
  it('isStale khi kỳ mặc định đã qua end_date', () => {
    // s3 kết thúc 2027-01-15; hôm nay 2027-01-20 là 5 ngày sau. Không kỳ
    // nào mới hơn được tạo — đúng ca "admin quên mở kỳ mới".
    vi.setSystemTime(new Date('2027-01-20T12:00:00'));
    const { result } = renderHook(() => useSemesterFilter('test-page'));
    expect(result.current.current?.id).toBe('s3');
    expect(result.current.isStale).toBe(true);
    expect(result.current.staleDays).toBe(5);
  });

  it('con số không đổi giữa buổi sáng và buổi tối cùng một ngày', () => {
    vi.setSystemTime(new Date('2027-01-20T01:00:00'));
    const morning = renderHook(() => useSemesterFilter('test-page'));
    vi.setSystemTime(new Date('2027-01-20T23:00:00'));
    const evening = renderHook(() => useSemesterFilter('test-page'));
    expect(morning.result.current.staleDays).toBe(evening.result.current.staleDays);
  });

  it('KHÔNG isStale trong ngày cuối của kỳ', () => {
    vi.setSystemTime(new Date('2027-01-15T23:00:00'));
    const { result } = renderHook(() => useSemesterFilter('test-page'));
    expect(result.current.isStale).toBe(false);
    expect(result.current.staleDays).toBe(0);
  });

  it('isStale ngay ngày đầu tiên sau khi kỳ kết thúc', () => {
    vi.setSystemTime(new Date('2027-01-16T00:30:00'));
    const { result } = renderHook(() => useSemesterFilter('test-page'));
    expect(result.current.isStale).toBe(true);
    expect(result.current.staleDays).toBe(1);
  });

  it('KHÔNG isStale khi kỳ mặc định vẫn đang chạy', () => {
    vi.setSystemTime(new Date('2026-10-15'));
    const { result } = renderHook(() => useSemesterFilter('test-page'));
    expect(result.current.isStale).toBe(false);
    expect(result.current.staleDays).toBe(0);
  });

  it('KHÔNG isStale khi kỳ mặc định là kỳ tương lai chưa bắt đầu', () => {
    useSemestersMock.mockReturnValue({ data: [semesters[2]], isLoading: false });
    vi.setSystemTime(new Date('2026-01-01'));
    const { result } = renderHook(() => useSemesterFilter('test-page'));
    expect(result.current.current?.id).toBe('s3');
    expect(result.current.isStale).toBe(false);
  });
});
