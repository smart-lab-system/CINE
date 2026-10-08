import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { RubricSwitcher } from './RubricSwitcher';
import { criterion, overview, session } from './fixtures';
import type { RubricOverview } from '@/lib/api/rubric-errors';

const named = (name: string, over: Partial<RubricOverview> = {}) => overview({ rubricName: name, ...over });
const FEW = [named('Giữa kỳ CTDL', { unpricedCount: 1 }), named('Diễn tập'), named('Cuối kỳ CTDL', { criteria: [criterion({ errorCount: 0 })] })];

/** 14 rubric: tên thật, trạng thái xen kẽ, một nửa có phiên ở HK khác nhau. */
const NAMES = [
  'Giữa kỳ CTDL', 'Diễn tập — Ngăn xếp', 'Cuối kỳ CTDL', 'Giữa kỳ CTDL 2025', 'Cuối kỳ CTDL 2025', 'Kiểm tra 15 phút — Mảng',
  'Thực hành — Hàng đợi', 'Giữa kỳ Lập trình C', 'Cuối kỳ Lập trình C', 'Bài tập lớn — Đồ thị', 'Thực hành — Cây nhị phân',
  'Kiểm tra giữa kỳ — Sắp xếp', 'Cuối kỳ CTDL (đề B)', 'Thi lại CTDL',
];
const MANY_LIST = NAMES.map((name, i) =>
  named(name, {
    ...(i % 3 === 0 ? { unpricedCount: 1 } : {}),
    ...(i % 3 === 2 ? { criteria: [criterion({ errorCount: 0 })] } : {}),
    sessions: i % 2 === 0 ? [session({ id: `s${i}`, semesterName: i % 4 === 0 ? 'HK2 2025-2026' : 'HK1 2026-2027', state: i % 4 === 0 ? 'finalized' : 'grading' })] : [],
  }),
);

function show(overviews: RubricOverview[], over: Partial<React.ComponentProps<typeof RubricSwitcher>> = {}) {
  const props = {
    overviews,
    current: overviews[0],
    recent: [] as string[],
    sem: null as string | null,
    onSem: vi.fn(),
    onSelect: vi.fn(),
    onNew: vi.fn(),
    ...over,
  };
  return { props, ...render(<RubricSwitcher {...props} />) };
}

describe('RubricSwitcher — ít rubric: hàng thẻ (T-RBE-UI-2)', () => {
  it('mỗi rubric một thẻ có tên và tình trạng; thẻ đang mở được chọn', () => {
    show(FEW);
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(3);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    expect(tabs[0]).toHaveTextContent('Giữa kỳ CTDL');
    expect(tabs[0]).toHaveTextContent('Còn 1 việc');
    expect(tabs[1]).toHaveTextContent('Sẵn sàng chấm tự động');
    expect(tabs[2]).toHaveTextContent('Chưa có lỗi nào');
  });
  it('bấm thẻ chuyển rubric; "Rubric mới" mở hộp thoại tạo', () => {
    const { props } = show(FEW);
    fireEvent.click(screen.getByRole('tab', { name: /Cuối kỳ CTDL/ }));
    expect(props.onSelect).toHaveBeenCalledWith('Cuối kỳ CTDL');
    fireEvent.click(screen.getByRole('button', { name: /Rubric mới/ }));
    expect(props.onNew).toHaveBeenCalled();
  });
  it('đúng 4 rubric vẫn là hàng thẻ (ngưỡng là > 4)', () => {
    show([...FEW, named('Thứ tư')]);
    expect(screen.getAllByRole('tab')).toHaveLength(4);
    expect(screen.queryByRole('button', { name: /Đổi rubric/ })).not.toBeInTheDocument();
  });
});

