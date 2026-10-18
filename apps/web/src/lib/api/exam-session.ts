import { apiClient } from '@/lib/api-client';

export type ExamType = 'TK' | 'GK' | 'CK';

/** Ngôn ngữ giảng viên khai cho một yêu cầu nộp code (`DECLARED_LANGUAGES` ở backend). */
export type DeclaredLanguage = 'python' | 'cpp' | 'java' | 'node';

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
  /** Catalog Id — dual-write snapshot `room.name` khi có. */
  roomId?: string;
  /** Text — bắt buộc khi không gửi `roomId`. */
  roomName?: string;
  /** Catalog Id — dual-write snapshot `semester.name` khi có. */
  semesterId?: string;
  /** Text — bắt buộc khi không gửi `semesterId`. */
  semesterName?: string;
  /**
   * Deprecated trên create (create-slim) — gắn qua hub / PATCH rubric.
   * Giữ optional cho client/e2e cũ.
   */
  rubricId?: string;
  examType: ExamType;
  /** ISO 8601 (e.g. `new Date(...).toISOString()`), not a raw <input> value. */
  startTime: string;
  /** ISO 8601, must be after `startTime`. */
  endTime: string;
  /**
   * Deprecated trên create (create-slim) — khai qua
   * `PUT /exam-sessions/:id/required-deliverables`. Optional / bỏ trống = 0 file.
   *
   * Backend chấp nhận cả chuỗi trần lẫn object (tương thích ngược — spec
   * archive §8.4); OpenAPI chỉ phản ánh dạng object.
   */
  requiredFilenames?: {
    filename: string;
    /** Mặc định `document` phía server khi bỏ trống (§14.1). */
    deliverableType?: 'document' | 'code_project' | 'image';
    /** Chỉ có ý nghĩa khi `deliverableType === 'code_project'`. */
    language?: DeclaredLanguage;
    entries?: string[];
  }[];
}

export interface RequiredDeliverableResponse {
  id: string;
  requiredFilename: string;
  deliverableType: 'document' | 'code_project' | 'image';
  /** Null = chưa khai. */
  language: DeclaredLanguage | null;
  /** Đường chấm do BACKEND tính (`pipelineFor`) — giao diện không tự suy ra từ `language`. */
  pipeline: 'investigator' | 'one_shot';
  /**
   * Tên các file phải nằm BÊN TRONG, nếu deliverable này là file nén và
   * giảng viên đã khai. Mảng rỗng = không khai file bên trong.
   */
  entries: string[];
}

// Mirrors ExamSessionResponseDto
// (apps/api/src/exam-session/dto/exam-session-response.dto.ts).
export interface ExamSessionResponse {
  id: string;
  name: string;
  code: string;
  teacherId: string;
  classId: string;
  /** FK catalog — null nếu tạo bằng text hoặc catalog đã xoá. */
  roomId: string | null;
  semesterId: string | null;
  /** Môn và phòng dạng VĂN BẢN, chụp lúc tạo phiên (dual-write). */
  courseName: string;
  roomName: string;
  semesterName: string;
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
  /** Rubric đã ghim — null nếu chưa gắn. */
  rubricId: string | null;
  rubricVersion?: number | null;
  /** Gói test đã ghim cho đường điều tra (§14.1) — null nếu chưa ghim. */
  testBundleId: string | null;
  requiredDeliverables: RequiredDeliverableResponse[];
  /** Có trên list; detail có thể không gửi — UI ưu tiên `status === 'scheduled'`. */
  rosterFrozen?: boolean;
}

