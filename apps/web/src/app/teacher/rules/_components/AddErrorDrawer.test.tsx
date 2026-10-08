import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { toast } from 'sonner';
import { AddErrorDrawer } from './AddErrorDrawer';
import { criterion, libraryRule, mutation, overview, proposal, session } from './fixtures';

const h = vi.hoisted(() => ({ assign: undefined as unknown }));
vi.mock('@/hooks/useRubricErrors', () => ({ useAssignError: () => h.assign }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const board = overview({
  rubricName: 'Giữa kỳ CTDL',
  criteria: [
    criterion({ key: 'tinh_dung', description: 'Tính đúng đắn', maxPoints: 6, errorCount: 1 }),
    criterion({ key: 'trinh_bay', description: 'Trình bày', maxPoints: 2, errorCount: 0 }),
  ],
  sessions: [
    session({ id: 's1', name: 'Ca sáng', state: 'grading', resultCount: 38 }),
    session({ id: 's2', name: 'Ca chiều', state: 'finalized' }),
  ],
});

const library = [
  // Đã có ở rubric này → không được mời thêm lần nữa.
  libraryRule({ id: 'dung', uses: [{ rubricName: 'Giữa kỳ CTDL', criterionKey: 'tinh_dung', deduction: '1.50' }] }),
  libraryRule({
    id: 'ro',
    revision: { id: 'v2', revision: 1, name: 'Rò rỉ bộ nhớ', description: 'Cấp phát mà không giải phóng', predicate: null },
    checkedBy: 'model',
    uses: [{ rubricName: 'Cuối kỳ CTDL', criterionKey: 'bo_nho', deduction: '1.00' }],
  }),
  libraryRule({
    id: 'ten',
    revision: { id: 'v3', revision: 1, name: 'Đặt tên biến khó hiểu', description: 'Tên một chữ cái', predicate: null },
    checkedBy: 'model',
    uses: [],
  }),
];

const assign = () => (h.assign as ReturnType<typeof mutation>).mutate;
function open(over: Partial<React.ComponentProps<typeof AddErrorDrawer>> = {}) {
  const onClose = vi.fn();
  render(<AddErrorDrawer overview={board} library={library} criterionKey="tinh_dung" prefill={null} onClose={onClose} {...over} />);
  return onClose;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.assign = mutation();
});

describe('AddErrorDrawer — ngữ cảnh (T-RBE-UI-5)', () => {
  it('mở từ một nhóm tiêu chí: rubric › tiêu chí (điểm tối đa) cố định, không có ô chọn', () => {
    open();
    expect(screen.getByText('Rubric: Giữa kỳ CTDL')).toBeInTheDocument();
    expect(screen.getByText('Tiêu chí: Tính đúng đắn · tối đa 6,0')).toBeInTheDocument();
    expect(screen.getByText('Lỗi bạn thêm ở đây chỉ nằm trong rubric này.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Tiêu chí')).not.toBeInTheDocument();
  });

  it('mở từ nút toàn trang: tiêu chí là một ô chọn; chưa chọn thì nút lưu khoá và nói vì sao', () => {
    open({ criterionKey: null });
    expect(screen.getByLabelText('Tiêu chí')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Rò rỉ bộ nhớ/ }));
    expect(screen.getByRole('button', { name: 'Thêm vào tiêu chí' })).toBeDisabled();
    expect(screen.getByText('Chọn tiêu chí trước')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Tiêu chí'), { target: { value: 'trinh_bay' } });
    expect(screen.getByRole('button', { name: 'Thêm vào tiêu chí' })).toBeEnabled();
  });
});

