import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { ExamSessionService } from '../../exam-session/exam-session.service';
import { AddProblemDto } from './problem.dto';
import { ProblemService } from './problem.service';

/**
 * Thêm, bỏ câu thủ công và xác nhận đề cương của MỘT phiên (P1b Task 4). Ownership luôn qua
 * `findEntityForOwner` trước; controller không chứa SQL, mọi luật nằm trong `ProblemService`.
 */
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProblemController {
  constructor(
    private readonly problems: ProblemService,
    private readonly examSessions: ExamSessionService,
  ) {}

  @Get('exam-sessions/:id/problems')
  @Roles('teacher')
  async list(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    const session = await this.examSessions.findEntityForOwner(id, req.user!.sub);
    return this.problems.listProblems(session.id);
  }

  @Post('exam-sessions/:id/problems')
  @Roles('teacher')
  async add(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AddProblemDto, @Req() req: Request) {
    const session = await this.examSessions.findEntityForOwner(id, req.user!.sub);
    return this.problems.appendProblem(session.id, dto);
  }

  @Delete('exam-sessions/:id/problems/:problemId')
  @Roles('teacher')
  @HttpCode(200)
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('problemId', ParseUUIDPipe) problemId: string,
    @Req() req: Request,
  ) {
    const session = await this.examSessions.findEntityForOwner(id, req.user!.sub);
    await this.problems.removeProblem(session.id, problemId);
    return { problemId };
  }

  @Post('exam-sessions/:id/blueprint/confirm')
  @Roles('teacher')
  @HttpCode(200)
  async confirm(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    const session = await this.examSessions.findEntityForOwner(id, req.user!.sub);
    return this.problems.confirmBlueprint(session.id, req.user!.sub);
  }
}
