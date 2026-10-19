import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AuditLogService } from './audit-log.service';
import { ListAuditLogDto } from './dto/list-audit-log.dto';

/** Nhật ký thao tác — chỉ đọc, chỉ admin. Không có route ghi: ghi chỉ đi qua `AuditLogService.recordUserAction`. */
@Controller('admin/audit-log')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AuditLogController {
  constructor(private readonly audit: AuditLogService) {}

  @Get()
  list(@Query() query: ListAuditLogDto) {
    return this.audit.list({
      actions: query.action ? query.action.split(',').map((a) => a.trim()).filter(Boolean) : undefined,
      actorId: query.actorId,
      targetType: query.targetType,
      from: query.from ? new Date(query.from) : undefined,
      before: query.before ? new Date(query.before) : undefined,
      limit: query.limit ?? 50,
    });
  }
}
