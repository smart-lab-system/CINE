import { IsEmail, IsIn, IsString, Length } from 'class-validator';
import { AccountRole } from '../../identity/entities/account.entity';

const ACCOUNT_ROLES: AccountRole[] = ['admin', 'teacher'];

export class CreateAccountDto {
  @IsString()
  @Length(1, 150)
  name!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @Length(8, 128)
  password!: string;

  @IsIn(ACCOUNT_ROLES)
  role!: AccountRole;
}
