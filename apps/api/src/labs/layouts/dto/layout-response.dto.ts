import { ApiProperty } from '@nestjs/swagger';

export class SeatViewDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  layoutId!: string;

  @ApiProperty()
  labId!: string;

  @ApiProperty({ nullable: true, type: String })
  workstationId!: string | null;

  @ApiProperty()
  seatCode!: string;

  @ApiProperty({ nullable: true, type: Number })
  rowNo!: number | null;

  @ApiProperty({ nullable: true, type: Number })
  columnNo!: number | null;

  @ApiProperty()
  positionX!: number;

  @ApiProperty()
  positionY!: number;

  @ApiProperty()
  rotationDegrees!: number;

  @ApiProperty({ enum: ['rect', 'circle', 'diamond'] })
  shape!: 'rect' | 'circle' | 'diamond';

  @ApiProperty()
  isDisabled!: boolean;

  @ApiProperty({ nullable: true, type: String })
  notes!: string | null;
}

export class LayoutViewDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  labId!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  versionNo!: number;

  @ApiProperty()
  canvasWidth!: number;

  @ApiProperty()
  canvasHeight!: number;

  @ApiProperty()
  isActive!: boolean;
}

export class LayoutDetailDto extends LayoutViewDto {
  @ApiProperty({ type: [SeatViewDto] })
  seats!: SeatViewDto[];
}

export class LayoutsListResponseDto {
  @ApiProperty({ type: [LayoutViewDto] })
  items!: LayoutViewDto[];

  @ApiProperty()
  total!: number;
}

export class CreateLayoutResponseDto {
  @ApiProperty()
  id!: string;
}

export class SeatsListResponseDto {
  @ApiProperty({ type: [SeatViewDto] })
  items!: SeatViewDto[];

  @ApiProperty()
  total!: number;
}
