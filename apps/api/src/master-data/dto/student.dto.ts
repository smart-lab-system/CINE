import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';
import type { StudentStatus } from '../entities/student.entity';

const STATUSES: StudentStatus[] = ['active', 'inactive', 'graduated', 'withdrawn'];

export class CreateStudentDto {
  @IsString()
  @Matches(/^[A-Za-z0-9]{4,20}$/)
  mssv!: string;

  @IsString()
  @Length(1, 150)
  fullName!: string;

  @IsUUID()
  nominalClassId!: string;

  @IsIn(STATUSES)
  status!: StudentStatus;
}

export class UpdateStudentDto {
  @IsOptional()
  @IsString()
  @Length(1, 150)
  fullName?: string;

  @IsOptional()
  @IsUUID()
  nominalClassId?: string;

  @IsOptional()
  @IsIn(STATUSES)
  status?: StudentStatus;
}

export class ListStudentsDto {
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
  nominalClassId?: string;

  @IsOptional()
  @IsIn(STATUSES)
  status?: StudentStatus;

  @IsOptional()
  @IsString()
  search?: string;
}
