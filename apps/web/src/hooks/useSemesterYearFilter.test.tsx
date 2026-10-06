import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

const useSemestersMock = vi.fn();
vi.mock('./useSemesters', () => ({ useSemesters: () => useSemestersMock() }));

import { useSemesterYearFilter } from './useSemesterYearFilter';

const sem = (id: string, year: number, term: number) => ({
  id,
  academicYearStart: year,
  term,
  label: `HK${term} ${year}-${year + 1}`,
  startDate: '',
  endDate: '',
});
const LIST = [sem('b1', 2026, 1), sem('b2', 2026, 2), sem('a1', 2025, 1)];
const loaded = (data = LIST) => ({ data, isLoading: false, isSuccess: true });

describe('useSemesterYearFilter', () => {
  beforeEach(() => useSemestersMock.mockReset());

  it('Review Focus 2: mặc định là TẤT CẢ — không chọn hộ ai một kỳ nào', () => {
    useSemestersMock.mockReturnValue(loaded());
    const { result } = renderHook(() => useSemesterYearFilter('trang-a'));

    expect(result.current.selection).toEqual({ academicYear: null, semesterId: null });
    expect(result.current.params).toEqual({});
    expect(result.current.matches({ semesterId: null, academicYear: null })).toBe(true);
  });

  it('chọn năm rồi chọn kỳ: params đổi từ academicYear sang semesterId', () => {
    useSemestersMock.mockReturnValue(loaded());
    const { result } = renderHook(() => useSemesterYearFilter('trang-a'));

    act(() => result.current.setYear(2026));
    expect(result.current.params).toEqual({ academicYear: 2026 });
    expect(result.current.matches({ semesterId: 'b2', academicYear: 2026 })).toBe(true);
    expect(result.current.matches({ semesterId: 'a1', academicYear: 2025 })).toBe(false);

    act(() => result.current.setSemester('b2'));
    expect(result.current.params).toEqual({ semesterId: 'b2' });
    expect(result.current.matches({ semesterId: 'b1', academicYear: 2026 })).toBe(false);
  });

  it('đổi năm: kỳ đang chọn không thuộc năm mới thì về "tất cả kỳ"', () => {
    useSemestersMock.mockReturnValue(loaded());
    const { result } = renderHook(() => useSemesterYearFilter('trang-a'));

    act(() => result.current.setSemester('b2'));
    act(() => result.current.setYear(2025));

    expect(result.current.selection).toEqual({ academicYear: 2025, semesterId: null });
  });

  it('chuyển màn hình (scopeKey đổi) thì về mặc định — bộ lọc KHÔNG rò rỉ giữa các trang', () => {
    useSemestersMock.mockReturnValue(loaded());
    const { result, rerender } = renderHook(({ scope }) => useSemesterYearFilter(scope), {
      initialProps: { scope: 'trang-a' },
    });
    act(() => result.current.setSemester('b2'));
    expect(result.current.selection.semesterId).toBe('b2');

    rerender({ scope: 'trang-b' });

    expect(result.current.selection).toEqual({ academicYear: null, semesterId: null });
  });

  it('cùng scopeKey render lại thì GIỮ lựa chọn', () => {
    useSemestersMock.mockReturnValue(loaded());
    const { result, rerender } = renderHook(({ scope }) => useSemesterYearFilter(scope), {
      initialProps: { scope: 'trang-a' },
    });
    act(() => result.current.setSemester('b2'));

    rerender({ scope: 'trang-a' });

    expect(result.current.selection.semesterId).toBe('b2');
  });

  it('Review Focus 1: học kỳ vừa bị admin xoá thì lựa chọn tự về "tất cả"', () => {
    useSemestersMock.mockReturnValue(loaded());
    const { result, rerender } = renderHook(() => useSemesterYearFilter('trang-a'));
    act(() => result.current.setSemester('b2'));

    useSemestersMock.mockReturnValue(loaded([sem('b1', 2026, 1), sem('a1', 2025, 1)])); // b2 biến mất
    rerender();

    expect(result.current.selection).toEqual({ academicYear: null, semesterId: null });
    expect(result.current.params).toEqual({});
  });

  it('đang tải danh sách học kỳ: không dọn lựa chọn (danh sách rỗng chỉ vì chưa tải)', () => {
    useSemestersMock.mockReturnValue(loaded());
    const { result, rerender } = renderHook(() => useSemesterYearFilter('trang-a'));
    act(() => result.current.setSemester('b2'));

    useSemestersMock.mockReturnValue({ data: undefined, isLoading: true, isSuccess: false });
    rerender();

    expect(result.current.selection.semesterId).toBe('b2');
    expect(result.current.isLoading).toBe(true);
    expect(result.current.semesters).toEqual([]);
  });

  it('clear() đưa về "tất cả"', () => {
    useSemestersMock.mockReturnValue(loaded());
    const { result } = renderHook(() => useSemesterYearFilter('trang-a'));
    act(() => result.current.setSemester('b2'));
    act(() => result.current.clear());
    expect(result.current.selection).toEqual({ academicYear: null, semesterId: null });
  });
});
