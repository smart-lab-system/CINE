import {
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AccountsService } from '../accounts/accounts.service';
import { AuditLogService } from '../admin/audit-log.service';
import { AccountEntity } from '../identity/entities/account.entity';
import { BootstrapAdminDto } from './dto/bootstrap-admin.dto';
import { SeedErrorCode } from './seed.types';

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
}
