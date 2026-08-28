import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class CreateExamEventDto {
  @IsString()
  @Matches(/^[A-Za-z0-9._-]{2,64}$/)
  code!: string;

  @IsString()
  @Length(1, 250)
  title!: string;

  @IsUUID()
  subjectId!: string;

  @IsIn(['exam', 'practice'])
  sessionType!: 'exam' | 'practice';

  @IsDateString()
  scheduledStartAt!: string;

  @IsDateString()
  scheduledEndAt!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(32767)
  durationMinutes!: number;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  policyTemplateDocumentId?: string;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  policySnapshotDocumentId?: string;
}
