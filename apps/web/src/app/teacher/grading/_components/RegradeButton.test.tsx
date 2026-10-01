import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { RegradeButton, type RegradeScope } from './RegradeButton';

const fresh = () => ({ mutate: vi.fn(), reset: vi.fn(), isPending: false, isError: false, error: null as Error | null });
const h = vi.hoisted(() => ({ one: null as unknown as ReturnType<typeof fresh>, many: null as unknown as ReturnType<typeof fresh> }));
vi.mock('@/hooks/useRegrade', () => ({ useRegradeResult: () => h.one, useRegradeUngradable: () => h.many }));
const toastSpy = vi.hoisted(() => ({ success: vi.fn() }));
vi.mock('sonner', () => ({ toast: toastSpy }));

const session = (over: Partial<Extract<RegradeScope, { kind: 'session' }>> = {}): RegradeScope => ({
  kind: 'session', sessionId: 's1', reason: null, count: 2, ...over,
});
const single: RegradeScope = { kind: 'result', sessionId: 's1', resultId: 'r1' };

beforeEach(() => {
  toastSpy.success.mockReset();
  h.one = fresh();
  h.many = fresh();
});

const open = (label: string) => fireEvent.click(screen.getByRole('button', { name: label }));
const confirm = () => fireEvent.click(screen.getByRole('button', { name: 'Xác nhận chấm lại' }));

describe('RegradeButton (G3 §4.4, D10)', () => {
  it('opening the confirmation sends NOTHING, and states the count, the cost and that closing the page does not stop it', () => {
    render(<RegradeButton scope={session()} label="Chấm lại 2 bài lỗi hệ thống" />);
    open('Chấm lại 2 bài lỗi hệ thống');

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Chấm lại 2 bài?');
    expect(dialog).toHaveTextContent('Mỗi bài là một lượt gọi mô hình có tính phí');
    expect(dialog).toHaveTextContent('Đóng trang không dừng việc chấm');
    expect(h.many.mutate).not.toHaveBeenCalled();
    expect(h.one.mutate).not.toHaveBeenCalled();
  });

  // Browser pass (G3, screenshot s2-01): inside the "Dịch vụ AI lỗi" alert the button was stretched to the full width of
  // the band, because its wrapper is a flex column whose default alignment is stretch.
  it('the button keeps its own width — it is not stretched by its column wrapper', () => {
    render(<RegradeButton scope={session()} label="Chấm lại" />);
    expect(screen.getByRole('button', { name: 'Chấm lại' }).parentElement).toHaveClass('items-start');
  });

  it('a session scope sends the reason (null = every system-class result) only after confirming', () => {
    render(<RegradeButton scope={session({ reason: null })} label="Chấm lại" />);
    open('Chấm lại');
    confirm();
    expect(h.many.mutate).toHaveBeenCalledTimes(1);
    expect(h.many.mutate).toHaveBeenCalledWith(null, expect.objectContaining({ onSuccess: expect.any(Function) }));
  });

  it('a same-reason scope names the reason in the confirmation and sends it verbatim', () => {
    render(<RegradeButton scope={session({ reason: 'Dịch vụ AI không phản hồi.', count: 3 })} label="Chấm lại 3 bài này" />);
    open('Chấm lại 3 bài này');
    expect(screen.getByRole('dialog')).toHaveTextContent('cùng lý do: “Dịch vụ AI không phản hồi.”');
    confirm();
    expect(h.many.mutate).toHaveBeenCalledWith('Dịch vụ AI không phản hồi.', expect.any(Object));
  });

  it('a result scope regrades that one result', () => {
    render(<RegradeButton scope={single} label="Chấm lại bài này" />);
    open('Chấm lại bài này');
    expect(screen.getByRole('dialog')).toHaveTextContent('Chấm lại bài này?');
    confirm();
    expect(h.one.mutate).toHaveBeenCalledWith('r1', expect.any(Object));
    expect(h.many.mutate).not.toHaveBeenCalled();
  });

  it('cancelling closes the confirmation and sends nothing', () => {
    render(<RegradeButton scope={session()} label="Chấm lại" />);
    open('Chấm lại');
    fireEvent.click(screen.getByRole('button', { name: 'Huỷ' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(h.many.mutate).not.toHaveBeenCalled();
  });

  it('shows the server refusal verbatim inside the confirmation', () => {
    h.many.isError = true;
    h.many.error = new Error('Bài này đang được chấm — chưa cần chấm lại.');
    render(<RegradeButton scope={session()} label="Chấm lại" />);
    open('Chấm lại');
    expect(screen.getByRole('alert')).toHaveTextContent('Bài này đang được chấm — chưa cần chấm lại.');
  });

  it('after success, says how many were re-queued and groups the skipped ones by their reason', () => {
    h.many.mutate = vi.fn((_reason: unknown, options: { onSuccess: (o: unknown) => void }) =>
      options.onSuccess({
        requeued: 2,
        skipped: [
          { resultId: 'a', reason: 'Bài đã đi tiếp — có lượt khác vừa xử lý nó.' },
          { resultId: 'b', reason: 'Bài đã đi tiếp — có lượt khác vừa xử lý nó.' },
        ],
      }),
    );
    render(<RegradeButton scope={session()} label="Chấm lại" />);
    open('Chấm lại');
    confirm();

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Đã xếp lại 2 bài');
    expect(status).toHaveTextContent('2 bài bỏ qua — Bài đã đi tiếp — có lượt khác vừa xử lý nó.');
  });

  // Browser pass (G3): the refreshed list no longer counts the re-queued results (the UPDATE clears their class), so the
  // header / band / panel button — and the inline notice it owns — unmounts a few hundred ms after confirming. The
  // outcome, and above all the "bỏ qua" lines, must survive that: a toast does.
  it('also raises a toast on success, because the inline notice dies with the unmounting button', () => {
    h.many.mutate = vi.fn((_reason: unknown, options: { onSuccess: (o: unknown) => void }) =>
      options.onSuccess({
        requeued: 2,
        skipped: [{ resultId: 'a', reason: 'Bài đã đi tiếp — có lượt khác vừa xử lý nó.' }],
      }),
    );
    render(<RegradeButton scope={session()} label="Chấm lại" />);
    open('Chấm lại');
    confirm();
    expect(toastSpy.success).toHaveBeenCalledTimes(1);
    expect(toastSpy.success).toHaveBeenCalledWith('Đã xếp lại 2 bài', {
      description: '1 bài bỏ qua — Bài đã đi tiếp — có lượt khác vừa xử lý nó.',
    });
  });

  it('the toast has no description when nothing was skipped', () => {
    h.one.mutate = vi.fn((_id: unknown, options: { onSuccess: (o: unknown) => void }) =>
      options.onSuccess({ requeued: 1, skipped: [] }),
    );
    render(<RegradeButton scope={single} label="Chấm lại bài này" />);
    open('Chấm lại bài này');
    confirm();
    expect(toastSpy.success).toHaveBeenCalledWith('Đã xếp lại 1 bài', { description: undefined });
  });
});
