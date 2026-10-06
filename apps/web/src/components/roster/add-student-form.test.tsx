import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { AddStudentForm } from './add-student-form';

const useLookupMock = vi.fn();
vi.mock('@/hooks/useStudentLookup', () => ({ useStudentLookup: (...args: unknown[]) => useLookupMock(...args) }));

const idle = { data: undefined, isFetching: false, isError: false, isSuccess: false, error: null };
const known = (fullName: string) => ({ ...idle, data: { mssv: 'SV20120001', fullName }, isSuccess: true });
const unknown = { ...idle, data: null, isSuccess: true };

function setup(props: Partial<React.ComponentProps<typeof AddStudentForm>> = {}) {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  render(<AddStudentForm onSubmit={onSubmit} submitting={false} error={null} {...props} />);
  return { onSubmit };
}
const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('AddStudentForm', () => {
  beforeEach(() => useLookupMock.mockReset().mockReturnValue(idle));

  it('Review Focus 4: tra cứu nhận ĐÚNG chuỗi đang gõ (hook tự chặn khi MSSV chưa hợp lệ)', () => {
    setup();
    type('MSSV', 'SV2');
    expect(useLookupMock).toHaveBeenLastCalledWith('SV2');
  });

  it('MSSV đã có: tên được ĐIỀN SẴN và KHOÁ, kèm cách sửa (nhập file)', () => {
    useLookupMock.mockReturnValue(known('Nguyễn Văn A'));
    setup();
    type('MSSV', 'SV20120001');

    const name = screen.getByLabelText('Họ và tên');
    expect(name).toHaveValue('Nguyễn Văn A');
    expect(name).toBeDisabled();
    expect(screen.getByText(/nhập file danh sách/i)).toBeInTheDocument();
  });

  it('Review Focus 3: MSSV đã có thì gửi tên ĐÃ LƯU, kể cả khi trước đó giảng viên đã gõ một tên khác', async () => {
    useLookupMock.mockReturnValue(idle);
    const { onSubmit } = setup();
    type('MSSV', 'SV2012000'); // chưa đủ → chưa tra
    type('Họ và tên', 'Tên gõ tay');

    useLookupMock.mockReturnValue(known('Nguyễn Văn A')); // gõ nốt MSSV → tra ra tên đã lưu
    type('MSSV', 'SV20120001');
    fireEvent.click(screen.getByRole('button', { name: 'Thêm' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ mssv: 'SV20120001', name: 'Nguyễn Văn A' }));
  });

  it('MSSV mới: ô tên mở và BẮT BUỘC; nút Thêm tắt cho tới khi có tên', () => {
    useLookupMock.mockReturnValue(unknown);
    setup();
    type('MSSV', 'SV20129999');

    expect(screen.getByLabelText('Họ và tên')).toBeEnabled();
    expect(screen.getByText(/mssv mới: nhập họ và tên/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Thêm' })).toBeDisabled();

    type('Họ và tên', '  Trần Thị B ');
    expect(screen.getByRole('button', { name: 'Thêm' })).toBeEnabled();
  });

  it('MSSV mới: gửi tên đã cắt khoảng trắng rồi xoá form', async () => {
    useLookupMock.mockReturnValue(unknown);
    const { onSubmit } = setup();
    type('MSSV', ' SV20129999 ');
    type('Họ và tên', '  Trần Thị B ');
    fireEvent.click(screen.getByRole('button', { name: 'Thêm' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ mssv: 'SV20129999', name: 'Trần Thị B' }));
    await waitFor(() => expect(screen.getByLabelText('MSSV')).toHaveValue(''));
    expect(screen.getByLabelText('Họ và tên')).toHaveValue('');
  });

  it('đang tra cứu: ô tên khoá và nút Thêm tắt (đừng để gõ tên trước khi biết MSSV đã có chưa)', () => {
    useLookupMock.mockReturnValue({ ...idle, isFetching: true });
    setup();
    type('MSSV', 'SV20120001');

    expect(screen.getByLabelText('Họ và tên')).toBeDisabled();
    expect(screen.getByText(/đang tra tên/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Thêm' })).toBeDisabled();
  });

  it('Review Focus 3: tra cứu LỖI không chặn — ô tên mở, có lời báo, vẫn thêm được (server không ghi đè tên đã lưu)', async () => {
    useLookupMock.mockReturnValue({ ...idle, isError: true, error: new Error('Tra cứu quá nhanh, hãy thử lại sau ít phút.') });
    const { onSubmit } = setup();
    type('MSSV', 'SV20120001');

    expect(screen.getByLabelText('Họ và tên')).toBeEnabled();
    expect(screen.getByText(/tra cứu quá nhanh/i)).toBeInTheDocument();
    type('Họ và tên', 'Lê Văn C');
    fireEvent.click(screen.getByRole('button', { name: 'Thêm' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ mssv: 'SV20120001', name: 'Lê Văn C' }));
  });

  it('MSSV chưa nhập: nút Thêm tắt', () => {
    setup();
    expect(screen.getByRole('button', { name: 'Thêm' })).toBeDisabled();
  });

  it('lỗi của server (vd sinh viên đang ở lớp khác cùng môn) hiện nguyên văn và KHÔNG xoá form', async () => {
    useLookupMock.mockReturnValue(unknown);
    const { onSubmit } = setup({ error: new Error('Sinh viên SV20129999 đang ở lớp DHKTPM18B.') });
    onSubmit.mockRejectedValue(new Error('x'));
    type('MSSV', 'SV20129999');
    type('Họ và tên', 'Trần Thị B');

    expect(screen.getByText('Sinh viên SV20129999 đang ở lớp DHKTPM18B.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Thêm' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(screen.getByLabelText('MSSV')).toHaveValue('SV20129999');
  });
});
