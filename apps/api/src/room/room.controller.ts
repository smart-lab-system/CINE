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
import { RoomService } from './room.service';
import { CreateRoomDto, UpdateRoomDto } from '../course/dto/course.dto';

/**
 * Read mở cho mọi role — form tạo phiên thi cần danh sách này. Write thuộc
 * `admin` — CLAUDE.md §1.4/§2.2: phòng máy là cơ sở vật chất cấp trường,
 * nhiều khoa cùng đặt lịch ở các khung giờ khác nhau.
 *
 * Không có ownership check, và đó chính là vấn đề nếu để role cấp khoa ghi:
 * scoping phòng về một khoa sẽ phá vỡ ca dùng bình thường, nhưng không
 * scoping mà vẫn cho ghi thì một Trưởng khoa xoá được phòng khoa khác đang
 * xếp lịch. Lối ra là quyền ghi ở cấp trường.
 */
@Controller('rooms')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RoomController {
  constructor(private readonly rooms: RoomService) {}

  @Get()
  findAll() {
    return this.rooms.findAll();
  }

  @Post()
  @Roles('admin')
  create(@Body() dto: CreateRoomDto) {
    return this.rooms.create(dto);
  }

  @Patch(':id')
  @Roles('admin')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRoomDto) {
    return this.rooms.update(id, dto);
  }

  @Delete(':id')
  @Roles('admin')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.rooms.remove(id);
  }
}
