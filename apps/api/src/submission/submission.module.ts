import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { ExamSessionModule } from '../exam-session/exam-session.module';
import { StorageModule } from '../storage/storage.module';
import { SubmissionEntity } from './entities/submission.entity';
import { SubmissionService } from './submission.service';
import { SubmissionGateway } from './submission.gateway';
import { BackupGateway } from './backup.gateway';
import { SubmissionController } from './submission.controller';
import { TeacherSubmissionsController } from './teacher-submissions.controller';
import { SubmissionOverviewService } from './submission-overview.service';
import { ARCHIVE_CHECK_QUEUE } from './archive-check/archive-check.constants';

/**
 * Imports ExamSessionModule for its already-exported ExamSessionService
 * (session and deliverable lookups, plus the ownership rule the controller
 * reuses) instead of adding a second set of TypeORM repositories over
 * exam-session's own tables.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([SubmissionEntity]),
    ExamSessionModule,
    StorageModule,
    // Kiểm nội dung file nén chạy trên hàng đợi RIÊNG, không dùng chung
    // GRADING_QUEUE — spec 2026-09-21-archive-content-validation-design.md
    // §5.1: nhịp của GRADING_QUEUE bị ngân sách token của API AI quyết
    // định, còn ràng buộc ở đây là RAM container. Trộn chung là để cấu
    // hình nhịp bên này đổi ngầm hành vi bên kia.
    BullModule.registerQueue({ name: ARCHIVE_CHECK_QUEUE }),
  ],
  controllers: [SubmissionController, TeacherSubmissionsController],
  providers: [SubmissionService, SubmissionGateway, BackupGateway, SubmissionOverviewService],
  exports: [SubmissionService],
})
export class SubmissionModule {}
