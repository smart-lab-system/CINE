import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '@/lib/api/rubric-errors';
import { useAssignError, usePreviewErrorPrice, useRubricErrors, useSetErrorPrice } from './useRubricErrors';

vi.mock('@/lib/api/rubric-errors', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/rubric-errors')>();
  return {
    ...actual,
    getRubricOverview: vi.fn(),
    listRubricErrors: vi.fn(),
    assignError: vi.fn(),
    previewErrorPrice: vi.fn(),
    setErrorPrice: vi.fn(),
  };
});

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
  return { wrapper, invalidate };
}

beforeEach(() => vi.clearAllMocks());

describe('hooks/useRubricErrors', () => {
  it('chưa biết rubric thì không gọi API', () => {
    const { wrapper } = setup();
    renderHook(() => useRubricErrors(undefined), { wrapper });
    expect(api.listRubricErrors).not.toHaveBeenCalled();
  });

  it('thêm lỗi xong làm mới cả tổng quan lẫn thư viện (hai họ khoá)', async () => {
    vi.mocked(api.assignError).mockResolvedValue({ rubricErrorId: 'e1', ruleId: 'r1', recompute: null });
    const { wrapper, invalidate } = setup();
    const { result } = renderHook(() => useAssignError(), { wrapper });
    await act(async () => {
      result.current.mutate({ rubricName: 'A', criterionKey: 'x', ruleId: 'r1' });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.assignError).toHaveBeenCalledWith({ rubricName: 'A', criterionKey: 'x', ruleId: 'r1' });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['rubric-errors'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['rules'] });
  });

  it('xem trước điểm trừ KHÔNG làm mới gì (T-POL-5: không ghi)', async () => {
    vi.mocked(api.previewErrorPrice).mockResolvedValue({ openSessions: [], finalizedSessions: [] });
    const { wrapper, invalidate } = setup();
    const { result } = renderHook(() => usePreviewErrorPrice(), { wrapper });
    await act(async () => {
      result.current.mutate({ rubricErrorId: 'e1', deduction: '1.5' });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.previewErrorPrice).toHaveBeenCalledWith('e1', '1.5');
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('lưu điểm trừ chuyển đúng tham số và làm mới', async () => {
    vi.mocked(api.setErrorPrice).mockResolvedValue({ versionId: 'v2', recompute: { recomputed: 0, promoted: 0, demoted: 0, belowFloor: 0 } });
    const { wrapper, invalidate } = setup();
    const { result } = renderHook(() => useSetErrorPrice(), { wrapper });
    await act(async () => {
      result.current.mutate({ rubricErrorId: 'e1', deduction: null });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.setErrorPrice).toHaveBeenCalledWith('e1', null);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['rubric-errors'] });
  });
});
