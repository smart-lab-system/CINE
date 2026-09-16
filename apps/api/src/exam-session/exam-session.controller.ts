import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
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
import { ExamSessionReassignService } from './exam-session-reassign.service';
import { CollectionPhaseService } from './collection-phase.service';
import { RecollectService } from './recollect.service';
import { SessionLifecycleService } from './session-lifecycle.service';
import { CreateExamSessionDto } from './dto/create-exam-session.dto';
import { ReassignTeacherDto } from './dto/reassign-teacher.dto';
import { SearchExamSessionsDto } from './dto/search-exam-sessions.dto';
import { ExamMaterialService } from './exam-material.service';
import {
  CreateExamMaterialDto,
  RequestMaterialUploadDto,
} from './dto/exam-material.dto';

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
  constructor(
    private readonly examSessions: ExamSessionService,
    private readonly materials: ExamMaterialService,
    private readonly lifecycle: SessionLifecycleService,
    private readonly reassign: ExamSessionReassignService,
    private readonly collectionPhase: CollectionPhaseService,
    private readonly recollectService: RecollectService,
  ) {}

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
   * Chuyển chủ phiên thi — `admin` duy nhất (CLAUDE.md §7.2.6). Vá lỗ
   * hổng ở §5.5: đổi `class.teacher_id` không kéo theo các phiên thi đã
   * tạo, và trước route này không ai sửa được một phiên đã tạo sai chủ.
   *
   * Route ghi ĐẦU TIÊN trên controller này mang `@Roles('admin')` — chủ
   * cũ cũng không tự chuyển được, vì tự chuyển là lách khỏi audit.
   */
  @Patch(':id/teacher')
  @Roles('admin')
  reassignTeacher(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReassignTeacherDto,
    @Req() req: Request,
  ) {
    return this.reassign.reassignTeacher(id, dto.teacherId, req.user!.sub);
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

  /**
   * Exam materials — the question paper, the dataset, the starter code.
   *
   * Two steps, like a submission: mint a URL, then confirm the object
   * landed. The file never passes through this server (Security rule 5),
   * and no row exists until the bytes really do — a session that lists a
   * paper nobody can open is worse than one that lists nothing.
   *
   * Teacher-only, and owner-scoped inside the service. Releasing these to
   * an AGENT is a different question with a different gate — see
   * ExamMaterialService.listForAgent and Security rule 2.
   */
  @Post(':id/materials/upload-url')
  @Roles('teacher')
  @HttpCode(200)
  async requestMaterialUpload(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RequestMaterialUploadDto,
    @Req() req: Request,
  ) {
    const session = await this.examSessions.findEntityForOwner(id, req.user!.sub);
    return this.materials.requestUpload(session, dto);
  }

  @Post(':id/materials')
  @Roles('teacher')
  async createMaterial(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateExamMaterialDto,
    @Req() req: Request,
  ) {
    const session = await this.examSessions.findEntityForOwner(id, req.user!.sub);
    return this.materials.create(session, dto);
  }

  @Get(':id/materials')
  @Roles('teacher')
  async findMaterials(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    const session = await this.examSessions.findEntityForOwner(id, req.user!.sub);
    return this.materials.listForTeacher(session);
  }

  @Delete(':id/materials/:materialId')
  @Roles('teacher')
  @HttpCode(204)
  async removeMaterial(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('materialId', ParseUUIDPipe) materialId: string,
    @Req() req: Request,
  ) {
    const session = await this.examSessions.findEntityForOwner(id, req.user!.sub);
    return this.materials.remove(session, materialId);
  }

  @Post(':id/finalize')
  @Roles('teacher')
  @HttpCode(200)
  finalize(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    return this.examSessions.finalizeForOwner(id, req.user!.sub);
  }

  /**
   * "Xác nhận kết thúc" — `collecting → completed`, ghi tên người chốt.
   *
   * Khác `finalize` ở trên: `finalize` nghĩa là "hết giờ, nộp đi" và đưa
   * phiên VÀO `collecting`; cái này nghĩa là "tôi đã nhìn phòng, xong"
   * và đưa nó RA. Hai nút khác nhau trên màn hình, hai ý nghĩa khác nhau.
   *
   * 200 và idempotent, như `finalize`: gọi lại trên phiên đã chốt trả
   * về cùng trạng thái, không lỗi.
   */
  @Post(':id/confirm-end')
  @Roles('teacher')
  @HttpCode(200)
  confirmEnd(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    return this.collectionPhase.confirmEnd(id, req.user!.sub);
  }

  /**
   * "Thu lại" — yêu cầu agent của những em chưa nộp đủ gửi lại bài.
   *
   * Cho bấm nhiều lần: đây là thao tác đọc-rồi-gửi, không đổi trạng thái
   * gì ở server, và em đã nộp giữa hai lần bấm tự rơi khỏi tập đích.
   */
  @Post(':id/recollect')
  @Roles('teacher')
  @HttpCode(200)
  recollect(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    return this.recollectService.requestRecollect(id, req.user!.sub);
  }

  /**
   * "Lưu trữ" — phiên nháp/tạo thử, ẩn khỏi cả trang "Quản lý bài thu".
   * Khác hẳn attention-close bên dưới: cái này nói "không phải việc thật",
   * cái kia nói "việc thật này đã xong". Xem spec §4.3.
   */
  @Post(':id/archive')
  @Roles('teacher')
  @HttpCode(200)
  async archive(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    await this.lifecycle.archive(id, req.user!.sub);
    return { ok: true };
  }

  @Delete(':id/archive')
  @Roles('teacher')
  @HttpCode(200)
  async unarchive(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    await this.lifecycle.unarchive(id, req.user!.sub);
    return { ok: true };
  }

  /**
   * "Khép" — phiên rời mục cần chú ý nhưng vẫn nằm trong danh sách theo môn.
   * Hôm nay chỉ giảng viên bấm; khi module xuất điểm ra đời nó ghi vào CÙNG
   * cột này tự động (spec §1.3).
   */
  @Post(':id/attention-close')
  @Roles('teacher')
  @HttpCode(200)
  async closeAttention(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    await this.lifecycle.closeAttention(id, req.user!.sub);
    return { ok: true };
  }

  @Delete(':id/attention-close')
  @Roles('teacher')
  @HttpCode(200)
  async reopenAttention(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    await this.lifecycle.reopenAttention(id, req.user!.sub);
    return { ok: true };
  }
}
