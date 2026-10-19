import {
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
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import type { Request } from 'express';
import { IdeExtensionsService } from './ide-extensions.service';
import {
  AcceptCreateRoomDto,
  BatchSyncDto,
  CatalogFromScanDto,
  CreateCatalogExtensionDto,
  CreateCatalogVersionDto,
  CreateCoursePolicyItemDto,
  CreateRoomProposalDto,
  EffectiveQueryDto,
  RejectRoomProposalDto,
  UpdateCatalogExtensionDto,
} from './dto/ide-extensions.dto';

@Controller('ide-extensions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class IdeExtensionsController {
  constructor(private readonly service: IdeExtensionsService) {}

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

  @Post('scans/batch')
  @Roles('admin', 'teacher')
  batch(@Body() dto: BatchSyncDto, @Req() req: Request) {
    return this.service.syncBatch(dto, req.user!.sub);
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
