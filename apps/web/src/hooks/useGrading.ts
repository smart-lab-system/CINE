'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useMutation, useQueries, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import {
  bulkReview,
  finalizeGrades,
  getGradingProgress,
  getGradingReadiness,
  getResultInvestigation,
  getSubmissionText,
  listGradingResults,
  listGradingSessionSummaries,
  listRubrics,
  previewReapplyPrices,
  reapplyPrices,
  regradeStuck,
  saveRubric,
  setErrorException,
  setGradingReference,
  setManualScore,
  setSessionRubric,
  startGrading,
  submitReview,
  type ExceptionDirection,
  type GradingReferenceInput,
  type ResultDetail,
  type ReviewCriterion,
} from '@/lib/api/grading';

/**
 * Rubric của CHÍNH người đang đăng nhập.
 *
 * Trước đợt thu hẹp master data, khoá truy vấn là một môn học và hook nhận
 * `courseId`. Rubric giờ thuộc về giảng viên, nên không còn tham số nào —
 * và không còn trạng thái "chưa chọn môn nên chưa tải được".
 */
export function useRubrics() {
  return useQuery({
    queryKey: ['rubrics'],
    queryFn: () => listRubrics(),
  });
}

export function useSaveRubric() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      name: string;
      // `key` của tiêu chí CÓ SẴN phải đi kèm — bỏ nó thì server sinh lại từ mô tả (xem lib/rubric-form).
      criteria: { description: string; maxPoints: number; key?: string }[];
    }) => saveRubric(input.name, input.criteria),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['rubrics'] });
    },
  });
}

export function useGradingResults(examSessionId: string | undefined) {
  return useQuery({
    queryKey: ['exam-sessions', examSessionId, 'grading-results'],
    queryFn: () => listGradingResults(examSessionId!),
    enabled: Boolean(examSessionId),
  });
}

/**
 * Ghim rubric cho một phiên thi.
 *
 * Invalidate overview chứ không phải danh sách rubric: danh sách phiên của
 * trang Chấm điểm lấy từ overview, và `rubricId` của phiên vừa đổi nằm
 * trong chính payload ấy — không invalidate thì thẻ chặn vẫn còn nguyên
 * sau khi người dùng vừa gắn xong.
 */
export function useSetSessionRubric(examSessionId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (rubricId: string | null) => setSessionRubric(examSessionId!, rubricId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['submissions', 'overview'] });
    },
  });
}

/**
 * Một lần duyệt bài. Invalidate danh sách kết quả vì điểm và trạng thái của
 * bài vừa duyệt đều nằm trong đó.
 */
export function useSubmitReview(examSessionId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      gradingResultId,
      criteria,
      privateNote,
      studentFeedback,
    }: {
      gradingResultId: string;
      criteria: ReviewCriterion[];
      privateNote?: string;
      studentFeedback?: string;
    }) => submitReview(gradingResultId, criteria, { privateNote, studentFeedback }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['exam-sessions', examSessionId, 'grading-results'],
      });
    },
  });
}

/**
 * Chốt điểm cả phiên — mốc công bố, không phải một lần lưu. Sau đó mọi lần sửa
 * đều để lại dấu vết trong nhật ký.
 */
export function useFinalizeGrades(examSessionId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => finalizeGrades(examSessionId!),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['exam-sessions', examSessionId, 'grading-results'],
      });
    },
  });
}

/**
 * The explicit action, and the only thing that starts grading. Nothing in
 * the collection flow calls this — that separation is the point.
 *
 * Từ 2026-09-11 nó chỉ XẾP HÀNG rồi trả về. `onSuccess` vì thế làm mới
 * TIẾN ĐỘ, không làm mới kết quả: lúc này chưa bài nào được chấm, và
 * refetch danh sách kết quả ở đây sẽ lấy về đúng một danh sách rỗng rồi
 * không bao giờ hỏi lại — giảng viên bấm nút và nhìn màn hình đứng yên
 * cho tới khi tự F5. `useGradingProgress` bên dưới mới là thứ theo dõi
 * đến khi xong, và nó làm mới kết quả khi xong.
 */
