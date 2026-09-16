import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
  Validate,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { ExamType } from '../entities/exam-session.entity';
// Cả hai regex tên file đều lấy từ đây. SAFE_FILENAME_REGEX từng được
// khai ngay trong file này và filename-template.ts import ngược lại —
// một vòng lặp mà CommonJS gỡ theo thứ tự nạp, và khi gỡ sai thì
// `@Matches(undefined)` bên dưới nhận MỌI tên file. Xem doc comment của
// SAFE_FILENAME_REGEX.
import { FILENAME_TEMPLATE_REGEX } from '../filename-template';

const EXAM_TYPES: ExamType[] = ['TK', 'GK', 'CK'];

@ValidatorConstraint({ name: 'IsAfterStartTime', async: false })
class IsAfterStartTimeConstraint implements ValidatorConstraintInterface {
  validate(endTime: string, args: ValidationArguments): boolean {
    const { startTime } = args.object as CreateExamSessionDto;
    const start = new Date(startTime).getTime();
    const end = new Date(endTime).getTime();
    return Number.isFinite(start) && Number.isFinite(end) && end > start;
  }

  defaultMessage(): string {
    return 'endTime must be a valid ISO8601 date after startTime';
  }
}

// QA-reported gap: nothing stopped a teacher from creating a session a few
// seconds long. 15 minutes is the minimum a student can plausibly join,
// read the instructions, and submit anything at all.
export const MIN_EXAM_DURATION_MINUTES = 15;
const MIN_EXAM_DURATION_MS = MIN_EXAM_DURATION_MINUTES * 60 * 1000;

/**
 * How far into the past `startTime` may be declared.
 *
 * Not zero. The realistic case is a lecturer who forgot to create the
 * session, whose exam is already under way, and who is now entering the
 * time it actually started — refusing that would push them into recording
 * a start time they know is wrong. What this does refuse is a session
 * backdated far enough that it is describing a different event: an exam
 * last week, or a window chosen to sit around a room booking that has
 * already passed.
 */
export const MAX_BACKDATE_MINUTES = 30;
const MAX_BACKDATE_MS = MAX_BACKDATE_MINUTES * 60 * 1000;

@ValidatorConstraint({ name: 'IsNotExcessivelyBackdated', async: false })
class IsNotExcessivelyBackdatedConstraint implements ValidatorConstraintInterface {
  validate(startTime: string): boolean {
    const start = new Date(startTime).getTime();
    if (!Number.isFinite(start)) {
      // @IsISO8601 already reports this field; a second message about the
      // same value would only compete with it.
      return true;
    }
    return start >= Date.now() - MAX_BACKDATE_MS;
  }

  defaultMessage(): string {
    return `startTime must not be more than ${MAX_BACKDATE_MINUTES} minutes in the past`;
  }
}

@ValidatorConstraint({ name: 'HasMinimumDuration', async: false })
class HasMinimumDurationConstraint implements ValidatorConstraintInterface {
  validate(endTime: string, args: ValidationArguments): boolean {
    const { startTime } = args.object as CreateExamSessionDto;
    const start = new Date(startTime).getTime();
    const end = new Date(endTime).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      // Not this constraint's problem to report — IsAfterStartTimeConstraint
      // (or IsISO8601) already fails the field for that, and stacking a
      // second, contradictory message ("too short" on a negative duration)
      // would only confuse whoever reads the 400 response.
      return true;
    }
    return end - start >= MIN_EXAM_DURATION_MS;
  }

  defaultMessage(): string {
    return `endTime must be at least ${MIN_EXAM_DURATION_MINUTES} minutes after startTime`;
  }
}

export class CreateExamSessionDto {
  @IsString()
  @Length(1, 200)
  name!: string;

  /**
   * The class sitting this exam. Replaces `courseId`, which is now derived
   * from it server-side: a lecturer is scoped by `class.teacher_id`, so
   * naming the class is both the choice they actually make and the thing
   * that can be checked against them.
   *
   * Taking a course from the body would additionally let a session name a
   * course its class does not belong to — and every enrollment check after
   * that would be asking about the wrong one.
   */
  @IsUUID()
  classId!: string;

  @IsUUID()
  roomId!: string;

  /**
   * Rubric dùng để chấm phiên này — quyết định lúc ra đề, không tra lại lúc
   * chấm (spec 2026-09-05-session-pinned-rubric §1.2).
   *
   * Tuỳ chọn: §3.1 của kế hoạch tổng thể nói "gắn rubric chấm điểm (nếu dùng
   * AI chấm)", nên phiên không chấm bằng AI vẫn tạo, thi và thu bài bình
   * thường — chỉ "Bắt đầu chấm" là bị chặn tới khi có rubric.
   */
  @IsOptional()
  @IsUUID()
  rubricId?: string;

  @IsIn(EXAM_TYPES)
  examType!: ExamType;

  @IsISO8601()
  @Validate(IsNotExcessivelyBackdatedConstraint)
  startTime!: string;

  @IsISO8601()
  @Validate(IsAfterStartTimeConstraint)
  @Validate(HasMinimumDurationConstraint)
  endTime!: string;

  @IsArray()
  @ArrayMinSize(1)
  // Duplicate filenames pass every other check here (each string is
  // individually valid) but collide on the DB's unique index
  // (uq_required_deliverable_session_filename) at insert time, which
  // surfaces as a 409 the frontend can't explain to the user ("why did
  // creating a session fail?" for what's really "you typed the same
  // filename twice"). Catch it here as a 400 instead, matching Zod's
  // client-side .refine() for the same rule.
  @ArrayUnique()
  @IsString({ each: true })
  // A declared name is either a literal filename or a pattern with tokens
  // the server fills per student ({MSSV}, {TEN}, {PHONG}, {SOMAY}). The
  // pattern form carries the SAME path-traversal rules — it is
  // SAFE_FILENAME_REGEX plus the tokens, not a looser check — and a token
  // nobody defined is rejected here rather than reaching an agent as a
  // literal "{LOP}" in a filename.
  @Matches(FILENAME_TEMPLATE_REGEX, {
    each: true,
    message:
      'Tên file chỉ được chứa chữ, số, "_", "-", "." và các ô {MSSV} {TEN} {PHONG} {SOMAY}',
  })
  // Matches required_deliverable.required_filename's varchar(255) column —
  // without this, an overlong filename passes DTO validation and hits the
  // DB's own length truncation error, which PostgresExceptionFilter has no
  // mapping for (falls through to a bare 500 instead of 400).
  @MaxLength(255, { each: true })
  requiredFilenames!: string[];
}