describe('AddErrorDrawer — chọn lỗi có sẵn', () => {
  it('không mời lỗi đã có ở rubric này; tab ghi đúng số', () => {
    open();
    expect(screen.getByRole('tab', { name: 'Chọn lỗi có sẵn (2)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Rò rỉ bộ nhớ/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Đặt tên biến khó hiểu/ })).toBeInTheDocument();
    expect(screen.queryByText('Sai ca biên')).not.toBeInTheDocument();
  });

  it('tìm không phân biệt dấu', () => {
    open();
    fireEvent.change(screen.getByLabelText('Tìm lỗi'), { target: { value: 'ro ri' } });
    expect(screen.getByRole('button', { name: /Rò rỉ bộ nhớ/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Đặt tên biến/ })).not.toBeInTheDocument();
  });

  it('mỗi lỗi nói đang dùng ở rubric nào, bao nhiêu', () => {
    open();
    expect(screen.getByText('Đang dùng ở: Cuối kỳ CTDL (−1,0)')).toBeInTheDocument();
    expect(screen.getByText('Chưa dùng ở rubric nào')).toBeInTheDocument();
  });

  it('chọn một lỗi: ô điểm trừ điền gợi ý từ rubric khác và SỬA ĐƯỢC', () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: /Rò rỉ bộ nhớ/ }));
    const price = screen.getByLabelText('Điểm trừ cho rubric này') as HTMLInputElement;
    expect(price.value).toBe('1,0');
    expect(screen.getByText('Gợi ý từ Cuối kỳ CTDL: 1,0. Sửa tuỳ ý.')).toBeInTheDocument();
    fireEvent.change(price, { target: { value: '2' } });
    expect(price.value).toBe('2');
  });

  it('lưu gửi ruleId + chuỗi điểm trừ, báo bằng lời, đóng ngăn kéo', () => {
    const onClose = open();
    fireEvent.click(screen.getByRole('button', { name: /Rò rỉ bộ nhớ/ }));
    fireEvent.change(screen.getByLabelText('Điểm trừ cho rubric này'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Thêm vào tiêu chí' }));
    expect(assign()).toHaveBeenCalledWith(
      { rubricName: 'Giữa kỳ CTDL', criterionKey: 'tinh_dung', ruleId: 'ro', deduction: '2' },
      expect.anything(),
    );
    assign().mock.calls[0][1].onSuccess({ rubricErrorId: 'e9', ruleId: 'ro', recompute: null });
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('Đã thêm “Rò rỉ bộ nhớ” vào “Tính đúng đắn” (−2,0).'));
    expect(onClose).toHaveBeenCalled();
  });

  it('để trống điểm trừ: KHÔNG gửi trường deduction (không sinh phiên bản giá), và nói chưa có điểm trừ', () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: /Đặt tên biến khó hiểu/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Thêm vào tiêu chí' }));
    const body = assign().mock.calls[0][0];
    expect(body).toEqual({ rubricName: 'Giữa kỳ CTDL', criterionKey: 'tinh_dung', ruleId: 'ten' });
    expect(body).not.toHaveProperty('deduction');
    assign().mock.calls[0][1].onSuccess({ rubricErrorId: 'e9', ruleId: 'ten', recompute: null });
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('— chưa có điểm trừ'));
  });

  it('điểm trừ sai định dạng khoá nút lưu và nói lý do', () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: /Rò rỉ bộ nhớ/ }));
    fireEvent.change(screen.getByLabelText('Điểm trừ cho rubric này'), { target: { value: 'abc' } });
    expect(screen.getByRole('button', { name: 'Thêm vào tiêu chí' })).toBeDisabled();
    expect(screen.getByText('Điểm trừ: số không âm, tối đa hai chữ số lẻ.')).toBeInTheDocument();
  });
});

