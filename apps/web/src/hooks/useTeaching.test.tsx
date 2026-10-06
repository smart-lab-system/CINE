import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const list = vi.fn();
vi.mock('@/lib/api/teaching', () => ({ listTeachingClasses: (...a: unknown[]) => list(...a) }));

import * as hooks from './useTeaching';
import { useTeachingClasses } from './useTeaching';

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useTeachingClasses', () => {
  beforeEach(() => list.mockReset().mockResolvedValue([]));

  it('gọi không đối số vẫn chạy (trang phòng chờ, danh sách phiên, form tạo phiên)', async () => {
    renderHook(() => useTeachingClasses(), { wrapper: wrapper() });
    await waitFor(() => expect(list).toHaveBeenCalledWith({}));
  });

  it('bộ lọc nằm trong khoá: đổi bộ lọc là một truy vấn mới, dưới gốc `classes` để mọi lần ghi lớp làm mới nó', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const w = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const { rerender } = renderHook(({ filters }) => useTeachingClasses(filters), {
      wrapper: w,
      initialProps: { filters: { semesterId: 's1' } as { semesterId?: string } },
    });
    await waitFor(() => expect(list).toHaveBeenCalledWith({ semesterId: 's1' }));
    rerender({ filters: { semesterId: 's2' } });
    await waitFor(() => expect(list).toHaveBeenCalledWith({ semesterId: 's2' }));
    expect(client.getQueryCache().getAll().map((q) => q.queryKey[0])).toEqual(['classes', 'classes']);
  });

  it('Review Focus 1: không còn hook tạo/sửa/xoá lớp', () => {
    expect(hooks).not.toHaveProperty('useCreateClass');
    expect(hooks).not.toHaveProperty('useUpdateClass');
    expect(hooks).not.toHaveProperty('useDeleteClass');
  });
});
