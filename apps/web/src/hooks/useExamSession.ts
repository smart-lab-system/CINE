'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createExamSession,
  listExamSessions,
  getExamSession,
  finalizeExamSession,
  confirmSessionEnd,
  openSession,
  recollectSubmissions,
  listSubmissions,
  type CreateExamSessionInput,
  type ExamSessionResponse,
  type OpenSessionResult,
  type RecollectResult,
  type SearchExamSessionsParams,
} from '@/lib/api/exam-session';
import { confirmAttendance, getAttendance } from '@/lib/api/attendance';
import {
  deleteExamMaterial,
  listExamMaterials,
  uploadExamMaterial,
} from '@/lib/api/exam-materials';

/**
 * TanStack Query mutation wrapping `createExamSession` — pages call this
 * hook, never `apiClient`/`lib/api/exam-session.ts` directly (see
 * CLAUDE.md's API-call-layering rule).
 */
export function useCreateExamSession() {
  return useMutation<ExamSessionResponse, Error, CreateExamSessionInput>({
    mutationFn: createExamSession,
  });
}

/**
 * Powers the "Quản lý kỳ thi" list page and the teacher dashboard's
 * upcoming/active-session count.
 */
export function useExamSessions(params: SearchExamSessionsParams) {
  return useQuery({
    queryKey: ['exam-sessions', params],
    queryFn: () => listExamSessions(params),
  });
}

/**
 * Powers the lobby page's "has this session started/ended?" banner — the
 * live roster itself still comes from the WebSocket (`teacher:subscribe`),
 * this is only for the session's own start/end/status metadata.
 */
export function useExamSessionDetail(id: string | undefined) {
  return useQuery({
    queryKey: ['exam-session', id],
    queryFn: () => getExamSession(id!),
    enabled: !!id,
  });
}

/**
 * "Chốt bài ngay". On success the session detail is invalidated so the
 * page re-reads the real status from the server rather than assuming the
 * mutation result is still current — the scheduled sweep may have
 * finalized it in the same second.
 */
export function useFinalizeExamSession(id: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation<ExamSessionResponse, Error, void>({
    mutationFn: () => finalizeExamSession(id!),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['exam-session', id] });
    },
  });
}

/**
 * "Mở phiên thi" — đóng băng danh sách dự thi và cho sinh viên vào.
 *
 * Invalidate `attendance` chứ không phải `exam-session`: việc mở phiên
 * KHÔNG đổi `status` (phiên đã `active` từ lúc tạo), nó chỉ đổi câu
 * trả lời cho "đã chốt danh sách chưa" — và câu đó nằm trong view
 * điểm danh. Invalidate nhầm chỗ sẽ để lại cảnh báo trên màn hình sau
 * khi giảng viên vừa bấm xong.
 */
export function useOpenSession(id: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation<OpenSessionResult, Error, void>({
    mutationFn: () => openSession(id!),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['exam-sessions', id, 'attendance'] });
    },
  });
}

/** "Xác nhận kết thúc" — `collecting → completed`. Xem confirmSessionEnd. */
export function useConfirmSessionEnd(id: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation<ExamSessionResponse, Error, void>({
    mutationFn: () => confirmSessionEnd(id!),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['exam-session', id] });
    },
  });
}

/**
 * "Thu lại". KHÔNG invalidate gì cả — và đó là chủ ý, không phải thiếu
 * sót: lệnh này không đổi trạng thái nào ở server, nó chỉ nhờ vài cái
 * máy nộp lại bài. Bài về sẽ tới qua `lobby:submission_status` như mọi
 * bài khác, và trang đã lắng nghe sự kiện đó rồi. Invalidate ở đây sẽ
 * đọc lại đúng lúc chưa có gì mới để đọc.
 */
export function useRecollect(id: string | undefined) {
  return useMutation<RecollectResult, Error, void>({
    mutationFn: () => recollectSubmissions(id!),
  });
}

/**
 * Initial state for the submission table. Live updates arrive over the
 * socket (`lobby:submission_status`); this is only the "what already
 * happened before this page opened" half.
 *
 * No polling interval: the socket is the live channel, and a poll on top
 * would fight it for the same state.
 */
export function useSubmissions(examSessionId: string | undefined) {
  return useQuery({
    queryKey: ['exam-session-submissions', examSessionId],
    queryFn: () => listSubmissions(examSessionId!),
    enabled: !!examSessionId,
  });
}

/* --------------------------------------------------------------- attendance */

/**
 * Who is in the room, from the server's attendance log rather than from
 * whatever this tab happened to witness. That is the whole point: a refresh
 * mid-exam used to lose the lobby entirely.
 */
export function useAttendance(examSessionId: string) {
  return useQuery({
    queryKey: ['exam-sessions', examSessionId, 'attendance'],
    queryFn: () => getAttendance(examSessionId),
    enabled: Boolean(examSessionId),
  });
}

export function useConfirmAttendance(examSessionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => confirmAttendance(examSessionId),
    onSuccess: () => {
      // The baseline changes what every row's "after the count" mark means,
      // so the whole view is re-read rather than patched.
      void queryClient.invalidateQueries({
        queryKey: ['exam-sessions', examSessionId, 'attendance'],
      });
    },
  });
}

/* ---------------------------------------------------------------- materials */

export function useExamMaterials(examSessionId: string) {
  return useQuery({
    queryKey: ['exam-sessions', examSessionId, 'materials'],
    queryFn: () => listExamMaterials(examSessionId),
    enabled: Boolean(examSessionId),
  });
}

export function useUploadExamMaterial(examSessionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => uploadExamMaterial(examSessionId, file),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['exam-sessions', examSessionId, 'materials'],
      });
    },
  });
}

export function useDeleteExamMaterial(examSessionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (materialId: string) => deleteExamMaterial(examSessionId, materialId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['exam-sessions', examSessionId, 'materials'],
      });
    },
  });
}
