import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as gradingApi from '@/lib/api/grading';
import {
  PROGRESS_FAST_WINDOW_MS,
  PROGRESS_POLL_FAST_MS,
  PROGRESS_POLL_SLOW_MS,
  progressPollIntervalMs,
  useSetErrorException,
  useSetManualScore,
} from './useGrading';

vi.mock('@/lib/api/grading', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/grading')>();
  return { ...actual, setErrorException: vi.fn(), setManualScore: vi.fn() };
});

/**
 * Nhịp hỏi tiến độ.
 *
 * Vì sao đáng có test riêng: đây là endpoint bị gọi nhiều nhất trong
 * toàn hệ thống, ở đúng khoảng thời gian hệ thống bận nhất — trong lúc
 * năm worker đang chấm trên cùng process. Một `refetchInterval` trả về
 * số ở nhánh đáng lẽ phải trả `false` sẽ không gây lỗi nào nhìn thấy
 * được; nó chỉ lặng lẽ gọi mãi.
 */
describe('progressPollIntervalMs', () => {
  it('không hỏi lại khi không còn bài nào đang chấm', () => {
    // Một trang mở suốt buổi không được phép gọi mãi một endpoint không
    // còn gì để nói.
    expect(progressPollIntervalMs(0, 0)).toBe(false);
    expect(progressPollIntervalMs(0, PROGRESS_FAST_WINDOW_MS * 10)).toBe(false);
  });

  it('nhanh trong phút đầu — giảng viên vừa bấm nút và đang nhìn', () => {
    expect(progressPollIntervalMs(40, 0)).toBe(PROGRESS_POLL_FAST_MS);
    expect(progressPollIntervalMs(40, PROGRESS_FAST_WINDOW_MS - 1)).toBe(PROGRESS_POLL_FAST_MS);
  });

  it('chậm lại sau phút đầu — lượt chấm dài thì không ai theo từng giây', () => {
    // Giữ 2 giây tới cuối là 2.5 request/giây khi năm giảng viên chấm
    // cùng lúc cuối kỳ, mỗi request một GROUP BY join hai bảng.
    expect(progressPollIntervalMs(40, PROGRESS_FAST_WINDOW_MS)).toBe(PROGRESS_POLL_SLOW_MS);
    expect(progressPollIntervalMs(1, PROGRESS_FAST_WINDOW_MS * 30)).toBe(PROGRESS_POLL_SLOW_MS);
  });

  it('"xong" thắng "mới bắt đầu" — số 0 chặn trước khi xét thời gian', () => {
    // Thứ tự hai nhánh là thứ quan trọng: nếu xét thời gian trước thì
    // một lượt vừa xong trong phút đầu vẫn trả về 2 giây và không bao
    // giờ dừng.
    expect(progressPollIntervalMs(0, 1)).toBe(false);
  });
});

describe('investigationQueryKey', () => {
  it('is stable for the same resultId', async () => {
    const { investigationQueryKey } = await import('./useGrading');
    expect(investigationQueryKey('r1')).toEqual(['grading-results', 'r1', 'investigation']);
  });
});

/**
 * Review (minor): both write hooks invalidated only in `onSuccess`. After a 400 such as "Lỗi này không có
 * trong lượt tính mới nhất của bài" the row that caused it stayed on screen, clickable again — the page was
 * stale precisely when the server had just said so. A failed write must refetch too.
 */
describe.each([
  {
    name: 'useSetErrorException',
    api: () => vi.mocked(gradingApi.setErrorException),
    run: (r: { current: ReturnType<typeof useSetErrorException> }) =>
      r.current.mutate({ resultId: 'r1', ruleId: 'rule-1', direction: 'exclude' }),
    hook: () => useSetErrorException('s1'),
  },
  {
    name: 'useSetManualScore',
    api: () => vi.mocked(gradingApi.setManualScore),
    run: (r: { current: ReturnType<typeof useSetManualScore> }) => r.current.mutate({ resultId: 'r1', score: '7.5' }),
    hook: () => useSetManualScore('s1'),
  },
])('$name refetches the investigation and the session list', ({ api, run, hook }) => {
  function setup() {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const spy = vi.spyOn(client, 'invalidateQueries');
    const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
    return { spy, wrapper };
  }
  const expectRefetched = (spy: ReturnType<typeof setup>['spy']) => {
    expect(spy).toHaveBeenCalledWith({ queryKey: ['grading-results', 'r1', 'investigation'] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['exam-sessions', 's1', 'grading-results'] });
  };

  beforeEach(() => vi.clearAllMocks());

  it('after a successful write', async () => {
    api().mockResolvedValueOnce(undefined as never);
    const { spy, wrapper } = setup();
    const { result } = renderHook(hook as never, { wrapper });
    await act(async () => run(result as never));
    await waitFor(() => expect((result.current as { isSuccess: boolean }).isSuccess).toBe(true));
    expectRefetched(spy);
  });

  it('after a FAILED write too', async () => {
    api().mockRejectedValueOnce(new Error('Lỗi này không có trong lượt tính mới nhất của bài'));
    const { spy, wrapper } = setup();
    const { result } = renderHook(hook as never, { wrapper });
    await act(async () => run(result as never));
    await waitFor(() => expect((result.current as { isError: boolean }).isError).toBe(true));
    expectRefetched(spy);
  });
});
