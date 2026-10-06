import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const lookupStudent = vi.fn();
vi.mock('@/lib/api/students', () => ({ lookupStudent: (...args: unknown[]) => lookupStudent(...args) }));

import { useStudentLookup } from './useStudentLookup';

function setup(initial: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(({ mssv }) => useStudentLookup(mssv), { wrapper, initialProps: { mssv: initial } });
}

/** Chạy đồng hồ giả và xả hết lời hứa đang chờ (kể cả của TanStack Query) trước khi trả về. */
const tick = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

const named = async (mssv: string) => ({ mssv, fullName: `Tên của ${mssv}` });

describe('useStudentLookup — không bắn theo từng ký tự gõ (review B+G1, I1)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    lookupStudent.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it('gõ từng ký tự của một MSSV 10 ký tự chỉ tra MỘT lần, sau khi ngừng gõ', async () => {
    // Mọi tiền tố từ 4 ký tự trở lên đều đã khớp luật MSSV của server — nên "chỉ tra khi MSSV hợp lệ" không đủ để tránh bảy lần gọi
    // cho một MSSV, mà hạn mức 30 lần/phút là CHUNG với thêm-tay vào lớp và vào phiên.
    lookupStudent.mockImplementation(named);
    const { rerender } = setup('');

    for (const typed of ['S', 'SV', 'SV2', 'SV20', 'SV201', 'SV2012', 'SV20120', 'SV201200', 'SV2012000', 'SV20120001']) {
      rerender({ mssv: typed });
      await tick(80);
    }
    expect(lookupStudent).not.toHaveBeenCalled();

    await tick(600);
    expect(lookupStudent).toHaveBeenCalledTimes(1);
    expect(lookupStudent).toHaveBeenCalledWith('SV20120001');
  });

  it('trong lúc đang gõ MSSV khác, data KHÔNG mang tên của MSSV trước và isFetching=true (ô tên vẫn khoá)', async () => {
    // G3a dựng ô tên từ `lookup.data`: nếu khoảng chờ vẫn trả tên của MSSV cũ thì một cái tên lạ bị gửi kèm MSSV mới.
    lookupStudent.mockImplementation(named);
    const { result, rerender } = setup('SV20120001');
    await tick(600);
    expect(result.current.data?.fullName).toBe('Tên của SV20120001');

    rerender({ mssv: 'SV20120002' });
    await tick(100);

    expect(result.current.data).toBeUndefined();
    expect(result.current.isFetching).toBe(true);
    expect(lookupStudent).toHaveBeenCalledTimes(1);

    await tick(600);
    expect(result.current.data?.fullName).toBe('Tên của SV20120002');
    expect(result.current.isFetching).toBe(false);
  });

  it('MSSV đã tra (còn trong bộ nhớ) trả ngay, không chờ và không gọi lại', async () => {
    lookupStudent.mockImplementation(named);
    const { result, rerender } = setup('SV20120001');
    await tick(600);
    rerender({ mssv: 'SV20120002' });
    await tick(600);
    expect(lookupStudent).toHaveBeenCalledTimes(2);

    rerender({ mssv: 'SV20120001' });

    expect(result.current.data?.fullName).toBe('Tên của SV20120001');
    expect(result.current.isFetching).toBe(false);
    await tick(1000);
    expect(lookupStudent).toHaveBeenCalledTimes(2);
  });

  it('xoá bớt ký tự rồi gõ lại đúng MSSV cũ thì vẫn chỉ tra một lần', async () => {
    lookupStudent.mockImplementation(named);
    const { rerender } = setup('SV20120001');
    await tick(100);
    rerender({ mssv: 'SV2012000' });
    await tick(100);
    rerender({ mssv: 'SV20120001' });
    await tick(800);

    expect(lookupStudent).toHaveBeenCalledTimes(1);
    expect(lookupStudent).toHaveBeenCalledWith('SV20120001');
  });
});
