import { apiClient } from '@/lib/api-client';
import type {
  ExamEventDetail,
  LabSessionDetail,
  SessionParticipant,
  StatusHistoryRow,
} from './exam-types';

type ApiResult<T> = {
  data?: T;
  error?: unknown;
  response: { ok: boolean; status: number };
};

export function mutationErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) {
      return message;
    }
    if (Array.isArray(message) && message.length) {
      return message.filter((part) => typeof part === 'string').join(', ');
    }
  }
  return fallback;
}

export function throwOnApiError<T>(result: ApiResult<T>): T {
  if (result.error || !result.response.ok) {
    throw new Error(
      mutationErrorMessage(
        result.error,
        `Yêu cầu thất bại (HTTP ${result.response.status})`,
      ),
    );
  }
  return result.data as T;
}

export async function fetchExamEvent(id: string) {
  return throwOnApiError(
    await apiClient.GET('/exam-events/{id}', {
      params: { path: { id } },
    }),
  ) as ExamEventDetail;
}

export async function fetchExamSessionDetails(eventId: string) {
  const list = throwOnApiError(
    await apiClient.GET('/exam-events/{id}/sessions', {
      params: {
        path: { id: eventId },
        query: { page: 1, pageSize: 100 },
      },
    }),
  );
  return Promise.all(
    list.items.map((session) => fetchExamSession(eventId, session.id)),
  );
}

export async function fetchExamSession(eventId: string, sessionId: string) {
  return throwOnApiError(
    await apiClient.GET('/exam-events/{id}/sessions/{sessionId}', {
      params: { path: { id: eventId, sessionId } },
    }),
  ) as LabSessionDetail;
}

export async function fetchExamHistory(eventId: string) {
  return throwOnApiError(
    await apiClient.GET('/exam-events/{id}/status-history', {
      params: { path: { id: eventId } },
    }),
  ) as { items: StatusHistoryRow[]; total: number };
}

export async function fetchSessionHistory(eventId: string, sessionId: string) {
  return throwOnApiError(
    await apiClient.GET(
      '/exam-events/{id}/sessions/{sessionId}/status-history',
      { params: { path: { id: eventId, sessionId } } },
    ),
  ) as { items: StatusHistoryRow[]; total: number };
}

export async function fetchSessionParticipants(
  eventId: string,
  sessionId: string,
) {
  return throwOnApiError(
    await apiClient.GET(
      '/exam-events/{id}/sessions/{sessionId}/participants',
      { params: { path: { id: eventId, sessionId } } },
    ),
  ) as { items: SessionParticipant[]; total: number };
}
