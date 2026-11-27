import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { RegradeButton, type RegradeScope } from './RegradeButton';

const fresh = () => ({ mutate: vi.fn(), reset: vi.fn(), isPending: false, isError: false, error: null as Error | null });
const h = vi.hoisted(() => ({
  one: null as unknown as ReturnType<typeof fresh>,
  many: null as unknown as ReturnType<typeof fresh>,
  forceAi: null as unknown as ReturnType<typeof fresh>,
  stuck: null as unknown as ReturnType<typeof fresh>,
}));
vi.mock('@/hooks/useRegrade', () => ({ useRegradeResult: () => h.one, useRegradeUngradable: () => h.many, useRegradeAiScored: () => h.forceAi }));
vi.mock('@/hooks/useGrading', () => ({ useRegradeStuck: () => h.stuck }));
const toastSpy = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast: toastSpy }));

const session = (over: Partial<Extract<RegradeScope, { kind: 'session' }>> = {}): RegradeScope => ({
  kind: 'session', sessionId: 's1', reason: null, count: 2, ...over,
});
const single: RegradeScope = { kind: 'result', sessionId: 's1', resultId: 'r1' };

beforeEach(() => {
  toastSpy.success.mockReset();
  toastSpy.error.mockReset();
  h.one = fresh();
  h.many = fresh();
  h.forceAi = fresh();
  h.stuck = fresh();
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
  it('the button keeps its own width - it is not stretched by its column wrapper', () => {
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
    h.many.error = new Error('Bài này đang được chấm - chưa cần chấm lại.');
    render(<RegradeButton scope={session()} label="Chấm lại" />);
    open('Chấm lại');
    expect(screen.getByRole('alert')).toHaveTextContent('Bài này đang được chấm - chưa cần chấm lại.');
  });

  it('after success, says how many were re-queued and groups the skipped ones by their reason', () => {
    h.many.mutate = vi.fn((_reason: unknown, options: { onSuccess: (o: unknown) => void }) =>
      options.onSuccess({
        requeued: 2,
        skipped: [
          { resultId: 'a', reason: 'Bài đã đi tiếp - có lượt khác vừa xử lý nó.' },
          { resultId: 'b', reason: 'Bài đã đi tiếp - có lượt khác vừa xử lý nó.' },
        ],
      }),
    );
    render(<RegradeButton scope={session()} label="Chấm lại" />);
    open('Chấm lại');
    confirm();

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Đã xếp lại 2 bài');
    expect(status).toHaveTextContent('2 bài bỏ qua - Bài đã đi tiếp - có lượt khác vừa xử lý nó.');
  });

  // Browser pass (G3): the refreshed list no longer counts the re-queued results (the UPDATE clears their class), so the
  // header / band / panel button - and the inline notice it owns - unmounts a few hundred ms after confirming. The
  // outcome, and above all the "bỏ qua" lines, must survive that: a toast does.
  it('also raises a toast on success, because the inline notice dies with the unmounting button', () => {
    h.many.mutate = vi.fn((_reason: unknown, options: { onSuccess: (o: unknown) => void }) =>
      options.onSuccess({
        requeued: 2,
        skipped: [{ resultId: 'a', reason: 'Bài đã đi tiếp - có lượt khác vừa xử lý nó.' }],
      }),
    );
    render(<RegradeButton scope={session()} label="Chấm lại" />);
    open('Chấm lại');
    confirm();
    expect(toastSpy.success).toHaveBeenCalledTimes(1);
    expect(toastSpy.success).toHaveBeenCalledWith('Đã xếp lại 2 bài', {
      description: '1 bài bỏ qua - Bài đã đi tiếp - có lượt khác vừa xử lý nó.',
    });
  });

  // Browser pass (G3, S4): a 409 "đang được chấm" means the result moved on, so the refetch that follows swaps the view and
  // unmounts the button together with the dialog that held the destructive Alert - the verbatim refusal was never readable.
  it('also raises the server refusal as a toast, because the dialog can unmount before it is read', () => {
    h.one.mutate = vi.fn((_id: unknown, options: { onError: (e: Error) => void }) =>
      options.onError(new Error('Bài này đang được chấm - chưa cần chấm lại.')),
    );
    render(<RegradeButton scope={single} label="Chấm lại bài này" />);
    open('Chấm lại bài này');
    confirm();
    expect(toastSpy.error).toHaveBeenCalledWith('Bài này đang được chấm - chưa cần chấm lại.');
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

  describe('bài bị kẹt chấm lại cùng một lần bấm', () => {
    it('không có bài kẹt thì không đụng tới đường chấm lại bài kẹt', () => {
      render(<RegradeButton scope={session()} label="Chấm lại" />);
      open('Chấm lại');
      confirm();
      expect(h.stuck.mutate).not.toHaveBeenCalled();
    });

    it('chỉ có bài kẹt: hộp xác nhận nói số bài kẹt, chỉ gọi đường bài kẹt', () => {
      h.stuck.mutate = vi.fn((_v: unknown, options: { onSuccess: (o: unknown) => void }) =>
        options.onSuccess({ stuck: 3, requeued: 3 }),
      );
      render(<RegradeButton scope={session({ count: 0, stuck: 3 })} label="Chấm lại 3 bài bị kẹt" />);
      open('Chấm lại 3 bài bị kẹt');
      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveTextContent('Chấm lại 3 bài?');
      expect(dialog).toHaveTextContent('3 bài đang bị kẹt');
      confirm();
      expect(h.many.mutate).not.toHaveBeenCalled();
      expect(h.stuck.mutate).toHaveBeenCalledTimes(1);
      expect(toastSpy.success).toHaveBeenCalledWith('Đã xếp lại 3 bài', { description: undefined });
    });

    it('có cả hai: chấm lại bài lỗi hệ thống trước, rồi bài kẹt, gộp thành một thông báo', () => {
      h.many.mutate = vi.fn((_r: unknown, options: { onSuccess: (o: unknown) => void }) =>
        options.onSuccess({ requeued: 2, skipped: [] }),
      );
      h.stuck.mutate = vi.fn((_v: unknown, options: { onSuccess: (o: unknown) => void }) =>
        options.onSuccess({ stuck: 3, requeued: 3 }),
      );
      render(<RegradeButton scope={session({ count: 2, stuck: 3 })} label="Chấm lại 5 bài lỗi hoặc bị kẹt" />);
      open('Chấm lại 5 bài lỗi hoặc bị kẹt');
      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveTextContent('Chấm lại 5 bài?');
      expect(dialog).toHaveTextContent('2 bài không chấm được do lỗi phía hệ thống và 3 bài đang bị kẹt');
      confirm();
      expect(h.many.mutate).toHaveBeenCalledWith(null, expect.any(Object));
      expect(h.stuck.mutate).toHaveBeenCalledTimes(1);
      expect(toastSpy.success).toHaveBeenCalledTimes(1);
      expect(toastSpy.success).toHaveBeenCalledWith('Đã xếp lại 5 bài', { description: undefined });
    });

    it('bài lỗi hệ thống đã xếp lại mà bài kẹt thất bại: báo phần đã làm được và nêu lỗi của phần còn lại', () => {
      h.many.mutate = vi.fn((_r: unknown, options: { onSuccess: (o: unknown) => void }) =>
        options.onSuccess({ requeued: 2, skipped: [] }),
      );
      h.stuck.mutate = vi.fn((_v: unknown, options: { onError: (e: Error) => void }) =>
        options.onError(new Error('Hàng đợi tạm dừng')),
      );
      render(<RegradeButton scope={session({ count: 2, stuck: 3 })} label="Chấm lại 5 bài lỗi hoặc bị kẹt" />);
      open('Chấm lại 5 bài lỗi hoặc bị kẹt');
      confirm();
      expect(toastSpy.success).toHaveBeenCalledWith('Đã xếp lại 2 bài', { description: undefined });
      expect(toastSpy.error).toHaveBeenCalledWith('Hàng đợi tạm dừng');
    });
  });
});
