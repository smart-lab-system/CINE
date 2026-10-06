import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { NearDuplicateError } from '@/lib/api/http-error';
import { AdministrativeClassCatalogDialog } from './administrative-class-catalog-dialog';

const useCatalogMock = vi.fn();
const mutation = () => ({ mutateAsync: vi.fn(), isPending: false, error: null as Error | null, reset: vi.fn() });
const create = mutation();
const update = mutation();
const remove = mutation();

vi.mock('@/hooks/useAdministrativeClasses', () => ({
  useAdministrativeClasses: () => useCatalogMock(),
  useCreateAdministrativeClass: () => create,
  useUpdateAdministrativeClass: () => update,
  useDeleteAdministrativeClass: () => remove,
}));
vi.mock('@/components/import/import-dialog', () => ({
  ImportDialog: ({ kind }: { kind: { id: string } }) => <button type="button">Nhập từ file ({kind.id})</button>,
}));

const code = (id: string, value: string, classCount = 0) => ({ id, code: value, classCount });
const load = (data: ReturnType<typeof code>[]) => useCatalogMock.mockReturnValue({ data, isLoading: false, error: null });

function setup(open = true) {
  const onOpenChange = vi.fn();
  const view = render(<AdministrativeClassCatalogDialog open={open} onOpenChange={onOpenChange} />);
  return { onOpenChange, ...view };
}

