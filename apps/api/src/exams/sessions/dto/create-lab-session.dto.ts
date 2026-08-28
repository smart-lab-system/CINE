import {
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
} from 'class-validator';

export class CreateLabSessionDto {
  @IsString()
  @Matches(/^[A-Za-z0-9._-]{2,64}$/)
  code!: string;

  @IsString()
  @Length(1, 250)
  title!: string;

  @IsUUID()
  labId!: string;

  @IsUUID()
  layoutId!: string;

  @IsOptional()
  @IsDateString()
  scheduledStartAt?: string;

  @IsOptional()
  @IsDateString()
  scheduledEndAt?: string;
}
