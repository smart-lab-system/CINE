import { Type } from 'class-transformer';
import {
  IsDate,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  ValidateIf,
} from 'class-validator';

/**
 * PATCH hẹp — chỉ phòng + khung giờ, và chỉ khi chưa freeze roster.
 * Không mở `semesterId` / `classId` / deliverables (xem set-session-rubric.dto).
 */
export class UpdateExamSessionDto {
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
