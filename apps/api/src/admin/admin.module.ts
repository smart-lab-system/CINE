import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLogEntity } from './entities/audit-log.entity';
import { AuditLogService } from './audit-log.service';

/**
 * CLAUDE.md's module map puts AuditLog here. Only the service is exported —
 * the repository stays private so nothing outside can bypass
 * `recordUserAction` and write an entry with no actor.
 */
@Module({
  imports: [TypeOrmModule.forFeature([AuditLogEntity])],
  providers: [AuditLogService],
  exports: [AuditLogService],
})
export class AdminModule {}