export function useStartGrading(examSessionId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => startGrading(examSessionId!),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['exam-sessions', examSessionId, 'grading-progress'],
      });
    },
  });
}

/**
 * Nhịp hỏi lại: nhanh lúc đầu, chậm dần.
 *
 * 2 giây là đúng cho phút đầu — giảng viên vừa bấm nút và đang nhìn.
 * Nhưng một lượt 40 bài mất nhiều phút, và không ai theo dõi từng giây
 * suốt ngần ấy. Giữ nguyên 2 giây tới cuối là 2.5 request/giây khi năm
 * giảng viên chấm cùng lúc cuối kỳ, mỗi request một GROUP BY join hai
 * bảng — trên đúng process đang chạy năm worker chấm.
 */
export const PROGRESS_POLL_FAST_MS = 2_000;
export const PROGRESS_POLL_SLOW_MS = 5_000;
export const PROGRESS_FAST_WINDOW_MS = 60_000;

/**
 * Quyết định nhịp — tách ra vì nó là toàn bộ luật, và luật thì nên ghim
 * được bằng test mà không phải dựng một QueryClient.
 */
export function progressPollIntervalMs(pending: number, elapsedMs: number): number | false {
  if (pending <= 0) {
    return false;
  }
  return elapsedMs < PROGRESS_FAST_WINDOW_MS ? PROGRESS_POLL_FAST_MS : PROGRESS_POLL_SLOW_MS;
}

export const SESSION_SUMMARIES_KEY = ['grading', 'sessions-summary'] as const;

/**
 * Tóm tắt chấm điểm mọi phiên — trang danh sách phiên đọc nó cạnh `useSessionOverview`.
 * Luôn đọc lại khi mở trang: trạng thái đổi ở các trang khác (bắt đầu chấm, chốt điểm), và một
 * danh sách nói "Chưa chấm" về phiên đang chạy là lời nói dối tệ hơn việc chờ thêm một request.
 */
export function useGradingSessionSummaries() {
  return useQuery({
    queryKey: SESSION_SUMMARIES_KEY,
    queryFn: listGradingSessionSummaries,
    refetchOnMount: 'always',
  });
}

/**
 * Theo dõi một lượt chấm cho tới khi xong.
 *
 * Hỏi lại CHỈ KHI còn bài đang chấm, rồi tự dừng: một trang mở suốt
 * buổi không được phép gọi mãi một endpoint không còn gì để nói.
 *
 * `refetchIntervalInBackground` để mặc định (false), nên TanStack Query
 * tự dừng hỏi khi cửa sổ mất focus và hỏi lại khi quay về. Bấm "Bắt đầu
 * chấm" rồi chuyển tab là hành vi mặc định của một lượt chấm dài, và
 * một tab nền không ai nhìn thì mỗi request là chi phí thuần.
 *
 * Khi lượt chấm kết thúc, nó làm mới danh sách kết quả đúng một lần —
 * đó là chỗ duy nhất biết được "vừa xong", vì response của
 * `startGrading` trả về từ nhiều phút trước.
 */
