import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { rowsOf, session, summary } from '@/lib/session-list.fixtures';
import { BulkDialog, type BulkRequest } from './BulkDialog';

const h = vi.hoisted(() => ({
  startGrading: vi.fn(),
  setSessionRubric: vi.fn(),
  rubrics: { data: [] as unknown[], isLoading: false },
}));
vi.mock('@/lib/api/grading', async (orig) => ({ ...(await orig<typeof import('@/lib/api/grading')>()), startGrading: h.startGrading, setSessionRubric: h.setSessionRubric }));
vi.mock('@/hooks/useGrading', async (orig) => ({ ...(await orig<typeof import('@/hooks/useGrading')>()), useRubrics: () => h.rubrics }));

const rows = rowsOf(
  [
    session({ id: 'a', name: 'Phiên A', className: 'L1', fullySubmittedCount: 30 }),
    session({ id: 'b', name: 'Phiên B', className: 'L2', fullySubmittedCount: 41, partialCount: 1 }),
    session({ id: 'c', name: 'Phiên C', className: 'L3', fullySubmittedCount: 5 }),
  ],
  [summary('a'), summary('b'), summary('c')],
);

function open(request: BulkRequest) {
  const onClose = vi.fn();
  const onFinished = vi.fn();
  const client = new QueryClient();
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  render(
    <QueryClientProvider client={client}>
      <BulkDialog request={request} onClose={onClose} onFinished={onFinished} />
    </QueryClientProvider>,
  );
  return { onClose, onFinished, invalidate };
}

beforeEach(() => {
  h.startGrading.mockReset().mockResolvedValue({ queued: 1 });
  h.setSessionRubric.mockReset().mockResolvedValue(undefined);
  h.rubrics = { data: [{ id: 'r3', name: 'CTDL&GT', version: 3, isActive: true }, { id: 'r2', name: 'CTDL&GT', version: 2, isActive: true }, { id: 'old', name: 'Cũ', version: 1, isActive: false }], isLoading: false };
});

describe('BulkDialog — start grading', () => {
  const request = (skipped = 0): BulkRequest => ({ kind: 'start', rows, skipped });

  it('lists the sessions and the total number of bài before doing anything', () => {
    open(request());
    const dialog = screen.getByRole('dialog', { name: /Bắt đầu chấm 3 phiên/ });
    expect(within(dialog).getByText(/77 bài/)).toBeInTheDocument(); // 30 + 42 + 5
    expect(within(dialog).getByText('Phiên B')).toBeInTheDocument();
    expect(h.startGrading).not.toHaveBeenCalled();
  });

  it('is honest that only rubric and question were checked, and that the server decides', () => {
    open(request());
    expect(screen.getByText(/chỉ kiểm rubric và đề bài/i)).toBeInTheDocument();
    expect(screen.getByText(/máy chủ/i)).toBeInTheDocument();
  });

  it('mentions sessions that were left out of the selection because they are not eligible', () => {
    open(request(2));
    expect(screen.getByText(/2 phiên đã chọn không đủ điều kiện/)).toBeInTheDocument();
  });

  it('confirm starts each session, one at a time, in order', async () => {
    open(request());
    fireEvent.click(screen.getByRole('button', { name: /Bắt đầu chấm 3 phiên/ }));
    await waitFor(() => expect(h.startGrading).toHaveBeenCalledTimes(3));
    expect(h.startGrading.mock.calls.map((c) => c[0])).toEqual(['a', 'b', 'c']);
  });

  it('a session the server refuses is reported with the server\'s words; the others still ran', async () => {
    h.startGrading.mockImplementation(async (id: string) => {
      if (id === 'b') throw new Error('Phiên có bài code nhưng chưa ghim gói test.');
      return { queued: 1 };
    });
    open(request());
    fireEvent.click(screen.getByRole('button', { name: /Bắt đầu chấm 3 phiên/ }));
    await screen.findByText(/Đã bắt đầu 2 phiên, 1 phiên bị từ chối/);
    const failed = screen.getByText('Phiên B').closest('li') as HTMLElement;
    expect(within(failed).getByText(/chưa ghim gói test/)).toBeInTheDocument();
    expect(h.startGrading).toHaveBeenCalledTimes(3);
  });

  it('refreshes the summary and the overview afterwards, and hands control back when closed', async () => {
    const { onFinished, invalidate } = open(request());
    fireEvent.click(screen.getByRole('button', { name: /Bắt đầu chấm 3 phiên/ }));
    await screen.findByText(/Đã bắt đầu 3 phiên/);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['grading', 'sessions-summary'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['submissions', 'overview'] });
    // Hộp thoại có sẵn nút X cũng tên "Đóng" (chữ ẩn trong span); nút ở chân hộp có chữ trực tiếp.
    fireEvent.click(screen.getByText('Đóng', { selector: 'button' }));
    expect(onFinished).toHaveBeenCalled();
  });

  it('cancel before confirming sends nothing', () => {
    const { onClose } = open(request());
    fireEvent.click(screen.getByRole('button', { name: 'Huỷ' }));
    expect(onClose).toHaveBeenCalled();
    expect(h.startGrading).not.toHaveBeenCalled();
  });
});

