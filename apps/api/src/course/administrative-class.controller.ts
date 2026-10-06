import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { AdministrativeClassService } from './administrative-class.service';
import {
  CreateAdministrativeClassDto,
  UpdateAdministrativeClassDto,
} from './dto/administrative-class.dto';

/**
 * Danh mục lớp danh nghĩa — TOÀN BỘ chỉ admin, kể cả đọc. Giảng viên không có
 * trang, route hay bộ lọc cho nó; họ chỉ thấy nhãn gộp `mã – nhóm` ở mọi nơi
 * hiện tên lớp (spec §2.2, §5.2), nên không bao giờ thấy "hai thứ".
 */
@Controller('administrative-classes')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AdministrativeClassController {
  constructor(private readonly classes: AdministrativeClassService) {}

  @Get()
  list() {
    return this.classes.list();
  }

  @Post()
  create(@Body() dto: CreateAdministrativeClassDto, @Req() req: Request) {
    return this.classes.create(req.user!.sub, dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAdministrativeClassDto,
    @Req() req: Request,
  ) {
    return this.classes.update(req.user!.sub, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    await this.classes.remove(req.user!.sub, id);
  }
}
