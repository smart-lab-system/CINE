import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { DataSource } from 'typeorm';

/**
 * Cổng schema (§10.1): `/health` đỏ khi DB không đọc được hoặc còn migration chờ. Railway không đẩy traffic
 * sang bản code đang chờ schema mới. Không đưa thông điệp lỗi gốc của DB ra response — nó có thể lộ chuỗi kết nối.
 */
@Controller('health')
export class HealthController {
  constructor(private readonly ds: DataSource) {}

  @Get()
  async check(): Promise<{ status: 'ok' }> {
    let pending: boolean;
    try {
      pending = await this.ds.showMigrations();
    } catch {
      throw new ServiceUnavailableException({ status: 'error', reason: 'db_unreachable' });
    }
    if (pending) throw new ServiceUnavailableException({ status: 'error', reason: 'migration_pending' });
    return { status: 'ok' };
  }
}
