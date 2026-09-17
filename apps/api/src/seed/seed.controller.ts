import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { BootstrapAdminDto } from './dto/bootstrap-admin.dto';
import { SeedService } from './seed.service';

/**
 * Seed surface (spec §5–§6). Registered only when SEED_API_ENABLED=true.
 * `/seed/bootstrap-admin` is public; `/admin/seed/*` routes get Jwt+Roles
 * in later tasks.
 */
@Controller()
export class SeedController {
  constructor(private readonly seed: SeedService) {}

  @Post('seed/bootstrap-admin')
  @HttpCode(201)
  bootstrapAdmin(@Body() dto: BootstrapAdminDto) {
    return this.seed.bootstrapAdmin(dto);
  }
}
