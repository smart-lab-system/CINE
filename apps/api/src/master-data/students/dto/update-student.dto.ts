import { IsIn, IsOptional, IsString, IsUUID, Length } from 'class-validator';
import { STUDENT_STATUSES } from './create-student.dto';

export class UpdateStudentDto {
  @IsOptional()
  @IsString()
  @Length(1, 150)
  fullName?: string;

  @IsOptional()
  @IsUUID()
  userId?: string | null;

  @IsOptional()
  @IsIn(STUDENT_STATUSES)
  status?: (typeof STUDENT_STATUSES)[number];
}
