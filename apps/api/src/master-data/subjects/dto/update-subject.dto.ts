import { IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';

export class UpdateSubjectDto {
  @IsOptional()
  @IsString()
  @Length(1, 200)
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(30)
  credits?: number;

  @IsOptional()
  @IsString()
  description?: string;
}
