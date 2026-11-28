import { Type } from 'class-transformer';
import {
  IsDate,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
  Validate,
  ValidateIf,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { ExamType } from '../entities/exam-session.entity';
import {
  EXAM_DURATION_OPTIONS,
  MAX_SCHOOL_PERIOD,
  MIN_SCHOOL_PERIOD,
} from '../school-periods';

const EXAM_TYPES: ExamType[] = ['TK', 'GK', 'CK'];

@ValidatorConstraint({ name: 'IsUpdateEndPeriodOnOrAfterStart', async: false })
class IsUpdateEndPeriodOnOrAfterStartConstraint implements ValidatorConstraintInterface {
  validate(endPeriod: number, args: ValidationArguments): boolean {
    const { startPeriod } = args.object as UpdateExamSessionDto;
    if (startPeriod === undefined || endPeriod === undefined) {
      return true;
    }
    if (!Number.isInteger(startPeriod) || !Number.isInteger(endPeriod)) {
      return true;
    }
    return endPeriod >= startPeriod;
  }

  defaultMessage(): string {
    return 'endPeriod must be greater than or equal to startPeriod';
  }
}

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

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(MIN_SCHOOL_PERIOD)
  @Max(MAX_SCHOOL_PERIOD)
  startPeriod?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(MIN_SCHOOL_PERIOD)
  @Max(MAX_SCHOOL_PERIOD)
  @Validate(IsUpdateEndPeriodOnOrAfterStartConstraint)
  endPeriod?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([...EXAM_DURATION_OPTIONS])
  durationMinutes?: number;
}
