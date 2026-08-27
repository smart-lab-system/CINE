import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { AccountRole } from '../../identity/entities/account.entity';

const ACCOUNT_ROLES: AccountRole[] = ['admin', 'teacher', 'super_admin', 'department_admin'];

export class SearchAccountsDto {
  @IsOptional()
  @IsString()
  search?: string;

  // Admin accounts UI's role filter (Phase 1 of the frontend rebuild).
  // Exact match only, same ACCOUNT_ROLES list as Create/UpdateAccountDto.
  @IsOptional()
  @IsIn(ACCOUNT_ROLES)
  role?: AccountRole;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 20;
}
