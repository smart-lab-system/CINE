import { IsBoolean, IsEmail, IsOptional, IsString, Length } from 'class-validator';

export class EnsureClassDto {
  @IsString()
  @Length(2, 32)
  courseCode!: string;

  @IsString()
  @Length(1, 150)
  semesterName!: string;

  @IsString()
  @Length(1, 100)
  name!: string;

  @IsEmail()
  teacherEmail!: string;

  /** When true, reassign teacher on mismatch. Default false → 409. */
  @IsOptional()
  @IsBoolean()
  reassignTeacher?: boolean;
}
