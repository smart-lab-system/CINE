import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import RulesPage from './page';
import { rule } from './_components/fixtures';
import type { Rule } from '@/lib/api/rules';

let rulesState: { data: Rule[] | undefined; isLoading: boolean; isError: boolean; error: Error | null };
let missingData: Rule[] | undefined;

vi.mock('@/hooks/useRules', () => ({
  useRules: () => rulesState,
  useMissingRules: () => ({ data: missingData, isLoading: false }),
  usePreviewPrice: () => ({ mutate: vi.fn(), data: undefined, isPending: false, reset: vi.fn() }),
  useSetPrice: () => ({ mutate: vi.fn(), isPending: false }),
}));

const priced = rule({ id: 'r1', ruleKey: 'sai_bien' });
const unpriced = rule({ id: 'r2', ruleKey: 'chua_gia', deduction: null, revision: { name: 'Đặt tên biến' }, mismatchedIn: 1 });

beforeEach(() => {
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

  it('mở bảng đặt giá bên phải khi bấm "Sửa giá", điền sẵn giá hiện tại', () => {
    render(<RulesPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Sửa giá' }));
    expect((screen.getByLabelText('Mức trừ (điểm)') as HTMLInputElement).value).toBe('1,5');
  });

  it('bấm "Đặt giá" ở luật chưa có giá mở bảng với ô trống', () => {
    render(<RulesPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Đặt giá' }));
    expect(screen.getByText('Đặt giá lần đầu')).toBeInTheDocument();
    expect((screen.getByLabelText('Mức trừ (điểm)') as HTMLInputElement).value).toBe('');
  });
});
