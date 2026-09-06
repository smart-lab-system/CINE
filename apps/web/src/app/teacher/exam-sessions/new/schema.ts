import { z } from 'zod';

/**
 * The form's validation rules, kept out of `page.tsx` on purpose.
 *
 * A file under `app/` that Next treats as a route may only export
 * `default` plus the framework's own route config — anything else fails
 * the build with "does not satisfy the constraint '{ [x: string]: never }'".
 * The schema was exported from the page for its unit test, which broke
 * `next build` while `next dev` and `vitest` both stayed happy; it lives
 * here now so it can be exported and tested without being a route export.
 */

// Must stay byte-for-byte identical to FILENAME_TEMPLATE_REGEX in
// apps/api/src/exam-session/filename-template.ts. It is the old
// SAFE_FILENAME_REGEX plus the four tokens the server fills per student —
// the same character class and the same `(?!.*\.\.)` lookahead, so a
// pattern is held to exactly the path-traversal rules a literal name is. A
// mismatch here means the form accepts something the server 400s on.
const FILENAME_TEMPLATE_REGEX =
  /^(?!.*\.\.)(?:[A-Za-z0-9_.-]|\{(?:MSSV|TEN|PHONG|SOMAY)\})+$/;

export const EXAM_TYPES = ['TK', 'GK', 'CK'] as const;

// Must stay in sync with MIN_EXAM_DURATION_MINUTES in
// apps/api/src/exam-session/dto/create-exam-session.dto.ts — QA-reported
// gap: nothing stopped a teacher from creating a session a few seconds
// long. Catching it here means a teacher sees the message next to the
// field they need to fix, instead of a generic API-error banner after a
// round trip.
const MIN_EXAM_DURATION_MINUTES = 15;

// Must stay in sync with MAX_BACKDATE_MINUTES in the same backend DTO.
// Not zero: the lecturer who forgot to create the session and is entering
// the time the exam actually began is doing the right thing, and refusing
// them would only make them record a start time they know is false.
const MAX_BACKDATE_MINUTES = 30;

/**
 * What to show when POST /exam-sessions fails.
 *
 * The server's own message is the useful one — a room clash names the room
 * and the session already holding it, which is what tells the lecturer
 * what to change. This banner used to hardcode an explanation about
 * duplicate filenames, so every other failure was reported as the one
 * cause it wasn't.
 *
 * `message` arrives as a string for a single failure and as an array when
 * Nest's ValidationPipe rejects several fields at once.
 */
const FALLBACK_CREATE_ERROR =
  'Không tạo được phiên thi. Vui lòng kiểm tra lại thông tin và thử lại.';

export function describeCreateError(error: unknown): string {
  if (typeof error !== 'object' || error === null || !('message' in error)) {
    return FALLBACK_CREATE_ERROR;
  }
  const { message } = error;
  if (typeof message === 'string' && message.trim() !== '') {
    return message;
  }
  if (Array.isArray(message) && message.length > 0) {
    return message.join('. ');
  }
  return FALLBACK_CREATE_ERROR;
}

