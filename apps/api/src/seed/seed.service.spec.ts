import { ConflictException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { AccountsService } from '../accounts/accounts.service';
import { AuditLogService } from '../admin/audit-log.service';
import { AccountEntity } from '../identity/entities/account.entity';
import { SeedService } from './seed.service';
import { SeedErrorCode } from './seed.types';

function createHarness(accountCount: number) {
  const accountsRepo = {
    count: jest.fn().mockResolvedValue(accountCount),
  };

  const accountsService = {
    create: jest.fn().mockResolvedValue({ id: 'admin-1' }),
  };

  const auditLog = {
    recordUserAction: jest.fn().mockResolvedValue(undefined),
  };

  const service = new SeedService(
    accountsService as unknown as AccountsService,
    {} as never,
    {} as never,
    auditLog as unknown as AuditLogService,
    accountsRepo as unknown as Repository<AccountEntity>,
    {} as never,
    {} as never,
  );

  return { service, accountsRepo, accountsService, auditLog };
}

const dto = {
  name: 'Admin',
  email: 'admin@example.com',
  password: 'Demo123456!',
};

describe('SeedService.bootstrapAdmin', () => {
  it('creates an admin and audits when account count is 0', async () => {
    const { service, accountsService, auditLog } = createHarness(0);

    const result = await service.bootstrapAdmin(dto);

    expect(accountsService.create).toHaveBeenCalledWith({
      name: dto.name,
      email: dto.email,
      password: dto.password,
      role: 'admin',
    });
    expect(auditLog.recordUserAction).toHaveBeenCalledWith({
      actorId: 'admin-1',
      action: 'seed.bootstrap_admin',
      targetType: 'account',
      targetId: 'admin-1',
      newValue: { email: dto.email, role: 'admin' },
    });
    expect(result).toEqual({
      id: 'admin-1',
      email: dto.email,
      role: 'admin',
    });
    expect(result).not.toHaveProperty('password');
  });

  it('rejects with BOOTSTRAP_NOT_AVAILABLE when any account exists', async () => {
    const { service, accountsService, auditLog } = createHarness(1);

    await expect(service.bootstrapAdmin(dto)).rejects.toBeInstanceOf(
      ConflictException,
    );

    try {
      await service.bootstrapAdmin(dto);
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toMatchObject({
        code: SeedErrorCode.BOOTSTRAP_NOT_AVAILABLE,
      });
    }

    expect(accountsService.create).not.toHaveBeenCalled();
    expect(auditLog.recordUserAction).not.toHaveBeenCalled();
  });
});
