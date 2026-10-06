import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const h = vi.hoisted(() => ({ update: vi.fn(), cancel: vi.fn() }));
vi.mock('@/lib/api/exam-session', async (orig) => ({
  ...(await orig<typeof import('@/lib/api/exam-session')>()),
  updateExamSession: h.update,
  cancelExamSession: h.cancel,
}));

import { useCancelExamSession, useUpdateExamSession } from './useExamSession';

function setup() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const keys = () => invalidate.mock.calls.map((call) => (call[0] as { queryKey: unknown[] }).queryKey);
  return { wrapper, keys };
}

// Mọi nơi đang hiện phiên này: danh sách (khoá gốc, nên mọi trang và bộ lọc), lịch tuần, chi tiết, và tổng quan bài thu.
const REFRESHED = [['exam-sessions'], ['exam-sessions-range'], ['exam-session', 's1'], ['submissions', 'overview']];

describe('useUpdateExamSession / useCancelExamSession', () => {
  beforeEach(() => {
    h.update.mockReset();
    h.cancel.mockReset();
  });

  it('sửa: gọi API với id và thân, rồi làm mới danh sách, lịch, chi tiết và tổng quan bài thu', async () => {
    h.update.mockResolvedValue({ id: 's1' });
    const { wrapper, keys } = setup();
    const { result } = renderHook(() => useUpdateExamSession(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ id: 's1', body: { name: 'Mới' } });
    });
    expect(h.update).toHaveBeenCalledWith('s1', { name: 'Mới' });
    expect(keys()).toEqual(expect.arrayContaining(REFRESHED));
  });

  it('huỷ: gọi API với id và lý do, rồi làm mới cùng bốn nơi (Review Focus 6: không để phiên cũ lại trong danh sách)', async () => {
    h.cancel.mockResolvedValue({ id: 's1', status: 'cancelled' });
    const { wrapper, keys } = setup();
    const { result } = renderHook(() => useCancelExamSession(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ id: 's1', reason: 'Nhầm phòng' });
    });
    expect(h.cancel).toHaveBeenCalledWith('s1', 'Nhầm phòng');
    expect(keys()).toEqual(expect.arrayContaining(REFRESHED));
  });

  it('thất bại thì KHÔNG làm mới gì (dữ liệu chưa đổi) và lỗi đi ra cho giao diện', async () => {
    h.cancel.mockRejectedValue({ message: 'Đã có sinh viên vào phòng' });
    const { wrapper, keys } = setup();
    const { result } = renderHook(() => useCancelExamSession(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ id: 's1' }).catch(() => undefined);
    });
    // `error` của mutation đến sau một nhịp gom thông báo của TanStack Query, không đồng bộ với lời gọi `mutateAsync`.
    await waitFor(() => expect(result.current.error).toMatchObject({ message: 'Đã có sinh viên vào phòng' }));
    expect(keys()).toEqual([]);
  });
});
