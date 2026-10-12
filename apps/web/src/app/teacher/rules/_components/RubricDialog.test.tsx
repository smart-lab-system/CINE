import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { toast } from 'sonner';
import { RubricDialog } from './RubricDialog';
import { criterion, overview } from './fixtures';
import type { Rubric } from '@/lib/api/grading';

const mutate = vi.fn();
const copyMutate = vi.fn();
let saveState: { isPending: boolean; isError: boolean; error: Error | null };
vi.mock('@/hooks/useGrading', () => ({ useSaveRubric: () => ({ mutate, ...saveState }) }));
vi.mock('@/hooks/useRubricErrors', () => ({ useCopyErrors: () => ({ mutate: copyMutate, isPending: false }) }));
vi.mock('@/hooks/useTeaching', () => ({
  useTeachingClasses: () => ({
    data: [
      { id: 'k1', name: 'CTDL001', courseName: 'Cấu trúc dữ liệu', semesterId: null, semesterName: null, nominalClassId: null, nominalClassName: null, studentCount: 30 },
      { id: 'k2', name: 'CTDL002', courseName: 'Cấu trúc dữ liệu', semesterId: null, semesterName: null, nominalClassId: null, nominalClassName: null, studentCount: 28 },
      { id: 'k3', name: 'TRR001', courseName: 'Toán rời rạc', semesterId: null, semesterName: null, nominalClassId: null, nominalClassName: null, studentCount: 40 },
    ],
    isLoading: false,
  }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const rubric: Rubric = {
  id: 'ru-1', teacherId: 't', name: 'CTDL', version: 2, isActive: true, totalPoints: 8.5,
  criteria: [
    { id: 'c1', key: 'tinh_dung', description: 'Tính đúng', maxPoints: 6 },
    { id: 'c2', key: 'trinh_bay', description: 'Trình bày', maxPoints: 2.5 },
  ],
};
const saved: Rubric = { ...rubric, id: 'ru-3', version: 3 };

type Props = React.ComponentProps<typeof RubricDialog>;
const props = (over: Partial<Props> = {}): Props => ({
  open: true, onOpenChange: vi.fn(), rubric, existingNames: ['CTDL'], errorCounts: {}, overviews: [], onSaved: vi.fn(), ...over,
});
const saveButton = () => screen.getByRole('button', { name: /^(Lưu thay đổi|Tạo rubric)/ });
const caps = () => screen.getAllByLabelText('Điểm tối đa');
const pickCourse = (label = 'Cấu trúc dữ liệu') => {
  fireEvent.click(screen.getByRole('combobox', { name: 'Chọn môn học' }));
  fireEvent.click(screen.getByRole('option', { name: label }));
};

beforeEach(() => {
  vi.clearAllMocks();
  mutate.mockReset();
  copyMutate.mockReset();
  saveState = { isPending: false, isError: false, error: null };
});

describe('RubricDialog — sửa tiêu chí & điểm tối đa của một rubric', () => {
  it('hiện tên rubric như chữ (tên làm nên danh tính), các hàng điền sẵn', () => {
    render(<RubricDialog {...props()} />);
    expect(screen.getByRole('heading', { name: /Sửa tiêu chí & điểm tối đa/ })).toHaveTextContent('CTDL');
    expect(screen.queryByLabelText('Tên rubric')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Tiêu chí 1')).toHaveValue('Tính đúng');
    expect(caps()[1]).toHaveValue('2.5');
    expect(screen.getByLabelText('Tổng điểm')).toHaveValue('8.5');
    expect(screen.queryByRole('combobox', { name: 'Chọn môn học' })).not.toBeInTheDocument();
  });

  it('khoá của tiêu chí có sẵn chỉ đọc — không có ô để đổi', () => {
    render(<RubricDialog {...props()} />);
    expect(screen.getByText('tinh_dung')).toHaveClass('font-mono');
    expect(screen.queryByLabelText(/Khoá tiêu chí 1/)).not.toBeInTheDocument();
  });

  it('nói hệ thống tự giữ lịch sử, KHÔNG nhắc "phiên bản"', () => {
    render(<RubricDialog {...props()} />);
    expect(screen.getByText(/Hệ thống tự giữ lịch sử mọi lần sửa/)).toBeInTheDocument();
    expect(screen.queryByText(/phiên bản/i)).not.toBeInTheDocument();
  });

  it('Lưu thay đổi khoá cho tới khi có gì đổi', () => {
    render(<RubricDialog {...props()} />);
    expect(saveButton()).toBeDisabled();
  });

  // Review Focus 1 của spec cũ — lý do hộp thoại này tồn tại thay cho RubricEditor.
  it('viết lại mô tả thì gửi KHOÁ GỐC của tiêu chí đó, và của mọi tiêu chí còn lại', () => {
    render(<RubricDialog {...props()} />);
    fireEvent.change(screen.getByLabelText('Tiêu chí 1'), { target: { value: 'Chương trình chạy đúng trên mọi test' } });
    fireEvent.click(saveButton());
    expect(mutate).toHaveBeenCalledWith(
      {
        name: 'CTDL',
        criteria: [
          { description: 'Chương trình chạy đúng trên mọi test', maxPoints: 6, key: 'tinh_dung' },
          { description: 'Trình bày', maxPoints: 2.5, key: 'trinh_bay' },
        ],
      },
      expect.anything(),
    );
  });

  it('nhận điểm tối đa gõ bằng dấu phẩy và gửi số', () => {
    render(<RubricDialog {...props()} />);
    fireEvent.change(screen.getByLabelText('Tổng điểm'), { target: { value: '10' } });
    fireEvent.change(caps()[1], { target: { value: '3,25' } });
    fireEvent.click(saveButton());
    expect(mutate.mock.calls[0][0].criteria[1]).toMatchObject({ maxPoints: 3.25, key: 'trinh_bay' });
  });

  it('tiêu chí mới có thể mang khoá tự gõ, hoặc không (máy chủ tự sinh)', () => {
    render(<RubricDialog {...props()} />);
    fireEvent.change(screen.getByLabelText('Tổng điểm'), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Thêm tiêu chí' }));
    fireEvent.change(screen.getByLabelText('Tiêu chí 3'), { target: { value: 'Xử lý ngoại lệ' } });
    fireEvent.change(screen.getByLabelText('Khoá tiêu chí 3 (tuỳ chọn)'), { target: { value: 'ngoai_le' } });
    fireEvent.click(screen.getByRole('button', { name: 'Thêm tiêu chí' }));
    fireEvent.change(screen.getByLabelText('Tiêu chí 4'), { target: { value: 'Đặt tên biến rõ nghĩa' } });
    fireEvent.click(saveButton());
    const criteria = mutate.mock.calls[0][0].criteria;
    expect(criteria[2]).toEqual({ description: 'Xử lý ngoại lệ', maxPoints: 1, key: 'ngoai_le' });
    expect('key' in criteria[3]).toBe(false);
  });

  it('xoá một tiêu chí thì nó rời khỏi yêu cầu', () => {
    render(<RubricDialog {...props()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Xoá tiêu chí 2' }));
    fireEvent.click(saveButton());
    expect(mutate.mock.calls[0][0].criteria).toHaveLength(1);
  });

  it('cảnh báo — không chặn — rằng các lỗi nằm trong tiêu chí bị xoá sẽ cần chuyển sang tiêu chí khác', () => {
    render(<RubricDialog {...props({ errorCounts: { trinh_bay: 3 } })} />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Xoá tiêu chí 2' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Còn 3 lỗi đang nằm trong tiêu chí “Trình bày” — sau khi lưu, chúng cần được chuyển sang tiêu chí khác.');
    expect(saveButton()).toBeEnabled();
  });

  it('không xoá được tiêu chí cuối cùng', () => {
    render(<RubricDialog {...props()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Xoá tiêu chí 2' }));
    expect(screen.getByRole('button', { name: 'Xoá tiêu chí 1' })).toBeDisabled();
  });

  it('điểm tối đa sai: thông báo cạnh ô, khoá nút lưu, không gửi gì', () => {
    render(<RubricDialog {...props()} />);
    fireEvent.change(caps()[0], { target: { value: '0' } });
    fireEvent.blur(caps()[0]);
    expect(screen.getByText('Điểm tối đa: từ 0,25 đến 100, tối đa hai chữ số lẻ.')).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
    fireEvent.click(saveButton());
    expect(mutate).not.toHaveBeenCalled();
  });

  it('tổng điểm tối đa các tiêu chí vượt tổng điểm: khoá lưu, không gửi', () => {
    render(<RubricDialog {...props()} />);
    fireEvent.change(screen.getByLabelText('Tổng điểm'), { target: { value: '5' } });
    fireEvent.change(caps()[0], { target: { value: '4' } });
    expect(screen.getByRole('alert')).toHaveTextContent(/vượt quá tổng điểm/);
    expect(saveButton()).toBeDisabled();
  });

  it('khoá gõ trùng bị bắt trước khi tới máy chủ', () => {
    render(<RubricDialog {...props()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Thêm tiêu chí' }));
    fireEvent.change(screen.getByLabelText('Tiêu chí 3'), { target: { value: 'Một tiêu chí mới' } });
    fireEvent.change(screen.getByLabelText('Khoá tiêu chí 3 (tuỳ chọn)'), { target: { value: 'tinh_dung' } });
    fireEvent.blur(screen.getByLabelText('Khoá tiêu chí 3 (tuỳ chọn)'));
    expect(screen.getByText('Trùng khoá với một tiêu chí khác.')).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
  });

  it('thành công: báo rubric đã lưu và đóng', () => {
    mutate.mockImplementation((_input: unknown, opts: { onSuccess: (r: Rubric) => void }) => opts.onSuccess(saved));
    const onSaved = vi.fn();
    const onOpenChange = vi.fn();
    render(<RubricDialog {...props({ onSaved, onOpenChange })} />);
    fireEvent.change(screen.getByLabelText('Tổng điểm'), { target: { value: '10' } });
    fireEvent.change(caps()[0], { target: { value: '7' } });
    fireEvent.click(saveButton());
    expect(onSaved).toHaveBeenCalledWith(saved);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('lỗi của máy chủ khi lưu hiện nguyên văn', () => {
    saveState = { isPending: false, isError: true, error: new Error('Hai tiêu chí cùng khai key "x"') };
    render(<RubricDialog {...props()} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Hai tiêu chí cùng khai key "x"');
  });

  it('mỗi lần mở bắt đầu từ rubric như HIỆN TẠI, không phải thứ gõ dở lần trước', () => {
    const { rerender } = render(<RubricDialog {...props()} />);
    fireEvent.change(screen.getByLabelText('Tiêu chí 1'), { target: { value: 'dang dở' } });
    rerender(<RubricDialog {...props({ open: false })} />);
    rerender(<RubricDialog {...props({ open: true })} />);
    expect(screen.getByLabelText('Tiêu chí 1')).toHaveValue('Tính đúng');
  });
});

describe('RubricDialog — tạo rubric mới', () => {
  const create = (over: Partial<Props> = {}) => props({ rubric: undefined, ...over });
  const source = overview({
    rubricName: 'Nguồn',
    criteria: [
      criterion({ key: 'tinh_dung', description: 'Tính đúng', maxPoints: 6, errorCount: 3 }),
      criterion({ key: 'trinh_bay', description: 'Trình bày', maxPoints: 2.5, errorCount: 2 }),
    ],
  });

  describe('chưa có rubric nào (tạo trống)', () => {
    it('hỏi tên, môn học, tổng điểm mặc định 10; bắt đầu với một tiêu chí trống; không có lựa chọn "bắt đầu từ"', () => {
      render(<RubricDialog {...create()} />);
      expect(screen.getByRole('heading', { name: 'Tạo rubric mới' })).toBeInTheDocument();
      expect(screen.queryByRole('group', { name: 'Bắt đầu từ' })).not.toBeInTheDocument();
      expect(screen.getByLabelText('Tên rubric')).toHaveValue('');
      expect(screen.getByRole('combobox', { name: 'Chọn môn học' })).toBeInTheDocument();
      expect(screen.getByLabelText('Tổng điểm')).toHaveValue('10');
      expect(screen.getByLabelText('Tiêu chí 1')).toHaveValue('');
      expect(caps()[0]).toBeInTheDocument();
      expect(saveButton()).toBeDisabled();
    });

    it('ô môn học gõ để lọc và chọn', () => {
      render(<RubricDialog {...create()} />);
      fireEvent.click(screen.getByRole('combobox', { name: 'Chọn môn học' }));
      const list = screen.getByRole('listbox');
      expect(within(list).getByRole('option', { name: 'Cấu trúc dữ liệu' })).toBeInTheDocument();
      expect(within(list).getByRole('option', { name: 'Toán rời rạc' })).toBeInTheDocument();
      fireEvent.change(screen.getByPlaceholderText('Tìm môn học…'), { target: { value: 'toán' } });
      expect(within(list).queryByRole('option', { name: 'Cấu trúc dữ liệu' })).not.toBeInTheDocument();
      fireEvent.click(within(list).getByRole('option', { name: 'Toán rời rạc' }));
      expect(screen.getByRole('combobox', { name: 'Chọn môn học' })).toHaveTextContent('Toán rời rạc');
    });

    it('từ chối tên đã có: lưu cùng tên là âm thầm tạo bản kế tiếp và sinh lại mọi khoá', () => {
      render(<RubricDialog {...create()} />);
      fireEvent.change(screen.getByLabelText('Tên rubric'), { target: { value: 'CTDL' } });
      fireEvent.blur(screen.getByLabelText('Tên rubric'));
      expect(screen.getByText(/Đã có rubric tên này/)).toBeInTheDocument();
      expect(saveButton()).toBeDisabled();
    });

    it('gửi tên và tiêu chí không kèm khoá — không gửi môn học hay tổng điểm', () => {
      render(<RubricDialog {...create()} />);
      fireEvent.change(screen.getByLabelText('Tên rubric'), { target: { value: 'Giữa kỳ Toán rời rạc' } });
      pickCourse();
      fireEvent.change(screen.getByLabelText('Tiêu chí 1'), { target: { value: 'Chứng minh đúng' } });
      fireEvent.change(caps()[0], { target: { value: '5' } });
      fireEvent.click(saveButton());
      expect(mutate).toHaveBeenCalledWith({ name: 'Giữa kỳ Toán rời rạc', criteria: [{ description: 'Chứng minh đúng', maxPoints: 5 }] }, expect.anything());
      const body = mutate.mock.calls[0][0];
      expect(body).not.toHaveProperty('courseName');
      expect(body).not.toHaveProperty('courseId');
      expect(body).not.toHaveProperty('totalPoints');
    });
  });

  describe('đã có rubric khác: sao chép (D3)', () => {
    it('mặc định là "Một rubric đã có"; ô nguồn KHÔNG chọn sẵn; chưa chọn thì nút tạo khoá và nói vì sao', () => {
      render(<RubricDialog {...create({ overviews: [source] })} />);
      expect(screen.getByRole('button', { name: /^Một rubric đã có/ })).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByLabelText('Sao chép từ')).toHaveValue('');
      expect(screen.getByRole('option', { name: 'Nguồn — 5 lỗi' })).toBeInTheDocument();
      expect(screen.getByText(/Chọn rubric ở trên để xem các tiêu chí sẽ được sao chép/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Tạo rubric' })).toBeDisabled();
    });

    it('chọn nguồn: điền sẵn tên "… — bản sao", tiêu chí và điểm tối đa; hộp sao chép lỗi được chọn sẵn; không hỏi môn học', () => {
      render(<RubricDialog {...create({ overviews: [source] })} />);
      fireEvent.change(screen.getByLabelText('Sao chép từ'), { target: { value: 'Nguồn' } });
      expect(screen.getByLabelText('Tên rubric')).toHaveValue('Nguồn — bản sao');
      expect(screen.getByLabelText('Tiêu chí 1')).toHaveValue('Tính đúng');
      expect(caps()[1]).toHaveValue('2.5');
      expect(screen.getByLabelText('Tổng điểm')).toHaveValue('8.5');
      expect(screen.queryByRole('combobox', { name: 'Chọn môn học' })).not.toBeInTheDocument();
      expect(screen.getByRole('checkbox', { name: /Sao chép cả 5 lỗi và điểm trừ/ })).toBeChecked();
    });

    it('lưu: tiêu chí GIỮ khoá của nguồn (để ghép lỗi), rồi sao chép lỗi vào rubric mới, rồi đóng', () => {
      mutate.mockImplementation((_i: unknown, opts: { onSuccess: (r: Rubric) => void }) => opts.onSuccess({ ...saved, id: 'ru-9', name: 'Nguồn — bản sao' }));
      copyMutate.mockImplementation((_v: unknown, opts: { onSuccess: (r: unknown) => void; onSettled: () => void }) => {
        opts.onSuccess({ copied: 5, skippedNoCriterion: 0, skippedExisting: 0, recompute: null });
        opts.onSettled();
      });
      const onSaved = vi.fn();
      const onOpenChange = vi.fn();
      render(<RubricDialog {...create({ overviews: [source], onSaved, onOpenChange })} />);
      fireEvent.change(screen.getByLabelText('Sao chép từ'), { target: { value: 'Nguồn' } });
      fireEvent.click(saveButton());
      expect(mutate).toHaveBeenCalledWith(
        {
          name: 'Nguồn — bản sao',
          criteria: [
            { description: 'Tính đúng', maxPoints: 6, key: 'tinh_dung' },
            { description: 'Trình bày', maxPoints: 2.5, key: 'trinh_bay' },
          ],
        },
        expect.anything(),
      );
      expect(copyMutate).toHaveBeenCalledWith({ from: 'Nguồn', to: 'Nguồn — bản sao' }, expect.anything());
      expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('sao chép 5 lỗi. Hai rubric từ giờ độc lập.'));
      expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ name: 'Nguồn — bản sao' }));
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('bỏ chọn hộp sao chép lỗi: chỉ tạo rubric, không sao chép gì', () => {
      mutate.mockImplementation((_i: unknown, opts: { onSuccess: (r: Rubric) => void }) => opts.onSuccess(saved));
      const onSaved = vi.fn();
      render(<RubricDialog {...create({ overviews: [source], onSaved })} />);
      fireEvent.change(screen.getByLabelText('Sao chép từ'), { target: { value: 'Nguồn' } });
      fireEvent.click(screen.getByRole('checkbox', { name: /Sao chép cả 5 lỗi/ }));
      fireEvent.click(saveButton());
      expect(copyMutate).not.toHaveBeenCalled();
      expect(onSaved).toHaveBeenCalledWith(saved);
    });

    it('sao chép lỗi hỏng sau khi rubric đã tạo: báo rõ, rubric vẫn được báo là đã lưu và hộp thoại đóng', () => {
      mutate.mockImplementation((_i: unknown, opts: { onSuccess: (r: Rubric) => void }) => opts.onSuccess({ ...saved, name: 'Nguồn — bản sao' }));
      copyMutate.mockImplementation((_v: unknown, opts: { onError: (e: Error) => void; onSettled: () => void }) => {
        opts.onError(new Error('Không tìm thấy rubric'));
        opts.onSettled();
      });
      const onSaved = vi.fn();
      render(<RubricDialog {...create({ overviews: [source], onSaved })} />);
      fireEvent.change(screen.getByLabelText('Sao chép từ'), { target: { value: 'Nguồn' } });
      fireEvent.click(saveButton());
      expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('nhưng chưa sao chép được lỗi — Không tìm thấy rubric'));
      expect(onSaved).toHaveBeenCalled();
    });

    it('chọn "Tạo trống": bỏ ô nguồn, bảng tiêu chí trống, hiện chọn môn học', () => {
      render(<RubricDialog {...create({ overviews: [source] })} />);
      fireEvent.click(screen.getByRole('button', { name: /^Tạo trống/ }));
      expect(screen.queryByLabelText('Sao chép từ')).not.toBeInTheDocument();
      expect(screen.getByLabelText('Tiêu chí 1')).toHaveValue('');
      expect(screen.getByRole('combobox', { name: 'Chọn môn học' })).toBeInTheDocument();
      expect(screen.getByLabelText('Tổng điểm')).toHaveValue('10');
      expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    });
  });
});
