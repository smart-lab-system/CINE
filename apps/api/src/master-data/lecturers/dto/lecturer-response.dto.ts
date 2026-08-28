import { ApiProperty } from '@nestjs/swagger';

export class LecturerViewDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ nullable: true, type: String })
  userId!: string | null;

  @ApiProperty()
  employeeCode!: string;

  @ApiProperty()
  fullName!: string;

  @ApiProperty({ nullable: true, type: String })
  department!: string | null;

  @ApiProperty({ nullable: true, type: String })
  academicTitle!: string | null;

  @ApiProperty({ nullable: true, type: String })
  email!: string | null;

  @ApiProperty({ nullable: true, type: String })
  phone!: string | null;
}

export class LecturersListResponseDto {
  @ApiProperty({ type: [LecturerViewDto] })
  items!: LecturerViewDto[];

  @ApiProperty()
  total!: number;
}

export class CreateLecturerResponseDto {
  @ApiProperty()
  id!: string;
}
