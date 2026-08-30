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
 * Read is open — the create-exam-session form needs the list. Write is
 * Trưởng khoa, with no ownership check: labs are university-wide facilities
 * that several departments book in different slots, so scoping one to a
 * department would break the normal case rather than protect anything.
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
  @Roles('department_admin')
  create(@Body() dto: CreateRoomDto) {
    return this.rooms.create(dto);
  }

  @Patch(':id')
  @Roles('department_admin')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRoomDto) {
    return this.rooms.update(id, dto);
  }

  @Delete(':id')
  @Roles('department_admin')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.rooms.remove(id);
  }
}
