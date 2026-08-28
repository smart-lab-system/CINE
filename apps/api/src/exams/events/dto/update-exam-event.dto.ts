import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class UpdateExamEventDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  rowVersion!: number;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9._-]{2,64}$/)
  code?: string;

  @IsOptional()
  @IsString()
  @Length(1, 250)
  title?: string;

  @IsOptional()
  @IsIn(['exam', 'practice'])
  sessionType?: 'exam' | 'practice';

  @IsOptional()
  @IsDateString()
  scheduledStartAt?: string;

  @IsOptional()
  @IsDateString()
  scheduledEndAt?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(32767)
  durationMinutes?: number;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  policyTemplateDocumentId?: string | null;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  policySnapshotDocumentId?: string | null;
}
