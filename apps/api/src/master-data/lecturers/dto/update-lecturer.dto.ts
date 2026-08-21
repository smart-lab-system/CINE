import { IsOptional, IsString, Length } from 'class-validator';

export class UpdateLecturerDto {
  @IsOptional()
  @IsString()
  @Length(1, 150)
  fullName?: string;

  @IsOptional()
  @IsString()
  @Length(1, 150)
  department?: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  academicTitle?: string;
}
