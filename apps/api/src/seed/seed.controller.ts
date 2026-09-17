import {
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { BootstrapAdminDto } from './dto/bootstrap-admin.dto';
import { EnsureAccountDto } from './dto/ensure-account.dto';
import { EnsureRoomDto } from './dto/ensure-room.dto';
import { EnsureSemesterDto } from './dto/ensure-semester.dto';
import { SeedService } from './seed.service';

/**
 * Seed surface (spec §5–§6). Registered only when SEED_API_ENABLED=true.
 * `/seed/bootstrap-admin` is public; `/admin/seed/*` requires admin JWT.
 */
@Controller()
export class SeedController {
  constructor(private readonly seed: SeedService) {}

  @Post('seed/bootstrap-admin')
  @HttpCode(201)
  bootstrapAdmin(@Body() dto: BootstrapAdminDto) {
    return this.seed.bootstrapAdmin(dto);
  }

  @Post('admin/seed/accounts')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async ensureAccount(
    @Body() dto: EnsureAccountDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.seed.ensureAccount(dto, req.user!.sub);
    res.status(result.created ? 201 : 200);
    return result;
  }

  @Post('admin/seed/semesters')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async ensureSemester(
    @Body() dto: EnsureSemesterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.seed.ensureSemester(dto, req.user!.sub);
    res.status(result.created ? 201 : 200);
    return result;
  }

  @Post('admin/seed/rooms')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async ensureRoom(
    @Body() dto: EnsureRoomDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.seed.ensureRoom(dto, req.user!.sub);
    res.status(result.created ? 201 : 200);
    return result;
  }
}
