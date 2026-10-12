import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import TeacherClassesPage, { filterTeachingClasses } from './page';
import type { TeachingClass } from '@/lib/api/teaching';

const useTeachingClassesMock = vi.fn();

vi.mock('@/hooks/useTeaching', () => ({
  useTeachingClasses: () => useTeachingClassesMock(),
}));

const CLASS_A: TeachingClass = {
  id: 'k1',
  name: 'CTDL001',
  courseName: 'CTDL&GT',
  semesterId: 'sem-1',
  semesterName: 'HK1 2025-2026',
  nominalClassId: 'nc-1',
  nominalClassName: 'D21CQCN01 — Công nghệ thông tin',
  studentCount: 40,
};

const CLASS_B: TeachingClass = {
  id: 'k2',
  name: 'OOP002',
  courseName: 'Lập trình hướng đối tượng',
  semesterId: 'sem-2',
  semesterName: 'HK2 2025-2026',
  nominalClassId: null,
  nominalClassName: null,
  studentCount: 35,
};

/**
 * Lớp do admin phân công — teacher không tạo/xoá lớp trên trang này.
 */
describe('TeacherClassesPage', () => {
  beforeEach(() => {
    useTeachingClassesMock.mockReturnValue({
      data: [CLASS_A, CLASS_B],
      isLoading: false,
      isError: false,
    });
  });

  it('không còn nút tạo lớp', () => {
    render(<TeacherClassesPage />);
    expect(screen.queryByRole('button', { name: /tạo lớp/i })).not.toBeInTheDocument();
  });

  it('liệt kê lớp đã phân công và link roster', () => {
    render(<TeacherClassesPage />);
    expect(screen.getByText('CTDL001')).toBeInTheDocument();
    expect(screen.getByText('CTDL&GT')).toBeInTheDocument();
    expect(screen.getByText('HK1 2025-2026')).toBeInTheDocument();
    expect(screen.getByText('D21CQCN01 — Công nghệ thông tin')).toBeInTheDocument();
    const rosterLinks = screen.getAllByRole('link', { name: /danh sách sv/i });
    expect(rosterLinks[0]).toHaveAttribute('href', '/teacher/classes/k1/roster');
    expect(rosterLinks[1]).toHaveAttribute('href', '/teacher/classes/k2/roster');
  });

  it('hiện — khi lớp chưa gắn học kỳ hoặc lớp danh nghĩa', () => {
    useTeachingClassesMock.mockReturnValue({
      data: [
        {
          ...CLASS_A,
          semesterId: null,
          semesterName: null,
          nominalClassId: null,
          nominalClassName: null,
        },
      ],
      isLoading: false,
      isError: false,
    });
    render(<TeacherClassesPage />);
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2);
  });

  it('empty state khi chưa được phân công', () => {
    useTeachingClassesMock.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    });
    render(<TeacherClassesPage />);
    expect(screen.getByText(/chưa được phân công lớp nào/i)).toBeInTheDocument();
    expect(screen.queryByLabelText('Tìm theo lớp hoặc môn')).not.toBeInTheDocument();
  });

  it('tìm theo mã lớp hoặc tên môn', async () => {
    render(<TeacherClassesPage />);
    fireEvent.change(screen.getByLabelText('Tìm theo lớp hoặc môn'), {
      target: { value: 'oop' },
    });
    await waitFor(() => {
      expect(screen.getByText('OOP002')).toBeInTheDocument();
      expect(screen.queryByText('CTDL001')).not.toBeInTheDocument();
    });
  });

  it('lọc theo môn — gõ để tìm trong danh sách môn', async () => {
    render(<TeacherClassesPage />);
    fireEvent.click(screen.getByRole('combobox', { name: 'Lọc theo môn' }));
    fireEvent.change(screen.getByPlaceholderText('Gõ tên môn…'), {
      target: { value: 'hướng đối' },
    });
    expect(screen.queryByRole('option', { name: 'CTDL&GT' })).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole('option', { name: 'Lập trình hướng đối tượng' }));
    expect(screen.getByText('OOP002')).toBeInTheDocument();
    expect(screen.queryByText('CTDL001')).not.toBeInTheDocument();
  });

  it('lọc theo học kỳ', async () => {
    render(<TeacherClassesPage />);
    fireEvent.click(screen.getByRole('combobox', { name: 'Lọc theo học kỳ' }));
    fireEvent.click(await screen.findByRole('option', { name: 'HK2 2025-2026' }));
    expect(screen.getByText('OOP002')).toBeInTheDocument();
    expect(screen.queryByText('CTDL001')).not.toBeInTheDocument();
  });

  it('xóa lọc hiện lại toàn bộ', async () => {
    render(<TeacherClassesPage />);
    fireEvent.click(screen.getByRole('combobox', { name: 'Lọc theo môn' }));
    fireEvent.click(await screen.findByRole('option', { name: 'CTDL&GT' }));
    fireEvent.click(screen.getByRole('button', { name: /xóa lọc/i }));
    expect(screen.getByText('CTDL001')).toBeInTheDocument();
    expect(screen.getByText('OOP002')).toBeInTheDocument();
  });

  it('empty state khi không khớp bộ lọc', async () => {
    render(<TeacherClassesPage />);
    fireEvent.change(screen.getByLabelText('Tìm theo lớp hoặc môn'), {
      target: { value: 'khong-co-lop-nao' },
    });
    await waitFor(() => {
      expect(screen.getByText(/không có lớp khớp bộ lọc/i)).toBeInTheDocument();
    });
    expect(screen.getAllByRole('button', { name: /xóa lọc/i }).length).toBeGreaterThan(0);
  });
});

describe('filterTeachingClasses', () => {
  const rows = [CLASS_A, CLASS_B];

  it('search khớp lớp hoặc môn, không phân biệt hoa thường', () => {
    expect(filterTeachingClasses(rows, { search: 'ctdl', courseName: null, semesterName: null })).toEqual([
      CLASS_A,
    ]);
    expect(
      filterTeachingClasses(rows, {
        search: 'hướng đối tượng',
        courseName: null,
        semesterName: null,
      }),
    ).toEqual([CLASS_B]);
  });

  it('filter môn và học kỳ kết hợp với search', () => {
    expect(
      filterTeachingClasses(rows, {
        search: '',
        courseName: 'CTDL&GT',
        semesterName: 'HK1 2025-2026',
      }),
    ).toEqual([CLASS_A]);
    expect(
      filterTeachingClasses(rows, {
        search: 'OOP',
        courseName: 'CTDL&GT',
        semesterName: null,
      }),
    ).toEqual([]);
  });
});
