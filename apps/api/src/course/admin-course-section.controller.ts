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
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { AdminCourseSectionService } from './admin-course-section.service';
import { RosterService } from './roster.service';
import {
  AddCourseSectionStudentDto,
  AssignCourseSectionDto,
  CreateCourseSectionDto,
  ListCourseSectionsQueryDto,
  UpdateCourseSectionDto,
} from './dto/admin-course-section.dto';
import { ImportRosterDto, UpdateRosterStudentDto } from './dto/roster.dto';

@ApiTags('admin-course-sections')
@Controller('admin/course-sections')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AdminCourseSectionController {
  constructor(
    private readonly sections: AdminCourseSectionService,
    private readonly roster: RosterService,
  ) {}

  @Get()
  list(@Query() query: ListCourseSectionsQueryDto) {
    return this.sections.list(query);
  }

  @Post()
  create(@Body() dto: CreateCourseSectionDto) {
    return this.sections.create(dto);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.sections.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCourseSectionDto,
  ) {
    return this.sections.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.sections.remove(id);
  }

  @Post(':id/assign')
  assign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignCourseSectionDto,
  ) {
    return this.sections.assign(id, dto);
  }

  @Post(':id/unassign')
  @HttpCode(200)
  unassign(@Param('id', ParseUUIDPipe) id: string) {
    return this.sections.unassign(id);
  }

  @Get(':id/roster')
  async findRoster(@Param('id', ParseUUIDPipe) id: string) {
    const klass = await this.sections.getEntity(id);
    return this.roster.listForClass(klass.id);
  }

  @Post(':id/roster')
  @HttpCode(200)
  async importRoster(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ImportRosterDto,
  ) {
    const klass = await this.sections.getEntity(id);
    return this.roster.importForClass(klass, dto);
  }

  @Post(':id/roster/students')
  async addStudent(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddCourseSectionStudentDto,
  ) {
    const klass = await this.sections.getEntity(id);
    return this.roster.addStudent(klass, {
      studentId: dto.studentId,
      mssv: dto.mssv,
      name: dto.name,
    });
  }

  @Patch(':id/roster/students/:studentMssv')
  async updateStudentName(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('studentMssv') studentMssv: string,
    @Body() dto: UpdateRosterStudentDto,
  ) {
    const klass = await this.sections.getEntity(id);
    return this.roster.updateStudentName(klass, studentMssv, dto.name);
  }

  @Delete(':id/roster/students/:studentMssv')
  @HttpCode(204)
  async removeStudent(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('studentMssv') studentMssv: string,
  ) {
    const klass = await this.sections.getEntity(id);
    await this.roster.removeStudent(klass, studentMssv);
  }
}
