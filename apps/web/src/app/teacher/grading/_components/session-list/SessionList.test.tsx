import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { session, summary } from '@/lib/session-list.fixtures';
import { SessionList } from './SessionList';

let search = '';
const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(search),
  useRouter: () => ({ replace }),
  usePathname: () => '/teacher/grading',
}));

const h = vi.hoisted(() => ({
  summaries: { data: undefined as unknown, isLoading: false, isError: false, error: null as Error | null },
}));
vi.mock('@/hooks/useGrading', () => ({ useGradingSessionSummaries: () => h.summaries }));

const sessions = [
  session({ id: 'a', name: 'Kiểm tra giữa kỳ', classId: 'c1', className: 'DHKTPM18ATT' }),
  session({ id: 'b', name: 'Thực hành đồ thị', classId: 'c2', className: 'DHKTPM19BTT', rubricId: null, examType: 'TK' }),
  session({ id: 'c', name: 'Kiểm tra cuối kỳ', classId: 'c1', className: 'DHKTPM18ATT', examType: 'CK' }),
  session({ id: 'none', name: 'Chưa thu bài', fullySubmittedCount: 0, partialCount: 0 }),
];

beforeEach(() => {
  search = '';
  replace.mockReset();
  sessionStorage.clear();
  h.summaries = {
    data: [summary('a', { flagged_for_review: 2, auto_approved: 5 }), summary('b'), summary('c', { finalized: 38 })],
    isLoading: false, isError: false, error: null,
  };
});

const renderList = (over: { loading?: boolean; error?: Error | null; sessions?: typeof sessions } = {}) =>
  render(<SessionList sessions={over.sessions ?? sessions} loading={over.loading ?? false} error={over.error ?? null} />);
// Chỉ liên kết TÊN phiên: liên kết hành động ở cuối hàng có aria-label bắt đầu bằng động từ ("Xem xét: …").
const names = () => screen.getAllByRole('link', { name: /^(Kiểm tra|Thực hành)/ });

