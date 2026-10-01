import { Body, Controller, HttpCode, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ExamSessionService } from '../exam-session/exam-session.service';
import { InspectDto } from './dto/inspect.dto';
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
}
