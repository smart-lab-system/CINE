import {
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
} from 'class-validator';

export class UpdateLecturerDto {
  @IsOptional()
  @IsString()
  @Length(1, 150)
  fullName?: string;

  @IsOptional()
  @IsUUID()
  userId?: string | null;

  @IsOptional()
  @IsString()
  @Length(1, 150)
  department?: string | null;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  academicTitle?: string | null;

  @IsOptional()
  @IsEmail()
  email?: string | null;

  @IsOptional()
  @IsString()
  @Matches(/^[+]?[0-9 ()-]{8,20}$/)
  phone?: string | null;
}
