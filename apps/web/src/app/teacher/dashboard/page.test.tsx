import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import TeacherDashboardPage from './page';

const useExamSessionsMock = vi.fn();
const useFilterMock = vi.fn();
vi.mock('@/hooks/useExamSession', () => ({ useExamSessions: (...args: unknown[]) => useExamSessionsMock(...args) }));
vi.mock('@/hooks/useSemesterYearFilter', () => ({ useSemesterYearFilter: (...args: unknown[]) => useFilterMock(...args) }));

const filterState = (selection = { academicYear: null as number | null, semesterId: null as string | null }, params = {}) => ({
  semesters: [{ id: 's1', academicYearStart: 2026, term: 1, label: 'HK1 2026-2027' }],
  isLoading: false,
  selection,
  setYear: vi.fn(),
  setSemester: vi.fn(),
  clear: vi.fn(),
  params,
  matches: () => true,
});

describe('TeacherDashboardPage', () => {
  beforeEach(() => {
    useExamSessionsMock.mockReset().mockReturnValue({ data: { items: [], total: 12 }, isLoading: false, isError: false });
    useFilterMock.mockReset().mockReturnValue(filterState());
  });

  it('Review Focus 6: mặc định đếm TẤT CẢ phiên — không gửi tham số học kỳ', () => {
    render(<TeacherDashboardPage />);

    expect(useExamSessionsMock).toHaveBeenLastCalledWith({ page: 1, pageSize: 1 });
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('Tổng số phiên thi bạn đã tạo')).toBeInTheDocument();
    expect(useFilterMock).toHaveBeenCalledWith('teacher-dashboard');
  });

  it('chọn kỳ thì tham số đi lên server và lời chú thích nói đây là số theo bộ lọc', () => {
    useFilterMock.mockReturnValue(filterState({ academicYear: 2026, semesterId: 's1' }, { semesterId: 's1' }));
    render(<TeacherDashboardPage />);

    expect(useExamSessionsMock).toHaveBeenLastCalledWith({ page: 1, pageSize: 1, semesterId: 's1' });
    expect(screen.getByText('Số phiên thi trong bộ lọc đang chọn')).toBeInTheDocument();
    expect(screen.queryByText('Tổng số phiên thi bạn đã tạo')).not.toBeInTheDocument();
  });

  it('có hai ô lọc năm học và học kỳ', () => {
    render(<TeacherDashboardPage />);
    expect(screen.getByRole('combobox', { name: 'Lọc theo năm học' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Lọc theo học kỳ' })).toBeInTheDocument();
  });

  it('lỗi tải hiện ở thẻ thống kê, không làm mất bộ lọc', () => {
    useExamSessionsMock.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    render(<TeacherDashboardPage />);
    expect(screen.getByRole('combobox', { name: 'Lọc theo học kỳ' })).toBeInTheDocument();
  });
});
