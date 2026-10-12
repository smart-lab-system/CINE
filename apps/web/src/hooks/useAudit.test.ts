import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as auditApi from '@/lib/api/audit';
import { useSubmissionDownload } from './useAudit';

vi.mock('@/lib/api/audit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/audit')>();
  return { ...actual, getSubmissionDownload: vi.fn(), recordAuditReview: vi.fn() };
});

// QueryClient MẶC ĐỊNH (như app-shell.tsx dựng) — retry 3 lần với độ trễ 1s, 2s, 4s. Test dùng đúng cấu hình đó,
// không tắt retry giúp, vì chính cấu hình mặc định là thứ gây ra chuyện đang kiểm.
const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(QueryClientProvider, { client: new QueryClient() }, children);

describe('useSubmissionDownload', () => {
  beforeEach(() => {
    vi.mocked(auditApi.getSubmissionDownload).mockReset();
  });

  // Tìm thấy ở browser pass: bài chưa có file trên kho → máy chủ trả 404 xác định, nhưng TanStack Query thử lại 3 lần
  // (≈7 giây khung xám) rồi mới hiện câu "Bài này chưa có file trên kho lưu trữ." — giảng viên nhìn một ô trống.
  it('một câu từ chối của máy chủ hiện ra ngay, không bị thử lại với độ trễ luỹ tiến', async () => {
    vi.mocked(auditApi.getSubmissionDownload).mockRejectedValue(new Error('Bài này chưa có file trên kho lưu trữ.'));

    const { result } = renderHook(() => useSubmissionDownload('r1'), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 1500 });
    expect(result.current.error?.message).toBe('Bài này chưa có file trên kho lưu trữ.');
    expect(auditApi.getSubmissionDownload).toHaveBeenCalledTimes(1);
  });

  it('khi có file thì trả URL và tên file', async () => {
    vi.mocked(auditApi.getSubmissionDownload).mockResolvedValue({ downloadUrl: 'https://storage.local/x', fileName: 'Cau1.docx' });

    const { result } = renderHook(() => useSubmissionDownload('r1'), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual({ downloadUrl: 'https://storage.local/x', fileName: 'Cau1.docx' }));
  });
});
