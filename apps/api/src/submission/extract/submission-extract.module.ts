import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StorageModule } from '../../storage/storage.module';
import { SubmissionEntity } from '../entities/submission.entity';
import { SUBMISSION_EXTRACT_QUEUE } from './submission-extract.constants';
import { SubmissionExtractProcessor } from './submission-extract.processor';
import { SubmissionExtractService } from './submission-extract.service';

/**
 * Module riêng cho Code Browser bài nộp - tránh vòng
 * SubmissionModule → IdeExtensionsModule → GradingModule → SubmissionModule.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([SubmissionEntity]),
    StorageModule,
    BullModule.registerQueue({ name: SUBMISSION_EXTRACT_QUEUE }),
  ],
  providers: [SubmissionExtractService, SubmissionExtractProcessor],
  exports: [SubmissionExtractService],
})
export class SubmissionExtractModule {}
