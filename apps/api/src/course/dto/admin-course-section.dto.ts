import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { STUDENT_MSSV_REGEX } from '../../common/student-mssv';

export class CreateCourseSectionDto {
  @IsUUID()
  courseId!: string;

  @IsUUID()
  semesterId!: string;

  /** Mã lớp (`course.code` + 001/002/…) do server tự sinh — client không gửi. */

  @IsOptional()
  @IsUUID()
  teacherId?: string;

  /** Lớp danh nghĩa catalog — tuỳ chọn. */
  @IsOptional()
  @IsUUID()
  nominalClassId?: string;
}

export class UpdateCourseSectionDto {
  @IsOptional()
  @IsUUID()
  courseId?: string;

  @IsOptional()
  @IsUUID()
  semesterId?: string;

  /**
   * uuid = gắn / đổi lớp danh nghĩa; `null` = gỡ; omit = không đổi.
   * Đổi nominal không cần lớp “mutable” (khác môn/kỳ) — chỉ gắn nhầm lúc tạo.
   */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  nominalClassId?: string | null;
}

export class AssignCourseSectionDto {
  @IsUUID()
  teacherId!: string;
}

export class ListCourseSectionsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 20;

  @IsOptional()
  @IsUUID()
  academicYearId?: string;

  @IsOptional()
  @IsUUID()
  semesterId?: string;

  @IsOptional()
  @IsUUID()
  courseId?: string;

  @IsOptional()
  @IsUUID()
  teacherId?: string;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  unassigned?: boolean;

  /** Tìm theo tên giảng viên hoặc mã lớp. */
  @IsOptional()
  @IsString()
  q?: string;
}

/** Thêm SV: catalog `studentId` hoặc gõ tay mssv+name. */
export class AddCourseSectionStudentDto {
  @IsOptional()
  @IsUUID()
  studentId?: string;

  @ValidateIf((o: AddCourseSectionStudentDto) => !o.studentId)
  @IsString()
  @Matches(STUDENT_MSSV_REGEX, {
    message: 'MSSV phải gồm 4-20 chữ cái hoặc chữ số, không có dấu cách',
  })
  mssv?: string;

  @ValidateIf((o: AddCourseSectionStudentDto) => !o.studentId)
  @IsString()
  @Length(1, 150)
  name?: string;
}
