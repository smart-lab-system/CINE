import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import RulesPage from './page';
import { rule } from './_components/fixtures';
import type { Rule } from '@/lib/api/rules';
import type { Rubric } from '@/lib/api/grading';

let rulesState: { data: Rule[] | undefined; isLoading: boolean; isError: boolean; error: Error | null };
let missingData: Rule[] | undefined;

let rubricsData: Rubric[];

vi.mock('@/hooks/useGrading', () => ({ useRubrics: () => ({ data: rubricsData, isLoading: false }) }));
// The card has its own tests; here only its place on the page matters.
vi.mock('./_components/CeilingCard', () => ({ CeilingCard: () => <aside data-testid="ceiling-card" /> }));

vi.mock('@/hooks/useRules', () => ({
  useRules: () => rulesState,
  useMissingRules: () => ({ data: missingData, isLoading: false }),
  usePreviewPrice: () => ({ mutate: vi.fn(), data: undefined, isPending: false, reset: vi.fn() }),
  useSetPrice: () => ({ mutate: vi.fn(), isPending: false }),
  useSetRuleState: () => ({ mutate: vi.fn(), isPending: false, isError: false, error: null }),
}));

const priced = rule({ id: 'r1', ruleKey: 'sai_bien' });
const unpriced = rule({ id: 'r2', ruleKey: 'chua_gia', deduction: null, revision: { name: 'Đặt tên biến' }, mismatchedIn: 1 });

beforeEach(() => {
  rubricsData = [
    {
      id: 'ru-1', teacherId: 't', name: 'CTDL', version: 1, isActive: true, totalPoints: 10,
      criteria: [{ id: 'c1', key: 'tinh_dung', description: 'Tính đúng', maxPoints: 6 }],
    },
  ];
  rulesState = { data: [priced, unpriced], isLoading: false, isError: false, error: null };
  missingData = [];
});

describe('Bảng lỗi (trang)', () => {
  it('tên trang là "Bảng lỗi" — không còn "Trang kiến thức"', () => {
    render(<RulesPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Bảng lỗi' })).toBeInTheDocument();
    expect(screen.queryByText(/Trang kiến thức/)).not.toBeInTheDocument();
  });

  it('có lối "Thêm luật" sang trang tạo luật', () => {
    render(<RulesPage />);
    expect(screen.getByRole('link', { name: /Thêm luật/ })).toHaveAttribute('href', '/teacher/rules/new');
  });

  it('hiện bảng luật, tổng quan và cảnh báo lệch tiêu chí', () => {
    render(<RulesPage />);
    expect(screen.getByText('sai_bien · của bạn')).toBeInTheDocument();
    expect(screen.getByText('1 / 2 luật')).toBeInTheDocument();
    expect(screen.getByText('1 bài lệch tiêu chí')).toBeInTheDocument();
  });

  it('bấm chip "Chưa có giá" chỉ còn luật chưa có giá', () => {
    render(<RulesPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Chưa có giá · 1' }));
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows).toHaveLength(1);
    expect(within(rows[0]).getByText(/chua_gia/)).toBeInTheDocument();
  });

  it('ô tìm không ra gì → nói rõ và chỉ đường về "Tất cả"', () => {
    render(<RulesPage />);
    fireEvent.change(screen.getByLabelText('Tìm luật'), { target: { value: 'zzzz' } });
    expect(
      screen.getByText('Không có luật nào ở bộ lọc này. Chọn "Tất cả" để xem toàn bộ bảng.'),
    ).toBeInTheDocument();
  });

  it('bảng chưa có luật nào → trống thì nói là trống, kèm hành động (spec §2.1 luật 2)', () => {
    rulesState = { data: [], isLoading: false, isError: false, error: null };
    render(<RulesPage />);
    expect(screen.getByText(/Chưa có luật nào trong bảng/)).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('đang tải → hiện trạng thái tải, không hiện bảng rỗng', () => {
    rulesState = { data: undefined, isLoading: true, isError: false, error: null };
    render(<RulesPage />);
    expect(screen.getByText('Đang tải…')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('lỗi tải → hiện thông điệp lỗi của server, không hiện "trống"', () => {
    rulesState = { data: undefined, isLoading: false, isError: true, error: new Error('Máy chủ không trả lời') };
    render(<RulesPage />);
    expect(screen.getByText(/Không tải được Bảng lỗi — Máy chủ không trả lời/)).toBeInTheDocument();
    expect(screen.queryByText(/Chưa có luật nào trong bảng/)).not.toBeInTheDocument();
  });

  it('có luật còn thiếu → hiện khối "Luật còn thiếu" ngay dưới bảng, và ô tổng quan đếm đúng', () => {
    missingData = [
      rule({ id: 'p1', state: 'proposed', origin: 'agent_reported', deduction: null, revision: { description: 'In kết quả trung gian' } }),
    ];
    render(<RulesPage />);
    expect(screen.getByRole('heading', { name: 'Luật còn thiếu' })).toBeInTheDocument();
    expect(screen.getByText('In kết quả trung gian')).toBeInTheDocument();
    expect(screen.getByText('1 lỗi chưa có luật')).toBeInTheDocument();
  });

  it('mở bảng đặt giá bên phải khi bấm "Sửa giá", điền sẵn giá hiện tại', () => {
    render(<RulesPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Sửa giá' }));
    expect((screen.getByLabelText('Mức trừ (điểm)') as HTMLInputElement).value).toBe('1,5');
  });

  it('đặt khối "Trần điểm theo tiêu chí" cạnh bảng luật', () => {
    render(<RulesPage />);
    expect(screen.getByTestId('ceiling-card')).toBeInTheDocument();
  });

  it('bảng đặt giá nói trần của tiêu chí mà luật đó trỏ vào', () => {
    render(<RulesPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Sửa giá' }));
    expect(screen.getByText(/Trần tiêu chí Tính đúng: 6,0 điểm/)).toBeInTheDocument();
  });

  it('không bịa trần khi tiêu chí của luật không còn trong rubric nào', () => {
    rubricsData = [];
    render(<RulesPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Sửa giá' }));
    expect(screen.queryByText(/Trần tiêu chí/)).not.toBeInTheDocument();
  });

  it('bấm "Đặt giá" ở luật chưa có giá mở bảng với ô trống', () => {
    render(<RulesPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Đặt giá' }));
    expect(screen.getByText('Đặt giá lần đầu')).toBeInTheDocument();
    expect((screen.getByLabelText('Mức trừ (điểm)') as HTMLInputElement).value).toBe('');
  });
});