// Exported so the rule can be unit-tested directly against the schema
// (this form has no other test coverage yet — see page.test.tsx history).
export const createExamSessionSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Vui lòng nhập tên phiên thi')
      .max(200, 'Tên phiên thi tối đa 200 ký tự'),
    classId: z.string().uuid('Vui lòng chọn lớp thi'),
    roomId: z.string().uuid('Vui lòng chọn phòng thi'),
    /**
     * Rubric dùng để chấm phiên này — quyết định ở đây, lúc ra đề, chứ
     * không tra lại lúc bấm "Bắt đầu chấm". Tuỳ chọn: phiên không chấm bằng
     * AI vẫn tạo, thi và thu bài bình thường.
     *
     * `<Select>` trả '' khi chưa chọn gì. Không quy đổi thành undefined thì
     * một form hoàn toàn hợp lệ bị chặn bằng lỗi "uuid không hợp lệ", trong
     * khi người dùng không hề chọn gì sai.
     */
    rubricId: z
      .union([z.literal(''), z.string().uuid('Rubric không hợp lệ')])
      .optional()
      .transform((value) => (value === '' ? undefined : value)),
    examType: z.enum(EXAM_TYPES, { message: 'Vui lòng chọn loại kỳ thi' }),
    // Bound to <input type="datetime-local">, so this is the browser's
    // "YYYY-MM-DDTHH:mm" local-time string, not ISO 8601 yet — converted to
    // a real ISO string in onSubmit before it reaches the API (the backend's
    // @IsISO8601() needs a full ISO string, e.g. with seconds + offset).
    startTime: z.string().min(1, 'Vui lòng chọn thời gian bắt đầu'),
    endTime: z.string().min(1, 'Vui lòng chọn thời gian kết thúc'),
    requiredFilenames: z
      .array(
        z.object({
          value: z
            .string()
            .trim()
            .min(1, 'Tên file không được để trống')
            .regex(
              FILENAME_TEMPLATE_REGEX,
              'Chỉ được dùng chữ, số, "_", "-", "." và các ô {MSSV} {TEN} {PHONG} {SOMAY}',
            ),
        }),
      )
      .min(1, 'Cần khai báo ít nhất 1 file bắt buộc'),
  })
  .refine(
    (values) => {
      const start = new Date(values.startTime).getTime();
      const end = new Date(values.endTime).getTime();
      return Number.isFinite(start) && Number.isFinite(end) && end > start;
    },
    {
      message: 'Thời gian kết thúc phải sau thời gian bắt đầu',
      path: ['endTime'],
    },
  )
  // Mirrors the backend's IsNotExcessivelyBackdatedConstraint. Caught here
  // so the message lands on the field to fix rather than arriving as a 400
  // after a round trip.
  .refine(
    (values) => {
      const start = new Date(values.startTime).getTime();
      if (!Number.isFinite(start)) return true;
      return start >= Date.now() - MAX_BACKDATE_MINUTES * 60_000;
    },
    {
      message: `Thời gian bắt đầu không được sớm hơn hiện tại quá ${MAX_BACKDATE_MINUTES} phút`,
      path: ['startTime'],
    },
  )
  // Mirrors the backend's HasMinimumDurationConstraint. Skips entirely when
  // end <= start — that's the previous .refine()'s error to report, not a
  // "too short" message stacked on top of an already-invalid ordering.
  .refine(
    (values) => {
      const start = new Date(values.startTime).getTime();
      const end = new Date(values.endTime).getTime();
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return true;
      return end - start >= MIN_EXAM_DURATION_MINUTES * 60_000;
    },
    {
      message: `Phiên thi phải kéo dài ít nhất ${MIN_EXAM_DURATION_MINUTES} phút`,
      path: ['endTime'],
    },
  )
  // Mirrors the backend's @ArrayUnique() on requiredFilenames (see
  // create-exam-session.dto.ts) — without this, a duplicate filename
  // (a realistic typo: retyping the same name twice) passes every
  // per-field check here, reaches the API, and only then hits the DB's
  // unique index (uq_required_deliverable_session_filename), coming back
  // as a 409 the generic API-error banner can't explain. Catch it
  // client-side and point at exactly which entry is the duplicate.
  .refine(
    (values) => {
      const seen = new Set<string>();
      for (const filename of values.requiredFilenames) {
        if (seen.has(filename.value)) return false;
        seen.add(filename.value);
      }
      return true;
    },
    (values) => {
      const seen = new Set<string>();
      let duplicateIndex = -1;
      for (const [index, filename] of values.requiredFilenames.entries()) {
        if (seen.has(filename.value)) {
          duplicateIndex = index;
          break;
        }
        seen.add(filename.value);
      }
      const duplicateName = duplicateIndex === -1 ? '' : values.requiredFilenames[duplicateIndex].value;
      return {
        message: `Tên file "${duplicateName}" bị trùng — mỗi file bắt buộc phải có tên khác nhau.`,
        path:
          duplicateIndex === -1
            ? ['requiredFilenames']
            : ['requiredFilenames', duplicateIndex, 'value'],
      };
    },
  );

export type CreateExamSessionFormValues = z.infer<typeof createExamSessionSchema>;
