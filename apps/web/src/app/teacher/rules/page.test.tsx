import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import RulesPage from './page';

vi.mock('@/hooks/useRules', () => ({
  useRules: () => ({
    data: [
      {
        id: 'r1',
        ruleKey: 'sai_bien',
        state: 'active',
        origin: 'teacher',
        revision: {
          id: 'v1',
          revision: 1,
          name: 'Sai ca biên',
          description: 'Nhóm biên không đạt',
          criterionKey: 'tinh_dung',
          predicate: null,
        },
        checkedBy: 'machine',
        deduction: '1.50',
        appliedTo: { results: 5, sessions: 2 },
        mismatchedIn: 0,
      },
      {
        id: 'r2',
        ruleKey: 'chua_gia',
        state: 'active',
        origin: 'teacher',
        revision: {
          id: 'v2',
          revision: 1,
          name: 'Đặt tên biến',
          description: 'x',
          criterionKey: 'tinh_dung',
          predicate: null,
        },
        checkedBy: 'model',
        deduction: null,
        appliedTo: { results: 0, sessions: 0 },
        mismatchedIn: 1,
      },
    ],
    isLoading: false,
  }),
  useMissingRules: () => ({ data: [], isLoading: false }),
  usePreviewPrice: () => ({ mutate: vi.fn(), data: undefined, isPending: false }),
  useSetPrice: () => ({ mutate: vi.fn(), isPending: false }),
}));

describe('Trang kiến thức', () => {
  it('hiện luật chưa có giá và số bài lệch tiêu chí', () => {
    render(<RulesPage />);
    expect(screen.getByText('sai_bien')).toBeInTheDocument();
    expect(screen.getByText(/chưa có giá/i)).toBeInTheDocument();
    expect(screen.getByText(/1 bài lệch tiêu chí/i)).toBeInTheDocument();
  });

  it('mở dialog sửa giá khi bấm "Sửa giá"', () => {
    render(<RulesPage />);
    fireEvent.click(screen.getAllByText('Sửa giá')[0]);
    expect(screen.getByText(/Giá của sai_bien/i)).toBeInTheDocument();
  });
});
