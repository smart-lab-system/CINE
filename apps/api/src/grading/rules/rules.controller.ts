import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { CriterionWaiverService } from './criterion-waiver.service';
import { CriterionWaiverDto } from './dto/criterion-waiver.dto';
import { RuleChangesDto } from './dto/rule-body.dto';
import { SplitRuleDto } from './dto/rubric-error.dto';
import { RuleStateDto } from './dto/rule-state.dto';
import { ErrorRuleService } from './error-rule.service';
import { ProposalService } from './proposal.service';
import { parseRuleChanges } from './rule-input';

/**
 * Thư viện lỗi của CHÍNH người gọi (§2.1 *"khoá theo giảng viên"*). Không
 * route nào nhận `teacherId` từ body; luật / rubric của người khác → 404 (T-POL-8).
 * Gán lỗi vào rubric / giá theo dòng áp dụng: `/rubric-errors` (Task A9).
 * Route tĩnh (`rules/missing`) khai TRƯỚC `rules/:id`.
 */
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class RulesController {
  constructor(
    private readonly rules: ErrorRuleService,
    private readonly proposals: ProposalService,
    private readonly waivers: CriterionWaiverService,
  ) {}

  @Get('rules')
  @Roles('teacher')
  list(@Req() req: Request) {
    return this.rules.library(req.user!.sub);
  }

  /** *Lỗi AI đề xuất* — spec §4.3. `rubricName` lọc theo nơi thấy. */
  @Get('rules/missing')
  @Roles('teacher')
  missing(@Req() req: Request, @Query('rubricName') rubricName?: string) {
    return this.proposals.list(req.user!.sub, rubricName);
  }

  @Patch('rules/:id')
  @Roles('teacher')
  revise(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request, @Body() dto: RuleChangesDto) {
    return this.rules.revise(req.user!.sub, id, parseRuleChanges(dto));
  }

  @Post('rules/:id/split')
  @Roles('teacher')
  split(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request, @Body() dto: SplitRuleDto) {
    return this.rules.split(req.user!.sub, id, {
      rubricName: dto.rubricName,
      changes: parseRuleChanges(dto.changes ?? {}),
    });
  }

  @Post('rules/:id/state')
  @Roles('teacher')
  @HttpCode(200)
  setState(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request, @Body() dto: RuleStateDto) {
    return this.rules.setState(req.user!.sub, id, dto.state);
  }

  @Get('rubrics/:id/criterion-waivers')
  @Roles('teacher')
  listWaivers(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    return this.waivers.list(req.user!.sub, id);
  }

  /** *"Tiêu chí này không có luật trừ"* — ghi được giữa lô (T-WAIVER-1). */
  @Post('rubrics/:id/criterion-waivers')
  @Roles('teacher')
  setWaiver(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request, @Body() dto: CriterionWaiverDto) {
    return this.waivers.set(req.user!.sub, id, dto.criterionKey);
  }

  @Post('criterion-waivers/:id/revoke')
  @Roles('teacher')
  @HttpCode(200)
  revokeWaiver(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    return this.waivers.revoke(req.user!.sub, id);
  }
}
