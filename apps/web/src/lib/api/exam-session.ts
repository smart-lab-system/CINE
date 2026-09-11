import { apiClient } from '@/lib/api-client';

export type ExamType = 'TK' | 'GK' | 'CK';

// Mirrors CreateExamSessionDto
// (apps/api/src/exam-session/dto/create-exam-session.dto.ts). Hand-written
// rather than imported from `@cine/shared`, matching how account-form.tsx
// mirrors CreateAccountDto — `apiClient.POST`'s generic argument still
// structurally checks this against the generated schema at the call site
// below, so a drift here is still a compile error, just not an import one.
export interface CreateExamSessionInput {
  name: string;
  /**
   * The class sitting this exam. The course is derived from it server-side:
   * a lecturer is scoped by `class.teacher_id`, so the class is both the
   * choice they make and the thing that can be checked against them.
   */
  classId: string;
  roomId: string;
  /**
   * Rubric để chấm phiên này, ghim ngay lúc tạo. Bỏ trống là hợp lệ: phiên
   * không chấm bằng AI vẫn thi và thu bài bình thường, và rubric gắn được
   * sau ở trang Chấm điểm cho tới khi bài đầu tiên được chấm.
   */
  rubricId?: string;
  examType: ExamType;
  /** ISO 8601 (e.g. `new Date(...).toISOString()`), not a raw <input> value. */
  startTime: string;
  /** ISO 8601, must be after `startTime`. */
  endTime: string;
  requiredFilenames: string[];
}

export interface RequiredDeliverableResponse {
  id: string;
  requiredFilename: string;
  deliverableType: string;
}

// Mirrors ExamSessionResponseDto
// (apps/api/src/exam-session/dto/exam-session-response.dto.ts).
export interface ExamSessionResponse {
  id: string;
  name: string;
  code: string;
  teacherId: string;
  courseId: string;
  /** Null only for sessions created before a session named a class. */
  classId: string | null;
  roomId: string;
  examType: ExamType;
  startTime: string;
  endTime: string;
  status: string;
  /**
   * Khi phiên rời `collecting`, và ai chốt.
   *
   * `completedBy === null` nghĩa là **không ai xác nhận** — lượt quét dự
   * phòng đã đóng phiên. Với phiên tạo trước 2026-09-11 thì cả hai đều
   * `null` và phải đọc là "không biết" (spec §9.3). Cả hai trường hợp
   * đều không có ai để xưng "bạn", nên dòng cảnh báo ở §7.3 không hiện.
   */
  completedAt: string | null;
  completedBy: string | null;
  requiredDeliverables: RequiredDeliverableResponse[];
}

// Mirrors ExamSessionListItemDto — deliberately leaner than
// ExamSessionResponse (no requiredDeliverables), matching the list
// endpoint's own lean query.
export interface ExamSessionListItem {
  id: string;
  name: string;
  code: string;
  courseName: string;
  className: string | null;
  roomName: string;
  examType: ExamType;
  startTime: string;
  endTime: string;
  status: string;
}

/**
 * Mirrors SubmissionStatusView
 * (apps/api/src/submission/submission.service.ts). `submittedAt` is an ISO
 * string over the wire; `fileSize` is a string because the column is a
 * bigint.
 */
export interface SubmissionStatusItem {
  studentMssv: string;
  studentNameInput: string;
  requiredDeliverableId: string;
  status: 'received' | 'validated' | 'collected' | 'invalid';
  submittedAt: string;
  fileSize: string | null;
  downloadUrl: string | null;
}

/**
 * Phải khớp `EXAM_SESSION_STATUSES` trong
 * apps/api/src/exam-session/dto/search-exam-sessions.dto.ts. Thiếu một
 * giá trị ở đây không gây lỗi build — nó chỉ làm mất hẳn một lựa chọn
 * khỏi dropdown lọc, vì `STATUS_FILTER_OPTIONS` sinh ra từ chính kiểu
 * này (xem teacher/exam-sessions/page.tsx).
 */
export type ExamSessionStatusFilter =
  | 'draft'
  | 'scheduled'
  | 'active'
  | 'collecting'
  | 'completed'
  | 'cancelled';

export interface SearchExamSessionsParams {
  page: number;
  pageSize: number;
  /** Matches session name OR code, case-insensitive. */
  search?: string;
  status?: ExamSessionStatusFilter;
  examType?: ExamType;
}

async function throwIfFailed(error: unknown, response: Response) {
  // openapi-fetch only fills `error` from the response *body*, which some
  // failures leave empty — key off the status too, same reasoning as
  // apps/web/src/app/admin/accounts/page.tsx's GET /accounts call.
  if (error || !response.ok) {
    throw error ?? new Error(`Yêu cầu thất bại (HTTP ${response.status})`);
  }
}

