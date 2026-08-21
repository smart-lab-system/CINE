import { IsDateString, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';

export class UpdateStudentDto {
  @IsOptional()
  @IsString()
  @Length(1, 150)
  fullName?: string;

  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @IsOptional()
  @IsString()
  @Length(1, 50)
  classCode?: string;

  @IsOptional()
  @IsInt()
  @Min(1900)
  @Max(2200)
  cohortYear?: number;
}
