import { IsEmail, IsIn, IsOptional, IsString, Length } from 'class-validator';
import { AccountRole } from '../../identity/entities/account.entity';

const ACCOUNT_ROLES: AccountRole[] = ['admin', 'teacher', 'academic_affairs', 'department_admin'];

export class UpdateAccountDto {
  @IsOptional()
  @IsString()
  @Length(1, 150)
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsIn(ACCOUNT_ROLES)
  role?: AccountRole;
}
