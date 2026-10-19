'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { investigationQueryKey } from '@/hooks/useGrading';
import { getSubmissionDownload, recordAuditReview } from '@/lib/api/audit';

/**
 * KHÔNG làm mới danh sách/hồ sơ khi ghi thành công: ngay khi trạng thái đổi sang `teacher_reviewed`, trang hồ sơ
 * chuyển sang hồ sơ thường và bản tiết lộ biến mất trước khi người dùng kịp đọc. Làm mới do
 * `useOpenDossierAfterAudit` — chỉ khi giảng viên bấm *Mở hồ sơ*.
 */
export function useRecordAuditReview(resultId: string) {
  return useMutation({
    mutationFn: (body: { pickedRuleIds: string[]; extraErrors: string[] }) => recordAuditReview(resultId, body),
  });
}

/**
 * Mở bài nộp gốc của ĐÚNG bài này ở tab mới. Link ký có hạn nên lấy lúc bấm, không lấy trước khi mở trang.
 * `window.open` đặt trong `onSuccess`: trình duyệt cho mở tab khi còn cử chỉ bấm của giảng viên trong vài giây.
 */
export function useOpenSubmission(resultId: string) {
  return useMutation({
    mutationFn: () => getSubmissionDownload(resultId),
    onSuccess: ({ downloadUrl }) => {
      window.open(downloadUrl, '_blank', 'noopener,noreferrer');
    },
  });
}

export function useSubmissionDownload(resultId: string) {
  return useQuery({
    queryKey: ['grading-results', resultId, 'submission-download'],
    queryFn: () => getSubmissionDownload(resultId),
    // URL ký có hạn; không giữ lâu.
    staleTime: 60_000,
    // Từ chối của máy chủ ở đây là xác định (404 chưa có file, 403 không phải bài của bạn) — thử lại chỉ làm khung xám
    // kéo dài ≈7 giây trước khi giảng viên đọc được lý do. Muốn thử lại thì tải lại trang.
    retry: false,
  });
}

/** Trả một hàm làm mới danh sách và hồ sơ — gọi khi giảng viên bấm *Mở hồ sơ*. */
export function useOpenDossierAfterAudit(sessionId: string, resultId: string) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['exam-sessions', sessionId, 'grading-results'] });
    void queryClient.invalidateQueries({ queryKey: ['exam-sessions', sessionId, 'grading-progress'] });
    void queryClient.invalidateQueries({ queryKey: investigationQueryKey(resultId) });
  };
}
