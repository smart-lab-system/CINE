import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const useSemestersMock = vi.fn();
vi.mock('@/hooks/useDepartment', () => ({
  useSemesters: () => useSemestersMock(),
}));

import { useSemesterFilter } from './useSemesterFilter';

const SEMESTERS = [
  { id: 's1', name: 'HK1', startDate: '2026-09-01', endDate: '2027-01-15', isCurrent: false },
  { id: 's2', name: 'HK2', startDate: '2027-02-01', endDate: '2027-06-30', isCurrent: true },
];

beforeEach(() => {
  useSemestersMock.mockReturnValue({ data: SEMESTERS, isLoading: false });
});

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * Chỉ `Date.now()` là phần động của phép tính "đã cũ" — `endDate` là chuỗi
 * ngày cố định. Stub đúng một hàm đó, KHÔNG dùng vi.useFakeTimers(): fake
 * timers làm `waitFor` của testing-library treo, vì nó đợi bằng timer thật.
 */
function freezeNow(iso: string) {
  vi.spyOn(Date, 'now').mockReturnValue(new Date(iso).getTime());
}

describe('useSemesterFilter', () => {
  it('mặc định là kỳ đang gạt cờ', async () => {
    const { result } = renderHook(() => useSemesterFilter('classes'));
    await waitFor(() => expect(result.current.semesterId).toBe('s2'));
  });

  // Nếu gieo lại mỗi render, lựa chọn của giảng viên bị ghi đè ngay lập tức —
  // đúng cái bẫy mà trang Quản lý bài thu đã phải học bằng seededRef.
  it('KHÔNG ghi đè lựa chọn của người dùng khi dữ liệu về lại', async () => {
    const { result, rerender } = renderHook(() => useSemesterFilter('classes'));
    await waitFor(() => expect(result.current.semesterId).toBe('s2'));

    act(() => result.current.setSemesterId('s1'));
    expect(result.current.semesterId).toBe('s1');

    // Query refetch: cùng dữ liệu, mảng mới.
    useSemestersMock.mockReturnValue({ data: [...SEMESTERS], isLoading: false });
    rerender();
    expect(result.current.semesterId).toBe('s1');
  });

  it('null nghĩa là "tất cả học kỳ", và giữ được null', async () => {
    const { result, rerender } = renderHook(() => useSemesterFilter('classes'));
    await waitFor(() => expect(result.current.semesterId).toBe('s2'));

    act(() => result.current.setSemesterId(null));
    rerender();
    expect(result.current.semesterId).toBeNull();
  });

  it('không kỳ nào gạt cờ → null, KHÔNG tự chọn đại một kỳ', async () => {
    useSemestersMock.mockReturnValue({
      data: SEMESTERS.map((s) => ({ ...s, isCurrent: false })),
      isLoading: false,
    });
    const { result } = renderHook(() => useSemesterFilter('classes'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.semesterId).toBeNull();
    expect(result.current.current).toBeNull();
  });

  it('báo cũ khi kỳ hiện hành đã qua end_date', () => {
    freezeNow('2027-07-12T00:00:00Z');
    const { result } = renderHook(() => useSemesterFilter('classes'));
    // isStale tính đồng bộ từ `current`, không đợi effect gieo mặc định.
    expect(result.current.isStale).toBe(true);
    expect(result.current.staleDays).toBe(11);
  });

  it('KHÔNG báo cũ trong chính ngày kết thúc', () => {
    // Kỳ kết thúc 30/06 chưa "cũ" trong ngày 30/06 — end_date là một ngày, và
    // ngày đó vẫn thuộc học kỳ.
    freezeNow('2027-06-30T23:00:00Z');
    const { result } = renderHook(() => useSemesterFilter('classes'));
    expect(result.current.isStale).toBe(false);
  });

  it('gieo lại khi đổi sang trang khác', async () => {
    const { result, rerender } = renderHook(({ k }) => useSemesterFilter(k), {
      initialProps: { k: 'classes' },
    });
    await waitFor(() => expect(result.current.semesterId).toBe('s2'));
    act(() => result.current.setSemesterId('s1'));
    expect(result.current.semesterId).toBe('s1');

    // Ref reset theo ĐỊNH DANH TRANG, không theo dữ liệu trả về.
    rerender({ k: 'exam-sessions' });
    await waitFor(() => expect(result.current.semesterId).toBe('s2'));
  });
});
