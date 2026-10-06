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
import { ClassService } from './class.service';
import { RosterService } from './roster.service';
import {
  CreateClassDto,
  SearchClassesDto,
  SearchTeachingClassesDto,
  UpdateClassDto,
} from './dto/class.dto';
import { ImportRosterDto, RosterStudentDto } from './dto/roster.dto';

/**
 * Lớp. Từ đợt khôi phục master data (spec §4):
 *   - ADMIN tạo, sửa, xoá, giao giảng viên và xem toàn bộ — `@Roles('admin')` ở MỨC CLASS, để route nào bỏ sót
 *     `@Roles` là 403 chứ không phải route mở (`RolesGuard` trả `true` khi thiếu metadata).
 *   - GIẢNG VIÊN chỉ ĐỌC lớp được giao (`GET /classes/teaching`) và QUẢN LÝ DANH SÁCH SINH VIÊN của chính lớp
 *     đó (route roster, kèm kiểm `class.teacher_id`). Đảo lại thay đổi 21/09 cho giảng viên tự tạo lớp.
 */
@Controller('classes')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class ClassController {
  constructor(
    private readonly classes: ClassService,
    private readonly roster: RosterService,
  ) {}

  /**
   * Lớp của giảng viên đang đăng nhập, kèm sĩ số — nguồn của "Lớp của tôi" và form tạo phiên. Một lớp của
   * người khác xuất hiện ở đây là một cú nhấp từ một kỳ thi.
   *
   * Khai báo TRƯỚC mọi route `:id` để đoạn chữ `teaching` không bị đọc thành một uuid.
   */
  @Get('teaching')
  @Roles('teacher')
  findTeaching(@Query() query: SearchTeachingClassesDto, @Req() req: Request) {
    return this.classes.findForTeacher(req.user!.sub, query);
  }

  @Get()
  list(@Query() query: SearchClassesDto) {
    return this.classes.listForAdmin(query);
  }

  @Post()
  create(@Body() dto: CreateClassDto, @Req() req: Request) {
    return this.classes.create(req.user!.sub, dto);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateClassDto, @Req() req: Request) {
    return this.classes.update(req.user!.sub, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    await this.classes.remove(req.user!.sub, id);
  }

  /**
   * Danh sách sinh viên của lớp — ai được dự thi của lớp này. Của GIẢNG VIÊN: họ là người được phòng đào tạo
   * gửi file và là người phát hiện nó sai vào ngày thi. Chỉ giảng viên của lớp đọc được.
   */
  @Get(':id/roster')
  @Roles('teacher')
  async findRoster(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    const klass = await this.classes.findTaughtBy(id, req.user!.sub);
    return this.roster.listForClass(klass.id);
  }

  /**
   * Applies a parsed Excel roster. The .xlsx itself never reaches this server (Security rule 5), so this takes
   * ordinary JSON that ValidationPipe checks like any other DTO — and one bad row makes the whole request a 400,
   * which is exactly what "nothing is imported" means.
   *
   * 200, not 201: re-importing the same file creates nothing at all.
   */
  @Post(':id/roster')
  @Roles('teacher')
  @HttpCode(200)
  async importRoster(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ImportRosterDto,
    @Req() req: Request,
  ) {
    const klass = await this.classes.findTaughtBy(id, req.user!.sub);
    return this.roster.importForClass(klass, dto);
  }

  /** One student, typed in. For the late transfer and the correction — the cases where sending the whole file again would be theatre. */
  @Post(':id/roster/students')
  @Roles('teacher')
  async addStudent(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RosterStudentDto,
    @Req() req: Request,
  ) {
    const klass = await this.classes.findTaughtBy(id, req.user!.sub);
    return this.roster.addStudent(klass, dto);
  }

  /** The undo for the line above. A lecturer who typed the wrong MSSV needs something better than re-importing the whole file with the removal box ticked. */
  @Delete(':id/roster/students/:studentMssv')
  @Roles('teacher')
  @HttpCode(204)
  async removeStudent(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('studentMssv') studentMssv: string,
    @Req() req: Request,
  ) {
    const klass = await this.classes.findTaughtBy(id, req.user!.sub);
    return this.roster.removeStudent(klass, studentMssv);
  }
}
