import { ApiProperty } from '@nestjs/swagger';
import {
  STUDENT_STATUSES,
  type StudentStatus,
} from '../../entities/student.entity';

export class StudentViewDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ nullable: true, type: String })
  userId!: string | null;

  @ApiProperty()
  studentCode!: string;

  @ApiProperty()
  fullName!: string;

  @ApiProperty({ enum: STUDENT_STATUSES })
  status!: StudentStatus;
}

export class StudentsListResponseDto {
  @ApiProperty({ type: [StudentViewDto] })
  items!: StudentViewDto[];

  @ApiProperty()
  total!: number;
}

export class CreateStudentResponseDto {
  @ApiProperty()
  id!: string;
}
