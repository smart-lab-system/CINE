import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { NearDuplicateError } from '@/lib/api/http-error';
import RoomsPage from './page';

const useRoomsMock = vi.fn();
const mutation = () => ({ mutateAsync: vi.fn(), isPending: false, error: null as Error | null, reset: vi.fn() });
const create = mutation();
const update = mutation();
const remove = mutation();

vi.mock('@/hooks/useRooms', () => ({
  useRooms: (...args: unknown[]) => useRoomsMock(...args),
  useCreateRoom: () => create,
  useUpdateRoom: () => update,
  useDeleteRoom: () => remove,
}));
vi.mock('@/components/import/import-dialog', () => ({
  ImportDialog: ({ kind }: { kind: { id: string } }) => <button type="button">Nhập từ file ({kind.id})</button>,
}));

const room = (id: string, name: string, capacity: number | null = 40, isActive = true, sessionCount = 0) => ({
  id,
  name,
  capacity,
  isActive,
  sessionCount,
});

function load(data: ReturnType<typeof room>[]) {
  useRoomsMock.mockReturnValue({ data, isLoading: false, error: null });
}

describe('Trang Phòng thi', () => {
  beforeEach(() => {
    [create, update, remove].forEach((m) => {
      m.mutateAsync.mockReset().mockResolvedValue({});
      m.reset.mockReset();
      m.error = null;
    });
    useRoomsMock.mockReset();
  });

  it('đọc CẢ phòng đã ngừng hoạt động (trang quản trị), không chỉ phòng đang chạy', () => {
    load([room('r1', 'Phòng H3.03')]);
    render(<RoomsPage />);
    expect(useRoomsMock).toHaveBeenCalledWith(); // không activeOnly
  });

  it('hiện tên, sức chứa, trạng thái, số phiên; phòng ngừng hoạt động hiện nhãn và mờ đi', () => {
    load([room('r1', 'Phòng H3.03', 40, true, 4), room('r2', 'Phòng H3.04', null, false, 0)]);
    render(<RoomsPage />);

    const active = screen.getByRole('row', { name: /Phòng H3\.03/ });
    expect(active).toHaveTextContent('40');
    expect(active).toHaveTextContent('Đang hoạt động');
    expect(active).toHaveTextContent('4');

    const stopped = screen.getByRole('row', { name: /Phòng H3\.04/ });
    expect(stopped).toHaveTextContent('chưa rõ'); // sức chứa null
    expect(stopped).toHaveTextContent('Ngừng hoạt động');
    expect(stopped).toHaveClass('opacity-60');
  });

  it('ô tìm lọc theo tên, không phân biệt hoa-thường và dấu', () => {
    load([room('r1', 'Phòng máy A1'), room('r2', 'Phòng H3.03')]);
    render(<RoomsPage />);

    fireEvent.change(screen.getByRole('searchbox', { name: 'Tìm phòng thi' }), { target: { value: 'may a1' } });

    expect(screen.getByText('Phòng máy A1')).toBeInTheDocument();
    expect(screen.queryByText('Phòng H3.03')).not.toBeInTheDocument();
  });

  it('tìm không ra: nói là bộ lọc không khớp và cho xoá bộ lọc (không nói "chưa có phòng nào")', () => {
    load([room('r1', 'Phòng máy A1')]);
    render(<RoomsPage />);

    fireEvent.change(screen.getByRole('searchbox', { name: 'Tìm phòng thi' }), { target: { value: 'zzz' } });

    expect(screen.getByText('Không có phòng nào khớp ô tìm')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Xoá ô tìm' }));
    expect(screen.getByText('Phòng máy A1')).toBeInTheDocument();
  });

  it('chưa có phòng nào: lời chỉ đường', () => {
    load([]);
    render(<RoomsPage />);
    expect(screen.getByText('Chưa có phòng thi nào')).toBeInTheDocument();
  });

  it('nút bật/tắt hoạt động gọi update với isActive đảo ngược — không có xác nhận, vì đảo lại được ngay', async () => {
    load([room('r1', 'Phòng H3.03', 40, true)]);
    render(<RoomsPage />);

    fireEvent.click(within(screen.getByRole('row', { name: /Phòng H3\.03/ })).getByRole('button', { name: 'Tắt hoạt động' }));

    await waitFor(() => expect(update.mutateAsync).toHaveBeenCalledWith({ id: 'r1', body: { isActive: false } }));
  });

  it('phòng đang tắt thì nút là "Bật hoạt động"', async () => {
    load([room('r1', 'Phòng H3.03', 40, false)]);
    render(<RoomsPage />);

    fireEvent.click(within(screen.getByRole('row', { name: /Phòng H3\.03/ })).getByRole('button', { name: 'Bật hoạt động' }));

    await waitFor(() => expect(update.mutateAsync).toHaveBeenCalledWith({ id: 'r1', body: { isActive: true } }));
  });

  describe('thêm', () => {
    it('gửi tên; sức chứa trống thì bỏ khỏi thân; rồi đóng', async () => {
      load([]);
      render(<RoomsPage />);

      fireEvent.click(screen.getByRole('button', { name: /thêm phòng/i }));
      expect(create.reset).toHaveBeenCalled(); // Review Focus 2
      const dialog = screen.getByRole('dialog', { name: 'Thêm phòng thi' });
      fireEvent.change(within(dialog).getByLabelText('Tên phòng'), { target: { value: 'Phòng máy A1' } });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Tạo' }));

      await waitFor(() => expect(create.mutateAsync).toHaveBeenCalledWith({ name: 'Phòng máy A1' }));
      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Thêm phòng thi' })).not.toBeInTheDocument());
    });

    it('gần giống: hiện lời nhắc nêu mục bị so; "Vẫn thêm" gửi lại với confirmSimilar và đóng', async () => {
      load([room('r1', 'Phòng H3.03')]);
      const nearDuplicate = new NearDuplicateError('Phòng "H303" gần giống "Phòng H3.03".', [{ id: 'r1', name: 'Phòng H3.03' }]);
      create.mutateAsync.mockRejectedValueOnce(nearDuplicate);
      const view = render(<RoomsPage />);

      fireEvent.click(screen.getByRole('button', { name: /thêm phòng/i }));
      let dialog = screen.getByRole('dialog', { name: 'Thêm phòng thi' });
      fireEvent.change(within(dialog).getByLabelText('Tên phòng'), { target: { value: 'H303' } });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Tạo' }));
      await waitFor(() => expect(create.mutateAsync).toHaveBeenCalledTimes(1));

      // Mutation giữ lỗi ở `error`; dựng lại trang với lỗi đó để thấy lời nhắc (hook thật làm điều này qua trạng thái).
      create.error = nearDuplicate;
      view.rerender(<RoomsPage />);
      dialog = screen.getByRole('dialog', { name: 'Thêm phòng thi' });
      expect(within(dialog).getByText('Phòng H3.03')).toBeInTheDocument();
      fireEvent.click(within(dialog).getByRole('button', { name: /vẫn thêm phòng này/i }));

      await waitFor(() =>
        expect(create.mutateAsync).toHaveBeenLastCalledWith({ name: 'H303', confirmSimilar: true }),
      );
    });
  });

  describe('sửa', () => {
    it('form mang giá trị hiện có; sức chứa để trống khi lưu nghĩa là xoá sức chứa (null) — Review Focus 4', async () => {
      load([room('r1', 'Phòng H3.03', 40)]);
      render(<RoomsPage />);

      fireEvent.click(within(screen.getByRole('row', { name: /Phòng H3\.03/ })).getByRole('button', { name: 'Sửa' }));
      const dialog = screen.getByRole('dialog', { name: 'Sửa phòng thi' });
      expect(within(dialog).getByLabelText('Tên phòng')).toHaveValue('Phòng H3.03');
      expect(within(dialog).getByLabelText(/Sức chứa/)).toHaveValue(40);

      fireEvent.change(within(dialog).getByLabelText(/Sức chứa/), { target: { value: '' } });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Lưu' }));

      await waitFor(() =>
        expect(update.mutateAsync).toHaveBeenCalledWith({ id: 'r1', body: { name: 'Phòng H3.03', capacity: null } }),
      );
    });

    it('nói rõ đổi tên không đổi phiên thi đã tạo (bản chụp)', () => {
      load([room('r1', 'Phòng H3.03', 40, true, 4)]);
      render(<RoomsPage />);
      fireEvent.click(within(screen.getByRole('row', { name: /Phòng H3\.03/ })).getByRole('button', { name: 'Sửa' }));
      expect(within(screen.getByRole('dialog', { name: 'Sửa phòng thi' })).getByText(/phiên thi đã tạo giữ tên cũ/i)).toBeInTheDocument();
    });

    // Server cũng cảnh báo gần giống khi ĐỔI TÊN (room.service.ts, nhánh update): nút phải nói "lưu", không phải "thêm" — review B+G1 M9.
    it('đổi tên thành gần giống: lời nhắc có nút "Vẫn lưu phòng này" (không phải "thêm") và gửi lại id + confirmSimilar', async () => {
      load([room('r1', 'Phòng H3.03', 40)]);
      const nearDuplicate = new NearDuplicateError('Phòng "H304" gần giống "Phòng H3-04".', [{ id: 'r2', name: 'Phòng H3-04' }]);
      update.mutateAsync.mockRejectedValueOnce(nearDuplicate);
      const view = render(<RoomsPage />);

      fireEvent.click(within(screen.getByRole('row', { name: /Phòng H3\.03/ })).getByRole('button', { name: 'Sửa' }));
      let dialog = screen.getByRole('dialog', { name: 'Sửa phòng thi' });
      fireEvent.change(within(dialog).getByLabelText('Tên phòng'), { target: { value: 'H304' } });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Lưu' }));
      await waitFor(() => expect(update.mutateAsync).toHaveBeenCalledTimes(1));

      update.error = nearDuplicate;
      view.rerender(<RoomsPage />);
      dialog = screen.getByRole('dialog', { name: 'Sửa phòng thi' });
      expect(within(dialog).queryByRole('button', { name: /vẫn thêm/i })).not.toBeInTheDocument();
      fireEvent.click(within(dialog).getByRole('button', { name: 'Vẫn lưu phòng này' }));

      await waitFor(() =>
        expect(update.mutateAsync).toHaveBeenLastCalledWith({
          id: 'r1',
          body: { name: 'H304', capacity: 40, confirmSimilar: true },
        }),
      );
    });
  });

  describe('xoá', () => {
    it('lý do của server (phòng đã có phiên) hiện nguyên văn và hộp thoại KHÔNG đóng', async () => {
      const message = 'Phòng "Phòng H3.03" đã có 4 phiên thi nên không xoá được. Hãy tắt hoạt động để không ai chọn nó cho phiên mới, lịch sử vẫn giữ nguyên.';
      load([room('r1', 'Phòng H3.03', 40, true, 4)]);
      remove.mutateAsync.mockRejectedValue(new Error(message));
      remove.error = new Error(message);
      render(<RoomsPage />);

      fireEvent.click(within(screen.getByRole('row', { name: /Phòng H3\.03/ })).getByRole('button', { name: 'Xoá' }));
      const dialog = screen.getByRole('dialog');
      expect(within(dialog).getByText(message)).toBeInTheDocument();
      fireEvent.click(within(dialog).getByRole('button', { name: 'Xoá' }));

      await waitFor(() => expect(remove.mutateAsync).toHaveBeenCalledWith('r1'));
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });

  // Review Focus 2: hộp thoại thêm/sửa dùng chung `create.error ?? update.error`, nên mỗi lần mở phải làm lại CẢ HAI mutation.
  describe('Review Focus 2: mỗi lần mở một hộp thoại là trạng thái mới', () => {
    it('mở THÊM và mở SỬA đều làm lại cả create lẫn update', () => {
      load([room('r1', 'Phòng H3.03')]);
      const { unmount } = render(<RoomsPage />);
      fireEvent.click(screen.getByRole('button', { name: /thêm phòng/i }));
      expect(create.reset).toHaveBeenCalledTimes(1);
      expect(update.reset).toHaveBeenCalledTimes(1);
      unmount();

      create.reset.mockClear();
      update.reset.mockClear();
      render(<RoomsPage />);
      fireEvent.click(within(screen.getByRole('row', { name: /Phòng H3\.03/ })).getByRole('button', { name: 'Sửa' }));
      expect(create.reset).toHaveBeenCalledTimes(1);
      expect(update.reset).toHaveBeenCalledTimes(1);
    });

    it('mở XOÁ làm lại remove', () => {
      load([room('r1', 'Phòng H3.03')]);
      render(<RoomsPage />);
      fireEvent.click(within(screen.getByRole('row', { name: /Phòng H3\.03/ })).getByRole('button', { name: 'Xoá' }));
      expect(remove.reset).toHaveBeenCalledTimes(1);
    });
  });

  it('có nút nhập từ file cho phòng', () => {
    load([]);
    render(<RoomsPage />);
    expect(screen.getByRole('button', { name: 'Nhập từ file (room)' })).toBeInTheDocument();
  });
});
