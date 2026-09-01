import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Max, Min } from 'class-validator';
import { SubmissionStatus } from '../entities/submission.entity';

const SUBMISSION_STATUSES: SubmissionStatus[] = [
  'received',
  'validated',
  'collected',
  'invalid',
];

/**
 * QA-reported gap (point 6): "Tạo filter cho cả trang quản lý kỳ thi và
 * bài thu" — the second half, powering the new cross-session "Quản lý
 * bài thu" page (see TeacherSubmissionsController). Same shape/reasoning
 * as SearchExamSessionsDto: each filter is optional and AND-ed onto the
 * caller's own scope in the service, never past it.
 */
export class SearchSubmissionsDto {
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

  /** Matches student MSSV OR the name they typed, case-insensitive. */
  @IsOptional()
  @IsString()
  @Length(1, 200)
  search?: string;

  @IsOptional()
  @IsIn(SUBMISSION_STATUSES)
  status?: SubmissionStatus;

  /** Narrows to one exam session — a teacher usually cares about "this
   *  exam's submissions", not their whole collection history at once. */
  @IsOptional()
  @IsUUID()
  examSessionId?: string;
}
