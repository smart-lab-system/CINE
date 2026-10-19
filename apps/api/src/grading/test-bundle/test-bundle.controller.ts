import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { ExamSessionService } from '../../exam-session/exam-session.service';
import { CreateTestBundleDto } from './dto/create-test-bundle.dto';
import { DropTestCaseDto } from './dto/drop-test-case.dto';
import { RunTestBundleDto } from './dto/run-test-bundle.dto';
import { TestBundleService } from './test-bundle.service';
import { TestRunService } from './test-run.service';

/**
 * Tạo, duyệt, ghim gói test của MỘT phiên (§14.1, 3d2). Ownership luôn qua
 * `findEntityForOwner` trước — không route nào nhận `teacherId` từ body.
 */
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class TestBundleController {
  constructor(
    private readonly bundles: TestBundleService,
    private readonly runs: TestRunService,
    private readonly examSessions: ExamSessionService,
  ) {}

  @Post('exam-sessions/:id/test-bundles')
  @Roles('teacher')
  async create(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateTestBundleDto, @Req() req: Request) {
    const session = await this.examSessions.findEntityForOwner(id, req.user!.sub);
    return this.bundles.create(session.id, req.user!.sub, dto);
  }

  @Get('exam-sessions/:id/test-bundles')
  @Roles('teacher')
  async list(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    const session = await this.examSessions.findEntityForOwner(id, req.user!.sub);
    return this.bundles.list(session.id);
  }

  @Get('exam-sessions/:id/test-bundles/:bundleId')
  @Roles('teacher')
  async get(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('bundleId', ParseUUIDPipe) bundleId: string,
    @Req() req: Request,
  ) {
    const session = await this.examSessions.findEntityForOwner(id, req.user!.sub);
    return this.bundles.get(session.id, bundleId);
  }

  @Post('exam-sessions/:id/test-bundles/:bundleId/approve')
  @Roles('teacher')
  @HttpCode(201)
  async approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('bundleId', ParseUUIDPipe) bundleId: string,
    @Req() req: Request,
  ) {
    const session = await this.examSessions.findEntityForOwner(id, req.user!.sub);
    return this.bundles.approve(session.id, bundleId, req.user!.sub);
  }

  @Post('exam-sessions/:id/test-bundles/:bundleId/pin')
  @Roles('teacher')
  @HttpCode(201)
  async pin(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('bundleId', ParseUUIDPipe) bundleId: string,
    @Req() req: Request,
  ) {
    const session = await this.examSessions.findEntityForOwner(id, req.user!.sub);
    return this.bundles.pin(session.id, bundleId);
  }

  /**
   * Chạy thử đáp án mẫu của giảng viên trên gói này: một ca (`caseKey`) hay mọi ca đang dùng. Không đổi duyệt, ghim hay
   * `ruler_trust`. Mã đáp án không đi qua body: server đọc nó từ kho.
   */
  @Post('exam-sessions/:id/test-bundles/:bundleId/runs')
  @Roles('teacher')
  @HttpCode(201)
  async run(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('bundleId', ParseUUIDPipe) bundleId: string,
    @Body() dto: RunTestBundleDto,
    @Req() req: Request,
  ) {
    const session = await this.examSessions.findEntityForOwner(id, req.user!.sub);
    return this.runs.run(session.id, req.user!.sub, bundleId, dto.caseKey ?? null);
  }

  @Post('exam-sessions/:id/test-bundles/:bundleId/drop-case')
  @Roles('teacher')
  @HttpCode(201)
  async dropCase(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('bundleId', ParseUUIDPipe) bundleId: string,
    @Body() dto: DropTestCaseDto,
    @Req() req: Request,
  ) {
    const session = await this.examSessions.findEntityForOwner(id, req.user!.sub);
    return this.bundles.dropCase(session.id, bundleId, dto.caseKey);
  }
}
