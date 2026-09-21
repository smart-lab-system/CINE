import { apiClient } from '@/lib/api-client';

/** Mirrors RubricView (apps/api/src/grading/rubric.service.ts). */
export interface Rubric {
  id: string;
  teacherId: string;
  /** Tên do giảng viên đặt. Thay vai trò định danh mà môn học từng giữ. */
  name: string;
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
  /**
   * Đoạn giảng viên tự bôi đen làm minh chứng, khi AI trích sai hoặc không
   * trích được. Đi cùng `verdict` và `points` của chính tiêu chí đó — server
   * đòi payload phủ đủ mọi tiêu chí, nên không có đường gán minh chứng mà
   * bỏ trống đánh giá.
   */
  pinnedEvidence?: string;
}

/** Mirrors AdvocateOpinion (apps/api/src/grading/ai-provider/advocate.types.ts). */
export interface AdvocateOpinion {
  isCorrect: 'yes' | 'partially' | 'no';
  /** Văn xuôi, viết cho giảng viên đọc — không phải cho máy parse. */
  reasoning: string;
  evidence: string[];
  suggestedVerdicts: {
    criterionId: string;
    suggestedVerdict: 'met' | 'partially_met' | 'not_met';
    why: string;
  }[];
  /**
   * Dẫn chứng KHÔNG định vị được trong bài.
   *
   * `null` = CHƯA đối chiếu, `[]` = đã đối chiếu và không mẩu nào trượt.
   * Hiển thị hai thứ đó giống nhau là sai đúng ở chỗ nguy hiểm nhất: lượt
   * phản biện đang lập luận để NÂNG điểm, và một giảng viên ở bài thứ 35
   * sẽ có xu hướng đồng ý.
   */
  unverifiedEvidence: string[] | null;
}

/** Một mẩu dẫn chứng đã được server định vị, theo offset TRONG MỘT ĐOẠN. */
export interface SubmissionTextSpan {
  criterionId: string;
  paragraph: number;
  start: number;
  end: number;
}

/**
 * Bài làm kèm toạ độ dẫn chứng.
 *
 * Client KHÔNG tự so chuỗi. Server đối chiếu trên cả bài đã làm phẳng, nên
 * chỉ nó mới định vị đúng được — kể cả trích dẫn vắt qua ranh giới đoạn.
 */
export interface SubmissionText {
  paragraphs: string[];
  spans: SubmissionTextSpan[];
  /** Tiêu chí có dẫn chứng nhưng không tìm thấy trong bài làm. */
  unlocatable: string[];
  /** Bài đã bị cắt LÚC CHẤM — phần sau đó model chưa bao giờ đọc. */
  truncatedByGrading: boolean;
}

export type ReadinessLevel = 'rubric_only' | 'with_question' | 'with_model_answer';

export interface GradingReadiness {
  level: ReadinessLevel;
  /** `null` khi đủ tài liệu. Chuỗi này để UI hiện nguyên văn. */
  warning: string | null;
  hasQuestion: boolean;
  hasModelAnswer: boolean;
}

