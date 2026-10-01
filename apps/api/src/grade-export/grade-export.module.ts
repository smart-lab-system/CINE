import { Module } from '@nestjs/common';
import { GradeExportDataService } from './grade-export.data';

/**
 * Ghi điểm vào sổ điểm của giảng viên (spec `2026-09-29-gradebook-export-design.md`). Module RIÊNG để không đụng
 * `grading.controller.ts`; các task sau thêm service, controller và các phụ thuộc của chúng.
 */
@Module({
  providers: [GradeExportDataService],
  exports: [GradeExportDataService],
})
export class GradeExportModule {}
