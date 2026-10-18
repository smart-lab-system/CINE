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
import { ClassService } from './class.service';
import { RosterService } from './roster.service';
import {
  ImportRosterDto,
  RosterStudentDto,
  UpdateRosterStudentDto,
} from './dto/roster.dto';

/**
 * Lớp của giảng viên đã được admin phân công.
 *
 * Tạo / sửa meta / xoá lớp học phần thuộc admin (`/admin/course-sections`).
 * Teacher chỉ list「Lớp của tôi」và quản roster ngày thi.
 */
@Controller('classes')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ClassController {
  constructor(
    private readonly classes: ClassService,
    private readonly roster: RosterService,
  ) {}

  @Get('teaching')
  @Roles('teacher')
  findTeaching(@Req() req: Request) {
    return this.classes.findForTeacher(req.user!.sub);
  }

  @Get(':id/roster')
  @Roles('teacher')
  async findRoster(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    const klass = await this.classes.findTaughtBy(id, req.user!.sub);
    return this.roster.listForClass(klass.id);
  }

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

  @Patch(':id/roster/students/:studentMssv')
  @Roles('teacher')
  async updateStudentName(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('studentMssv') studentMssv: string,
    @Body() dto: UpdateRosterStudentDto,
    @Req() req: Request,
  ) {
    const klass = await this.classes.findTaughtBy(id, req.user!.sub);
    return this.roster.updateStudentName(klass, studentMssv, dto.name);
  }

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