/** Mirrors GradingResultView (apps/api/src/grading/grading.service.ts). */
export interface GradingResult {
  id: string;
  submissionId: string;
  studentMssv: string;
  studentName: string;
  /** Lớp GỐC của bài. Khác lớp của phiên nghĩa là THI BÙ. */
  homeClassId: string;
  homeClassName: string | null;
  status: string;
  modelUsed: string | null;
  aiTotalScore: number | null;
  confidence: number | null;
  flagForReview: boolean;
  /**
   * Vì sao AI KHÔNG chấm được bài này — `null` với mọi bài chấm bình
   * thường. Đã qua `describeError()` ở backend trước khi tới đây, an
   * toàn hiển thị thẳng: không chứa bài làm của sinh viên hay khoá API.
   */
  ungradableReason: string | null;
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
   * Ý kiến của lượt phản biện.
   *
   * `null` nghĩa là cổng KHÔNG kích hoạt — không có tiêu chí chưa đạt, hoặc
   * phiên chưa có đề bài. Khác hẳn "đã chạy và không bênh được gì", và màn
   * hình phải nói ra khác biệt đó thay vì vẽ một khối rỗng.
   */
  advocateOpinion: AdvocateOpinion | null;
  /**
   * Ngữ cảnh lượt chấm THỰC SỰ đọc được, không phải ngữ cảnh đã cấu hình.
   *
   * `null` = chấm trước khi hệ thống ghi lại điều này; `false` = đã đo và
   * không có. Hai giá trị đó dẫn tới hai câu khác nhau trên màn hình.
   */
  contextUsedQuestion: boolean | null;
  contextUsedModelAnswer: boolean | null;
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

export async function listRubrics(): Promise<Rubric[]> {
  const { data, error, response } = await apiClient.GET('/rubrics');
  if (error || !response.ok) throw fail(error, response);
  return data as unknown as Rubric[];
}

/**
 * Always a NEW version — there is no update endpoint, because editing
 * criteria that existing results cite is what Security rule 7 forbids.
 */
export async function saveRubric(
  name: string,
  criteria: { description: string; maxPoints: number }[],
): Promise<Rubric> {
  const { data, error, response } = await apiClient.POST('/rubrics', {
    body: { name, criteria },
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
  notes?: { privateNote?: string; studentFeedback?: string },
): Promise<{ finalScore: number }> {
  const { data, error, response } = await apiClient.POST(
    '/grading-results/{id}/review',
    {
      params: { path: { id: gradingResultId } },
      body: {
        criteria,
        // Bỏ trống thì KHÔNG gửi, để server lưu `null` thay vì chuỗi rỗng:
        // "đã viết rồi xoá" và "chưa bao giờ viết" là hai chuyện khác nhau
        // ở một trường tồn tại để tra lý do sáu tháng sau.
        ...(notes?.privateNote ? { privateNote: notes.privateNote } : {}),
        ...(notes?.studentFeedback ? { studentFeedback: notes.studentFeedback } : {}),
      },
    },
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

/**
 * Bài làm kèm vị trí dẫn chứng.
 *
 * Trả về toạ độ, không phải chuỗi thô để client tự tìm. Xem
 * `docs/superpowers/specs/2026-09-16-grading-ui-design.md` §5.2 cho lý do:
 * phép đối chiếu chạy trên cả bài đã làm phẳng, nên client chẻ đoạn rồi tự
 * so sẽ trượt đúng những trích dẫn vắt qua ranh giới đoạn — và báo "không
 * tìm thấy" cho câu mà hệ thống đã xác nhận có thật.
 */
export async function getSubmissionText(gradingResultId: string): Promise<SubmissionText> {
  const { data, error, response } = await apiClient.GET(
    '/grading-results/{id}/submission-text',
    { params: { path: { id: gradingResultId } } },
  );
  if (error || !response.ok) throw fail(error, response);
  return data as unknown as SubmissionText;
}

/** Mức ngữ cảnh mà phiên này sẽ được chấm với. */
export async function getGradingReadiness(examSessionId: string): Promise<GradingReadiness> {
  const { data, error, response } = await apiClient.GET(
    '/exam-sessions/{id}/grading-readiness',
    { params: { path: { id: examSessionId } } },
  );
  if (error || !response.ok) throw fail(error, response);
  return data as unknown as GradingReadiness;
}

export interface GradingReferenceInput {
  questionMaterialId?: string | null;
  modelAnswerStorageKey?: string | null;
  modelAnswerFilename?: string | null;
  modelAnswerNote?: string | null;
}

/**
 * Đặt tài liệu tham chiếu cho một phiên.
 *
 * BỎ TRỐNG một trường = GIỮ NGUYÊN; gửi `null` = XOÁ. Hai thứ đó khác nhau,
 * và gộp chúng sẽ khiến giảng viên chỉ sửa ghi chú lại mất luôn lựa chọn đề
 * bài — một mất mát họ không thấy cho tới lượt chấm sau.
 *
 * Server trả 409 khi phiên đã có kết quả chấm: từ lúc đó, đổi tài liệu là
 * viết lại ngữ cảnh mà những bài đã chấm đã dùng.
 */
export async function setGradingReference(
  examSessionId: string,
  body: GradingReferenceInput,
): Promise<void> {
  const { error, response } = await apiClient.PUT('/exam-sessions/{id}/grading-reference', {
    params: { path: { id: examSessionId } },
    body,
  });
  if (error || !response.ok) throw fail(error, response);
}

/**
 * Xin URL để tải đáp án mẫu thẳng lên kho.
 *
 * File KHÔNG đi qua API server (Security rule 5). Khoá do server cấp, client
 * không được tự đặt — một khoá tuỳ ý sẽ cho phép trỏ bản ghi này vào bất kỳ
 * object nào trong bucket.
 */
export async function requestAnswerKeyUpload(
  examSessionId: string,
): Promise<{ storageKey: string; uploadUrl: string; expiresIn: number }> {
  const { data, error, response } = await apiClient.POST(
    '/exam-sessions/{id}/grading-reference/answer-key-upload',
    { params: { path: { id: examSessionId } } },
  );
  if (error || !response.ok) throw fail(error, response);
  return data as unknown as { storageKey: string; uploadUrl: string; expiresIn: number };
}

/**
 * Xếp lại những bài kẹt ở `ai_grading` mà KHÔNG còn job sống.
 *
 * `stuck` là số bài đang kẹt, `requeued` là số bài thật sự được xếp lại —
 * hai con số có thể khác nhau, và trộn chúng sẽ báo cho giảng viên một
 * tiến độ chưa xảy ra.
 */
export async function regradeStuck(
  examSessionId: string,
): Promise<{ stuck: number; requeued: number }> {
  const { data, error, response } = await apiClient.POST(
    '/exam-sessions/{id}/regrade-stuck',
    { params: { path: { id: examSessionId } } },
  );
  if (error || !response.ok) throw fail(error, response);
  return data as unknown as { stuck: number; requeued: number };
}

export type BulkRule =
  | { kind: 'keep_ai' }
  | { kind: 'apply_advocate' }
  | { kind: 'criterion_full_marks'; criterionId: string }
  | { kind: 'criterion_bonus'; criterionId: string; points: number };

export type SkipReason = 'not_reviewable' | 'no_advocate' | 'unchanged';

export interface BulkReviewOutcome {
  applied: number;
  /**
   * LÝ DO, không chỉ số đếm.
   *
   * `skipped: 3` bắt giảng viên tự đi tìm ba bài nào trong bốn mươi lăm bài.
   */
  skipped: { resultId: string; reason: SkipReason }[];
  /** Bài đã công bố — mỗi bài một dòng nhật ký. */
  audited: number;
}

/**
 * Áp một luật cho nhiều bài.
 *
 * `resultIds` LUÔN tường minh, kể cả khi là cả phiên — "cho điểm tối đa cả
 * lớp" là thao tác mà *cả lớp* phải do người gửi khai ra, không do server suy.
 *
 * 400 khi có id không thuộc phiên, hoặc tiêu chí không thuộc rubric của phiên
 * — cả hai đều KHÔNG áp gì cả.
 */
export async function bulkReview(
  examSessionId: string,
  body: { resultIds: string[]; rule: BulkRule; privateNote?: string },
): Promise<BulkReviewOutcome> {
  const { data, error, response } = await apiClient.POST('/exam-sessions/{id}/bulk-review', {
    params: { path: { id: examSessionId } },
    body: body as never,
  });
  if (error || !response.ok) throw fail(error, response);
  return data as unknown as BulkReviewOutcome;
}
