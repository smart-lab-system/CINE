import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExamSessionModule } from '../exam-session/exam-session.module';
import { StorageModule } from '../storage/storage.module';
import { SubmissionEntity } from './entities/submission.entity';
import { SubmissionService } from './submission.service';
import { SubmissionGateway } from './submission.gateway';
import { SubmissionController } from './submission.controller';

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
  ],
  controllers: [SubmissionController],
  providers: [SubmissionService, SubmissionGateway],
  exports: [SubmissionService],
})
export class SubmissionModule {}
