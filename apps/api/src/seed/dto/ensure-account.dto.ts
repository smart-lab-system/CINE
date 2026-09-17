import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';
import { AccountRole } from '../../identity/entities/account.entity';

const SEEDABLE_ROLES: AccountRole[] = [
  'admin',
  'teacher',
  'department_admin',
];

export class EnsureAccountDto {
  @IsString()
  @Length(1, 150)
  name!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @Length(8, 128)
  password!: string;

  @IsIn(SEEDABLE_ROLES)
  role!: AccountRole;

  /** When true, overwrite password on an existing match. Default false. */
  @IsOptional()
  @IsBoolean()
  updatePassword?: boolean;

  /** When true, overwrite role on an existing match. Default false. */
  @IsOptional()
  @IsBoolean()
  updateRole?: boolean;
}