// Mirrors ExamSessionListItemDto — deliberately leaner than
// ExamSessionResponse (no requiredDeliverables), matching the list
// endpoint's own lean query.
export interface ExamSessionListItem {
  id: string;
  name: string;
  code: string;
  courseName: string;
  className: string;
  roomName: string;
  semesterName: string;
  examType: ExamType;
  startTime: string;
  endTime: string;
  status: string;
  /** true nếu đã có session_roster (sau open / thêm tay). */
  rosterFrozen?: boolean;
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
  /** `not_submitted`/`absent` có từ 2026-09-11 (§7.1.2): dòng được gieo
   *  sẵn lúc mở phiên, nên "chưa nộp" không còn là sự VẮNG MẶT của một
   *  dòng. Xem SubmissionStatus ở apps/api. */
  status: 'not_submitted' | 'received' | 'validated' | 'collected' | 'invalid' | 'absent';
  /** `null` khi chưa có file nào bay về (`not_submitted`/`absent`).
   *  KHÔNG phải "không rõ giờ" — là "chưa có giờ nào để mà nói". */
  submittedAt: string | null;
  fileSize: string | null;
  downloadUrl: string | null;
  /** Lớp GỐC của sinh viên. Khác lớp của phiên nghĩa là THI BÙ. */
  homeClassId: string;
  homeClassName: string | null;
  /**
   * Kết quả kiểm nội dung file nén — spec
   * 2026-09-21-archive-content-validation-design.md §4.2/§7. Mirror
   * `ArchiveCheckStatus` (apps/api/src/submission/entities/submission.entity.ts).
   * `not_applicable` với mọi deliverable không khai file bên trong.
   */
  archiveCheckStatus: 'not_applicable' | 'pending' | 'passed' | 'failed' | 'unreadable';
  /** Chỉ khác `null` khi `archiveCheckStatus === 'failed'`. */
  archiveMissingEntries: string[] | null;
  /** Chỉ khác `null` khi `archiveCheckStatus === 'unreadable'`. */
  archiveCheckError: string | null;
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
  /**
   * Học kỳ mà phiên tự khai. Bỏ trống = tất cả học kỳ.
   *
   * `undefined`, KHÔNG phải `null`: openapi-fetch serialize null thành
   * `?semesterName=` và @Length ở backend sẽ trả 400 cho chuỗi rỗng đó.
   */
  semesterName?: string;
  /**
   * Lớp của phiên. Bỏ trống = mọi lớp.
   *
   * Phải đi lên SERVER, không lọc ở client: danh sách phân trang ở server,
   * nên lọc trên trang đang xem chỉ cắt 20 dòng và nói dối về tổng số.
   */
  classId?: string;
  /**
   * Khoảng ngày của chế độ LỊCH, ISO 8601, nửa mở `[from, to)`.
   *
   * Đi theo CẶP — gửi một mình là 400. Khi có mặt, server **bỏ phân trang**
   * (xem SearchExamSessionsDto ở apps/api): một lưới tuần phân trang 20 dòng
   * sẽ im lặng nuốt phiên thứ 21, và lịch thì không có nút "trang sau" để lộ
   * ra chuyện đó.
   */
  from?: string;
  to?: string;
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
  // Cast: OpenAPI schema có thể vẫn đánh dấu requiredFilenames bắt buộc
  // cho tới khi regenerate; runtime DTO đã optional (create-slim).
  const { data, error, response } = await apiClient.POST('/exam-sessions', {
    body: body as never,
  });
  await throwIfFailed(error, response);
  // Cast needed: ExamSessionEntity.status/examType/RequiredDeliverableEntity
  // .deliverableType are custom string-union types with no
  // `@ApiProperty({ enum: ... })`, so the Swagger CLI plugin generated
  // `Record<string, never>` for them instead of a string type — a
  // DTO-decoration gap, not a real runtime shape mismatch.
  return data as unknown as ExamSessionResponse;
}

export type ReplaceRequiredDeliverablesInput = {
  requiredFilenames: NonNullable<CreateExamSessionInput['requiredFilenames']>;
};

