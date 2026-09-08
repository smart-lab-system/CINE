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
 * Read is open — the create-exam-session form needs the list.
 *
 * Write là Phòng Đào tạo, không phải Trưởng khoa. Phòng máy là tài nguyên
 * CẤP TRƯỜNG: nhiều khoa xếp lịch vào cùng một phòng ở các ca khác nhau, tên
 * phòng unique TOÀN CỤC (`uq_room_name`), và không khoa nào sở hữu nó. Trước
 * đây mọi Trưởng khoa đều ghi được — cùng đúng cái lệch tầng mà Học kỳ đã
 * sửa, và `uq_room_name` tồn tại vì cùng lý do `uq_semester_name`: một
 * namespace chung không có chủ.
 *
 * Scope phòng theo khoa thì KHÔNG phải câu trả lời — nó phá ca bình thường
 * (nhiều khoa dùng chung một lab) chứ không bảo vệ gì.
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
  @Roles('academic_affairs')
  create(@Body() dto: CreateRoomDto) {
    return this.rooms.create(dto);
  }

  @Patch(':id')
  @Roles('academic_affairs')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRoomDto) {
    return this.rooms.update(id, dto);
  }

  @Delete(':id')
  @Roles('academic_affairs')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.rooms.remove(id);
  }
}
