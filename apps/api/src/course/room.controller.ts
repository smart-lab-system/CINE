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
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { RoomService } from './room.service';
import { CreateRoomDto, ListRoomsDto, UpdateRoomDto } from './dto/room.dto';
import { ImportRoomsDto } from './dto/import.dto';
import { MasterDataImportService } from './master-data-import.service';

/** Phòng thi. Admin quản lý; giảng viên chỉ đọc (để chọn cho phiên mới). Xem `SemesterController` về `@Roles` ở mức class. */
@Controller('rooms')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class RoomController {
  constructor(
    private readonly rooms: RoomService,
    private readonly imports: MasterDataImportService,
  ) {}

  @Get()
  @Roles('admin', 'teacher')
  list(@Query() query: ListRoomsDto, @Req() req: Request) {
    return this.rooms.list({
      activeOnly: query.active === 'true',
      // Số phiên của một phòng là thông tin tổng hợp của người khác: chỉ admin.
      withCounts: req.user!.role === 'admin',
    });
  }

  /** Nhập từ file (spec §6). `dryRun` bắt buộc; 200 cho cả hai chế độ vì không tạo một tài nguyên duy nhất. */
  @Post('import')
  @HttpCode(200)
  importFromFile(@Body() dto: ImportRoomsDto, @Req() req: Request) {
    return this.imports.importRooms(req.user!.sub, dto);
  }

  @Post()
  create(@Body() dto: CreateRoomDto, @Req() req: Request) {
    return this.rooms.create(req.user!.sub, dto);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRoomDto, @Req() req: Request) {
    return this.rooms.update(req.user!.sub, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    await this.rooms.remove(req.user!.sub, id);
  }
}
