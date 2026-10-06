import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { NearDuplicateError } from '@/lib/api/http-error';
import { ResourceFormDialog } from './resource-form-dialog';

function setup(props: Partial<React.ComponentProps<typeof ResourceFormDialog>> = {}) {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  const onOpenChange = vi.fn();
  render(
    <ResourceFormDialog
      open
      onOpenChange={onOpenChange}
      title="Thêm phòng thi"
      submitLabel="Tạo"
      submitting={false}
      error={null}
      onSubmit={onSubmit}
      {...props}
    >
      <input aria-label="Tên phòng" />
    </ResourceFormDialog>,
  );
  return { onSubmit, onOpenChange };
}

describe('ResourceFormDialog', () => {
  it('gửi thành công thì đóng', async () => {
    const { onSubmit, onOpenChange } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Tạo' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('gửi thất bại thì KHÔNG đóng (lý do phải còn đó để đọc)', async () => {
    const { onOpenChange } = setup({ onSubmit: vi.fn().mockRejectedValue(new Error('x')), error: new Error('Phòng đã tồn tại') });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo' }));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(screen.getByText('Phòng đã tồn tại')).toBeInTheDocument();
  });

  it('canSubmit=false tắt nút gửi; mặc định là bật', () => {
    setup({ canSubmit: false });
    expect(screen.getByRole('button', { name: 'Tạo' })).toBeDisabled();
  });

  it('canSubmit vắng mặt thì nút bật (mọi người gọi cũ giữ nguyên hành vi)', () => {
    setup();
    expect(screen.getByRole('button', { name: 'Tạo' })).toBeEnabled();
  });

  it('Review Focus 1: NearDuplicateError KHÔNG vẽ Alert đỏ — trang vẽ NearDuplicateNotice trong nội dung', () => {
    setup({ error: new NearDuplicateError('Phòng "H303" gần giống "Phòng H3.03".', []) });
    expect(screen.queryByText('Phòng "H303" gần giống "Phòng H3.03".')).not.toBeInTheDocument();
  });

  it('lỗi thường vẫn vẽ', () => {
    setup({ error: new Error('Phòng "H3.03" đã tồn tại.') });
    expect(screen.getByText('Phòng "H3.03" đã tồn tại.')).toBeInTheDocument();
  });
});
