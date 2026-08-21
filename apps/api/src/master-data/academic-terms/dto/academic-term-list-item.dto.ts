import { ApiProperty } from '@nestjs/swagger';

export class AcademicTermListItemDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  startsOn!: string;

  @ApiProperty()
  endsOn!: string;

  @ApiProperty()
  isActive!: boolean;
}

export class PaginatedAcademicTermsDto {
  @ApiProperty({ type: [AcademicTermListItemDto] })
  items!: AcademicTermListItemDto[];

  @ApiProperty()
  total!: number;
}
