import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import RulesPage from './page';
import { criterion, errorItem, libraryRule, overview, proposal, session } from './_components/fixtures';
import { rulesHref } from '@/lib/rules-links';
import type { RubricOverview } from '@/lib/api/rubric-errors';

let search = '';
const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(search),
  useRouter: () => ({ replace }),
}));

const h = vi.hoisted(() => {
  const mut = () => ({ mutate: vi.fn(), isPending: false, isError: false, error: null as Error | null, reset: vi.fn() });
  return {
    overview: { data: [] as unknown[], isLoading: false, isFetching: false, isError: false, error: null as Error | null },
    errors: { data: [] as unknown[], isLoading: false, isError: false, error: null as Error | null },
    proposals: { data: [] as unknown[], isLoading: false, isError: false, error: null as Error | null },
    library: { data: [] as unknown[], isLoading: false, isError: false, error: null as Error | null },
    rubrics: { data: [] as unknown[] },
    save: mut(), copy: mut(), assign: mut(), move: mut(), remove: mut(), preview: mut(), price: mut(),
    revise: mut(), split: mut(), dismiss: mut(), setWaiver: mut(), revokeWaiver: mut(),
  };
});
vi.mock('@/hooks/useGrading', () => ({ useRubrics: () => h.rubrics, useSaveRubric: () => h.save }));
vi.mock('@/hooks/useRubricErrors', () => ({
  useRubricOverview: () => h.overview,
  useRubricErrors: () => h.errors,
  useCopyErrors: () => h.copy,
  useAssignError: () => h.assign,
  useMoveError: () => h.move,
  useRemoveError: () => h.remove,
  usePreviewErrorPrice: () => h.preview,
  useSetErrorPrice: () => h.price,
}));
vi.mock('@/hooks/useRules', () => ({
  useLibrary: () => h.library,
  useProposals: () => h.proposals,
  useReviseRule: () => h.revise,
  useSplitRule: () => h.split,
  useDismissRule: () => h.dismiss,
  useSetWaiver: () => h.setWaiver,
  useRevokeWaiver: () => h.revokeWaiver,
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const GK = overview({
  rubricName: 'Giữa kỳ CTDL',
  rubricId: 'ru-1',
  criteria: [
    criterion({ key: 'tinh_dung', description: 'Tính đúng đắn', maxPoints: 6, errorCount: 2 }),
    criterion({ key: 'bo_nho', description: 'Quản lý bộ nhớ', maxPoints: 2, errorCount: 0 }),
  ],
  unpricedCount: 1,
  proposalCount: 2,
  sessions: [session({ id: 's1', name: 'Ca sáng', state: 'grading' })],
});
const DT = overview({ rubricName: 'Diễn tập', rubricId: 'ru-2' });
const CK = overview({ rubricName: 'Cuối kỳ CTDL', rubricId: 'ru-3', criteria: [criterion({ errorCount: 0 })] });

const items = [
  errorItem({ id: 'e1', ruleId: 'r1', name: 'Sai ca biên', criterionKey: 'tinh_dung', deduction: '2.00' }),
  errorItem({ id: 'e2', ruleId: 'r2', name: 'Đặt tên biến', predicate: null, checkedBy: 'model', criterionKey: 'tinh_dung', deduction: null }),
];
const rubricRecord = { id: 'ru-1', teacherId: 't1', name: 'Giữa kỳ CTDL', version: 1, isActive: true, totalPoints: 8, criteria: [{ id: 'c1', key: 'tinh_dung', description: 'Tính đúng đắn', maxPoints: 6 }, { id: 'c2', key: 'bo_nho', description: 'Quản lý bộ nhớ', maxPoints: 2 }] };

const extra = (n: number): RubricOverview[] => Array.from({ length: n }, (_, i) => overview({ rubricName: `Rubric thêm ${i + 1}`, rubricId: `x${i}` }));

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  search = '';
  h.overview = { data: [GK, DT, CK], isLoading: false, isFetching: false, isError: false, error: null };
  h.errors = { data: items, isLoading: false, isError: false, error: null };
  h.proposals = { data: [proposal({ id: 'p1' }), proposal({ id: 'p2', name: 'Con trỏ top không cập nhật' })], isLoading: false, isError: false, error: null };
  h.library = { data: [libraryRule({ id: 'r1' })], isLoading: false, isError: false, error: null };
  h.rubrics = { data: [rubricRecord] };
});

describe('Bảng lỗi — chọn rubric và URL (Review Focus 1, 2)', () => {
  it('không có ?rubric= thì mở rubric đầu tiên của tổng quan (lưu gần nhất)', () => {
    render(<RulesPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Bảng lỗi' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Giữa kỳ CTDL/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Sai ca biên')).toBeInTheDocument();
  });

  it('?rubric= mở đúng rubric đó', () => {
    search = `rubric=${encodeURIComponent('Diễn tập')}`;
    render(<RulesPage />);
    expect(screen.getByRole('tab', { name: /Diễn tập/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('heading', { name: 'Sẵn sàng chấm tự động' })).toBeInTheDocument();
  });

  it('tên rubric có & # ? / và dấu đi vòng qua URL không mất ký tự nào', () => {
    const name = 'A&B #1 — Giữa kỳ? 50%+';
    h.overview.data = [GK, overview({ rubricName: name, rubricId: 'sp' })];
    search = `rubric=${encodeURIComponent(name)}`;
    render(<RulesPage />);
    expect(screen.getByRole('tab', { name: new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) })).toHaveAttribute('aria-selected', 'true');
  });

  it('?rubric= trỏ tên không còn tồn tại thì mở rubric đầu tiên, không trống trang', () => {
    search = 'rubric=Da%20xoa';
    render(<RulesPage />);
    expect(screen.getByRole('tab', { name: /Giữa kỳ CTDL/ })).toHaveAttribute('aria-selected', 'true');
  });

  it('vừa tạo rubric, tổng quan đang tải lại: hiện khung chờ thay vì mở nhầm rubric khác', () => {
    search = 'rubric=Moi%20tao';
    h.overview.isFetching = true;
    render(<RulesPage />);
    expect(screen.queryByRole('tab', { name: /Giữa kỳ CTDL/ })).not.toBeInTheDocument();
    expect(screen.getByText('Đang tải…')).toBeInTheDocument();
  });

  it('bấm rubric khác thì đổi URL bằng rulesHref (không cuộn) và về tab lỗi', () => {
    render(<RulesPage />);
    fireEvent.click(screen.getByRole('tab', { name: /Diễn tập/ }));
    expect(replace).toHaveBeenCalledWith(rulesHref('Diễn tập'), { scroll: false });
  });

  it('rubric đang mở được ghi vào "gần đây" theo giảng viên; đổi rubric thì lên đầu', () => {
    const { rerender } = render(<RulesPage />);
    expect(JSON.parse(localStorage.getItem('rules.recent.t1') ?? '[]')).toEqual(['Giữa kỳ CTDL']);
    search = `rubric=${encodeURIComponent('Diễn tập')}`;
    rerender(<RulesPage />);
    expect(JSON.parse(localStorage.getItem('rules.recent.t1') ?? '[]')).toEqual(['Diễn tập', 'Giữa kỳ CTDL']);
  });

  it('localStorage bị chặn: trang vẫn chạy đúng (Review Focus 3)', () => {
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    render(<RulesPage />);
    expect(screen.getByText('Sai ca biên')).toBeInTheDocument();
    get.mockRestore();
    set.mockRestore();
  });
});

describe('Bảng lỗi — các trạng thái của trang', () => {
  it('đang tải / lỗi tải tổng quan', () => {
    h.overview = { data: [], isLoading: true, isFetching: true, isError: false, error: null };
    const { unmount } = render(<RulesPage />);
    expect(screen.getByText('Đang tải…')).toBeInTheDocument();
    unmount();
    h.overview = { data: [], isLoading: false, isFetching: false, isError: true, error: new Error('Máy chủ không trả lời') };
    render(<RulesPage />);
    expect(screen.getByText(/Không tải được Bảng lỗi — Máy chủ không trả lời/)).toBeInTheDocument();
  });

  it('chưa có rubric nào: màn hình lần đầu; "Tạo rubric đầu tiên" mở hộp thoại; nút "Thêm lỗi" khoá', () => {
    h.overview.data = [];
    render(<RulesPage />);
    expect(screen.getByRole('heading', { name: 'Bắt đầu với một rubric' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Thêm lỗi' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Tạo rubric đầu tiên' }));
    expect(screen.getByRole('heading', { name: 'Tạo rubric mới' })).toBeInTheDocument();
  });

  it('dải trạng thái, thông tin rubric và ba tab có đếm', () => {
    render(<RulesPage />);
    expect(screen.getByRole('heading', { name: 'Chưa sẵn sàng chấm tự động — còn 3 việc' })).toBeInTheDocument();
    expect(screen.getByText(/Dùng ở:/)).toHaveTextContent('Ca sáng');
    expect(screen.getByRole('tab', { name: 'Lỗi theo tiêu chí 2' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Lỗi AI đề xuất 2' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Thư viện lỗi 1' })).toBeInTheDocument();
  });
});

describe('Bảng lỗi — việc cần làm là nút làm đúng việc (T-RBE-UI-3)', () => {
  it('"Xem lỗi AI đề xuất" mở tab đề xuất', () => {
    render(<RulesPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Xem lỗi AI đề xuất' }));
    expect(screen.getByRole('tab', { name: /Lỗi AI đề xuất/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('heading', { name: 'Con trỏ top không cập nhật' })).toBeInTheDocument();
  });

  it('"Thêm lỗi" của tiêu chí rỗng cuộn tới nhóm đó', () => {
    const spy = vi.spyOn(Element.prototype, 'scrollIntoView');
    render(<RulesPage />);
    fireEvent.click(within(screen.getByRole('status')).getByRole('button', { name: 'Thêm lỗi' }));
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('"Đặt điểm trừ" của dải cuộn tới tiêu chí chứa lỗi chưa có điểm trừ', () => {
    const spy = vi.spyOn(Element.prototype, 'scrollIntoView');
    render(<RulesPage />);
    fireEvent.click(within(screen.getByRole('status')).getByRole('button', { name: 'Đặt điểm trừ' }));
    expect(spy).toHaveBeenCalled();
    expect((spy.mock.instances.at(-1) as unknown as HTMLElement).id).toBe('crit-tinh_dung');
    spy.mockRestore();
  });
});

describe('Bảng lỗi — ngăn kéo và hộp thoại', () => {
  it('"Thêm lỗi" (đầu trang) mở ngăn kéo với ô chọn tiêu chí', () => {
    render(<RulesPage />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Thêm lỗi' })[0]);
    expect(screen.getByRole('dialog', { name: 'Thêm lỗi' })).toBeInTheDocument();
    expect(screen.getByLabelText('Tiêu chí')).toBeInTheDocument();
  });

  it('"Thêm lỗi vào …" của một nhóm mở ngăn kéo với tiêu chí đã biết', () => {
    render(<RulesPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Thêm lỗi vào “Tính đúng đắn”' }));
    expect(screen.getByText('Tiêu chí: Tính đúng đắn · tối đa 6,0')).toBeInTheDocument();
  });

  it('"Thêm vào rubric này" ở một lỗi đề xuất mở ngăn kéo tab "Tạo lỗi mới" điền sẵn (Review Focus 5)', () => {
    render(<RulesPage />);
    fireEvent.click(screen.getByRole('tab', { name: /Lỗi AI đề xuất/ }));
    fireEvent.click(within(screen.getByRole('heading', { name: 'Con trỏ top không cập nhật' }).closest('li') as HTMLElement).getByRole('button', { name: 'Thêm vào rubric này' }));
    expect(screen.getByRole('tab', { name: 'Tạo lỗi mới' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByLabelText('Tên lỗi')).toHaveValue('Con trỏ top không cập nhật');
  });

  it('⋯ → Sửa tên, mô tả, cách phát hiện mở ngăn kéo sửa, từ rubric đang mở', () => {
    render(<RulesPage />);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Thao tác với Sai ca biên' }), { key: 'Enter' });
    fireEvent.click(screen.getByRole('menuitem', { name: /Sửa tên, mô tả, cách phát hiện/ }));
    expect(screen.getByRole('dialog', { name: 'Sửa lỗi' })).toBeInTheDocument();
    expect(screen.getByText(/Bạn đang mở từ rubric “Giữa kỳ CTDL”/)).toBeInTheDocument();
  });

  it('Thư viện lỗi → "Sửa lỗi" mở ngăn kéo sửa từ Thư viện', () => {
    render(<RulesPage />);
    fireEvent.click(screen.getByRole('tab', { name: /Thư viện lỗi/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Sửa lỗi Sai ca biên' }));
    expect(screen.getByText(/Bạn đang mở từ Thư viện lỗi/)).toBeInTheDocument();
  });

  it('"Tiêu chí này không trừ điểm" hỏi xác nhận rồi mới gửi đúng khoá cho đúng rubric', () => {
    render(<RulesPage />);
    fireEvent.click(within(screen.getByRole('region', { name: 'Quản lý bộ nhớ' })).getByRole('button', { name: 'Tiêu chí này không trừ điểm' }));
    expect(h.setWaiver.mutate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Đánh dấu không trừ điểm' }));
    expect(h.setWaiver.mutate).toHaveBeenCalledWith('bo_nho', expect.anything());
  });

  it('"Sửa tiêu chí & điểm tối đa" mở hộp thoại sửa của đúng rubric', () => {
    render(<RulesPage />);
    fireEvent.click(screen.getByRole('button', { name: /Sửa tiêu chí & điểm tối đa/ }));
    expect(screen.getByRole('heading', { name: /Sửa tiêu chí & điểm tối đa — Giữa kỳ CTDL/ })).toBeInTheDocument();
  });
});

describe('Bảng lỗi — nhiều rubric và học kỳ (T-RBE-UI-10)', () => {
  it('từ 5 rubric: ô "Rubric đang mở"; tạo rubric mới đặt lại bộ lọc học kỳ và chuyển sang rubric vừa tạo', () => {
    h.overview.data = [GK, DT, CK, ...extra(3)];
    const saved = { ...rubricRecord, id: 'ru-new', name: 'Rubric mới tạo', version: 1 };
    h.save.mutate.mockImplementation((_i: unknown, opts: { onSuccess: (r: unknown) => void }) => opts.onSuccess(saved));
    render(<RulesPage />);
    fireEvent.click(screen.getByRole('button', { name: /Đổi rubric/ }));
    fireEvent.change(screen.getByLabelText('Lọc theo học kỳ'), { target: { value: 'HK1 2026-2027' } });
    expect(screen.getByText(/Học kỳ: HK1 2026-2027/)).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: /Rubric mới/ })[0]);
    fireEvent.click(screen.getByRole('button', { name: /^Tạo trống/ }));
    fireEvent.change(screen.getByLabelText('Tên rubric'), { target: { value: 'Rubric mới tạo' } });
    fireEvent.change(screen.getByLabelText('Tiêu chí 1'), { target: { value: 'Tính đúng' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo rubric' }));
    expect(replace).toHaveBeenCalledWith(rulesHref('Rubric mới tạo'), { scroll: false });
    expect(screen.queryByText(/Học kỳ: HK1 2026-2027/)).not.toBeInTheDocument();
  });
});

/**
 * T-RBE-UI-2: chữ giảng viên đọc không còn từ vựng của dev. Quét văn bản thật của trang ở nhiều trạng thái; khi
 * hỏng, thông báo nêu đúng từ vi phạm. Từ "luật/giá/trần" chỉ cấm đứng riêng một chữ (không cấm "đánh giá").
 */
describe('Bảng lỗi — từ vựng (T-RBE-UI-2)', () => {
  const BANNED = /(?<![\p{L}\p{N}_])(giá|trần|luật|cách khớp|cần backend|chua_gan)(?![\p{L}\p{N}_])/iu;
  const clean = () => expect((document.body.textContent ?? '').match(BANNED)?.[0]).toBeUndefined();

  it('tab lỗi theo tiêu chí, đề xuất, thư viện', () => {
    render(<RulesPage />);
    clean();
    fireEvent.click(screen.getByRole('tab', { name: /Lỗi AI đề xuất/ }));
    clean();
    fireEvent.click(screen.getByRole('tab', { name: /Thư viện lỗi/ }));
    clean();
  });

  it('ngăn kéo thêm lỗi (cả hai tab), ngăn kéo sửa lỗi', () => {
    render(<RulesPage />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Thêm lỗi' })[0]);
    clean();
    fireEvent.click(screen.getByRole('tab', { name: 'Tạo lỗi mới' }));
    clean();
    fireEvent.click(screen.getByRole('button', { name: 'Huỷ' }));
    fireEvent.click(screen.getByRole('tab', { name: /Thư viện lỗi/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Sửa lỗi Sai ca biên' }));
    clean();
  });

  it('rubric mới (dải sao chép), ô chọn nhiều rubric, màn hình lần đầu, hộp thoại tạo rubric', () => {
    h.overview.data = [CK, GK];
    const first = render(<RulesPage />);
    clean();
    first.unmount();
    h.overview.data = [GK, DT, CK, ...extra(3)];
    const many = render(<RulesPage />);
    fireEvent.click(screen.getByRole('button', { name: /Đổi rubric/ }));
    clean();
    many.unmount();
    h.overview.data = [];
    render(<RulesPage />);
    clean();
    fireEvent.click(screen.getByRole('button', { name: 'Tạo rubric đầu tiên' }));
    clean();
  });
});
