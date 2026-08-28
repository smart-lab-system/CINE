import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class CreateLabDto {
  @IsString()
  @Matches(/^[A-Za-z0-9._-]{2,32}$/)
  code!: string;

  @IsString()
  @Length(1, 150)
  name!: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  building?: string;

  @IsOptional()
  @IsString()
  @Length(1, 30)
  floor?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  capacity!: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
