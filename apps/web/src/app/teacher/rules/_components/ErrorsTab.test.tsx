import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ErrorsTab } from './ErrorsTab';
import { criterion, errorItem, mutation, overview } from './fixtures';
import type { RubricErrorItem, RubricOverview } from '@/lib/api/rubric-errors';

vi.mock('@/hooks/useRubricErrors', () => ({
  usePreviewErrorPrice: () => mutation(),
  useSetErrorPrice: () => mutation(),
  useMoveError: () => mutation(),
  useRemoveError: () => mutation(),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const board = (): RubricOverview =>
  overview({
    criteria: [
      criterion({ key: 'tinh_dung', description: 'Tính đúng đắn', maxPoints: 6, errorCount: 2 }),
      criterion({ key: 'bo_nho', description: 'Quản lý bộ nhớ', maxPoints: 2, errorCount: 0 }),
      criterion({ key: 'trinh_bay', description: 'Trình bày', maxPoints: 2, errorCount: 0, waiverId: 'w1' }),
    ],
  });

const rows = (): RubricErrorItem[] => [
  errorItem({ id: 'e1', ruleId: 'r1', name: 'Sai ca biên', criterionKey: 'tinh_dung', deduction: '2.00' }),
  errorItem({
    id: 'e2',
    ruleId: 'r2',
    name: 'Đặt tên biến',
    description: 'Tên biến khó hiểu',
    predicate: null,
    checkedBy: 'model',
    criterionKey: 'tinh_dung',
    deduction: null,
    appliedTo: { results: 0, sessions: 0 },
  }),
];

function mount(over: Partial<React.ComponentProps<typeof ErrorsTab>> = {}) {
  const handlers = { onAdd: vi.fn(), onEdit: vi.fn(), onWaive: vi.fn(), onUnwaive: vi.fn(), onOpenRubric: vi.fn() };
  const props = { overview: board(), errors: rows(), loading: false, error: null, focus: null, ...handlers, ...over };
  render(<ErrorsTab {...props} />);
  return handlers;
}

beforeEach(() => vi.clearAllMocks());

describe('ErrorsTab — nhóm theo tiêu chí (T-RBE-UI-2)', () => {
  it('mỗi tiêu chí một nhóm: tên, số lỗi, điểm tối đa — không hiện khoá kỹ thuật', () => {
    mount();
    const group = screen.getByRole('region', { name: 'Tính đúng đắn' });
    expect(within(group).getByText('2 lỗi')).toBeInTheDocument();
    expect(within(group).getByText('6,0')).toBeInTheDocument();
    expect(screen.queryByText('tinh_dung')).not.toBeInTheDocument();
    expect(screen.queryByText('sai_ca_bien')).not.toBeInTheDocument();
  });

  it('chú giải hai cách phát hiện hiển thị sẵn, không phải tooltip', () => {
    mount();
    expect(screen.getByText(/Máy so kết quả chạy test với đáp án: chắc chắn, không cần bạn xem/)).toBeInTheDocument();
    expect(screen.getByText(/AI đọc mã rồi kết luận: kém chắc chắn hơn nên có thể cần bạn duyệt/)).toBeInTheDocument();
  });

  it('dòng lỗi: tên, mô tả, cách phát hiện, điểm trừ, đã gặp', () => {
    mount();
    const row = screen.getByText('Sai ca biên').closest('[data-testid="error-row"]') as HTMLElement;
    expect(within(row).getByText('Tự động')).toBeInTheDocument();
    expect(within(row).getByRole('button', { name: /Sửa điểm trừ Sai ca biên, hiện −2,0/ })).toBeInTheDocument();
    expect(within(row).getByText('5 bài · 2 phiên')).toBeInTheDocument();
    const ai = screen.getByText('Đặt tên biến').closest('[data-testid="error-row"]') as HTMLElement;
    expect(within(ai).getByText('AI đọc bài')).toBeInTheDocument();
    expect(within(ai).getByText('Chưa gặp bài nào')).toBeInTheDocument();
  });

  it('lỗi chưa có điểm trừ: nhãn cảnh báo và nút "Đặt điểm trừ" mở ô nổi', () => {
    mount();
    expect(screen.getByText('Chưa có điểm trừ')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Đặt điểm trừ' }));
    expect(screen.getByRole('dialog', { name: 'Đặt điểm trừ Đặt tên biến' })).toBeInTheDocument();
  });

  it('bấm số điểm trừ mở ô nổi điền sẵn; mở ô khác thì ô cũ đóng', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: /Sửa điểm trừ Sai ca biên/ }));
    expect((screen.getByLabelText('Điểm trừ') as HTMLInputElement).value).toBe('2,0');
    fireEvent.click(screen.getByRole('button', { name: 'Đặt điểm trừ' }));
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByRole('dialog', { name: 'Đặt điểm trừ Đặt tên biến' })).toBeInTheDocument();
  });

  it('cộng điểm trừ vượt điểm tối đa thì nhắc: bài chỉ bị trừ tới mức tối đa', () => {
    mount({
      errors: [errorItem({ id: 'a', deduction: '4.00' }), errorItem({ id: 'b', name: 'Khác', deduction: '3.00' })],
      overview: overview({ criteria: [criterion({ key: 'tinh_dung', description: 'Tính đúng đắn', maxPoints: 6, errorCount: 2 })] }),
    });
    expect(screen.getByText('Cộng hết các lỗi là 7,0, vượt điểm tối đa 6,0 — bài chỉ bị trừ tới 6,0.')).toBeInTheDocument();
  });

  it('gập nhóm ẩn các dòng lỗi', () => {
    mount();
    const group = screen.getByRole('region', { name: 'Tính đúng đắn' });
    fireEvent.click(within(group).getByRole('button', { expanded: true }));
    expect(screen.queryByText('Sai ca biên')).not.toBeInTheDocument();
  });

  it('"Thêm lỗi vào …" mở ngăn kéo với tiêu chí đã biết', () => {
    const h = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Thêm lỗi vào “Tính đúng đắn”' }));
    expect(h.onAdd).toHaveBeenCalledWith('tinh_dung');
  });
});

