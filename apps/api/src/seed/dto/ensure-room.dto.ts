import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';

export class EnsureRoomDto {
  @IsString()
  @Length(1, 100)
  name!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  capacity?: number;

  /** When true, overwrite capacity on an existing match. Default false. */
  @IsOptional()
  @IsBoolean()
  updateCapacity?: boolean;
}
