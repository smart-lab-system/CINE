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
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { SemesterService } from './semester.service';
import { CreateSemesterDto, UpdateSemesterDto } from './dto/course.dto';

/**
 * Read mở cho mọi role (bộ lọc học kỳ ở mọi màn hình cần danh sách này);
 * write thuộc Phòng Đào tạo (`academic_affairs`).
 *
 * Trước đây write thuộc Trưởng khoa, và đó là SAI TẦNG: lịch học kỳ là quyết
 * định cấp trường, công bố một lần cho toàn trường, không phải thứ mỗi khoa tự
 * đặt. `uq_semester_name` tồn tại chính vì hai Trưởng khoa có thể cùng tạo
 * "Học kỳ 1 2026-2027" với ngày khác nhau — vá triệu chứng; đây là sửa gốc.
 * Spec §2.1.
 *
 * Không có ownership check: học kỳ là của toàn trường, không ai sở hữu riêng.
 */
@Controller('semesters')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SemesterController {
  constructor(private readonly semesters: SemesterService) {}

  @Get()
  findAll() {
    return this.semesters.findAll();
  }

  /**
   * Gạt cờ hiện hành. PUT chứ không PATCH: nó đặt một trạng thái tuyệt đối
   * ("kỳ này là kỳ hiện hành"), không sửa lẻ một phần của bản ghi.
   *
   * Không có endpoint GỠ cờ. Trạng thái "không kỳ nào hiện hành" chỉ tồn tại
   * lúc cài mới, không phải thứ ai đó chọn — gỡ cờ mà không gắn kỳ khác là làm
   * mù cả hệ thống, không có ca dùng thật nào.
   */
  @Put(':id/current')
  @Roles('academic_affairs')
  setCurrent(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    return this.semesters.setCurrent(id, req.user!.sub);
  }

  @Post()
  @Roles('academic_affairs')
  create(@Body() dto: CreateSemesterDto) {
    return this.semesters.create(dto);
  }

  @Patch(':id')
  @Roles('academic_affairs')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSemesterDto) {
    return this.semesters.update(id, dto);
  }

  @Delete(':id')
  @Roles('academic_affairs')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.semesters.remove(id);
  }
}