describe('ErrorsTab — tiêu chí chưa có lỗi và tiêu chí không trừ điểm', () => {
  it('chưa có lỗi: nói hậu quả và đưa hai lối đi', () => {
    const h = mount();
    const group = screen.getByRole('region', { name: 'Quản lý bộ nhớ' });
    expect(within(group).getByText('Chưa có lỗi nào cho tiêu chí này.')).toBeInTheDocument();
    fireEvent.click(within(group).getByRole('button', { name: 'Thêm lỗi đầu tiên' }));
    expect(h.onAdd).toHaveBeenCalledWith('bo_nho');
    fireEvent.click(within(group).getByRole('button', { name: 'Tiêu chí này không trừ điểm' }));
    expect(h.onWaive).toHaveBeenCalledWith(expect.objectContaining({ key: 'bo_nho' }));
  });

  it('đã đánh dấu không trừ điểm: nói trọn điểm và cho bỏ đánh dấu', () => {
    const h = mount();
    const group = screen.getByRole('region', { name: 'Trình bày' });
    expect(within(group).getByText(/mọi bài được trọn 2,0 điểm/)).toBeInTheDocument();
    fireEvent.click(within(group).getByRole('button', { name: 'Bỏ đánh dấu' }));
    expect(h.onUnwaive).toHaveBeenCalledWith(expect.objectContaining({ key: 'trinh_bay' }));
  });
});

describe('ErrorsTab — lỗi dùng chung', () => {
  const shared = errorItem({
    id: 'e1',
    alsoIn: [
      { rubricName: 'Cuối kỳ CTDL', criterionKey: 'tinh_dung', deduction: '3.00' },
      { rubricName: 'Diễn tập', criterionKey: 'tinh_dung', deduction: null },
      { rubricName: 'Thi lại', criterionKey: 'tinh_dung', deduction: '1.00' },
    ],
  });

  it('nói lỗi này còn ở rubric nào và trừ bao nhiêu; chặn trần hai tên', () => {
    mount({ errors: [shared] });
    // Khối chứa cả câu lẫn nút "N rubric khác" là một <div> (nút mở ô nổi là <div> nên không được nằm trong <p>).
    expect(screen.getByText(/Cũng dùng ở/).closest('div')).toHaveTextContent(
      'Cuối kỳ CTDL (−3,0); Diễn tập (chưa có điểm trừ) và 1 rubric khác',
    );
  });

  it('"N rubric khác" mở danh sách đầy đủ; bấm một dòng chuyển sang rubric đó (T-RBE-UI-8)', () => {
    const h = mount({ errors: [shared] });
    fireEvent.click(screen.getByRole('button', { name: '1 rubric khác' }));
    const list = screen.getByRole('dialog', { name: 'Sai ca biên — đang dùng ở 3 rubric khác' });
    expect(within(list).getByText('Thi lại')).toBeInTheDocument();
    fireEvent.click(within(list).getByRole('button', { name: /Thi lại/ }));
    expect(h.onOpenRubric).toHaveBeenCalledWith('Thi lại');
  });
});