describe('RubricSwitcher — nhiều rubric: ô chọn có tìm kiếm', () => {
  it('từ 5 rubric: không còn hàng thẻ; hiện "Rubric đang mở" và nút Đổi rubric kèm tổng số', () => {
    show([...FEW, named('Bốn'), named('Năm')]);
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.getByText('Rubric đang mở')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Đổi rubric \(5\)/ })).toBeInTheDocument();
  });

  it('mở bảng: tìm không phân biệt dấu, lọc tình trạng, số trên nút lọc', () => {
    show(MANY_LIST);
    fireEvent.click(screen.getByRole('button', { name: /Đổi rubric/ }));
    const list = () => within(screen.getByRole('listbox', { name: 'Danh sách rubric' })).getAllByRole('option');
    expect(list()).toHaveLength(14);
    fireEvent.change(screen.getByLabelText('Tìm rubric theo tên'), { target: { value: 'cuoi ky' } });
    expect(list().map((o) => o.textContent)).toEqual(expect.arrayContaining([expect.stringContaining('Cuối kỳ CTDL')]));
    expect(list().every((o) => /cuối kỳ/i.test(o.textContent ?? ''))).toBe(true);
    fireEvent.change(screen.getByLabelText('Tìm rubric theo tên'), { target: { value: 'không khớp' } });
    expect(screen.getByText(/Không có rubric nào khớp/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Xoá tìm kiếm và bộ lọc' }));
    expect(list()).toHaveLength(14);
    fireEvent.click(screen.getByRole('button', { name: /^Cần làm/ }));
    expect(list().length).toBe(MANY_LIST.filter((o) => o.unpricedCount > 0).length);
  });

  it('bấm một dòng chuyển rubric và đóng bảng; tìm kiếm và lọc được đặt lại', () => {
    const { props } = show(MANY_LIST);
    fireEvent.click(screen.getByRole('button', { name: /Đổi rubric/ }));
    fireEvent.change(screen.getByLabelText('Tìm rubric theo tên'), { target: { value: 'thi lai' } });
    fireEvent.click(screen.getByRole('option', { name: /Thi lại CTDL/ }));
    expect(props.onSelect).toHaveBeenCalledWith('Thi lại CTDL');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Đổi rubric/ }));
    expect(screen.getByLabelText('Tìm rubric theo tên')).toHaveValue('');
  });

  it('Enter trong ô tìm chọn dòng đầu; Esc đóng; bấm ra ngoài đóng', () => {
    const { props } = show(MANY_LIST);
    fireEvent.click(screen.getByRole('button', { name: /Đổi rubric/ }));
    const search = screen.getByLabelText('Tìm rubric theo tên');
    fireEvent.change(search, { target: { value: 'thi lai' } });
    fireEvent.keyDown(search, { key: 'Enter' });
    expect(props.onSelect).toHaveBeenCalledWith('Thi lại CTDL');
    fireEvent.click(screen.getByRole('button', { name: /Đổi rubric/ }));
    fireEvent.keyDown(screen.getByLabelText('Tìm rubric theo tên'), { key: 'Escape' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Đổi rubric/ }));
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('mũi tên xuống đưa tiêu điểm vào danh sách', () => {
    show(MANY_LIST);
    fireEvent.click(screen.getByRole('button', { name: /Đổi rubric/ }));
    fireEvent.keyDown(screen.getByLabelText('Tìm rubric theo tên'), { key: 'ArrowDown' });
    // getAllByRole('option') gồm cả <option> của <select> học kỳ/sắp xếp — chỉ lấy dòng trong listbox.
    expect(within(screen.getByRole('listbox', { name: 'Danh sách rubric' })).getAllByRole('option')[0]).toHaveFocus();
  });

  it('"Gần đây": tối đa 3 chip, không gồm rubric đang mở, bỏ tên không còn tồn tại', () => {
    const { props } = show(MANY_LIST, { recent: ['Giữa kỳ CTDL', 'Thi lại CTDL', 'Đã bị xoá', 'Cuối kỳ CTDL', 'Diễn tập — Ngăn xếp', 'Giữa kỳ CTDL 2025'] });
    const chips = screen.getAllByRole('button', { name: /^(Thi lại CTDL|Cuối kỳ CTDL|Diễn tập — Ngăn xếp|Giữa kỳ CTDL 2025)$/ });
    expect(chips.map((c) => c.textContent)).toEqual(['Thi lại CTDL', 'Cuối kỳ CTDL', 'Diễn tập — Ngăn xếp']);
    fireEvent.click(chips[0]);
    expect(props.onSelect).toHaveBeenCalledWith('Thi lại CTDL');
  });

  it('dòng tóm tắt đếm đúng và "N cần làm" bấm được (mở bảng với bộ lọc Cần làm)', () => {
    show(MANY_LIST);
    const todo = MANY_LIST.filter((o) => o.unpricedCount > 0).length;
    fireEvent.click(screen.getByRole('button', { name: `${todo} cần làm` }));
    expect(screen.getByRole('button', { name: /^Cần làm/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('T-RBE-UI-10: lọc học kỳ — danh sách dựng từ phiên, mới nhất trước, "Chưa gắn học kỳ" cuối', () => {
    show(MANY_LIST);
    fireEvent.click(screen.getByRole('button', { name: /Đổi rubric/ }));
    const options = within(screen.getByLabelText('Lọc theo học kỳ')).getAllByRole('option').map((o) => o.textContent);
    expect(options[0]).toMatch(/^Tất cả học kỳ/);
    expect(options[1]).toMatch(/^HK1 2026-2027/);
    expect(options[2]).toMatch(/^HK2 2025-2026/);
    expect(options[options.length - 1]).toMatch(/^Chưa gắn học kỳ/);
  });

  it('T-RBE-UI-10: chọn học kỳ gọi onSem; đang lọc thì hiện chip + "Bỏ lọc", nút ghi (x/y), và đếm theo học kỳ', () => {
    const { props, rerender } = show(MANY_LIST);
    fireEvent.click(screen.getByRole('button', { name: /Đổi rubric/ }));
    fireEvent.change(screen.getByLabelText('Lọc theo học kỳ'), { target: { value: 'HK2 2025-2026' } });
    expect(props.onSem).toHaveBeenCalledWith('HK2 2025-2026');
    rerender(<RubricSwitcher {...props} sem="HK2 2025-2026" />);
    const inSem = MANY_LIST.filter((o) => o.semesters.includes('HK2 2025-2026')).length;
    expect(screen.getByRole('button', { name: new RegExp(`Đổi rubric \\(${inSem}/14\\)`) })).toBeInTheDocument();
    expect(screen.getByText(/Học kỳ: HK2 2025-2026/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Bỏ lọc' }));
    expect(props.onSem).toHaveBeenLastCalledWith(null);
  });

  it('T-RBE-UI-10: lọc học kỳ không vô hiệu hoá nút nào — "Rubric mới" và "Đổi rubric" vẫn bấm được', () => {
    const { props } = show(MANY_LIST, { sem: 'HK2 2025-2026' });
    expect(screen.getAllByRole('button', { name: /Rubric mới/ })[0]).toBeEnabled();
    expect(screen.getByRole('button', { name: /Đổi rubric/ })).toBeEnabled();
    fireEvent.click(screen.getAllByRole('button', { name: /Rubric mới/ })[0]);
    expect(props.onNew).toHaveBeenCalled();
  });
});
