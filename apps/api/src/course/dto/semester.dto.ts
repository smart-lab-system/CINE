import { IsInt, IsOptional, Matches, Max, Min } from 'class-validator';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATE_MESSAGE = 'Ngày phải theo dạng yyyy-mm-dd';

/**
 * Kiểu và hình dạng ở đây; MỌI luật nghiệp vụ (kỳ 1–3, ngày có thật, ngày kết
 * thúc không trước ngày bắt đầu) nằm ở `semesterProblems` — một lớp kiểm tra
 * dùng chung với import (spec §6.2 nguyên tắc 6), không lặp lại ở decorator.
 */
export class CreateSemesterDto {
  @IsInt()
  @Min(2000)
  @Max(2999)
  academicYearStart!: number;

  @IsInt()
  term!: number;

  @Matches(ISO_DATE, { message: ISO_DATE_MESSAGE })
  startDate!: string;

  @Matches(ISO_DATE, { message: ISO_DATE_MESSAGE })
  endDate!: string;
}

export class UpdateSemesterDto {
  @IsOptional()
  @IsInt()
  @Min(2000)
  @Max(2999)
  academicYearStart?: number;

  @IsOptional()
  @IsInt()
  term?: number;

  @IsOptional()
  @Matches(ISO_DATE, { message: ISO_DATE_MESSAGE })
  startDate?: string;

  @IsOptional()
  @Matches(ISO_DATE, { message: ISO_DATE_MESSAGE })
  endDate?: string;
}