describe('BulkDialog — assign rubric', () => {
  const request = (): BulkRequest => ({ kind: 'rubric', rows: rows.slice(0, 2), skipped: 0 });

  it('offers only active rubrics and applies the chosen one to each session', async () => {
    open(request());
    const select = screen.getByRole('combobox', { name: /Rubric/ });
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(['CTDL&GT · v2', 'CTDL&GT · v3']);
    fireEvent.change(select, { target: { value: 'r3' } });
    fireEvent.click(screen.getByRole('button', { name: /Gắn cho 2 phiên/ }));
    await waitFor(() => expect(h.setSessionRubric).toHaveBeenCalledTimes(2));
    expect(h.setSessionRubric.mock.calls).toEqual([['a', 'r3'], ['b', 'r3']]);
  });

  it('says when the teacher has no rubric to choose, and the confirm button stays off', () => {
    h.rubrics = { data: [], isLoading: false };
    open(request());
    expect(screen.getByText(/Chưa có rubric nào/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Gắn cho 2 phiên/ })).toBeDisabled();
  });

  it('reports a 409 (a session already has results) per session', async () => {
    h.setSessionRubric.mockImplementation(async (id: string) => {
      if (id === 'a') throw new Error('Phiên đã có kết quả chấm, không đổi được rubric.');
    });
    open(request());
    fireEvent.click(screen.getByRole('button', { name: /Gắn cho 2 phiên/ }));
    await screen.findByText(/1 phiên bị từ chối/);
    expect(within(screen.getByText('Phiên A').closest('li') as HTMLElement).getByText(/không đổi được rubric/)).toBeInTheDocument();
  });
});

describe('BulkDialog — review fixes', () => {
  it('I2: the result list tells same-named sessions apart by class', async () => {
    const twins = rowsOf(
      [
        session({ id: 'x', name: 'Kiểm tra giữa kỳ', className: 'LỚP-A' }),
        session({ id: 'y', name: 'Kiểm tra giữa kỳ', className: 'LỚP-B' }),
      ],
      [summary('x'), summary('y')],
    );
    h.startGrading.mockImplementation(async (id: string) => {
      if (id === 'y') throw new Error('Thiếu gói test.');
      return { queued: 1 };
    });
    open({ kind: 'start', rows: twins, skipped: 0 });
    fireEvent.click(screen.getByRole('button', { name: /Bắt đầu chấm 2 phiên/ }));
    await screen.findByText(/1 phiên bị từ chối/);
    const failed = screen.getByText('Thiếu gói test.').closest('li') as HTMLElement;
    expect(within(failed).getByText(/LỚP-B/)).toBeInTheDocument();
    expect(within(failed).queryByText(/LỚP-A/)).not.toBeInTheDocument();
  });

  it('I3: a start that queued nothing is not reported as started', async () => {
    h.startGrading.mockResolvedValue({ rubricId: 'r', rubricVersion: 1, queued: 0, alreadyGraded: 0 });
    open({ kind: 'start', rows: rows.slice(0, 1), skipped: 0 });
    fireEvent.click(screen.getByRole('button', { name: /Bắt đầu chấm 1 phiên/ }));
    await screen.findByText(/1 phiên bị từ chối/);
    expect(screen.getByText(/Không có bài nào được xếp hàng chấm/)).toBeInTheDocument();
    expect(screen.queryByText(/Đã bắt đầu 1 phiên/)).not.toBeInTheDocument();
  });
});
