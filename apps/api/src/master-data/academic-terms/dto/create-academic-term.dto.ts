import {
  IsBoolean,
  IsDateString,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';

export class CreateAcademicTermDto {
  @IsString()
  @Matches(/^[A-Za-z0-9._-]{2,32}$/)
  code!: string;

  @IsString()
  @Length(1, 150)
  name!: string;

  @IsDateString()
  startsOn!: string;

  @IsDateString()
  endsOn!: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
