import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { AccessTokenPayload } from '../../auth/types';
import { MAX_ROSTER_FILE_BYTES } from '../../master-data/roster/roster-upload';
import { AttachFileDto } from './dto/attach-file.dto';
import { AttachSectionDto } from './dto/attach-section.dto';
import { CreateExamEventDto } from './dto/create-exam-event.dto';
import {
  ApplyExamRosterImportDto,
  ApplyExamRosterImportResponseDto,
  ExamRosterFilesListResponseDto,
  ExamRosterImportPreviewDto,
} from './dto/exam-roster-import.dto';
import {
  CreateExamEventFileResponseDto,
  CreateExamEventResponseDto,
  CreateExamEventSectionResponseDto,
  ExamEventDetailDto,
  ExamEventStatusHistoryListResponseDto,
  ExamEventsListResponseDto,
} from './dto/exam-event-response.dto';
import { SearchExamEventsDto } from './dto/search-exam-events.dto';
import { TransitionExamEventStatusDto } from './dto/transition-status.dto';
import { UpdateExamEventDto } from './dto/update-exam-event.dto';
import { ExamRosterImportsService } from './exam-roster-imports.service';
import { ExamEventsService } from './exam-events.service';
import { EXAM_FILE_ROLES, ExamFileRole } from '../entities/exam-event-file.entity';
import { MAX_EXAM_FILE_BYTES } from './exam-file-upload';

@ApiTags('exam-events')
@Controller('exam-events')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class ExamEventsController {
  constructor(
    private readonly events: ExamEventsService,
    private readonly rosterImports: ExamRosterImportsService,
  ) {}

  @Post()
  @ApiOkResponse({ type: CreateExamEventResponseDto })
  create(@Body() dto: CreateExamEventDto, @Req() req: Request) {
    const user = req.user as AccessTokenPayload;
    return this.events.create(dto, user.sub);
  }

  @Get()
  @Roles('admin', 'lecturer')
  @ApiOkResponse({ type: ExamEventsListResponseDto })
  search(@Query() query: SearchExamEventsDto) {
    return this.events.search(query);
  }

  @Get(':id')
  @ApiOkResponse({ type: ExamEventDetailDto })
  findOne(@Param('id') id: string) {
    return this.events.findOne(id);
  }

  @Patch(':id')
  @ApiOkResponse({ type: ExamEventDetailDto })
  update(@Param('id') id: string, @Body() dto: UpdateExamEventDto) {
    return this.events.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string) {
    await this.events.remove(id);
  }

  @Post(':id/sections')
  @ApiOkResponse({ type: CreateExamEventSectionResponseDto })
  attachSection(@Param('id') id: string, @Body() dto: AttachSectionDto) {
    return this.events.attachSection(id, dto);
  }

  @Delete(':id/sections/:sectionLinkId')
  @HttpCode(204)
  async removeSection(
    @Param('id') id: string,
    @Param('sectionLinkId') sectionLinkId: string,
  ) {
    await this.events.removeSection(id, sectionLinkId);
  }

  @Post(':id/files/upload')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_EXAM_FILE_BYTES } }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'fileRole'],
      properties: {
        file: { type: 'string', format: 'binary' },
        fileRole: { type: 'string', enum: [...EXAM_FILE_ROLES] },
        title: { type: 'string' },
        sortOrder: { type: 'integer', minimum: 0 },
      },
    },
  })
  @ApiOkResponse({ type: CreateExamEventFileResponseDto })
  uploadFile(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body('fileRole') fileRole: ExamFileRole,
    @Body('title') title: string | undefined,
    @Body('sortOrder') sortOrder: string | undefined,
    @Req() req: Request,
  ) {
    const user = req.user as AccessTokenPayload;
    return this.events.uploadFile(
      id,
      file,
      {
        fileRole,
        title,
        sortOrder: sortOrder === undefined ? undefined : Number(sortOrder),
      },
      user.sub,
    );
  }

  @Get(':id/files/:fileId/content')
  async downloadFile(
    @Param('id') id: string,
    @Param('fileId') fileId: string,
    @Res() res: Response,
  ) {
    const file = await this.events.downloadFile(id, fileId);
    res.setHeader('Content-Type', file.contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
    );
    res.send(file.body);
  }

  @Post(':id/files')
  @ApiOkResponse({ type: CreateExamEventFileResponseDto })
  attachFile(@Param('id') id: string, @Body() dto: AttachFileDto) {
    return this.events.attachFile(id, dto);
  }

  @Delete(':id/files/:fileId')
  @HttpCode(204)
  async removeFile(@Param('id') id: string, @Param('fileId') fileId: string) {
    await this.events.removeFile(id, fileId);
  }

  @Post(':id/roster-imports')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_ROSTER_FILE_BYTES } }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiOkResponse({ type: ExamRosterImportPreviewDto })
  previewRoster(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() req: Request,
  ) {
    const user = req.user as AccessTokenPayload;
    return this.rosterImports.preview(id, file, user.sub);
  }

  @Post(':id/roster-imports/:storedObjectId/apply')
  @ApiOkResponse({ type: ApplyExamRosterImportResponseDto })
  applyRoster(
    @Param('id') id: string,
    @Param('storedObjectId') storedObjectId: string,
    @Body() dto: ApplyExamRosterImportDto = {},
  ) {
    return this.rosterImports.apply(
      id,
      storedObjectId,
      dto.confirmSectionMismatch === true,
    );
  }

  @Get(':id/roster-files')
  @ApiOkResponse({ type: ExamRosterFilesListResponseDto })
  listRosterFiles(@Param('id') id: string) {
    return this.rosterImports.listFiles(id);
  }

  @Get(':id/roster-files/:fileId/content')
  async downloadRosterFile(
    @Param('id') id: string,
    @Param('fileId') fileId: string,
    @Res() res: Response,
  ) {
    const file = await this.rosterImports.download(id, fileId);
    res.setHeader('Content-Type', file.contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
    );
    res.send(file.body);
  }

  @Post(':id/status')
  @HttpCode(200)
  @ApiOkResponse({ type: ExamEventDetailDto })
  transitionStatus(
    @Param('id') id: string,
    @Body() dto: TransitionExamEventStatusDto,
    @Req() req: Request,
  ) {
    const user = req.user as AccessTokenPayload;
    return this.events.transitionStatus(id, dto, user.sub);
  }

  @Get(':id/status-history')
  @ApiOkResponse({ type: ExamEventStatusHistoryListResponseDto })
  listStatusHistory(@Param('id') id: string) {
    return this.events.listStatusHistory(id);
  }
}
