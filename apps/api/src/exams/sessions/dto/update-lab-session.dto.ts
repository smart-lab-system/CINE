import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Min,
} from 'class-validator';

export class UpdateLabSessionDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  rowVersion!: number;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9._-]{2,64}$/)
  code?: string;

  @IsOptional()
  @IsString()
  @Length(1, 250)
  title?: string;

  @IsOptional()
  @IsUUID()
  labId?: string;

  @IsOptional()
  @IsUUID()
  layoutId?: string;

  @IsOptional()
  @IsDateString()
  scheduledStartAt?: string;

  @IsOptional()
  @IsDateString()
  scheduledEndAt?: string;
}
