import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import TeacherClassesPage from './page';

const useTeachingClassesMock = vi.fn();
const useFilterMock = vi.fn();

vi.mock('@/hooks/useTeaching', () => ({ useTeachingClasses: (...args: unknown[]) => useTeachingClassesMock(...args) }));
vi.mock('@/hooks/useSemesterYearFilter', () => ({ useSemesterYearFilter: (...args: unknown[]) => useFilterMock(...args) }));

const filterState = (overrides: Record<string, unknown> = {}) => ({
  semesters: [
    { id: 's2', academicYearStart: 2026, term: 2, label: 'HK2 2026-2027' },
    { id: 's1', academicYearStart: 2026, term: 1, label: 'HK1 2026-2027' },
  ],
  isLoading: false,
  selection: { academicYear: null, semesterId: null },
  setYear: vi.fn(),
  setSemester: vi.fn(),
  clear: vi.fn(),
  params: {},
  matches: () => true,
  ...overrides,
});

const klass = (overrides: Record<string, unknown> = {}) => ({
  id: 'k1',
  label: 'DHKTPM18A – Nhóm 1',
  labelWithSemester: 'DHKTPM18A – Nhóm 1 · HK1 2026-2027',
  courseName: 'CTDL&GT',
  semesterId: 's1',
  academicYear: 2026,
  term: 1,
  studentCount: 40,
  ...overrides,
});

/**
 * Trang "Lớp của tôi" sau khi lớp về tay ADMIN (spec §2.3, §5.2).
 *
 * Bộ test này khoá lại một thay đổi QUYỀN, giống hệt chiều ngược lại của lần trước (21/09, khi lớp về tay giảng viên): lần này
 * giảng viên KHÔNG tạo, sửa hay xoá lớp được nữa — route ghi là `@Roles('admin')` và trả 403 cho họ — nên bất kỳ nút ghi nào còn sót
 * trên trang này là một nút bấm ra 403.
 */
describe('TeacherClassesPage', () => {
  beforeEach(() => {
    useTeachingClassesMock.mockReset().mockReturnValue({ data: [klass()], isLoading: false, isError: false });
    useFilterMock.mockReset().mockReturnValue(filterState());
  });

  it('hiện nhãn lớp, học kỳ và sĩ số, kèm đường vào danh sách sinh viên', () => {
    render(<TeacherClassesPage />);

    const row = screen.getByRole('row', { name: /DHKTPM18A – Nhóm 1/ });
    expect(row).toHaveTextContent('HK1 2026-2027');
    expect(row).toHaveTextContent('40 sinh viên');
    expect(within(row).getByRole('link', { name: /danh sách sv/i })).toHaveAttribute('href', '/teacher/classes/k1/roster');
  });

  it('Review Focus 1: KHÔNG có nút tạo, sửa hay xoá lớp nào', () => {
    render(<TeacherClassesPage />);

    expect(screen.queryByRole('button', { name: /tạo lớp/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /sửa lớp/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /xoá lớp/i })).not.toBeInTheDocument();
  });

  it('lớp chưa có sinh viên cảnh báo ngay trên bảng (không đợi tới ngày thi)', () => {
    useTeachingClassesMock.mockReturnValue({ data: [klass({ studentCount: 0 })], isLoading: false, isError: false });
    render(<TeacherClassesPage />);
    expect(screen.getByText('chưa có danh sách')).toBeInTheDocument();
  });

  it('lớp cũ chưa có học kỳ hiện "Chưa gán học kỳ", không hiện "HK null"', () => {
    useTeachingClassesMock.mockReturnValue({
      data: [klass({ semesterId: null, academicYear: null, term: null })],
      isLoading: false,
      isError: false,
    });
    render(<TeacherClassesPage />);
    expect(screen.getByText('Chưa gán học kỳ')).toBeInTheDocument();
  });

  describe('màn trống (Review Focus 2)', () => {
    it('chưa được giao lớp nào: chữ nguyên văn spec §5.2, không có nút tạo lớp', () => {
      useTeachingClassesMock.mockReturnValue({ data: [], isLoading: false, isError: false });
      render(<TeacherClassesPage />);

      expect(screen.getByText('Chưa có lớp nào được giao cho bạn')).toBeInTheDocument();
      expect(screen.getByText('Lớp do quản trị viên tạo và giao cho bạn. Khi có lớp mới, nó sẽ hiện ở đây.')).toBeInTheDocument();
      expect(screen.queryByRole('button')).not.toBeInTheDocument(); // không nút nào, kể cả "liên hệ admin" (spec §1.2)
      expect(screen.queryByText(/bạn chưa có lớp nào/i)).not.toBeInTheDocument(); // chữ cũ mời TẠO lớp
    });

    it('rỗng vì đang lọc: nói khác, và cho xoá bộ lọc (Review Focus 7)', () => {
      const clear = vi.fn();
      useFilterMock.mockReturnValue(
        filterState({ selection: { academicYear: 2025, semesterId: null }, params: { academicYear: 2025 }, clear }),
      );
      useTeachingClassesMock.mockReturnValue({ data: [], isLoading: false, isError: false });
      render(<TeacherClassesPage />);

      expect(screen.getByText('Không có lớp nào trong bộ lọc này')).toBeInTheDocument();
      expect(screen.queryByText('Chưa có lớp nào được giao cho bạn')).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Xem tất cả học kỳ' }));
      expect(clear).toHaveBeenCalled();
    });
  });

  describe('bộ lọc năm học → học kỳ', () => {
    it('mặc định không lọc gì; tham số của bộ lọc đi vào truy vấn', () => {
      render(<TeacherClassesPage />);
      expect(useTeachingClassesMock).toHaveBeenLastCalledWith({});

      useFilterMock.mockReturnValue(filterState({ params: { semesterId: 's1' } }));
      render(<TeacherClassesPage />);
      expect(useTeachingClassesMock).toHaveBeenLastCalledWith({ semesterId: 's1' });
    });

    it('hai ô lọc có mặt và dùng đúng scopeKey của màn hình', () => {
      render(<TeacherClassesPage />);
      expect(screen.getByRole('combobox', { name: 'Lọc theo năm học' })).toBeInTheDocument();
      expect(screen.getByRole('combobox', { name: 'Lọc theo học kỳ' })).toBeInTheDocument();
      expect(useFilterMock).toHaveBeenCalledWith('teacher-classes');
    });
  });

  it('đang tải và lỗi tải', () => {
    useTeachingClassesMock.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    const { unmount } = render(<TeacherClassesPage />);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    unmount();

    useTeachingClassesMock.mockReturnValue({ data: undefined, isLoading: false, isError: true, error: new Error('Không tải được lớp') });
    render(<TeacherClassesPage />);
    expect(screen.getByText('Không tải được lớp')).toBeInTheDocument();
  });
});
