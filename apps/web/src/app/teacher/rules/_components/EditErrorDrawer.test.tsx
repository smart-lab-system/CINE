import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { toast } from 'sonner';
import { EditErrorDrawer } from './EditErrorDrawer';
import { criterion, libraryRule, mutation, overview, session } from './fixtures';

const h = vi.hoisted(() => ({ revise: undefined as unknown, split: undefined as unknown }));
vi.mock('@/hooks/useRules', () => ({ useReviseRule: () => h.revise, useSplitRule: () => h.split }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const A = overview({
  rubricName: 'Giữa kỳ CTDL',
  criteria: [criterion({ key: 'tinh_dung', description: 'Tính đúng đắn' })],
  sessions: [session({ id: 'a', name: 'Ca sáng', state: 'grading' }), session({ id: 'b', name: 'Ca chiều', state: 'finalized' })],
});
const B = overview({ rubricName: 'Cuối kỳ CTDL', criteria: [criterion({ key: 'tinh_dung', description: 'Tính đúng đắn' })] });

const shared = libraryRule({
  id: 'r1',
  uses: [
    { rubricName: 'Giữa kỳ CTDL', criterionKey: 'tinh_dung', deduction: '2.00' },
    { rubricName: 'Cuối kỳ CTDL', criterionKey: 'tinh_dung', deduction: null },
  ],
});
const single = libraryRule({ id: 'r2', uses: [{ rubricName: 'Giữa kỳ CTDL', criterionKey: 'tinh_dung', deduction: '2.00' }] });
const legacy = libraryRule({
  id: 'r3',
  revision: { id: 'v1', revision: 1, name: 'Gọi sort', description: 'Dùng sort có sẵn', predicate: { kind: 'calls_function', name: 'sort' } },
  checkedBy: 'model',
  uses: [{ rubricName: 'Giữa kỳ CTDL', criterionKey: 'tinh_dung', deduction: '1.00' }],
});

const revise = () => (h.revise as ReturnType<typeof mutation>).mutate;
const split = () => (h.split as ReturnType<typeof mutation>).mutate;
function open(rule = shared, fromRubric: string | null = 'Giữa kỳ CTDL', over: Partial<React.ComponentProps<typeof EditErrorDrawer>> = {}) {
  const onClose = vi.fn();
  render(<EditErrorDrawer rule={rule} loading={false} fromRubric={fromRubric} overviews={[A, B]} onClose={onClose} {...over} />);
  return onClose;
}
const rename = (value = 'Sai ca biên (đã sửa)') => fireEvent.change(screen.getByLabelText('Tên lỗi'), { target: { value } });

beforeEach(() => {
  vi.clearAllMocks();
  h.revise = mutation();
  h.split = mutation();
});

describe('EditErrorDrawer — lỗi dùng ở ≥ 2 rubric, mở từ một rubric (D4)', () => {
  it('hai nút, mỗi nút kèm một dòng hệ quả bằng tên rubric', () => {
    open();
    expect(screen.getByRole('button', { name: 'Lưu cho cả 2 rubric' })).toBeInTheDocument();
    expect(screen.getByText('Đổi ở Giữa kỳ CTDL, Cuối kỳ CTDL.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Chỉ lưu cho “Giữa kỳ CTDL”' })).toBeInTheDocument();
    expect(screen.getByText('Tách bản riêng; Cuối kỳ CTDL giữ bản cũ.')).toBeInTheDocument();
  });

  it('khối phạm vi nói hậu quả theo phiên thật của từng nhóm', () => {
    open();
    const box = screen.getByText('Áp dụng thay đổi cho').closest('div') as HTMLElement;
    expect(within(box).getByText('Cả 2 rubric')).toBeInTheDocument();
    // Chuỗi ĐẦY ĐỦ (khớp nguyên văn) — dòng "Chỉ …" chứa cùng câu này nhưng dài hơn, nên không bị trùng.
    expect(within(box).getByText('Ca sáng (đang chấm): tính lại ngay các bài dính lỗi; Ca chiều (đã chốt) giữ nguyên.')).toBeInTheDocument();
    expect(within(box).getByText(/Tách thành bản riêng cho rubric này, 1 rubric còn lại giữ nguyên bản cũ “Sai ca biên”/)).toBeInTheDocument();
  });

  it('chưa đổi gì thì cả hai nút khoá và nói vì sao', () => {
    open();
    expect(screen.getByRole('button', { name: 'Lưu cho cả 2 rubric' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Chỉ lưu cho “Giữa kỳ CTDL”' })).toBeDisabled();
    expect(screen.getByText('Chưa có thay đổi để lưu.')).toBeInTheDocument();
  });

  it('"Lưu cho cả 2 rubric" sửa lỗi chung: PATCH với changes chỉ gồm phần đã đổi', () => {
    const onClose = open();
    rename();
    fireEvent.click(screen.getByRole('button', { name: 'Lưu cho cả 2 rubric' }));
    expect(revise()).toHaveBeenCalledWith({ ruleId: 'r1', changes: { name: 'Sai ca biên (đã sửa)' } }, expect.anything());
    expect(split()).not.toHaveBeenCalled();
    revise().mock.calls[0][1].onSuccess({ revisionId: 'v2', recompute: null });
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('Đã lưu “Sai ca biên (đã sửa)” cho cả 2 rubric.'));
    expect(onClose).toHaveBeenCalled();
  });

  it('"Chỉ lưu cho …" tách bản riêng cho rubric đang mở: split với đúng rubricName', () => {
    const onClose = open();
    rename('Sai ca biên riêng');
    fireEvent.click(screen.getByRole('button', { name: 'Chỉ lưu cho “Giữa kỳ CTDL”' }));
    expect(split()).toHaveBeenCalledWith({ ruleId: 'r1', rubricName: 'Giữa kỳ CTDL', changes: { name: 'Sai ca biên riêng' } }, expect.anything());
    expect(revise()).not.toHaveBeenCalled();
    split().mock.calls[0][1].onSuccess({ ruleId: 'r9', rubricErrorId: 'e1', recompute: { recomputed: 2, promoted: 0, demoted: 0, belowFloor: 0 } });
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('Đã tách bản riêng của “Sai ca biên riêng” cho “Giữa kỳ CTDL”. 1 rubric còn lại giữ nguyên bản cũ.'));
    expect(onClose).toHaveBeenCalled();
  });

  it('tên hoặc mô tả để trống thì khoá cả hai nút', () => {
    open();
    rename('   ');
    expect(screen.getByRole('button', { name: 'Lưu cho cả 2 rubric' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Chỉ lưu cho “Giữa kỳ CTDL”' })).toBeDisabled();
  });

  it('ngữ cảnh: chip nơi dùng, chặn trần 4, nói rõ tiêu chí và điểm trừ không sửa ở đây', () => {
    const many = libraryRule({
      id: 'r4',
      uses: ['A', 'B', 'C', 'D', 'E', 'F'].map((n) => ({ rubricName: n, criterionKey: 'tinh_dung', deduction: '1.00' })),
    });
    open(many, 'A');
    expect(screen.getByText(/^A · .* · −1,0$/)).toBeInTheDocument();
    expect(screen.getByText('+2 nơi dùng khác')).toBeInTheDocument();
    expect(screen.getByText(/Tiêu chí và điểm trừ không sửa ở đây/)).toBeInTheDocument();
    expect(screen.getByText(/Bạn đang mở từ rubric “A”/)).toBeInTheDocument();
  });
});

describe('EditErrorDrawer — mở từ Thư viện, hoặc lỗi chỉ ở một rubric', () => {
  it('từ Thư viện: chỉ "Lưu cho cả N rubric" và hướng dẫn đổi riêng; không có nút hẹp', () => {
    open(shared, null);
    rename();
    expect(screen.getByRole('button', { name: 'Lưu cho cả 2 rubric' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: /Chỉ lưu cho/ })).not.toBeInTheDocument();
    expect(screen.getByText('Muốn đổi riêng một rubric: mở rubric đó, bấm ⋯ ở dòng lỗi rồi chọn Sửa.')).toBeInTheDocument();
    expect(screen.getByText('Bạn đang mở từ Thư viện lỗi.', { exact: false })).toBeInTheDocument();
  });

  it('lỗi chỉ ở một rubric: một nút "Lưu", sửa trực tiếp', () => {
    open(single);
    rename();
    expect(screen.queryByRole('button', { name: /cho cả/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));
    expect(revise()).toHaveBeenCalledWith({ ruleId: 'r2', changes: { name: 'Sai ca biên (đã sửa)' } }, expect.anything());
    revise().mock.calls[0][1].onSuccess({ revisionId: 'v2', recompute: null });
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('Đã lưu “Sai ca biên (đã sửa)”.'));
  });
});

describe('EditErrorDrawer — cách phát hiện (D9, Review Focus 6)', () => {
  it('lỗi cũ mang điều kiện "gọi hàm": hiện AI đọc bài kèm ghi chú; chỉ đổi tên thì KHÔNG gửi predicate', () => {
    open(legacy);
    expect(screen.getByRole('button', { name: /^AI đọc bài/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/Điều kiện cũ: gọi hàm “sort”/)).toBeInTheDocument();
    rename('Gọi sort có sẵn');
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));
    expect(revise().mock.calls[0][0].changes).toEqual({ name: 'Gọi sort có sẵn' });
  });

  it('đổi sang Tự động phải có tên nhóm test, rồi mới gửi predicate test_group_failed', () => {
    open(legacy);
    fireEvent.click(screen.getByRole('button', { name: /^Tự động \(chạy test\)/ }));
    expect(screen.getByRole('button', { name: 'Lưu' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Tên nhóm test'), { target: { value: 'bien' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));
    expect(revise().mock.calls[0][0].changes).toEqual({ predicate: { kind: 'test_group_failed', group: 'bien' } });
  });

  it('lỗi Tự động: đổi nhóm test là một thay đổi; đổi sang AI đọc bài gửi predicate null', () => {
    open(single);
    fireEvent.change(screen.getByLabelText('Tên nhóm test'), { target: { value: 'co_ban' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));
    expect(revise().mock.calls[0][0].changes).toEqual({ predicate: { kind: 'test_group_failed', group: 'co_ban' } });
  });
});

describe('EditErrorDrawer — trạng thái khác', () => {
  it('đang tải thư viện thì nói đang tải; tải xong mà không có lỗi thì nói không tìm thấy', () => {
    const { unmount } = render(<EditErrorDrawer rule={undefined} loading fromRubric={null} overviews={[A]} onClose={vi.fn()} />);
    expect(screen.getByText('Đang tải…')).toBeInTheDocument();
    unmount();
    render(<EditErrorDrawer rule={undefined} loading={false} fromRubric={null} overviews={[A]} onClose={vi.fn()} />);
    expect(screen.getByText('Không tìm thấy lỗi này — có thể nó đã bị bỏ.')).toBeInTheDocument();
  });

  it('lỗi của máy chủ hiện nguyên văn', () => {
    (h.split as ReturnType<typeof mutation>).isError = true;
    (h.split as ReturnType<typeof mutation>).error = new Error('Lỗi này chỉ dùng ở một rubric — sửa trực tiếp');
    open();
    expect(screen.getByText('Lỗi này chỉ dùng ở một rubric — sửa trực tiếp')).toBeInTheDocument();
  });

  it('Huỷ đóng, không gửi gì', () => {
    const onClose = open();
    fireEvent.click(screen.getByRole('button', { name: 'Huỷ' }));
    expect(onClose).toHaveBeenCalled();
    expect(revise()).not.toHaveBeenCalled();
    expect(split()).not.toHaveBeenCalled();
  });
});
