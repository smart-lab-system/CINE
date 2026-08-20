import {
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';

export class CreateAccountDto {
  @IsString()
  @Matches(/^[A-Za-z0-9._-]{3,64}$/)
  username!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsString()
  @Length(8, 128)
  password!: string;

  @IsString()
  @Length(1, 150)
  displayName!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  roleCodes!: string[];
}
