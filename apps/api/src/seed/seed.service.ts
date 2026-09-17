import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as argon2 from 'argon2';
import { AccountsService } from '../accounts/accounts.service';
import { AuditLogService } from '../admin/audit-log.service';
import { AccountEntity, AccountRole } from '../identity/entities/account.entity';
import { BootstrapAdminDto } from './dto/bootstrap-admin.dto';
import { EnsureAccountDto } from './dto/ensure-account.dto';
import { SeedErrorCode, SeedEnsureResult } from './seed.types';

export type SeedAccountView = SeedEnsureResult<{
  name: string;
  email: string;
  role: AccountRole;
  isActive: boolean;
}>;

@Injectable()
export class SeedService {
  constructor(
    private readonly accountsService: AccountsService,
    private readonly auditLog: AuditLogService,
    @InjectRepository(AccountEntity)
    private readonly accounts: Repository<AccountEntity>,
  ) {}

  /**
   * Creates the first admin when `account` is empty (spec §5.3 / §6.1).
   * Public — no JWT. Refuses once any account exists.
   */
  async bootstrapAdmin(
    dto: BootstrapAdminDto,
  ): Promise<{ id: string; email: string; role: 'admin' }> {
    const count = await this.accounts.count();
    if (count > 0) {
      throw new ConflictException({
        code: SeedErrorCode.BOOTSTRAP_NOT_AVAILABLE,
        message: 'Bootstrap is only available when the account table is empty',
      });
    }

    const { id } = await this.accountsService.create({
      name: dto.name,
      email: dto.email,
      password: dto.password,
      role: 'admin',
    });

    await this.auditLog.recordUserAction({
      actorId: id,
      action: 'seed.bootstrap_admin',
      targetType: 'account',
      targetId: id,
      newValue: { email: dto.email, role: 'admin' },
    });

    return { id, email: dto.email, role: 'admin' };
  }

  /**
   * Ensure account by email (spec §6.2). Password/role change only when
   * the matching update* flag is true.
   */
  async ensureAccount(
    dto: EnsureAccountDto,
    actorId: string,
  ): Promise<SeedAccountView> {
    // DTO IsIn already blocks super_admin on create path; keep an explicit
    // check so a future role-list slip still returns the stable code.
    if ((dto.role as string) === 'super_admin') {
      throw new BadRequestException({
        code: SeedErrorCode.SUPER_ADMIN_NOT_SEEDABLE,
        message: 'super_admin cannot be seeded',
      });
    }

    const existing = await this.accounts.findOne({
      where: { email: dto.email },
    });

    if (!existing) {
      const { id } = await this.accountsService.create({
        name: dto.name,
        email: dto.email,
        password: dto.password,
        role: dto.role,
      });

      await this.auditLog.recordUserAction({
        actorId,
        action: 'seed.ensure_account',
        targetType: 'account',
        targetId: id,
        newValue: { email: dto.email, role: dto.role },
      });

      return {
        id,
        created: true,
        name: dto.name,
        email: dto.email,
        role: dto.role,
        isActive: true,
      };
    }

    if (dto.updatePassword === true) {
      const passwordHash = await argon2.hash(dto.password, {
        type: argon2.argon2id,
      });
      await this.accounts.update(existing.id, { passwordHash });
    }

    if (dto.updateRole === true && dto.role !== existing.role) {
      await this.accountsService.update(existing.id, { role: dto.role });
      existing.role = dto.role;
    }

    return {
      id: existing.id,
      created: false,
      name: existing.name,
      email: existing.email,
      role: existing.role,
      isActive: existing.isActive,
    };
  }
}
