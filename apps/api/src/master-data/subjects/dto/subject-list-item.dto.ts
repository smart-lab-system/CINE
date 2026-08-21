import { ApiProperty } from '@nestjs/swagger';

export class SubjectListItemDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ nullable: true, type: Number })
  credits!: number | null;

  @ApiProperty({ nullable: true, type: String })
  description!: string | null;
}

export class PaginatedSubjectsDto {
  @ApiProperty({ type: [SubjectListItemDto] })
  items!: SubjectListItemDto[];

  @ApiProperty()
  total!: number;
}
