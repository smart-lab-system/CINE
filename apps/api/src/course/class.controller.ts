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
import { CreateClassDto, UpdateClassDto } from './dto/course.dto';
import { ImportRosterDto, RosterStudentDto } from './dto/roster.dto';

/**
 * Two different "mine" here, because two roles have a legitimate but
 * different claim on a class: the Trưởng khoa who owns its course, and the
 * lecturer who runs it.
 */
@Controller('classes')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ClassController {
  constructor(
    private readonly classes: ClassService,
    private readonly roster: RosterService,
  ) {}

  @Get('mine')
  @Roles('department_admin')
  findMine(@Req() req: Request) {
    return this.classes.findForHead(req.user!.sub);
  }

  /**
   * The lecturer's own classes, with course and roster size — the list the
   * create-session form is built from. A class the caller does not teach
   * appearing here would put it one click away from an exam.
   */
  @Get('teaching')
  @Roles('teacher')
  findTeaching(@Req() req: Request) {
    return this.classes.findForTeacher(req.user!.sub);
  }

  @Post()
  @Roles('department_admin')
  create(@Body() dto: CreateClassDto, @Req() req: Request) {
    return this.classes.createForHead(req.user!.sub, dto);
  }

  @Patch(':id')
  @Roles('department_admin')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateClassDto,
    @Req() req: Request,
  ) {
    return this.classes.updateForHead(id, req.user!.sub, dto);
  }

  @Delete(':id')
  @Roles('department_admin')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    return this.classes.removeForHead(id, req.user!.sub);
  }

  /**
   * The class list — who is expected to sit this class's exams.
   *
   * Roster endpoints hang off the class, not the course: a student belongs
   * to one class at a time, even though `enrollment` is keyed by course so
   * that join-time authentication survives a make-up exam (Security rule 1).
   *
   * THE LECTURER OWNS THIS LIST. The Trưởng khoa creates the class and names
   * who teaches it; from there the roster is the lecturer's, because they
   * are the one the training office sends the file to and the one who finds
   * out on exam day that it is wrong. Routing every class in a department
   * through one person to have its list typed in is a bottleneck with
   * nothing to show for it.
   *
   * It is also the only line consistent with what already existed: a
   * lecturer approving an access request has always written an
   * `enrollment` row (see AccessRequestGateway). Allowing that one at a
   * time while refusing the bulk path was an arbitrary place to draw the
   * boundary, not a security property.
   *
   * Reading is open to the Trưởng khoa too — they need to see a department's
   * headcounts — but there is exactly ONE writer per list, so two people can
   * never disagree about who maintains it.
   */
  @Get(':id/roster')
  @Roles('teacher', 'department_admin')
  async findRoster(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    const klass = await this.classes.findReadableBy(id, req.user!.sub, req.user!.role);
    return this.roster.listForClass(klass.id);
  }

  /**
   * Applies a parsed Excel roster. The .xlsx itself never reaches this
   * server (Security rule 5), so this takes ordinary JSON that
   * ValidationPipe checks like any other DTO — and one bad row makes the
   * whole request a 400, which is exactly what "nothing is imported" means.
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

  /**
   * One student, typed in. For the late transfer and the correction — the
   * cases where sending the whole file again would be theatre.
   */
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

  /**
   * The undo for the line above. A lecturer who typed the wrong MSSV needs
   * something better than re-importing the whole file with the removal box
   * ticked.
   */
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
