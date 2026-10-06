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
import { SemesterService } from './semester.service';
import { CreateSemesterDto, UpdateSemesterDto } from './dto/semester.dto';

/**
 * Học kỳ. `@Roles('admin')` ở MỨC CLASS: một route bỏ sót `@Roles` sẽ là 403 chứ
 * không phải route mở (RolesGuard trả `true` khi không có metadata). Chỉ route
 * ĐỌC ghi đè để giảng viên dùng được cho bộ lọc năm học → học kỳ (spec §7.2).
 */
@Controller('semesters')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class SemesterController {
  constructor(private readonly semesters: SemesterService) {}

  @Get()
  @Roles('admin', 'teacher')
  list(@Req() req: Request) {
    // Số lớp là thông tin tổng hợp về lớp của NGƯỜI KHÁC: chỉ admin nhận nó.
    return this.semesters.list(req.user!.role === 'admin');
  }

  @Post()
  create(@Body() dto: CreateSemesterDto, @Req() req: Request) {
    return this.semesters.create(req.user!.sub, dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSemesterDto,
    @Req() req: Request,
  ) {
    return this.semesters.update(req.user!.sub, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    await this.semesters.remove(req.user!.sub, id);
  }
}
