import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLogEntity } from './entities/audit-log.entity';
import { AuditLogService } from './audit-log.service';
import { AuditLogReaderService } from './audit-log-reader.service';
import { AuditLogController } from './audit-log.controller';

/**
 * CLAUDE.md's module map puts AuditLog here. Only the WRITER is exported —
 * the repository stays private so nothing outside can bypass
 * `recordUserAction` and write an entry with no actor. The reader and its
 * controller are internal: nothing but the admin route reads the trail.
 */
@Module({
  imports: [TypeOrmModule.forFeature([AuditLogEntity])],
  controllers: [AuditLogController],
  providers: [AuditLogService, AuditLogReaderService],
  exports: [AuditLogService],
})
export class AdminModule {}
