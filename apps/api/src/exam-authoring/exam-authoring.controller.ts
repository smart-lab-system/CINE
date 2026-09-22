import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { ExamAuthoringService } from './exam-authoring.service';
import { GenerateExamDto } from './dto/generate-exam.dto';
import { GeneratedExam } from './ai-provider/exam-authoring-provider';

@Controller('exam-authoring')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ExamAuthoringController {
  constructor(private readonly authoring: ExamAuthoringService) {}

  /**
   * POST chứ không GET, dù nó không ghi gì vào cơ sở dữ liệu: nó tiêu tiền
   * thật và nhận một prompt dài. Một route tốn tiền nằm sau GET là một route
   * bị trình duyệt prefetch.
   */
  @Post('generate')
  @Roles('teacher')
  generate(@Req() req: Request, @Body() dto: GenerateExamDto): Promise<GeneratedExam> {
    return this.authoring.generate(req.user!.sub, dto);
  }
}
