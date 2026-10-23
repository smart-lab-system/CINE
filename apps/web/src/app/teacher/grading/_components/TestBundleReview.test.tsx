import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { TestBundleReview } from './TestBundleReview';
import type { TestBundleDetail, TestBundleSummary } from '@/lib/api/test-bundle';

const h = vi.hoisted(() => ({
  bundles: { data: [] as TestBundleSummary[], isLoading: false },
  detail: { data: undefined as TestBundleDetail | undefined, isLoading: false, isError: false, error: null as Error | null },
}));

vi.mock('@/hooks/useTestBundle', () => ({ useTestBundles: () => h.bundles }));
vi.mock('@/hooks/useTestBundleDetail', () => ({ useTestBundleDetail: () => h.detail }));

const summary = (over: Partial<TestBundleSummary> = {}): TestBundleSummary => ({
  id: 'b1', version: 2, approvedAt: '2026-10-22T02:00:00.000Z', origin: 'teacher', caseCount: 1, ...over,
});

beforeEach(() => {
  h.bundles = { data: [summary(), summary({ id: 'b0', version: 1, approvedAt: null, caseCount: 3 })], isLoading: false };
  h.detail = {
    data: {
      id: 'b1',
      version: 2,
      approvedAt: '2026-10-22T02:00:00.000Z',
      cases: [{ caseKey: 'ca1', group: 'co_ban', input: '1', expectedOutput: '2', constraintQuote: null, autoDroppedReason: null }],
    },
    isLoading: false,
    isError: false,
    error: null,
  };
});

describe('TestBundleReview', () => {
  it('names every version, marks the pinned one, and shows its cases without write buttons', () => {
    render(<TestBundleReview sessionId="s1" pinnedBundleId="b1" />);
    expect(screen.getByText('Phiên bản 2')).toBeInTheDocument();
    expect(screen.getByText('Phiên bản 1')).toBeInTheDocument();
    expect(screen.getByText('Đang dùng')).toBeInTheDocument();
    expect(screen.getByText(/Đã duyệt lúc/)).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'co_ban' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '1' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '2' })).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('says when nothing is pinned', () => {
    h.detail = { data: undefined, isLoading: false, isError: false, error: null };
    render(<TestBundleReview sessionId="s1" pinnedBundleId={null} />);
    expect(screen.getByText('Chưa ghim gói test.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
