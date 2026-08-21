import { IsOptional, IsString, Length } from 'class-validator';

export class UpdateCourseSectionDto {
  @IsOptional()
  @IsString()
  @Length(1, 50)
  nominalClassCode?: string;

  @IsOptional()
  @IsString()
  @Length(1, 200)
  name?: string;
}
