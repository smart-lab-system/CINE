import { ApiProperty } from '@nestjs/swagger';

export class LabViewDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ nullable: true, type: String })
  building!: string | null;

  @ApiProperty({ nullable: true, type: String })
  floor!: string | null;

  @ApiProperty()
  capacity!: number;

  @ApiProperty({ nullable: true, type: String })
  description!: string | null;

  @ApiProperty()
  isActive!: boolean;
}

export class LabsListResponseDto {
  @ApiProperty({ type: [LabViewDto] })
  items!: LabViewDto[];

  @ApiProperty()
  total!: number;
}

export class CreateLabResponseDto {
  @ApiProperty()
  id!: string;
}
