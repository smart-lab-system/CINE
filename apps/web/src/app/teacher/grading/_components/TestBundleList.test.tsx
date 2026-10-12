import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { TestBundleList } from './TestBundleList';

const h = vi.hoisted(() => ({
  bundles: { data: [] as unknown[], isLoading: false },
  detail: { data: undefined as unknown, isLoading: false, isError: false, error: null as Error | null },
  drop: { mutate: vi.fn(), isPending: false, isError: false, error: null as Error | null },
  approve: vi.fn(),
  pin: vi.fn(),
}));

vi.mock('@/hooks/useTestBundle', () => ({
  useTestBundles: () => h.bundles,
  useApproveTestBundle: () => ({ mutate: h.approve, isPending: false }),
  usePinTestBundle: () => ({ mutate: h.pin, isPending: false }),
}));
vi.mock('@/hooks/useTestBundleDetail', () => ({
  useTestBundleDetail: () => h.detail,
  useDropTestBundleCase: () => h.drop,
}));

const summary = (over: Record<string, unknown> = {}) => ({
  id: 'b1', version: 2, approvedAt: null as string | null, origin: 'teacher', caseCount: 2, ...over,
});
const detail = (approvedAt: string | null = null) => ({
  data: {
    id: 'b1', version: 2, approvedAt,
    cases: [
      { caseKey: 'ca1', group: 'co_ban', input: '1 2 3', expectedOutput: '6', constraintQuote: 'Cho 1 ≤ n ≤ 100', autoDroppedReason: null },
      { caseKey: 'ca2', group: 'bien', input: '4 5', expectedOutput: '9', constraintQuote: null, autoDroppedReason: 'đề không ràng buộc số phần tử' },
      { caseKey: 'ca3', group: 'bien', input: '7', expectedOutput: '49', constraintQuote: null, autoDroppedReason: null },
    ],
  },
  isLoading: false, isError: false, error: null,
});

beforeEach(() => {
  h.bundles = { data: [summary()], isLoading: false };
  h.detail = detail();
  h.drop = { mutate: vi.fn(), isPending: false, isError: false, error: null };
  h.approve.mockReset();
  h.pin.mockReset();
});

const renderList = (pinnedBundleId: string | null = null) =>
  render(<TestBundleList sessionId="s1" pinnedBundleId={pinnedBundleId} />);
const open = () => fireEvent.click(screen.getByRole('button', { name: 'Xem bộ ca' }));

describe('TestBundleList (UI spec §3.7, T-UI-18)', () => {
  it('expanding a bundle shows the five columns', () => {
    renderList();
    open();
    for (const name of ['Nhóm', 'Input', 'Output mong đợi', 'Câu trong đề mà ca này kiểm', 'Thao tác']) {
      expect(screen.getByRole('columnheader', { name })).toBeInTheDocument();
    }
  });

  it('shows the quoted constraint when there is one and "—" when there is not', () => {
    renderList();
    open();
    expect(screen.getByText('“Cho 1 ≤ n ≤ 100”')).toBeInTheDocument();
    const ca3 = screen.getByText('7', { selector: 'td.font-mono' }).closest('tr')!;
    expect(within(ca3).getByText('—')).toBeInTheDocument();
  });

  it('a case the system dropped is struck through with its reason, and has no drop button', () => {
    renderList();
    open();
    const row = screen.getByText(/Hệ thống đã bỏ ca này/).closest('tr')!;
    expect(row.className).toContain('line-through');
    expect(within(row).getByText(/đề không ràng buộc số phần tử/)).toBeInTheDocument();
    expect(within(row).queryByRole('button')).not.toBeInTheDocument();
  });

  it('an APPROVED bundle offers no "Bỏ ca này" anywhere — the server would answer 409', () => {
    h.bundles = { data: [summary({ approvedAt: '2026-09-29T08:00:00.000Z' })], isLoading: false };
    h.detail = detail('2026-09-29T08:00:00.000Z');
    renderList();
    open();
    expect(screen.queryAllByRole('button', { name: 'Bỏ ca này' })).toHaveLength(0);
  });

  it('clicking "Bỏ ca này" sends the bundle id and the case key — one request', () => {
    renderList();
    open();
    const buttons = screen.getAllByRole('button', { name: 'Bỏ ca này' });
    expect(buttons).toHaveLength(2); // ca1 and ca3; ca2 was dropped by the system
    fireEvent.click(buttons[0]);
    expect(h.drop.mutate).toHaveBeenCalledTimes(1);
    expect(h.drop.mutate).toHaveBeenCalledWith({ bundleId: 'b1', caseKey: 'ca1' });
  });

  it('shows the server refusal verbatim', () => {
    h.drop = {
      mutate: vi.fn(), isPending: false, isError: true,
      error: new Error('Gói test b1 đã được duyệt lúc 2026-09-29 — không bỏ ca được nữa.'),
    };
    renderList();
    expect(screen.getByRole('alert')).toHaveTextContent('Gói test b1 đã được duyệt lúc 2026-09-29 — không bỏ ca được nữa.');
  });

  it('always states the limit: matching each other is not the same as being right', () => {
    renderList();
    expect(screen.getByText(/khớp nhau chưa chắc là đúng/)).toBeInTheDocument();
  });

  it('labels a system-made bundle, and only that — not a teacher bundle, not one with no origin', () => {
    h.bundles = {
      data: [
        summary({ id: 'b1', origin: 'generated' }),
        summary({ id: 'b2', origin: 'teacher' }),
        summary({ id: 'b3', origin: undefined }),
      ],
      isLoading: false,
    };
    renderList();
    expect(screen.getAllByText('Thước do hệ thống sinh')).toHaveLength(1);
  });

  it('an unapproved bundle can be approved from the list', () => {
    renderList();
    fireEvent.click(screen.getByRole('button', { name: 'Duyệt' }));
    expect(h.approve).toHaveBeenCalledWith('b1');
  });
});
