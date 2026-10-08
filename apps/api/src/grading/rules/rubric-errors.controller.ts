import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { AssignErrorDto, CopyErrorsDto, MoveErrorDto } from './dto/rubric-error.dto';
import { PriceBodyDto } from './dto/price-body.dto';
import { PriceService } from './price.service';
import { parseAssignInput, parseDeduction } from './rule-input';
import { RubricErrorService } from './rubric-error.service';
import { RubricOverviewService } from './rubric-overview.service';

/**
 * Lỗi theo rubric (spec 2026-10-07 §4.1–4.2): dòng áp dụng, điểm trừ, sao chép. Giảng viên lấy từ JWT; không
 * route nào nhận `teacherId` ở body; dòng/rubric của người khác → 404 (T-POL-8). Route tĩnh (`overview`,
 * `copy`) khai TRƯỚC `:id`.
 */
@Controller('rubric-errors')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RubricErrorsController {
  constructor(
    private readonly errors: RubricErrorService,
    private readonly prices: PriceService,
    private readonly overview: RubricOverviewService,
  ) {}

  @Get('overview')
  @Roles('teacher')
  getOverview(@Req() req: Request) {
    return this.overview.overview(req.user!.sub);
  }

  @Post('copy')
  @Roles('teacher')
  copy(@Req() req: Request, @Body() dto: CopyErrorsDto) {
    return this.errors.copy(req.user!.sub, dto.fromRubricName, dto.toRubricName);
  }

  @Get()
  @Roles('teacher')
  list(@Req() req: Request, @Query('rubricName') rubricName?: string) {
    if (!rubricName) throw new BadRequestException('Thiếu rubricName');
    return this.errors.list(req.user!.sub, rubricName);
  }

  @Post()
  @Roles('teacher')
  assign(@Req() req: Request, @Body() dto: AssignErrorDto) {
    return this.errors.assign(req.user!.sub, parseAssignInput(dto));
  }

  @Patch(':id')
  @Roles('teacher')
  move(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request, @Body() dto: MoveErrorDto) {
    return this.errors.move(req.user!.sub, id, dto.criterionKey);
  }

  @Delete(':id')
  @Roles('teacher')
  @HttpCode(200)
  remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    return this.errors.remove(req.user!.sub, id);
  }

  /** *"Lưu thì điều gì xảy ra"* (spec UI 3.1, T-POL-5) — KHÔNG ghi. */
  @Post(':id/price/preview')
  @Roles('teacher')
  @HttpCode(200)
  pricePreview(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request, @Body() dto: PriceBodyDto) {
    return this.prices.preview(req.user!.sub, id, parseDeduction(dto.deduction));
  }

  /** Một phiên bản bảng giá mới + tính lại bài chưa chốt của đúng rubric đó (§2.2). */
  @Put(':id/price')
  @Roles('teacher')
  setPrice(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request, @Body() dto: PriceBodyDto) {
    return this.prices.setPrice(req.user!.sub, id, parseDeduction(dto.deduction), req.user!.sub);
  }
}
