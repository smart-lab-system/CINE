import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ExamSessionService } from './exam-session.service';
import { CreateExamSessionDto } from './dto/create-exam-session.dto';

// JWT required, no role restriction — any authenticated account may create
// and own an exam session in this demo's scope (see task brief; no
// @Roles(...)/RolesGuard here, unlike AccountsController).
@Controller('exam-sessions')
@UseGuards(JwtAuthGuard)
export class ExamSessionController {
  constructor(private readonly examSessions: ExamSessionService) {}

  @Post()
  create(@Body() dto: CreateExamSessionDto, @Req() req: Request) {
    // req.user is always set here — JwtAuthGuard already rejected the
    // request with 401 otherwise (see auth/types.ts for the augmentation
    // that types this without a cast).
    return this.examSessions.create(req.user!.sub, dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Req() req: Request) {
    return this.examSessions.findByIdForOwner(id, req.user!.sub);
  }
}
