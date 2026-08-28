import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class CreateSubjectDto {
  @IsString()
  @Matches(/^[A-Za-z0-9._-]{2,32}$/)
  code!: string;

  @IsString()
  @Length(1, 200)
  name!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(30)
  credits?: number;

  @IsOptional()
  @IsString()
  description?: string;
}
