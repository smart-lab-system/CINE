import { IsIn, IsOptional, IsString, IsUUID, Length, Matches } from 'class-validator';
import { STUDENT_STATUSES } from '../../entities/student.entity';

export { STUDENT_STATUSES };

export class CreateStudentDto {
  @IsString()
  @Matches(/^[A-Za-z0-9._-]{3,32}$/)
  studentCode!: string;

  @IsString()
  @Length(1, 150)
  fullName!: string;

  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsIn(STUDENT_STATUSES)
  status?: (typeof STUDENT_STATUSES)[number];
}
