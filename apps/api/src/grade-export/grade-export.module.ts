import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module';
import { ExamSessionModule } from '../exam-session/exam-session.module';
import { StorageModule } from '../storage/storage.module';
import { GradeExportController } from './grade-export.controller';
import { GradeExportDataService } from './grade-export.data';
import { GradeExportFileStore } from './grade-export-file-store';
import { GradeExportPlanService } from './grade-export-plan.service';
import { GradeExportQueryService } from './grade-export-query.service';
import { GradeExportWriteService } from './grade-export-write.service';
import { GradeExportService } from './grade-export.service';

/**
 * Ghi điểm vào sổ điểm của giảng viên (spec `2026-09-29-gradebook-export-design.md`). Module RIÊNG để không đụng
 * `grading.controller.ts`.
 */
@Module({
  imports: [StorageModule, ExamSessionModule, AdminModule],
  controllers: [GradeExportController],
  providers: [GradeExportService, GradeExportDataService, GradeExportFileStore, GradeExportPlanService, GradeExportWriteService, GradeExportQueryService],
  exports: [GradeExportDataService, GradeExportPlanService],
})
export class GradeExportModule {}