describe('ErrorsTab — menu ⋯ của dòng', () => {
  const open = (name = 'Sai ca biên') => fireEvent.keyDown(screen.getByRole('button', { name: `Thao tác với ${name}` }), { key: 'Enter' });

  it('Sửa tên, mô tả, cách phát hiện → onEdit với đúng dòng', () => {
    const h = mount();
    open();
    fireEvent.click(screen.getByRole('menuitem', { name: /Sửa tên, mô tả, cách phát hiện/ }));
    expect(h.onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 'e1' }));
  });

  it('nói lỗi này đang dùng ở mấy rubric', () => {
    mount({ errors: [errorItem({ alsoIn: [{ rubricName: 'B', criterionKey: 'x', deduction: null }] })] });
    open();
    expect(screen.getByText('Lỗi này đang dùng ở 2 rubric — bạn chọn đổi cả 2 hoặc chỉ rubric này')).toBeInTheDocument();
  });

  it('Chuyển sang tiêu chí khác mở hộp thoại; Gỡ khỏi rubric này mở hộp xác nhận', () => {
    mount();
    open();
    fireEvent.click(screen.getByRole('menuitem', { name: /Chuyển sang tiêu chí khác/ }));
    expect(screen.getByRole('heading', { name: /Chuyển “Sai ca biên” sang tiêu chí khác/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Huỷ' }));
    open();
    fireEvent.click(screen.getByRole('menuitem', { name: /Gỡ khỏi rubric này/ }));
    expect(screen.getByRole('heading', { name: /Gỡ “Sai ca biên” khỏi rubric/ })).toBeInTheDocument();
  });
});

describe('ErrorsTab — lỗi gắn tiêu chí không còn (Review Focus 4)', () => {
  const orphans = [
    errorItem({ id: 'o1', name: 'Mồ côi A', criterionKey: 'da_xoa', criterionDangling: true }),
    // Máy chủ không đánh dấu nhưng khoá không có trong tổng quan (hai lần đọc lệch nhau): vẫn phải hiện, không văng.
    errorItem({ id: 'o2', name: 'Mồ côi B', criterionKey: 'khong_ai_biet', criterionDangling: false }),
  ];

  it('hiện ở nhóm "Chưa có tiêu chí" cuối trang, kèm lời giải thích', () => {
    mount({ errors: [...rows(), ...orphans] });
    const group = screen.getByRole('region', { name: 'Chưa có tiêu chí' });
    expect(within(group).getByText('Mồ côi A')).toBeInTheDocument();
    expect(within(group).getByText('Mồ côi B')).toBeInTheDocument();
    expect(within(group).getByText('2 lỗi')).toBeInTheDocument();
    expect(within(group).getByText(/Chuyển chúng sang tiêu chí khác hoặc gỡ khỏi rubric/)).toBeInTheDocument();
  });

  it('vẫn chuyển được và gỡ được', () => {
    mount({ errors: orphans });
    fireEvent.keyDown(screen.getByRole('button', { name: 'Thao tác với Mồ côi A' }), { key: 'Enter' });
    fireEvent.click(screen.getByRole('menuitem', { name: /Chuyển sang tiêu chí khác/ }));
    expect(screen.getAllByRole('option').length).toBeGreaterThan(1);
  });

  it('không có lỗi mồ côi thì không có nhóm đó', () => {
    mount();
    expect(screen.queryByRole('region', { name: 'Chưa có tiêu chí' })).not.toBeInTheDocument();
  });
});

describe('ErrorsTab — tải, lỗi, và nhảy tới một nhóm', () => {
  const noop = { onAdd: vi.fn(), onEdit: vi.fn(), onWaive: vi.fn(), onUnwaive: vi.fn(), onOpenRubric: vi.fn() };

  it('đang tải / lỗi tải', () => {
    const { unmount } = render(<ErrorsTab overview={board()} errors={undefined} loading error={null} focus={null} {...noop} />);
    expect(screen.getByText('Đang tải…')).toBeInTheDocument();
    unmount();
    render(<ErrorsTab overview={board()} errors={undefined} loading={false} error={new Error('Máy chủ không trả lời')} focus={null} {...noop} />);
    expect(screen.getByText(/Không tải được danh sách lỗi — Máy chủ không trả lời/)).toBeInTheDocument();
  });

  it('focus mở lại nhóm đang gập và cuộn tới nó', () => {
    const spy = vi.spyOn(Element.prototype, 'scrollIntoView');
    const { rerender } = render(<ErrorsTab overview={board()} errors={rows()} loading={false} error={null} focus={null} {...noop} />);
    const group = screen.getByRole('region', { name: 'Tính đúng đắn' });
    fireEvent.click(within(group).getByRole('button', { expanded: true }));
    expect(screen.queryByText('Sai ca biên')).not.toBeInTheDocument();
    rerender(<ErrorsTab overview={board()} errors={rows()} loading={false} error={null} focus={{ key: 'tinh_dung', n: 1 }} {...noop} />);
    expect(screen.getByText('Sai ca biên')).toBeInTheDocument();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