/** PUT file bắt buộc — chỉ khi `scheduled` (create-slim). */
export async function replaceRequiredDeliverables(
  id: string,
  body: ReplaceRequiredDeliverablesInput,
): Promise<ExamSessionResponse> {
  return examFetch<ExamSessionResponse>(`/exam-sessions/${id}/required-deliverables`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

async function examFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
  const { getAccessToken } = await import('@/lib/auth-token');
  const token = await getAccessToken();
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (res.status === 204) return undefined as T;
  if (!res.ok) {
    let message = `Yêu cầu thất bại (HTTP ${res.status})`;
    try {
      const body = (await res.json()) as { message?: string | string[] };
      const fromServer = Array.isArray(body.message)
        ? body.message.join('; ')
        : body.message;
      if (fromServer) message = fromServer;
    } catch {
      /* keep */
    }
    throw new Error(message);
  }
  if (res.headers.get('content-type')?.includes('json')) {
    return (await res.json()) as T;
  }
  return undefined as T;
}

/** PATCH phòng / khung giờ — chỉ khi chưa freeze. */
export async function updateExamSessionSchedule(
  id: string,
  body: {
    roomId?: string;
    roomName?: string;
    startTime?: string;
    endTime?: string;
  },
): Promise<ExamSessionResponse> {
  return examFetch(`/exam-sessions/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

/** Soft-cancel phiên nháp. */
export async function cancelExamSession(id: string): Promise<ExamSessionResponse> {
  return examFetch(`/exam-sessions/${id}/cancel`, { method: 'POST' });
}

export type SessionRosterSource = 'class' | 'frozen' | 'manual';

export interface SessionRosterStudent {
  mssv: string;
  name: string;
  source: SessionRosterSource;
}

export interface SessionRosterView {
  customized: boolean;
  students: SessionRosterStudent[];
}

export interface SessionRosterImportResult {
  added: number;
  updated: number;
  unchanged: number;
  removed: number;
  missing: Array<{ mssv: string; name: string }>;
}

/** Danh sách thi hiệu lực (lớp ảo hoặc session_roster). */
export async function listSessionRoster(
  examSessionId: string,
): Promise<SessionRosterView> {
  return examFetch(`/exam-sessions/${examSessionId}/roster`);
}

export async function materializeSessionRoster(
  examSessionId: string,
): Promise<SessionRosterView> {
  return examFetch(`/exam-sessions/${examSessionId}/roster/materialize`, {
    method: 'POST',
  });
}

export async function importSessionRoster(
  examSessionId: string,
  body: { students: Array<{ mssv: string; name: string }>; removeMissing: boolean },
): Promise<SessionRosterImportResult> {
  return examFetch(`/exam-sessions/${examSessionId}/roster/import`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function addSessionRosterStudent(
  examSessionId: string,
  student: { mssv: string; name: string },
): Promise<unknown> {
  return examFetch(`/exam-sessions/${examSessionId}/roster/students`, {
    method: 'POST',
    body: JSON.stringify(student),
  });
}

/** Gỡ SV khỏi session roster (`scheduled`: mọi source; `active`: chỉ manual). */
export async function removeSessionRosterStudent(
  examSessionId: string,
  studentMssv: string,
): Promise<void> {
  await examFetch(
    `/exam-sessions/${examSessionId}/roster/students/${encodeURIComponent(studentMssv)}`,
    { method: 'DELETE' },
  );
}

/**
 * Một TUẦN phiên thi, không phân trang — nguồn cho chế độ xem lịch.
 *
 * Là một hàm riêng chứ không phải `listExamSessions` với thêm hai tham số,
 * dù dưới gầm cùng một endpoint. Lý do: hợp đồng khác nhau ở chỗ quan trọng
 * nhất — cái này hứa trả về **mọi** phiên trong khoảng, còn cái kia trả về
 * một trang. Gộp chúng lại thì `total` mang hai nghĩa tuỳ tham số, và người
 * đọc phải tự suy ra nghĩa nào đang áp dụng.
 */
export async function listExamSessionsInRange(
  params: SearchExamSessionsParams & { from: string; to: string },
): Promise<{ items: ExamSessionListItem[]; total: number; semesterNames: string[] }> {
  return listExamSessions(params);
}

export async function listExamSessions(params: SearchExamSessionsParams): Promise<{
  items: ExamSessionListItem[];
  total: number;
  /**
   * MỌI học kỳ của giảng viên này, không chỉ các kỳ có trên trang đang
   * xem và không chịu ảnh hưởng của bộ lọc đang bật — đây là nguồn cho
   * dropdown. Một dropdown hẹp hơn thứ nó điều khiển là một lời nói dối.
   */
  semesterNames: string[];
}> {
  const { data, error, response } = await apiClient.GET('/exam-sessions', {
    params: { query: params },
  });
  await throwIfFailed(error, response);
  return data as unknown as {
    items: ExamSessionListItem[];
    total: number;
    semesterNames: string[];
  };
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
 * Khai ngôn ngữ của MỘT yêu cầu nộp code sau khi phiên đã tạo (G1 §3). 409 nếu phiên đã khoá chấm hoặc bài đã có
 * kết quả — câu của server hiện nguyên văn. `pipeline` trong kết quả do BACKEND tính.
 */
export async function declareDeliverableLanguage(
  examSessionId: string,
  deliverableId: string,
  language: DeclaredLanguage,
): Promise<{ id: string; language: DeclaredLanguage; pipeline: 'investigator' | 'one_shot' }> {
  const { data, error, response } = await apiClient.PATCH('/exam-sessions/{id}/deliverables/{deliverableId}', {
    params: { path: { id: examSessionId, deliverableId } },
    body: { language },
  });
  await throwIfFailed(error, response);
  return data as unknown as { id: string; language: DeclaredLanguage; pipeline: 'investigator' | 'one_shot' };
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

/** Kết quả đóng băng danh sách dự thi — xem SessionRosterService.freeze. */
export interface OpenSessionResult {
  /** Số sinh viên được chụp vào ảnh chốt. */
  students: number;
  /** Số dòng `not_submitted` được gieo sẵn (§7.1.2). 0 khi bấm lần hai. */
  submissionsSeeded: number;
}

/**
 * "Mở phiên thi" — đóng băng danh sách dự thi (CLAUDE.md §7.1.1).
 *
 * Cho tới khi `scheduled` thành trạng thái thật (§7.1.1b), đây là
 * đường DUY NHẤT để một phiên trở nên vào được: `agent:join` từ chối
 * mọi sinh viên khi `session_roster` còn rỗng. Phiên `active` ngay từ
 * lúc tạo, nên không có transition nào để móc việc chốt vào — và vì
 * thế "đang diễn ra" KHÔNG hàm ý "đã mở".
 *
 * Idempotent: bấm lần hai trả về đúng con số cũ với
 * `submissionsSeeded: 0`. 400 khi phiên không gắn lớp, hoặc lớp chưa
 * có sinh viên nào — cả hai đều kèm câu giải thích hiển thị được.
 */
export async function openSession(id: string): Promise<OpenSessionResult> {
  const { data, error, response } = await apiClient.POST('/exam-sessions/{id}/open', {
    params: { path: { id } },
  });
  await throwIfFailed(error, response);
  return data as unknown as OpenSessionResult;
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

export interface ArchiveRecheckResult {
  /** Bao nhiêu dòng được xếp lại vào hàng đợi — không phải số đã xong. */
  requeued: number;
}

/**
 * "Kiểm lại" — xếp lại các bài `failed`/`unreadable`/`pending` mồ côi vào
 * hàng đợi kiểm file nén, KHÔNG đụng file đã lưu. Bấm bao nhiêu lần cũng
 * được, cùng tính chất đọc-rồi-xếp-hàng như `recollectSubmissions`. Xem
 * ArchiveRecheckService (apps/api).
 */
export async function archiveRecheck(examSessionId: string): Promise<ArchiveRecheckResult> {
  const { data, error, response } = await apiClient.POST('/exam-sessions/{id}/archive-recheck', {
    params: { path: { id: examSessionId } },
  });
  await throwIfFailed(error, response);
  return data as unknown as ArchiveRecheckResult;
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
