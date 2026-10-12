import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ExamSessionService } from '../exam-session/exam-session.service';
import { InspectDto } from './dto/inspect.dto';
import { PlanDto } from './dto/plan.dto';
import { WriteDto } from './dto/write.dto';
import { GradeExportPlanService } from './grade-export-plan.service';
import { GradeExportQueryService } from './grade-export-query.service';
import { GradeExportWriteService } from './grade-export-write.service';
import { TemplateUploadDto } from './dto/template-upload.dto';
import { GradeExportService } from './grade-export.service';

/**
 * Ghi điểm vào sổ điểm (spec `2026-09-29-gradebook-export-design.md` §4.5). Quyền sở hữu phiên luôn qua
 * `findEntityForOwner` trước — không route nào nhận `teacherId` từ body.
 */
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class GradeExportController {
  constructor(
    private readonly exports: GradeExportService,
    private readonly plans: GradeExportPlanService,
    private readonly writes: GradeExportWriteService,
    private readonly queries: GradeExportQueryService,
    private readonly sessions: ExamSessionService,
  ) {}

  @Post('exam-sessions/:id/grade-exports/template-upload')
  @Roles('teacher')
  async templateUpload(@Param('id', ParseUUIDPipe) id: string, @Body() dto: TemplateUploadDto, @Req() req: Request) {
    const session = await this.sessions.findEntityForOwner(id, req.user!.sub);
    return this.exports.requestTemplateUpload(session.id, dto);
  }

  @Post('exam-sessions/:id/grade-exports/inspect')
  @Roles('teacher')
  @HttpCode(200)
  async inspect(@Param('id', ParseUUIDPipe) id: string, @Body() dto: InspectDto, @Req() req: Request) {
    const session = await this.sessions.findEntityForOwner(id, req.user!.sub);
    return this.exports.inspect(session.id, dto);
  }

  @Post('exam-sessions/:id/grade-exports/preview')
  @Roles('teacher')
  @HttpCode(200)
  async preview(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PlanDto, @Req() req: Request) {
    const session = await this.sessions.findEntityForOwner(id, req.user!.sub);
    return this.plans.preview(session.id, dto);
  }

  @Post('exam-sessions/:id/grade-exports')
  @Roles('teacher')
  @HttpCode(201)
  async write(@Param('id', ParseUUIDPipe) id: string, @Body() dto: WriteDto, @Req() req: Request) {
    const session = await this.sessions.findEntityForOwner(id, req.user!.sub);
    return this.writes.write(session.id, req.user!.sub, dto);
  }

  @Get('exam-sessions/:id/grade-exports')
  @Roles('teacher')
  async list(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    const session = await this.sessions.findEntityForOwner(id, req.user!.sub);
    return this.queries.list(session.id);
  }

  @Get('grade-exports/:id/download')
  @Roles('teacher')
  async download(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    return this.queries.download(id, req.user!.sub);
  }
}