export function useGradingProgress(examSessionId: string | undefined) {
  const queryClient = useQueryClient();
  const settled = useRef(true);
  /** Lượt chấm HIỆN TẠI bắt đầu lúc nào — mốc để giãn nhịp. */
  const startedAt = useRef<number | null>(null);

  const query = useQuery({
    queryKey: ['exam-sessions', examSessionId, 'grading-progress'],
    queryFn: () => getGradingProgress(examSessionId!),
    enabled: Boolean(examSessionId),
    refetchInterval: (query) => {
      const pending = query.state.data?.pending ?? 0;
      if (pending <= 0) {
        // Đặt lại mốc: lượt chấm sau phải được một phút nhanh của
        // riêng nó, không kế thừa đồng hồ của lượt trước.
        startedAt.current = null;
        return false;
      }
      if (startedAt.current === null) {
        startedAt.current = Date.now();
      }
      return progressPollIntervalMs(pending, Date.now() - startedAt.current);
    },
  });

  const pending = query.data?.pending ?? 0;
  useEffect(() => {
    if (pending > 0) {
      settled.current = false;
      return;
    }
    if (settled.current) {
      return;
    }
    // Chuyển từ "đang chấm" sang "xong" — một lần, không phải mỗi lần
    // component render lại.
    settled.current = true;
    void queryClient.invalidateQueries({
      queryKey: ['exam-sessions', examSessionId, 'grading-results'],
    });
  }, [pending, examSessionId, queryClient]);

  return query;
}

/**
 * Khoá cache của mức sẵn sàng — export để test ghim đúng chuỗi này.
 *
 * Invalidate nhầm khoá là một lỗi KHÔNG hiện ra: lưu xong, server đã đổi,
 * màn hình vẫn vẽ mức cũ, và giảng viên bấm "Bắt đầu chấm" tin rằng mình
 * đang ở mức 2 trong khi vừa gỡ đề bài ra.
 */
export function readinessQueryKey(examSessionId: string | undefined) {
  return ['exam-sessions', examSessionId, 'grading-readiness'] as const;
}

/** Phiên này sẽ được chấm với bao nhiêu ngữ cảnh. */
export function useGradingReadiness(examSessionId: string | undefined) {
  return useQuery({
    queryKey: readinessQueryKey(examSessionId),
    queryFn: () => getGradingReadiness(examSessionId!),
    enabled: Boolean(examSessionId),
  });
}

/**
 * Lưu tài liệu tham chiếu.
 *
 * Invalidate mức sẵn sàng, vì đó chính là thứ vừa đổi — và nó là điều kiện
 * để lượt phản biện chạy được.
 */
export function useSetGradingReference(examSessionId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: GradingReferenceInput) => setGradingReference(examSessionId!, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: readinessQueryKey(examSessionId) });
    },
  });
}

/**
 * Xếp lại bài treo.
 *
 * Invalidate TIẾN ĐỘ chứ không phải kết quả: những bài này vừa quay lại
 * hàng đợi, nên thứ đổi ngay là con số đang chạy, không phải điểm.
 * `useGradingProgress` sẽ tự làm mới kết quả khi lượt chấm kết thúc.
 */
export function useRegradeStuck(examSessionId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => regradeStuck(examSessionId!),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['exam-sessions', examSessionId, 'grading-progress'],
      });
    },
  });
}

/**
 * Bài làm kèm toạ độ dẫn chứng.
 *
 * `staleTime` dài có chủ đích: nội dung một bài đã nộp không đổi, còn mỗi
 * lần gọi là một lần tải file từ kho rồi trích lại text — đắt hơn hẳn mọi
 * endpoint khác ở màn này. Giảng viên chuyển qua lại giữa các tiêu chí
 * không được phép kéo theo một lượt tải file mỗi lần.
 */
