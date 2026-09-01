import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { SubmissionService } from './submission.service';
import { SearchSubmissionsDto } from './dto/search-submissions.dto';

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
  constructor(private readonly submissions: SubmissionService) {}

  @Get()
  @Roles('teacher')
  list(@Query() query: SearchSubmissionsDto, @Req() req: Request) {
    return this.submissions.listForTeacher(req.user!.sub, query);
  }
}
