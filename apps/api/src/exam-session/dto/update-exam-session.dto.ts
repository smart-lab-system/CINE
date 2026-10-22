import { Type } from 'class-transformer';
import {
  IsDate,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  ValidateIf,
} from 'class-validator';
import { ExamType } from '../entities/exam-session.entity';

const EXAM_TYPES: ExamType[] = ['TK', 'GK', 'CK'];

/**
 * PATCH hẹp — loại thi, phòng, khung giờ, và chỉ khi chưa freeze roster.
 * Không mở `semesterId` / `classId` / tên / deliverables.
 */
export class UpdateExamSessionDto {
  @IsOptional()
  @IsIn(EXAM_TYPES)
  examType?: ExamType;

  @IsOptional()
  @IsUUID()
  roomId?: string;

  @ValidateIf((o: UpdateExamSessionDto) => !o.roomId && o.roomName !== undefined)
  @IsString()
  @Length(1, 150)
  roomName?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  startTime?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  endTime?: Date;
}
