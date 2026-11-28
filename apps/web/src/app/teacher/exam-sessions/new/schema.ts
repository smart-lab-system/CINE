import { z } from 'zod';
import {
  EXAM_DURATION_OPTIONS,
  MAX_SCHOOL_PERIOD,
  MIN_SCHOOL_PERIOD,
  scheduleFromPeriodsAndDuration,
} from '@/lib/school-periods';

/**
 * The form's validation rules, kept out of `page.tsx` on purpose.
 *
 * A file under `app/` that Next treats as a route may only export
 * `default` plus the framework's own route config - anything else fails
 * the build with "does not satisfy the constraint '{ [x: string]: never }'".
 * The schema was exported from the page for its unit test, which broke
 * `next build` while `next dev` and `vitest` both stayed happy; it lives
 * here now so it can be exported and tested without being a route export.
 */

// Must stay byte-for-byte identical to FILENAME_TEMPLATE_REGEX in
// apps/api/src/exam-session/filename-template.ts. It is the old
// SAFE_FILENAME_REGEX plus the tokens the server fills per student -
// the same character class and the same `(?!.*\.\.)` lookahead, so a
// pattern is held to exactly the path-traversal rules a literal name is. A
// mismatch here means the form accepts something the server 400s on.
const FILENAME_TEMPLATE_REGEX =
  /^(?!.*\.\.)(?:[A-Za-z0-9_.-]|\{(?:MSSV|HOTEN|SOMAY)\})+$/;

// Phải khớp ARCHIVE_EXTENSIONS/MAX_ENTRIES_PER_DELIVERABLE trong
// apps/api/src/exam-session/dto/create-exam-session.dto.ts. Cùng cặp
// thông điệp lỗi - spec 2026-09-21-archive-content-validation-design.md
// §8.4/§9.1: khai file bên trong chỉ có nghĩa với deliverable .zip/.rar.
const ARCHIVE_EXTENSIONS = ['.zip', '.rar'] as const;
const MAX_ENTRIES_PER_DELIVERABLE = 20;

