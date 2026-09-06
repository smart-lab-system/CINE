import {
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
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
import { SetSessionRubricDto } from './dto/set-session-rubric.dto';

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

  /**
   * Changes which rubric a session will be graded against — until the first
   * result exists, then never again.
   *
   * Lives on GradingController rather than ExamSessionController because
   * GradingModule imports ExamSessionModule in one direction; a route
   * needing rubric knowledge on the session controller would invert that.
   * The path is still `exam-sessions/...`, exactly like `start-grading`
   * above — this controller carries no prefix.
   *
   * The 409 is the point: once a GradingResult cites a rubric version,
   * swapping the session's rubric rewrites what was already decided, which
   * is what Security rule 7 exists to prevent.
   */
  @Patch('exam-sessions/:id/rubric')
  @Roles('teacher')
  async setSessionRubric(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetSessionRubricDto,
    @Req() req: Request,
  ) {
    const session = await this.examSessions.findEntityForOwner(id, req.user!.sub);
    if (await this.grading.hasResultsForSession(session.id)) {
      throw new ConflictException(
        'Phiên thi này đã có kết quả chấm — không đổi được rubric nữa.',
      );
    }
    return this.examSessions.setRubric(session, dto.rubricId);
  }

  @Get('exam-sessions/:id/grading-results')
  @Roles('teacher')
  async listResults(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    const session = await this.examSessions.findEntityForOwner(id, req.user!.sub);
    return this.grading.listForSession(session.id);
  }
}
