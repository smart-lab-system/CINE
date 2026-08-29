import { Controller, Get, Param, ParseUUIDPipe, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { ExamSessionService } from '../exam-session/exam-session.service';
import { SubmissionService } from './submission.service';

/**
 * Read-only, teacher-only view of what has been collected for one session.
 *
 * Exists because `lobby:submission_status` only reports what happens while
 * the teacher's page is open — without an initial fetch, a refresh mid-exam
 * would show an empty table while every file was already in storage.
 */
@Controller('exam-sessions/:examSessionId/submissions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SubmissionController {
  constructor(
    private readonly submissions: SubmissionService,
    private readonly examSessions: ExamSessionService,
  ) {}

  @Get()
  @Roles('teacher')
  async list(
    @Param('examSessionId', ParseUUIDPipe) examSessionId: string,
    @Req() req: Request,
  ) {
    // Ownership first, reusing the same 404/403 rule as GET
    // /exam-sessions/:id — this endpoint exposes every student's MSSV and
    // name for the session, so it must never answer for a session the
    // caller does not own.
    await this.examSessions.findByIdForOwner(examSessionId, req.user!.sub);
    const items = await this.submissions.listForSession(examSessionId);
    return { items };
  }
}
