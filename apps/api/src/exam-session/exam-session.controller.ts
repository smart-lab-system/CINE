import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { ExamSessionService } from './exam-session.service';
import { CreateExamSessionDto } from './dto/create-exam-session.dto';
import { SearchExamSessionsDto } from './dto/search-exam-sessions.dto';

// JWT required on every route; RolesGuard is registered class-wide but only
// bites on handlers that carry @Roles(...) (it returns true when no metadata
// is present — see RolesGuard.canActivate), so the read routes below keep
// their existing behaviour.
//
// Roles are applied PER HANDLER, not at the class level, on purpose:
//  - POST (create) is teacher-only. An exam session is owned by
//    `teacher_id`, and every downstream check (GET /:id, teacher:subscribe,
//    finalize) compares against that column — an admin-owned session would
//    be an orphan no teacher UI can reach. Before this, ANY authenticated
//    account could create one.
//  - The GET routes stay role-open because they are already owner-scoped by
//    `req.user.sub` (findAllForOwner / findByIdForOwner): a non-teacher
//    calling them sees their own — necessarily empty — set, never another
//    account's sessions. Locking them to 'teacher' as well would be a
//    behaviour change beyond the reported gap, so it is deliberately not
//    done here.
@Controller('exam-sessions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ExamSessionController {
  constructor(private readonly examSessions: ExamSessionService) {}

  @Post()
  @Roles('teacher')
  create(@Body() dto: CreateExamSessionDto, @Req() req: Request) {
    // req.user is always set here — JwtAuthGuard already rejected the
    // request with 401 otherwise (see auth/types.ts for the augmentation
    // that types this without a cast).
    return this.examSessions.create(req.user!.sub, dto);
  }

  // Registered before ':id' would matter for a literal-vs-param collision,
  // but Nest/Express route matching is unambiguous here regardless — GET
  // /exam-sessions (no path segment) and GET /exam-sessions/:id are
  // different shapes, not competing patterns.
  @Get()
  findAllForOwner(@Query() query: SearchExamSessionsDto, @Req() req: Request) {
    return this.examSessions.findAllForOwner(req.user!.sub, query);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Req() req: Request) {
    return this.examSessions.findByIdForOwner(id, req.user!.sub);
  }
}
