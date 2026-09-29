import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ReapplyPricesPanel } from './ReapplyPricesPanel';
import type { ReapplyPlan } from '@/lib/api/grading';

const h = vi.hoisted(() => ({
  previewMutate: vi.fn(),
  previewReset: vi.fn(),
  applyMutate: vi.fn(),
  preview: { data: undefined as unknown, isPending: false, isError: false, error: null as Error | null },
  apply: { isPending: false, isError: false, error: null as Error | null },
}));

vi.mock('@/hooks/useGrading', () => ({
  useReapplyPreview: () => ({ mutate: h.previewMutate, reset: h.previewReset, ...h.preview }),
  useReapplyPrices: () => ({ mutate: h.applyMutate, ...h.apply }),
}));

const plan = (over: Partial<ReapplyPlan> = {}): ReapplyPlan => ({
  changes: [
    {
      resultId: 'aaaaaaaa-1111', oldScore: '8.50', newScore: '7.00',
      changedRules: [{ ruleId: 'r1', ruleKey: 'sai_bien', oldDeduction: '1.50', newDeduction: '3.00' }],
    },
    {
      resultId: 'bbbbbbbb-2222', oldScore: '9.00', newScore: '9.50',
      changedRules: [{ ruleId: 'r2', ruleKey: 'ten_bien', oldDeduction: '1.00', newDeduction: '0.50' }],
    },
  ],
  skipped: [],
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  h.preview = { data: undefined, isPending: false, isError: false, error: null };
  h.apply = { isPending: false, isError: false, error: null };
});

/**
 * Spec §3.1/§3.10: changing a price in Bảng lỗi does NOT change a finalised session (its price table was pinned
 * at finalisation). Reapplying is a separate, previewed, confirmed action, and every result whose score moves
 * leaves an audit-log line.
 */
