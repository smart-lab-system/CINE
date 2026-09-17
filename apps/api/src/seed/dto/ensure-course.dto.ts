import { IsEmail, IsString, Length } from 'class-validator';

export class EnsureCourseDto {
  @IsString()
  @Length(2, 32)
  code!: string;

  @IsString()
  @Length(1, 200)
  name!: string;

  @IsString()
  @Length(1, 150)
  semesterName!: string;

  @IsEmail()
  departmentHeadEmail!: string;
}
