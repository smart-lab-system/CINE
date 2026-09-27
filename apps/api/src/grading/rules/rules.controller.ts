import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { CriterionWaiverService } from './criterion-waiver.service';
import { CriterionWaiverDto } from './dto/criterion-waiver.dto';
import { PriceBodyDto } from './dto/price-body.dto';
import { RuleBodyDto, RuleChangesDto, RulePreviewDto } from './dto/rule-body.dto';
import { RuleStateDto } from './dto/rule-state.dto';
import { ErrorRuleService } from './error-rule.service';
import { PriceService } from './price.service';
import { parseDeduction, parseRuleChanges, parseRuleInput } from './rule-input';

/**
 * Bảng lỗi, bảng giá, đánh dấu tiêu chí của CHÍNH người gọi (§2.1 *"khoá theo giảng viên"*). Không
 * route nào nhận `teacherId` từ body; luật / rubric của người khác → 404 (T-POL-8).
 *
 * Route tĩnh (`rules/missing`, `rules/preview`) khai TRƯỚC `rules/:id`.
 */
@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class RulesController {
  constructor(
    private readonly rules: ErrorRuleService,
    private readonly prices: PriceService,
    private readonly waivers: CriterionWaiverService,
  ) {}

  @Get('rules')
  @Roles('teacher')
  list(@Req() req: Request) {
    return this.rules.list(req.user!.sub);
  }

  /** *Luật còn thiếu* agent báo — spec UI 3.1. */
  @Get('rules/missing')
  @Roles('teacher')
  missing(@Req() req: Request) {
    return this.rules.missing(req.user!.sub);
  }

  @Post('rules')
  @Roles('teacher')
  create(@Req() req: Request, @Body() dto: RuleBodyDto) {
    return this.rules.create(req.user!.sub, parseRuleInput(dto));
  }

  /** *"Lưu thì áp vào đâu"* (spec UI 3.2) — KHÔNG ghi. */
  @Post('rules/preview')
  @Roles('teacher')
  @HttpCode(200)
  preview(@Req() req: Request, @Body() dto: RulePreviewDto) {
    return this.rules.preview(req.user!.sub, {
      ...parseRuleInput(dto),
      ruleId: dto.ruleId,
      deduction: parseDeduction(dto.deduction ?? null),
    });
  }

  @Patch('rules/:id')
  @Roles('teacher')
  revise(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request, @Body() dto: RuleChangesDto) {
    return this.rules.revise(req.user!.sub, id, parseRuleChanges(dto));
  }

  @Post('rules/:id/state')
  @Roles('teacher')
  @HttpCode(200)
  setState(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request, @Body() dto: RuleStateDto) {
    return this.rules.setState(req.user!.sub, id, dto.state);
  }

  /** *"Lưu thì điều gì xảy ra"* (spec UI 3.1, T-POL-5) — KHÔNG ghi. */
  @Post('rules/:id/price/preview')
  @Roles('teacher')
  @HttpCode(200)
  pricePreview(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request, @Body() dto: PriceBodyDto) {
    return this.prices.preview(req.user!.sub, id, parseDeduction(dto.deduction));
  }

  /** Một phiên bản bảng giá mới + tính lại mọi bài chưa chốt dính luật đó (§2.2). */
  @Put('rules/:id/price')
  @Roles('teacher')
  setPrice(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request, @Body() dto: PriceBodyDto) {
    return this.prices.setPrice(req.user!.sub, id, parseDeduction(dto.deduction), req.user!.sub);
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
