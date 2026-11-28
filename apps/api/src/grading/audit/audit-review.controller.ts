import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { GradingService } from '../grading.service';
import { SubmissionBrowseService } from '../submission-browse.service';
import { AuditReviewDto } from './dto/audit-review.dto';
import { AuditReviewService } from './audit-review.service';

/** Nhận xét kiểm mẫu (parent spec §8.1). Quyền sở hữu luôn qua `findResultForOwner` trước. */
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class AuditReviewController {
  constructor(
    private readonly audit: AuditReviewService,
    private readonly grading: GradingService,
    private readonly browse: SubmissionBrowseService,
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

  @Get('grading-results/:id/browse')
  @Roles('teacher')
  async browseSubmission(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    const result = await this.grading.findResultForOwner(id, req.user!.sub);
    return this.browse.browse(result.id);
  }

  @Get('grading-results/:id/browse/file')
  @Roles('teacher')
  async browseSubmissionFile(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('path') path: string,
    @Req() req: Request,
  ) {
    const result = await this.grading.findResultForOwner(id, req.user!.sub);
    return this.browse.browseFile(result.id, path ?? '');
  }

  @Post('grading-results/:id/extract')
  @Roles('teacher')
  async requestExtract(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    const result = await this.grading.findResultForOwner(id, req.user!.sub);
    return this.browse.requestExtract(result.id);
  }
}
