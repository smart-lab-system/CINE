import { apiClient } from '@/lib/api-client';

// Mirrors CreateExamSessionDto
// (apps/api/src/exam-session/dto/create-exam-session.dto.ts). Hand-written
// rather than imported from `@cine/shared`, matching how account-form.tsx
// mirrors CreateAccountDto — `apiClient.POST`'s generic argument still
// structurally checks this against the generated schema at the call site
// below, so a drift here is still a compile error, just not an import one.
export interface CreateExamSessionInput {
  name: string;
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
  courseId: string | null;
  startTime: string;
  endTime: string;
  status: string;
  requiredDeliverables: RequiredDeliverableResponse[];
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
  // openapi-fetch only fills `error` from the response *body*, which some
  // failures leave empty — key off the status too, same reasoning as
  // apps/web/src/app/admin/accounts/page.tsx's GET /accounts call.
  if (error || !response.ok) {
    throw error ?? new Error(`Yêu cầu thất bại (HTTP ${response.status})`);
  }
  // Cast needed for the same reason as the accounts page's GET /accounts
  // cast: ExamSessionEntity.status/RequiredDeliverableEntity.deliverableType
  // are custom string-union types with no `@ApiProperty({ enum: ... })`, so
  // the Swagger CLI plugin generated `Record<string, never>` for them
  // instead of a string type — a DTO-decoration gap, not a real runtime
  // shape mismatch (the JSON body genuinely has `status: "draft"` etc.).
  return data as unknown as ExamSessionResponse;
}