export function useSubmissionText(gradingResultId: string | undefined) {
  return useQuery({
    queryKey: ['grading-results', gradingResultId, 'submission-text'],
    queryFn: () => getSubmissionText(gradingResultId!),
    enabled: Boolean(gradingResultId),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Duyệt hàng loạt.
 *
 * Invalidate danh sách kết quả — điểm và trạng thái của mọi bài vừa áp đều
 * nằm trong đó, và màn Ma trận đọc chính danh sách ấy.
 */
/** Khoá cache của một hồ sơ điều tra — export để invalidate đúng chỗ và để test ghim. */
export function investigationQueryKey(gradingResultId: string | undefined) {
  return ['grading-results', gradingResultId, 'investigation'] as const;
}

/** Chi tiết một lượt tính điểm — Hồ sơ một bài, đường điều tra (§5). */
export function useResultInvestigation(gradingResultId: string | undefined) {
  return useQuery({
    queryKey: investigationQueryKey(gradingResultId),
    queryFn: () => getResultInvestigation(gradingResultId!),
    enabled: Boolean(gradingResultId),
  });
}

/**
 * Bỏ/giữ một lỗi cho riêng bài này. Làm mới cả hồ sơ (điểm, trạng thái vừa
 * đổi) lẫn danh sách bài của phiên (trạng thái/điểm hiện ở đó cũng đổi).
 */
export function useSetErrorException(examSessionId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ resultId, ruleId, direction }: { resultId: string; ruleId: string; direction: ExceptionDirection }) =>
      setErrorException(resultId, ruleId, direction),
    // `onSettled`, not `onSuccess`: a 400 ("không có trong lượt tính mới nhất") means the page is stale, and
    // the refetch is what removes the row that caused it.
    onSettled: (_data, _error, { resultId }) => {
      void queryClient.invalidateQueries({ queryKey: investigationQueryKey(resultId) });
      void queryClient.invalidateQueries({ queryKey: ['exam-sessions', examSessionId, 'grading-results'] });
    },
  });
}

/** Chấm tay bài này — từ đây điểm không đổi theo luật/giá nữa. */
export function useSetManualScore(examSessionId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ resultId, score }: { resultId: string; score: string }) => setManualScore(resultId, score),
    onSettled: (_data, _error, { resultId }) => {
      void queryClient.invalidateQueries({ queryKey: investigationQueryKey(resultId) });
      void queryClient.invalidateQueries({ queryKey: ['exam-sessions', examSessionId, 'grading-results'] });
    },
  });
}

export function useBulkReview(examSessionId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Parameters<typeof bulkReview>[1]) => bulkReview(examSessionId!, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['exam-sessions', examSessionId, 'grading-results'],
      });
    },
  });
}

/**
 * Hồ sơ của NHIỀU bài cùng lúc — cho danh sách bài (spec §3.3): danh sách chỉ mang trạng thái, còn "vì sao cần
 * bạn", số lỗi chờ giá và dòng nhắc đòn bẩy nằm trong hồ sơ từng bài. Cùng khoá với trang hồ sơ, nên mở một
 * bài sau đó là tức thì.
 *
 * `loading` và `failed` tách nhau: một hồ sơ lỗi KHÔNG phải "đã tải" — người gọi không được suy ra kết luận
 * từ một tập còn thiếu.
 */
export function useResultDetails(ids: string[]) {
  const key = ids.join('|');
  const stable = useMemo(() => (key === '' ? [] : key.split('|')), [key]);
  const combine = useCallback(
    (results: UseQueryResult<ResultDetail>[]) => {
      const byId = new Map<string, ResultDetail>();
      let loading = 0;
      let failed = 0;
      results.forEach((r, i) => {
        if (r.data) byId.set(stable[i], r.data);
        else if (r.isError) failed += 1;
        else loading += 1;
      });
      return { byId, loading, failed };
    },
    [stable],
  );
  return useQueries({
    queries: stable.map((id) => ({
      queryKey: investigationQueryKey(id),
      queryFn: () => getResultInvestigation(id),
      staleTime: 30_000,
    })),
    combine,
  });
}

/** Xem trước "áp giá mới cho phiên đã chốt" — không cache, không làm mới gì: nó không ghi gì cả. */
export function useReapplyPreview(examSessionId: string | undefined) {
  return useMutation({ mutationFn: () => previewReapplyPrices(examSessionId!) });
}

/**
 * Áp giá mới cho phiên đã chốt. `onSettled`: một lượt bị từ chối (409) cũng làm mới — trang không được giữ một
 * bản xem trước mà server vừa phản bác.
 */
export function useReapplyPrices(examSessionId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => reapplyPrices(examSessionId!),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['exam-sessions', examSessionId, 'grading-results'] });
      void queryClient.invalidateQueries({ queryKey: ['grading-results'] });
    },
  });
}
