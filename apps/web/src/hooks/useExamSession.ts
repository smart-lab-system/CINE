'use client';

import { useMutation } from '@tanstack/react-query';
import {
  createExamSession,
  type CreateExamSessionInput,
  type ExamSessionResponse,
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