describe('SessionList', () => {
  it('lists sessions that have collected work, most urgent first, and leaves out the rest', () => {
    renderList();
    expect(screen.queryByText('Chưa thu bài')).not.toBeInTheDocument();
    expect(names().map((l) => l.textContent)).toEqual(['Kiểm tra giữa kỳ', 'Thực hành đồ thị', 'Kiểm tra cuối kỳ']);
  });

  it('status tabs carry counts, and choosing one narrows the table and writes the URL', () => {
    renderList();
    expect(screen.getByRole('button', { name: /Cần bạn xem/ })).toHaveTextContent('1');
    fireEvent.click(screen.getByRole('button', { name: /Đã chốt/ }));
    expect(replace).toHaveBeenCalledWith('/teacher/grading?status=done', { scroll: false });
  });

  it('reads its state from the URL', () => {
    search = 'status=done';
    renderList();
    expect(names().map((l) => l.textContent)).toEqual(['Kiểm tra cuối kỳ']);
    expect(screen.getByRole('button', { name: /Đã chốt/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('a garbage URL still shows the list', () => {
    search = 'status=zzz&sort=x%3Ay&time=999&group=??';
    renderList();
    expect(names()).toHaveLength(3);
  });

  it('search is applied at once and reaches the URL after a pause', () => {
    vi.useFakeTimers();
    renderList();
    fireEvent.change(screen.getByRole('searchbox', { name: /Tìm phiên/ }), { target: { value: 'do thi' } });
    expect(names().map((l) => l.textContent)).toEqual(['Thực hành đồ thị']);
    expect(replace).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(replace).toHaveBeenCalledWith('/teacher/grading?q=do+thi', { scroll: false });
    vi.useRealTimers();
  });

  it('remembers the query so "Đổi phiên" can come back to it', () => {
    renderList();
    fireEvent.click(screen.getByRole('button', { name: /Đã chốt/ }));
    expect(sessionStorage.getItem('grading.list.query')).toBe('status=done');
  });

  it('nothing to grade → says so; loading → no empty message; error → the alert', () => {
    const { unmount } = renderList({ sessions: [] });
    expect(screen.getByText(/Chưa có phiên thi nào thu được bài/)).toBeInTheDocument();
    unmount();
    const loading = renderList({ sessions: [], loading: true });
    expect(screen.queryByText(/Chưa có phiên thi nào thu được bài/)).not.toBeInTheDocument();
    loading.unmount();
    renderList({ sessions: [], error: new Error('Mất kết nối') });
    expect(screen.getByRole('alert')).toHaveTextContent('Mất kết nối');
  });

  it('filters that match nothing show a way out, not a blank table', () => {
    search = 'q=khong-co-phien-nay';
    renderList();
    expect(screen.getByText(/Không có phiên nào khớp/)).toBeInTheDocument();
    // Hai nút cùng tên: một trên thanh lọc, một ở trạng thái rỗng — cả hai xoá mọi bộ lọc.
    fireEvent.click(screen.getAllByRole('button', { name: /Xoá bộ lọc/ })[0]);
    expect(replace).toHaveBeenCalledWith('/teacher/grading', { scroll: false });
  });

  it('summary failed: table still works, no tabs and no statuses, and it says why', () => {
    h.summaries = { data: undefined, isLoading: false, isError: true, error: new Error('Hết giờ') };
    renderList();
    expect(names()).toHaveLength(3);
    expect(screen.queryByRole('button', { name: /Cần bạn xem/ })).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/trạng thái chấm/);
    expect(screen.getByRole('alert')).toHaveTextContent('Hết giờ');
  });

  it('summary still loading: no tabs yet, table already usable', () => {
    h.summaries = { data: undefined, isLoading: true, isError: false, error: null };
    renderList();
    expect(names()).toHaveLength(3);
    expect(screen.queryByRole('button', { name: /Tất cả/ })).not.toBeInTheDocument();
  });

  it('grouping by class shows a header per class', () => {
    search = 'group=class';
    renderList();
    expect(screen.getByRole('button', { name: /DHKTPM18ATT/ })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: /DHKTPM19BTT/ })).toBeInTheDocument();
  });

  it('"/" focuses the search box unless you are already typing somewhere', () => {
    renderList();
    fireEvent.keyDown(document.body, { key: '/' });
    expect(screen.getByRole('searchbox', { name: /Tìm phiên/ })).toHaveFocus();
  });

  it('remembers the density choice', () => {
    renderList();
    fireEvent.click(screen.getByRole('button', { name: 'Gọn' }));
    expect(localStorage.getItem('grading.list.density')).toBe('compact');
    expect(screen.getByRole('table').parentElement).toHaveAttribute('data-density', 'compact');
  });

  it('selection: only rows that are still visible count (narrowing a filter drops the hidden ones)', () => {
    // `useSearchParams` được mock cố định, nên cho `replace` cập nhật nó rồi render lại — như Next làm.
    replace.mockImplementation((url: string) => {
      search = url.split('?')[1] ?? '';
    });
    const view = renderList();
    const boxes = screen.getAllByRole('checkbox', { name: /^Chọn phiên/ });
    fireEvent.click(boxes[0]);
    fireEvent.click(boxes[1]);
    expect(screen.getByText(/Đã chọn 2 phiên/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Đã chốt/ })); // status=done → chỉ còn phiên "c"
    view.rerender(<SessionList sessions={sessions} loading={false} error={null} />);
    expect(screen.queryByText(/Đã chọn/)).not.toBeInTheDocument();
  });
});

vi.mock('./BulkDialog', () => ({
  BulkDialog: (p: { request: { kind: string; rows: unknown[]; skipped: number } }) => (
    <div data-testid="bulk-dialog" data-kind={p.request.kind} data-rows={p.request.rows.length} data-skipped={p.request.skipped} />
  ),
}));

describe('SessionList — bulk bar', () => {
  const pick = (name: RegExp) => fireEvent.click(screen.getByRole('checkbox', { name }));

  it('offers "Bắt đầu chấm" for sessions that are not graded and have rubric + question, counted', () => {
    renderList();
    pick(/Chọn phiên Kiểm tra giữa kỳ/); // attention
    pick(/Chọn phiên Thực hành đồ thị/); // todo, no rubric
    const bar = within(screen.getByRole('region', { name: /Thao tác trên phiên đã chọn/ }));
    expect(bar.getByRole('button', { name: /Bắt đầu chấm/ })).toHaveAttribute('aria-disabled', 'true');
    expect(bar.getByRole('button', { name: /Gắn rubric/ })).toHaveTextContent('1');
  });

  it('opens the confirm dialog with the eligible rows and how many selected sessions were left out', () => {
    h.summaries = { data: [summary('a'), summary('b'), summary('c', { finalized: 38 })], isLoading: false, isError: false, error: null };
    renderList();
    pick(/Chọn phiên Kiểm tra giữa kỳ/); // todo, has rubric+question → eligible
    pick(/Chọn phiên Kiểm tra cuối kỳ/); // done → not eligible
    // Trong thanh: hàng "a" cũng có nút "Bắt đầu chấm" riêng.
    fireEvent.click(within(screen.getByRole('region', { name: /Thao tác trên phiên đã chọn/ })).getByRole('button', { name: /Bắt đầu chấm/ }));
    const dialog = screen.getByTestId('bulk-dialog');
    expect(dialog).toHaveAttribute('data-kind', 'start');
    expect(dialog).toHaveAttribute('data-rows', '1');
    expect(dialog).toHaveAttribute('data-skipped', '1');
  });

  it('there is no bulk finalize and no bulk export', () => {
    renderList();
    pick(/Chọn phiên Kiểm tra giữa kỳ/);
    expect(screen.queryByRole('button', { name: /Chốt điểm/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Xuất/ })).not.toBeInTheDocument();
  });

  it('while statuses are unknown there is no bulk bar at all', () => {
    h.summaries = { data: undefined, isLoading: true, isError: false, error: null };
    renderList();
    pick(/Chọn phiên Kiểm tra giữa kỳ/);
    expect(screen.queryByRole('button', { name: /Bắt đầu chấm/ })).not.toBeInTheDocument();
  });

  it('the row "Bắt đầu chấm" button opens the same dialog for that single session', () => {
    h.summaries = { data: [summary('a'), summary('b'), summary('c')], isLoading: false, isError: false, error: null };
    renderList();
    fireEvent.click(within(screen.getByRole('link', { name: 'Kiểm tra giữa kỳ' }).closest('tr') as HTMLElement).getByRole('button', { name: /Bắt đầu chấm/ }));
    expect(screen.getByTestId('bulk-dialog')).toHaveAttribute('data-rows', '1');
  });

  it('"Bỏ chọn" clears the selection', () => {
    renderList();
    pick(/Chọn phiên Kiểm tra giữa kỳ/);
    fireEvent.click(screen.getByRole('button', { name: /Bỏ chọn/ }));
    expect(screen.queryByText(/Đã chọn/)).not.toBeInTheDocument();
  });
});

describe('SessionList — review fixes', () => {
  it('I1: a status from the URL while the summary is still loading hides nothing', () => {
    search = 'status=attention';
    h.summaries = { data: undefined, isLoading: true, isError: false, error: null };
    renderList();
    expect(names()).toHaveLength(3);
    expect(screen.queryByText(/Không có phiên nào khớp/)).not.toBeInTheDocument();
  });

  it('I1: with the summary failed, an empty result does not point at a status tab that is not there', () => {
    search = 'status=attention&q=khong-co-phien-nay';
    h.summaries = { data: undefined, isLoading: false, isError: true, error: new Error('Hết giờ') };
    renderList();
    expect(screen.getByText(/Không có phiên nào khớp/)).toBeInTheDocument();
    expect(screen.queryByText(/“Tất cả”/)).not.toBeInTheDocument();
  });

  it('I4: rows inside a collapsed group are no longer part of the selection', () => {
    search = 'group=class';
    renderList();
    fireEvent.click(screen.getByRole('checkbox', { name: /Chọn cả nhóm DHKTPM18ATT/ }));
    expect(screen.getByText(/Đã chọn 2 phiên/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /DHKTPM18ATT/ })); // thu gọn nhóm
    expect(screen.queryByText(/Đã chọn/)).not.toBeInTheDocument();
  });
});
