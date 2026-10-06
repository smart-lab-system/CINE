import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ADMINISTRATIVE_CLASS_KIND, ROOM_KIND } from '@/lib/import/columns';

vi.mock('@/hooks/useMasterDataImport', () => ({ useImportRunner: () => vi.fn() }));
vi.mock('@/lib/import/template', () => ({ downloadTemplate: vi.fn() }));

import { ImportDialog } from './import-dialog';

describe('ImportDialog', () => {
  it('có nút mở; chưa mở thì chưa có hộp thoại', () => {
    render(<ImportDialog kind={ROOM_KIND} />);
    expect(screen.getByRole('button', { name: 'Nhập từ file' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('mở ra hộp thoại có tiêu đề theo loại và bước chọn file', () => {
    render(<ImportDialog kind={ROOM_KIND} />);
    fireEvent.click(screen.getByRole('button', { name: 'Nhập từ file' }));

    expect(screen.getByRole('dialog', { name: 'Nhập phòng thi từ file' })).toBeInTheDocument();
    expect(screen.getByLabelText(/file excel/i)).toBeInTheDocument();
  });

  it('tiêu đề đổi theo loại', () => {
    render(<ImportDialog kind={ADMINISTRATIVE_CLASS_KIND} triggerLabel="Nhập mã từ file" />);
    fireEvent.click(screen.getByRole('button', { name: 'Nhập mã từ file' }));
    expect(screen.getByRole('dialog', { name: 'Nhập danh mục lớp danh nghĩa từ file' })).toBeInTheDocument();
  });

  it('Final I1: nút mở KHÔNG phải nút gửi form — đặt trong một <form>, bấm vào chỉ mở hộp thoại, không gửi form', () => {
    // Danh mục lớp danh nghĩa đặt nút này cạnh "Thêm mã" TRONG form thêm mã. Một <button> không có `type` là nút gửi, nên bấm "Nhập từ file" từng ghi
    // luôn mã đang gõ dở (hoặc báo 400 vì ô trống). Test của Danh mục mock ImportDialog bằng <button type="button"> nên che đúng chỗ lỗi — kiểm ở đây, với bản thật.
    const onSubmit = vi.fn((event: { preventDefault: () => void }) => event.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <ImportDialog kind={ROOM_KIND} />
      </form>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Nhập từ file' }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Nhập phòng thi từ file' })).toBeInTheDocument();
  });

  it('đóng hộp thoại gỡ nội dung (trạng thái import không sống sót sau khi đóng)', () => {
    render(<ImportDialog kind={ROOM_KIND} />);
    fireEvent.click(screen.getByRole('button', { name: 'Nhập từ file' }));
    fireEvent.click(screen.getByRole('button', { name: 'Đóng' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
