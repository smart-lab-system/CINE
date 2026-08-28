import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class SeatUpsertItemDto {
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsString()
  @Matches(/^[A-Za-z0-9._-]{1,32}$/)
  seatCode!: string;

  @IsOptional()
  @IsUUID()
  workstationId?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  rowNo?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  columnNo?: number | null;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  positionX!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  positionY!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-360)
  @Max(360)
  rotationDegrees?: number;

  @IsOptional()
  @IsIn(['rect', 'circle', 'diamond'])
  shape?: 'rect' | 'circle' | 'diamond';

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isDisabled?: boolean;

  @IsOptional()
  @IsString()
  notes?: string | null;
}

export class BulkUpsertSeatsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SeatUpsertItemDto)
  seats!: SeatUpsertItemDto[];
}
