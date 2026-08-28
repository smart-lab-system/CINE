import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class TemplateSeatDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  x!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  y!: number;

  @IsString()
  @Matches(/^[A-Za-z0-9._-]{1,32}$/)
  label!: string;

  @IsOptional()
  @IsIn(['rect', 'circle', 'diamond'])
  shape?: 'rect' | 'circle' | 'diamond';

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-360)
  @Max(360)
  rotation?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  rowNo?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  columnNo?: number | null;
}

export class CreateSeatingTemplateDto {
  @IsString()
  @Length(1, 150)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  canvasWidth?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  canvasHeight?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => TemplateSeatDto)
  layoutData?: TemplateSeatDto[];
}
