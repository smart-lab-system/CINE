import { IsIn, IsOptional, IsString, IsUUID, Length } from 'class-validator';
import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';
import type { CourseStatus } from '../entities/course.entity';

const STATUSES: CourseStatus[] = ['active', 'inactive'];

export class CreateCourseDto {
  @IsString()
  @Length(1, 50)
  code!: string;

  @IsString()
  @Length(1, 200)
  name!: string;

  @IsIn(STATUSES)
  status!: CourseStatus;
}

export class UpdateCourseDto {
  @IsOptional()
  @IsString()
  @Length(1, 200)
  name?: string;

  @IsOptional()
  @IsIn(STATUSES)
  status?: CourseStatus;
}

export class ListCoursesDto {
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
  @IsIn(STATUSES)
  status?: CourseStatus;

  @IsOptional()
  @IsString()
  search?: string;

  /** Scope cột đếm lớp/đề/rubric — không ẩn môn. */
  @IsOptional()
  @IsUUID()
  academicYearId?: string;

  @IsOptional()
  @IsUUID()
  semesterId?: string;
}

/** Filter hub đề/rubric theo năm / học kỳ (suy diễn ngày). */
export class CourseHubListQueryDto {
  @IsOptional()
  @IsUUID()
  academicYearId?: string;

  @IsOptional()
  @IsUUID()
  semesterId?: string;
}
