import {
  BadRequestException,
  Body,
  Controller,
  Header,
  Post,
  Req,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { ExamAuthoringService } from './exam-authoring.service';
import { ExportExamDto, GenerateExamDto } from './dto/generate-exam.dto';
import { GeneratedExam } from './ai-provider/exam-authoring-provider';
import { buildExamPaperDocx } from './docx/exam-paper.docx';
import { buildAnswerKeyDocx } from './docx/answer-key.docx';

const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

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

  /**
   * Đề bài — thứ in ra và phát. HAI route tách rời, không phải một route có
   * cờ: một tham số `?includeAnswers=true` là một tham số sẽ có ngày bị đặt
   * nhầm, và hậu quả của lần nhầm đó là đáp án nằm trong tay sinh viên.
   */
  @Post('export/paper')
  @Roles('teacher')
  @Header('Content-Type', DOCX_MIME)
  @Header('Content-Disposition', 'attachment; filename="de-thi.docx"')
  async exportPaper(@Body() dto: ExportExamDto): Promise<StreamableFile> {
    // `StreamableFile` chứ KHÔNG `@Res()`: `@Res()` đẩy Nest sang chế độ
    // library-specific, handler tự chịu trách nhiệm gửi response — và lúc đó
    // một exception ném ra giữa chừng KHÔNG sinh ra phản hồi nào, client treo
    // tới khi hết socket timeout. Gặp thật khi viết test cho ca JSON hỏng.
    //
    // Không lưu gì: hết request là hết (spec §7).
    return new StreamableFile(await buildExamPaperDocx(parseExam(dto)));
  }

  /** Đáp án + gói test — tài liệu nội bộ. Xem doc của route trên. */
  @Post('export/answer-key')
  @Roles('teacher')
  @Header('Content-Type', DOCX_MIME)
  @Header('Content-Disposition', 'attachment; filename="dap-an-va-test.docx"')
  async exportAnswerKey(@Body() dto: ExportExamDto): Promise<StreamableFile> {
    return new StreamableFile(await buildAnswerKeyDocx(parseExam(dto)));
  }
}

/**
 * Bộ ba đi ngược lên từ trình duyệt dưới dạng CHUỖI JSON, không phải object.
 *
 * Vì `ValidationPipe` chạy với `whitelist: true`: một object lồng nhau không
 * có DTO khai từng trường sẽ bị lược sạch, và endpoint nhận về `{}`. Nhận
 * chuỗi rồi tự parse ở đây là cách giữ nguyên hình dạng mà không phải khai
 * lại toàn bộ cây `GeneratedExam` thành sáu lớp DTO chỉ để đi qua ống.
 */
function parseExam(dto: ExportExamDto): GeneratedExam {
  try {
    return JSON.parse(dto.examJson) as GeneratedExam;
  } catch {
    throw new BadRequestException('examJson không phải JSON hợp lệ.');
  }
}
