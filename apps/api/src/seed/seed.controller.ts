import { Controller } from '@nestjs/common';
import { SeedService } from './seed.service';

/**
 * Seed surface (spec §5–§6). Registered only when SEED_API_ENABLED=true.
 * Routes land in later tasks; skeleton exists so AppModule can gate the module.
 */
@Controller()
export class SeedController {
  constructor(private readonly seed: SeedService) {}
}
