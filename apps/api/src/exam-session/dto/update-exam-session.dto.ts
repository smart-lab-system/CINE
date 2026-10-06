import { Transform } from 'class-transformer';
import { IsEmpty, IsIn, IsISO8601, IsOptional, IsString, IsUUID, Length, MaxLength, ValidateIf } from 'class-validator';
import type { ExamType } from '../entities/exam-session.entity';
import { EXAM_TYPES } from './create-exam-session.dto';

const CANNOT_EDIT = (what: string) =>
  `Không sửa được ${what} của phiên thi — hãy huỷ phiên và tạo lại.`;

/**
 * Sửa một phiên thi TRƯỚC giờ bắt đầu (spec §4.1). Mọi trường tuỳ chọn; các trường cấm được KHAI BÁO với `@IsEmpty` thay vì
 * để `whitelist` lặng lẽ cắt: một client tưởng đã đổi lớp mà không nhận lỗi nào là tệ hơn một lỗi, vì giảng viên sẽ vào phòng
 * thi với phiên sai lớp. `@IsEmpty` cũng giữ trường đó trong danh sách trắng nên `ValidationPipe` thấy nó và báo.
 *
 * Năm trường sửa được dùng `@ValidateIf(vắng mặt thì bỏ qua)` thay vì `@IsOptional`: `@IsOptional` bỏ qua cả `null`, và `roomId: null`
 * lọt tới service sẽ thành "đổi phòng" sang khoá rỗng. Ở đây `null` là một giá trị SAI và bị validator bắt như mọi giá trị sai.
 *
 * Giờ KHÔNG kiểm ở đây: luật "kết thúc sau bắt đầu / tối thiểu 15 phút" cần CẶP giá trị, mà một thân chỉ gửi một đầu thì phải
 * lấy đầu kia từ bản ghi — nên `exam-session-edit.rules.ts` kiểm sau khi ghép.
 */
export class UpdateExamSessionDto {
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @Length(1, 200)
  name?: string;

  /** Phòng thi: chọn trong phòng đang hoạt động. Không gửi nghĩa là giữ phòng hiện tại (kể cả khi nó đã bị tắt). */
  @ValidateIf((_, value) => value !== undefined)
  @IsUUID()
  roomId?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsISO8601()
  startTime?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsISO8601()
  endTime?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsIn(EXAM_TYPES)
  examType?: ExamType;

  // ---- Trường cấm: có mặt là 400 -------------------------------------------------------------------------------

  @IsEmpty({ message: CANNOT_EDIT('lớp') })
  classId?: unknown;

  @IsEmpty({ message: CANNOT_EDIT('danh sách file bắt buộc nộp') })
  requiredFilenames?: unknown;

  @IsEmpty({ message: 'Đổi giảng viên của phiên thi là việc của quản trị viên.' })
  teacherId?: unknown;

  @IsEmpty({ message: 'Rubric của phiên thi đổi ở màn hình chấm điểm, không phải ở đây.' })
  rubricId?: unknown;

  @IsEmpty({ message: 'Học kỳ của phiên thi lấy từ lớp, không sửa được — hãy huỷ phiên và tạo lại.' })
  semesterName?: unknown;

  @IsEmpty({ message: 'Phòng thi được chọn bằng roomId trong danh sách phòng, không gõ tên.' })
  roomName?: unknown;
}

/** Huỷ một phiên thi. Lý do tuỳ chọn, chỉ để ghi vào `audit_log` (spec §4.1: "ai huỷ, khi nào và lý do"). */
export class CancelExamSessionDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(200)
  reason?: string;
}
