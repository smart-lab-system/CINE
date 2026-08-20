import { IsArray, IsEmail, IsIn, IsOptional, IsString, Length } from 'class-validator';

export class UpdateAccountDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @Length(1, 150)
  displayName?: string;

  @IsOptional()
  @IsIn(['pending', 'active', 'locked', 'disabled'])
  status?: 'pending' | 'active' | 'locked' | 'disabled';

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  roleCodes?: string[];
}
