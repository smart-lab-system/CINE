import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { COURSE_EXAM_LANGUAGES, COURSE_EXAM_TYPES } from '../exam-bank.constants';

export class ExamBankQuestionDto {
  @IsOptional()
  @IsString()
  @Length(1, 200)
  title?: string;

  @IsString()
  @Length(1, 50000)
  statement!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.25)
  @Max(100)
  points!: number;

  /** Rubric QS gắn câu — tuỳ chọn; phải thuộc GV và kind=qs. */
  @IsOptional()
  @IsUUID()
  rubricId?: string | null;
}

export class CreateCourseExamDto {
  @IsUUID()
  courseId!: string;

  @IsIn([...COURSE_EXAM_TYPES])
  examType!: (typeof COURSE_EXAM_TYPES)[number];

  /** Playground language / project stack — bắt buộc. */
  @IsIn([...COURSE_EXAM_LANGUAGES])
  language!: (typeof COURSE_EXAM_LANGUAGES)[number];

  /** Tổng điểm đề (trần). Phải ≥ tổng điểm các câu. */
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1000)
  totalPoints!: number;

  /** Mô tả dùng chung cho toàn đề. Tuỳ chọn. */
  @IsOptional()
  @IsString()
  @Length(0, 20000)
  description?: string;

  /**
   * Phần phụ tiêu đề (sau tên môn), vd. folder DSA.
   * Server ghép: `Đề thi {loại} — {môn} — {titleDetail}`.
   */
  @IsOptional()
  @IsString()
  @Length(1, 120)
  titleDetail?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => ExamBankQuestionDto)
  questions!: ExamBankQuestionDto[];
}

export class UpdateCourseExamDto {
  @IsOptional()
  @IsIn([...COURSE_EXAM_TYPES])
  examType?: (typeof COURSE_EXAM_TYPES)[number];

  @IsOptional()
  @IsIn([...COURSE_EXAM_LANGUAGES])
  language?: (typeof COURSE_EXAM_LANGUAGES)[number];

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1000)
  totalPoints?: number;

  @IsOptional()
  @IsString()
  @Length(0, 20000)
  description?: string;

  @IsOptional()
  @IsIn(['draft', 'ready'])
  status?: 'draft' | 'ready';

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => ExamBankQuestionDto)
  questions?: ExamBankQuestionDto[];
}

export class ListCourseExamsQueryDto {
  @IsUUID()
  courseId!: string;
}

/** Import dsa_vi_03 → rubric QS + đề kho. */
export class ImportDsaVi03Dto {
  @IsUUID()
  courseId!: string;

  @IsOptional()
  @IsIn([...COURSE_EXAM_TYPES])
  examType?: (typeof COURSE_EXAM_TYPES)[number];

  @IsOptional()
  @IsIn([...COURSE_EXAM_LANGUAGES])
  language?: (typeof COURSE_EXAM_LANGUAGES)[number];

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(25)
  limit?: number;

  /** Xóa đề import cũ rồi tạo lại (mặc định true khi đã có đề marker). */
  @IsOptional()
  @IsBoolean()
  replace?: boolean;

  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}