function isArchiveFilename(value: string): boolean {
  const lower = value.toLowerCase();
  return ARCHIVE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export const EXAM_TYPES = ['TK', 'GK', 'CK'] as const;

// Must stay in sync with MIN_EXAM_DURATION_MINUTES in
// apps/api/src/exam-session/dto/create-exam-session.dto.ts - QA-reported
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
 * The server's own message is the useful one - a room clash names the room
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

/** Mặc định một gói nộp trên hub Thư mục bài làm. */
export const DEFAULT_ARCHIVE_DELIVERABLE = '{SOMAY}_{MSSV}_{HOTEN}.zip';

/** Một dòng gói nộp (đúng 1 trên hub) - phải là .zip hoặc .rar. */
const requiredFilenameItemSchema = z
  .object({
    value: z
      .string()
      .trim()
      .min(1, 'Tên file không được để trống')
      .regex(
        FILENAME_TEMPLATE_REGEX,
        'Chỉ được dùng chữ, số, "_", "-", "." và các ô {MSSV} {HOTEN} {SOMAY}',
      )
      .refine((value) => isArchiveFilename(value), {
        message: `Gói nộp phải là file ${ARCHIVE_EXTENSIONS.join(' hoặc ')}`,
      }),
    deliverableType: z.enum(['document', 'code_project', 'image']).default('document'),
    language: z.enum(['python', 'cpp', 'java']).optional(),
    entries: z
      .array(
        z.object({
          value: z
            .string()
            .trim()
            .min(1, 'Tên file không được để trống')
            .regex(
              FILENAME_TEMPLATE_REGEX,
              'Tên file bên trong chỉ được chứa chữ, số, "_", "-", "." và các ô {MSSV} {HOTEN} {SOMAY}',
            ),
        }),
      )
      .max(
        MAX_ENTRIES_PER_DELIVERABLE,
        `Tối đa ${MAX_ENTRIES_PER_DELIVERABLE} file bên trong một deliverable`,
      )
      .optional(),
  })
  .refine(
    (item) => {
      if (!item.entries) return true;
      const seen = new Set<string>();
      for (const entry of item.entries) {
        if (seen.has(entry.value)) return false;
        seen.add(entry.value);
      }
      return true;
    },
    { message: 'Tên file bên trong bị trùng - mỗi file phải có tên khác nhau.', path: ['entries'] },
  )
  .refine((item) => item.deliverableType === 'code_project' || item.language === undefined, {
    message: 'Chỉ khai ngôn ngữ khi loại bài nộp là "Mã nguồn"',
    path: ['language'],
  });

/**
 * Đúng một gói nộp .zip|.rar trên hub (PUT …/required-deliverables).
 * Spec 2026-11-28-single-archive-deliverable-design.md.
 */
export const requiredFilenamesFormSchema = z
  .array(requiredFilenameItemSchema)
  .length(1, 'Mỗi phiên chỉ khai đúng một gói nộp .zip hoặc .rar');

export const replaceRequiredDeliverablesSchema = z.object({
  requiredFilenames: requiredFilenamesFormSchema,
});

export type ReplaceRequiredDeliverablesFormValues = z.infer<
  typeof replaceRequiredDeliverablesSchema
>;

// Exported so the rule can be unit-tested directly against the schema
// (this form has no other test coverage yet - see page.test.tsx history).
// create-slim: chỉ lịch + danh tính - không rubric / filenames.
export const createExamSessionSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Vui lòng nhập tên phiên thi')
      .max(200, 'Tên phiên thi tối đa 200 ký tự'),
    classId: z.string().uuid('Vui lòng chọn lớp thi'),
    /**
     * Dual-write: chọn catalog (Id) hoặc nhập tay (Name). Server ưu tiên Id
     * và chụp snapshot từ catalog.name. Overlap vẫn so khớp chuỗi text.
     */
    roomId: z
      .union([z.literal(''), z.string().uuid('Phòng không hợp lệ')])
      .optional()
      .transform((value) => (value === '' || value === undefined ? undefined : value)),
    roomName: z
      .string()
      .trim()
      .max(150, 'Tên phòng tối đa 150 ký tự')
      .optional()
      .or(z.literal('')),
    /**
     * Học kỳ suy từ lớp thi đã chọn (không còn ô chọn riêng trên form).
     * Giữ dual-write Id/Name để khớp DTO backend.
     */
    semesterId: z
      .union([z.literal(''), z.string().uuid('Học kỳ không hợp lệ')])
      .optional()
      .transform((value) => (value === '' || value === undefined ? undefined : value)),
    semesterName: z
      .string()
      .trim()
      .max(150, 'Tên học kỳ tối đa 150 ký tự')
      .optional()
      .or(z.literal('')),
    examType: z.enum(EXAM_TYPES, { message: 'Vui lòng chọn loại kỳ thi' }),
    /** `YYYY-MM-DD` từ <input type="date">. */
    examDate: z.string().min(1, 'Vui lòng chọn ngày thi'),
    startPeriod: z.coerce
      .number({ message: 'Vui lòng chọn tiết bắt đầu' })
      .int()
      .min(MIN_SCHOOL_PERIOD, 'Tiết bắt đầu từ 1 đến 16')
      .max(MAX_SCHOOL_PERIOD, 'Tiết bắt đầu từ 1 đến 16'),
    endPeriod: z.coerce
      .number({ message: 'Vui lòng chọn tiết kết thúc' })
      .int()
      .min(MIN_SCHOOL_PERIOD, 'Tiết kết thúc từ 1 đến 16')
      .max(MAX_SCHOOL_PERIOD, 'Tiết kết thúc từ 1 đến 16'),
    durationMinutes: z.coerce
      .number({ message: 'Vui lòng chọn thời lượng thi' })
      .refine(
        (value) => (EXAM_DURATION_OPTIONS as readonly number[]).includes(value),
        { message: 'Thời lượng thi phải là 45, 60, 75 hoặc 90 phút' },
      ),
  })
  .refine((values) => Boolean(values.roomId) || Boolean(values.roomName?.trim()), {
    message: 'Vui lòng chọn phòng thi',
    path: ['roomName'],
  })
  .refine((values) => Boolean(values.semesterId) || Boolean(values.semesterName?.trim()), {
    message: 'Lớp thi chưa gắn học kỳ - chọn lớp khác hoặc liên hệ quản trị viên',
    path: ['semesterName'],
  })
  .refine((values) => values.endPeriod >= values.startPeriod, {
    message: 'Tiết kết thúc phải từ tiết bắt đầu trở đi',
    path: ['endPeriod'],
  })
  .refine(
    (values) => {
      const mapped = scheduleFromPeriodsAndDuration(
        values.examDate,
        values.startPeriod,
        values.endPeriod,
        values.durationMinutes,
      );
      if (!mapped) return false;
      const start = new Date(mapped.startLocal).getTime();
      const end = new Date(mapped.endLocal).getTime();
      return Number.isFinite(start) && Number.isFinite(end) && end > start;
    },
    {
      message: 'Khung tiết phải đủ phủ thời gian thi đã chọn',
      path: ['endPeriod'],
    },
  )
  // Mirrors the backend's IsNotExcessivelyBackdatedConstraint. Caught here
  // so the message lands on the field to fix rather than arriving as a 400
  // after a round trip.
  .refine(
    (values) => {
      const mapped = scheduleFromPeriodsAndDuration(
        values.examDate,
        values.startPeriod,
        values.endPeriod,
        values.durationMinutes,
      );
      if (!mapped) return true;
      const start = new Date(mapped.startLocal).getTime();
      if (!Number.isFinite(start)) return true;
      return start >= Date.now() - MAX_BACKDATE_MINUTES * 60_000;
    },
    {
      message: `Thời gian bắt đầu không được sớm hơn hiện tại quá ${MAX_BACKDATE_MINUTES} phút`,
      path: ['examDate'],
    },
  )
  .refine(
    (values) => {
      const mapped = scheduleFromPeriodsAndDuration(
        values.examDate,
        values.startPeriod,
        values.endPeriod,
        values.durationMinutes,
      );
      if (!mapped) return true;
      const start = new Date(mapped.startLocal).getTime();
      const end = new Date(mapped.endLocal).getTime();
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return true;
      return end - start >= MIN_EXAM_DURATION_MINUTES * 60_000;
    },
    {
      message: `Phiên thi phải kéo dài ít nhất ${MIN_EXAM_DURATION_MINUTES} phút`,
      path: ['durationMinutes'],
    },
  );

export type CreateExamSessionFormValues = z.infer<typeof createExamSessionSchema>;

/** Map form → ISO start/end sau khi schema đã hợp lệ. */
export function formScheduleToIso(values: {
  examDate: string;
  startPeriod: number;
  endPeriod: number;
  durationMinutes: number;
}): { startTime: string; endTime: string } | null {
  const mapped = scheduleFromPeriodsAndDuration(
    values.examDate,
    values.startPeriod,
    values.endPeriod,
    values.durationMinutes,
  );
  if (!mapped) return null;
  return {
    startTime: new Date(mapped.startLocal).toISOString(),
    endTime: new Date(mapped.endLocal).toISOString(),
  };
}
