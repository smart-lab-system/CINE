import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Min,
} from 'class-validator';
import {
  EXAM_FILE_ROLES,
  ExamFileRole,
} from '../../entities/exam-event-file.entity';

export class AttachFileDto {
  @IsUUID()
  storedObjectId!: string;

  @IsIn(EXAM_FILE_ROLES)
  fileRole!: ExamFileRole;

  @IsOptional()
  @IsString()
  @Length(1, 250)
  title?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