describe('AddErrorDrawer — tạo lỗi mới', () => {
  const toNew = () => fireEvent.click(screen.getByRole('tab', { name: 'Tạo lỗi mới' }));

  it('thiếu tên/mô tả thì khoá; điền đủ thì lưu newRule (AI đọc bài → predicate null)', () => {
    open();
    toNew();
    expect(screen.getByRole('button', { name: 'Tạo và thêm vào tiêu chí' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Tên lỗi'), { target: { value: ' Quên giải phóng nút ' } });
    fireEvent.change(screen.getByLabelText('Mô tả lỗi'), { target: { value: 'Xoá phần tử cuối mà không free' } });
    fireEvent.change(screen.getByLabelText('Điểm trừ cho rubric này'), { target: { value: '1,5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo và thêm vào tiêu chí' }));
    expect(assign()).toHaveBeenCalledWith(
      {
        rubricName: 'Giữa kỳ CTDL',
        criterionKey: 'tinh_dung',
        deduction: '1.5',
        newRule: { name: 'Quên giải phóng nút', description: 'Xoá phần tử cuối mà không free', predicate: null },
      },
      expect.anything(),
    );
  });

  it('Tự động đòi tên nhóm test, rồi gửi test_group_failed; giao diện không bao giờ gửi ruleKey', () => {
    open();
    toNew();
    fireEvent.change(screen.getByLabelText('Tên lỗi'), { target: { value: 'Sai ca biên' } });
    fireEvent.change(screen.getByLabelText('Mô tả lỗi'), { target: { value: 'Nhóm biên không đạt' } });
    fireEvent.click(screen.getByRole('button', { name: /^Tự động \(chạy test\)/ }));
    expect(screen.getByRole('button', { name: 'Tạo và thêm vào tiêu chí' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Tên nhóm test'), { target: { value: 'bien' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo và thêm vào tiêu chí' }));
    const body = assign().mock.calls[0][0];
    expect(body.newRule).toEqual({ name: 'Sai ca biên', description: 'Nhóm biên không đạt', predicate: { kind: 'test_group_failed', group: 'bien' } });
    expect(body.newRule).not.toHaveProperty('ruleKey');
  });

  it('không còn mẫu "gọi hàm / độ phức tạp / đệ quy" để tạo mới (D9)', () => {
    open();
    toNew();
    expect(screen.queryByText(/Mã có gọi một hàm/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Máy chưa đo được/)).not.toBeInTheDocument();
  });
});

describe('AddErrorDrawer — duyệt lỗi AI đề xuất (Review Focus 5)', () => {
  it('mở sẵn tab "Tạo lỗi mới", điền sẵn tên và mô tả, tiêu chí CHƯA chọn nên nút lưu khoá', () => {
    open({ criterionKey: null, prefill: proposal({ id: 'p9', name: 'Hàm pop không kiểm tra rỗng', description: 'Gọi pop khi rỗng' }) });
    expect(screen.getByRole('tab', { name: 'Tạo lỗi mới' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByLabelText('Tên lỗi')).toHaveValue('Hàm pop không kiểm tra rỗng');
    expect(screen.getByLabelText('Mô tả lỗi')).toHaveValue('Gọi pop khi rỗng');
    expect(screen.getByRole('button', { name: 'Tạo và thêm vào tiêu chí' })).toBeDisabled();
    expect(screen.getByText('Chọn tiêu chí trước')).toBeInTheDocument();
  });

  it('lưu nguyên văn: duyệt đúng lỗi đó bằng ruleId, KHÔNG tạo lỗi thứ hai, không gửi changes', () => {
    open({ prefill: proposal({ id: 'p9', name: 'Hàm pop không kiểm tra rỗng', description: 'Gọi pop khi rỗng' }) });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo và thêm vào tiêu chí' }));
    const body = assign().mock.calls[0][0];
    expect(body).toEqual({ rubricName: 'Giữa kỳ CTDL', criterionKey: 'tinh_dung', ruleId: 'p9' });
    expect(body).not.toHaveProperty('newRule');
  });

  it('sửa tên trước khi duyệt: gửi changes chỉ có phần đã đổi', () => {
    open({ prefill: proposal({ id: 'p9', name: 'Hàm pop', description: 'Gọi pop khi rỗng' }) });
    fireEvent.change(screen.getByLabelText('Tên lỗi'), { target: { value: 'Hàm pop không kiểm tra ngăn xếp rỗng' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo và thêm vào tiêu chí' }));
    expect(assign().mock.calls[0][0]).toEqual({
      rubricName: 'Giữa kỳ CTDL',
      criterionKey: 'tinh_dung',
      ruleId: 'p9',
      changes: { name: 'Hàm pop không kiểm tra ngăn xếp rỗng' },
    });
  });
});

describe('AddErrorDrawer — "Lưu thì áp vào đâu" (không gọi API)', () => {
  it('viết bằng tên phiên thật: phiên đang chấm / đã chốt', () => {
    open();
    const box = screen.getByRole('region', { name: 'Lưu thì áp vào đâu' });
    expect(within(box).getByText('Ca sáng')).toBeInTheDocument();
    expect(within(box).getByText(/AI xét lỗi này từ các bài chưa chấm; bài đã chấm không tính lại/)).toBeInTheDocument();
    expect(within(box).getByText('Ca chiều')).toBeInTheDocument();
    expect(within(box).getByText(/Giữ nguyên điểm — bảng điểm trừ đã được ghim lúc chốt/)).toBeInTheDocument();
    expect(within(box).getByText('Rubric khác không bị ảnh hưởng.')).toBeInTheDocument();
  });

  it('đổi sang Tự động thì phiên đang chấm được tính lại ngay', () => {
    open();
    fireEvent.click(screen.getByRole('tab', { name: 'Tạo lỗi mới' }));
    fireEvent.click(screen.getByRole('button', { name: /^Tự động \(chạy test\)/ }));
    expect(screen.getByText('Tính lại ngay các bài dính lỗi này (trong 38 bài).')).toBeInTheDocument();
  });

  it('rubric chưa gắn phiên nào thì nói lỗi chưa ảnh hưởng bài nào', () => {
    open({ overview: { ...board, sessions: [] } });
    expect(screen.getByText(/chưa gắn phiên thi nào nên lỗi chưa ảnh hưởng bài nào/)).toBeInTheDocument();
  });
});

describe('AddErrorDrawer — lỗi và huỷ', () => {
  it('lỗi của máy chủ hiện nguyên văn (409: lỗi đã có trong rubric)', () => {
    (h.assign as ReturnType<typeof mutation>).isError = true;
    (h.assign as ReturnType<typeof mutation>).error = new Error('Lỗi này đã có trong rubric');
    open();
    expect(screen.getByText('Lỗi này đã có trong rubric')).toBeInTheDocument();
  });

  it('thư viện chưa tải xong: không hỏng, danh sách rỗng và nói vậy', () => {
    open({ library: undefined });
    expect(screen.getByRole('tab', { name: 'Chọn lỗi có sẵn (0)' })).toBeInTheDocument();
    expect(screen.getByText(/Mọi lỗi trong thư viện đã có ở rubric này/)).toBeInTheDocument();
  });

  it('Huỷ đóng, không gửi gì', () => {
    const onClose = open();
    fireEvent.click(screen.getByRole('button', { name: 'Huỷ' }));
    expect(onClose).toHaveBeenCalled();
    expect(assign()).not.toHaveBeenCalled();
  });
});
