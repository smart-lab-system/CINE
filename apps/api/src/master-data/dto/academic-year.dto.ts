import { IsDateString, IsIn, IsOptional, IsString, Length } from 'class-validator';
import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';
import type { AcademicYearStatus } from '../entities/academic-year.entity';

const STATUSES: AcademicYearStatus[] = ['planned', 'active', 'closed'];

export class CreateAcademicYearDto {
  @IsString()
  @Length(1, 20)
  code!: string;

  @IsString()
  @Length(1, 100)
  name!: string;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @IsIn(STATUSES)
  status!: AcademicYearStatus;
}

export class UpdateAcademicYearDto {
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
  status?: AcademicYearStatus;
}

export class ListAcademicYearsDto {
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
  status?: AcademicYearStatus;
}
