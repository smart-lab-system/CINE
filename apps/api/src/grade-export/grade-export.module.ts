import { Module } from '@nestjs/common';
import { ExamSessionModule } from '../exam-session/exam-session.module';
import { StorageModule } from '../storage/storage.module';
import { GradeExportController } from './grade-export.controller';
import { GradeExportDataService } from './grade-export.data';
import { GradeExportFileStore } from './grade-export-file-store';
import { GradeExportService } from './grade-export.service';

/**
 * Ghi điểm vào sổ điểm của giảng viên (spec `2026-09-29-gradebook-export-design.md`). Module RIÊNG để không đụng
 * `grading.controller.ts`.
 */
@Module({
  imports: [StorageModule, ExamSessionModule],
  controllers: [GradeExportController],
  providers: [GradeExportService, GradeExportDataService, GradeExportFileStore],
  exports: [GradeExportDataService],
})
export class GradeExportModule {}
