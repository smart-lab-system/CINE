import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { AuditLogReaderService } from './audit-log-reader.service';
import { SearchAuditLogDto } from './dto/search-audit-log.dto';
import { AuditLogPageView } from './audit-log.types';

/**
 * Đọc nhật ký — chỉ admin, và chỉ đọc: không có route ghi, sửa hay xoá nào.
 *
 * Với MỘT admin, người đọc nhật ký cũng là người bị ghi trong đó; trang này
 * phục vụ điều tra sự cố ("ai đổi phòng này, khi nào?") và đối chiếu khi giảng
 * viên với admin nói khác nhau, KHÔNG phải một biện pháp kiểm soát quyền.
 */
@Controller('audit-log')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AuditLogController {
  constructor(private readonly reader: AuditLogReaderService) {}

  @Get()
  search(@Query() query: SearchAuditLogDto): Promise<AuditLogPageView> {
    return this.reader.search(query);
  }
}
