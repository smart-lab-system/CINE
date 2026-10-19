import { Controller, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ExamSessionService } from '../exam-session/exam-session.service';
import { RulerGenerateResult, RulerGenerateService } from './ruler-generate.service';

/**
 * Hai nút sinh gói test của G2b-R. Nằm ở `exam-authoring`, không ở `grading`: lượt sinh gọi model và `GradingModule` không
 * được biết `ExamAuthoringModule` (chiều phụ thuộc đã chốt ở module này). Cùng tiền tố URL với route gói test để FE gom một chỗ.
 *
 * POST, không GET: mỗi lần bấm tốn tiền thật và chạy mã trên worker. Không route nào nhận `teacherId` hay mã nguồn từ body —
 * chủ phiên đến từ JWT, mã đến từ kho.
 */
@Controller('exam-sessions/:id/test-bundles')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RulerGenerateController {
  constructor(
    private readonly sessions: ExamSessionService,
    private readonly generator: RulerGenerateService,
  ) {}

  /** Model viết đáp án mẫu và đề xuất ca từ đề; output mong đợi lấy từ chạy đáp án đó trong sandbox. */
  @Post('generate-from-statement')
  @Roles('teacher')
  async fromStatement(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request): Promise<RulerGenerateResult> {
    const session = await this.sessions.findEntityForOwner(id, req.user!.sub);
    return this.generator.generate(session, req.user!.sub, 'statement');
  }

  /** Model chỉ đề xuất ca từ đề; output mong đợi lấy từ chạy mã đáp án của giảng viên (đã nằm trên kho). */
  @Post('generate-from-answer')
  @Roles('teacher')
  async fromAnswer(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request): Promise<RulerGenerateResult> {
    const session = await this.sessions.findEntityForOwner(id, req.user!.sub);
    return this.generator.generate(session, req.user!.sub, 'answer');
  }
}
