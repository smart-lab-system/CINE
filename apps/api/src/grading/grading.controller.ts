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
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { ExamSessionService } from '../exam-session/exam-session.service';
import { GradingService } from './grading.service';
import { GradingRunService } from './grading-run.service';
import { GradingReferenceService } from './grading-reference.service';
import { UpsertGradingReferenceDto } from './dto/upsert-grading-reference.dto';
import { RubricService } from './rubric.service';
import { TeacherReviewService } from './teacher-review.service';
import { SaveRubricDto } from './dto/rubric.dto';
import { SetSessionRubricDto } from './dto/set-session-rubric.dto';
import { SubmitReviewDto } from './dto/submit-review.dto';

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
    private readonly gradingRun: GradingRunService,
    private readonly rubrics: RubricService,
    private readonly teacherReviews: TeacherReviewService,
    private readonly examSessions: ExamSessionService,
    private readonly references: GradingReferenceService,
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
    return this.gradingRun.startGrading(session, req.user!.sub);
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

  /**
   * One review of one result. Creates a TeacherReview row — it NEVER
   * overwrites GradingResult (Security rule 6, and
   * guard_grading_result_ai_immutable refuses if anything tries).
   *
   * Checks in order: who are you (404/403) → is this possible at all (409) →
   * is the input valid (400). The status gate is the middle one, and it is
   * what stops a review being written while the AI is still grading.
   */
  @Post('grading-results/:id/review')
  @Roles('teacher')
  async submitReview(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SubmitReviewDto,
    @Req() req: Request,
  ) {
    const result = await this.grading.findResultForOwner(id, req.user!.sub);
    return this.teacherReviews.review(result, req.user!.sub, dto);
  }

  /**
   * Publishes a session's grades. The point of no return: from here on, a
   * score edit is exceptional and lands in the audit log.
   */
  @Post('exam-sessions/:id/finalize-grades')
  @Roles('teacher')
  @HttpCode(200)
  async finalizeGrades(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    const session = await this.examSessions.findEntityForOwner(id, req.user!.sub);
    return this.teacherReviews.finalizeGrades(session.id, req.user!.sub);
  }

  /**
   * Tiến độ của một lượt chấm đang chạy.
   *
   * Tồn tại vì từ 2026-09-11 `POST .../start-grading` trả về NGAY sau khi
   * xếp hàng, không phải sau khi chấm xong. Không có route này thì giảng
   * viên bấm "Bắt đầu chấm" rồi nhìn một màn hình không đổi gì trong
   * nhiều phút — kỹ thuật đúng, trải nghiệm thụt lùi.
   *
   * `total/pending/done/byStatus` đếm `grading_result` nên CHÍNH XÁC
   * theo phiên; `queue` đếm toàn hàng đợi và chỉ để trả lời "có đang kẹt
   * không". Hai nguồn, hai câu hỏi — xem GradingProgress.
   */
  @Get('exam-sessions/:id/grading-progress')
  @Roles('teacher')
  async gradingProgress(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    const session = await this.examSessions.findEntityForOwner(id, req.user!.sub);
    return this.gradingRun.progress(session.id);
  }

  /**
   * Chọn đề bài và đáp án mẫu cho lượt chấm.
   *
   * `PUT` chứ không `POST`: một phiên có đúng MỘT bản tài liệu tham chiếu
   * (`uq_grading_reference_session`), và gọi lại là sửa bản đó chứ không
   * tạo bản thứ hai.
   *
   * 409 khi phiên đã có kết quả chấm — cùng luật với `PATCH /:id/rubric`.
   */
  @Put('exam-sessions/:id/grading-reference')
  @Roles('teacher')
  async setGradingReference(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpsertGradingReferenceDto,
    @Req() req: Request,
  ) {
    const session = await this.examSessions.findEntityForOwner(id, req.user!.sub);
    return this.references.upsert(session, dto, req.user!.sub);
  }

  /**
   * URL upload cho đáp án mẫu. File đi thẳng lên kho, không qua NestJS
   * (Security rule 5).
   *
   * Khoá nằm dưới prefix `grading-reference/`, TÁCH HẲN khỏi `materials/`
   * — đó là cơ chế giữ cho đáp án không bao giờ lọt vào `listForAgent`.
   */
  @Post('exam-sessions/:id/grading-reference/answer-key-upload')
  @Roles('teacher')
  @HttpCode(200)
  async requestAnswerKeyUpload(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    const session = await this.examSessions.findEntityForOwner(id, req.user!.sub);
    return this.references.requestAnswerKeyUpload(session);
  }

  /**
   * Lượt chấm này sẽ chạy ở mức ngữ cảnh nào.
   *
   * Tồn tại để màn hình chấm nói ra TRƯỚC khi giảng viên bấm. Mức "chỉ có
   * rubric" là mức hệ thống chạy hôm nay, âm thầm — không cấm nó, nhưng
   * một giảng viên chấm ở mức đó mà tin mình đủ tài liệu sẽ để lọt đúng
   * những em mà tính năng này sinh ra để bảo vệ.
   */
  @Get('exam-sessions/:id/grading-readiness')
  @Roles('teacher')
  async gradingReadiness(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    // Kiểm chủ sở hữu trước: `session_roster` và tài liệu chấm là dữ liệu
    // của phiên, không phải thông tin công khai.
    const session = await this.examSessions.findEntityForOwner(id, req.user!.sub);
    return this.references.readiness(session.id);
  }

  @Get('exam-sessions/:id/grading-results')
  @Roles('teacher')
  async listResults(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    const session = await this.examSessions.findEntityForOwner(id, req.user!.sub);
    return this.grading.listForSession(session.id);
  }
}
