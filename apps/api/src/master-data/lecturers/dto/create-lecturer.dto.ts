import { IsOptional, IsString, Length, Matches } from 'class-validator';

export class CreateLecturerDto {
  @IsString()
  @Matches(/^[A-Za-z0-9._-]{2,32}$/)
  employeeCode!: string;

  @IsString()
  @Length(1, 150)
  fullName!: string;

  @IsOptional()
  @IsString()
  @Length(1, 150)
  department?: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  academicTitle?: string;
}
