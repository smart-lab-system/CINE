import { ApiProperty } from '@nestjs/swagger';

export class AcademicTermViewDto {
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

export class AcademicTermsListResponseDto {
  @ApiProperty({ type: [AcademicTermViewDto] })
  items!: AcademicTermViewDto[];

  @ApiProperty()
  total!: number;
}

export class CreateAcademicTermResponseDto {
  @ApiProperty()
  id!: string;
}
