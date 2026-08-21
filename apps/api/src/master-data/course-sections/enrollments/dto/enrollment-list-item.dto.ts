import { ApiProperty } from '@nestjs/swagger';

export class EnrollmentStudentRefDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  studentCode!: string;

  @ApiProperty()
  fullName!: string;
}

export class EnrollmentListItemDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  enrolledAt!: Date;

  @ApiProperty({ type: EnrollmentStudentRefDto })
  student!: EnrollmentStudentRefDto;
}

export class PaginatedEnrollmentsDto {
  @ApiProperty({ type: [EnrollmentListItemDto] })
  items!: EnrollmentListItemDto[];

  @ApiProperty()
  total!: number;
}
