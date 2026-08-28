'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import {
  createExamSession,
  listExamSessions,
  getExamSession,
  type CreateExamSessionInput,
  type ExamSessionResponse,
  type SearchExamSessionsParams,
} from '@/lib/api/exam-session';

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
