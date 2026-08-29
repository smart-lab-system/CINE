import { apiClient } from '@/lib/api-client';

/** Mirrors RubricView (apps/api/src/grading/rubric.service.ts). */
export interface Rubric {
  id: string;
  courseId: string;
  version: number;
  isActive: boolean;
  totalPoints: number;
  criteria: { id: string; description: string; maxPoints: number }[];
}

/** Mirrors GradingResultView (apps/api/src/grading/grading.service.ts). */
export interface GradingResult {
  id: string;
  submissionId: string;
  studentMssv: string;
  studentName: string;
  status: string;
  modelUsed: string | null;
  aiTotalScore: number | null;
  confidence: number | null;
  flagForReview: boolean;
  criterionResults: {
    criterionId: string;
    verdict: 'met' | 'partially_met' | 'not_met';
    points: number;
    evidence: string;
  }[];
}

export interface StartGradingResult {
  rubricId: string;
  rubricVersion: number;
  queued: number;
  alreadyGraded: number;
}

function fail(error: unknown, response: Response): Error {
  const body = error as { message?: string | string[] } | undefined;
  const message = Array.isArray(body?.message) ? body!.message.join('; ') : body?.message;
  return new Error(message ?? `Yêu cầu thất bại (HTTP ${response.status})`);
}

export async function listRubrics(courseId: string): Promise<Rubric[]> {
  const { data, error, response } = await apiClient.GET('/courses/{courseId}/rubrics', {
    params: { path: { courseId } },
  });
  if (error || !response.ok) throw fail(error, response);
  return data as unknown as Rubric[];
}

/**
 * Always a NEW version — there is no update endpoint, because editing
 * criteria that existing results cite is what Security rule 7 forbids.
 */
export async function saveRubric(
  courseId: string,
  criteria: { description: string; maxPoints: number }[],
): Promise<Rubric> {
  const { data, error, response } = await apiClient.POST('/courses/{courseId}/rubrics', {
    params: { path: { courseId } },
    body: { criteria },
  });
  if (error || !response.ok) throw fail(error, response);
  return data as unknown as Rubric;
}

export async function startGrading(examSessionId: string): Promise<StartGradingResult> {
  const { data, error, response } = await apiClient.POST(
    '/exam-sessions/{id}/start-grading',
    { params: { path: { id: examSessionId } } },
  );
  if (error || !response.ok) throw fail(error, response);
  return data as unknown as StartGradingResult;
}

export async function listGradingResults(examSessionId: string): Promise<GradingResult[]> {
  const { data, error, response } = await apiClient.GET(
    '/exam-sessions/{id}/grading-results',
    { params: { path: { id: examSessionId } } },
  );
  if (error || !response.ok) throw fail(error, response);
  return data as unknown as GradingResult[];
}
