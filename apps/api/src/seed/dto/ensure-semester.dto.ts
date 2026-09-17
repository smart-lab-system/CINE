import {
  IsBoolean,
  IsISO8601,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';

export class EnsureSemesterDto {
  @IsString()
  @Length(1, 150)
  name!: string;

  @IsISO8601()
  startDate!: string;

  @IsISO8601()
  endDate!: string;

  /** When true, overwrite dates on an existing match. Default false. */
  @IsOptional()
  @IsBoolean()
  updateDates?: boolean;
}
