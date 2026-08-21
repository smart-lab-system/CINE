import { ApiProperty } from '@nestjs/swagger';

export class StudentListItemDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  studentCode!: string;

  @ApiProperty()
  fullName!: string;

  @ApiProperty({ nullable: true, type: String })
  dateOfBirth!: string | null;

  @ApiProperty({ nullable: true, type: String })
  classCode!: string | null;

  @ApiProperty({ nullable: true, type: Number })
  cohortYear!: number | null;
}

export class PaginatedStudentsDto {
  @ApiProperty({ type: [StudentListItemDto] })
  items!: StudentListItemDto[];

  @ApiProperty()
  total!: number;
}
