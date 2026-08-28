import {
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
} from 'class-validator';

export class CreateLecturerDto {
  @IsString()
  @Matches(/^[A-Za-z0-9._-]{2,32}$/)
  employeeCode!: string;

  @IsString()
  @Length(1, 150)
  fullName!: string;

  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsString()
  @Length(1, 150)
  department?: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  academicTitle?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[+]?[0-9 ()-]{8,20}$/)
  phone?: string;
}
