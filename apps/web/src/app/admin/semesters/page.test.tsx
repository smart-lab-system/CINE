import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import SemestersPage from './page';

const useSemestersMock = vi.fn();
const create = { mutateAsync: vi.fn(), isPending: false, error: null as Error | null, reset: vi.fn() };
const update = { mutateAsync: vi.fn(), isPending: false, error: null as Error | null, reset: vi.fn() };
const remove = { mutateAsync: vi.fn(), isPending: false, error: null as Error | null, reset: vi.fn() };

vi.mock('@/hooks/useSemesters', () => ({
  useSemesters: () => useSemestersMock(),
  useCreateSemester: () => create,
  useUpdateSemester: () => update,
  useDeleteSemester: () => remove,
}));
vi.mock('@/components/import/import-dialog', () => ({
  ImportDialog: ({ kind }: { kind: { id: string } }) => <button type="button">Nhập từ file ({kind.id})</button>,
}));

const sem = (id: string, year: number, term: number, classCount = 0) => ({
  id,
  academicYearStart: year,
  term,
  label: `HK${term} ${year}-${year + 1}`,
  startDate: `${year}-09-01`,
  endDate: `${year + 1}-01-31`,
  classCount,
});

function load(data: ReturnType<typeof sem>[]) {
  useSemestersMock.mockReturnValue({ data, isLoading: false, error: null });
}

