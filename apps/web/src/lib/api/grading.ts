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

/** Một tiêu chí trong một lần duyệt của giảng viên. */
export interface ReviewCriterion {
  criterionId: string;
  verdict: 'met' | 'partially_met' | 'not_met';
  points: number;
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
    /**
     * Máy có định vị được `evidence` trong bài làm không (từ 2026-09-15).
     *
     * `null`/thiếu = chấm trước khi hệ thống ghi lại điều này, KHÁC `'ok'`.
     * UI chưa dùng, nhưng kiểu phải nói đúng thứ API trả về — một kiểu nói
     * thiếu là một kiểu sẽ được tin.
     */
    check?: 'ok' | 'empty' | 'unverified' | null;
  }[];
  /**
   * Điểm cuối cùng — dòng `teacher_review` mới nhất.
   *
   * `null` nghĩa là "AI đã chấm, chưa ai duyệt", KHÔNG phải "điểm bằng 0".
   * Hai thứ đó không được hiển thị giống nhau.
   */
  finalScore: number | null;
  reviewedAt: string | null;
  reviewedByName: string | null;
  editedCriteria: ReviewCriterion[] | null;
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

/**
 * Đổi rubric của một phiên thi. `null` để gỡ.
 *
 * Server trả 409 khi phiên đã có kết quả chấm — từ lúc đó, đổi rubric là
 * viết lại lịch sử chấm điểm. UI phải tắt nút trước khi tới đó, nhưng lỗi
 * này vẫn là lớp chặn cuối.
 */
export async function setSessionRubric(
  examSessionId: string,
  rubricId: string | null,
): Promise<void> {
  const { error, response } = await apiClient.PATCH('/exam-sessions/{id}/rubric', {
    params: { path: { id: examSessionId } },
    body: { rubricId },
  });
  if (error || !response.ok) throw fail(error, response);
}

export async function startGrading(examSessionId: string): Promise<StartGradingResult> {
  const { data, error, response } = await apiClient.POST(
    '/exam-sessions/{id}/start-grading',
    { params: { path: { id: examSessionId } } },
  );
  if (error || !response.ok) throw fail(error, response);
  return data as unknown as StartGradingResult;
}

/**
 * Tiến độ của một lượt chấm đang chạy.
 *
 * `total`/`pending`/`done` đếm bản ghi chấm của CHÍNH phiên này.
 * `queue` là câu hỏi khác — hàng đợi toàn hệ thống có đang kẹt không —
 * và cố ý tách riêng: trộn chúng lại sẽ cho giảng viên A thấy con số
 * của giảng viên B.
 */
export interface GradingProgress {
  total: number;
  pending: number;
  done: number;
  byStatus: Record<string, number>;
  queue: { waiting: number; active: number; failed: number };
}

export async function getGradingProgress(examSessionId: string): Promise<GradingProgress> {
  const { data, error, response } = await apiClient.GET(
    '/exam-sessions/{id}/grading-progress',
    { params: { path: { id: examSessionId } } },
  );
  if (error || !response.ok) throw fail(error, response);
  return data as unknown as GradingProgress;
}

/**
 * Một lần duyệt bài. Server tự tính tổng — client KHÔNG gửi `finalScore`.
 *
 * 409 khi bài còn đang chấm (`ai_grading`/`ai_graded`); 400 khi thiếu tiêu chí
 * hoặc điểm vượt thang.
 */
export async function submitReview(
  gradingResultId: string,
  criteria: ReviewCriterion[],
): Promise<{ finalScore: number }> {
  const { data, error, response } = await apiClient.POST(
    '/grading-results/{id}/review',
    { params: { path: { id: gradingResultId } }, body: { criteria } },
  );
  if (error || !response.ok) throw fail(error, response);
  return data as unknown as { finalScore: number };
}

/**
 * Chốt điểm cả phiên. 409 khi còn bài chưa duyệt xong; 400 khi phiên chưa chấm
 * bài nào. Gọi lần hai là vô hại — trả `{0, 0}`.
 */
export async function finalizeGrades(
  examSessionId: string,
): Promise<{ reviewedByHand: number; acceptedAsProposed: number }> {
  const { data, error, response } = await apiClient.POST(
    '/exam-sessions/{id}/finalize-grades',
    { params: { path: { id: examSessionId } } },
  );
  if (error || !response.ok) throw fail(error, response);
  return data as unknown as { reviewedByHand: number; acceptedAsProposed: number };
}

export async function listGradingResults(examSessionId: string): Promise<GradingResult[]> {
  const { data, error, response } = await apiClient.GET(
    '/exam-sessions/{id}/grading-results',
    { params: { path: { id: examSessionId } } },
  );
  if (error || !response.ok) throw fail(error, response);
  return data as unknown as GradingResult[];
}
