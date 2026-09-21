import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import TeacherClassesPage from './page';

const useTeachingClassesMock = vi.fn();
const createMutate = vi.fn();
const updateMutate = vi.fn();
const deleteMutate = vi.fn();

vi.mock('@/hooks/useTeaching', () => ({
  useTeachingClasses: () => useTeachingClassesMock(),
  useCreateClass: () => ({ mutate: createMutate, isPending: false }),
  useUpdateClass: () => ({ mutate: updateMutate, isPending: false }),
  useDeleteClass: () => ({ mutate: deleteMutate, isPending: false }),
}));

const CLASS = {
  id: 'k1',
  name: 'N01',
  courseName: 'CTDL&GT',
  studentCount: 40,
};

/**
 * Trang "Lớp của tôi", sau khi lớp về tay giảng viên.
 *
 * Bộ test này khoá lại một thay đổi QUYỀN, không chỉ một thay đổi giao diện:
 * trước đợt thu hẹp master data, bốn route lớp gắn `@Roles('department_admin')`
 * và trang này chỉ đọc. Vai trò đó không còn — nếu trang quay lại chỉ-đọc thì
 * không ai tạo được lớp nữa, tức là không ai tạo được phiên thi.
 */
describe('TeacherClassesPage', () => {
  beforeEach(() => {
    createMutate.mockReset();
    updateMutate.mockReset();
    deleteMutate.mockReset();
    useTeachingClassesMock.mockReturnValue({
      data: [CLASS],
      isLoading: false,
      isError: false,
    });
  });

  it('hiện nút tạo lớp cho giảng viên', () => {
    render(<TeacherClassesPage />);

    expect(screen.getByRole('button', { name: /tạo lớp/i })).toBeInTheDocument();
  });

  it('KHÔNG hỏi môn học — hệ thống chỉ có một môn', () => {
    render(<TeacherClassesPage />);
    fireEvent.click(screen.getByRole('button', { name: /tạo lớp/i }));

    // Một câu hỏi chỉ có đúng một đáp án, lại không được kiểm: trả lời lệch
    // một ký tự thì lớp này rơi khỏi mọi phép tra "cùng môn", và phép gãy
    // đầu tiên là đường định tuyến bài thi bù. Server điền hằng số.
    expect(screen.queryByLabelText('Môn học')).not.toBeInTheDocument();
  });

  it('gửi tên lớp lên API khi tạo, đã cắt khoảng trắng', () => {
    render(<TeacherClassesPage />);

    fireEvent.click(screen.getByRole('button', { name: /tạo lớp/i }));
    fireEvent.change(screen.getByLabelText('Tên lớp'), { target: { value: '  N05  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo lớp' }));

    expect(createMutate).toHaveBeenCalledWith({ name: 'N05' }, expect.anything());
  });

  it('không gửi gì khi thiếu tên lớp', () => {
    render(<TeacherClassesPage />);

    fireEvent.click(screen.getByRole('button', { name: /tạo lớp/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Tạo lớp' }));

    expect(createMutate).not.toHaveBeenCalled();
    expect(screen.getByText(/nhập tên lớp/i)).toBeInTheDocument();
  });

  it('mở form sửa với dữ liệu của đúng lớp đó', () => {
    render(<TeacherClassesPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Sửa lớp N01' }));

    expect(screen.getByLabelText('Tên lớp')).toHaveValue('N01');
  });

  it('cảnh báo sĩ số trước khi xoá, và xoá đúng lớp', () => {
    render(<TeacherClassesPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Xoá lớp N01' }));
    // Trong HỘP THOẠI, không phải trong bảng: con số ở bảng là thông tin,
    // con số ở đây là lời cảnh báo trước một thao tác server sẽ từ chối
    // (ON DELETE RESTRICT). Hai chỗ khác nhau về mục đích.
    const dialog = within(screen.getByRole('dialog'));
    expect(dialog.getByText(/40 sinh viên/)).toBeInTheDocument();

    fireEvent.click(dialog.getByRole('button', { name: 'Xoá lớp' }));
    expect(deleteMutate).toHaveBeenCalledWith('k1', expect.anything());
  });
});
