import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
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

  /**
   * Manual "Chốt bài ngay". Teacher-only and owner-only (the ownership
   * check lives in the service, reusing findByIdForOwner), and shares
   * ExamSessionService.finalizeExamSession with the scheduled sweep — the
   * two never diverge because there is only one implementation.
   *
   * 200, not 201: this mutates an existing session, it does not create
   * anything. Idempotent — finalizing an already-completed session
   * returns the same 200 with the same body and broadcasts nothing a
   * second time.
   *
   * ParseUUIDPipe here but not on GET /:id: a non-uuid id reaching the
   * service turns into a Postgres 22P02 (invalid text representation),
   * which PostgresExceptionFilter has no mapping for. GET already had
   * that quirk before this change and fixing it there is out of scope,
   * but a new write endpoint should not ship with it.
   */
  /**
   * The lobby's data: three groups, the headcount, and — once the session is
   * over — who submitted without having been counted. Read from the
   * attendance log rather than from whatever the page happened to witness,
   * so a refresh mid-exam does not lose the room.
   */
  @Get(':id/attendance')
  findAttendance(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    return this.examSessions.findAttendanceForOwner(id, req.user!.sub);
  }

  /** "Chốt sĩ số" — an observation, not a lock on the door. */
  @Post(':id/attendance/confirm')
  @HttpCode(200)
  confirmAttendance(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    return this.examSessions.confirmAttendanceForOwner(id, req.user!.sub);
  }

  @Post(':id/finalize')
  @Roles('teacher')
  @HttpCode(200)
  finalize(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    return this.examSessions.finalizeForOwner(id, req.user!.sub);
  }
}
