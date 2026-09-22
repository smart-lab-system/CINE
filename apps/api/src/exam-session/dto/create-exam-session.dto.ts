import {
  ArrayMaxSize,
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
  ValidateNested,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { plainToInstance, Transform } from 'class-transformer';
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

/** `.zip`/`.rar` là hai định dạng duy nhất hỗ trợ kiểm nội dung bên trong —
 *  spec 2026-09-21-archive-content-validation-design.md §3.4/§8.4. */
export const ARCHIVE_EXTENSIONS = ['.zip', '.rar'] as const;

/** Trần số file KHAI BÁO bên trong một deliverable — khác hẳn trần 20.000
 *  mục ĐỌC ĐƯỢC TỪ FILE NÉN ở archive-check.constants.ts (spec §6.2). Cái
 *  này chặn một biểu mẫu không dùng nổi, cái kia chặn cạn bộ nhớ. */
export const MAX_ENTRIES_PER_DELIVERABLE = 20;

/**
 * File phải nằm BÊN TRONG một deliverable dạng nén chỉ có nghĩa khi
 * deliverable đó thật sự là `.zip`/`.rar`. Khai entries cho một `.docx` là
 * một hiểu lầm, và nhận im lặng rồi không kiểm gì còn tệ hơn từ chối —
 * giảng viên sẽ tin hệ thống đang canh một thứ nó không canh.
 */
@ValidatorConstraint({ name: 'EntriesOnlyOnArchive', async: false })
class EntriesOnlyOnArchiveConstraint implements ValidatorConstraintInterface {
  validate(entries: string[] | undefined, args: ValidationArguments): boolean {
    if (!entries || entries.length === 0) {
      return true;
    }
    const { filename } = args.object as RequiredFilenameDto;
    const lower = (filename ?? '').toLowerCase();
    return ARCHIVE_EXTENSIONS.some((ext) => lower.endsWith(ext));
  }

  defaultMessage(): string {
    return `Chỉ khai được file bên trong cho deliverable ${ARCHIVE_EXTENSIONS.join(' hoặc ')}`;
  }
}

/**
 * Duplicate filenames pass every other check individually valid but
 * collide on the DB's unique index (uq_required_deliverable_session_filename)
 * at insert time, which surfaces as a 409 the frontend can't explain to the
 * user ("why did creating a session fail?" for what's really "you typed the
 * same filename twice"). Catch it here as a 400 instead, matching Zod's
 * client-side .refine() for the same rule.
 *
 * Phần tử giờ là `RequiredFilenameDto`, không phải chuỗi trần, nên
 * `@ArrayUnique()` (so bằng `===`, luôn "khác nhau" giữa hai object khác
 * instance dù cùng filename) không dùng được nữa — so theo `.filename`.
 *
 * PHẢI khai `@ValidatorConstraint()` và là một class TOP-LEVET, không phải
 * class expression khai ngay trong `@Validate(...)`: `getFromContainer()`
 * bên trong `Validate()` chỉ thật sự gọi `validate()` khi constraint đã
 * được đăng ký qua decorator đó — đã đo trực tiếp: một class ẩn danh không
 * `@ValidatorConstraint()` khai inline trong `@Validate()` KHÔNG BAO GIỜ
 * được gọi (`validate()` không chạy, lỗi không bao giờ sinh ra), dù hàm
 * luôn `return false`. Ba constraint phía trên cùng file này
 * (`IsAfterStartTimeConstraint` …) đều theo đúng khuôn ở đây.
 */
@ValidatorConstraint({ name: 'UniqueRequiredFilenames', async: false })
class UniqueFilenamesConstraint implements ValidatorConstraintInterface {
  validate(items: RequiredFilenameDto[] | undefined): boolean {
    if (!Array.isArray(items)) {
      return true;
    }
    const names = items.map((item) =>
      typeof item === 'string' ? item : item?.filename,
    );
    return new Set(names).size === names.length;
  }

  defaultMessage(): string {
    return 'requiredFilenames không được trùng tên file';
  }
}

/**
 * Một tên file bắt buộc, cộng theo tuỳ chọn danh sách file phải nằm bên
 * trong nếu bản thân nó là một file nén — spec
 * `2026-09-21-archive-content-validation-design.md` §8.4.
 *
 * `CreateExamSessionDto.requiredFilenames` nhận cả chuỗi trần (tương thích
 * ngược — hiểu là "không khai file bên trong") lẫn dạng object này; xem
 * `@Transform` trên trường đó.
 */
export class RequiredFilenameDto {
  @IsString()
  // A declared name is either a literal filename or a pattern with tokens
  // the server fills per student ({MSSV}, {TEN}, {PHONG}, {SOMAY}). The
  // pattern form carries the SAME path-traversal rules — it is
  // SAFE_FILENAME_REGEX plus the tokens, not a looser check — and a token
  // nobody defined is rejected here rather than reaching an agent as a
  // literal "{LOP}" in a filename.
  @Matches(FILENAME_TEMPLATE_REGEX, {
    message:
      'Tên file chỉ được chứa chữ, số, "_", "-", "." và các ô {MSSV} {TEN} {PHONG} {SOMAY}',
  })
  // Matches required_deliverable.required_filename's varchar(255) column —
  // without this, an overlong filename passes DTO validation and hits the
  // DB's own length truncation error, which PostgresExceptionFilter has no
  // mapping for (falls through to a bare 500 instead of 400).
  @MaxLength(255)
  filename!: string;

  /**
   * Tên các file phải nằm BÊN TRONG, mỗi cái là một MẪU y hệt `filename` —
   * chịu cùng `FILENAME_TEMPLATE_REGEX`, nên token `{MSSV} {TEN} {PHONG}
   * {SOMAY}` dùng được (spec §5.2). Ký tự "/" vẫn bị cấm: phép đối chiếu
   * khớp theo TÊN, kệ thư mục (spec §3.2), nên khai đường dẫn là vô nghĩa.
   *
   * Tuỳ chọn, và không có nghĩa nào khác ngoài "danh sách kỳ vọng bên
   * trong" — không có cờ bật/tắt riêng, mảng rỗng/undefined = không kiểm.
   */
  @IsOptional()
  @IsArray()
  // Trùng thì lọt qua mọi phép kiểm riêng lẻ rồi chết ở unique index dưới
  // DB, nổi lên thành 409 mà frontend không giải thích được — cùng lý do
  // đã áp cho requiredFilenames ở dưới.
  @ArrayUnique()
  @ArrayMaxSize(MAX_ENTRIES_PER_DELIVERABLE)
  @IsString({ each: true })
  @Matches(FILENAME_TEMPLATE_REGEX, {
    each: true,
    message:
      'Tên file bên trong chỉ được chứa chữ, số, "_", "-", "." và các ô {MSSV} {TEN} {PHONG} {SOMAY}',
  })
  @MaxLength(255, { each: true })
  @Validate(EntriesOnlyOnArchiveConstraint)
  entries?: string[];
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

  /**
   * Phòng thi, dạng VĂN BẢN. Giảng viên gõ, không chọn từ danh sách.
   *
   * GIÁ PHẢI TRẢ, ghi ở spec §3.4: `ex_exam_session_room_overlap` vẫn chạy
   * (GiST cộng btree_gist làm việc với text y như với uuid), nhưng nó SUY
   * GIẢM từ bảo đảm xuống nỗ lực tốt nhất — "P.A101" và "P A101" là hai
   * phòng khác nhau với Postgres, nên gõ lệch một ký tự là đặt trùng phòng
   * mà không gì bắt được.
   */
  @IsString()
  @Length(1, 150)
  roomName!: string;

  /**
   * Học kỳ, dạng VĂN BẢN, chụp một lần lúc tạo phiên (§7.1.5).
   *
   * Trước đây suy ra từ `course.semester_id`. Cả hai bảng đã biến mất, và
   * bảng điểm lọc thẳng trên chuỗi này — nên nó không đổi theo khi ai đó
   * gõ tên học kỳ khác ở một phiên sau.
   */
  @IsString()
  @Length(1, 150)
  semesterName!: string;

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
  @Validate(UniqueFilenamesConstraint)
  // Chuỗi trần vẫn nhận, hiểu là "không khai file bên trong" — giữ tương
  // thích ngược cho mọi chỗ gọi đã có (spec §8.4).
  //
  // Tự gọi `plainToInstance` NGAY TRONG transform này, không dựa vào
  // `@Type()`: `@Transform` thay thế hoàn toàn bước chuyển kiểu mặc định
  // của property, nên nếu chỉ trả về object thường thì `@ValidateNested`
  // sau đó nhận một plain object chứ không phải instance của
  // `RequiredFilenameDto` — class-validator không tìm được metadata của
  // lớp trên một plain object, và mọi validation bên trong lặng lẽ biến
  // thành no-op (`unknownValue`, đã đo được khi thử `@Type()` riêng).
  @Transform(({ value }) =>
    Array.isArray(value)
      ? value.map((item: unknown) =>
          plainToInstance(
            RequiredFilenameDto,
            typeof item === 'string' ? { filename: item } : item,
          ),
        )
      : value,
  )
  @ValidateNested({ each: true })
  requiredFilenames!: RequiredFilenameDto[];
}
