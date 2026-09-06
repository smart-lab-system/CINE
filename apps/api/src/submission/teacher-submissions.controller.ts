import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { SubmissionService } from './submission.service';
import { SearchSubmissionsDto } from './dto/search-submissions.dto';
import { SessionOverviewQueryDto } from './dto/session-overview-query.dto';
import { SubmissionOverviewService } from './submission-overview.service';

/**
 * "Quản lý bài thu" — QA-reported gap: there was no way to see a
 * submission without first knowing which exam session it belonged to
 * (SubmissionController below is scoped to exactly one session, by
 * design, for the live lobby page). A separate controller, not a second
 * route on SubmissionController, because that one's class-level path
 * requires `:examSessionId` — there is no session id here to require.
 *
 * Read-only, same as SubmissionController. Scoped through
 * `exam_session.teacher_id` in the service — never past it, no matter
 * what a caller passes as a filter.
 */
@Controller('submissions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TeacherSubmissionsController {
  constructor(
    private readonly submissions: SubmissionService,
    private readonly overview: SubmissionOverviewService,
  ) {}

  /**
   * Roll-up theo phiên cho "Quản lý bài thu". Không phân trang — một GV có
   * vài chục phiên (spec §1.2), nên phân trang chỉ thêm state mà không giảm
   * tải gì.
   *
   * `?student=` giữ lại những phiên có sinh viên khớp — kể cả sinh viên CHƯA
   * NỘP GÌ, thứ GET /submissions không bao giờ thấy được vì nó đọc bảng
   * submission. Người giảng viên đi tra gần như luôn là người đang có vấn đề,
   * tức là đúng nhóm không có dòng nào trong bảng đó.
   */
  @Get('overview')
  @Roles('teacher')
  async listOverview(@Query() query: SessionOverviewQueryDto, @Req() req: Request) {
    const items = await this.overview.overviewForTeacher(req.user!.sub, query.student);
    return { items };
  }

  @Get()
  @Roles('teacher')
  list(@Query() query: SearchSubmissionsDto, @Req() req: Request) {
    return this.submissions.listForTeacher(req.user!.sub, query);
  }
}
