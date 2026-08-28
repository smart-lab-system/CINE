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
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { AccessTokenPayload } from '../../auth/types';
import { CourseSectionsService } from './course-sections.service';
import { CreateCourseSectionDto } from './dto/create-course-section.dto';
import { UpdateCourseSectionDto } from './dto/update-course-section.dto';
import { SearchCourseSectionsDto } from './dto/search-course-sections.dto';
import {
  BulkEnrollStudentsDto,
  EnrollStudentDto,
} from './dto/enrollment.dto';
import {
  BulkEnrollResponseDto,
  CourseSectionViewDto,
  CourseSectionsListResponseDto,
  CreateCourseSectionResponseDto,
  CreateEnrollmentResponseDto,
  EnrollmentsListResponseDto,
} from './dto/course-section-response.dto';
import {
  ApplyRosterImportDto,
  ApplyRosterImportResponseDto,
  CourseSectionFilesListResponseDto,
  RosterImportPreviewDto,
} from './dto/roster-import.dto';
import {
  MAX_ROSTER_FILE_BYTES,
  RosterImportsService,
} from './roster-imports.service';

@ApiTags('course-sections')
@Controller('course-sections')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class CourseSectionsController {
  constructor(
    private readonly sections: CourseSectionsService,
    private readonly rosterImports: RosterImportsService,
  ) {}

  @Post()
  @ApiOkResponse({ type: CreateCourseSectionResponseDto })
  create(@Body() dto: CreateCourseSectionDto) {
    return this.sections.create(dto);
  }

  @Get()
  @ApiOkResponse({ type: CourseSectionsListResponseDto })
  search(@Query() query: SearchCourseSectionsDto) {
    return this.sections.search(query);
  }

  @Get(':id')
  @ApiOkResponse({ type: CourseSectionViewDto })
  findOne(@Param('id') id: string) {
    return this.sections.findOne(id);
  }

  @Patch(':id')
  @ApiOkResponse({ type: CourseSectionViewDto })
  update(@Param('id') id: string, @Body() dto: UpdateCourseSectionDto) {
    return this.sections.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string) {
    await this.sections.remove(id);
  }

  @Get(':id/enrollments')
  @ApiOkResponse({ type: EnrollmentsListResponseDto })
  listEnrollments(@Param('id') id: string) {
    return this.sections.listEnrollments(id);
  }

  @Post(':id/enrollments')
  @ApiOkResponse({ type: CreateEnrollmentResponseDto })
  enroll(@Param('id') id: string, @Body() dto: EnrollStudentDto) {
    return this.sections.enroll(id, dto.studentId);
  }

  @Post(':id/enrollments/bulk')
  @ApiOkResponse({ type: BulkEnrollResponseDto })
  bulkEnroll(@Param('id') id: string, @Body() dto: BulkEnrollStudentsDto) {
    return this.sections.bulkEnroll(id, dto.studentIds);
  }

  @Delete(':id/enrollments/:enrollmentId')
  @HttpCode(204)
  async unenroll(
    @Param('id') id: string,
    @Param('enrollmentId') enrollmentId: string,
  ) {
    await this.sections.unenroll(id, enrollmentId);
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
  @ApiOkResponse({ type: RosterImportPreviewDto })
  previewRoster(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() req: Request,
  ) {
    const user = req.user as AccessTokenPayload;
    return this.rosterImports.preview(id, file, user.sub);
  }

  @Post(':id/roster-imports/:storedObjectId/apply')
  @ApiOkResponse({ type: ApplyRosterImportResponseDto })
  applyRoster(
    @Param('id') id: string,
    @Param('storedObjectId') storedObjectId: string,
    @Body() dto: ApplyRosterImportDto = {},
  ) {
    return this.rosterImports.apply(
      id,
      storedObjectId,
      dto.confirmSectionMismatch === true,
    );
  }

  @Get(':id/files')
  @ApiOkResponse({ type: CourseSectionFilesListResponseDto })
  listFiles(@Param('id') id: string) {
    return this.rosterImports.listFiles(id);
  }

  @Get(':id/files/:fileId/content')
  async downloadFile(
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
}
