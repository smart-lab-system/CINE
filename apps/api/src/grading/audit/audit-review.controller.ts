import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { GradingService } from '../grading.service';
import { AuditReviewDto } from './dto/audit-review.dto';
import { AuditReviewService } from './audit-review.service';

/** Nhận xét kiểm mẫu (parent spec §8.1). Quyền sở hữu luôn qua `findResultForOwner` trước. */
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class AuditReviewController {
  constructor(
    private readonly audit: AuditReviewService,
    private readonly grading: GradingService,
  ) {}

  @Post('grading-results/:id/audit-review')
  @Roles('teacher')
  async record(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AuditReviewDto, @Req() req: Request) {
    const result = await this.grading.findResultForOwner(id, req.user!.sub);
    return this.audit.record(req.user!.sub, result.id, dto);
  }

  @Get('grading-results/:id/submission-download')
  @Roles('teacher')
  async download(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    const result = await this.grading.findResultForOwner(id, req.user!.sub);
    return this.audit.submissionDownload(result.id);
  }
}
