import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
} from 'class-validator';
import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';
import type { SemesterStatus } from '../entities/semester.entity';

const STATUSES: SemesterStatus[] = ['planned', 'active', 'closed'];
const SEMESTER_CODES = ['HK1', 'HK2', 'HE'] as const;

export class CreateSemesterDto {
  @IsUUID()
  academicYearId!: string;

  @IsIn(SEMESTER_CODES)
  code!: (typeof SEMESTER_CODES)[number];

  @IsString()
  @Length(1, 100)
  name!: string;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @IsIn(STATUSES)
  status!: SemesterStatus;
}

export class UpdateSemesterDto {
  @IsOptional()
  @IsUUID()
  academicYearId?: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  name?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsIn(STATUSES)
  status?: SemesterStatus;
}

export class ListSemestersDto {
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
  @IsIn(STATUSES)
  status?: SemesterStatus;

  @IsOptional()
  @IsString()
  search?: string;
}
