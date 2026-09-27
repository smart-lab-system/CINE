import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsOptional, IsString, Length, Matches, MaxLength, ValidateNested } from 'class-validator';

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
}
