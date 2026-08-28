import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Min,
} from 'class-validator';

export class UpdateCourseSectionDto {
  @IsOptional()
  @IsString()
  @Length(1, 50)
  nominalClassCode?: string | null;

  @IsOptional()
  @IsString()
  @Length(1, 200)
  name?: string | null;

  @IsOptional()
  @IsUUID()
  lecturerId?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxEnrollment?: number | null;
}