describe('AdministrativeClassCatalogDialog', () => {
  beforeEach(() => {
    [create, update, remove].forEach((m) => {
      m.mutateAsync.mockReset().mockResolvedValue({});
      m.reset.mockReset();
      m.error = null;
    });
    useCatalogMock.mockReset();
  });

  it('đóng thì không vẽ gì', () => {
    load([code('a1', 'DHKTPM18A')]);
    setup(false);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('liệt kê mã kèm số lớp đang dùng; có nút nhập từ file', () => {
    load([code('a1', 'DHKTPM18A', 3), code('a2', 'DHKTPM18B', 0)]);
    setup();

    const dialog = screen.getByRole('dialog', { name: 'Danh mục lớp danh nghĩa' });
    expect(within(dialog).getByRole('row', { name: /DHKTPM18A/ })).toHaveTextContent('3');
    expect(within(dialog).getByRole('row', { name: /DHKTPM18B/ })).toHaveTextContent('0');
    expect(within(dialog).getByRole('button', { name: 'Nhập từ file (administrative-class)' })).toBeInTheDocument();
  });

  it('danh mục trống: nói rõ và chỉ cách thêm', () => {
    load([]);
    setup();
    expect(screen.getByText(/chưa có mã lớp danh nghĩa nào/i)).toBeInTheDocument();
  });

  describe('thêm một mã (ô gõ duy nhất còn lại)', () => {
    it('nút Thêm tắt khi ô trống; gửi mã rồi xoá ô', async () => {
      load([]);
      setup();
      const add = screen.getByRole('button', { name: 'Thêm mã' });
      expect(add).toBeDisabled();

      fireEvent.change(screen.getByLabelText('Mã lớp danh nghĩa mới'), { target: { value: 'dhktpm19a' } });
      expect(add).toBeEnabled();
      fireEvent.click(add);

      await waitFor(() => expect(create.mutateAsync).toHaveBeenCalledWith({ code: 'dhktpm19a' }));
      await waitFor(() => expect(screen.getByLabelText('Mã lớp danh nghĩa mới')).toHaveValue(''));
    });

    it('gần giống: lời nhắc nêu mã bị so; "Vẫn thêm" gửi lại với confirmSimilar', async () => {
      load([code('a1', 'DHKTPM18ATT')]);
      const nearDuplicate = new NearDuplicateError('Mã lớp danh nghĩa "DHKTPM18ATTT" gần giống "DHKTPM18ATT".', [
        { id: 'a1', name: 'DHKTPM18ATT' },
      ]);
      create.mutateAsync.mockRejectedValueOnce(nearDuplicate);
      const view = setup();

      fireEvent.change(screen.getByLabelText('Mã lớp danh nghĩa mới'), { target: { value: 'DHKTPM18ATTT' } });
      fireEvent.click(screen.getByRole('button', { name: 'Thêm mã' }));
      await waitFor(() => expect(create.mutateAsync).toHaveBeenCalledTimes(1));

      create.error = nearDuplicate;
      view.rerender(<AdministrativeClassCatalogDialog open onOpenChange={vi.fn()} />);
      // Mã bị so hiện trong lời nhắc (và cả trong bảng) — hai nơi, đều đúng.
      expect(screen.getAllByText('DHKTPM18ATT').length).toBeGreaterThanOrEqual(2);
      fireEvent.click(screen.getByRole('button', { name: /vẫn thêm mã lớp danh nghĩa này/i }));

      await waitFor(() =>
        expect(create.mutateAsync).toHaveBeenLastCalledWith({ code: 'DHKTPM18ATTT', confirmSimilar: true }),
      );
    });

    it('trùng CỨNG hiện như lỗi thường, không có nút "Vẫn thêm"', () => {
      load([code('a1', 'DHKTPM18A')]);
      create.error = new Error('Mã DHKTPM18A đã tồn tại trong Danh mục lớp danh nghĩa.');
      setup();
      expect(screen.getByText('Mã DHKTPM18A đã tồn tại trong Danh mục lớp danh nghĩa.')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /vẫn thêm/i })).not.toBeInTheDocument();
    });

    it('mở hộp thoại là trạng thái mới: lỗi của lần trước bị xoá (Review Focus 2)', () => {
      load([]);
      setup();
      expect(create.reset).toHaveBeenCalled();
    });
  });

  describe('sửa mã', () => {
    it('form mang mã hiện có, nói rõ nhãn của mọi lớp dùng mã sẽ đổi theo, gửi { id, body: { code } }', async () => {
      load([code('a1', 'DHKTPM18A', 3)]);
      setup();

      fireEvent.click(within(screen.getByRole('row', { name: /DHKTPM18A/ })).getByRole('button', { name: 'Sửa mã DHKTPM18A' }));
      const form = screen.getByRole('dialog', { name: 'Sửa mã lớp danh nghĩa' });
      expect(within(form).getByLabelText('Mã lớp danh nghĩa')).toHaveValue('DHKTPM18A');
      expect(within(form).getByText(/mọi lớp dùng mã này/i)).toBeInTheDocument();

      fireEvent.change(within(form).getByLabelText('Mã lớp danh nghĩa'), { target: { value: 'DHKTPM18B' } });
      fireEvent.click(within(form).getByRole('button', { name: 'Lưu' }));

      await waitFor(() =>
        expect(update.mutateAsync).toHaveBeenCalledWith({ id: 'a1', body: { code: 'DHKTPM18B' } }),
      );
    });

    // Server cũng cảnh báo gần giống khi ĐỔI MÃ (administrative-class.service.ts): nút phải nói "lưu", không phải "thêm" — review B+G1 M9.
    it('đổi mã thành gần giống: nút "Vẫn lưu mã lớp danh nghĩa này" (không phải "thêm") và gửi lại id + confirmSimilar', async () => {
      load([code('a1', 'DHKTPM18A', 3), code('a2', 'DHKTPM18BT', 0)]);
      const nearDuplicate = new NearDuplicateError('Mã lớp danh nghĩa "DHKTPM18B" gần giống "DHKTPM18BT".', [
        { id: 'a2', name: 'DHKTPM18BT' },
      ]);
      update.mutateAsync.mockRejectedValueOnce(nearDuplicate);
      const view = setup();

      fireEvent.click(screen.getByRole('button', { name: 'Sửa mã DHKTPM18A' }));
      let form = screen.getByRole('dialog', { name: 'Sửa mã lớp danh nghĩa' });
      fireEvent.change(within(form).getByLabelText('Mã lớp danh nghĩa'), { target: { value: 'DHKTPM18B' } });
      fireEvent.click(within(form).getByRole('button', { name: 'Lưu' }));
      await waitFor(() => expect(update.mutateAsync).toHaveBeenCalledTimes(1));

      update.error = nearDuplicate;
      view.rerender(<AdministrativeClassCatalogDialog open onOpenChange={vi.fn()} />);
      form = screen.getByRole('dialog', { name: 'Sửa mã lớp danh nghĩa' });
      expect(within(form).queryByRole('button', { name: /vẫn thêm/i })).not.toBeInTheDocument();
      fireEvent.click(within(form).getByRole('button', { name: 'Vẫn lưu mã lớp danh nghĩa này' }));

      await waitFor(() =>
        expect(update.mutateAsync).toHaveBeenLastCalledWith({ id: 'a1', body: { code: 'DHKTPM18B', confirmSimilar: true } }),
      );
    });

    it('Review Focus 2: mở hộp thoại SỬA làm lại update — lỗi của lần sửa trước không hiện lại', () => {
      load([code('a1', 'DHKTPM18A', 3)]);
      setup();
      update.reset.mockClear();
      fireEvent.click(screen.getByRole('button', { name: 'Sửa mã DHKTPM18A' }));
      expect(update.reset).toHaveBeenCalledTimes(1);
    });
  });

  describe('xoá mã', () => {
    it('mã còn lớp dùng: lý do của server hiện nguyên văn và hộp thoại KHÔNG đóng', async () => {
      const message = 'Mã DHKTPM18A còn 3 lớp đang dùng nên không xoá được. Hãy chuyển hoặc xoá các lớp đó trước.';
      load([code('a1', 'DHKTPM18A', 3)]);
      remove.mutateAsync.mockRejectedValue(new Error(message));
      remove.error = new Error(message);
      setup();

      fireEvent.click(within(screen.getByRole('row', { name: /DHKTPM18A/ })).getByRole('button', { name: 'Xoá mã DHKTPM18A' }));
      const confirm = screen.getByRole('dialog', { name: /xoá mã/i });
      expect(within(confirm).getByText(message)).toBeInTheDocument();
      fireEvent.click(within(confirm).getByRole('button', { name: 'Xoá' }));

      await waitFor(() => expect(remove.mutateAsync).toHaveBeenCalledWith('a1'));
      expect(screen.getByRole('dialog', { name: /xoá mã/i })).toBeInTheDocument();
    });

    it('Review Focus 2: mở hộp thoại XOÁ làm lại remove — lý do của lần xoá trước không hiện lại cho mã khác', () => {
      load([code('a1', 'DHKTPM18A', 3)]);
      setup();
      fireEvent.click(screen.getByRole('button', { name: 'Xoá mã DHKTPM18A' }));
      expect(remove.reset).toHaveBeenCalledTimes(1);
    });
  });

  it('lỗi tải danh mục hiện lời báo', () => {
    useCatalogMock.mockReturnValue({ data: undefined, isLoading: false, error: new Error('Không tải được danh mục') });
    setup();
    expect(screen.getByText('Không tải được danh mục')).toBeInTheDocument();
  });
});