/**
 * Creates an exam session (and its required-deliverable rows, in one
 * server-side transaction). Throws on any non-2xx response or network
 * failure, so callers never receive a partial/undefined result — a
 * TanStack Query mutation wrapping this surfaces the failure via its own
 * `error`/`isError`.
 */
export async function createExamSession(
  body: CreateExamSessionInput,
): Promise<ExamSessionResponse> {
  const { data, error, response } = await apiClient.POST('/exam-sessions', { body });
  await throwIfFailed(error, response);
  // Cast needed: ExamSessionEntity.status/examType/RequiredDeliverableEntity
  // .deliverableType are custom string-union types with no
  // `@ApiProperty({ enum: ... })`, so the Swagger CLI plugin generated
  // `Record<string, never>` for them instead of a string type — a
  // DTO-decoration gap, not a real runtime shape mismatch.
  return data as unknown as ExamSessionResponse;
}

export async function listExamSessions(
  params: SearchExamSessionsParams,
): Promise<{ items: ExamSessionListItem[]; total: number }> {
  const { data, error, response } = await apiClient.GET('/exam-sessions', {
    params: { query: params },
  });
  await throwIfFailed(error, response);
  return data as unknown as { items: ExamSessionListItem[]; total: number };
}

/**
 * 404s if the session doesn't exist, 403s if the caller isn't its owner
 * (see ExamSessionService.findByIdForOwner) — both surface as a thrown
 * error, same convention as every other function here.
 */
export async function getExamSession(id: string): Promise<ExamSessionResponse> {
  const { data, error, response } = await apiClient.GET('/exam-sessions/{id}', {
    params: { path: { id } },
  });
  await throwIfFailed(error, response);
  return data as unknown as ExamSessionResponse;
}

/**
 * Manual "Chốt bài ngay". Shares ExamSessionService.finalizeExamSession
 * with the scheduled sweep server-side, so the two can never diverge.
 *
 * Idempotent: finalizing an already-completed session returns the same 200
 * with the same body and broadcasts nothing a second time. 403 if the
 * caller is not the owning teacher.
 */
export async function finalizeExamSession(id: string): Promise<ExamSessionResponse> {
  const { data, error, response } = await apiClient.POST('/exam-sessions/{id}/finalize', {
    params: { path: { id } },
  });
  await throwIfFailed(error, response);
  return data as unknown as ExamSessionResponse;
}

/**
 * "Xác nhận kết thúc" — `collecting → completed`, ghi tên người chốt.
 *
 * Khác `finalizeExamSession` ở trên, và hai nút này đứng cạnh nhau nên
 * chỗ khác biệt cần nói rõ: `finalize` nghĩa là "hết giờ, nộp đi" và đưa
 * phiên VÀO giai đoạn thu bài; cái này nghĩa là "tôi đã nhìn phòng,
 * xong" và đưa nó RA.
 *
 * KHÔNG chặn upload: bài vẫn được nhận tới `endTime + 30 phút` (spec
 * §3.1). Idempotent, 200.
 */
export async function confirmSessionEnd(id: string): Promise<ExamSessionResponse> {
  const { data, error, response } = await apiClient.POST('/exam-sessions/{id}/confirm-end', {
    params: { path: { id } },
  });
  await throwIfFailed(error, response);
  return data as unknown as ExamSessionResponse;
}

export interface RecollectResult {
  /** Số sinh viên đã dự thi mà chưa nộp đủ file bắt buộc. */
  missing: number;
  /** Số máy ĐÃ TRẢ LỜI trong 3 giây — không phải số lệnh đã gửi. */
  acknowledged: number;
  unreachable: number;
  /** Phần giảng viên hành động dựa vào, quan trọng hơn con số. */
  unreachableNames: string[];
}

/**
 * "Thu lại" — yêu cầu agent của những em chưa nộp đủ gửi lại bài.
 *
 * Bấm lại bao nhiêu lần cũng được: server không đổi trạng thái gì, và em
 * đã nộp giữa hai lần bấm tự rơi khỏi tập đích. 409 nếu phiên không ở
 * `collecting`.
 */
export async function recollectSubmissions(id: string): Promise<RecollectResult> {
  const { data, error, response } = await apiClient.POST('/exam-sessions/{id}/recollect', {
    params: { path: { id } },
  });
  await throwIfFailed(error, response);
  return data as unknown as RecollectResult;
}

/**
 * Everything collected so far. The page's live `lobby:submission_status`
 * events only cover what happens while it is open, so without this initial
 * fetch a refresh mid-exam would show an empty table with every file
 * already in storage.
 */
export async function listSubmissions(
  examSessionId: string,
): Promise<{ items: SubmissionStatusItem[] }> {
  const { data, error, response } = await apiClient.GET(
    '/exam-sessions/{examSessionId}/submissions',
    { params: { path: { examSessionId } } },
  );
  await throwIfFailed(error, response);
  return data as unknown as { items: SubmissionStatusItem[] };
}
