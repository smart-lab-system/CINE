import {
  Controller,
  Delete,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  Body,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { ExamBankService } from './exam-bank.service';
import {
  CreateCourseExamDto,
  ListCourseExamsQueryDto,
  UpdateCourseExamDto,
} from './dto/exam-bank.dto';

const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

@Controller('exam-bank')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('teacher')
export class ExamBankController {
  constructor(private readonly bank: ExamBankService) {}

  @Get('courses')
  listCourses(@Req() req: Request) {
    return this.bank.listTeachingCourses(req.user!.sub);
  }

  @Get()
  list(@Req() req: Request, @Query() query: ListCourseExamsQueryDto) {
    return this.bank.listByCourse(req.user!.sub, query.courseId);
  }

  /**
   * Parse Word → JSON đổ form. Không ghi DB.
   * Đặt trước `:id` để tránh nuốt path.
   */
  @Post('parse-docx')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  parseDocx(
    @Req() req: Request,
    @Query('courseId', ParseUUIDPipe) courseId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return this.bank.parseDocx(req.user!.sub, courseId, file);
  }

  @Get(':id/export.docx')
  @Header('Content-Type', DOCX_MIME)
  async exportDocx(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<StreamableFile> {
    const { buffer, filename } = await this.bank.exportDocx(req.user!.sub, id);
    return new StreamableFile(buffer, {
      type: DOCX_MIME,
      disposition: `attachment; filename="${filename}"`,
    });
  }

  @Get(':id')
  getOne(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    return this.bank.getOne(req.user!.sub, id);
  }

  @Post()
  create(@Req() req: Request, @Body() dto: CreateCourseExamDto) {
    return this.bank.create(req.user!.sub, dto);
  }

  @Patch(':id')
  update(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCourseExamDto,
  ) {
    return this.bank.update(req.user!.sub, id, dto);
  }

  @Delete(':id')
  async remove(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    await this.bank.remove(req.user!.sub, id);
    return { ok: true };
  }
}
