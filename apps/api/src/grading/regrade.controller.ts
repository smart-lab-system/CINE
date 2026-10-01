import { Controller, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { GradingService } from './grading.service';
import { RegradeService } from './regrade.service';

/**
 * Chấm lại bài không chấm được — mỗi cú là MỘT hành động giảng viên bấm (§7.1.3), không có `@Interval`.
 * Quyền sở hữu luôn qua `findResultForOwner` trước; không route nào nhận `teacherId` từ body.
 */
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class RegradeController {
  constructor(
    private readonly regrade: RegradeService,
    private readonly grading: GradingService,
  ) {}

  @Post('grading-results/:id/regrade')
  @Roles('teacher')
  async regradeOne(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    const result = await this.grading.findResultForOwner(id, req.user!.sub);
    return this.regrade.regradeOne(req.user!.sub, result.id);
  }
}
