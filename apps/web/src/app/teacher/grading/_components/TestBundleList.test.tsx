import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { RunsState } from '@/lib/bundle-runs';
import { TestBundleList } from './TestBundleList';

const h = vi.hoisted(() => ({
  bundles: { data: [] as unknown[], isLoading: false },
  detail: { data: undefined as unknown, isLoading: false, isError: false, error: null as Error | null },
  drop: { mutate: vi.fn(), isPending: false, isError: false, error: null as Error | null },
  approve: { mutate: vi.fn(), isPending: false, isError: false, error: null as Error | null },
  pin: { mutate: vi.fn(), isPending: false, isError: false, error: null as Error | null },
}));

vi.mock('@/hooks/useTestBundle', () => ({
  useTestBundles: () => h.bundles,
  useApproveTestBundle: () => h.approve,
  usePinTestBundle: () => h.pin,
}));
vi.mock('@/hooks/useTestBundleDetail', () => ({
  useTestBundleDetail: () => h.detail,
  useDropTestBundleCase: () => h.drop,
}));
// Hộp thoại có test riêng; ở đây chỉ cần biết danh sách mở nó và nhận `onConfirm`.
vi.mock('./ApproveBundleDialog', () => ({
  ApproveBundleDialog: ({ open, bundle, onConfirm }: { open: boolean; bundle: { version: number }; onConfirm: () => void }) =>
    open ? (
      <div role="dialog">
        hộp duyệt phiên bản {bundle.version}
        <button type="button" onClick={onConfirm}>
          xác nhận trong hộp
        </button>
      </div>
    ) : null,
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

const runs = (over: { state?: RunsState; pendingKey?: string | null } = {}) => ({
  runs: over.state ?? {},
  run: vi.fn(),
  pendingKey: over.pendingKey ?? null,
});

beforeEach(() => {
  h.bundles = { data: [summary()], isLoading: false };
  h.detail = detail();
  h.drop = { mutate: vi.fn(), isPending: false, isError: false, error: null };
  h.approve = { mutate: vi.fn(), isPending: false, isError: false, error: null };
  h.pin = { mutate: vi.fn(), isPending: false, isError: false, error: null };
});

function renderList(over: { pinnedBundleId?: string | null; runs?: ReturnType<typeof runs>; onNewVersion?: (id: string) => void; generating?: boolean } = {}) {
  const r = over.runs ?? runs();
  const onNewVersion = over.onNewVersion ?? vi.fn();
  render(
    <TestBundleList sessionId="s1" pinnedBundleId={over.pinnedBundleId ?? null} runs={r} onNewVersion={onNewVersion} generating={over.generating ?? false} />,
  );
  return { runs: r, onNewVersion };
}
const open = () => fireEvent.click(screen.getByRole('button', { name: 'Xem bộ ca' }));

describe('TestBundleList (UI spec §3.7, T-UI-18)', () => {
  it('expanding a bundle shows the six columns, including the run result', () => {
    renderList();
    open();
    for (const name of ['Nhóm', 'Input', 'Output mong đợi', 'Câu trong đề mà ca này kiểm', 'Chạy thử', 'Thao tác']) {
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

  it('a case the system dropped is struck through with its reason, and has no drop or run button', () => {
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
});

describe('TestBundleList — duyệt và ghim gộp', () => {
  it('a bundle that is not approved offers ONE "Duyệt và ghim" button that opens the review dialog, no bare "Duyệt"', () => {
    renderList();
    expect(screen.queryByRole('button', { name: 'Duyệt' })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Duyệt và ghim' }));

    expect(screen.getByRole('dialog')).toHaveTextContent('phiên bản 2');
    expect(h.approve.mutate).not.toHaveBeenCalled();
  });

  it('confirming in the dialog approves, and only after that succeeds pins the same bundle', () => {
    renderList();
    fireEvent.click(screen.getByRole('button', { name: 'Duyệt và ghim' }));
    fireEvent.click(screen.getByRole('button', { name: 'xác nhận trong hộp' }));

    expect(h.approve.mutate).toHaveBeenCalledTimes(1);
    expect(h.approve.mutate.mock.calls[0][0]).toBe('b1');
    expect(h.pin.mutate).not.toHaveBeenCalled();

    h.approve.mutate.mock.calls[0][1].onSuccess();
    expect(h.pin.mutate).toHaveBeenCalledWith('b1');
  });

  it('an approved bundle that is not pinned keeps a plain "Ghim"; a pinned one shows "Đang dùng"', () => {
    h.bundles = { data: [summary({ approvedAt: '2026-09-27T00:00:00.000Z' })], isLoading: false };
    const { unmount } = render(<TestBundleList sessionId="s1" pinnedBundleId={null} runs={runs()} onNewVersion={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ghim' }));
    expect(h.pin.mutate).toHaveBeenCalledWith('b1');
    expect(screen.queryByRole('button', { name: 'Duyệt và ghim' })).not.toBeInTheDocument();
    unmount();

    render(<TestBundleList sessionId="s1" pinnedBundleId="b1" runs={runs()} onNewVersion={vi.fn()} />);
    expect(screen.getByText('Đang dùng')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ghim' })).not.toBeInTheDocument();
  });

  it('shows the server refusal of approve or pin verbatim', () => {
    h.approve = { ...h.approve, isError: true, error: new Error('Gói test b1 đã được duyệt.') };
    renderList();
    expect(screen.getByRole('alert')).toHaveTextContent('Gói test b1 đã được duyệt.');
  });
});

describe('TestBundleList — chạy thử (G2b-R)', () => {
  it('"Chạy thử tất cả" chạy cả gói đúng một lần, không cần mở bảng ca', () => {
    const { runs: r } = renderList();
    fireEvent.click(screen.getByRole('button', { name: 'Chạy thử tất cả' }));
    expect(r.run).toHaveBeenCalledTimes(1);
    expect(r.run).toHaveBeenCalledWith('b1');
  });

  it('"Chạy" ở một dòng chạy đúng ca đó; ca hệ thống đã bỏ không có nút', () => {
    const { runs: r } = renderList();
    open();
    expect(screen.queryByRole('button', { name: 'Chạy thử ca ca2' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Chạy thử ca ca3' }));
    expect(r.run).toHaveBeenCalledWith('b1', 'ca3');
  });

  it('chưa chạy thì cột "Chạy thử" ghi "Chưa chạy"', () => {
    renderList();
    open();
    const ca1 = screen.getByText('1 2 3', { selector: 'td.font-mono' }).closest('tr')!;
    expect(within(ca1).getByText('Chưa chạy')).toBeInTheDocument();
  });

  it('sau khi chạy: ca khớp ghi "Khớp", ca lệch ghi "Lệch" kèm chỗ lệch, và tóm tắt đếm đúng', () => {
    const state: RunsState = {
      b1: {
        status: 'fail',
        compileLog: null,
        cases: {
          ca1: { name: 'ca1', status: 'pass', ms: 3, diff: null },
          ca3: { name: 'ca3', status: 'fail', ms: 4, diff: 'dòng 1: mong đợi 49, nhận 7' },
        },
      },
    };
    renderList({ runs: runs({ state }) });
    expect(screen.getByText('1 khớp, 1 lệch')).toBeInTheDocument();
    open();
    const ca1 = screen.getByText('1 2 3', { selector: 'td.font-mono' }).closest('tr')!;
    const ca3 = screen.getByText('7', { selector: 'td.font-mono' }).closest('tr')!;
    expect(within(ca1).getByText('Khớp')).toBeInTheDocument();
    expect(within(ca3).getByText('Lệch')).toBeInTheDocument();
    expect(within(ca3).getByText('dòng 1: mong đợi 49, nhận 7')).toBeInTheDocument();
  });

  it('biên dịch hỏng: nói thẳng và hiện log, không có đếm khớp/lệch', () => {
    const state: RunsState = { b1: { status: 'compile_error', cases: {}, compileLog: 'main.cpp:1: error: x' } };
    renderList({ runs: runs({ state }) });
    expect(screen.getByText(/không biên dịch được/i)).toBeInTheDocument();
    expect(screen.getByText('main.cpp:1: error: x')).toBeInTheDocument();
    expect(screen.queryByText(/khớp,/)).not.toBeInTheDocument();
  });

  it('đang chạy: mọi nút chạy khoá (một lượt tại một thời điểm); đúng nút đang chạy đổi chữ', () => {
    renderList({ runs: runs({ pendingKey: 'b1:ca3' }) });
    open();
    expect(screen.getByRole('button', { name: 'Chạy thử tất cả' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Chạy thử ca ca1' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Chạy thử ca ca3' })).toHaveTextContent('Đang chạy…');
    expect(screen.getByRole('button', { name: 'Chạy thử ca ca1' })).toHaveTextContent('Chạy');
  });

  // Đang SINH (không phải chạy thử): các nút chạy cũng phải khoá từ đầu, không chờ máy chủ trả 409.
  it('đang sinh gói: mọi nút chạy thử (cả gói lẫn từng ca) khoá', () => {
    renderList({ generating: true });
    open();
    expect(screen.getByRole('button', { name: 'Chạy thử tất cả' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Chạy thử ca ca1' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Chạy thử ca ca3' })).toBeDisabled();
  });

  // Lượt bị cắt vì hết ngân sách trả HTTP 200 với status aborted và chỉ những ca đã kịp chạy. Không được báo như một lượt đầy đủ.
  it('lượt bị cắt (aborted) không báo "khớp, 0 lệch" như cả gói; nói rõ bao nhiêu ca đã chạy trên tổng', () => {
    const state = {
      b1: {
        status: 'aborted' as const,
        compileLog: null,
        cases: { ca1: { name: 'ca1', status: 'pass', ms: 3, diff: null } },
      },
    };
    renderList({ runs: runs({ state }) });
    expect(screen.getByText(/Chạy chưa hết/)).toHaveTextContent('1 trên 2 ca đã chạy');
    expect(screen.queryByText(/khớp, 0 lệch/)).not.toBeInTheDocument();
  });

  // Lượt bị cắt nhưng sau đó mọi ca đã được chạy lẻ đủ: không còn gì "chưa kết luận", nên không được giữ nhãn "chưa hết".
  it('lượt aborted nhưng mọi ca đã có kết quả (đủ N/N) → không còn nhãn "Chạy chưa hết"', () => {
    const state = {
      b1: {
        status: 'aborted' as const,
        compileLog: null,
        cases: {
          ca1: { name: 'ca1', status: 'pass', ms: 3, diff: null },
          ca2: { name: 'ca2', status: 'pass', ms: 3, diff: null },
        },
      },
    };
    renderList({ runs: runs({ state }) });
    expect(screen.queryByText(/Chạy chưa hết/)).not.toBeInTheDocument();
    expect(screen.getByText('2 khớp, 0 lệch')).toBeInTheDocument();
  });

  // Chạy MỘT ca lẻ: kết quả chỉ nói về ca đó. Dòng đếm phải nói rõ đã chạy bao nhiêu trên tổng, không để một con số trần.
  it('chạy lẻ một ca → dòng đếm nói rõ "trên N ca", không phải con số trần như cả gói', () => {
    const state = {
      b1: {
        status: null,
        compileLog: null,
        cases: { ca1: { name: 'ca1', status: 'pass', ms: 3, diff: null } },
      },
    };
    renderList({ runs: runs({ state }) });
    expect(screen.getByText('1 khớp, 0 lệch — 1 trên 2 ca đã chạy')).toBeInTheDocument();
  });

  it('kết quả của phiên bản này không hiện ở phiên bản khác', () => {
    h.bundles = { data: [summary({ id: 'b1', version: 1 }), summary({ id: 'b2', version: 2 })], isLoading: false };
    const state: RunsState = { b2: { status: 'pass', cases: { ca1: { name: 'ca1', status: 'pass', ms: 1, diff: null } }, compileLog: null } };
    renderList({ runs: runs({ state }) });
    expect(screen.getAllByText(/khớp,/)).toHaveLength(1);
  });
});

describe('TestBundleList — tạo phiên bản mới từ gói này', () => {
  it('mỗi phiên bản có nút "Tạo phiên bản mới từ gói này" gọi onNewVersion với đúng gói', () => {
    const { onNewVersion } = renderList();
    fireEvent.click(screen.getByRole('button', { name: 'Tạo phiên bản mới từ gói này' }));
    expect(onNewVersion).toHaveBeenCalledWith('b1');
  });
});
