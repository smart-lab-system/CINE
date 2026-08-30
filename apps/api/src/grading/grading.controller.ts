import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { ExamSessionService } from '../exam-session/exam-session.service';
import { GradingService } from './grading.service';
import { RubricService } from './rubric.service';
import { SaveRubricDto } from './dto/rubric.dto';

/**
 * The grading side of the API.
 *
 * `start-grading` is the boundary CLAUDE.md draws between the two
 * pipelines, and it exists as a route precisely so that it CANNOT be
 * reached from collection: a submission becoming `collected` calls nothing.
 * Someone has to click.
 */
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class GradingController {
  constructor(
    private readonly grading: GradingService,
    private readonly rubrics: RubricService,
    private readonly examSessions: ExamSessionService,
  ) {}

  @Get('courses/:courseId/rubrics')
  @Roles('teacher')
  listRubrics(@Param('courseId', ParseUUIDPipe) courseId: string, @Req() req: Request) {
    return this.rubrics.listForCourse(courseId, req.user!.sub);
  }

  /**
   * Saves a new VERSION — there is no update route, and that is the design.
   * Editing criteria a result already points at is what Security rule 7
   * forbids, so "edit" and "new version" are the same act.
   */
  @Post('courses/:courseId/rubrics')
  @Roles('teacher')
  saveRubric(
    @Param('courseId', ParseUUIDPipe) courseId: string,
    @Body() dto: SaveRubricDto,
    @Req() req: Request,
  ) {
    return this.rubrics.saveNewVersion(courseId, req.user!.sub, dto);
  }

  /**
   * The explicit teacher action. Never automatic, never chained from
   * collection — a session can sit `completed` for a week before anyone
   * presses this.
   */
  @Post('exam-sessions/:id/start-grading')
  @Roles('teacher')
  @HttpCode(200)
  async startGrading(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    const session = await this.examSessions.findEntityForOwner(id, req.user!.sub);
    return this.grading.startGrading(session, req.user!.sub);
  }

  @Get('exam-sessions/:id/grading-results')
  @Roles('teacher')
  async listResults(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    const session = await this.examSessions.findEntityForOwner(id, req.user!.sub);
    return this.grading.listForSession(session.id);
  }
}
