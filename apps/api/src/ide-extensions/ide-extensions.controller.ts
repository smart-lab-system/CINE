import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import type { Request } from 'express';
import { IdeExtensionJplagDemoService } from './jplag/jplag-demo.service';
import { JplagExamService } from './jplag/jplag-exam.service';
import { JPLAG_DEMO_MAX_ARCHIVE_BYTES } from './jplag/jplag.constants';
import { IdeExtensionsService } from './ide-extensions.service';
import {
  AcceptCreateRoomDto,
  BatchSyncDto,
  CatalogFromScanDto,
  BrowseFileQueryDto,
  ConfirmArtifactDto,
  NormalizedSourcesQueryDto,
  CreateCatalogExtensionDto,
  CreateCatalogVersionDto,
  CreateCoursePolicyItemDto,
  CreateRoomProposalDto,
  EffectiveQueryDto,
  EnsureArtifactsDto,
  RejectRoomProposalDto,
  UpdateCatalogExtensionDto,
  VerifyTeacherMachineDto,
  ViolationsQueryDto,
} from './dto/ide-extensions.dto';

@Controller('ide-extensions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class IdeExtensionsController {
  constructor(
    private readonly service: IdeExtensionsService,
    private readonly jplagDemoService: IdeExtensionJplagDemoService,
    private readonly jplagExamService: JplagExamService,
  ) {}

  // ── Catalog ───────────────────────────────────────────────────────

  @Get('catalog')
  @Roles('admin', 'teacher')
  listCatalog() {
    return this.service.listCatalog();
  }

  /** Phải khai báo trước `catalog/:id` để không bị ParseUUIDPipe nuốt. */
  @Post('catalog/from-scan')
  @Roles('admin')
  fromScan(@Body() dto: CatalogFromScanDto) {
    return this.service.upsertFromScan(dto);
  }

  /** Phải khai báo trước `catalog/:id` — Teacher Hub sync VSIX artifacts. */
  @Post('catalog/ensure-artifacts')
  @Roles('admin', 'teacher')
  ensureArtifacts(@Body() dto: EnsureArtifactsDto) {
    return this.service.ensureArtifacts(dto);
  }

  @Get('catalog/:id')
  @Roles('admin', 'teacher')
  getCatalog(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getCatalogDetail(id);
  }

  @Post('catalog')
  @Roles('admin')
  createCatalog(@Body() dto: CreateCatalogExtensionDto) {
    return this.service.createCatalogExtension(dto);
  }

  @Patch('catalog/:id')
  @Roles('admin')
  updateCatalog(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCatalogExtensionDto,
  ) {
    return this.service.updateCatalogExtension(id, dto);
  }

  @Post('catalog/:id/refresh-marketplace')
  @Roles('admin')
  refreshMarketplace(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.refreshMarketplace(id);
  }

  @Post('catalog/:id/versions')
  @Roles('admin')
  addVersion(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateCatalogVersionDto,
  ) {
    return this.service.addCatalogVersion(id, dto);
  }

  @Patch('versions/:versionId/approve')
  @Roles('admin')
  approveVersion(
    @Param('versionId', ParseUUIDPipe) versionId: string,
    @Req() req: Request,
  ) {
    return this.service.approveVersion(versionId, req.user!.sub);
  }

  @Patch('versions/:versionId/unapprove')
  @Roles('admin')
  unapproveVersion(@Param('versionId', ParseUUIDPipe) versionId: string) {
    return this.service.unapproveVersion(versionId);
  }

  @Delete('versions/:versionId')
  @Roles('admin')
  deleteVersion(@Param('versionId', ParseUUIDPipe) versionId: string) {
    return this.service.deleteVersion(versionId);
  }

  @Post('versions/:versionId/confirm-artifact')
  @Roles('admin', 'teacher')
  confirmArtifact(
    @Param('versionId', ParseUUIDPipe) versionId: string,
    @Body() dto: ConfirmArtifactDto,
  ) {
    return this.service.confirmArtifact(versionId, dto);
  }

  @Get('versions/:versionId/browse')
  @Roles('admin', 'teacher')
  browseVersion(@Param('versionId', ParseUUIDPipe) versionId: string) {
    return this.service.browseVersion(versionId);
  }

  @Get('versions/:versionId/browse/file')
  @Roles('admin', 'teacher')
  browseVersionFile(
    @Param('versionId', ParseUUIDPipe) versionId: string,
    @Query() query: BrowseFileQueryDto,
  ) {
    return this.service.browseVersionFile(versionId, query.path);
  }

  /** Snippets-first normalize (on-demand). Đặt gần browse — không nuốt bởi route khác. */
  @Get('versions/:versionId/normalized-sources')
  @Roles('admin', 'teacher')
  getNormalizedSources(
    @Param('versionId', ParseUUIDPipe) versionId: string,
    @Query() query: NormalizedSourcesQueryDto,
  ) {
    const raw = query.raw === '1' || query.raw === 'true';
    return this.service.getNormalizedSources(versionId, { raw });
  }

  /**
   * Demo JPlag: luôn chạy 2 profile (text + language) rồi trả comparison parse sẵn.
   * multipart: language, archive? (zip), files? (webkitdirectory).
   */
  @Post('versions/:versionId/jplag-demo')
  @Roles('admin', 'teacher')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'archive', maxCount: 1 },
        { name: 'files', maxCount: 500 },
      ],
      {
        storage: memoryStorage(),
        limits: { fileSize: JPLAG_DEMO_MAX_ARCHIVE_BYTES, files: 501 },
      },
    ),
  )
  jplagDemo(
    @Param('versionId', ParseUUIDPipe) versionId: string,
    @Body('language') language: string,
    @UploadedFiles()
    uploaded?: {
      archive?: Express.Multer.File[];
      files?: Express.Multer.File[];
    },
  ) {
    if (!language?.trim()) {
      throw new BadRequestException('Thiếu language (javascript|typescript|cpp|python3|java).');
    }
    const archive = uploaded?.archive?.[0] ?? null;
    const files = uploaded?.files ?? [];
    if (!archive && files.length === 0) {
      throw new BadRequestException('Cần upload ZIP (archive) hoặc chọn thư mục (files).');
    }
    return this.jplagDemoService.runDemo(versionId, language.trim(), {
      archive: archive
        ? {
            originalname: archive.originalname,
            buffer: archive.buffer,
            size: archive.size,
            mimetype: archive.mimetype,
          }
        : null,
      files: files.map((f) => ({
        originalname: f.originalname,
        buffer: f.buffer,
        size: f.size,
        mimetype: f.mimetype,
      })),
    });
  }

  @Post('versions/:versionId/extract')
  @Roles('admin', 'teacher')
  requestExtract(@Param('versionId', ParseUUIDPipe) versionId: string) {
    return this.service.requestExtract(versionId);
  }

  // ── Course policy ─────────────────────────────────────────────────

  @Get('policies/course/:courseId/items')
  @Roles('admin', 'teacher')
  listCourse(@Param('courseId', ParseUUIDPipe) courseId: string) {
    return this.service.listCourseItems(courseId);
  }

  @Post('policies/course/items')
  @Roles('admin', 'teacher')
  addCourse(@Body() dto: CreateCoursePolicyItemDto, @Req() req: Request) {
    return this.service.addCourseItem(dto, req.user!.sub);
  }

  @Patch('policies/items/:id/approve')
  @Roles('admin')
  approve(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    return this.service.setItemApproval(id, 'approved', req.user!.sub);
  }

  @Patch('policies/items/:id/reject')
  @Roles('admin')
  reject(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    return this.service.setItemApproval(id, 'rejected', req.user!.sub);
  }

  @Delete('policies/items/:id')
  @Roles('admin')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.removeItem(id);
  }

  // ── Effective + scans ─────────────────────────────────────────────

  @Get('effective')
  @Roles('admin', 'teacher')
  effective(@Query() query: EffectiveQueryDto) {
    return this.service.getEffective(query);
  }

  /** Blocked scan pairs still open under global catalog approval (2B). */
  @Get('violations')
  @Roles('admin', 'teacher')
  listViolations(@Query() query: ViolationsQueryDto) {
    return this.service.listViolations(query.examSessionId);
  }

  @Post('scans/batch')
  @Roles('admin', 'teacher')
  async batch(@Body() dto: BatchSyncDto, @Req() req: Request) {
    const result = await this.service.syncBatch(dto, req.user!.sub);
    const blocked = (dto.scans ?? []).flatMap((scan) =>
      (scan.items ?? [])
        .filter((it) => it.verdict === 'blocked')
        .map((it) => ({
          extensionId: it.extensionId,
          version: it.version ?? null,
          studentMssv: scan.studentMssv,
        })),
    );
    await this.jplagExamService.enqueueFromBlockedScans(dto.examSessionId, blocked, 'scan');
    return result;
  }

  // ── JPlag exam-flow (teacher findings) ────────────────────────────

  @Get('jplag/sessions/:examSessionId/runs')
  @Roles('admin', 'teacher')
  listJplagRuns(@Param('examSessionId', ParseUUIDPipe) examSessionId: string) {
    return this.jplagExamService.listRuns(examSessionId);
  }

  @Get('jplag/runs/:runId')
  @Roles('admin', 'teacher')
  getJplagRun(@Param('runId', ParseUUIDPipe) runId: string) {
    return this.jplagExamService.getRun(runId);
  }

  @Get('jplag/runs/:runId/comparison')
  @Roles('admin', 'teacher')
  getJplagComparison(
    @Param('runId', ParseUUIDPipe) runId: string,
    @Query('profile') profile?: string,
  ) {
    const p = profile === 'language' ? 'language' : 'text';
    return this.jplagExamService.getRunComparison(runId, p);
  }

  @Post('jplag/sessions/:examSessionId/runs/:runId/retry-vs-model')
  @Roles('admin', 'teacher')
  retryJplagVsModel(
    @Param('examSessionId', ParseUUIDPipe) examSessionId: string,
    @Param('runId', ParseUUIDPipe) runId: string,
  ) {
    return this.jplagExamService.retryVsModel(examSessionId, runId);
  }

  @Get('scans')
  @Roles('admin', 'teacher')
  listScans(
    @Query('labMgmtSessionId') labMgmtSessionId?: string,
    @Query('courseId') courseId?: string,
  ) {
    return this.service.listScans(labMgmtSessionId, courseId);
  }

  @Get('scans/:id')
  @Roles('admin', 'teacher')
  getScan(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getScanWithItems(id);
  }

  // ── Teacher machine verify (Agent Hub) ────────────────────────────

  @Post('lab/teacher-machine/verify')
  @Roles('teacher', 'admin')
  verifyTeacherMachine(@Body() dto: VerifyTeacherMachineDto) {
    return this.service.verifyTeacherMachine(dto);
  }

  // ── Room proposals ────────────────────────────────────────────────

  @Post('lab/room-proposals')
  @Roles('teacher', 'admin')
  createRoomProposal(@Body() dto: CreateRoomProposalDto, @Req() req: Request) {
    return this.service.createRoomProposal(dto, req.user!.sub);
  }

  @Get('lab/room-proposals')
  @Roles('admin', 'teacher')
  listRoomProposals(@Query('status') status?: string) {
    return this.service.listRoomProposals(status);
  }

  @Get('lab/room-proposals/:id')
  @Roles('admin', 'teacher')
  getRoomProposal(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getRoomProposal(id);
  }

  @Patch('lab/room-proposals/:id/reject')
  @Roles('admin')
  rejectRoomProposal(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectRoomProposalDto,
    @Req() req: Request,
  ) {
    return this.service.rejectRoomProposal(id, req.user!.sub, dto);
  }

  @Patch('lab/room-proposals/:id/withdraw')
  @Roles('teacher', 'admin')
  withdrawRoomProposal(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    return this.service.withdrawRoomProposal(id, req.user!.sub);
  }

  @Post('lab/room-proposals/:id/accept-create-room')
  @Roles('admin')
  acceptCreateRoom(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AcceptCreateRoomDto,
    @Req() req: Request,
  ) {
    return this.service.acceptCreateRoom(id, req.user!.sub, dto);
  }
}
