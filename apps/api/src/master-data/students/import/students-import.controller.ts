import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ApiOkResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../auth/jwt-auth.guard';
import { RolesGuard } from '../../../auth/roles.guard';
import { Roles } from '../../../auth/roles.decorator';
import { parseStudentsWorkbook } from './parse-students-workbook';
import { STUDENTS_IMPORT_QUEUE } from './students-import.constants';
import { StudentsImportJobData, StudentsImportResult } from './students-import.processor';
import { ImportJobStatusDto } from './dto/import-job-status.dto';

// No `dest`/`storage` option given to FileInterceptor -> multer's default
// is memory storage: the file lives only in `file.buffer` for this one
// request, never written to disk.
const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024;

@Controller('students/import')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class StudentsImportController {
  constructor(
    @InjectQueue(STUDENTS_IMPORT_QUEUE)
    private readonly importQueue: Queue<StudentsImportJobData, StudentsImportResult>,
  ) {}

  @Post()
  @HttpCode(202)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMPORT_FILE_BYTES } }))
  async import(@UploadedFile() file?: Express.Multer.File): Promise<{ jobId: string }> {
    if (!file) {
      throw new BadRequestException('file is required');
    }
    const rows = await parseStudentsWorkbook(file.buffer);
    if (rows.length === 0) {
      throw new BadRequestException('Workbook has no data rows');
    }

    // BullMQ always assigns `job.id` synchronously by the time add() resolves.
    const job = await this.importQueue.add('import', { rows });
    return { jobId: job.id as string };
  }

  @Get(':jobId')
  @ApiOkResponse({ type: ImportJobStatusDto })
  async status(@Param('jobId') jobId: string): Promise<ImportJobStatusDto> {
    let job = await this.importQueue.getJob(jobId);
    if (!job) {
      throw new NotFoundException('Import job not found');
    }

    const state = await job.getState();
    if (state === 'completed' || state === 'failed') {
      // getState() and the already-fetched job's local `returnvalue`/
      // `failedReason` fields come from two separate reads — a job can
      // flip from active to completed in between them, leaving `job`
      // stale. Re-fetch once we know the terminal state we're reporting.
      job = (await this.importQueue.getJob(jobId)) ?? job;
    }
    return {
      jobId: job.id as string,
      state,
      result: state === 'completed' ? job.returnvalue ?? null : null,
      failedReason: state === 'failed' ? job.failedReason ?? null : null,
    };
  }
}
