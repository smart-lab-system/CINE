import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsOptional, IsString, IsUUID, Length, Matches, MaxLength, ValidateNested } from 'class-validator';

/** Khuôn `case_key` khớp CHECK của DB (`^[A-Za-z0-9_-]{1,64}$`). */
export const CASE_KEY_REGEX = /^[A-Za-z0-9_-]{1,64}$/;

export class TestCaseDto {
  @IsString()
  @Matches(CASE_KEY_REGEX, { message: 'caseKey chỉ gồm chữ, số, "_", "-", tối đa 64 ký tự' })
  caseKey!: string;

  @IsString()
  @Length(1, 100)
  group!: string;

  @IsString()
  input!: string;

  @IsString()
  expectedOutput!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  constraintQuote?: string;
}

export class CreateTestBundleDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => TestCaseDto)
  cases!: TestCaseDto[];

  /**
   * Gói gốc mà phiên bản này dẫn xuất (nút "Tạo phiên bản mới từ gói này"). Phiên bản mới kế thừa ORIGIN của gói gốc: gói do
   * hệ thống sinh vẫn mang nhãn đó sau khi giảng viên bỏ bớt ca. Phải thuộc đúng phiên (404 nếu không).
   */
  @IsOptional()
  @IsUUID()
  derivedFromBundleId?: string;

  /**
   * Câu mà gói này thuộc về (P1b). Vắng → câu mặc định của phiên, như trước P1b. Phải là câu của đúng phiên (404 nếu không).
   */
  @IsOptional()
  @IsUUID()
  problemId?: string;
}
