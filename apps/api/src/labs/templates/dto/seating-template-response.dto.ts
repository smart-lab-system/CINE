import { ApiProperty } from '@nestjs/swagger';

export class TemplateSeatViewDto {
  @ApiProperty()
  x!: number;

  @ApiProperty()
  y!: number;

  @ApiProperty()
  label!: string;

  @ApiProperty({ enum: ['rect', 'circle', 'diamond'] })
  shape!: 'rect' | 'circle' | 'diamond';

  @ApiProperty()
  rotation!: number;

  @ApiProperty({ nullable: true, type: Number })
  rowNo!: number | null;

  @ApiProperty({ nullable: true, type: Number })
  columnNo!: number | null;
}

export class SeatingTemplateListItemDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ nullable: true, type: String })
  description!: string | null;

  @ApiProperty()
  canvasWidth!: number;

  @ApiProperty()
  canvasHeight!: number;

  @ApiProperty()
  seatCount!: number;
}

export class SeatingTemplateViewDto extends SeatingTemplateListItemDto {
  @ApiProperty({ type: [TemplateSeatViewDto] })
  layoutData!: TemplateSeatViewDto[];
}

export class SeatingTemplatesListResponseDto {
  @ApiProperty({ type: [SeatingTemplateListItemDto] })
  items!: SeatingTemplateListItemDto[];

  @ApiProperty()
  total!: number;
}

export class CreateSeatingTemplateResponseDto {
  @ApiProperty()
  id!: string;
}