describe('Trang Học kỳ', () => {
  beforeEach(() => {
    [create, update, remove].forEach((m) => {
      m.mutateAsync.mockReset().mockResolvedValue({});
      m.reset.mockReset();
      m.error = null;
    });
  });

  it('Review Focus 8: nhóm theo năm học — năm mới trước, trong năm kỳ 1 trước — dù dữ liệu đến lộn xộn', () => {
    load([sem('b2', 2026, 2), sem('a1', 2025, 1), sem('b1', 2026, 1), sem('b3', 2026, 3)]);
    render(<SemestersPage />);

    const rows = screen.getAllByRole('row').slice(1).map((r) => r.textContent ?? '');
    expect(rows[0]).toContain('Năm học 2026-2027');
    expect(rows[1]).toContain('HK1 2026-2027');
    expect(rows[2]).toContain('HK2 2026-2027');
    expect(rows[3]).toContain('HK3 2026-2027');
    expect(rows[4]).toContain('Năm học 2025-2026');
    expect(rows[5]).toContain('HK1 2025-2026');
    expect(screen.getAllByText(/^Năm học 20/)).toHaveLength(2); // mỗi năm đúng một tiêu đề
  });

  it('hiện ngày dd/mm/yyyy và số lớp; có nút nhập từ file', () => {
    load([sem('b1', 2026, 1, 3)]);
    render(<SemestersPage />);

    const row = screen.getByRole('row', { name: /HK1 2026-2027/ });
    expect(row).toHaveTextContent('01/09/2026');
    expect(row).toHaveTextContent('31/01/2027');
    expect(row).toHaveTextContent('3');
    expect(screen.getByRole('button', { name: 'Nhập từ file (semester)' })).toBeInTheDocument();
  });

  it('chưa có học kỳ: lời chỉ đường', () => {
    load([]);
    render(<SemestersPage />);
    expect(screen.getByText('Chưa có học kỳ nào')).toBeInTheDocument();
  });

  it('thêm học kỳ: gửi số thật và ngày yyyy-mm-dd, rồi đóng hộp thoại', async () => {
    load([]);
    render(<SemestersPage />);

    fireEvent.click(screen.getByRole('button', { name: /thêm học kỳ/i }));
    expect(create.reset).toHaveBeenCalled(); // Review Focus 2
    const dialog = screen.getByRole('dialog', { name: 'Thêm học kỳ' });
    const submit = within(dialog).getByRole('button', { name: 'Tạo' });
    expect(submit).toBeDisabled(); // chưa đủ ô

    fireEvent.change(within(dialog).getByLabelText('Năm học (năm bắt đầu)'), { target: { value: '2026' } });
    fireEvent.change(within(dialog).getByLabelText('Ngày bắt đầu'), { target: { value: '2026-09-01' } });
    fireEvent.change(within(dialog).getByLabelText('Ngày kết thúc'), { target: { value: '2027-01-31' } });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);

    await waitFor(() =>
      expect(create.mutateAsync).toHaveBeenCalledWith({
        academicYearStart: 2026,
        term: 1,
        startDate: '2026-09-01',
        endDate: '2027-01-31',
      }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Thêm học kỳ' })).not.toBeInTheDocument());
  });

  it('sửa học kỳ ĐÃ CÓ LỚP: năm và kỳ khoá kèm lý do, chỉ ngày sửa được', () => {
    load([sem('b1', 2026, 1, 3)]);
    render(<SemestersPage />);

    fireEvent.click(within(screen.getByRole('row', { name: /HK1 2026-2027/ })).getByRole('button', { name: 'Sửa' }));

    const dialog = screen.getByRole('dialog', { name: 'Sửa học kỳ' });
    expect(within(dialog).getByLabelText('Năm học (năm bắt đầu)')).toBeDisabled();
    expect(within(dialog).getByRole('combobox', { name: 'Kỳ' })).toBeDisabled();
    expect(within(dialog).getByLabelText('Ngày kết thúc')).toBeEnabled();
    expect(within(dialog).getByText(/đã có 3 lớp/i)).toBeInTheDocument();
  });

  it('sửa học kỳ CHƯA có lớp: năm và kỳ sửa được', () => {
    load([sem('b1', 2026, 1, 0)]);
    render(<SemestersPage />);
    fireEvent.click(within(screen.getByRole('row', { name: /HK1 2026-2027/ })).getByRole('button', { name: 'Sửa' }));
    const dialog = screen.getByRole('dialog', { name: 'Sửa học kỳ' });
    expect(within(dialog).getByLabelText('Năm học (năm bắt đầu)')).toBeEnabled();
  });

  it('lưu sửa gửi id và thân đủ bốn trường', async () => {
    load([sem('b1', 2026, 1, 0)]);
    render(<SemestersPage />);
    fireEvent.click(within(screen.getByRole('row', { name: /HK1 2026-2027/ })).getByRole('button', { name: 'Sửa' }));
    const dialog = screen.getByRole('dialog', { name: 'Sửa học kỳ' });

    fireEvent.change(within(dialog).getByLabelText('Ngày kết thúc'), { target: { value: '2027-02-15' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Lưu' }));

    await waitFor(() =>
      expect(update.mutateAsync).toHaveBeenCalledWith({
        id: 'b1',
        body: { academicYearStart: 2026, term: 1, startDate: '2026-09-01', endDate: '2027-02-15' },
      }),
    );
  });

  it('xoá: lý do của server hiện nguyên văn và hộp thoại KHÔNG đóng', async () => {
    load([sem('b1', 2026, 1, 3)]);
    remove.mutateAsync.mockRejectedValue(new Error('HK1 2026-2027 còn 3 lớp nên không xoá được.'));
    remove.error = new Error('HK1 2026-2027 còn 3 lớp nên không xoá được.');
    render(<SemestersPage />);

    fireEvent.click(within(screen.getByRole('row', { name: /HK1 2026-2027/ })).getByRole('button', { name: 'Xoá' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('HK1 2026-2027 còn 3 lớp nên không xoá được.')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Xoá' }));

    await waitFor(() => expect(remove.mutateAsync).toHaveBeenCalledWith('b1'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  // Review Focus 2: hộp thoại thêm/sửa dùng CHUNG một chỗ hiện lỗi (`create.error ?? update.error`), nên mỗi lần mở phải làm lại cả hai
  // mutation — nếu không, lỗi của một lần thêm hỏng hiện lại trong hộp thoại sửa (và ngược lại).
  describe('Review Focus 2: mỗi lần mở một hộp thoại là trạng thái mới', () => {
    it('mở hộp thoại THÊM làm lại cả create lẫn update', () => {
      load([]);
      render(<SemestersPage />);
      fireEvent.click(screen.getByRole('button', { name: /thêm học kỳ/i }));
      expect(create.reset).toHaveBeenCalledTimes(1);
      expect(update.reset).toHaveBeenCalledTimes(1);
    });

    it('mở hộp thoại SỬA làm lại cả create lẫn update', () => {
      load([sem('b1', 2026, 1, 0)]);
      render(<SemestersPage />);
      fireEvent.click(within(screen.getByRole('row', { name: /HK1 2026-2027/ })).getByRole('button', { name: 'Sửa' }));
      expect(create.reset).toHaveBeenCalledTimes(1);
      expect(update.reset).toHaveBeenCalledTimes(1);
    });

    it('mở hộp thoại XOÁ làm lại remove — lý do của lần xoá trước không hiện lại cho hàng khác', () => {
      load([sem('b1', 2026, 1, 0)]);
      render(<SemestersPage />);
      fireEvent.click(within(screen.getByRole('row', { name: /HK1 2026-2027/ })).getByRole('button', { name: 'Xoá' }));
      expect(remove.reset).toHaveBeenCalledTimes(1);
    });
  });

  it('lỗi tải danh sách hiện lời báo của server', () => {
    useSemestersMock.mockReturnValue({ data: undefined, isLoading: false, error: new Error('Không tải được học kỳ') });
    render(<SemestersPage />);
    expect(screen.getByText('Không tải được học kỳ')).toBeInTheDocument();
  });
});
