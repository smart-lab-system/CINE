import { IsIn, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import type { NominalClassStatus } from '../entities/nominal-class.entity';

const STATUSES: NominalClassStatus[] = ['active', 'inactive'];
/** Năm khóa: 2000 … năm hiện tại + 1 (tính lúc process load). */
const COHORT_YEAR_MAX = new Date().getFullYear() + 1;

export class CreateNominalClassDto {
  @IsString()
  @Length(1, 50)
  code!: string;

  @IsOptional()
  @IsString()
  @Length(1, 150)
  name?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(COHORT_YEAR_MAX)
  cohortYear?: number | null;

  @IsIn(STATUSES)
  status!: NominalClassStatus;
}

export class UpdateNominalClassDto {
  @IsOptional()
  @IsString()
  @Length(1, 150)
  name?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(COHORT_YEAR_MAX)
  cohortYear?: number | null;

  @IsOptional()
  @IsIn(STATUSES)
  status?: NominalClassStatus;
}

export class ListNominalClassesDto {
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
  status?: NominalClassStatus;

  @IsOptional()
  @IsString()
  search?: string;
}
