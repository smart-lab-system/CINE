import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class RubricCriterionDto {
  @IsString()
  @Length(3, 1000)
  description!: string;

  /**
   * Two decimals, matching numeric(6,2) on the column. Bounded so one
   * criterion cannot carry a rubric whose total means nothing.
   */
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.25)
  @Max(100)
  maxPoints!: number;

  /** Tuỳ chọn: không khai thì server sinh từ mô tả (`assignCriterionKeys`). */
  @IsOptional()
  @Matches(/^[a-z0-9_]{1,64}$/, { message: 'key chỉ gồm chữ thường không dấu, số, "_" và tối đa 64 ký tự' })
  key?: string;
}

export class RubricApproachStepDto {
  @IsString()
  @Length(3, 1000)
  description!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.25)
  @Max(100)
  maxPoints!: number;

  /**
   * Bỏ qua khi lưu QS — server gán `{approachKey}_s{n}`. Giữ field để DTO cũ không 400.
   */
  @IsOptional()
  @Matches(/^[a-z0-9_]{1,64}$/, { message: 'key chỉ gồm chữ thường không dấu, số, "_" và tối đa 64 ký tự' })
  key?: string;
}

export class RubricApproachDto {
  @IsString()
  @Length(1, 200)
  name!: string;

  /** Tuỳ chọn: không khai thì server sinh từ tên hướng. */
  @IsOptional()
  @Matches(/^[a-z0-9_]{1,64}$/, { message: 'key chỉ gồm chữ thường không dấu, số, "_" và tối đa 64 ký tự' })
  key?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => RubricApproachStepDto)
  steps!: RubricApproachStepDto[];
}

export class SaveRubricDto {
  /**
   * Tên do giảng viên đặt, ví dụ "Giữa kỳ CTDL".
   *
   * Phiên bản đánh số theo (giảng viên, tên): lưu lại cùng tên = bản kế
   * tiếp; đổi tên = rubric mới ở bản 1.
   */
  @IsString()
  @Length(1, 200)
  name!: string;

  /**
   * Môn neo ngân hàng tiêu chí. Bắt buộc khi tạo chuỗi tên mới; khi tạo
   * version tiếp theo có thể bỏ — server kế thừa từ bản trước, hoặc nhận
   * giá trị mới nếu gửi.
   */
  @IsOptional()
  @IsUUID()
  courseId?: string;

  /**
   * Mặc định `qa` — hành vi cũ. `qs` yêu cầu `approaches` và bỏ qua `criteria`
   * phẳng (server dựng tiêu chí từ bước từng hướng).
   */
  @IsOptional()
  @IsIn(['qa', 'qs'])
  kind?: 'qa' | 'qs';

  /**
   * Bắt buộc khi kind = qa (hoặc không khai kind). Khi kind = qs có thể bỏ trống.
   */
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => RubricCriterionDto)
  criteria?: RubricCriterionDto[];

  /** Bắt buộc khi kind = qs. */
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => RubricApproachDto)
  approaches?: RubricApproachDto[];
}
