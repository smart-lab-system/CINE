import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Min,
} from 'class-validator';

export class CreateCourseSectionDto {
  @IsUUID()
  subjectId!: string;

  @IsUUID()
  academicTermId!: string;

  @IsString()
  @Matches(/^[A-Za-z0-9._-]{1,64}$/)
  sectionCode!: string;

  @IsOptional()
  @IsString()
  @Length(1, 50)
  nominalClassCode?: string;

  @IsOptional()
  @IsString()
  @Length(1, 200)
  name?: string;

  @IsOptional()
  @IsUUID()
  lecturerId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxEnrollment?: number;
}
