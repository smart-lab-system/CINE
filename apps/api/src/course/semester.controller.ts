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
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { SemesterService } from './semester.service';
import { CreateSemesterDto, UpdateSemesterDto } from './dto/course.dto';

/**
 * Read mở cho mọi role (bộ lọc học kỳ ở mọi màn hình cần danh sách này);
 * write thuộc `admin` — CLAUDE.md §1.4/§2.2: học kỳ là tài nguyên cấp
 * trường, không role cấp khoa nào được ghi lên nó.
 *
 * Không có ownership check: học kỳ là của toàn trường, không ai sở hữu
 * riêng — nghĩa là cũng không có gì chặn một Trưởng khoa sửa kỳ mà cả
 * trường đang dùng, nếu họ còn quyền ghi. Đó là lý do quyền ghi nằm ở đây.
 */
@Controller('semesters')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SemesterController {
  constructor(private readonly semesters: SemesterService) {}

  @Get()
  findAll() {
    return this.semesters.findAll();
  }

  @Post()
  @Roles('admin')
  create(@Body() dto: CreateSemesterDto) {
    return this.semesters.create(dto);
  }

  @Patch(':id')
  @Roles('admin')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSemesterDto) {
    return this.semesters.update(id, dto);
  }

  @Delete(':id')
  @Roles('admin')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.semesters.remove(id);
  }
}