describe('ReapplyPricesPanel', () => {
  it('explains that price changes do not reach a finalised session on their own', () => {
    render(<ReapplyPricesPanel sessionId="s1" />);
    expect(screen.getByText(/không tự đổi điểm phiên đã chốt/)).toBeInTheDocument();
  });

  it('"Xem trước" asks the server — and only that; nothing is applied yet', () => {
    render(<ReapplyPricesPanel sessionId="s1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Xem trước' }));
    expect(h.previewMutate).toHaveBeenCalledTimes(1);
    expect(h.applyMutate).not.toHaveBeenCalled();
  });

  it('cannot apply before there is a preview', () => {
    render(<ReapplyPricesPanel sessionId="s1" />);
    expect(screen.getByRole('button', { name: /^Áp giá mới/ })).toBeDisabled();
  });

  it('shows a loading state while the preview is computed', () => {
    h.preview = { ...h.preview, isPending: true };
    render(<ReapplyPricesPanel sessionId="s1" />);
    expect(screen.getByText('Đang tính…')).toBeInTheDocument();
  });

  describe('a preview with changes', () => {
    beforeEach(() => {
      h.preview = { ...h.preview, data: plan() };
    });

    it('lists each result whose score moves: old → new, and which rules changed and how (decimal strings, points)', () => {
      render(<ReapplyPricesPanel sessionId="s1" />);
      const rows = screen.getAllByRole('row').slice(1);
      expect(rows).toHaveLength(2);
      expect(within(rows[0]).getByText('8,5')).toBeInTheDocument();
      expect(within(rows[0]).getByText('7,0')).toBeInTheDocument();
      expect(within(rows[0]).getByText('sai_bien')).toHaveClass('font-mono');
      expect(within(rows[0]).getByText(/−1,5 → −3,0/)).toBeInTheDocument();
    });

    it('marks the direction in words and an arrow, never colour alone', () => {
      render(<ReapplyPricesPanel sessionId="s1" />);
      const rows = screen.getAllByRole('row').slice(1);
      expect(within(rows[0]).getByText('↓ Giảm')).toBeInTheDocument();
      expect(within(rows[1]).getByText('↑ Tăng')).toBeInTheDocument();
    });

    it('links each result to its dossier', () => {
      render(<ReapplyPricesPanel sessionId="s1" />);
      expect(screen.getByRole('link', { name: 'aaaaaaaa' })).toHaveAttribute('href', '/teacher/grading/aaaaaaaa-1111?sessionId=s1');
    });

    it('the apply button carries the number of results that change', () => {
      render(<ReapplyPricesPanel sessionId="s1" />);
      expect(screen.getByRole('button', { name: 'Áp giá mới cho 2 bài' })).toBeEnabled();
    });

    it('applying asks first, says every changed result gets an audit-log line, and sends nothing until confirmed', () => {
      render(<ReapplyPricesPanel sessionId="s1" />);
      fireEvent.click(screen.getByRole('button', { name: 'Áp giá mới cho 2 bài' }));
      expect(screen.getByRole('dialog')).toHaveTextContent('2 bài');
      expect(screen.getByRole('dialog')).toHaveTextContent('một dòng nhật ký');
      expect(h.applyMutate).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole('button', { name: 'Áp giá mới' }));
      expect(h.applyMutate).toHaveBeenCalledTimes(1);
    });

    it('cancelling sends nothing', () => {
      render(<ReapplyPricesPanel sessionId="s1" />);
      fireEvent.click(screen.getByRole('button', { name: 'Áp giá mới cho 2 bài' }));
      fireEvent.click(screen.getByRole('button', { name: 'Huỷ' }));
      expect(h.applyMutate).not.toHaveBeenCalled();
    });

    it('after a successful apply: says how many changed and drops the now-stale preview', () => {
      h.applyMutate.mockImplementation((_v: void, opts: { onSuccess: (d: { changed: number }) => void }) => opts.onSuccess({ changed: 2 }));
      render(<ReapplyPricesPanel sessionId="s1" />);
      fireEvent.click(screen.getByRole('button', { name: 'Áp giá mới cho 2 bài' }));
      fireEvent.click(screen.getByRole('button', { name: 'Áp giá mới' }));
      expect(screen.getByRole('status')).toHaveTextContent('Đã áp giá mới cho 2 bài');
      expect(h.previewReset).toHaveBeenCalled();
    });

    it('a refusal (409) shows the server message verbatim in the dialog', () => {
      h.apply = { isPending: false, isError: true, error: new Error('2 bài dính luật lúc chốt có giá mà nay chưa có giá') };
      render(<ReapplyPricesPanel sessionId="s1" />);
      fireEvent.click(screen.getByRole('button', { name: 'Áp giá mới cho 2 bài' }));
      expect(within(screen.getByRole('dialog')).getByRole('alert')).toHaveTextContent('nay chưa có giá');
    });
  });

  describe('a preview with results that cannot be applied', () => {
    it('names them and the rules, points to Bảng lỗi, and does NOT let the teacher apply (the server refuses the whole run)', () => {
      h.preview = {
        ...h.preview,
        data: plan({ skipped: [{ resultId: 'cccccccc-3333', reason: 'unpriced', ruleKeys: ['rong_mang', 'sai_khac'] }] }),
      };
      render(<ReapplyPricesPanel sessionId="s1" />);
      expect(screen.getByText(/1 bài không áp được/)).toBeInTheDocument();
      expect(screen.getByText('rong_mang')).toHaveClass('font-mono');
      expect(screen.getByRole('link', { name: 'Đặt giá ở Bảng lỗi' })).toHaveAttribute('href', '/teacher/rules');
      expect(screen.getByRole('button', { name: /^Áp giá mới/ })).toBeDisabled();
    });
  });

  it('a preview with nothing to change says so and offers nothing to apply', () => {
    h.preview = { ...h.preview, data: plan({ changes: [], skipped: [] }) };
    render(<ReapplyPricesPanel sessionId="s1" />);
    expect(screen.getByText('Giá hiện hành không làm đổi điểm bài nào.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Áp giá mới/ })).toBeDisabled();
  });

  it('shows the preview error verbatim (e.g. the session is not fully finalised)', () => {
    h.preview = { ...h.preview, isError: true, error: new Error('Phiên chưa chốt — giá mới đã tự áp cho phiên chưa chốt') };
    render(<ReapplyPricesPanel sessionId="s1" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Phiên chưa chốt');
  });
});
