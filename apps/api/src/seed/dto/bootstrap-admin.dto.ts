import { IsEmail, IsString, Length } from 'class-validator';

export class BootstrapAdminDto {
  @IsString()
  @Length(1, 150)
  name!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @Length(8, 128)
  password!: string;
}
