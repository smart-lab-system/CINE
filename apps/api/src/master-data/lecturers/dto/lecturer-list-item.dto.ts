import { ApiProperty } from '@nestjs/swagger';

export class LecturerListItemDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  employeeCode!: string;

  @ApiProperty()
  fullName!: string;

  @ApiProperty({ nullable: true, type: String })
  department!: string | null;

  @ApiProperty({ nullable: true, type: String })
  academicTitle!: string | null;
}

export class PaginatedLecturersDto {
  @ApiProperty({ type: [LecturerListItemDto] })
  items!: LecturerListItemDto[];

  @ApiProperty()
  total!: number;
}
